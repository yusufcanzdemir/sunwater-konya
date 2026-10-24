import numpy as np
import pytest

from lib.config import load_config
from lib.periods import dekads
from lib.phenology import count_dips, name_curve

PERIODS = dekads(2025, "03-01", "10-31")  # d01 = Mar 1-10 ... d24 = Oct 21-31


@pytest.fixture(scope="module")
def rules():
    return load_config()["classify"]["rules"]


def curve(points: dict[int, float], base: float = 0.15) -> np.ndarray:
    """24-dekad curve: linear between {dekad index: value} anchors."""
    x = sorted(points)
    return np.interp(np.arange(24), x, [points[i] for i in x], left=base, right=base)


NDMI_DRY = np.full(24, -0.05)
NDMI_WET = np.full(24, 0.35)

CASES = {
    "fallow": (curve({0: 0.12, 23: 0.15}), NDMI_DRY),
    # Apr-May peak 0.85, harvested by July, nothing after
    "irrigated_winter_cereal": (curve({2: 0.2, 7: 0.85, 11: 0.5, 13: 0.18, 23: 0.15}), NDMI_WET),
    # lower, earlier peak, dry
    "rainfed_winter_cereal": (curve({2: 0.2, 6: 0.55, 9: 0.3, 12: 0.17, 23: 0.15}), NDMI_DRY),
    # cereal, then second crop greening Aug-Oct
    "cereal_second_crop": (curve({2: 0.2, 7: 0.85, 12: 0.2, 14: 0.18, 19: 0.6, 22: 0.85, 23: 0.8}), NDMI_WET),
    # cereal with small weedy regrowth bumps after harvest (not alfalfa)
    "irrigated_winter_cereal_early": (
        curve({2: 0.4, 4: 0.6, 7: 0.85, 11: 0.5, 13: 0.15, 15: 0.35, 16: 0.15, 18: 0.35, 19: 0.15, 23: 0.15}),
        NDMI_WET,
    ),
    # early harvest in June, long second crop green again from July
    "cereal_second_crop_early": (curve({2: 0.45, 5: 0.66, 9: 0.6, 11: 0.13, 14: 0.7, 16: 0.85, 21: 0.78, 23: 0.6}), NDMI_WET),
    # bare in May, green June-October
    "sugar_beet": (curve({5: 0.15, 7: 0.25, 10: 0.7, 13: 0.88, 20: 0.85, 23: 0.7}), NDMI_WET),
    # bare in May, peak late Jul-Aug, declining in September
    "maize": (curve({6: 0.15, 9: 0.3, 13: 0.8, 16: 0.88, 19: 0.6, 21: 0.35, 23: 0.25}), NDMI_WET),
    # bare in May, peak early July, fast drop in August
    "sunflower": (curve({7: 0.15, 10: 0.5, 13: 0.8, 15: 0.6, 17: 0.3, 23: 0.15}), NDMI_WET),
    # green in April, repeated cuts
    "alfalfa": (curve({2: 0.3, 4: 0.6, 8: 0.85, 9: 0.4, 12: 0.85, 13: 0.4, 16: 0.85, 17: 0.4, 20: 0.8, 23: 0.6}), NDMI_WET),
}


@pytest.mark.parametrize("expected", CASES)
def test_rules_name_typical_curves(expected, rules):
    ndvi, ndmi = CASES[expected]
    name, reason = name_curve(PERIODS, ndvi, ndmi, rules)
    assert name == expected.removesuffix("_early"), reason


def test_green_field_with_shallow_dip_is_not_a_cereal(rules):
    # Mean of many alfalfa fields: cuts average out into a shallow summer dip (0.58)
    ndvi = curve({0: 0.4, 3: 0.83, 5: 0.7, 7: 0.76, 10: 0.58, 12: 0.72, 15: 0.74, 19: 0.75, 23: 0.67})
    name, reason = name_curve(PERIODS, ndvi, NDMI_WET, rules)
    assert "cereal" not in name, reason


def test_count_dips():
    assert count_dips(np.array([0.8, 0.4, 0.8, 0.4, 0.8]), 0.12) == 2
    assert count_dips(np.array([0.8, 0.75, 0.8]), 0.12) == 0
