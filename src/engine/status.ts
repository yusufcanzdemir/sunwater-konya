// Short "how is my field now" answers for chat replies.

import { daysBetween } from './dates';
import type { WaterBalanceResult } from './waterBalance';

export interface FieldStatus {
  /** End-of-day root-zone depletion on `date` (mm). */
  depletionMm: number;
  /**
   * Whole days of water left before the next irrigation is needed (Dr reaches RAW).
   * null when no such day falls inside the available data.
   */
  daysOfWaterLeft: number | null;
  /** Days of data after `date` that were checked. */
  horizonDays: number;
}

export function fieldStatus(result: WaterBalanceResult, date: string): FieldStatus | null {
  const today = result.days.find((d) => d.date === date);
  if (!today) return null;
  const later = result.days.filter((d) => daysBetween(date, d.date) > 0);
  const next = later.find((d) => d.depletionBeforeIrrigationMm >= result.rawMm);
  return {
    depletionMm: today.depletionMm,
    daysOfWaterLeft: next ? daysBetween(date, next.date) : null,
    horizonDays: later.length,
  };
}
