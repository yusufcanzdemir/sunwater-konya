// Display-ready numbers for the season player and the solar–pump day chart.
// Derived only from a SeasonAnalysis; nothing here changes the model.

import type { SeasonAnalysis } from './plan';
import { slotDate } from './schedule';

/** Soil water store fill: 1 − Dr / TAW (1 = field capacity). */
export function soilFill(depletionMm: number, tawMm: number): number {
  return tawMm > 0 ? Math.min(1, Math.max(0, 1 - depletionMm / tawMm)) : 0;
}

export interface SeasonFrame {
  date: string;
  /** End-of-day fill (after irrigation). */
  fill: number;
  /** Fill before that day's irrigation – shows how low the store got. */
  fillBeforeIrrigation: number;
  rain: boolean;
  irrigated: boolean;
  precipitationMm: number;
  netIrrigationMm: number;
  baselineM3: number;
  modelM3: number;
}

export interface SeasonFrames {
  frames: SeasonFrame[];
  /** Fill level at which irrigation is triggered: 1 − RAW / TAW. */
  rawFill: number;
}

export function seasonFrames(a: SeasonAnalysis): SeasonFrames {
  const { tawMm, rawMm, days } = a.balance;
  return {
    rawFill: soilFill(rawMm, tawMm),
    frames: days.map((d, i) => ({
      date: d.date,
      fill: soilFill(d.depletionMm, tawMm),
      fillBeforeIrrigation: soilFill(d.depletionBeforeIrrigationMm, tawMm),
      rain: d.peff > 0,
      irrigated: d.irrigated,
      precipitationMm: d.precipitation,
      netIrrigationMm: d.netMm,
      baselineM3: a.baseline.cumulative[i]?.volumeM3 ?? 0,
      modelM3: a.modelCumulative[i]?.volumeM3 ?? 0,
    })),
  };
}

export interface HourEnergy {
  /** Slot start, HH:00 local. */
  hour: string;
  pvKw: number;
  /** Average pump draw over the slot (pump kW × share of the hour it runs). */
  pumpKw: number;
  solarKw: number;
  gridKw: number;
  /** PV not used by the pump – could be fed to the grid. */
  surplusKw: number;
}

export interface DayEnergy {
  date: string;
  hours: HourEnergy[];
  pumpHours: number;
  /** Pumping hours fully covered by PV. */
  solarOnlyPumpHours: number;
  solarKwh: number;
  gridKwh: number;
  surplusKwh: number;
}

const EPS = 1e-9;

/** Hour-by-hour energy picture of one day (slots that start on `date`). */
export function dayEnergy(a: SeasonAnalysis, date: string): DayEnergy {
  const pumping = new Map<string, number>();
  for (const irr of a.schedule.irrigations) for (const h of irr.hours) pumping.set(h.time, (pumping.get(h.time) ?? 0) + h.fraction);

  const hours = a.pv
    .filter((h) => slotDate(h.time) === date)
    .map((h): HourEnergy & { fraction: number } => {
      const fraction = pumping.get(h.time) ?? 0;
      const solarKw = Math.min(a.pumpKw, h.pvKw) * fraction;
      const pumpKw = a.pumpKw * fraction;
      const start = (Number(h.time.slice(11, 13)) + 23) % 24;
      return {
        hour: `${String(start).padStart(2, '0')}:00`,
        pvKw: h.pvKw,
        pumpKw,
        solarKw,
        gridKw: pumpKw - solarKw,
        surplusKw: h.pvKw - solarKw,
        fraction,
      };
    })
    .sort((x, y) => x.hour.localeCompare(y.hour));

  const sum = (pick: (h: (typeof hours)[number]) => number) => hours.reduce((s, h) => s + pick(h), 0);
  return {
    date,
    hours: hours.map(({ fraction: _fraction, ...h }) => h),
    pumpHours: sum((h) => h.fraction),
    solarOnlyPumpHours: sum((h) => (h.fraction > 0 && h.pvKw + EPS >= a.pumpKw ? h.fraction : 0)),
    solarKwh: sum((h) => h.solarKw),
    gridKwh: sum((h) => h.gridKw),
    surplusKwh: sum((h) => h.surplusKw),
  };
}

/**
 * The pumping day with the highest solar share of pump energy (more solar kWh on ties) –
 * the clearest real example of pumping placed on sunny hours.
 */
export function bestSolarDay(a: SeasonAnalysis): string | null {
  let best: { date: string; share: number; solarKwh: number } | null = null;
  for (const date of pumpingDates(a)) {
    const { solarKwh, gridKwh } = dayEnergy(a, date);
    const total = solarKwh + gridKwh;
    if (total <= EPS) continue;
    const share = solarKwh / total;
    if (!best || share > best.share + EPS || (Math.abs(share - best.share) <= EPS && solarKwh > best.solarKwh)) {
      best = { date, share, solarKwh };
    }
  }
  return best?.date ?? null;
}

/** Days on which the pump runs, in date order. */
export function pumpingDates(a: SeasonAnalysis): string[] {
  const dates = new Set<string>();
  for (const irr of a.schedule.irrigations) for (const h of irr.hours) dates.add(slotDate(h.time));
  return [...dates].sort();
}
