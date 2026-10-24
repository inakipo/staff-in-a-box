"""Which unit takes which task: a constraint solver (OR-Tools CP-SAT), with a proof of optimality and an explanation
of every choice ("what would happen if we did it the obvious way instead?")."""

from ortools.sat.python import cp_model

from .sim import _route, scenario, where

FUEL_RESERVE = 0.2
# doctrine-style eligibility: recce screens, it does not hold ground; logistics and engineers support, they do not fight
ELIGIBLE = {"screen": {"recon"}, "seize": {"mech_inf", "armour"}, "block": {"mech_inf", "armour"}}


def table():
    s = scenario()
    units = [u for u in s["blue"] if u["type"] in {"recon", "mech_inf", "armour"}]
    out = {}
    for u in units:
        for name, task in s["plan"]["tasks"].items():
            r = _route(where(s, u["start"]), where(s, task["at"]), u["kmh"])
            fuel_left = 1 - r["km"] * u["l_per_km"] / u["fuel_l"]
            ok = u["type"] in ELIGIBLE[task["kind"]] and fuel_left >= FUEL_RESERVE
            out[u["id"], name] = {"min": r["min"], "km": r["km"], "fuel_left": round(fuel_left, 2), "eligible": ok}
    return out


def solve(force=None, forbid=()):
    """force: {(unit, task): 1} pins a choice (used to explain alternatives). Objective: earliest last arrival, then
    least total time. Returns status, assignment, last arrival."""
    t = table()
    units = sorted({u for u, _ in t})
    tasks = sorted({k for _, k in t})
    m = cp_model.CpModel()
    x = {k: m.NewBoolVar(f"{k[0]}|{k[1]}") for k in t}
    for k, v in t.items():
        if not v["eligible"] or k in forbid:
            m.Add(x[k] == 0)
    for k in (force or {}):
        m.Add(x[k] == 1)
    for tk in tasks:
        m.AddExactlyOne(x[u, tk] for u in units)
    for u in units:
        m.AddAtMostOne(x[u, tk] for tk in tasks)
    last = m.NewIntVar(0, 10_000, "last")
    for k, v in t.items():
        m.Add(last >= v["min"]).OnlyEnforceIf(x[k])
    m.Minimize(last * 1000 + sum(v["min"] * x[k] for k, v in t.items()))
    sv = cp_model.CpSolver()
    sv.parameters.num_workers = 1   # single thread: same answer every time
    st = sv.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": sv.StatusName(st), "assignment": None, "last": None}
    a = {u: tk for (u, tk), var in x.items() if sv.Value(var)}
    return {"status": sv.StatusName(st), "assignment": a, "last": sv.Value(last),
            "total": sum(t[u, tk]["min"] for u, tk in a.items()), "wall_ms": round(sv.WallTime() * 1000, 1)}


def explain():
    """For every task, the fastest eligible unit and what the plan would cost if we gave it that task instead."""
    best = solve()
    t = table()
    why = []
    for u, tk in sorted(best["assignment"].items(), key=lambda x: x[1]):
        fastest = min((k for k in t if k[1] == tk and t[k]["eligible"]), key=lambda k: t[k]["min"])[0]
        row = {"task": tk, "chosen": u, "chosen_min": t[u, tk]["min"], "fastest": fastest, "fastest_min": t[fastest, tk]["min"]}
        if fastest != u:
            alt = solve(force={(fastest, tk): 1})
            row["if_fastest"] = {"last": alt["last"], "assignment": alt["assignment"]}
        why.append(row)
    return best, why
