/* Staff in a box: the lab.
   Predict, build (Python in the browser via Pyodide in a Web Worker), watch your own code drive the map, explain it back. */
(() => {
'use strict';

const EXD = window.EXERCISES;
const EXS = EXD.exercises;
const LAB = window.LAB;
const SIB = window.SIB || null;
const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const PFX = 'sib-lab:v1:';
const KX = Math.cos(48.675 * Math.PI / 180);
const BBOX = { s: 48.35, w: 3.90, n: 49.00, e: 4.70 };

/* ------------------------------------------------------------------ utils */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtInt = (n) => Number(n).toLocaleString('en-US');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const store = {
  get(k, d) { try { const v = localStorage.getItem(PFX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) { /* storage unavailable: keep going */ } },
};
function debounce(fn, ms) { let t = null; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.cancel = () => clearTimeout(t); return f; }
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600);
}
/* Inline code formatting for task / hint text: function calls and snake_case names. */
function richText(s) {
  let h = esc(s);
  h = h.replace(/\b([A-Za-z_][A-Za-z0-9_.]*\([^()]{0,80}\))/g, '<code>$1</code>');
  h = h.replace(/(^|[\s(,])([a-z]+_[a-z0-9_]+)(?![^<]*<\/code>)/g, '$1<code>$2</code>');
  return h;
}
const ICON = {
  check: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bigcheck: '<svg viewBox="0 0 16 16" width="22" height="22"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 16 16" width="10" height="10"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="7" width="10" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  unlock: '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="7" width="10" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 7V5a2.5 2.5 0 014.8-1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  play: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M5 3.5v9l7.5-4.5z" fill="#2a1a03"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="4" y="3.5" width="2.8" height="9" rx=".8" fill="#2a1a03"/><rect x="9.2" y="3.5" width="2.8" height="9" rx=".8" fill="#2a1a03"/></svg>',
  run: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M4.5 3v10l8-5z" fill="currentColor"/></svg>',
  bulb: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1.8a4.4 4.4 0 00-2.6 8c.5.4.8.9.8 1.5v.5h3.6v-.5c0-.6.3-1.1.8-1.5A4.4 4.4 0 008 1.8zM6.3 13.4h3.4M6.8 15h2.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  reset: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M3 8a5 5 0 109-3M12 1.8V5H8.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cube: '<svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 2l7 4v8l-7 4-7-4V6z M3 6l7 4 7-4 M10 10v8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2V11.2M8 4.8v.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="5" y="5" width="8.5" height="8.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 10.5V3.6C3 3 3.5 2.5 4.1 2.5H10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
};

/* ------------------------------------------------------------------ domain names */
const PLACE_NAMES = {
  camp_mailly: 'Camp de Mailly', arcis: 'Arcis-sur-Aube', ramerupt: 'Ramerupt', brienne: 'Brienne-le-Château', vitry: 'Vitry-le-François',
  sommesous: 'Sommesous', chalons: 'Châlons-en-Champagne', vitry_west: 'Observation post (west of Vitry)',
};
const UNIT_NAMES = { 'B-REC': 'Recce squadron', 'B-1': '1st mechanised bn', 'B-2': '2nd mechanised bn', 'B-3': 'Armoured battalion', 'B-ENG': 'Engineer company' };
const UNIT_START = { 'B-REC': 'camp_mailly', 'B-1': 'camp_mailly', 'B-2': 'camp_mailly', 'B-ENG': 'camp_mailly', 'B-3': 'sommesous' };
const TOUR = { dijkstra: 'Lesson 4, the ripple', truth: 'Lesson 6, ground truth', gate: 'Lesson 8, predict then gate', update: 'Lesson 9, join, nudge, confirm',
  assign: 'Lesson 11, who does what', montecarlo: 'Lesson 14, Monte Carlo' };
const HEADLINE = { dijkstra: 'minutes', position: 'km_driven', gate: 'false_tracks', filter: 'confirmed', assign: 'brute_force_ms', montecarlo: 'holds_pct' };
const KEY_LABEL = {
  minutes: 'Minutes to goal', settled: 'Points settled', lat: 'Latitude', lon: 'Longitude', km_driven: 'Km driven', arrives: 'Arrives at X5 (minute)',
  confirmed: 'Confirmed tracks', tentative: 'Tentative tracks', false_tracks: 'False tracks', tracks_per_red_unit: 'Tracks per Red unit',
  red_found: 'Red units found', permutations: 'Plans brute force tries', brute_force_ms: 'Brute force time (ms)', found: 'Found a plan', holds_pct: 'Holds the bridge (%)',
};
const HIDE_KEYS = new Set(['tracks', 'points']);
function taskTarget(task) {
  const m = /X\d/.exec(task);
  if (m) return LAB.crossings[m[0]];
  if (/screen/.test(task)) return LAB.places.vitry_west;
  return null;
}

/* ------------------------------------------------------------------ Python glue code */
/* Hooks let the engine's fusion run on the learner's own functions (same maths as the engine; checked equal on the reference). */
const BLEND_OLD = 'tr["pos"] = [pred[0] + ALPHA * res[0], pred[1] + ALPHA * res[1]]';
const BLEND_NEW = 'tr["pos"] = [_blend(pred[0], r["pos"][0], ALPHA), _blend(pred[1], r["pos"][1], ALPHA)]';
const FUSION_SRC = window.FUSION_PY.includes(BLEND_OLD)
  ? window.FUSION_PY.replace(BLEND_OLD, BLEND_NEW) + '\n\ndef _blend(p, x, a):\n    return p + a * (x - p)\n'
  : window.FUSION_PY;
const HOOKS = {
  gate: `
if callable(globals().get("in_gate")):
    def _lab_cost(tr, r):
        dt = max(0, r["seen_min"] - tr["t"])
        d = km(FUSION._predict(tr, r["seen_min"]), r["pos"])
        raw = km(tr["pos"], r["pos"])
        return d if in_gate(d, raw, dt, FUSION.GATE_KM, FUSION.GATE_KM_PER_10MIN, FUSION.GATE_MAX_KM, FUSION.MAX_KMH) else None
    FUSION._cost = _lab_cost
`,
  filter: `
if callable(globals().get("predict")):
    FUSION._predict = lambda tr, t: tuple(predict(tr["pos"], tr["vel"], t - tr["t"], FUSION.COAST_MIN))
if callable(globals().get("blend")) and hasattr(FUSION, "_blend"):
    FUSION._blend = blend
`,
};
const VIS_CODE = {
  ripple: `
_g = LAB["dijkstra_ref"]["goal"]
_path = []
try:
    _n, _seen = _g, set()
    while _n is not None and _n not in _seen and len(_path) < 100000:
        _path.append(int(_n)); _seen.add(_n)
        _n = prev.get(_n) if hasattr(prev, "get") else None
except Exception:
    _path = []
VIS = {"order": [int(x) for x in list(order)[:90000]], "path": _path}
`,
  unit: `
_R = LAB["route_b1_x5"]
_cr = []
for _t in range(0, int(KNOB["t"]) + 1, 5):
    _p = position(_R["line"], _t - KNOB["delay"])
    if _p is not None:
        _cr.append([float(_p[0]), float(_p[1]), _t])
VIS = {"crumbs": _cr}
`,
  assign: `
_S, _F = LAB["solver_first"], LAB["solver_full"]
VIS = {"first": best_assignment(_S["units"], _S["tasks"], _S["cells"]), "full": best_assignment(_F["units"], _F["tasks"], _F["cells"])}
`,
};
const HARNESS = String.raw`
import json, sys, io, types, traceback, math, time
LAB = json.loads(LAB_JSON)
del LAB_JSON
BASE = {"LAB": LAB, "__name__": "__lab__"}
exec(compile(PRELUDE_SRC, "<prelude>", "exec"), BASE)
FUSION = types.ModuleType("FUSION")
exec(compile(FUSION_SRC, "<fusion>", "exec"), FUSION.__dict__)
_FUSION_SNAPSHOT = dict(FUSION.__dict__)
_WHERE = {"<your code>": "your code", "<tests>": "the tests", "<knob code>": "the knob code", "<lab visual>": "the drawing code",
          "<lab hook>": "the lab hook", "<prelude>": "the prelude", "<fusion>": "the engine's fusion module", "<lab helper>": "the lab helper"}

def _clean(o, d=0):
    if o is None or isinstance(o, (bool, int, str)):
        return o
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if d > 30:
        return repr(o)[:200]
    if isinstance(o, dict):
        return {str(k): _clean(v, d + 1) for k, v in o.items()}
    if isinstance(o, (list, tuple, set, frozenset, range)):
        return [_clean(v, d + 1) for v in o]
    return repr(o)[:200]

def _fmt_exc(e, sources):
    frames = []
    for fr in traceback.extract_tb(e.__traceback__):
        if fr.filename in sources:
            lines = sources[fr.filename].splitlines()
            txt = lines[fr.lineno - 1].strip() if fr.lineno and 0 < fr.lineno <= len(lines) else ""
            frames.append({"file": fr.filename, "where": _WHERE.get(fr.filename, fr.filename), "line": fr.lineno, "func": fr.name, "text": txt})
    user_line = None
    msg = str(e)
    if isinstance(e, SyntaxError):
        msg = e.msg
        if e.filename == "<your code>":
            user_line = e.lineno
            frames.append({"file": "<your code>", "where": "your code", "line": e.lineno, "func": "", "text": (e.text or "").strip()})
    else:
        for f in reversed(frames):
            if f["file"] == "<your code>":
                user_line = f["line"]
                break
    return {"type": type(e).__name__, "msg": msg, "frames": frames, "user_line": user_line}

def lab_run(job_json):
    job = json.loads(job_json)
    buf = io.StringIO()
    old = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = buf
    res = {"ok": True}
    sources = {"<your code>": job["code"], "<prelude>": PRELUDE_SRC, "<fusion>": FUSION_SRC}
    stage = "code"
    t0 = time.time()
    try:
        ns = dict(BASE)
        ns["check"] = BASE["Check"]()
        if job["kind"] == "tests":
            exec(compile(job["code"], "<your code>", "exec"), ns)
            stage = "tests"
            sources["<tests>"] = job["tests"]
            try:
                exec(compile(job["tests"], "<tests>", "exec"), ns)
            finally:
                res["checks"] = _clean(ns["check"].results)
        else:
            FUSION.__dict__.update(_FUSION_SNAPSHOT)
            ns["FUSION"] = FUSION
            sources["<lab helper>"] = FUSION_HELPER_SRC
            exec(compile(FUSION_HELPER_SRC, "<lab helper>", "exec"), ns)
            exec(compile(job["code"], "<your code>", "exec"), ns)
            if job.get("hook"):
                stage = "hook"
                sources["<lab hook>"] = job["hook"]
                exec(compile(job["hook"], "<lab hook>", "exec"), ns)
            ns["KNOB"] = job["knob"]
            stage = "knob"
            sources["<knob code>"] = job["knob_code"]
            exec(compile(job["knob_code"], "<knob code>", "exec"), ns)
            res["result"] = _clean(ns.get("RESULT"))
            if job.get("vis"):
                stage = "vis"
                sources["<lab visual>"] = job["vis"]
                exec(compile(job["vis"], "<lab visual>", "exec"), ns)
                res["vis"] = _clean(ns.get("VIS"))
    except BaseException as e:
        res["ok"] = False
        res["stage"] = stage
        res["error"] = _fmt_exc(e, sources)
    finally:
        sys.stdout, sys.stderr = old
    res["py_ms"] = round(1000 * (time.time() - t0))
    out = buf.getvalue()
    res["stdout"] = out if len(out) < 20000 else out[:20000] + "\n... (output cut at 20,000 characters)"
    return json.dumps(res)
`;

/* ------------------------------------------------------------------ Python engine (Web Worker, main-thread fallback) */
function workerMain() {
  let run = null;
  self.onmessage = async (e) => {
    const m = e.data;
    if (m.type === 'init') {
      try {
        self.postMessage({ type: 'status', text: 'Downloading Python' });
        importScripts(m.base + 'pyodide.js');
        const py = await self.loadPyodide({ indexURL: m.base });
        self.postMessage({ type: 'status', text: 'Loading the road graph' });
        py.globals.set('LAB_JSON', m.labJson);
        py.globals.set('PRELUDE_SRC', m.prelude);
        py.globals.set('FUSION_SRC', m.fusion);
        py.globals.set('FUSION_HELPER_SRC', m.helper);
        py.runPython(m.harness);
        run = py.globals.get('lab_run');
        self.postMessage({ type: 'ready', version: py.version });
      } catch (err) {
        self.postMessage({ type: 'fatal', error: String(err && err.message || err) });
      }
    } else if (m.type === 'run') {
      let out;
      try { out = JSON.parse(run(m.job)); } catch (err) { out = { ok: false, error: { type: 'InternalError', msg: String(err && err.message || err), frames: [] } }; }
      self.postMessage({ type: 'result', id: m.id, out });
    }
  };
}

const Engine = {
  state: 'idle', statusText: 'Starting Python', worker: null, inline: null, queue: [], cur: null, seq: 0, listeners: new Set(), mode: 'worker',
  on(fn) { this.listeners.add(fn); },
  emit() { this.listeners.forEach((fn) => fn(this)); },
  initMsg() {
    return { type: 'init', base: PYODIDE_BASE, labJson: this.labJson || (this.labJson = JSON.stringify(LAB)), prelude: EXD.prelude, fusion: FUSION_SRC,
      helper: EXD.fusion_helper, harness: HARNESS };
  },
  start() {
    this.state = 'loading'; this.statusText = 'Starting Python'; this.emit();
    if (this.mode === 'worker') {
      try {
        const src = '(' + workerMain.toString() + ')()';
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        this.worker = new Worker(url);
        this.worker.onmessage = (e) => this.onMsg(e.data);
        this.worker.onerror = (e) => { if (this.state === 'loading') { this.fallback(String(e.message || 'worker error')); } };
        this.worker.postMessage(this.initMsg());
        return;
      } catch (err) {
        this.fallback(String(err));
        return;
      }
    }
    this.startInline();
  },
  fallback(why) {
    console.warn('Web Worker unavailable, running Python on the page:', why);
    try { this.worker && this.worker.terminate(); } catch (e) { /* ignore */ }
    this.worker = null; this.mode = 'inline'; this.startInline();
  },
  async startInline() {
    try {
      this.statusText = 'Downloading Python'; this.emit();
      if (!window.loadPyodide) {
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = PYODIDE_BASE + 'pyodide.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      }
      const py = await window.loadPyodide({ indexURL: PYODIDE_BASE });
      this.statusText = 'Loading the road graph'; this.emit();
      const m = this.initMsg();
      py.globals.set('LAB_JSON', m.labJson); py.globals.set('PRELUDE_SRC', m.prelude); py.globals.set('FUSION_SRC', m.fusion); py.globals.set('FUSION_HELPER_SRC', m.helper);
      py.runPython(m.harness);
      this.inline = py.globals.get('lab_run');
      this.onMsg({ type: 'ready', version: py.version });
    } catch (err) { this.onMsg({ type: 'fatal', error: String(err && err.message || err) }); }
  },
  onMsg(m) {
    if (m.type === 'status') { this.statusText = m.text; this.emit(); }
    else if (m.type === 'ready') { this.state = 'ready'; this.statusText = 'Python ready'; this.version = m.version; this.emit(); this.pump(); }
    else if (m.type === 'fatal') { this.state = 'error'; this.statusText = 'Python failed to load'; this.error = m.error; console.error('Pyodide failed:', m.error); this.emit(); }
    else if (m.type === 'result') {
      const c = this.cur;
      if (!c || c.id !== m.id) return;
      clearTimeout(c.timer); this.cur = null;
      m.out.ms = Math.round(performance.now() - c.t0);
      c.resolve(m.out); this.emit(); this.pump();
    }
  },
  /* opts: {timeout, key (coalesce), prio} */
  submit(job, opts = {}) {
    return new Promise((resolve) => {
      if (opts.key) {
        const i = this.queue.findIndex((q) => q.key === opts.key);
        if (i >= 0) { this.queue[i].resolve({ ok: false, superseded: true }); this.queue.splice(i, 1); }
      }
      const item = { id: ++this.seq, job, resolve, key: opts.key, prio: opts.prio || 0, timeout: opts.timeout || 30000 };
      this.queue.push(item);
      this.queue.sort((a, b) => b.prio - a.prio || a.id - b.id);
      this.emit(); this.pump();
    });
  },
  pump() {
    if (this.state !== 'ready' || this.cur || !this.queue.length) return;
    const c = this.cur = this.queue.shift();
    c.t0 = performance.now();
    this.emit();
    if (this.mode === 'worker') {
      c.timer = setTimeout(() => this.abort('timeout'), c.timeout);
      this.worker.postMessage({ type: 'run', id: c.id, job: JSON.stringify(c.job) });
    } else {
      setTimeout(() => {
        let out;
        try { out = JSON.parse(this.inline(JSON.stringify(c.job))); } catch (err) { out = { ok: false, error: { type: 'InternalError', msg: String(err), frames: [] } }; }
        this.onMsg({ type: 'result', id: c.id, out });
      }, 30);
    }
  },
  busy() { return !!this.cur; },
  abort(reason) {
    const c = this.cur;
    if (!c || this.mode !== 'worker') return;
    clearTimeout(c.timer);
    this.cur = null;
    try { this.worker.terminate(); } catch (e) { /* ignore */ }
    this.worker = null;
    const secs = Math.round((performance.now() - c.t0) / 1000);
    c.resolve({ ok: false, aborted: true, reason, ms: Math.round(performance.now() - c.t0),
      error: { type: reason === 'timeout' ? 'Timeout' : 'Stopped', frames: [], user_line: null,
        msg: reason === 'timeout' ? `Your code was still running after ${secs} s, so the lab stopped it. A loop that never ends? Check that every loop makes progress (for Dijkstra: pop from the queue every time).`
          : `You stopped the run after ${secs} s.` } });
    this.start();
  },
};

/* ------------------------------------------------------------------ state */
const S = { cur: 0, ex: [] };
function loadEx(i) {
  const ex = EXS[i]; const k = (n) => `${ex.id}:${n}`;
  const preds = store.get(k('preds'), null) || ex.predict.map(() => ({ guess: null, locked: false }));
  while (preds.length < ex.predict.length) preds.push({ guess: null, locked: false });
  return {
    code: store.get(k('code'), ex.skeleton),
    preds,
    hints: store.get(k('hints'), 0),
    fails: store.get(k('fails'), 0),
    runs: store.get(k('runs'), 0),
    pass: store.get(k('pass'), false),
    goodCode: store.get(k('goodCode'), null),
    best: store.get(k('best'), null),
    solShown: store.get(k('solShown'), false),
    explain: store.get(k('explain'), ''),
    ticks: store.get(k('ticks'), []),
    strongShown: store.get(k('strongShown'), false),
    knobPred: store.get(k('knobPred'), null),
    knobMoved: store.get(k('knobMoved'), false),
    knobFirst: store.get(k('knobFirst'), null),
    knob: Object.fromEntries(ex.knobs.map((kb) => [kb.id, kb.default])),
    last: null, running: false, confirm: null, drawWith: 'mine', vis: null, baseline: null, visBusy: false, assignMode: 'first', revealFalse: false,
  };
}
function save(i, ...keys) { const st = S.ex[i]; keys.forEach((n) => store.set(`${EXS[i].id}:${n}`, st[n])); }
const allLocked = (i) => S.ex[i].preds.every((p) => p.locked);
const lockedCount = (i) => S.ex[i].preds.filter((p) => p.locked).length;
const wordCount = (s) => (s.trim().match(/\S+/g) || []).length;
const written = (i) => wordCount(S.ex[i].explain) >= 10;

/* ------------------------------------------------------------------ header + nav */
function renderProgress() {
  const totalP = EXS.reduce((a, e) => a + e.predict.length, 0);
  const lockedP = S.ex.reduce((a, st, i) => a + lockedCount(i), 0);
  const passN = S.ex.filter((st) => st.pass).length;
  const wroteN = S.ex.filter((st, i) => written(i)).length;
  const chip = (label, v, t) => `<div class="pchip ${v === t ? 'full' : ''}"><div class="pstack"><div class="pl">${label}</div><div class="pv">${v}<span> / ${t}</span></div></div><div class="pb"><i style="width:${(100 * v / t).toFixed(1)}%"></i></div></div>`;
  $('#progress').innerHTML = chip('Predictions locked', lockedP, totalP) + chip('Tests passing', passN, EXS.length) + chip('Explanations written', wroteN, EXS.length);
}
function splitTitle(t) {
  const s = t.replace(/^\d+\.\s*/, ''); const i = s.indexOf(': ');
  if (i < 0) return ['', s];
  const rest = s.slice(i + 2);
  return [s.slice(0, i), rest.charAt(0).toUpperCase() + rest.slice(1)];
}
function renderNav() {
  $('#exlist').innerHTML = EXS.map((ex, i) => {
    const st = S.ex[i]; const [cat, title] = splitTitle(ex.title);
    const pc = lockedCount(i) === ex.predict.length ? 'done' : lockedCount(i) ? 'part' : '';
    const bc = st.pass ? 'done' : st.runs ? 'part' : '';
    const xc = written(i) ? 'done' : st.explain.trim() ? 'part' : '';
    return `<li class="${i === S.cur ? 'on' : ''} ${st.pass ? 'passed' : ''}"><button data-go="${i}" aria-current="${i === S.cur ? 'page' : 'false'}">
      <span class="exn">${st.pass ? ICON.bigcheck.replace('22', '18').replace('22', '18') : i + 1}</span>
      <span><span class="exe">${esc(cat)}</span><span class="ext" style="display:block">${esc(title)}</span>
      <span class="ticks"><span class="${pc}">Predict</span><span class="${bc}">Build</span><span class="${xc}">Explain</span></span></span></button></li>`;
  }).join('');
  $$('#exlist [data-go]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));
}
function renderPy() {
  const el = $('#pystatus'); const e = Engine;
  let cls = e.state === 'ready' ? (e.busy() ? 'busy' : '') : e.state === 'error' ? 'error' : 'loading';
  let text = e.state === 'ready' ? (e.busy() ? 'Running Python' : 'Python ready') : e.statusText;
  if (e.state === 'loading') text += '...';
  el.className = 'pystatus ' + cls;
  el.innerHTML = `<i></i><span>${esc(text)}</span>`;
  el.title = e.state === 'error' ? 'Click to retry. ' + (e.error || '') : e.version ? `Pyodide ${e.version}` : '';
  const pl = $('#pyload');
  if (pl) pl.classList.toggle('hidden', e.state === 'ready');
  if (pl && e.state !== 'ready') pl.querySelector('span').textContent = e.state === 'error' ? 'Python could not load. Check your connection, then click the status pill at the top right to retry.' : `${e.statusText}... the first time takes about 10 seconds.`;
  updateRunButton();
  const busyEl = $('#visbusy');
  if (busyEl) busyEl.classList.toggle('hidden', !S.ex[S.cur].visBusy);
}

/* ------------------------------------------------------------------ editor */
let cm = null; const docs = [];
function makeEditor() {
  const host = document.createElement('div');
  cm = CodeMirror(host, {
    value: '', mode: { name: 'python', version: 3 }, theme: 'maproom', lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
    matchBrackets: true, autofocus: false, viewportMargin: 30,
    extraKeys: {
      Tab: (c) => { if (c.somethingSelected()) c.indentSelection('add'); else c.replaceSelection('    ', 'end'); },
      'Shift-Tab': (c) => c.indentSelection('subtract'),
      Backspace: (c) => {
        if (c.somethingSelected()) return CodeMirror.Pass;
        const cur = c.getCursor(); const before = c.getLine(cur.line).slice(0, cur.ch);
        if (before.length && /^ +$/.test(before) && before.length % 4 === 0) { c.replaceRange('', { line: cur.line, ch: cur.ch - 4 }, cur); return undefined; }
        return CodeMirror.Pass;
      },
      'Cmd-Enter': () => runTests(), 'Ctrl-Enter': () => runTests(),
    },
  });
  cm.on('change', () => {
    const i = S.cur; const st = S.ex[i];
    st.code = cm.getValue(); saveCode();
    clearErrLine();
  });
}
const saveCode = debounce(() => { const i = S.cur; store.set(`${EXS[i].id}:code`, S.ex[i].code); }, 300);
let errHandle = null;
function clearErrLine() {
  if (errHandle) { try { cm.removeLineClass(errHandle, 'background', 'cm-errline'); cm.removeLineClass(errHandle, 'gutter', 'cm-errgutter'); } catch (e) { /* doc swapped */ } errHandle = null; }
}
function markErrLine(line) {
  clearErrLine();
  if (!line || line < 1 || line > cm.lineCount()) return;
  errHandle = cm.addLineClass(line - 1, 'background', 'cm-errline');
  cm.addLineClass(line - 1, 'gutter', 'cm-errgutter');
}
function gotoLine(line) {
  cm.focus(); cm.setCursor({ line: line - 1, ch: cm.getLine(line - 1).length });
  cm.scrollIntoView({ line: line - 1, ch: 0 }, 120);
}

/* ------------------------------------------------------------------ page */
function go(i, scroll = true) {
  if (i < 0 || i >= EXS.length) return;
  stopRipple();
  S.cur = i;
  try { if (location.hash !== '#' + (i + 1)) history.replaceState(null, '', '#' + (i + 1)); } catch (e) { /* file:// may refuse */ }
  renderNav(); renderPage();
  if (scroll) $('#main').scrollTo({ top: 0, behavior: 'auto' });
}

function renderPage() {
  const i = S.cur; const ex = EXS[i]; const st = S.ex[i];
  const [cat, title] = splitTitle(ex.title);
  const main = $('#main');
  main.innerHTML = `<div class="page" id="page">
    <div class="ph-eyebrow">Exercise ${i + 1} of ${EXS.length}: ${esc(cat)}</div>
    <h1 class="ph-title">${esc(title)}</h1>
    <div class="recap"><p>${esc(ex.recap)}</p>
      <a class="tourlink" href="../viewer/index.html" target="_blank" rel="noopener">${ICON.cube}<span>See it in the 3D tour<small>${esc(TOUR[ex.tour_lesson] || 'Open the tour')}</small></span></a></div>
    <div class="stepper" id="stepper"></div>

    <section class="sec" id="sec-predict">
      <div class="sec-h"><span class="num">1</span><h2>Predict first</h2><span class="sub">Commit to a guess before you see anything. Being wrong here is how it sticks.</span></div>
      <div class="preds" id="preds"></div>
    </section>

    <section class="sec" id="sec-build">
      <div class="lockmsg">${ICON.lock}<span id="lockmsg-build"></span></div>
      <div class="sec-h"><span class="num">2</span><h2>Build it</h2><span class="sub">Type it yourself. The tests run your code against the real road data.</span></div>
      <div class="task">${richText(ex.task)}</div>
      <div class="pyload" id="pyload"><div class="spin" style="color:var(--accent)"></div><span></span><div class="bar"><i></i></div></div>
      <div class="build">
        <div>
          <div class="edcard">
            <div class="edbar" id="edbar"></div>
            <div id="confirm"></div>
            <div class="edslot" id="edslot"></div>
          </div>
          <div class="hints" id="hints"></div>
          <div id="solution"></div>
        </div>
        <div class="tests" id="tests"></div>
      </div>
    </section>

    <section class="sec" id="sec-run">
      <div class="lockmsg">${ICON.lock}<span id="lockmsg-run"></span></div>
      <div class="sec-h"><span class="num">3</span><h2>See your code run</h2><span class="sub" id="runsub"></span></div>
      <div class="bench">
        <div class="stage" id="stage">
          <canvas id="cv"></canvas>
          <div class="vis-wait" id="viswait"><span class="spin"></span><span>Waiting for the first run</span></div>
          <div class="ov tl" id="chips"></div>
          <div class="ov tr"><span class="chip busy hidden" id="visbusy"><span class="spin"></span>Running</span><span id="srcbadge"></span></div>
          <div class="ov bl" id="legendwrap"></div>
          <div class="ov rt2" id="mapbtns"></div>
          <div class="ov bottom hidden" id="timebar"></div>
          <div id="viserr"></div>
        </div>
        <aside class="knobs" id="knobs"></aside>
      </div>
      <div id="heats"></div>
    </section>

    <section class="sec" id="sec-explain">
      <div class="sec-h"><span class="num">4</span><h2>Explain it back</h2><span class="sub">Say it out loud, then write it. Then compare.</span></div>
      <div class="explainbox" id="explain"></div>
    </section>

    <div class="pager">
      ${i > 0 ? `<button class="btn" data-go="${i - 1}">&larr; ${esc(splitTitle(EXS[i - 1].title)[1])}</button>` : '<span></span>'}
      ${i < EXS.length - 1 ? `<button class="btn primary" data-go="${i + 1}">Next: ${esc(splitTitle(EXS[i + 1].title)[1])} &rarr;</button>` : '<span></span>'}
    </div>
  </div>`;
  $$('.pager [data-go]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));

  // editor
  if (!docs[i]) docs[i] = CodeMirror.Doc(st.code, { name: 'python', version: 3 });
  errHandle = null;
  cm.swapDoc(docs[i]);
  $('#edslot').appendChild(cm.getWrapperElement());
  setTimeout(() => cm.refresh(), 0);

  renderStepper(); renderPreds(); renderLocks(); renderEdbar(); renderHints(); renderSolution(); renderTests(); renderPy();
  setupBench(); renderExplain();
  if (st.last && st.last.error && st.last.error.user_line) markErrLine(st.last.error.user_line);
}

function renderStepper() {
  const i = S.cur; const st = S.ex[i];
  const items = [['sec-predict', 'Predict', allLocked(i)], ['sec-build', 'Build', st.pass], ['sec-run', 'Watch and tweak', st.knobMoved], ['sec-explain', 'Explain', written(i)]];
  const el = $('#stepper'); if (!el) return;
  el.innerHTML = items.map(([id, label, done], k) => `<a href="#" data-sec="${id}" class="${done ? 'done' : ''}"><b>${done ? ICON.check : k + 1}</b>${label}</a>`).join('');
  $$('[data-sec]', el).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); scrollToSec(a.dataset.sec); }));
}
function scrollToSec(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

/* ------------------------------------------------------------------ predictions */
function gradePred(p, guess) {
  if (p.type === 'choice') return guess === p.answer ? 'green' : 'red';
  const tol = p.tolerance || 0; const d = Math.abs(guess - p.answer);
  if (d <= tol + 1e-9) return 'green';
  if (d <= Math.max(tol * 2.5, (p.max - p.min) * 0.08)) return 'amber';
  return 'red';
}
const decimals = (step) => (String(step).split('.')[1] || '').length;
function fmtPred(p, v) { return Number(v).toFixed(decimals(p.step)); }
function initialGuess(p) { const mid = p.min + (p.max - p.min) / 2; return Math.round(mid / p.step) * p.step; }
function renderPreds() {
  const i = S.cur; const ex = EXS[i]; const st = S.ex[i];
  const host = $('#preds');
  host.innerHTML = ex.predict.map((p, k) => {
    const ps = st.preds[k]; const locked = ps.locked;
    const g = locked ? gradePred(p, ps.guess) : null;
    let body = '';
    if (p.type === 'slider') {
      const v = ps.guess ?? initialGuess(p);
      const fill = (100 * (v - p.min) / (p.max - p.min)).toFixed(2);
      let marks = '';
      if (locked) {
        const ap = 100 * (p.answer - p.min) / (p.max - p.min);
        const tol = p.tolerance || 0;
        const b0 = 100 * (Math.max(p.min, p.answer - tol) - p.min) / (p.max - p.min); const b1 = 100 * (Math.min(p.max, p.answer + tol) - p.min) / (p.max - p.min);
        marks = `${tol ? `<div class="sl-band" style="left:${b0}%;width:${Math.max(0.8, b1 - b0)}%"></div>` : ''}<div class="sl-mark ans" style="left:${clamp(ap, 3, 97)}%">ANSWER ${fmtPred(p, p.answer)}</div>`;
      }
      body = `<div class="sl-wrap"><div class="sl-track">${marks}<input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}" style="--fill:${fill}%" data-k="${k}" ${locked ? 'disabled' : ''} aria-label="Your guess">
        <div class="sl-scale"><span>${p.min}</span><span>${p.max} ${esc(p.unit || '')}</span></div></div>
        <div class="sl-val" id="slv-${k}">${fmtPred(p, v)}<small>${esc(p.unit || '')}</small></div></div>`;
    } else {
      body = `<div class="opts">${p.options.map((o, j) => {
        let cls = ''; let tag = '';
        if (locked) { if (j === p.answer) { cls = 'right'; tag = 'answer'; } else if (j === ps.guess) { cls = 'wrong'; tag = 'your guess'; } }
        else if (j === ps.guess) cls = 'sel';
        if (locked && j === p.answer && j === ps.guess) tag = 'your guess, right';
        return `<button class="opt ${cls}" data-k="${k}" data-j="${j}" ${locked ? 'disabled' : ''}><i></i><span>${esc(o)}</span>${tag ? `<span class="otag">${tag}</span>` : ''}</button>`;
      }).join('')}</div>`;
    }
    let foot = '';
    if (locked) {
      const label = { green: p.type === 'choice' ? 'Right' : 'Spot on', amber: 'Close', red: p.type === 'choice' ? 'Not this time' : 'Off' }[g];
      const vt = p.type === 'slider' ? `You said <b>${fmtPred(p, ps.guess)} ${esc(p.unit || '')}</b>. The answer is <b>${fmtPred(p, p.answer)} ${esc(p.unit || '')}</b>${p.tolerance ? ` (within ${p.tolerance} counts)` : ''}.`
        : (g === 'green' ? 'You picked the right one.' : `You picked <b>${esc(p.options[ps.guess])}</b>.`);
      foot = `<div class="reveal"><div class="verdict"><span class="vchip ${g}">${label}</span><span class="vtext">${vt}</span></div><p class="explain">${richText(p.explain)}</p></div>`;
    } else {
      const ready = p.type === 'slider' || ps.guess != null;
      foot = `<button class="btn primary lockbtn" data-lock="${k}" ${ready ? '' : 'disabled'}>${ICON.lock} Lock in my guess</button>`;
    }
    return `<div class="pcard ${locked ? 'res-' + g : ''}" id="pcard-${k}"><div class="pk"><span>Prediction ${k + 1} of ${ex.predict.length}</span>${locked ? '<span>locked</span>' : ''}</div>
      <div class="pq">${esc(p.q)}</div>${body}${foot}</div>`;
  }).join('');
  $$('input[type=range][data-k]', host).forEach((r) => r.addEventListener('input', () => {
    const k = +r.dataset.k; const p = ex.predict[k]; const v = +r.value;
    st.preds[k].guess = v; r.style.setProperty('--fill', (100 * (v - p.min) / (p.max - p.min)).toFixed(2) + '%');
    $('#slv-' + k).innerHTML = `${fmtPred(p, v)}<small>${esc(p.unit || '')}</small>`;
  }));
  $$('.opt[data-k]', host).forEach((b) => b.addEventListener('click', () => {
    const k = +b.dataset.k; st.preds[k].guess = +b.dataset.j; renderPreds();
  }));
  $$('[data-lock]', host).forEach((b) => b.addEventListener('click', () => {
    const k = +b.dataset.lock; const p = ex.predict[k];
    if (p.type === 'slider' && st.preds[k].guess == null) st.preds[k].guess = initialGuess(p);
    if (st.preds[k].guess == null) return;
    const wasAll = allLocked(i);
    st.preds[k].locked = true; save(i, 'preds');
    renderPreds(); renderProgress(); renderNav(); renderStepper(); renderLocks();
    if (!wasAll && allLocked(i)) {
      toast('All predictions locked. The code is yours.');
      kickBench();
    }
  }));
}
function renderLocks() {
  const i = S.cur; const left = EXS[i].predict.length - lockedCount(i);
  const msg = `Lock in ${left} more prediction${left === 1 ? '' : 's'} above to start coding`;
  ['sec-build', 'sec-run'].forEach((id) => { const s = document.getElementById(id); if (s) s.classList.toggle('locked', left > 0); });
  const a = $('#lockmsg-build'); if (a) a.textContent = msg;
  const b = $('#lockmsg-run'); if (b) b.textContent = 'Unlocks with the code section';
  if (cm) cm.setOption('readOnly', left > 0 ? 'nocursor' : false);
}

/* ------------------------------------------------------------------ build: toolbar, hints, solution, tests */
function solUnlocked(st) { return st.hints >= 3 || st.fails >= 3; }
function updateRunButton() {
  const b = $('#runbtn'); if (!b) return;
  const st = S.ex[S.cur];
  if (st.running) { b.innerHTML = '<span class="spin"></span> Running'; b.disabled = true; }
  else if (Engine.state !== 'ready') { b.innerHTML = '<span class="spin"></span> Python loading'; b.disabled = true; }
  else { b.innerHTML = `${ICON.run} Run tests <span class="kh">${/Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl'}+Enter</span>`; b.disabled = false; }
  const sb = $('#stopbtn'); if (sb) sb.classList.toggle('hidden', !st.running);
}
function renderEdbar() {
  const i = S.cur; const ex = EXS[i]; const st = S.ex[i];
  const un = solUnlocked(st);
  const hintLabel = st.hints >= ex.hints.length ? 'All hints shown' : `Hint ${st.hints + 1} of ${ex.hints.length}`;
  $('#edbar').innerHTML = `<button class="btn primary" id="runbtn"></button>
    <button class="btn ghost danger hidden small" id="stopbtn">Stop</button>
    <button class="btn" id="hintbtn" ${st.hints >= ex.hints.length ? 'disabled' : ''}>${ICON.bulb} ${hintLabel}</button>
    <button class="btn ${un ? '' : 'ghost'}" id="solbtn" title="${un ? 'Reveal the reference solution' : `Unlocks after 3 hints or 3 failed runs (hints ${st.hints}/3, failed runs ${Math.min(st.fails, 3)}/3)`}">${un ? ICON.unlock : ICON.lock} ${st.solShown ? 'Solution shown' : 'Show solution'}</button>
    <span class="sp"></span>
    <button class="btn ghost small" id="resetbtn" title="Reset to starter code">${ICON.reset}<span>Reset<span class="wide-only"> to starter code</span></span></button>`;
  $('#runbtn').addEventListener('click', () => runTests());
  $('#stopbtn').addEventListener('click', () => Engine.abort('stop'));
  $('#hintbtn').addEventListener('click', () => {
    if (st.hints >= ex.hints.length) return;
    st.hints++; save(i, 'hints'); renderHints(); renderEdbar();
    const hs = $$('.hint', $('#hints')); if (hs.length) hs[hs.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#solbtn').addEventListener('click', () => {
    if (st.solShown) { $('#solution').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    if (!solUnlocked(st)) { toast(`The solution unlocks after 3 hints or 3 failed runs. So far: ${st.hints} hint${st.hints === 1 ? '' : 's'}, ${st.fails} failed run${st.fails === 1 ? '' : 's'}.`); return; }
    st.confirm = 'solution'; renderConfirm();
  });
  $('#resetbtn').addEventListener('click', () => { st.confirm = 'reset'; renderConfirm(); });
  updateRunButton(); renderConfirm();
}
function renderConfirm() {
  const st = S.ex[S.cur]; const host = $('#confirm'); if (!host) return;
  if (st.confirm === 'solution') {
    host.innerHTML = `<div class="confirm">${ICON.info}<span><b>Are you sure?</b> Typing it yourself is the point.</span><span class="sp"></span>
      <button class="btn small" id="cf-no">Keep trying</button><button class="btn small primary" id="cf-yes">Yes, show it</button></div>`;
    $('#cf-no').addEventListener('click', () => { st.confirm = null; renderConfirm(); cm.focus(); });
    $('#cf-yes').addEventListener('click', () => { st.confirm = null; st.solShown = true; save(S.cur, 'solShown'); renderConfirm(); renderEdbar(); renderSolution(); });
  } else if (st.confirm === 'reset') {
    host.innerHTML = `<div class="confirm">${ICON.info}<span><b>Replace your code with the starter code?</b> Cmd+Z in the editor brings yours back.</span><span class="sp"></span>
      <button class="btn small" id="cf-no">Cancel</button><button class="btn small primary" id="cf-yes">Replace</button></div>`;
    $('#cf-no').addEventListener('click', () => { st.confirm = null; renderConfirm(); });
    $('#cf-yes').addEventListener('click', () => { st.confirm = null; renderConfirm(); cm.setValue(EXS[S.cur].skeleton); cm.focus(); toast('Starter code restored'); });
  } else host.innerHTML = '';
}
function renderHints() {
  const ex = EXS[S.cur]; const st = S.ex[S.cur];
  $('#hints').innerHTML = ex.hints.slice(0, st.hints).map((h, k) => `<div class="hint"><b>${k + 1}</b><div>${richText(h)}</div></div>`).join('');
}
function renderSolution() {
  const ex = EXS[S.cur]; const st = S.ex[S.cur]; const host = $('#solution');
  if (!st.solShown) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="solution"><div class="solh">REFERENCE SOLUTION<span class="sp"></span>
    <button class="btn small" id="sol-hide">Hide</button><button class="btn small" id="sol-use">${ICON.copy} Put it in my editor</button></div><pre>${esc(ex.solution)}</pre></div>`;
  $('#sol-hide').addEventListener('click', () => { st.solShown = false; save(S.cur, 'solShown'); renderSolution(); renderEdbar(); });
  $('#sol-use').addEventListener('click', () => { cm.setValue(ex.solution); toast('Solution copied into the editor. Cmd+Z undoes it.'); });
}

function fmtTrace(err) {
  const lines = ['Traceback (most recent call last):'];
  (err.frames || []).forEach((f) => {
    lines.push(`<span class="fr">  ${esc(f.where)}, line ${f.line}${f.func && f.func !== '<module>' ? `, in ${esc(f.func)}` : ''}</span>`);
    if (f.text) lines.push(`<span class="src">    ${esc(f.text)}</span>`);
  });
  lines.push(`<span class="msg">${esc(err.type)}: ${esc(err.msg)}</span>`);
  return lines.join('\n');
}
function errHeadline(err) {
  if (err.type === 'Timeout') return 'Stopped: it ran too long';
  if (err.type === 'Stopped') return 'Run stopped';
  if (err.user_line) return `${err.type} on line ${err.user_line} of your code`;
  const f = (err.frames || []).slice(-1)[0];
  if (f && f.file === '<tests>') return `${err.type} while the tests checked your result`;
  if (f) return `${err.type} in ${f.where}`;
  return err.type;
}
function renderTests() {
  const i = S.cur; const st = S.ex[i]; const host = $('#tests'); if (!host) return;
  const r = st.last;
  const checks = r && r.checks ? r.checks : null;
  const n = checks ? checks.length : 0; const ok = checks ? checks.filter((c) => c.ok).length : 0;
  const all = !!(r && r.ok && n > 0 && ok === n);
  host.classList.toggle('allpass', all);
  let html = `<div class="th"><span class="tl">Tests</span><span class="tc">${checks ? `<b>${ok}</b> of ${n} passing` : st.running ? 'running' : r && r.error ? 'stopped by an error' : st.pass ? 'passed last time' : 'not run yet'}</span></div>
    <div class="tbar"><i style="width:${checks && n ? (100 * ok / n) : st.pass && !r ? 100 : 0}%"></i></div>`;
  if (st.running && !checks) html += `<div class="tempty"><span class="spin"></span><br>Running your code against the road data</div>`;
  else if (!checks && !(r && r.error)) {
    html += `<div class="tempty"><span class="big">${ICON.run.replace('13', '28').replace('13', '28')}</span>${st.pass ? 'You passed this one before. Run again to see the checklist.' : 'Write the missing lines, then press <b>Run tests</b>.<br>Every check runs your function on the real map and compares it with the engine.'}</div>`;
  }
  if (checks) {
    html += `<div class="tlist">${checks.map((c, k) => `<div class="trow ${c.ok ? 'ok' : 'bad'}" style="animation-delay:${k * 45}ms"><span class="ic">${c.ok ? ICON.check : ICON.cross}</span>
      <div><div class="tn">${esc(c.name)}</div>${c.detail ? `<div class="td">${esc(c.detail)}</div>` : ''}</div></div>`).join('')}</div>`;
  }
  if (r && r.error) {
    const ul = r.error.user_line;
    html += `<div class="trace"><div class="trh">${esc(errHeadline(r.error))}<span class="sp"></span>${ul ? `<button class="goline" data-line="${ul}">Go to line ${ul}</button>` : ''}</div><pre>${r.aborted ? esc(r.error.msg) : fmtTrace(r.error)}</pre></div>`;
  }
  if (r && r.stdout) html += `<div class="stdout"><div class="soh">Your print output</div><pre>${esc(r.stdout)}</pre></div>`;
  if (all) {
    html += `<div class="cheer"><div class="ci">${ICON.bigcheck}</div><div><div class="ct">All ${n} tests pass.</div><div class="cs">Your code matches the engine on the real map. <a href="#" id="towatch">Watch it run &darr;</a></div></div></div>`;
  }
  if (r && r.ms != null) html += `<div class="runmeta">Run ${st.runs} took ${(r.ms / 1000).toFixed(2)} s${r.py_ms != null ? ` (Python ${(r.py_ms / 1000).toFixed(2)} s)` : ''}</div>`;
  html += '<div class="burst" id="burst"></div>';
  host.innerHTML = html;
  $$('.goline', host).forEach((b) => b.addEventListener('click', () => gotoLine(+b.dataset.line)));
  const tw = $('#towatch', host); if (tw) tw.addEventListener('click', (e) => { e.preventDefault(); scrollToSec('sec-run'); });
}
function burst() {
  const b = $('#burst'); if (!b) return;
  const cols = ['#4ade80', '#f5b25b', '#67e8f9', '#facc15', '#c084fc'];
  b.innerHTML = Array.from({ length: 34 }, (_, k) => {
    const dx = (Math.random() * 2 - 1) * 220; const dy = 120 + Math.random() * 260; const rot = (Math.random() * 2 - 1) * 540;
    return `<i style="left:${50 + (Math.random() * 30 - 15)}%;background:${cols[k % cols.length]};--dx:${dx}px;--dy:${dy}px;--rot:${rot}deg;animation-delay:${Math.random() * 120}ms"></i>`;
  }).join('');
  setTimeout(() => { if (b) b.innerHTML = ''; }, 2000);
}

async function runTests() {
  const i = S.cur; const ex = EXS[i]; const st = S.ex[i];
  if (!allLocked(i)) { toast('Lock in your predictions first.'); scrollToSec('sec-predict'); return; }
  if (st.running) return;
  if (Engine.state === 'error') { toast('Python is not loaded. Click the status pill to retry.'); return; }
  saveCode.cancel(); store.set(`${ex.id}:code`, st.code);
  st.running = true; st.last = null; clearErrLine();
  renderTests(); updateRunButton();
  const out = await Engine.submit({ kind: 'tests', code: st.code, tests: ex.tests }, { timeout: 30000, prio: 2 });
  st.running = false;
  const checks = out.checks || [];
  const all = out.ok && checks.length > 0 && checks.every((c) => c.ok);
  const was = st.pass;
  st.runs++;
  if (!all) st.fails++;
  if (all) { st.pass = true; st.goodCode = st.code; }
  st.best = { ok: checks.filter((c) => c.ok).length, n: checks.length };
  st.last = out;
  save(i, 'runs', 'fails', 'pass', 'best', 'goodCode');
  if (i === S.cur) {
    renderTests(); updateRunButton(); renderEdbar();
    if (out.error && out.error.user_line) markErrLine(out.error.user_line);
    if (all && !(st.lastAll)) burst();
  }
  st.lastAll = all;
  renderNav(); renderProgress(); if (i === S.cur) renderStepper();
  if (all && !was) toast('All tests pass. The map below now runs your code.');
  if (i === S.cur && !out.aborted) { st.drawWith = 'mine'; runBench('mine', st.code); renderKnobs(); }
}

/* ------------------------------------------------------------------ map view */
let NX = null, NY = null;
function projectNodes() {
  const n = LAB.graph.nodes.length; NX = new Float64Array(n); NY = new Float64Array(n);
  LAB.graph.nodes.forEach(([lat, lon], k) => { NX[k] = (lon - BBOX.w) * KX; NY[k] = BBOX.n - lat; });
}
const mx = (lon) => (lon - BBOX.w) * KX;
const my = (lat) => BBOX.n - lat;
class MapView {
  constructor(canvas, onDraw, interactive = true) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.onDraw = onDraw; this.cx = 0.26; this.cy = 0.32; this.s = 1500;
    this.w = 100; this.h = 100; this.dpr = 1; this.userMoved = false; this.base = document.createElement('canvas'); this.baseKey = '';
    this.interactive = interactive; this.raf = 0; this.defaultBox = null;
    if (interactive) this.bind();
  }
  resize() {
    const r = this.cv.getBoundingClientRect(); this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(50, r.width); this.h = Math.max(50, r.height);
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    this.base.width = this.cv.width; this.base.height = this.cv.height; this.baseKey = '';
  }
  fit(b) {
    const p = this.pad || { t: 72, r: 64, b: 40, l: 40 };
    const x0 = mx(b.w), x1 = mx(b.e), y0 = my(b.n), y1 = my(b.s);
    const aw = Math.max(80, this.w - p.l - p.r), ah = Math.max(80, this.h - p.t - p.b);
    this.s = Math.min(aw / Math.max(1e-6, x1 - x0), ah / Math.max(1e-6, y1 - y0));
    // centre of the free area, expressed in map units
    this.cx = (x0 + x1) / 2 - ((p.l - p.r) / 2) / this.s; this.cy = (y0 + y1) / 2 - ((p.t - p.b) / 2) / this.s; this.request();
  }
  setDefault(b) { this.defaultBox = b; if (!this.userMoved) this.fit(b); }
  X(lon) { return (mx(lon) - this.cx) * this.s + this.w / 2; }
  Y(lat) { return (my(lat) - this.cy) * this.s + this.h / 2; }
  P(lat, lon) { return [this.X(lon), this.Y(lat)]; }
  request() { if (this.raf) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this.onDraw(); }); }
  zoomAt(px, py, f) {
    const s2 = clamp(this.s * f, 400, 60000); const k = s2 / this.s;
    const wx = (px - this.w / 2) / this.s + this.cx; const wy = (py - this.h / 2) / this.s + this.cy;
    this.s = s2; this.cx = wx - (px - this.w / 2) / this.s; this.cy = wy - (py - this.h / 2) / this.s; this.userMoved = k !== 1 || this.userMoved; this.request();
  }
  bind() {
    const cv = this.cv; let drag = null;
    let active = false;
    cv.addEventListener('wheel', (e) => {
      if (!(active || e.ctrlKey || e.metaKey)) return;   // let the page scroll until the map is clicked (pinch sends ctrlKey)
      e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
    }, { passive: false });
    cv.addEventListener('pointerleave', () => { active = false; });
    cv.addEventListener('pointerdown', (e) => { active = true; drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy }; cv.setPointerCapture(e.pointerId); cv.classList.add('dragging'); });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; this.cx = drag.cx - (e.clientX - drag.x) / this.s; this.cy = drag.cy - (e.clientY - drag.y) / this.s; this.userMoved = true; this.request(); });
    const end = () => { drag = null; cv.classList.remove('dragging'); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('dblclick', () => this.reset());
  }
  reset() { this.userMoved = false; if (this.defaultBox) this.fit(this.defaultBox); }
  drawBase(ctx) {
    const key = [this.cx, this.cy, this.s, this.w, this.h, this.dpr].map((v) => v.toFixed(4)).join(',');
    if (key !== this.baseKey) {
      this.baseKey = key;
      const b = this.base.getContext('2d'); b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); b.clearRect(0, 0, this.w, this.h);
      const E = LAB.graph.edges; const hw = this.w / 2, hh = this.h / 2, s = this.s, cx = this.cx, cy = this.cy;
      const zoomW = clamp(s / 2200, 0.6, 2.2);
      const style = [[0.10, 0.6], [0.16, 0.8], [0.25, 1.1], [0.33, 1.5], [0.42, 1.9]];
      for (let c = 0; c < 5; c++) {
        b.beginPath();
        for (let k = 0; k < E.length; k++) {
          const e = E[k]; if (e[3] !== c) continue;
          const x1 = (NX[e[0]] - cx) * s + hw, y1 = (NY[e[0]] - cy) * s + hh, x2 = (NX[e[1]] - cx) * s + hw, y2 = (NY[e[1]] - cy) * s + hh;
          if ((x1 < -20 && x2 < -20) || (x1 > this.w + 20 && x2 > this.w + 20) || (y1 < -20 && y2 < -20) || (y1 > this.h + 20 && y2 > this.h + 20)) continue;
          b.moveTo(x1, y1); b.lineTo(x2, y2);
        }
        b.strokeStyle = `rgba(214,222,232,${style[c][0]})`; b.lineWidth = style[c][1] * zoomW; b.lineCap = 'round'; b.stroke();
      }
      if (SIB && SIB.rivers) {
        SIB.rivers.forEach((r) => {
          b.beginPath(); r.p.forEach(([lat, lon], k) => { const x = this.X(lon), y = this.Y(lat); if (k) b.lineTo(x, y); else b.moveTo(x, y); });
          b.strokeStyle = r.k === 2 ? 'rgba(77,148,224,.75)' : 'rgba(77,148,224,.45)'; b.lineWidth = (r.k === 2 ? 2.2 : 1.1) * clamp(s / 2500, 0.8, 2); b.stroke();
        });
      }
    }
    ctx.drawImage(this.base, 0, 0, this.w, this.h);
  }
  drawPlaces(ctx, opts = {}) {
    const skip = new Set(opts.skip || []);
    Object.entries(LAB.places).forEach(([id, [lat, lon]]) => {
      if (skip.has(id)) return;
      const [x, y] = this.P(lat, lon);
      if (x < -100 || x > this.w + 100 || y < -30 || y > this.h + 30) return;
      ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
      const name = PLACE_NAMES[id] || id;
      if (id === 'arcis') textHalo(ctx, name, x - 6, y + 20, { font: '600 13px Inter, sans-serif', align: 'right' });
      else if (id === 'vitry_west') textHalo(ctx, name, x - 8, y + 4, { font: '600 13px Inter, sans-serif', align: 'right' });
      else textHalo(ctx, name, x + 8, y + 4, { font: '600 13px Inter, sans-serif', align: 'left' });
    });
    Object.entries(LAB.crossings).forEach(([id, [lat, lon]]) => {
      const [x, y] = this.P(lat, lon);
      if (x < -40 || x > this.w + 40 || y < -40 || y > this.h + 40) return;
      ctx.fillStyle = '#fb923c'; ctx.strokeStyle = '#1b1004'; ctx.lineWidth = 1.5; ctx.fillRect(x - 4.5, y - 4.5, 9, 9); ctx.strokeRect(x - 4.5, y - 4.5, 9, 9);
      const off = { X2: [-12, -2, 'right'], X1: [0, -12, 'center'], X3: [12, -2, 'left'] }[id] || [0, -12, 'center'];
      pill(ctx, id, x + off[0], y + off[1], { bg: '#fb923c', fg: '#1b1004', align: off[2], font: '800 11.5px Inter, sans-serif' });
    });
  }
}
function textHalo(ctx, text, x, y, o = {}) {
  ctx.font = o.font || '600 13px Inter, sans-serif'; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
  ctx.lineJoin = 'round'; ctx.lineWidth = o.halo || 3.5; ctx.strokeStyle = o.haloColor || 'rgba(8,11,15,.92)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = o.color || '#fff'; ctx.fillText(text, x, y);
}
function pill(ctx, text, x, y, o = {}) {
  ctx.font = o.font || '700 12px Inter, sans-serif'; const w = ctx.measureText(text).width + 2 * (o.padX || 6); const h = o.h || 19;
  let left = x - w / 2; if (o.align === 'left') left = x; if (o.align === 'right') left = x - w;
  const top = y - h / 2;
  ctx.beginPath(); roundRect(ctx, left, top, w, h, o.r || 5); ctx.fillStyle = o.bg || 'rgba(12,17,23,.9)'; ctx.fill();
  if (o.border) { ctx.lineWidth = 1; ctx.strokeStyle = o.border; if (o.dash) ctx.setLineDash(o.dash); ctx.stroke(); ctx.setLineDash([]); }
  ctx.fillStyle = o.fg || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, left + w / 2, top + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
  return { left, top, w, h };
}
function roundRect(ctx, x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function boxOf(points, padKm = 2) {
  let s = 90, n = -90, w = 180, e = -180;
  points.forEach(([lat, lon]) => { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon); });
  const dl = padKm / 111; const dn = padKm / (111 * KX);
  return { s: s - dl, n: n + dl, w: w - dn, e: e + dn };
}

/* ------------------------------------------------------------------ bench */
let MV = null; let ro = null; let ripple = { k: 0, playing: false, raf: 0, last: 0 };
const RAMP = (() => {
  const stops = [[0, [255, 243, 196]], [0.22, [245, 178, 91]], [0.5, [251, 124, 60]], [0.76, [192, 132, 252]], [1, [91, 110, 255]]];
  const out = [];
  for (let k = 0; k < 64; k++) {
    const t = k / 63; let a = stops[0], b = stops[stops.length - 1];
    for (let j = 0; j < stops.length - 1; j++) if (t >= stops[j][0] && t <= stops[j + 1][0]) { a = stops[j]; b = stops[j + 1]; break; }
    const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
    out.push(`rgb(${a[1].map((v, q) => Math.round(v + (b[1][q] - v) * f)).join(',')})`);
  }
  return out;
})();
function stopRipple() { ripple.playing = false; cancelAnimationFrame(ripple.raf); ripple.raf = 0; }

function setupBench() {
  const i = S.cur; const ex = EXS[i]; const st = S.ex[i];
  const cv = $('#cv'); const stage = $('#stage');
  if (ro) ro.disconnect();
  const isMap = ex.visual !== 'race';
  stage.classList.toggle('plain', !isMap);
  MV = new MapView(cv, () => drawBench(), isMap);
  MV.pad = ex.visual === 'ripple' ? { t: 72, r: 64, b: 96, l: 40 } : { t: 72, r: 64, b: 40, l: 40 };
  MV.resize();
  // default views
  const R = LAB.dijkstra_ref; const nodes = LAB.graph.nodes;
  const defaults = {
    ripple: boxOf([nodes[R.start], nodes[R.goal]], 12),
    unit: boxOf(LAB.route_b1_x5.line.map((p) => [p[0], p[1]]), 3),
    fusion: boxOf(LAB.reports.map((r) => r.pos).concat(Object.values(LAB.red_truth).map((t) => nearestT(t, 300).slice(1))), 3),
    assign: boxOf(Object.values(LAB.crossings).concat([LAB.places.camp_mailly, LAB.places.sommesous, LAB.places.vitry_west]), 4),
    race: null,
  };
  if (defaults[ex.visual]) MV.setDefault(defaults[ex.visual]);
  ro = new ResizeObserver(() => { MV.resize(); if (MV.defaultBox && !MV.userMoved) MV.fit(MV.defaultBox); MV.request(); });
  ro.observe(stage);
  $('#mapbtns').innerHTML = isMap ? `<button class="mapbtn" data-z="1.4" title="Zoom in" aria-label="Zoom in">+</button><button class="mapbtn" data-z="0.7" title="Zoom out" aria-label="Zoom out">&minus;</button><button class="mapbtn" data-fit title="Fit to the action (or double-click the map)" aria-label="Fit view">${'<svg viewBox="0 0 16 16" width="15" height="15"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>'}</button>` : '';
  $$('#mapbtns [data-z]').forEach((b) => b.addEventListener('click', () => MV.zoomAt(MV.w / 2, MV.h / 2, +b.dataset.z)));
  const fb = $('#mapbtns [data-fit]'); if (fb) fb.addEventListener('click', () => MV.reset());
  renderLegend(); renderKnobs(); renderHeats(); renderVisMeta();
  $('#runsub').textContent = {
    ripple: 'Your dijkstra() grows the ripple. Colour = the order your code settled each road point.',
    unit: 'Your position() places the column on the road, minute by minute.',
    fusion: 'The engine\'s fusion runs with your function plugged in. Rings are the tracks it builds.',
    assign: 'Your best_assignment() picks who does what. Arrows show your plan on the map.',
    race: 'Your holds() decides each of 1,000 seeded races to the Brienne bridge.',
  }[ex.visual] || '';
  if (st.vis) { $('#viswait').classList.add('hidden'); applyVis(false); }
  else if (allLocked(i)) kickBench();
  MV.request();
}
function nearestT(track, t) { let best = track[0]; track.forEach((p) => { if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; }); return best; }
function kickBench() {
  const st = S.ex[S.cur];
  if (!st.vis) runBench(st.goodCode ? 'mine' : 'ref');
}

/* src 'mine' runs the learner's code: the explicit text when given, else the last version that passed its tests. */
async function runBench(src, code) {
  const i = S.cur; const ex = EXS[i]; const st = S.ex[i];
  if (!allLocked(i)) return;
  if (src === 'mine' && code == null) code = st.goodCode || st.code;
  const knob = { ...st.knob };
  const job = { kind: 'knob', code: src === 'mine' ? code : ex.solution, knob_code: ex.knob_code, knob,
    hook: HOOKS[ex.id] || '', vis: VIS_CODE[ex.visual] || '' };
  st.visBusy = true; renderPy();
  const out = await Engine.submit(job, { key: 'bench', timeout: 30000, prio: 1 });
  if (out.superseded) return;
  st.visBusy = false;
  const atDefaults = ex.knobs.every((kb) => knob[kb.id] === kb.default);
  if (out.ok && atDefaults && !st.baseline) st.baseline = out.result;
  st.vis = { src, out, knob };
  if (i !== S.cur) return;
  renderPy();
  $('#viswait').classList.add('hidden');
  applyVis(true);
  // compare with the mini prediction after the first move
  if (st.pendingCompare && out.ok) {
    st.pendingCompare = false;
    const key = HEADLINE[ex.id]; const before = st.baseline ? st.baseline[key] : null; const after = out.result ? out.result[key] : null;
    st.knobFirst = { before, after, knob }; st.knobMoved = true; save(i, 'knobFirst', 'knobMoved');
    renderKnobs(); renderStepper();
  }
}
function applyVis(fresh) {
  const ex = EXS[S.cur]; const st = S.ex[S.cur]; const v = st.vis; if (!v) return;
  renderVisMeta(); renderNumbers(); renderHeats();
  const err = $('#viserr');
  if (!v.out.ok && !v.out.superseded) {
    const e = v.out.error || { type: 'Error', msg: 'unknown' };
    err.innerHTML = `<div class="vis-err"><h4>${v.src === 'mine' ? 'Your code could not drive the map yet' : 'The reference run failed'}</h4>
      <p>${esc(errHeadline(e))}. ${v.src === 'mine' ? 'Fix it above and run the tests again; this map redraws with your code each time.' : ''}</p><pre>${esc(e.type)}: ${esc(e.msg)}</pre></div>`;
  } else err.innerHTML = '';
  if (ex.visual === 'ripple') {
    if (fresh && v.out.ok && v.out.vis) {
      const order = v.out.vis.order || [];
      if (!MV.userMoved && order.length > 20) {
        const pts = []; const step = Math.max(1, Math.floor(order.length / 2000));
        for (let k = 0; k < order.length; k += step) pts.push(LAB.graph.nodes[order[k]]);
        pts.push(LAB.graph.nodes[LAB.dijkstra_ref.start], LAB.graph.nodes[LAB.dijkstra_ref.goal]);
        MV.setDefault(boxOf(pts, 1.5));
      }
      ripple.k = 0; playRipple();
    }
    renderTimebar();
  }
  MV.request();
}
function renderVisMeta() {
  const ex = EXS[S.cur]; const st = S.ex[S.cur]; const v = st.vis;
  const badge = $('#srcbadge'); const chips = $('#chips');
  if (!v) { badge.innerHTML = ''; chips.innerHTML = ''; return; }
  badge.innerHTML = v.src === 'mine' ? `<span class="chip src mine">Drawn by your code</span>` : `<span class="chip src ref">Drawn by the reference solution</span>`;
  const r = v.out.ok ? v.out.result || {} : null;
  let c = '';
  if (r) {
    if (ex.visual === 'ripple') c = `<span class="chip"><b>${fmtInt(r.settled)}</b> settled</span><span class="chip"><b>${r.minutes}</b> minutes</span>${v.knob.blow ? '<span class="chip" style="color:#ff9a9a">Arcis bridges blown</span>' : ''}`;
    if (ex.visual === 'unit') c = `<span class="chip"><b>H+${v.knob.t}</b> now</span><span class="chip"><b>${r.km_driven}</b> km driven</span><span class="chip">arrives at X5 <b style="font-size:15px">H+${r.arrives}</b></span>`;
    if (ex.visual === 'fusion') {
      const found = r.red_found ? Object.values(r.red_found).filter(Boolean).length : 0; const tot = r.red_found ? Object.keys(r.red_found).length : 3;
      c = `<span class="chip"><b>${r.confirmed}</b> confirmed</span><span class="chip"><b>${r.tentative}</b> tentative</span><span class="chip" ${r.false_tracks ? 'style="color:#ff9a9a"' : ''}><b>${r.false_tracks}</b> false</span><span class="chip">Red found <b>${found}</b>/${tot}</span>`;
    }
    if (ex.visual === 'assign') {
      const plan = v.out.vis && v.out.vis[st.assignMode === 'full' ? 'full' : 'first'];
      const ref = (st.assignMode === 'full' ? LAB.solver_full : LAB.solver_first).answer;
      if (plan) c = `<span class="chip">latest ready <b>H+${plan[0][0]}</b></span><span class="chip">total <b>${plan[0][1]}</b> unit-min</span><span class="chip">${plan[0][0] === ref.last && plan[0][1] === ref.total ? '<span class="okchip pass">MATCHES CP-SAT</span>' : `<span class="okchip fail">CP-SAT: H+${ref.last}, ${ref.total}</span>`}</span>`;
      else c = '<span class="chip">No plan returned</span>';
    }
  }
  chips.innerHTML = c;
  if (ex.visual === 'race') chips.innerHTML = '';
}
function renderLegend() {
  const ex = EXS[S.cur]; const st = S.ex[S.cur];
  const sq = (c) => `<svg width="12" height="12"><rect x="1.5" y="1.5" width="9" height="9" fill="${c}" stroke="#1b1004"/></svg>`;
  const line = (c, w = 3, dash = '') => `<svg width="26" height="12"><line x1="1" y1="6" x2="25" y2="6" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linecap="round"/></svg>`;
  const dot = (c, r = 4) => `<svg width="12" height="12"><circle cx="6" cy="6" r="${r}" fill="${c}" stroke="#0c1116"/></svg>`;
  const ring = (c, dash = '') => `<svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg>`;
  const dia = (c) => `<svg width="12" height="12"><path d="M6 1 L11 6 L6 11 L1 6Z" fill="${c}" stroke="#fff" stroke-width="1"/></svg>`;
  const L = (sw, t) => `<div class="lg"><span class="sw">${sw}</span><span>${t}</span></div>`;
  const base = L(line('rgba(214,222,232,.5)', 2), 'Roads') + (SIB ? L(line('#4d94e0', 2.5), 'Rivers') : '') + L(sq('#fb923c'), 'River crossings X1 to X6');
  let h = '';
  if (ex.visual === 'ripple') h = `<div class="lg"><span class="grad" style="background:linear-gradient(90deg,${RAMP[0]},${RAMP[20]},${RAMP[40]},${RAMP[63]})"></span></div><div class="lg" style="justify-content:space-between;width:120px;color:var(--muted);font-size:11px"><span>settled first</span><span>last</span></div>`
    + L(line('#fff', 3), 'Path rebuilt from your prev') + base + `<div class="note">Drag to pan. Click the map, then scroll to zoom (or pinch).</div>`;
  if (ex.visual === 'unit') h = L(line('rgba(91,156,255,.4)', 4), 'B-1 route to X5') + L(line('#5b9cff', 4), 'Driven so far') + L(dot('#fff', 3), 'Your position() every 5 min') + L(sq('#5b9cff').replace('#1b1004', '#fff'), 'B-1 now') + base;
  if (ex.visual === 'fusion') h = L(dot('#facc15'), 'Spot reports received by H+300') + (st.revealFalse ? L(dot('#c084fc'), 'False report (nobody there)') : '') + L(ring('#67e8f9'), 'Confirmed track (2+ reports)') + L(ring('#a5b4c8', '3 3'), 'Tentative track') + L(dia('#ff5f5f'), 'Red unit, true position at H+300') + base;
  if (ex.visual === 'assign') h = L(sq('#5b9cff').replace('#1b1004', '#fff'), 'Blue unit start') + L(line('#7fb2ff', 3), 'Your plan: unit to task') + base;
  if (ex.visual === 'race') h = L(dot('#4ade80'), 'Run where Blue holds X5') + L(dot('#ff5f5f'), 'Run where Blue loses X5') + L(line('#8d9bab', 1.5, '5 4'), 'Both arrive at the same minute');
  const closed = store.get('legendClosed', false);
  const wrap = $('#legendwrap');
  wrap.innerHTML = `<div class="legend ${closed ? 'closed' : ''}"><button class="lgh" aria-expanded="${!closed}">Legend<svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button><div class="lgb">${h}</div></div>`;
  wrap.className = 'ov ' + (ex.visual === 'race' ? 'br' : 'bl');
  wrap.style.bottom = ex.visual === 'ripple' ? '86px' : '16px';
  $('.lgh', wrap).addEventListener('click', () => { store.set('legendClosed', !closed); renderLegend(); });
}

/* ---------- ripple */
function playRipple() {
  const v = S.ex[S.cur].vis; if (!v || !v.out.ok || !v.out.vis) return;
  const N = v.out.vis.order.length; if (!N) return;
  if (ripple.k >= N) ripple.k = 0;
  ripple.playing = true; ripple.last = performance.now();
  const dur = 3200;
  const step = (now) => {
    if (!ripple.playing) return;
    const dt = now - ripple.last; ripple.last = now;
    ripple.k = Math.min(N, ripple.k + N * dt / dur);
    syncTimebar(); MV.request();
    if (ripple.k >= N) { ripple.playing = false; syncTimebar(); return; }
    ripple.raf = requestAnimationFrame(step);
  };
  cancelAnimationFrame(ripple.raf); ripple.raf = requestAnimationFrame(step); syncTimebar();
}
function renderTimebar() {
  const tb = $('#timebar'); const v = S.ex[S.cur].vis;
  if (!v || !v.out.ok || !v.out.vis || !v.out.vis.order.length) { tb.classList.add('hidden'); return; }
  const N = v.out.vis.order.length;
  tb.classList.remove('hidden');
  tb.innerHTML = `<div class="timebar"><button class="play" id="rplay" aria-label="Play or pause"></button>
    <input type="range" id="rslider" min="0" max="${N}" step="1" value="${Math.round(ripple.k)}" aria-label="Settle order">
    <div class="tlab" id="rlab"></div></div>`;
  $('#rplay').addEventListener('click', () => { if (ripple.playing) { stopRipple(); syncTimebar(); } else playRipple(); });
  $('#rslider').addEventListener('input', (e) => { stopRipple(); ripple.k = +e.target.value; syncTimebar(); MV.request(); });
  syncTimebar();
}
function syncTimebar() {
  const v = S.ex[S.cur].vis; const sl = $('#rslider'); if (!sl || !v || !v.out.vis) return;
  const N = v.out.vis.order.length; const k = Math.round(ripple.k);
  sl.value = k; sl.style.setProperty('--fill', (100 * k / N).toFixed(2) + '%');
  $('#rplay').innerHTML = ripple.playing ? ICON.pause : ICON.play;
  $('#rlab').innerHTML = k >= N ? `<b>${fmtInt(N)}</b> settled: goal reached` : `settled <b>${fmtInt(k)}</b> of ${fmtInt(N)}`;
}
function drawRipple(ctx, v) {
  const vis = v.out.vis; if (!vis) return;
  const order = vis.order; const N = order.length; const k = Math.min(N, Math.round(ripple.k));
  const sz = clamp(MV.s / 1300, 1.6, 4.2); const half = sz / 2;
  const hw = MV.w / 2, hh = MV.h / 2, s = MV.s, cx = MV.cx, cy = MV.cy;
  const buckets = RAMP.length;
  for (let b = 0; b < buckets; b++) {
    const lo = Math.floor(b * N / buckets); const hi = Math.min(k, Math.floor((b + 1) * N / buckets));
    if (lo >= hi) continue;
    ctx.fillStyle = RAMP[b];
    for (let q = lo; q < hi; q++) { const n = order[q]; ctx.fillRect((NX[n] - cx) * s + hw - half, (NY[n] - cy) * s + hh - half, sz, sz); }
  }
  // the wavefront: the most recently settled points
  if (k < N) {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let q = Math.max(0, k - Math.max(40, N / 60)); q < k; q++) { const n = order[q]; ctx.fillRect((NX[n] - cx) * s + hw - half - 0.5, (NY[n] - cy) * s + hh - half - 0.5, sz + 1, sz + 1); }
  }
  const R = LAB.dijkstra_ref;
  if (v.knob.blow) {
    LAB.graph.cut_x1_x2.forEach(([a, b]) => {
      const x = ((NX[a] + NX[b]) / 2 - cx) * s + hw, y = ((NY[a] + NY[b]) / 2 - cy) * s + hh;
      ctx.strokeStyle = '#ff5f5f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
    });
    const [a] = LAB.graph.cut_x1_x2[0]; pill(ctx, 'Bridges blown', (NX[a] - cx) * s + hw - 14, (NY[a] - cy) * s + hh + 18, { bg: '#d92b2b', fg: '#fff', align: 'right', font: '800 11.5px Inter, sans-serif' });
  }
  const path = vis.path || [];
  const reached = path.length > 1 && path[path.length - 1] === R.start;
  if (k >= N && path.length > 1) {
    ctx.beginPath(); path.forEach((n, q) => { const x = (NX[n] - cx) * s + hw, y = (NY[n] - cy) * s + hh; if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = reached ? '#ffffff' : '#ff9a9a'; ctx.lineWidth = 3.2; ctx.stroke();
  }
  const mark = (n, label, color) => {
    const x = (NX[n] - cx) * s + hw, y = (NY[n] - cy) * s + hh;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    pill(ctx, label, x + 12, y, { align: 'left', bg: 'rgba(12,17,23,.92)', border: 'rgba(255,255,255,.25)', font: '700 12px Inter, sans-serif' });
  };
  mark(R.start, 'Start: Camp de Mailly', '#5b9cff');
  mark(R.goal, k >= N ? (reached ? `Goal: ${v.out.result ? v.out.result.minutes : ''} min` : 'Goal: prev does not lead back to the start') : 'Goal: south bank at Arcis', '#4ade80');
}

/* ---------- unit */
function drawUnit(ctx, v) {
  const R = LAB.route_b1_x5; const r = v.out.ok ? v.out.result : null; const tt = v.knob.t - v.knob.delay;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); R.line.forEach(([lat, lon], k) => { const [x, y] = MV.P(lat, lon); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.strokeStyle = 'rgba(91,156,255,.35)'; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); let started = false;
  for (const [lat, lon, m] of R.line) { if (m > tt) break; const [x, y] = MV.P(lat, lon); if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; } }
  if (r && started) ctx.lineTo(...MV.P(r.lat, r.lon));
  ctx.strokeStyle = '#5b9cff'; ctx.lineWidth = 5; ctx.stroke();
  const crumbs = (v.out.vis && v.out.vis.crumbs) || [];
  crumbs.forEach(([lat, lon, t]) => {
    const [x, y] = MV.P(lat, lon);
    ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#0c1116'; ctx.stroke();
    if (t % 15 === 0 && t > 0) textHalo(ctx, `H+${t}`, x - 8, y + 4, { font: '600 11.5px Inter, sans-serif', align: 'right', color: '#cfe0ff' });
  });
  const [sx, sy] = MV.P(R.line[0][0], R.line[0][1]);
  pill(ctx, 'Depart H+' + (R.depart + v.knob.delay), sx + 12, sy + 16, { align: 'left', font: '700 11.5px Inter, sans-serif', border: 'rgba(255,255,255,.2)' });
  if (r) {
    const [x, y] = MV.P(r.lat, r.lon);
    ctx.shadowColor = 'rgba(91,156,255,.8)'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#5b9cff'; ctx.fillRect(x - 8, y - 8, 16, 16); ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.strokeRect(x - 8, y - 8, 16, 16);
    pill(ctx, `B-1 at H+${v.knob.t}: ${r.km_driven} km`, x + 15, y - 14, { align: 'left', bg: 'rgba(16,30,58,.94)', border: 'rgba(91,156,255,.7)', font: '700 12.5px Inter, sans-serif', h: 22 });
  }
}

/* ---------- fusion */
function drawFusion(ctx, v) {
  const st = S.ex[S.cur];
  LAB.reports.filter((r) => r.received_min <= 300).forEach((r) => {
    const [x, y] = MV.P(r.pos[0], r.pos[1]);
    const fake = st.revealFalse && r.truth == null;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 9); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - 11, 4.2, 0, 7); ctx.fillStyle = fake ? '#c084fc' : '#facc15'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = '#1a1405'; ctx.stroke();
  });
  const r = v.out.ok ? v.out.result : null; if (!r || !r.tracks) return;
  const tent = r.tracks.filter((t) => !t.confirmed);
  tent.forEach((t) => {
    const [x, y] = MV.P(t.pos[0], t.pos[1]);
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.strokeStyle = 'rgba(165,180,200,.85)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    textHalo(ctx, t.id, x + 13, y - 8, { font: '600 11px Inter, sans-serif', color: '#b8c4d2' });
  });
}
/* Drawn above the place and crossing labels so the answer key and the tracks are never hidden. */
function drawFusionOver(ctx, v) {
  Object.entries(LAB.red_truth).forEach(([id, tr]) => {
    const p = nearestT(tr, 300); const [x, y] = MV.P(p[1], p[2]);
    ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 9); ctx.lineTo(x - 9, y); ctx.closePath();
    ctx.fillStyle = '#ff5f5f'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; ctx.stroke();
    pill(ctx, id, x - 13, y + 1, { align: 'right', bg: 'rgba(60,12,14,.92)', border: 'rgba(255,95,95,.7)', fg: '#ffd0d0', font: '800 11px Inter, sans-serif', h: 18 });
  });
  const r = v.out.ok ? v.out.result : null; if (!r || !r.tracks) return;
  r.tracks.filter((t) => t.confirmed).forEach((t) => {
    const [x, y] = MV.P(t.pos[0], t.pos[1]);
    ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fillStyle = '#67e8f9'; ctx.fill();
    pill(ctx, `${t.id}: ${t.n} reports`, x + 18, y - 16, { align: 'left', bg: 'rgba(8,30,38,.92)', border: 'rgba(103,232,249,.6)', fg: '#dffbff', font: '700 11.5px Inter, sans-serif' });
  });
}

/* ---------- assign */
function heatColor(m) {
  const t = clamp((m - 20) / 100, 0, 1);
  const stops = [[0, [74, 156, 108]], [0.35, [168, 170, 84]], [0.6, [214, 150, 70]], [1, [205, 84, 64]]];
  let a = stops[0], b = stops[stops.length - 1];
  for (let j = 0; j < stops.length - 1; j++) if (t >= stops[j][0] && t <= stops[j + 1][0]) { a = stops[j]; b = stops[j + 1]; break; }
  const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return `rgb(${a[1].map((v, q) => Math.round(v + (b[1][q] - v) * f)).join(',')})`;
}
function drawAssign(ctx, v) {
  const st = S.ex[S.cur]; const mode = st.assignMode === 'full' ? 'full' : 'first';
  const prob = mode === 'full' ? LAB.solver_full : LAB.solver_first;
  const plan = v.out.ok && v.out.vis ? v.out.vis[mode] : null;
  const starts = {}; const labels = [];
  prob.units.forEach((u) => { const p = UNIT_START[u] || 'camp_mailly'; (starts[p] = starts[p] || []).push(u); });
  if (plan && plan[1]) {
    const entries = Object.entries(plan[1]);
    const bySrc = {};
    entries.forEach(([u, t]) => { const p = UNIT_START[u] || 'camp_mailly'; (bySrc[p] = bySrc[p] || []).push([u, t]); });
    Object.entries(bySrc).forEach(([p, list]) => {
      list.forEach(([u, t], idx) => {
        const tg = taskTarget(t); if (!tg) return;
        const [x0, y0] = MV.P(...LAB.places[p]); const [x1, y1] = MV.P(...tg);
        const dx = x1 - x0, dy = y1 - y0; const L = Math.hypot(dx, dy) || 1;
        const bend = (idx - (list.length - 1) / 2) * 0.22 + 0.08;
        const qx = (x0 + x1) / 2 - dy / L * L * bend, qy = (y0 + y1) / 2 + dx / L * L * bend;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(qx, qy, x1, y1);
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = '#7fb2ff'; ctx.lineWidth = 3; ctx.stroke();
        const ang = Math.atan2(y1 - qy, x1 - qx);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 12 * Math.cos(ang - 0.4), y1 - 12 * Math.sin(ang - 0.4)); ctx.lineTo(x1 - 12 * Math.cos(ang + 0.4), y1 - 12 * Math.sin(ang + 0.4)); ctx.closePath();
        ctx.fillStyle = '#7fb2ff'; ctx.fill();
        const tx = 0.25 * x0 + 0.5 * qx + 0.25 * x1, ty = 0.25 * y0 + 0.5 * qy + 0.25 * y1;
        const cell = prob.cells[`${u}|${t}`];
        labels.push([`${u} to ${t}${cell ? `, ${cell.min} min` : ''}`, tx, ty]);
      });
    });
  }
  labels.forEach(([text, tx, ty]) => pill(ctx, text, tx, ty, { bg: 'rgba(16,30,58,.94)', border: 'rgba(91,156,255,.65)', fg: '#e6f0ff', font: '700 12px Inter, sans-serif', h: 22 }));
  Object.entries(starts).forEach(([p, units]) => {
    const [x, y] = MV.P(...LAB.places[p]);
    ctx.fillStyle = '#5b9cff'; ctx.fillRect(x - 7, y - 7, 14, 14); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.strokeRect(x - 7, y - 7, 14, 14);
    pill(ctx, units.join(', '), x - 12, y - 16, { align: 'right', font: '700 12px Inter, sans-serif', border: 'rgba(255,255,255,.2)' });
  });
}
function renderHeats() {
  const ex = EXS[S.cur]; const host = $('#heats'); if (!host) return;
  if (ex.visual !== 'assign') { host.innerHTML = ''; return; }
  const st = S.ex[S.cur]; const v = st.vis;
  const table = (prob, key, title) => {
    const plan = v && v.out.ok && v.out.vis ? v.out.vis[key] : null;
    const mine = plan && plan[1] ? plan[1] : {};
    const sol = prob.answer.assignment;
    const rows = prob.units.map((u) => `<tr><th class="u">${esc(u)}<span>${esc(UNIT_NAMES[u] || '')}</span></th>${prob.tasks.map((t) => {
      const c = prob.cells[`${u}|${t}`]; const pick = mine[u] === t; const sp = sol[u] === t;
      if (!c.eligible) return `<td class="no ${pick ? 'pick' : ''}" title="${esc(c.reason || 'forbidden')}"><b>${c.min}</b>${pick ? '<span class="tag">YOU</span>' : ''}</td>`;
      return `<td class="${pick ? 'pick' : ''}" style="background:${heatColor(c.min)}"><b>${c.min}</b>${pick ? '<span class="tag">YOU</span>' : ''}${sp ? '<span class="stag">CP-SAT</span>' : ''}</td>`;
    }).join('')}</tr>`).join('');
    let foot = 'Run your code to fill in your choice.';
    if (plan) {
      const match = plan[0][0] === prob.answer.last && plan[0][1] === prob.answer.total;
      foot = `Your plan: latest ready <b>H+${plan[0][0]}</b>, total <b>${plan[0][1]}</b>. CP-SAT: H+${prob.answer.last}, ${prob.answer.total}, proved ${esc(prob.answer.status)} in ${prob.answer.wall_ms} ms. <span class="okchip ${match ? 'pass' : 'fail'}">${match ? 'SAME SCORE' : 'DIFFERENT'}</span>`;
    } else if (v && v.out.ok) foot = 'Your function returned None for this problem.';
    return `<div class="heatcard ${st.assignMode === key ? 'on' : ''}"><div class="hh"><h4>${title}</h4><span>minutes to be ready, rows = units, columns = tasks</span></div>
      <table class="heat"><thead><tr><th></th>${prob.tasks.map((t) => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      <div class="hfoot">${foot}</div></div>`;
  };
  host.innerHTML = `<div class="heats">${table(LAB.solver_first, 'first', 'First plan: 4 units, 4 tasks')}${table(LAB.solver_full, 'full', 'Full mission: 5 units, 5 tasks (with X6)')}</div>
    <p class="kmeta" style="margin-top:10px">White outline = what your best_assignment() chose. Blue tag = what CP-SAT chose. Hatched = forbidden by a rule (the score ignores the screen task's time for "latest ready"). Several plans can tie on score.</p>`;
}

/* ---------- race */
function drawRace(ctx, v) {
  const r = v.out.ok ? v.out.result : null;
  const W = MV.w, H = MV.h;
  const padL = 78, padB = 64, padT = 40, padR = 220;
  const side = Math.min(W - padL - padR, H - padT - padB);
  const ox = padL + Math.max(0, (W - padL - padR - side) / 2), oy = padT + side;
  const pts = r && r.points ? r.points : [];
  let lo = 40, hi = 160;
  if (pts.length) { lo = Math.min(...pts.map((p) => Math.min(p[0], p[1]))); hi = Math.max(...pts.map((p) => Math.max(p[0], p[1]))); }
  lo = Math.floor((lo - 5) / 10) * 10; hi = Math.ceil((hi + 5) / 10) * 10;
  const X = (m) => ox + (m - lo) / (hi - lo) * side; const Y = (m) => oy - (m - lo) / (hi - lo) * side;
  // regions
  ctx.beginPath(); ctx.moveTo(X(lo), Y(lo)); ctx.lineTo(X(lo), Y(hi)); ctx.lineTo(X(hi), Y(hi)); ctx.closePath(); ctx.fillStyle = 'rgba(91,156,255,.07)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(X(lo), Y(lo)); ctx.lineTo(X(hi), Y(lo)); ctx.lineTo(X(hi), Y(hi)); ctx.closePath(); ctx.fillStyle = 'rgba(255,95,95,.06)'; ctx.fill();
  // grid + axes
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.font = '500 12px Inter, sans-serif'; ctx.fillStyle = '#8d9bab';
  for (let m = lo; m <= hi; m += 10) {
    ctx.beginPath(); ctx.moveTo(X(m), Y(lo)); ctx.lineTo(X(m), Y(hi)); ctx.moveTo(X(lo), Y(m)); ctx.lineTo(X(hi), Y(m)); ctx.stroke();
    if ((m - lo) % 20 === 0) { ctx.textAlign = 'center'; ctx.fillText(m, X(m), oy + 18); ctx.textAlign = 'right'; ctx.fillText(m, ox - 8, Y(m) + 4); }
  }
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.strokeRect(ox, oy - side, side, side);
  ctx.setLineDash([6, 5]); ctx.strokeStyle = '#8d9bab'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(lo), Y(lo)); ctx.lineTo(X(hi), Y(hi)); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = 'center'; ctx.fillStyle = '#c9d3de'; ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText('Blue arrives at X5 (minutes after H-hour)', ox + side / 2, oy + 44);
  ctx.save(); ctx.translate(ox - 52, oy - side / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Red arrives at X5 (minutes after H-hour)', 0, 0); ctx.restore();
  textHalo(ctx, 'Blue first: digs in and defends', X(lo) + 14, Y(hi) + 24, { font: '700 13px Inter, sans-serif', color: '#9cc3ff' });
  textHalo(ctx, 'Red first: Blue must attack', X(hi) - 14, Y(lo) - 14, { font: '700 13px Inter, sans-serif', color: '#ff9a9a', align: 'right' });
  // jitter so equal minutes do not stack exactly
  pts.forEach(([b, rd, ok], k) => {
    const jx = ((k * 9301 + 49297) % 233280) / 233280 - 0.5, jy = ((k * 4271 + 1237) % 233280) / 233280 - 0.5;
    ctx.beginPath(); ctx.arc(X(b + jx * 0.8), Y(rd + jy * 0.8), 4, 0, 7);
    ctx.fillStyle = ok ? 'rgba(74,222,128,.82)' : 'rgba(255,95,95,.88)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
  });
  // big number
  if (r) {
    const x = W - 28; const y = 80;
    ctx.textAlign = 'right'; ctx.font = '800 64px Inter, sans-serif';
    ctx.fillStyle = r.holds_pct >= 75 ? '#4ade80' : r.holds_pct >= 55 ? '#facc15' : '#ff5f5f';
    ctx.fillText(`${r.holds_pct} %`, x, y + 40);
    ctx.font = '600 13px Inter, sans-serif'; ctx.fillStyle = '#c9d3de';
    ctx.fillText(`of 1,000 seeded runs hold X5`, x, y + 66);
    ctx.fillStyle = '#8d9bab'; ctx.fillText(`${v.knob.unit} blocking, ${pts.length} runs plotted`, x, y + 86);
    ctx.fillText(`head start ${v.knob.head} min, mean delay ${v.knob.mean_delay} min`, x, y + 104);
  }
}

function drawBench() {
  if (!MV) return;
  const ex = EXS[S.cur]; const st = S.ex[S.cur]; const ctx = MV.ctx;
  ctx.setTransform(MV.dpr, 0, 0, MV.dpr, 0, 0); ctx.clearRect(0, 0, MV.w, MV.h);
  const v = st.vis;
  if (ex.visual === 'race') { if (v) drawRace(ctx, v); return; }
  MV.drawBase(ctx);
  if (v && v.out.ok !== undefined) {
    if (ex.visual === 'ripple' && v.out.ok) drawRipple(ctx, v);
    if (ex.visual === 'unit') drawUnit(ctx, v);
    if (ex.visual === 'fusion') drawFusion(ctx, v);
  }
  MV.drawPlaces(ctx, { skip: ex.visual === 'ripple' ? ['camp_mailly'] : [] });
  if (v && ex.visual === 'assign') drawAssign(ctx, v);
  if (v && ex.visual === 'fusion') drawFusionOver(ctx, v);
}

/* ---------- knobs panel */
function fmtVal(v) {
  if (v === true) return 'yes'; if (v === false) return 'no'; if (v == null) return 'none';
  if (typeof v === 'number') return Number.isInteger(v) ? fmtInt(v) : String(v);
  if (typeof v === 'object') {
    const ks = Object.keys(v).sort();
    if (!ks.length) return 'none';
    return ks.map((k) => `${k} ${fmtVal(v[k])}`).join(', ');
  }
  return String(v);
}
function knobDisplay(kb, val) {
  if (kb.type === 'toggle') return val ? 'on' : 'off';
  if (kb.type === 'choice') return val;
  return String(val);
}
function renderKnobs() {
  const i = S.cur; const ex = EXS[i]; const st = S.ex[i]; const host = $('#knobs'); if (!host) return;
  const key = HEADLINE[ex.id]; const klabel = (KEY_LABEL[key] || key).toLowerCase();
  const needPred = !st.knobPred;
  let html = `<div class="sec-h"><span class="num">5</span><h3>Turn the knobs</h3><span class="right"><span class="seg" role="group" aria-label="Which code draws the map">
      <button data-src="mine" class="${st.vis && st.vis.src === 'mine' ? 'on' : ''}">My code</button><button data-src="ref" class="${st.vis && st.vis.src === 'ref' ? 'on' : ''}">Reference</button></span></span></div>`;
  if (!st.goodCode) html += `<div class="refnote">${ICON.info}<span><b>Using the reference solution until your tests pass.</b> The knobs run the reference. After each test run the map shows your own code once; "My code" redraws it with what is in your editor now.</span></div>`;
  else if (st.goodCode !== st.code) html += `<div class="refnote" style="color:var(--soft);border-color:var(--line2);background:var(--panel2)">${ICON.info}<span>The knobs run the last version of your code that passed. Run the tests again to use your latest edits.</span></div>`;
  if (needPred) {
    html += `<div class="minipred"><div class="mh">Before you touch anything</div><div class="mq">What do you expect to happen to <em>${esc(klabel)}</em> if you move these knobs? Pick the first knob you will move and commit.</div>
      <div class="mb"><button data-kp="up">Goes up</button><button data-kp="same">Stays the same</button><button data-kp="down">Goes down</button></div>
      <textarea id="kptext" placeholder="Or in your own words (optional): which knob, and why?"></textarea></div>`;
  } else if (st.knobFirst && st.knobPred) {
    const { before, after } = st.knobFirst;
    const dir = typeof before === 'number' && typeof after === 'number' ? (after > before ? 'up' : after < before ? 'down' : 'same') : null;
    const right = dir && dir === st.knobPred.dir;
    html += `<div class="minipred done"><div class="mh">Your call vs what happened</div><div class="mres">You said <b>${{ up: 'goes up', down: 'goes down', same: 'stays the same' }[st.knobPred.dir] || 'something'}</b>${st.knobPred.text ? ` ("${esc(st.knobPred.text)}")` : ''}.
      ${dir ? `${esc(KEY_LABEL[key] || key)} went from <b>${fmtVal(before)}</b> to <b>${fmtVal(after)}</b>: <b>${{ up: 'up', down: 'down', same: 'no change' }[dir]}</b>. ${right ? 'You called it.' : 'Not what you expected: worth a second look at why.'}` : 'Move a knob to compare.'}</div></div>`;
  } else if (st.knobPred) {
    html += `<div class="minipred done"><div class="mh">Your call</div><div class="mres">You said <b>${{ up: 'goes up', down: 'goes down', same: 'stays the same' }[st.knobPred.dir]}</b>. Now move a knob.</div></div>`;
  }
  html += `<div class="kgrid" style="${needPred ? 'opacity:.4;pointer-events:none' : ''}">${ex.knobs.map((kb) => {
    const val = st.knob[kb.id]; const changed = val !== kb.default;
    if (kb.type === 'toggle') return `<div class="knob"><button class="switch ${val ? 'on' : ''}" data-knob="${kb.id}" role="switch" aria-checked="${!!val}"><span>${esc(kb.label)}</span><i></i></button></div>`;
    if (kb.type === 'choice') return `<div class="knob"><div class="kl"><span>${esc(kb.label)}</span></div><span class="seg">${kb.options.map((o) => `<button data-knob="${kb.id}" data-val="${esc(o)}" class="${o === val ? 'on' : ''}">${esc(o)}${UNIT_NAMES[o] ? `, ${esc(UNIT_NAMES[o])}` : ''}</button>`).join('')}</span></div>`;
    return `<div class="knob"><div class="kl"><span>${esc(kb.label)}</span><b class="${changed ? 'chg' : ''}" id="kv-${kb.id}">${knobDisplay(kb, val)}</b></div>
      <input type="range" min="${kb.min}" max="${kb.max}" step="${kb.step}" value="${val}" data-knob="${kb.id}" style="--fill:${(100 * (val - kb.min) / (kb.max - kb.min)).toFixed(1)}%" aria-label="${esc(kb.label)}"></div>`;
  }).join('')}</div>`;
  html += `<div id="numbers"></div>`;
  if (st.knobMoved) html += `<div class="watch"><h4>What to watch</h4><p>${esc(ex.watch)}</p></div>`;
  if (ex.visual === 'assign') html += `<div class="knob"><div class="kl"><span>Map shows</span></div><span class="seg"><button data-am="first" class="${st.assignMode === 'first' ? 'on' : ''}">First plan (4)</button><button data-am="full" class="${st.assignMode === 'full' ? 'on' : ''}">Full mission (5)</button></span></div>`;
  if (ex.visual === 'fusion') html += `<div class="knob"><button class="switch ${st.revealFalse ? 'on' : ''}" id="revealfalse" role="switch" aria-checked="${st.revealFalse}"><span>Reveal which reports were false</span><i></i></button></div>`;
  host.innerHTML = html;
  renderNumbers();
  $$('[data-src]', host).forEach((b) => b.addEventListener('click', () => { st.drawWith = b.dataset.src; runBench(b.dataset.src, b.dataset.src === 'mine' ? st.code : null); $$('[data-src]', host).forEach((x) => x.classList.toggle('on', x === b)); }));
  $$('[data-kp]', host).forEach((b) => b.addEventListener('click', () => {
    const t = $('#kptext'); st.knobPred = { dir: b.dataset.kp, text: t ? t.value.trim().slice(0, 300) : '' }; save(i, 'knobPred'); renderKnobs();
  }));
  const onKnob = (id, val) => {
    st.knob[id] = val;
    if (!st.knobMoved && !st.knobFirst) st.pendingCompare = true;
    knobRun();
  };
  $$('input[type=range][data-knob]', host).forEach((r) => r.addEventListener('input', () => {
    const kb = ex.knobs.find((k) => k.id === r.dataset.knob); const val = +r.value;
    r.style.setProperty('--fill', (100 * (val - kb.min) / (kb.max - kb.min)).toFixed(1) + '%');
    const lab = $('#kv-' + kb.id); lab.textContent = knobDisplay(kb, val); lab.classList.toggle('chg', val !== kb.default);
    onKnob(kb.id, val);
  }));
  $$('button.switch[data-knob]', host).forEach((b) => b.addEventListener('click', () => {
    const v2 = !st.knob[b.dataset.knob]; b.classList.toggle('on', v2); b.setAttribute('aria-checked', v2); onKnob(b.dataset.knob, v2);
  }));
  $$('.seg button[data-knob]', host).forEach((b) => b.addEventListener('click', () => {
    $$(`.seg button[data-knob="${b.dataset.knob}"]`, host).forEach((x) => x.classList.toggle('on', x === b)); onKnob(b.dataset.knob, b.dataset.val);
  }));
  $$('[data-am]', host).forEach((b) => b.addEventListener('click', () => { st.assignMode = b.dataset.am; renderKnobs(); renderHeats(); renderVisMeta(); MV.request(); }));
  const rf = $('#revealfalse', host); if (rf) rf.addEventListener('click', () => { st.revealFalse = !st.revealFalse; renderKnobs(); renderLegend(); MV.request(); });
}
const knobRun = debounce(() => { const st = S.ex[S.cur]; runBench(st.goodCode ? st.drawWith : 'ref'); }, 250);
function renderNumbers() {
  const host = $('#numbers'); if (!host) return;
  const st = S.ex[S.cur]; const v = st.vis;
  if (!v) { host.innerHTML = '<p class="kmeta">Numbers appear after the first run.</p>'; return; }
  if (!v.out.ok) { host.innerHTML = `<p class="kmeta" style="color:#ffb0b0">This run raised ${esc(v.out.error ? v.out.error.type : 'an error')}; see the map.</p>`; return; }
  const r = v.out.result || {}; const b = st.baseline || {};
  const prevShown = st.prevNumbers || {};
  const rows = Object.keys(r).filter((k) => !HIDE_KEYS.has(k)).map((k) => {
    const val = r[k]; let d = '';
    if (typeof val === 'number' && typeof b[k] === 'number' && val !== b[k]) {
      const diff = val - b[k]; const dd = Math.abs(diff) >= 100 ? fmtInt(Math.round(diff)) : (+diff.toFixed(2)).toString();
      d = `<span class="d ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${dd}</span>`;
    }
    const changed = JSON.stringify(prevShown[k]) !== JSON.stringify(val);
    return `<tr class="${changed && st.prevNumbers ? 'flash' : ''}"><td>${esc(KEY_LABEL[k] || k)}</td><td class="v">${esc(fmtVal(val))}${d}</td></tr>`;
  }).join('');
  st.prevNumbers = r;
  host.innerHTML = `<table class="ntable"><thead><tr><th>RESULT</th><th style="text-align:right">vs defaults</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="kmeta" style="margin-top:8px">${v.src === 'mine' ? 'Your code' : 'Reference solution'}, ran in ${(v.out.ms / 1000).toFixed(2)} s.</p>`;
}

/* ------------------------------------------------------------------ explain */
function renderExplain() {
  const i = S.cur; const ex = EXS[i]; const st = S.ex[i]; const host = $('#explain');
  const got = st.ticks.filter(Boolean).length; const n = ex.interview.strong.length;
  host.innerHTML = `<div class="iq"><div class="ik">Explain it back</div><blockquote>${esc(ex.interview.q)}</blockquote>
      <textarea id="ans" placeholder="Answer out loud first, then write it here. Three or four sentences: the idea, why it works, what it costs, when it breaks.">${esc(st.explain)}</textarea>
      <div class="irow"><button class="btn primary" id="cmp">${st.strongShown ? 'Strong answer shown' : 'Compare with a strong answer'}</button>
      <button class="btn" id="copyans">${ICON.copy} Copy my answer</button><span class="wc" id="wc">${wordCount(st.explain)} words</span></div></div>
    <div class="strong ${st.strongShown ? '' : 'closed'}" id="strong">${st.strongShown ? `<div class="sk"><span>A strong answer covers</span><span><b>${got}</b> of ${n} covered</span></div>
      <ul class="slist">${ex.interview.strong.map((s, k) => `<li class="${st.ticks[k] ? 'got' : ''}"><label style="animation-delay:${k * 60}ms"><input type="checkbox" data-t="${k}" ${st.ticks[k] ? 'checked' : ''}><span>${esc(s)}</span></label></li>`).join('')}</ul>
      <p class="kmeta" style="margin-top:12px">Tick the points your answer really made. Be strict with yourself.</p>`
      : `<div style="font-size:28px;color:#3a4a5e">?</div><div>Write your answer first.<br>Then reveal what a strong answer covers and tick what you got.</div>`}</div>`;
  const ta = $('#ans');
  const persist = debounce(() => { save(i, 'explain'); renderProgress(); renderNav(); renderStepper(); }, 400);
  ta.addEventListener('input', () => { st.explain = ta.value; $('#wc').textContent = `${wordCount(ta.value)} words`; persist(); });
  $('#cmp').addEventListener('click', () => {
    if (!st.strongShown && wordCount(st.explain) < 5) toast('Write a few sentences first. It counts more that way.');
    st.strongShown = true; save(i, 'strongShown'); renderExplain();
  });
  $('#copyans').addEventListener('click', () => {
    const text = `Q: ${ex.interview.q}\n\nMy answer:\n${ta.value.trim()}`;
    const fallback = () => { ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } toast(ok ? 'Copied. Paste it to your coach.' : 'Selected: press Cmd+C to copy.'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it to your coach.'), fallback);
      else fallback();
    } catch (e) { fallback(); }
  });
  $$('input[data-t]', host).forEach((c) => c.addEventListener('change', () => { st.ticks[+c.dataset.t] = c.checked; save(i, 'ticks'); renderExplain(); }));
}

/* ------------------------------------------------------------------ boot */
function boot() {
  S.ex = EXS.map((_, i) => loadEx(i));
  projectNodes();
  makeEditor();
  Engine.on(renderPy);
  const flush = () => { saveCode.cancel(); S.ex.forEach((st, i) => store.set(`${EXS[i].id}:code`, st.code)); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  $('#pystatus').addEventListener('click', () => { if (Engine.state === 'error') Engine.start(); });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runTests(); }
  });
  const h = parseInt((location.hash || '').replace('#', ''), 10);
  renderProgress();
  go(Number.isFinite(h) && h >= 1 && h <= EXS.length ? h - 1 : 0, false);
  Engine.start();
  // hooks for automated checks
  window.__lab = { S, Engine, EXS, get cm() { return cm; }, go, runTests, runBench, get MV() { return MV; } };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
