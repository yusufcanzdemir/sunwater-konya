// Telegram alert content: the engine-only payload, a 5-line template and plan-change detection.
// Pure – shared by the serverless functions and tests.

import { addDays } from '../engine/dates.js';
import { computeImpact, type EnergySource } from '../engine/impact.js';
import type { SeasonAnalysis } from '../engine/plan.js';
import { dailyPumping, formatWindow } from '../engine/schedule.js';
import { windowSummary } from '../engine/window.js';
import { dayName } from './explain.js';

export interface TelegramPayload {
  tarla: string;
  sezon_disi: boolean;
  /** Next pumping day from today on. */
  siradaki_sulama: { gun: string; saatler: string; saat: number } | null;
  /** First rainy day this week (effective rain > 0). */
  yagis: { gun: string; mm: number } | null;
  gunes_payi_yuzde: number | null;
  hafta_tasarruf: { su_m3: number; kwh: number } | null;
  verim_riski: boolean;
  /** Only out of season: what last season's retrospective showed. */
  gecmis_sezon_tasarruf: { su_m3: number; kwh: number } | null;
}

const round = (n: number, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;

export function relativeDay(date: string, today: string): string {
  if (date === today) return 'Bugün';
  if (date === addDays(today, 1)) return 'Yarın';
  return dayName(date);
}

export interface TelegramInput {
  place: string;
  cropName: string;
  /** Forecast analysis (may start a few days before today). */
  week: SeasonAnalysis | null;
  retro: SeasonAnalysis | null;
  today: string;
  farm: {
    wellHeadM: number;
    pumpEfficiency: number;
    energySource: EnergySource;
    electricityPriceTlKwh: number | null;
    dieselPriceTlL: number | null;
  };
}

/** First day from `today` on with pumping. */
export function nextPumpingDay(week: SeasonAnalysis, today: string) {
  return week.schedule.irrigations
    .flatMap((irr) => dailyPumping(irr.hours))
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function buildTelegramPayload({ place, cropName, week, retro, today, farm }: TelegramInput): TelegramPayload {
  const weekEnd = addDays(today, 6);
  const inSeason = week != null && week.balance.days.some((d) => d.date >= today);

  let siradaki_sulama: TelegramPayload['siradaki_sulama'] = null;
  let yagis: TelegramPayload['yagis'] = null;
  let gunes_payi_yuzde: number | null = null;
  let hafta_tasarruf: TelegramPayload['hafta_tasarruf'] = null;
  let verim_riski = false;

  if (week && inSeason) {
    const nextDay = nextPumpingDay(week, today);
    if (nextDay && nextDay.date <= weekEnd) {
      siradaki_sulama = {
        gun: relativeDay(nextDay.date, today),
        saatler: nextDay.windows.map((w) => formatWindow(w, nextDay.date)).join(', '),
        saat: round(nextDay.hours, 1),
      };
    }

    const rainy = week.balance.days.find((d) => d.date >= today && d.date <= weekEnd && d.peff > 0);
    if (rainy) yagis = { gun: relativeDay(rainy.date, today), mm: round(rainy.precipitation) };

    const w = windowSummary(week, today, weekEnd);
    if (farm.energySource === 'solar_grid' && w.pumpKwh > 0) gunes_payi_yuzde = round((w.solarKwh / w.pumpKwh) * 100);
    const impact = computeImpact({
      headM: farm.wellHeadM,
      pumpEfficiency: farm.pumpEfficiency,
      energySource: farm.energySource,
      electricityPriceTlKwh: farm.electricityPriceTlKwh,
      dieselPriceTlL: farm.dieselPriceTlL,
      baselineVolumeM3: w.baselineM3,
      modelVolumeM3: w.modelM3,
    });
    verim_riski = impact.underIrrigation;
    if (impact.savings) hafta_tasarruf = { su_m3: round(impact.savings.waterM3.mid), kwh: round(impact.savings.energyKwh.mid) };
  }

  const r = retro?.impact.savings;
  return {
    tarla: `${place} – ${cropName}`,
    sezon_disi: !inSeason,
    siradaki_sulama,
    yagis,
    gunes_payi_yuzde,
    hafta_tasarruf,
    verim_riski,
    gecmis_sezon_tasarruf: !inSeason && r ? { su_m3: round(r.waterM3.mid), kwh: round(r.energyKwh.mid) } : null,
  };
}

const tr = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/** At most 5 short lines, each starting with one emoji. */
export function templateTelegram(p: TelegramPayload): string {
  const lines = [`🌱 ${p.tarla} tarlası`];
  if (p.sezon_disi) {
    lines.push('🍂 Sulama sezonu dışındasınız, bu hafta sulama yok.');
    if (p.gecmis_sezon_tasarruf) {
      lines.push(
        `📉 Geçen sezon bu plan yaklaşık ${tr(p.gecmis_sezon_tasarruf.su_m3)} m³ su ve ${tr(p.gecmis_sezon_tasarruf.kwh)} kWh tasarruf sağlardı.`,
      );
    }
  } else {
    lines.push(
      p.siradaki_sulama
        ? `💧 ${p.siradaki_sulama.gun} ${p.siradaki_sulama.saatler} arası ${tr(p.siradaki_sulama.saat)} saat sulayın.`
        : '💧 Bu hafta sulama gerekmiyor.',
    );
    if (p.yagis) lines.push(`🌧 ${p.yagis.gun} yağmur bekleniyor (yaklaşık ${tr(p.yagis.mm)} mm), plan buna göre ayarlandı.`);
    if (p.gunes_payi_yuzde != null) lines.push(`☀️ Bu hafta pompa enerjisinde güneş payı: %${tr(p.gunes_payi_yuzde)}.`);
    if (p.hafta_tasarruf) {
      lines.push(`📉 Bu hafta tahmini ${tr(p.hafta_tasarruf.su_m3)} m³ su ve ${tr(p.hafta_tasarruf.kwh)} kWh tasarruf.`);
    } else if (p.verim_riski) {
      lines.push('⚠️ Mevcut sulamanız ihtiyacın altında, verim riski var.');
    }
  }
  return lines.slice(0, 5).join('\n');
}

/**
 * What the farmer should do next, by calendar date (not "Yarın"), so the same plan seen on
 * two mornings keeps the same signature.
 */
export function planSignature(week: SeasonAnalysis | null, today: string): string {
  const next = week && nextPumpingDay(week, today);
  if (!next || next.date > addDays(today, 6)) return 'none';
  return `${next.date}|${next.windows.map((w) => formatWindow(w, next.date)).join(',')}`;
}

export function planChangeNote(previousSignature: string | null, signature: string, current: TelegramPayload): string | null {
  if (previousSignature == null || current.sezon_disi || previousSignature === signature) return null;
  const was = previousSignature !== 'none';
  const now = current.siradaki_sulama;
  if (was && !now) {
    return current.yagis
      ? `⚠️ Plan değişti: sulamayın, ${current.yagis.gun.toLocaleLowerCase('tr-TR')} yağmur bekleniyor.`
      : '⚠️ Plan değişti: bu hafta sulama gerekmiyor.';
  }
  if (now) return `⚠️ Plan değişti: yeni sulama ${now.gun.toLocaleLowerCase('tr-TR')} ${now.saatler} arası.`;
  return null;
}
