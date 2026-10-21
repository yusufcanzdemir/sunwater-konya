import { describe, expect, it } from 'vitest';
import { CROPS, type CropParams } from './crops';
import { addDays } from './dates';
import { SOILS } from './soil';
import { effectiveRain, runWaterBalance, type DailyWeather } from './waterBalance';

const PLANTING = '2025-04-20';

function weather(days: number, et0: number, rain: Record<number, number> = {}): DailyWeather[] {
  return Array.from({ length: days }, (_, i) => ({
    date: addDays(PLANTING, i),
    et0,
    precipitation: rain[i] ?? 0,
  }));
}

/** Kc = 1 for the whole season so ETc = ET0. */
const flatCrop: CropParams = {
  ...CROPS.sugar_beet,
  kcIni: 1,
  kcMid: 1,
  kcEnd: 1,
  stages: { ini: 40, dev: 40, mid: 40, late: 40 },
};

describe('effectiveRain', () => {
  it('ignores rain below 5 mm and counts 80 % otherwise', () => {
    expect(effectiveRain(4.9)).toBe(0);
    expect(effectiveRain(5)).toBeCloseTo(4);
    expect(effectiveRain(20)).toBeCloseTo(16);
  });
});

describe('runWaterBalance', () => {
  const base = {
    plantingDate: PLANTING,
    crop: flatCrop,
    soil: SOILS.clay_loam, // TAW 150 mm, RAW 82.5 mm with p = 0.55
    efficiency: 0.55,
    areaDecare: 100,
  };

  it('with no rain and constant ET0, irrigates every ceil(RAW / ETc) days', () => {
    const et0 = 6;
    const result = runWaterBalance({ ...base, weather: weather(160, et0) });
    const interval = Math.ceil(result.rawMm / et0); // 82.5 / 6 → 14

    const irrigationDays = result.days.filter((d) => d.irrigated).map((d) => d.dayOfSeason);
    expect(irrigationDays[0]).toBe(interval - 1);
    for (let i = 1; i < irrigationDays.length; i++) {
      expect(irrigationDays[i] - irrigationDays[i - 1]).toBe(interval);
    }
    // each irrigation refills exactly the accumulated depletion
    for (const d of result.days.filter((d) => d.irrigated)) {
      expect(d.netMm).toBeCloseTo(interval * et0);
      expect(d.depletionMm).toBe(0);
    }
  });

  it('only simulates days inside the season', () => {
    const w = [{ date: addDays(PLANTING, -3), et0: 5, precipitation: 0 }, ...weather(200, 5)];
    const result = runWaterBalance({ ...base, weather: w });
    expect(result.days).toHaveLength(160);
    expect(result.days[0].date).toBe(PLANTING);
  });

  it('converts net to gross by efficiency and gross mm × decare to m³', () => {
    const result = runWaterBalance({ ...base, weather: weather(160, 6) });
    const first = result.days.find((d) => d.irrigated)!;
    expect(first.grossMm).toBeCloseTo(first.netMm / 0.55);
    expect(first.volumeM3).toBeCloseTo(first.grossMm * 100);
    expect(result.totals.volumeM3).toBeCloseTo(result.totals.grossMm * 100);
    expect(result.totals.irrigationCount).toBe(result.days.filter((d) => d.irrigated).length);
  });

  it('defers irrigation when rain in the next 2 days brings Dr below RAW', () => {
    // RAW is reached on day 13 (14 × 6 = 84 mm); 20 mm on day 14 gives Peff 16 mm.
    const result = runWaterBalance({ ...base, weather: weather(160, 6, { 14: 20 }) });
    expect(result.days[13].deferred).toBe(true);
    expect(result.days[13].irrigated).toBe(false);

    const noLookahead = runWaterBalance({ ...base, weather: weather(160, 6, { 14: 20 }), lookaheadDays: 0 });
    expect(noLookahead.days[13].irrigated).toBe(true);
  });

  it('keeps depletion within 0 … TAW', () => {
    const result = runWaterBalance({ ...base, weather: weather(160, 6, { 3: 200 }), lookaheadDays: 0 });
    for (const d of result.days) {
      expect(d.depletionMm).toBeGreaterThanOrEqual(0);
      expect(d.depletionMm).toBeLessThanOrEqual(result.tawMm);
    }
    expect(result.days[3].depletionMm).toBe(0);
  });
});
