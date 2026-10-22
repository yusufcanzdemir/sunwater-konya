from datetime import date

from lib.periods import dekad_labels, dekads, season_bounds


def test_season_bounds_end_is_exclusive():
    assert season_bounds(2025, "03-01", "10-31") == (date(2025, 3, 1), date(2025, 11, 1))


def test_dekads_cover_season_without_gaps():
    periods = dekads(2025, "03-01", "10-31")
    assert len(periods) == 24
    assert periods[0] == (date(2025, 3, 1), date(2025, 3, 11))
    assert periods[2] == (date(2025, 3, 21), date(2025, 4, 1))
    assert periods[-1] == (date(2025, 10, 21), date(2025, 11, 1))
    for (_, end), (start, _) in zip(periods, periods[1:]):
        assert end == start


def test_dekads_truncate_off_boundary_season():
    periods = dekads(2024, "02-25", "03-05")
    # 2024 is a leap year: Feb 21 dekad ends on Mar 1
    assert periods == [(date(2024, 2, 25), date(2024, 3, 1)), (date(2024, 3, 1), date(2024, 3, 6))]


def test_dekads_cross_year_end():
    periods = dekads(2025, "12-25", "12-31")
    assert periods == [(date(2025, 12, 25), date(2026, 1, 1))]


def test_dekad_labels():
    assert dekad_labels(3) == ["d01", "d02", "d03"]
