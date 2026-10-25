"""Basin water-storage series: anomalies, groundwater residual and trends (stage 10).

GRACE gives total water storage anomaly (TWSA). Groundwater anomaly is the residual after the
GLDAS soil moisture, snow and canopy water anomalies are removed (GWSA = TWSA - SMSA - SWEA -
CWA); all anomalies are taken against the same baseline period. The trend is fitted together
with annual and semi-annual harmonics, and its standard error is inflated for lag-1
autocorrelation of the residuals (monthly data are far from independent).
"""

import math

import numpy as np
import pandas as pd


def decimal_year(dates) -> np.ndarray:
    d = pd.to_datetime(pd.Series(dates))
    start = pd.to_datetime(d.dt.year.astype(str) + "-01-01")
    length = np.where(d.dt.is_leap_year, 366.0, 365.0)
    return (d.dt.year + (d - start).dt.total_seconds() / 86400.0 / length).to_numpy()


def anomaly(values: pd.Series, dates: pd.Series, baseline: tuple[str, str]) -> pd.Series:
    """Subtract the mean over [baseline start, baseline end)."""
    d = pd.to_datetime(dates)
    in_base = (d >= pd.Timestamp(baseline[0])) & (d < pd.Timestamp(baseline[1]))
    return values - values[in_base].mean()


def fit_trend(t: np.ndarray, y: np.ndarray) -> dict:
    """OLS y = a + b·t + annual + semi-annual harmonics; b in units of y per year.

    se_b is the OLS standard error times sqrt((1 + r1) / (1 - r1)), r1 the lag-1
    autocorrelation of the residuals in time order (r1 < 0 is not credited).
    """
    ok = np.isfinite(t) & np.isfinite(y)
    t, y = np.asarray(t)[ok], np.asarray(y)[ok]
    order = np.argsort(t)
    t, y = t[order], y[order]
    tc = t - t.mean()
    w = 2 * math.pi * t
    x = np.column_stack([np.ones_like(t), tc, np.cos(w), np.sin(w), np.cos(2 * w), np.sin(2 * w)])
    coef, *_ = np.linalg.lstsq(x, y, rcond=None)
    resid = y - x @ coef
    n, p = x.shape
    s2 = float(resid @ resid) / (n - p)
    se = math.sqrt(s2 * np.linalg.inv(x.T @ x)[1, 1])
    r1 = float(np.corrcoef(resid[:-1], resid[1:])[0, 1]) if n > 3 else 0.0
    r1 = min(max(r1, 0.0), 0.95)
    return {"slope": float(coef[1]), "se": se * math.sqrt((1 + r1) / (1 - r1)), "se_ols": se,
            "r1": r1, "n": int(n), "amplitude_annual": float(math.hypot(coef[2], coef[3])),
            "t0": float(t.mean()), "intercept": float(coef[0])}


def cm_per_year_to_km3(slope_cm: float, area_km2: float) -> float:
    """Equivalent water volume per year: cm × km² → km³ (1 cm = 1e-5 km)."""
    return slope_cm * 1e-5 * area_km2
