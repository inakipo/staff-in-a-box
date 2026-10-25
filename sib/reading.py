"""From radio text to the enemy picture, measured: field accuracy of a reader (a model, or perfect reading), and what
its mistakes cost after fusion.

  .venv/bin/python -m sib.reading make-eval            # data/radio/eval.json + eval.jsonl (model input)
  .mlx/bin/python sib/read_mlx.py data/radio/eval.jsonl data/radio/eval.<name>.jsonl [model] [adapter]
  .venv/bin/python -m sib.reading score <name>         # field accuracy + fusion with model readings vs perfect reading
"""

import json
import sys
from pathlib import Path

from . import fusion, radio, reports, sim
from .roads import ROOT, km

PLAN = {"B-REC": "screen east", "B-1": "block X5", "B-2": "seize X4", "B-3": "seize X1"}
EVAL_SEEDS = (2026, 101, 102)
D = ROOT / "data/radio"
FIELDS = ("time", "count", "unit_type", "activity", "heading")
ASSUMED_DELAY = 8      # when a message has no time, assume it was seen 8 minutes before it arrived


def streams(seeds, plan=PLAN):
    truth = sim.run(plan)
    out = []
    for sd in seeds:
        rep = reports.generate(truth, seed=sd)
        msgs = radio.stream(rep, seed=sd + 7, truth=truth)
        for m in msgs:
            m["stream"] = sd
            m["uid"] = f"{sd}:{m['id']}"
        out.append((sd, rep, msgs))
    return truth, out


def make_eval():
    D.mkdir(parents=True, exist_ok=True)
    _, ss = streams(EVAL_SEEDS)
    msgs = [m for _, _, ms in ss for m in ms]
    json.dump(msgs, (D / "eval.json").open("w"), ensure_ascii=False)
    with (D / "eval.jsonl").open("w") as f:
        for m in msgs:
            f.write(json.dumps({"id": m["uid"], "text": m["text"]}, ensure_ascii=False) + "\n")
    print(len(msgs), "eval messages,", sum(m["lang"] == "fr" for m in msgs), "in French")


def as_report(m, ext):
    """Turn an extraction into the structured report fusion expects (code does the maths)."""
    if not ext or not isinstance(ext, dict):
        return None
    pos = radio.locate(ext.get("location") or {})
    if pos is None:
        return None
    seen = radio.minutes(ext.get("time")) if ext.get("time") else None
    if seen is None or not (-60 <= seen <= 400):
        seen = m["received_min"] - ASSUMED_DELAY
    try:
        size = int(ext.get("count") or 0) or 1
    except (TypeError, ValueError):
        size = 1
    return {"id": m["id"], "seen_min": seen, "received_min": m["received_min"], "pos": [pos[0], pos[1]], "size": size,
            "type": ext.get("unit_type") or "unknown", "truth": m["truth"], "by": "radio"}


def field_scores(msgs, ext):
    n = len(msgs)
    out = {f: 0 for f in FIELDS}
    out.update({"location": 0, "all": 0, "unparsed": 0})
    errs = []
    for m in msgs:
        e = ext.get(m["uid"])
        if not isinstance(e, dict):
            out["unparsed"] += 1
            continue
        ok_all = True
        for f in FIELDS:
            good = e.get(f) == m["gold"][f] or (f == "count" and str(e.get(f)) == str(m["gold"][f]))
            out[f] += good
            ok_all &= good
        p, g = radio.locate(e.get("location") or {}), radio.locate(m["gold"]["location"])
        d = km(p, g) if p and g else 99
        errs.append(d)
        out["location"] += d <= 0.5
        ok_all &= d <= 0.5
        out["all"] += ok_all
    res = {k: round(100 * v / n, 1) for k, v in out.items()}
    res["n"] = n
    res["location_err_km_median"] = round(sorted(errs)[len(errs) // 2], 2) if errs else None
    return res


def fusion_scores(truth, ss, ext, at=300):
    """Fusion on each eval stream, with the reader's reports vs perfect reading. Same scoring as bench_fusion."""
    res = {"perfect": {"found": 0, "seen": 0, "false": 0, "tracks": 0}, "reader": {"found": 0, "seen": 0, "false": 0, "tracks": 0, "dropped": 0}}
    for sd, rep, msgs in ss:
        perfect = [as_report(m, m["gold"]) for m in msgs]
        mine = [as_report(m, ext.get(m["uid"])) for m in msgs]
        res["reader"]["dropped"] += sum(r is None for r in mine)
        for name, rs in (("perfect", perfect), ("reader", mine)):
            rs = [r for r in rs if r]
            tr, _ = fusion.fuse(rs, until=at)
            sc = fusion.score(tr, truth, rs, at)
            for k in ("R-1", "R-2", "R-REC"):
                if not any(r["truth"] == k and r["received_min"] <= at for r in rs):
                    continue
                res[name]["seen"] += 1
                res[name]["found"] += sc["red_found"][k] is not None
                res[name]["tracks"] += sc["tracks_per_red_unit"].get(k, 0)
            res[name]["false"] += len(sc["false_tracks"])
    for v in res.values():
        v["found_pct"] = round(100 * v["found"] / max(1, v["seen"]))
        v["tracks_per_unit"] = round(v["tracks"] / max(1, v["seen"]), 2)
        v["false_per_stream"] = round(v["false"] / len(ss), 2)
    return res


def score(name):
    msgs = json.load((D / "eval.json").open())
    ext = {}
    for l in (D / f"eval.{name}.jsonl").open():
        r = json.loads(l)
        ext[r["id"]] = r["parsed"]
    lat = [json.loads(l)["ms"] for l in (D / f"eval.{name}.jsonl").open()]
    truth, ss = streams(EVAL_SEEDS)
    out = {"reader": name, "fields": field_scores(msgs, ext), "fusion": fusion_scores(truth, ss, ext),
           "median_ms_per_message": sorted(lat)[len(lat) // 2]}
    (D / f"score.{name}.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    {"make-eval": lambda: make_eval(), "score": lambda: score(sys.argv[2])}[sys.argv[1]]()
