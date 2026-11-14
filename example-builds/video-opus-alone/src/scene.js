// "Why starting early beats saving more" — every frame is a pure function of time t (seconds).
// window.renderFrame(t) draws the frame onto the 1920x1080 canvas.
'use strict';

const W = 1920, H = 1080;
const FPS = 30;
const DURATION = 35; // seconds
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const C = {
  text: '#F4F6FB',
  muted: '#AEB8D0',
  ana: '#FFB547',
  ben: '#4FC3F7',
  ink: '#0A0F1F',
  grid: 'rgba(255,255,255,0.09)',
};

// ---------------------------------------------------------------- finance model
// End-of-month deposits, 7% a year compounded monthly.
const R = 0.07 / 12;
const MONTHS = 40 * 12; // age 25 -> 65
function simulate(deposit, startAge) {
  const startMonth = (startAge - 25) * 12;
  const bal = [0];
  let b = 0;
  for (let m = 1; m <= MONTHS; m++) {
    b = b * (1 + R);
    if (m > startMonth) b += deposit;
    bal.push(b);
  }
  return bal;
}
const ANA = simulate(200, 25); // 480 deposits -> $96,000 paid, ~$524,963
const BEN = simulate(400, 40); // 300 deposits -> $120,000 paid, ~$324,029
const ANA_END = ANA[MONTHS], BEN_END = BEN[MONTHS];
const ANA_PAID = 200 * 480, BEN_PAID = 400 * 300;
function balAt(arr, age) {
  const m = clamp((age - 25) * 12, 0, MONTHS);
  const i = Math.floor(m), f = m - i;
  if (i >= MONTHS) return arr[MONTHS];
  return arr[i] * (1 - f) + arr[i + 1] * f;
}
const round1k = (v) => Math.round(v / 1000) * 1000;
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const money1k = (v) => money(round1k(v));

// ---------------------------------------------------------------- helpers
function clamp(x, a = 0, b = 1) { return Math.min(b, Math.max(a, x)); }
function prog(t, a, b) { return clamp((t - a) / (b - a)); }
const lerp = (a, b, p) => a + (b - a) * p;
const eOut = (x) => 1 - Math.pow(1 - x, 3);
const eIn = (x) => x * x * x;
const eInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const eOutBack = (x) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

// Generic enter/exit envelope: fades + slides up on enter, continues up on exit.
function vis(t, tin, tout, dist = 46, dIn = 0.7, dOut = 0.45) {
  const pin = eOut(prog(t, tin, tin + dIn));
  const pout = tout == null ? 0 : eIn(prog(t, tout, tout + dOut));
  return { a: pin * (1 - pout), y: (1 - pin) * dist - pout * dist * 0.8, pin, pout };
}

function font(size, weight) { ctx.font = `${weight} ${size}px Inter`; }

function txt(s, x, y, o = {}) {
  const { size = 40, weight = 600, color = C.text, align = 'left', alpha = 1, ls = 0 } = o;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  font(size, weight);
  ctx.letterSpacing = ls + 'px';
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
  ctx.restore();
}

function measure(s, size, weight, ls = 0) {
  ctx.save(); font(size, weight); ctx.letterSpacing = ls + 'px';
  const w = ctx.measureText(s).width; ctx.restore(); return w;
}

// A line made of differently coloured segments: segs = [[text, color, weight?], ...]
function rich(segs, x, y, o = {}) {
  const { size = 40, weight = 700, align = 'left', alpha = 1 } = o;
  const widths = segs.map((s) => measure(s[0], size, s[2] || weight));
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  segs.forEach((s, i) => {
    txt(s[0], cx, y, { size, weight: s[2] || weight, color: s[1], alpha });
    cx += widths[i];
  });
  return total;
}

// Numbers with fixed-width digits so counters don't jitter.
function num(s, x, y, o = {}) {
  const { size = 60, weight = 800, color = C.text, align = 'left', alpha = 1 } = o;
  if (alpha <= 0) return;
  const dw = measure('0', size, weight);
  const ws = [...s].map((ch) => (/[0-9]/.test(ch) ? dw : measure(ch, size, weight)));
  const total = ws.reduce((a, b) => a + b, 0);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.save();
  ctx.globalAlpha *= alpha; font(size, weight); ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  [...s].forEach((ch, i) => { ctx.fillText(ch, cx + ws[i] / 2, y); cx += ws[i]; });
  ctx.restore();
  return total;
}

// Text that slides up out of a mask. p: 0 hidden below, 1 in place, 2 gone above.
function maskReveal(drawFn, y, size, p) {
  if (p <= 0 || p >= 2) return;
  const e = p <= 1 ? eOut(p) : 1 + eIn(p - 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y - size * 1.1, W, size * 1.45);
  ctx.clip();
  ctx.translate(0, (1 - e) * size * 1.3);
  drawFn();
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function glow(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Slow push-in for a scene so nothing is ever perfectly still.
function withPush(t, t0, t1, amount, fn) {
  const s = 1 + amount * prog(t, t0, t1);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  fn();
  ctx.restore();
}

function avatar(x, y, r, color, letter, t, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = hexA(color, 0.16);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  // rotating dashed orbit
  ctx.setLineDash([10, 14]); ctx.lineDashOffset = -t * 30;
  ctx.strokeStyle = hexA(color, 0.55); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, r + 12, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  txt(letter, x, y + r * 0.36, { size: r * 1.0, weight: 800, color, align: 'center', alpha });
}

// ---------------------------------------------------------------- background
function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0C1330');
  g.addColorStop(1, '#05070F');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  glow(W * 0.22 + Math.sin(t * 0.31) * 140, H * 0.28 + Math.cos(t * 0.23) * 90, 760, 'rgba(255,181,71,0.11)');
  glow(W * 0.8 + Math.cos(t * 0.27) * 150, H * 0.74 + Math.sin(t * 0.35) * 100, 820, 'rgba(79,195,247,0.11)');
  // drifting dot grid
  const sp = 48, ox = (t * 9) % sp, oy = (t * 5) % sp;
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  for (let x = -sp + ox; x < W + sp; x += sp)
    for (let y = -sp + oy; y < H + sp; y += sp) ctx.fillRect(x, y, 2.5, 2.5);
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

// Decorative compounding curve (used on title + closing cards).
function drawDecoCurve(p, alpha, color = C.ana) {
  if (p <= 0 || alpha <= 0) return;
  const pts = [];
  const N = 120;
  for (let i = 0; i <= N * p; i++) {
    const u = i / N;
    const x = -40 + u * (W + 80);
    const y = 1010 - (Math.exp(u * 4.2) - 1) / (Math.exp(4.2) - 1) * 680;
    pts.push([x, y]);
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  // fill
  const g = ctx.createLinearGradient(0, 250, 0, H);
  g.addColorStop(0, hexA(color, 0.10)); g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(pts[0][0], H);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(pts[pts.length - 1][0], H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = hexA(color, 0.45); ctx.lineWidth = 4; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  const [hx, hy] = pts[pts.length - 1];
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2); ctx.fill();
  glow(hx, hy, 50, hexA(color, 0.5));
  ctx.restore();
}

// ---------------------------------------------------------------- scene 1: title (0 – 4.6s)
function sceneTitle(t) {
  const OUT = 4.05;
  if (t > OUT + 1) return;
  const deco = prog(t, -0.2, 4.4);
  const decoA = 1 - eIn(prog(t, OUT, OUT + 0.5));
  drawDecoCurve(eInOutSine(deco), decoA * 0.9);

  withPush(t, 0, 4.6, 0.03, () => {
    const p1 = prog(t, -0.5, 0.45) + prog(t, OUT, OUT + 0.45);
    const p2 = prog(t, -0.45, 0.6) + prog(t, OUT + 0.08, OUT + 0.53);
    maskReveal(() => rich([['Why ', C.text], ['starting early', C.ana]], W / 2, 440, { size: 124, weight: 800, align: 'center' }), 440, 124, p1);
    maskReveal(() => rich([['beats ', C.text], ['saving more', C.ben]], W / 2, 590, { size: 124, weight: 800, align: 'center' }), 590, 124, p2);

    const s = vis(t, 0.75, OUT + 0.12, 30);
    const lw = 120 * eOut(prog(t, 0.6, 1.4)) * (1 - eIn(prog(t, OUT, OUT + 0.4)));
    ctx.save(); ctx.fillStyle = C.ana; ctx.globalAlpha = s.a;
    roundRect(W / 2 - lw / 2, 650 + s.y, lw, 6, 3); ctx.fill(); ctx.restore();
    txt('Compound interest in 35 seconds', W / 2, 735 + s.y, { size: 46, weight: 500, color: C.muted, align: 'center', alpha: s.a });
  });
}

// ---------------------------------------------------------------- scene 2: meet Ana and Ben (4.4 – 11.4s)
function personCard(t, o) {
  const { x, y, w, h, color, name, letter, deposit, start, tin, tout, fromLeft } = o;
  const pin = eOut(prog(t, tin, tin + 0.8));
  const pout = eIn(prog(t, tout, tout + 0.5));
  const a = pin * (1 - pout);
  if (a <= 0) return;
  const dx = (1 - pin) * (fromLeft ? -90 : 90) + pout * (fromLeft ? -120 : 120);
  const dy = Math.sin((t + (fromLeft ? 0 : 1.3)) * 1.4) * 4; // idle float
  ctx.save();
  ctx.translate(dx, dy);
  ctx.globalAlpha = a;
  // card
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(x, y, w, h, 28); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); roundRect(x, y, w, h, 28); ctx.clip();
  ctx.fillStyle = color; ctx.fillRect(x, y, w, 7);
  ctx.restore();

  avatar(x + 110, y + 112, 54, color, letter, t);
  txt(name, x + 200, y + 132, { size: 64, weight: 800 });

  const l1 = vis(t, tin + 0.35, null, 24);
  const wAmt = num('$' + deposit, x + 56, y + 268 + l1.y, { size: 84, weight: 800, color, alpha: l1.a });
  txt('a month', x + 56 + wAmt + 18, y + 268 + l1.y, { size: 42, weight: 600, color: C.muted, alpha: l1.a });
  const l2 = vis(t, tin + 0.55, null, 24);
  rich([['Starting at age ', C.text, 500], [String(start), C.text, 800]], x + 56, y + 334 + l2.y, { size: 42, alpha: l2.a });

  // timeline track 25 -> 65
  const tx0 = x + 56, tx1 = x + w - 56, ty = y + 410;
  const ax = (age) => lerp(tx0, tx1, (age - 25) / 40);
  const tr = vis(t, tin + 0.7, null, 16);
  ctx.save(); ctx.globalAlpha *= tr.a; ctx.translate(0, tr.y);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(tx0, ty, tx1 - tx0, 16, 8); ctx.fill();
  const fp = eInOut(prog(t, tin + 1.0, tin + 2.2));
  const fx1 = lerp(ax(start), tx1, fp);
  if (fp > 0) {
    ctx.fillStyle = color; roundRect(ax(start), ty, Math.max(16, fx1 - ax(start)), 16, 8); ctx.fill();
    // shimmer travelling along the filled part
    const sh = ((t * 0.5) % 1.4) / 1.4;
    const sx = lerp(ax(start) - 80, tx1 + 80, sh);
    ctx.save(); roundRect(ax(start), ty, Math.max(16, fx1 - ax(start)), 16, 8); ctx.clip();
    const sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - 60, ty, 120, 16); ctx.restore();
  }
  ctx.restore();
  // tick labels
  const ticks = start === 25 ? [25, 65] : [25, 40, 65];
  ticks.forEach((age) => {
    const dim = age < start;
    txt(String(age), ax(age), ty + 62 + tr.y, { size: 30, weight: 600, color: dim ? 'rgba(174,184,208,0.55)' : C.muted, align: 'center', alpha: tr.a });
  });
  const yrs = vis(t, tin + 2.0, null, 14);
  txt(`${65 - start} years of saving`, (ax(start) + tx1) / 2, ty - 18 + yrs.y, { size: 30, weight: 700, color, align: 'center', alpha: yrs.a });
  ctx.restore();
}

function sceneMeet(t) {
  const T0 = 4.4, OUT = 10.85;
  if (t < T0 || t > OUT + 1.2) return;
  withPush(t, T0, OUT + 0.6, 0.025, () => {
    const hd = vis(t, T0 + 0.1, OUT + 0.25, 30);
    rich([['Meet ', C.text], ['Ana', C.ana], [' and ', C.text], ['Ben', C.ben]], W / 2, 190 + hd.y, { size: 68, weight: 800, align: 'center', alpha: hd.a });

    personCard(t, { x: 170, y: 262, w: 760, h: 500, color: C.ana, name: 'Ana', letter: 'A', deposit: 200, start: 25, tin: T0 + 0.35, tout: OUT, fromLeft: true });
    personCard(t, { x: 990, y: 262, w: 760, h: 500, color: C.ben, name: 'Ben', letter: 'B', deposit: 400, start: 40, tin: T0 + 0.75, tout: OUT + 0.08, fromLeft: false });

    // shared facts chips
    const chips = [['Both stop at 65', T0 + 3.0], ['Both earn 7% a year', T0 + 3.3]];
    const cw = chips.map((c) => measure(c[0], 40, 700) + 80);
    const gap = 36;
    let cx = W / 2 - (cw[0] + cw[1] + gap) / 2;
    chips.forEach((c, i) => {
      const v = vis(t, c[1], OUT + 0.15 + i * 0.06, 30);
      if (v.a > 0) {
        const sc = lerp(0.85, 1, eOutBack(prog(t, c[1], c[1] + 0.6)));
        ctx.save();
        ctx.globalAlpha = v.a;
        ctx.translate(cx + cw[i] / 2, 862 + v.y); ctx.scale(sc, sc);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        roundRect(-cw[i] / 2, -46, cw[i], 92, 46); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.stroke();
        // glint sweeping across the chip
        const gp = ((t - c[1] - 1.0) % 3.0) / 3.0;
        if (t > c[1] + 1.0) {
          ctx.save(); roundRect(-cw[i] / 2, -46, cw[i], 92, 46); ctx.clip();
          const gx = lerp(-cw[i] / 2 - 100, cw[i] / 2 + 100, gp);
          const gg = ctx.createLinearGradient(gx - 50, 0, gx + 50, 0);
          gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gg; ctx.fillRect(gx - 50, -46, 100, 92); ctx.restore();
        }
        ctx.restore();
        txt(c[0], cx + cw[i] / 2, 862 + v.y + 14, { size: 40, weight: 700, align: 'center', alpha: v.a });
      }
      cx += cw[i] + gap;
    });
  });
}

// ---------------------------------------------------------------- scene 3: the race (11.2 – 23.6s)
const PX0 = 250, PX1 = 1300, PY0 = 250, PY1 = 900, YMAX = 600000;
const RACE_A = 12.5, RACE_B = 20.7;
const cx = (age) => lerp(PX0, PX1, (age - 25) / 40);
const cy = (v) => lerp(PY1, PY0, v / YMAX);
function raceAge(t) { return 25 + 40 * eInOutSine(prog(t, RACE_A, RACE_B)); }

function linePath(arr, a0, a1) {
  ctx.beginPath();
  const steps = Math.max(2, Math.ceil((a1 - a0) * 12));
  for (let i = 0; i <= steps; i++) {
    const age = lerp(a0, a1, i / steps);
    const x = cx(age), y = cy(balAt(arr, age));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
}

function drawSeries(arr, a0, a1, color, t) {
  if (a1 <= a0) return;
  // area
  linePath(arr, a0, a1);
  ctx.lineTo(cx(a1), PY1); ctx.lineTo(cx(a0), PY1); ctx.closePath();
  const g = ctx.createLinearGradient(0, PY0, 0, PY1);
  g.addColorStop(0, hexA(color, 0.28)); g.addColorStop(1, hexA(color, 0.02));
  ctx.fillStyle = g; ctx.fill();
  // line with glow
  ctx.save();
  ctx.shadowColor = hexA(color, 0.8); ctx.shadowBlur = 18;
  linePath(arr, a0, a1);
  ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
  // head
  const hx = cx(a1), hy = cy(balAt(arr, a1));
  const pulse = (t * 1.3) % 1;
  ctx.save();
  ctx.strokeStyle = hexA(color, 0.6 * (1 - pulse)); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(hx, hy, 12 + pulse * 26, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return [hx, hy];
}

function sceneRace(t) {
  const T0 = 11.2, OUT = 23.05;
  if (t < T0 || t > OUT + 1) return;
  const outP = eIn(prog(t, OUT, OUT + 0.55));
  ctx.save();
  ctx.globalAlpha = 1 - outP;
  // whole chart drifts up and shrinks a little on exit
  ctx.translate(W / 2, H / 2 - outP * 60); ctx.scale(1 - outP * 0.04, 1 - outP * 0.04); ctx.translate(-W / 2, -H / 2);

  withPush(t, T0, OUT, 0.02, () => {
    const hd = vis(t, T0 + 0.1, null, 30);
    txt('The race to 65', 160, 150 + hd.y, { size: 64, weight: 800, alpha: hd.a });
    const sb = vis(t, T0 + 0.3, null, 24);
    txt('Balance year by year, both earning 7%', 160, 204 + sb.y, { size: 32, weight: 500, color: C.muted, alpha: sb.a });

    // grid + axes
    for (let k = 0; k <= 6; k++) {
      const v = k * 100000, y = cy(v);
      const gp = eOut(prog(t, T0 + 0.25 + k * 0.06, T0 + 1.05 + k * 0.06));
      ctx.strokeStyle = k === 0 ? 'rgba(255,255,255,0.35)' : C.grid; ctx.lineWidth = k === 0 ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(PX0, y); ctx.lineTo(lerp(PX0, PX1, gp), y); ctx.stroke();
      txt(k === 0 ? '$0' : `$${k * 100}k`, PX0 - 24, y + 10, { size: 28, weight: 600, color: C.muted, align: 'right', alpha: gp });
    }
    for (let age = 25; age <= 65; age += 5) {
      const lp = eOut(prog(t, T0 + 0.5 + (age - 25) * 0.012, T0 + 1.1 + (age - 25) * 0.012));
      txt(String(age), cx(age), PY1 + 50 + (1 - lp) * 14, { size: 30, weight: 600, color: C.muted, align: 'center', alpha: lp });
    }
    const axl = vis(t, T0 + 0.9, null, 10);
    txt('Age', PX1 + 30, PY1 + 50, { size: 30, weight: 700, color: C.text, alpha: axl.a });

    const A = raceAge(t);
    const started = t >= RACE_A;

    // "Ben starts" marker at age 40
    const bs = clamp((A - 40) / 1.2);
    if (bs > 0) {
      const x40 = cx(40);
      const lh = eOut(bs);
      ctx.save(); ctx.setLineDash([8, 10]); ctx.strokeStyle = hexA(C.ben, 0.6); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x40, PY1); ctx.lineTo(x40, lerp(PY1, 640, lh)); ctx.stroke(); ctx.restore();
      txt('Ben starts', x40, 620 + (1 - lh) * 20, { size: 32, weight: 700, color: C.ben, align: 'center', alpha: lh });
    }

    if (started) {
      // Ben waiting along zero before 40
      const waitEnd = Math.min(A, 40);
      ctx.save(); ctx.setLineDash([4, 12]); ctx.lineCap = 'round';
      ctx.strokeStyle = hexA(C.ben, 0.55); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx(25), PY1 - 3); ctx.lineTo(cx(waitEnd), PY1 - 3); ctx.stroke(); ctx.restore();

      const anaHead = drawSeries(ANA, 25, A, C.ana, t);
      let benHead = null;
      if (A > 40) benHead = drawSeries(BEN, 40, A, C.ben, t);
      else {
        // Ben's idle head marker at zero
        ctx.fillStyle = hexA(C.ben, 0.9); ctx.beginPath(); ctx.arc(cx(A), PY1 - 3, 7, 0, Math.PI * 2); ctx.fill();
      }
      // name tags at the heads
      const tagFade = 1 - prog(t, RACE_B, RACE_B + 0.4);
      const tagA = clamp((A - 27) / 1.5) * tagFade;
      if (anaHead) txt('Ana', anaHead[0] - 18, anaHead[1] - 26, { size: 32, weight: 800, color: C.ana, align: 'right', alpha: tagA });
      if (benHead) txt('Ben', benHead[0] + 22, benHead[1] + 12, { size: 32, weight: 800, color: C.ben, alpha: clamp((A - 41) / 1.5) * tagFade });
    }

    // ending: gap bracket + callout
    const endP = eOut(prog(t, RACE_B + 0.2, RACE_B + 0.9));
    if (endP > 0) {
      const ya = cy(ANA_END), yb = cy(BEN_END), bx = PX1 + 34;
      ctx.save(); ctx.globalAlpha = endP; ctx.strokeStyle = C.text; ctx.lineWidth = 3;
      const mid = (ya + yb) / 2, half = (yb - ya) / 2 * endP;
      ctx.beginPath();
      ctx.moveTo(bx - 12, mid - half); ctx.lineTo(bx, mid - half); ctx.lineTo(bx, mid + half); ctx.lineTo(bx - 12, mid + half);
      ctx.stroke(); ctx.restore();
      const c1 = vis(t, RACE_B + 0.4, null, 26);
      txt('Ben never catches up.', PX0 + 50, PY0 + 90 + c1.y, { size: 52, weight: 800, alpha: c1.a });
      const c2 = vis(t, RACE_B + 0.75, null, 22);
      rich([["Ana's ", C.ana, 700], ['15-year head start', C.ana, 800], [' keeps compounding.', C.muted, 500]], PX0 + 50, PY0 + 148 + c2.y, { size: 34, alpha: c2.a });
    }

    // live panel
    const PX = 1450;
    const pv = vis(t, T0 + 0.6, null, 30);
    txt('AGE', PX, 300 + pv.y, { size: 30, weight: 700, color: C.muted, ls: 6, alpha: pv.a });
    num(String(Math.floor(A + 1e-6)), PX, 420 + pv.y, { size: 120, weight: 800, alpha: pv.a });

    const rows = [
      ['Ana', C.ana, ANA, 25, 520],
      ['Ben', C.ben, BEN, 40, 720],
    ];
    rows.forEach(([name, color, arr, start, y], i) => {
      const rv = vis(t, T0 + 0.8 + i * 0.15, null, 30);
      ctx.save(); ctx.globalAlpha = rv.a; ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(PX + 12, y - 11 + rv.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      txt(name, PX + 36, y + rv.y, { size: 34, weight: 700, alpha: rv.a });
      const v = balAt(arr, A);
      num(money(Math.round(v / 100) * 100), PX, y + 80 + rv.y, { size: 66, weight: 800, color, alpha: rv.a });
      // paid-in so far
      const months = clamp((A - start) * 12, 0, (65 - start) * 12);
      const paid = Math.floor(months + 1e-6) * (start === 25 ? 200 : 400);
      num(`paid in ${money(paid)}`, PX, y + 128 + rv.y, { size: 28, weight: 500, color: C.muted, alpha: rv.a });
    });
  });
  ctx.restore();
}

// ---------------------------------------------------------------- scene 4: the result (23.4 – 30.6s)
function sceneResult(t) {
  const T0 = 23.4, OUT = 30.05;
  if (t < T0 || t > OUT + 1) return;
  const BX = 460, SCALE = 1000 / 525000;
  withPush(t, T0, OUT + 0.5, 0.02, () => {
    const hd = vis(t, T0 + 0.1, OUT + 0.2, 30);
    txt('At age 65', W / 2, 170 + hd.y, { size: 68, weight: 800, align: 'center', alpha: hd.a });

    const rows = [
      { name: 'Ana', letter: 'A', color: C.ana, paid: ANA_PAID, end: ANA_END, cy: 340, tin: T0 + 0.35 },
      { name: 'Ben', letter: 'B', color: C.ben, paid: BEN_PAID, end: BEN_END, cy: 610, tin: T0 + 0.55 },
    ];
    rows.forEach((r, i) => {
      const v = vis(t, r.tin, OUT + i * 0.08, 36);
      if (v.a <= 0) return;
      ctx.save(); ctx.globalAlpha = v.a; ctx.translate(0, v.y);
      avatar(210, r.cy, 46, r.color, r.letter, t);
      txt(r.name, 290, r.cy + 17, { size: 52, weight: 800 });

      const bh = 104, by = r.cy - bh / 2;
      // track
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(BX, by, 1000, bh, 18); ctx.fill();
      // growth: paid-in first, then compounding growth
      const pPaid = eInOut(prog(t, r.tin + 0.5, r.tin + 1.2));
      const pGrow = eInOut(prog(t, r.tin + 1.5, r.tin + 2.9));
      const paidW = r.paid * SCALE * pPaid;
      const totalW = paidW + (r.end - r.paid) * SCALE * pGrow;
      if (totalW > 1) {
        ctx.save(); roundRect(BX, by, Math.max(totalW, 36), bh, 18); ctx.clip();
        // growth part
        const gg = ctx.createLinearGradient(BX, 0, BX + 1000, 0);
        gg.addColorStop(0, r.color); gg.addColorStop(1, hexA(r.color, 0.85));
        ctx.fillStyle = gg; ctx.fillRect(BX, by, totalW, bh);
        // paid-in part: darker, hatched
        ctx.fillStyle = 'rgba(10,15,31,0.55)'; ctx.fillRect(BX, by, paidW, bh);
        ctx.strokeStyle = hexA(r.color, 0.7); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.rect(BX, by, paidW, bh); ctx.clip();
        const off = (t * 20) % 24;
        ctx.beginPath();
        for (let x = BX - bh + off - 24; x < BX + paidW + 24; x += 24) { ctx.moveTo(x, by + bh); ctx.lineTo(x + bh, by); }
        ctx.stroke();
        ctx.restore();
        // separator
        if (pGrow > 0) { ctx.fillStyle = C.ink; ctx.fillRect(BX + paidW - 2, by, 4, bh); }
        // moving sheen on growth part
        if (pGrow >= 1) {
          const sp = ((t - r.tin) * 0.45) % 1.6 / 1.6;
          const sx = lerp(BX + paidW - 150, BX + totalW + 150, sp);
          ctx.save(); roundRect(BX, by, totalW, bh, 18); ctx.clip();
          const sg = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0);
          sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.22)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sg; ctx.fillRect(sx - 90, by, 180, bh); ctx.restore();
        }
      }
      // value inside bar end (counts up)
      const valA = clamp((totalW - 420) / 90);
      const shown = r.paid + (r.end - r.paid) * pGrow;
      num('≈ ' + money1k(shown), BX + totalW - 26, r.cy + 19, { size: 54, weight: 800, color: C.ink, align: 'right', alpha: valA });
      // labels under the bar
      const lp = vis(t, r.tin + 0.9, null, 14);
      const pw = r.paid * SCALE;
      ctx.save(); ctx.globalAlpha *= lp.a; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); const ly = by + bh + 14 + lp.y;
      ctx.moveTo(BX + 2, ly - 8); ctx.lineTo(BX + 2, ly); ctx.lineTo(BX + pw - 2, ly); ctx.lineTo(BX + pw - 2, ly - 8); ctx.stroke(); ctx.restore();
      rich([['Paid in ', C.text, 500], [money(r.paid), C.text, 800]], BX, by + bh + 56 + lp.y, { size: 34, alpha: lp.a });
      ctx.restore();
    });

    // the gap: ghost extension of Ben's bar up to Ana's total
    const gT = T0 + 3.9;
    const gv = vis(t, gT, OUT + 0.1, 0);
    const gp = eInOut(prog(t, gT, gT + 0.8));
    if (gv.a > 0) {
      const x0 = BX + BEN_END * SCALE, x1 = BX + ANA_END * SCALE;
      const w = (x1 - x0) * gp, by = 610 - 52;
      ctx.save(); ctx.globalAlpha = gv.a;
      ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t * 16;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
      roundRect(x0 + 8, by + 2, Math.max(w - 8, 1), 100, 16); ctx.stroke();
      // guide line from Ana's bar end
      ctx.setLineDash([6, 8]); ctx.strokeStyle = hexA(C.ana, 0.7);
      ctx.beginPath(); ctx.moveTo(x1, 340 + 52); ctx.lineTo(x1, lerp(340 + 52, by, gp)); ctx.stroke();
      ctx.restore();
      const lv = vis(t, gT + 0.6, OUT + 0.1, 12);
      txt(`${money1k(ANA_END - BEN_END)} behind`, (x0 + x1) / 2 + 4, by + 64 + lv.y, { size: 36, weight: 800, align: 'center', alpha: lv.a });
    }

    // callout
    const c1 = prog(t, T0 + 4.5, T0 + 5.2) + prog(t, OUT + 0.15, OUT + 0.6);
    const c2 = prog(t, T0 + 5.1, T0 + 5.8) + prog(t, OUT + 0.22, OUT + 0.67);
    maskReveal(() => rich([['Ana paid in ', C.text], [money(BEN_PAID - ANA_PAID) + ' less', C.ana], [' than Ben,', C.text]], W / 2, 860, { size: 56, weight: 700, align: 'center' }), 860, 56, c1);
    maskReveal(() => rich([['yet finished with ', C.text], ['≈ ' + money1k(ANA_END - BEN_END) + ' more.', C.ana]], W / 2, 946, { size: 56, weight: 700, align: 'center' }), 946, 56, c2);
  });
}

// ---------------------------------------------------------------- scene 5: takeaway (30.4 – 35s)
function sceneTakeaway(t) {
  const T0 = 30.4;
  if (t < T0) return;
  drawDecoCurve(eInOutSine(prog(t, T0, DURATION)), 0.85 * eOut(prog(t, T0, T0 + 0.6)));
  withPush(t, T0, DURATION, 0.035, () => {
    const p1 = prog(t, T0 + 0.25, T0 + 1.05);
    maskReveal(() => txt('Time does the heavy lifting.', W / 2, 470, { size: 96, weight: 800, align: 'center' }), 470, 96, p1);
    const p2 = prog(t, T0 + 0.9, T0 + 1.7);
    maskReveal(() => txt('Start early.', W / 2, 650, { size: 150, weight: 900, color: C.ana, align: 'center' }), 650, 150, p2);
    // underline swoosh
    const up = eInOut(prog(t, T0 + 1.6, T0 + 2.4));
    if (up > 0) {
      const w = measure('Start early.', 150, 900);
      const x0 = W / 2 - w / 2, x1 = W / 2 + w / 2;
      ctx.save(); ctx.strokeStyle = C.ana; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.shadowColor = hexA(C.ana, 0.7); ctx.shadowBlur = 16;
      ctx.beginPath();
      const N = 60;
      for (let i = 0; i <= N * up; i++) {
        const u = i / N;
        const x = lerp(x0, x1, u), y = 700 + Math.sin(u * Math.PI) * 14 - u * 10;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.restore();
    }
  });
}

// ---------------------------------------------------------------- frame
function renderFrame(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  drawBackground(t);
  sceneTitle(t);
  sceneMeet(t);
  sceneRace(t);
  sceneResult(t);
  sceneTakeaway(t);
}

window.VIDEO = { W, H, FPS, DURATION, frames: Math.round(DURATION * FPS) };
window.renderFrame = renderFrame;
window.fontsReady = Promise.all(
  [400, 500, 600, 700, 800, 900].map((w) => document.fonts.load(`${w} 40px Inter`, '0123456789$≈ABC abc'))
).then(() => document.fonts.ready).then(() => true);
