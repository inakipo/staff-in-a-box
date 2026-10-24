"""Unit tests for a plan, checked against the MISSION (not against whatever task list the planner wrote): every
check passes or fails with a reason a human can act on."""

from .roads import km
from .sim import scenario, where

FUEL_RESERVE = 0.2


def race_ok(unit, red_unit, blue_arrive, red_arrive, rules):
    """The one race rule, shared by the solver and the validator. Returns (ok, reason)."""
    if unit["type"] == "engineer":
        ready = blue_arrive + rules["demolition_prep_min"]
        return ready <= red_arrive, f"charges ready H+{ready}, Red arrives H+{red_arrive}" + ("" if ready <= red_arrive else f": {ready - red_arrive} min too late")
    ratio = red_unit["vehicles"] / unit["vehicles"]
    if blue_arrive <= red_arrive:
        lim = rules["defence_holds_at_ratio_below"]
        return ratio < lim, f"Blue first by {red_arrive - blue_arrive} min; attacker ratio {ratio:.1f}:1 (defence holds below {lim}:1)"
    need = rules["attack_ratio_vs_hasty_defence"]
    return 1 / ratio >= need, f"Red first by {blue_arrive - red_arrive} min; Blue must attack at {1 / ratio:.1f}:1, needs {need}:1"


def check(assignment, truth):
    s = scenario()
    blue = {u["id"]: u for u in s["blue"]}
    red = {u["id"]: u for u in s["red"]}
    rules = s["planning_rules"]
    tasks = s["plan"]["tasks"]
    out = []

    def add(name, ok, why):
        out.append({"check": name, "pass": bool(ok), "why": why})

    # 1. coverage against the mission effects
    for e in s["mission_effects"]:
        kinds = {"seize": {"seize"}, "deny": {"block"}}[e["effect"]]
        owners = [u for u, t in assignment.items() if tasks[t]["at"] == e["at"] and tasks[t]["kind"] in kinds]
        watchers = [u for u, t in assignment.items() if tasks[t]["at"] == e["at"] and tasks[t]["kind"] == "screen"]
        why = f"{e['effect']} {e['at']}: " + (", ".join(owners) if owners else "nobody assigned" + (f" ({', '.join(watchers)} only watching)" if watchers else ""))
        add(f"mission: {e['effect']} {e['at']}", len(owners) == 1, why)
        for other in e.get("also_covers", []):
            d = km(where(s, e["at"]), where(s, other))
            add(f"mission: {e['effect']} {other}", bool(owners) and d < 1.5, f"{other} is {d:.1f} km from {e['at']}, held from there")
    # 2. per unit: deadline, fuel, and the race against the enemy for that crossing
    by = {e["at"]: e.get("by_min") for e in s["mission_effects"]}
    for u, tk in assignment.items():
        tr, at = truth[u], tasks[tk]["at"]
        if tasks[tk]["kind"] == "seize" and by.get(at):
            add(f"deadline: {u} at {at}", tr["arrive"] <= by[at], f"arrives H+{tr['arrive']}, deadline H+{by[at]}")
        left = 1 - tr["fuel_l"] / blue[u]["fuel_l"]
        add(f"fuel: {u}", left >= FUEL_RESERVE, f"{round(100 * left)} % left on arrival (reserve {round(100 * FUEL_RESERVE)} %)")
        if tasks[tk]["kind"] == "screen":
            continue
        for rid, r in red.items():
            if r["aim"] != at:
                continue
            ok, why = race_ok(blue[u], red[rid], tr["arrive"], truth[rid]["arrive"], rules)
            add(f"race: {u} vs {rid} at {at}", ok, why)
    # 3. a crossing the mission must deny, that Red reaches with nobody there
    for e in s["mission_effects"]:
        if e["effect"] != "deny":
            continue
        if not any(tasks[t]["at"] == e["at"] and tasks[t]["kind"] == "block" for t in assignment.values()):
            for rid, r in red.items():
                if r["aim"] == e["at"]:
                    add(f"race: nobody vs {rid} at {e['at']}", False, f"{rid} crosses {e['at']} at H+{truth[rid]['arrive']} unopposed")
    return out
