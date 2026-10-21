// Telegram bot: linking chats to fields, alerts, and the "Suladım / Yağmur yağdı" feedback loop.
// Every number comes from the engine; Gemini only rewords the alert (and is checked).

import { dayName } from '../../src/ai/explain.js';
import { buildTelegramPayload, planChangeNote, planSignature, type TelegramPayload } from '../../src/ai/telegram.js';
import { fetchArchive, fetchForecast } from '../../src/data/openMeteo.js';
import { addDays } from '../../src/engine/dates.js';
import { analyzeSeason, type SeasonAnalysis } from '../../src/engine/plan.js';
import { dailyPumping, formatWindow } from '../../src/engine/schedule.js';
import { archiveSeasonWindow } from '../../src/engine/season.js';
import { fieldStatus } from '../../src/engine/status.js';
import type { FieldRecord } from '../../src/engine/waterBalance.js';
import { defaultAssumptions, modelSettings, type Assumptions } from '../../src/state/assumptions.js';
import { demoForm, toFarmParams, validateFarmForm, type FarmInput } from '../../src/state/farm.js';
import { explain } from './handlers.js';
import { getStore } from './store.js';

export interface StoredFarm {
  id: string;
  input: FarmInput;
  geo: { latitude: number; longitude: number; name: string };
  assumptions: Assumptions;
  savedAt: string;
}

interface ChatState {
  chatId: string;
  farmId: string;
  lastSignature: string | null;
  /** Date of the last "Suladım", while the bot waits for an optional "6 saat" correction. */
  awaitingHoursFor: string | null;
}

/** Rain buttons → mm (assumption, shown to the farmer). */
export const RAIN_LEVELS = { az: 5, orta: 15, cok: 30 } as const;
const PAST_DAYS = 7;
const KARAPINAR = { latitude: 37.716, longitude: 33.551, name: 'Karapınar' };

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tr = (n: number, digits = 0) => n.toLocaleString('tr-TR', { maximumFractionDigits: digits });

// --- Telegram Bot API ---------------------------------------------------------------------

type Keyboard = { text: string; callback_data: string }[][];

export const MAIN_KEYBOARD: Keyboard = [
  [
    { text: '✅ Suladım', callback_data: 'irrigated' },
    { text: '🌧 Yağmur yağdı', callback_data: 'rain' },
  ],
  [{ text: '📅 Haftalık plan', callback_data: 'weekly' }],
];

const RAIN_KEYBOARD: Keyboard = [
  [
    { text: `Az (≈${RAIN_LEVELS.az} mm)`, callback_data: 'rain:az' },
    { text: `Orta (≈${RAIN_LEVELS.orta} mm)`, callback_data: 'rain:orta' },
    { text: `Çok (≈${RAIN_LEVELS.cok} mm)`, callback_data: 'rain:cok' },
  ],
];

export class TelegramError extends Error {}

export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN tanımlı değil.');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new TelegramError(data.description ?? `Telegram ${method} başarısız (${res.status}).`);
  return data.result as T;
}

const send = (chatId: string, text: string, keyboard?: Keyboard) =>
  tg('sendMessage', { chat_id: chatId, text, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });

let cachedUsername: string | null = null;
export async function botUsername(): Promise<string> {
  cachedUsername ??= (await tg<{ username: string }>('getMe')).username;
  return cachedUsername;
}

// --- Storage ------------------------------------------------------------------------------

export function demoFarm(): StoredFarm {
  const { input } = validateFarmForm(demoForm(Number(today().slice(0, 4))));
  return { id: 'demo', input: input!, geo: KARAPINAR, assumptions: defaultAssumptions(), savedAt: today() };
}

export async function saveFarm(farm: StoredFarm): Promise<void> {
  const store = getStore();
  await store.set(`farm:${farm.id}`, farm);
  await store.set('latestFarm', farm.id);
}

export async function loadFarm(id: string): Promise<StoredFarm | null> {
  return (await getStore().get<StoredFarm>(`farm:${id}`)) ?? (id === 'demo' ? demoFarm() : null);
}

async function getChat(chatId: string): Promise<ChatState | null> {
  return getStore().get<ChatState>(`chat:${chatId}`);
}

async function saveChat(chat: ChatState): Promise<void> {
  const store = getStore();
  await store.set(`chat:${chat.chatId}`, chat);
  await store.addToSet('chats', chat.chatId);
}

/** Existing chat, or a new one linked to the given / latest / demo field. */
export async function ensureChat(chatId: string, farmId?: string): Promise<ChatState> {
  const existing = await getChat(chatId);
  if (existing && (!farmId || farmId === existing.farmId)) return existing;
  const chat: ChatState = {
    chatId,
    farmId: farmId ?? (await getStore().get<string>('latestFarm')) ?? 'demo',
    lastSignature: null,
    awaitingHoursFor: null,
  };
  await saveChat(chat);
  return chat;
}

export async function listChats(): Promise<string[]> {
  return getStore().members('chats');
}

async function getRecords(farmId: string): Promise<FieldRecord[]> {
  return (await getStore().get<FieldRecord[]>(`records:${farmId}`)) ?? [];
}

/** One irrigation and one rain record per day: a new one replaces the old. */
async function putRecord(farmId: string, record: FieldRecord): Promise<FieldRecord[]> {
  const records = (await getRecords(farmId)).filter((r) => !(r.date === record.date && r.kind === record.kind));
  records.push(record);
  await getStore().set(`records:${farmId}`, records);
  return records;
}

// --- Engine runs ----------------------------------------------------------------------------

const place = (farm: StoredFarm) => (farm.geo.name === 'Haritada çizilen tarla' ? farm.input.locationText : farm.geo.name);
const cropName = (farm: StoredFarm) => farm.assumptions.crops[farm.input.crop].name;

async function evaluate(farm: StoredFarm, records: FieldRecord[], withRetro: boolean) {
  const a = farm.assumptions;
  const params = toFarmParams(farm.input, a);
  const forecast = await fetchForecast(farm.geo.latitude, farm.geo.longitude, fetch, PAST_DAYS);
  const week = analyzeSeason(forecast, farm.input.plantingDate, params, modelSettings(a, a.forecastInitialDepletionMm), records);
  const t = today();
  const inSeason = week.balance.days.some((d) => d.date >= t);

  let retro: SeasonAnalysis | null = null;
  if (!inSeason && withRetro) {
    const w = archiveSeasonWindow(farm.input.plantingDate, a.crops[farm.input.crop], t);
    const archive = await fetchArchive(farm.geo.latitude, farm.geo.longitude, w.start, w.end);
    retro = analyzeSeason(archive, w.plantingDate, params, modelSettings(a, 0));
  }
  return { week, retro, today: t, inSeason };
}

function statusLine(week: SeasonAnalysis, date: string): string {
  const s = fieldStatus(week.balance, date);
  if (!s) return '';
  if (s.daysOfWaterLeft == null) return `Toprağınızda en az ${s.horizonDays} günlük su var.`;
  if (s.daysOfWaterLeft <= 1) return 'Toprağınızdaki su azaldı, sulama zamanı geldi.';
  return `Toprağınızda yaklaşık ${s.daysOfWaterLeft} günlük su var.`;
}

export interface Alert {
  text: string;
  payload: TelegramPayload;
  signature: string;
  inSeason: boolean;
  source: 'gemini' | 'template';
}

export async function composeAlert(farm: StoredFarm): Promise<Alert> {
  const ev = await evaluate(farm, await getRecords(farm.id), true);
  const payload = buildTelegramPayload({
    place: place(farm),
    cropName: cropName(farm),
    week: ev.week,
    retro: ev.retro,
    today: ev.today,
    farm: farm.input,
  });
  const { text, source } = await explain(payload, 'telegram');
  return { text, payload, signature: planSignature(ev.week, ev.today), inSeason: ev.inSeason, source };
}

/** Sends the alert; with `cron`, stays silent out of season and adds a "plan changed" note. */
export async function sendAlert(chatId: string, farm: StoredFarm, opts: { cron?: boolean } = {}): Promise<'sent' | 'skipped'> {
  const chat = await ensureChat(chatId);
  const alert = await composeAlert(farm);
  if (opts.cron && !alert.inSeason) return 'skipped';
  const note = opts.cron ? planChangeNote(chat.lastSignature, alert.signature, alert.payload) : null;
  if (note) await send(chatId, note);
  await send(chatId, alert.text, MAIN_KEYBOARD);
  await saveChat({ ...chat, farmId: farm.id, lastSignature: alert.signature });
  return 'sent';
}

function weeklyText(week: SeasonAnalysis, date: string): string {
  if (!week.balance.days.some((d) => d.date >= date)) return '📅 Sulama sezonu dışındasınız, bu hafta sulama yok.';
  const pumping = new Map(week.schedule.irrigations.flatMap((irr) => dailyPumping(irr.hours)).map((d) => [d.date, d]));
  const lines = ['📅 7 günlük plan'];
  for (let i = 0; i < 7; i++) {
    const d = addDays(date, i);
    const p = pumping.get(d);
    const rain = week.balance.days.find((b) => b.date === d && b.peff > 0) ? ' 🌧' : '';
    lines.push(
      p
        ? `💧 ${dayName(d)}: ${p.windows.map((w) => formatWindow(w, d)).join(', ')} (${tr(p.hours, 1)} saat)${rain}`
        : `▫️ ${dayName(d)}: sulama yok${rain}`,
    );
  }
  return lines.join('\n');
}

/** Planned net irrigation for "Suladım": the current/next round, else a refill to field capacity. */
function plannedNetMm(week: SeasonAnalysis, date: string): number | null {
  const day = week.balance.days.find((d) => d.date === date);
  if (!day) return null;
  const round = week.schedule.irrigations.find((irr) => irr.date <= date && date <= irr.windowEnd);
  const soon = week.schedule.irrigations.find((irr) => irr.date > date && irr.date <= addDays(date, 2));
  const event = round ?? soon;
  const eventDay = event && week.balance.days.find((d) => d.date === event.date);
  return eventDay?.netMm ?? day.depletionBeforeIrrigationMm;
}

// --- Updates --------------------------------------------------------------------------------

export interface TgUpdate {
  message?: { chat: { id: number }; text?: string; voice?: unknown; audio?: unknown };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
}

const HOURS = /(\d+(?:[.,]\d+)?)\s*(?:saat|sa)\b/i;

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);
  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);

  if (msg.voice || msg.audio) {
    await send(chatId, 'Şimdilik lütfen yazarak anlatın.');
    return;
  }
  const text = (msg.text ?? '').trim();

  if (text.startsWith('/start')) {
    const arg = text.split(/\s+/)[1];
    const farm = (arg && (await loadFarm(arg))) || (await loadFarm((await getStore().get<string>('latestFarm')) ?? 'demo')) || demoFarm();
    await ensureChat(chatId, farm.id);
    await send(
      chatId,
      `Merhaba! 👋 Bu sohbet "${place(farm)} – ${cropName(farm)}, ${tr(farm.input.areaDecare, 1)} dekar" tarlasına bağlandı.\nHer sabah 07:00'de sulama planınızı gönderirim. Suladığınızda veya yağmur yağdığında aşağıdaki butonlarla bana haber verin.`,
    );
    await sendAlert(chatId, farm);
    return;
  }

  const chat = await ensureChat(chatId);
  const farm = (await loadFarm(chat.farmId)) ?? demoFarm();
  const hours = text.match(HOURS);

  if (hours && chat.awaitingHoursFor) {
    const h = Number(hours[1].replace(',', '.'));
    const efficiency = farm.assumptions.efficiency[farm.input.irrigationMethod];
    // Q × hours / area gives the applied depth; × efficiency is what reaches the root zone.
    const netMm = ((farm.input.pumpFlowM3h * h) / farm.input.areaDecare) * efficiency;
    const records = await putRecord(farm.id, { date: chat.awaitingHoursFor, kind: 'irrigation', netMm });
    await saveChat({ ...chat, awaitingHoursFor: null });
    const ev = await evaluate(farm, records, false);
    await send(chatId, `✅ ${tr(h, 1)} saatlik sulama kaydedildi (yaklaşık ${tr(netMm)} mm). ${statusLine(ev.week, ev.today)}`, MAIN_KEYBOARD);
    return;
  }

  if (text === '/plan' || text === '/hafta') {
    const ev = await evaluate(farm, await getRecords(farm.id), false);
    await send(chatId, weeklyText(ev.week, ev.today), MAIN_KEYBOARD);
    return;
  }

  await send(chatId, 'Aşağıdaki butonları kullanabilir ya da tarlanızı yeniden bağlamak için /start yazabilirsiniz.', MAIN_KEYBOARD);
}

async function handleCallback(cq: NonNullable<TgUpdate['callback_query']>): Promise<void> {
  await tg('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => undefined);
  const chatId = cq.message ? String(cq.message.chat.id) : null;
  if (!chatId) return;
  const chat = await ensureChat(chatId);
  const farm = (await loadFarm(chat.farmId)) ?? demoFarm();
  const data = cq.data ?? '';

  if (data === 'rain') {
    await send(chatId, 'Ne kadar yağdı?', RAIN_KEYBOARD);
    return;
  }

  const ev = await evaluate(farm, await getRecords(farm.id), false);

  if (data === 'weekly') {
    await send(chatId, weeklyText(ev.week, ev.today), MAIN_KEYBOARD);
    return;
  }

  if (!ev.week.balance.days.some((d) => d.date === ev.today)) {
    await send(chatId, 'Sulama sezonu dışında olduğumuz için kayıt eklemedim.');
    return;
  }

  if (data === 'irrigated') {
    const netMm = plannedNetMm(ev.week, ev.today) ?? 0;
    const records = await putRecord(farm.id, { date: ev.today, kind: 'irrigation', netMm });
    await saveChat({ ...chat, awaitingHoursFor: ev.today });
    const after = await evaluate(farm, records, false);
    await send(
      chatId,
      `✅ Bugünkü sulama plandaki kadar (yaklaşık ${tr(netMm)} mm) kaydedildi. ${statusLine(after.week, after.today)}\nFarklı süre suladıysanız kaç saat olduğunu yazın, ör. "6 saat".`,
      MAIN_KEYBOARD,
    );
    return;
  }

  const level = data.startsWith('rain:') ? (data.slice(5) as keyof typeof RAIN_LEVELS) : null;
  if (level && level in RAIN_LEVELS) {
    const mm = RAIN_LEVELS[level];
    const records = await putRecord(farm.id, { date: ev.today, kind: 'rain', mm });
    const after = await evaluate(farm, records, false);
    await send(
      chatId,
      `🌧 Bugün yaklaşık ${mm} mm yağmur kaydedildi (varsayım: az 5, orta 15, çok 30 mm). ${statusLine(after.week, after.today)}`,
      MAIN_KEYBOARD,
    );
  }
}
