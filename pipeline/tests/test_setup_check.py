import math

import pytest

from lib import access
from lib.config import load_config

PLAN_EE_IDS = {
    "COPERNICUS/S2_SR_HARMONIZED",
    "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED",
    "LANDSAT/LC08/C02/T1_L2",
    "LANDSAT/LC09/C02/T1_L2",
    "COPERNICUS/S1_GRD",
    "ESA/WorldCover/v200",
    "WWF/HydroSHEDS/v1/Basins/hybas_6",
    "ECMWF/ERA5_LAND/DAILY_AGGR",
    "MODIS/061/MOD16A2GF",
    "NASA/GRACE/MASS_GRIDS_V04/MASCON",
    "NASA/GLDAS/V021/NOAH/G025/T3H",
}


@pytest.fixture(scope="module")
def cfg():
    return load_config()


def test_config_lists_all_plan_sources(cfg):
    ids = {s["id"] for s in cfg["sources"]["earth_engine"]}
    assert PLAN_EE_IDS <= ids
    keys = [s["key"] for group in cfg["sources"].values() for s in group]
    assert len(keys) == len(set(keys)), "source keys must be unique"


def test_pilot_bbox_contains_probe_point(cfg):
    w, s, e, n = cfg["pilot_bbox"]
    lon, lat = cfg["probe_point"]
    assert w < e and s < n
    assert w <= lon <= e and s <= lat <= n


def test_image_collections_have_probe_window(cfg):
    for src in cfg["sources"]["earth_engine"]:
        if src["kind"] == "image_collection":
            start, end = src["probe"]
            assert start < end, src["key"]


def test_classify_count():
    assert access.classify_count(3) == access.OK
    assert access.classify_count(0) == access.EMPTY


def test_lonlat_to_tile_matches_slippy_map_formula():
    # z0 has a single tile; the antimeridian/equator corner maps to (0, 0)
    assert access.lonlat_to_tile(0.0, 0.0, 0) == (0, 0)
    x, y = access.lonlat_to_tile(33.85, 37.60, 15)
    n = 2**15
    assert x == int((33.85 + 180) / 360 * n)
    lat = math.radians(37.60)
    assert y == int((1 - math.log(math.tan(lat) + 1 / math.cos(lat)) / math.pi) / 2 * n)


class FakeResponse:
    def __init__(self, payload=None, content=b"", headers=None, status=200):
        self._payload = payload
        self.content = content
        self.headers = headers or {}
        self.status = status

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError(f"HTTP {self.status}")

    def json(self):
        return self._payload


def test_open_meteo_ok(monkeypatch):
    payload = {"daily": {"et0_fao_evapotranspiration": [6.0, 7.0, None]}}
    monkeypatch.setattr(access.requests, "get", lambda *a, **k: FakeResponse(payload))
    src = {"key": "om", "name": "OM", "url": "u", "probe": ["2025-07-01", "2025-07-03"],
           "required": True}
    r = access.probe_open_meteo(src, [33.85, 37.6])
    assert r.status == access.OK
    assert r.extra["days"] == 2
    assert "6.50" in r.detail


def test_open_meteo_http_error(monkeypatch):
    monkeypatch.setattr(access.requests, "get", lambda *a, **k: FakeResponse(status=503))
    src = {"key": "om", "name": "OM", "url": "u", "probe": ["2025-07-01", "2025-07-03"]}
    assert access.probe_open_meteo(src, [33.85, 37.6]).status == access.ERROR


def test_xyz_tile_requires_image(monkeypatch):
    monkeypatch.setattr(
        access.requests, "get",
        lambda *a, **k: FakeResponse(content=b"x", headers={"content-type": "text/html"}),
    )
    src = {"key": "t", "name": "T", "url": "https://h/{z}/{y}/{x}", "zoom": 3}
    assert access.probe_xyz_tile(src, [33.85, 37.6]).status == access.EMPTY


def test_failed_required_and_markdown():
    results = [
        access.CheckResult("a", "A", "id/a", access.OK, True),
        access.CheckResult("b", "B", "id/b", access.ERROR, True, "boom | bad"),
        access.CheckResult("c", "C", "id/c", access.MANUAL, False),
    ]
    assert [r.key for r in access.failed_required(results)] == ["b"]
    md = access.render_markdown(results)
    assert md.count("\n") == 5
    assert "boom \\| bad" in md
