"""Everything the 3D viewer needs, as one JS file (window.SIB = {...}) so it opens straight from disk."""

import heapq
import json

from shapely.geometry import LineString

from . import assign, fusion, montecarlo, reports, roads, sim, terrain, validate
from .roads import ROOT, km

R5 = lambda x: round(x, 5)


def _lines(path, keep, tol=0.00025):
    out = []
    for w in json.load((ROOT / path).open())["elements"]:
        k = keep(w["tags"])
        if not k:
            continue
        ls = LineString([(p["lon"], p["lat"]) for p in w["geometry"]]).simplify(tol)
        out.append({"k": k, "p": [[R5(y), R5(x)] for x, y in ls.coords]})
    return out


def _dijkstra_ripple(a, b, kmh, blown=(), every=6):
    """Settle order of Dijkstra from a to b: the ripple. Returns sampled settled nodes with their minute."""
    g = roads.graph()
    cut = set(roads.blown_edges(blown)) if blown else set()
    src, dst = roads.nearest(a), roads.nearest(b)
    dist, seen, order, prev = {src: 0.0}, set(), [], {}
    pq = [(0.0, src)]
    while pq:
        d, n = heapq.heappop(pq)
        if n in seen:
            continue
        seen.add(n)
        order.append((d, n))
        if n == dst:
            break
        for m, e in g[n].items():
            if (n, m) in cut or (m, n) in cut:
                continue
            nd = d + 60 * e["km"] / min(roads.KMH[e["cls"]], kmh)
            if nd < dist.get(m, 1e18):
                dist[m] = nd
                prev[m] = n
                heapq.heappush(pq, (nd, m))
    path, n = [], dst
    while n in prev or n == src:
        path.append(g.nodes[n]["pos"])
        if n == src:
            break
        n = prev[n]
    pts = [[R5(g.nodes[n]["pos"][0]), R5(g.nodes[n]["pos"][1]), round(d, 1)] for i, (d, n) in enumerate(order) if i % every == 0]
    return {"settled": len(order), "points": pts, "path": [[R5(p[0]), R5(p[1])] for p in reversed(path)], "minutes": round(order[-1][0], 1)}


def build():
    s = sim.scenario()
    P, X = s["places"], s["crossings"]
    best, why = assign.explain()
    plan = best["assignment"]
    intuitive = {"B-REC": "screen east", "B-1": "seize X1", "B-2": "seize X4", "B-3": "block X5"}
    truth = sim.run(plan, step=2)                 # for display
    rep = reports.generate(sim.run(plan))          # reports need minute steps (detection is rolled per minute)
    snaps = []
    for t in range(0, 361, 5):
        tr, _ = fusion.fuse(rep, until=t)
        snaps.append({"t": t, "tracks": [{"id": x["id"], "pos": x["pos"], "size": x["size"], "type": x["type"], "confirmed": x["confirmed"],
                                          "conf": x["confidence"], "n": len(x["reports"]),
                                          "gate": round(min(fusion.GATE_KM + fusion.GATE_KM_PER_10MIN * max(0, t - x["last_seen"]) / 10, fusion.GATE_MAX_KM), 2)}
                                         for x in tr]})
    _, flog = fusion.fuse(rep)
    south = (48.50, 4.12)
    mc = {}
    for name, p in (("solver", plan), ("intuitive", intuitive)):
        r = montecarlo.run_many(p, n=1000)
        blocker = [u for u, t in p.items() if t == "block X5"][0]
        mc[name] = {"plan": p, "checks_pct": r["checks_pct"], "top_failures": r["top_failures"],
                    "race": [[x["arrive"][blocker], x["arrive"]["R-1"]] for x in r["samples"]]}
    data = {
        "bbox": {"S": terrain.S, "W": terrain.W, "N": terrain.N, "E": terrain.E},
        "terrain": {"nx": 200, "ny": 250, "h": terrain.grid(200, 250)},
        "roads": _lines("data/osm/roads.json", lambda t: {"motorway": 4, "trunk": 3, "primary": 3, "secondary": 2, "tertiary": 1}.get(t["highway"].replace("_link", ""))),
        "rivers": _lines("data/osm/water.json", lambda t: 2 if t.get("name") in ("L'Aube", "La Marne") else 1),
        "places": {k: {"name": v["name"].split(" (")[0], "pos": v["pos"]} for k, v in P.items()},
        "crossings": {k: {"road": v["road"], "town": v["town"], "pos": v["pos"]} for k, v in X.items()},
        "units": {u["id"]: {"name": u["name"], "type": u["type"], "side": "blue" if u in s["blue"] else "red", "vehicles": u["vehicles"]}
                  for u in s["blue"] + s["red"]},
        "mission": s["mission"], "intent": s["intent"],
        "dijkstra": {"normal": _dijkstra_ripple(P["camp_mailly"]["pos"], south, 35),
                     "blown": _dijkstra_ripple(P["camp_mailly"]["pos"], south, 35, blown=[X["X1"]["pos"], X["X2"]["pos"]])},
        "truth": {u: {"target": v["target"], "depart": v["depart"], "arrive": v["arrive"], "km": v["km"], "fuel_l": v["fuel_l"],
                      "track": [[t, R5(a), R5(b)] for t, a, b in v["track"]]} for u, v in truth.items()},
        "reports": rep, "fusion": {"snapshots": snaps, "log": flog,
                                   "params": {"gate_km": fusion.GATE_KM, "gate_km_per_10min": fusion.GATE_KM_PER_10MIN, "gate_max_km": fusion.GATE_MAX_KM,
                                              "max_kmh": fusion.MAX_KMH, "alpha": fusion.ALPHA, "beta": fusion.BETA, "coast_min": fusion.COAST_MIN,
                                              "merge_km": fusion.MERGE_KM, "half_life_min": fusion.HALF_LIFE_MIN}},
        "assign": {"best": best, "why": why, "intuitive": intuitive,
                   "table": [{"unit": u, "task": k, **v} for (u, k), v in assign.table().items()]},
        "validate": validate.check(plan, sim.run(plan, tracks=False)),
        "montecarlo": mc,
    }
    js = "window.SIB = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "viewer/data.js").write_text(js)
    return {k: (len(json.dumps(v)) // 1024) for k, v in data.items()}


if __name__ == "__main__":
    print(build())
