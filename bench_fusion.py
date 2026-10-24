"""Fusion scoreboard: 30 seeded report streams over the baseline plan, scored against ground truth."""
import json, sys
from sib import sim, reports, fusion

PLAN = {"B-REC": "screen east", "B-3": "seize X1", "B-1": "seize X4", "B-2": "block X5"}


def board(seeds=range(30), times=(200, 300), plan=None, depart=None):
    truth = sim.run(plan or PLAN, depart=depart)
    out = {}
    for at in times:
        tot = {"found": 0, "seen": 0, "tracks": 0, "false": 0, "mixed": 0, "err": []}
        for seed in seeds:
            rep = reports.generate(truth, seed=seed)
            tr, _ = fusion.fuse(rep, until=at)
            sc = fusion.score(tr, truth, rep, at)
            for k in ("R-1", "R-2", "R-REC"):
                if not any(r["truth"] == k and r["received_min"] <= at for r in rep):
                    continue
                tot["seen"] += 1
                e = sc["red_found"][k]
                tot["found"] += e is not None
                tot["tracks"] += sc["tracks_per_red_unit"].get(k, 0)
                if e is not None:
                    tot["err"].append(e)
            tot["false"] += len(sc["false_tracks"]); tot["mixed"] += len(sc["mixed_tracks"])
            for k in ("R-1", "R-2", "R-REC"):
                tot.setdefault("found_" + k, 0)
                tot["found_" + k] += sc["red_found"][k] is not None
        out[at] = {"found_pct": round(100 * tot["found"] / tot["seen"]), "tracks_per_unit": round(tot["tracks"] / tot["seen"], 2),
                   "mean_err_km": round(sum(tot["err"]) / max(1, len(tot["err"])), 2), "false_tracks_per_run": round(tot["false"] / len(seeds), 2),
                   "mixed_tracks": tot["mixed"], "runs": len(seeds),
                   "found_pct_by_unit": {k: round(100 * tot["found_" + k] / len(seeds)) for k in ("R-1", "R-2", "R-REC")}}
    return out


if __name__ == "__main__":
    print(json.dumps(board(), indent=1))
