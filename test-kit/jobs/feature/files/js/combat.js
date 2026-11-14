/*
 * combat.js — pure damage and shooting rules.
 */
(function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const Geometry = isNode ? require('./geometry.js') : root.AS.Geometry;

  /**
   * Result of the player being hit for `amount`.
   * No damage while invulnerable or in god mode. HP never drops below 0.
   */
  function playerDamage(player, amount, opts) {
    opts = opts || {};
    if (opts.god || (player.invuln || 0) > 0 || amount <= 0 || player.hp <= 0) {
      return { hp: player.hp, took: 0, dead: player.hp <= 0 };
    }
    const hp = Math.max(0, player.hp - amount);
    return { hp, took: player.hp - hp, dead: hp <= 0 };
  }

  /** Result of an enemy being hit for `amount`. */
  function enemyDamage(enemy, amount) {
    const hp = Math.max(0, enemy.hp - Math.max(0, amount));
    return { hp, dead: hp <= 0 };
  }

  /**
   * Velocities for a volley of `count` bullets from (x, y) aimed at (tx, ty),
   * fanned out symmetrically by `spread` radians.
   */
  function volley(x, y, tx, ty, count, spread, speed) {
    const dir = Geometry.normalize(tx - x, ty - y);
    const base = dir.len === 0 ? 0 : Math.atan2(dir.y, dir.x);
    const out = [];
    count = Math.max(1, Math.floor(count));
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * spread;
      out.push({ vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, angle: a });
    }
    return out;
  }

  /** Knockback velocity for an enemy hit from direction (dx, dy). */
  function knockback(dx, dy, strength, mass) {
    const n = Geometry.normalize(dx, dy);
    const k = strength / Math.max(1, mass);
    return { vx: n.x * k, vy: n.y * k };
  }

  /** Seconds between shots for a fire rate in shots per second. */
  function fireInterval(fireRate) {
    return fireRate > 0 ? 1 / fireRate : Infinity;
  }

  const Combat = { playerDamage, enemyDamage, volley, knockback, fireInterval };

  if (isNode) module.exports = Combat;
  else (root.AS = root.AS || {}).Combat = Combat;
})(typeof globalThis !== 'undefined' ? globalThis : this);
