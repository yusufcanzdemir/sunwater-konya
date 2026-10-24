import numpy as np
import pytest

from lib.fao56 import effective_rain, et0_penman_monteith, sat_vapour_pressure, wind_at_2m


def test_saturation_vapour_pressure_table_value():
    # FAO-56 Annex 2, Table 2.3: e°(20 °C) = 2.338 kPa
    assert float(sat_vapour_pressure(20.0)) == pytest.approx(2.338, abs=0.001)


def test_wind_conversion_example_14():
    # FAO-56 Example 14: 3.2 m/s at 10 m -> 2.4 m/s at 2 m
    assert float(wind_at_2m(3.2, 10)) == pytest.approx(2.4, abs=0.01)


def test_penman_monteith_example_18():
    # FAO-56 Example 18 (Uccle, 6 July): ET0 = 3.9 mm/day
    et0 = et0_penman_monteith(tmax_c=21.5, tmin_c=12.3, ea_kpa=1.409, u2_ms=2.078,
                              rn_mj=13.28, pressure_kpa=100.1)
    assert float(et0) == pytest.approx(3.9, abs=0.05)


def test_effective_rain_rule_matches_web_engine():
    # src/engine/waterBalance.ts DEFAULT_RAIN_RULE = { thresholdMm: 5, factor: 0.8 }
    assert effective_rain(np.array([0, 4.9, 5, 10]), 5, 0.8).tolist() == [0, 0, 4.0, 8.0]


def test_extraterrestrial_radiation_example_8():
    # FAO-56 Example 8: 20°S, 3 September (J = 246) -> Ra = 32.2 MJ m-2 day-1
    from lib.fao56 import extraterrestrial_radiation

    assert float(extraterrestrial_radiation(-20.0, 246)) == pytest.approx(32.2, abs=0.1)


def test_net_longwave_example_11():
    # FAO-56 Example 11 (22°42'S, 15 May, Rs = 14.5, Rso = 18.8 at sea level):
    # Rnl = 3.5 and Rn = 0.77 * 14.5 - 3.5 = 7.7 MJ m-2 day-1
    from lib.fao56 import extraterrestrial_radiation, net_radiation_reference

    lat, doy = -(22 + 42 / 60), 135
    rso = 0.75 * float(extraterrestrial_radiation(lat, doy))
    assert rso == pytest.approx(18.8, abs=0.2)
    rn = net_radiation_reference(14.5, 25.1, 19.1, 2.1, lat, doy, 0.0)
    assert float(rn) == pytest.approx(7.7, abs=0.1)
