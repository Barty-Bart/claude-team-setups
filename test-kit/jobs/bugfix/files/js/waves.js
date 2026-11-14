/*
 * waves.js — pure wave rules: composition, per-wave enemy stats, spawn
 * schedule, spawn positions and rewards.
 */
(function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const Config = isNode ? require('./config.js') : root.AS.Config;
  const Geometry = isNode ? require('./geometry.js') : root.AS.Geometry;

  const ENEMY_TYPES = Object.keys(Config.ENEMIES);

  function waveNumber(n) {
    n = Math.floor(Number(n));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }

  /** How many enemies of each type wave `n` contains. */
  function waveComposition(n) {
    n = waveNumber(n);
    return {
      chaser: 4 + 2 * n + Math.floor((n * n) / 25),
      tank: n >= 2 ? Math.floor(n / 2) : 0,
      shooter: n >= 3 ? Math.floor((n - 1) / 2) : 0,
      charger: n >= 4 ? Math.floor((n - 2) / 2) : 0,
    };
  }

  function waveEnemyCount(n) {
    const c = waveComposition(n);
    let total = 0;
    for (const k in c) total += c[k];
    return total;
  }

  /** Multipliers applied to base enemy stats on wave `n`. */
  function waveScaling(n) {
    const k = waveNumber(n) - 1;
    return {
      hp: 1 + 0.12 * k + 0.022 * k * k,
      speed: 1 + Math.min(0.35, 0.025 * k),
      damage: 1 + 0.06 * k,
      fireRate: 1 + Math.min(0.6, 0.03 * k),
    };
  }

  /** Concrete stats for an enemy of `type` spawned on wave `n`. */
  function enemyStats(type, n) {
    const base = Config.ENEMIES[type];
    if (!base) throw new Error('Unknown enemy type: ' + type);
    const s = waveScaling(n);
    const stats = Object.assign({}, base);
    stats.hp = Math.round(base.hp * s.hp * 10) / 10;
    stats.speed = base.speed * s.speed;
    stats.damage = Math.round(base.damage * s.damage);
    if (base.bulletDamage) stats.bulletDamage = Math.round(base.bulletDamage * s.damage);
    if (base.fireInterval) stats.fireInterval = base.fireInterval / s.fireRate;
    if (base.dashSpeed) stats.dashSpeed = base.dashSpeed * s.speed;
    return stats;
  }

  /**
   * Rough difficulty measure: sum over enemies of hp * damage * speed.
   * Used by tests to check each wave is harder than the last.
   */
  function waveThreat(n) {
    const c = waveComposition(n);
    let threat = 0;
    for (const type in c) {
      const s = enemyStats(type, n);
      threat += c[type] * s.hp * s.damage * s.speed;
    }
    return threat;
  }

  /**
   * Timed spawn list for wave `n`: [{ t, type }] sorted by t (seconds after
   * the wave starts). Enemies arrive in groups that get bigger and closer
   * together on later waves.
   */
  function buildSpawnSchedule(n, rng) {
    n = waveNumber(n);
    rng = rng || Math.random;
    const comp = waveComposition(n);
    const list = [];
    for (const type of ENEMY_TYPES) {
      for (let i = 0; i < (comp[type] || 0); i++) list.push(type);
    }
    // Fisher–Yates shuffle, but keep the very first group to chasers so a
    // wave never opens with a tank in the player's face.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    const groupSize = 3 + Math.floor(0.7 * n);
    const interval = Math.max(1.0, 2.8 - 0.09 * (n - 1));
    const firstGroup = list.filter((t) => t === 'chaser').slice(0, groupSize);
    const rest = list.slice();
    for (const t of firstGroup) rest.splice(rest.indexOf(t), 1);
    const ordered = firstGroup.concat(rest);

    const schedule = ordered.map((type, i) => {
      const group = Math.floor(i / groupSize);
      const t = Config.WAVE.firstGroupAt + group * interval + rng() * 0.45;
      return { t: Math.round(t * 1000) / 1000, type };
    });
    schedule.sort((a, b) => a.t - b.t);
    return schedule;
  }

  /**
   * Random spawn point inside the arena at least `minDist` from the player.
   * Falls back to the arena corner farthest from the player.
   */
  function pickSpawnPoint(rng, arena, player, minDist, margin) {
    rng = rng || Math.random;
    minDist = minDist == null ? Config.WAVE.minSpawnDistance : minDist;
    margin = margin == null ? Config.WAVE.spawnMargin : margin;
    const md2 = minDist * minDist;
    for (let i = 0; i < 30; i++) {
      const x = margin + rng() * (arena.width - 2 * margin);
      const y = margin + rng() * (arena.height - 2 * margin);
      if (Geometry.dist2(x, y, player.x, player.y) >= md2) return { x, y };
    }
    const x = player.x < arena.width / 2 ? arena.width - margin : margin;
    const y = player.y < arena.height / 2 ? arena.height - margin : margin;
    return { x, y };
  }

  /** Score and coins for killing an enemy of `type` on wave `n`. */
  function killReward(type, n) {
    const base = Config.ENEMIES[type];
    const k = waveNumber(n) - 1;
    return {
      score: Math.round(base.score * (1 + 0.1 * k)),
      coins: base.coins,
    };
  }

  /** Bonus for clearing wave `n`. */
  function waveClearBonus(n) {
    n = waveNumber(n);
    return { score: 50 * n, coins: 4 + 2 * n };
  }

  const Waves = {
    ENEMY_TYPES, waveComposition, waveEnemyCount, waveScaling, enemyStats,
    waveThreat, buildSpawnSchedule, pickSpawnPoint, killReward, waveClearBonus,
  };

  if (isNode) module.exports = Waves;
  else (root.AS = root.AS || {}).Waves = Waves;
})(typeof globalThis !== 'undefined' ? globalThis : this);
