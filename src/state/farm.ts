// Farm form: raw string values as typed, demo defaults, and validation into typed input.

import { CROP_IDS, CROPS, type CropId } from '../engine/crops';
import { isIsoDate } from '../engine/dates';
import type { EnergySource } from '../engine/impact';
import type { FarmParams } from '../engine/plan';
import { SOIL_IDS, type SoilId } from '../engine/soil';
import { IRRIGATION_METHODS, type IrrigationMethod } from '../engine/waterBalance';
import type { Assumptions } from './assumptions';

export type { EnergySource };

export const ENERGY_SOURCE_NAMES: Record<EnergySource, string> = {
  solar_grid: 'Güneş + şebeke',
  grid: 'Şebeke',
  diesel: 'Dizel',
};

export const KONYA_DISTRICTS = [
  'Karapınar', 'Ereğli', 'Çumra', 'Cihanbeyli', 'Kulu', 'Altınekin', 'Sarayönü', 'Kadınhanı',
  'Ilgın', 'Akşehir', 'Beyşehir', 'Seydişehir', 'Emirgazi', 'Halkapınar', 'Çeltik', 'Yunak',
  'Doğanhisar', 'Hüyük', 'Derbent', 'Bozkır', 'Güneysınır', 'Akören', 'Tuzlukçu', 'Yalıhüyük',
  'Meram', 'Selçuklu', 'Karatay',
];

export interface FarmForm {
  locationText: string;
  crop: CropId | '';
  plantingDate: string;
  areaDecare: string;
  irrigationMethod: IrrigationMethod | '';
  soil: SoilId | '';
  wellHeadM: string;
  pumpFlowM3h: string;
  pumpEfficiency: string;
  energySource: EnergySource | '';
  pvKwp: string;
  habitIntervalDays: string;
  habitHours: string;
  electricityPriceTlKwh: string;
  dieselPriceTlL: string;
}

export interface FarmInput {
  locationText: string;
  crop: CropId;
  plantingDate: string;
  areaDecare: number;
  irrigationMethod: IrrigationMethod;
  soil: SoilId;
  wellHeadM: number;
  pumpFlowM3h: number;
  pumpEfficiency: number;
  energySource: EnergySource;
  pvKwp: number;
  habitIntervalDays: number | null;
  habitHours: number | null;
  electricityPriceTlKwh: number | null;
  dieselPriceTlL: number | null;
}

export const EMPTY_FORM: FarmForm = {
  locationText: '',
  crop: '',
  plantingDate: '',
  areaDecare: '',
  irrigationMethod: '',
  soil: '',
  wellHeadM: '',
  pumpFlowM3h: '',
  pumpEfficiency: '',
  energySource: '',
  pvKwp: '',
  habitIntervalDays: '',
  habitHours: '',
  electricityPriceTlKwh: '',
  dieselPriceTlL: '',
};

export function defaultPlantingDate(crop: CropId, year: number): string {
  return `${year}-${CROPS[crop].defaultStart}`;
}

/** Demo field: fills the form only – weather is always fetched live. Prices stay for the user. */
export function demoForm(year: number): FarmForm {
  return {
    locationText: 'Karapınar',
    crop: 'sugar_beet',
    plantingDate: defaultPlantingDate('sugar_beet', year),
    areaDecare: '100',
    irrigationMethod: 'flood',
    soil: 'clay_loam',
    wellHeadM: '120',
    pumpFlowM3h: '60',
    pumpEfficiency: '0,50',
    energySource: 'solar_grid',
    pvKwp: '50',
    habitIntervalDays: '1',
    habitHours: '20',
    electricityPriceTlKwh: '',
    dieselPriceTlL: '',
  };
}

/** Re-validates a FarmInput that arrives as JSON (e.g. on the server). */
export function sanitizeFarmInput(raw: unknown): FarmInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const opt = (v: unknown) => (v == null ? null : pos(v));
  const crop = CROP_IDS.find((id) => id === r.crop);
  const soil = SOIL_IDS.find((id) => id === r.soil);
  const method = IRRIGATION_METHODS.find((m) => m === r.irrigationMethod);
  const energy = (Object.keys(ENERGY_SOURCE_NAMES) as EnergySource[]).find((e) => e === r.energySource);
  const date = typeof r.plantingDate === 'string' && isIsoDate(r.plantingDate) ? r.plantingDate : null;
  const location = typeof r.locationText === 'string' ? r.locationText.trim().slice(0, 100) : '';
  const [area, head, flow, eff] = [r.areaDecare, r.wellHeadM, r.pumpFlowM3h, r.pumpEfficiency].map(pos);
  if (!crop || !soil || !method || !energy || !date || !location || !area || !head || !flow || !eff || eff > 1) return null;
  return {
    locationText: location,
    crop,
    plantingDate: date,
    areaDecare: area,
    irrigationMethod: method,
    soil,
    wellHeadM: head,
    pumpFlowM3h: flow,
    pumpEfficiency: eff,
    energySource: energy,
    pvKwp: pos(r.pvKwp) ?? 0,
    habitIntervalDays: opt(r.habitIntervalDays),
    habitHours: opt(r.habitHours),
    electricityPriceTlKwh: opt(r.electricityPriceTlKwh),
    dieselPriceTlL: opt(r.dieselPriceTlL),
  };
}

/** Engine parameters for a validated field under the current assumptions. */
export function toFarmParams(input: FarmInput, a: Assumptions): FarmParams {
  return {
    crop: a.crops[input.crop],
    soil: a.soils[input.soil],
    irrigationEfficiency: a.efficiency[input.irrigationMethod],
    areaDecare: input.areaDecare,
    wellHeadM: input.wellHeadM,
    pumpFlowM3h: input.pumpFlowM3h,
    pumpEfficiency: input.pumpEfficiency,
    energySource: input.energySource,
    pvKwp: input.pvKwp,
    habit:
      input.habitIntervalDays != null && input.habitHours != null
        ? { intervalDays: input.habitIntervalDays, hours: input.habitHours }
        : null,
    electricityPriceTlKwh: input.electricityPriceTlKwh,
    dieselPriceTlL: input.dieselPriceTlL,
  };
}

/** Accepts Turkish decimal comma. Returns null for empty or non-numeric text. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export type FormErrors = Partial<Record<keyof FarmForm, string>>;

export function validateFarmForm(form: FarmForm): { input: FarmInput | null; errors: FormErrors } {
  const errors: FormErrors = {};

  const required = (key: keyof FarmForm, label: string) => {
    if (form[key].trim() === '') errors[key] = `${label} gerekli.`;
  };
  const positive = (key: keyof FarmForm, label: string, max = Infinity): number => {
    const n = parseNumber(form[key]);
    if (n == null) errors[key] = `${label} için sayı girin.`;
    else if (n <= 0 || n > max) errors[key] = `${label} geçerli aralıkta değil.`;
    return n ?? NaN;
  };
  const optionalPositive = (key: keyof FarmForm, label: string): number | null => {
    if (form[key].trim() === '') return null;
    const n = parseNumber(form[key]);
    if (n == null || n <= 0) {
      errors[key] = `${label} pozitif bir sayı olmalı.`;
      return null;
    }
    return n;
  };

  required('locationText', 'Konum');
  required('crop', 'Ürün');
  required('irrigationMethod', 'Sulama yöntemi');
  required('soil', 'Toprak tipi');
  required('energySource', 'Enerji kaynağı');
  if (!isIsoDate(form.plantingDate)) errors.plantingDate = 'Geçerli bir tarih seçin.';

  const areaDecare = positive('areaDecare', 'Alan');
  const wellHeadM = positive('wellHeadM', 'Basma yüksekliği');
  const pumpFlowM3h = positive('pumpFlowM3h', 'Pompa debisi');
  const pumpEfficiency = positive('pumpEfficiency', 'Pompa-motor verimi', 1);
  const pvKwp = form.energySource === 'solar_grid' ? positive('pvKwp', 'GES gücü') : parseNumber(form.pvKwp) ?? 0;
  const habitIntervalDays = optionalPositive('habitIntervalDays', 'Sulama aralığı');
  const habitHours = optionalPositive('habitHours', 'Sulama süresi');
  const electricityPriceTlKwh = optionalPositive('electricityPriceTlKwh', 'Elektrik fiyatı');
  const dieselPriceTlL = optionalPositive('dieselPriceTlL', 'Dizel fiyatı');

  if (Object.keys(errors).length > 0) return { input: null, errors };

  return {
    errors,
    input: {
      locationText: form.locationText.trim(),
      crop: form.crop as CropId,
      plantingDate: form.plantingDate,
      areaDecare,
      irrigationMethod: form.irrigationMethod as IrrigationMethod,
      soil: form.soil as SoilId,
      wellHeadM,
      pumpFlowM3h,
      pumpEfficiency,
      energySource: form.energySource as EnergySource,
      pvKwp,
      habitIntervalDays,
      habitHours,
      electricityPriceTlKwh,
      dieselPriceTlL,
    },
  };
}
