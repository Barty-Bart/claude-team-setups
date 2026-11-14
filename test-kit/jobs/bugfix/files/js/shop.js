/*
 * shop.js — pure upgrade rules: prices, derived player stats, purchases.
 *
 * A "run" here is the plain object { coins, upgrades, hp, maxHp }; functions
 * never mutate their input and never touch the DOM.
 */
(function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const Config = isNode ? require('./config.js') : root.AS.Config;

  const UPGRADE_LIST = Config.UPGRADES;
  const BY_ID = {};
  for (const u of UPGRADE_LIST) BY_ID[u.id] = u;
  const FX = Config.UPGRADE_EFFECTS;

  function getUpgrade(id) {
    return BY_ID[id] || null;
  }

  /** All upgrade ids at level 0. */
  function emptyUpgrades() {
    const out = {};
    for (const u of UPGRADE_LIST) out[u.id] = 0;
    return out;
  }

  /** Price of buying the next level when `level` levels are already owned. */
  function upgradePrice(id, level) {
    const u = BY_ID[id];
    if (!u) return Infinity;
    return Math.round(u.basePrice * Math.pow(u.growth, level || 0));
  }

  /** Player stats derived from upgrade levels. */
  function computePlayerStats(upgrades) {
    upgrades = upgrades || {};
    const lv = (id) => upgrades[id] || 0;
    const P = Config.PLAYER;
    return {
      maxHp: P.maxHp + FX.maxHpPerLevel * lv('maxHp'),
      speed: P.speed * (1 + FX.moveSpeedPerLevel * lv('moveSpeed')),
      damage: P.damage + FX.damagePerLevel * lv('damage'),
      fireRate: P.fireRate * (1 + FX.fireRatePerLevel * lv('fireRate')),
      multishot: P.multishot + lv('multishot'),
      pierce: P.pierce + lv('pierce'),
      bulletSpeed: P.bulletSpeed,
      bulletRadius: P.bulletRadius,
      bulletLife: P.bulletLife,
      spread: P.spread,
      radius: P.radius,
    };
  }

  /**
   * Whether the next level of `id` can be bought.
   * Returns { ok, reason, price } — reason is one of
   * 'unknown' | 'maxed' | 'coins' | 'fullHp' | null.
   */
  function canBuy(run, id) {
    const u = BY_ID[id];
    if (!u) return { ok: false, reason: 'unknown', price: Infinity };
    const level = (run.upgrades && run.upgrades[id]) || 0;
    if (level >= u.maxLevel) return { ok: false, reason: 'maxed', price: Infinity };
    const price = upgradePrice(id, level);
    if (run.coins < price) return { ok: false, reason: 'coins', price };
    if (id === 'heal' && run.hp >= run.maxHp) return { ok: false, reason: 'fullHp', price };
    return { ok: true, reason: null, price };
  }

  /**
   * Buy one level of `id`. Returns { ok, reason, price, run } where `run` is a
   * new object (the input is untouched; on failure the same object is returned).
   */
  function buyUpgrade(run, id) {
    const check = canBuy(run, id);
    if (!check.ok) return { ok: false, reason: check.reason, price: check.price, run };
    const level = (run.upgrades && run.upgrades[id]) || 0;
    const upgrades = Object.assign({}, run.upgrades, { [id]: level + 1 });
    let hp = run.hp;
    let maxHp = run.maxHp;
    if (id === 'maxHp') {
      const newMax = computePlayerStats(upgrades).maxHp;
      hp += newMax - maxHp;
      maxHp = newMax;
    } else if (id === 'heal') {
      hp = Math.min(maxHp, hp + Math.ceil(maxHp * FX.healFraction));
    }
    return {
      ok: true,
      reason: null,
      price: check.price,
      run: { coins: run.coins - check.price, upgrades, hp, maxHp },
    };
  }

  function fmt(n) {
    return Math.round(n * 10) / 10;
  }

  /** Short human description of what the next level does. */
  function describeUpgrade(id, level) {
    const now = computePlayerStats({ [id]: level });
    const next = computePlayerStats({ [id]: level + 1 });
    switch (id) {
      case 'damage': return `+${FX.damagePerLevel} bullet damage (${fmt(now.damage)} → ${fmt(next.damage)})`;
      case 'fireRate': return `Shoot faster (${fmt(now.fireRate)} → ${fmt(next.fireRate)}/s)`;
      case 'moveSpeed': return `Move faster (${Math.round(now.speed)} → ${Math.round(next.speed)})`;
      case 'maxHp': return `+${FX.maxHpPerLevel} max HP and heal ${FX.maxHpPerLevel}`;
      case 'heal': return `Restore ${Math.round(FX.healFraction * 100)}% of max HP`;
      case 'multishot': return `Fire ${next.multishot} bullets per shot`;
      case 'pierce': return `Bullets pass through ${next.pierce} enem${next.pierce === 1 ? 'y' : 'ies'}`;
      default: return '';
    }
  }

  /** Everything the shop screen needs for one row. */
  function shopOffers(run) {
    return UPGRADE_LIST.map((u, i) => {
      const level = (run.upgrades && run.upgrades[u.id]) || 0;
      const check = canBuy(run, u.id);
      return {
        id: u.id,
        key: i + 1,
        name: u.name,
        level,
        maxLevel: u.maxLevel,
        maxed: level >= u.maxLevel,
        price: level >= u.maxLevel ? null : upgradePrice(u.id, level),
        canBuy: check.ok,
        reason: check.reason,
        description: describeUpgrade(u.id, level),
      };
    });
  }

  const Shop = {
    UPGRADE_LIST, getUpgrade, emptyUpgrades, upgradePrice, computePlayerStats,
    canBuy, buyUpgrade, describeUpgrade, shopOffers,
  };

  if (isNode) module.exports = Shop;
  else (root.AS = root.AS || {}).Shop = Shop;
})(typeof globalThis !== 'undefined' ? globalThis : this);
