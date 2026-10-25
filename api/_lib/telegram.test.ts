// Bot flows end to end with every network call faked: no real Telegram message, no Gemini call.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '../../src/engine/dates';
import { defaultAssumptions } from '../../src/state/assumptions';
import { demoForm, validateFarmForm } from '../../src/state/farm';

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

/** 7 past + 16 forecast days of dry, hot weather with a midday sun. */
function forecastJson() {
  const start = addDays(today, -7);
  const time = Array.from({ length: 23 }, (_, i) => addDays(start, i));
  return {
    latitude: 37.7,
    longitude: 33.55,
    daily: { time, et0_fao_evapotranspiration: time.map(() => 7), precipitation_sum: time.map(() => 0) },
    hourly: {
      time: time.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)),
      global_tilted_irradiance: time.flatMap(() => Array.from({ length: 24 }, (_, h) => (h >= 9 && h <= 17 ? 900 : 0))),
    },
  };
}

const sent: { method: string; body: Record<string, unknown> }[] = [];

function fakeFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = String(url instanceof Request ? url.url : url);
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  if (u.startsWith('https://api.telegram.org/')) {
    const method = u.split('/').pop()!;
    sent.push({ method, body: JSON.parse(String(init?.body ?? '{}')) });
    if (method === 'getMe') return ok({ ok: true, result: { username: 'test_bot' } });
    return ok({ ok: true, result: {} });
  }
  if (u.startsWith('https://api.open-meteo.com/v1/forecast')) return ok(forecastJson());
  return Promise.reject(new Error(`unexpected fetch ${u}`));
}

const saved = { ...process.env };
beforeAll(() => {
  delete process.env.GEMINI_API_KEY; // template text, no Gemini call
  delete process.env.KV_REST_API_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_DEMO_CHAT_ID = '999';
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});
afterAll(() => {
  vi.unstubAllGlobals();
  process.env = saved;
});
beforeEach(() => {
  sent.length = 0;
});

const { handleUpdate, saveFarm, loadFarm } = await import('./telegram');
const { sendAlertEndpoint } = await import('./telegramHandlers');

// In-season field: planted 60 days ago.
const { input } = validateFarmForm({ ...demoForm(2026), plantingDate: addDays(today, -60), irrigationMethod: 'drip' });
const farm = {
  id: 'f1',
  input: input!,
  geo: { latitude: 37.7, longitude: 33.55, name: 'Karapınar' },
  assumptions: defaultAssumptions(),
  savedAt: today,
};

const messages = () => sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.body.text));
const chat = { id: 42 };
const tap = (data: string) => handleUpdate({ callback_query: { id: 'cb', data, message: { chat } } });

describe('telegram bot', () => {
  it('/start links the chat to the field and sends the first alert with buttons', async () => {
    await saveFarm(farm);
    await handleUpdate({ message: { chat, text: '/start f1' } });
    const texts = messages();
    expect(texts[0]).toContain('"Karapınar – Şeker pancarı, 100 dekar" tarlasına bağlandı');
    expect(texts[1].split('\n')[0]).toBe('🌱 Karapınar – Şeker pancarı tarlası');
    expect(texts[1].split('\n').length).toBeLessThanOrEqual(5);
    const alert = sent.filter((s) => s.method === 'sendMessage')[1];
    expect(JSON.stringify(alert.body.reply_markup)).toContain('irrigated');
  });

  it('"Suladım" records the planned amount and reports the water left', async () => {
    await tap('irrigated');
    expect(sent[0].method).toBe('answerCallbackQuery');
    expect(messages()[0]).toMatch(/kaydedildi.*Toprağınızda (yaklaşık \d+|en az \d+) günlük su var/s);
  });

  it('a typed duration replaces the irrigation with Q × hours / area × efficiency', async () => {
    await handleUpdate({ message: { chat, text: '6 saat' } });
    // 60 m³/h × 6 h / 100 da × 0.88 (drip) = 3.2 mm
    expect(messages()[0]).toContain('6 saatlik sulama kaydedildi (yaklaşık 3 mm)');
  });

  it('"Yağmur yağdı" asks how much, then records the assumed amount', async () => {
    await tap('rain');
    expect(JSON.stringify(sent.at(-1)!.body.reply_markup)).toContain('rain:orta');
    sent.length = 0;
    await tap('rain:orta');
    expect(messages()[0]).toContain('yaklaşık 15 mm yağmur kaydedildi');
  });

  it('"Haftalık plan" lists 7 days', async () => {
    await tap('weekly');
    const lines = messages()[0].split('\n');
    expect(lines[0]).toBe('📅 7 günlük plan');
    expect(lines).toHaveLength(8);
  });

  it('answers voice messages with the typing hint', async () => {
    await handleUpdate({ message: { chat, voice: {} } });
    expect(messages()).toEqual(['Şimdilik lütfen yazarak anlatın.']);
  });

  it('web "send alert" reaches the linked chat and the demo chat', async () => {
    const res = await sendAlertEndpoint(new Request('http://x/api/send-alert', { method: 'POST', body: JSON.stringify({ farmId: 'f1' }) }));
    const body = (await res.json()) as { sent: number };
    expect(body.sent).toBe(2);
    const targets = sent.filter((s) => s.method === 'sendMessage').map((s) => s.body.chat_id);
    expect(new Set(targets)).toEqual(new Set(['42', '999']));
  });

  it('cron is protected by CRON_SECRET and stays silent for an unchanged plan', async () => {
    process.env.CRON_SECRET = 's3cret';
    const unauthorized = await sendAlertEndpoint(new Request('http://x/api/send-alert'));
    expect(unauthorized.status).toBe(401);
    sent.length = 0;
    const res = await sendAlertEndpoint(new Request('http://x/api/send-alert', { headers: { authorization: 'Bearer s3cret' } }));
    expect(res.status).toBe(200);
    // same plan as the alert just sent → no "Plan değişti" note
    expect(messages().some((t) => t.startsWith('⚠️ Plan değişti'))).toBe(false);
    delete process.env.CRON_SECRET;
  });

  it('falls back to the demo field for an unknown id', async () => {
    expect((await loadFarm('nope'))).toBeNull();
    expect((await loadFarm('demo'))?.input.crop).toBe('sugar_beet');
  });
});

describe('pilot fields (stage 14)', () => {
  const table = JSON.parse(readFileSync('public/data/fields_2025.json', 'utf8')) as { columns: string[]; rows: unknown[][] };
  const rows = table.rows.map((r) => Object.fromEntries(table.columns.map((c, i) => [c, r[i]]))) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const shapes = JSON.parse(readFileSync('public/data/field_shapes.json', 'utf8')) as Record<string, number[][][]>;
  const pick = (cls: string) => rows.find((r) => r.class === cls && !r.uncertain && r.cal_start >= 0)!;
  const inside = (id: string) => {
    // a point just inside the first ring: midpoint between a vertex and the ring's mean
    const ring = shapes[id][0];
    const mx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const my = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return { longitude: mx, latitude: my };
  };
  const beet = pick('sugar_beet');
  const alfalfa = pick('alfalfa');
  const pilotChat = { id: 77 };

  it('/start without an argument asks for the location', async () => {
    await handleUpdate({ message: { chat: pilotChat, text: '/start' } });
    expect(JSON.stringify(sent[0].body.reply_markup)).toContain('request_location');
  });

  it('a shared location offers the field under it with a satellite photo', async () => {
    await handleUpdate({ message: { chat: pilotChat, location: inside(beet.field_id) } });
    const photo = sent.find((s) => s.method === 'sendPhoto')!;
    expect(String(photo.body.photo)).toContain('World_Imagery/MapServer/export');
    expect(String(photo.body.caption)).toMatch(/^F\d+ – /);
    expect(JSON.stringify(photo.body.reply_markup)).toContain('link:F');
  });

  it('a location outside the pilot fields is refused', async () => {
    await handleUpdate({ message: { chat: pilotChat, location: { latitude: 39.9, longitude: 32.85 } } });
    expect(messages()[0]).toContain('pilot alana ait bir tarla bulamadım');
  });

  it('confirming links the field; "Tarlamın durumu" sends the satellite season summary', async () => {
    await handleUpdate({ callback_query: { id: 'cb', data: `link:${beet.field_id}`, message: { chat: pilotChat } } });
    expect(messages().join('\n')).toContain('bağlandı');
    sent.length = 0;
    await handleUpdate({ callback_query: { id: 'cb', data: 'status', message: { chat: pilotChat } } });
    const text = messages()[0];
    expect(text.split('\n')[0]).toBe(`🌱 ${beet.field_id} – Şeker pancarı tarlası, 2025 sezonu`);
    expect(text).toContain(`yaklaşık ${Math.round(beet.blue_mm).toLocaleString('tr-TR')} mm`);
  });

  it('the engine farm of a pilot field is calibrated from its satellite calendar', async () => {
    const farm = (await loadFarm(`field:${beet.field_id}`))!;
    expect(farm.input.crop).toBe('sugar_beet');
    expect(farm.input.irrigationMethod).toBe('sprinkler');
    expect(farm.assumptions.crops.sugar_beet.stages.mid).toBeGreaterThanOrEqual(10);
    expect(farm.input.areaDecare).toBeCloseTo(beet.area_ha * 10, 0);
  });

  it('crops without engine parameters get the summary but no weekly plan', async () => {
    await handleUpdate({ callback_query: { id: 'cb', data: `link:${alfalfa.field_id}`, message: { chat: pilotChat } } });
    expect(messages().join('\n')).toContain(`${alfalfa.field_id} – Yonca tarlası, 2025 sezonu`);
    sent.length = 0;
    await handleUpdate({ callback_query: { id: 'cb', data: 'weekly', message: { chat: pilotChat } } });
    expect(messages()[0]).toContain('Yonca için haftalık sulama planı hesaplamıyoruz');
  });
});
