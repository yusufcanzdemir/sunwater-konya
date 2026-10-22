from lib.aoi import bbox_polygon, feature_collection, field_count_range
from lib.config import load_config


def test_bbox_polygon_is_closed_ring():
    ring = bbox_polygon([1, 2, 3, 4])["coordinates"][0]
    assert ring[0] == ring[-1]
    assert ring[:4] == [[1, 2], [3, 2], [3, 4], [1, 4]]


def test_feature_collection_wraps_one_feature():
    fc = feature_collection({"type": "Point", "coordinates": [0, 0]}, {"a": 1})
    assert fc["type"] == "FeatureCollection"
    assert fc["features"][0]["properties"] == {"a": 1}


def test_field_count_range_order_independent():
    # 100 km² = 10,000 ha; 10 ha fields -> 1,000, 2 ha fields -> 5,000
    assert field_count_range(100, [2, 10]) == (1000, 5000)
    assert field_count_range(100, [10, 2]) == (1000, 5000)


def test_aoi_config_points_inside_bounds():
    cfg = load_config()
    lon, lat = cfg["aoi"]["basin_seed_point"]
    assert 25 < lon < 45 and 35 < lat < 43  # Türkiye
    assert cfg["aoi"]["basin_dataset"].startswith("WWF/HydroSHEDS/v1/Basins/hybas_")
