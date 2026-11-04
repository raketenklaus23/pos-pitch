/* ════════════════════════════════════════════════════════════════════
   Schaufenster-Film – Hörakustik Lindenthal
   Zeitgesteuerte Engine: jedes Bild ist eine reine Funktion der Zeit t.
   Dadurch ist der Film spulbar (Tasten) und Bild für Bild als MP4
   renderbar (?render → window.__film.render(t)).
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const W = 1920, H = 1080;
  const qs = new URLSearchParams(location.search);
  const RENDER = qs.has('render');

  const stage = document.getElementById('stage');
  const cv = document.getElementById('fx');
  const ctx = cv.getContext('2d');
  let SC = 1, KX = 1;

  // ── Hilfen ──────────────────────────────────────────────────────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (x) => x - Math.floor(x);
  const R = (i, k = 0) => fract(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);
  const EASE = {
    lin: (t) => t,
    io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  const ez = (name, t) => EASE[name](clamp(t, 0, 1));
  const GOLD = [[209, 175, 52], [240, 206, 122], [209, 175, 52]];
  function goldAt(f) {
    const s = f < 0.63 ? f / 0.63 : (f - 0.63) / 0.37;
    const [a, b] = f < 0.63 ? [GOLD[0], GOLD[1]] : [GOLD[1], GOLD[2]];
    return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
  }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const C_GOLD1 = [209, 175, 52], C_GOLD2 = [240, 206, 122], C_CREAM = [245, 240, 232];

  // ── Bühne skalieren ────────────────────────────────────────────────
  function fit() {
    SC = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = `translate(-50%, -50%) scale(${SC})`;
    const dpr = window.devicePixelRatio || 1;
    KX = clamp(SC * dpr, 0.5, 2);
    cv.width = Math.round(W * KX); cv.height = Math.round(H * KX);
  }

  // ════════════════════════════════════════════════════════════════════
  //  Keyframe-System
  // ════════════════════════════════════════════════════════════════════
  function addKeys(el, keys) {
    el._tr = el._tr || {};
    for (const [t, props, e] of keys) {
      for (const p in props) (el._tr[p] = el._tr[p] || []).push([t, props[p], e || 'io']);
    }
    for (const p in el._tr) el._tr[p].sort((a, b) => a[0] - b[0]);
  }
  function ev(track, t) {
    const n = track.length;
    if (t <= track[0][0]) return track[0][1];
    if (t >= track[n - 1][0]) return track[n - 1][1];
    for (let i = 1; i < n; i++) {
      if (t < track[i][0]) {
        const [t0, v0] = track[i - 1], [t1, v1, e] = track[i];
        return v0 + (v1 - v0) * EASE[e]((t - t0) / (t1 - t0));
      }
    }
    return track[n - 1][1];
  }
  function applyEl(el, t) {
    const tr = el._tr; if (!tr) return;
    const v = {};
    for (const p in tr) v[p] = ev(tr[p], t);
    let tf = '';
    if (v.x != null || v.y != null || v.z != null) tf += `translate3d(${(v.x || 0).toFixed(2)}px,${(v.y || 0).toFixed(2)}px,${(v.z || 0).toFixed(1)}px) `;
    if (v.xp != null) tf += `translateX(${v.xp.toFixed(2)}%) `;
    if (v.yp != null) tf += `translateY(${v.yp.toFixed(2)}%) `;
    if (v.ry != null) tf += `rotateY(${v.ry.toFixed(2)}deg) `;
    if (v.r != null) tf += `rotate(${v.r.toFixed(2)}deg) `;
    if (v.s != null) tf += `scale(${v.s.toFixed(4)}) `;
    if (v.sx != null) tf += `scaleX(${v.sx.toFixed(4)}) `;
    if (v.sy != null) tf += `scaleY(${v.sy.toFixed(4)}) `;
    if (tf) el.style.transform = tf;
    if (v.o != null) el.style.opacity = v.o.toFixed(3);
    if (v.b != null) el.style.filter = v.b > 0.05 ? `blur(${v.b.toFixed(2)}px)` : 'none';
    if (v.cr != null) el.style.clipPath = `inset(0 ${v.cr.toFixed(2)}% 0 0)`;
    if (v.ls != null) el.style.letterSpacing = v.ls.toFixed(3) + 'em';
    if (v.dash != null) el.style.strokeDashoffset = v.dash.toFixed(4);
  }

  const IN = {
    fade: (t, d) => [[t, { o: 0 }], [t + d, { o: 1 }, 'out']],
    up: (t, d) => [[t, { o: 0, y: 50 }], [t + d, { o: 1, y: 0 }, 'expo']],
    down: (t, d) => [[t, { o: 0, y: -50 }], [t + d, { o: 1, y: 0 }, 'expo']],
    left: (t, d) => [[t, { o: 0, x: -80 }], [t + d, { o: 1, x: 0 }, 'expo']],
    right: (t, d) => [[t, { o: 0, x: 80 }], [t + d, { o: 1, x: 0 }, 'expo']],
    rise: (t, d) => [[t, { yp: 118 }], [t + d, { yp: 0 }, 'expo']],
    blur: (t, d) => [[t, { o: 0, b: 22, s: 1.1 }], [t + d, { o: 1, b: 0, s: 1 }, 'out']],
    zoom: (t, d) => [[t, { o: 0, s: 0.4 }], [t + d, { o: 1, s: 1 }, 'expo']],
    pop: (t, d) => [[t, { o: 0, s: 0 }], [t + d, { o: 1, s: 1 }, 'back']],
    wipe: (t, d) => [[t, { cr: 100 }], [t + d, { cr: 0 }, 'io']],
    track: (t, d, ls) => [[t, { o: 0, ls: ls + 0.9, b: 10 }], [t + d, { o: 1, ls: ls, b: 0 }, 'expo']],
    grow: (t, d) => [[t, { sx: 0 }], [t + d, { sx: 1 }, 'expo']],
    growy: (t, d) => [[t, { sy: 0 }], [t + d, { sy: 1 }, 'expo']],
    draw: (t, d) => [[t, { dash: 1 }], [t + d, { dash: 0 }, 'io']],
    dev3d: (t, d) => [[t, { o: 0, z: -520, ry: -70, r: -8, y: 40 }], [t + 0.5, { o: 1 }, 'out'], [t + d, { z: 0, ry: 0, r: 0, y: 0 }, 'expo']],
  };
  const OUT = {
    fade: (t, d) => [[t, { o: 1 }], [t + d, { o: 0 }, 'in']],
    up: (t, d) => [[t, { o: 1, y: 0 }], [t + d, { o: 0, y: -40 }, 'in']],
    blur: (t, d) => [[t, { o: 1, b: 0 }], [t + d, { o: 0, b: 14 }, 'in']],
    shrink: (t, d) => [[t, { o: 1, s: 1, b: 0 }], [t + d, { o: 0, s: 0.86, b: 10 }, 'in']],
    left: (t, d) => [[t, { o: 1, x: 0 }], [t + d, { o: 0, x: -120 }, 'in']],
  };
  const SCENE_OUT = {
    blur: (D) => [[D - 0.8, { o: 1, b: 0, s: 1 }], [D, { o: 0, b: 10, s: 1.04 }, 'in']],
    zoom: (D) => [[D - 0.7, { o: 1, b: 0, s: 1 }], [D, { o: 0, b: 6, s: 1.25 }, 'in']],
    left: (D) => [[D - 0.55, { o: 1, x: 0, b: 0 }], [D, { o: 0, x: -180, b: 8 }, 'in']],
    fade: (D) => [[D - 0.8, { o: 1 }], [D, { o: 0 }, 'in']],
    cut: () => [],
  };

  // ════════════════════════════════════════════════════════════════════
  //  Szenen einlesen
  // ════════════════════════════════════════════════════════════════════
  const CHAPTERS = ['', 'Siegeszug der KI', 'Unsere Philosophie', 'Audiophile Anpassung', 'trueLOUDNESS & RevoLoud', 'Handwerk & Gehörschutz'];
  const scenes = [...document.querySelectorAll('.scene')].map((el) => ({
    el,
    id: el.dataset.id,
    hook: el.dataset.hook || el.dataset.id,
    dur: parseFloat(el.dataset.dur),
    chapter: parseInt(el.dataset.chapter || '0', 10),
    bg: (el.dataset.bg || '').split(/\s+/).filter(Boolean),
    out: el.dataset.out || 'blur',
    flash: (el.dataset.flash || '').split(',').filter(Boolean).map(Number),
    sweep: (el.dataset.sweep || '').split(',').filter(Boolean).map(Number),
    items: [],
  }));
  let TOTAL = 0;
  scenes.forEach((s, i) => { s.start = TOTAL; TOTAL += s.dur; s.idx = i; });
  scenes.forEach((s, i) => { s.prev = scenes[(i - 1 + scenes.length) % scenes.length]; s.next = scenes[(i + 1) % scenes.length]; });

  const chStart = [], chEnd = [];
  scenes.forEach((s) => {
    if (!s.chapter) return;
    if (chStart[s.chapter] == null) chStart[s.chapter] = s.start;
    chEnd[s.chapter] = s.start + s.dur;
  });

  const FLASHES = [], SWEEPS = [];
  scenes.forEach((s) => {
    s.flash.forEach((f) => FLASHES.push(s.start + f));
    s.sweep.forEach((f) => SWEEPS.push(s.start + f));
  });

  function initScene(s) {
    s.el.querySelectorAll('[data-a],[data-o]').forEach((el) => {
      const d = el.dataset;
      if (d.a && IN[d.a]) addKeys(el, IN[d.a](parseFloat(d.t || 0), parseFloat(d.d || (d.a === 'rise' ? 1.1 : 1.0)), parseFloat(d.ls || 0)));
      if (d.o) addKeys(el, OUT[d.oa || 'fade'](parseFloat(d.o), parseFloat(d.od || 0.6)));
      s.items.push(el);
    });
    addKeys(s.el, [[0, { o: 0 }], [0.35, { o: 1 }, 'out']]);
    addKeys(s.el, SCENE_OUT[s.out](s.dur));
    s.ghost = [...s.el.querySelectorAll('[data-ghost]')];
    s.spin = [...s.el.querySelectorAll('[data-spin]')];
    s.float = [...s.el.querySelectorAll('[data-float]')];
    s.eq = [...s.el.querySelectorAll('[data-eq] i')];
    const h = HOOKS[s.hook];
    if (h && h.setup) h.setup(s);
  }

  // Dauerhafte Hintergrund-Ebene über Szenengrenzen hinweg weich halten
  function contAlpha(s, name, lt) {
    let a = 1;
    if (!s.prev.bg.includes(name) && lt < 0.9) a = Math.min(a, lt / 0.9);
    if (!s.next.bg.includes(name) && s.dur - lt < 0.9) a = Math.min(a, (s.dur - lt) / 0.9);
    return clamp(a, 0, 1);
  }

  // ════════════════════════════════════════════════════════════════════
  //  Canvas-Ebenen
  // ════════════════════════════════════════════════════════════════════
  function drawDust(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // weiche Bokeh-Kreise
    for (let i = 0; i < 14; i++) {
      const x = R(i, 51) * W + Math.sin(t * 0.07 + i) * 80;
      const y = fract(R(i, 52) - t * (0.004 + R(i, 53) * 0.008)) * (H + 300) - 150;
      const r = 40 + R(i, 54) * 90;
      const a = 0.035 + 0.035 * Math.sin(t * 0.4 + i * 2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(240,206,122,${a})`); g.addColorStop(1, 'rgba(240,206,122,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // feiner Goldstaub
    for (let i = 0; i < 130; i++) {
      const sp = 10 + R(i, 3) * 26;
      const x = R(i, 1) * W + Math.sin(t * 0.3 + i) * 30;
      const y = ((R(i, 2) * H - t * sp) % H + H) % H;
      const s = 0.8 + R(i, 4) * 2;
      const a = (0.12 + 0.35 * R(i, 5)) * (0.55 + 0.45 * Math.sin(t * 1.3 + i));
      ctx.fillStyle = `rgba(240,206,122,${a})`;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();
  }

  function drawRings(cx, cy, lt, a, every = 1.6, life = 5, maxR = 1150, w = 1.5) {
    if (a <= 0) return;
    ctx.save();
    const n = Math.floor(lt / every);
    for (let k = Math.max(0, n - Math.ceil(life / every)); k <= n; k++) {
      const age = lt - k * every;
      if (age < 0 || age > life) continue;
      const r = ez('out', age / life) * maxR;
      const al = (1 - age / life) * a;
      ctx.strokeStyle = `rgba(240,206,122,${al * 0.55})`; ctx.lineWidth = w;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(209,175,52,${al * 0.18})`; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.97, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function glowDot(x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,241,196,${0.95 * a})`); g.addColorStop(0.4, `rgba(240,206,122,${0.5 * a})`); g.addColorStop(1, 'rgba(209,175,52,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Neuronales Netz (KI-Kapitel)
  const NET = [];
  for (let i = 0; i < 46; i++) NET.push({ x: 60 + R(i, 31) * 1800, y: 60 + R(i, 32) * 960, ph: R(i, 33) * 6.283 });
  const EDGES = [];
  NET.forEach((n, i) => {
    const d = NET.map((m, j) => [j, Math.hypot(m.x - n.x, m.y - n.y)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < 3; k++) {
      const j = d[k][0];
      if (!EDGES.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) EDGES.push([i, j]);
    }
  });
  function bgNet(lt, a, s, t) {
    if (a <= 0) return;
    const P = NET.map((n) => [n.x + Math.sin(t * 0.21 + n.ph) * 38, n.y + Math.cos(t * 0.17 + n.ph * 1.3) * 30]);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(209,175,52,${0.13 * a})`;
    ctx.beginPath();
    for (const [i, j] of EDGES) { ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); }
    ctx.stroke();
    ctx.fillStyle = `rgba(240,206,122,${0.4 * a})`;
    for (const p of P) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    EDGES.forEach(([i, j], k) => {
      if (R(k, 35) < 0.45) return;
      const f = fract(t * (0.15 + R(k, 36) * 0.2) + R(k, 34));
      const x = lerp(P[i][0], P[j][0], f), y = lerp(P[i][1], P[j][1], f);
      glowDot(x, y, 9, a * 0.7 * Math.sin(Math.PI * f));
    });
    ctx.restore();
  }

  // Radialer Audio-Visualizer um den Geräte-Halo
  function bgViz(lt, a, s) {
    if (!s.vizC) return;
    const env = ez('out', (lt - 0.4) / 1.0) * clamp((s.dur - 0.5 - lt) / 0.4, 0, 1);
    if (env <= 0) return;
    const [cx, cy] = s.vizC;
    const N = 120, r0 = 318;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const t = lt + 3;
      const v = (Math.sin(t * 7 + i * 0.37) * 0.5 + 0.5) * (Math.sin(t * 2.7 + i * 0.13) * 0.5 + 0.5) * (0.55 + 0.45 * Math.sin(t * 11 + i));
      const len = (6 + v * 80) * env;
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(ang), sn = Math.sin(ang);
      ctx.strokeStyle = rgba(goldAt(i / N), (0.25 + 0.55 * v) * env * a);
      ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + sn * r0); ctx.lineTo(cx + c * (r0 + len), cy + sn * (r0 + len)); ctx.stroke();
    }
    ctx.restore();
  }

  // Fließende Klangwellen (Audiophil)
  function bgWaves(lt, a, s, t) {
    if (a <= 0) return;
    ctx.save();
    for (let L = 0; L < 6; L++) {
      const amp = 38 + L * 20, cy = 850 - L * 8, f1 = 0.0032 * (1 + L * 0.18), sp = 0.5 + L * 0.12;
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 10) {
        const env = Math.sin(Math.PI * clamp(x / W, 0, 1));
        const y = cy + Math.sin(x * f1 + t * sp + L * 1.7) * amp * env + Math.sin(x * f1 * 3.1 - t * sp * 1.6 + L) * amp * 0.22 * env;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(L % 2 ? C_GOLD2 : C_GOLD1, (0.08 + L * 0.03) * a);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  const BG = {
    net: (lt, a, s, t) => bgNet(lt, contAlpha(s, 'net', lt), s, t),
    viz: (lt, a, s) => bgViz(lt, a, s),
    waves: (lt, a, s, t) => bgWaves(lt, contAlpha(s, 'waves', lt), s, t),
    rings: (lt, a) => drawRings(960, 540, lt, a * 0.45, 1.8, 5.5, 1150),
  };

  // ════════════════════════════════════════════════════════════════════
  //  Partikel-Schriftzug (EUHA 2026 → KI)
  // ════════════════════════════════════════════════════════════════════
  const PN = 3600;
  let PART = null;
  function sampleText(text, cy, fs, gap) {
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const o = off.getContext('2d');
    o.font = `700 ${fs}px "Source Serif 4", Georgia, serif`;
    o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle';
    o.fillText(text, W / 2, cy);
    const d = o.getImageData(0, 0, W, H).data;
    const pts = [];
    let n = 0;
    for (let y = 0; y < H; y += gap) {
      for (let x = 0; x < W; x += gap) {
        if (d[(y * W + x) * 4 + 3] > 140) { pts.push([x + (R(n, 21) - 0.5) * gap * 0.9, y + (R(n, 22) - 0.5) * gap * 0.9]); n++; }
      }
    }
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(R(i, 23) * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    return pts.length ? pts : [[W / 2, cy]];
  }
  function buildParticles() {
    const A = sampleText('EUHA 2026', 500, 324, 3);
    const B = sampleText('KI', 610, 520, 3);
    const bucket = (x) => Math.min(7, Math.floor(clamp((x - 200) / 1520, 0, 0.999) * 8));
    PART = [];
    for (let i = 0; i < PN; i++) {
      const a = A[i % A.length], b = B[i % B.length];
      PART.push({
        a0: R(i, 1) * Math.PI * 2, sp: 0.25 + R(i, 2) * 0.95, spin: (R(i, 3) - 0.5) * 2, born: 0.3 + R(i, 4) * 1.8,
        ax: a[0], ay: a[1], bx: b[0], by: b[1], d1: R(i, 5) * 0.55, d2: R(i, 6) * 0.6, seed: R(i, 7) * 1000,
        arc: (R(i, 8) - 0.5) * 300, ex: Math.cos(R(i, 9) * 6.283), ey: Math.sin(R(i, 9) * 6.283), es: 0.4 + R(i, 10),
        sz: R(i, 11) < 0.62 ? 0 : 1, ca: bucket(a[0]), cb: bucket(b[0]),
      });
    }
  }
  const PCX = 960, PCY = 500;
  function ppos(p, t) {
    if (t < 2.4 && t < p.born) return null;
    const tb = Math.max(0, Math.min(t, 2.4) - p.born);
    const ang = p.a0 + tb * 0.8 * p.spin, rad = p.sp * (1 - Math.exp(-tb * 1.2)) * 620;
    const sx = PCX + Math.cos(ang) * rad, sy = PCY + Math.sin(ang) * rad * 0.75;
    if (t < 2.4) return [sx, sy];
    if (t < 6.2) {
      const k = ez('io', (t - 2.4 - p.d1) / 1.7);
      const sw = (1 - k) * 70;
      let x = lerp(sx, p.ax, k) + Math.cos(p.seed + t * 3) * sw, y = lerp(sy, p.ay, k) + Math.sin(p.seed + t * 3) * sw;
      if (k >= 1) { x += Math.sin(t * 9 + p.seed) * 0.5; y += Math.cos(t * 7 + p.seed) * 0.5; }
      return [x, y];
    }
    if (t < 12.9) {
      const k = ez('io', (t - 6.2 - p.d2) / 1.5);
      const bump = Math.sin(Math.PI * k);
      return [lerp(p.ax, p.bx, k) + bump * p.arc + Math.sin(t * 8 + p.seed) * 0.5,
              lerp(p.ay, p.by, k) - bump * Math.abs(p.arc) * 0.4 + Math.cos(t * 6 + p.seed) * 0.5];
    }
    const te = t - 12.9, d = (1 - Math.exp(-te * 2.2)) * 900 * p.es;
    return [p.bx + p.ex * d, p.by + p.ey * d];
  }
  function drawParticles(t, a) {
    if (!PART) return;
    let alpha = t < 2.4 ? 0.75 : 1;
    if (t > 12.9) alpha = Math.max(0, 1 - (t - 12.9) / 1.0);
    alpha *= a;
    if (alpha <= 0) return;
    const glint = t > 4.4 && t < 5.9 ? ((t - 4.4) / 1.3) * (W + 400) - 200 : t > 8.2 && t < 9.6 ? ((t - 8.2) / 1.2) * (W + 400) - 200 : -9999;
    const paths = [];
    for (let j = 0; j < 17; j++) paths.push(new Path2D());
    const dt = 1 / 30;
    for (const p of PART) {
      const c = ppos(p, t);
      if (!c) continue;
      const q = ppos(p, Math.max(0, t - dt)) || c;
      let idx = (t < 6.95 + p.d2 ? p.ca : p.cb) * 2 + p.sz;
      if (Math.abs(c[0] - glint) < 85) idx = 16;
      paths[idx].moveTo(q[0], q[1]);
      paths[idx].lineTo(c[0] + 0.01, c[1]);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.globalAlpha = alpha;
    for (let j = 0; j < 16; j++) {
      ctx.strokeStyle = rgba(goldAt((j >> 1) / 7), 1);
      ctx.lineWidth = j & 1 ? 2.8 : 1.8;
      ctx.stroke(paths[j]);
    }
    ctx.strokeStyle = 'rgb(255,246,220)'; ctx.lineWidth = 2.6;
    ctx.stroke(paths[16]);
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════
  //  Szenen-Hooks
  // ════════════════════════════════════════════════════════════════════
  const FONT = (px, w = 400, it = false) => `${it ? 'italic ' : ''}${w} ${px}px "Source Serif 4", Georgia, serif`;
  function capsText(txt, x, y, px, col, a, align = 'left', spacing = 0.22) {
    ctx.save();
    ctx.font = FONT(px);
    ctx.fillStyle = rgba(col, a);
    ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = (px * spacing).toFixed(1) + 'px'; } catch (e) { /* ältere Browser */ }
    ctx.textAlign = align;
    ctx.fillText(txt.toUpperCase(), x, y);
    ctx.restore();
  }
  function plainText(txt, x, y, px, col, a, align = 'left', it = false) {
    ctx.save();
    ctx.font = FONT(px, 300, it);
    ctx.fillStyle = rgba(col, a);
    ctx.textBaseline = 'middle'; ctx.textAlign = align;
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  function logoGlide(id, tIn, tGlide) {
    return {
      setup(s) {
        const lw = s.el.querySelector(id);
        addKeys(lw, [[tIn, { o: 0, b: 26, s: 1.16 }], [tIn + 2.6, { o: 1, b: 0, s: 1 }, 'out'], [tGlide, { x: 0, s: 1 }], [tGlide + 1.5, { x: -490, s: 0.8 }, 'io']]);
        s.items.push(lw);
        s.logo = lw;
      },
      draw(lt, a, s) {
        const x = 960 + ev(s.logo._tr.x, lt);
        if (lt < 2.2) glowDot(x, 540, 30 * (1 + Math.sin(lt * 12) * 0.2), a * clamp(1 - (lt - 1.2) / 1.0, 0, 1));
        drawRings(x, 540, lt - 0.2, a * 0.42, 1.5, 4.8, 1200);
      },
    };
  }

  const HOOKS = {
    intro: logoGlide('#introLogo', 0.8, 6.0),
    outro: logoGlide('#outroLogo', 0.3, 3.0),

    sting: {
      draw(lt, a) {
        glowDot(960, 540, 40, a * clamp(1 - lt / 0.8, 0, 1));
        drawRings(960, 540, lt, a * 0.5, 1.1, 4, 1250, 1.6);
      },
    },

    k1: {
      draw(lt, a) {
        if (lt > 0.3 && lt < 2.8) {
          const pulse = 1 + Math.sin(lt * 14) * 0.25;
          glowDot(PCX, PCY, 26 * pulse, a * clamp((2.8 - lt) / 0.5, 0, 1));
        }
        if (lt < 3.6) drawRings(PCX, PCY, lt - 0.3, a * 0.8 * clamp((3.6 - lt) / 1, 0, 1), 0.42, 2.4, 1300);
        drawParticles(lt, a);
      },
    },

    dev: {
      setup(s) {
        // Mittelpunkt des Halos auf der Bühne bestimmen (für den Visualizer)
        s.measure = () => {
          const h = s.el.querySelector('.halo');
          const sr = stage.getBoundingClientRect(), r = h.getBoundingClientRect();
          s.vizC = [(r.left + r.width / 2 - sr.left) / SC, (r.top + r.height / 2 - sr.top) / SC];
        };
      },
    },

    p2: {
      setup(s) {
        const box = s.el.querySelector('#sizes');
        const nums = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47];
        const pos = nums.map((n, i) => (i % 2 === 0 ? [-660 + (i / 2) * 265, -70 + (i % 4) * 8] : [-530 + ((i - 1) / 2) * 265, 110 - (i % 3) * 10]));
        nums.forEach((n, i) => {
          const el = document.createElement('span');
          el.className = 'p-num';
          el.textContent = n;
          el.style.marginLeft = '-70px';
          box.appendChild(el);
          const [x, y] = pos[i];
          const t0 = 1.5 + i * 0.12;
          addKeys(el, [[t0, { o: 0, x, y, s: 0.5, b: 8 }], [t0 + 0.8, { o: 1, s: 1, b: 0 }, 'expo'],
            [3.9 + i * 0.04, { x, y, o: 1, s: 1 }], [4.8 + i * 0.03, { x: 0, y: 30, o: 0, s: 0.3, b: 6 }, 'in']]);
          s.items.push(el);
        });
      },
    },

    p3: {
      draw(lt, a) {
        const X0 = 1060, X1 = 1770, CY = 500, AMP = 105;
        const times = [1.2, 2.8, 4.4, 6.0];
        let m = -1; times.forEach((tt, i) => { if (lt >= tt) m = i; });
        const k = m < 0 ? 1 : ez('io', (lt - times[m]) / 0.5);
        const base = (x, t) => Math.sin(x * 0.045 + t * 4) * 0.6 + Math.sin(x * 0.013 - t * 1.3) * 0.4;
        const shape = (mode, x, t) => {
          const b = base(x, t);
          if (mode === 0) return clamp(b * 2.3, -1.15, 1.15);
          if (mode === 1) return b * 0.22;
          if (mode === 2) return b + 0.38 * Math.sign(Math.sin(x * 0.55 + t * 22)) * Math.abs(b);
          if (mode === 3) return b * 0.85;
          return b;
        };
        const env = ez('out', (lt - 0.6) / 0.8);
        if (env <= 0) return;
        ctx.save();
        ctx.strokeStyle = `rgba(245,240,232,${0.12 * a})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X0, CY); ctx.lineTo(X1, CY); ctx.stroke();
        ctx.setLineDash([4, 10]);
        ctx.beginPath(); ctx.moveTo(X0, CY - AMP * 1.15); ctx.lineTo(X1, CY - AMP * 1.15); ctx.moveTo(X0, CY + AMP * 1.15); ctx.lineTo(X1, CY + AMP * 1.15); ctx.stroke();
        ctx.setLineDash([]);
        const yAt = (x) => {
          const xr = x - X0, edge = Math.sin(Math.PI * (xr / (X1 - X0)));
          const prev = shape(m - 1, xr, lt), cur = shape(m, xr, lt);
          return CY - lerp(prev, cur, k) * AMP * edge * env;
        };
        const ghosts = m === 3 ? [[54, 0.12], [36, 0.2], [18, 0.32]] : [];
        for (const [off, ga] of ghosts) {
          ctx.strokeStyle = `rgba(240,206,122,${ga * a * k})`; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let x = X0; x <= X1; x += 4) { const y = yAt(x - off); if (x === X0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.stroke();
        }
        ctx.shadowColor = 'rgba(240,206,122,0.7)'; ctx.shadowBlur = 14;
        ctx.strokeStyle = `rgba(240,206,122,${0.95 * a})`; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = X0; x <= X1; x += 3) { const y = yAt(x); if (x === X0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.restore();
        const names = ['Natürlich', 'Zu laut', 'Zu leise', 'Hart', 'Hallend'];
        capsText(names[m + 1], X0, CY - AMP * 1.15 - 34, 20, C_GOLD1, a * env, 'left');
      },
    },

    p5: {
      setup(s) { s.mq = s.el.querySelector('#marquee'); },
      update(lt, s) {
        const w = s.mq.scrollWidth / 2 || 1600;
        s.mq.style.left = (-((lt * 150) % w) + 40) + 'px';
      },
    },

    a1: {},

    a2: {
      draw(lt, a) {
        const X0 = 150, X1 = 1770, BASE = 770, HM = 280, N = 72;
        const lx = (f) => X0 + (Math.log10(f) - Math.log10(20)) / 3 * (X1 - X0);
        const k = ez('io', (lt - 5.6) / 1.6);
        const lo = Math.pow(10, lerp(Math.log10(250), Math.log10(30), k));
        const hi = Math.pow(10, lerp(Math.log10(4000), Math.log10(16000), k));
        const bw = (X1 - X0) / N;
        ctx.save();
        for (let i = 0; i < N; i++) {
          const f = 20 * Math.pow(1000, (i + 0.5) / N);
          const lg = Math.log10(f);
          const e = clamp(1 - 0.16 * Math.pow(lg - 2.4, 2), 0.18, 1);
          const v = (Math.sin(lt * 6 + i * 0.5) * 0.5 + 0.5) * (Math.sin(lt * 2.3 + i * 0.17) * 0.5 + 0.5);
          const grow = ez('out', (lt - 0.8 - i * 0.012) / 0.9);
          const h = HM * (0.28 + 0.72 * v) * e * grow;
          const x = X0 + i * bw + bw * 0.18;
          const inside = f >= lo && f <= hi;
          if (inside) {
            const g = ctx.createLinearGradient(0, BASE - h, 0, BASE);
            g.addColorStop(0, `rgba(240,206,122,${0.95 * a})`); g.addColorStop(1, `rgba(209,175,52,${0.25 * a})`);
            ctx.fillStyle = g;
          } else ctx.fillStyle = `rgba(245,240,232,${0.1 * a})`;
          ctx.fillRect(x, BASE - h, bw * 0.64, h);
        }
        // Achse
        ctx.strokeStyle = `rgba(245,240,232,${0.3 * a})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X0, BASE + 0.5); ctx.lineTo(X1, BASE + 0.5); ctx.stroke();
        [[20, '20 Hz'], [100, '100'], [1000, '1.000'], [10000, '10.000'], [20000, '20.000 Hz']].forEach(([f, l], i) => {
          plainText(l, lx(f), BASE + 30, 22, C_CREAM, 0.55 * a, i === 0 ? 'left' : i === 4 ? 'right' : 'center');
        });
        // Klammer
        const bx0 = lx(lo), bx1 = lx(hi), by = BASE + 72;
        const ba = a * ez('out', (lt - 1.6) / 0.8);
        ctx.strokeStyle = `rgba(240,206,122,${0.9 * ba})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx0, by - 12); ctx.lineTo(bx0, by); ctx.lineTo(bx1, by); ctx.lineTo(bx1, by - 12); ctx.stroke();
        const k1 = clamp(1 - (lt - 5.4) / 0.4, 0, 1), k2 = clamp((lt - 6.6) / 0.6, 0, 1);
        plainText('Sprache: ca. 250 – 4.000 Hz', (bx0 + bx1) / 2, by + 36, 30, C_CREAM, 0.9 * ba * k1, 'center', true);
        plainText('Musik: ca. 30 – 16.000 Hz und mehr', (bx0 + bx1) / 2, by + 36, 30, C_GOLD2, 0.95 * ba * k2, 'center', true);
        ctx.restore();
      },
    },

    a3: {
      draw(lt, a) {
        const panels = [[150, 910, 0.8, false], [1010, 1770, 1.6, true]];
        const CY = 615, HH = 135;
        const music = (u) => {
          const n = R(Math.floor(u), 41);
          const pk = Math.pow(Math.max(0, Math.sin(u * 0.045)), 6) * (0.6 + 0.4 * R(Math.floor(u / 30), 42));
          const pk2 = Math.pow(Math.max(0, Math.sin(u * 0.11 + 1)), 10) * 0.5;
          return clamp(0.1 + 0.18 * n + 0.75 * pk + pk2 * 0.4, 0, 1);
        };
        ctx.save();
        for (const [x0, x1, t0, dyn] of panels) {
          const rev = ez('io', (lt - t0) / 1.0);
          if (rev <= 0) continue;
          const xe = lerp(x0, x1, rev);
          ctx.strokeStyle = `rgba(245,240,232,${0.15 * a})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, CY); ctx.lineTo(xe, CY); ctx.stroke();
          for (let x = x0; x < xe; x += 6) {
            const u = (x - x0) / 6 + lt * 22;
            const m = music(u);
            const amp = dyn ? m : 0.62 + 0.18 * Math.pow(m, 0.3);
            const h = amp * HH;
            if (dyn) ctx.strokeStyle = rgba(goldAt(clamp((x - x0) / (x1 - x0), 0, 1)), (0.45 + 0.55 * m) * a);
            else ctx.strokeStyle = `rgba(245,240,232,${0.42 * a})`;
            ctx.lineWidth = 3.2;
            ctx.beginPath(); ctx.moveTo(x + 1.5, CY - h); ctx.lineTo(x + 1.5, CY + h); ctx.stroke();
          }
        }
        ctx.restore();
      },
    },

    t1: {
      draw(lt, a) {
        ctx.save();
        // ── linkes Diagramm: Audiogramm ──
        const L = { x0: 190, x1: 870, y0: 470, y1: 830 };
        const R2 = { x0: 1090, x1: 1770, y0: 470, y1: 830 };
        const ax = ez('out', (lt - 0.6) / 0.8);
        capsText('Hörschwelle (Audiogramm)', L.x0, L.y0 - 36, 20, C_GOLD1, a * ax);
        capsText('Lautheitsempfinden', R2.x0, R2.y0 - 36, 20, C_GOLD1, a * ez('out', (lt - 3.0) / 0.8));
        const grid = (P, al) => {
          ctx.strokeStyle = `rgba(245,240,232,${0.09 * al})`; ctx.lineWidth = 1;
          for (let i = 0; i <= 5; i++) { const y = lerp(P.y0, P.y1, i / 5); ctx.beginPath(); ctx.moveTo(P.x0, y); ctx.lineTo(P.x1, y); ctx.stroke(); }
          ctx.strokeStyle = `rgba(245,240,232,${0.35 * al})`;
          ctx.beginPath(); ctx.moveTo(P.x0, P.y0); ctx.lineTo(P.x0, P.y1); ctx.lineTo(P.x1, P.y1); ctx.stroke();
        };
        grid(L, a * ax);
        const freqs = ['125', '250', '500', '1k', '2k', '4k', '8k'];
        const hl = [15, 15, 20, 30, 45, 55, 60];
        freqs.forEach((f, i) => plainText(f, lerp(L.x0 + 30, L.x1 - 20, i / 6), L.y1 + 28, 20, C_CREAM, 0.5 * a * ax, 'center'));
        plainText('Hz', L.x1, L.y1 + 58, 18, C_CREAM, 0.4 * a * ax, 'right', true);
        const ptL = (i, off) => [lerp(L.x0 + 30, L.x1 - 20, i / 6), lerp(L.y0, L.y1, (hl[i] + off) / 100)];
        const prog = ez('io', (lt - 1.0) / 1.6);
        [[0, C_CREAM, 'o'], [0, C_GOLD2, 'x']].forEach(([off, col, sym], pi) => {
          ctx.strokeStyle = rgba(col, (pi ? 0.95 : 0.6) * a); ctx.lineWidth = pi ? 2.5 : 4;
          if (pi) ctx.setLineDash([10, 8]); else ctx.setLineDash([]);
          ctx.beginPath();
          const n = prog * 6;
          for (let i = 0; i <= Math.floor(n); i++) { const [x, y] = ptL(i, off); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          if (n < 6) { const i = Math.floor(n), f = n - i; const [x0, y0] = ptL(i, off), [x1, y1] = ptL(i + 1, off); ctx.lineTo(lerp(x0, x1, f), lerp(y0, y1, f)); }
          ctx.stroke(); ctx.setLineDash([]);
          for (let i = 0; i <= Math.floor(n); i++) {
            const [x, y] = ptL(i, off);
            ctx.lineWidth = 2.5;
            if (sym === 'o') { ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); }
            else { ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke(); }
          }
        });
        const lg = a * ez('out', (lt - 2.4) / 0.6);
        plainText('Person A  ○', L.x1, L.y0 + 10, 24, C_CREAM, 0.8 * lg, 'right', true);
        plainText('Person B  ×', L.x1, L.y0 + 44, 24, C_GOLD2, 0.95 * lg, 'right', true);

        // ── rechtes Diagramm: Lautheit ──
        const ar = ez('out', (lt - 3.0) / 0.8);
        grid(R2, a * ar);
        const cats = [['sehr leise', 5], ['leise', 15], ['mittel', 25], ['laut', 35], ['sehr laut', 45]];
        cats.forEach(([n, cu]) => plainText(n, R2.x0 - 14, lerp(R2.y1, R2.y0, cu / 50), 19, C_CREAM, 0.5 * a * ar, 'right', true));
        plainText('Pegel →', R2.x1, R2.y1 + 30, 20, C_CREAM, 0.5 * a * ar, 'right', true);
        const cuA = (Lv) => 50 / (1 + Math.exp(-(Lv - 62) / 10));
        const cuB = (Lv) => 50 / (1 + Math.exp(-(Lv - 50) / 6.5));
        const div = ez('io', (lt - 5.4) / 1.6);
        const pr = ez('io', (lt - 3.4) / 1.6);
        const pt = (Lv, f) => [lerp(R2.x0, R2.x1, Lv / 100), lerp(R2.y1, R2.y0, f(Lv) / 50)];
        const fB = (Lv) => lerp(cuA(Lv), cuB(Lv), div);
        // Fläche zwischen den Kurven
        if (div > 0) {
          ctx.fillStyle = `rgba(240,206,122,${0.14 * a * div})`;
          ctx.beginPath();
          for (let Lv = 0; Lv <= 100; Lv += 2) { const [x, y] = pt(Lv, cuA); if (Lv === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          for (let Lv = 100; Lv >= 0; Lv -= 2) { const [x, y] = pt(Lv, fB); ctx.lineTo(x, y); }
          ctx.fill();
        }
        [[cuA, C_CREAM, 4, 0.6], [fB, C_GOLD2, 3, 0.95]].forEach(([f, col, lw, al]) => {
          ctx.strokeStyle = rgba(col, al * a); ctx.lineWidth = lw;
          ctx.beginPath();
          for (let Lv = 0; Lv <= 100 * pr; Lv += 1) { const [x, y] = pt(Lv, f); if (Lv === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.stroke();
        });
        if (div > 0.2) {
          const [xa, ya] = pt(55, cuA), [xb, yb] = pt(55, fB);
          plainText('Person A', xa + 18, ya + 22, 24, C_CREAM, 0.8 * a * div, 'left', true);
          plainText('Person B', xb - 18, yb - 20, 24, C_GOLD2, 0.95 * a * div, 'right', true);
        }
        ctx.restore();
      },
    },

    t2: {
      setup(s) {
        s.segs = [...s.el.querySelectorAll('#scaleBar i')];
        s.cur = s.el.querySelector('#scaleCursor');
        s.name = s.el.querySelector('#scaleName');
        s.names = ['nicht gehört', 'sehr leise', 'leise', 'mittel', 'laut', 'sehr laut', 'zu laut'];
      },
      update(lt, s) {
        const v = lt < 3.2 ? 0 : 0.5 - 0.5 * Math.cos((lt - 3.2) * 0.85);
        const idx = 0.5 + v * 6;
        s.segs.forEach((el, i) => { el.style.opacity = clamp(idx - i + 0.5, 0, 1).toFixed(3); });
        s.cur.style.left = ((idx / 7) * 100) + '%';
        const n = s.names[clamp(Math.round(idx - 0.5), 0, 6)];
        if (s.name.textContent !== n) s.name.textContent = n;
      },
    },

    t3: {
      draw(lt, a) {
        const X0 = 1110, X1 = 1760, Y0 = 300, Y1 = 790, C = 14, Rw = 9;
        const thr = (c) => 3.2 + 1.6 * Math.sin(c * 0.5 + 0.6) + c * 0.12;
        const val = (c, r) => 1 / (1 + Math.exp(-(r - thr(c)) * 0.9));
        ctx.save();
        const ax = ez('out', (lt - 0.4) / 0.8);
        ctx.strokeStyle = `rgba(245,240,232,${0.3 * a * ax})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X0 - 30, Y0 - 20); ctx.lineTo(X0 - 30, Y1 + 30); ctx.lineTo(X1 + 10, Y1 + 30); ctx.stroke();
        capsText('Frequenz', X1 + 10, Y1 + 62, 18, C_GOLD1, a * ax, 'right');
        ctx.save(); ctx.translate(X0 - 58, Y0 - 10); ctx.rotate(-Math.PI / 2); capsText('Pegel', 0, 0, 18, C_GOLD1, a * ax, 'right'); ctx.restore();
        for (let c = 0; c < C; c++) {
          for (let r = 0; r < Rw; r++) {
            const k = c * Rw + r;
            const app = ez('back', (lt - 0.8 - k * 0.033) / 0.5);
            if (app <= 0) continue;
            const v = val(c, r);
            const x = lerp(X0, X1, c / (C - 1)), y = lerp(Y1, Y0, r / (Rw - 1));
            const pul = 1 + 0.08 * Math.sin(lt * 3 + k);
            const rad = (4 + v * 14) * app * pul;
            const col = [lerp(C_CREAM[0], C_GOLD2[0], v), lerp(C_CREAM[1], C_GOLD2[1], v), lerp(C_CREAM[2], C_GOLD2[2], v)];
            ctx.fillStyle = rgba(col, (0.18 + 0.75 * v) * a);
            ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
          }
        }
        // Isolinie „angenehm laut"
        const pr = ez('io', (lt - 5.6) / 1.6);
        if (pr > 0) {
          ctx.strokeStyle = `rgba(255,241,196,${0.95 * a})`; ctx.lineWidth = 3;
          ctx.shadowColor = 'rgba(240,206,122,0.8)'; ctx.shadowBlur = 16;
          ctx.beginPath();
          const steps = 80;
          for (let i = 0; i <= steps * pr; i++) {
            const c = (i / steps) * (C - 1);
            const r = thr(c);
            const x = lerp(X0, X1, c / (C - 1)), y = lerp(Y1, Y0, r / (Rw - 1));
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          if (pr > 0.95) plainText('Ihr persönliches Lautheitsprofil', X1, Y0 - 34, 24, C_GOLD2, a * clamp((lt - 7.2) / 0.6, 0, 1), 'right', true);
        }
        ctx.restore();
      },
    },

    t4: {},

    h1: { draw(lt, a) { drawScan(1390, 520, 1.1, lt, ez('io', (lt - 0.6) / 4.2), a, true); } },
    h2: { draw(lt, a) { drawScan(1500, 660, 1.0, lt + 11, 1, a * 0.22, false); } },

    h3: {
      setup(s) { s.car = [...s.el.querySelectorAll('#carousel img')]; },
      update(lt, s) {
        const n = s.car.length;
        s.car.forEach((img, i) => {
          const ang = lt * 0.42 + (i * Math.PI * 2) / n - 0.4;
          const z = Math.cos(ang), d = (z + 1) / 2;
          const x = Math.sin(ang) * 330;
          const app = ez('out', (lt - 0.4 - i * 0.12) / 0.8);
          const sc = 0.38 + 0.62 * Math.pow(d, 1.3);
          img.style.transform = `translate3d(${x.toFixed(1)}px, ${(-z * 26 + (1 - app) * 80).toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
          img.style.opacity = ((0.06 + 0.94 * Math.pow(d, 2.2)) * app).toFixed(3);
          img.style.zIndex = String(Math.round(d * 100));
        });
      },
    },
  };

  // ── 3D-Drahtgitter: digitaler Ohrabdruck ───────────────────────────
  function drawScan(cx, cy, scale, t, build, a, caption) {
    if (a <= 0) return;
    const U = 26, TH = 36;
    const rotY = t * 0.45 - 0.6, tilt = 0.32 + Math.sin(t * 0.3) * 0.08;
    const cyr = Math.cos(rotY), syr = Math.sin(rotY), ct = Math.cos(tilt), st = Math.sin(tilt);
    const spine = (u) => [(u - 0.5) * 560, -80 * Math.sin(u * Math.PI * 1.25) + 50 * u, 60 * Math.sin(u * Math.PI * 2.1 + 0.5)];
    const rad = (u) => 62 + 78 * Math.exp(-u * 5) - 14 * u + 7 * Math.sin(u * 9);
    const pts = [];
    for (let i = 0; i <= U; i++) {
      const u = i / U, sp = spine(u), r = rad(u), row = [];
      for (let j = 0; j < TH; j++) {
        const th = (j / TH) * Math.PI * 2;
        const x = sp[0], y = sp[1] + Math.cos(th) * r, z = sp[2] + Math.sin(th) * r * 0.74;
        const x1 = x * cyr - z * syr, z1 = x * syr + z * cyr;
        const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        const f = 1100 / (1100 + z2);
        row.push([cx + x1 * f * scale, cy + y2 * f * scale, z2]);
      }
      pts.push(row);
    }
    const scanU = fract(t * 0.22);
    const iMax = build * U;
    ctx.save();
    ctx.lineWidth = 1.2;
    const depthA = (z) => clamp(0.75 - (z + 200) / 700, 0.08, 0.75);
    for (let i = 0; i <= U; i++) {
      if (i > iMax) break;
      const u = i / U;
      const glow = Math.max(0, 1 - Math.abs(u - scanU) * 14);
      const fresh = clamp(1 - (iMax - i) / 3, 0, 1);
      for (let j = 0; j < TH; j++) {
        const p = pts[i][j], q = pts[i][(j + 1) % TH];
        const al = depthA((p[2] + q[2]) / 2) * a;
        ctx.strokeStyle = glow > 0.05 || fresh > 0 ? `rgba(255,241,196,${Math.min(1, al + (glow + fresh) * 0.6 * a)})` : `rgba(209,175,52,${al})`;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
    }
    for (let j = 0; j < TH; j += 2) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= Math.min(U, Math.floor(iMax)); i++) {
        const p = pts[i][j];
        if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
      }
      ctx.strokeStyle = `rgba(240,206,122,${0.22 * a})`;
      ctx.stroke();
    }
    // Scan-Ebene
    if (build >= 1) {
      const i = Math.floor(scanU * U);
      const row = pts[i];
      let mx = 0, my = 0; row.forEach((p) => { mx += p[0]; my += p[1]; }); mx /= TH; my /= TH;
      ctx.globalCompositeOperation = 'lighter';
      glowDot(mx, my, 120 * scale, a * 0.25);
    }
    ctx.restore();
    if (caption) {
      const ca = a * ez('out', (t - 2.2) / 0.8);
      capsText('Digitaler Ohrabdruck', cx, cy + 380, 20, C_GOLD1, ca, 'center');
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  Rendern
  // ════════════════════════════════════════════════════════════════════
  const chromeEl = document.getElementById('chrome');
  const chNum = document.getElementById('chNum');
  const chName = document.getElementById('chName');
  const chSteps = [...document.querySelectorAll('#chSteps i')];
  const flashEl = document.getElementById('flash');
  const sweepEl = document.getElementById('sweep');
  let curIdx = -1, curChapter = -1;

  function sceneAt(t) {
    for (let i = scenes.length - 1; i >= 0; i--) if (t >= scenes[i].start) return i;
    return 0;
  }

  function render(t) {
    t = ((t % TOTAL) + TOTAL) % TOTAL;
    const si = sceneAt(t), s = scenes[si], lt = t - s.start;
    if (si !== curIdx) {
      scenes.forEach((x, i) => x.el.classList.toggle('on', i === si));
      curIdx = si;
      s.needMeasure = true;
    }
    for (const el of s.items) applyEl(el, lt);
    applyEl(s.el, lt);
    if (s.needMeasure && s.measure) { s.needMeasure = false; s.measure(); }
    const sa = s.el._tr.o ? ev(s.el._tr.o, lt) : 1;

    for (const g of s.ghost) g.style.transform = `translateX(${(120 - lt * 95).toFixed(1)}px)`;
    for (const g of s.spin) g.style.transform = `rotate(${(lt * 150).toFixed(1)}deg)`;
    for (const g of s.float) g.style.transform = `translateY(${(Math.sin(lt * 2) * 10).toFixed(2)}px) rotate(${(Math.sin(lt * 1.4) * 1.4).toFixed(2)}deg)`;
    s.eq.forEach((e, i) => { e.style.transform = `scaleY(${(0.25 + 0.75 * Math.abs(Math.sin(lt * (3 + i * 0.9) + i))).toFixed(3)})`; });

    const hook = HOOKS[s.hook];
    if (hook && hook.update) hook.update(lt, s);

    // Canvas
    ctx.setTransform(KX, 0, 0, KX, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawDust(t);
    for (const b of s.bg) if (BG[b]) BG[b](lt, sa, s, t);
    if (hook && hook.draw) hook.draw(lt, sa, s, t);

    // Kopf/Fuß
    let ca = 0;
    if (s.chapter) {
      ca = 1;
      if (!s.prev.chapter && lt < 0.8) ca = lt / 0.8;
      if (!s.next.chapter && s.dur - lt < 0.8) ca = Math.min(ca, (s.dur - lt) / 0.8);
      if (s.chapter !== curChapter) {
        curChapter = s.chapter;
        chNum.textContent = String(s.chapter).padStart(2, '0');
        chName.textContent = CHAPTERS[s.chapter];
      }
      chSteps.forEach((el, i) => {
        const c = i + 1;
        const f = c < s.chapter ? 1 : c > s.chapter ? 0 : (t - chStart[c]) / (chEnd[c] - chStart[c]);
        el.style.transform = `scaleX(${clamp(f, 0, 1).toFixed(4)})`;
      });
    }
    chromeEl.style.opacity = clamp(ca, 0, 1).toFixed(3);

    // Blitz & Lichtschwung
    let fl = 0;
    for (const f of FLASHES) { const d = t - f; if (d >= 0 && d < 0.6) fl = Math.max(fl, 0.9 * Math.pow(1 - d / 0.6, 2)); }
    flashEl.style.opacity = fl.toFixed(3);
    let sw = -800;
    for (const f of SWEEPS) { const d = t - f; if (d >= 0 && d < 1.2) sw = lerp(-800, 2300, ez('io', d / 1.2)); }
    sweepEl.style.left = sw.toFixed(1) + 'px';
  }

  // ════════════════════════════════════════════════════════════════════
  //  Start, Uhr, Tasten
  // ════════════════════════════════════════════════════════════════════
  let base = 0, paused = false, pauseT = 0;
  const now = () => performance.now() / 1000;
  const getT = () => (paused ? pauseT : now() - base);
  function seek(t) { t = ((t % TOTAL) + TOTAL) % TOTAL; if (paused) pauseT = t; else base = now() - t; }

  function loop() {
    render(getT());
    requestAnimationFrame(loop);
  }

  function keys(e) {
    const t = ((getT() % TOTAL) + TOTAL) % TOTAL;
    const si = sceneAt(t);
    if (e.key === ' ') { if (paused) { paused = false; base = now() - pauseT; } else { paused = true; pauseT = t; } e.preventDefault(); }
    else if (e.key === 'ArrowRight') seek(scenes[(si + 1) % scenes.length].start);
    else if (e.key === 'ArrowLeft') seek(t - scenes[si].start > 1.5 ? scenes[si].start : scenes[(si - 1 + scenes.length) % scenes.length].start);
    else if (/^[1-5]$/.test(e.key)) { const c = +e.key; const i = scenes.findIndex((x) => x.chapter === c); seek(scenes[Math.max(0, i - 1)].start); }
    else if (e.key === '0') seek(0);
    else if (e.key === 'f' || e.key === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); }
    else if (e.key === 'h' || e.key === 'H') document.getElementById('help').classList.toggle('on');
  }

  function preload() {
    const imgs = [...document.images].map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; })));
    const fonts = document.fonts ? Promise.all([
      document.fonts.load(FONT(100, 700)), document.fonts.load(FONT(100, 300)), document.fonts.load(FONT(100, 300, true)),
    ]).catch(() => {}) : Promise.resolve();
    return Promise.race([Promise.all([...imgs, fonts]), new Promise((r) => setTimeout(r, 6000))]);
  }

  if (RENDER) stage.style.transition = 'none';
  fit();
  scenes.forEach(initScene);
  const ready = preload().then(() => {
    buildParticles();
    stage.classList.add('ready');
  });

  window.__film = { total: TOTAL, scenes: scenes.map((s) => ({ id: s.id, start: s.start, dur: s.dur })), render, ready };

  if (!RENDER) {
    window.addEventListener('resize', () => { fit(); curIdx = -1; });
    document.addEventListener('keydown', keys);
    document.addEventListener('dblclick', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); });
    ready.then(() => {
      base = now() - (parseFloat(qs.get('t')) || 0);
      requestAnimationFrame(loop);
    });
  }
})();
