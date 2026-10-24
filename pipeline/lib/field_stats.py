"""Zonal statistics of Earth Engine images over local field polygons, in request-sized chunks."""

import json
import sys

import geopandas as gpd

from lib.fields import METRIC_CRS


def inner_buffered(fields: gpd.GeoDataFrame, buffer_m: float, min_ha: float) -> gpd.GeoDataFrame:
    """Shrink polygons by buffer_m to avoid edge pixels; keep the original when too small."""
    metric = fields.to_crs(METRIC_CRS)
    shrunk = metric.buffer(-buffer_m)
    keep = shrunk.is_empty | (shrunk.area / 1e4 < min_ha)
    metric["geometry"] = shrunk.where(~keep, metric.geometry)
    metric["buffered"] = ~keep
    return metric.to_crs("EPSG:4326")


def reduce_fields(ee, image, fields: gpd.GeoDataFrame, reducer, scale: float, crs: str,
                  chunk: int) -> dict[str, dict]:
    """{field_id: properties} from image.reduceRegions over the fields, `chunk` at a time."""
    out: dict[str, dict] = {}
    for start in range(0, len(fields), chunk):
        part = fields.iloc[start:start + chunk][["field_id", "geometry"]]
        fc = ee.FeatureCollection(json.loads(part.to_json(drop_id=True)))
        reduced = image.reduceRegions(
            collection=fc, reducer=reducer, scale=scale, crs=crs, tileScale=4,
        )
        for f in reduced.getInfo()["features"]:
            props = f["properties"]
            out[props.pop("field_id")] = props
        print(f"  {min(start + chunk, len(fields))}/{len(fields)}", file=sys.stderr)
    return out
