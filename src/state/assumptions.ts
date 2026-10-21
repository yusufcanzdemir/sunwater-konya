// Editable engine assumptions, initialised from the engine defaults.

import { DEFAULT_OVER_IRRIGATION_FACTOR } from '../engine/baseline';
import { CROPS, type CropId, type CropParams } from '../engine/crops';
import { DEFAULT_IMPACT_FACTORS, type ImpactFactors } from '../engine/impact';
import type { ModelSettings } from '../engine/plan';
import { DEFAULT_PERFORMANCE_RATIO } from '../engine/pv';
import { DEFAULT_MAX_ROTATION_DAYS } from '../engine/schedule';
import { SOILS, type SoilId, type SoilParams } from '../engine/soil';
import {
  DEFAULT_RAIN_RULE,
  IRRIGATION_EFFICIENCY,
  type EffectiveRainRule,
  type IrrigationMethod,
} from '../engine/waterBalance';

export interface Assumptions {
  crops: Record<CropId, CropParams>;
  soils: Record<SoilId, SoilParams>;
  efficiency: Record<IrrigationMethod, number>;
  rainRule: EffectiveRainRule;
  lookaheadDays: number;
  /** Depletion at the start of a forecast-only run (field state is unknown). */
  forecastInitialDepletionMm: number;
  performanceRatio: number;
  maxRotationDays: number;
  overIrrigationFactor: number;
  impactFactors: ImpactFactors;
}

export function defaultAssumptions(): Assumptions {
  return structuredClone({
    crops: CROPS,
    soils: SOILS,
    efficiency: IRRIGATION_EFFICIENCY,
    rainRule: DEFAULT_RAIN_RULE,
    lookaheadDays: 2,
    forecastInitialDepletionMm: 0,
    performanceRatio: DEFAULT_PERFORMANCE_RATIO,
    maxRotationDays: DEFAULT_MAX_ROTATION_DAYS,
    overIrrigationFactor: DEFAULT_OVER_IRRIGATION_FACTOR,
    impactFactors: DEFAULT_IMPACT_FACTORS,
  });
}

export function modelSettings(a: Assumptions, initialDepletionMm: number): ModelSettings {
  return {
    rainRule: a.rainRule,
    lookaheadDays: a.lookaheadDays,
    initialDepletionMm,
    performanceRatio: a.performanceRatio,
    maxRotationDays: a.maxRotationDays,
    overIrrigationFactor: a.overIrrigationFactor,
    impactFactors: a.impactFactors,
  };
}
