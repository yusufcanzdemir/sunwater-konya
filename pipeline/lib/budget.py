"""Field water budget: reference blue-water need, scenarios, status, levers, pump energy (stage 11).

Arrays are (fields, days) unless noted. The reference need uses the same NDVI-Kc / FAO-56
machinery as stage 8 (lib/et.py) with two changes: the basal curve is the class-typical one
(median Kcb of the class on each day) and irrigation wets only a fraction fw of the soil
(efficient method, FAO-56 Table 20).
"""

import numpy as np

RHO_G_KW = 9.81  # same as src/engine/pump.ts


def class_median_curve(kcb: np.ndarray, classes: np.ndarray, eligible: np.ndarray) -> np.ndarray:
    """Each field gets the day-by-day median Kcb of the eligible fields of its class.

    Classes without eligible fields fall back to all fields of the class.
    """
    out = np.empty_like(kcb)
    for cl in np.unique(classes):
        members = classes == cl
        pool = members & eligible
        if not pool.any():
            pool = members
        out[members] = np.median(kcb[pool], axis=0)
    return out


def fraction_from_kcb(kcb: np.ndarray, kcb_min: float, kcb_max: np.ndarray) -> np.ndarray:
    """Inverse of et.basal_kc: canopy-cover proxy from Kcb, clamped to [0, 1]."""
    span = np.maximum(np.asarray(kcb_max)[:, None] - kcb_min, 1e-9)
    return np.clip((kcb - kcb_min) / span, 0.0, 1.0)


def wetted_fraction_ke(ke_rain: np.ndarray, ke_full: np.ndarray, fw: float) -> np.ndarray:
    """Ke when irrigation wets only a fraction fw: rain wets everything, irrigation adds fw."""
    return ke_rain + fw * np.maximum(ke_full - ke_rain, 0.0)


def seasonal_blue(et: np.ndarray, peff: np.ndarray, cropped: np.ndarray) -> np.ndarray:
    """Blue ET (mm) as in stage 8: max(0, Σ (ET - Peff)) over crop-present days (PLAN.md D16)."""
    return np.maximum(((et - peff) * cropped).sum(axis=1), 0.0)


def target_factor(reference_m3: np.ndarray, measured_total_m3: float, reduction: float) -> float:
    """k so that Σ k · reference = (1 - reduction) · measured total (S2, shared by need)."""
    total = float(np.sum(reference_m3))
    return (1 - reduction) * measured_total_m3 / total if total > 0 else 0.0


def status(ratio: np.ndarray, within: float, limit: float) -> np.ndarray:
    """'within' (≤ within), 'borderline' (≤ limit), 'over' (> limit); NaN ratio → 'not_assessed'."""
    r = np.asarray(ratio, dtype=float)
    out = np.where(r <= within, "within", np.where(r <= limit, "borderline", "over"))
    return np.where(np.isnan(r), "not_assessed", out)


def pump_energy_kwh(blue_m3, head_m: float, pump_efficiency: float, irrigation_efficiency: float):
    """Energy to lift the gross volume: E = 9.81 · H · (V_blue / η_irr) / (3600 · η_pump)."""
    gross = np.asarray(blue_m3, dtype=float) / irrigation_efficiency
    return RHO_G_KW * head_m * gross / (3600 * pump_efficiency)


def deficit_yield_loss(ky: float, et_reduction: float) -> float:
    """FAO-33: 1 - Ya/Ym = Ky (1 - ETa/ETm); returns the relative yield loss."""
    return ky * et_reduction


def crop_calendar(kcb: np.ndarray, present: float, mid_share: float) -> dict[str, np.ndarray]:
    """Satellite crop calendar per field, as day offsets into the season (-1 where never cropped).

    start / end: first / last day with Kcb > present; mid_start / mid_end: first / last day with
    Kcb >= mid_share · peak; peak: maximum Kcb. Used to calibrate the farmer-side FAO-56 engine.
    """
    d = kcb.shape[1]
    peak = kcb.max(axis=1)
    above = kcb > present
    mid = kcb >= (mid_share * peak)[:, None]

    def first(mask):
        return np.where(mask.any(axis=1), np.argmax(mask, axis=1), -1)

    def last(mask):
        return np.where(mask.any(axis=1), d - 1 - np.argmax(mask[:, ::-1], axis=1), -1)

    cropped = above.any(axis=1)
    mid &= above
    out = {"start": first(above), "end": last(above), "mid_start": first(mid), "mid_end": last(mid),
           "peak": np.where(cropped, peak, np.nan)}
    for k in ("mid_start", "mid_end"):
        out[k] = np.where(cropped, out[k], -1)
    return out
