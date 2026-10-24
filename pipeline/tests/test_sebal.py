import math

import pytest

from lib.sebal import (
    aero_resistance, daily_et_mm, dt_coefficients, friction_velocity, latent_heat, psi,
    rn24_slob, solve_hot_pixel, wind_at_blend,
)


def test_neutral_profile():
    # Neutral: u* = k u200 / ln(200 / zom); rah = ln(2 / 0.1) / (u* k)
    u_star = friction_velocity(8.0, 0.1)
    assert u_star == pytest.approx(0.41 * 8 / math.log(2000))
    assert aero_resistance(u_star) == pytest.approx(math.log(20) / (u_star * 0.41))


def test_stability_signs():
    psi_m, psi_h = psi(200, -50)  # unstable: positive corrections
    assert psi_m > 0 and psi_h > 0
    psi_m, psi_h = psi(2, 50)  # stable: negative
    assert psi_m < 0 and psi_h < 0
    assert psi(2, 0) == (0.0, 0.0)


def test_hot_pixel_converges_and_unstable_lowers_rah():
    u200 = wind_at_blend(3.0)
    dt, rah, L = solve_hot_pixel(h_hot=400, ts_hot=320, zom_hot=0.01, u_blend=u200, rho=0.98)
    neutral_rah = aero_resistance(friction_velocity(u200, 0.01))
    assert L < 0  # afternoon hot surface is unstable
    assert rah < neutral_rah  # convection reduces resistance
    assert dt == pytest.approx(400 * rah / (0.98 * 1004))
    dt2, rah2, _ = solve_hot_pixel(400, 320, 0.01, u200, 0.98, iterations=30)
    assert rah2 == pytest.approx(rah, rel=1e-3)  # converged


def test_dt_line_through_anchors():
    a, b = dt_coefficients(ts_cold=300, ts_hot=320, dt_hot=10)
    assert a + b * 300 == pytest.approx(0)
    assert a + b * 320 == pytest.approx(10)


def test_daily_et_units():
    # EF 1 with 150 W/m² daily net radiation at 20 °C ~ 5.3 mm/day
    et = daily_et_mm(1.0, 150.0, 20.0)
    assert float(et) == pytest.approx(150 * 86400 / latent_heat(20), rel=1e-9)
    assert 5.0 < float(et) < 5.6


def test_rn24_slob():
    assert float(rn24_slob(0.2, 300.0, 400.0)) == pytest.approx(0.8 * 300 - 110 * 0.75)
