'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Input = require('../js/input.js');

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('WASD and arrows map to directions', () => {
  assert.deepEqual(Input.keyVector(['KeyD']), { x: 1, y: 0 });
  assert.deepEqual(Input.keyVector(['ArrowUp']), { x: 0, y: -1 });
  assert.deepEqual(Input.keyVector(['KeyA']), { x: -1, y: 0 });
  assert.deepEqual(Input.keyVector(['ArrowDown']), { x: 0, y: 1 });
  assert.deepEqual(Input.keyVector([]), { x: 0, y: 0 });
});

test('diagonals are normalised, opposites cancel, duplicates do not stack', () => {
  const d = Input.keyVector(['KeyW', 'KeyD']);
  assert.ok(close(Math.hypot(d.x, d.y), 1));
  assert.deepEqual(Input.keyVector(['KeyA', 'KeyD']), { x: 0, y: 0 });
  assert.deepEqual(Input.keyVector(['KeyW', 'ArrowUp']), { x: 0, y: -1 });
});

test('drag vector follows drag direction with a deadzone and max length 1', () => {
  assert.deepEqual(Input.dragVector(3, 0, 60, 6), { x: 0, y: 0 });
  const v = Input.dragVector(200, 0, 60, 6);
  assert.ok(close(v.x, 1) && close(v.y, 0));
  const half = Input.dragVector(0, -33, 60, 6);
  assert.ok(close(half.x, 0) && half.y < 0 && half.y > -1);
  const diag = Input.dragVector(-100, 100, 60, 6);
  assert.ok(diag.x < 0 && diag.y > 0 && close(Math.hypot(diag.x, diag.y), 1));
});
