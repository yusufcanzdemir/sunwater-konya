"""Download Earth Engine images onto a fixed local pixel grid (tiled computePixels)."""

import math
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.io import MemoryFile
from rasterio.transform import Affine


@dataclass(frozen=True)
class Grid:
    crs: str
    x0: float  # upper-left corner
    y0: float
    scale: float
    width: int
    height: int

    @property
    def transform(self) -> Affine:
        return Affine(self.scale, 0, self.x0, 0, -self.scale, self.y0)


def grid_for_bbox(bbox: list[float], crs: str, scale: float) -> Grid:
    """Smallest grid in `crs`, aligned to multiples of `scale`, covering a lon/lat bbox."""
    w, s, e, n = bbox
    to = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    xs, ys = zip(*(to.transform(x, y) for x, y in [(w, s), (w, n), (e, s), (e, n)]))
    x0 = math.floor(min(xs) / scale) * scale
    y0 = math.ceil(max(ys) / scale) * scale
    x1 = math.ceil(max(xs) / scale) * scale
    y1 = math.floor(min(ys) / scale) * scale
    return Grid(crs, x0, y0, scale, round((x1 - x0) / scale), round((y0 - y1) / scale))


def fetch_grid(ee, image, grid: Grid, tile: int = 1024, quiet: bool = False) -> np.ndarray:
    """(bands, height, width) int32 array of `image` (cast to int32) on `grid`, tile by tile."""
    image = image.toInt32()
    n_bands = len(image.bandNames().getInfo())
    out = np.zeros((n_bands, grid.height, grid.width), dtype=np.int32)
    n_tiles = math.ceil(grid.height / tile) * math.ceil(grid.width / tile)
    done = 0
    for row in range(0, grid.height, tile):
        for col in range(0, grid.width, tile):
            h, w = min(tile, grid.height - row), min(tile, grid.width - col)
            raw = ee.data.computePixels({
                "expression": image,
                "fileFormat": "GEO_TIFF",
                "grid": {
                    "dimensions": {"width": w, "height": h},
                    "affineTransform": {
                        "scaleX": grid.scale, "shearX": 0, "translateX": grid.x0 + col * grid.scale,
                        "shearY": 0, "scaleY": -grid.scale, "translateY": grid.y0 - row * grid.scale,
                    },
                    "crsCode": grid.crs,
                },
            })
            with MemoryFile(raw) as mem, mem.open() as src:
                out[:, row:row + h, col:col + w] = src.read()
            done += 1
            if not quiet:
                print(f"  tile {done}/{n_tiles}", file=sys.stderr)
    return out


def download_grid(ee, image, grid: Grid, path: Path, tile: int = 1024) -> None:
    """Write `image` (all bands cast to int32) on `grid` to a GeoTIFF."""
    bands = image.bandNames().getInfo()
    out = fetch_grid(ee, image, grid, tile)
    with rasterio.open(
        path, "w", driver="GTiff", width=grid.width, height=grid.height, count=len(bands),
        dtype="int32", crs=grid.crs, transform=grid.transform, compress="deflate",
    ) as dst:
        dst.write(out)
        dst.descriptions = tuple(bands)
