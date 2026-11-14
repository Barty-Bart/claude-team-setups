'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Waves = require('../js/waves.js');
const Config = require('../js/config.js');
const { createRng } = require('../js/geometry.js');

test('at least three enemy types are defined', () => {
  assert.ok(Waves.ENEMY_TYPES.length >= 3);
});

test('wave 1 is chasers only and small', () => {
  const c = Waves.waveComposition(1);
  assert.ok(c.chaser > 0);
  assert.equal(Waves.waveEnemyCount(1), c.chaser);
  assert.ok(Waves.waveEnemyCount(1) <= 8);
});

test('chaser, tank and shooter have all appeared by wave 3', () => {
  const seen = new Set();
  for (let n = 1; n <= 3; n++) {
    const c = Waves.waveComposition(n);
    for (const t in c) if (c[t] > 0) seen.add(t);
  }
  for (const t of ['chaser', 'tank', 'shooter']) assert.ok(seen.has(t), t);
  const c3 = Waves.waveComposition(3);
  assert.ok(c3.chaser > 0 && c3.tank > 0 && c3.shooter > 0, 'wave 3 itself has all three');
});

test('every wave is harder than the previous one', () => {
  for (let n = 1; n < 60; n++) {
    assert.ok(Waves.waveEnemyCount(n + 1) > Waves.waveEnemyCount(n), 'count ' + n);
    assert.ok(Waves.waveThreat(n + 1) > Waves.waveThreat(n), 'threat ' + n);
    const a = Waves.enemyStats('chaser', n);
    const b = Waves.enemyStats('chaser', n + 1);
    assert.ok(b.hp >= a.hp && b.speed >= a.speed && b.damage >= a.damage);
  }
});

test('bad wave numbers are treated as wave 1', () => {
  assert.deepEqual(Waves.waveComposition(0), Waves.waveComposition(1));
  assert.deepEqual(Waves.waveComposition('x'), Waves.waveComposition(1));
});

test('enemyStats scales hp and rejects unknown types', () => {
  assert.equal(Waves.enemyStats('tank', 1).hp, Config.ENEMIES.tank.hp);
  assert.ok(Waves.enemyStats('tank', 10).hp > Config.ENEMIES.tank.hp);
  assert.throws(() => Waves.enemyStats('dragon', 1));
});

test('spawn schedule matches composition, is sorted and opens with chasers', () => {
  for (const n of [1, 2, 3, 7, 20]) {
    const sched = Waves.buildSpawnSchedule(n, createRng(n));
    assert.equal(sched.length, Waves.waveEnemyCount(n));
    const counts = {};
    sched.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });
    const comp = Waves.waveComposition(n);
    for (const t in comp) assert.equal(counts[t] || 0, comp[t], `wave ${n} ${t}`);
    for (let i = 1; i < sched.length; i++) assert.ok(sched[i].t >= sched[i - 1].t);
    assert.equal(sched[0].type, 'chaser');
    assert.ok(sched[0].t >= 0);
  }
});

test('spawn points are inside the arena and away from the player', () => {
  const rng = createRng(7);
  const arena = { width: 1500, height: 1500 };
  for (let i = 0; i < 200; i++) {
    const player = { x: rng() * arena.width, y: rng() * arena.height };
    const p = Waves.pickSpawnPoint(rng, arena, player, 360, 40);
    assert.ok(p.x >= 0 && p.y >= 0 && p.x <= arena.width && p.y <= arena.height);
    assert.ok(Math.hypot(p.x - player.x, p.y - player.y) >= 360);
  }
});

test('rewards give score and coins; clear bonus grows', () => {
  for (const t of Waves.ENEMY_TYPES) {
    const r = Waves.killReward(t, 1);
    assert.ok(r.score > 0 && r.coins > 0, t);
    assert.ok(Waves.killReward(t, 5).score >= r.score);
  }
  assert.ok(Waves.waveClearBonus(2).coins > Waves.waveClearBonus(1).coins);
});
