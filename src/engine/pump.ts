// Pump hydraulics. 9.81 = ρ·g / 1000 for water (kW per m³/s per m of head).

const RHO_G_KW = 9.81;

/** P (kW) = 9.81 × (Q / 3600) × H / η */
export function pumpPowerKw(flowM3h: number, headM: number, efficiency: number): number {
  return (RHO_G_KW * (flowM3h / 3600) * headM) / efficiency;
}

/** E (kWh) = 9.81 × H × V / (3600 × η) */
export function pumpEnergyKwh(headM: number, volumeM3: number, efficiency: number): number {
  return (RHO_G_KW * headM * volumeM3) / (3600 * efficiency);
}

/** hours = V / Q */
export function pumpHours(volumeM3: number, flowM3h: number): number {
  return volumeM3 / flowM3h;
}
