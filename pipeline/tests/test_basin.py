import numpy as np
import pandas as pd
import pytest

from lib.basin import anomaly, cm_per_year_to_km3, decimal_year, fit_trend


def test_decimal_year():
    assert decimal_year(["2020-01-01"])[0] == pytest.approx(2020.0)
    assert decimal_year(["2021-07-02T12:00"])[0] == pytest.approx(2021.5, abs=1e-3)


def test_anomaly_uses_baseline_mean():
    dates = pd.Series(pd.date_range("2003-01-01", periods=48, freq="MS"))
    values = pd.Series(np.arange(48, dtype=float))
    a = anomaly(values, dates, ("2004-01-01", "2005-01-01"))
    assert a[12:24].mean() == pytest.approx(0)
    assert a[0] == pytest.approx(-17.5)


def test_trend_recovers_slope_through_seasonality():
    t = 2003 + np.arange(240) / 12 + 1 / 24
    rng = np.random.default_rng(1)
    y = -1.5 * (t - 2003) + 4 * np.sin(2 * np.pi * t) + rng.normal(0, 0.5, t.size)
    fit = fit_trend(t, y)
    assert fit["slope"] == pytest.approx(-1.5, abs=0.02)
    assert fit["amplitude_annual"] == pytest.approx(4, abs=0.2)
    assert fit["se"] >= fit["se_ols"]


def test_autocorrelated_noise_widens_se():
    t = 2003 + np.arange(240) / 12
    rng = np.random.default_rng(2)
    e = np.zeros(t.size)
    for i in range(1, t.size):
        e[i] = 0.9 * e[i - 1] + rng.normal()
    fit = fit_trend(t, e)
    assert fit["r1"] > 0.7
    assert fit["se"] > 2.5 * fit["se_ols"]


def test_volume():
    # 1 cm/yr over 58,374 km² ≈ 0.58 km³/yr
    assert cm_per_year_to_km3(1.0, 58374) == pytest.approx(0.58374)
