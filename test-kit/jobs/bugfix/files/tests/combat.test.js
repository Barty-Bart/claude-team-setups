'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Combat = require('../js/combat.js');

test('player damage reduces hp, never below 0', () => {
  assert.deepEqual(Combat.playerDamage({ hp: 50, invuln: 0 }, 20), { hp: 30, took: 20, dead: false });
  assert.deepEqual(Combat.playerDamage({ hp: 10, invuln: 0 }, 25), { hp: 0, took: 10, dead: true });
});

test('god mode and invulnerability block damage', () => {
  assert.equal(Combat.playerDamage({ hp: 50 }, 20, { god: true }).hp, 50);
  assert.equal(Combat.playerDamage({ hp: 50, invuln: 0.2 }, 20).took, 0);
});

test('enemy damage', () => {
  assert.deepEqual(Combat.enemyDamage({ hp: 10 }, 4), { hp: 6, dead: false });
  assert.deepEqual(Combat.enemyDamage({ hp: 10 }, 10), { hp: 0, dead: true });
  assert.deepEqual(Combat.enemyDamage({ hp: 10 }, -5), { hp: 10, dead: false });
});

test('volley aims at the target and fans out symmetrically', () => {
  const one = Combat.volley(0, 0, 10, 0, 1, 0.2, 100);
  assert.equal(one.length, 1);
  assert.ok(Math.abs(one[0].vx - 100) < 1e-9 && Math.abs(one[0].vy) < 1e-9);
  const three = Combat.volley(0, 0, 0, 10, 3, 0.2, 100);
  assert.equal(three.length, 3);
  assert.ok(Math.abs(three[1].vy - 100) < 1e-9, 'middle bullet straight at target');
  assert.ok(Math.abs(three[0].vx + three[2].vx) < 1e-9, 'symmetric spread');
  for (const v of three) assert.ok(Math.abs(Math.hypot(v.vx, v.vy) - 100) < 1e-9);
});

test('knockback is weaker on heavy enemies', () => {
  const light = Combat.knockback(1, 0, 100, 1);
  const heavy = Combat.knockback(1, 0, 100, 5);
  assert.ok(light.vx > heavy.vx && heavy.vx > 0);
});

test('fireInterval', () => {
  assert.equal(Combat.fireInterval(4), 0.25);
  assert.equal(Combat.fireInterval(0), Infinity);
});
