// The farmer app's "this week" card for a pilot field: the FAO-56 engine with the field's satellite
// crop calendar and the 16-day forecast, cut to the next 7 days. Pure apart from the forecast input.

import { parseWeatherResponse, type WeatherSeries } from '../data/openMeteo.js';
import { addDays } from '../engine/dates.js';
import { analyzeSeason } from '../engine/plan.js';
import { dailyPumping, formatWindow } from '../engine/schedule.js';
import { windowSummary } from '../engine/window.js';
import { t } from '../i18n.js';
import { modelSettings } from '../state/assumptions.js';
import { toFarmParams, type FarmForm } from '../state/farm.js';
import { pilotEngineFarm, type PilotField } from './pilot.js';

const SHORT_DAYS = t('Paz Pzt Sal Çar Per Cum Cmt', 'Sun Mon Tue Wed Thu Fri Sat').split(' ');
const LONG_DAYS = t('Pazar Pazartesi Salı Çarşamba Perşembe Cuma Cumartesi', 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday').split(' ');

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

export interface WeekDay {
  date: string;
  short: string;
  /** "Bugün" / "Today", "Yarın" / "Tomorrow" or the weekday name. */
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

/**
 * Demo week for the off season: the middle of the field's satellite crop calendar in `season`, when the
 * crop needs the most water. Its plan is run on that week's archived weather.
 */
export function demoDay(f: PilotField, manifest: PilotManifest, season: number): string {
  const start = `${season}-${manifest.season_start_mmdd}`;
  return addDays(start, Math.round((f.cal_mid_start + f.cal_mid_end) / 2));
}

/** One point of public/data/demo_weather_<season>.json (an Open-Meteo archive response, multi-location). */
export interface DemoWeatherPoint {
  latitude: number;
  longitude: number;
  daily: { time: string[]; et0_fao_evapotranspiration: (number | null)[]; precipitation_sum: (number | null)[] };
  hourly: { time: string[]; global_tilted_irradiance: (number | null)[] };
}

/** The demo week's weather from the bundled archive: the nearest point, days `from`–`to` (inclusive). */
export function demoWeather(points: DemoWeatherPoint[], lat: number, lon: number, from: string, to: string): WeatherSeries {
  const cos = Math.cos((lat * Math.PI) / 180);
  const dist = (p: DemoWeatherPoint) => ((p.longitude - lon) * cos) ** 2 + (p.latitude - lat) ** 2;
  const p = points.reduce((best, q) => (dist(q) < dist(best) ? q : best));
  const days = p.daily.time.flatMap((d, i) => (d >= from && d <= to ? [i] : []));
  const hours = p.hourly.time.flatMap((t, i) => (t.slice(0, 10) >= from && t.slice(0, 10) <= to ? [i] : []));
  return parseWeatherResponse(
    {
      latitude: p.latitude,
      longitude: p.longitude,
      daily: {
        time: days.map((i) => p.daily.time[i]),
        et0_fao_evapotranspiration: days.map((i) => p.daily.et0_fao_evapotranspiration[i]),
        precipitation_sum: days.map((i) => p.daily.precipitation_sum[i]),
      },
      hourly: { time: hours.map((i) => p.hourly.time[i]), global_tilted_irradiance: hours.map((i) => p.hourly.global_tilted_irradiance[i]) },
    },
    'global_tilted_irradiance',
  );
}

/** `relative`: "Bugün" / "Yarın" for the first two days; off for a demo week in the past. */
export function buildWeek(
  f: PilotField,
  manifest: PilotManifest,
  forecast: WeatherSeries,
  today: string,
  relative = true,
  profile?: Partial<FarmForm>,
): WeekView | null {
  const farm = pilotEngineFarm(f, manifest, Number(today.slice(0, 4)), profile);
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
      label: relative && i === 0 ? t('Bugün', 'Today') : relative && i === 1 ? t('Yarın', 'Tomorrow') : LONG_DAYS[weekday(date)],
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
