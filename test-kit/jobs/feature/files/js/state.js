/*
 * state.js — game state creation, URL options, high-score storage and the
 * plain-object snapshot exposed to QA via window.game.getState().
 */
(function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const Config = isNode ? require('./config.js') : root.AS.Config;
  const Shop = isNode ? require('./shop.js') : root.AS.Shop;

  /** Parse "?wave=N&god=1" style query strings. */
  function parseParams(search) {
    const params = new URLSearchParams(search || '');
    let startWave = parseInt(params.get('wave'), 10);
    if (!Number.isFinite(startWave) || startWave < 1) startWave = 1;
    startWave = Math.min(startWave, 999);
    const godRaw = (params.get('god') || '').toLowerCase();
    const god = godRaw === '1' || godRaw === 'true' || godRaw === 'yes';
    return { startWave, god };
  }

  function loadHighScore(storage) {
    try {
      const v = parseInt(storage && storage.getItem(Config.STORAGE_KEYS.highScore), 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveHighScore(storage, value) {
    try {
      if (storage) storage.setItem(Config.STORAGE_KEYS.highScore, String(Math.floor(value)));
      return true;
    } catch (e) {
      return false;
    }
  }

  function createPlayer(arena, upgrades) {
    const stats = Shop.computePlayerStats(upgrades);
    return {
      x: arena.width / 2,
      y: arena.height / 2,
      vx: 0,
      vy: 0,
      radius: stats.radius,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      invuln: 0,
      fireCooldown: 0.3,
      aim: -Math.PI / 2,
      alive: true,
    };
  }

  /** A fresh game sitting on the title screen. */
  function createGame(opts) {
    opts = opts || {};
    const arena = { width: Config.ARENA.width, height: Config.ARENA.height };
    const upgrades = Shop.emptyUpgrades();
    return {
      screen: 'title',
      wave: 0,
      score: 0,
      highScore: opts.highScore || 0,
      coins: 0,
      startWave: opts.startWave || 1,
      god: !!opts.god,
      rng: opts.rng || Math.random,
      arena,
      upgrades,
      stats: Shop.computePlayerStats(upgrades),
      player: createPlayer(arena, upgrades),
      enemies: [],
      bullets: [],
      enemyBullets: [],
      pendingSpawns: [], // telegraphed spawns: { x, y, type, timer }
      spawnSchedule: [], // remaining { t, type } for the current wave
      waveTime: 0,
      waveKills: 0,
      waveTotal: 0,
      nextId: 1,
      time: 0,
      events: [], // drained each frame by fx/audio
      newHighScore: false,
    };
  }

  /** Plain-object snapshot for QA tooling. */
  function snapshot(game) {
    const p = game.player;
    return {
      screen: game.screen,
      wave: game.wave,
      score: game.score,
      highScore: Math.max(game.highScore, game.score),
      coins: game.coins,
      player: { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp },
      enemies: game.enemies
        .filter((e) => e.hp > 0)
        .map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp })),
      upgrades: Object.assign({}, game.upgrades),
      arena: { width: game.arena.width, height: game.arena.height },
    };
  }

  const State = {
    parseParams, loadHighScore, saveHighScore, createPlayer, createGame, snapshot,
  };

  if (isNode) module.exports = State;
  else (root.AS = root.AS || {}).State = State;
})(typeof globalThis !== 'undefined' ? globalThis : this);
