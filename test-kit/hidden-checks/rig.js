// Hidden test rig for the physics job. Usage: node rig.js <physics.js> all | <testId>
const path = require('path'), cp = require('child_process');
const lib = path.resolve(process.argv[2]), which = process.argv[3] || 'all';
const G = 9.81, DT = 1 / 60;
const T = {};
let P;
const W = (g) => P.createWorld({ gravity: g || { x: 0, y: -G } });
const ground = (w, o) => w.addBody(Object.assign({ shape: 'box', width: 200, height: 1, x: 0, y: -0.5, isStatic: true, friction: 0.5, restitution: 0 }, o || {}));
const run = (w, secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) w.step(DT); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const fin = (b) => [b.x, b.y, b.angle, b.vx, b.vy, b.omega].every(Number.isFinite);
const sp = (b) => Math.hypot(b.vx, b.vy);
const f = (x) => (typeof x === 'number' ? +x.toFixed(4) : x);

T.A1_api = () => {
  const w = W(); const a = w.addBody({ shape: 'circle', radius: 0.5 }), b = w.addBody({ shape: 'box', width: 1, height: 2, x: 5 }),
    c = w.addBody({ shape: 'polygon', vertices: [{ x: -0.5, y: -0.2887 }, { x: 0.5, y: -0.2887 }, { x: 0, y: 0.5774 }], x: 10 });
  const ok = [a, b, c].every((o) => ['id', 'x', 'y', 'angle', 'vx', 'vy', 'omega', 'mass', 'inertia'].every((k) => typeof o[k] === 'number')) &&
    new Set([a.id, b.id, c.id]).size === 3 && Array.isArray(w.bodies) && w.bodies.length === 3 && typeof w.getContacts === 'function' && Array.isArray(w.getContacts());
  w.step(DT);
  return [ok, 'fields/ids/bodies/getContacts'];
};
T.A2_mass_inertia = () => {
  const w = W(); const c = w.addBody({ shape: 'circle', radius: 0.5, density: 2 }), b = w.addBody({ shape: 'box', width: 2, height: 1, density: 1, x: 9 }),
    t = w.addBody({ shape: 'polygon', vertices: [{ x: -0.5, y: -0.2887 }, { x: 0.5, y: -0.2887 }, { x: 0, y: 0.5774 }], density: 3, x: 20 });
  const mc = 2 * Math.PI * 0.25;
  return [near(c.mass, mc, 0.01 * mc) && near(c.inertia, 0.5 * mc * 0.25, 0.02 * 0.5 * mc * 0.25) && near(b.mass, 2, 0.02) && near(b.inertia, 2 * 5 / 12, 0.02) && near(t.mass, 3 * 0.433, 0.02) && near(t.inertia, 3 * 0.433 * (1 / 12), 0.01),
    `circle m=${f(c.mass)} I=${f(c.inertia)} box m=${f(b.mass)} I=${f(b.inertia)} tri m=${f(t.mass)} I=${f(t.inertia)}`];
};
T.A3_free_fall = () => { const w = W(); const b = w.addBody({ shape: 'circle', radius: 0.5, y: 100 }); run(w, 1); return [near(100 - b.y, 4.905, 0.2) && near(b.vy, -G, 0.1) && near(b.x, 0, 1e-9), `dy=${f(100 - b.y)} vy=${f(b.vy)}`]; };
T.A4_inertial_motion = () => { const w = W({ x: 0, y: 0 }); const b = w.addBody({ shape: 'box', width: 1, height: 1, vx: 3, vy: -1, omega: 2 }); run(w, 1); return [near(b.x, 3, 0.03) && near(b.y, -1, 0.02) && near(b.angle, 2, 0.02) && near(b.omega, 2, 1e-6), `x=${f(b.x)} y=${f(b.y)} angle=${f(b.angle)}`]; };
T.A5_static_immovable = () => { const w = W(); const g = ground(w); const b = w.addBody({ shape: 'box', width: 1, height: 1, y: 3, density: 50 }); run(w, 2); return [g.x === 0 && g.y === -0.5 && g.angle === 0 && g.vx === 0 && g.vy === 0, `ground ${g.x},${g.y},${g.angle}`]; };
T.A6_apply_impulse = () => {
  const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'box', width: 2, height: 1 }); w.applyImpulse(a, { x: 0, y: 4 }); w.step(DT);
  const b = w.addBody({ shape: 'box', width: 2, height: 1, x: 10 }); w.applyImpulse(b, { x: 0, y: 1 }, { x: 11, y: 0 }); w.step(DT);
  return [near(a.vy, 2, 0.02) && near(a.omega, 0, 1e-6) && near(b.vy, 0.5, 0.01) && near(b.omega, 1.2, 0.03), `a.vy=${f(a.vy)} b.vy=${f(b.vy)} b.omega=${f(b.omega)}`];
};
T.A7_remove_body = () => { const w = W(); ground(w); const a = w.addBody({ shape: 'box', width: 1, height: 1, y: 0.5 }), b = w.addBody({ shape: 'box', width: 1, height: 1, y: 1.5 }); run(w, 0.5); w.removeBody(a); run(w, 1.5); return [w.bodies.length === 2 && near(b.y, 0.5, 0.05), `bodies=${w.bodies.length} top y=${f(b.y)}`]; };
T.A8_deterministic = () => {
  const make = () => { const w = W(); ground(w); let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; const bs = [];
    for (let i = 0; i < 60; i++) bs.push(w.addBody(i % 2 ? { shape: 'circle', radius: 0.2 + 0.2 * r(), x: -5 + 10 * r(), y: 1 + 12 * r() } : { shape: 'box', width: 0.3 + 0.5 * r(), height: 0.3 + 0.5 * r(), x: -5 + 10 * r(), y: 1 + 12 * r(), angle: r() }));
    run(w, 4); return bs.map((b) => [b.x, b.y, b.angle]); };
  const a = make(), b = make(); let same = true; for (let i = 0; i < a.length; i++) for (let k = 0; k < 3; k++) if (a[i][k] !== b[i][k]) same = false;
  return [same && a.every((p) => p.every(Number.isFinite)), 'two identical runs'];
};

T.B1_circle_rests = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'circle', radius: 0.5, y: 2 }); run(w, 3); return [near(b.y, 0.5, 0.03) && Math.abs(b.vy) < 0.05 && Math.abs(b.vx) < 0.01, `y=${f(b.y)} vy=${f(b.vy)}`]; };
T.B2_box_rests = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'box', width: 1, height: 1, y: 2 }); run(w, 3); return [near(b.y, 0.5, 0.03) && Math.abs(b.vy) < 0.05 && Math.abs(b.angle) < 0.01 && Math.abs(b.x) < 0.01, `y=${f(b.y)} vy=${f(b.vy)} angle=${f(b.angle)}`]; };
T.B3_no_jitter_at_rest = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'box', width: 2, height: 1, y: 0.6 }); run(w, 2); const x = b.x, y = b.y, a = b.angle; let mv = 0; for (let i = 0; i < 600; i++) { w.step(DT); mv = Math.max(mv, sp(b)); } return [Math.hypot(b.x - x, b.y - y) < 0.01 && Math.abs(b.angle - a) < 0.005 && mv < 0.05, `drift=${f(Math.hypot(b.x - x, b.y - y))} maxspeed=${f(mv)}`]; };
T.B4_contacts_reported = () => { const w = W(); const g = ground(w); const b = w.addBody({ shape: 'circle', radius: 0.5, y: 0.6 }); run(w, 2); w.step(DT); const cs = w.getContacts().filter((c) => (c.a === b.id && c.b === g.id) || (c.a === g.id && c.b === b.id));
  const c = cs[0] || {}; return [cs.length >= 1 && c.normal && Math.abs(c.normal.y) > 0.9 && c.point && Math.abs(c.point.y) < 0.1 && typeof c.depth === 'number', JSON.stringify(c).slice(0, 120)]; };
T.B5_triangle_settles = () => { const V = [{ x: -0.5, y: -0.2887 }, { x: 0.5, y: -0.2887 }, { x: 0, y: 0.5774 }]; const w = W(); ground(w); const b = w.addBody({ shape: 'polygon', vertices: V, y: 2, angle: 0.3 }); run(w, 6);
  const ys = V.map((v) => b.y + v.x * Math.sin(b.angle) + v.y * Math.cos(b.angle)); const lo = Math.min(...ys); return [Math.abs(lo) < 0.04 && sp(b) < 0.1 && Math.abs(b.omega) < 0.1 && ys.filter((y) => Math.abs(y) < 0.05).length === 2, `lowest=${f(lo)} speed=${f(sp(b))} omega=${f(b.omega)}`]; };
T.B6_box_lands_flat = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'box', width: 1, height: 1, y: 3, angle: 0.6 }); run(w, 6); const a = ((b.angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); const off = Math.min(a, Math.PI / 2 - a);
  return [off < 0.03 && near(b.y, 0.5, 0.04) && sp(b) < 0.1 && Math.abs(b.omega) < 0.1, `angle off flat=${f(off)} y=${f(b.y)}`]; };
T.B7_tall_box_topples = () => { const w = W(); ground(w, { friction: 0.6 }); const b = w.addBody({ shape: 'box', width: 1, height: 3, y: 1.5783, angle: 0.4, friction: 0.6 }); run(w, 7); return [near(b.angle, Math.PI / 2, 0.06) && near(b.y, 0.5, 0.05) && Math.abs(b.omega) < 0.1 && b.x < 0, `angle=${f(b.angle)} y=${f(b.y)} x=${f(b.x)}`]; };
T.B8_wide_box_rights_itself = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'box', width: 3, height: 1, y: 0.79, angle: 0.2 }); run(w, 5); return [Math.abs(b.angle) < 0.03 && near(b.y, 0.5, 0.04) && Math.abs(b.omega) < 0.1, `angle=${f(b.angle)} y=${f(b.y)}`]; };

T.C1_bounce_restitution = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'circle', radius: 0.5, y: 5.5, restitution: 0.8 }); let hit = false, top = 0; for (let i = 0; i < 240; i++) { w.step(DT); if (b.vy > 0) hit = true; if (hit) top = Math.max(top, b.y - 0.5); if (hit && b.vy < 0 && top > 0.5) break; } return [near(top, 3.2, 0.4), `rebound height=${f(top)} (expect 3.2)`]; };
T.C2_no_bounce_at_zero = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'circle', radius: 0.5, y: 5.5, restitution: 0 }); let hit = false, top = 0; for (let i = 0; i < 240; i++) { w.step(DT); if (b.y < 0.6) hit = true; if (hit) top = Math.max(top, b.y - 0.5); } return [hit && top < 0.1, `rebound=${f(top)}`]; };
T.C3_elastic_equal = () => { const w = W({ x: 0, y: 0 }); const o = { shape: 'circle', radius: 0.5, restitution: 1, friction: 0 }; const a = w.addBody(Object.assign({ x: -3, vx: 3 }, o)), b = w.addBody(Object.assign({ x: 0 }, o)); run(w, 2); return [near(a.vx, 0, 0.1) && near(b.vx, 3, 0.1) && Math.abs(a.vy) + Math.abs(b.vy) < 1e-6, `a.vx=${f(a.vx)} b.vx=${f(b.vx)}`]; };
T.C4_elastic_unequal = () => { const w = W({ x: 0, y: 0 }); const o = { shape: 'circle', radius: 0.5, restitution: 1, friction: 0 }; const a = w.addBody(Object.assign({ x: -3, vx: 4, density: 1 }, o)), b = w.addBody(Object.assign({ x: 0, density: 3 }, o)); run(w, 2); return [near(a.vx, -2, 0.1) && near(b.vx, 2, 0.1), `a.vx=${f(a.vx)} b.vx=${f(b.vx)}`]; };
T.C5_momentum_inelastic = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'box', width: 1, height: 1, x: -3, vx: 4, friction: 0 }), b = w.addBody({ shape: 'box', width: 1, height: 1, x: 0, density: 2, friction: 0 }); const p0 = a.mass * a.vx; run(w, 2); const p1 = a.mass * a.vx + b.mass * b.vx; return [near(p1, p0, 0.02 * p0) && near(a.vx, b.vx, 0.05) && b.x - a.x > 0.97, `p ${f(p0)}->${f(p1)} va=${f(a.vx)} vb=${f(b.vx)} gap=${f(b.x - a.x)}`]; };
T.C6_energy_elastic_box = () => { const w = W({ x: 0, y: 0 }); const wall = (x, y, wd, h) => w.addBody({ shape: 'box', width: wd, height: h, x, y, isStatic: true, restitution: 1, friction: 0 }); wall(0, -5.5, 12, 1); wall(0, 5.5, 12, 1); wall(-5.5, 0, 1, 12); wall(5.5, 0, 1, 12);
  const b = w.addBody({ shape: 'circle', radius: 0.5, vx: 3, vy: 4.2, restitution: 1, friction: 0 }); const v0 = sp(b); run(w, 10); return [near(sp(b), v0, 0.05 * v0) && Math.abs(b.x) < 5 && Math.abs(b.y) < 5, `speed ${f(v0)}->${f(sp(b))} pos ${f(b.x)},${f(b.y)}`]; };
const ramp = (th, mu) => { const w = W(); w.addBody({ shape: 'box', width: 60, height: 1, angle: th, isStatic: true, friction: mu }); const t = { x: Math.cos(th), y: Math.sin(th) }, n = { x: -Math.sin(th), y: Math.cos(th) }; const s = 15, h = 1.002;
  const b = w.addBody({ shape: 'box', width: 1, height: 1, x: s * t.x + h * n.x, y: s * t.y + h * n.y, angle: th, friction: mu }); const x0 = b.x, y0 = b.y; return { w, b, d: () => -((b.x - x0) * t.x + (b.y - y0) * t.y) }; };
T.D1_slope_holds = () => { const r = ramp(20 * Math.PI / 180, 0.8); run(r.w, 3); return [Math.abs(r.d()) < 0.05, `slid ${f(r.d())} m`]; };
T.D2_slope_slides = () => { const r = ramp(30 * Math.PI / 180, 0.2); run(r.w, 1.5); const e = 0.5 * G * (0.5 - 0.2 * Math.cos(Math.PI / 6)) * 2.25; return [near(r.d(), e, 0.12 * e), `slid ${f(r.d())} m (expect ${f(e)})`]; };
T.D3_slope_frictionless = () => { const r = ramp(30 * Math.PI / 180, 0); run(r.w, 1.5); const e = 0.5 * G * 0.5 * 2.25; return [near(r.d(), e, 0.08 * e), `slid ${f(r.d())} m (expect ${f(e)})`]; };
T.D4_sliding_ball_rolls = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'circle', radius: 0.5, y: 0.5, vx: 2, friction: 0.5 }); run(w, 2.5); return [near(b.vx, 4 / 3, 0.15) && near(b.omega, -b.vx / 0.5, 0.2 * Math.abs(b.vx / 0.5)), `vx=${f(b.vx)} (expect 1.333) omega=${f(b.omega)}`]; };
T.D5_friction_stops_box = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'box', width: 1, height: 1, y: 0.5, vx: 4, friction: 0.5 }); run(w, 3); const e = 16 / (2 * 0.5 * G); return [near(b.x, e, 0.15 * e) && Math.abs(b.vx) < 0.05 && Math.abs(b.angle) < 0.05, `stopped at x=${f(b.x)} (expect ${f(e)}) vx=${f(b.vx)}`]; };

const stack = (n, secs) => { const w = W(); ground(w); const bs = []; for (let i = 0; i < n; i++) bs.push(w.addBody({ shape: 'box', width: 1, height: 1, y: 0.5 + i })); run(w, secs); const top = bs[n - 1];
  const maxA = Math.max(...bs.map((b) => Math.abs(b.angle))), maxV = Math.max(...bs.map(sp)); const ok = bs.every(fin) && Math.abs(top.x) < 0.1 && top.y > n - 0.5 - 0.02 * n - 0.05 && top.y < n - 0.5 + 0.05 && maxA < 0.05 && maxV < 0.1;
  return [ok, `top x=${f(top.x)} y=${f(top.y)} (expect ${n - 0.5}) maxAngle=${f(maxA)} maxSpeed=${f(maxV)}`]; };
T.E1_stack_3 = () => stack(3, 5);
T.E2_stack_10 = () => stack(10, 10);
T.E3_stack_20 = () => stack(20, 10);
T.E4_pyramid_36 = () => { const w = W(); ground(w); const bs = []; for (let k = 0; k < 8; k++) for (let i = 0; i < 8 - k; i++) { const x = (i - (8 - k - 1) / 2) * 1.05, y = 0.5 + k; const b = w.addBody({ shape: 'box', width: 1, height: 1, x, y }); bs.push([b, x, y]); }
  run(w, 8); const d = Math.max(...bs.map(([b, x, y]) => Math.hypot(b.x - x, b.y - y))); return [bs.every(([b]) => fin(b)) && d < 0.2, `max displacement=${f(d)}`]; };
T.E5_circle_pile = () => { const w = W(); ground(w); w.addBody({ shape: 'box', width: 1, height: 20, x: -3, y: 10, isStatic: true }); w.addBody({ shape: 'box', width: 1, height: 20, x: 3, y: 10, isStatic: true }); const bs = [];
  for (let i = 0; i < 40; i++) bs.push(w.addBody({ shape: 'circle', radius: 0.4, x: -1.8 + (i % 5) * 0.9 + (Math.floor(i / 5) % 2) * 0.1, y: 0.5 + Math.floor(i / 5) * 0.9 })); run(w, 8);
  const mv = Math.max(...bs.map(sp)), lo = Math.min(...bs.map((b) => b.y)), out = bs.some((b) => Math.abs(b.x) > 2.5 + 0.05 - 0.4 || !fin(b)); return [!out && mv < 0.15 && lo > 0.36, `maxSpeed=${f(mv)} lowest=${f(lo)} escaped=${out}`]; };

T.F1_bullet_vs_wall = () => { const w = W({ x: 0, y: 0 }); w.addBody({ shape: 'box', width: 0.1, height: 10, x: 5, isStatic: true }); const b = w.addBody({ shape: 'circle', radius: 0.1, vx: 200 }); run(w, 0.5); return [fin(b) && b.x < 5, `x=${f(b.x)} (wall at 5)`]; };
T.F2_fast_box_vs_thin_wall = () => { const w = W({ x: 0, y: 0 }); w.addBody({ shape: 'box', width: 0.05, height: 10, x: 8, isStatic: true }); const b = w.addBody({ shape: 'box', width: 0.2, height: 0.2, vx: 300, y: 0.3 }); run(w, 0.5); return [fin(b) && b.x < 8, `x=${f(b.x)} (wall at 8)`]; };
T.F3_fast_fall_thin_floor = () => { const w = W(); w.addBody({ shape: 'box', width: 20, height: 0.05, isStatic: true }); const b = w.addBody({ shape: 'circle', radius: 0.1, y: 5, vy: -150 }); run(w, 1); return [fin(b) && b.y > 0, `y=${f(b.y)}`]; };
T.F4_fast_diagonal_polygon = () => { const w = W({ x: 0, y: 0 }); w.addBody({ shape: 'box', width: 0.05, height: 30, x: 6, isStatic: true }); const b = w.addBody({ shape: 'polygon', vertices: [{ x: -0.15, y: -0.0866 }, { x: 0.15, y: -0.0866 }, { x: 0, y: 0.1732 }], vx: 250, vy: 120, omega: 20 }); run(w, 0.4); return [fin(b) && b.x < 6, `x=${f(b.x)} (wall at 6)`]; };

const stress = () => { const w = W(); ground(w); w.addBody({ shape: 'box', width: 1, height: 60, x: -10.5, y: 30, isStatic: true }); w.addBody({ shape: 'box', width: 1, height: 60, x: 10.5, y: 30, isStatic: true }); const bs = [];
  for (let i = 0; i < 500; i++) { const x = -8.4 + (i % 25) * 0.7, y = 1 + Math.floor(i / 25) * 0.7; bs.push(w.addBody(i % 2 ? { shape: 'circle', radius: 0.25, x, y } : { shape: 'box', width: 0.5, height: 0.5, x, y })); } return { w, bs }; };
T.G1_perf_500 = () => { const { w } = stress(); for (let i = 0; i < 120; i++) w.step(DT); const ts = []; for (let i = 0; i < 120; i++) { const t = process.hrtime.bigint(); w.step(DT); ts.push(Number(process.hrtime.bigint() - t) / 1e6); } ts.sort((a, b) => a - b); const med = ts[60]; return [med < 10, `median step=${f(med)} ms (limit 10)`, med]; };
T.G2_stress_stays_sane = () => { const { w, bs } = stress(); run(w, 6); const bad = bs.filter((b) => !fin(b) || Math.abs(b.x) > 10.1 || b.y < 0.1 || b.y > 40).length, mv = Math.max(...bs.map(sp)); return [bad === 0 && mv < 5, `escaped/NaN=${bad} maxSpeed=${f(mv)}`]; };


// ---------------------------------------------------------------- full-version tests (physxl job)
const X = {};
X.J1_pendulum_period = () => { const w = W(); const b = w.addBody({ shape: 'circle', radius: 0.2, x: 2 * Math.sin(0.15), y: -2 * Math.cos(0.15) }); w.addJoint({ type: 'distance', bodyA: b, bodyB: null, anchorB: { x: 0, y: 0 }, length: 2 });
  const zc = []; let px = b.x; for (let i = 0; i < 600; i++) { w.step(DT); if (px > 0 && b.x <= 0) zc.push(i * DT); px = b.x; } const per = zc.length >= 3 ? (zc[2] - zc[0]) / 2 : 0; const e = 2 * Math.PI * Math.sqrt(2 / G);
  return [near(per, e, 0.05 * e) && near(Math.hypot(b.x, b.y), 2, 0.04), `period=${f(per)} (expect ${f(e)}) length=${f(Math.hypot(b.x, b.y))}`]; };
X.J2_distance_rigid = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'circle', radius: 0.3, x: -1, vy: 3 }), b = w.addBody({ shape: 'circle', radius: 0.3, x: 1, vy: -3 }); w.addJoint({ type: 'distance', bodyA: a, bodyB: b, length: 2 });
  let worst = 0; for (let i = 0; i < 300; i++) { w.step(DT); worst = Math.max(worst, Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 2)); } return [worst < 0.04 && near(sp(a), 3, 0.15), `max length error=${f(worst)} speed=${f(sp(a))}`]; };
X.J3_revolute_pin = () => { const w = W(); const b = w.addBody({ shape: 'box', width: 2, height: 0.2, x: 1, y: 0 }); w.addJoint({ type: 'revolute', bodyA: b, bodyB: null, anchor: { x: 0, y: 0 } }); let worst = 0, low = 0;
  for (let i = 0; i < 300; i++) { w.step(DT); const px = b.x - Math.cos(b.angle), py = b.y - Math.sin(b.angle); worst = Math.max(worst, Math.hypot(px, py)); low = Math.min(low, b.y); } return [worst < 0.03 && low < -0.9 && fin(b), `pin drift=${f(worst)} lowest y=${f(low)}`]; };
X.J4_chain_hangs = () => { const w = W(); const bs = []; let prev = null; for (let i = 0; i < 10; i++) { const b = w.addBody({ shape: 'box', width: 0.2, height: 1, x: 0, y: -0.5 - i }); w.addJoint({ type: 'revolute', bodyA: b, bodyB: prev, anchor: { x: 0, y: -i } }); bs.push(b); prev = b; }
  w.applyImpulse(bs[9], { x: 0.3, y: 0 }); run(w, 10); const last = bs[9]; return [bs.every(fin) && near(last.y, -9.5, 0.25) && Math.abs(last.x) < 1.5 && Math.max(...bs.map(sp)) < 3, `last link at ${f(last.x)},${f(last.y)} (expect y -9.5) maxSpeed=${f(Math.max(...bs.map(sp)))}`]; };
X.J5_remove_joint = () => { const w = W(); const b = w.addBody({ shape: 'circle', radius: 0.2, y: -1 }); const j = w.addJoint({ type: 'distance', bodyA: b, bodyB: null, anchorB: { x: 0, y: 0 }, length: 1 }); run(w, 1); const y1 = b.y; w.removeJoint(j); run(w, 1);
  return [near(y1, -1, 0.03) && b.y < -5 && w.joints.length === 0, `held at ${f(y1)}, after removal y=${f(b.y)}`]; };
X.J6_joined_bodies_do_not_collide = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'box', width: 1, height: 1 }), b = w.addBody({ shape: 'box', width: 1, height: 1, x: 0.5 }); w.addJoint({ type: 'revolute', bodyA: a, bodyB: b, anchor: { x: 0.25, y: 0 } }); run(w, 2);
  return [near(b.x - a.x, 0.5, 0.02) && sp(a) < 0.01 && sp(b) < 0.01, `gap=${f(b.x - a.x)} speeds=${f(sp(a))},${f(sp(b))}`]; };
X.S1_falls_asleep = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'box', width: 1, height: 1, y: 0.5 }); const s0 = b.sleeping; run(w, 3); return [s0 !== true && b.sleeping === true, `sleeping at start=${s0}, after 3s=${b.sleeping}`]; };
X.S2_wakes_on_hit = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'box', width: 1, height: 1, y: 0.5 }); run(w, 3); const was = b.sleeping; const c = w.addBody({ shape: 'circle', radius: 0.3, x: -4, y: 0.5, vx: 12, density: 5 }); let woke = false; for (let i = 0; i < 60; i++) { w.step(DT); if (b.sleeping === false) woke = true; }
  return [was === true && woke && b.x > 0.05, `asleep before=${was} woke=${woke} moved to x=${f(b.x)}`]; };
X.S3_wakes_on_impulse = () => { const w = W(); ground(w); const b = w.addBody({ shape: 'box', width: 1, height: 1, y: 0.5 }); run(w, 3); const was = b.sleeping; w.applyImpulse(b, { x: 0, y: 5 * b.mass }); w.step(DT); const s1 = b.sleeping; run(w, 0.3); return [was === true && s1 === false && b.y > 0.8, `asleep=${was} after impulse sleeping=${s1} y=${f(b.y)}`]; };
X.S4_support_removed_wakes = () => { const w = W(); ground(w); const a = w.addBody({ shape: 'box', width: 1, height: 1, y: 0.5 }), b = w.addBody({ shape: 'box', width: 1, height: 1, y: 1.5 }); run(w, 3); const was = b.sleeping; w.removeBody(a); run(w, 1.5); return [was === true && near(b.y, 0.5, 0.05), `asleep=${was} top box y=${f(b.y)} (expect 0.5)`]; };
X.S5_sleep_perf_2000 = () => { const w = W(); ground(w, { width: 400 }); for (let i = 0; i < 2000; i++) w.addBody({ shape: 'box', width: 0.5, height: 0.5, x: -100 + (i % 200) * 1.0, y: 0.25 + Math.floor(i / 200) * 0.5 }); for (let i = 0; i < 240; i++) w.step(DT);
  const ts = []; for (let i = 0; i < 60; i++) { const t = process.hrtime.bigint(); w.step(DT); ts.push(Number(process.hrtime.bigint() - t) / 1e6); } ts.sort((a, b) => a - b); const asleep = w.bodies.filter((b) => b.sleeping === true).length; return [ts[30] < 2.5 && asleep >= 1990, `median step=${f(ts[30])} ms asleep=${asleep}/2000`, ts[30]]; };
X.Q1_raycast_closest = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'box', width: 1, height: 1, x: 5 }), b = w.addBody({ shape: 'circle', radius: 0.5, x: 3 }), c = w.addBody({ shape: 'box', width: 1, height: 1, x: 3, y: 4 }); w.step(DT); const h = w.raycast({ x: 0, y: 0 }, { x: 10, y: 0 });
  return [!!h && h.body === b && near(h.point.x, 2.5, 0.01) && near(h.point.y, 0, 0.01) && near(h.normal.x, -1, 0.02) && near(h.fraction, 0.25, 0.002), h ? `hit id=${h.body && h.body.id} at ${f(h.point.x)},${f(h.point.y)} normal ${f(h.normal.x)},${f(h.normal.y)} fraction=${f(h.fraction)}` : 'null']; };
X.Q2_raycast_rotated_and_miss = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'box', width: 2, height: 2, x: 5, angle: Math.PI / 4 }); w.addBody({ shape: 'circle', radius: 0.5, x: 2, y: 0.2, isSensor: true }); w.step(DT); const h = w.raycast({ x: 0, y: 0 }, { x: 10, y: 0 }), m = w.raycast({ x: 0, y: 3 }, { x: 10, y: 3 });
  return [!!h && h.body === a && near(h.point.x, 5 - Math.SQRT2, 0.01) && m === null, h ? `hit x=${f(h.point.x)} (expect ${f(5 - Math.SQRT2)}) miss=${m}` : 'null']; };
X.Q3_query_aabb = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'box', width: 1, height: 1, x: 0 }), b = w.addBody({ shape: 'circle', radius: 0.5, x: 3 }), c = w.addBody({ shape: 'box', width: 1, height: 1, x: 10 }); w.step(DT); const r = w.queryAABB({ minX: -1, minY: -1, maxX: 2.6, maxY: 1 }).map((x) => x.id).sort();
  return [r.length === 2 && r.includes(a.id) && r.includes(b.id), `ids=${r}`]; };
X.Q4_query_point = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'box', width: 4, height: 0.4, angle: Math.PI / 4 }), b = w.addBody({ shape: 'circle', radius: 1, x: 5 }); w.step(DT); const i1 = w.queryPoint({ x: 1, y: 1 }).map((x) => x.id), i2 = w.queryPoint({ x: 1, y: -1 }), i3 = w.queryPoint({ x: 5.6, y: 0.6 }).map((x) => x.id), i4 = w.queryPoint({ x: 5.8, y: 0.8 });
  return [i1.length === 1 && i1[0] === a.id && i2.length === 0 && i3.length === 1 && i3[0] === b.id && i4.length === 0, `${i1} | ${i2.length} | ${i3} | ${i4.length}`]; };
X.V1_filtering = () => { const w = W(); ground(w, { category: 1, mask: 0xFFFF }); const a = w.addBody({ shape: 'box', width: 1, height: 1, y: 0.5, category: 2, mask: 1 }), b = w.addBody({ shape: 'box', width: 1, height: 1, y: 3, category: 2, mask: 1 }), c = w.addBody({ shape: 'box', width: 1, height: 1, x: 5, y: 3, category: 4, mask: 0xFFFE }); run(w, 3);
  return [near(a.y, 0.5, 0.03) && near(b.y, 0.5, 0.03) && c.y < -5, `a.y=${f(a.y)} b.y=${f(b.y)} (both 0.5: same category passes through) c.y=${f(c.y)} (falls through ground)`]; };
X.V2_sensor_and_events = () => { const w = W(); ground(w); const s = w.addBody({ shape: 'box', width: 2, height: 1, y: 3, isStatic: true, isSensor: true }), b = w.addBody({ shape: 'circle', radius: 0.3, y: 6 }); const ev = [];
  w.on('beginContact', (x, y) => ev.push(['b', x.id, y.id])); w.on('endContact', (x, y) => ev.push(['e', x.id, y.id])); run(w, 3); const has = (t, i, j) => ev.filter((e) => e[0] === t && ((e[1] === i && e[2] === j) || (e[1] === j && e[2] === i))).length;
  return [near(b.y, 0.3, 0.03) && has('b', s.id, b.id) === 1 && has('e', s.id, b.id) === 1 && has('b', b.id, 1) + ev.filter((e) => e[0] === 'b').length >= 2, `ball y=${f(b.y)} sensor begin=${has('b', s.id, b.id)} end=${has('e', s.id, b.id)} events=${ev.length}`]; };
X.V3_events_once_per_touch = () => { const w = W(); const g = ground(w); const b = w.addBody({ shape: 'circle', radius: 0.5, y: 3, restitution: 0.6 }); let nb = 0, ne = 0; const fb = () => nb++; w.on('beginContact', fb); w.on('endContact', () => ne++); run(w, 1.6); const nb1 = nb, ne1 = ne; w.off('beginContact', fb); run(w, 6);
  return [nb1 >= 1 && nb1 <= 2 && ne1 >= 1 && nb === nb1 && ne >= ne1, `begin after first bounces=${nb1} end=${ne1}; after off(): begin=${nb}`]; };
X.K1_kinematic_carries = () => { const w = W(); const p = w.addBody({ shape: 'box', width: 6, height: 0.5, y: 0, isKinematic: true, vx: 1, friction: 0.8 }), b = w.addBody({ shape: 'box', width: 1, height: 1, y: 0.75, friction: 0.8 }); run(w, 4);
  return [near(p.x, 4, 0.05) && near(p.y, 0, 1e-9) && near(b.vx, 1, 0.1) && Math.abs(b.x - p.x) < 0.3 && near(b.y, 0.75, 0.04), `platform x=${f(p.x)} box x=${f(b.x)} vx=${f(b.vx)} y=${f(b.y)}`]; };
X.K2_kinematic_unstoppable = () => { const w = W(); ground(w); const p = w.addBody({ shape: 'box', width: 1, height: 1, x: -3, y: 0.5, isKinematic: true, vx: 2 }), b = w.addBody({ shape: 'box', width: 1, height: 1, x: 0, y: 0.5, density: 100 }); run(w, 2);
  return [near(p.x, 1, 0.03) && near(p.vx, 2, 1e-9) && b.x > p.x + 0.97 && near(p.y, 0.5, 1e-9), `kinematic x=${f(p.x)} pushed box x=${f(b.x)}`]; };
X.M1_force = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'box', width: 2, height: 1 }), b = w.addBody({ shape: 'box', width: 2, height: 1, y: 10 }); for (let i = 0; i < 60; i++) { w.applyForce(a, { x: 10, y: 0 }); w.step(DT); } w.applyForce(b, { x: 10, y: 0 }); run(w, 1);
  return [near(a.vx, 5, 0.06) && near(b.vx, 10 / 2 / 60, 0.005) && near(a.omega, 0, 1e-6), `a.vx=${f(a.vx)} (expect 5) b.vx=${f(b.vx)} (expect 0.0833)`]; };
X.M2_force_torque = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'box', width: 2, height: 1 }); w.applyForce(a, { x: 0, y: 6 }, { x: 1, y: 0 }); w.step(DT); const e = 6 * 1 / (10 / 12) / 60; return [near(a.omega, e, 0.03 * e) && near(a.vy, 6 / 2 / 60, 0.002), `omega=${f(a.omega)} (expect ${f(e)}) vy=${f(a.vy)}`]; };
X.M3_damping = () => { const w = W({ x: 0, y: 0 }); const a = w.addBody({ shape: 'circle', radius: 0.5, vx: 10, omega: 10, linearDamping: 1, angularDamping: 2 }); run(w, 1); return [near(a.vx, 10 * Math.exp(-1), 0.25) && near(a.omega, 10 * Math.exp(-2), 0.25), `vx=${f(a.vx)} (expect 3.68) omega=${f(a.omega)} (expect 1.35)`]; };
X.M4_gravity_scale = () => { const w = W(); const a = w.addBody({ shape: 'circle', radius: 0.5, gravityScale: 0, canSleep: false }), b = w.addBody({ shape: 'circle', radius: 0.5, x: 5, gravityScale: 2 }); run(w, 1); return [near(a.y, 0, 1e-9) && near(b.vy, -2 * G, 0.2), `a.y=${f(a.y)} b.vy=${f(b.vy)}`]; };
X.R1_save_restore = () => { const w = W(); ground(w); let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 30; i++) w.addBody(i % 2 ? { shape: 'circle', radius: 0.2 + 0.2 * r(), x: -4 + 8 * r(), y: 1 + 8 * r(), restitution: 0.3 } : { shape: 'box', width: 0.4 + 0.4 * r(), height: 0.4 + 0.4 * r(), x: -4 + 8 * r(), y: 1 + 8 * r(), angle: r() });
  const p = w.addBody({ shape: 'circle', radius: 0.3, x: 8, y: 3 }); w.addJoint({ type: 'distance', bodyA: p, bodyB: null, anchorB: { x: 6, y: 5 } }); run(w, 1.5); const c = P.fromJSON(JSON.parse(JSON.stringify(w.toJSON()))); run(w, 2); run(c, 2);
  const key = (x) => x.bodies.slice().sort((a, b) => a.id - b.id).map((b) => [b.id, b.x, b.y, b.angle, b.vx, b.vy]); const A = key(w), B = key(c); let same = A.length === B.length, close = same; for (let i = 0; same && i < A.length; i++) for (let k = 0; k < 6; k++) { if (A[i][k] !== B[i][k]) same = false; if (Math.abs(A[i][k] - B[i][k]) > 1e-6) close = false; }
  return [same && c.joints.length === 1, `identical=${same} close=${close} bodies=${B.length} joints=${c.joints && c.joints.length}`]; };
X.R2_json_is_plain = () => { const w = W(); ground(w); w.addBody({ shape: 'polygon', vertices: [{ x: -0.5, y: -0.2887 }, { x: 0.5, y: -0.2887 }, { x: 0, y: 0.5774 }], y: 2, friction: 0.3, restitution: 0.2, category: 2, mask: 3, linearDamping: 0.1 }); run(w, 0.5); const j = w.toJSON(); const t = JSON.stringify(j); const c = P.fromJSON(JSON.parse(t)); const b = c.bodies.find((x) => !x.isStatic && x.mass > 0 && x.y > 0.1) || {};
  return [t.length > 50 && c.bodies.length === 2 && near(b.mass, 0.433, 0.01) && JSON.stringify(c.toJSON()) === t, `json ${t.length} chars, bodies=${c.bodies.length}, round trip equal=${JSON.stringify(c.toJSON()) === t}`]; };

if (process.argv[4] === 'xl' || which.match(/^[JSQVKMR]\d_/)) Object.assign(T, X);
if (which === 'all') {
  const out = [];
  for (const id of Object.keys(T)) {
    const r = cp.spawnSync(process.execPath, [__filename, lib, id, process.argv[4] || ''], { encoding: 'utf8', timeout: 90000 });
    let res; try { res = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { res = { id, ok: false, detail: r.error ? 'timeout (90s)' : ('crash: ' + (r.stderr || '').trim().split('\n').slice(0, 3).join(' | ').slice(0, 200)) }; }
    out.push(res);
  }
  console.log(JSON.stringify(out));
} else {
  let res;
  try { P = require(lib); const r = T[which](); res = { id: which, ok: !!r[0], detail: String(r[1]), value: r[2] }; } catch (e) { res = { id: which, ok: false, detail: 'threw: ' + String(e && e.message).slice(0, 160) }; }
  console.log(JSON.stringify(res));
}
