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


def blown_edges(positions, radius_km=0.3):
    """Every bridge segment within radius of a crossing: both carriageways of a motorway, slip roads, the lot."""
    g = graph()
    return [(u, v) for u, v, d in g.edges(data=True) if d["bridge"]
            and any(km(g.nodes[u]["pos"], p) < radius_km or km(g.nodes[v]["pos"], p) < radius_km for p in positions)]


def route(a, b, kmh=None, blown=()):
    """Fastest route between two (lat, lon) points for a column that cannot exceed kmh; blown = crossing positions
    whose bridges are cut. Returns km, minutes, and the line with the minute each point is reached."""
    g = graph()
    if blown:
        g = nx.restricted_view(g, [], blown_edges(blown))

    def minutes(u, v, d):
        return 60 * d["km"] / min(KMH[d["cls"]], kmh or 999)

    path = nx.shortest_path(g, nearest(a), nearest(b), weight=minutes)
    line, t, dist = [], 0.0, 0.0
    for n, node in enumerate(path):
        if n:
            d = g.edges[path[n - 1], node]
            t += minutes(path[n - 1], node, d)
            dist += d["km"]
        line.append((*g.nodes[node]["pos"], round(t, 2)))
    return {"km": round(dist, 1), "min": round(t), "line": line}
