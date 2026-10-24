"""Unit tests for a plan: every check passes or fails with a reason a human can act on."""

from .roads import km
from .sim import scenario, where

DEADLINE = 300            # H+5
FUEL_RESERVE = 0.2


def check(assignment, truth):
    s = scenario()
    blue = {u["id"]: u for u in s["blue"]}
    red = {u["id"]: u for u in s["red"]}
    rules = s["planning_rules"]
    out = []

    def add(name, ok, why):
        out.append({"check": name, "pass": bool(ok), "why": why})

    tasks = s["plan"]["tasks"]
    for tk in tasks:
        owners = [u for u, t in assignment.items() if t == tk]
        add(f"coverage: {tk}", len(owners) == 1, f"{len(owners)} unit(s) assigned")
    for u, tk in assignment.items():
        tr = truth[u]
        if tasks[tk]["kind"] == "seize":
            add(f"deadline: {u} at {tk}", tr["arrive"] <= DEADLINE, f"arrives H+{tr['arrive']} min, deadline H+{DEADLINE}")
        left = 1 - tr["fuel_l"] / blue[u]["fuel_l"]
        add(f"fuel: {u}", left >= FUEL_RESERVE, f"{round(100 * left)} % left on arrival (reserve {round(100 * FUEL_RESERVE)} %)")
        # who gets to the bridge first, and does the force ratio hold?
        at = tasks[tk]["at"]
        for rid, r in red.items():
            if r["aim"] != at:
                continue
            ratio = red[rid]["vehicles"] / blue[u]["vehicles"]
            if truth[u]["arrive"] <= truth[rid]["arrive"]:
                add(f"race: {u} vs {rid} at {at}", ratio < rules["defence_holds_at_ratio_below"],
                    f"Blue first by {truth[rid]['arrive'] - truth[u]['arrive']} min; attacker ratio {ratio:.1f}:1 "
                    f"(defence holds below {rules['defence_holds_at_ratio_below']}:1)")
            else:
                need = rules["attack_ratio_vs_hasty_defence"]
                add(f"race: {u} vs {rid} at {at}", 1 / ratio >= need,
                    f"Red first by {truth[u]['arrive'] - truth[rid]['arrive']} min; Blue must attack at {1 / ratio:.1f}:1, needs {need}:1")
    # mission names X2 too: the unit seizing X1 must be close enough to hold both Arcis bridges
    x1 = [u for u, t in assignment.items() if tasks[t]["at"] == "X1"]
    d = km(where(s, "X1"), where(s, "X2"))
    add("coverage: X2 held from X1", bool(x1) and d < 1.5, f"X2 is {d:.1f} km from X1")
    return out
