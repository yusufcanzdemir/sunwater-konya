// Soil water holding properties – APPROXIMATE, editable in the UI.

export type SoilId = 'clay_loam' | 'loam' | 'sandy_loam' | 'clay';

export interface SoilParams {
  id: SoilId;
  name: string;
  /** Volumetric water content at field capacity θFC (m³/m³). */
  thetaFc: number;
  /** Volumetric water content at wilting point θWP (m³/m³). */
  thetaWp: number;
}

export const SOIL_IDS: SoilId[] = ['clay_loam', 'loam', 'sandy_loam', 'clay'];

export const SOILS: Record<SoilId, SoilParams> = {
  clay_loam: { id: 'clay_loam', name: 'Killi tın', thetaFc: 0.32, thetaWp: 0.17 },
  loam: { id: 'loam', name: 'Tın', thetaFc: 0.27, thetaWp: 0.12 },
  sandy_loam: { id: 'sandy_loam', name: 'Kumlu tın', thetaFc: 0.18, thetaWp: 0.08 },
  clay: { id: 'clay', name: 'Kil', thetaFc: 0.38, thetaWp: 0.24 },
};

/** TAW (mm) = 1000 × (θFC − θWP) × Zr */
export function totalAvailableWater(soil: SoilParams, rootDepthM: number): number {
  return 1000 * (soil.thetaFc - soil.thetaWp) * rootDepthM;
}

/** RAW (mm) = p × TAW */
export function readilyAvailableWater(tawMm: number, p: number): number {
  return p * tawMm;
}
