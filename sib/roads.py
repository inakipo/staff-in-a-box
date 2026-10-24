"""Road network for the exercise area (OpenStreetMap), as a graph with convoy travel times.

Speeds are planning assumptions for a mixed wheeled/tracked column, not road limits.
"""

import json
import math
from functools import lru_cache
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parent.parent
KMH = {"motorway": 60, "trunk": 50, "primary": 45, "secondary": 35, "tertiary": 25}


def km(a, b):
    (lat1, lon1), (lat2, lon2) = a, b
    p = math.pi / 180
    h = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


@lru_cache(1)
def graph():
    g = nx.Graph()
    for w in json.load((ROOT / "data/osm/roads.json").open())["elements"]:
        cls = w["tags"]["highway"].replace("_link", "")
        speed = KMH[cls]
        bridge = w["tags"].get("bridge") == "yes"
        pts = [(p["lat"], p["lon"]) for p in w["geometry"]]
        ids = [(round(la, 7), round(lo, 7)) for la, lo in pts]   # shared OSM nodes have identical coordinates
        for n, (a, b) in enumerate(zip(ids, ids[1:])):
            d = km(pts[n], pts[n + 1])
            g.add_node(a, pos=pts[n]); g.add_node(b, pos=pts[n + 1])
            g.add_edge(a, b, km=d, min=60 * d / speed, cls=cls, bridge=bridge, way=w["id"], ref=w["tags"].get("ref", ""))
    return g.subgraph(max(nx.connected_components(g), key=len)).copy()


def nearest(latlon):
    g = graph()
    return min(g.nodes, key=lambda n: km(g.nodes[n]["pos"], latlon))


def route(a, b, avoid=()):
    """Fastest route between two (lat, lon) points; avoid = way ids treated as cut (a blown bridge)."""
    g = graph()
    if avoid:
        g = nx.restricted_view(g, [], [(u, v) for u, v, d in g.edges(data=True) if d["way"] in set(avoid)])
    path = nx.shortest_path(g, nearest(a), nearest(b), weight="min")
    edges = [g.edges[u, v] for u, v in zip(path, path[1:])]
    return {"km": round(sum(e["km"] for e in edges), 1), "min": round(sum(e["min"] for e in edges)),
            "bridges": sorted({e["way"] for e in edges if e["bridge"]}),
            "line": [g.nodes[n]["pos"] for n in path]}
