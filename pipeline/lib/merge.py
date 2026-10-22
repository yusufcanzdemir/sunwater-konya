"""Boundary-aware merging of over-segmented superpixels (raster, numpy only).

Two adjacent segments are merged when their mean NDVI profiles are similar AND the
mean edge strength along their shared border is low, i.e. no visible field boundary.
"""

import heapq

import numpy as np
from skimage.filters import sobel
from skimage.measure import label as connected_label


def relabel_connected(labels: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Split label values into 4-connected regions numbered 1..N; invalid pixels get 0."""
    lab = np.where(valid, labels, -1)
    out = connected_label(lab, background=-1, connectivity=1)
    return out.astype(np.int32)


def edge_strength(profiles: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Max over time steps of the Sobel gradient magnitude of NDVI (profiles: T x H x W)."""
    filled = np.where(valid, profiles, 0.0)
    return np.max([sobel(band) for band in filled], axis=0)


def segment_means(labels: np.ndarray, profiles: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(area[N+1], mean profile[N+1, T]) per label; index 0 is background."""
    n = int(labels.max()) + 1
    flat = labels.ravel()
    area = np.bincount(flat, minlength=n).astype(np.float64)
    sums = np.stack([np.bincount(flat, weights=b.ravel(), minlength=n) for b in profiles], axis=1)
    means = sums / np.maximum(area, 1)[:, None]
    return area, means


def boundary_pairs(labels: np.ndarray, edge: np.ndarray) -> dict[tuple[int, int], list[float]]:
    """{(a, b): [edge_sum, pixel_pair_count]} over 4-neighbour pixel pairs with a < b."""
    pairs: dict[tuple[int, int], list[float]] = {}
    base = int(labels.max()) + 1
    for la, lb, ea, eb in (
        (labels[:, :-1], labels[:, 1:], edge[:, :-1], edge[:, 1:]),
        (labels[:-1, :], labels[1:, :], edge[:-1, :], edge[1:, :]),
    ):
        m = (la != lb) & (la > 0) & (lb > 0)
        a, b = np.minimum(la[m], lb[m]), np.maximum(la[m], lb[m])
        e = (ea[m] + eb[m]) / 2
        key = a.astype(np.int64) * base + b
        uniq, inv = np.unique(key, return_inverse=True)
        sums = np.bincount(inv, weights=e)
        counts = np.bincount(inv)
        for k, s, c in zip(uniq, sums, counts):
            ka, kb = divmod(int(k), base)
            cur = pairs.setdefault((ka, kb), [0.0, 0])
            cur[0] += s
            cur[1] += int(c)
    return pairs


def profile_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(np.mean((a - b) ** 2)))


def merge_segments(labels: np.ndarray, area: np.ndarray, means: np.ndarray,
                   pairs: dict[tuple[int, int], list[float]],
                   max_profile_dist: float, max_edge: float) -> np.ndarray:
    """Greedy merge (most similar pair first); returns relabelled 1..M array."""
    parent = np.arange(len(area))
    area, means = area.copy(), means.copy()
    nbrs: dict[int, dict[int, list[float]]] = {}
    for (a, b), (s, c) in pairs.items():
        nbrs.setdefault(a, {})[b] = [s, c]
        nbrs.setdefault(b, {})[a] = [s, c]
    version = np.zeros(len(area), dtype=np.int64)

    heap = []

    def push(a: int, b: int):
        s, c = nbrs[a][b]
        if s / c <= max_edge:
            d = profile_distance(means[a], means[b])
            if d <= max_profile_dist:
                heapq.heappush(heap, (d, a, b, version[a], version[b]))

    for a, b in pairs:
        push(a, b)
    while heap:
        _, a, b, va, vb = heapq.heappop(heap)
        if va != version[a] or vb != version[b]:
            continue  # stale: one side changed since this pair was scored
        # merge b into a
        total = area[a] + area[b]
        means[a] = (means[a] * area[a] + means[b] * area[b]) / total
        area[a] = total
        parent[b] = a
        version[a] += 1
        version[b] += 1
        for n, (s, c) in nbrs.pop(b).items():
            del nbrs[n][b]
            if n == a:
                continue
            cur = nbrs[a].setdefault(n, [0.0, 0])
            cur[0] += s
            cur[1] += c
            nbrs[n][a] = cur
        for n in nbrs[a]:
            push(a, n)
    # resolve union chains
    root = parent.copy()
    while True:
        nxt = root[root]
        if np.array_equal(nxt, root):
            break
        root = nxt
    merged = root[labels]
    merged[labels == 0] = 0
    _, compact = np.unique(merged, return_inverse=True)
    compact = compact.reshape(labels.shape).astype(np.int32)
    return compact if (labels == 0).any() else compact + 1


def label_stats(labels: np.ndarray, profiles: np.ndarray, crop: np.ndarray) -> dict[str, np.ndarray]:
    """Per label: cropland share and RMS distance of pixel profiles from the label mean."""
    area, means = segment_means(labels, profiles)
    n = len(area)
    flat = labels.ravel()
    crop_share = np.bincount(flat, weights=crop.ravel().astype(float), minlength=n) / np.maximum(area, 1)
    sq = np.zeros(labels.size)
    for t, band in enumerate(profiles):
        sq += (band.ravel() - means[flat, t]) ** 2
    rms = np.sqrt(sq / len(profiles))
    dist = np.bincount(flat, weights=rms, minlength=n) / np.maximum(area, 1)
    return {"area": area, "crop": crop_share, "dist": dist}
