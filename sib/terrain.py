"""Elevation for the exercise area from the AWS open terrain tiles (terrarium PNG, zoom 11, about 50 m per pixel)."""

import math
from functools import lru_cache

import numpy as np
from PIL import Image

from .roads import ROOT

Z = 11
S, W, N, E = 48.35, 3.90, 49.00, 4.70


def _tile_xy(lat, lon):
    n = 2 ** Z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


@lru_cache(1)
def mosaic():
    (x0, y0), (x1, y1) = _tile_xy(N, W), _tile_xy(S, E)
    xs, ys = range(int(x0), int(x1) + 1), range(int(y0), int(y1) + 1)
    rows = []
    for y in ys:
        row = []
        for x in xs:
            a = np.asarray(Image.open(ROOT / f"data/dem/{Z}_{x}_{y}.png").convert("RGB"), dtype=np.float64)
            row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)   # terrarium encoding, metres
        rows.append(np.hstack(row))
    return np.vstack(rows), xs.start, ys.start


def height(lat, lon):
    m, tx, ty = mosaic()
    x, y = _tile_xy(lat, lon)
    px, py = (x - tx) * 256, (y - ty) * 256
    i, j = min(int(py), m.shape[0] - 2), min(int(px), m.shape[1] - 2)
    fy, fx = py - i, px - j   # bilinear
    return float(m[i, j] * (1 - fx) * (1 - fy) + m[i, j + 1] * fx * (1 - fy) + m[i + 1, j] * (1 - fx) * fy + m[i + 1, j + 1] * fx * fy)


def grid(nx=240, ny=300):
    """Heights on a regular lat/lon grid covering the area, north row first."""
    lats = np.linspace(N, S, ny)
    lons = np.linspace(W, E, nx)
    return [[round(height(la, lo), 1) for lo in lons] for la in lats]
