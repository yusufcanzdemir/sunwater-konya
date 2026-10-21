// HTTP layer for the Telegram endpoints (Request → Response, like handlers.ts).

import { sanitizeFarmInput } from '../../src/state/farm.js';
import { defaultAssumptions, type Assumptions } from '../../src/state/assumptions.js';
import { getStore } from './store.js';
import {
  TelegramError,
  botUsername,
  ensureChat,
  handleUpdate,
  listChats,
  loadFarm,
  saveFarm,
  sendAlert,
  type StoredFarm,
  type TgUpdate,
} from './telegram.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const configured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);
const demoChatId = () => process.env.TELEGRAM_DEMO_CHAT_ID || null;

function friendly(e: unknown): string {
  if (e instanceof TelegramError && /chat not found|bot was blocked|have no rights/i.test(e.message)) {
    return 'Telegram mesajı gönderilemedi: önce botu açıp "Başlat"a basın.';
  }
  return e instanceof TelegramError ? `Telegram hatası: ${e.message}` : 'Bildirim şu an gönderilemedi.';
}

/** Rough shape check; anything odd falls back to the default assumptions. */
function sanitizeAssumptions(raw: unknown): Assumptions {
  const d = defaultAssumptions();
  const r = raw as Partial<Assumptions> | null;
  if (!r || typeof r !== 'object' || !r.crops || !r.soils || !r.efficiency || !r.rainRule || !r.impactFactors) return d;
  return { ...d, ...r };
}

/** POST {input, geo, assumptions} → saves the field and returns the bot deep link. */
export async function telegramLink(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST.' }, 405);
  if (!configured()) return json({ configured: false });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const input = sanitizeFarmInput(body?.input);
  const geo = body?.geo as StoredFarm['geo'] | undefined;
  if (!input || !geo || !Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) {
    return json({ error: 'Tarla bilgileri eksik; önce planı hesaplayın.' }, 400);
  }
  const farm: StoredFarm = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    input,
    geo: { latitude: geo.latitude, longitude: geo.longitude, name: String(geo.name ?? input.locationText).slice(0, 80) },
    assumptions: sanitizeAssumptions(body?.assumptions),
    savedAt: new Date().toISOString(),
  };
  await saveFarm(farm);
  try {
    const username = await botUsername();
    return json({
      configured: true,
      farmId: farm.id,
      botUsername: username,
      startUrl: `https://t.me/${username}?start=${farm.id}`,
      demoChat: demoChatId() != null,
      storage: getStore().kind,
    });
  } catch (e) {
    return json({ error: friendly(e) }, 502);
  }
}

/**
 * POST {farmId}: web "Telegram'a bildirim gönder" – to the chats linked to that field and the demo chat.
 * GET: daily cron (Vercel sends `Authorization: Bearer $CRON_SECRET`) – every chat, silent out of season.
 */
export async function sendAlertEndpoint(request: Request): Promise<Response> {
  if (!configured()) return json({ error: 'Telegram botu yapılandırılmamış.' }, 503);

  if (request.method === 'GET') {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Yetkisiz.' }, 401);
    const chats = new Set(await listChats());
    const demo = demoChatId();
    if (demo) chats.add(demo);
    const results: Record<string, string> = {};
    for (const chatId of chats) {
      try {
        const chat = await ensureChat(chatId);
        const farm = await loadFarm(chat.farmId);
        results[chatId] = farm ? await sendAlert(chatId, farm, { cron: true }) : 'no-farm';
      } catch (e) {
        results[chatId] = friendly(e);
      }
    }
    return json({ results });
  }

  if (request.method !== 'POST') return json({ error: 'Yalnızca GET veya POST.' }, 405);
  const body = (await request.json().catch(() => null)) as { farmId?: unknown } | null;
  const farm = typeof body?.farmId === 'string' ? await loadFarm(body.farmId) : null;
  if (!farm) return json({ error: 'Tarla bulunamadı; sayfayı yenileyip tekrar deneyin.' }, 404);

  const targets = new Set<string>();
  for (const chatId of await listChats()) {
    const chat = await ensureChat(chatId);
    if (chat.farmId === farm.id) targets.add(chatId);
  }
  const demo = demoChatId();
  if (demo) {
    await ensureChat(demo, farm.id);
    targets.add(demo);
  }
  if (targets.size === 0) return json({ sent: 0, error: 'Henüz bağlı sohbet yok: QR kodu okutup botu başlatın.' }, 409);

  let sent = 0;
  const errors: string[] = [];
  for (const chatId of targets) {
    try {
      if ((await sendAlert(chatId, farm)) === 'sent') sent += 1;
    } catch (e) {
      errors.push(friendly(e));
    }
  }
  return json({ sent, errors }, sent > 0 ? 200 : 502);
}

/** Telegram webhook. Always 200 so Telegram does not retry a failing update forever. */
export async function telegramWebhook(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST.' }, 405);
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get('x-telegram-bot-api-secret-token') !== secret) return json({ error: 'Yetkisiz.' }, 401);
  try {
    await handleUpdate((await request.json()) as TgUpdate);
  } catch (e) {
    console.error('telegram update failed', e);
  }
  return json({ ok: true });
}
