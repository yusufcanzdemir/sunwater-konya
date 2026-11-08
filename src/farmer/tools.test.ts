import { describe, expect, it } from 'vitest';
import { flowFromPower, kwhForM3, profileForm, pumpedM3FromKwh, wellTrend } from './tools';

describe('pump maths', () => {
  it('flow from power: 30 kW at 120 m, η 0.5 ≈ 45.9 m³/h', () => {
    expect(flowFromPower(30, 120)).toBeCloseTo(45.87, 1);
  });

  it('water from a bill: 1,000 kWh at 120 m ≈ 1,529 m³, and back', () => {
    const m3 = pumpedM3FromKwh(1000, 120);
    expect(m3).toBeCloseTo(1529, 0);
    expect(kwhForM3(m3, 120)).toBeCloseTo(1000, 6);
  });

  it('a deeper well lifts less water for the same energy', () => {
    expect(pumpedM3FromKwh(1000, 30)).toBeCloseTo(1.5 * pumpedM3FromKwh(1000, 45), 6);
  });

  it('profile becomes engine form fields (decimal comma)', () => {
    const f = profileForm({ headM: 80, pumpKw: 22, energy: 'grid', method: 'drip', pvKwp: null });
    expect(f.wellHeadM).toBe('80');
    expect(f.pumpFlowM3h).toBe('50,5');
    expect(f.energySource).toBe('grid');
    expect(f.pvKwp).toBe('0');
    expect(f.irrigationMethod).toBe('drip');
  });
});

describe('well trend', () => {
  it('needs two readings at least a month apart', () => {
    expect(wellTrend([{ date: '2026-01-01', depthM: 20 }])).toBeNull();
    expect(wellTrend([{ date: '2026-01-01', depthM: 20 }, { date: '2026-01-10', depthM: 20.1 }])).toBeNull();
  });

  it('1 m deeper per year → 3 m more in three years', () => {
    const t = wellTrend([
      { date: '2024-06-01', depthM: 20 },
      { date: '2025-06-01', depthM: 21 },
      { date: '2026-06-01', depthM: 22 },
    ]);
    expect(t?.mPerYear).toBeCloseTo(1, 1);
    expect(t?.in3Years).toBeCloseTo(25, 0);
  });
});
