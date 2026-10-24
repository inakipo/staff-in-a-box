"""Data for the interactive lab (lab/labdata.js): the real road graph in compact form, reference answers from the
engine, report streams and truth for fusion, the solver table, and route minutes for Monte Carlo."""

import json

from . import assign, fusion, reports, roads, sim
from .roads import ROOT, km

R5 = lambda x: round(x, 5)


def _drive_tables(s):
    """Real drive minutes to X5 for each 5 % speed factor, as the engine computes them (road limits still apply)."""
    out = {}
    units = {u["id"]: u for u in s["blue"] + s["red"]}
    for uid, lo, hi in (("B-1", 0.75, 1.0), ("B-3", 0.75, 1.0), ("R-1", 0.8, 1.15)):
        u = units[uid]
        f, row = lo, {}
        while f <= hi + 1e-9:
            q = round(round(f / 0.05) * 0.05, 2)
            row[f"{q:.2f}"] = sim._route(sim.where(s, u["start"]), sim.where(s, "X5"), round(u["kmh"] * q, 1))["min"]
            f += 0.05
        out[uid] = row
    return out


def build():
    s = sim.scenario()
    P, X = s["places"], s["crossings"]
    g = roads.graph()
    idx = {n: i for i, n in enumerate(g.nodes)}
    cls_code = {"tertiary": 0, "secondary": 1, "primary": 2, "trunk": 3, "motorway": 4}
    nodes = [[R5(g.nodes[n]["pos"][0]), R5(g.nodes[n]["pos"][1])] for n in g.nodes]
    edges = [[idx[u], idx[v], round(d["km"], 4), cls_code[d["cls"]], 1 if d["bridge"] else 0] for u, v, d in g.edges(data=True)]
    start, south = P["camp_mailly"]["pos"], (48.50, 4.12)
    blown = [X["X1"]["pos"], X["X2"]["pos"]]
    cut = [[idx[u], idx[v]] for u, v in roads.blown_edges(blown)]
    ref = {"start": idx[roads.nearest(start)], "goal": idx[roads.nearest(south)], "kmh": 35,
           "normal_min": roads.route(start, south, kmh=35)["min"], "blown_min": roads.route(start, south, kmh=35, blown=blown)["min"],
           "extra_queries": []}
    for a, b in (("camp_mailly", "X4"), ("sommesous", "X1"), ("camp_mailly", "X6")):
        pa, pb = P[a]["pos"], (P.get(b) or X[b])["pos"]
        r = roads.route(pa, pb, kmh=35)
        ref["extra_queries"].append({"from": a, "to": b, "start": idx[roads.nearest(pa)], "goal": idx[roads.nearest(pb)], "min": r["min"]})
    # exact float minutes too, for tolerant tests
    plan = {"B-REC": "screen east", "B-1": "block X5", "B-2": "seize X4", "B-3": "seize X1"}
    truth1 = sim.run(plan)
    rep = reports.generate(truth1)
    reds = {u: [[t, R5(a), R5(b)] for t, a, b in v["track"][::2]] for u, v in truth1.items() if v["side"] == "red"}
    b1 = truth1["B-1"]
    t = assign.table(drop=["deny X6", "watch X6"])
    t5 = assign.table()
    data = {
        "kmh_by_class": [roads.KMH[k] for k in ("tertiary", "secondary", "primary", "trunk", "motorway")],
        "graph": {"nodes": nodes, "edges": edges, "cut_x1_x2": cut},
        "dijkstra_ref": ref,
        "crossings": {k: v["pos"] for k, v in X.items()}, "places": {k: v["pos"] for k, v in P.items()},
        "route_b1_x5": {"line": [[R5(a), R5(b), m] for a, b, m in b1["line"]], "depart": 0, "arrive": b1["arrive"],
                        "probe": [{"t": tt, "pos": [R5(x) for x in sim.position(b1["line"], tt)]} for tt in (0, 10, 37, 60, 73, 100)]},
        "reports": rep, "red_truth": reds,
        "fusion_defaults": {"gate_km": fusion.GATE_KM, "gate_km_per_10min": fusion.GATE_KM_PER_10MIN, "gate_max_km": fusion.GATE_MAX_KM,
                            "max_kmh": fusion.MAX_KMH, "alpha": fusion.ALPHA, "beta": fusion.BETA, "coast_min": fusion.COAST_MIN,
                            "merge_km": fusion.MERGE_KM, "half_life_min": fusion.HALF_LIFE_MIN, "reid_kmh": fusion.REID_KMH, "reid_max_gap": fusion.REID_MAX_GAP},
        "solver_first": {"units": ["B-REC", "B-1", "B-2", "B-3"], "tasks": ["screen east", "seize X1", "seize X4", "block X5"],
                         "cells": {f"{u}|{k}": {"min": v["ready"], "eligible": v["eligible"], "reason": v["reason"]} for (u, k), v in t.items() if u != "B-ENG"},
                         "answer": assign.solve(drop=["deny X6", "watch X6"])},
        "solver_full": {"units": ["B-REC", "B-1", "B-2", "B-3", "B-ENG"], "tasks": ["screen east", "seize X1", "seize X4", "block X5", "deny X6"],
                        "cells": {f"{u}|{k}": {"min": v["ready"], "eligible": v["eligible"], "reason": v["reason"]} for (u, k), v in t5.items() if k != "watch X6"},
                        "answer": assign.solve(drop=["watch X6"])},
        "mc": {"blocker_x5_min": {"B-1": t["B-1", "block X5"]["min"], "B-3": t["B-3", "block X5"]["min"]},
               "r1_x5_min": sim.run({}, tracks=False)["R-1"]["arrive"] - s["red"][0]["depart_min"], "r1_depart": s["red"][0]["depart_min"],
               "vehicles": {u["id"]: u["vehicles"] for u in s["blue"] + s["red"]},
               "rules": s["planning_rules"], "engine_pct": {"solver": 89.3, "intuitive": 48.1},
               "drive_min_by_factor": _drive_tables(s)},
    }
    (ROOT / "lab/labdata.js").write_text("window.LAB = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    # the engine's fusion as plain Python the lab can load into Pyodide (no numpy/scipy/networkx needed)
    src = (ROOT / "sib/fusion.py").read_text().replace("from .roads import km\n", "")
    kmsrc = "import math\n\n\ndef km(a, b):\n" + (ROOT / "sib/roads.py").read_text().split("def km(a, b):\n", 1)[1].split("\n\n\n", 1)[0] + "\n\n\n"
    (ROOT / "lab/fusion_py.js").write_text("window.FUSION_PY = " + json.dumps(kmsrc + src) + ";\n")
    return {k: len(json.dumps(v)) // 1024 for k, v in data.items()}


if __name__ == "__main__":
    print(build())
