/*
 * config.js — static game data and tuning constants.
 *
 * Pure data only. Every other module reads its numbers from here so balance
 * changes live in one place.
 */
(function (root) {
  'use strict';

  const Config = {
    ARENA: { width: 1500, height: 1500 },

    // How many square arena units should be visible on screen. The renderer
    // derives its zoom from this so phones and desktops see a similar area.
    VIEW_AREA: 760000,
    MIN_SCALE: 0.42,
    MAX_SCALE: 2.4,
    CAMERA_MARGIN: 70, // arena units the camera may show beyond the wall

    MAX_FRAME_DT: 1 / 60, // seconds; longer frames are clamped (tab switch etc.)
    SUBSTEP: 1 / 120, // simulation sub-step so fast bullets never tunnel

    PLAYER: {
      radius: 16,
      maxHp: 100,
      speed: 230,
      damage: 10,
      fireRate: 2.5, // shots per second
      bulletSpeed: 780,
      bulletRadius: 5,
      bulletLife: 2.2, // seconds
      pierce: 0,
      multishot: 1,
      spread: 0.17, // radians between multishot bullets
      invulnTime: 0.5, // seconds of invulnerability after being hit
    },

    // Base stats at wave 1. Scaled per wave by Waves.enemyStats().
    ENEMIES: {
      chaser: {
        name: 'Runner', radius: 13, hp: 10, speed: 140, damage: 10,
        score: 10, coins: 2, mass: 1, color: '#ff4d6d',
      },
      tank: {
        name: 'Brute', radius: 27, hp: 70, speed: 58, damage: 22,
        score: 35, coins: 6, mass: 6, color: '#a06cf0',
      },
      shooter: {
        name: 'Spitter', radius: 15, hp: 22, speed: 95, damage: 8,
        score: 25, coins: 4, mass: 1.3, color: '#fbbf24',
        preferredRange: 320, fireRange: 620, fireInterval: 2.4, aimTime: 0.35,
        bulletSpeed: 260, bulletDamage: 9, bulletRadius: 6, bulletLife: 4,
      },
      charger: {
        name: 'Charger', radius: 16, hp: 32, speed: 72, damage: 16,
        score: 30, coins: 5, mass: 2.2, color: '#a3e635',
        dashRange: 430, windupTime: 0.6, dashTime: 0.45, dashSpeed: 560,
        recoverTime: 0.6, dashCooldown: 2.2,
      },
    },

    // Order matters: it defines the 1–9 hotkeys in the shop.
    UPGRADES: [
      { id: 'damage', name: 'Damage', basePrice: 12, growth: 1.5, maxLevel: 20 },
      { id: 'fireRate', name: 'Fire Rate', basePrice: 12, growth: 1.5, maxLevel: 20 },
      { id: 'moveSpeed', name: 'Move Speed', basePrice: 10, growth: 1.4, maxLevel: 10 },
      { id: 'maxHp', name: 'Max HP', basePrice: 10, growth: 1.4, maxLevel: 20 },
      { id: 'heal', name: 'Repair', basePrice: 8, growth: 1.35, maxLevel: 99 },
      { id: 'multishot', name: 'Multishot', basePrice: 40, growth: 2.0, maxLevel: 4 },
      { id: 'pierce', name: 'Pierce', basePrice: 30, growth: 1.8, maxLevel: 5 },
    ],

    // Per-level upgrade effects (see Shop.computePlayerStats).
    UPGRADE_EFFECTS: {
      damagePerLevel: 3,
      fireRatePerLevel: 0.15, // fraction of base
      moveSpeedPerLevel: 0.07, // fraction of base
      maxHpPerLevel: 20,
      healFraction: 0.5, // of max HP
    },

    WAVE: {
      spawnTelegraph: 0.7, // seconds a spawn marker shows before the enemy appears
      minSpawnDistance: 360,
      spawnMargin: 40,
      firstGroupAt: 0.4,
    },

    STORAGE_KEYS: {
      highScore: 'arenaSurvival.highScore',
      muted: 'arenaSurvival.muted',
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = Config;
  else (root.AS = root.AS || {}).Config = Config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
