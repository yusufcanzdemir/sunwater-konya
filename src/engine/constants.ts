// Reference quantities for "what does this amount of water look like" comparisons.

/** Olympic pool: 50 m × 25 m × 2 m. */
export const OLYMPIC_POOL_M3 = 2500;

// TÜİK belediye su istatistikleri, doğrulanacak.
// 2024: municipal network withdrawal ≈ 255 L per person per day (includes network losses).
export const MUNICIPAL_WATER_L_PER_PERSON_DAY = 255;
// TÜİK average household size, doğrulanacak.
export const AVERAGE_HOUSEHOLD_SIZE = 3.14;

export const HOUSEHOLD_ANNUAL_WATER_M3 = (MUNICIPAL_WATER_L_PER_PERSON_DAY / 1000) * AVERAGE_HOUSEHOLD_SIZE * 365;

export interface WaterEquivalents {
  olympicPools: number;
  householdYears: number;
}

export function waterEquivalents(volumeM3: number): WaterEquivalents {
  return { olympicPools: volumeM3 / OLYMPIC_POOL_M3, householdYears: volumeM3 / HOUSEHOLD_ANNUAL_WATER_M3 };
}
