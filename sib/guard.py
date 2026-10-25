"""The code guard: the model reads, code checks every field against the message text. No model call, no cost.
A time must literally appear in the text (else it was invented); landmark ids are normalised; directions must be valid."""
import re

from .radio import ANCHORS, BEARINGS

TIME = re.compile(r"(?<!\d)([01]\d|2[0-3])[:hH]?([0-5]\d)(?!\d)(?:\s*hrs)?")
GRID = re.compile(r"\d{6}\s+\d{7}")
IDS = {k.lower(): k for k in ANCHORS}


def guard(text, ext):
    if not isinstance(ext, dict):
        return ext
    e = dict(ext)
    times = {"".join(m.groups()) for m in TIME.finditer(GRID.sub(" ", text))}   # grid digits are not times
    if e.get("time") and str(e["time"]).replace(":", "") not in times:
        e["time"] = None                                            # invented: not in the message
    if not e.get("time") and len(times) == 1:
        e["time"] = next(iter(times))                               # missed: exactly one clock time in the text
    if e.get("heading") not in BEARINGS:
        e["heading"] = None
    loc = dict(e.get("location") or {})
    if loc.get("anchor"):
        loc["anchor"] = IDS.get(str(loc["anchor"]).lower(), loc["anchor"])
    if loc.get("bearing") not in BEARINGS:
        loc["bearing"] = None
    e["location"] = loc
    return e
