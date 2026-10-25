import numpy as np
import pytest

from lib.budget import (
    class_median_curve, deficit_yield_loss, fraction_from_kcb, pump_energy_kwh, seasonal_blue,
    status, target_factor, wetted_fraction_ke,
)
from lib.et import basal_kc


def test_class_median_curve_uses_eligible_fields_of_same_class():
    kcb = np.array([[0.2, 1.0], [0.4, 1.2], [0.9, 0.9], [0.3, 0.3]])
    classes = np.array(["beet", "beet", "beet", "maize"])
    eligible = np.array([True, True, False, True])
    ref = class_median_curve(kcb, classes, eligible)
    np.testing.assert_allclose(ref[:3], [[0.3, 1.1]] * 3)
    np.testing.assert_allclose(ref[3], [0.3, 0.3])


def test_fraction_inverts_basal_kc():
    frac = np.array([[0.0, 0.5, 1.0]])
    kcb = basal_kc(frac, 0.15, np.array([1.15]))
    np.testing.assert_allclose(fraction_from_kcb(kcb, 0.15, np.array([1.15])), frac)


def test_wetted_fraction():
    ke_rain = np.array([[0.1, 0.0]])
    ke_full = np.array([[0.5, 0.4]])
    np.testing.assert_allclose(wetted_fraction_ke(ke_rain, ke_full, 0.35), [[0.24, 0.14]])
    np.testing.assert_allclose(wetted_fraction_ke(ke_rain, ke_full, 1.0), ke_full)


def test_seasonal_blue_only_cropped_days_and_not_negative():
    et = np.array([[5.0, 5.0, 5.0], [1.0, 1.0, 1.0]])
    peff = np.array([[0.0, 2.0, 0.0], [3.0, 3.0, 3.0]])
    cropped = np.array([[True, True, False], [True, True, True]])
    np.testing.assert_allclose(seasonal_blue(et, peff, cropped), [8.0, 0.0])


def test_target_factor():
    k = target_factor(np.array([100.0, 300.0]), 500.0, 0.2)
    assert k * 400 == pytest.approx(400)  # (1 - 0.2) * 500


def test_status_classes():
    out = status(np.array([0.9, 1.0, 1.1, 1.2, np.nan]), 1.0, 1.15)
    assert out.tolist() == ["within", "within", "borderline", "over", "not_assessed"]


def test_pump_energy_matches_prototype_formula():
    # src/engine/pump.ts: E = 9.81 H V / (3600 η); here V is gross = blue / η_irr
    e = pump_energy_kwh(1000.0, 100.0, 0.5, 0.8)
    assert float(e) == pytest.approx(9.81 * 100 * 1250 / (3600 * 0.5))


def test_deficit_yield_loss():
    assert deficit_yield_loss(1.25, 0.1) == pytest.approx(0.125)
