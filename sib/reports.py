"""Spot reports generated from ground truth: who could see whom, with realistic noise, delay, duplicates,
misidentification and a few false reports. Seeded, so the same seed always gives the same messages."""

import math
import random

from .roads import km
from .sim import scenario


def generate(truth, seed=None):
    s = scenario()
    cfg = s["sensing"]
    rng = random.Random(cfg["seed"] if seed is None else seed)
    blue = {u["id"]: u for u in s["blue"]}
    red = {u["id"]: u for u in s["red"]}
    out = []
    for t in range(0, len(next(iter(truth.values()))["track"])):
        for bid, b in truth.items():
            if b["side"] != "blue":
                continue
            kind = blue[bid]["type"]
            rng_km = cfg["detect_km"].get(kind, cfg["detect_km"]["default"])
            bpos = b["track"][t][1:]
            for rid, r in truth.items():
                if r["side"] != "red":
                    continue
                rpos = r["track"][t][1:]
                if km(bpos, rpos) > rng_km or rng.random() > cfg["report_rate_per_min"]:
                    continue
                noise = cfg["pos_noise_km"].get(kind, cfg["pos_noise_km"]["default"])
                lat = rpos[0] + rng.gauss(0, noise) / 111
                lon = rpos[1] + rng.gauss(0, noise) / (111 * math.cos(math.radians(rpos[0])))
                size = max(1, round(red[rid]["vehicles"] * rng.uniform(0.6, 1.3)))
                typ = red[rid]["type"] if rng.random() > cfg["misidentify"] else rng.choice(["recon", "armour", "mech_inf", "unknown"])
                out.append({"seen_min": t, "received_min": t + rng.randint(*cfg["delay_min"]), "by": bid, "pos": [round(lat, 5), round(lon, 5)],
                            "size": size, "type": typ, "truth": rid})
    for n in range(cfg["false_reports"]):   # civilian traffic reported as enemy, ghost sightings
        t = rng.randint(30, 300)
        out.append({"seen_min": t, "received_min": t + rng.randint(*cfg["delay_min"]), "by": rng.choice(list(blue)),
                    "pos": [round(rng.uniform(48.45, 48.85), 5), round(rng.uniform(4.15, 4.60), 5)], "size": rng.randint(2, 8),
                    "type": "unknown", "truth": None})
    out.sort(key=lambda r: (r["received_min"], r["seen_min"]))
    for n, r in enumerate(out):
        r["id"] = f"SR-{n + 1:03d}"
    return out
