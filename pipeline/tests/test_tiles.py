import numpy as np

from lib.tiles import make_tiles


def test_cores_partition_image_and_lie_inside_tiles():
    h, w = 1300, 900
    tiles = make_tiles(h, w, tile=512, overlap=128)
    cover = np.zeros((h, w), dtype=int)
    for t in tiles:
        cover[t.core_r0:t.core_r1, t.core_c0:t.core_c1] += 1
        assert t.row <= t.core_r0 and t.core_r1 <= t.row + t.height
        assert t.col <= t.core_c0 and t.core_c1 <= t.col + t.width
        assert t.row + t.height <= h and t.col + t.width <= w
    assert (cover == 1).all()


def test_small_image_is_one_tile():
    tiles = make_tiles(100, 200, tile=512, overlap=128)
    assert len(tiles) == 1
    assert (tiles[0].height, tiles[0].width) == (100, 200)
