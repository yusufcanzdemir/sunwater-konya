import numpy as np
import pytest

from lib.et import (
    basal_kc, cap_to_supply, cumulative_blue, interpolation_matrix, irrigation_wetting,
    scaled_fraction, smooth_dekads, soil_evaporation,
)


def test_interpolation_matrix_is_linear_and_flat_at_ends():
    w = interpolation_matrix(np.array([0.0, 10.0]), np.array([-5.0, 0.0, 2.5, 10.0, 15.0]))
    y = w @ np.array([1.0, 3.0])
    assert y.tolist() == [1.0, 1.0, 1.5, 3.0, 3.0]


def test_smoothing_keeps_a_straight_line():
    x = np.linspace(0.1, 0.8, 24)[None, :]
    assert np.allclose(smooth_dekads(x, 5, 2), x)


def test_scaled_ndvi_kcb():
    frac = scaled_fraction(np.array([[0.1, 0.15, 0.5, 0.85, 0.95]]), 0.15, 0.85)
    assert frac.tolist() == [[0.0, 0.0, 0.5, 1.0, 1.0]]
    kcb = basal_kc(frac, 0.15, np.array([1.15]))
    assert kcb[0].tolist() == pytest.approx([0.15, 0.15, 0.65, 1.15, 1.15])


def test_soil_evaporation_decays_after_wetting_and_is_limited_by_cover():
    kcb = np.full((2, 5), 0.15)
    frac = np.array([[0.0] * 5, [0.9] * 5])
    wet = np.zeros((2, 5), bool)
    wet[:, 1] = True
    ke = soil_evaporation(kcb, frac, wet, 1.2, 3.0)
    assert ke[0, 0] == 0  # dry before the first wetting
    assert ke[0, 1] == pytest.approx(1.05)  # Kc_max - Kcb on the wetting day
    assert ke[0, 2] == pytest.approx(1.05 * np.exp(-1 / 3))
    assert ke[1, 1] == pytest.approx(0.1 * 1.2)  # only 10% of the soil is exposed


def test_irrigation_only_for_irrigated_fields_with_a_crop():
    kcb = np.array([[0.2, 0.2, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]])
    wet = irrigation_wetting(kcb, np.array([True, False]), 2, 0.3)
    assert wet.tolist() == [[False, False, True, False], [False, False, False, False]]


def test_cap_to_supply_scales_only_excess():
    et = np.array([[2.0, 2.0], [1.0, 1.0]])
    capped, flag = cap_to_supply(et, np.array([3.0, 3.0]))
    assert capped.sum(axis=1).tolist() == [3.0, 2.0]
    assert flag.tolist() == [True, False]


def test_cumulative_blue_never_decreases():
    et = np.array([[1.0, 1.0, 1.0, 1.0]])
    peff = np.array([[0.0, 0.0, 4.0, 0.0]])
    assert cumulative_blue(et, peff)[0].tolist() == [1.0, 2.0, 2.0, 2.0]
