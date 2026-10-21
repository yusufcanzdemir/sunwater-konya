// Daily root-zone water balance – FAO-56 chapter 8, simplified.

import { kcOnDay, seasonLength, type CropParams } from './crops.js';
import { daysBetween } from './dates.js';
import { readilyAvailableWater, totalAvailableWater, type SoilParams } from './soil.js';

export type IrrigationMethod = 'flood' | 'sprinkler' | 'drip';

export const IRRIGATION_METHODS: IrrigationMethod[] = ['flood', 'sprinkler', 'drip'];

export const IRRIGATION_METHOD_NAMES: Record<IrrigationMethod, string> = {
  flood: 'Salma',
  sprinkler: 'Yağmurlama',
  drip: 'Damla',
};

/** Application efficiency per method (assumption). */
export const IRRIGATION_EFFICIENCY: Record<IrrigationMethod, number> = {
  flood: 0.55,
  sprinkler: 0.72,
  drip: 0.88,
};

export interface DailyWeather {
  date: string;
  et0: number;
  precipitation: number;
}

export interface EffectiveRainRule {
  /** Rain below this (mm) is ignored. */
  thresholdMm: number;
  /** Fraction of rain at/above the threshold that counts. */
  factor: number;
}

export const DEFAULT_RAIN_RULE: EffectiveRainRule = { thresholdMm: 5, factor: 0.8 };

/** Peff = P < threshold ? 0 : factor × P */
export function effectiveRain(precipitationMm: number, rule: EffectiveRainRule = DEFAULT_RAIN_RULE): number {
  return precipitationMm < rule.thresholdMm ? 0 : rule.factor * precipitationMm;
}

export interface WaterBalanceInput {
  weather: DailyWeather[];
  plantingDate: string;
  crop: CropParams;
  soil: SoilParams;
  efficiency: number;
  areaDecare: number;
  rainRule?: EffectiveRainRule;
  /** Days of upcoming rain considered before irrigating (0 disables deferral). */
  lookaheadDays?: number;
  /** Root-zone depletion at the first simulated day (mm). 0 = field capacity. */
  initialDepletionMm?: number;
  /** Farmer's own records ("Suladım" / "Yağmur yağdı"); they override the model for that day. */
  records?: FieldRecord[];
}

/** Observed irrigation (net mm reaching the root zone) or observed rain (mm) on a day. */
export type FieldRecord =
  | { date: string; kind: 'irrigation'; netMm: number }
  | { date: string; kind: 'rain'; mm: number };

export interface DailyBalance {
  date: string;
  /** 0 = planting day. */
  dayOfSeason: number;
  kc: number;
  et0: number;
  etc: number;
  precipitation: number;
  peff: number;
  /** Depletion after rain and ETc, before any irrigation (mm). */
  depletionBeforeIrrigationMm: number;
  /** End-of-day depletion Dr (mm). */
  depletionMm: number;
  irrigated: boolean;
  /** Dr reached RAW but irrigation was postponed because rain is coming. */
  deferred: boolean;
  /** Irrigation / rain of this day come from the farmer's records, not the model. */
  irrigationRecorded: boolean;
  rainRecorded: boolean;
  netMm: number;
  grossMm: number;
  volumeM3: number;
}

export interface WaterBalanceTotals {
  et0Mm: number;
  etcMm: number;
  precipitationMm: number;
  peffMm: number;
  netMm: number;
  grossMm: number;
  volumeM3: number;
  irrigationCount: number;
}

export interface WaterBalanceResult {
  tawMm: number;
  rawMm: number;
  days: DailyBalance[];
  totals: WaterBalanceTotals;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Runs the daily balance over every weather day that falls inside the crop season
 * (planting date … planting date + season length − 1). Days outside are ignored.
 *
 *   Dr_t = clamp(Dr_{t-1} − Peff − I_net + ETc, 0, TAW)
 *   irrigate when Dr_t ≥ RAW with I_net = Dr_t, unless the effective rain of the
 *   next `lookaheadDays` days would bring Dr below RAW.
 *
 * Records: a rain record replaces that day's weather rain; an irrigation record replaces the
 * model's decision for that day with the recorded amount.
 */
export function runWaterBalance(input: WaterBalanceInput): WaterBalanceResult {
  const {
    crop,
    soil,
    efficiency,
    areaDecare,
    plantingDate,
    rainRule = DEFAULT_RAIN_RULE,
    lookaheadDays = 2,
    initialDepletionMm = 0,
    records = [],
  } = input;

  const recordedRain = new Map<string, number>();
  const recordedIrrigation = new Map<string, number>();
  for (const r of records) {
    if (r.kind === 'rain') recordedRain.set(r.date, r.mm);
    else recordedIrrigation.set(r.date, (recordedIrrigation.get(r.date) ?? 0) + r.netMm);
  }
  const rainOn = (w: DailyWeather) => recordedRain.get(w.date) ?? w.precipitation;

  const tawMm = totalAvailableWater(soil, crop.rootDepthM);
  const rawMm = readilyAvailableWater(tawMm, crop.p);
  const length = seasonLength(crop);

  const season = [...input.weather]
    .map((w) => ({ ...w, dayOfSeason: daysBetween(plantingDate, w.date) }))
    .filter((w) => w.dayOfSeason >= 0 && w.dayOfSeason < length)
    .sort((a, b) => a.dayOfSeason - b.dayOfSeason);

  const days: DailyBalance[] = [];
  let depletion = clamp(initialDepletionMm, 0, tawMm);

  season.forEach((w, i) => {
    const kc = kcOnDay(crop, w.dayOfSeason);
    const etc = kc * w.et0;
    const precipitation = rainOn(w);
    const peff = effectiveRain(precipitation, rainRule);
    const before = clamp(depletion - peff + etc, 0, tawMm);

    let irrigated = false;
    let deferred = false;
    let netMm = 0;

    const recorded = recordedIrrigation.get(w.date);
    if (recorded != null) {
      irrigated = recorded > 0;
      netMm = recorded;
    } else if (before >= rawMm) {
      const upcomingPeff = season
        .slice(i + 1, i + 1 + lookaheadDays)
        .reduce((sum, next) => sum + effectiveRain(rainOn(next), rainRule), 0);
      if (lookaheadDays > 0 && before - upcomingPeff < rawMm) {
        deferred = true;
      } else {
        irrigated = true;
        netMm = before;
      }
    }

    depletion = clamp(before - netMm, 0, tawMm);
    const grossMm = efficiency > 0 ? netMm / efficiency : 0;

    days.push({
      date: w.date,
      dayOfSeason: w.dayOfSeason,
      kc,
      et0: w.et0,
      etc,
      precipitation,
      peff,
      depletionBeforeIrrigationMm: before,
      depletionMm: depletion,
      irrigated,
      deferred,
      irrigationRecorded: recorded != null,
      rainRecorded: recordedRain.has(w.date),
      netMm,
      grossMm,
      // 1 mm over 1 decare (1000 m²) = 1 m³
      volumeM3: grossMm * areaDecare,
    });
  });

  const sum = (pick: (d: DailyBalance) => number) => days.reduce((s, d) => s + pick(d), 0);

  return {
    tawMm,
    rawMm,
    days,
    totals: {
      et0Mm: sum((d) => d.et0),
      etcMm: sum((d) => d.etc),
      precipitationMm: sum((d) => d.precipitation),
      peffMm: sum((d) => d.peff),
      netMm: sum((d) => d.netMm),
      grossMm: sum((d) => d.grossMm),
      volumeM3: sum((d) => d.volumeM3),
      irrigationCount: days.filter((d) => d.irrigated).length,
    },
  };
}
