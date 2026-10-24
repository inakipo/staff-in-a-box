"""When the mission cannot be met: generate the ways out and measure each one with the same engine."""

from . import assign, montecarlo, sim, validate

OLD = {"B-REC": "screen east", "B-1": "block X5", "B-2": "seize X4", "B-3": "seize X1"}


def candidates():
    out = [{"id": "A", "name": "Accept the risk at X6", "plan": OLD, "depart": {},
            "idea": "Keep the plan; Red recce (6 vehicles) may cross X6 unseen."},
           {"id": "B", "name": "Recce watches X6 instead of the east", "plan": {**OLD, "B-REC": "watch X6"}, "depart": {},
            "idea": "We would see Red at X6, but lose the early warning on the main Red force."}]
    best = assign.solve()
    out.append({"id": "C", "name": "Re-task: a battalion clears X6, engineers blow X5", "plan": best["assignment"], "depart": {},
                "idea": "The solver's plan with no head start: it attacks the small Red recce at X6 instead of racing it."})
    eng = [u for u, t in best["assignment"].items() if u == "B-ENG"]
    if eng:
        head = robust_head_start(best["assignment"], "B-ENG")
        out.append({"id": "D", "name": f"Same, engineers leave {head} min early", "plan": best["assignment"], "depart": {"B-ENG": -head},
                    "idea": "The smallest engineer head start that holds every crossing in at least 90 % of 1,000 runs."})
    return out


def robust_head_start(plan, unit, target=90.0, step=5, limit=60, n=1000):
    """Smallest head start for one unit so that ALL checks pass in at least target % of Monte Carlo runs."""
    for head in range(0, limit + 1, step):
        if montecarlo.run_many(plan, n=n, base_depart={unit: -head})["checks_pct"]["ALL CHECKS"] >= target:
            return head
    return limit


def evaluate(n=1000, fusion_seeds=range(30)):
    from bench_fusion import board
    res = []
    for o in candidates():
        nominal = validate.check(o["plan"], sim.run(o["plan"], depart=o["depart"], tracks=False))
        mc = montecarlo.run_many(o["plan"], n=n, base_depart=o["depart"])
        pct = mc["checks_pct"]
        race = lambda at: min([v for k, v in pct.items() if k.startswith("race") and k.endswith("at " + at)] or [None], key=lambda v: v if v is not None else 101)
        fb = board(seeds=fusion_seeds, times=(150,), plan=o["plan"], depart=o["depart"])[150]
        res.append({**o, "nominal_pass": sum(c["pass"] for c in nominal), "nominal_total": len(nominal),
                    "nominal_fails": [c for c in nominal if not c["pass"]],
                    "mc_all_pct": pct["ALL CHECKS"], "mc_x5_pct": race("X5"), "mc_x6_pct": race("X6"), "mc_x4_pct": race("X4"),
                    "fusion_at_h150": fb["found_pct_by_unit"], "top_failures": {k: v[:2] for k, v in mc["top_failures"].items()}})
    return res
