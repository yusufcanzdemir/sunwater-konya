/// <reference types="vitest/config" />
import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_ROUTES: Record<string, string> = {
  '/api/parse-farm': '/api/parse-farm.ts',
  '/api/explain-plan': '/api/explain-plan.ts',
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Serves the Vercel functions in /api during `vite dev`, so no Vercel CLI is needed locally. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const route = API_ROUTES[(req.url ?? '').split('?')[0]];
        if (!route) return next();
        try {
          const mod = (await server.ssrLoadModule(route)) as { POST?: (r: Request) => Promise<Response> };
          if (req.method !== 'POST' || !mod.POST) {
            res.statusCode = 405;
            return res.end();
          }
          const request = new Request(`http://localhost${req.url}`, {
            method: 'POST',
            headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
            body: await readBody(req),
          });
          const response = await mod.POST(request);
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

export default defineConfig(({ mode }) => {
  // Server-only secrets (no VITE_ prefix, never bundled into the client).
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), tailwindcss(), devApi()],
    test: {
      include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    },
  };
});
