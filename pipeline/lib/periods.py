"""Season and dekad date helpers (no Earth Engine calls)."""

from datetime import date, timedelta

DEKAD_START_DAYS = (1, 11, 21)


def season_bounds(year: int, start_mmdd: str, end_mmdd: str) -> tuple[date, date]:
    """Season as [start, end) where end is the day after the inclusive end_mmdd."""
    sm, sd = map(int, start_mmdd.split("-"))
    em, ed = map(int, end_mmdd.split("-"))
    return date(year, sm, sd), date(year, em, ed) + timedelta(days=1)


def _next_dekad_start(d: date) -> date:
    for day in DEKAD_START_DAYS:
        if day > d.day:
            return d.replace(day=day)
    return date(d.year + d.month // 12, d.month % 12 + 1, 1)


def dekads(year: int, start_mmdd: str, end_mmdd: str) -> list[tuple[date, date]]:
    """Dekad periods [start, end) covering the season; edge periods are truncated."""
    start, end = season_bounds(year, start_mmdd, end_mmdd)
    periods = []
    cur = start
    while cur < end:
        nxt = min(_next_dekad_start(cur), end)
        periods.append((cur, nxt))
        cur = nxt
    return periods


def dekad_labels(n: int) -> list[str]:
    return [f"d{i + 1:02d}" for i in range(n)]
