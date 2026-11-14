'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const State = require('../js/state.js');
const World = require('../js/world.js');
const Entities = require('../js/entities.js');
const { createRng } = require('../js/geometry.js');

function newGame(opts) {
  const g = State.createGame(Object.assign({ rng: createRng(1) }, opts));
  World.newGame(g);
  return g;
}

function run(g, seconds, move) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds && g.screen === 'playing'; t += dt) {
    World.step(g, dt, move || { x: 0, y: 0 });
    g.events.length = 0;
  }
}

function insideArena(g) {
  const p = g.player;
  const ok = (o) => o.x >= 0 && o.y >= 0 && o.x <= g.arena.width && o.y <= g.arena.height;
  return ok(p) && g.enemies.every(ok);
}

test('wave 1 can be cleared by a player who never moves', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const g = newGame({ rng: createRng(seed) });
    run(g, 120);
    assert.equal(g.screen, 'shop', 'seed ' + seed);
    assert.ok(g.player.hp >= g.player.maxHp * 0.7, 'barely hurt, seed ' + seed);
    assert.ok(g.score > 0 && g.coins > 0);
  }
});

test('the player cannot leave the arena', () => {
  const g = newGame({ god: true });
  g.spawnSchedule = [{ t: 1e9, type: 'chaser' }]; // keep the wave open, no enemies
  for (const move of [{ x: -1, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 1 }]) {
    run(g, 12, move);
    assert.ok(insideArena(g));
  }
  assert.ok(g.player.x <= g.player.radius + 1e-9 && g.player.y >= g.arena.height - g.player.radius - 1e-9);
});

test('start wave option and god mode', () => {
  const g = newGame({ startWave: 6, god: true });
  assert.equal(g.wave, 6);
  run(g, 200);
  assert.equal(g.screen, 'shop');
  assert.equal(g.player.hp, g.player.maxHp);
});

test('enemies hurt the player and 0 HP is game over', () => {
  const g = newGame({ startWave: 12 });
  run(g, 300);
  assert.equal(g.screen, 'gameover');
  assert.equal(g.player.hp, 0);
  assert.ok(g.highScore >= g.score);
});

test('enemy projectiles damage the player', () => {
  const g = newGame({});
  g.spawnSchedule = [];
  const shooter = Entities.createEnemy(g.nextId++, 'shooter', 3, g.player.x + 300, g.player.y, g.rng);
  shooter.cooldown = 0;
  shooter.hp = 1e9; // keep it alive
  shooter.maxHp = 1e9;
  g.enemies.push(shooter);
  const hp0 = g.player.hp;
  let sawBullet = false;
  for (let t = 0; t < 3; t += 1 / 60) {
    World.step(g, 1 / 60, { x: 0, y: 0 });
    if (g.enemyBullets.length) sawBullet = true;
    g.events.length = 0;
  }
  assert.ok(sawBullet, 'shooter fired');
  assert.ok(g.player.hp < hp0, 'projectile hit');
});

test('kills give score and coins; clearing a wave opens the shop; continue starts the next', () => {
  const g = newGame({});
  run(g, 120);
  assert.equal(g.screen, 'shop');
  const coins = g.coins;
  const res = World.buy(g, 'damage');
  assert.ok(res.ok);
  assert.equal(g.upgrades.damage, 1);
  assert.ok(g.coins < coins);
  assert.ok(g.stats.damage > 10);
  assert.ok(World.continueToNextWave(g));
  assert.equal(g.wave, 2);
  assert.equal(g.screen, 'playing');
});

test('continuing outside the shop does nothing', () => {
  const g = newGame({});
  assert.equal(World.continueToNextWave(g), false);
});

test('enemy ids are unique and a wave spawns exactly its schedule', () => {
  const g = newGame({ startWave: 4, god: true });
  const total = g.waveTotal;
  const seen = new Set();
  const dt = 1 / 60;
  for (let t = 0; t < 200 && g.screen === 'playing'; t += dt) {
    World.step(g, dt, { x: 0, y: 0 });
    for (const ev of g.events) if (ev.type === 'spawn') seen.add(ev);
    g.events.length = 0;
  }
  assert.equal(g.screen, 'shop');
  assert.equal(seen.size, total);
  assert.equal(g.waveKills, total);
});

test('a big crowd stays inside the arena and steps quickly', () => {
  const g = newGame({ startWave: 1, god: true });
  g.spawnSchedule = [];
  for (let i = 0; i < 300; i++) {
    const type = ['chaser', 'tank', 'shooter', 'charger'][i % 4];
    g.enemies.push(Entities.createEnemy(g.nextId++, type, 10, g.rng() * 1500, g.rng() * 1500, g.rng));
  }
  const t0 = Date.now();
  run(g, 2);
  const ms = Date.now() - t0;
  assert.ok(insideArena(g));
  assert.ok(ms < 2000, '120 frames with 300 enemies took ' + ms + 'ms');
});
