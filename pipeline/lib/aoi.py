"""Pure helpers for the study-area step (no Earth Engine calls)."""


def bbox_polygon(bbox: list[float]) -> dict:
    """GeoJSON Polygon for [west, south, east, north]."""
    w, s, e, n = bbox
    return {
        "type": "Polygon",
        "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
    }


def feature_collection(geometry: dict, properties: dict) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "geometry": geometry, "properties": properties}],
    }


def field_count_range(cropland_km2: float, mean_field_ha: list[float]) -> tuple[int, int]:
    """Rough field count from cropland area and an assumed mean field size range (ha).

    Larger fields give fewer fields, so the low count comes from the high size.
    """
    small_ha, large_ha = sorted(mean_field_ha)
    cropland_ha = cropland_km2 * 100
    return round(cropland_ha / large_ha), round(cropland_ha / small_ha)
