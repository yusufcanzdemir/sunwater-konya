"""Earth Engine session helpers."""

import os
import sys
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


def asset_root(cfg: dict) -> str:
    return f"projects/{ee_project(cfg)}/assets/{cfg['earth_engine']['asset_folder']}"


def asset_exists(ee, asset_id: str) -> bool:
    try:
        ee.data.getAsset(asset_id)
        return True
    except ee.EEException:
        return False


def ensure_folder(ee, folder_id: str) -> None:
    if not asset_exists(ee, folder_id):
        ee.data.createAsset({"type": "FOLDER"}, folder_id)


def active_task_descriptions(ee) -> set[str]:
    return {
        t.config.get("description", "")
        for t in ee.batch.Task.list()
        if t.state in ("READY", "RUNNING")
    }


def wait_for_tasks(ee, descriptions: set[str], poll_s: int = 30) -> dict[str, str]:
    """Block until no task with one of the descriptions is READY/RUNNING; return final states."""
    import time

    while True:
        states = {}
        for t in ee.batch.Task.list():
            desc = t.config.get("description", "")
            if desc in descriptions and desc not in states:  # list is newest first
                states[desc] = t.state
        pending = [d for d, s in states.items() if s in ("READY", "RUNNING")]
        if not pending:
            return states
        print(f"waiting for {len(pending)} task(s): {', '.join(pending)}", file=sys.stderr)
        time.sleep(poll_s)


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


def download_thumbnail(image, region, path: Path, dimensions: int = 1024,
                       crs: str | None = None) -> None:
    params = {"region": region, "dimensions": dimensions, "format": "png"}
    if crs:
        params["crs"] = crs
    url = image.getThumbURL(params)
    resp = requests.get(url, timeout=300)
    resp.raise_for_status()
    path.write_bytes(resp.content)
