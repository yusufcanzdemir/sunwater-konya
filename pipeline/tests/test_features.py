from datetime import date

import numpy as np
import pytest

from lib.features import green_season_days, harmonic_coefficients, mid_doy, series_features
from lib.periods import dekads


def test_mid_doy():
    t = mid_doy([(date(2025, 1, 1), date(2025, 1, 11))])
    assert t[0] == pytest.approx(6.0)


def test_harmonic_fit_recovers_known_curve():
    t = np.arange(60, 300, 10, dtype=float)
    w = 2 * np.pi / 365
    y = 0.4 + 0.2 * np.cos(w * t) - 0.1 * np.sin(w * t) + 0.05 * np.cos(2 * w * t)
    coef = harmonic_coefficients(t, y, 2)
    assert coef == pytest.approx([0.4, 0.2, -0.1, 0.05, 0.0], abs=1e-9)


def test_harmonic_fit_ignores_nan_and_needs_enough_points():
    t = np.arange(5, dtype=float) * 30
    y = np.array([0.1, np.nan, 0.3, np.nan, np.nan])
    assert np.isnan(harmonic_coefficients(t, y, 2)).all()


def test_green_days_counts_period_lengths():
    periods = dekads(2025, "03-01", "03-31")  # 10 + 10 + 11 days
    ndvi = np.array([0.2, 0.5, 0.6])
    assert green_season_days(periods, ndvi, 0.4) == 21


def test_series_features_for_a_winter_cereal_shape():
    periods = dekads(2025, "03-01", "10-31")
    ndvi = np.full(24, 0.15)
    ndvi[4:10] = [0.4, 0.6, 0.8, 0.85, 0.7, 0.45]  # April-May peak
    ndmi = np.full(24, -0.05)
    f = series_features(periods, {"NDVI": ndvi, "EVI": ndvi * 0.8, "NDMI": ndmi}, 0.4, 2)
    assert f["NDVI_peak"] == 0.85
    assert date(2025, 5, 1) <= date.fromordinal(date(2025, 1, 1).toordinal() + int(f["NDVI_peak_doy"]) - 1) <= date(2025, 5, 31)
    # 0.4 is not above the threshold: dekads 6-10 = 10 + 10 + 10 + 11 + 10 days
    assert f["green_days"] == 51
    assert f["NDMI_jul_aug_mean"] == pytest.approx(-0.05)
    assert {"NDVI_harm0", "EVI_harm4", "NDMI_harm2"} <= f.keys()
