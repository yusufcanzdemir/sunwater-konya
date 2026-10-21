import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { HOUSEHOLD_ANNUAL_WATER_M3, OLYMPIC_POOL_M3, waterEquivalents } from './constants';
import { CROPS } from './crops';
import { addDays } from './dates';
import { polygonAreaDecare, polygonCentroid } from './geometry';
import { DEFAULT_IMPACT_FACTORS } from './impact';
import { analyzeSeason } from './plan';
import { SOILS } from './soil';
import { bestSolarDay, dayEnergy, pumpingDates, seasonFrames, soilFill } from './visuals';
import { DEFAULT_RAIN_RULE } from './waterBalance';

describe('polygon area', () => {
  // ~100 m × 100 m square near Karapınar → ≈ 10 decare
  const lat = 37.72;
  const lon = 33.55;
  const m = 111_195; // metres per degree of latitude on turf's sphere
  const dLat = 100 / m;
  const dLon = 100 / (m * Math.cos((lat * Math.PI) / 180));
  const square: Polygon = {
    type: 'Polygon',
    coordinates: [[[lon, lat], [lon + dLon, lat], [lon + dLon, lat + dLat], [lon, lat + dLat], [lon, lat]]],
  };

  it('converts m² to decare', () => {
    expect(polygonAreaDecare(square)).toBeCloseTo(10, 1);
  });

  it('finds the centroid', () => {
    const c = polygonCentroid(square);
    expect(c.latitude).toBeCloseTo(lat + dLat / 2, 6);
    expect(c.longitude).toBeCloseTo(lon + dLon / 2, 6);
  });
});

describe('water equivalents', () => {
  it('uses the reference constants', () => {
    expect(waterEquivalents(5000).olympicPools).toBe(2);
    expect(OLYMPIC_POOL_M3).toBe(2500);
    expect(HOUSEHOLD_ANNUAL_WATER_M3).toBeCloseTo(0.255 * 3.14 * 365);
    expect(waterEquivalents(HOUSEHOLD_ANNUAL_WATER_M3 * 3).householdYears).toBeCloseTo(3);
  });
});

describe('season visuals', () => {
  const planting = '2025-06-01';
  const daily = Array.from({ length: 180 }, (_, i) => ({ date: addDays(planting, i), et0: 7, precipitation: i === 5 ? 20 : 0 }));
  const hourly = daily.flatMap((d) =>
    Array.from({ length: 24 }, (_, h) => ({
      time: `${d.date}T${String(h).padStart(2, '0')}:00`,
      irradiance: h >= 9 && h <= 17 ? 900 : 0,
    })),
  );
  const a = analyzeSeason(
    { daily, hourly },
    planting,
    {
      crop: CROPS.maize,
      soil: SOILS.loam,
      irrigationEfficiency: 0.88,
      areaDecare: 5,
      wellHeadM: 80,
      pumpFlowM3h: 60,
      pumpEfficiency: 0.5,
      energySource: 'solar_grid',
      pvKwp: 50,
      habit: { intervalDays: 3, hours: 10 },
      electricityPriceTlKwh: null,
      dieselPriceTlL: null,
    },
    {
      rainRule: DEFAULT_RAIN_RULE,
      lookaheadDays: 2,
      initialDepletionMm: 0,
      performanceRatio: 0.8,
      maxRotationDays: 14,
      overIrrigationFactor: 1.25,
      impactFactors: DEFAULT_IMPACT_FACTORS,
    },
  );

  it('soil fill = 1 − Dr / TAW', () => {
    expect(soilFill(0, 150)).toBe(1);
    expect(soilFill(75, 150)).toBe(0.5);
    expect(soilFill(200, 150)).toBe(0);
  });

  it('builds one frame per season day with rain, irrigation and cumulative volumes', () => {
    const { frames, rawFill } = seasonFrames(a);
    expect(frames).toHaveLength(a.balance.days.length);
    expect(rawFill).toBeCloseTo(1 - a.balance.rawMm / a.balance.tawMm);
    expect(frames[5].rain).toBe(true);
    const irr = frames.find((f) => f.irrigated)!;
    expect(irr.fill).toBe(1);
    expect(irr.fillBeforeIrrigation).toBeLessThanOrEqual(rawFill + 1e-9);
    expect(frames.at(-1)!.modelM3).toBeCloseTo(a.balance.totals.volumeM3);
    expect(frames.at(-1)!.baselineM3).toBeCloseTo(a.baseline.volumeM3);
  });

  it('picks the pumping day with the highest solar share', () => {
    const best = bestSolarDay(a)!;
    const share = (d: string) => {
      const e = dayEnergy(a, d);
      return e.solarKwh / (e.solarKwh + e.gridKwh);
    };
    for (const d of pumpingDates(a)) expect(share(d)).toBeLessThanOrEqual(share(best) + 1e-9);
  });

  it('splits a pumping day into solar, grid and surplus per hour', () => {
    const date = pumpingDates(a)[0];
    const d = dayEnergy(a, date);
    expect(d.hours).toHaveLength(24);
    expect(d.hours[0].hour).toBe('00:00');
    for (const h of d.hours) {
      expect(h.solarKw + h.gridKw).toBeCloseTo(h.pumpKw);
      expect(h.solarKw + h.surplusKw).toBeCloseTo(h.pvKw);
    }
    const irrHours = a.schedule.irrigations.flatMap((i) => i.hours).filter((h) => h.time.startsWith(date) || h.time === `${addDays(date, 1)}T00:00`);
    expect(d.pumpHours).toBeGreaterThan(0);
    expect(d.pumpHours).toBeLessThanOrEqual(irrHours.reduce((s, h) => s + h.fraction, 0) + 1e-9);
    // PV peak 36 kW > pump 26 kW: sunny pumping hours run on solar alone
    expect(a.pumpKw).toBeCloseTo(26.16);
    const sunnyPumping = d.hours.filter((h) => h.pumpKw > 0 && h.pvKw >= a.pumpKw);
    expect(sunnyPumping.length).toBeGreaterThan(0);
    for (const h of sunnyPumping) expect(h.gridKw).toBeCloseTo(0);
    expect(d.solarOnlyPumpHours).toBeGreaterThan(0);
  });
});
