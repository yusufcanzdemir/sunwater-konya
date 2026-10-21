// Water, energy, CO₂ and cost impact of the model plan versus the baseline.

import { pumpEnergyKwh } from './pump.js';

export type EnergySource = 'solar_grid' | 'grid' | 'diesel';

export interface ImpactFactors {
  /** Grid emission factor (kg CO₂/kWh). */
  gridKgCo2PerKwh: number;
  /** Diesel use per kWh of pump energy (L/kWh). */
  dieselLPerKwh: number;
  /** Diesel emission factor (kg CO₂/L). */
  dieselKgCo2PerL: number;
  /** Shown range is value × (1 ± uncertainty). */
  uncertainty: number;
}

export const DEFAULT_IMPACT_FACTORS: ImpactFactors = {
  gridKgCo2PerKwh: 0.46,
  dieselLPerKwh: 0.3,
  dieselKgCo2PerL: 2.68,
  uncertainty: 0.25,
};

export interface Range {
  low: number;
  mid: number;
  high: number;
}

export function withUncertainty(value: number, uncertainty: number): Range {
  return { low: value * (1 - uncertainty), mid: value, high: value * (1 + uncertainty) };
}

export function scaleRange(r: Range, n: number): Range {
  return { low: r.low * n, mid: r.mid * n, high: r.high * n };
}

export interface ImpactInput {
  baselineVolumeM3: number;
  modelVolumeM3: number;
  headM: number;
  pumpEfficiency: number;
  energySource: EnergySource;
  electricityPriceTlKwh: number | null;
  dieselPriceTlL: number | null;
  factors?: ImpactFactors;
}

export interface Savings {
  waterM3: Range;
  /** Share of the baseline volume saved (%). */
  waterPercent: number;
  energyKwh: Range;
  co2Kg: Range;
  /** Only for diesel. */
  dieselL: Range | null;
  /** null when the needed unit price was not entered. */
  costTl: Range | null;
}

export interface ImpactResult {
  baselineEnergyKwh: number;
  modelEnergyKwh: number;
  /** Baseline is below the model need: yield risk, no savings are claimed. */
  underIrrigation: boolean;
  savings: Savings | null;
}

export function computeImpact(input: ImpactInput): ImpactResult {
  const { headM, pumpEfficiency, energySource, factors = DEFAULT_IMPACT_FACTORS } = input;
  const energy = (v: number) => pumpEnergyKwh(headM, v, pumpEfficiency);
  const baselineEnergyKwh = energy(input.baselineVolumeM3);
  const modelEnergyKwh = energy(input.modelVolumeM3);

  const deltaV = input.baselineVolumeM3 - input.modelVolumeM3;
  if (deltaV <= 0) {
    return { baselineEnergyKwh, modelEnergyKwh, underIrrigation: deltaV < 0, savings: null };
  }

  const deltaE = energy(deltaV);
  let co2: number;
  let dieselL: number | null = null;
  let cost: number | null;
  if (energySource === 'diesel') {
    dieselL = deltaE * factors.dieselLPerKwh;
    co2 = dieselL * factors.dieselKgCo2PerL;
    cost = input.dieselPriceTlL != null ? dieselL * input.dieselPriceTlL : null;
  } else {
    // Grid: avoided purchase. Solar+grid: saved kWh can be exported, so it counts as grid-equivalent.
    co2 = deltaE * factors.gridKgCo2PerKwh;
    cost = input.electricityPriceTlKwh != null ? deltaE * input.electricityPriceTlKwh : null;
  }

  const u = factors.uncertainty;
  return {
    baselineEnergyKwh,
    modelEnergyKwh,
    underIrrigation: false,
    savings: {
      waterM3: withUncertainty(deltaV, u),
      waterPercent: (deltaV / input.baselineVolumeM3) * 100,
      energyKwh: withUncertainty(deltaE, u),
      co2Kg: withUncertainty(co2, u),
      dieselL: dieselL != null ? withUncertainty(dieselL, u) : null,
      costTl: cost != null ? withUncertainty(cost, u) : null,
    },
  };
}
