// Farm form: raw string values as typed, demo defaults, and validation into typed input.

import { CROPS, type CropId } from '../engine/crops';
import { isIsoDate } from '../engine/dates';
import type { SoilId } from '../engine/soil';
import type { IrrigationMethod } from '../engine/waterBalance';

export type EnergySource = 'solar_grid' | 'grid' | 'diesel';

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
    habitIntervalDays: '7',
    habitHours: '24',
    electricityPriceTlKwh: '',
    dieselPriceTlL: '',
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
