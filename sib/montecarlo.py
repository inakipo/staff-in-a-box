"""Does the plan survive bad luck? Run it many times with seeded delays and speed changes; report how often each
task succeeds and why it fails."""

import random

from .sim import run, scenario
from .validate import check

QUANT = 0.05   # speed factors in 5 % steps, so routes come from the cache


def perturb(rng, s, base=None):
    depart, speed = {}, {}
    base = base or {}
    for u in s["blue"]:
        depart[u["id"]] = base.get(u["id"], 0) + min(60, round(rng.expovariate(1 / 10)))          # late starts: mostly small, sometimes an hour
        speed[u["id"]] = round(rng.uniform(0.75, 1.0) / QUANT) * QUANT     # traffic, refugees, wrong turns
    for u in s["red"]:
        depart[u["id"]] = max(0, u["depart_min"] + rng.randint(-25, 25))
        speed[u["id"]] = round(rng.uniform(0.8, 1.15) / QUANT) * QUANT
    return depart, speed


def run_many(assignment, n=1000, seed=7, base_depart=None):
    s = scenario()
    rng = random.Random(seed)
    tally, fails, samples = {}, {}, []
    for i in range(n):
        depart, speed = perturb(rng, s, base_depart)
        truth = run(assignment, depart=depart, speed=speed, tracks=False)
        res = check(assignment, truth)
        for c in res:
            tally.setdefault(c["check"], 0)
            tally[c["check"]] += c["pass"]
            if not c["pass"]:
                fails.setdefault(c["check"], []).append(c["why"])
        ok = all(c["pass"] for c in res)
        tally.setdefault("ALL CHECKS", 0)
        tally["ALL CHECKS"] += ok
        if i < 200:
            samples.append({"ok": ok, "arrive": {u: v["arrive"] for u, v in truth.items()}})
    return {"runs": n, "plan_ok_pct": round(100 * sum(x["ok"] for x in samples) / len(samples)) if n <= 200 else None,
            "checks_pct": {k: round(100 * v / n, 1) for k, v in tally.items()},
            "top_failures": {k: v[:3] for k, v in fails.items()}, "samples": samples}
