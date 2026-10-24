"""The claims the demo makes, as tests: deterministic, optimal, and measured. Run: .venv/bin/python -m pytest -q tests"""
import json

from sib import assign, fusion, montecarlo, reports, roads, sim, validate

PLAN = {"B-REC": "screen east", "B-3": "seize X1", "B-1": "seize X4", "B-2": "block X5"}


def test_blowing_arcis_bridges_forces_a_longer_detour():
    s = sim.scenario()
    a = roads.route(s["places"]["camp_mailly"]["pos"], (48.50, 4.12), kmh=35)
    b = roads.route(s["places"]["camp_mailly"]["pos"], (48.50, 4.12), kmh=35, blown=[s["crossings"]["X1"]["pos"], s["crossings"]["X2"]["pos"]])
    assert b["min"] > a["min"] + 15


def test_reports_are_reproducible_for_a_seed():
    truth = sim.run(PLAN)
    assert json.dumps(reports.generate(truth, seed=3)) == json.dumps(reports.generate(truth, seed=3))
    assert json.dumps(reports.generate(truth, seed=3)) != json.dumps(reports.generate(truth, seed=4))


def test_fusion_is_deterministic_and_finds_red():
    truth = sim.run(PLAN)
    rep = reports.generate(truth, seed=2026)
    a, _ = fusion.fuse(rep, until=300)
    b, _ = fusion.fuse(rep, until=300)
    assert a == b
    sc = fusion.score(a, truth, rep, 300)
    assert sc["false_tracks"] == [] and sc["mixed_tracks"] == []
    assert sum(sc["tracks_per_red_unit"].values()) <= 3


def test_solver_is_optimal_and_stable():
    r1, r2 = assign.solve(), assign.solve()
    assert r1["status"] == "OPTIMAL" and r1["assignment"] == r2["assignment"]
    assert r1["assignment"]["B-REC"] == "screen east"          # recce never holds a bridge
    assert r1["assignment"]["B-3"] == "seize X1"               # the slow armour takes the nearest bridge


def test_baseline_plan_passes_every_check():
    p = assign.solve()["assignment"]
    assert all(c["pass"] for c in validate.check(p, sim.run(p, tracks=False)))


def test_solver_plan_is_more_robust_than_intuitive():
    best = assign.solve()["assignment"]
    intuitive = {"B-REC": "screen east", "B-1": "seize X1", "B-2": "seize X4", "B-3": "block X5"}
    race = lambda r: next(v for k, v in r["checks_pct"].items() if k.startswith("race") and k.endswith("at X5"))
    a, b = montecarlo.run_many(best, n=300), montecarlo.run_many(intuitive, n=300)
    assert race(a) > race(b) + 20
    assert montecarlo.run_many(best, n=300) ["checks_pct"] == a["checks_pct"]   # same seed, same answer
