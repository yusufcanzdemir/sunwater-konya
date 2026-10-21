import { describe, expect, it } from 'vitest';
import { CROP_IDS, CROPS, kcOnDay, seasonLength, stageOnDay } from './crops';

describe('kcOnDay', () => {
  const beet = CROPS.sugar_beet; // 30/45/60/45, 0.35 → 1.20 → 0.70

  it('is constant Kc_ini during the initial stage', () => {
    expect(kcOnDay(beet, 0)).toBe(0.35);
    expect(kcOnDay(beet, 29)).toBe(0.35);
  });

  it('equals Kc_ini at the start of development and rises linearly to Kc_mid', () => {
    expect(kcOnDay(beet, 30)).toBeCloseTo(0.35);
    expect(kcOnDay(beet, 30 + 22.5)).toBeCloseTo((0.35 + 1.2) / 2);
    expect(kcOnDay(beet, 74)).toBeLessThan(1.2);
  });

  it('is Kc_mid from the start to the end of mid season', () => {
    expect(kcOnDay(beet, 75)).toBeCloseTo(1.2);
    expect(kcOnDay(beet, 134)).toBeCloseTo(1.2);
  });

  it('falls linearly to Kc_end during late season', () => {
    expect(kcOnDay(beet, 135)).toBeCloseTo(1.2);
    expect(kcOnDay(beet, 135 + 22.5)).toBeCloseTo((1.2 + 0.7) / 2);
    expect(kcOnDay(beet, 180)).toBeCloseTo(0.7);
  });

  it('matches the boundary values for every crop', () => {
    for (const id of CROP_IDS) {
      const c = CROPS[id];
      const { ini, dev, mid } = c.stages;
      expect(kcOnDay(c, 0)).toBeCloseTo(c.kcIni);
      expect(kcOnDay(c, ini)).toBeCloseTo(c.kcIni);
      expect(kcOnDay(c, ini + dev)).toBeCloseTo(c.kcMid);
      expect(kcOnDay(c, ini + dev + mid)).toBeCloseTo(c.kcMid);
      expect(kcOnDay(c, seasonLength(c))).toBeCloseTo(c.kcEnd);
    }
  });
});

describe('stageOnDay / seasonLength', () => {
  it('maps days to stages', () => {
    const maize = CROPS.maize; // 30/40/50/30
    expect(seasonLength(maize)).toBe(150);
    expect(stageOnDay(maize, 29)).toBe('ini');
    expect(stageOnDay(maize, 30)).toBe('dev');
    expect(stageOnDay(maize, 70)).toBe('mid');
    expect(stageOnDay(maize, 120)).toBe('late');
    expect(stageOnDay(maize, 150)).toBe('after');
  });
});
