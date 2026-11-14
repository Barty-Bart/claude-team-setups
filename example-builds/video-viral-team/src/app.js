/*
 * "Why starting early beats saving more" — deterministic motion-graphics explainer.
 *
 * The whole visual state is a pure function of time: window.renderFrame(tSeconds).
 * No CSS animations/transitions, no requestAnimationFrame-driven state, no clocks
 * (the live preview loop only *chooses* which t to render).
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ constants
  const W = 1920, H = 1080, FPS = 30, DURATION = 36;
  const ANA = '#ffb547', BEN = '#a08fff', INK = '#f4f6ff', MUTED = '#b3bddf';
  const BEN_TXT = '#b8acff'; // lighter violet for Ben's *text* (contrast >= 5.5:1 on the lightest background)

  // ------------------------------------------------------------------ the maths
  // Deposits at the end of each month, compounding monthly at 7%/12.
  const R = 0.07 / 12;
  const balance = (P, n) => (n <= 0 ? 0 : P * (Math.pow(1 + R, n) - 1) / R);
  const anaAt = (age) => balance(200, (age - 25) * 12);          // age may be fractional
  const benAt = (age) => balance(400, Math.max(0, (age - 40) * 12));
  const ANA_END = Math.round(balance(200, 480)); // 524,963
  const BEN_END = Math.round(balance(400, 300)); // 324,029
  const ANA_PAID = 200 * 480;                    // 96,000
  const BEN_PAID = 400 * 300;                    // 120,000
  const round1k = (v) => Math.round(v / 1000) * 1000;
  const GAP = round1k(ANA_END) - round1k(BEN_END); // 201,000
  const PAID_DIFF = BEN_PAID - ANA_PAID;           // 24,000

  // ------------------------------------------------------------------ helpers
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;
  const E = {
    lin: (p) => p,
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    outQuint: (p) => 1 - Math.pow(1 - p, 5),
    outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inCubic: (p) => p * p * p,
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
    outBack: (p) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    inBack: (p) => { const c1 = 1.6, c3 = c1 + 1; return c3 * p * p * p - c1 * p * p; },
  };
  const money = (v) => '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const kLabel = (v) => (v === 0 ? '$0' : '$' + v / 1000 + 'k');

  const stage = document.getElementById('stage');
  const SVGNS = 'http://www.w3.org/2000/svg';

  function mk(tag, cls, parent, text, style) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    if (style) Object.assign(el.style, style);
    (parent || stage).appendChild(el);
    return el;
  }
  function sv(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function svgLayer(parent) {
    const s = sv('svg', { class: 'layer', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    (parent || stage).appendChild(s);
    return s;
  }
  function tf(el, o) {
    const x = o.x || 0, y = o.y || 0;
    const sx = o.sx != null ? o.sx : (o.s != null ? o.s : 1);
    const sy = o.sy != null ? o.sy : (o.s != null ? o.s : 1);
    const r = o.r || 0;
    el.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)}) rotate(${r.toFixed(2)}deg)`;
    if (o.o != null) el.style.opacity = clamp(o.o).toFixed(4);
  }
  /** Fade + rise in at `a`, fade + rise out at `b` (if given). */
  function appear(el, t, a, b, opt = {}) {
    const dur = opt.dur || 0.6, dy = opt.dy != null ? opt.dy : 34, dx = opt.dx || 0;
    const pin = (opt.ease || E.outQuint)(P(t, a, a + dur));
    const pout = b != null ? E.inOutCubic(P(t, b, b + (opt.outDur || 0.5))) : 0;
    tf(el, {
      x: (1 - pin) * dx - pout * (opt.outDx || 0),
      y: (1 - pin) * dy - pout * (opt.outDy != null ? opt.outDy : 24),
      s: opt.scaleIn ? lerp(opt.scaleIn, 1, pin) : 1,
      o: pin * (1 - pout),
    });
  }
  /** Build masked words. spec: array of [word, className]. Returns inner spans. */
  function maskWords(parent, spec) {
    const out = [];
    spec.forEach(([w, cls], i) => {
      const m = mk('span', 'mask', parent);
      out.push(mk('span', 'mi' + (cls ? ' ' + cls : ''), m, w));
      if (i < spec.length - 1) parent.appendChild(document.createTextNode(' '));
    });
    return out;
  }
  function words(str, cls) { return str.split(' ').map((w) => [w, cls]); }
  /** Masked rise in, masked rise out. */
  function riseWords(list, t, inAt, outAt, st = 0.08, outSt = 0.04) {
    list.forEach((el, i) => {
      const pin = E.outQuint(P(t, inAt + i * st, inAt + i * st + 0.85));
      const pout = outAt != null ? E.inCubic(P(t, outAt + i * outSt, outAt + i * outSt + 0.5)) : 0;
      el.style.transform = `translateY(${((1 - pin) * 135 - pout * 135).toFixed(2)}%)`;
    });
  }
  function windowVis(el, t, a, b) { el.style.visibility = t >= a && t <= b ? 'visible' : 'hidden'; }

  // ================================================================== BACKGROUND
  const bg = mk('div', 'layer', stage, null, {
    background: 'radial-gradient(1500px 1000px at 28% 18%, #142556 0%, rgba(20,37,86,0) 70%), linear-gradient(180deg, #0b1636 0%, #060b20 100%)',
  });
  const glowA = mk('div', 'abs', stage, null, {
    width: '1200px', height: '1200px', marginLeft: '-600px', marginTop: '-600px',
    background: 'radial-gradient(circle, rgba(255,181,71,0.13) 0%, rgba(255,181,71,0) 62%)',
  });
  const glowB = mk('div', 'abs', stage, null, {
    width: '1300px', height: '1300px', marginLeft: '-650px', marginTop: '-650px',
    background: 'radial-gradient(circle, rgba(160,143,255,0.14) 0%, rgba(160,143,255,0) 62%)',
  });
  const grid = mk('div', 'abs', stage, null, {
    left: '-120px', top: '-120px', width: '2200px', height: '1360px',
    backgroundImage: 'radial-gradient(circle, rgba(190,205,255,0.16) 0 2px, rgba(0,0,0,0) 2.6px)',
    backgroundSize: '56px 56px',
  });
  const vignette = mk('div', 'layer', stage, null, {
    background: 'radial-gradient(ellipse 75% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(2,4,14,0.55) 100%)',
  });
  function updateBackground(t) {
    // Continuous slow drift: visible on every frame, never still.
    tf(grid, { x: -((t * 18) % 56), y: -((t * 10) % 56) });
    tf(glowA, { x: 520 + 260 * Math.sin(t * 0.21), y: 360 + 140 * Math.cos(t * 0.27) });
    tf(glowB, { x: 1450 + 220 * Math.cos(t * 0.19), y: 760 + 150 * Math.sin(t * 0.23) });
  }
  void bg; void vignette;

  // ================================================================== AVATARS (shared elements, scenes 2 → 3 → 4)
  function makeAvatar(id, letter) {
    const a = mk('div', 'avatar', stage);
    a.id = id;
    const ring = mk('div', 'ring', a);
    mk('div', 'shape', a);
    mk('span', null, a, letter);
    return { el: a, ring };
  }
  const txtColor = (c) => (c === BEN ? BEN_TXT : c);

  /*
   * MASTER TIMELINE (seconds). Scenes overlap: the next scene's first elements
   * arrive while the previous one is still leaving with a directional move.
   */
  const T = {
    s1Out: 4.05,         // title block slides left + fades as one unit (gone by 4.45); curve sinks
    s2In: 4.1,           // "Meet Ana and Ben" heading
    s2Out: 11.9,        // cards + pills push left; timeline follows at +0.15
    fly1: 12.15,         // avatars fly cards -> legend (1.05 s)
    s3In: 12.1,         // chart pushes in from the right
    s3Head: 12.5,
    drawA: 13.2, drawB: 20.4,
    s3Out: 24.25,        // chart + legend push left
    fly2: 24.3,          // avatars fly legend -> bars (0.9 s)
    s4In: 24.05,
    s4Head: 24.95,
    s4Out: 31.45,        // whole result scene (heading included) pushes left, gone by 31.85
    s5In: 31.3,          // takeaway curve; words from 31.6
  };

  /** Group-level directional push: enters from +dx, leaves to -dx. */
  function push(el, t, inA, inDur, outA, outDur, dx = 160) {
    const pi = inA == null ? 1 : E.outCubic(P(t, inA, inA + inDur));
    const po = outA == null ? 0 : E.inOutCubic(P(t, outA, outA + outDur));
    tf(el, { x: (1 - pi) * dx - po * dx, o: pi * (1 - po) });
  }

  // ================================================================== SCENE 1 — TITLE (0–4.9 s)
  const s1 = mk('div', 'layer', stage);
  const s1svg = svgLayer(s1);
  const s1defs = sv('defs', {}, s1svg);
  const g1 = sv('linearGradient', { id: 's1area', x1: 0, y1: 0, x2: 0, y2: 1 }, s1defs);
  sv('stop', { offset: '0', 'stop-color': ANA, 'stop-opacity': 0.22 }, g1);
  sv('stop', { offset: '1', 'stop-color': ANA, 'stop-opacity': 0 }, g1);
  const g1s = sv('linearGradient', { id: 's1stroke', x1: 0, y1: 0, x2: 1, y2: 0 }, s1defs);
  sv('stop', { offset: '0', 'stop-color': BEN }, g1s);
  sv('stop', { offset: '1', 'stop-color': ANA }, g1s);
  const s1grp = sv('g', {}, s1svg);
  const s1area = sv('path', { fill: 'url(#s1area)' }, s1grp);
  const s1line = sv('path', { fill: 'none', stroke: 'url(#s1stroke)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s1grp);
  const s1dots = [];
  for (let i = 1; i < 40; i++) s1dots.push(sv('circle', { r: 4.5, fill: ANA }, s1grp));
  const s1headGlow = sv('circle', { r: 30, fill: ANA, opacity: 0.18 }, s1grp);
  const s1head = sv('circle', { r: 12, fill: '#fff4dd', stroke: ANA, 'stroke-width': 5 }, s1grp);
  const curve1 = (u) => [96 + 1728 * u, 1000 - 470 * (Math.exp(3 * u) - 1) / (Math.exp(3) - 1)];

  const s1text = mk('div', 'layer', s1, null, { transformOrigin: '120px 440px' });
  const s1rule = mk('div', 'abs', s1text, null, { left: '124px', top: '262px', width: '140px', height: '8px', borderRadius: '4px', background: ANA, transformOrigin: '0 50%' });
  const s1title = mk('div', 'abs display', s1text, null, { left: '120px', top: '300px', fontSize: '124px', width: '1700px' });
  const s1l1 = mk('div', null, s1title);
  const s1l2 = mk('div', null, s1title);
  const s1w = maskWords(s1l1, [['Why'], ['starting'], ['early', 'ana']])
    .concat(maskWords(s1l2, [['beats'], ['saving'], ['more', 'ben']]));
  const s1sub = mk('div', 'abs body muted', s1text, 'Compound interest in 35 seconds', { left: '124px', top: '614px', fontSize: '48px' });

  function updateS1(t) {
    windowVis(s1, t, -1, 5.2);
    if (t > 5.2) return;
    // growth-curve motif keeps drawing (head still travelling) until the exit
    const p = P(t, 0, 4.4);
    const u = 0.12 + 0.86 * (0.55 * p + 0.45 * E.outCubic(p));
    const pts = [];
    const N = 120;
    for (let i = 0; i <= N; i++) pts.push(curve1((u * i) / N));
    const d = 'M' + pts.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L');
    s1line.setAttribute('d', d);
    const [hx, hy] = pts[pts.length - 1];
    s1area.setAttribute('d', d + ` L${hx.toFixed(1)} 1080 L96 1080 Z`);
    s1dots.forEach((c, i) => {
      const uu = (i + 1) / 40;
      const [x, y] = curve1(uu);
      c.setAttribute('cx', x); c.setAttribute('cy', y);
      c.setAttribute('opacity', (0.75 * P(u, uu, uu + 0.03)).toFixed(3));
    });
    s1head.setAttribute('cx', hx); s1head.setAttribute('cy', hy);
    s1headGlow.setAttribute('cx', hx); s1headGlow.setAttribute('cy', hy);
    s1headGlow.setAttribute('r', (26 + 8 * Math.sin(t * 5)).toFixed(2));
    const gout = E.inOutCubic(P(t, T.s1Out, T.s1Out + 0.65));
    s1grp.setAttribute('transform', `translate(0 ${(gout * 110).toFixed(2)})`);
    s1grp.setAttribute('opacity', (1 - gout).toFixed(3));

    // Title is complete on frame 0 (clean thumbnail); it settles, then slowly pushes in.
    const settle = E.outCubic(P(t, 0, 1.0));
    const pushIn = 0.04 * E.inOutSine(P(t, 0.6, T.s1Out + 0.6));
    const lv = E.inOutCubic(P(t, T.s1Out, T.s1Out + 0.4));
    tf(s1text, { x: -220 * lv, y: (1 - settle) * 14, s: 1.012 - 0.012 * settle + pushIn, o: 1 - lv });
    riseWords(s1w, t, -10, null);
    tf(s1rule, { sx: lerp(0.3, 1, E.outQuint(P(t, 0, 1.0))), o: 1 });
  }

  // ================================================================== SCENE 2 — MEET ANA AND BEN
  const s2 = mk('div', 'layer', stage);
  const s2top = mk('div', 'layer', s2);   // heading + cards + pills
  const s2head = mk('div', 'abs h2', s2top, null, { left: '120px', top: '96px' });
  const s2hw = maskWords(s2head, [['Meet'], ['Ana', 'ana'], ['and'], ['Ben', 'ben']]);
  const tl = mk('div', 'layer', s2);      // timeline

  function personCard(x, color, name, amount, from) {
    const card = mk('div', 'card', s2top, null, { left: x + 'px', top: '196px', width: '820px', height: '330px', borderColor: color + '66' });
    const nameEl = mk('div', 'abs h2', s2top, name, { left: x + 228 + 'px', top: '226px', fontSize: '56px', color: INK });
    const amtEl = mk('div', 'abs num', s2top, amount, { left: x + 228 + 'px', top: '310px', fontSize: '60px', color: txtColor(color) });
    const fromEl = mk('div', 'abs body muted', s2top, from, { left: x + 230 + 'px', top: '400px', fontSize: '40px' });
    return { card, nameEl, amtEl, fromEl };
  }
  const cA = personCard(120, ANA, 'Ana', '$200 a month', 'from age 25');
  const cB = personCard(980, BEN, 'Ben', '$400 a month', 'from age 40');

  const fact1 = mk('div', 'pill body', s2top, 'Both stop at 65', { left: '0px', top: '566px', fontSize: '38px', padding: '14px 36px', color: INK });
  const fact2 = mk('div', 'pill body', s2top, 'Both earn 7% a year', { left: '0px', top: '566px', fontSize: '38px', padding: '14px 36px', color: INK });

  // timeline 25 → 65
  const TL_X0 = 330, TL_X1 = 1780;
  const tlx = (age) => TL_X0 + ((age - 25) / 40) * (TL_X1 - TL_X0);
  const tlSvg = svgLayer(tl);
  const tlAxis = sv('line', { x1: TL_X0, y1: 878, x2: TL_X0, y2: 878, stroke: 'rgba(220,228,255,0.55)', 'stroke-width': 3, 'stroke-linecap': 'round' }, tlSvg);
  const tlTicks = [];
  for (let a = 25; a <= 65; a += 5) {
    const tk = sv('line', { x1: tlx(a), x2: tlx(a), y1: 870, y2: 886, stroke: 'rgba(220,228,255,0.55)', 'stroke-width': 3 }, tlSvg);
    const lb = mk('div', 'abs num muted', tl, String(a), { left: tlx(a) - 40 + 'px', top: '898px', width: '80px', textAlign: 'center', fontSize: '32px', fontWeight: 600 });
    tlTicks.push({ tk, lb, a });
  }
  const tlAgeLbl = mk('div', 'abs body muted', tl, 'Age', { left: '120px', top: '898px', fontSize: '32px' });
  function tlRow(y, color, name, from, years) {
    const track = mk('div', 'abs', tl, null, { left: TL_X0 + 'px', top: y + 'px', width: TL_X1 - TL_X0 + 'px', height: '52px', borderRadius: '26px', background: 'rgba(255,255,255,0.06)', transformOrigin: '0 50%' });
    const fill = mk('div', 'abs', tl, null, { left: tlx(from) + 'px', top: y + 'px', width: tlx(65) - tlx(from) + 'px', height: '52px', borderRadius: '26px', background: color, transformOrigin: '0 50%', overflow: 'hidden' });
    const shine = mk('div', 'abs', fill, null, { top: '0px', width: '160px', height: '52px', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.45), rgba(255,255,255,0))' });
    const lbl = mk('div', 'abs body', tl, years, { left: tlx(from) + 26 + 'px', top: y + 6 + 'px', fontSize: '32px', fontWeight: 800, color: '#0a1230' });
    const nm = mk('div', 'abs h2', tl, name, { left: '120px', top: y + 2 + 'px', fontSize: '38px', color: txtColor(color) });
    return { track, fill, shine, lbl, nm, w: tlx(65) - tlx(from) };
  }
  const rowA = tlRow(694, ANA, 'Ana', 25, '40 years');
  const rowB = tlRow(774, BEN, 'Ben', 40, '25 years');
  // playhead that sweeps the span 25 → 65 during the hold
  const phG = sv('g', { opacity: 0 }, tlSvg);
  sv('line', { x1: 0, x2: 0, y1: 676, y2: 864, stroke: '#f4f6ff', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.85 }, phG);
  const phGlow = sv('circle', { cx: 0, cy: 878, r: 18, fill: '#f4f6ff', opacity: 0.18 }, phG);
  sv('circle', { cx: 0, cy: 878, r: 9, fill: '#f4f6ff' }, phG);

  function updateS2(t) {
    windowVis(s2, t, 4.05, 13.0);
    if (t < 4.05 || t > 13.0) return;
    riseWords(s2hw, t, T.s2In, null, 0.08);
    push(s2top, t, null, 0, T.s2Out, 0.6, 180);
    push(tl, t, null, 0, T.s2Out + 0.15, 0.6, 180);

    const cardIn = (c, a, st = 0.3) => {
      const p = E.outQuint(P(t, a, a + 0.8));
      tf(c.card, { y: (1 - p) * 60, s: lerp(0.96, 1, p), o: p });
      appear(c.nameEl, t, a + 0.5 * st);
      appear(c.amtEl, t, a + 1.5 * st);
      appear(c.fromEl, t, a + 2.5 * st);
    };
    cardIn(cA, 4.4, 0.12);
    cardIn(cB, 5.6);

    // timeline skeleton arrives early so the lower half is never empty
    const ax = E.outCubic(P(t, 6.25, 7.05));
    tlAxis.setAttribute('x2', lerp(TL_X0, TL_X1, ax));
    tlAxis.setAttribute('opacity', ax > 0 ? 1 : 0);
    tlTicks.forEach(({ tk, lb }, i) => {
      const p = E.outQuint(P(t, 6.3 + i * 0.05, 6.9 + i * 0.05));
      tk.setAttribute('opacity', p);
      tf(lb, { y: (1 - p) * 16, o: p });
    });
    appear(tlAgeLbl, t, 6.25, null, { dy: 16 });

    // shared facts, centred as a pair
    const w1 = fact1.offsetWidth, w2 = fact2.offsetWidth, gap = 32;
    const left = (W - (w1 + w2 + gap)) / 2;
    fact1.style.left = left + 'px';
    fact2.style.left = left + w1 + gap + 'px';
    appear(fact1, t, 7.0, null, { scaleIn: 0.9 });
    appear(fact2, t, 7.3, null, { scaleIn: 0.9 });

    const rowAnim = (r, trackAt, a) => {
      appear(r.nm, t, trackAt, null, { dx: -30, dy: 0 });
      const pt = E.outCubic(P(t, trackAt, trackAt + 0.7));
      tf(r.track, { sx: Math.max(0.0001, pt), o: pt });
      const p = E.outQuint(P(t, a, a + 1.0));
      tf(r.fill, { sx: Math.max(0.0001, p), o: P(t, a, a + 0.1) });
      appear(r.lbl, t, a + 0.6, null, { dx: -16, dy: 0, dur: 0.5 });
      const sp = ((t - a - 1.0) % 2.4) / 2.4; // shimmer during the hold
      tf(r.shine, { x: t > a + 1.0 ? lerp(-200, r.w + 40, sp) : -400, o: 1 });
    };
    rowAnim(rowA, 6.55, 7.9);
    rowAnim(rowB, 6.7, 8.55);

    // playhead sweep 25 → 65 (purposeful motion during the hold)
    const ph = E.inOutSine(P(t, 9.9, 11.7));
    phG.setAttribute('transform', `translate(${tlx(25 + 40 * ph).toFixed(2)} 0)`);
    phG.setAttribute('opacity', (E.outCubic(P(t, 9.75, 10.0)) * (1 - E.outCubic(P(t, 11.7, 11.95)))).toFixed(3));
    phGlow.setAttribute('r', (16 + 6 * Math.sin(t * 6)).toFixed(2));
  }

  // ================================================================== SCENE 3 — THE RACE
  const CX0 = 300, CX1 = 1340, CYB = 900, CYT = 250, VMAX = 600000;
  const cx = (age) => CX0 + ((age - 25) / 40) * (CX1 - CX0);
  const cy = (v) => CYB - (v / VMAX) * (CYB - CYT);
  const LEAD_X = CX1 + 52, LEAD_Y = 882; // gap leader elbow / push-in pivot

  const s3 = mk('div', 'layer', stage);
  const s3body = mk('div', 'layer', s3);
  const s3head = mk('div', 'abs h2', s3body, null, { left: '120px', top: '96px' });
  const s3hw = maskWords(s3head, words('The race to 65'));
  const chartSvg = svgLayer(s3body);
  const cdefs = sv('defs', {}, chartSvg);
  for (const [id, col, op] of [['gA', ANA, 0.30], ['gB', BEN, 0.34]]) {
    const g = sv('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, cdefs);
    sv('stop', { offset: '0', 'stop-color': col, 'stop-opacity': op }, g);
    sv('stop', { offset: '1', 'stop-color': col, 'stop-opacity': 0.02 }, g);
  }
  const chartG = sv('g', {}, chartSvg);
  const gridLines = [];
  for (let v = 0; v <= VMAX; v += 100000) {
    const ln = sv('line', { x1: CX0, x2: CX0, y1: cy(v), y2: cy(v), stroke: v === 0 ? 'rgba(220,228,255,0.6)' : 'rgba(220,228,255,0.13)', 'stroke-width': v === 0 ? 3 : 2 }, chartG);
    const tx = sv('text', { x: CX0 - 34, y: cy(v) + 11, 'text-anchor': 'end', fill: MUTED, 'font-size': 32, 'font-family': 'Manrope', 'font-weight': 600, style: 'font-variant-numeric: tabular-nums' }, chartG);
    tx.textContent = kLabel(v);
    gridLines.push({ ln, tx });
  }
  const xTicks = [];
  for (let a = 25; a <= 65; a += 5) {
    const tk = sv('line', { x1: cx(a), x2: cx(a), y1: CYB, y2: CYB + 14, stroke: 'rgba(220,228,255,0.6)', 'stroke-width': 3 }, chartG);
    const tx = sv('text', { x: cx(a), y: CYB + 60, 'text-anchor': 'middle', fill: MUTED, 'font-size': 32, 'font-family': 'Manrope', 'font-weight': 600, style: 'font-variant-numeric: tabular-nums' }, chartG);
    tx.textContent = String(a);
    xTicks.push({ tk, tx });
  }
  const xTitle = sv('text', { x: CX1 + 40, y: CYB + 60, 'text-anchor': 'start', fill: MUTED, 'font-size': 32, 'font-family': 'Manrope', 'font-weight': 600 }, chartG);
  xTitle.textContent = 'Age';
  const cursorLine = sv('line', { y1: CYB, y2: 246, stroke: 'rgba(244,246,255,0.45)', 'stroke-width': 2, 'stroke-dasharray': '6 8' }, chartG);
  const areaA = sv('path', { fill: 'url(#gA)' }, chartG);
  const areaB = sv('path', { fill: 'url(#gB)' }, chartG);
  const lineA = sv('path', { fill: 'none', stroke: ANA, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, chartG);
  const lineB = sv('path', { fill: 'none', stroke: BEN, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, chartG);
  const bracket = sv('path', { fill: 'none', stroke: ANA, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0 }, chartG);
  const leader = sv('path', { fill: 'none', stroke: ANA, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1, opacity: 0.8 }, chartG);
  const ringA = sv('circle', { r: 14, fill: 'none', stroke: ANA, 'stroke-width': 3 }, chartG);
  const ringB = sv('rect', { width: 28, height: 28, rx: 8, fill: 'none', stroke: BEN, 'stroke-width': 3 }, chartG);
  const headA = sv('circle', { r: 12, fill: '#fff4dd', stroke: ANA, 'stroke-width': 5 }, chartG);
  const headB = sv('rect', { width: 24, height: 24, rx: 6, fill: '#efeaff', stroke: BEN, 'stroke-width': 5 }, chartG);
  const pillG = sv('g', {}, chartG);
  sv('rect', { x: -84, y: -26, width: 168, height: 52, rx: 26, fill: '#f4f6ff' }, pillG);
  sv('path', { d: 'M-10 25 L0 36 L10 25 Z', fill: '#f4f6ff' }, pillG);
  const pillText = sv('text', { x: 0, y: 11, 'text-anchor': 'middle', fill: '#0a1230', 'font-size': 32, 'font-family': 'Sora', 'font-weight': 700, style: 'font-variant-numeric: tabular-nums' }, pillG);

  function legendCard(y, color, name, caption) {
    const card = mk('div', 'card', s3body, null, { left: '1430px', top: y + 'px', width: '380px', height: '214px', borderColor: color + '77' });
    const nm = mk('div', 'abs h2', s3body, name, { left: '1546px', top: y + 26 + 'px', fontSize: '42px', color: INK });
    const val = mk('div', 'abs num', s3body, '$0', { left: '1458px', top: y + 92 + 'px', fontSize: '62px', color: txtColor(color), transformOrigin: '0 50%' });
    const cap = mk('div', 'abs body muted', s3body, caption, { left: '1460px', top: y + 164 + 'px', fontSize: '30px' });
    return { card, nm, val, cap };
  }
  const lgA = legendCard(250, ANA, 'Ana', '$200/month from 25');
  const lgB = legendCard(488, BEN, 'Ben', '$400/month from 40');
  const callout = mk('div', 'abs h2', s3body, null, { left: '1432px', top: '714px', fontSize: '50px', lineHeight: '1.18' });
  const cl1 = mk('div', null, callout), cl2 = mk('div', null, callout);
  const clw = maskWords(cl1, [['Ben', 'ben'], ['never']]).concat(maskWords(cl2, words('catches up')));
  const gapLbl = mk('div', 'abs num', s3body, '$201k gap', { left: '1432px', top: LEAD_Y - 24 + 'px', fontSize: '38px', color: ANA, lineHeight: '48px' });

  function curvePath(fn, ageEnd) {
    const pts = [];
    const n = Math.floor((ageEnd - 25) * 12 + 1e-9);
    for (let m = 0; m <= n; m++) { const age = 25 + m / 12; pts.push([cx(age), cy(fn(age))]); }
    if (ageEnd > 25 + n / 12 + 1e-9) pts.push([cx(ageEnd), cy(fn(ageEnd))]);
    return pts;
  }
  const toD = (pts) => 'M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L');

  function updateS3(t) {
    windowVis(s3, t, 12.05, 24.9);
    if (t < 12.05 || t > 24.9) return;
    riseWords(s3hw, t, T.s3Head, null, 0.08);
    push(s3body, t, T.s3In, 0.8, T.s3Out, 0.7, 160);

    // slow push-in on the chart during the hold (pivot at the gap leader so it stays attached to its label)
    const zi = 1 + 0.03 * E.inOutSine(P(t, T.drawB, T.s3Out + 0.3));
    chartG.setAttribute('transform', `translate(${LEAD_X} ${LEAD_Y}) scale(${zi.toFixed(4)}) translate(${-LEAD_X} ${-LEAD_Y})`);

    gridLines.forEach(({ ln, tx }, i) => {
      const p = E.outCubic(P(t, 12.2 + i * 0.05, 13.0 + i * 0.05));
      ln.setAttribute('x2', lerp(CX0, CX1, p).toFixed(1));
      tx.setAttribute('opacity', E.outCubic(P(t, 12.55 + i * 0.05, 13.05 + i * 0.05)).toFixed(3));
    });
    xTicks.forEach(({ tk, tx }, i) => {
      const p = E.outCubic(P(t, 12.5 + i * 0.04, 13.0 + i * 0.04));
      tk.setAttribute('opacity', p.toFixed(3));
      tx.setAttribute('opacity', p.toFixed(3));
    });
    xTitle.setAttribute('opacity', E.outCubic(P(t, 12.85, 13.35)).toFixed(3));

    // the race
    const pd = E.inOutSine(P(t, T.drawA, T.drawB));
    const age = 25 + 40 * pd;
    const dA = toD(curvePath(anaAt, age)), dB = toD(curvePath(benAt, age));
    lineA.setAttribute('d', dA); lineB.setAttribute('d', dB);
    const endX = cx(age).toFixed(2);
    areaA.setAttribute('d', dA + ` L${endX} ${CYB} L${CX0} ${CYB} Z`);
    areaB.setAttribute('d', dB + ` L${endX} ${CYB} L${CX0} ${CYB} Z`);
    const linesOn = E.outCubic(P(t, T.drawA - 0.4, T.drawA));
    [lineA, lineB, areaA, areaB].forEach((e) => e.setAttribute('opacity', linesOn.toFixed(3)));
    const hax = cx(age), hay = cy(anaAt(age)), hby = cy(benAt(age));
    const pulse = (k) => (((t - T.drawA) * 0.9 + k) % 1 + 1) % 1;
    const pa1 = pulse(0), pb1 = pulse(0.5);
    headA.setAttribute('cx', hax); headA.setAttribute('cy', hay);
    ringA.setAttribute('cx', hax); ringA.setAttribute('cy', hay);
    ringA.setAttribute('r', (14 + 10 * pa1).toFixed(2)); ringA.setAttribute('opacity', (linesOn * (1 - pa1)).toFixed(3));
    headB.setAttribute('x', hax - 12); headB.setAttribute('y', hby - 12);
    const rb = 14 + 10 * pb1;
    ringB.setAttribute('x', (hax - rb).toFixed(2)); ringB.setAttribute('y', (hby - rb).toFixed(2));
    ringB.setAttribute('width', (2 * rb).toFixed(2)); ringB.setAttribute('height', (2 * rb).toFixed(2));
    ringB.setAttribute('rx', (rb * 0.3).toFixed(2));
    ringB.setAttribute('opacity', (linesOn * (1 - pb1)).toFixed(3));
    headA.setAttribute('opacity', linesOn); headB.setAttribute('opacity', linesOn);

    // moving age indicator — appears once the heading has settled, sits below it
    const pillOn = E.outQuint(P(t, 13.1, 13.6));
    const px = Math.max(hax, CX0 + 90);
    pillG.setAttribute('transform', `translate(${px.toFixed(2)} ${(208 + (1 - pillOn) * 16).toFixed(2)})`);
    pillG.setAttribute('opacity', pillOn.toFixed(3));
    pillText.textContent = 'Age ' + Math.min(65, Math.floor(age + 1e-9));
    cursorLine.setAttribute('x1', hax); cursorLine.setAttribute('x2', hax);
    cursorLine.setAttribute('opacity', (pillOn * (1 - E.outCubic(P(t, T.drawB + 0.2, T.drawB + 0.9)) * 0.6)).toFixed(3));

    // gap bracket at 65, then a leader line down to the "$201k gap" label
    const ya = cy(ANA_END), yb = cy(BEN_END), bx = CX1 + 30, mid = (ya + yb) / 2;
    const bp = E.outCubic(P(t, T.drawB + 0.05, T.drawB + 0.55));
    const h = ((yb - ya) / 2) * bp;
    bracket.setAttribute('d', `M${bx - 12} ${mid - h} L${bx} ${mid - h} L${bx} ${mid + h} L${bx - 12} ${mid + h}`);
    bracket.setAttribute('opacity', bp > 0 ? 1 : 0);
    const lp = E.inOutCubic(P(t, T.drawB + 0.55, T.drawB + 1.15));
    leader.setAttribute('d', `M${bx} ${mid} L${LEAD_X} ${mid} L${LEAD_X} ${LEAD_Y} L${LEAD_X + 30} ${LEAD_Y}`);
    leader.setAttribute('stroke-dashoffset', (1 - lp).toFixed(4));
    leader.setAttribute('opacity', lp > 0 ? 0.85 : 0);
    appear(gapLbl, t, T.drawB + 1.0, null, { dx: -24, dy: 0, dur: 0.6 });

    // live counters: formula value for the month currently drawn
    const months = Math.floor((age - 25) * 12 + 1e-6);
    lgA.val.textContent = money(Math.round(balance(200, months)));
    lgB.val.textContent = money(Math.round(balance(400, months - 180)));
    const legend = (lg, a) => {
      const p = E.outQuint(P(t, a, a + 0.8));
      tf(lg.card, { x: (1 - p) * 80, o: p });
      appear(lg.nm, t, a + 0.25, null, { dx: 40, dy: 0 });
      appear(lg.val, t, a + 0.32, null, { dx: 40, dy: 0 });
      appear(lg.cap, t, a + 0.4, null, { dx: 40, dy: 0 });
    };
    legend(lgA, 12.2);
    legend(lgB, 12.3);
    const breathe = 1 + 0.025 * Math.sin((t - T.drawB) * 3) * P(t, T.drawB, T.drawB + 0.5);
    if (t > T.drawB) {
      lgA.val.style.transform += ` scale(${breathe.toFixed(4)})`;
      lgB.val.style.transform += ` scale(${(2 - breathe).toFixed(4)})`;
    }
    riseWords(clw, t, T.drawB + 0.0, null, 0.08);
  }

  // ================================================================== SCENE 4 — THE RESULT AT 65
  const BASE = 870, KPX = 520 / 525000; // bar scale: px per dollar
  const GAP_BX = 1145, GAP_TX = 1185;
  const s4 = mk('div', 'layer', stage);
  const s4body = mk('div', 'layer', s4);
  const s4head = mk('div', 'abs h2', s4body, null, { left: '120px', top: '96px' });
  const s4hw = maskWords(s4head, words('The result at 65'));
  const baseLine = mk('div', 'abs', s4body, null, { left: '200px', top: BASE + 'px', width: '1000px', height: '3px', background: 'rgba(220,228,255,0.55)', transformOrigin: '0 50%' });
  function bigBar(cxp, color, paid, total, key) {
    const w = 240;
    const bar = mk('div', 'bar', s4body, null, { left: cxp - w / 2 + 'px', top: '0px', width: w + 'px', height: '0px' });
    const growth = mk('div', 'seg solid-' + key, bar, null, { top: '0px' });
    const paidSeg = mk('div', 'seg stripe-' + key, bar, null, { bottom: '0px' });
    const shine = mk('div', 'abs', bar, null, { width: w + 'px', height: '90px', background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.28), rgba(255,255,255,0))' });
    const about = mk('div', 'abs body muted', s4body, 'about', { left: cxp - 150 + 'px', width: '300px', textAlign: 'center', fontSize: '34px' });
    const val = mk('div', 'abs num', s4body, '$0', { left: cxp - 200 + 'px', width: '400px', textAlign: 'center', fontSize: '64px', fontWeight: 800, color: txtColor(color) });
    const sx = cxp + w / 2 + 26;
    const paidLbl = mk('div', 'abs', s4body, null, { left: sx + 'px' });
    mk('div', 'body muted', paidLbl, 'paid in', { fontSize: '32px', lineHeight: '1.1' });
    mk('div', 'num', paidLbl, money(paid), { fontSize: '42px', color: INK, lineHeight: '1.15' });
    const growLbl = mk('div', 'abs body', s4body, 'growth', { left: cxp - 100 + 'px', width: '200px', textAlign: 'center', fontSize: '34px', fontWeight: 800, color: '#0a1230' });
    const name = mk('div', 'abs h2', s4body, key === 'ana' ? 'Ana' : 'Ben', { left: cxp + 'px', top: '894px', fontSize: '42px', color: INK });
    return { bar, growth, paidSeg, shine, about, val, paidLbl, growLbl, name, paid, total, w, cxp };
  }
  const bA = bigBar(420, ANA, ANA_PAID, ANA_END, 'ana');
  const bB = bigBar(920, BEN, BEN_PAID, BEN_END, 'ben');
  const s4svg = svgLayer(s4body);
  const guide = sv('line', { stroke: 'rgba(244,246,255,0.55)', 'stroke-width': 3, 'stroke-dasharray': '8 10' }, s4svg);
  const gapBr = sv('path', { fill: 'none', stroke: ANA, 'stroke-width': 4, 'stroke-linecap': 'round' }, s4svg);
  const gapBox = mk('div', 'abs', s4body, null, { left: GAP_TX + 'px', top: '0px', transformOrigin: '0 50%' });
  mk('div', 'body muted', gapBox, 'Ana ends with', { fontSize: '36px' });
  const gapVal = mk('div', 'num', gapBox, money(GAP) + ' more', { fontSize: '76px', fontWeight: 800, color: ANA, lineHeight: '1.1', transformOrigin: '0 50%' });
  const badge = mk('div', 'pill body', s4body, null, { left: GAP_TX + 'px', top: '640px', fontSize: '38px', padding: '16px 36px', color: INK, background: 'rgba(255,181,71,0.14)', borderColor: ANA, fontWeight: 700, transformOrigin: '0 50%' });
  badge.append('Ana paid in ');
  mk('span', 'num ana', badge, money(PAID_DIFF));
  badge.append(' less');

  function updateS4(t) {
    windowVis(s4, t, 24.0, 32.3);
    if (t < 24.0 || t > 32.3) return;
    riseWords(s4hw, t, T.s4Head, null, 0.08);
    push(s4body, t, T.s4In, 0.75, T.s4Out, 0.4, 160);
    tf(baseLine, { sx: E.outCubic(P(t, 24.15, 24.85)), o: 1 });

    const doBar = (b, d) => {
      const pp = E.outCubic(P(t, 24.3 + d, 24.8 + d));
      const pg = E.inOutCubic(P(t, 24.8 + d, 26.5 + d));
      const hp = b.paid * KPX * pp;
      const hg = (b.total - b.paid) * KPX * pg;
      const h = hp + hg;
      const top = BASE - h;
      b.bar.style.height = h.toFixed(2) + 'px';
      b.bar.style.top = top.toFixed(2) + 'px';
      b.bar.style.borderRadius = Math.min(24, h / 2).toFixed(1) + 'px ' + Math.min(24, h / 2).toFixed(1) + 'px 6px 6px';
      b.paidSeg.style.height = hp.toFixed(2) + 'px';
      b.growth.style.height = hg.toFixed(2) + 'px';
      const sp = (((t - 27.0 - d * 3) % 2.6) + 2.6) % 2.6 / 2.6; // shimmer climbing the bar
      tf(b.shine, { y: t > 27.0 ? lerp(h, -100, sp) : h + 200, o: 1 });
      const v = lerp(b.paid, b.total, pg); // count-up riding on the bar top
      b.val.textContent = money(round1k(v * pp));
      b.val.style.top = top - 92 + 'px';
      b.about.style.top = top - 140 + 'px';
      tf(b.val, { o: E.outQuint(P(t, 24.7 + d, 25.15 + d)) });
      tf(b.about, { o: E.outQuint(P(t, 24.8 + d, 25.4 + d)) });
      b.paidLbl.style.top = BASE - hp / 2 - 42 + 'px';
      appear(b.paidLbl, t, 25.1 + d, null, { dx: -24, dy: 0 });
      b.growLbl.style.top = top + hg / 2 - 24 + 'px';
      appear(b.growLbl, t, 26.2 + d, null, { dy: 16 });
      appear(b.name, t, 24.85 + d, null, { dy: 20 });
    };
    doBar(bA, 0);
    doBar(bB, 0.15);

    // gap callout
    const yA = BASE - ANA_END * KPX, yB = BASE - BEN_END * KPX;
    const gp = E.outCubic(P(t, 27.0, 27.5));
    guide.setAttribute('x1', bA.cxp + bA.w / 2 + 8);
    guide.setAttribute('x2', lerp(bA.cxp + bA.w / 2 + 8, GAP_BX, gp));
    guide.setAttribute('y1', yA); guide.setAttribute('y2', yA);
    guide.setAttribute('opacity', gp.toFixed(3));
    const bp = E.outCubic(P(t, 27.2, 27.7));
    const mid = (yA + yB) / 2, hh = ((yB - yA) / 2) * bp;
    gapBr.setAttribute('d', `M${GAP_BX - 14} ${mid - hh} L${GAP_BX} ${mid - hh} L${GAP_BX} ${mid + hh} L${GAP_BX - 14} ${mid + hh}`);
    gapBr.setAttribute('opacity', bp.toFixed(3));
    gapBox.style.top = mid - 72 + 'px';
    appear(gapBox, t, 27.3, null, { dx: -30, dy: 0, dur: 0.7 });
    const gv = E.outBack(P(t, 27.45, 28.05));
    // emphasis: gentle, slow scale breathing on "$201,000 more" after the reveals
    const gb = 1 + 0.04 * (0.5 - 0.5 * Math.cos(Math.max(0, t - 28.7) * 2.6));
    gapVal.style.transform = `scale(${(lerp(0.7, 1, gv) * gb).toFixed(4)})`;

    // "paid in less" badge, then a soft glow swell on both paid-in segments
    const bdg = E.outBack(P(t, 27.95, 28.5));
    tf(badge, { s: lerp(0.6, 1, bdg), o: P(t, 27.95, 28.2) });
    const hl = Math.sin(Math.PI * P(t, 28.4, 29.4));
    [bA, bB].forEach((b) => {
      b.paidSeg.style.boxShadow = `inset 0 0 30px rgba(255,255,255,${(0.32 * hl).toFixed(3)})`;
      b.paidSeg.style.filter = `brightness(${(1 + 0.45 * hl).toFixed(3)})`;
    });
  }

  // ================================================================== SCENE 5 — TAKEAWAY
  const s5 = mk('div', 'layer', stage);
  const s5svg = svgLayer(s5);
  const s5d = sv('defs', {}, s5svg);
  const g5 = sv('linearGradient', { id: 's5area', x1: 0, y1: 0, x2: 0, y2: 1 }, s5d);
  sv('stop', { offset: '0', 'stop-color': ANA, 'stop-opacity': 0.16 }, g5);
  sv('stop', { offset: '1', 'stop-color': ANA, 'stop-opacity': 0 }, g5);
  const s5area = sv('path', { fill: 'url(#s5area)' }, s5svg);
  const s5line = sv('path', { fill: 'none', stroke: ANA, 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.85 }, s5svg);
  const s5glow = sv('circle', { r: 28, fill: ANA, opacity: 0.2 }, s5svg);
  const s5head = sv('circle', { r: 11, fill: '#fff4dd', stroke: ANA, 'stroke-width': 5 }, s5svg);
  const curve5 = (u) => [96 + 1728 * u, 1010 - 230 * (Math.exp(3.2 * u) - 1) / (Math.exp(3.2) - 1)];
  const s5block = mk('div', 'abs', s5, null, { left: '0px', top: '232px', width: W + 'px', textAlign: 'center', transformOrigin: '50% 50%' });
  const s5l1 = mk('div', 'display', s5block, null, { fontSize: '112px' });
  const s5l2 = mk('div', 'display', s5block, null, { fontSize: '112px' });
  const s5w = maskWords(s5l1, words('Time does the')).concat(maskWords(s5l2, words('heavy lifting.')));
  const s5l3 = mk('div', 'display', s5block, null, { fontSize: '128px', marginTop: '36px' });
  const s5w2 = maskWords(s5l3, [['Start', 'ana'], ['early.', 'ana']]);
  const s5rule = mk('div', 'abs', s5, null, { left: '810px', top: '712px', width: '300px', height: '10px', borderRadius: '5px', background: ANA, transformOrigin: '50% 50%' });

  function updateS5(t) {
    windowVis(s5, t, T.s5In, 99);
    if (t < T.s5In) return;
    riseWords(s5w, t, 31.6, null, 0.1);
    riseWords(s5w2, t, 32.85, null, 0.14);
    tf(s5rule, { sx: Math.max(0.0001, E.outQuint(P(t, 33.3, 34.2))), o: 1 });
    tf(s5block, { s: 1 + 0.035 * E.inOutSine(P(t, 32.4, 36)) }); // slow push-in to the last frame
    // curve keeps drawing right up to the final frame (linear component => never decelerates to zero)
    const p = P(t, T.s5In, 36.0);
    const u = 0.04 + 0.96 * (0.3 * p + 0.7 * (1 - Math.pow(1 - p, 4)));
    const pts = [];
    for (let i = 0; i <= 100; i++) pts.push(curve5((u * i) / 100));
    const d = 'M' + pts.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L');
    s5line.setAttribute('d', d);
    const [hx, hy] = pts[pts.length - 1];
    s5area.setAttribute('d', d + ` L${hx.toFixed(1)} 1080 L96 1080 Z`);
    s5head.setAttribute('cx', hx); s5head.setAttribute('cy', hy);
    s5glow.setAttribute('cx', hx); s5glow.setAttribute('cy', hy);
    s5glow.setAttribute('r', (24 + 8 * Math.sin(t * 5)).toFixed(2));
    s5svg.style.opacity = E.outCubic(P(t, T.s5In, T.s5In + 0.7)).toFixed(3);
  }

  // ================================================================== AVATAR CHOREOGRAPHY
  const avA = makeAvatar('avA', 'A');
  const avB = makeAvatar('avB', 'B');
  const keys = {
    A: [{ x: 232, y: 361, s: 1 }, { x: 1494, y: 314, s: 0.5 }, { x: 420 - 50, y: 920, s: 0.5 }],
    B: [{ x: 1092, y: 361, s: 1 }, { x: 1494, y: 552, s: 0.5 }, { x: 920 - 50, y: 920, s: 0.5 }],
  };
  function avatarState(t, who, popAt, delay) {
    const k = keys[who];
    const f1 = E.inOutCubic(P(t, T.fly1 + delay, T.fly1 + 1.05 + delay));
    const f2 = E.inOutCubic(P(t, T.fly2 + delay, T.fly2 + 0.9 + delay));
    let x = lerp(k[0].x, k[1].x, f1), y = lerp(k[0].y, k[1].y, f1), s = lerp(k[0].s, k[1].s, f1);
    x = lerp(x, k[2].x, f2); y = lerp(y, k[2].y, f2); s = lerp(s, k[2].s, f2);
    y -= 70 * Math.sin(Math.PI * f1) + 70 * Math.sin(Math.PI * f2); // arc while flying
    // leave with the bars (push left) at the end of scene 4
    const out = E.inOutCubic(P(t, T.s4Out, T.s4Out + 0.4)); // same curve as the scene body
    x -= 160 * out;
    const pop = E.outBack(P(t, popAt, popAt + 0.7));
    y += Math.sin(t * 1.7 + (who === 'A' ? 0 : 1.9)) * 4; // idle float
    return { x, y, s: s * pop, o: Math.min(1, pop * 3) * (1 - out) };
  }
  function updateAvatars(t) {
    for (const [av, who, popAt, delay] of [[avA, 'A', 4.45, 0], [avB, 'B', 5.7, 0.08]]) {
      const st = avatarState(t, who, popAt, delay);
      av.el.style.visibility = st.s > 0.001 && st.o > 0.001 ? 'visible' : 'hidden';
      tf(av.el, { x: st.x, y: st.y, s: Math.max(0.0001, st.s), o: st.o });
      const rp = ((t * 0.6 + (who === 'A' ? 0 : 0.5)) % 1);
      tf(av.ring, { s: 1 + 0.18 * rp, o: 0.6 * (1 - rp) });
    }
  }

  // ================================================================== FRAME
  function renderFrame(t) {
    t = clamp(t, 0, DURATION - 1 / FPS);
    updateBackground(t);
    updateS1(t);
    updateS2(t);
    updateS3(t);
    updateS4(t);
    updateS5(t);
    updateAvatars(t);
    return t;
  }
  window.renderFrame = renderFrame;
  window.renderFrameIndex = (i) => renderFrame(i / FPS);
  window.VIDEO = { W, H, FPS, DURATION, FRAMES: DURATION * FPS, ANA_END, BEN_END, ANA_PAID, BEN_PAID, GAP, PAID_DIFF, T };

  // ================================================================== PREVIEW MODE
  const params = new URLSearchParams(location.search);
  if (params.has('render')) {
    document.body.classList.add('render');
    renderFrame(0);
  } else {
    const fit = () => {
      const s = Math.min(innerWidth / W, innerHeight / H);
      stage.style.transform = `scale(${s})`;
    };
    fit();
    addEventListener('resize', fit);
    if (params.has('t')) {
      document.fonts.ready.then(() => renderFrame(parseFloat(params.get('t')) || 0));
      renderFrame(parseFloat(params.get('t')) || 0);
    } else {
      // Live preview: wall clock only selects which t to draw; state stays a pure function of t.
      const t0 = performance.now();
      const loop = (now) => { renderFrame(((now - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }
})();
