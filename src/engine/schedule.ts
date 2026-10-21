// Hourly pump schedule with rotational irrigation: the field is watered parcel by parcel,
// so one irrigation round is spread over the days until the next round, using the sunniest hours.

import { addDays, daysBetween } from './dates';
import { pumpHours } from './pump';
import type { HourlyPv } from './pv';

export interface IrrigationEvent {
  date: string;
  volumeM3: number;
}

export interface ScheduledHour {
  /** Open-Meteo hour label; the slot covers the preceding hour. */
  time: string;
  /** Share of the hour the pump runs (0–1]. */
  fraction: number;
  pvKw: number;
  pumpKwh: number;
  solarKwh: number;
  gridKwh: number;
}

export interface ScheduledIrrigation {
  /** Day the water balance calls for irrigation = first day of the round. */
  date: string;
  /** Last day the round may use (day before the next round, season end or the rotation cap). */
  windowEnd: string;
  volumeM3: number;
  hoursNeeded: number;
  hoursScheduled: number;
  /** Hours that did not fit in the round window: the pump cannot keep up. */
  unscheduledHours: number;
  /** Number of distinct days with pumping. */
  pumpingDays: number;
  hours: ScheduledHour[];
  pumpKwh: number;
  solarKwh: number;
  gridKwh: number;
}

export interface ScheduleResult {
  irrigations: ScheduledIrrigation[];
  totals: {
    pumpKwh: number;
    solarKwh: number;
    gridKwh: number;
    /** PV output not used by the pump – could be fed to the grid. */
    surplusPvKwh: number;
    unscheduledHours: number;
  };
}

export interface ScheduleInput {
  events: IrrigationEvent[];
  pv: HourlyPv[];
  pumpKw: number;
  flowM3h: number;
  /** Longest round in days (assumption). */
  maxRotationDays?: number;
}

/** Default cap for one rotation round (assumption). */
export const DEFAULT_MAX_ROTATION_DAYS = 14;

const EPS = 1e-9;

const MS_PER_HOUR = 3_600_000;
// Local time labels are handled as naive timestamps (no timezone conversion).
const toMs = (time: string) => Date.parse(`${time}:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 16);
/** Day a slot starts on: the 00:00 label covers 23:00–24:00 of the previous day. */
export const slotDate = (time: string) => fromMs(toMs(time) - MS_PER_HOUR).slice(0, 10);

/**
 * Each round runs from its irrigation day up to the day before the next round (also capped by
 * `maxRotationDays` and the last day with PV data). Within that window the pump hours go to the
 * highest-PV hours first (earlier hour on ties), so sunny hours of every day are used before any
 * night hour. Per hour, solar covers min(P_pump, P_pv); the rest is grid/diesel.
 */
export function scheduleIrrigations({
  events,
  pv,
  pumpKw,
  flowM3h,
  maxRotationDays = DEFAULT_MAX_ROTATION_DAYS,
}: ScheduleInput): ScheduleResult {
  const lastPvDate = pv.reduce((max, h) => (slotDate(h.time) > max ? slotDate(h.time) : max), '');
  const used = new Map<string, number>();
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  const irrigations = sorted.map((event, i): ScheduledIrrigation => {
    const ends = [addDays(event.date, Math.max(1, maxRotationDays) - 1)];
    const next = sorted[i + 1];
    if (next) ends.push(addDays(next.date, -1));
    if (lastPvDate) ends.push(lastPvDate);
    const windowEnd = ends.reduce((min, d) => (daysBetween(min, d) < 0 ? d : min));

    const hoursNeeded = pumpHours(event.volumeM3, flowM3h);
    let remaining = hoursNeeded;
    const hours: ScheduledHour[] = [];

    const candidates = pv
      .filter((h) => {
        const date = slotDate(h.time);
        return date >= event.date && date <= windowEnd && (used.get(h.time) ?? 0) < 1 - EPS;
      })
      .sort((a, b) => b.pvKw - a.pvKw || a.time.localeCompare(b.time));

    for (const h of candidates) {
      if (remaining <= EPS) break;
      const free = 1 - (used.get(h.time) ?? 0);
      const fraction = Math.min(free, remaining);
      used.set(h.time, (used.get(h.time) ?? 0) + fraction);
      remaining -= fraction;

      const pumpKwh = pumpKw * fraction;
      const solarKwh = Math.min(pumpKw, h.pvKw) * fraction;
      hours.push({ time: h.time, fraction, pvKw: h.pvKw, pumpKwh, solarKwh, gridKwh: pumpKwh - solarKwh });
    }

    hours.sort((a, b) => a.time.localeCompare(b.time));
    const sum = (pick: (h: ScheduledHour) => number) => hours.reduce((s, h) => s + pick(h), 0);
    const unscheduledHours = Math.max(0, remaining);
    return {
      date: event.date,
      windowEnd,
      volumeM3: event.volumeM3,
      hoursNeeded,
      hoursScheduled: hoursNeeded - unscheduledHours,
      unscheduledHours,
      pumpingDays: new Set(hours.map((h) => h.time.slice(0, 10))).size,
      hours,
      pumpKwh: sum((h) => h.pumpKwh),
      solarKwh: sum((h) => h.solarKwh),
      gridKwh: sum((h) => h.gridKwh),
    };
  });

  const surplusPvKwh = pv.reduce((s, h) => s + h.pvKw - Math.min(pumpKw, h.pvKw) * (used.get(h.time) ?? 0), 0);
  const total = (pick: (i: ScheduledIrrigation) => number) => irrigations.reduce((s, i) => s + pick(i), 0);

  return {
    irrigations,
    totals: {
      pumpKwh: total((i) => i.pumpKwh),
      solarKwh: total((i) => i.solarKwh),
      gridKwh: total((i) => i.gridKwh),
      surplusPvKwh,
      unscheduledHours: total((i) => i.unscheduledHours),
    },
  };
}

export interface TimeRange {
  /** Local wall-clock, YYYY-MM-DDTHH:MM */
  start: string;
  end: string;
  hours: number;
}

/**
 * Merges scheduled slots into contiguous pumping windows. Each slot covers the hour
 * before its label; a partial slot is placed against its neighbour in the window.
 */
export function pumpingWindows(hours: ScheduledHour[]): TimeRange[] {
  const slots = [...hours]
    .map((h) => ({ end: toMs(h.time), start: toMs(h.time) - MS_PER_HOUR, fraction: h.fraction }))
    .sort((a, b) => a.start - b.start);

  const groups: (typeof slots)[] = [];
  for (const s of slots) {
    const last = groups.at(-1);
    if (last && last.at(-1)!.end === s.start) last.push(s);
    else groups.push([s]);
  }

  return groups.map((g) => {
    const first = g[0];
    const last = g.at(-1)!;
    let start = first.start;
    let end = last.end;
    if (g.length === 1) {
      end = start + first.fraction * MS_PER_HOUR;
    } else {
      if (first.fraction < 1) start = first.end - first.fraction * MS_PER_HOUR;
      if (last.fraction < 1) end = last.start + last.fraction * MS_PER_HOUR;
    }
    return { start: fromMs(start), end: fromMs(end), hours: g.reduce((s, x) => s + x.fraction, 0) };
  });
}

export interface DailyPumping {
  date: string;
  windows: TimeRange[];
  hours: number;
}

/**
 * Splits a round into per-day pumping windows for display. A slot belongs to the day it
 * starts on, so the 00:00 label (23:00–24:00 of the previous day) goes to the previous day.
 */
export function dailyPumping(hours: ScheduledHour[]): DailyPumping[] {
  const byDate = new Map<string, ScheduledHour[]>();
  for (const h of hours) {
    const date = slotDate(h.time);
    byDate.set(date, [...(byDate.get(date) ?? []), h]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, windows: pumpingWindows(list), hours: list.reduce((s, h) => s + h.fraction, 0) }));
}

/** "10:00–15:30" for a window on `date`; a window ending at the following midnight ends at "24:00". */
export function formatWindow(w: TimeRange, date: string): string {
  const clock = (time: string, isEnd: boolean) => {
    if (time.slice(0, 10) === date) return time.slice(11, 16);
    if (isEnd && time.slice(11, 16) === '00:00' && time.slice(0, 10) === addDays(date, 1)) return '24:00';
    return `${time.slice(8, 10)}.${time.slice(5, 7)} ${time.slice(11, 16)}`;
  };
  return `${clock(w.start, false)}–${clock(w.end, true)}`;
}
