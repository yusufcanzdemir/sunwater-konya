// Editable engine assumptions, initialised from the engine defaults.

import { CROPS, type CropId, type CropParams } from '../engine/crops';
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
}

export function defaultAssumptions(): Assumptions {
  return structuredClone({
    crops: CROPS,
    soils: SOILS,
    efficiency: IRRIGATION_EFFICIENCY,
    rainRule: DEFAULT_RAIN_RULE,
    lookaheadDays: 2,
    forecastInitialDepletionMm: 0,
  });
}
