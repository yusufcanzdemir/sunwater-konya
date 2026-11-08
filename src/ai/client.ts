// Browser calls to the serverless functions. Failures become messages in the page language or the template text.

import { templateExplanation, type ExplainPayload } from './explain';
import { sanitizeParsedFarm, type ParsedFarm } from './parseFarm';
import { sanitizeQuery, type FieldQuery } from '../panel/query';
import { lang, t } from '../i18n';

async function post(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(t('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.', 'Could not reach the server. Check your internet connection.'));
  }
}

export async function requestParseFarm(text: string): Promise<ParsedFarm> {
  const res = await post('/api/parse-farm', { text });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? 'Metin şu an yorumlanamadı. Formu elle doldurabilirsiniz.');
  return sanitizeParsedFarm(body);
}

export interface Explanation {
  text: string;
  source: 'gemini' | 'template';
}

export async function requestExplanation(payload: ExplainPayload): Promise<Explanation> {
  try {
    const res = await post('/api/explain-plan', payload);
    const body = (await res.json()) as Partial<Explanation>;
    if (res.ok && typeof body.text === 'string') {
      return { text: body.text, source: body.source === 'gemini' ? 'gemini' : 'template' };
    }
  } catch {
    // fall through to the template
  }
  return { text: templateExplanation(payload), source: 'template' };
}

export async function requestParseQuery(text: string): Promise<{ query: FieldQuery; note: string }> {
  const res = await post('/api/parse-query', { text });
  const body = (await res.json().catch(() => null)) as { error?: string; query?: unknown; note?: unknown } | null;
  if (!res.ok || !body) {
    // Server messages are Turkish
    throw new Error((lang === 'tr' && body?.error) || t('Sorgu şu an yorumlanamadı. Filtreleri elle seçebilirsiniz.', 'The query could not be read right now. You can pick the filters by hand.'));
  }
  return { query: sanitizeQuery(body.query), note: typeof body.note === 'string' ? body.note : '' };
}
