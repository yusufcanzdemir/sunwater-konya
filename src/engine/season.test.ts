import { describe, expect, it } from 'vitest';
import { CROPS } from './crops';
import { addDays, addYears, daysBetween } from './dates';
import { archiveSeasonWindow, intersectWindows, seasonWindow } from './season';

describe('dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(daysBetween('2025-04-20', '2025-10-16')).toBe(179);
    expect(addYears('2024-02-29', -1)).toBe('2023-02-28');
  });
});

describe('season windows', () => {
  const beet = CROPS.sugar_beet; // 180 days

  it('spans the full crop season', () => {
    expect(seasonWindow('2025-04-20', beet)).toEqual({ start: '2025-04-20', end: '2025-10-16' });
  });

  it('keeps this year when the season is already in the archive', () => {
    const w = archiveSeasonWindow('2026-04-20', beet, '2026-10-30');
    expect(w.plantingDate).toBe('2026-04-20');
    expect(w.shiftedYears).toBe(0);
  });

  it('moves back to the last complete season otherwise', () => {
    // season ends 10-16, but with a 5-day lag the archive only reaches 10-14
    const w = archiveSeasonWindow('2026-04-20', beet, '2026-10-19');
    expect(w.plantingDate).toBe('2025-04-20');
    expect(w.end).toBe('2025-10-16');
    expect(w.shiftedYears).toBe(-1);
  });

  it('intersects windows', () => {
    expect(intersectWindows({ start: '2025-01-01', end: '2025-01-10' }, { start: '2025-01-05', end: '2025-02-01' })).toEqual({
      start: '2025-01-05',
      end: '2025-01-10',
    });
    expect(intersectWindows({ start: '2025-01-01', end: '2025-01-10' }, { start: '2025-02-01', end: '2025-02-02' })).toBeNull();
  });
});
