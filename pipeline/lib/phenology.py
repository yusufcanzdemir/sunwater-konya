"""Rule-based crop naming from a seasonal NDVI/NDMI curve (PLAN.md D14).

The rules encode the labelling guide; thresholds come from config (classify.rules) and are
rules of thumb, not calibrated against ground truth. Applied to cluster mean curves.
"""

from datetime import date

import numpy as np
from scipy.signal import find_peaks


def _months(periods: list[tuple[date, date]], months: set[int]) -> np.ndarray:
    return np.array([s.month in months for s, _ in periods])


def count_dips(ndvi: np.ndarray, prominence: float) -> int:
    """Local NDVI minima with at least `prominence` recovery on both sides."""
    dips, _ = find_peaks(-ndvi, prominence=prominence)
    return len(dips)


def name_curve(periods: list[tuple[date, date]], ndvi: np.ndarray, ndmi: np.ndarray,
               rules: dict) -> tuple[str, str]:
    """(class key, reason) for one seasonal curve."""
    r = rules
    m = lambda *months: _months(periods, set(months))  # noqa: E731
    peak = float(ndvi.max())
    if peak < r["fallow_max_ndvi"]:
        return "fallow", f"NDVI never above {r['fallow_max_ndvi']} (max {peak:.2f})"

    april = float(ndvi[m(4)].mean())
    summer_mean = float(ndvi[m(6, 7, 8, 9)].mean())
    dips = count_dips(ndvi[m(5, 6, 7, 8, 9, 10)], r["alfalfa_dip_prominence"])
    # Alfalfa stays green through summer; regrowth wiggles after a cereal harvest do not
    if (april >= r["alfalfa_april_ndvi"] and summer_mean >= r["alfalfa_summer_ndvi"]
            and dips >= r["alfalfa_min_dips"]):
        return "alfalfa", (f"green in April ({april:.2f}) and summer ({summer_mean:.2f}) "
                           f"with {dips} cutting dips")

    may = float(ndvi[m(5)].mean())
    spring_peak = float(ndvi[m(4, 5, 6)].max())
    # Harvest low: early cereals are cut in June, later ones in July
    harvest_min = float(ndvi[m(6, 7)].min())
    late_max = float(ndvi[m(8, 9, 10)].max())
    # A cereal harvest leaves bare soil; a shallow dip in a green field is not a harvest
    if (may >= r["spring_green_may_ndvi"] and harvest_min <= spring_peak - r["cereal_drop"]
            and harvest_min <= r["cereal_harvest_max_ndvi"]):
        if late_max >= r["second_crop_min_ndvi"] and late_max - harvest_min >= r["second_crop_rise"]:
            return "cereal_second_crop", (f"spring peak {spring_peak:.2f}, Jun-Jul low "
                                          f"{harvest_min:.2f}, second rise to {late_max:.2f}")
        ndmi_spring = float(ndmi[m(4, 5, 6)].max())
        if spring_peak >= r["irrigated_cereal_peak"] or (
            spring_peak >= r["irrigated_cereal_peak_with_ndmi"]
            and ndmi_spring >= r["irrigated_cereal_ndmi"]
        ):
            return "irrigated_winter_cereal", (f"spring peak {spring_peak:.2f}, "
                                               f"spring NDMI {ndmi_spring:.2f}")
        return "rainfed_winter_cereal", (f"low spring peak {spring_peak:.2f}, "
                                         f"spring NDMI {ndmi_spring:.2f}")

    summer = m(6, 7, 8, 9, 10)
    summer_peak = float(ndvi[summer].max())
    if may < r["spring_green_may_ndvi"] and summer_peak >= r["summer_min_peak"]:
        sep, octo = float(ndvi[m(9)].mean()), float(ndvi[m(10)].mean())
        if sep >= r["beet_sep_ndvi"] and octo >= r["beet_oct_ndvi"]:
            return "sugar_beet", f"long plateau: September {sep:.2f}, October {octo:.2f}"
        peak_idx = int(np.flatnonzero(summer)[np.argmax(ndvi[summer])])
        end_aug = float(ndvi[np.flatnonzero(m(8))[-1]])
        if periods[peak_idx][0].month <= 7 and end_aug <= summer_peak - r["sunflower_drop"]:
            return "sunflower", f"peak {summer_peak:.2f} by July, end of August {end_aug:.2f}"
        return "maize", f"summer peak {summer_peak:.2f} in {periods[peak_idx][0]:%B}, September {sep:.2f}"

    return "other", f"no rule matched (May {may:.2f}, peak {peak:.2f})"
