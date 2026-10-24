"""Ground truth: every unit moved minute by minute along real roads. Deterministic for a given plan and perturbation."""

import json
from functools import lru_cache

from . import roads
from .roads import ROOT

HORIZON = 360  # minutes after H-hour


def scenario():
    return json.load((ROOT / "scenario/aube.json").open())


def where(s, key):
    return tuple((s["places"].get(key) or s["crossings"][key])["pos"])


@lru_cache(4096)
def _route(a, b, kmh, blown=()):
    return roads.route(a, b, kmh=kmh, blown=list(blown))


def position(line, t):
    """Position at minute t along a route line of (lat, lon, minute)."""
    if t <= 0:
        return line[0][:2]
    for (la1, lo1, t1), (la2, lo2, t2) in zip(line, line[1:]):
        if t <= t2:
            f = 0 if t2 == t1 else (t - t1) / (t2 - t1)
            return la1 + (la2 - la1) * f, lo1 + (lo2 - lo1) * f
    return line[-1][:2]


def run(assignment, depart=None, speed=None, blown=(), step=1, tracks=True):
    """assignment: {blue unit id: task name}. depart: {unit id: minute}. speed: {unit id: factor} for perturbations.
    Returns per-unit tracks [(minute, lat, lon)], arrival minutes and fuel used."""
    s = scenario()
    depart, speed = depart or {}, speed or {}
    out = {}
    movers = [(u, s["plan"]["tasks"][assignment[u["id"]]]["at"]) for u in s["blue"] if u["id"] in assignment]
    movers += [(u, u["aim"]) for u in s["red"]]
    for u, target in movers:
        uid = u["id"]
        kmh = round(u["kmh"] * speed.get(uid, 1.0), 1)
        r = _route(where(s, u["start"]), where(s, target), kmh, tuple(map(tuple, blown)))
        d0 = depart.get(uid, u.get("depart_min", 0))
        track = [(t, *position(r["line"], t - d0)) for t in range(0, HORIZON + 1, step)] if tracks else []
        out[uid] = {"side": "red" if uid.startswith("R") else "blue", "target": target, "depart": d0,
                    "arrive": d0 + r["min"], "km": r["km"], "fuel_l": round(r["km"] * u.get("l_per_km", 0)),
                    "track": track, "line": r["line"]}
    return out
