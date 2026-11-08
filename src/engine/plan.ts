// Runs the whole chain for one weather series:
// water balance → pump schedule on PV hours → baseline → impact.

import { assumedBaseline, habitBaseline, type Baseline, type CumulativePoint, type Habit } from './baseline.js';
import type { CropParams } from './crops.js';
import { computeImpact, type EnergySource, type ImpactFactors, type ImpactResult } from './impact.js';
import { pumpPowerKw } from './pump.js';
import { hourlyPvOutput, type HourlyIrradiance, type HourlyPv } from './pv.js';
import { DIESEL_FIRST_HOUR, NIGHT_TARIFF_START, scheduleIrrigations, slotDate, type ScheduleResult } from './schedule.js';
import type { SoilParams } from './soil.js';
import {
  runWaterBalance,
  type DailyWeather,
  type EffectiveRainRule,
  type FieldRecord,
  type WaterBalanceResult,
} from './waterBalance.js';

export interface FarmParams {
  crop: CropParams;
  soil: SoilParams;
  irrigationEfficiency: number;
  areaDecare: number;
  wellHeadM: number;
  pumpFlowM3h: number;
  pumpEfficiency: number;
  energySource: EnergySource;
  pvKwp: number;
  habit: Habit | null;
  electricityPriceTlKwh: number | null;
  dieselPriceTlL: number | null;
}

export interface ModelSettings {
  rainRule: EffectiveRainRule;
  lookaheadDays: number;
  initialDepletionMm: number;
  performanceRatio: number;
  maxRotationDays: number;
  overIrrigationFactor: number;
  impactFactors: ImpactFactors;
}

export interface SeasonAnalysis {
  balance: WaterBalanceResult;
  pumpKw: number;
  schedule: ScheduleResult;
  /** Hourly PV output over the season days (kW), as used by the schedule. */
  pv: HourlyPv[];
  modelCumulative: CumulativePoint[];
  baseline: Baseline;
  impact: ImpactResult;
}

export function analyzeSeason(
  weather: { daily: DailyWeather[]; hourly: HourlyIrradiance[] },
  plantingDate: string,
  farm: FarmParams,
  settings: ModelSettings,
  /** Farmer records ("Suladım" / "Yağmur yağdı") that override the model on their days. */
  records: FieldRecord[] = [],
): SeasonAnalysis {
  const balance = runWaterBalance({
    weather: weather.daily,
    plantingDate,
    crop: farm.crop,
    soil: farm.soil,
    efficiency: farm.irrigationEfficiency,
    areaDecare: farm.areaDecare,
    rainRule: settings.rainRule,
    lookaheadDays: settings.lookaheadDays,
    initialDepletionMm: settings.initialDepletionMm,
    records,
  });

  const pumpKw = pumpPowerKw(farm.pumpFlowM3h, farm.wellHeadM, farm.pumpEfficiency);
  const kwp = farm.energySource === 'solar_grid' ? farm.pvKwp : 0;
  const seasonDates = new Set(balance.days.map((d) => d.date));
  const pv = hourlyPvOutput(weather.hourly, kwp, settings.performanceRatio).filter((h) =>
    seasonDates.has(slotDate(h.time)),
  );

  const schedule = scheduleIrrigations({
    events: balance.days.filter((d) => d.irrigated).map((d) => ({ date: d.date, volumeM3: d.volumeM3 })),
    pv,
    pumpKw,
    flowM3h: farm.pumpFlowM3h,
    maxRotationDays: settings.maxRotationDays,
    firstHour: farm.energySource === 'diesel' ? DIESEL_FIRST_HOUR : NIGHT_TARIFF_START,
  });

  let running = 0;
  const modelCumulative = balance.days.map((d) => ({ date: d.date, volumeM3: (running += d.volumeM3) }));

  const baseline = farm.habit
    ? habitBaseline(
        balance.days.map((d) => d.date),
        farm.habit,
        farm.pumpFlowM3h,
      )
    : assumedBaseline(modelCumulative, settings.overIrrigationFactor);

  const impact = computeImpact({
    baselineVolumeM3: baseline.volumeM3,
    modelVolumeM3: balance.totals.volumeM3,
    headM: farm.wellHeadM,
    pumpEfficiency: farm.pumpEfficiency,
    energySource: farm.energySource,
    electricityPriceTlKwh: farm.electricityPriceTlKwh,
    dieselPriceTlL: farm.dieselPriceTlL,
    factors: settings.impactFactors,
  });

  return { balance, pumpKw, schedule, pv, modelCumulative, baseline, impact };
}
