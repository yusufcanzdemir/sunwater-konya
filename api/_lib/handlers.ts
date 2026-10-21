// Server-only Gemini handlers. Framework-neutral (Request → Response) so the same code
// runs as Vercel functions and behind the Vite dev middleware. GEMINI_API_KEY never leaves the server.

import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { checkExplanation, templateExplanation, type ExplainPayload } from '../../src/ai/explain.js';
import { MAX_FARM_TEXT_LENGTH, sanitizeParsedFarm } from '../../src/ai/parseFarm.js';
import { templateTelegram, type TelegramPayload } from '../../src/ai/telegram.js';

const DEFAULT_MODEL = 'gemini-3.8-flash';
const MAX_PAYLOAD_BYTES = 20_000;

const PARSE_SYSTEM_INSTRUCTION =
  "Türk çiftçisinin tarlasını anlatan metinden yalnızca açıkça söylenen bilgileri çıkar. Söylenmeyeni uydurma, missing_fields listesine yaz. 'Dönüm' = dekar. 'Gün boyu' ≈ 24 saat, 'yarım gün' ≈ 12 saat.";

const EXPLAIN_RULES =
  "YALNIZCA verilen JSON'daki sayıları kullan, yeni sayı üretme. Teknik terim kullanma (ET0, Kc yazma). Önce bu haftaki eylemi söyle, sonra tasarrufu TL ve su olarak söyle, en sonda yeraltı suyunu ve obruk riskini korumaya katkısını bir cümleyle belirt.";

const EXPLAIN_SYSTEM_INSTRUCTION = `Konya'daki bir çiftçiye sulama planını sade Türkçeyle, en fazla 6 cümlede anlat. ${EXPLAIN_RULES}`;

const TELEGRAM_SYSTEM_INSTRUCTION = `Konya'daki bir çiftçiye sulama planını sade Türkçeyle, Telegram mesajı olarak en fazla 5 kısa satırda anlat; her satır tek bir emoji ile başlasın, ilk satır tarlanın adı olsun. ${EXPLAIN_RULES}`;

const nullableString = (description?: string): Schema => ({ type: Type.STRING, nullable: true, description });
const nullableNumber = (description?: string): Schema => ({ type: Type.NUMBER, nullable: true, description });
const nullableEnum = (values: string[]): Schema => ({ type: Type.STRING, nullable: true, enum: values });

const PARSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    location_text: nullableString('Köy, ilçe veya il adı'),
    crop: nullableEnum(['sugar_beet', 'maize', 'sunflower', 'wheat']),
    planting_date: nullableString('YYYY-MM-DD'),
    area_decare: nullableNumber(),
    irrigation_method: nullableEnum(['flood', 'sprinkler', 'drip']),
    well_head_m: nullableNumber('Kuyu derinliği / toplam basma yüksekliği (m)'),
    pump_flow_m3h: nullableNumber('Pompa debisi (m³/saat)'),
    pv_kwp: nullableNumber('Güneş paneli gücü (kWp)'),
    energy_source: nullableEnum(['solar_grid', 'grid', 'diesel']),
    habit_interval_days: nullableNumber('Kaç günde bir sulandığı'),
    habit_hours: nullableNumber('Her sulamada kaç saat'),
    missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
    follow_up_question: { type: Type.STRING, description: 'Eksik bilgileri soran tek, kısa Türkçe soru' },
  },
  required: [
    'location_text',
    'crop',
    'planting_date',
    'area_decare',
    'irrigation_method',
    'well_head_m',
    'pump_flow_m3h',
    'pv_kwp',
    'energy_source',
    'habit_interval_days',
    'habit_hours',
    'missing_fields',
    'follow_up_question',
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const error = (message: string, status: number) => json({ error: message }, status);

function client(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

/** Tried in order, once each, while the previous model is overloaded or rate-limited. */
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

/** One model call may take at most this long before the next model is tried. */
const CALL_TIMEOUT_MS = 15_000;
/** Whole-request budgets: after these the user gets the error / template instead of waiting. */
const PARSE_DEADLINE_MS = 40_000;
const EXPLAIN_DEADLINE_MS = 30_000;

const isTimeout = (e: unknown) => ['AbortError', 'TimeoutError'].includes((e as { name?: string }).name ?? '');

const isOverloaded = (e: unknown) => {
  const status = (e as { status?: number }).status;
  return status === 503 || status === 429 || isTimeout(e);
};

type GenerateParams = Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>;

async function generate(ai: GoogleGenAI, params: GenerateParams, deadline: number) {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
  for (let i = 0; ; i++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Object.assign(new Error('deadline exceeded'), { name: 'TimeoutError' });
    try {
      return await ai.models.generateContent({
        ...params,
        model: models[i],
        config: { ...params.config, abortSignal: AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, remaining)) },
      });
    } catch (e) {
      if (!isOverloaded(e) || i === models.length - 1) throw e;
      const reason = isTimeout(e) ? 'timeout' : (e as { status?: number }).status;
      console.warn(`${models[i]} unavailable (${reason}), retrying with ${models[i + 1]}`);
    }
  }
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_PAYLOAD_BYTES) throw new Error('too_large');
  return JSON.parse(text);
}

export async function parseFarm(request: Request): Promise<Response> {
  if (request.method !== 'POST') return error('Yalnızca POST.', 405);
  let body: { text?: unknown };
  try {
    body = (await readJson(request)) as { text?: unknown };
  } catch {
    return error('Geçersiz istek.', 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return error('Tarlanızı anlatan bir metin yazın.', 400);
  if (text.length > MAX_FARM_TEXT_LENGTH) return error(`Metin en fazla ${MAX_FARM_TEXT_LENGTH} karakter olabilir.`, 400);

  const ai = client();
  if (!ai) return error('Yapay zekâ servisi yapılandırılmamış. Formu elle doldurabilirsiniz.', 503);

  try {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
    const response = await generate(ai, {
      contents: `Bugünün tarihi: ${today}. Ekim yılı söylenmediyse en son geçmiş olan tarihi kullan.\n\nÇiftçinin metni:\n${text}`,
      config: {
        systemInstruction: PARSE_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: PARSE_SCHEMA,
        temperature: 0,
      },
    }, Date.now() + PARSE_DEADLINE_MS);
    return json(sanitizeParsedFarm(JSON.parse(response.text ?? '{}')));
  } catch (e) {
    console.error('parse-farm failed', e);
    return error('Metin şu an yorumlanamadı. Formu elle doldurabilirsiniz.', 502);
  }
}

export type ExplainFormat = 'web' | 'telegram';

export interface Explanation {
  text: string;
  source: 'gemini' | 'template';
}

const MAX_TELEGRAM_LINES = 5;

/**
 * Gemini text for an engine payload, checked so it only repeats the payload's numbers;
 * one retry, then the deterministic template.
 */
export async function explain(payload: ExplainPayload | TelegramPayload, format: ExplainFormat): Promise<Explanation> {
  const template = (): Explanation => ({
    text: format === 'telegram' ? templateTelegram(payload as TelegramPayload) : templateExplanation(payload as ExplainPayload),
    source: 'template',
  });
  const ai = client();
  if (!ai) return template();

  // Kept outside the spec's system instruction: the retrospective is a what-if, not a measured result.
  const what =
    format === 'telegram'
      ? '"gecmis_sezon_tasarruf" ve "hafta_tasarruf" tahmindir.'
      : '"gecmis_sezon" bir tahmindir; bu plan geçen sezon uygulanmadı.';
  const input = `${JSON.stringify(payload)}\n\nNot: ${what} Tasarrufu koşullu anlat ("sağlardı", "kazandırırdı"), "sağlandı" deme. Sayıları yazıyla değil, JSON'daki gibi rakamla yaz (ör. 60.878).`;
  const systemInstruction = format === 'telegram' ? TELEGRAM_SYSTEM_INSTRUCTION : EXPLAIN_SYSTEM_INSTRUCTION;
  const deadline = Date.now() + EXPLAIN_DEADLINE_MS;
  let note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await generate(ai, {
        contents: note ? `${input}\n\n${note}` : input,
        config: { systemInstruction, temperature: 0.2 },
      }, deadline);
      const text = (response.text ?? '').trim();
      const check = checkExplanation(text, payload);
      const tooLong = format === 'telegram' && text.split('\n').filter((l) => l.trim()).length > MAX_TELEGRAM_LINES;
      if (check.ok && !tooLong) return { text, source: 'gemini' };
      note = tooLong
        ? `Önceki yanıt ${MAX_TELEGRAM_LINES} satırdan uzundu. En fazla ${MAX_TELEGRAM_LINES} kısa satır yaz.`
        : `Önceki yanıtın JSON'da olmayan sayılar veya teknik terimler içeriyordu${
            check.unknown.length ? ` (${check.unknown.join(', ')})` : ''
          }. Yalnızca JSON'daki sayıları kullanarak yeniden yaz.`;
    } catch (e) {
      console.error('explain failed', e);
      break;
    }
  }
  return template();
}

export async function explainPlan(request: Request): Promise<Response> {
  if (request.method !== 'POST') return error('Yalnızca POST.', 405);
  let body: Record<string, unknown>;
  try {
    body = (await readJson(request)) as Record<string, unknown>;
    if (!body || typeof body !== 'object') throw new Error('shape');
  } catch {
    return error('Geçersiz istek.', 400);
  }
  // Body is the engine payload itself, plus an optional "format".
  const { format: rawFormat, ...payload } = body;
  const format: ExplainFormat = rawFormat === 'telegram' ? 'telegram' : 'web';
  const valid = format === 'telegram' ? typeof payload.tarla === 'string' : payload.bu_hafta != null;
  if (!valid) return error('Geçersiz istek.', 400);
  return json(await explain(payload as unknown as ExplainPayload | TelegramPayload, format));
}
