"""Radio messages from structured spot reports: the messy text a headquarters actually receives, with the right answer
attached. French and English, terse military or casual, typos, missing details. Seeded.

The model's job is only to READ: what it extracts (`gold`) is a location REFERENCE (a grid, or a landmark plus bearing
and distance) and a clock time. Code turns those into a map position and minutes after H-hour (`locate`, `minutes`)."""

import math
import random

import utm

from .sim import scenario

H_HOUR = (5, 0)          # 05:00 local
BEARINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
BEARING_DEG = {b: 45 * i for i, b in enumerate(BEARINGS)}
FR_BEARING = {"N": "nord", "NE": "nord-est", "E": "est", "SE": "sud-est", "S": "sud", "SW": "sud-ouest", "W": "ouest", "NW": "nord-ouest"}
EN_BEARING = {"N": "north", "NE": "northeast", "E": "east", "SE": "southeast", "S": "south", "SW": "southwest", "W": "west", "NW": "northwest"}

# landmark ids -> how people say them
ANCHORS = {
    "vitry": {"en": ["Vitry", "VITRY", "Vitry-le-François"], "fr": ["Vitry", "Vitry-le-François", "VITRY"]},
    "ramerupt": {"en": ["Ramerupt", "RAMERUPT"], "fr": ["Ramerupt", "RAMERUPT"]},
    "brienne": {"en": ["Brienne", "BRIENNE", "Brienne-le-Château"], "fr": ["Brienne", "Brienne-le-Château", "BRIENNE"]},
    "arcis": {"en": ["Arcis", "ARCIS"], "fr": ["Arcis", "Arcis-sur-Aube"]},
    "camp_mailly": {"en": ["Camp de Mailly", "the camp"], "fr": ["Camp de Mailly", "le camp"]},
    "X4": {"en": ["bridge X4", "X4", "the Ramerupt bridge"], "fr": ["le pont X4", "X4", "le pont de Ramerupt"]},
    "X5": {"en": ["bridge X5", "X5", "the Brienne bridge"], "fr": ["le pont X5", "X5", "le pont de Brienne"]},
    "X6": {"en": ["bridge X6", "X6"], "fr": ["le pont X6", "X6"]},
    "X1": {"en": ["bridge X1", "X1"], "fr": ["le pont X1", "X1"]},
}
TYPES = {
    "armour": {"en": ["tanks", "MBTs", "tracked vehicles, prob tanks", "armour"], "fr": ["chars", "chars lourds", "véhicules chenillés, prob. chars", "blindés lourds"]},
    "mech_inf": {"en": ["BMPs", "APCs", "IFVs", "armoured carriers"], "fr": ["BMP", "VTT", "véhicules de transport de troupes", "blindés de transport"]},
    "recon": {"en": ["light vehicles", "recce vehicles", "BRDMs", "scout cars"], "fr": ["véhicules légers", "véhicules de reco", "BRDM", "automitrailleuses"]},
    "unknown": {"en": ["vehicles", "veh", "unidentified vehicles"], "fr": ["véhicules", "véh.", "véhicules non identifiés"]},
}
ACTIVITY = {"moving": {"en": "moving", "fr": "en mouvement"}, "halted": {"en": "halted", "fr": "à l'arrêt"}}


def anchor_pos(s, key):
    return tuple((s["places"].get(key) or s["crossings"][key])["pos"])


def offset(pos, bearing, km):
    a = math.radians(BEARING_DEG[bearing])
    return pos[0] + km * math.cos(a) / 111.32, pos[1] + km * math.sin(a) / (111.32 * math.cos(math.radians(pos[0])))


def bearing_of(frm, to):
    dy = (to[0] - frm[0]) * 111.32
    dx = (to[1] - frm[1]) * 111.32 * math.cos(math.radians(frm[0]))
    return BEARINGS[round((math.degrees(math.atan2(dx, dy)) % 360) / 45) % 8], math.hypot(dx, dy)


def locate(loc):
    """Code, not the model: a location reference -> (lat, lon). None if the reference is unusable."""
    s = scenario()
    try:
        if loc.get("grid"):
            parts = str(loc["grid"]).replace("31U", "").split()
            e, n = float(parts[-2]), float(parts[-1])
            return utm.to_latlon(e, n, 31, "U")
        if loc.get("anchor"):
            p = anchor_pos(s, loc["anchor"])
            if loc.get("bearing") and loc.get("distance_km"):
                return offset(p, loc["bearing"], float(loc["distance_km"]))
            return p
    except Exception:
        return None
    return None


def minutes(hhmm):
    """Code: '0640' -> minutes after H-hour."""
    try:
        h, m = int(str(hhmm)[:2]), int(str(hhmm)[2:4])
        return (h - H_HOUR[0]) * 60 + (m - H_HOUR[1])
    except Exception:
        return None


def _clock(seen_min):
    t = H_HOUR[0] * 60 + H_HOUR[1] + seen_min
    return f"{t // 60:02d}{t % 60:02d}"


def _typo(word, rng):
    if len(word) < 5 or not word.isalpha():
        return word
    i = rng.randrange(1, len(word) - 2)
    return word[:i] + word[i + 1] + word[i] + word[i + 2:]


def message(rep, rng, heading_hint=None):
    """One radio message for one structured report, plus the gold extraction."""
    s = scenario()
    lang = rng.choice(["en", "fr"])
    style = rng.choice(["terse", "terse", "casual"])
    pos = tuple(rep["pos"])
    # location: a grid reference, or the nearest landmark with bearing and distance
    key = min(ANCHORS, key=lambda k: math.dist(anchor_pos(s, k), pos))
    near = bearing_of(anchor_pos(s, key), pos)[1] <= 6        # nobody describes a position from a landmark 14 km away
    if rng.random() < 0.4 or not near:
        e, n, _, _ = utm.from_latlon(*pos)
        grid = f"31U {round(e, -2):.0f} {round(n, -2):.0f}"
        loc = {"grid": grid}
        loc_txt = {"en": f"grid {grid}", "fr": f"carroyage {grid}"}[lang] if style == "terse" else {"en": f"at grid {grid}", "fr": f"au point {grid}"}[lang]
    else:
        b, km = bearing_of(anchor_pos(s, key), pos)
        km = round(km * 2) / 2
        name = rng.choice(ANCHORS[key][lang])
        if km < 0.5:
            loc = {"anchor": key}
            loc_txt = {"en": f"at {name}", "fr": f"à {name}"}[lang]
        else:
            loc = {"anchor": key, "bearing": b, "distance_km": km}
            kmt = f"{km:g}"
            loc_txt = {"en": f"{kmt} km {EN_BEARING[b] if style == 'casual' else b} of {name}",
                       "fr": f"à {kmt.replace('.', ',')} km au {FR_BEARING[b]} de {name}"}[lang]
    hhmm = _clock(rep["seen_min"])
    time_txt = rng.choice([hhmm, f"{hhmm[:2]}:{hhmm[2:]}", f"{hhmm[:2]}h{hhmm[2:]}" if lang == "fr" else f"{hhmm}hrs"])
    has_time = rng.random() > 0.08
    count = rep["size"]
    count_txt = rng.choice([f"{count}x", f"{count}", f"approx {count}" if lang == "en" else f"env. {count}", f"about {count}" if lang == "en" else f"une {count}aine" if count == 10 else f"{count}"])
    typ = rep["type"]
    typ_txt = rng.choice(TYPES[typ][lang])
    # direction of travel from the true track when the column is really moving (ghosts get a random one)
    hd = (heading_hint or {}).get(rep["id"])
    moving = hd is not None if rep["truth"] else rng.random() < 0.75
    act = "moving" if moving else "halted"
    heading = (hd if hd else rng.choice(BEARINGS)) if moving else None
    if style == "terse":
        if lang == "en":
            txt = f"SPOTREP {time_txt if has_time else ''}. {count_txt} {typ_txt} {ACTIVITY[act]['en']}{' ' + heading if heading else ''}, {loc_txt}. Over."
        else:
            txt = f"COMPTE RENDU {time_txt if has_time else ''}. {count_txt} {typ_txt} {ACTIVITY[act]['fr']}{' direction ' + FR_BEARING[heading] if heading else ''}, {loc_txt}. Terminé."
    else:
        if lang == "en":
            txt = (f"{'At ' + time_txt + ', ' if has_time else ''}we can see {count_txt} {typ_txt} {loc_txt}, "
                   f"{'heading ' + EN_BEARING[heading] if heading else 'they look stopped'}. Over.")
        else:
            txt = (f"{'À ' + time_txt + ', ' if has_time else ''}on voit {count_txt} {typ_txt} {loc_txt}, "
                   f"{'qui partent vers le ' + FR_BEARING[heading] if heading else 'ils ont l air arrêtés'}. Terminé.")
    if lang == "fr":
        for a, b in (("de le ", "du "), ("à le ", "au "), ("vers le ouest", "vers l'ouest"), ("vers le est", "vers l'est"), ("de Arcis", "d'Arcis"),
                     ("l air", "l'air")):
            txt = txt.replace(a, b)
    words = txt.split()
    words = [_typo(w, rng) if rng.random() < 0.04 else w for w in words]
    txt = " ".join(words).replace(" .", ".").replace("  ", " ")
    gold = {"time": hhmm if has_time else None, "count": count, "unit_type": typ, "activity": act, "heading": heading, "location": loc}
    return {"id": rep["id"], "lang": lang, "style": style, "text": txt, "gold": gold, "received_min": rep["received_min"],
            "truth": rep["truth"], "true_pos": rep["pos"], "seen_min": rep["seen_min"]}


def headings(reports, truth):
    """True direction of travel at the moment each report was seen (None when the column is stationary)."""
    out = {}
    for r in reports:
        if not r["truth"]:
            continue
        tr = truth[r["truth"]]["track"]
        a, b = tr[min(r["seen_min"], len(tr) - 1)][1:], tr[min(r["seen_min"] + 5, len(tr) - 1)][1:]
        b_, km = bearing_of(a, b)
        out[r["id"]] = b_ if km > 0.2 else None
    return out


def stream(reports, seed=0, truth=None):
    rng = random.Random(seed)
    hints = headings(reports, truth) if truth else None
    return [message(r, rng, hints) for r in reports]
