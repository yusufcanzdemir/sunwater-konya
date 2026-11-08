// The farmer's own numbers: pump profile, electricity bill → water, well depth log. Pure maths plus
// browser storage (per field). The plan uses the pump profile instead of the demo defaults.

import type { IrrigationMethod } from '../engine/waterBalance';
import type { EnergySource } from '../engine/impact';
import type { FarmForm } from '../state/farm';

/** ρ·g for water, N/m³. */
const RHO_G = 9810;
/** Pump + motor efficiency when the farmer does not know it (same as the demo farm). */
export const DEFAULT_PUMP_EFFICIENCY = 0.5;
/** Pumping head of the demo farm, m (used when no profile is saved). */
export const DEFAULT_HEAD_M = 120;

export interface PumpProfile {
  /** Total pumping head ≈ water depth in the well plus a little for pipes, m. */
  headM: number;
  /** Rated power of the pump, kW. */
  pumpKw: number;
  energy: EnergySource;
  method: IrrigationMethod;
  /** Solar panel power, kWp (solar only). */
  pvKwp: number | null;
}

/** Pump flow from its power and head: Q = P·η / (ρ·g·H), in m³/h. */
export function flowFromPower(pumpKw: number, headM: number, eff = DEFAULT_PUMP_EFFICIENCY): number {
  return ((pumpKw * 1000 * eff) / (RHO_G * headM)) * 3600;
}

/** Water lifted by `kwh` of electricity at `headM`: V = E·η / (ρ·g·H), in m³. */
export function pumpedM3FromKwh(kwh: number, headM: number, eff = DEFAULT_PUMP_EFFICIENCY): number {
  return (kwh * 3.6e6 * eff) / (RHO_G * headM);
}

/** Electricity to lift `m3` at `headM`, kWh (inverse of pumpedM3FromKwh). */
export function kwhForM3(m3: number, headM: number, eff = DEFAULT_PUMP_EFFICIENCY): number {
  return (m3 * RHO_G * headM) / (3.6e6 * eff);
}

/** The engine form fields the profile replaces (the rest stays the demo default). */
export function profileForm(p: PumpProfile): Partial<FarmForm> {
  const dec = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
  return {
    wellHeadM: dec(p.headM),
    pumpFlowM3h: dec(flowFromPower(p.pumpKw, p.headM)),
    pumpEfficiency: dec(DEFAULT_PUMP_EFFICIENCY),
    energySource: p.energy,
    pvKwp: p.energy === 'solar_grid' ? dec(p.pvKwp ?? p.pumpKw * 1.3) : '0',
    irrigationMethod: p.method,
  };
}

export interface WellReading {
  /** ISO date. */
  date: string;
  /** Depth to the water in the well, m. */
  depthM: number;
}

export interface WellTrend {
  /** Metres the water drops per year (positive = deeper). */
  mPerYear: number;
  /** Projected depth in three years from the latest reading, m. */
  in3Years: number;
}

/** Least-squares line through the readings; null with fewer than two readings or less than 30 days apart. */
export function wellTrend(readings: WellReading[]): WellTrend | null {
  if (readings.length < 2) return null;
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = Date.parse(sorted[0].date);
  const xs = sorted.map((r) => (Date.parse(r.date) - t0) / (365.25 * 864e5));
  if (xs[xs.length - 1] < 30 / 365.25) return null;
  const ys = sorted.map((r) => r.depthM);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
  return { mPerYear: slope, in3Years: ys[ys.length - 1] + 3 * slope };
}

// ---------- browser storage (per field) ----------

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode: kept for this visit only
  }
}

export const loadProfile = (fieldId: string) => read<PumpProfile>(`sunwater.pump.${fieldId}`);
export const saveProfile = (fieldId: string, p: PumpProfile) => write(`sunwater.pump.${fieldId}`, p);
export const loadWell = (fieldId: string) => read<WellReading[]>(`sunwater.well.${fieldId}`) ?? [];
export const saveWell = (fieldId: string, r: WellReading[]) => write(`sunwater.well.${fieldId}`, r);
