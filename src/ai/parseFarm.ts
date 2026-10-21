// Shape of /api/parse-farm output, its sanitising, and mapping into the form.
// Pure: shared by the serverless function and the browser.

import { CROP_IDS, type CropId } from '../engine/crops.js';
import { isIsoDate } from '../engine/dates.js';
import type { EnergySource } from '../engine/impact.js';
import { IRRIGATION_METHODS, type IrrigationMethod } from '../engine/waterBalance.js';
import type { FarmForm } from '../state/farm.js';

export interface ParsedFarm {
  location_text: string | null;
  crop: CropId | null;
  planting_date: string | null;
  area_decare: number | null;
  irrigation_method: IrrigationMethod | null;
  well_head_m: number | null;
  pump_flow_m3h: number | null;
  pv_kwp: number | null;
  energy_source: EnergySource | null;
  habit_interval_days: number | null;
  habit_hours: number | null;
  missing_fields: string[];
  follow_up_question: string;
}

const ENERGY_SOURCES: EnergySource[] = ['solar_grid', 'grid', 'diesel'];

export const MAX_FARM_TEXT_LENGTH = 2000;

const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]) =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;

/** Drops anything that does not match the schema (wrong enum, non-positive number, bad date). */
export function sanitizeParsedFarm(raw: unknown): ParsedFarm {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const date = str(r.planting_date);
  return {
    location_text: str(r.location_text),
    crop: oneOf(r.crop, CROP_IDS),
    planting_date: date && isIsoDate(date) ? date : null,
    area_decare: num(r.area_decare),
    irrigation_method: oneOf(r.irrigation_method, IRRIGATION_METHODS),
    well_head_m: num(r.well_head_m),
    pump_flow_m3h: num(r.pump_flow_m3h),
    pv_kwp: num(r.pv_kwp),
    energy_source: oneOf(r.energy_source, ENERGY_SOURCES),
    habit_interval_days: num(r.habit_interval_days),
    habit_hours: num(r.habit_hours),
    missing_fields: Array.isArray(r.missing_fields) ? r.missing_fields.filter((f): f is string => typeof f === 'string') : [],
    follow_up_question: str(r.follow_up_question) ?? '',
  };
}

const formNumber = (n: number) => String(n).replace('.', ',');

/**
 * Values found in the text go into the form; fields the text did not mention are
 * returned as `missing` so the UI can highlight them. Existing form values are kept for those.
 */
export function parsedFarmToForm(p: ParsedFarm): { patch: Partial<FarmForm>; missing: (keyof FarmForm)[] } {
  const patch: Partial<FarmForm> = {};
  const missing: (keyof FarmForm)[] = [];
  const set = <K extends keyof FarmForm>(key: K, value: FarmForm[K] | null) => {
    if (value == null) missing.push(key);
    else patch[key] = value;
  };
  const setNum = (key: keyof FarmForm, value: number | null) => set(key, value == null ? null : formNumber(value));

  set('locationText', p.location_text);
  set('crop', p.crop);
  set('plantingDate', p.planting_date);
  setNum('areaDecare', p.area_decare);
  set('irrigationMethod', p.irrigation_method);
  setNum('wellHeadM', p.well_head_m);
  setNum('pumpFlowM3h', p.pump_flow_m3h);
  set('energySource', p.energy_source);
  // PV power only matters for a solar system.
  if (p.pv_kwp != null || p.energy_source == null || p.energy_source === 'solar_grid') setNum('pvKwp', p.pv_kwp);
  setNum('habitIntervalDays', p.habit_interval_days);
  setNum('habitHours', p.habit_hours);
  return { patch, missing };
}
