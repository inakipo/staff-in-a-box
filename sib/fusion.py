"""Report fusion: turn a stream of noisy spot reports into tracks, deterministically.

Each track predicts where its column should be now (last position + velocity x elapsed time). A new report joins the
track whose prediction is closest, if it falls inside the gate (distance AND plausible speed); reports are taken in the order
they were seen, and several may join the same track (duplicates are normal for human reports). A joined report nudges the track (alpha-beta filter, like a
light Kalman filter). Unmatched reports start a tentative track; a track needs 2 reports to be confirmed. Confidence
halves every hour without news."""

import math

from .roads import km

GATE_KM, GATE_KM_PER_10MIN, GATE_MAX_KM, MAX_KMH = 2.5, 1.0, 5.0, 60
ALPHA, BETA = 0.5, 0.2
HALF_LIFE_MIN = 60


COAST_MIN = 15


def _predict(tr, t):
    """Trust the speed for COAST_MIN minutes after the last sighting, then hold: columns stop, roads bend."""
    dt = max(-COAST_MIN, min(t - tr["t"], COAST_MIN))
    return tr["pos"][0] + tr["vel"][0] * dt, tr["pos"][1] + tr["vel"][1] * dt


def _cost(tr, r):
    """Distance to the prediction, or None when the report is outside the gate."""
    dt = max(0, r["seen_min"] - tr["t"])
    d = km(_predict(tr, r["seen_min"]), r["pos"])
    raw = km(tr["pos"], r["pos"])
    if d > min(GATE_KM + GATE_KM_PER_10MIN * dt / 10, GATE_MAX_KM):
        return None
    if dt > 0 and raw / (dt / 60) > MAX_KMH:
        return None
    return d


MERGE_KM = 1.5


REID_KMH, REID_MAX_GAP = 45, 90


def _profile(t):
    known = [x for x in t["types"] if x != "unknown"]
    return (max(set(known), key=known.count) if known else "unknown"), sorted(t["sizes"])[len(t["sizes"]) // 2]


def _same_unit_later(a, b):
    """Re-identification: b appeared after a went quiet; could a have driven there in time (road speed, not a
    straight-line sprint), and do type and size agree? Both tracks need 2 reports, so one ghost cannot hijack a column."""
    (pa, ta), (pb, tb) = a["last_report"], b["first"]
    gap = tb - ta
    if len(a["reports"]) < 2 or len(b["reports"]) < 2 or not 0 < gap <= REID_MAX_GAP:
        return False
    if km(pa, pb) * 1.3 / (gap / 60) > REID_KMH:   # roads are ~30 % longer than the straight line
        return False
    (ka, sa), (kb, sb) = _profile(a), _profile(b)
    return (ka == kb or "unknown" in (ka, kb)) and max(sa, sb) <= 1.6 * min(sa, sb)


def _merge(tracks, now, log):
    """Two tracks whose predictions sit on the same spot are one column seen twice: fold the younger into the older."""
    i = 0
    while i < len(tracks):
        j = i + 1
        while j < len(tracks):
            a, b = tracks[i], tracks[j]
            if (abs(a["t"] - b["t"]) <= 60 and km(_predict(a, now), _predict(b, now)) < MERGE_KM) or _same_unit_later(a, b) or _same_unit_later(b, a):
                newer = a if a["last_report"][1] >= b["last_report"][1] else b   # the latest sighting wins position and speed
                a["pos"], a["vel"], a["t"], a["last_report"] = list(newer["pos"]), list(newer["vel"]), newer["t"], newer["last_report"]
                a["first"] = min(a["first"], b["first"], key=lambda x: x[1])
                for k in ("reports", "sizes", "types"):
                    a[k] += b[k]
                log.append({"min": now, "event": "merged", "track": a["id"], "absorbed": b["id"]})
                del tracks[j]
            else:
                j += 1
        i += 1


def fuse(reports, until=None, batch_min=5):
    tracks, log = [], []
    pending = [r for r in reports if until is None or r["received_min"] <= until]
    batches = {}
    for r in pending:
        batches.setdefault(r["received_min"] // batch_min, []).append(r)
    for b in sorted(batches):
        batch = batches[b]
        # Human reports are not radar blips: three soldiers can report the same column in one batch. So no one-to-one
        # assignment here; each report, in the order it was seen, joins its nearest gated track.
        batch.sort(key=lambda r: (r["seen_min"], r["id"]))
        for r in batch:
            gated = [(c, n, t) for n, t in enumerate(tracks) if (c := _cost(t, r)) is not None]
            tr = min(gated)[2] if gated else None
            if tr is None:
                tr = {"id": f"T{len(tracks) + 1:02d}", "pos": list(r["pos"]), "vel": [0.0, 0.0], "t": r["seen_min"],
                      "first": (list(r["pos"]), r["seen_min"]), "last_report": (list(r["pos"]), r["seen_min"]),
                      "reports": [], "sizes": [], "types": [], "born": r["received_min"]}
                tracks.append(tr)
                log.append({"min": r["received_min"], "report": r["id"], "event": "new track", "track": tr["id"]})
            else:
                dt = max(1, r["seen_min"] - tr["t"])
                pred = _predict(tr, r["seen_min"])
                res = (r["pos"][0] - pred[0], r["pos"][1] - pred[1])
                if len(tr["reports"]) == 1:   # second report: speed from the two sightings, then filter from there
                    tr["vel"] = [(r["pos"][0] - tr["pos"][0]) / dt, (r["pos"][1] - tr["pos"][1]) / dt]
                    tr["pos"] = list(r["pos"])
                else:
                    tr["pos"] = [pred[0] + ALPHA * res[0], pred[1] + ALPHA * res[1]]
                    tr["vel"] = [tr["vel"][0] + BETA * res[0] / dt, tr["vel"][1] + BETA * res[1] / dt]
                if km((0, 0), (tr["vel"][0] * 60, tr["vel"][1] * 60)) > MAX_KMH:   # noise can fake a sprint: cap it
                    f = MAX_KMH / km((0, 0), (tr["vel"][0] * 60, tr["vel"][1] * 60))
                    tr["vel"] = [tr["vel"][0] * f, tr["vel"][1] * f]
                tr["t"] = max(tr["t"], r["seen_min"])
                log.append({"min": r["received_min"], "report": r["id"], "event": "joined", "track": tr["id"],
                            "miss_km": round(km(pred, r["pos"]), 2)})
            tr["reports"].append(r["id"]); tr["sizes"].append(r["size"]); tr["types"].append(r["type"])
            if r["seen_min"] >= tr["last_report"][1]:
                tr["last_report"] = (list(r["pos"]), r["seen_min"])
        _merge(tracks, (b + 1) * batch_min, log)
    now = until if until is not None else max((r["received_min"] for r in reports), default=0)
    out = []
    for tr in tracks:
        n = len(tr["reports"])
        types = max(set(tr["types"]), key=tr["types"].count)
        out.append({"id": tr["id"], "pos": [round(x, 5) for x in _predict(tr, now)], "last_seen": tr["t"],
                    "speed_kmh": round(km(tr["pos"], (tr["pos"][0] + tr["vel"][0] * 60, tr["pos"][1] + tr["vel"][1] * 60)), 1),
                    "size": [min(tr["sizes"]), max(tr["sizes"])], "type": types, "reports": tr["reports"],
                    "confirmed": n >= 2, "confidence": round(0.5 ** ((now - tr["t"]) / HALF_LIFE_MIN), 2)})
    return out, log


def score(tracks, truth, reports, at_min):
    """Against ground truth: which red units are covered by a confirmed track (within 2 km), and how many tracks are
    false (built only from false reports)."""
    by_id = {r["id"]: r for r in reports}
    conf = [t for t in tracks if t["confirmed"]]
    found = {}
    for rid, u in truth.items():
        if u["side"] != "red":
            continue
        pos = u["track"][min(at_min, len(u["track"]) - 1)][1:]
        best = min(conf, key=lambda t: km(t["pos"], pos), default=None)
        found[rid] = round(km(best["pos"], pos), 2) if best and km(best["pos"], pos) < 2 else None
    false = [t["id"] for t in conf if all(by_id[x]["truth"] is None for x in t["reports"])]
    mixed = [t["id"] for t in conf if len({by_id[x]["truth"] for x in t["reports"]} - {None}) > 1]
    frag = {}
    for t in conf:
        votes = [by_id[x]["truth"] for x in t["reports"] if by_id[x]["truth"]]
        if votes:
            m = max(set(votes), key=votes.count)
            frag[m] = frag.get(m, 0) + 1
    return {"red_found": found, "tracks_per_red_unit": frag, "confirmed_tracks": len(conf), "false_tracks": false, "mixed_tracks": mixed,
            "reports_used": sum(len(t["reports"]) for t in tracks)}
