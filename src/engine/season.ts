// Which calendar window to fetch weather for.

import { seasonLength, type CropParams } from './crops';
import { addDays, addYears, daysBetween } from './dates';

export interface DateWindow {
  start: string;
  end: string;
}

export function seasonWindow(plantingDate: string, crop: CropParams): DateWindow {
  return { start: plantingDate, end: addDays(plantingDate, seasonLength(crop) - 1) };
}

/** Open-Meteo archive data trails today by a few days (assumption). */
export const ARCHIVE_LAG_DAYS = 5;

export interface ArchiveWindow extends DateWindow {
  /** The planting date actually used (may be moved back to a completed season). */
  plantingDate: string;
  shiftedYears: number;
}

/**
 * Most recent complete season for a retrospective run: the given planting date if its
 * whole season is already in the archive, otherwise the same date in earlier years.
 */
export function archiveSeasonWindow(
  plantingDate: string,
  crop: CropParams,
  today: string,
  lagDays: number = ARCHIVE_LAG_DAYS,
): ArchiveWindow {
  const lastAvailable = addDays(today, -lagDays);
  let shiftedYears = 0;
  let start = plantingDate;
  while (daysBetween(seasonWindow(start, crop).end, lastAvailable) < 0) {
    shiftedYears -= 1;
    start = addYears(plantingDate, shiftedYears);
  }
  return { ...seasonWindow(start, crop), plantingDate: start, shiftedYears };
}

/** Overlap of two windows, or null when they do not meet. */
export function intersectWindows(a: DateWindow, b: DateWindow): DateWindow | null {
  const start = daysBetween(a.start, b.start) > 0 ? b.start : a.start;
  const end = daysBetween(a.end, b.end) < 0 ? b.end : a.end;
  return daysBetween(start, end) >= 0 ? { start, end } : null;
}
