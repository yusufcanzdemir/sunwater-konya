/// <reference types="vitest/config" />
import { readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_ROUTES: Record<string, string> = {
  '/api/parse-farm': '/api/parse-farm.ts',
  '/api/explain-plan': '/api/explain-plan.ts',
  '/api/telegram-link': '/api/telegram-link.ts',
  '/api/send-alert': '/api/send-alert.ts',
  '/api/telegram-webhook': '/api/telegram-webhook.ts',
};

/** Server-only secrets copied from .env files (no VITE_ prefix, never bundled into the client). */
const SERVER_ENV = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_DEMO_CHAT_ID',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_POLLING',
  'CRON_SECRET',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

type Handler = (r: Request) => Promise<Response>;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Local Telegram without a public URL: long-polls getUpdates and hands each update to the
 * webhook handler. Skipped when the bot has a webhook (i.e. a deployed bot is live).
 */
async function pollTelegram(server: ViteDevServer) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const log = server.config.logger;
  const api = (method: string, body: object = {}) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json() as Promise<{ ok: boolean; result: unknown }>);

  const info = (await api('getWebhookInfo')) as { result?: { url?: string } };
  if (info.result?.url) {
    log.info(`[telegram] webhook set (${info.result.url}); local polling skipped.`);
    return;
  }
  log.info('[telegram] polling for updates (local dev).');
  let offset = 0;
  let stopped = false;
  server.httpServer?.on('close', () => (stopped = true));
  while (!stopped) {
    try {
      const res = (await api('getUpdates', { offset, timeout: 25 })) as { result?: { update_id: number }[] };
      for (const update of res.result ?? []) {
        offset = update.update_id + 1;
        const mod = (await server.ssrLoadModule('/api/_lib/telegram.ts')) as { handleUpdate: (u: unknown) => Promise<void> };
        mod.handleUpdate(update).catch((e: unknown) => log.error(`[telegram] ${String(e)}`));
      }
    } catch (e) {
      log.warn(`[telegram] polling error: ${String(e)}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/** Serves the Vercel functions in /api during `vite dev`, so no Vercel CLI is needed locally. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_POLLING !== '0' && !process.env.VITEST) {
        void pollTelegram(server);
      }
      server.middlewares.use(async (req, res, next) => {
        const route = API_ROUTES[(req.url ?? '').split('?')[0]];
        if (!route) return next();
        try {
          const mod = (await server.ssrLoadModule(route)) as Partial<Record<'GET' | 'POST', Handler>>;
          const method = req.method === 'GET' ? 'GET' : req.method === 'POST' ? 'POST' : null;
          const handler = method && mod[method];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
          const request = new Request(`http://localhost${req.url}`, {
            method,
            headers,
            body: method === 'POST' ? await readBody(req) : undefined,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (e) {
          server.config.logger.error(String(e));
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Sunucu hatası.' }));
        }
      });
    },
  };
}

// Mirrors pipeline/config.yaml (reference.points_file, reference.fields_file) and step 03a outputs.
const PIPELINE_DIR = fileURLToPath(new URL('./pipeline/', import.meta.url));
const REFERENCE_POINTS = `${PIPELINE_DIR}reference/reference_points.geojson`;
const REFERENCE_FIELDS = `${PIPELINE_DIR}reference/reference_fields.geojson`;
const REFERENCE_OVERLAYS = `${PIPELINE_DIR}outputs/03_reference/`;

async function readJsonOr<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

/**
 * Dev-only backend for the /reference drawing tool: reads the pipeline's random points and
 * overlays, and writes hand-drawn reference fields straight into pipeline/reference/.
 */
function devReference(): Plugin {
  return {
    name: 'dev-reference',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/dev-api/reference')) return next();
        const json = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === 'GET' && url === '/dev-api/reference') {
            const points = await readJsonOr(REFERENCE_POINTS, null);
            if (!points) return json(404, { error: 'Önce pipeline/03a_reference_points.py çalıştırılmalı.' });
            return json(200, {
              points,
              fields: await readJsonOr(REFERENCE_FIELDS, null),
              overlays: await readJsonOr(`${REFERENCE_OVERLAYS}overlays.json`, []),
            });
          }
          const overlay = url.match(/^\/dev-api\/reference\/overlay\/([\w-]+\.png)$/);
          if (req.method === 'GET' && overlay) {
            res.setHeader('content-type', 'image/png');
            return res.end(await readFile(`${REFERENCE_OVERLAYS}${overlay[1]}`));
          }
          if (req.method === 'POST' && url === '/dev-api/reference/fields') {
            const body = JSON.parse(await readBody(req)) as { type?: string; features?: unknown[] };
            if (body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
              return json(400, { error: 'FeatureCollection bekleniyordu.' });
            }
            await writeFile(REFERENCE_FIELDS, JSON.stringify(body, null, 2) + '\n', 'utf-8');
            return json(200, { saved: body.features.length });
          }
          return json(404, { error: 'Bulunamadı.' });
        } catch (e) {
          server.config.logger.error(`[reference] ${String(e)}`);
          return json(500, { error: 'Sunucu hatası.' });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of SERVER_ENV) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), tailwindcss(), devApi(), devReference()],
    test: {
      include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    },
  };
});
