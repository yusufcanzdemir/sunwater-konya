"""Sentinel-2 cloud masking, spectral indices and dekadal gap-filled composites."""

INDICES = ["NDVI", "EVI", "NDMI"]

# Gap codes stored per dekad
OBSERVED = 0  # at least one clear observation in the dekad
INTERPOLATED = 1  # linear interpolation between nearest clear dekads before and after
EDGE_FILLED = 2  # only one side available (season start/end): nearest clear dekad copied
NO_DATA = 3  # no clear observation in the whole season


def clear_collection(ee, region, start: str, end: str, ccfg: dict):
    """S2 L2A images with Cloud Score+ mask applied."""
    band = ccfg["cloud_score_band"]
    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(start, end)
    )
    cs = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
    return s2.linkCollection(cs, [band]).map(
        lambda img: img.updateMask(img.select(band).gte(ccfg["clear_threshold"]))
    )


def add_indices(ee, img):
    """NDVI, EVI, NDMI from surface reflectance, clamped to [-1, 1]."""
    r = img.select(["B2", "B4", "B8", "B11"]).divide(10000)
    ndvi = r.normalizedDifference(["B8", "B4"]).rename("NDVI")
    evi = r.expression(
        "2.5 * (N - R) / (N + 6 * R - 7.5 * B + 1)",
        {"N": r.select("B8"), "R": r.select("B4"), "B": r.select("B2")},
    ).rename("EVI")
    ndmi = r.normalizedDifference(["B8", "B11"]).rename("NDMI")
    return (
        ee.Image.cat([ndvi, evi, ndmi])
        .clamp(-1, 1)
        .updateMask(ndvi.mask())
        .copyProperties(img, ["system:time_start"])
    )


def _masked_template(ee, bands: list[str]):
    return ee.Image.constant([0] * len(bands)).rename(bands).float().updateMask(0)


def dekad_medians(ee, indexed, periods) -> list:
    """Median index image per period; fully masked where there is no clear observation."""
    template = ee.ImageCollection([_masked_template(ee, INDICES)])
    return [
        template.merge(indexed.filterDate(s.isoformat(), e.isoformat())).median()
        for s, e in periods
    ]


def gap_fill(ee, medians: list) -> tuple[list, list]:
    """Per-pixel temporal linear interpolation across dekads.

    Returns (filled images with INDICES bands, gap-code images).
    """
    bands = INDICES + ["t"]
    empty = _masked_template(ee, bands)
    with_t = [
        m.addBands(ee.Image.constant(i).float().rename("t").updateMask(m.select("NDVI").mask()))
        for i, m in enumerate(medians)
    ]
    filled, codes = [], []
    for i, cur in enumerate(with_t):
        # mosaic() puts the last image on top: nearest clear dekad wins on each side
        before = ee.ImageCollection(with_t[:i] or [empty]).mosaic()
        after = ee.ImageCollection(list(reversed(with_t[i + 1:])) or [empty]).mosaic()
        b, a = before.select(INDICES), after.select(INDICES)
        w = ee.Image.constant(i).subtract(before.select("t")).divide(
            after.select("t").subtract(before.select("t"))
        )
        interp = b.add(a.subtract(b).multiply(w))
        edge = ee.ImageCollection([a, b]).mosaic()
        observed = cur.select(INDICES)
        filled.append(ee.ImageCollection([edge, interp, observed]).mosaic())
        codes.append(
            ee.Image.constant(NO_DATA)
            .where(edge.select(0).mask(), EDGE_FILLED)
            .where(interp.select(0).mask(), INTERPOLATED)
            .where(observed.select(0).mask(), OBSERVED)
            .rename("GAP")
        )
    return filled, codes


def dekadal_stack(ee, filled: list, codes: list, labels: list[str], scale: int):
    """One int16 image: <INDEX>_dNN bands for every index, then GAP_dNN codes."""
    bands = []
    for idx in INDICES:
        bands += [
            f.select(idx).multiply(scale).round().toInt16().rename(f"{idx}_{lab}")
            for f, lab in zip(filled, labels)
        ]
    bands += [c.toInt16().rename(f"GAP_{lab}") for c, lab in zip(codes, labels)]
    return ee.Image.cat(bands)


def segmentation_stack(ee, filled: list, periods, clear, months: list[int],
                       rgb_month: int, year: int, scale: int):
    """Monthly median of gap-filled NDVI for the given months plus a clear-sky RGB median."""
    bands = []
    for m in months:
        in_month = [f.select("NDVI") for f, (s, _) in zip(filled, periods) if s.month == m]
        bands.append(
            ee.ImageCollection(in_month).median().multiply(scale).round().toInt16()
            .rename(f"NDVI_m{m:02d}")
        )
    start = ee.Date.fromYMD(year, rgb_month, 1)
    rgb = clear.filterDate(start, start.advance(1, "month")).median().select(["B4", "B3", "B2"])
    bands.append(rgb.toInt16())
    return ee.Image.cat(bands)
