"""Data-source access probes used by step 00 (PLAN.md section 3)."""

import math
from dataclasses import asdict, dataclass, field
from datetime import date

import requests

OK = "OK"  # reachable and has data in the probe window
EMPTY = "EMPTY"  # reachable but no data in the probe window
ERROR = "ERROR"  # not reachable (missing, no permission, network)
SKIPPED = "SKIPPED"  # not attempted (e.g. Earth Engine not initialized)
MANUAL = "MANUAL"  # needs a human check

HTTP_TIMEOUT_S = 30


@dataclass
class CheckResult:
    key: str
    name: str
    source: str
    status: str
    required: bool
    detail: str = ""
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


def classify_count(count: int) -> str:
    return OK if count > 0 else EMPTY


def _result(src: dict, source: str, status: str, detail: str = "", **extra) -> CheckResult:
    return CheckResult(
        key=src["key"],
        name=src["name"],
        source=source,
        status=status,
        required=bool(src.get("required", False)),
        detail=detail,
        extra=extra,
    )


def probe_ee_source(ee, src: dict, point: list[float]) -> CheckResult:
    """Run one small metadata query against an Earth Engine dataset at the probe point."""
    geom = ee.Geometry.Point(point)
    try:
        if src["kind"] == "feature_collection":
            fc = ee.FeatureCollection(src["id"]).filterBounds(geom)
            info = ee.Dictionary(
                {"count": fc.size(), "properties": ee.Feature(fc.first()).propertyNames()}
            ).getInfo()
            props = sorted(p for p in info["properties"] if not p.startswith("system:"))
            return _result(
                src, src["id"], classify_count(info["count"]),
                f"{info['count']} feature(s) at probe point", properties=props,
            )

        start, end = src["probe"]
        col = ee.ImageCollection(src["id"]).filterBounds(geom)
        window = col.filterDate(start, end)
        info = ee.Dictionary(
            {
                "count": window.size(),
                "latest": col.filterDate(start, date.today().isoformat()).aggregate_max(
                    "system:time_start"
                ),
                "bands": ee.Algorithms.If(
                    window.size().gt(0), ee.Image(window.first()).bandNames(), ee.List([])
                ),
            }
        ).getInfo()
        latest = info.get("latest")
        latest_iso = (
            date.fromtimestamp(latest / 1000).isoformat()
            if isinstance(latest, (int, float))
            else None
        )
        return _result(
            src, src["id"], classify_count(info["count"]),
            f"{info['count']} image(s) in {start}..{end}; latest {latest_iso or 'n/a'}",
            latest=latest_iso, bands=info["bands"],
        )
    except Exception as exc:  # EE raises EEException for missing/forbidden assets
        return _result(src, src["id"], ERROR, str(exc).splitlines()[0])


def probe_open_meteo(src: dict, point: list[float]) -> CheckResult:
    start, end = src["probe"]
    params = {
        "longitude": point[0],
        "latitude": point[1],
        "start_date": start,
        "end_date": end,
        "daily": "et0_fao_evapotranspiration,precipitation_sum",
        "timezone": "Europe/Istanbul",
    }
    try:
        resp = requests.get(src["url"], params=params, timeout=HTTP_TIMEOUT_S)
        resp.raise_for_status()
        daily = resp.json().get("daily", {})
        et0 = [v for v in daily.get("et0_fao_evapotranspiration", []) if v is not None]
        if not et0:
            return _result(src, src["url"], EMPTY, "no ET0 values returned")
        return _result(
            src, src["url"], OK,
            f"{len(et0)} day(s) of ET0 in {start}..{end}, mean {sum(et0) / len(et0):.2f} mm/day",
            days=len(et0),
        )
    except Exception as exc:
        return _result(src, src["url"], ERROR, str(exc).splitlines()[0])


def lonlat_to_tile(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    """Web Mercator XYZ tile indices containing (lon, lat)."""
    n = 2**zoom
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def probe_xyz_tile(src: dict, point: list[float]) -> CheckResult:
    z = src["zoom"]
    x, y = lonlat_to_tile(point[0], point[1], z)
    url = src["url"].format(z=z, x=x, y=y)
    try:
        resp = requests.get(url, timeout=HTTP_TIMEOUT_S)
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "")
        if not ctype.startswith("image/"):
            return _result(src, url, EMPTY, f"unexpected content type {ctype!r}")
        return _result(src, url, OK, f"tile z{z}/{x}/{y}: {len(resp.content)} bytes {ctype}")
    except Exception as exc:
        return _result(src, url, ERROR, str(exc).splitlines()[0])


HTTP_PROBES = {"open_meteo": probe_open_meteo, "xyz_tile": probe_xyz_tile}


def manual_result(src: dict) -> CheckResult:
    return _result(src, src["url"], MANUAL, src.get("note", ""))


def skipped_result(src: dict, reason: str) -> CheckResult:
    return _result(src, src["id"], SKIPPED, reason)


def failed_required(results: list[CheckResult]) -> list[CheckResult]:
    return [r for r in results if r.required and r.status != OK]


def render_markdown(results: list[CheckResult]) -> str:
    lines = [
        "| Key | Source | Required | Status | Detail |",
        "|---|---|---|---|---|",
    ]
    for r in results:
        detail = r.detail.replace("|", "\\|")
        lines.append(
            f"| {r.key} | {r.name} (`{r.source}`) | {'yes' if r.required else 'no'} "
            f"| {r.status} | {detail} |"
        )
    return "\n".join(lines) + "\n"
