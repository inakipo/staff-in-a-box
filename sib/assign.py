"""Which unit takes which task: a constraint solver (OR-Tools CP-SAT), with a proof of optimality, an explanation of
every choice, and a diagnosis when the mission cannot be met.

Tasks come from the scenario's mission effects. Every task has a deadline: seize tasks by their time limit, deny tasks
before the enemy's estimated arrival (engineers also need time to rig the demolition)."""

from functools import lru_cache

from ortools.sat.python import cp_model

from .sim import _route, run, scenario, where
from .validate import race_ok

FUEL_RESERVE = 0.2
# doctrine-style eligibility: recce screens, it does not hold ground; engineers can deny a bridge by demolition
ELIGIBLE = {"screen": {"recon"}, "seize": {"mech_inf", "armour"}, "block": {"mech_inf", "armour", "engineer"}}
NO_DEADLINE = 10_000


@lru_cache(1)
def enemy_estimate():
    """Nominal Red arrival per crossing: the most likely enemy course of action, as intelligence would brief it."""
    s = scenario()
    red = run({}, tracks=False)
    return {r["aim"]: red[r["id"]]["arrive"] for r in s["red"]}


def tasks(drop=()):
    s = scenario()
    out = {k: dict(v) for k, v in s["plan"]["tasks"].items() if k not in drop}
    eta = enemy_estimate()
    by = {e["at"]: e.get("by_min", NO_DEADLINE) for e in s["mission_effects"]}
    for k, t in out.items():
        t["by"] = by.get(t["at"], NO_DEADLINE)
        t["deadline"] = min(t["by"], eta.get(t["at"], NO_DEADLINE))
    return out


def table(depart=None, drop=()):
    s = scenario()
    depart = depart or {}
    units = [u for u in s["blue"] if u["type"] in {"recon", "mech_inf", "armour", "engineer"}]
    rules = s["planning_rules"]
    prep = rules["demolition_prep_min"]
    red_at = {r["aim"]: r for r in s["red"]}
    eta = enemy_estimate()
    out = {}
    for u in units:
        for name, task in tasks(drop).items():
            r = _route(where(s, u["start"]), where(s, task["at"]), u["kmh"])
            arrive = depart.get(u["id"], 0) + r["min"]
            ready = arrive + (prep if u["type"] == "engineer" and task["kind"] == "block" else 0)
            fuel_left = 1 - r["km"] * u["l_per_km"] / u["fuel_l"]
            reason = None
            if u["type"] not in ELIGIBLE[task["kind"]]:
                reason = "not this unit's job"
            elif fuel_left < FUEL_RESERVE:
                reason = f"fuel {round(100 * fuel_left)} % on arrival"
            elif task["kind"] != "screen" and task["at"] in red_at:
                ok, why = race_ok(u, red_at[task["at"]], arrive, eta[task["at"]], rules)   # same rule as the validator
                if not ok:
                    reason = why
            if reason is None and arrive > task["by"]:
                reason = f"arrives H+{arrive}, deadline H+{task['by']}"
            out[u["id"], name] = {"min": r["min"], "arrive": arrive, "ready": ready, "km": r["km"], "fuel_left": round(fuel_left, 2),
                                  "deadline": task["deadline"], "eligible": reason is None, "reason": reason,
                                  "supporting": bool(task.get("supporting"))}
    return out


def solve(force=None, forbid=(), depart=None, drop=()):
    """Every required task gets exactly one unit; supporting tasks are covered when possible. Objective: earliest last
    ready time, then least total time. On failure, diagnose which tasks no unit can meet in time."""
    t = table(depart, drop)
    units = sorted({u for u, _ in t})
    names = sorted({k for _, k in t})
    m = cp_model.CpModel()
    x = {k: m.NewBoolVar(f"{k[0]}|{k[1]}") for k in t}
    for k, v in t.items():
        if not v["eligible"] or k in forbid:
            m.Add(x[k] == 0)
    for k in (force or {}):
        m.Add(x[k] == 1)
    missed = []
    for tk in names:
        if any(t[u, tk]["supporting"] for u in units):
            covered = m.NewBoolVar(f"covered|{tk}")
            m.Add(sum(x[u, tk] for u in units) == covered)
            missed.append(1 - covered)
        else:
            m.AddExactlyOne(x[u, tk] for u in units)
    for u in units:
        m.AddAtMostOne(x[u, tk] for tk in names)
    last = m.NewIntVar(-1000, 10_000, "last")
    for k, v in t.items():
        if not v["supporting"]:
            m.Add(last >= v["ready"]).OnlyEnforceIf(x[k])
    m.Minimize(sum(missed) * 1_000_000 + last * 1000 + sum(v["ready"] * x[k] for k, v in t.items()))
    sv = cp_model.CpSolver()
    sv.parameters.num_workers = 1   # single thread: same answer every time
    st = sv.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": sv.StatusName(st), "assignment": None, "last": None, "impossible": diagnose(t)}
    a = {u: tk for (u, tk), var in x.items() if sv.Value(var)}
    return {"status": sv.StatusName(st), "assignment": a, "last": sv.Value(last),
            "total": sum(t[u, tk]["ready"] for u, tk in a.items()), "wall_ms": round(sv.WallTime() * 1000, 1), "impossible": []}


def diagnose(t):
    """Tasks that no eligible unit can be ready for in time, with the best near-miss."""
    out = []
    for tk in sorted({k for _, k in t}):
        rows = [(u, v) for (u, k), v in t.items() if k == tk]
        if any(v["eligible"] for _, v in rows) or rows[0][1]["supporting"]:
            continue
        able = [(u, v) for u, v in rows if v["reason"] and v["reason"] != "not this unit's job"]
        u, v = min(able, key=lambda r: r[1]["ready"]) if able else (None, None)
        out.append({"task": tk, "deadline": rows[0][1]["deadline"], "closest_unit": u, "closest_ready": v and v["ready"],
                    "short_by_min": v and v["ready"] - v["deadline"], "why": v and v["reason"]})
    return out


def earliest_start(unit_ids=None, step=5, limit=120, drop=()):
    """Smallest head start (minutes before H-hour) that makes the mission feasible, for the given units (or all)."""
    s = scenario()
    ids = unit_ids or [u["id"] for u in s["blue"]]
    for adv in range(0, limit + 1, step):
        r = solve(depart={u: -adv for u in ids}, drop=drop)
        if r["assignment"]:
            return adv, r
    return None, None


def explain(depart=None, drop=()):
    """For every task, the fastest eligible unit and what the plan would cost if we gave it that task instead."""
    best = solve(depart=depart, drop=drop)
    if not best["assignment"]:
        return best, []
    t = table(depart, drop)
    why = []
    for u, tk in sorted(best["assignment"].items(), key=lambda x: x[1]):
        fastest = min((k for k in t if k[1] == tk and t[k]["eligible"]), key=lambda k: t[k]["ready"])[0]
        row = {"task": tk, "chosen": u, "chosen_min": t[u, tk]["ready"], "fastest": fastest, "fastest_min": t[fastest, tk]["ready"]}
        if fastest != u:
            alt = solve(force={(fastest, tk): 1}, depart=depart, drop=drop)
            row["if_fastest"] = {"last": alt["last"], "total": alt.get("total"), "assignment": alt["assignment"]}
        why.append(row)
    return best, why
