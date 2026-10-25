// The farmer app's "this week" card for a pilot field: the FAO-56 engine with the field's satellite
// crop calendar and the 16-day forecast, cut to the next 7 days. Pure apart from the forecast input.

import type { WeatherSeries } from '../data/openMeteo.js';
import { addDays } from '../engine/dates.js';
import { analyzeSeason } from '../engine/plan.js';
import { dailyPumping, formatWindow } from '../engine/schedule.js';
import { windowSummary } from '../engine/window.js';
import { modelSettings } from '../state/assumptions.js';
import { toFarmParams } from '../state/farm.js';
import { pilotEngineFarm, type PilotField } from './pilot.js';

const SHORT_DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const LONG_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

export interface WeekDay {
  date: string;
  short: string;
  /** "Bugün", "Yarın" or the weekday name. */
  label: string;
  windows: string[];
  hours: number;
  rainMm: number;
}

export type WeekView =
  | { kind: 'plan'; days: WeekDay[]; next: WeekDay | null; waterM3: number; solarShare: number | null }
  | { kind: 'off_season' };

/** Past days fetched with the forecast so the soil water balance starts a week before today (same as the bot). */
export const PAST_DAYS = 7;

export type PilotManifest = { season_start_mmdd: string; kcb_max: Record<string, number> };

export function buildWeek(f: PilotField, manifest: PilotManifest, forecast: WeatherSeries, today: string): WeekView | null {
  const farm = pilotEngineFarm(f, manifest, Number(today.slice(0, 4)));
  if (!farm) return null;
  const { input, assumptions: a } = farm;
  const week = analyzeSeason(forecast, input.plantingDate, toFarmParams(input, a), modelSettings(a, a.forecastInitialDepletionMm));
  if (!week.balance.days.some((d) => d.date >= today)) return { kind: 'off_season' };

  const end = addDays(today, 6);
  const pumping = new Map(week.schedule.irrigations.flatMap((irr) => dailyPumping(irr.hours)).map((d) => [d.date, d]));
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const p = pumping.get(date);
    const rain = week.balance.days.find((d) => d.date === date)?.peff ?? 0;
    return {
      date,
      short: SHORT_DAYS[weekday(date)],
      label: i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : LONG_DAYS[weekday(date)],
      windows: p ? p.windows.map((w) => formatWindow(w, date)) : [],
      hours: p?.hours ?? 0,
      rainMm: rain,
    };
  });
  const w = windowSummary(week, today, end);
  return {
    kind: 'plan',
    days,
    next: days.find((d) => d.hours > 0) ?? null,
    waterM3: w.modelM3,
    solarShare: w.pumpKwh > 0 ? w.solarKwh / w.pumpKwh : null,
  };
}
