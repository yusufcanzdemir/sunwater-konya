// Solar PV output from hourly plane-of-array irradiance.

export interface HourlyIrradiance {
  /** Local time label, e.g. 2025-05-01T13:00. Open-Meteo values are the mean of the preceding hour. */
  time: string;
  /** W/m² */
  irradiance: number;
}

export interface HourlyPv {
  time: string;
  pvKw: number;
}

/** Performance ratio (assumption). */
export const DEFAULT_PERFORMANCE_RATIO = 0.8;

/** P_pv (kW) = kWp × GTI / 1000 × PR */
export function pvPowerKw(kwp: number, irradianceWm2: number, performanceRatio = DEFAULT_PERFORMANCE_RATIO): number {
  return (kwp * irradianceWm2 * performanceRatio) / 1000;
}

export function hourlyPvOutput(
  hourly: HourlyIrradiance[],
  kwp: number,
  performanceRatio = DEFAULT_PERFORMANCE_RATIO,
): HourlyPv[] {
  return hourly.map((h) => ({ time: h.time, pvKw: pvPowerKw(kwp, h.irradiance, performanceRatio) }));
}
