"""SEBAL surface energy balance (Bastiaanssen et al. 1998), for validating NDVI-Kc ET.

Scalar functions (numpy) implement the physics and are unit-tested; `sebal_et_image` applies
the same equations to a Landsat Collection 2 Level-2 image in Earth Engine. Hot and cold anchor
pixels are chosen automatically from cropland in the pilot area (low NDVI + hot / high NDVI +
cool). H at the cold pixel is 0 and at the hot pixel equals Rn - G (classic SEBAL).
"""

import math

import numpy as np

K = 0.41  # von Karman
G_ACC = 9.81
CP = 1004.0
SIGMA = 5.67e-8
Z_BLEND = 200.0  # blending height (m)
Z1, Z2 = 0.1, 2.0  # heights of the near-surface temperature difference (m)


def psi_unstable(z: float, L: float) -> tuple[float, float]:
    """(psi_m, psi_h) at height z for L < 0 (Paulson / Webb forms used in SEBAL)."""
    x = (1 - 16 * z / L) ** 0.25
    psi_m = 2 * math.log((1 + x) / 2) + math.log((1 + x * x) / 2) - 2 * math.atan(x) + 0.5 * math.pi
    psi_h = 2 * math.log((1 + x * x) / 2)
    return psi_m, psi_h


def psi(z: float, L: float) -> tuple[float, float]:
    if L < 0:
        return psi_unstable(z, L)
    if L > 0:
        v = -5 * min(z / L, 1.0)  # stable, capped to avoid runaway corrections
        return v, v
    return 0.0, 0.0


def friction_velocity(u_blend: float, zom: float, psi_m_blend: float = 0.0) -> float:
    return K * u_blend / (math.log(Z_BLEND / zom) - psi_m_blend)


def aero_resistance(u_star: float, psi_h_z2: float = 0.0, psi_h_z1: float = 0.0) -> float:
    """rah between Z1 and Z2 (s/m)."""
    return (math.log(Z2 / Z1) - psi_h_z2 + psi_h_z1) / (u_star * K)


def solve_hot_pixel(h_hot: float, ts_hot: float, zom_hot: float, u_blend: float, rho: float,
                    iterations: int = 10) -> tuple[float, float, float]:
    """(dT_hot, rah_hot, L_hot): iterate stability at the hot pixel where H = Rn - G."""
    u_star = friction_velocity(u_blend, zom_hot)
    rah = aero_resistance(u_star)
    L = 0.0
    for _ in range(iterations):
        L = -rho * CP * u_star**3 * ts_hot / (K * G_ACC * h_hot)
        psi_m200, _ = psi(Z_BLEND, L)
        _, psi_h2 = psi(Z2, L)
        _, psi_h01 = psi(Z1, L)
        u_star = friction_velocity(u_blend, zom_hot, psi_m200)
        rah = aero_resistance(u_star, psi_h2, psi_h01)
    return h_hot * rah / (rho * CP), rah, L


def dt_coefficients(ts_cold: float, ts_hot: float, dt_hot: float) -> tuple[float, float]:
    """dT = a + b * Ts through (Ts_cold, 0) and (Ts_hot, dT_hot)."""
    b = dt_hot / (ts_hot - ts_cold)
    return -b * ts_cold, b


def wind_at_blend(u_z: float, z: float = 10.0, zom_station: float = 0.03) -> float:
    """Log-profile extrapolation of station / reanalysis wind to the blending height."""
    return u_z * math.log(Z_BLEND / zom_station) / math.log(z / zom_station)


def latent_heat(t_air_c: float) -> float:
    """λ in J/kg."""
    return (2.501 - 0.002361 * t_air_c) * 1e6


def daily_et_mm(ef, rn24_wm2, t_air_c: float):
    """Daily ET (mm) = EF * Rn24 * 86400 / λ."""
    return np.asarray(ef) * np.asarray(rn24_wm2) * 86400 / latent_heat(t_air_c)


def rn24_slob(albedo, rs24_wm2: float, ra24_wm2: float):
    """Daily net radiation, de Bruin (1987) as used in SEBAL: (1 - α) Rs24 - 110 τsw."""
    tau = rs24_wm2 / ra24_wm2
    return (1 - np.asarray(albedo)) * rs24_wm2 - 110 * tau


# ---------------------------------------------------------------- Earth Engine


def landsat_inputs(ee, img):
    """Surface reflectance, LST (K), NDVI, SAVI, LAI, albedo, emissivity, zom, cloud mask."""
    sr = img.select(["SR_B2", "SR_B4", "SR_B5", "SR_B6", "SR_B7"]).multiply(0.0000275).add(-0.2)
    blue, red, nir, swir1, swir2 = (sr.select(b) for b in ["SR_B2", "SR_B4", "SR_B5", "SR_B6", "SR_B7"])
    ts = img.select("ST_B10").multiply(0.00341802).add(149.0).rename("ts")
    ndvi = nir.subtract(red).divide(nir.add(red)).rename("ndvi")
    savi = nir.subtract(red).multiply(1.5).divide(nir.add(red).add(0.5)).rename("savi")
    lai = (ee.Image(0.69).subtract(savi).divide(0.59).max(1e-3).log().multiply(-1 / 0.91)
           .clamp(0, 6).rename("lai"))
    # Liang (2001) shortwave albedo for OLI / TM bands
    albedo = (blue.multiply(0.356).add(red.multiply(0.130)).add(nir.multiply(0.373))
              .add(swir1.multiply(0.085)).add(swir2.multiply(0.072)).subtract(0.0018)
              .clamp(0.05, 0.6).rename("albedo"))
    emis = lai.multiply(0.01).add(0.95).where(lai.gte(3), 0.98).rename("emis")
    zom = savi.multiply(5.62).add(-5.809).exp().clamp(0.005, 1.0).rename("zom")
    qa = img.select("QA_PIXEL")
    clear = (qa.bitwiseAnd(1 << 1).eq(0).And(qa.bitwiseAnd(1 << 2).eq(0))
             .And(qa.bitwiseAnd(1 << 3).eq(0)).And(qa.bitwiseAnd(1 << 4).eq(0)))
    return ee.Image.cat([ts, ndvi, savi, lai, albedo, emis, zom]).updateMask(clear)


def energy_terms(ee, inp, rs_in: float, rl_in: float):
    """Instantaneous Rn and G (W/m²) from inputs and scalar incoming radiation."""
    ts, albedo, emis, ndvi = (inp.select(b) for b in ["ts", "albedo", "emis", "ndvi"])
    rl_out = emis.multiply(SIGMA).multiply(ts.pow(4))
    rn = (albedo.multiply(-1).add(1).multiply(rs_in)
          .add(rl_in).subtract(rl_out).subtract(emis.multiply(-1).add(1).multiply(rl_in)))
    g_ratio = (ts.subtract(273.15).divide(albedo)
               .multiply(albedo.multiply(0.0038).add(albedo.pow(2).multiply(0.0074)))
               .multiply(ndvi.pow(4).multiply(-0.98).add(1)))
    return rn.rename("rn"), rn.multiply(g_ratio).rename("g")


def pixel_h(ee, ts, zom, a: float, b: float, u_blend: float, rho: float, iterations: int = 6):
    """Sensible heat with per-pixel stability iteration (same equations as the scalar code)."""
    dt = ts.multiply(b).add(a)
    u_star = ee.Image(K * u_blend).divide(ee.Image(Z_BLEND).divide(zom).log())
    rah = ee.Image(math.log(Z2 / Z1)).divide(u_star.multiply(K))
    h = dt.multiply(rho * CP).divide(rah)
    for _ in range(iterations):
        L = u_star.pow(3).multiply(ts).multiply(-rho * CP).divide(h.multiply(K * G_ACC).max(1e-3))

        def x(z):
            return ee.Image(1).subtract(ee.Image(16 * z).divide(L)).pow(0.25)

        x200, x2, x01 = x(Z_BLEND), x(Z2), x(Z1)
        psi_m200 = (x200.add(1).divide(2).log().multiply(2)
                    .add(x200.pow(2).add(1).divide(2).log())
                    .subtract(x200.atan().multiply(2)).add(0.5 * math.pi))
        psi_h2 = x2.pow(2).add(1).divide(2).log().multiply(2)
        psi_h01 = x01.pow(2).add(1).divide(2).log().multiply(2)
        u_star = ee.Image(K * u_blend).divide(ee.Image(Z_BLEND).divide(zom).log().subtract(psi_m200))
        rah = ee.Image(math.log(Z2 / Z1)).subtract(psi_h2).add(psi_h01).divide(u_star.multiply(K))
        h = dt.multiply(rho * CP).divide(rah)
    return h.rename("h")
