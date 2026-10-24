import math

import pytest

from lib.stats import wilson_interval


def test_wilson_interval_known_value():
    # 40/50 = 0.8 -> approx (0.670, 0.888)
    lo, hi = wilson_interval(40, 50)
    assert lo == pytest.approx(0.670, abs=0.002)
    assert hi == pytest.approx(0.888, abs=0.002)


def test_wilson_interval_edges():
    lo, hi = wilson_interval(0, 10)
    assert lo == 0.0 and 0 < hi < 0.35
    assert all(math.isnan(v) for v in wilson_interval(0, 0))
