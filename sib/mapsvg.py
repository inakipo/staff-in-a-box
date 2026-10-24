"""Static SVG of the exercise area from the OpenStreetMap extract: roads, rivers, crossings, places, units, routes.
Layers take a CSS class so a slide can reveal them one step at a time."""

import json
import math

from . import roads

ROOT = roads.ROOT
S, W, N, E = 48.35, 3.90, 49.00, 4.70
K = 1300
CX = math.cos(math.radians((S + N) / 2))
WIDTH, HEIGHT = round((E - W) * CX * K), round((N - S) * K)


def xy(lat, lon):
    return round((lon - W) * CX * K, 1), round((N - lat) * K, 1)


LABEL = {"arcis": (-12, -22, "end"), "vitry": (-12, -10, "end"), "brienne": (-12, -12, "end"), "camp_mailly": (12, -10, "start")}


def _path(pts):
    return "M" + " L".join(f"{x},{y}" for x, y in (xy(la, lo) for la, lo in pts))


def svg(layers=None, routes=(), crossings_cls="", units_cls="", red_cls="", height=860):
    s = json.load((ROOT / "scenario/aube.json").open())
    out = []
    style = {"tertiary": ("#d8d1c2", 1.2), "secondary": ("#b9ae98", 1.8), "primary": ("#9c8f76", 2.6),
             "trunk": ("#8a7c62", 3.2), "motorway": ("#7a6b50", 3.8)}
    by = {k: [] for k in style}
    for w in json.load((ROOT / "data/osm/roads.json").open())["elements"]:
        cls = w["tags"]["highway"].replace("_link", "")
        by[cls].append(_path([(p["lat"], p["lon"]) for p in w["geometry"]]))
    for cls in ["tertiary", "secondary", "primary", "trunk", "motorway"]:
        col, wd = style[cls]
        out.append(f'<path d="{" ".join(by[cls])}" stroke="{col}" stroke-width="{wd}" fill="none" stroke-linecap="round"/>')
    for w in json.load((ROOT / "data/osm/water.json").open())["elements"]:
        name = w["tags"].get("name", "")
        big = name in ("L'Aube", "La Marne")
        out.append(f'<path d="{_path([(p["lat"], p["lon"]) for p in w["geometry"]])}" stroke="#4a90c8" '
                   f'stroke-width="{5 if big else 1.6}" fill="none" opacity="{1 if big else .6}"/>')
    for r in routes:
        out.append(f'<g class="{r.get("cls", "")}"><path d="{_path(r["line"])}" stroke="{r.get("color", "#1d4ed8")}" stroke-width="9" '
                   f'fill="none" stroke-linecap="round" opacity=".85"/></g>')
    for key, p in s["places"].items():
        x, y = xy(*p["pos"])
        dx, dy, anchor = LABEL.get(key, (10, -8, "start"))
        out.append(f'<circle cx="{x}" cy="{y}" r="5" fill="#3d3a33"/><text x="{x + dx}" y="{y + dy}" text-anchor="{anchor}" font-size="21" fill="#3d3a33" '
                   f'font-weight="600" paint-order="stroke" stroke="#f7f4ec" stroke-width="5">{p["name"].split(" (")[0]}</text>')
    g = [f'<g class="{crossings_cls}">']
    for k, c in s["crossings"].items():
        x, y = xy(*c["pos"])
        lx, ly = {"X1": (4, -22), "X2": (-50, 34), "X3": (16, -18), "X5": (-52, 8)}.get(k, (18, 26))
        g.append(f'<rect x="{x - 13}" y="{y - 13}" width="26" height="26" rx="5" fill="#f59e0b" stroke="#7c4a03" stroke-width="2.5"/>'
                 f'<text x="{x + lx}" y="{y + ly}" font-size="22" font-weight="800" fill="#7c4a03" paint-order="stroke" stroke="#f7f4ec" stroke-width="5">{k}</text>')
    out.append("".join(g) + "</g>")
    g = [f'<g class="{units_cls}">']
    for u in s["blue"]:
        x, y = xy(*s["places"][u["start"]]["pos"])
        off = {"B-REC": (-76, 42), "B-1": (-38, 42), "B-2": (0, 42), "B-ENG": (38, 42), "B-LOG": (76, 42), "B-3": (-50, -40)}[u["id"]]
        g.append(f'<rect x="{x + off[0] - 15}" y="{y + off[1] - 11}" width="30" height="22" fill="#2563eb" stroke="#0b2a6b" stroke-width="2"/>'
                 f'<text x="{x + off[0]}" y="{y + off[1] + 34}" text-anchor="middle" font-size="14" font-weight="700" fill="#0b2a6b">{u["id"][2:]}</text>')
    out.append("".join(g) + "</g>")
    g = [f'<g class="{red_cls}">']
    for u, off in zip(s["red"], [(-22, 40), (22, 40)]):
        x, y = xy(*s["places"][u["start"]]["pos"])
        g.append(f'<polygon points="{x + off[0]},{y + off[1] - 17} {x + off[0] + 17},{y + off[1]} {x + off[0]},{y + off[1] + 17} {x + off[0] - 17},{y + off[1]}" '
                 f'fill="#dc2626" stroke="#6b0f0f" stroke-width="2"/>')
    out.append("".join(g) + "</g>")
    for extra in (layers or []):
        out.append(extra)
    return (f'<svg viewBox="0 0 {WIDTH} {HEIGHT}" height="{height}" style="background:#f7f4ec;border-radius:18px;border:1px solid #d9d2c3">'
            + "".join(out) + "</svg>")
