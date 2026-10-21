import { describe, expect, it } from 'vitest';
import { pumpEnergyKwh, pumpHours, pumpPowerKw } from './pump';
import { hourlyPvOutput, pvPowerKw } from './pv';

describe('pump', () => {
  it('H = 120 m, V = 1000 m³, η = 0.5 → ≈ 654 kWh', () => {
    expect(pumpEnergyKwh(120, 1000, 0.5)).toBeCloseTo(654, 0);
  });

  it('power × hours equals energy', () => {
    const kw = pumpPowerKw(60, 120, 0.5);
    expect(kw).toBeCloseTo(39.24);
    expect(kw * pumpHours(1000, 60)).toBeCloseTo(pumpEnergyKwh(120, 1000, 0.5));
  });
});

describe('pv', () => {
  it('P_pv = kWp × GTI / 1000 × PR', () => {
    expect(pvPowerKw(50, 1000)).toBeCloseTo(40);
    expect(pvPowerKw(50, 500, 1)).toBeCloseTo(25);
    expect(hourlyPvOutput([{ time: '2025-06-01T13:00', irradiance: 800 }], 50)).toEqual([
      { time: '2025-06-01T13:00', pvKw: 32 },
    ]);
  });
});
