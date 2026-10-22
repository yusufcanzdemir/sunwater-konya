"""Earth Engine session helpers."""

import os
from pathlib import Path

import requests


def ee_project(cfg: dict) -> str | None:
    return os.environ.get("EE_PROJECT") or cfg["earth_engine"].get("project")


def init_ee(cfg: dict):
    """Initialize Earth Engine with the configured Cloud project and return the module."""
    import ee

    project = ee_project(cfg)
    if not project:
        raise RuntimeError(
            "No Earth Engine project: set earth_engine.project in config.yaml or EE_PROJECT."
        )
    ee.Initialize(project=project)
    return ee


def s2_preview_rgb(ee, region, year: int, month: int):
    """Low-cloud Sentinel-2 median RGB for map previews only (not used in analysis)."""
    start = ee.Date.fromYMD(year, month, 1)
    return (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(start, start.advance(1, "month"))
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .median()
        .visualize(bands=["B4", "B3", "B2"], min=0, max=3000, gamma=1.2)
    )


def outline(ee, geometry, color: str, width: int = 2):
    """Visualized outline of a geometry, for blending onto previews."""
    fc = ee.FeatureCollection([ee.Feature(geometry)])
    return ee.Image().byte().paint(fc, 1, width).visualize(palette=[color])


def download_thumbnail(image, region, path: Path, dimensions: int = 1024) -> None:
    url = image.getThumbURL({"region": region, "dimensions": dimensions, "format": "png"})
    resp = requests.get(url, timeout=300)
    resp.raise_for_status()
    path.write_bytes(resp.content)
