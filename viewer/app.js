/* Staff in a box: 3D visual explainer.
   Plain script (no modules) so it runs from file://. Depends on THREE r128, OrbitControls, window.SIB, window.LESSONS. */
(function () {
  'use strict';
  var S = window.SIB, LESSONS = window.LESSONS;
  var B = S.bbox, T = S.terrain;

  // ---------- Coordinates (km). x east, z south (north = -z, away from a camera looking from the south), y up ----------
  var LAT0 = (B.N + B.S) / 2, LON0 = (B.W + B.E) / 2;
  var KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KZ = 111.32;
  var VEX = 12, H0 = 60;
  function toX(lon) { return (lon - LON0) * KX; }
  function toZ(lat) { return (LAT0 - lat) * KZ; }
  function lonOf(x) { return x / KX + LON0; }
  function latOf(z) { return LAT0 - z / KZ; }
  var HMIN = Infinity, HMAX = -Infinity;
  T.h.forEach(function (r) { r.forEach(function (v) { if (v < HMIN) HMIN = v; if (v > HMAX) HMAX = v; }); });
  function hMetres(lat, lon) {
    var c = (lon - B.W) / (B.E - B.W) * (T.nx - 1), r = (B.N - lat) / (B.N - B.S) * (T.ny - 1);
    c = Math.max(0, Math.min(T.nx - 1.0001, c)); r = Math.max(0, Math.min(T.ny - 1.0001, r));
    var c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
    var a = T.h[r0][c0], b = T.h[r0][c0 + 1], d = T.h[r0 + 1][c0], e = T.h[r0 + 1][c0 + 1];
    return (a * (1 - fc) + b * fc) * (1 - fr) + (d * (1 - fc) + e * fc) * fr;
  }
  function yOfM(m) { return (m - H0) / 1000 * VEX; }
  function yAt(x, z) { return yOfM(hMetres(latOf(z), lonOf(x))); }
  function ll(p) { return [toX(p[1]), toZ(p[0])]; } // [lat, lon] -> [x, z]
  function v3(p, lift) { var q = ll(p); return new THREE.Vector3(q[0], yAt(q[0], q[1]) + (lift || 0), q[1]); }

  // ---------- Formatting + placeholders ----------
  function fmtNum(v) {
    if (typeof v !== 'number') return String(v);
    if (Number.isInteger(v) && Math.abs(v) >= 1000) return v.toLocaleString('en-US');
    return String(v);
  }
  function mcRace(plan) {
    var cp = S.montecarlo[plan].checks_pct;
    for (var k in cp) if (k.indexOf('race:') === 0 && /at X5$/.test(k)) return cp[k];
    return null;
  }
  function lookup(key) {
    if (key === 'reports.count') return S.reports.length;
    if (key === 'reports.ghosts') return S.reports.filter(function (r) { return r.truth == null; }).length;
    if (key === 'mc.solver') return mcRace('solver');
    if (key === 'mc.intuitive') return mcRace('intuitive');
    if (key === 'mission.recce_x6') return S.mission_check ? S.mission_check.red_recce_x6_arrive : null;
    var o = S, parts = key.split('.');
    for (var i = 0; i < parts.length; i++) { if (o == null) return null; o = o[parts[i]]; }
    return o;
  }
  function resolve(s) {
    return String(s || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (m, k) {
      var v = lookup(k);
      if (v == null) { console.warn('unresolved placeholder', k); return m; }
      return fmtNum(v);
    });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var TYPE_NAME = { mech_inf: 'mech infantry', armour: 'armour', recon: 'recce', unknown: 'type unknown', engineer: 'engineer', logistics: 'logistics' };

  // ---------- Renderer, scene, camera ----------
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('c');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  var BG = 0x0c1116;
  renderer.setClearColor(BG, 0);
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0e141b, 150, 330);
  var camera = new THREE.PerspectiveCamera(36, 1, 0.3, 900);
  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(86); controls.minDistance = 6; controls.maxDistance = 260;
  controls.screenSpacePanning = false;

  scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x2a2420, 0.62));
  var sun = new THREE.DirectionalLight(0xfff0dc, 0.95);
  sun.position.set(-60, 55, -45); scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));

  var layers = {}; // name -> THREE.Group
  function layer(name) { if (!layers[name]) { var g = new THREE.Group(); g.name = name; layers[name] = g; scene.add(g); } return layers[name]; }

  // ---------- Terrain ----------
  var TSTOPS = [[70, 0x3d5b39], [95, 0x56753f], [120, 0x7d8a4e], [145, 0xa29c62], [170, 0xc2b27c], [200, 0xd6c79c], [230, 0xe5dbbf], [258, 0xf2ecdc]];
  function terrainColor(m, out) {
    var i = 0; while (i < TSTOPS.length - 2 && m > TSTOPS[i + 1][0]) i++;
    var a = TSTOPS[i], b = TSTOPS[i + 1], t = Math.max(0, Math.min(1, (m - a[0]) / (b[0] - a[0])));
    var ca = new THREE.Color(a[1]), cb = new THREE.Color(b[1]);
    return out.copy(ca).lerp(cb, t);
  }
  (function buildTerrain() {
    var nx = T.nx, ny = T.ny, pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), c = new THREE.Color();
    for (var r = 0; r < ny; r++) for (var q = 0; q < nx; q++) {
      var lat = B.N - r / (ny - 1) * (B.N - B.S), lon = B.W + q / (nx - 1) * (B.E - B.W), m = T.h[r][q], k = (r * nx + q) * 3;
      pos[k] = toX(lon); pos[k + 1] = yOfM(m); pos[k + 2] = toZ(lat);
      terrainColor(m, c); col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    var idx = [];
    for (r = 0; r < ny - 1; r++) for (q = 0; q < nx - 1; q++) {
      var a = r * nx + q, b2 = a + 1, d = a + nx, e = d + 1;
      idx.push(a, d, b2, b2, d, e);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    var mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    layer('terrain').add(mesh);
    // skirt: dark walls so the terrain reads as a physical model on a table
    var sp = [], si = [], BOT = -1.6;
    function edge(list) {
      var base = sp.length / 3;
      list.forEach(function (rc) { var k = (rc[0] * nx + rc[1]) * 3; sp.push(pos[k], pos[k + 1], pos[k + 2], pos[k], BOT, pos[k + 2]); });
      for (var i = 0; i < list.length - 1; i++) { var o = base + i * 2; si.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
    }
    var top = [], bot = [], lef = [], rig = [];
    for (q = 0; q < nx; q++) { top.push([0, q]); bot.push([ny - 1, q]); }
    for (r = 0; r < ny; r++) { lef.push([r, 0]); rig.push([r, nx - 1]); }
    [top, bot, lef, rig].forEach(edge);
    var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si);
    layer('terrain').add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x1a2028, side: THREE.DoubleSide })));
    var x0 = toX(B.W), x1 = toX(B.E), z0 = toZ(B.N), z1 = toZ(B.S);
    var base = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 3, z1 - z0 + 3), new THREE.MeshBasicMaterial({ color: 0x070a0e, transparent: true, opacity: 0.6 }));
    base.rotation.x = -Math.PI / 2; base.position.set((x0 + x1) / 2, BOT - 0.05, (z0 + z1) / 2);
    layer('terrain').add(base);
    var grid = new THREE.GridHelper(420, 84, 0x1c2632, 0x141c25); grid.position.y = BOT - 0.1; scene.add(grid);
  })();

  // ---------- Ribbons draped on the terrain ----------
  function densify(pts, step) { // pts [[x,z]] -> {p:[[x,z]], mark:[index in p of original i]}
    var out = [], mark = [];
    for (var i = 0; i < pts.length; i++) {
      mark.push(out.length); out.push(pts[i]);
      if (i < pts.length - 1) {
        var dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], d = Math.sqrt(dx * dx + dz * dz), k = Math.ceil(d / step);
        for (var j = 1; j < k; j++) out.push([pts[i][0] + dx * j / k, pts[i][1] + dz * j / k]);
      }
    }
    return { p: out, mark: mark };
  }
  // Appends a ribbon to buffers. Returns per-original-point index counts (for progressive draw ranges).
  function ribbonInto(buf, pts, width, lift, step) {
    var dd = densify(pts, step || 0.25), p = dd.p, n = p.length, half = width / 2, tx = 1, tz = 0, marksIdx = [];
    var base = buf.pos.length / 3, idxAt = [];
    for (var i = 0; i < n; i++) {
      var a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz);
      if (L > 1e-6) { tx = dx / L; tz = dz / L; }
      var nx = -tz, nz = tx;
      var lx = p[i][0] + nx * half, lz = p[i][1] + nz * half, rx = p[i][0] - nx * half, rz = p[i][1] - nz * half;
      var yy = Math.max(yAt(p[i][0], p[i][1]), yAt(p[i][0] + nx * 0.3, p[i][1] + nz * 0.3), yAt(p[i][0] - nx * 0.3, p[i][1] - nz * 0.3)) + lift;
      buf.pos.push(lx, yy, lz, rx, yy, rz);
      if (i > 0) { var o = base + (i - 1) * 2; buf.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      idxAt.push(buf.idx.length);
    }
    for (i = 0; i < dd.mark.length; i++) marksIdx.push(idxAt[dd.mark[i]]);
    return marksIdx;
  }
  function newBuf() { return { pos: [], idx: [] }; }
  function bufGeom(buf) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setIndex(buf.idx); return g;
  }
  function flatMat(color, opacity, offset) {
    return new THREE.MeshBasicMaterial({ color: color, transparent: opacity < 1, opacity: opacity, depthWrite: opacity >= 1,
      polygonOffset: true, polygonOffsetFactor: -(offset || 1), polygonOffsetUnits: -(offset || 1) * 4, side: THREE.DoubleSide, fog: true });
  }

  // ---------- Rivers + roads ----------
  function clipParts(pl) { // split a [lat,lon] polyline into the parts inside the bbox
    var parts = [], curp = [], m = 0.002;
    pl.forEach(function (q) {
      var inside = q[0] > B.S + m && q[0] < B.N - m && q[1] > B.W + m && q[1] < B.E - m;
      if (inside) curp.push(q); else { if (curp.length > 1) parts.push(curp); curp = []; }
    });
    if (curp.length > 1) parts.push(curp);
    return parts;
  }
  (function buildNetwork() {
    var rMain = newBuf(), rMinor = newBuf();
    S.rivers.forEach(function (r) { clipParts(r.p).forEach(function (part) { ribbonInto(r.k === 2 ? rMain : rMinor, part.map(ll), r.k === 2 ? 0.24 : 0.09, 0.03); }); });
    layer('rivers').add(new THREE.Mesh(bufGeom(rMain), flatMat(0x3b8fd9, 1, 1)));
    layer('rivers').add(new THREE.Mesh(bufGeom(rMinor), flatMat(0x5aa7e3, 0.85, 1)));
    var W = { 4: 0.26, 3: 0.17, 2: 0.11 }, C = { 4: 0xfff3d6, 3: 0xf6e4bd, 2: 0xe3cfa2 };
    var casing = newBuf(), fill = { 2: newBuf(), 3: newBuf(), 4: newBuf() }, minor = [];
    S.roads.forEach(function (r) { clipParts(r.p).forEach(function (part) {
      var pts = part.map(ll);
      if (r.k >= 2) { ribbonInto(casing, pts, W[r.k] + 0.09, 0.045); ribbonInto(fill[r.k], pts, W[r.k], 0.05); }
      else {
        var d = densify(pts, 0.4).p;
        for (var i = 0; i < d.length - 1; i++) minor.push(d[i][0], yAt(d[i][0], d[i][1]) + 0.05, d[i][1], d[i + 1][0], yAt(d[i + 1][0], d[i + 1][1]) + 0.05, d[i + 1][1]);
      }
    }); });
    var mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(minor, 3));
    layer('roads').add(new THREE.LineSegments(mg, new THREE.LineBasicMaterial({ color: 0x2b2a26, transparent: true, opacity: 0.42 })));
    layer('roads').add(new THREE.Mesh(bufGeom(casing), flatMat(0x1d1f24, 0.85, 2)));
    [2, 3, 4].forEach(function (k) { layer('roads').add(new THREE.Mesh(bufGeom(fill[k]), flatMat(C[k], 1, 3 + k))); });
  })();

  // ---------- Labels (HTML overlay, projected each frame, decluttered by priority) ----------
  var labelsDiv = document.getElementById('labels');
  var labels = [];
  function addLabel(cls, html, layerName, prio, anchor) {
    var el = document.createElement('div'); el.className = 'lbl off ' + cls; el.innerHTML = html; labelsDiv.appendChild(el);
    var lb = { el: el, html: html, layer: layerName, prio: prio || 0, anchor: anchor || 'b', dx: 0, dy: 0, pos: new THREE.Vector3(), active: true, w: 0, h: 0, dirty: true, shown: false };
    labels.push(lb); return lb;
  }
  function setLabel(lb, html, cls) {
    if (html !== lb.html) { lb.el.innerHTML = html; lb.html = html; lb.dirty = true; }
    if (cls != null && cls !== lb.cls) { lb.el.className = 'lbl ' + cls + (lb.shown ? '' : ' off'); lb.cls = cls; lb.dirty = true; }
  }
  var tmpV = new THREE.Vector3();
  function updateLabels() {
    var w = canvas.clientWidth, h = canvas.clientHeight, cand = [];
    for (var i = 0; i < labels.length; i++) {
      var lb = labels[i], vis = lb.active && layerOn(lb.layer);
      if (vis) {
        tmpV.copy(lb.pos).project(camera);
        if (tmpV.z > 1 || tmpV.z < -1 || Math.abs(tmpV.x) > 1.02 || Math.abs(tmpV.y) > 1.02) vis = false;
      }
      if (!vis) { if (lb.shown) { lb.el.classList.add('off'); lb.shown = false; } continue; }
      if (lb.dirty) { lb.w = lb.el.offsetWidth; lb.h = lb.el.offsetHeight; lb.dirty = false; }
      var sx = (tmpV.x + 1) / 2 * w + lb.dx, sy = (1 - tmpV.y) / 2 * h + lb.dy, x0, y0;
      if (lb.anchor === 'b') { x0 = sx - lb.w / 2; y0 = sy - lb.h - 6; }
      else if (lb.anchor === 't') { x0 = sx - lb.w / 2; y0 = sy + 6; }
      else if (lb.anchor === 'r') { x0 = sx - 4; y0 = sy - lb.h / 2; }
      else if (lb.anchor === 'l') { x0 = sx - lb.w + 4; y0 = sy - lb.h / 2; }
      else { x0 = sx - lb.w / 2; y0 = sy - lb.h / 2; }
      cand.push({ lb: lb, x: x0, y: y0, d: tmpV.z });
    }
    cand.sort(function (a, b) { return b.lb.prio - a.lb.prio || a.d - b.d; });
    var placed = [], sr = stage.getBoundingClientRect();
    ['hud', 'legend', 'timebar', 'brand', 'compass'].forEach(function (id) {
      var e = document.getElementById(id); if (!e || e.classList.contains('hidden') || !e.offsetWidth) return;
      Array.prototype.forEach.call(id === 'hud' ? e.children : [e], function (c) {
        var r = c.getBoundingClientRect(); placed.push({ x: r.left - sr.left - 4, y: r.top - sr.top - 4, w: r.width + 8, h: r.height + 8 });
      });
    });
    for (i = 0; i < cand.length; i++) {
      var c = cand[i], L = c.lb, ok = true;
      for (var j = 0; j < placed.length; j++) {
        var p = placed[j];
        if (c.x < p.x + p.w + 3 && c.x + L.w + 3 > p.x && c.y < p.y + p.h + 2 && c.y + L.h + 2 > p.y) { ok = false; break; }
      }
      if (!ok) { if (L.shown) { L.el.classList.add('off'); L.shown = false; } continue; }
      placed.push({ x: c.x, y: c.y, w: L.w, h: L.h });
      L.el.style.transform = 'translate(' + Math.round(c.x) + 'px,' + Math.round(c.y) + 'px)';
      L.el.style.zIndex = String(10 + L.prio);
      if (!L.shown) { L.el.classList.remove('off'); L.shown = true; }
    }
  }

  // ---------- Places ----------
  var placeLabels = {};
  Object.keys(S.places).forEach(function (k) {
    var pl = S.places[k], major = ['camp_mailly', 'arcis', 'brienne', 'vitry'].indexOf(k) >= 0;
    var name = k === 'vitry_west' ? 'Observation post (west of Vitry)' : pl.name;
    var lb = addLabel('place' + (major ? ' major' : '') + (k === 'arcis' || k === 'brienne' ? ' rt' : ''), esc(name), 'places', major ? 30 : 20, 'r');
    lb.pos.copy(v3(pl.pos, 0.15)); placeLabels[k] = lb;
  });
  placeLabels.arcis.anchor = 'l'; // crossings X1/X2 sit right on Arcis: put the town name on the left
  placeLabels.arcis.dx = -14;
  placeLabels.brienne.anchor = 'l'; placeLabels.brienne.dx = -12;

  // ---------- Crossings ----------
  var crossObjs = {};
  (function () {
    var mat = new THREE.MeshLambertMaterial({ color: 0xf07a22, emissive: 0x8a3300 });
    var stickMat = new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.8 });
    Object.keys(S.crossings).forEach(function (id) {
      var c = S.crossings[id], g = new THREE.Group(), p = v3(c.pos, 0);
      var cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 16), mat); cone.rotation.x = Math.PI; cone.position.y = 1.0;
      var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), stickMat); stick.position.y = 0.3;
      g.add(cone, stick); g.position.copy(p); layer('crossings').add(g);
      var lb = addLabel('cross', id, 'crossings', 55, 'b'); lb.pos.copy(p).add(new THREE.Vector3(0, 1.55, 0));
      if (id === 'X2') { lb.anchor = 'l'; lb.dx = -10; lb.dy = -26; }
      if (id === 'X1') { lb.anchor = 'r'; lb.dx = 10; lb.dy = -26; }
      if (id === 'X6') { lb.anchor = 'r'; lb.dx = 12; lb.dy = -22; }
      crossObjs[id] = { group: g, label: lb };
    });
  })();
  // cut bridges (ripple-blown)
  var cutGroup = layer('cuts'), cutLabels = [];
  ['X1', 'X2'].forEach(function (id) {
    var p = v3(S.crossings[id].pos, 0.5), mat = new THREE.MeshLambertMaterial({ color: 0xff3030, emissive: 0x800000 });
    var g = new THREE.Group();
    [1, -1].forEach(function (s) { var bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.32, 0.32), mat); bar.rotation.y = s * Math.PI / 4; g.add(bar); });
    g.position.copy(p); cutGroup.add(g);
    var lb = addLabel('cut', id + ' blown', 'cuts', 70, id === 'X1' ? 'r' : 'l'); lb.pos.copy(p).add(new THREE.Vector3(0, 0.6, 0));
    lb.dx = id === 'X1' ? 14 : -14; lb.dy = -16; cutLabels.push(lb);
  });

  // ---------- Dijkstra ripple ----------
  var RAMP = [0x5b2ccf, 0x9c179e, 0xcc4778, 0xed7953, 0xfdb42f, 0xf0f921].map(function (h) { return new THREE.Color(h); });
  function ramp(t, out) {
    t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1); var i = Math.min(RAMP.length - 2, Math.floor(t));
    return out.copy(RAMP[i]).lerp(RAMP[i + 1], t - i);
  }
  function rampCss(t) { return '#' + ramp(t, new THREE.Color()).getHexString(); }
  var dotTex = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d');
    x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fillStyle = '#000'; x.fill();
    x.beginPath(); x.arc(32, 32, 24, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
    var t = new THREE.CanvasTexture(c); return t;
  })();
  var glowTex = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  var ripple = {};
  ['normal', 'blown'].forEach(function (kind) {
    var d = S.dijkstra[kind], n = d.points.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color(), maxM = 0, mins = [];
    d.points.forEach(function (p) { if (p[2] > maxM) maxM = p[2]; });
    d.points.forEach(function (p, i) {
      var q = ll(p); pos[i * 3] = q[0]; pos[i * 3 + 1] = yAt(q[0], q[1]) + 0.14; pos[i * 3 + 2] = q[1];
      ramp(p[2] / maxM, c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; mins.push(p[2]);
    });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 10, sizeAttenuation: false, map: dotTex, vertexColors: true, alphaTest: 0.5, transparent: false }));
    var gf = new THREE.BufferGeometry(); gf.setAttribute('position', g.getAttribute('position'));
    var front = new THREE.Points(gf, new THREE.PointsMaterial({ size: 16, sizeAttenuation: false, map: glowTex, color: 0xfff6d8, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    var grp = layer('ripple-' + kind); grp.add(pts, front);
    // final path: dark casing + bright core, progressive draw range
    var pb = newBuf(), cb = newBuf(), path = d.path.map(ll);
    var marks = ribbonInto(pb, path, 0.42, 0.26, 0.2); ribbonInto(cb, path, 0.72, 0.22, 0.2);
    var core = new THREE.Mesh(bufGeom(pb), flatMat(0xffffff, 1, 14)), cas = new THREE.Mesh(bufGeom(cb), flatMat(0x111318, 1, 7));
    grp.add(cas, core);
    var end = d.path[d.path.length - 1];
    var flag = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 }));
    flag.position.copy(v3(end, 0.45)); grp.add(flag);
    var start = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshLambertMaterial({ color: 0x5b2ccf, emissive: 0x2a1060 }));
    start.position.copy(v3(d.path[0], 0.45)); grp.add(start);
    var lbDone = addLabel('chip', '', 'ripple-' + kind, 90, 'l'); lbDone.pos.copy(v3(end, 0.6)); lbDone.dx = -16;
    var lbDest = addLabel('place major', 'Destination, south bank', 'ripple-' + kind, 40, 'l'); lbDest.pos.copy(v3(end, 0.6)); lbDest.dx = -16;
    ripple[kind] = { d: d, n: n, mins: mins, maxM: maxM, pts: pts, front: front, core: core, cas: cas, marks: marks, total: pb.idx.length, lbDone: lbDone, lbDest: lbDest };
  });
  // the normal route, shown faint during the blown lesson for comparison
  (function () {
    var b = newBuf(); ribbonInto(b, S.dijkstra.normal.path.map(ll), 0.3, 0.17, 0.2);
    var m = new THREE.Mesh(bufGeom(b), flatMat(0xffffff, 0.35, 6)); layer('ripple-blown').add(m);
  })();
  function countAtMinute(r, m) { var lo = 0, hi = r.n; while (lo < hi) { var mid = (lo + hi) >> 1; if (r.mins[mid] <= m) lo = mid + 1; else hi = mid; } return lo; }

  // ---------- Units + truth routes ----------
  var unitIds = Object.keys(S.truth);
  var unitObjs = {};
  unitIds.forEach(function (id) {
    var u = S.units[id], blue = u.side === 'blue', mesh;
    if (blue) mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.6), new THREE.MeshLambertMaterial({ color: 0x3f7ff0, emissive: 0x0b2a66 }));
    else mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshLambertMaterial({ color: 0xf04848, emissive: 0x5a0a0a }));
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    mesh.add(edges); layer('units').add(mesh);
    var lb = addLabel('unit', '', 'units', 80, 'b');
    // route ribbons: full (faint) + travelled (bright, progressive)
    var pts = S.truth[id].track.map(function (t) { return ll([t[1], t[2]]); });
    var bf = newBuf(), bt = newBuf(); ribbonInto(bf, pts, 0.22, 0.09, 0.25); var marks = ribbonInto(bt, pts, 0.3, 0.1, 0.25);
    var colr = blue ? 0x6aa8ff : 0xff6b6b;
    var full = new THREE.Mesh(bufGeom(bf), flatMat(colr, 0.35, 5)), trav = new THREE.Mesh(bufGeom(bt), flatMat(colr, 0.95, 6));
    layer('routes').add(full, trav);
    unitObjs[id] = { mesh: mesh, label: lb, blue: blue, trav: trav, marks: marks };
  });
  // the race at X5 (Monte Carlo lesson): the two routes that converge on the Brienne bridge
  (function () {
    var key = Object.keys(S.validate.reduce(function (o, c) { if (/^race:.*at X5$/.test(c.check)) o[c.check] = 1; return o; }, {}))[0] || 'race: B-1 vs R-1 at X5';
    var m = key.match(/race:\s*(\S+) vs (\S+)/), ids = m ? [m[1], m[2]] : ['B-1', 'R-1'];
    ids.forEach(function (id) {
      if (!S.truth[id]) return;
      var blue = S.units[id].side === 'blue', b = newBuf(), c = newBuf(), pts = S.truth[id].track.map(function (t) { return ll([t[1], t[2]]); });
      ribbonInto(c, pts, 0.62, 0.11, 0.25); ribbonInto(b, pts, 0.38, 0.13, 0.25);
      layer('race-routes').add(new THREE.Mesh(bufGeom(c), flatMat(0x111318, 1, 5)), new THREE.Mesh(bufGeom(b), flatMat(blue ? 0x6aa8ff : 0xff6b6b, 1, 12)));
      var tr = S.truth[id], mid = tr.track[Math.floor(Math.min(tr.arrive, 360) / 2 * 0.72)], lb = addLabel('unit', '<span class="' + (blue ? 'bl' : 'rd') + '">' + id + '</span> arrives H+' + tr.arrive + ' in the plan', 'race-routes', 75, 'c');
      lb.pos.copy(v3([mid[1], mid[2]], 0.8));
    });
  })();
  function unitPos(id, minute) {
    var tr = S.truth[id].track, i = Math.max(0, Math.min(tr.length - 2, Math.floor(minute / 2)));
    var a = tr[i], b = tr[i + 1], f = Math.max(0, Math.min(1, (minute - a[0]) / (b[0] - a[0])));
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  function updateUnits(minute) {
    var P = unitIds.map(function (id) { var q = ll(unitPos(id, minute)); return { id: id, x: q[0], z: q[1] }; });
    var groups = [];
    P.forEach(function (p) {
      var g = null;
      for (var i = 0; i < groups.length; i++) { var c = groups[i]; if (Math.hypot(c.x - p.x, c.z - p.z) < 1.8) { g = c; break; } }
      if (!g) { g = { x: p.x, z: p.z, m: [] }; groups.push(g); }
      g.m.push(p);
    });
    groups.forEach(function (g) {
      var n = g.m.length, R = n > 1 ? 1.3 : 0, topY = 0;
      g.m.forEach(function (p, k) {
        var a = 2 * Math.PI * k / n - Math.PI / 2, x = g.x + R * Math.cos(a), z = g.z + R * Math.sin(a), o = unitObjs[p.id];
        var y = yAt(x, z) + 1.0; o.mesh.position.set(x, y, z); topY = Math.max(topY, y);
        o.label.active = false;
      });
      var lead = unitObjs[g.m[0].id];
      lead.label.active = true;
      lead.label.pos.set(g.x, topY + 1.2, g.z);
      setLabel(lead.label, g.m.map(function (p) { return '<span class="' + (unitObjs[p.id].blue ? 'bl' : 'rd') + '">' + p.id + '</span>'; }).join(', '));
    });
    unitIds.forEach(function (id) {
      var o = unitObjs[id], tr = S.truth[id].track, i = Math.max(0, Math.min(tr.length - 1, Math.floor(minute / 2)));
      o.trav.geometry.setDrawRange(0, o.marks[i]);
    });
  }

  // ---------- Reports ----------
  var reportObjs = S.reports.map(function (r) {
    var p = v3(r.pos, 0), g = new THREE.Group();
    var mat = new THREE.MeshLambertMaterial({ color: 0xfacc15, emissive: 0x5a4300, transparent: true, opacity: 1 });
    var stickM = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.8 });
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), mat); head.position.y = 1.35;
    var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), stickM); stick.position.y = 0.6;
    g.add(head, stick); g.position.copy(p); layer('reports').add(g);
    var lb = addLabel('report', '', 'reports', 12, 'b'); lb.pos.copy(p).add(new THREE.Vector3(0, 1.9, 0));
    return { r: r, g: g, mat: mat, stickM: stickM, label: lb, head: p.clone().add(new THREE.Vector3(0, 1.35, 0)) };
  });
  var reveal = false;
  function updateReports(minute, withLabels) {
    var got = 0, ghostsSeen = 0;
    reportObjs.forEach(function (o) {
      var r = o.r, vis = r.received_min <= minute; o.g.visible = vis; o.label.active = false;
      if (!vis) return;
      got++; var ghost = r.truth == null; if (ghost) ghostsSeen++;
      var age = minute - r.received_min, fresh = age <= 30;
      var col = reveal && ghost ? 0xc084fc : 0xfacc15, em = reveal && ghost ? 0x4a1a70 : 0x5a4300;
      o.mat.color.setHex(col); o.mat.emissive.setHex(em); o.stickM.color.setHex(col);
      o.mat.opacity = fresh ? 1 : 0.38; o.stickM.opacity = fresh ? 0.85 : 0.25;
      var s = fresh ? 1 + 0.5 * Math.max(0, 1 - age / 6) : 0.8; o.g.scale.set(s, s, s);
      if (withLabels && (fresh || (reveal && ghost))) {
        o.label.active = true;
        var txt = r.id.replace('SR-', 'SR ') + ', ' + r.size + ' ' + (TYPE_NAME[r.type] || r.type);
        if (reveal && ghost) txt = r.id.replace('SR-', 'SR ') + ', ghost';
        setLabel(o.label, esc(txt), 'report' + (reveal && ghost ? ' ghost' : ''));
        o.label.prio = fresh ? 14 : 13;
      }
    });
    return { got: got, ghosts: ghostsSeen };
  }

  // ---------- Fusion tracks, gates, links ----------
  var SNAP = S.fusion.snapshots;
  function fusionAt(t) {
    var i = Math.max(0, Math.min(SNAP.length - 1, Math.floor(t / 5 + 1e-9))), a = SNAP[i], b = SNAP[Math.min(SNAP.length - 1, i + 1)];
    var f = b === a ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    return a.tracks.map(function (tr) {
      var nb = null; for (var k = 0; k < b.tracks.length; k++) if (b.tracks[k].id === tr.id) { nb = b.tracks[k]; break; }
      if (!nb) return { tr: tr, pos: tr.pos, gate: tr.gate };
      return { tr: tr, pos: [tr.pos[0] + (nb.pos[0] - tr.pos[0]) * f, tr.pos[1] + (nb.pos[1] - tr.pos[1]) * f], gate: tr.gate + (nb.gate - tr.gate) * f };
    });
  }
  var RING_SEG = 72, DISC_R = 6;
  function makeDyn(nv, ni) {
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(ni), 1)); return g;
  }
  function ringGeom(g, cx, cz, r, w, lift, dashed) {
    var P = g.attributes.position.array, I = g.index.array, k = 0, m = 0;
    for (var i = 0; i <= RING_SEG; i++) {
      var a = i / RING_SEG * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      var x1 = cx + (r - w / 2) * ca, z1 = cz + (r - w / 2) * sa, x2 = cx + (r + w / 2) * ca, z2 = cz + (r + w / 2) * sa;
      P[k++] = x1; P[k++] = yAt(x1, z1) + lift; P[k++] = z1; P[k++] = x2; P[k++] = yAt(x2, z2) + lift; P[k++] = z2;
      if (i < RING_SEG && (!dashed || (i % 6) < 3)) { var o = i * 2; I[m++] = o; I[m++] = o + 2; I[m++] = o + 1; I[m++] = o + 1; I[m++] = o + 2; I[m++] = o + 3; }
    }
    g.setDrawRange(0, m); g.attributes.position.needsUpdate = true; g.index.needsUpdate = true;
  }
  function discGeom(g, cx, cz, r, lift) {
    var P = g.attributes.position.array, I = g.index.array, k = 0, m = 0;
    P[k++] = cx; P[k++] = yAt(cx, cz) + lift; P[k++] = cz;
    for (var j = 1; j <= DISC_R; j++) for (var i = 0; i < RING_SEG; i++) {
      var a = i / RING_SEG * Math.PI * 2, rr = r * j / DISC_R, x = cx + rr * Math.cos(a), z = cz + rr * Math.sin(a);
      P[k++] = x; P[k++] = yAt(x, z) + lift; P[k++] = z;
    }
    for (i = 0; i < RING_SEG; i++) { I[m++] = 0; I[m++] = 1 + (i + 1) % RING_SEG; I[m++] = 1 + i; }
    for (j = 1; j < DISC_R; j++) for (i = 0; i < RING_SEG; i++) {
      var a0 = 1 + (j - 1) * RING_SEG + i, a1 = 1 + (j - 1) * RING_SEG + (i + 1) % RING_SEG, b0 = a0 + RING_SEG, b1 = a1 + RING_SEG;
      I[m++] = a0; I[m++] = a1; I[m++] = b0; I[m++] = a1; I[m++] = b1; I[m++] = b0;
    }
    g.setDrawRange(0, m); g.attributes.position.needsUpdate = true; g.index.needsUpdate = true;
  }
  var trackPool = [];
  for (var tp = 0; tp < 12; tp++) {
    var ringM = flatMat(0x67e8f9, 1, 9), gateM = flatMat(0x38bdf8, 0.16, 3), gateEdgeM = flatMat(0x7dd3fc, 0.55, 4);
    var ring = new THREE.Mesh(makeDyn((RING_SEG + 1) * 2, RING_SEG * 6), ringM);
    var disc = new THREE.Mesh(makeDyn(1 + DISC_R * RING_SEG, RING_SEG * 3 + (DISC_R - 1) * RING_SEG * 6), gateM);
    var edge = new THREE.Mesh(makeDyn((RING_SEG + 1) * 2, RING_SEG * 6), gateEdgeM);
    var dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true }));
    layer('tracks').add(ring, dot); layer('gates').add(disc, edge);
    trackPool.push({ ring: ring, disc: disc, edge: edge, dot: dot, label: addLabel('track', '', 'tracks', 60, 'b') });
  }
  var linkMat = new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.9 }), linkCyl = new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true), linkPool = [];
  for (var lp = 0; lp < 60; lp++) { var lm = new THREE.Mesh(linkCyl, linkMat); lm.visible = false; layer('links').add(lm); linkPool.push(lm); }
  var UPV = new THREE.Vector3(0, 1, 0);
  function setLink(m, a, b) {
    var d = new THREE.Vector3().subVectors(b, a), L = d.length(); if (L < 1e-3) { m.visible = false; return; }
    m.visible = true; m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(UPV, d.divideScalar(L));
  }
  var LOG = S.fusion.log;
  function resolveTrack(id, since, t) {
    LOG.forEach(function (e) { if (e.event === 'merged' && e.min >= since && e.min <= t && e.absorbed === id) id = e.track; });
    return id;
  }
  var repById = {}; reportObjs.forEach(function (o) { repById[o.r.id] = o; });
  function updateFusion(t, opts) {
    var list = fusionAt(t), byId = {}, conf = 0, tent = 0;
    trackPool.forEach(function (o, i) {
      var it = list[i];
      o.ring.visible = o.disc.visible = o.edge.visible = o.dot.visible = !!it; o.label.active = !!it;
      if (!it) return;
      var tr = it.tr, q = ll(it.pos), c = tr.confirmed; byId[tr.id] = new THREE.Vector3(q[0], yAt(q[0], q[1]) + 0.35, q[1]);
      if (c) conf++; else tent++;
      ringGeom(o.ring.geometry, q[0], q[1], 0.95, c ? 0.26 : 0.16, 0.24, !c);
      o.ring.material.color.setHex(c ? 0x67e8f9 : 0xcbd5e1); o.ring.material.opacity = c ? 1 : 0.3 + 0.7 * Math.min(1, tr.conf * 1.6);
      o.ring.material.transparent = true;
      o.dot.position.copy(byId[tr.id]); o.dot.material.color.setHex(c ? 0x67e8f9 : 0xcbd5e1); o.dot.material.opacity = o.ring.material.opacity;
      discGeom(o.disc.geometry, q[0], q[1], it.gate, 0.12);
      ringGeom(o.edge.geometry, q[0], q[1], it.gate, 0.1, 0.13, false);
      o.disc.material.color.setHex(c ? 0x38bdf8 : 0x94a3b8); o.disc.material.opacity = c ? 0.17 : 0.09;
      o.edge.material.color.setHex(c ? 0x7dd3fc : 0x94a3b8); o.edge.material.opacity = c ? 0.6 : 0.35;
      var sz = tr.size[0] === tr.size[1] ? 'size ' + tr.size[0] : 'size ' + tr.size[0] + ' to ' + tr.size[1];
      var html = c ? '<b>' + tr.id + '</b> confirmed<br>' + sz + ', ' + (TYPE_NAME[tr.type] || tr.type) : '<b>' + tr.id + '</b> tentative';
      if (opts.gateLabel && c) html += '<br>gate ' + it.gate.toFixed(1) + ' km';
      setLabel(o.label, html, 'track' + (c ? '' : ' tent'));
      o.label.prio = c ? 62 : 22;
      o.label.pos.set(q[0], yAt(q[0], q[1]) + 1.2, q[1]);
    });
    // links
    var k = 0;
    LOG.forEach(function (e) {
      if (e.min > t || (e.event !== 'new track' && e.event !== 'joined')) return;
      var rep = repById[e.report]; if (!rep) return;
      var tid = resolveTrack(e.track, e.min, t), tp2 = byId[tid]; if (!tp2 || k >= linkPool.length) return;
      setLink(linkPool[k++], rep.head, tp2);
    });
    for (; k < linkPool.length; k++) linkPool[k].visible = false;
    return { confirmed: conf, tentative: tent };
  }

  // ---------- Assignment arcs ----------
  function taskTarget(task) {
    var m = task.match(/X\d/); if (m) return S.crossings[m[0]].pos;
    if (/screen/.test(task)) return S.places.vitry_west.pos;
    return null;
  }
  function tableRow(u, t) { for (var i = 0; i < S.assign.table.length; i++) { var r = S.assign.table[i]; if (r.unit === u && r.task === t) return r; } return null; }
  function buildArcs(plan, layerName, dashed, color, cls) {
    var grp = layer(layerName);
    Object.keys(plan).forEach(function (u) {
      var task = plan[u], tgt = taskTarget(task); if (!tgt || !S.truth[u]) return;
      var t0 = S.truth[u].track[0], a = v3([t0[1], t0[2]], 1.0), b = v3(tgt, 1.2), d = a.distanceTo(b);
      var mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 2 + d * 0.22;
      var curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      var mat = new THREE.MeshLambertMaterial({ color: color, emissive: new THREE.Color(color).multiplyScalar(0.35), transparent: false });
      if (!dashed) grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.22, 8, false), mat));
      else for (var i = 0; i < 24; i++) {
        var s0 = i / 24, s1 = s0 + 0.55 / 24, pts = [];
        for (var j = 0; j <= 4; j++) pts.push(curve.getPoint(s0 + (s1 - s0) * j / 4));
        grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 4, 0.19, 6, false), mat));
      }
      var tan = curve.getTangent(1), cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 14), mat);
      cone.position.copy(b); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize()); grp.add(cone);
      var row = tableRow(u, task), lb = addLabel(cls, '<b>' + u + '</b> &rarr; ' + esc(task) + (row ? ' <span>' + row.min + ' min</span>' : ''), layerName, dashed ? 45 : 50, 'c');
      lb.pos.copy(curve.getPoint(dashed ? 0.62 : 0.5));
    });
  }
  buildArcs(S.assign.best.assignment, 'assign-arrows', false, 0x7fb2ff, 'arc');
  buildArcs(S.assign.intuitive, 'intuitive-arrows', true, 0xf5b25b, 'arc intu');

  // ---------- The hole at X6: pulsing ring + highlighted Red recce route ----------
  var holeRing = null, holeRing2 = null, X6P = ll(S.crossings.X6.pos);
  (function () {
    var g = layer('hole');
    holeRing = new THREE.Mesh(makeDyn((RING_SEG + 1) * 2, RING_SEG * 6), flatMat(0xff4d4d, 0.9, 10)); holeRing.material.transparent = true;
    holeRing2 = new THREE.Mesh(makeDyn((RING_SEG + 1) * 2, RING_SEG * 6), flatMat(0xff4d4d, 1, 10));
    ringGeom(holeRing2.geometry, X6P[0], X6P[1], 1.5, 0.22, 0.3, false);
    g.add(holeRing, holeRing2);
    if (S.truth['R-REC']) {
      var pts = S.truth['R-REC'].track.map(function (t) { return ll([t[1], t[2]]); }), c = newBuf(), b = newBuf();
      ribbonInto(c, pts, 0.75, 0.14, 0.25); ribbonInto(b, pts, 0.46, 0.16, 0.25);
      g.add(new THREE.Mesh(bufGeom(c), flatMat(0x111318, 1, 7)), new THREE.Mesh(bufGeom(b), flatMat(0xff5c5c, 1, 13)));
    }
    var arr = S.mission_check ? S.mission_check.red_recce_x6_arrive : null;
    var lb = addLabel('cut', 'X6 uncovered' + (arr != null ? '<br>Red recce crosses H+' + arr : ''), 'hole', 85, 'l');
    lb.pos.copy(v3(S.crossings.X6.pos, 1.6)); lb.dx = -30; lb.dy = 34;
  })();
  function updateHole(minute) {
    var ph = (minute % 10) / 10;
    ringGeom(holeRing.geometry, X6P[0], X6P[1], 1.6 + 2.6 * ph, 0.2, 0.28, false);
    holeRing.material.opacity = 0.9 * (1 - ph);
  }

  // ---------- Options A to D: arcs per option ----------
  var OPTS = S.options || [], optGroups = [], optLabels = [], shownOpt = -1;
  var REC = S.recommended_option || '';
  function arcBetween(grp, a, b, color, r) {
    var d = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 2 + d * 0.22;
    var curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    var mat = new THREE.MeshLambertMaterial({ color: color, emissive: new THREE.Color(color).multiplyScalar(0.35) });
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r || 0.22, 8, false), mat));
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 14), mat);
    cone.position.copy(b); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(1).normalize()); grp.add(cone);
    return curve;
  }
  var OPT_COL = { A: 0x9aa8b8, B: 0xc084fc, C: 0xf5b25b, D: 0x7fb2ff };
  OPTS.forEach(function (o, oi) {
    var g = new THREE.Group(); g.visible = false; layer('option-arrows').add(g); optGroups.push(g);
    var col = OPT_COL[o.id] || 0x7fb2ff, labs = [], seen = {};
    (o.arrows || []).forEach(function (ar) {
      var key = ar.from.join(','), k = seen[key] = (seen[key] || 0) + 1;  // arcs sharing an origin: stagger their labels
      var a = v3(ar.from, 1.0), b = v3(ar.to, 1.2), curve = arcBetween(g, a, b, col);
      var dep = o.depart && o.depart[ar.unit] ? ', leaves ' + Math.abs(o.depart[ar.unit]) + ' min early' : '';
      var lb = addLabel('arc', '<b>' + ar.unit + '</b> &rarr; ' + esc(ar.task) + (dep ? ' <span>' + esc(dep.slice(2)) + '</span>' : ''), 'option-arrows', dep ? 58 : 50, 'c');
      lb.pos.copy(curve.getPoint([0.42, 0.56, 0.7, 0.3][(k - 1) % 4])); lb.active = false; labs.push(lb);
    });
    optLabels.push(labs);
  });
  function showOption(i) {
    shownOpt = i;
    optGroups.forEach(function (g, k) { g.visible = k === i; });
    optLabels.forEach(function (labs, k) { labs.forEach(function (lb) { lb.active = k === i; }); });
    Array.prototype.forEach.call(document.querySelectorAll('.opt'), function (c, k) { c.classList.toggle('shown', k === i); });
  }
  function recIndex() { for (var i = 0; i < OPTS.length; i++) if (OPTS[i].id === REC) return i; return OPTS.length - 1; }

  // ---------- Camera presets ----------
  var PRESETS = {
    'overview': { t: [3, 0.4, 5], d: 116, pol: 46, az: -10 },
    'low-south': { t: [0, 1.4, -9], d: 80, pol: 72, az: 6 },
    'arcis': { t: [-11, 0.8, 11], d: 52, pol: 44, az: -12 },
    'east': { t: [5, 0.8, 15], d: 62, pol: 38, az: 2 },
    'brienne': { t: [9.5, 0.6, 25], d: 46, pol: 36, az: -10 }
  };
  function camFromPreset(pr, azOff) {
    var pol = THREE.MathUtils.degToRad(pr.pol), az = THREE.MathUtils.degToRad(pr.az + (azOff || 0));
    var t = new THREE.Vector3(pr.t[0], pr.t[1], pr.t[2]);
    return { t: t, p: new THREE.Vector3(t.x + pr.d * Math.sin(pol) * Math.sin(az), t.y + pr.d * Math.cos(pol), t.z + pr.d * Math.sin(pol) * Math.cos(az)) };
  }
  var tween = null;
  function setCam(c) { camera.position.copy(c.p); controls.target.copy(c.t); camera.lookAt(c.t); controls.update(); }
  function startTween(c) {
    var from = { p: camera.position.clone(), t: controls.target.clone() };
    tween = { from: from, to: c, t0: performance.now(), dur: 1500 };
  }
  function stepTween(now) {
    if (!tween) return;
    var k = Math.min(1, (now - tween.t0) / tween.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(tween.from.p, tween.to.p, e); controls.target.lerpVectors(tween.from.t, tween.to.t, e);
    camera.lookAt(controls.target);
    if (k >= 1) tween = null;
  }
  controls.addEventListener('start', function () { tween = null; });

  // ---------- Panels (HTML/SVG inside the lesson panel) ----------
  var TASKS = []; S.assign.table.forEach(function (r) { if (TASKS.indexOf(r.task) < 0) TASKS.push(r.task); });
  var AUNITS = []; S.assign.table.forEach(function (r) { if (AUNITS.indexOf(r.unit) < 0) AUNITS.push(r.unit); });
  function planStats(plan) {
    var last = 0, total = 0;
    Object.keys(plan).forEach(function (u) { var r = tableRow(u, plan[u]); if (r) { last = Math.max(last, r.min); total += r.min; } });
    return { last: last, total: total };
  }
  function reasonFor(r) {
    if (r.reason && r.reason !== "not this unit's job") return r.reason;
    var u = S.units[r.unit];
    if (/^screen/.test(r.task) && u.type !== 'recon') return 'screening needs recce';
    if (u.type === 'recon' && !/^screen/.test(r.task)) return 'recce does not hold ground';
    if (r.fuel_left < 0.2) return 'below 20 % fuel reserve';
    return 'not allowed';
  }
  function heatColor(min) {
    var t = Math.max(0, Math.min(1, (min - 25) / (100 - 25)));
    var a = new THREE.Color(0x2f6f5e), b = new THREE.Color(0xc9a24a), c = new THREE.Color(0xb8452f), o = new THREE.Color();
    if (t < 0.5) o.copy(a).lerp(b, t * 2); else o.copy(b).lerp(c, (t - 0.5) * 2);
    return '#' + o.getHexString();
  }
  function panelAssignTable() {
    var best = S.assign.best, intu = S.assign.intuitive;
    var h = '<div class="pv-title">Minutes to reach each task (rows: units, columns: tasks)</div><table class="heat"><thead><tr><th class="u"></th>';
    TASKS.forEach(function (t) { h += '<th>' + esc(t) + '</th>'; });
    h += '</tr></thead><tbody>';
    AUNITS.forEach(function (u) {
      h += '<tr><th class="u">' + u + '<span>' + esc(S.units[u].name) + '</span></th>';
      TASKS.forEach(function (t) {
        var r = tableRow(u, t);
        if (!r) { h += '<td></td>'; return; }
        if (!r.eligible) { h += '<td class="no"><b>' + r.min + '</b><small>' + esc(reasonFor(r)) + '</small></td>'; return; }
        var pick = best.assignment[u] === t, ip = intu[u] === t;
        var sub = r.reason && r.reason !== "not this unit's job" ? esc(r.reason) : Math.round(r.fuel_left * 100) + ' % fuel left';
        h += '<td class="' + (pick ? 'pick' : '') + '" style="background:' + heatColor(r.min) + ';color:#fff"><b>' + r.min + '</b><small>' + sub + '</small>' +
          (pick ? '<span class="tag">SOLVER</span>' : '') + (ip && !pick ? '<span class="itag">intuitive</span>' : '') + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    var st = planStats(best.assignment);
    h += '<div class="pv-foot">Status <b>' + best.status + '</b> in <b>' + best.wall_ms + ' ms</b>. Latest arrival <b>H+' + best.last + '</b>, total <b>' + best.total + '</b> unit-minutes. White outline = the solver’s choice; amber tag = the intuitive plan where it differs. Hatched = forbidden by a rule.</div>';
    return h;
  }
  function gantt(plan, title, color, hl) {
    var W = 520, rowH = 30, top = 30, left = 62, right = 10, maxM = 122, H = top + AUNITS.length * rowH + 26;
    var X = function (m) { return left + (W - left - right) * m / maxM; };
    var st = planStats(plan), s = '<svg viewBox="0 0 ' + W + ' ' + H + '" font-family="Inter, sans-serif">';
    s += '<text x="0" y="16" fill="#edf1f6" font-size="14" font-weight="700">' + esc(title) + '</text>';
    s += '<text x="' + (W - right) + '" y="16" fill="' + color + '" font-size="13" font-weight="700" text-anchor="end">last arrival H+' + st.last + ', total ' + st.total + ' min</text>';
    [0, 25, 50, 75, 100].forEach(function (m) {
      s += '<line x1="' + X(m) + '" x2="' + X(m) + '" y1="' + (top - 4) + '" y2="' + (H - 22) + '" stroke="#243040"/>';
      s += '<text x="' + X(m) + '" y="' + (H - 8) + '" fill="#8d9bab" font-size="11" text-anchor="middle">' + m + '</text>';
    });
    AUNITS.forEach(function (u, i) {
      var r = tableRow(u, plan[u]), y = top + i * rowH, slow = r && r.min === st.last;
      s += '<text x="0" y="' + (y + 18) + '" fill="#c9d3de" font-size="12.5" font-weight="700">' + u + '</text>';
      if (!r) return;
      var c = hl && slow ? '#ff7a59' : color;
      s += '<rect x="' + X(0) + '" y="' + (y + 5) + '" width="' + (X(r.min) - X(0)) + '" height="18" rx="4" fill="' + c + '" opacity="' + (slow ? 1 : 0.8) + '"/>';
      s += '<text x="' + (X(r.min) + 6) + '" y="' + (y + 18) + '" fill="#edf1f6" font-size="12">' + esc(plan[u]) + ', ' + r.min + '</text>';
    });
    s += '<line x1="' + X(st.last) + '" x2="' + X(st.last) + '" y1="' + (top - 6) + '" y2="' + (H - 22) + '" stroke="' + color + '" stroke-dasharray="4 3" stroke-width="1.5"/>';
    return s + '</svg>';
  }
  function panelAssignWhy() {
    var best = S.assign.best, intu = S.assign.intuitive, bs = planStats(best.assignment);
    var h = '<div class="whyv"><div class="card">' + gantt(best.assignment, 'Solver plan', '#7fb2ff', false) + '</div>';
    h += '<div class="card">' + gantt(intu, 'Intuitive plan: armour to the far bridge', '#f5b25b', true) + '</div>';
    h += '<div class="card"><div class="pv-title">Counterfactuals: force the fastest unit onto each task</div><div class="cf">';
    S.assign.why.forEach(function (w) {
      var line;
      if (!w.if_fastest) line = '<b>' + w.chosen + '</b> is already the fastest (' + w.chosen_min + ' min). Nothing to test.';
      else {
        var fs = planStats(w.if_fastest.assignment), alt = Object.keys(w.if_fastest.assignment).filter(function (u) { return w.if_fastest.assignment[u] !== best.assignment[u]; })
          .map(function (u) { return u + ' ' + w.if_fastest.assignment[u]; }).join(', ');
        var verdict = fs.total > bs.total ? '<b>' + (fs.total - bs.total) + ' min worse</b> in total' : (fs.total === bs.total ? 'an <b>equally good</b> plan (B-1 and B-2 are interchangeable)' : 'better');
        line = 'Solver picked <b>' + w.chosen + '</b> (' + w.chosen_min + ' min); fastest is <b>' + w.fastest + '</b> (' + w.fastest_min + '). Forcing it gives ' + alt + ': last H+' + w.if_fastest.last + ', total ' + fs.total + ', ' + verdict + '.';
      }
      h += '<div class="row"><span class="t">' + esc(w.task) + '</span><span>' + line + '</span></div>';
    });
    h += '</div></div></div>';
    return h;
  }
  function panelChecks() {
    var v = S.validate, pass = v.filter(function (c) { return c.pass; }).length;
    var allOk = pass === v.length;
    var h = '<div class="sumline' + (allOk ? '' : ' bad') + '"><b>' + pass + ' of ' + v.length + '</b><span>checks pass for the solver plan' + (allOk ? '' : ', ' + (v.length - pass) + ' fail') + '</span></div><div class="checks">';
    v.forEach(function (c) {
      var parts = c.check.split(':'), kind = parts[0], rest = parts.slice(1).join(':').trim();
      h += '<div class="ck' + (c.pass ? '' : ' failrow') + '"><span class="okchip ' + (c.pass ? 'pass' : 'fail') + '">' + (c.pass ? 'PASS' : 'FAIL') + '</span><span class="n"><span>' + esc(kind) + '</span> ' + esc(rest) + '</span><span class="w">' + esc(c.why) + '</span></div>';
    });
    return h + '</div>';
  }
  function scatter(plan) {
    var mc = S.montecarlo[plan], race = mc.race, W = 300, H = 300, l = 40, r = 10, t = 10, b = 38, lo = 70, hi = 155;
    var X = function (v) { return l + (W - l - r) * (v - lo) / (hi - lo); }, Y = function (v) { return H - b - (H - t - b) * (v - lo) / (hi - lo); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" font-family="Inter, sans-serif">';
    s += '<polygon points="' + X(lo) + ',' + Y(lo) + ' ' + X(lo) + ',' + Y(hi) + ' ' + X(hi) + ',' + Y(hi) + '" fill="rgba(91,156,255,.07)"/>';
    for (var g = 80; g <= 150; g += 10) {
      s += '<line x1="' + X(g) + '" x2="' + X(g) + '" y1="' + Y(lo) + '" y2="' + Y(hi) + '" stroke="#202b38"/><line x1="' + X(lo) + '" x2="' + X(hi) + '" y1="' + Y(g) + '" y2="' + Y(g) + '" stroke="#202b38"/>';
      if (g % 20 === 0) s += '<text x="' + X(g) + '" y="' + (H - b + 14) + '" fill="#8d9bab" font-size="10" text-anchor="middle">' + g + '</text><text x="' + (l - 6) + '" y="' + (Y(g) + 3) + '" fill="#8d9bab" font-size="10" text-anchor="end">' + g + '</text>';
    }
    s += '<line x1="' + X(lo) + '" y1="' + Y(lo) + '" x2="' + X(hi) + '" y2="' + Y(hi) + '" stroke="#c9d3de" stroke-width="1.3" stroke-dasharray="5 4"/>';
    s += '<text x="' + X(78) + '" y="' + Y(147) + '" fill="#9cc3ff" font-size="11" font-weight="700">Blue first</text>';
    s += '<text x="' + X(148) + '" y="' + Y(80) + '" fill="#ff9a9a" font-size="11" font-weight="700" text-anchor="end">Red first</text>';
    race.forEach(function (p) {
      var ok = p[0] < p[1];
      s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="3.1" fill="' + (ok ? '#5b9cff' : '#ff5f5f') + '" fill-opacity=".78" stroke="#0c1116" stroke-width=".6"/>';
    });
    s += '<text x="' + ((l + W - r) / 2) + '" y="' + (H - 6) + '" fill="#c9d3de" font-size="10.5" text-anchor="middle">Blue arrives at X5 (minutes)</text>';
    s += '<text transform="translate(11 ' + ((t + H - b) / 2) + ') rotate(-90)" fill="#c9d3de" font-size="10.5" text-anchor="middle">Red arrives at X5 (minutes)</text>';
    return s + '</svg>';
  }
  function panelRace() {
    function card(plan, name) {
      var mc = S.montecarlo[plan], pct = mcRace(plan), key = Object.keys(mc.checks_pct).filter(function (k) { return /^race:/.test(k) && /at X5$/.test(k); })[0];
      var who = key.replace(/^race:\s*/, '').replace(/ at X5$/, ''), ff = (mc.top_failures[key] || [])[0];
      var col = pct >= 80 ? '#4ade80' : '#ff8a5b';
      return '<div class="rc"><div class="hd"><b style="color:' + col + '">' + pct + ' %</b><span>hold the bridge<br>over 1,000 runs</span></div><div class="nm">' + name + ': ' + esc(who) + '</div>' + scatter(plan) +
        (ff ? '<div class="ff">Typical failure: ' + esc(ff) + '</div>' : '') + '</div>';
    }
    return '<div class="pv-title">Each dot = one run, 200 of 1,000 shown</div><div class="race">' + card('solver', 'Solver plan') + card('intuitive', 'Intuitive plan') + '</div>';
  }
  var FUSION_LOG = [
    ['0', 'OR-Tools assignment, padded with dummies', '0 confirmed tracks', 'the solver needs a square problem; with dummies it found no assignment, so every report became a new track'],
    ['1', 'Hungarian algorithm (SciPy), one-to-one per 5-min batch', '3 to 5 tracks per Red unit', 'one-to-one is the radar assumption (one blip per target per sweep); human reports duplicate by nature'],
    ['2', 'sequential: each report, in the order it was seen, joins its nearest gated track', 'Red battalion "lost" in most runs', 'the track kept extrapolating its speed after the column stopped at the bridge: 50 km of phantom travel'],
    ['3', 'coasting: trust speed for 15 min after the last sighting, then hold', '85 % found, 2.2 tracks per unit', 'a 40-minute gap without sightings: the column reappears outside the gate'],
    ['4', 're-identification: reachable at road speed, same type, similar size, both tracks with 2+ reports', 'found dropped to 75 %', 'the merge averaged positions; a continuation must take the newest position'],
    ['5', 'merge keeps the newest sighting’s position and speed', '72 % found, 1.27 tracks per unit at t=200; but 0.4 false tracks per run at t=300', 'the gate grew 1 km per 10 min without a cap: after 100 silent minutes it was 12 km wide, so ghost reports confirmed each other'],
    ['6', 'gate capped at 5 km', '<b>72 / 78 % found, 1.17 / 1.25 tracks per unit, 0.97 / 0.94 km error, 0 / 0.07 false tracks per run</b> (t=200 / t=300)', 'current']
  ];
  function panelFusionLog() {
    var h = '<div class="pv-title">How fusion got good: 30 seeded report streams per version</div><div class="flog">';
    FUSION_LOG.forEach(function (r, i) {
      var cur = i === FUSION_LOG.length - 1;
      h += '<div class="fr' + (cur ? ' cur' : '') + '"><div class="v">v' + r[0] + '</div><div><div class="c">' + esc(r[1]) + '</div><div class="r">' + (cur ? r[2] : esc(r[2])) + '</div>' +
        (cur ? '<div class="y">Current version.</div>' : '<div class="y">' + esc(r[3].charAt(0).toUpperCase() + r[3].slice(1)) + '.</div>') + '</div></div>';
    });
    return h + '</div>';
  }
  function effectCover(eff, plan) {
    var ids = [eff.at].concat(eff.also_covers || []), who = [];
    Object.keys(plan).forEach(function (u) { if (plan[u].indexOf(eff.at) >= 0) who.push(u + ' (' + plan[u] + ')'); });
    return { ids: ids, who: who };
  }
  function panelMission() {
    var M = S.mission_check; if (!M) return '';
    var h = '<div class="pv-title">The mission\u2019s required effects, against the first plan</div><div class="mfx">';
    M.effects.forEach(function (e) {
      var c = effectCover(e, M.first_plan), ok = c.who.length > 0;
      var what = (e.effect === 'seize' ? 'Seize ' : 'Deny ') + c.ids.join(' and ') + (e.by_min ? ' by H+' + e.by_min : '');
      h += '<div class="mf' + (ok ? '' : ' miss') + '"><span class="okchip ' + (ok ? 'pass' : 'fail') + '">' + (ok ? 'COVERED' : 'UNCOVERED') + '</span><span class="n">' + esc(what) + '</span><span class="w">' + (ok ? esc(c.who.join(', ')) : 'nobody assigned') + '</span></div>';
    });
    h += '</div>';
    // reach X6 bar chart
    var R = M.reach_x6.slice().sort(function (a, b) { return a.min - b.min; }), red = M.red_recce_x6_arrive, maxM = 160;
    var W = 640, left = 70, right = 16, top = 26, rowH = 26, H = top + R.length * rowH + 30, X = function (m) { return left + (W - left - right) * m / maxM; };
    var sv = '<svg viewBox="0 0 ' + W + ' ' + H + '" font-family="Inter, sans-serif">';
    sv += '<text x="0" y="14" fill="#edf1f6" font-size="13.5" font-weight="700">Minutes for each Blue unit to reach X6</text>';
    [0, 30, 60, 90, 120, 150].forEach(function (m) { sv += '<line x1="' + X(m) + '" x2="' + X(m) + '" y1="' + (top - 2) + '" y2="' + (H - 24) + '" stroke="#243040"/><text x="' + X(m) + '" y="' + (H - 9) + '" fill="#8d9bab" font-size="11" text-anchor="middle">' + m + '</text>'; });
    R.forEach(function (r, i) {
      var y = top + i * rowH, early = r.min < red, recon = r.type === 'recon';
      var col = early ? '#6b7a8c' : '#ff7a59';
      sv += '<text x="0" y="' + (y + 16) + '" fill="#c9d3de" font-size="12.5" font-weight="700">' + r.unit + '</text>';
      sv += '<rect x="' + X(0) + '" y="' + (y + 5) + '" width="' + (X(r.min) - X(0)) + '" height="15" rx="3" fill="' + col + '"/>';
      sv += '<text x="' + (X(r.min) + 6) + '" y="' + (y + 16) + '" fill="#edf1f6" font-size="11.5">' + r.min + ' min' + (recon && early ? ', recce: may not hold ground' : (early ? '' : ', too late by ' + (r.min - red))) + '</text>';
    });
    sv += '<line x1="' + X(red) + '" x2="' + X(red) + '" y1="' + (top - 8) + '" y2="' + (H - 24) + '" stroke="#ff4d4d" stroke-width="2"/>';
    sv += '<text x="' + (X(red) + 5) + '" y="' + (top - 10) + '" fill="#ff8a8a" font-size="11.5" font-weight="700">Red recce crosses H+' + red + '</text>';
    sv += '</svg>';
    h += '<div class="whyv" style="margin-top:12px"><div class="card">' + sv + '</div>';
    var d = M.drifted_rule;
    if (d) {
      h += '<div class="card bug"><div class="pv-title" style="color:#f5b25b">Bug found on the way</div><div class="bugv"><b>' + esc(d.verdict) + ':</b> ' + esc(d.task) + ', ' + esc(d.closest_unit) + ' ready H+' + d.closest_ready + ', needed by H+' + d.deadline + ', short by ' + d.short_by_min + ' min</div><div class="bugn">' + esc(d.note) + '</div></div>';
    }
    return h + '</div>';
  }
  function panelOptions() {
    var h = '<div class="pv-title">Same engine, four ways out. Big number = whole mission met in 1,000 runs</div><div class="opts">';
    OPTS.forEach(function (o, i) {
      var rec = o.id === REC, pc = o.mc_all_pct, col = pc >= 90 ? '#4ade80' : (pc >= 40 ? '#f5b25b' : '#ff6b6b');
      var bar = function (lbl, v) { var c = v >= 90 ? '#4ade80' : (v >= 40 ? '#f5b25b' : '#ff6b6b'); return '<div class="hb"><span>' + lbl + '</span><i><em style="width:' + v + '%;background:' + c + '"></em></i><b>' + v + ' %</b></div>'; };
      var fk = Object.keys(o.top_failures || {})[0], ff = fk ? (o.top_failures[fk] || [])[0] : '';
      h += '<div class="opt' + (rec ? ' rec' : '') + '" data-i="' + i + '"><div class="oh"><span class="ob">' + o.id + '</span><span class="on">' + esc(o.name) + '</span>' + (rec ? '<span class="tag">RECOMMENDED</span>' : '') + '</div>' +
        '<div class="oi">' + esc(o.idea) + '</div>' +
        '<div class="obig"><b style="color:' + col + '">' + pc + ' %</b><span>mission met in 1,000 runs<br>checks ' + o.nominal_pass + ' / ' + o.nominal_total + ' on the nominal plan</span></div>' +
        bar('X5', o.mc_x5_pct) + bar('X6', o.mc_x6_pct) + bar('X4', o.mc_x4_pct) +
        '<div class="ofu"><span>Tracked by H+150</span>' + Object.keys(o.fusion_at_h150 || {}).map(function (u) { var v = o.fusion_at_h150[u]; return '<em class="' + (v >= 50 ? 'hi' : (v > 0 ? 'mid' : 'lo')) + '">' + u + ' ' + v + ' %</em>'; }).join('') + '</div>' +
        (ff ? '<div class="off">' + esc(ff) + '</div>' : '<div class="off">No failures</div>') + '</div>';
    });
    return h + '</div>';
  }
  var PANELS = { 'mission': panelMission, 'options': panelOptions, 'assign-table': panelAssignTable, 'assign-why': panelAssignWhy, 'checks': panelChecks, 'race': panelRace, 'fusion-log': panelFusionLog };

  // ---------- Legend ----------
  var legendEl = document.getElementById('legend');
  function sw(kind, c) {
    if (kind === 'line') return '<svg width="26" height="12"><line x1="1" y1="6" x2="25" y2="6" stroke="' + c + '" stroke-width="4" stroke-linecap="round"/></svg>';
    if (kind === 'thin') return '<svg width="26" height="12"><line x1="1" y1="6" x2="25" y2="6" stroke="' + c + '" stroke-width="1.5"/></svg>';
    if (kind === 'dash') return '<svg width="26" height="12"><line x1="1" y1="6" x2="25" y2="6" stroke="' + c + '" stroke-width="3.5" stroke-dasharray="4 3"/></svg>';
    if (kind === 'box') return '<svg width="14" height="14"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="' + c + '" stroke="#fff" stroke-opacity=".6"/></svg>';
    if (kind === 'oct') return '<svg width="14" height="14"><path d="M7 1 L13 7 L7 13 L1 7 Z" fill="' + c + '" stroke="#fff" stroke-opacity=".6"/></svg>';
    if (kind === 'dot') return '<svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="' + c + '"/></svg>';
    if (kind === 'ring') return '<svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="' + c + '" stroke-width="2.6"/></svg>';
    if (kind === 'dring') return '<svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="' + c + '" stroke-width="2" stroke-dasharray="3 2.5"/></svg>';
    if (kind === 'disc') return '<svg width="16" height="16"><circle cx="8" cy="8" r="7" fill="' + c + '" fill-opacity=".35" stroke="' + c + '"/></svg>';
    if (kind === 'cone') return '<svg width="14" height="14"><path d="M2 2 L12 2 L7 12 Z" fill="' + c + '"/></svg>';
    if (kind === 'x') return '<svg width="14" height="14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="' + c + '" stroke-width="3"/></svg>';
    if (kind === 'grad') return '<span style="display:block;width:26px;height:10px;border-radius:3px;background:linear-gradient(90deg,' + c + ')"></span>';
    return '';
  }
  function legendRow(swatch, text) { return '<div class="lg"><span class="sw">' + swatch + '</span><span>' + text + '</span></div>'; }
  function buildLegend(lesson) {
    var L = lesson.show.layers, an = lesson.show.anim || '', h = '';
    var has = function (n) { return L.indexOf(n) >= 0; };
    if (has('terrain')) h += legendRow(sw('grad', '#3d5b39,#a29c62,#d6c79c,#f2ecdc'), 'Height ' + Math.round(HMIN) + ' to ' + Math.round(HMAX) + ' m');
    if (has('roads')) h += legendRow(sw('line', '#f6e4bd'), 'Roads, wider = more important');
    if (has('rivers')) h += legendRow(sw('line', '#3b8fd9'), 'Rivers, the Aube and its tributaries');
    if (has('crossings')) h += legendRow(sw('cone', '#fb923c'), 'River crossings X1 to X6');
    if (/^ripple/.test(an)) {
      var r = ripple[an === 'ripple-blown' ? 'blown' : 'normal'];
      h += legendRow(sw('grad', RAMP.map(function (c) { return '#' + c.getHexString(); }).join(',')), 'Explored point, minutes from Camp de Mailly (0 to ' + Math.round(r.maxM) + ')');
      h += legendRow(sw('line', '#ffffff'), 'Fastest route found');
      if (an === 'ripple-blown') { h += legendRow(sw('x', '#ff3030'), 'Blown bridge'); h += legendRow(sw('line', 'rgba(255,255,255,.4)'), 'Route before the bridges were cut'); }
    }
    if (has('units')) { h += legendRow(sw('box', '#3f7ff0'), 'Blue unit (true position)'); h += legendRow(sw('oct', '#f04848'), 'Red unit (true position)'); }
    if (has('routes')) h += legendRow(sw('line', '#6aa8ff'), 'Route driven so far (faint: still to drive)');
    if (has('reports')) { h += legendRow(sw('dot', '#facc15'), 'Spot report (fades after 30 min)'); if (reveal) h += legendRow(sw('dot', '#c084fc'), 'Ghost report (nothing was there)'); }
    if (has('tracks')) { h += legendRow(sw('ring', '#67e8f9'), 'Confirmed track (2+ reports)'); h += legendRow(sw('dring', '#cbd5e1'), 'Tentative track (1 report)'); }
    if (has('gates')) h += legendRow(sw('disc', '#38bdf8'), 'Gate: where a new report may join');
    if (has('links')) h += legendRow(sw('thin', '#fde68a'), 'Report joined this track');
    if (has('assign-arrows')) h += legendRow(sw('line', '#7fb2ff'), 'Solver assignment');
    if (lesson.id === 'why') h += legendRow(sw('dash', '#f5b25b'), 'Intuitive assignment');
    if (lesson.show.panel === 'mission') { h += legendRow(sw('ring', '#ff4d4d'), 'X6: required by the mission, nobody assigned'); h += legendRow(sw('line', '#ff5c5c'), 'Red recce route to X6'); }
    if (has('option-arrows')) h += legendRow(sw('line', '#7fb2ff'), 'Assignments of the option shown (click a card)');
    if (lesson.show.panel === 'race') { h += legendRow(sw('line', '#6aa8ff'), 'Blue route to X5 (solver plan)'); h += legendRow(sw('line', '#ff6b6b'), 'Red route to X5'); }
    h += '<div class="note">Vertical scale exaggerated 12x. Grid: 1 unit = 1 km.</div>';
    legendEl.innerHTML = h;
  }

  // ---------- Lesson state ----------
  var cur = -1, progress = 0, playing = false, hooked = false, lastTick = 0;
  var visibleLayers = {};
  function layerOn(n) { return !!visibleLayers[n]; }
  var ALL_LAYERS = ['terrain', 'roads', 'rivers', 'places', 'crossings', 'cuts', 'units', 'routes', 'reports', 'tracks', 'gates', 'links', 'assign-arrows', 'intuitive-arrows', 'ripple-normal', 'ripple-blown', 'race-routes', 'hole', 'option-arrows'];
  ALL_LAYERS.forEach(layer);
  function lessonKind(ls) { var a = ls.show.anim || ''; if (/^ripple/.test(a)) return 'ripple'; if (/^play-/.test(a)) return 'time'; return 'static'; }
  function staticMinute(ls) { return ls.show.layers.indexOf('tracks') >= 0 ? 300 : 0; }

  var el = function (id) { return document.getElementById(id); };
  var panel = el('panel'), timebar = el('timebar'), slider = el('slider'), tlabel = el('tlabel'), hud = el('hud'), revealBtn = el('reveal'), playBtn = el('play');
  var PLAY_SVG = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5 L12.5 7 L3 12.5 Z" fill="#1d1204"/></svg>';
  var PAUSE_SVG = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2.5" y="1.5" width="3.2" height="11" fill="#1d1204"/><rect x="8.3" y="1.5" width="3.2" height="11" fill="#1d1204"/></svg>';
  function setPlaying(p) { playing = p; playBtn.innerHTML = p ? PAUSE_SVG : PLAY_SVG; lastTick = performance.now(); }

  var dotsEl = el('dots');
  LESSONS.forEach(function (ls, i) { var d = document.createElement('i'); d.title = (i + 1) + '. ' + ls.title; d.onclick = function () { goLesson(i); }; dotsEl.appendChild(d); });

  function goLesson(i, instant) {
    i = Math.max(0, Math.min(LESSONS.length - 1, i | 0));
    if (instant) { hooked = true; }
    document.body.classList.toggle('rec', hooked);
    var ls = LESSONS[i], changed = i !== cur; cur = i;
    var L = ls.show.layers.slice(), an = ls.show.anim || '';
    visibleLayers = {};
    L.forEach(function (n) { visibleLayers[n] = true; });
    if (an === 'ripple-normal') visibleLayers['ripple-normal'] = true;
    if (an === 'ripple-blown') { visibleLayers['ripple-blown'] = true; visibleLayers.cuts = true; }
    if (ls.id === 'why') visibleLayers['intuitive-arrows'] = true;
    if (ls.show.panel === 'race') visibleLayers['race-routes'] = true;
    if (ls.show.panel === 'mission') visibleLayers.hole = true;
    ALL_LAYERS.forEach(function (n) { layers[n].visible = !!visibleLayers[n]; });
    ['X1', 'X2'].forEach(function (id) { crossObjs[id].group.visible = an !== 'ripple-blown'; crossObjs[id].label.active = an !== 'ripple-blown'; });
    // text
    el('lnum').textContent = 'Lesson ' + String(i + 1).padStart(2, '0') + ' of ' + LESSONS.length;
    el('ltitle').textContent = resolve(ls.title);
    el('lplain').textContent = resolve(ls.plain);
    el('lwhy').textContent = resolve(ls.why);
    el('ltech').textContent = resolve(ls.tech);
    var pn = ls.show.panel;
    el('lextra').innerHTML = pn && PANELS[pn] ? PANELS[pn]() : '';
    panel.classList.toggle('dense', !!pn);
    if (pn === 'options') {
      Array.prototype.forEach.call(document.querySelectorAll('.opt'), function (c) { c.onclick = function () { showOption(+c.getAttribute('data-i')); if (hooked) { applyProgress(); renderNow(); } }; });
      showOption(recIndex());
    }
    document.documentElement.style.setProperty('--pw', pn ? (window.innerWidth >= 1700 ? '760px' : '640px') : '');
    el('pscroll').scrollTop = 0;
    fitPanel();
    el('prev').disabled = i === 0; el('next').disabled = i === LESSONS.length - 1;
    Array.prototype.forEach.call(dotsEl.children, function (d, k) { d.className = k === i ? 'on' : (k < i ? 'done' : ''); });
    // time bar
    var kind = lessonKind(ls);
    timebar.classList.toggle('hidden', kind === 'static');
    el('legend').classList.toggle('low', kind === 'static');
    revealBtn.classList.toggle('hidden', !(kind === 'time' && L.indexOf('reports') >= 0));
    el('ticks').innerHTML = kind === 'time' ? [0, 60, 120, 180, 240, 300, 360].map(function (m) { return '<span style="left:' + (m / 360 * 100) + '%">H+' + m + '</span>'; }).join('') : '';
    buildLegend(ls);
    resize();
    // camera
    var pr = PRESETS[ls.show.camera] || PRESETS.overview;
    progress = 0;
    var c = camFromPreset(pr, kind === 'static' && hooked ? orbitOffset(0) : 0);
    if (instant || !changed && false) { tween = null; setCam(c); } else startTween(c);
    setPlaying(!hooked && kind !== 'static');
    applyProgress();
    if (hooked) renderNow();
  }
  function fitPanel() {
    var sc = el('pscroll');
    panel.classList.remove('fit1', 'fit2', 'fit3');
    if (window.innerWidth <= 1000) return; // narrow layout scrolls instead
    for (var lv = 1; lv <= 3 && sc.scrollHeight > sc.clientHeight + 1; lv++) panel.classList.add('fit' + lv);
  }
  window.addEventListener('resize', function () { if (cur >= 0) fitPanel(); });
  function orbitOffset(p) { return (p - 0.5) * 14; }

  // Progress -> scene state (deterministic: depends only on lesson + progress + reveal)
  var RIPPLE_T = { normal: [0.0, 0.72, 0.84], blown: [0.1, 0.75, 0.85] };
  function applyProgress() {
    var ls = LESSONS[cur], kind = lessonKind(ls), an = ls.show.anim || '', p = progress;
    slider.value = Math.round(p * 1000); slider.style.setProperty('--fill', (p * 100).toFixed(2) + '%');
    var hudHtml = '';
    if (kind === 'ripple') {
      var k = an === 'ripple-blown' ? 'blown' : 'normal', r = ripple[k], tt = RIPPLE_T[k];
      var f = Math.max(0, Math.min(1, (p - tt[0]) / (tt[1] - tt[0]))), m = f * r.maxM, n = countAtMinute(r, m);
      if (f <= 0) n = 0;
      r.pts.geometry.setDrawRange(0, n);
      var w0 = countAtMinute(r, m - Math.max(1.2, r.maxM * 0.04));
      r.front.geometry.setDrawRange(w0, f < 1 ? Math.max(0, n - w0) : 0);
      var pf = Math.max(0, Math.min(1, (p - tt[1]) / (tt[2] - tt[1])));
      var cnt = pf > 0 ? r.total : 0;
      if (pf > 0 && pf < 1) { var mi = Math.floor(pf * (r.marks.length - 1)); cnt = r.marks[mi]; }
      r.core.geometry.setDrawRange(0, cnt); r.cas.geometry.setDrawRange(0, cnt);
      var done = pf >= 1;
      setLabel(r.lbDone, fmtNum(r.d.settled) + ' points explored, ' + r.d.minutes + ' minutes');
      r.lbDone.active = done; r.lbDest.active = !done && f > 0.9;
      var explored = Math.round(r.d.settled * n / r.n);
      if (k === 'blown' && f <= 0) hudHtml = '<div class="chip"><b>X1 and X2 blown.</b> Same algorithm, different graph.</div>';
      else hudHtml = '<div class="chip"><span class="big">' + fmtNum(explored) + '</span>points settled</div>' +
        (done ? '<div class="chip">fastest route: <b>' + r.d.minutes + ' min</b></div>' : '<div class="chip">ripple at <b>' + m.toFixed(1) + ' min</b> from the start</div>');
      tlabel.textContent = m.toFixed(1) + ' min';
    }
    var minute = kind === 'time' ? p * 360 : staticMinute(ls);
    if (kind === 'time') tlabel.textContent = 'H+' + Math.round(minute);
    if (layerOn('units')) updateUnits(minute);
    if (layerOn('hole')) {
      updateHole(minute);
      var ra = S.mission_check ? S.mission_check.red_recce_x6_arrive : 78;
      hudHtml = minute < ra ? '<div class="chip">Red recce reaches X6 at <b>H+' + ra + '</b></div>' : '<div class="chip" style="border-color:rgba(255,77,77,.7)"><b style="color:#ff8a8a">X6 crossed at H+' + ra + '</b>, nobody there to stop it</div>';
    }
    if (layerOn('option-arrows') && OPTS.length) {
      if (hooked) showOption(Math.min(OPTS.length - 1, Math.floor(p / 0.75 * OPTS.length))); // A..D over 0..0.75, D held after
      var so = OPTS[shownOpt] || OPTS[0];
      hudHtml = '<div class="chip">Option <b>' + so.id + '</b>: ' + esc(so.name) + '</div><div class="chip"><span class="big">' + so.mc_all_pct + ' %</span>mission met</div>';
    }
    if (layerOn('reports')) {
      var rs = updateReports(minute, an === 'play-reports');
      if (an === 'play-reports') hudHtml = '<div class="chip"><span class="big">' + rs.got + '</span>of ' + S.reports.length + ' reports received</div>' + (reveal ? '<div class="chip" style="border-color:rgba(192,132,252,.6)"><b>' + rs.ghosts + '</b> ghosts so far</div>' : '');
    }
    if (layerOn('tracks')) {
      var fs = updateFusion(minute, { gateLabel: ls.id === 'gate' });
      if (an === 'play-fusion') {
        var nr = S.reports.filter(function (x) { return x.received_min <= minute; }).length;
        hudHtml = '<div class="chip"><span class="big">' + fs.confirmed + '</span>confirmed</div><div class="chip"><span class="big">' + fs.tentative + '</span>tentative</div><div class="chip"><b>' + nr + '</b> reports in</div>';
      } else if (kind === 'static') hudHtml = '<div class="chip">Enemy picture at <b>H+' + minute + '</b>: ' + fs.confirmed + ' confirmed tracks, ' + fs.tentative + ' tentative</div>';
    }
    if (ls.id === 'assign' || ls.id === 'why' || ls.id === 'validate') hudHtml = '<div class="chip">Start positions, <b>H+0</b></div>';
    hud.innerHTML = hudHtml;
  }

  function setProgress(p) {
    hooked = true; document.body.classList.add('rec'); setPlaying(false); tween = null;
    progress = Math.max(0, Math.min(1, +p || 0));
    var ls = LESSONS[cur];
    if (lessonKind(ls) === 'static') setCam(camFromPreset(PRESETS[ls.show.camera] || PRESETS.overview, orbitOffset(progress)));
    applyProgress();
  }
  function setReveal(on) { reveal = !!on; revealBtn.classList.toggle('on', reveal); revealBtn.textContent = reveal ? 'Hide truth' : 'Reveal truth'; buildLegend(LESSONS[cur]); applyProgress(); if (hooked) renderNow(); }

  // ---------- Rendering ----------
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  var needle = el('needle');
  function renderNow() {
    controls.update();
    var dir = new THREE.Vector3().subVectors(controls.target, camera.position);
    var ang = Math.atan2(dir.x, -dir.z) * 180 / Math.PI; // 0 when looking north
    needle.setAttribute('transform', 'rotate(' + (-ang).toFixed(1) + ' 20 20)');
    renderer.render(scene, camera);
    updateLabels();
  }
  var DUR = { time: 42000, ripple: 11000 };
  function loop(now) {
    requestAnimationFrame(loop);
    if (hooked) return; // recording mode: only renderNow() draws
    stepTween(now);
    if (playing) {
      var kind = lessonKind(LESSONS[cur]), dt = now - lastTick; lastTick = now;
      progress = Math.min(1, progress + dt / (DUR[kind] || 30000));
      applyProgress();
      if (progress >= 1) setPlaying(false);
    }
    renderNow();
  }

  // ---------- UI events ----------
  el('prev').onclick = function () { goLesson(cur - 1); };
  el('next').onclick = function () { goLesson(cur + 1); };
  el('techbtn').onclick = function () { var b = el('techbox'); b.classList.toggle('open'); this.setAttribute('aria-expanded', b.classList.contains('open')); };
  playBtn.onclick = function () { if (progress >= 1) progress = 0; setPlaying(!playing); };
  slider.oninput = function () { setPlaying(false); progress = slider.value / 1000; applyProgress(); if (hooked) renderNow(); };
  revealBtn.onclick = function () { setReveal(!reveal); };
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { goLesson(cur + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { goLesson(cur - 1); e.preventDefault(); }
    else if (e.key === ' ' && !timebar.classList.contains('hidden')) { playBtn.onclick(); e.preventDefault(); }
  });
  window.addEventListener('resize', function () { resize(); if (hooked) renderNow(); });

  // ---------- Hooks for deterministic recording ----------
  window.goLesson = goLesson;
  window.setProgress = setProgress;
  window.renderNow = renderNow;
  window.setReveal = setReveal;
  window.lessonCount = LESSONS.length;

  resize();
  goLesson(0, false);
  setCam(camFromPreset(PRESETS.overview, 0)); tween = null;
  requestAnimationFrame(loop);
  renderNow();
  window.ready = true;
})();
