// Telegram bot: linking chats to fields, alerts, and the "Suladım" feedback loop (rain comes from the weather data).
// Every number comes from the engine; Gemini only rewords the alert (and is checked).

import { dayName } from '../../src/ai/explain.js';
import { buildTelegramPayload, nextPumpingDay, planChangeNote, planSignature, relativeDay, type TelegramPayload } from '../../src/ai/telegram.js';
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
import { planCard, usageCard, type PlanCardDay } from './cards.js';
import { explain } from './handlers.js';
import { PILOT_PREFIX, isPilotId, loadPilot, pilotFarm, pilotField, pilotFieldId } from './pilotData.js';
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

type Button = { text: string; callback_data: string } | { text: string; web_app: { url: string } };
type Keyboard = Button[][];

/**
 * Buttons under a message. In season only "Suladım"; there is no rain button: the plan already takes
 * measured and forecast rain from Open-Meteo, and a farmer's "az / orta / çok" guess would only replace a measurement.
 */
export const MAIN_KEYBOARD: Keyboard = [[{ text: '✅ Suladım', callback_data: 'irrigated' }]];
/** Out of season (and for fields without a plan): nothing to record. */
export const OFF_SEASON_KEYBOARD: Keyboard = [];

/** Button texts of the menu that stays at the bottom of the chat, so nobody has to type a "/" command. */
export const MENU_TEXT = { today: '💧 Bugün', week: '📅 Bu hafta', field: '📊 Tarlam', move: '📍 Tarla değiştir' } as const;
export const MENU = {
  keyboard: [
    [{ text: MENU_TEXT.today }, { text: MENU_TEXT.week }],
    [{ text: MENU_TEXT.field }, { text: MENU_TEXT.move, request_location: true }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const LOCATION_KEYBOARD = {
  keyboard: [[{ text: '📍 Konumumu paylaş', request_location: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

/** The site's address for "open" buttons; Telegram opens only https pages inside the chat. */
function webBase(): string | null {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  return base?.startsWith('https://') ? base : null;
}

/** The farmer's home screen (pilot field) or the site's start page. */
function fieldPage(farmId: string): string | null {
  const base = webBase();
  if (!base) return null;
  return isPilotId(farmId) ? `${base}/?field=${pilotFieldId(farmId)}` : `${base}/`;
}

/** "Tarlamı aç" opens the site as a Telegram Mini App, inside the chat. */
function openRow(farmId: string): Keyboard {
  const url = fieldPage(farmId);
  return url ? [[{ text: '🌾 Tarlamı aç', web_app: { url } }]] : [];
}

/** The button next to the typing box also opens the field page (instead of the "/" command list). */
async function setMenuButton(chatId: string, farmId: string): Promise<void> {
  const url = fieldPage(farmId);
  if (!url) return;
  await tg('setChatMenuButton', { chat_id: chatId, menu_button: { type: 'web_app', text: 'Tarlam', web_app: { url } } }).catch(() => undefined);
}

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

const keyboardFor = (farm: StoredFarm | null, farmId = farm?.id ?? '') => [
  ...(farm && inSeason(farm) ? MAIN_KEYBOARD : OFF_SEASON_KEYBOARD),
  ...openRow(farmId),
];

/** "Nisan" for the next planting month (this year's if still ahead, else next year's). */
function nextPlantingMonth(farm: StoredFarm, date = today()): string {
  const planting = date <= farm.input.plantingDate ? farm.input.plantingDate : addYears(farm.input.plantingDate, 1);
  return MONTHS[Number(planting.slice(5, 7)) - 1];
}

const markup = (keyboard?: Keyboard) => (keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {});

const send = (chatId: string, text: string, keyboard?: Keyboard) => tg('sendMessage', { chat_id: chatId, text, ...markup(keyboard) });

/** Text with the bottom menu (a message carries either the menu or inline buttons). */
const sendWithMenu = (chatId: string, text: string) => tg('sendMessage', { chat_id: chatId, text, reply_markup: MENU });

/** Telegram captions are limited to 1024 characters. */
const CAPTION_MAX = 1024;

/** `photo` is a URL Telegram fetches itself, or an image uploaded as a file. */
function sendPhoto(chatId: string, photo: string | Blob, caption: string, keyboard: Keyboard) {
  const text = caption.length > CAPTION_MAX ? `${caption.slice(0, CAPTION_MAX - 1)}…` : caption;
  if (typeof photo === 'string') return tg('sendPhoto', { chat_id: chatId, photo, caption: text, ...markup(keyboard) });
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('caption', text);
  if (keyboard.length) form.set('reply_markup', JSON.stringify({ inline_keyboard: keyboard }));
  form.set('photo', photo, photo.type === 'image/png' ? 'kart.png' : 'tarla.jpg');
  return tg('sendPhoto', form);
}

/** A picture card when it could be drawn, else the same text as a plain message. */
async function sendCard(chatId: string, card: Blob | null, text: string, keyboard: Keyboard): Promise<void> {
  if (card) {
    try {
      await sendPhoto(chatId, card, text, keyboard);
      return;
    } catch {
      // upload refused: the text alone still carries the plan
    }
  }
  await send(chatId, text, keyboard);
}

/** "fotoğraf gönderiyor…" at the top of the chat while a card is drawn. */
const showUploading = (chatId: string) => tg('sendChatAction', { chat_id: chatId, action: 'upload_photo' }).catch(() => undefined);

const IMAGERY_TIMEOUT_MS = 8000;

/** Esri snapshot (JPEG) with the field outline drawn on it; null when the image or the drawing fails. */
async function outlinedFieldJpeg(rings: [number, number][][]): Promise<Buffer | null> {
  const bbox = fieldBbox(rings);
  try {
    const res = await fetch(imageryUrl(bbox), { signal: AbortSignal.timeout(IMAGERY_TIMEOUT_MS) });
    if (!res.ok) return null;
    // Loaded here so that a missing native binary only costs the outline, not the bot
    const { default: sharp } = await import('sharp');
    return await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(512, 512, { fit: 'fill' })
      .composite([{ input: Buffer.from(fieldOutlineSvg(rings, bbox)) }])
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}

export async function outlinedFieldPhoto(rings: [number, number][][]): Promise<Blob | null> {
  const jpg = await outlinedFieldJpeg(rings);
  return jpg ? new Blob([new Uint8Array(jpg)], { type: 'image/jpeg' }) : null;
}

/** Outlined photo of a pilot field; null for other fields or when the imagery fails. */
async function fieldJpeg(farmId: string): Promise<Buffer | null> {
  if (!isPilotId(farmId)) return null;
  const rings = (await loadPilot()).shapes[pilotFieldId(farmId)];
  return rings ? outlinedFieldJpeg(rings) : null;
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
  await send(chatId, `📅 ${crop} için haftalık sulama planı hesaplamıyoruz. Sezon özetiniz için aşağıdaki "${MENU_TEXT.field}" düğmesine basın.`, OFF_SEASON_KEYBOARD);
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
  week: SeasonAnalysis;
  today: string;
}

const SHORT_DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
/** Rain worth showing on a day box (mm). */
const RAIN_MARK_MM = 2;
/** Mean reference ET of the next three days above which the card warns of heat (mm/day). */
const HEAT_ET0_MM = 7.5;

/** Card title: "F03053 · Şeker pancarı · 34 dekar". */
const cardTitle = (farm: StoredFarm) =>
  `${isPilotId(farm.id) ? pilotFieldId(farm.id) : place(farm)} · ${cropName(farm)} · ${tr(farm.input.areaDecare, 1)} dekar`;

/** The daily plan as a picture: next pumping, a rain or heat warning and the 7 days ahead. */
export async function planPicture(farm: StoredFarm, alert: Alert): Promise<Blob | null> {
  const { week, today: t, payload } = alert;
  const pumping = new Map(week.schedule.irrigations.flatMap((irr) => dailyPumping(irr.hours)).map((d) => [d.date, d]));
  const days: PlanCardDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(t, i);
    const rain = week.balance.days.find((b) => b.date === date)?.precipitation ?? 0;
    return { label: SHORT_DAYS[weekday(date)], hours: pumping.get(date)?.hours ?? 0, rain: rain >= RAIN_MARK_MM, today: i === 0 };
  });
  const next = nextPumpingDay(week, t);
  const soon = next && next.date <= addDays(t, 6) ? next : null;
  const ahead = week.balance.days.filter((b) => b.date >= t && b.date <= addDays(t, 2));
  const hot = ahead.length > 0 && ahead.reduce((s, b) => s + b.et0, 0) / ahead.length >= HEAT_ET0_MM;
  const warning = payload.yagis
    ? { kind: 'rain' as const, text: `${payload.yagis.gun} yağmur bekleniyor (${tr(payload.yagis.mm)} mm)` }
    : hot
      ? { kind: 'heat' as const, text: 'Önümüzdeki günler çok sıcak, toprak hızlı kuruyor' }
      : null;
  return planCard({
    title: cardTitle(farm),
    when: soon ? relativeDay(soon.date, t) : 'Bu hafta',
    headline: soon ? soon.windows.map((w) => formatWindow(w, soon.date)).join(' + ') : 'Sulama yok',
    detail: soon
      ? `${tr(soon.hours, 1)} saat pompa · ~${tr(soon.hours * farm.input.pumpFlowM3h, 0)} m³ su`
      : 'Toprakta yeterli su var',
    warning,
    days,
    photo: await fieldJpeg(farm.id),
  });
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
  return { text, payload, signature: planSignature(ev.week, ev.today), inSeason: ev.inSeason, source, week: ev.week, today: ev.today };
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
  const keyboard = keyboardFor(await loadFarm(farmId), farmId);
  if (!payload.degerlendirildi) {
    await send(chatId, text, keyboard);
    return;
  }
  await showUploading(chatId);
  // mm over the field → m³ (1 mm on 1 ha = 10 m³)
  const m3 = (mm: number) => mm * f.area_ha * 10;
  const bars: Parameters<typeof usageCard>[0]['bars'] = [{ label: 'Senin tarlan', m3: payload.mavi_su_m3, tone: 'me' }];
  if (payload.benzer_tarla_ortanca_mm != null) bars.push({ label: `Benzer ${payload.urun.toLocaleLowerCase('tr-TR')} tarlaları`, m3: m3(payload.benzer_tarla_ortanca_mm), tone: 'peer' });
  if (payload.verimli_referans_mm != null) bars.push({ label: 'Damla sulamayla yeterdi', m3: m3(payload.verimli_referans_mm), tone: 'ref' });
  const peer = payload.benzer_tarla_ortanca_mm;
  const diff = peer ? Math.round(((payload.mavi_su_mm - peer) / peer) * 100) : null;
  const card = await usageCard({
    title: `${f.field_id} · ${payload.urun} · ${season} sezonu`,
    verdict: diff == null ? payload.durum : diff > 0 ? `Benzer tarlalardan %${diff} fazla` : diff < 0 ? `Benzer tarlalardan %${-diff} az` : 'Benzer tarlalarla aynı',
    verdictTone: diff != null && diff > 0 ? 'over' : 'ok',
    bars,
    photo: await fieldJpeg(farmId),
  });
  await sendCard(chatId, card, text, keyboard);
}

/** The plan card with the alert text as its caption, "Suladım" and "Tarlamı aç" under it. */
async function sendPlan(chatId: string, farm: StoredFarm, alert: Alert): Promise<void> {
  await showUploading(chatId);
  await sendCard(chatId, await planPicture(farm, alert), alert.text, keyboardFor(farm));
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
  await sendPlan(chatId, farm, alert);
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
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id?: number } };
}

const HOURS = /(\d+(?:[.,]\d+)?)\s*(?:saat|sa)\b/i;
/** Deep link argument for a pilot field (Telegram start parameters allow [A-Za-z0-9_-]). */
const PILOT_START = /^field_(F\d+)$/;

async function linkFarm(chatId: string, farm: StoredFarm): Promise<void> {
  await ensureChat(chatId, farm.id);
  await sendWithMenu(
    chatId,
    `Merhaba! 👋 Bu sohbet "${place(farm)} – ${cropName(farm)}, ${tr(farm.input.areaDecare, 1)} dekar" tarlasına bağlandı.\nHer sabah 07:00'de sulama planınızı resimli gönderirim. Suladığınızda planın altındaki “✅ Suladım” düğmesine basın; yağmuru hava verisinden ben takip ediyorum.\nAşağıdaki düğmelerle istediğiniz zaman bugünkü planı, haftayı ve tarlanızı görebilirsiniz.`,
  );
  await setMenuButton(chatId, farm.id);
  await sendAlert(chatId, farm);
}

/** Links a pilot field; crops without engine parameters get the summary only. */
async function linkPilot(chatId: string, fieldId: string): Promise<void> {
  const farmId = `${PILOT_PREFIX}${fieldId}`;
  const farm = await loadFarm(farmId);
  if (farm) return linkFarm(chatId, farm);
  await ensureChat(chatId, farmId);
  await sendWithMenu(chatId, `Merhaba! 👋 Bu sohbet ${fieldId} tarlasına bağlandı.`);
  await setMenuButton(chatId, farmId);
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
  await sendWithMenu(chatId, '📍 Konumunuz alındı.');
  await offerField(chatId, ids);
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);
  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);

  if (msg.location) return handleLocation(chatId, msg.location.latitude, msg.location.longitude);
  if (msg.voice || msg.audio) {
    await sendWithMenu(chatId, 'Sesli mesajı henüz anlayamıyorum 🙏 Aşağıdaki düğmeleri kullanabilirsiniz.');
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
      text: 'Merhaba! 👋 Tarlanızı bulmam için tarlanızdayken aşağıdaki "📍 Konumumu paylaş" düğmesine basın.',
      reply_markup: LOCATION_KEYBOARD,
    });
    return;
  }

  if (text === '/demo') {
    return linkFarm(chatId, (await loadFarm((await getStore().get<string>('latestFarm')) ?? 'demo')) ?? demoFarm());
  }

  const chat = await ensureChat(chatId);
  const wants = intent(text);
  if (wants === 'field') return sendSummary(chatId, chat.farmId);
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

  if (wants === 'today') {
    await sendAlert(chatId, farm);
    return;
  }
  if (wants === 'week') {
    const ev = await evaluate(farm, await getRecords(farm.id), false);
    await send(chatId, weeklyText(ev.week, ev.today), keyboardFor(farm));
    return;
  }
  if (wants === 'irrigated') return recordIrrigation(chatId, chat, farm);

  await sendWithMenu(chatId, `Aşağıdaki düğmelere basabilirsiniz:\n${MENU_TEXT.today} – bugün ne kadar sulayacağınız\n${MENU_TEXT.week} – 7 günlük plan\n${MENU_TEXT.field} – sezon özetiniz`);
}

/** Menu buttons and plain words ("bugün", "hafta", "suladım"); the old "/" commands still work. */
function intent(text: string): 'today' | 'week' | 'field' | 'irrigated' | null {
  const t = text.toLocaleLowerCase('tr-TR');
  if (t === MENU_TEXT.today.toLocaleLowerCase('tr-TR') || /bugün|bugun|ne zaman|sulayay/.test(t)) return 'today';
  if (t === '/plan' || t === '/hafta' || /hafta/.test(t)) return 'week';
  if (t === '/durum' || /tarlam|durum|özet|ozet/.test(t)) return 'field';
  if (/suladı|suladi/.test(t)) return 'irrigated';
  return null;
}

/** Records today's irrigation at the planned amount; the tapped button turns into "Sulandı". */
async function recordIrrigation(chatId: string, chat: ChatState, farm: StoredFarm, messageId?: number): Promise<void> {
  if (!inSeason(farm)) {
    await send(
      chatId,
      `🗓 Şu an sulama sezonu dışındayız, bu yüzden sulama kaydı tutmuyorum. Plan ve "Suladım" kayıtları ${nextPlantingMonth(farm)} ayında ekimle yeniden başlayacak. Geçen sezonun özeti için aşağıdaki "${MENU_TEXT.field}" düğmesine basın.`,
      openRow(farm.id),
    );
    return;
  }
  const ev = await evaluate(farm, await getRecords(farm.id), false);
  const netMm = plannedNetMm(ev.week, ev.today) ?? 0;
  const records = await putRecord(farm.id, { date: ev.today, kind: 'irrigation', netMm });
  await saveChat({ ...chat, awaitingHoursFor: ev.today });
  if (messageId) {
    await tg('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '✅ Sulandı', callback_data: 'done' }], ...openRow(farm.id)] },
    }).catch(() => undefined);
  }
  const after = await evaluate(farm, records, false);
  await send(
    chatId,
    `✅ Bugünkü sulama plandaki kadar (yaklaşık ${tr(netMm)} mm) kaydedildi. ${statusLine(after.week, after.today)}\nFarklı süre suladıysanız kaç saat olduğunu yazın, ör. "6 saat".`,
  );
}

async function handleCallback(cq: NonNullable<TgUpdate['callback_query']>): Promise<void> {
  const done = cq.data === 'done';
  await tg('answerCallbackQuery', { callback_query_id: cq.id, ...(done ? { text: 'Bugünkü sulama zaten kaydedildi ✅' } : {}) }).catch(() => undefined);
  if (done) return;
  const chatId = cq.message ? String(cq.message.chat.id) : null;
  if (!chatId) return;
  const data = cq.data ?? '';

  if (data.startsWith('link:')) return linkPilot(chatId, data.slice(5));
  if (data.startsWith('alt:')) return offerField(chatId, data.slice(4).split(',').filter(Boolean));

  const chat = await ensureChat(chatId);
  if (data === 'status') return sendSummary(chatId, chat.farmId);
  const farm = await farmFor(chat);
  if (!farm) return noPlan(chatId, chat);

  // Buttons of older messages: the rain button was removed
  if (data === 'rain' || data.startsWith('rain:')) {
    await send(
      chatId,
      '🌧 Yağmuru artık hava verisinden ben takip ediyorum (son günlerin ölçümü ve önümüzdeki günlerin tahmini); bir şey girmenize gerek yok. Haftalık planda yağış da yazıyor.',
      keyboardFor(farm),
    );
    return;
  }
  if (data === 'irrigated') return recordIrrigation(chatId, chat, farm, cq.message?.message_id);
  if (data === 'weekly') {
    const ev = await evaluate(farm, await getRecords(farm.id), false);
    await send(chatId, weeklyText(ev.week, ev.today), keyboardFor(farm));
  }
}
