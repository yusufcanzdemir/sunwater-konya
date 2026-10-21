// Input for /api/explain-plan, the number check on the model's answer, and the template fallback.
// Every number here comes from the engine; the model may only repeat them.

import type { SeasonAnalysis } from '../engine/plan.js';
import { dailyPumping, formatWindow } from '../engine/schedule.js';

export interface ExplainRoundDay {
  gun: string;
  saatler: string;
  saat: number;
}

export interface ExplainRound {
  baslangic: string;
  bitis: string;
  toplam_saat: number;
  su_m3: number;
  ilk_gunler: ExplainRoundDay[];
}

export interface ExplainPayload {
  bu_hafta: { sezon_disi: boolean; sulama_turlari: ExplainRound[] };
  gecmis_sezon: {
    donem: string;
    mevcut_sulama_su_m3: number;
    plan_su_m3: number;
    verim_riski: boolean;
    tasarruf: {
      su_m3_yaklasik: number;
      su_m3_alt: number;
      su_m3_ust: number;
      yuzde: number;
      tl_alt: number | null;
      tl_ust: number | null;
    } | null;
    gunes_payi_yuzde: number | null;
  } | null;
  uyarilar: string[];
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** "21 Ekim Salı" – words instead of 21.10 so the number check stays unambiguous. */
export function dayName(iso: string, withWeekday = true): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withWeekday ? `${base} ${WEEKDAYS[d.getUTCDay()]}` : base;
}

const round = (n: number, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;

export function buildExplainPayload(
  week: SeasonAnalysis | null,
  retro: SeasonAnalysis | null,
  energyIsSolar: boolean,
): ExplainPayload {
  const uyarilar: string[] = [];

  const sulama_turlari: ExplainRound[] = (week?.schedule.irrigations ?? []).map((irr) => ({
    baslangic: dayName(irr.date),
    bitis: dayName(irr.windowEnd),
    toplam_saat: round(irr.hoursScheduled, 1),
    su_m3: round(irr.volumeM3),
    ilk_gunler: dailyPumping(irr.hours)
      .slice(0, 3)
      .map((d) => ({
        gun: dayName(d.date),
        saatler: d.windows.map((w) => formatWindow(w, d.date)).join(', '),
        saat: round(d.hours, 1),
      })),
  }));

  let gecmis_sezon: ExplainPayload['gecmis_sezon'] = null;
  if (retro && retro.balance.days.length > 0) {
    const s = retro.impact.savings;
    const t = retro.schedule.totals;
    gecmis_sezon = {
      donem: `${dayName(retro.balance.days[0].date, false)} – ${dayName(retro.balance.days.at(-1)!.date, false)}`,
      mevcut_sulama_su_m3: round(retro.baseline.volumeM3),
      plan_su_m3: round(retro.balance.totals.volumeM3),
      verim_riski: retro.impact.underIrrigation,
      tasarruf: s && {
        su_m3_yaklasik: round(s.waterM3.mid),
        su_m3_alt: round(s.waterM3.low),
        su_m3_ust: round(s.waterM3.high),
        yuzde: round(s.waterPercent),
        tl_alt: s.costTl && round(s.costTl.low),
        tl_ust: s.costTl && round(s.costTl.high),
      },
      gunes_payi_yuzde: energyIsSolar && t.pumpKwh > 0 ? round((t.solarKwh / t.pumpKwh) * 100) : null,
    };
    if (t.unscheduledHours > 0) uyarilar.push('Yaz aylarında kuyu debisi ihtiyaca tam yetişmiyor.');
    if (retro.impact.underIrrigation) uyarilar.push('Mevcut sulama bitkinin ihtiyacının altında, verim kaybı riski var.');
  }

  return { bu_hafta: { sezon_disi: !week || week.balance.days.length === 0, sulama_turlari }, gecmis_sezon, uyarilar };
}

// --- Number check -------------------------------------------------------------------------

const NUMBER_TOKEN = /\d+(?:[.,]\d+)*/g;

/** Possible readings of a written number: Turkish/English decimal, or separators as thousands. */
function readings(token: string): number[] {
  const out = new Set<number>([Number(token.replace(/[.,]/g, ''))]);
  const seps = token.match(/[.,]/g) ?? [];
  if (seps.length === 1) out.add(Number(token.replace(',', '.')));
  if (seps.length > 1) {
    // 1.234,5 or 1,234.5
    const last = Math.max(token.lastIndexOf('.'), token.lastIndexOf(','));
    out.add(Number(`${token.slice(0, last).replace(/[.,]/g, '')}.${token.slice(last + 1)}`));
  }
  return [...out].filter(Number.isFinite);
}

const key = (n: number) => n.toFixed(4);

function allowedNumbers(payload: unknown): Set<string> {
  const allowed = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === 'number') {
      allowed.add(key(v));
      for (let d = 0; d <= 2; d++) {
        const text = v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
        for (const t of text.match(NUMBER_TOKEN) ?? []) readings(t).forEach((r) => allowed.add(key(r)));
      }
    } else if (typeof v === 'string') {
      for (const t of v.match(NUMBER_TOKEN) ?? []) readings(t).forEach((r) => allowed.add(key(r)));
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(visit);
    }
  };
  visit(payload);
  return allowed;
}

/** Numbers in `text` that do not appear in the payload. Empty = the text passes. */
export function unknownNumbers(text: string, payload: unknown): string[] {
  const allowed = allowedNumbers(payload);
  return (text.match(NUMBER_TOKEN) ?? []).filter((t) => !readings(t).some((r) => allowed.has(key(r))));
}

const TECHNICAL_TERMS = /\b(ET0|ETc|ET₀|Kc|FAO)\b/i;

// Numbers written as words would slip past the digit check. "bir" is left out: it is also the article "a".
const NUMBER_WORDS =
  /(?<![\p{L}])(iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|virgül)(?![\p{L}])/iu;

// Anything outside Latin script (plus digits, punctuation, symbols) means a garbled answer.
const FOREIGN_SCRIPT = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

export function checkExplanation(text: string, payload: unknown): { ok: boolean; unknown: string[] } {
  const unknown = unknownNumbers(text, payload);
  const words = text.match(new RegExp(NUMBER_WORDS, 'giu')) ?? [];
  const foreign = text.match(new RegExp(FOREIGN_SCRIPT, 'gu')) ?? [];
  const problems = [...unknown, ...words, ...foreign];
  return {
    ok: text.trim() !== '' && problems.length === 0 && !TECHNICAL_TERMS.test(text),
    unknown: problems,
  };
}

// --- Template fallback -----------------------------------------------------------------

const tr = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export function templateExplanation(p: ExplainPayload): string {
  const sentences: string[] = [];

  const first = p.bu_hafta.sulama_turlari[0];
  if (p.bu_hafta.sezon_disi) {
    sentences.push('Şu an sulama sezonu dışındasınız, bu hafta sulama yapmanız gerekmiyor.');
  } else if (!first) {
    sentences.push('Önümüzdeki günlerde toprakta yeterli su var, sulama yapmanız gerekmiyor.');
  } else {
    const day = first.ilk_gunler[0];
    sentences.push(
      `Bu hafta ${first.baslangic} günü sulamaya başlayın${day ? `, pompayı ${day.saatler} arasında çalıştırın` : ''}.`,
      `Tarlayı parsel parsel sulayın, bu tur toplam ${tr(first.toplam_saat)} saat sürer ve ${first.bitis} gününe kadar tamamlanır.`,
    );
  }

  const g = p.gecmis_sezon;
  if (g?.tasarruf) {
    const tl = g.tasarruf.tl_alt != null && g.tasarruf.tl_ust != null ? ` ve ${tr(g.tasarruf.tl_alt)}–${tr(g.tasarruf.tl_ust)} TL` : '';
    sentences.push(
      `Geçen sezonun gerçek hava verisine göre bu plan, bugünkü sulamanıza göre yaklaşık ${tr(g.tasarruf.su_m3_yaklasik)} m³ (%${tr(g.tasarruf.yuzde)}) daha az su${tl} tasarruf sağlardı.`,
    );
  } else if (g?.verim_riski) {
    sentences.push('Geçen sezon bugünkü sulamanız bitkinin ihtiyacının altında kalmış, bu da verim kaybı riski demek.');
  }
  if (g?.gunes_payi_yuzde != null) {
    sentences.push(`Pompanın kullandığı elektriğin yaklaşık %${tr(g.gunes_payi_yuzde)}'i güneş panellerinizden gelir.`);
  }

  sentences.push('Kuyudan gereğinden fazla su çekmemek, yeraltı suyunu korur ve Konya Ovası’nda obruk riskini azaltmaya katkı sağlar.');
  return sentences.slice(0, 6).join(' ');
}
