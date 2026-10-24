import importlib

step = importlib.import_module("07_et0")


def test_lattice_covers_bbox_edges():
    pts = step.lattice([33.30, 37.70, 33.60, 37.90], 0.1)
    lons = sorted({p[0] for p in pts})
    lats = sorted({p[1] for p in pts})
    assert lons == [33.3, 33.4, 33.5, 33.6]
    assert lats == [37.7, 37.8, 37.9]
    assert len(pts) == 12
