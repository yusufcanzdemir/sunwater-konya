"""Actual ET from NDVI: scaled-NDVI basal crop coefficient plus simplified soil evaporation.

Arrays are (fields, days) unless noted. FAO-56 = Allen et al. (1998).
"""

import numpy as np
from scipy.signal import savgol_filter


def smooth_dekads(x: np.ndarray, window: int, polyorder: int) -> np.ndarray:
    """Savitzky-Golay along time (axis 1) of (fields, dekads)."""
    return savgol_filter(x, window, polyorder, axis=1, mode="interp")


def interpolation_matrix(src_t: np.ndarray, dst_t: np.ndarray) -> np.ndarray:
    """(len(dst), len(src)) linear interpolation weights; flat beyond the ends."""
    w = np.zeros((len(dst_t), len(src_t)))
    for i, t in enumerate(dst_t):
        j = np.searchsorted(src_t, t)
        if j == 0:
            w[i, 0] = 1
        elif j >= len(src_t):
            w[i, -1] = 1
        else:
            a = (t - src_t[j - 1]) / (src_t[j] - src_t[j - 1])
            w[i, j - 1], w[i, j] = 1 - a, a
    return w


def scaled_fraction(ndvi: np.ndarray, ndvi_min: float, ndvi_max: float) -> np.ndarray:
    """(NDVI - NDVI_min) / (NDVI_max - NDVI_min), clamped to [0, 1]."""
    return np.clip((ndvi - ndvi_min) / (ndvi_max - ndvi_min), 0.0, 1.0)


def basal_kc(fraction: np.ndarray, kcb_min: float, kcb_max: np.ndarray) -> np.ndarray:
    """Kcb = Kcb_min + (Kcb_max - Kcb_min) * fraction; kcb_max per field (fields,)."""
    return kcb_min + (np.asarray(kcb_max)[:, None] - kcb_min) * fraction


def soil_evaporation(kcb: np.ndarray, fraction: np.ndarray, wet: np.ndarray,
                     kc_max: float, decay_days: float) -> np.ndarray:
    """Ke = min(Kr * (Kc_max - Kcb), few * Kc_max) with Kr = exp(-days since wetting / decay).

    `fraction` approximates canopy cover fc, so few = 1 - fc. Before the first wetting the
    surface is taken as dry (Kr = 0).
    """
    n, d = kcb.shape
    since = np.full(n, np.inf)
    kr = np.zeros((n, d))
    for t in range(d):
        since = np.where(wet[:, t], 0.0, since + 1)
        kr[:, t] = np.exp(-since / decay_days)
    return np.minimum(kr * np.maximum(kc_max - kcb, 0.0), (1 - fraction) * kc_max)


def irrigation_wetting(kcb: np.ndarray, irrigated: np.ndarray, interval: int,
                       crop_present_kcb: float) -> np.ndarray:
    """Assumed irrigation days: every `interval` days while Kcb shows a crop, irrigated fields only."""
    days = np.arange(kcb.shape[1])
    schedule = (days % interval == 0)[None, :]
    return irrigated[:, None] & schedule & (kcb > crop_present_kcb)


def cap_to_supply(et: np.ndarray, supply_mm: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Scale each field's daily ET so the season total does not exceed supply_mm (fields,)."""
    total = et.sum(axis=1)
    factor = np.where(total > supply_mm, supply_mm / np.maximum(total, 1e-9), 1.0)
    return et * factor[:, None], factor < 1.0


def cumulative_blue(et: np.ndarray, peff: np.ndarray) -> np.ndarray:
    """Running blue-water use: max(0, cumulative ET - cumulative Peff), never decreasing."""
    raw = np.maximum(np.cumsum(et, axis=1) - np.cumsum(peff, axis=1), 0.0)
    return np.maximum.accumulate(raw, axis=1)
