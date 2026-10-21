import { describe, expect, it } from 'vitest';
import { CROPS } from './crops';
import { addDays } from './dates';
import { DEFAULT_IMPACT_FACTORS } from './impact';
import { analyzeSeason, type FarmParams, type ModelSettings } from './plan';
import { SOILS } from './soil';
import { DEFAULT_RAIN_RULE } from './waterBalance';

const PLANTING = '2025-04-20';
const days = 180;
const daily = Array.from({ length: days }, (_, i) => ({ date: addDays(PLANTING, i), et0: 6, precipitation: 0 }));
const hourly = daily.flatMap((d) =>
  Array.from({ length: 24 }, (_, h) => ({
    time: `${d.date}T${String(h).padStart(2, '0')}:00`,
    irradiance: h >= 8 && h <= 18 ? 800 : 0,
  })),
);

const farm: FarmParams = {
  crop: CROPS.sugar_beet,
  soil: SOILS.clay_loam,
  irrigationEfficiency: 0.88,
  areaDecare: 10,
  wellHeadM: 120,
  pumpFlowM3h: 60,
  pumpEfficiency: 0.5,
  energySource: 'solar_grid',
  pvKwp: 50,
  habit: null,
  electricityPriceTlKwh: 3,
  dieselPriceTlL: null,
};

const settings: ModelSettings = {
  rainRule: DEFAULT_RAIN_RULE,
  lookaheadDays: 2,
  initialDepletionMm: 0,
  performanceRatio: 0.8,
  maxRotationDays: 14,
  overIrrigationFactor: 1.25,
  impactFactors: DEFAULT_IMPACT_FACTORS,
};

describe('analyzeSeason', () => {
  it('links balance, schedule, baseline and impact consistently', () => {
    const a = analyzeSeason({ daily, hourly }, PLANTING, farm, settings);
    expect(a.schedule.irrigations).toHaveLength(a.balance.totals.irrigationCount);
    expect(a.modelCumulative.at(-1)!.volumeM3).toBeCloseTo(a.balance.totals.volumeM3);
    // no habit → baseline = model gross × 1.25 → saving = 20 % of baseline
    expect(a.baseline.kind).toBe('assumed');
    expect(a.impact.savings!.waterPercent).toBeCloseTo(20);
    expect(a.schedule.totals.solarKwh).toBeGreaterThan(0);
  });

  it('uses no PV when the energy source is not solar', () => {
    const a = analyzeSeason({ daily, hourly }, PLANTING, { ...farm, energySource: 'grid' }, settings);
    expect(a.schedule.totals.solarKwh).toBe(0);
    expect(a.schedule.totals.gridKwh).toBeCloseTo(a.schedule.totals.pumpKwh);
  });

  it('flags under-irrigation when the habit is below the need', () => {
    const a = analyzeSeason({ daily, hourly }, PLANTING, { ...farm, habit: { intervalDays: 30, hours: 1 } }, settings);
    expect(a.impact.underIrrigation).toBe(true);
    expect(a.impact.savings).toBeNull();
  });
});
