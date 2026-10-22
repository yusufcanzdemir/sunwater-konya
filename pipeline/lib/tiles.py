"""Overlapping tiles with non-overlapping 'core' regions, for tiled model inference."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Tile:
    row: int  # window origin
    col: int
    height: int
    width: int
    core_r0: int  # core region (absolute pixel coords, end exclusive)
    core_r1: int
    core_c0: int
    core_c1: int

    def core_contains(self, r: float, c: float) -> bool:
        return self.core_r0 <= r < self.core_r1 and self.core_c0 <= c < self.core_c1


def _starts(size: int, tile: int, overlap: int) -> list[int]:
    if size <= tile:
        return [0]
    step = tile - overlap
    starts = list(range(0, size - tile, step))
    starts.append(size - tile)
    return starts


def make_tiles(height: int, width: int, tile: int, overlap: int) -> list[Tile]:
    """Tiles covering the image; cores partition it (each pixel in exactly one core)."""
    rows, cols = _starts(height, tile, overlap), _starts(width, tile, overlap)

    def cores(starts: list[int], size: int) -> list[tuple[int, int]]:
        bounds = [0] + [(starts[i] + tile + starts[i + 1]) // 2 for i in range(len(starts) - 1)]
        return list(zip(bounds, bounds[1:] + [size]))

    out = []
    for r, (r0, r1) in zip(rows, cores(rows, height)):
        for c, (c0, c1) in zip(cols, cores(cols, width)):
            out.append(Tile(r, c, min(tile, height), min(tile, width), r0, r1, c0, c1))
    return out
