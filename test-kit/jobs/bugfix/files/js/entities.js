/*
 * entities.js — entity factories and per-type enemy behaviour.
 *
 * No DOM access: these functions only read and write plain game objects.
 */
(function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const Geometry = isNode ? require('./geometry.js') : root.AS.Geometry;
  const Waves = isNode ? require('./waves.js') : root.AS.Waves;

  function createEnemy(id, type, wave, x, y, rng) {
    rng = rng || Math.random;
    const s = Waves.enemyStats(type, wave);
    return {
      id,
      type,
      x,
      y,
      kx: 0, // knockback velocity
      ky: 0,
      radius: s.radius,
      hp: s.hp,
      maxHp: s.hp,
      speed: s.speed,
      damage: s.damage,
      mass: s.mass,
      stats: s,
      angle: 0,
      flash: 0, // hit-flash timer
      age: 0,
      wobble: rng() * Math.PI * 2,
      // behaviour state (shooter / charger)
      mode: 'move',
      timer: 0,
      cooldown: type === 'shooter' ? s.fireInterval * (0.5 + rng() * 0.5) : s.dashCooldown || 0,
      dashX: 0,
      dashY: 0,
      dead: false,
    };
  }

  // Shared empty list so bullets that never pierce allocate nothing.
  const NO_HITS = [];

  function createBullet(x, y, vx, vy, stats) {
    return {
      x, y, vx, vy,
      radius: stats.bulletRadius,
      damage: stats.damage,
      pierce: stats.pierce,
      life: stats.bulletLife,
      hit: NO_HITS, // ids already hit by this bullet
      dead: false,
    };
  }

  function createEnemyBullet(x, y, vx, vy, s) {
    return {
      x, y, vx, vy,
      radius: s.bulletRadius,
      damage: s.bulletDamage,
      life: s.bulletLife,
      dead: false,
    };
  }

  function moveToward(e, tx, ty, speed, dt) {
    const d = Geometry.normalize(tx - e.x, ty - e.y);
    e.x += d.x * speed * dt;
    e.y += d.y * speed * dt;
    if (d.len > 0) e.angle = Math.atan2(d.y, d.x);
    return d;
  }

  const behaviours = {
    chaser(e, game, dt) {
      const p = game.player;
      // Slight sideways weave so a pack of runners does not form a single line.
      const d = Geometry.normalize(p.x - e.x, p.y - e.y);
      const weave = Math.sin(e.age * 4 + e.wobble) * 0.35;
      const vx = d.x - d.y * weave;
      const vy = d.y + d.x * weave;
      const n = Geometry.normalize(vx, vy);
      e.x += n.x * e.speed * dt;
      e.y += n.y * e.speed * dt;
      if (d.len > 0) e.angle = Math.atan2(n.y, n.x);
    },

    tank(e, game, dt) {
      moveToward(e, game.player.x, game.player.y, e.speed, dt);
    },

    shooter(e, game, dt) {
      const p = game.player;
      const s = e.stats;
      const d = Geometry.normalize(p.x - e.x, p.y - e.y);
      if (d.len > 0) e.angle = Math.atan2(d.y, d.x);
      e.cooldown -= dt;
      if (e.mode === 'aim') {
        e.timer -= dt;
        if (e.timer <= 0) {
          const vx = d.x * s.bulletSpeed;
          const vy = d.y * s.bulletSpeed;
          game.enemyBullets.push(createEnemyBullet(
            e.x + d.x * e.radius, e.y + d.y * e.radius, vx, vy, s));
          game.events.push({ type: 'enemyShoot', x: e.x, y: e.y });
          e.mode = 'move';
          e.cooldown = s.fireInterval * (0.85 + game.rng() * 0.3);
        }
        return;
      }
      if (e.cooldown <= 0 && d.len <= s.fireRange) {
        e.mode = 'aim';
        e.timer = s.aimTime;
        return;
      }
      // Keep at preferred range, strafing around the player.
      let mx = 0;
      let my = 0;
      if (d.len > s.preferredRange + 40) {
        mx = d.x;
        my = d.y;
      } else if (d.len < s.preferredRange - 60) {
        mx = -d.x;
        my = -d.y;
      }
      const side = Math.sin(e.wobble) > 0 ? 1 : -1;
      mx += -d.y * 0.6 * side;
      my += d.x * 0.6 * side;
      const n = Geometry.normalize(mx, my);
      e.x += n.x * e.speed * dt;
      e.y += n.y * e.speed * dt;
    },

    charger(e, game, dt) {
      const p = game.player;
      const s = e.stats;
      switch (e.mode) {
        case 'windup': {
          e.timer -= dt;
          const d = Geometry.normalize(p.x - e.x, p.y - e.y);
          if (d.len > 0) e.angle = Math.atan2(d.y, d.x);
          if (e.timer <= 0) {
            e.mode = 'dash';
            e.timer = s.dashTime;
            e.dashX = Math.cos(e.angle);
            e.dashY = Math.sin(e.angle);
            game.events.push({ type: 'dash', x: e.x, y: e.y });
          }
          break;
        }
        case 'dash':
          e.timer -= dt;
          e.x += e.dashX * s.dashSpeed * dt;
          e.y += e.dashY * s.dashSpeed * dt;
          if (e.timer <= 0) {
            e.mode = 'recover';
            e.timer = s.recoverTime;
          }
          break;
        case 'recover':
          e.timer -= dt;
          if (e.timer <= 0) {
            e.mode = 'move';
            e.cooldown = s.dashCooldown * (0.8 + game.rng() * 0.4);
          }
          break;
        default: {
          e.cooldown -= dt;
          const d = moveToward(e, p.x, p.y, e.speed, dt);
          if (e.cooldown <= 0 && d.len <= s.dashRange) {
            e.mode = 'windup';
            e.timer = s.windupTime;
          }
        }
      }
    },
  };

  /** Advance one enemy's behaviour, knockback and timers by dt seconds. */
  function updateEnemy(e, game, dt) {
    e.age += dt;
    if (e.flash > 0) e.flash -= dt;
    const b = behaviours[e.type];
    if (b) b(e, game, dt);
    if (e.kx !== 0 || e.ky !== 0) {
      e.x += e.kx * dt;
      e.y += e.ky * dt;
      const decay = Math.exp(-10 * dt);
      e.kx *= decay;
      e.ky *= decay;
      if (Math.abs(e.kx) + Math.abs(e.ky) < 1) {
        e.kx = 0;
        e.ky = 0;
      }
    }
    const c = Geometry.clampToArena(e.x, e.y, e.radius, game.arena);
    e.x = c.x;
    e.y = c.y;
  }

  const Entities = { createEnemy, createBullet, createEnemyBullet, updateEnemy, behaviours };

  if (isNode) module.exports = Entities;
  else (root.AS = root.AS || {}).Entities = Entities;
})(typeof globalThis !== 'undefined' ? globalThis : this);
