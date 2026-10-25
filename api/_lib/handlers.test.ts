import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const { explainPlan, parseFarm, parseQuery } = await import('./handlers');

type Json = Record<string, unknown>;
const body = async (r: Response) => (await r.json()) as Json;

const post = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) });

const payload = {
  bu_hafta: { sezon_disi: true, sulama_turlari: [] },
  gecmis_sezon: null,
  uyarilar: [],
};

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  generateContent.mockReset();
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe('parseFarm', () => {
  it('returns sanitised structured output', async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ crop: 'sugar_beet', area_decare: 100, irrigation_method: 'pivot' }) });
    const res = await parseFarm(post({ text: '100 dönüm pancar' }));
    const result = await body(res);
    expect(res.status).toBe(200);
    expect(result).toMatchObject({ crop: 'sugar_beet', area_decare: 100, irrigation_method: null });
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBe('application/json');
  });

  it('falls back to the second model when the first is overloaded', async () => {
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error('high demand'), { status: 503 }))
      .mockResolvedValueOnce({ text: JSON.stringify({ crop: 'maize' }) });
    const res = await parseFarm(post({ text: 'mısır' }));
    expect(res.status).toBe(200);
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash']);
  });

  it('gives up after the last fallback model', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('high demand'), { status: 503 }));
    expect((await parseFarm(post({ text: 'mısır' }))).status).toBe(502);
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
    ]);
  });

  it('gives every call a time limit and treats a timeout like an overload', async () => {
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce({ text: JSON.stringify({ crop: 'wheat' }) });
    const res = await parseFarm(post({ text: 'buğday' }));
    expect(res.status).toBe(200);
    expect(generateContent.mock.calls[0][0].config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(generateContent.mock.calls[1][0].model).toBe('gemini-3.6-flash');
  });

  it('does not switch models on other errors', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));
    expect((await parseFarm(post({ text: 'mısır' }))).status).toBe(502);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('rejects empty text and reports a missing key', async () => {
    expect((await parseFarm(post({ text: '  ' }))).status).toBe(400);
    delete process.env.GEMINI_API_KEY;
    expect((await parseFarm(post({ text: 'pancar' }))).status).toBe(503);
  });
});

describe('explainPlan', () => {
  it('returns the model text when every number is from the payload', async () => {
    generateContent.mockResolvedValue({ text: 'Şu an sulama sezonu dışındasınız. Yeraltı suyunu korursunuz.' });
    const result = await body(await explainPlan(post(payload)));
    expect(result.source).toBe('gemini');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('retries once on invented numbers, then falls back to the template', async () => {
    generateContent.mockResolvedValue({ text: 'Bu hafta 12 saat sulayın.' });
    const result = await body(await explainPlan(post(payload)));
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].contents).toContain('12');
    expect(result.source).toBe('template');
  });

  it('accepts a corrected second answer', async () => {
    generateContent
      .mockResolvedValueOnce({ text: 'Bu hafta 12 saat sulayın.' })
      .mockResolvedValueOnce({ text: 'Bu hafta sulama gerekmiyor.' });
    const result = await body(await explainPlan(post(payload)));
    expect(result).toEqual({ text: 'Bu hafta sulama gerekmiyor.', source: 'gemini' });
  });

  it('uses the template without an API key or on errors', async () => {
    delete process.env.GEMINI_API_KEY;
    expect((await body(await explainPlan(post(payload)))).source).toBe('template');
    process.env.GEMINI_API_KEY = 'k';
    generateContent.mockRejectedValue(new Error('quota'));
    expect((await body(await explainPlan(post(payload)))).source).toBe('template');
  });
});

describe('parseQuery', () => {
  it('returns the sanitised query and the note', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ classes: ['sugar_beet', 'banana'], statuses: ['over'], region: 'ereğli', sort_by: 'excess_m3', limit: 20, note: 'Ereğli pilot alan dışında.' }),
    });
    const res = await parseQuery(post({ text: 'Ereğli tarafında bütçesini en çok aşan 20 pancar tarlası' }));
    const result = await body(res);
    expect(res.status).toBe(200);
    expect(result.query).toMatchObject({ classes: ['sugar_beet'], statuses: ['over'], region: null, sort_by: 'excess_m3', limit: 20 });
    expect(result.note).toBe('Ereğli pilot alan dışında.');
  });

  it('rejects empty and too long text without calling the model', async () => {
    expect((await parseQuery(post({ text: '  ' }))).status).toBe(400);
    expect((await parseQuery(post({ text: 'x'.repeat(301) }))).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('503 without an API key', async () => {
    delete process.env.GEMINI_API_KEY;
    expect((await parseQuery(post({ text: 'pancar' }))).status).toBe(503);
  });
});
