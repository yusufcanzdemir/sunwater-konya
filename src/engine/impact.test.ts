import { describe, expect, it } from 'vitest';
import { assumedBaseline, habitBaseline } from './baseline';
import { addDays } from './dates';
import { computeImpact, scaleRange } from './impact';
import { pumpEnergyKwh } from './pump';

const base = {
  headM: 120,
  pumpEfficiency: 0.5,
  electricityPriceTlKwh: 3,
  dieselPriceTlL: 40,
};

describe('computeImpact', () => {
  it('claims no savings when the baseline is below the model', () => {
    const r = computeImpact({ ...base, baselineVolumeM3: 5000, modelVolumeM3: 8000, energySource: 'grid' });
    expect(r.savings).toBeNull();
    expect(r.underIrrigation).toBe(true);
  });

  it('claims nothing (and no warning) when equal', () => {
    const r = computeImpact({ ...base, baselineVolumeM3: 5000, modelVolumeM3: 5000, energySource: 'grid' });
    expect(r.savings).toBeNull();
    expect(r.underIrrigation).toBe(false);
  });

  it('grid: ΔE with the pump formula, CO₂ at 0.46 kg/kWh, ±25 % range', () => {
    const r = computeImpact({ ...base, baselineVolumeM3: 3000, modelVolumeM3: 2000, energySource: 'grid' });
    const dE = pumpEnergyKwh(120, 1000, 0.5);
    expect(r.savings!.waterM3).toEqual({ low: 750, mid: 1000, high: 1250 });
    expect(r.savings!.waterPercent).toBeCloseTo(33.33);
    expect(r.savings!.energyKwh.mid).toBeCloseTo(dE);
    expect(r.savings!.co2Kg.mid).toBeCloseTo(dE * 0.46);
    expect(r.savings!.costTl!.mid).toBeCloseTo(dE * 3);
    expect(r.savings!.dieselL).toBeNull();
  });

  it('diesel: 0.30 L/kWh × 2.68 kg/L, cost from diesel price', () => {
    const r = computeImpact({ ...base, baselineVolumeM3: 3000, modelVolumeM3: 2000, energySource: 'diesel' });
    const dE = pumpEnergyKwh(120, 1000, 0.5);
    expect(r.savings!.dieselL!.mid).toBeCloseTo(dE * 0.3);
    expect(r.savings!.co2Kg.mid).toBeCloseTo(dE * 0.3 * 2.68);
    expect(r.savings!.costTl!.mid).toBeCloseTo(dE * 0.3 * 40);
  });

  it('solar+grid counts saved kWh as grid-equivalent; no price → no TL', () => {
    const r = computeImpact({
      ...base,
      electricityPriceTlKwh: null,
      baselineVolumeM3: 3000,
      modelVolumeM3: 2000,
      energySource: 'solar_grid',
    });
    expect(r.savings!.co2Kg.mid).toBeCloseTo(pumpEnergyKwh(120, 1000, 0.5) * 0.46);
    expect(r.savings!.costTl).toBeNull();
  });

  it('scales a range for n fields', () => {
    expect(scaleRange({ low: 1, mid: 2, high: 3 }, 100)).toEqual({ low: 100, mid: 200, high: 300 });
  });
});

describe('baseline', () => {
  const dates = Array.from({ length: 30 }, (_, i) => addDays('2025-06-01', i));

  it('habit: Q × hours × number of irrigations in the season', () => {
    const b = habitBaseline(dates, { intervalDays: 7, hours: 24 }, 60);
    expect(b.irrigationCount).toBe(5); // days 0, 7, 14, 21, 28
    expect(b.volumeM3).toBe(5 * 60 * 24);
    expect(b.cumulative[6].volumeM3).toBe(1440);
    expect(b.cumulative[7].volumeM3).toBe(2880);
  });

  it('no habit: model gross × 1.25', () => {
    const b = assumedBaseline([
      { date: '2025-06-01', volumeM3: 0 },
      { date: '2025-06-02', volumeM3: 800 },
    ]);
    expect(b.kind).toBe('assumed');
    expect(b.volumeM3).toBe(1000);
  });
});
