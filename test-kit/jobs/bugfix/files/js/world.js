/*
 * world.js — the simulation: game flow (new game, waves, shop, game over)
 * and the per-frame update. DOM-free so it runs under `node --test`.
 *
 * Side effects for presentation (sounds, particles, shake) are emitted as
 * plain objects on game.events and consumed by fx.js / audio.js.
 */
(function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const req = (name, key) => (isNode ? require('./' + name) : root.AS[key]);
  const Config = req('config.js', 'Config');
  const Geometry = req('geometry.js', 'Geometry');
  const Waves = req('waves.js', 'Waves');
  const Shop = req('shop.js', 'Shop');
  const Combat = req('combat.js', 'Combat');
  const State = req('state.js', 'State');
  const Entities = req('entities.js', 'Entities');

  const MAX_EVENTS = 400;

  function emit(game, ev) {
    if (game.events.length < MAX_EVENTS) game.events.push(ev);
  }

  // ---------------------------------------------------------------- flow ---

  /** Reset the run and start at game.startWave. */
  function newGame(game) {
    game.score = 0;
    game.coins = 0;
    game.newHighScore = false;
    game.upgrades = Shop.emptyUpgrades();
    game.player = State.createPlayer(game.arena, game.upgrades);
    game.enemies = [];
    game.bullets = [];
    game.enemyBullets = [];
    game.pendingSpawns = [];
    startWave(game, game.startWave);
  }

  function startWave(game, n) {
    game.wave = n;
    game.screen = 'playing';
    game.spawnSchedule = Waves.buildSpawnSchedule(n, game.rng);
    game.pendingSpawns = [];
    game.waveTime = 0;
    game.waveKills = 0;
    game.waveTotal = game.spawnSchedule.length;
    game.player.fireCooldown = 0.3;
    game.player.invuln = 0;
    emit(game, { type: 'waveStart', wave: n });
  }

  /** Shop → next wave. */
  function continueToNextWave(game) {
    if (game.screen !== 'shop') return false;
    startWave(game, game.wave + 1);
    return true;
  }

  /** Buy one level of an upgrade while in the shop. */
  function buy(game, id) {
    const p = game.player;
    const res = Shop.buyUpgrade(
      { coins: game.coins, upgrades: game.upgrades, hp: p.hp, maxHp: p.maxHp }, id);
    if (res.ok) {
      game.coins = res.run.coins;
      game.upgrades = res.run.upgrades;
      p.hp = res.run.hp;
      p.maxHp = res.run.maxHp;
      game.stats = Shop.computePlayerStats(game.upgrades);
      emit(game, { type: 'buy', id });
    } else {
      emit(game, { type: 'buyFail', id, reason: res.reason });
    }
    return res;
  }

  function updateHighScore(game) {
    if (game.score > game.highScore) {
      game.highScore = game.score;
      game.newHighScore = true;
    }
  }

  function waveRemaining(game) {
    return game.spawnSchedule.length + game.pendingSpawns.length +
      game.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
  }

  // -------------------------------------------------------------- update ---

  /**
   * Advance the simulation. `move` is the desired movement vector
   * ({x, y}, length <= 1). Only the 'playing' screen simulates.
   */
  function step(game, dt, move) {
    if (game.screen !== 'playing') return;
    dt = Math.min(Math.max(dt, 0), Config.MAX_FRAME_DT);
    let remaining = dt;
    while (remaining > 1e-9 && game.screen === 'playing') {
      const h = Math.min(Config.SUBSTEP, remaining);
      tick(game, h, move || { x: 0, y: 0 });
      remaining -= h;
    }
  }

  function tick(game, dt, move) {
    game.time += dt;
    game.waveTime += dt;
    updatePlayer(game, dt, move);
    updateSpawns(game, dt);
    for (let i = 0; i < game.enemies.length; i++) Entities.updateEnemy(game.enemies[i], game, dt);
    separateEnemies(game);
    playerFire(game, dt);
    updateBullets(game, dt);
    updateEnemyBullets(game, dt);
    contactDamage(game);
    sweepDead(game);
    if (game.player.hp <= 0) {
      gameOver(game);
      return;
    }
    if (game.spawnSchedule.length === 0 && game.pendingSpawns.length === 0 &&
        game.enemies.length === 0) {
      waveCleared(game);
    }
  }

  function updatePlayer(game, dt, move) {
    const p = game.player;
    const speed = game.stats.speed;
    let mx = move.x || 0;
    let my = move.y || 0;
    const len = Math.sqrt(mx * mx + my * my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    // Quick acceleration for responsive but not robotic movement.
    const k = Math.min(1, dt * 18);
    p.vx += (mx * speed - p.vx) * k;
    p.vy += (my * speed - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const c = Geometry.clampToArena(p.x, p.y, p.radius, game.arena);
    if (c.x !== p.x) p.vx = 0;
    if (c.y !== p.y) p.vy = 0;
    p.x = c.x;
    p.y = c.y;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  }

  function updateSpawns(game, dt) {
    const sched = game.spawnSchedule;
    const telegraph = Config.WAVE.spawnTelegraph;
    // Show a warning marker `telegraph` seconds before the scheduled time.
    while (sched.length && sched[0].t - telegraph <= game.waveTime) {
      const s = sched.shift();
      const pos = Waves.pickSpawnPoint(game.rng, game.arena, game.player);
      game.pendingSpawns.push({ x: pos.x, y: pos.y, type: s.type, timer: telegraph, total: telegraph });
      emit(game, { type: 'spawnWarn', x: pos.x, y: pos.y, enemyType: s.type });
    }
    for (let i = game.pendingSpawns.length - 1; i >= 0; i--) {
      const ps = game.pendingSpawns[i];
      ps.timer -= dt;
      if (ps.timer <= 0) {
        game.pendingSpawns.splice(i, 1);
        const e = Entities.createEnemy(game.nextId++, ps.type, game.wave, ps.x, ps.y, game.rng);
        game.enemies.push(e);
        emit(game, { type: 'spawn', x: e.x, y: e.y, enemyType: e.type });
      }
    }
  }

  /** Push overlapping enemies apart (sort-and-sweep on x). */
  function separateEnemies(game) {
    const list = game.enemies;
    // Insertion sort: the list is nearly sorted from the previous frame.
    for (let i = 1; i < list.length; i++) {
      const e = list[i];
      let j = i - 1;
      while (j >= 0 && list[j].x > e.x) {
        list[j + 1] = list[j];
        j--;
      }
      list[j + 1] = e;
    }
    let maxR = 0;
    for (let i = 0; i < list.length; i++) if (list[i].radius > maxR) maxR = list[i].radius;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const reach = a.x + a.radius + maxR;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.x > reach) break;
        const sep = Geometry.separation(a, b, a.mass, b.mass);
        if (sep) {
          a.x += sep.ax * 0.5;
          a.y += sep.ay * 0.5;
          b.x += sep.bx * 0.5;
          b.y += sep.by * 0.5;
        }
      }
    }
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const c = Geometry.clampToArena(e.x, e.y, e.radius, game.arena);
      e.x = c.x;
      e.y = c.y;
    }
  }

  function playerFire(game, dt) {
    const p = game.player;
    p.fireCooldown -= dt;
    if (p.fireCooldown > 0) return;
    const target = Geometry.nearest(p.x, p.y, game.enemies, (e) => !e.dead);
    if (!target) {
      p.fireCooldown = 0;
      return;
    }
    const s = game.stats;
    const shots = Combat.volley(p.x, p.y, target.x, target.y, s.multishot, s.spread, s.bulletSpeed);
    for (const v of shots) {
      game.bullets.push(Entities.createBullet(
        p.x + Math.cos(v.angle) * p.radius, p.y + Math.sin(v.angle) * p.radius, v.vx, v.vy, s));
    }
    p.aim = Math.atan2(target.y - p.y, target.x - p.x);
    p.fireCooldown += Combat.fireInterval(s.fireRate);
    if (p.fireCooldown < 0) p.fireCooldown = 0;
    emit(game, { type: 'shoot', x: p.x, y: p.y, angle: p.aim });
  }

  function updateBullets(game, dt) {
    const enemies = game.enemies;
    const arena = game.arena;
    for (let i = 0; i < game.bullets.length; i++) {
      const b = game.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || !Geometry.isInsideArena(b.x, b.y, arena)) {
        b.dead = true;
        if (b.life > 0) emit(game, { type: 'wallHit', x: Geometry.clamp(b.x, 0, arena.width), y: Geometry.clamp(b.y, 0, arena.height) });
        continue;
      }
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e.dead) continue;
        if (b.hit.indexOf(e.id) !== -1) continue;
        if (!Geometry.circlesOverlap(b, e)) continue;
        hitEnemy(game, e, b);
        if (b.pierce > 0) {
          b.pierce--;
          b.hit.push(e.id);
        } else {
          b.dead = true;
          break;
        }
      }
    }
  }

  function hitEnemy(game, e, b) {
    const res = Combat.enemyDamage(e, b.damage);
    e.hp = res.hp;
    e.flash = 0.09;
    const kb = Combat.knockback(b.vx, b.vy, 220, e.mass);
    e.kx += kb.vx;
    e.ky += kb.vy;
    emit(game, { type: 'enemyHit', x: b.x, y: b.y, enemyType: e.type, angle: Math.atan2(b.vy, b.vx) });
    if (res.dead) killEnemy(game, e);
  }

  function killEnemy(game, e) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    const r = Waves.killReward(e.type, game.wave);
    game.score += r.score;
    game.coins += r.coins;
    game.waveKills++;
    updateHighScore(game);
    emit(game, {
      type: 'enemyDeath', x: e.x, y: e.y, enemyType: e.type, radius: e.radius,
      color: e.stats.color, score: r.score, coins: r.coins,
    });
  }

  function updateEnemyBullets(game, dt) {
    const p = game.player;
    for (let i = 0; i < game.enemyBullets.length; i++) {
      const b = game.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || !Geometry.isInsideArena(b.x, b.y, game.arena)) {
        b.dead = true;
        continue;
      }
      if (Geometry.circlesOverlap(b, p)) {
        if (damagePlayer(game, b.damage, b.x, b.y)) b.dead = true;
        else if (game.god || p.invuln > 0) b.dead = true;
      }
    }
  }

  /** Returns true when damage was applied. */
  function damagePlayer(game, amount, fromX, fromY) {
    const p = game.player;
    const res = Combat.playerDamage(p, amount, { god: game.god });
    if (res.took <= 0) return false;
    p.hp = res.hp;
    p.invuln = Config.PLAYER.invulnTime;
    emit(game, { type: 'playerHit', x: p.x, y: p.y, amount: res.took, fromX, fromY });
    return true;
  }

  function contactDamage(game) {
    const p = game.player;
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (e.dead || !Geometry.circlesOverlap(e, p)) continue;
      damagePlayer(game, e.damage, e.x, e.y);
      // Push the enemy back out so it does not sit inside the player.
      const sep = Geometry.separation(p, e, 1e6, 1);
      if (sep) {
        e.x += sep.bx;
        e.y += sep.by;
      }
      const kb = Combat.knockback(e.x - p.x, e.y - p.y, 260, e.mass);
      e.kx += kb.vx;
      e.ky += kb.vy;
      if (e.type === 'charger' && e.mode === 'dash') {
        e.mode = 'recover';
        e.timer = e.stats.recoverTime;
      }
    }
  }

  function sweepDead(game) {
    if (game.enemies.some((e) => e.dead)) game.enemies = game.enemies.filter((e) => !e.dead);
    if (game.bullets.some((b) => b.dead)) game.bullets = game.bullets.filter((b) => !b.dead);
    if (game.enemyBullets.some((b) => b.dead)) game.enemyBullets = game.enemyBullets.filter((b) => !b.dead);
  }

  function waveCleared(game) {
    const bonus = Waves.waveClearBonus(game.wave);
    game.score += bonus.score;
    game.coins += bonus.coins;
    updateHighScore(game);
    game.bullets = [];
    game.enemyBullets = [];
    game.screen = 'shop';
    emit(game, { type: 'waveClear', wave: game.wave, score: bonus.score, coins: bonus.coins });
  }

  function gameOver(game) {
    const p = game.player;
    p.hp = 0;
    p.alive = false;
    updateHighScore(game);
    game.screen = 'gameover';
    emit(game, { type: 'gameOver', x: p.x, y: p.y, score: game.score });
  }

  const World = {
    newGame, startWave, continueToNextWave, buy, step, waveRemaining,
    killEnemy, damagePlayer,
  };

  if (isNode) module.exports = World;
  else (root.AS = root.AS || {}).World = World;
})(typeof globalThis !== 'undefined' ? globalThis : this);
