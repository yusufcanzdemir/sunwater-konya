// Telegram bot: linking chats to fields, alerts, and the "Suladım" feedback loop (rain comes from the weather data).
// Every number comes from the engine; Gemini only rewords the alert (and is checked).

import { dayName } from '../../src/ai/explain.js';
import { buildTelegramPayload, planChangeNote, planSignature, type TelegramPayload } from '../../src/ai/telegram.js';
import { fetchArchive, fetchForecast } from '../../src/data/openMeteo.js';
import { addDays, addYears } from '../../src/engine/dates.js';
import { analyzeSeason, type SeasonAnalysis } from '../../src/engine/plan.js';
import { dailyPumping, formatWindow } from '../../src/engine/schedule.js';
import { archiveSeasonWindow, seasonWindow } from '../../src/engine/season.js';
import { fieldStatus } from '../../src/engine/status.js';
import type { FieldRecord } from '../../src/engine/waterBalance.js';
import { defaultAssumptions, modelSettings, type Assumptions } from '../../src/state/assumptions.js';
import { demoForm, toFarmParams, validateFarmForm, type FarmInput } from '../../src/state/farm.js';
import { buildSummaryPayload, fieldBbox, fieldOutlineSvg, findFields, imageryUrl, templateSummary } from '../../src/farmer/pilot.js';
import { explain } from './handlers.js';
import { PILOT_PREFIX, isPilotId, loadPilot, pilotFarm, pilotField } from './pilotData.js';
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

const PAST_DAYS = 7;
const KARAPINAR = { latitude: 37.716, longitude: 33.551, name: 'Karapınar' };

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tr = (n: number, digits = 0) => n.toLocaleString('tr-TR', { maximumFractionDigits: digits });

// --- Telegram Bot API ---------------------------------------------------------------------

type Keyboard = { text: string; callback_data: string }[][];

const INFO_ROW = [
  { text: '📅 Haftalık plan', callback_data: 'weekly' },
  { text: '📊 Tarlamın durumu', callback_data: 'status' },
];

/**
 * In season. There is no rain button: the plan already takes measured and forecast rain from Open-Meteo,
 * and a farmer's "az / orta / çok" guess would only replace a measurement.
 */
export const MAIN_KEYBOARD: Keyboard = [[{ text: '✅ Suladım', callback_data: 'irrigated' }], INFO_ROW];
/** Out of season (and for fields without a plan): nothing to record. */
export const OFF_SEASON_KEYBOARD: Keyboard = [INFO_ROW];

const LOCATION_KEYBOARD = {
  keyboard: [[{ text: '📍 Konumumu paylaş', request_location: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

export class TelegramError extends Error {}

/** Bot API call; a FormData body is sent as multipart (file uploads). */
export async function tg<T = unknown>(method: string, body: Record<string, unknown> | FormData = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN tanımlı değil.');
  const res = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    body instanceof FormData
      ? { method: 'POST', body }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new TelegramError(data.description ?? `Telegram ${method} başarısız (${res.status}).`);
  return data.result as T;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** The field's season (planting to harvest) contains `date`; no weather needed. */
function inSeason(farm: StoredFarm, date = today()): boolean {
  const w = seasonWindow(farm.input.plantingDate, farm.assumptions.crops[farm.input.crop]);
  return date >= w.start && date <= w.end;
}

const keyboardFor = (farm: StoredFarm | null) => (farm && inSeason(farm) ? MAIN_KEYBOARD : OFF_SEASON_KEYBOARD);

/** "Nisan" for the next planting month (this year's if still ahead, else next year's). */
function nextPlantingMonth(farm: StoredFarm, date = today()): string {
  const planting = date <= farm.input.plantingDate ? farm.input.plantingDate : addYears(farm.input.plantingDate, 1);
  return MONTHS[Number(planting.slice(5, 7)) - 1];
}

const send = (chatId: string, text: string, keyboard?: Keyboard) =>
  tg('sendMessage', { chat_id: chatId, text, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });

/** `photo` is a URL Telegram fetches itself, or an image uploaded as a file. */
function sendPhoto(chatId: string, photo: string | Blob, caption: string, keyboard: Keyboard) {
  if (typeof photo === 'string') return tg('sendPhoto', { chat_id: chatId, photo, caption, reply_markup: { inline_keyboard: keyboard } });
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('caption', caption);
  form.set('reply_markup', JSON.stringify({ inline_keyboard: keyboard }));
  form.set('photo', photo, 'tarla.jpg');
  return tg('sendPhoto', form);
}

const IMAGERY_TIMEOUT_MS = 8000;

/** Esri snapshot with the field outline drawn on it; null when the image or the drawing fails. */
export async function outlinedFieldPhoto(rings: [number, number][][]): Promise<Blob | null> {
  const bbox = fieldBbox(rings);
  try {
    const res = await fetch(imageryUrl(bbox), { signal: AbortSignal.timeout(IMAGERY_TIMEOUT_MS) });
    if (!res.ok) return null;
    // Loaded here so that a missing native binary only costs the outline, not the bot
    const { default: sharp } = await import('sharp');
    const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(512, 512, { fit: 'fill' })
      .composite([{ input: Buffer.from(fieldOutlineSvg(rings, bbox)) }])
      .jpeg({ quality: 85 })
      .toBuffer();
    return new Blob([new Uint8Array(jpg)], { type: 'image/jpeg' });
  } catch {
    return null;
  }
}

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

/** Web-saved field, the demo field, or a pilot field (`field:<id>`, null when the engine has no crop for it). */
export async function loadFarm(id: string): Promise<StoredFarm | null> {
  if (isPilotId(id)) return pilotFarm(id, Number(today().slice(0, 4)));
  return (await getStore().get<StoredFarm>(`farm:${id}`)) ?? (id === 'demo' ? demoFarm() : null);
}

/** The chat's engine farm; a pilot field without engine crop parameters gives null (no plan, summary only). */
async function farmFor(chat: ChatState): Promise<StoredFarm | null> {
  const farm = await loadFarm(chat.farmId);
  return farm ?? (isPilotId(chat.farmId) ? null : demoFarm());
}

async function noPlan(chatId: string, chat: ChatState): Promise<void> {
  const f = await pilotField(chat.farmId);
  const { manifest } = await loadPilot();
  const crop = f ? (manifest.classes[f.class] ?? f.class) : 'bu tarla';
  await send(chatId, `📅 ${crop} için haftalık sulama planı hesaplamıyoruz. Sezon özetiniz için "📊 Tarlamın durumu"na basın.`, OFF_SEASON_KEYBOARD);
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

async function evaluate(farm: StoredFarm, allRecords: FieldRecord[], withRetro: boolean) {
  const a = farm.assumptions;
  // Rain records from the old "Yağmur yağdı" button would override measured rain: irrigation only
  const records = allRecords.filter((r) => r.kind === 'irrigation');
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
  // Out of season a pilot field gets its satellite summary, so no last-season what-if is needed
  const ev = await evaluate(farm, await getRecords(farm.id), !isPilotId(farm.id));
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

/** Satellite season summary of a pilot field (PLAN.md stage 14), worded by Gemini with the number check. */
export async function sendSummary(chatId: string, farmId: string): Promise<void> {
  const f = await pilotField(farmId);
  if (!f) {
    await send(chatId, '📊 Bu sohbet uydu verisi olan bir pilot tarlaya bağlı değil. Konumunuzu paylaşmak için /start yazın.', OFF_SEASON_KEYBOARD);
    return;
  }
  const { rows, season, manifest } = await loadPilot();
  const payload = buildSummaryPayload(f, rows, season, manifest.classes);
  // Rainfed fields have nothing to word but the fixed sentence; Gemini added claims we cannot back there
  const { text } = payload.degerlendirildi ? await explain(payload, 'summary') : { text: templateSummary(payload) };
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  const link = base ? `\n🗺 Haritada: ${base}/panel?field=${f.field_id}` : '';
  await send(chatId, text + link, keyboardFor(await loadFarm(farmId)));
}

/**
 * Sends the alert; with `cron`, stays silent out of season and adds a "plan changed" note.
 * Out of season a pilot field gets its season summary instead of the plan.
 */
export async function sendAlert(chatId: string, farm: StoredFarm, opts: { cron?: boolean } = {}): Promise<'sent' | 'skipped'> {
  const chat = await ensureChat(chatId);
  const alert = await composeAlert(farm);
  if (opts.cron && !alert.inSeason) return 'skipped';
  if (!alert.inSeason && isPilotId(farm.id)) {
    await sendSummary(chatId, farm.id);
    await saveChat({ ...chat, farmId: farm.id, lastSignature: alert.signature });
    return 'sent';
  }
  const note = opts.cron ? planChangeNote(chat.lastSignature, alert.signature, alert.payload) : null;
  if (note) await send(chatId, note);
  await send(chatId, alert.text, keyboardFor(farm));
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
  const rainSum = (from: string, to: string) =>
    week.balance.days.filter((b) => b.date >= from && b.date <= to).reduce((s, b) => s + b.precipitation, 0);
  lines.push(
    `🌧 Yağış: son 7 günde ${tr(rainSum(addDays(date, -7), addDays(date, -1)))} mm ölçüldü, önümüzdeki 7 günde ${tr(rainSum(date, addDays(date, 6)))} mm bekleniyor (Open-Meteo). Plan bunu hesaba katıyor.`,
  );
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
  message?: {
    chat: { id: number };
    text?: string;
    voice?: unknown;
    audio?: unknown;
    location?: { latitude: number; longitude: number };
  };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
}

const HOURS = /(\d+(?:[.,]\d+)?)\s*(?:saat|sa)\b/i;
/** Deep link argument for a pilot field (Telegram start parameters allow [A-Za-z0-9_-]). */
const PILOT_START = /^field_(F\d+)$/;

async function linkFarm(chatId: string, farm: StoredFarm): Promise<void> {
  await ensureChat(chatId, farm.id);
  await send(
    chatId,
    `Merhaba! 👋 Bu sohbet "${place(farm)} – ${cropName(farm)}, ${tr(farm.input.areaDecare, 1)} dekar" tarlasına bağlandı.\nHer sabah 07:00'de sulama planınızı gönderirim. Suladığınızda “✅ Suladım” butonuyla haber verin; yağmuru hava verisinden ben takip ediyorum.`,
  );
  await sendAlert(chatId, farm);
}

/** Links a pilot field; crops without engine parameters get the summary only. */
async function linkPilot(chatId: string, fieldId: string): Promise<void> {
  const farmId = `${PILOT_PREFIX}${fieldId}`;
  const farm = await loadFarm(farmId);
  if (farm) return linkFarm(chatId, farm);
  await ensureChat(chatId, farmId);
  await send(chatId, `Merhaba! 👋 Bu sohbet ${fieldId} tarlasına bağlandı.`);
  await sendSummary(chatId, farmId);
}

/** Photo of the candidate field with "yes" / "another field" buttons. */
async function offerField(chatId: string, ids: string[]): Promise<void> {
  const { byId, shapes, manifest } = await loadPilot();
  const [id, ...rest] = ids;
  const f = byId.get(id);
  const rings = shapes[id];
  if (!f || !rings) return;
  const keyboard: Keyboard = [[{ text: '✅ Evet, bu tarla', callback_data: `link:${id}` }]];
  if (rest.length) keyboard.push([{ text: '➡️ Başka tarla', callback_data: `alt:${rest.join(',')}` }]);
  const plainUrl = imageryUrl(fieldBbox(rings));
  const caption = (where: string) =>
    `${id} – ${manifest.classes[f.class] ?? f.class}, ${tr(f.area_ha * 10, 1)} dekar (${where}).\nBu sizin tarlanız mı?
Görüntü: Esri, Vantor, Earthstar Geographics`;
  const outlined = await outlinedFieldPhoto(rings);
  if (outlined) {
    try {
      await sendPhoto(chatId, outlined, caption('sarı çizgiyle işaretli'), keyboard);
      return;
    } catch {
      // upload refused: fall back to the plain snapshot below
    }
  }
  await sendPhoto(chatId, plainUrl, caption('uydu görüntüsünün ortasında'), keyboard);
}

async function handleLocation(chatId: string, lat: number, lon: number): Promise<void> {
  const { shapes, rows } = await loadPilot();
  const ids = findFields(shapes, rows, lon, lat);
  if (!ids.length) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Paylaştığınız konumda pilot alana ait bir tarla bulamadım (Karapınar kuzey/kuzeybatısı). Örnek tarlayla denemek için /demo yazabilirsiniz.',
      reply_markup: { remove_keyboard: true },
    });
    return;
  }
  await tg('sendMessage', { chat_id: chatId, text: '📍 Konumunuz alındı.', reply_markup: { remove_keyboard: true } });
  await offerField(chatId, ids);
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);
  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);

  if (msg.location) return handleLocation(chatId, msg.location.latitude, msg.location.longitude);
  if (msg.voice || msg.audio) {
    await send(chatId, 'Şimdilik lütfen yazarak anlatın.');
    return;
  }
  const text = (msg.text ?? '').trim();

  if (text.startsWith('/start')) {
    const arg = text.split(/\s+/)[1];
    const pilot = arg?.match(PILOT_START);
    if (pilot) return linkPilot(chatId, pilot[1]);
    const farm = arg ? await loadFarm(arg) : null;
    if (farm) return linkFarm(chatId, farm);
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Merhaba! 👋 Tarlanızı bulmam için tarlanızdayken konumunuzu paylaşın. Örnek tarlayla denemek için /demo yazabilirsiniz.',
      reply_markup: LOCATION_KEYBOARD,
    });
    return;
  }

  if (text === '/demo') {
    return linkFarm(chatId, (await loadFarm((await getStore().get<string>('latestFarm')) ?? 'demo')) ?? demoFarm());
  }

  const chat = await ensureChat(chatId);
  if (text === '/durum') return sendSummary(chatId, chat.farmId);
  const farm = await farmFor(chat);
  if (!farm) return noPlan(chatId, chat);
  const hours = text.match(HOURS);

  if (hours && chat.awaitingHoursFor) {
    const h = Number(hours[1].replace(',', '.'));
    const efficiency = farm.assumptions.efficiency[farm.input.irrigationMethod];
    // Q × hours / area gives the applied depth; × efficiency is what reaches the root zone.
    const netMm = ((farm.input.pumpFlowM3h * h) / farm.input.areaDecare) * efficiency;
    const records = await putRecord(farm.id, { date: chat.awaitingHoursFor, kind: 'irrigation', netMm });
    await saveChat({ ...chat, awaitingHoursFor: null });
    const ev = await evaluate(farm, records, false);
    await send(chatId, `✅ ${tr(h, 1)} saatlik sulama kaydedildi (yaklaşık ${tr(netMm)} mm). ${statusLine(ev.week, ev.today)}`, keyboardFor(farm));
    return;
  }

  if (text === '/plan' || text === '/hafta') {
    const ev = await evaluate(farm, await getRecords(farm.id), false);
    await send(chatId, weeklyText(ev.week, ev.today), keyboardFor(farm));
    return;
  }

  await send(chatId, 'Aşağıdaki butonları kullanabilir ya da tarlanızı yeniden bağlamak için /start yazabilirsiniz.', keyboardFor(farm));
}

async function handleCallback(cq: NonNullable<TgUpdate['callback_query']>): Promise<void> {
  await tg('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => undefined);
  const chatId = cq.message ? String(cq.message.chat.id) : null;
  if (!chatId) return;
  const data = cq.data ?? '';

  if (data.startsWith('link:')) return linkPilot(chatId, data.slice(5));
  if (data.startsWith('alt:')) return offerField(chatId, data.slice(4).split(',').filter(Boolean));

  const chat = await ensureChat(chatId);
  if (data === 'status') return sendSummary(chatId, chat.farmId);
  const farm = await farmFor(chat);
  if (!farm) return noPlan(chatId, chat);

  // Buttons of older messages: the rain button was removed, "Suladım" is hidden out of season
  if (data === 'rain' || data.startsWith('rain:')) {
    await send(
      chatId,
      '🌧 Yağmuru artık hava verisinden ben takip ediyorum (son günlerin ölçümü ve önümüzdeki günlerin tahmini); bir şey girmenize gerek yok. Haftalık planda yağış da yazıyor.',
      keyboardFor(farm),
    );
    return;
  }
  if (data === 'irrigated' && !inSeason(farm)) {
    await send(
      chatId,
      `🗓 Şu an sulama sezonu dışındayız, bu yüzden sulama kaydı tutmuyorum. Plan ve "Suladım" kayıtları ${nextPlantingMonth(farm)} ayında ekimle yeniden başlayacak. Geçen sezonun özeti için "📊 Tarlamın durumu"na basın.`,
      OFF_SEASON_KEYBOARD,
    );
    return;
  }

  const ev = await evaluate(farm, await getRecords(farm.id), false);

  if (data === 'weekly') {
    await send(chatId, weeklyText(ev.week, ev.today), keyboardFor(farm));
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
}
