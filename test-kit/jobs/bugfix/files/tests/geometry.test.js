'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/geometry.js');

test('clamp', () => {
  assert.equal(G.clamp(5, 0, 10), 5);
  assert.equal(G.clamp(-1, 0, 10), 0);
  assert.equal(G.clamp(11, 0, 10), 10);
});

test('normalize returns unit vectors and handles zero', () => {
  const n = G.normalize(3, 4);
  assert.ok(Math.abs(n.x - 0.6) < 1e-9 && Math.abs(n.y - 0.8) < 1e-9);
  assert.equal(n.len, 5);
  assert.deepEqual(G.normalize(0, 0), { x: 0, y: 0, len: 0 });
});

test('circlesOverlap', () => {
  assert.ok(G.circlesOverlap({ x: 0, y: 0, radius: 5 }, { x: 9, y: 0, radius: 5 }));
  assert.ok(G.circlesOverlap({ x: 0, y: 0, radius: 5 }, { x: 10, y: 0, radius: 5 }), 'touching counts');
  assert.ok(!G.circlesOverlap({ x: 0, y: 0, radius: 5 }, { x: 10.1, y: 0, radius: 5 }));
});

test('clampToArena keeps the whole circle inside', () => {
  const arena = { width: 100, height: 50 };
  assert.deepEqual(G.clampToArena(-20, 80, 10, arena), { x: 10, y: 40 });
  assert.deepEqual(G.clampToArena(50, 25, 10, arena), { x: 50, y: 25 });
  assert.deepEqual(G.clampToArena(500, -5, 10, arena), { x: 90, y: 10 });
});

test('nearest picks the closest item, honours the filter, null when empty', () => {
  const list = [{ x: 10, y: 0, id: 1 }, { x: 3, y: 4, id: 2 }, { x: 1, y: 1, id: 3, dead: true }];
  assert.equal(G.nearest(0, 0, list).id, 3);
  assert.equal(G.nearest(0, 0, list, (e) => !e.dead).id, 2);
  assert.equal(G.nearest(0, 0, []), null);
});

test('separation pushes overlapping circles apart by mass', () => {
  const a = { x: 0, y: 0, radius: 10 };
  const b = { x: 10, y: 0, radius: 10 };
  const s = G.separation(a, b, 1, 1);
  assert.equal(s.ax, -5);
  assert.equal(s.bx, 5);
  const heavy = G.separation(a, b, 9, 1);
  assert.ok(Math.abs(heavy.ax) < Math.abs(heavy.bx), 'heavier body moves less');
  assert.equal(G.separation(a, { x: 30, y: 0, radius: 10 }, 1, 1), null);
  const same = G.separation(a, { x: 0, y: 0, radius: 10 }, 1, 1);
  assert.ok(same && (same.ax !== 0 || same.bx !== 0), 'coincident circles still separate');
});

test('createRng is deterministic and in [0, 1)', () => {
  const a = G.createRng(42);
  const b = G.createRng(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});
