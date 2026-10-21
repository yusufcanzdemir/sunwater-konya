// Crop coefficients – APPROXIMATE values after FAO-56 Tables 11–12.
// They are assumptions and are editable in the UI.

export type CropId = 'sugar_beet' | 'maize' | 'sunflower' | 'wheat';

export interface CropStages {
  ini: number;
  dev: number;
  mid: number;
  late: number;
}

export interface CropParams {
  id: CropId;
  name: string;
  kcIni: number;
  kcMid: number;
  kcEnd: number;
  /** Stage lengths in days. */
  stages: CropStages;
  /** Effective root depth Zr (m). */
  rootDepthM: number;
  /** Soil water depletion fraction p (RAW = p × TAW). */
  p: number;
  /** Default planting / irrigation-season start as MM-DD (assumption). */
  defaultStart: string;
}

export const CROP_IDS: CropId[] = ['sugar_beet', 'maize', 'sunflower', 'wheat'];

export const CROPS: Record<CropId, CropParams> = {
  sugar_beet: {
    id: 'sugar_beet',
    name: 'Şeker pancarı',
    kcIni: 0.35,
    kcMid: 1.2,
    kcEnd: 0.7,
    stages: { ini: 30, dev: 45, mid: 60, late: 45 },
    rootDepthM: 1.0,
    p: 0.55,
    defaultStart: '04-20',
  },
  maize: {
    id: 'maize',
    name: 'Mısır (dane)',
    kcIni: 0.3,
    kcMid: 1.2,
    kcEnd: 0.35,
    stages: { ini: 30, dev: 40, mid: 50, late: 30 },
    rootDepthM: 1.0,
    p: 0.55,
    defaultStart: '05-05',
  },
  sunflower: {
    id: 'sunflower',
    name: 'Ayçiçeği',
    kcIni: 0.35,
    kcMid: 1.05,
    kcEnd: 0.35,
    stages: { ini: 25, dev: 35, mid: 45, late: 25 },
    rootDepthM: 1.0,
    p: 0.45,
    defaultStart: '05-01',
  },
  wheat: {
    id: 'wheat',
    name: 'Buğday (ilkbahar sulama dönemi)',
    kcIni: 0.4,
    kcMid: 1.15,
    kcEnd: 0.3,
    stages: { ini: 20, dev: 25, mid: 60, late: 30 },
    rootDepthM: 1.0,
    p: 0.55,
    defaultStart: '04-01',
  },
};

export function seasonLength(crop: CropParams): number {
  const { ini, dev, mid, late } = crop.stages;
  return ini + dev + mid + late;
}

export type CropStage = 'ini' | 'dev' | 'mid' | 'late' | 'after';

export function stageOnDay(crop: CropParams, day: number): CropStage {
  const { ini, dev, mid, late } = crop.stages;
  if (day < ini) return 'ini';
  if (day < ini + dev) return 'dev';
  if (day < ini + dev + mid) return 'mid';
  if (day < ini + dev + mid + late) return 'late';
  return 'after';
}

/**
 * Crop coefficient on `day` (0 = planting day).
 * Constant Kc_ini → linear rise during dev → constant Kc_mid → linear fall to Kc_end.
 * Day 0 of dev equals Kc_ini, day 0 of mid equals Kc_mid, and the season end equals Kc_end.
 */
export function kcOnDay(crop: CropParams, day: number): number {
  const { ini, dev, mid, late } = crop.stages;
  const devStart = ini;
  const midStart = ini + dev;
  const lateStart = ini + dev + mid;
  const end = lateStart + late;

  if (day < devStart) return crop.kcIni;
  if (day < midStart) return crop.kcIni + ((day - devStart) / dev) * (crop.kcMid - crop.kcIni);
  if (day < lateStart) return crop.kcMid;
  if (day < end) return crop.kcMid + ((day - lateStart) / late) * (crop.kcEnd - crop.kcMid);
  return crop.kcEnd;
}
