// Totals of a season analysis over a date window (e.g. "this week").

import { daysBetween } from './dates.js';
import type { SeasonAnalysis } from './plan.js';
import { slotDate } from './schedule.js';

export interface WindowSummary {
  days: number;
  modelM3: number;
  baselineM3: number;
  pumpKwh: number;
  solarKwh: number;
}

const inWindow = (date: string, start: string, end: string) => daysBetween(start, date) >= 0 && daysBetween(date, end) >= 0;

export function windowSummary(a: SeasonAnalysis, start: string, end: string): WindowSummary {
  let modelM3 = 0;
  let baselineM3 = 0;
  let days = 0;
  a.balance.days.forEach((d, i) => {
    if (!inWindow(d.date, start, end)) return;
    days += 1;
    modelM3 += d.volumeM3;
    const cum = a.baseline.cumulative;
    baselineM3 += (cum[i]?.volumeM3 ?? 0) - (i > 0 ? (cum[i - 1]?.volumeM3 ?? 0) : 0);
  });

  let pumpKwh = 0;
  let solarKwh = 0;
  for (const irr of a.schedule.irrigations) {
    for (const h of irr.hours) {
      if (!inWindow(slotDate(h.time), start, end)) continue;
      pumpKwh += h.pumpKwh;
      solarKwh += h.solarKwh;
    }
  }
  return { days, modelM3, baselineM3, pumpKwh, solarKwh };
}
