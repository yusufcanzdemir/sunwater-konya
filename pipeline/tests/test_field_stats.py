import geopandas as gpd
from shapely.geometry import box

from lib.field_stats import inner_buffered
from lib.fields import METRIC_CRS


def test_inner_buffer_shrinks_large_fields_and_keeps_small_ones():
    # 200 m x 200 m (4 ha) and 30 m x 30 m (0.09 ha) squares in UTM 36N
    gdf = gpd.GeoDataFrame(
        {"field_id": ["big", "small"]},
        geometry=[box(500000, 4180000, 500200, 4180200), box(501000, 4180000, 501030, 4180030)],
        crs=METRIC_CRS,
    ).to_crs("EPSG:4326")
    out = inner_buffered(gdf, 10, 0.2).to_crs(METRIC_CRS)
    assert list(out["buffered"]) == [True, False]
    assert abs(out.area.iloc[0] - 180 * 180) < 5
    assert abs(out.area.iloc[1] - 30 * 30) < 1
