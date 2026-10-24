"""The six lab exercises: content, starter code, tests, hints, reference solutions, knobs and interview questions.

Running this file VERIFIES every exercise against the real lab data (each solution passes its tests, each skeleton
fails them) and then writes lab/exercises.js for the page. The same PRELUDE runs in the browser (Pyodide)."""

import json
import math
import random
import textwrap
import time
from pathlib import Path

HERE = Path(__file__).parent

# ---------------------------------------------------------------------------------------------------------------
# Runs before every exercise, in the browser and here. LAB is the data dict.
PRELUDE = r'''
import heapq, math, random, time
KMH_BY_CLASS = LAB["kmh_by_class"]           # tertiary, secondary, primary, trunk, motorway
NODES = LAB["graph"]["nodes"]                 # [lat, lon] per node index
ADJ = [[] for _ in NODES]                     # ADJ[i] = list of (j, km, road_class, is_bridge)
for i, j, km_, c, b in LAB["graph"]["edges"]:
    ADJ[i].append((j, km_, c, b)); ADJ[j].append((i, km_, c, b))
CUT_X1_X2 = {(a, b) for a, b in LAB["graph"]["cut_x1_x2"]} | {(b, a) for a, b in LAB["graph"]["cut_x1_x2"]}

def edge_minutes(km_, road_class, kmh):
    """Minutes to drive one road segment: the column is capped by the road AND by its own speed."""
    return 60 * km_ / min(KMH_BY_CLASS[road_class], kmh)

def km(a, b):
    """Great-circle distance in km between (lat, lon) points."""
    (lat1, lon1), (lat2, lon2) = a, b
    p = math.pi / 180
    h = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))

class Check:
    def __init__(self): self.results = []
    def __call__(self, name, ok, detail=""):
        self.results.append({"name": name, "ok": bool(ok), "detail": str(detail)})
check = Check()
'''

# ---------------------------------------------------------------------------------------------------------------
EX = []

EX.append({
    "id": "dijkstra", "title": "1. Shortest path: write Dijkstra", "tour_lesson": "dijkstra",
    "recap": "The road network is a graph: 54,077 points, 55,082 segments, each with a travel time. Dijkstra grows a ripple "
             "from the start, always settling the closest unsettled point next. The first time the goal is settled, its time is final.",
    "predict": [
        {"q": "From Camp de Mailly to the south bank at Arcis, a column at 35 km/h needs {normal} minutes. Blow both town bridges at Arcis. How long now?",
         "type": "slider", "min": 40, "max": 120, "step": 1, "unit": "min", "answer_key": "blown", "tolerance": 6,
         "explain": "The ripple has to go round: the nearest open bridge is the D65, 7 km upstream. About 21 extra minutes."},
        {"q": "Before it reaches the goal, roughly how many road points does Dijkstra settle (normal case)?",
         "type": "choice", "options": ["about 500", "about 8,000", "all 54,077"], "answer": 1,
         "explain": "About 8,000: it stops at the goal, but must settle every point that is closer than 43 minutes first, in every direction. "
                    "That is the price of the guarantee (A* would aim the ripple and settle fewer)."},
    ],
    "task": "Write dijkstra(adj, start, goal, kmh, cut). Return (minutes, order, prev): the travel time to goal, the list of nodes in "
            "the order they were settled (start first, goal last), and a dict prev[node] = the node you came from. Skip any edge "
            "(i, j) that is in cut (a blown bridge). Use edge_minutes(km, road_class, kmh) for the cost of an edge.",
    "skeleton": '''def dijkstra(adj, start, goal, kmh, cut=frozenset()):
    dist = {start: 0.0}
    prev = {}
    order = []
    settled = set()
    queue = [(0.0, start)]          # (minutes from start, node); heapq pops the smallest
    while queue:
        d, node = heapq.heappop(queue)
        # TODO 1: if node was already settled, skip it (stale queue entry)
        # TODO 2: settle it: add to settled and to order; stop if it is the goal
        # TODO 3: for each (nxt, km_, road_class, bridge) in adj[node]: skip if (node, nxt) in cut;
        #         new = d + edge_minutes(km_, road_class, kmh); if new beats dist.get(nxt, inf): update dist, prev, push to queue
        pass
    return dist.get(goal), order, prev
''',
    "solution": '''def dijkstra(adj, start, goal, kmh, cut=frozenset()):
    dist = {start: 0.0}
    prev = {}
    order = []
    settled = set()
    queue = [(0.0, start)]
    while queue:
        d, node = heapq.heappop(queue)
        if node in settled:
            continue
        settled.add(node)
        order.append(node)
        if node == goal:
            break
        for nxt, km_, road_class, bridge in adj[node]:
            if (node, nxt) in cut:
                continue
            new = d + edge_minutes(km_, road_class, kmh)
            if new < dist.get(nxt, float("inf")):
                dist[nxt] = new
                prev[nxt] = node
                heapq.heappush(queue, (new, nxt))
    return dist.get(goal), order, prev
''',
    "tests": '''R = LAB["dijkstra_ref"]
m, order, prev = dijkstra(ADJ, R["start"], R["goal"], R["kmh"])
check("normal route time matches the engine", m is not None and abs(m - R["normal_min"]) < 1, f"you: {m and round(m, 1)} min, engine: {R['normal_min']} min")
check("settle order starts at the start and ends at the goal", order[:1] == [R["start"]] and order[-1:] == [R["goal"]], f"{len(order)} nodes settled")
check("you explored a ripple, not the whole map", 3000 < len(order) < 20000, f"{len(order)} settled (engine: about 8,000)")
p, n = [R["goal"]], R["goal"]
while n in prev and len(p) < 100000: n = prev[n]; p.append(n)
check("prev leads from the goal back to the start", p[-1] == R["start"], f"path of {len(p)} nodes")
mb, _, _ = dijkstra(ADJ, R["start"], R["goal"], R["kmh"], CUT_X1_X2)
check("blown bridges: the detour matches the engine", mb is not None and abs(mb - R["blown_min"]) < 1, f"you: {mb and round(mb, 1)} min, engine: {R['blown_min']} min")
for q in R["extra_queries"]:
    mq, _, _ = dijkstra(ADJ, q["start"], q["goal"], R["kmh"])
    check(f"{q['from']} to {q['to']}", mq is not None and abs(mq - q["min"]) < 1, f"you: {mq and round(mq, 1)}, engine: {q['min']}")
''',
    "hints": ["The queue can hold the same node several times with different times. When you pop one that is already settled, it is a stale entry: skip it.",
              "Settling = adding to settled and order. Do it right after the pop, and break the loop when the settled node is the goal.",
              "For each neighbour: if (node, nxt) in cut: continue. Then new = d + edge_minutes(...). Only push when new is smaller than what you knew."],
    "visual": "ripple",
    "knobs": [{"id": "kmh", "label": "Column speed (km/h)", "min": 15, "max": 60, "step": 5, "default": 35},
              {"id": "blow", "label": "Blow the Arcis town bridges", "type": "toggle", "default": False}],
    "knob_code": '''m, order, prev = dijkstra(ADJ, LAB["dijkstra_ref"]["start"], LAB["dijkstra_ref"]["goal"], KNOB["kmh"], CUT_X1_X2 if KNOB["blow"] else frozenset())
RESULT = {"minutes": round(m, 1), "settled": len(order)}
''',
    "watch": "Slower columns: the minutes grow, but on slow speeds every road class is capped the same, so the route can change too. Blowing the bridges roughly doubles the explored area.",
    "interview": {"q": "Why is the first time Dijkstra settles the goal guaranteed to be the fastest route?",
                  "strong": ["Travel times are never negative", "The queue always pops the smallest known time",
                             "Any other route would have to pass through a node that is not settled yet, whose time is already at least as large",
                             "Cost: O((V + E) log V) with a binary heap; negative edges break it (Bellman-Ford handles them)"]},
})

EX.append({
    "id": "position", "title": "2. Simulation: where is the column at minute t?", "tour_lesson": "truth",
    "recap": "Ground truth is every unit's position minute by minute. A route is a list of (lat, lon, minute) points, the minute at "
             "which the column reaches each point. Between two points, it moves in a straight line at constant speed.",
    "predict": [
        {"q": "1st mechanised battalion leaves Camp de Mailly at H+0 and reaches the Brienne bridge (X5) at H+{arrive}. At H+37, half the time, "
              "how far along the 36 km is it?", "type": "choice", "options": ["less than half", "about half", "more than half"], "answer_key": "b1_half",
         "explain": "Not exactly half: it drives faster on main roads and slower on small ones, so distance and time are not proportional."},
    ],
    "task": "Write position(line, t): line is [[lat, lon, minute], ...] with minutes increasing. Before the first point return its "
            "(lat, lon); after the last, the last; in between, interpolate linearly between the two points around t.",
    "skeleton": '''def position(line, t):
    if t <= line[0][2]:
        return line[0][0], line[0][1]
    for (lat1, lon1, t1), (lat2, lon2, t2) in zip(line, line[1:]):
        if t <= t2:
            # TODO: fraction f of the way from t1 to t2 (careful if t2 == t1), then interpolate lat and lon
            pass
    return line[-1][0], line[-1][1]
''',
    "solution": '''def position(line, t):
    if t <= line[0][2]:
        return line[0][0], line[0][1]
    for (lat1, lon1, t1), (lat2, lon2, t2) in zip(line, line[1:]):
        if t <= t2:
            f = 0 if t2 == t1 else (t - t1) / (t2 - t1)
            return lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f
    return line[-1][0], line[-1][1]
''',
    "tests": '''R = LAB["route_b1_x5"]
for p in R["probe"]:
    got = position(R["line"], p["t"])
    ok = got is not None and km(got, p["pos"]) < 0.05
    check(f"position at H+{p['t']}", ok, f"{'off by ' + str(round(km(got, p['pos']), 2)) + ' km' if got else 'returned None'}")
check("before departure: at the start", position(R["line"], -10) == (R["line"][0][0], R["line"][0][1]))
check("long after arrival: at the end", position(R["line"], 999) == (R["line"][-1][0], R["line"][-1][1]))
''',
    "hints": ["f = (t - t1) / (t2 - t1) is 0 at the first point and 1 at the second.",
              "Two consecutive points can share the same minute (very short segments): then f = 0.",
              "return lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f"],
    "visual": "unit",
    "knobs": [{"id": "t", "label": "Minute after H-hour", "min": 0, "max": 100, "step": 1, "default": 37},
              {"id": "delay", "label": "Late start (min)", "min": 0, "max": 60, "step": 5, "default": 0}],
    "knob_code": '''R = LAB["route_b1_x5"]
lat, lon = position(R["line"], KNOB["t"] - KNOB["delay"])
done = sum(km(a[:2], b[:2]) for a, b in zip(R["line"], R["line"][1:]) if b[2] <= KNOB["t"] - KNOB["delay"])
RESULT = {"lat": round(lat, 5), "lon": round(lon, 5), "km_driven": round(done, 1), "arrives": R["arrive"] + KNOB["delay"]}
''',
    "watch": "Drag the minute: the column speeds up on the main road and crawls through villages. A late start shifts everything; the Red battalion does not wait.",
    "interview": {"q": "Your test data is simulated. How do you know it is realistic?",
                  "strong": ["Real road network and real distances (Mailly to Arcis is 17 km on the map and in the model)",
                             "Doctrine planning speeds for columns, stated as assumptions",
                             "Say what is not modelled: traffic, off-road movement, fatigue, breakdowns",
                             "The forward-deployed move: calibrate against the users' own exercise data and ask their officers"]},
})

EX.append({
    "id": "gate", "title": "3. Fusion: the gate", "tour_lesson": "gate",
    "recap": "A track predicts where its column should be. A new report may join it only inside the gate: a circle that grows while "
             "nobody reports (the column could have moved) but is capped, and only if the implied speed is physically possible.",
    "predict": [
        {"q": "A track was last seen 20 minutes ago. The gate is 2.5 km + 1 km per 10 minutes, capped at 5 km. How wide is it now?",
         "type": "slider", "min": 0, "max": 10, "step": 0.5, "unit": "km", "answer": 4.5, "tolerance": 0.25,
         "explain": "2.5 + 1 x (20 / 10) = 4.5 km, under the 5 km cap."},
        {"q": "A report lands 3 km from the prediction, 6 minutes after the last sighting, but 9 km in a straight line from where the column was last seen. Does it join?",
         "type": "choice", "options": ["yes, it is inside the gate", "no, the implied speed is impossible"], "answer": 1,
         "explain": "9 km in 6 minutes is 90 km/h, above the 60 km/h limit for a column. Inside the gate is necessary, not sufficient."},
        {"q": "Remove the 5 km cap. Over 30 report streams, what happens to false tracks?",
         "type": "choice", "options": ["fewer", "about the same", "more"], "answer": 2,
         "explain": "After 100 silent minutes the gate would be 12.5 km wide: two ghost reports can confirm each other. Try it with the knob."},
    ],
    "task": "Write in_gate(pred_km, raw_km, dt_min, gate_km, per10, cap, max_kmh): pred_km is the distance from the report to the "
            "prediction, raw_km the straight-line distance from the last sighting, dt_min the minutes since that sighting. Accept only "
            "if pred_km is within min(gate_km + per10 * dt / 10, cap) AND the implied speed raw_km / (dt / 60) is at most max_kmh (when dt > 0).",
    "skeleton": '''def in_gate(pred_km, raw_km, dt_min, gate_km=2.5, per10=1.0, cap=5.0, max_kmh=60):
    # TODO 1: the gate radius grows with dt_min but never beyond cap
    # TODO 2: reject if pred_km is outside the radius
    # TODO 3: reject if dt_min > 0 and the implied speed is above max_kmh
    return True
''',
    "solution": '''def in_gate(pred_km, raw_km, dt_min, gate_km=2.5, per10=1.0, cap=5.0, max_kmh=60):
    radius = min(gate_km + per10 * dt_min / 10, cap)
    if pred_km > radius:
        return False
    if dt_min > 0 and raw_km / (dt_min / 60) > max_kmh:
        return False
    return True
''',
    "tests": '''cases = [((1.0, 1.0, 0), True, "close and fresh"), ((3.0, 3.0, 0), False, "3 km away, gate is 2.5 km"),
         ((3.0, 3.0, 10), True, "after 10 min the gate is 3.5 km"), ((4.8, 4.8, 60), True, "after 60 min, capped at 5 km"),
         ((5.5, 5.5, 120), False, "beyond the 5 km cap"), ((3.0, 9.0, 6), False, "90 km/h is impossible"),
         ((1.0, 4.0, 6), True, "40 km/h is fine")]
for args, want, label in cases:
    got = in_gate(*args)
    check(label, got == want, f"in_gate{args} = {got}, expected {want}")
''',
    "hints": ["radius = min(gate_km + per10 * dt_min / 10, cap)",
              "if pred_km > radius: return False",
              "speed = raw_km / (dt_min / 60); only compute it when dt_min > 0"],
    "visual": "fusion",
    "knobs": [{"id": "gate_km", "label": "Base gate (km)", "min": 0.5, "max": 6, "step": 0.5, "default": 2.5},
              {"id": "per10", "label": "Growth per 10 min (km)", "min": 0, "max": 3, "step": 0.25, "default": 1.0},
              {"id": "cap", "label": "Cap (km)", "min": 2, "max": 20, "step": 1, "default": 5},
              {"id": "max_kmh", "label": "Max column speed (km/h)", "min": 20, "max": 150, "step": 10, "default": 60}],
    "knob_code": '''FUSION.GATE_KM, FUSION.GATE_KM_PER_10MIN, FUSION.GATE_MAX_KM, FUSION.MAX_KMH = KNOB["gate_km"], KNOB["per10"], KNOB["cap"], KNOB["max_kmh"]
RESULT = fusion_scoreboard()
''',
    "watch": "Too small and every report starts its own track (fragments). Too large or uncapped and ghosts confirm each other (false tracks). The default sits where both are low.",
    "interview": {"q": "Why does the gate grow over time, and why does it need a cap?",
                  "strong": ["It grows because uncertainty grows: a column unseen for 30 minutes could be anywhere within its driving range",
                             "The cap exists because a huge gate lets unrelated reports, including ghosts, join or confirm each other",
                             "Inside the gate is not enough: the implied speed must be physically possible",
                             "I found the missing cap by measurement: false tracks jumped at H+300 (0.4 per run) and dropped to 0.07 with the cap"]},
})

EX.append({
    "id": "filter", "title": "4. Fusion: blend, then coast", "tour_lesson": "update",
    "recap": "A report joining a track nudges it: position = prediction + alpha x (report - prediction). Velocity is nudged too. "
             "Between reports the track coasts: it trusts its speed for a limited time, then holds, because columns stop.",
    "predict": [
        {"q": "The prediction says longitude 4.20, the report says 4.24, alpha = 0.5. Where does the track go?",
         "type": "choice", "options": ["4.20", "4.22", "4.24"], "answer": 1,
         "explain": "Halfway: 4.20 + 0.5 x 0.04 = 4.22. The report is noisy and the prediction is stale; blending beats either alone."},
        {"q": "A column moving at 30 km/h stops at a bridge and nobody reports for 60 minutes. Without coasting, how far off is the prediction?",
         "type": "slider", "min": 0, "max": 60, "step": 5, "unit": "km", "answer": 30, "tolerance": 5,
         "explain": "30 km/h x 1 h = 30 km of phantom driving. With a 15-minute coast it stops after 7.5 km."},
    ],
    "task": "Write blend(pred, report, alpha) for one coordinate, and predict(pos, vel, dt, coast): pos and vel are (lat, lon) and "
            "(lat per min, lon per min); move along vel for at most coast minutes (also at most coast minutes backwards when dt is negative).",
    "skeleton": '''def blend(pred, report, alpha):
    # TODO: move from the prediction towards the report by a fraction alpha
    return pred

def predict(pos, vel, dt, coast=15):
    # TODO: clamp dt to [-coast, coast], then pos + vel * dt for both coordinates
    return pos
''',
    "solution": '''def blend(pred, report, alpha):
    return pred + alpha * (report - pred)

def predict(pos, vel, dt, coast=15):
    dt = max(-coast, min(dt, coast))
    return pos[0] + vel[0] * dt, pos[1] + vel[1] * dt
''',
    "tests": '''check("alpha 0.5 lands halfway", abs(blend(4.20, 4.24, 0.5) - 4.22) < 1e-9, blend(4.20, 4.24, 0.5))
check("alpha 0 ignores the report", blend(4.20, 4.24, 0.0) == 4.20)
check("alpha 1 trusts the report", abs(blend(4.20, 4.24, 1.0) - 4.24) < 1e-9)
v = (0.001, 0.002)
check("moves along the velocity", predict((48.5, 4.2), v, 10) == (48.5 + 0.01, 4.2 + 0.02), predict((48.5, 4.2), v, 10))
check("coasting stops after 15 minutes", predict((48.5, 4.2), v, 60) == predict((48.5, 4.2), v, 15))
check("coasting works backwards too", predict((48.5, 4.2), v, -60) == predict((48.5, 4.2), v, -15))
''',
    "hints": ["blend: pred + alpha * (report - pred)", "dt = max(-coast, min(dt, coast))", "return pos[0] + vel[0] * dt, pos[1] + vel[1] * dt"],
    "visual": "fusion",
    "knobs": [{"id": "alpha", "label": "Alpha (trust in the report)", "min": 0.05, "max": 1, "step": 0.05, "default": 0.5},
              {"id": "beta", "label": "Beta (speed correction)", "min": 0, "max": 0.8, "step": 0.05, "default": 0.2},
              {"id": "coast", "label": "Coast (min)", "min": 0, "max": 120, "step": 5, "default": 15}],
    "knob_code": '''FUSION.ALPHA, FUSION.BETA, FUSION.COAST_MIN = KNOB["alpha"], KNOB["beta"], KNOB["coast"]
RESULT = fusion_scoreboard()
''',
    "watch": "Coast 120: the Red battalion drives on past the bridge in our picture and gets lost. Alpha near 1: tracks jump with every noisy report. Alpha near 0: they lag behind the column.",
    "interview": {"q": "Why blend the prediction with the report instead of trusting the latest report?",
                  "strong": ["Both are wrong in different ways: the report has noise (hundreds of metres), the prediction is stale",
                             "A weighted blend has lower error than either; a Kalman filter computes the best weight from the two uncertainties",
                             "Alpha-beta is a fixed-weight Kalman: simple, predictable, easy to explain to an operator",
                             "Coasting: trust speed only for a while, because real columns stop at objectives"]},
})

EX.append({
    "id": "assign", "title": "5. Optimisation: who does what", "tour_lesson": "assign",
    "recap": "Each unit gets at most one task, each task exactly one unit, some pairs are forbidden. Goal: the last unit to be ready "
             "is ready as early as possible, then the least total time. A solver searches this cleverly; brute force tries every option.",
    "predict": [
        {"q": "In how many ways can 4 units take 4 tasks, one each?", "type": "slider", "min": 4, "max": 64, "step": 1, "unit": "ways", "answer": 24, "tolerance": 0,
         "explain": "4 x 3 x 2 x 1 = 24 (4 factorial)."},
        {"q": "And 12 units on 12 tasks?", "type": "choice", "options": ["about 1,700", "about 480 thousand", "about 480 million"], "answer": 2,
         "explain": "12! = 479,001,600. Brute force dies here; CP-SAT prunes whole branches with the constraints and proves the optimum in milliseconds."},
    ],
    "task": "Write best_assignment(units, tasks, cells): cells['B-1|seize X1'] = {'min': ready minute, 'eligible': bool}. Try every "
            "permutation (itertools.permutations), skip any with an ineligible pair, score = (latest ready over tasks other than "
            "'screen east', total ready of all), keep the smallest score. Return (score, {unit: task}).",
    "skeleton": '''from itertools import permutations

def best_assignment(units, tasks, cells):
    best = None
    for perm in permutations(units, len(tasks)):      # perm[k] is the unit for tasks[k]
        # TODO 1: skip if any (unit, task) pair is not eligible
        # TODO 2: score = (max ready over tasks except "screen east", sum of all ready)
        # TODO 3: keep the best (smallest) score and its assignment {unit: task}
        pass
    return best
''',
    "solution": '''from itertools import permutations

def best_assignment(units, tasks, cells):
    best = None
    for perm in permutations(units, len(tasks)):
        pairs = list(zip(perm, tasks))
        if not all(cells[f"{u}|{t}"]["eligible"] for u, t in pairs):
            continue
        ready = [cells[f"{u}|{t}"]["min"] for u, t in pairs]
        last = max(r for (u, t), r in zip(pairs, ready) if t != "screen east")
        score = (last, sum(ready))
        if best is None or score < best[0]:
            best = (score, {u: t for u, t in pairs})
    return best
''',
    "tests": '''S = LAB["solver_first"]
res = best_assignment(S["units"], S["tasks"], S["cells"])
check("found a plan", res is not None)
if res:
    (last, total), plan = res
    check("same latest arrival as CP-SAT", last == S["answer"]["last"], f"you: H+{last}, solver: H+{S['answer']['last']}")
    check("same total as CP-SAT", total == S["answer"]["total"], f"you: {total}, solver: {S['answer']['total']}")
    check("the armour takes the nearest bridge", plan.get("B-3") == "seize X1", plan)
F = LAB["solver_full"]
res = best_assignment(F["units"], F["tasks"], F["cells"])
check("full mission (5 tasks, with X6) is feasible too", res is not None and res[0][0] == F["answer"]["last"], res and f"you: H+{res[0][0]}, solver: H+{F['answer']['last']}")
''',
    "hints": ["pairs = list(zip(perm, tasks)); check every cells[f'{u}|{t}']['eligible']",
              "Python compares tuples left to right, so (last, total) < (last2, total2) does the tie-break for you",
              "Keep best = (score, {unit: task}) and replace it when score is smaller"],
    "visual": "assign",
    "knobs": [{"id": "n", "label": "Units and tasks (random problem)", "min": 4, "max": 9, "step": 1, "default": 6}],
    "knob_code": '''rng = random.Random(KNOB["n"])
U = [f"U{i}" for i in range(KNOB["n"])]; T = [f"T{i}" for i in range(KNOB["n"])]
C = {f"{u}|{t}": {"min": rng.randint(10, 120), "eligible": rng.random() > 0.15} for u in U for t in T}
t0 = time.time(); res = best_assignment(U, T, C); ms = round(1000 * (time.time() - t0))
RESULT = {"permutations": math.factorial(KNOB["n"]), "brute_force_ms": ms, "found": res is not None}
''',
    "watch": "Each extra unit multiplies the work: 8 units is 40,320 plans, 9 is 362,880. The real solver handles this scenario in about 20 ms and would handle hundreds of units, because it never enumerates.",
    "interview": {"q": "What does OPTIMAL from the solver actually prove, and why not just brute force?",
                  "strong": ["OPTIMAL means the solver proved no assignment satisfying the constraints has a better objective, not just that it found a good one",
                             "Brute force is n factorial: 12 units is 480 million plans",
                             "CP-SAT propagates constraints and bounds to prune whole branches, and gives a proof",
                             "The objective is explicit and arguable: latest ready first, then total time; change it and the plan changes for a stated reason"]},
})

EX.append({
    "id": "montecarlo", "title": "6. Monte Carlo: does the plan survive bad luck?", "tour_lesson": "montecarlo",
    "recap": "Run the plan many times with random late starts and speeds, with a fixed seed so it is reproducible. Count how often "
             "the race to the Brienne bridge (X5) is won, and why it is lost.",
    "predict": [
        {"q": "Plan 1 blocks X5 with a mechanised battalion ({b1} min drive). Red's main body leaves at H+{r1d} and drives {r1} min. With random delays, in what share of runs does Blue hold the bridge?",
         "type": "slider", "min": 0, "max": 100, "step": 1, "unit": "%", "answer_key": "mc_solver", "tolerance": 8,
         "explain": "About 9 runs in 10. Blue usually arrives with half an hour to spare; it loses only when its start is badly delayed AND Red is early and fast."},
        {"q": "The intuitive plan sends the armour instead ({b3} min drive). Same bad luck. Share of runs held?",
         "type": "slider", "min": 0, "max": 100, "step": 1, "unit": "%", "answer_key": "mc_intuitive", "tolerance": 8,
         "explain": "About half: the armour's margin is only 14 minutes, so ordinary delays erase it."},
        {"q": "The battalion normally drives to X5 in {b1} minutes at 35 km/h. Slow it to 75 % speed (26 km/h). How long now?",
         "type": "slider", "min": 60, "max": 110, "step": 1, "unit": "min", "answer_key": "b1_slow", "tolerance": 3,
         "explain": "Only {b1_slow}, not {b1_naive}: on lanes the ROAD is already the limit (25 km/h), so slowing the column changes nothing there. "
                    "My first version of this exercise divided by the factor and overstated bad luck by 8 points; the self-check caught it."},
    ],
    "task": "Write holds(blue_min, red_min, blue_veh, red_veh, rules) using the race rule, then run_many(n, seed, blue_drive, red_drive, "
            "blue_veh, red_veh, rules) which draws, per run: Blue delay = min(60, round(rng.expovariate(1/10))), Blue speed factor = "
            "rng.uniform(0.75, 1.0), Red departure = max(0, 40 + rng.randint(-25, 25)), Red speed factor = rng.uniform(0.8, 1.15); "
            "round each factor to the nearest 0.05 and look the drive time up as drive['0.85'] (the engine's real minutes: "
            "slowing a column does not slow it where the road is already the limit). arrival = departure + drive time. Return the percentage of runs that hold.",
    "skeleton": '''def holds(blue_min, red_min, blue_veh, red_veh, rules):
    # TODO: if Blue is there first, it holds while red_veh / blue_veh < rules["defence_holds_at_ratio_below"]
    #       if Red is first, Blue must attack: blue_veh / red_veh >= rules["attack_ratio_vs_hasty_defence"]
    return True

def q05(x):
    return round(round(x / 0.05) * 0.05, 2)          # 0.83 -> 0.85

def run_many(n, seed, blue_drive, red_drive, blue_veh, red_veh, rules):
    """blue_drive / red_drive: {"0.75": minutes, ...} from LAB["mc"]["drive_min_by_factor"]."""
    rng = random.Random(seed)
    won = 0
    for _ in range(n):
        # TODO: draw delay, Blue factor, Red departure, Red factor (in that order), look up both drives, count holds
        pass
    return 100 * won / n
''',
    "solution": '''def holds(blue_min, red_min, blue_veh, red_veh, rules):
    if blue_min <= red_min:
        return red_veh / blue_veh < rules["defence_holds_at_ratio_below"]
    return blue_veh / red_veh >= rules["attack_ratio_vs_hasty_defence"]

def q05(x):
    return round(round(x / 0.05) * 0.05, 2)

def run_many(n, seed, blue_drive, red_drive, blue_veh, red_veh, rules):
    rng = random.Random(seed)
    won = 0
    for _ in range(n):
        delay = min(60, round(rng.expovariate(1 / 10)))
        fb = q05(rng.uniform(0.75, 1.0))
        red_dep = max(0, 40 + rng.randint(-25, 25))
        fr = q05(rng.uniform(0.8, 1.15))
        blue = delay + blue_drive[f"{fb:.2f}"]
        red = red_dep + red_drive[f"{fr:.2f}"]
        won += holds(blue, red, blue_veh, red_veh, rules)
    return 100 * won / n
''',
    "tests": '''M = LAB["mc"]; V = M["vehicles"]; RU = M["rules"]
check("Blue first, defends", holds(70, 110, 40, 30, RU) is True)
check("Red first, Blue too weak to attack", holds(115, 110, 40, 30, RU) is False, "40 vs 30 is 1.3:1, needs 2:1")
check("Red first, Blue strong enough", holds(95, 78, 40, 6, RU) is True, "40 vs 6 is 6.7:1")
D = M["drive_min_by_factor"]
a = run_many(4000, 7, D["B-1"], D["R-1"], V["B-1"], V["R-1"], RU)
b = run_many(4000, 7, D["B-3"], D["R-1"], V["B-3"], V["R-1"], RU)
check("solver plan holds about as often as the engine says", abs(a - M["engine_pct"]["solver"]) < 6, f"you: {a:.1f} %, engine: {M['engine_pct']['solver']} %")
check("intuitive plan holds about as often as the engine says", abs(b - M["engine_pct"]["intuitive"]) < 8, f"you: {b:.1f} %, engine: {M['engine_pct']['intuitive']} %")
check("same seed, same answer", run_many(500, 3, D["B-1"], D["R-1"], 40, 30, RU) == run_many(500, 3, D["B-1"], D["R-1"], 40, 30, RU))
''',
    "hints": ["holds: compare arrivals first, then the right ratio for who is defending",
              "Draw in this order every run: expovariate, uniform, randint, uniform. The order matters for reproducibility. Then q05() each factor and look it up: blue_drive[f\"{fb:.2f}\"]",
              "won += holds(...) works because True counts as 1"],
    "visual": "race",
    "knobs": [{"id": "head", "label": "Blue head start (min)", "min": 0, "max": 40, "step": 5, "default": 0},
              {"id": "mean_delay", "label": "Average Blue late start (min)", "min": 0, "max": 30, "step": 2, "default": 10},
              {"id": "unit", "label": "Unit blocking X5", "type": "choice", "options": ["B-1", "B-3"], "default": "B-1"}],
    "knob_code": '''M = LAB["mc"]; V = M["vehicles"]; RU = M["rules"]
rng = random.Random(7); pts = []; won = 0
for _ in range(1000):
    delay = min(60, round(rng.expovariate(1 / max(KNOB["mean_delay"], 0.1)))) - KNOB["head"]
    fb = q05(rng.uniform(0.75, 1.0)); red_dep = max(0, 40 + rng.randint(-25, 25)); fr = q05(rng.uniform(0.8, 1.15))
    blue = delay + M["drive_min_by_factor"][KNOB["unit"]][f"{fb:.2f}"]; red = red_dep + M["drive_min_by_factor"]["R-1"][f"{fr:.2f}"]
    ok = holds(blue, red, V[KNOB["unit"]], V["R-1"], RU); won += ok
    if len(pts) < 300: pts.append([blue, red, bool(ok)])
RESULT = {"holds_pct": round(won / 10, 1), "points": pts}
''',
    "watch": "A 15-minute head start for the armour turns a coin flip into a safe bet. Lower the average delay and both plans improve, but the gap remains: margin is what buys robustness.",
    "interview": {"q": "Why is the solver's plan more robust than the intuitive one?",
                  "strong": ["Robustness comes from margin: the battalion reaches the bridge about 37 minutes before Red, the armour only 14",
                             "Monte Carlo turns 'should be fine' into a number: 89 % vs 48 % over 1,000 seeded runs",
                             "Failures name their cause (Red first by N minutes, ratio too low), so you know what to change",
                             "Fixed seeds make it reproducible: the same plan always gives the same percentage"]},
})

# Lab helper for the fusion knobs: runs the engine's fusion (loaded as FUSION) and scores it against Red truth.
FUSION_HELPER = r'''
def fusion_scoreboard(until=300):
    tracks, log = FUSION.fuse(LAB["reports"], until=until)
    conf = [t for t in tracks if t["confirmed"]]
    by_id = {r["id"]: r for r in LAB["reports"]}
    found, per_unit = {}, {}
    for rid, tr in LAB["red_truth"].items():
        pos = min(tr, key=lambda p: abs(p[0] - until))[1:]
        best = min(conf, key=lambda t: km(t["pos"], pos), default=None)
        found[rid] = best is not None and km(best["pos"], pos) < 2
    for t in conf:
        votes = [by_id[x]["truth"] for x in t["reports"] if by_id[x]["truth"]]
        if votes:
            m = max(set(votes), key=votes.count); per_unit[m] = per_unit.get(m, 0) + 1
    false = sum(1 for t in conf if all(by_id[x]["truth"] is None for x in t["reports"]))
    return {"confirmed": len(conf), "tentative": len(tracks) - len(conf), "false_tracks": false,
            "tracks_per_red_unit": per_unit, "red_found": found,
            "tracks": [{"id": t["id"], "pos": t["pos"], "confirmed": t["confirmed"], "n": len(t["reports"])} for t in tracks]}
'''


def fill(ex, lab):
    """Put the real numbers into the questions."""
    ref = lab["dijkstra_ref"]
    line = lab["route_b1_x5"]["line"]
    total = sum(math.dist(a[:2], b[:2]) for a, b in zip(line, line[1:]))
    half = sum(math.dist(a[:2], b[:2]) for a, b in zip(line, line[1:]) if b[2] <= 37) / total
    keys = {"normal": ref["normal_min"], "blown": ref["blown_min"], "arrive": lab["route_b1_x5"]["arrive"],
            "b1": lab["mc"]["blocker_x5_min"]["B-1"], "b3": lab["mc"]["blocker_x5_min"]["B-3"], "r1": lab["mc"]["r1_x5_min"],
            "r1d": lab["mc"]["r1_depart"], "mc_solver": lab["mc"]["engine_pct"]["solver"], "mc_intuitive": lab["mc"]["engine_pct"]["intuitive"],
            "b1_half": 0 if half < 0.45 else (1 if half <= 0.55 else 2),
            "b1_slow": lab["mc"]["drive_min_by_factor"]["B-1"]["0.75"], "b1_naive": round(lab["mc"]["blocker_x5_min"]["B-1"] / 0.75)}
    for p in ex["predict"]:
        p["q"] = p["q"].format(**keys)
        p["explain"] = p["explain"].format(**keys)
        if "answer_key" in p:
            p["answer"] = keys[p.pop("answer_key")]
    return ex


def run(lab, code, tests, extra=""):
    ns = {"LAB": lab}
    exec(PRELUDE, ns)
    if extra:
        exec(extra, ns)
    exec(code, ns)
    exec(tests, ns)
    return ns["check"].results


def main():
    src = (HERE / "labdata.js").read_text()
    lab = json.loads(src[len("window.LAB = "):-2])
    fus = json.loads((HERE / "fusion_py.js").read_text()[len("window.FUSION_PY = "):-2])
    import types
    mod = types.ModuleType("FUSION"); exec(fus, mod.__dict__)
    extra = "FUSION = __fusion__\n" + FUSION_HELPER
    out = []
    for ex in EX:
        ex = fill(dict(ex), lab)
        t0 = time.time()
        good = run(lab | {}, ex["solution"], ex["tests"])
        bad = run(lab | {}, ex["skeleton"], ex["tests"]) if True else []
        ok_good, ok_bad = all(r["ok"] for r in good), not all(r["ok"] for r in bad)
        print(f"{ex['id']:11} solution {'PASS' if ok_good else 'FAIL'} ({sum(r['ok'] for r in good)}/{len(good)}), "
              f"skeleton {'fails as it should' if ok_bad else 'PASSES (bad)'} ({sum(r['ok'] for r in bad)}/{len(bad)}), {time.time() - t0:.1f}s")
        if not ok_good:
            for r in good:
                if not r["ok"]:
                    print("    ", r)
        # knob code must run on the solution
        ns = {"LAB": lab, "__fusion__": mod}
        exec(PRELUDE, ns); exec(extra, ns); exec(ex["solution"], ns)
        ns["KNOB"] = {k["id"]: k["default"] for k in ex["knobs"]}
        exec(ex["knob_code"], ns)
        res = ns["RESULT"]
        print("     knob defaults ->", {k: v for k, v in res.items() if k not in ("tracks", "points")})
        assert ok_good and ok_bad
        out.append(ex)
    payload = {"prelude": PRELUDE, "fusion_helper": FUSION_HELPER, "exercises": out}
    (HERE / "exercises.js").write_text("window.EXERCISES = " + json.dumps(payload, ensure_ascii=False) + ";\n")
    print("wrote exercises.js")


if __name__ == "__main__":
    main()
