'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const State = require('../js/state.js');
const Config = require('../js/config.js');

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

test('parseParams reads wave and god', () => {
  assert.deepEqual(State.parseParams(''), { startWave: 1, god: false });
  assert.deepEqual(State.parseParams('?wave=5&god=1'), { startWave: 5, god: true });
  assert.deepEqual(State.parseParams('?wave=abc&god=0'), { startWave: 1, god: false });
  assert.deepEqual(State.parseParams('?wave=-3'), { startWave: 1, god: false });
});

test('high score round-trips through storage and tolerates failures', () => {
  const s = memoryStorage();
  assert.equal(State.loadHighScore(s), 0);
  assert.ok(State.saveHighScore(s, 1234));
  assert.equal(s.data[Config.STORAGE_KEYS.highScore], '1234');
  assert.equal(State.loadHighScore(s), 1234);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(State.loadHighScore(broken), 0);
  assert.equal(State.saveHighScore(broken, 5), false);
  assert.equal(State.loadHighScore(null), 0);
});

test('new game sits on the title screen', () => {
  const g = State.createGame({ highScore: 99 });
  const s = State.snapshot(g);
  assert.equal(s.screen, 'title');
  assert.equal(s.wave, 0);
  assert.equal(s.highScore, 99);
  assert.equal(s.player.hp, s.player.maxHp);
  assert.deepEqual(s.enemies, []);
});

test('snapshot is a plain, detached object with the documented shape', () => {
  const g = State.createGame({});
  g.enemies.push({ id: 1, type: 'chaser', x: 5, y: 6, hp: 3, extra: 'x' });
  g.enemies.push({ id: 2, type: 'tank', x: 5, y: 6, hp: 0 });
  const s = State.snapshot(g);
  assert.deepEqual(Object.keys(s).sort(),
    ['arena', 'coins', 'enemies', 'highScore', 'player', 'score', 'screen', 'upgrades', 'wave']);
  assert.deepEqual(s.enemies, [{ id: 1, type: 'chaser', x: 5, y: 6, hp: 3 }], 'living enemies only');
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  s.upgrades.damage = 99;
  assert.equal(g.upgrades.damage, 0);
});
