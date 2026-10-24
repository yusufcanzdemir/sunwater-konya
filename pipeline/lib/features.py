"""Per-field time-series features (numpy only), computed from dekadal index series."""

from datetime import date

import numpy as np


def mid_doy(periods: list[tuple[date, date]]) -> np.ndarray:
    """Day of year at the middle of each [start, end) period."""
    return np.array([
        (s.timetuple().tm_yday + (e - s).days / 2) for s, e in periods
    ], dtype=float)


def harmonic_coefficients(t: np.ndarray, y: np.ndarray, order: int) -> np.ndarray:
    """Least-squares fit y ≈ c0 + Σ_k a_k cos(kωt) + b_k sin(kωt), ω = 2π/365.

    Returns [c0, a1, b1, ..., a_order, b_order]; NaN values in y are ignored.
    """
    ok = ~np.isnan(y)
    w = 2 * np.pi / 365.0
    cols = [np.ones_like(t)]
    for k in range(1, order + 1):
        cols += [np.cos(k * w * t), np.sin(k * w * t)]
    design = np.stack(cols, axis=1)
    if ok.sum() < design.shape[1]:
        return np.full(design.shape[1], np.nan)
    coef, *_ = np.linalg.lstsq(design[ok], y[ok], rcond=None)
    return coef


def green_season_days(periods: list[tuple[date, date]], ndvi: np.ndarray, threshold: float) -> float:
    """Total days of the periods whose NDVI exceeds the threshold."""
    lengths = np.array([(e - s).days for s, e in periods], dtype=float)
    return float(lengths[np.nan_to_num(ndvi, nan=-1) > threshold].sum())


def series_features(periods: list[tuple[date, date]], series: dict[str, np.ndarray],
                    green_threshold: float, harmonics: int) -> dict[str, float]:
    """Summary features of one field. `series` maps index name (NDVI, EVI, NDMI) to values."""
    t = mid_doy(periods)
    out: dict[str, float] = {}
    for name, y in series.items():
        for k, c in enumerate(harmonic_coefficients(t, y, harmonics)):
            out[f"{name}_harm{k}"] = float(c)
    ndvi = series["NDVI"]
    if np.isnan(ndvi).all():
        out.update(NDVI_peak=np.nan, NDVI_peak_doy=np.nan, green_days=np.nan)
    else:
        i = int(np.nanargmax(ndvi))
        out.update(NDVI_peak=float(ndvi[i]), NDVI_peak_doy=float(t[i]),
                   green_days=green_season_days(periods, ndvi, green_threshold))
    summer = np.array([s.month in (7, 8) for s, _ in periods])
    out["NDMI_jul_aug_mean"] = float(np.nanmean(series["NDMI"][summer])) if summer.any() else np.nan
    return out
