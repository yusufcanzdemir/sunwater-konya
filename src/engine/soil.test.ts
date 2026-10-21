import { describe, expect, it } from 'vitest';
import { SOILS, readilyAvailableWater, totalAvailableWater } from './soil';

describe('soil water', () => {
  it('computes TAW = 1000 × (θFC − θWP) × Zr', () => {
    expect(totalAvailableWater(SOILS.clay_loam, 1.0)).toBeCloseTo(150);
    expect(totalAvailableWater(SOILS.sandy_loam, 0.5)).toBeCloseTo(50);
  });

  it('computes RAW = p × TAW', () => {
    expect(readilyAvailableWater(150, 0.55)).toBeCloseTo(82.5);
  });
});
