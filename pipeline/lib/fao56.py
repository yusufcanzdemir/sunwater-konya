"""FAO-56 helpers (Allen et al. 1998) used by the pipeline.

The web app's water-balance engine (src/engine) takes ET0 from Open-Meteo; Penman-Monteith is
only needed here to cross-check that ET0 against ERA5-Land.
"""

import numpy as np


def sat_vapour_pressure(t_c):
    """e°(T) in kPa (FAO-56 eq. 11)."""
    return 0.6108 * np.exp(17.27 * np.asarray(t_c) / (np.asarray(t_c) + 237.3))


def wind_at_2m(u_z, z_m: float = 10.0):
    """Wind speed at 2 m from height z (FAO-56 eq. 47)."""
    return np.asarray(u_z) * 4.87 / np.log(67.8 * z_m - 5.42)


def extraterrestrial_radiation(lat_deg, doy):
    """Daily Ra in MJ m-2 day-1 (FAO-56 eqs. 21-25)."""
    phi = np.radians(np.asarray(lat_deg, float))
    j = np.asarray(doy, float)
    dr = 1 + 0.033 * np.cos(2 * np.pi * j / 365)
    decl = 0.409 * np.sin(2 * np.pi * j / 365 - 1.39)
    ws = np.arccos(-np.tan(phi) * np.tan(decl))
    return 24 * 60 / np.pi * 0.0820 * dr * (
        ws * np.sin(phi) * np.sin(decl) + np.cos(phi) * np.cos(decl) * np.sin(ws)
    )


def net_radiation_reference(rs_mj, tmax_c, tmin_c, ea_kpa, lat_deg, doy, elevation_m,
                            albedo: float = 0.23):
    """Net radiation of the grass reference surface (FAO-56 eqs. 37-40) from incoming Rs."""
    rso = (0.75 + 2e-5 * elevation_m) * extraterrestrial_radiation(lat_deg, doy)
    ratio = np.clip(np.asarray(rs_mj) / rso, 0.25, 1.0)
    sigma = 4.903e-9
    tk4 = ((np.asarray(tmax_c) + 273.16) ** 4 + (np.asarray(tmin_c) + 273.16) ** 4) / 2
    rnl = sigma * tk4 * (0.34 - 0.14 * np.sqrt(np.asarray(ea_kpa))) * (1.35 * ratio - 0.35)
    return (1 - albedo) * np.asarray(rs_mj) - rnl


def et0_penman_monteith(tmax_c, tmin_c, ea_kpa, u2_ms, rn_mj, pressure_kpa, g_mj=0.0):
    """Daily grass reference ET0 in mm/day (FAO-56 eq. 6), with net radiation given."""
    tmax_c, tmin_c = np.asarray(tmax_c, float), np.asarray(tmin_c, float)
    t = (tmax_c + tmin_c) / 2
    es = (sat_vapour_pressure(tmax_c) + sat_vapour_pressure(tmin_c)) / 2
    delta = 4098 * sat_vapour_pressure(t) / (t + 237.3) ** 2
    gamma = 0.665e-3 * np.asarray(pressure_kpa)
    u2 = np.asarray(u2_ms)
    num = 0.408 * delta * (np.asarray(rn_mj) - g_mj) + gamma * 900 / (t + 273) * u2 * (es - np.asarray(ea_kpa))
    return num / (delta + gamma * (1 + 0.34 * u2))


def effective_rain(p_mm, threshold_mm: float, factor: float):
    """Peff = P < threshold ? 0 : factor * P (same rule as src/engine/waterBalance.ts)."""
    p = np.asarray(p_mm, float)
    return np.where(p < threshold_mm, 0.0, factor * p)
