'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Shop = require('../js/shop.js');
const Config = require('../js/config.js');

const run = (coins, extra) => Object.assign(
  { coins, upgrades: Shop.emptyUpgrades(), hp: 100, maxHp: 100 }, extra || {});

test('at least four upgrades, at most nine (hotkeys 1-9), unique ids', () => {
  const ids = Shop.UPGRADE_LIST.map((u) => u.id);
  assert.ok(ids.length >= 4 && ids.length <= 9);
  assert.equal(new Set(ids).size, ids.length);
  for (const u of Shop.UPGRADE_LIST) assert.ok(u.maxLevel >= 2, u.id + ' buyable several times');
});

test('prices rise with every level', () => {
  for (const u of Shop.UPGRADE_LIST) {
    for (let l = 0; l < Math.min(u.maxLevel, 15); l++) {
      assert.ok(Shop.upgradePrice(u.id, l + 1) > Shop.upgradePrice(u.id, l), u.id + ' level ' + l);
    }
  }
  assert.equal(Shop.upgradePrice('nope', 0), Infinity);
});

test('cannot buy what you cannot afford', () => {
  const price = Shop.upgradePrice('damage', 0);
  const poor = run(price - 1);
  assert.deepEqual(Shop.canBuy(poor, 'damage').ok, false);
  assert.equal(Shop.canBuy(poor, 'damage').reason, 'coins');
  const res = Shop.buyUpgrade(poor, 'damage');
  assert.equal(res.ok, false);
  assert.equal(res.run, poor);
  assert.equal(poor.upgrades.damage, 0);
});

test('buying deducts the price, raises the level and does not mutate input', () => {
  const r0 = run(1000);
  const p0 = Shop.upgradePrice('fireRate', 0);
  const a = Shop.buyUpgrade(r0, 'fireRate');
  assert.ok(a.ok);
  assert.equal(a.run.coins, 1000 - p0);
  assert.equal(a.run.upgrades.fireRate, 1);
  assert.equal(r0.coins, 1000);
  assert.equal(r0.upgrades.fireRate, 0);
  const b = Shop.buyUpgrade(a.run, 'fireRate');
  assert.equal(b.run.upgrades.fireRate, 2);
  assert.equal(b.run.coins, a.run.coins - Shop.upgradePrice('fireRate', 1));
});

test('max level stops purchases', () => {
  const u = Shop.getUpgrade('multishot');
  const r = run(1e9, { upgrades: Object.assign(Shop.emptyUpgrades(), { multishot: u.maxLevel }) });
  assert.equal(Shop.canBuy(r, 'multishot').reason, 'maxed');
});

test('max HP raises max and current HP; repair heals but not past max', () => {
  const r = Shop.buyUpgrade(run(1000, { hp: 50 }), 'maxHp').run;
  assert.equal(r.maxHp, 100 + Config.UPGRADE_EFFECTS.maxHpPerLevel);
  assert.equal(r.hp, 50 + Config.UPGRADE_EFFECTS.maxHpPerLevel);
  const healed = Shop.buyUpgrade(run(1000, { hp: 80 }), 'heal').run;
  assert.equal(healed.hp, 100);
  assert.equal(Shop.canBuy(run(1000), 'heal').reason, 'fullHp');
});

test('player stats improve with upgrades', () => {
  const base = Shop.computePlayerStats({});
  const up = Shop.computePlayerStats({ damage: 2, fireRate: 2, moveSpeed: 2, maxHp: 2, multishot: 1, pierce: 1 });
  assert.ok(up.damage > base.damage);
  assert.ok(up.fireRate > base.fireRate);
  assert.ok(up.speed > base.speed);
  assert.ok(up.maxHp > base.maxHp);
  assert.equal(up.multishot, base.multishot + 1);
  assert.equal(up.pierce, base.pierce + 1);
});

test('shopOffers lists every upgrade with hotkeys and affordability', () => {
  const offers = Shop.shopOffers(run(15));
  assert.equal(offers.length, Shop.UPGRADE_LIST.length);
  offers.forEach((o, i) => {
    assert.equal(o.key, i + 1);
    assert.equal(o.canBuy, Shop.canBuy(run(15), o.id).ok);
    assert.ok(typeof o.description === 'string' && o.description.length > 0);
  });
});
