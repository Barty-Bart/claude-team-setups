/* Arena Survival - plain script, no modules, no network. */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Config
  // ------------------------------------------------------------------
  var ARENA_W = 1600;
  var ARENA_H = 1000;
  var MAX_DT = 0.05;          // clamp frame delta (s)
  var STEP = 1 / 120;         // max simulation sub-step (s)
  var MAX_PARTICLES = 600;
  var MAX_TEXTS = 70;
  var BULLET_SPEED = 760;
  var HS_KEY = 'arenaSurvival.highScore';
  var MUTE_KEY = 'arenaSurvival.muted';

  var START_WAVE = 1;
  var GOD = false;
  try {
    var qs = new URLSearchParams(window.location.search);
    var qw = parseInt(qs.get('wave'), 10);
    if (isFinite(qw) && qw >= 1) START_WAVE = Math.min(qw, 999);
    var qg = qs.get('god');
    GOD = qg === '1' || qg === 'true';
  } catch (e) { /* ignore */ }

  var UPGRADES = [
    { id: 'damage',    name: 'Damage',     desc: '+25% bullet damage',  base: 10, growth: 1.55, max: 30 },
    { id: 'fireRate',  name: 'Fire Rate',  desc: '+20% shots per sec',  base: 10, growth: 1.55, max: 25 },
    { id: 'moveSpeed', name: 'Move Speed', desc: '+8% move speed',      base: 8,  growth: 1.5,  max: 10 },
    { id: 'maxHp',     name: 'Max HP',     desc: '+20 max HP, heals 20', base: 8, growth: 1.5,  max: 30 },
    { id: 'multishot', name: 'Multishot',  desc: '+1 bullet per shot',  base: 30, growth: 1.9,  max: 6 },
    { id: 'heal',      name: 'Repair',     desc: 'Restore 50% of max HP', base: 6, growth: 1.35, max: 999 }
  ];

  function upgradePrice(u, level) {
    return Math.round(u.base * Math.pow(u.growth, level));
  }

  var TYPES = {
    chaser:  { hp: 18,  speed: 125, r: 12, dmg: 10, score: 10, coins: 2, color: '#ff4d6d', dark: '#8a1c33' },
    tank:    { hp: 110, speed: 52,  r: 26, dmg: 22, score: 50, coins: 6, color: '#9b5de5', dark: '#4a2378' },
    shooter: { hp: 32,  speed: 95,  r: 14, dmg: 8,  score: 30, coins: 4, color: '#fee440', dark: '#7a6a10' }
  };

  // Wave composition: total count grows roughly quadratically.
  function waveComposition(w) {
    var k = w - 1;
    var n = Math.floor(5 + 3 * k + 1.1 * k * k);
    var tanks = 0, shooters = 0;
    if (w >= 2) tanks = Math.max(1, Math.floor(n * 0.12));
    if (w >= 3) shooters = Math.max(2, Math.floor(n * 0.15));
    var chasers = n - tanks - shooters;
    return { total: n, chaser: chasers, tank: tanks, shooter: shooters };
  }
  function waveHpMul(w) { var k = w - 1; return 1 + 0.14 * k + 0.016 * k * k; }
  function waveSpeedMul(w) { return Math.min(1.6, 0.85 + 0.05 * (w - 1)); }

  // ------------------------------------------------------------------
  // Storage
  // ------------------------------------------------------------------
  function loadHighScore() {
    try {
      var v = parseInt(window.localStorage.getItem(HS_KEY), 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function saveHighScore(v) {
    try { window.localStorage.setItem(HS_KEY, String(v)); } catch (e) { /* ignore */ }
  }
  function loadMuted() {
    try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function saveMuted(m) {
    try { window.localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------
  // Audio (lazy, fully optional)
  // ------------------------------------------------------------------
  var audio = { ctx: null, master: null, noise: null, failed: false, muted: loadMuted(), lastShoot: 0, lastHit: 0 };

  function initAudio() {
    if (audio.failed) return;
    try {
      if (!audio.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { audio.failed = true; return; }
        audio.ctx = new AC();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = audio.muted ? 0 : 0.3;
        audio.master.connect(audio.ctx.destination);
        var len = Math.floor(audio.ctx.sampleRate * 0.5);
        var buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        audio.noise = buf;
      }
      if (audio.ctx.state === 'suspended' && audio.ctx.resume) {
        var p = audio.ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { audio.failed = true; audio.ctx = null; }
  }

  function canPlay() {
    return audio.ctx && !audio.muted && audio.ctx.state === 'running';
  }

  function tone(f1, f2, dur, type, vol, delay) {
    if (!canPlay()) return;
    try {
      var c = audio.ctx;
      var t = c.currentTime + (delay || 0);
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f1, t);
      if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(audio.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  function noise(dur, vol, freq, delay) {
    if (!canPlay() || !audio.noise) return;
    try {
      var c = audio.ctx;
      var t = c.currentTime + (delay || 0);
      var s = c.createBufferSource();
      s.buffer = audio.noise;
      var f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq || 2000, t);
      f.frequency.exponentialRampToValueAtTime(100, t + dur);
      var g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(audio.master);
      s.start(t); s.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  var sfx = {
    shoot: function () {
      var now = performance.now();
      if (now - audio.lastShoot < 70) return;
      audio.lastShoot = now;
      tone(880, 440, 0.06, 'square', 0.05);
    },
    hit: function () {
      var now = performance.now();
      if (now - audio.lastHit < 40) return;
      audio.lastHit = now;
      tone(300, 180, 0.05, 'triangle', 0.08);
    },
    death: function (big) {
      noise(big ? 0.35 : 0.18, big ? 0.35 : 0.2, big ? 1200 : 2500);
      tone(big ? 160 : 260, 60, big ? 0.3 : 0.15, 'sawtooth', 0.06);
    },
    hurt: function () {
      tone(200, 70, 0.25, 'sawtooth', 0.2);
      noise(0.15, 0.25, 1500);
    },
    buy: function () {
      tone(660, 660, 0.08, 'square', 0.1);
      tone(990, 990, 0.12, 'square', 0.1, 0.07);
    },
    deny: function () { tone(140, 120, 0.15, 'square', 0.1); },
    wave: function () {
      tone(440, 440, 0.1, 'triangle', 0.15);
      tone(554, 554, 0.1, 'triangle', 0.15, 0.1);
      tone(659, 659, 0.2, 'triangle', 0.15, 0.2);
    },
    gameover: function () {
      tone(440, 220, 0.3, 'sawtooth', 0.15);
      tone(330, 165, 0.35, 'sawtooth', 0.15, 0.25);
      tone(220, 80, 0.6, 'sawtooth', 0.15, 0.55);
    },
    enemyShot: function () { tone(520, 300, 0.07, 'sine', 0.04); }
  };

  // ------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  var canvas = $('game');
  var ctx = canvas.getContext('2d');
  var el = {
    hud: $('hud'), hpFill: $('hp-fill'), hpText: $('hp-text'),
    hudWave: $('hud-wave'), hudScore: $('hud-score'), hudCoins: $('hud-coins'),
    title: $('title-screen'), shop: $('shop-screen'), gameover: $('gameover-screen'),
    titleHigh: $('title-highscore'), startBtn: $('start-btn'),
    shopTitle: $('shop-title'), shopCoins: $('shop-coins'), shopHp: $('shop-hp'),
    shopItems: $('shop-items'), continueBtn: $('continue-btn'),
    goScore: $('go-score'), goWave: $('go-wave'), goHigh: $('go-highscore'),
    goNewHigh: $('go-newhigh'), restartBtn: $('restart-btn'), muteBtn: $('mute-btn')
  };

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  var state = {
    screen: 'title',
    wave: 0,
    score: 0,
    coins: 0,
    highScore: loadHighScore()
  };
  var upgrades = {};
  var player = { x: ARENA_W / 2, y: ARENA_H / 2, r: 16, hp: 100, maxHp: 100, iframes: 0, fireCd: 0, aim: -Math.PI / 2, moving: false, hurtFlash: 0 };
  var enemies = [];
  var bullets = [];
  var eshots = [];
  var particles = [];
  var texts = [];
  var bulletPool = [], shotPool = [], particlePool = [], textPool = [];
  var nextEnemyId = 1;
  var waveRun = { queue: [], spawned: 0, total: 0, interval: 1, timer: 0, clearTimer: -1, hpMul: 1, spdMul: 1 };
  var banner = { text: '', sub: '', t: 0 };
  var shake = 0;
  var time = 0;
  var newHigh = false;

  function resetUpgrades() {
    for (var i = 0; i < UPGRADES.length; i++) upgrades[UPGRADES[i].id] = 0;
  }
  resetUpgrades();

  function statDamage() { return 10 * (1 + 0.25 * upgrades.damage); }
  function statFireRate() { return 2.5 * (1 + 0.2 * upgrades.fireRate); }
  function statSpeed() { return 240 * (1 + 0.08 * upgrades.moveSpeed); }
  function statMaxHp() { return 100 + 20 * upgrades.maxHp; }
  function statShots() { return 1 + upgrades.multishot; }

  // ------------------------------------------------------------------
  // Pools / effects
  // ------------------------------------------------------------------
  function removeAt(arr, i, pool) {
    var item = arr[i];
    arr[i] = arr[arr.length - 1];
    arr.pop();
    if (pool) pool.push(item);
  }
  function clearInto(arr, pool) {
    while (arr.length) pool.push(arr.pop());
  }

  function addParticles(x, y, color, count, speed, size) {
    for (var i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) return;
      var p = particlePool.pop() || {};
      var a = Math.random() * Math.PI * 2;
      var s = speed * (0.3 + Math.random() * 0.7);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.max = 0.35 + Math.random() * 0.4;
      p.color = color;
      p.size = (size || 3) * (0.6 + Math.random() * 0.8);
      particles.push(p);
    }
  }

  function addText(x, y, str, color, size) {
    if (texts.length >= MAX_TEXTS) {
      // recycle oldest
      textPool.push(texts.shift());
    }
    var t = textPool.pop() || {};
    t.x = x + (Math.random() - 0.5) * 10;
    t.y = y;
    t.str = str;
    t.color = color;
    t.size = size || 14;
    t.life = t.max = 0.9;
    texts.push(t);
  }

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------
  function setScreen(s) {
    state.screen = s;
    el.title.classList.toggle('hidden', s !== 'title');
    el.shop.classList.toggle('hidden', s !== 'shop');
    el.gameover.classList.toggle('hidden', s !== 'gameover');
    el.hud.classList.toggle('hidden', s === 'title');
    if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) {
      try { document.activeElement.blur(); } catch (e) { /* ignore */ }
    }
    if (s === 'title') el.titleHigh.textContent = state.highScore;
    joy.active = false;
    updateHud(true);
  }

  function startGame() {
    resetUpgrades();
    state.score = 0;
    state.coins = 0;
    newHigh = false;
    player.maxHp = statMaxHp();
    player.hp = player.maxHp;
    player.x = ARENA_W / 2;
    player.y = ARENA_H / 2;
    player.iframes = 0;
    player.fireCd = 0.3;
    player.hurtFlash = 0;
    enemies.length = 0;
    clearInto(bullets, bulletPool);
    clearInto(eshots, shotPool);
    clearInto(particles, particlePool);
    clearInto(texts, textPool);
    shake = 0;
    beginWave(START_WAVE);
    setScreen('playing');
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function beginWave(w) {
    state.wave = w;
    var comp = waveComposition(w);
    var q = [];
    var i;
    for (i = 0; i < comp.chaser; i++) q.push('chaser');
    for (i = 0; i < comp.tank; i++) q.push('tank');
    for (i = 0; i < comp.shooter; i++) q.push('shooter');
    shuffle(q);
    // make sure the opening of a wave is a few chasers so new types ease in
    if (w <= 3 && q.length > 2) {
      for (i = 0; i < 2; i++) {
        if (q[i] !== 'chaser') {
          var idx = q.indexOf('chaser', 2);
          if (idx > 0) { var t = q[i]; q[i] = q[idx]; q[idx] = t; }
        }
      }
    }
    waveRun.queue = q;
    waveRun.total = q.length;
    waveRun.spawned = 0;
    waveRun.interval = Math.max(0.06, Math.min(1.1, 14 / q.length));
    waveRun.timer = 0.8;
    waveRun.clearTimer = -1;
    waveRun.hpMul = waveHpMul(w);
    waveRun.spdMul = waveSpeedMul(w);
    clearInto(bullets, bulletPool);
    clearInto(eshots, shotPool);
    banner.text = 'WAVE ' + w;
    var subs = [];
    if (comp.chaser) subs.push(comp.chaser + ' chasers');
    if (comp.tank) subs.push(comp.tank + ' tanks');
    if (comp.shooter) subs.push(comp.shooter + ' shooters');
    banner.sub = subs.join(' · ');
    banner.t = 2.2;
    sfx.wave();
  }

  function openShop() {
    setScreen('shop');
    el.shopTitle.textContent = 'Wave ' + state.wave + ' cleared!';
    refreshShop();
  }

  function continueFromShop() {
    if (state.screen !== 'shop') return;
    beginWave(state.wave + 1);
    setScreen('playing');
  }

  function gameOver() {
    if (state.screen !== 'playing') return;
    player.hp = 0;
    if (state.score > state.highScore) {
      state.highScore = state.score;
      newHigh = true;
      saveHighScore(state.highScore);
    }
    el.goScore.textContent = state.score;
    el.goWave.textContent = state.wave;
    el.goHigh.textContent = state.highScore;
    el.goNewHigh.classList.toggle('hidden', !newHigh);
    addParticles(player.x, player.y, '#3ad6ff', 50, 400, 4);
    shake = 18;
    sfx.gameover();
    setScreen('gameover');
  }

  // ------------------------------------------------------------------
  // Shop
  // ------------------------------------------------------------------
  var shopButtons = [];
  function buildShop() {
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'upg';
      b.setAttribute('data-upgrade', u.id);
      b.innerHTML = '<span class="k"></span><span class="n"></span><span class="lv"></span><span class="d"></span><span class="p"></span>';
      b.querySelector('.k').textContent = String(i + 1);
      b.querySelector('.n').textContent = u.name;
      b.querySelector('.d').textContent = u.desc;
      (function (idx) {
        b.addEventListener('click', function () { buyUpgrade(idx); });
      })(i);
      el.shopItems.appendChild(b);
      shopButtons.push({ btn: b, lv: b.querySelector('.lv'), p: b.querySelector('.p') });
    }
  }

  function canBuy(idx) {
    var u = UPGRADES[idx];
    if (!u) return false;
    var lvl = upgrades[u.id];
    if (lvl >= u.max) return false;
    if (u.id === 'heal' && player.hp >= player.maxHp) return false;
    return state.coins >= upgradePrice(u, lvl);
  }

  function refreshShop() {
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      var lvl = upgrades[u.id];
      var sb = shopButtons[i];
      var maxed = lvl >= u.max;
      sb.lv.textContent = 'Lv ' + lvl + (maxed ? ' (MAX)' : '');
      if (maxed) sb.p.textContent = 'MAX';
      else if (u.id === 'heal' && player.hp >= player.maxHp) sb.p.textContent = '● ' + upgradePrice(u, lvl) + ' (full HP)';
      else sb.p.textContent = '● ' + upgradePrice(u, lvl);
      sb.btn.disabled = !canBuy(i);
      sb.btn.setAttribute('aria-label', u.name + ', level ' + lvl + ', price ' + upgradePrice(u, lvl) + ', key ' + (i + 1));
    }
    el.shopCoins.textContent = state.coins;
    el.shopHp.textContent = Math.ceil(player.hp) + ' / ' + player.maxHp;
  }

  function buyUpgrade(idx) {
    if (state.screen !== 'shop') return false;
    if (!canBuy(idx)) { if (UPGRADES[idx]) sfx.deny(); return false; }
    var u = UPGRADES[idx];
    var price = upgradePrice(u, upgrades[u.id]);
    state.coins -= price;
    upgrades[u.id]++;
    if (u.id === 'maxHp') {
      player.maxHp = statMaxHp();
      player.hp = Math.min(player.maxHp, player.hp + 20);
    } else if (u.id === 'heal') {
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.5);
    }
    sfx.buy();
    var b = shopButtons[idx].btn;
    b.classList.remove('flash');
    void b.offsetWidth;
    b.classList.add('flash');
    refreshShop();
    updateHud(true);
    return true;
  }

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  var hudCache = { hp: -1, maxHp: -1, wave: -1, score: -1, coins: -1 };
  function updateHud(force) {
    var hp = Math.ceil(player.hp);
    if (force || hp !== hudCache.hp || player.maxHp !== hudCache.maxHp) {
      hudCache.hp = hp; hudCache.maxHp = player.maxHp;
      var frac = Math.max(0, Math.min(1, player.hp / player.maxHp));
      el.hpFill.style.width = (frac * 100).toFixed(1) + '%';
      el.hpFill.classList.toggle('low', frac < 0.3);
      el.hpText.textContent = hp + ' / ' + player.maxHp;
    }
    if (force || state.wave !== hudCache.wave) { hudCache.wave = state.wave; el.hudWave.textContent = state.wave; }
    if (force || state.score !== hudCache.score) { hudCache.score = state.score; el.hudScore.textContent = state.score; }
    if (force || state.coins !== hudCache.coins) { hudCache.coins = state.coins; el.hudCoins.textContent = state.coins; }
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------
  var keys = { up: false, down: false, left: false, right: false };
  var KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right'
  };
  var KEYMAP_KEY = {
    w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Up: 'up', Down: 'down', Left: 'left', Right: 'right'
  };
  var joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0 };
  var JOY_R = 56;

  function clearInput() {
    keys.up = keys.down = keys.left = keys.right = false;
    joy.active = false; joy.vx = joy.vy = 0; joy.id = -1;
  }

  function dirFor(e) {
    return KEYMAP[e.code] || KEYMAP_KEY[e.key] || null;
  }

  window.addEventListener('keydown', function (e) {
    initAudio();
    var d = dirFor(e);
    if (d) {
      keys[d] = true;
      if (e.key && e.key.indexOf('Arrow') === 0) e.preventDefault();
      return;
    }
    if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (e.repeat) return;
      if (state.screen === 'title' || state.screen === 'gameover') startGame();
      else if (state.screen === 'shop') continueFromShop();
      return;
    }
    if (e.key === ' ' || e.code === 'Space') {
      if (state.screen === 'playing') e.preventDefault();
      return;
    }
    if (state.screen === 'shop') {
      var n = -1;
      var m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
      if (m) n = parseInt(m[1], 10);
      else if (/^[1-9]$/.test(e.key)) n = parseInt(e.key, 10);
      if (n >= 1) {
        e.preventDefault();
        if (!e.repeat) buyUpgrade(n - 1);
        return;
      }
    }
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleMute();
  });

  window.addEventListener('keyup', function (e) {
    var d = dirFor(e);
    if (d) keys[d] = false;
  });

  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', function () {
    clearInput();
    lastTime = 0;
  });

  canvas.addEventListener('pointerdown', function (e) {
    initAudio();
    if (state.screen !== 'playing') return;
    e.preventDefault();
    if (joy.active) return;
    joy.active = true;
    joy.id = e.pointerId;
    joy.ox = joy.x = e.clientX;
    joy.oy = joy.y = e.clientY;
    joy.vx = joy.vy = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    e.preventDefault();
    joy.x = e.clientX; joy.y = e.clientY;
    var dx = joy.x - joy.ox, dy = joy.y - joy.oy;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > JOY_R) {
      // floating joystick: drag the origin along
      joy.ox = joy.x - dx / d * JOY_R;
      joy.oy = joy.y - dy / d * JOY_R;
      dx = joy.x - joy.ox; dy = joy.y - joy.oy; d = JOY_R;
    }
    if (d < 6) { joy.vx = joy.vy = 0; }
    else { joy.vx = dx / JOY_R; joy.vy = dy / JOY_R; }
  });
  function endPointer(e) {
    if (e.pointerId !== joy.id) return;
    joy.active = false; joy.id = -1; joy.vx = joy.vy = 0;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('pointerdown', initAudio, true);
  document.addEventListener('touchstart', initAudio, { capture: true, passive: true });

  el.startBtn.addEventListener('click', function () { initAudio(); if (state.screen === 'title') startGame(); });
  el.restartBtn.addEventListener('click', function () { initAudio(); if (state.screen === 'gameover') startGame(); });
  el.continueBtn.addEventListener('click', function () { initAudio(); continueFromShop(); });

  function applyMuteUi() {
    el.muteBtn.classList.toggle('muted', audio.muted);
    el.muteBtn.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  }
  function toggleMute() {
    audio.muted = !audio.muted;
    saveMuted(audio.muted);
    try { if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.3; } catch (e) { /* ignore */ }
    applyMuteUi();
  }
  el.muteBtn.addEventListener('click', function (e) {
    initAudio();
    toggleMute();
    try { el.muteBtn.blur(); } catch (err) { /* ignore */ }
  });
  applyMuteUi();

  // ------------------------------------------------------------------
  // Simulation
  // ------------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function spawnEnemy(type) {
    var T = TYPES[type];
    var r = T.r;
    var x = 0, y = 0, best = -1, bx = 0, by = 0;
    for (var tries = 0; tries < 12; tries++) {
      var edge = Math.floor(Math.random() * 4);
      if (edge === 0) { x = r + Math.random() * (ARENA_W - 2 * r); y = r; }
      else if (edge === 1) { x = r + Math.random() * (ARENA_W - 2 * r); y = ARENA_H - r; }
      else if (edge === 2) { x = r; y = r + Math.random() * (ARENA_H - 2 * r); }
      else { x = ARENA_W - r; y = r + Math.random() * (ARENA_H - 2 * r); }
      var dx = x - player.x, dy = y - player.y;
      var d2 = dx * dx + dy * dy;
      if (d2 > best) { best = d2; bx = x; by = y; }
      if (d2 > 450 * 450) break;
    }
    var hp = Math.round(T.hp * waveRun.hpMul);
    var e = {
      id: nextEnemyId++,
      type: type,
      x: bx, y: by, r: r,
      hp: hp, maxHp: hp,
      speed: T.speed * waveRun.spdMul * (0.9 + Math.random() * 0.2),
      dmg: Math.round(T.dmg * (1 + 0.04 * (state.wave - 1))),
      flash: 0,
      cd: 1 + Math.random() * 1.5,
      strafe: Math.random() < 0.5 ? -1 : 1,
      angle: Math.atan2(player.y - by, player.x - bx),
      spawnT: 0.35,
      px: bx, py: by, vx: 0, vy: 0,
      dead: false
    };
    enemies.push(e);
    addParticles(e.x, e.y, T.color, 8, 120, 2.5);
  }

  function nearestEnemy() {
    var best = null, bd = Infinity;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var dx = e.x - player.x, dy = e.y - player.y;
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function fire(target) {
    var dx = target.x - player.x, dy = target.y - player.y;
    // lead the target: solve |D + v t| = s t for the intercept time
    var tvx = target.vx || 0, tvy = target.vy || 0;
    var qa = tvx * tvx + tvy * tvy - BULLET_SPEED * BULLET_SPEED;
    var qb = 2 * (dx * tvx + dy * tvy);
    var qc = dx * dx + dy * dy;
    var disc = qb * qb - 4 * qa * qc;
    if (qa < 0 && disc >= 0) {
      var tHit = (-qb - Math.sqrt(disc)) / (2 * qa);
      if (tHit > 0 && tHit < 1.5) { dx += tvx * tHit; dy += tvy * tHit; }
    }
    var base = Math.atan2(dy, dx);
    player.aim = base;
    var n = statShots();
    var spread = 0.13;
    var dmg = statDamage();
    for (var i = 0; i < n; i++) {
      var a = base + (i - (n - 1) / 2) * spread;
      var b = bulletPool.pop() || {};
      // spawn at the player's centre; the swept hit test covers the whole path
      b.x = player.x;
      b.y = player.y;
      b.vx = Math.cos(a) * BULLET_SPEED;
      b.vy = Math.sin(a) * BULLET_SPEED;
      b.dmg = dmg;
      b.life = 1.6;
      bullets.push(b);
    }
    sfx.shoot();
  }

  function hurtPlayer(amount) {
    if (GOD || player.iframes > 0 || state.screen !== 'playing') return;
    player.hp -= amount;
    player.iframes = 0.6;
    player.hurtFlash = 0.25;
    shake = Math.max(shake, 11);
    addText(player.x, player.y - player.r - 8, '-' + amount, '#ff6b6b', 18);
    addParticles(player.x, player.y, '#ff6b6b', 12, 220, 3);
    sfx.hurt();
    if (player.hp <= 0) gameOver();
  }

  function killEnemy(e) {
    e.dead = true;
    var T = TYPES[e.type];
    state.score += T.score;
    state.coins += T.coins;
    addParticles(e.x, e.y, T.color, e.type === 'tank' ? 28 : 16, e.type === 'tank' ? 300 : 240, e.type === 'tank' ? 4 : 3);
    addParticles(e.x, e.y, '#ffffff', 4, 160, 2);
    addText(e.x, e.y - e.r - 4, '+' + T.coins + ' ●', '#ffd23f', 14);
    sfx.death(e.type === 'tank');
  }

  function stepSim(dt) {
    var i, j, e, b, dx, dy, d, d2, rr;

    // Player movement
    var mx = 0, my = 0;
    if (keys.left) mx -= 1;
    if (keys.right) mx += 1;
    if (keys.up) my -= 1;
    if (keys.down) my += 1;
    mx += joy.vx; my += joy.vy;
    var ml = Math.sqrt(mx * mx + my * my);
    if (ml > 1) { mx /= ml; my /= ml; }
    player.moving = ml > 0.05;
    var sp = statSpeed();
    player.x = clamp(player.x + mx * sp * dt, player.r, ARENA_W - player.r);
    player.y = clamp(player.y + my * sp * dt, player.r, ARENA_H - player.r);
    if (player.iframes > 0) player.iframes -= dt;
    if (player.hurtFlash > 0) player.hurtFlash -= dt;

    // Spawning
    if (waveRun.spawned < waveRun.total) {
      waveRun.timer -= dt;
      while (waveRun.timer <= 0 && waveRun.spawned < waveRun.total) {
        spawnEnemy(waveRun.queue[waveRun.spawned++]);
        waveRun.timer += waveRun.interval;
      }
    }

    // Auto-fire
    player.fireCd -= dt;
    if (player.fireCd <= 0) {
      var tgt = nearestEnemy();
      if (tgt) {
        fire(tgt);
        player.fireCd += 1 / statFireRate();
        if (player.fireCd < 0) player.fireCd = 0;
      } else {
        player.fireCd = 0;
      }
    }

    // Bullets
    for (i = bullets.length - 1; i >= 0; i--) {
      b = bullets[i];
      // swept segment test from previous to new position (no tunnelling)
      var x0 = b.x, y0 = b.y;
      var sdx = b.vx * dt, sdy = b.vy * dt;
      var slen2 = sdx * sdx + sdy * sdy;
      b.x += sdx;
      b.y += sdy;
      b.life -= dt;
      var hit = false;
      for (j = 0; j < enemies.length; j++) {
        e = enemies[j];
        if (e.dead) continue;
        var tt = slen2 > 0 ? ((e.x - x0) * sdx + (e.y - y0) * sdy) / slen2 : 0;
        if (tt < 0) tt = 0; else if (tt > 1) tt = 1;
        dx = e.x - (x0 + sdx * tt); dy = e.y - (y0 + sdy * tt);
        rr = e.r + 4;
        if (dx * dx + dy * dy < rr * rr) {
          b.x = x0 + sdx * tt; b.y = y0 + sdy * tt;
          e.hp -= b.dmg;
          e.flash = 0.08;
          var kb = e.type === 'tank' ? 4 : 12;
          var bl = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
          e.x = clamp(e.x + b.vx / bl * kb, e.r, ARENA_W - e.r);
          e.y = clamp(e.y + b.vy / bl * kb, e.r, ARENA_H - e.r);
          addText(e.x, e.y - e.r, String(Math.round(b.dmg)), '#ffffff', 12);
          addParticles(b.x, b.y, '#bff4ff', 3, 140, 2);
          sfx.hit();
          if (e.hp <= 0) killEnemy(e);
          hit = true;
          break;
        }
      }
      if (hit || b.life <= 0 || b.x < -20 || b.y < -20 || b.x > ARENA_W + 20 || b.y > ARENA_H + 20) {
        removeAt(bullets, i, bulletPool);
      }
    }

    // Enemies
    var n = enemies.length;
    for (i = 0; i < n; i++) {
      e = enemies[i];
      if (e.dead) continue;
      e.px = e.x; e.py = e.y;
      if (e.flash > 0) e.flash -= dt;
      if (e.spawnT > 0) e.spawnT -= dt;
      dx = player.x - e.x; dy = player.y - e.y;
      d = Math.sqrt(dx * dx + dy * dy);
      var ux, uy;
      if (d < 0.001) {
        // degenerate: enemy exactly on the player; pick a stable arbitrary direction
        var ra = e.id * 2.399963;
        ux = Math.cos(ra); uy = Math.sin(ra);
        d = 0;
      } else {
        ux = dx / d; uy = dy / d;
      }
      var vx = 0, vy = 0;
      // stand-off: melee enemies stop just inside touching distance
      var standoff = e.r + player.r - 4;
      if (e.type === 'shooter') {
        if (d > 340) { vx = ux; vy = uy; }
        else if (d < 230) { vx = -ux; vy = -uy; }
        else { vx = -uy * e.strafe * 0.7; vy = ux * e.strafe * 0.7; }
        // flip strafe when hugging a wall
        if (e.x <= e.r + 1 || e.x >= ARENA_W - e.r - 1 || e.y <= e.r + 1 || e.y >= ARENA_H - e.r - 1) {
          if (Math.random() < dt * 2) e.strafe = -e.strafe;
        }
        e.cd -= dt;
        if (e.cd <= 0 && d < 620) {
          e.cd = 1.9 + Math.random() * 0.8 - Math.min(0.6, state.wave * 0.03);
          var s = shotPool.pop() || {};
          var shotSpeed = Math.min(360, 230 + state.wave * 6);
          s.x = e.x + ux * e.r; s.y = e.y + uy * e.r;
          s.vx = ux * shotSpeed; s.vy = uy * shotSpeed;
          s.dmg = e.dmg; s.life = 4; s.r = 6;
          eshots.push(s);
          sfx.enemyShot();
        }
      } else if (d > standoff) {
        vx = ux; vy = uy;
      }
      e.angle = Math.atan2(uy, ux);
      var spd = e.spawnT > 0 ? e.speed * 0.3 : e.speed;
      var mv = spd * dt;
      if (vx !== 0 || vy !== 0) {
        if (e.type !== 'shooter' && d - mv < standoff) mv = Math.max(0, d - standoff);
        e.x += vx * mv;
        e.y += vy * mv;
      }
      if (d < standoff) {
        // pushed (e.g. by separation) inside the stand-off ring: ease back out
        var back = Math.min(standoff - d, Math.max(spd, 60) * dt);
        e.x -= ux * back;
        e.y -= uy * back;
      }

      // contact damage
      rr = e.r + player.r - 2;
      if (d < rr) hurtPlayer(e.dmg);
    }

    // Separation (pairwise, no allocations)
    for (i = 0; i < n; i++) {
      e = enemies[i];
      if (e.dead) continue;
      for (j = i + 1; j < n; j++) {
        var o = enemies[j];
        if (o.dead) continue;
        dx = o.x - e.x; dy = o.y - e.y;
        rr = e.r + o.r;
        d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.0001) {
          d = Math.sqrt(d2);
          var push = (rr - d) * 0.5;
          var px = dx / d * push, py = dy / d * push;
          var we = o.r / rr, wo = e.r / rr; // bigger enemies get pushed less
          e.x -= px * we * 2; e.y -= py * we * 2;
          o.x += px * wo * 2; o.y += py * wo * 2;
        }
      }
    }
    for (i = 0; i < n; i++) {
      e = enemies[i];
      e.x = clamp(e.x, e.r, ARENA_W - e.r);
      e.y = clamp(e.y, e.r, ARENA_H - e.r);
      if (!e.dead && dt > 0) {
        // smoothed measured velocity (used for lead aiming)
        e.vx = e.vx * 0.8 + (e.x - e.px) / dt * 0.2;
        e.vy = e.vy * 0.8 + (e.y - e.py) / dt * 0.2;
      }
    }

    // Enemy shots
    for (i = eshots.length - 1; i >= 0; i--) {
      s = eshots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0 || s.x < 0 || s.y < 0 || s.x > ARENA_W || s.y > ARENA_H) {
        removeAt(eshots, i, shotPool);
        continue;
      }
      dx = s.x - player.x; dy = s.y - player.y;
      rr = s.r + player.r - 2;
      if (dx * dx + dy * dy < rr * rr) {
        addParticles(s.x, s.y, '#ff9f1c', 6, 150, 2);
        removeAt(eshots, i, shotPool);
        hurtPlayer(s.dmg);
      }
    }

    // Compact dead enemies in place
    var w = 0;
    for (i = 0; i < enemies.length; i++) {
      if (!enemies[i].dead) enemies[w++] = enemies[i];
    }
    enemies.length = w;

    if (state.screen !== 'playing') return;

    // Wave clear
    if (waveRun.spawned >= waveRun.total && enemies.length === 0) {
      if (waveRun.clearTimer < 0) {
        waveRun.clearTimer = 1.1;
        var bonus = 6 + 3 * state.wave;
        state.coins += bonus;
        banner.text = 'WAVE ' + state.wave + ' CLEARED';
        banner.sub = '+' + bonus + ' bonus coins';
        banner.t = 1.1;
        clearInto(eshots, shotPool);
      }
      waveRun.clearTimer -= dt;
      if (waveRun.clearTimer <= 0) openShop();
    }
  }

  function updateEffects(dt) {
    var i, p;
    for (i = particles.length - 1; i >= 0; i--) {
      p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { removeAt(particles, i, particlePool); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.9; p.vy *= 0.9;
    }
    for (i = texts.length - 1; i >= 0; i--) {
      var t = texts[i];
      t.life -= dt;
      if (t.life <= 0) { textPool.push(t); texts.splice(i, 1); continue; }
      t.y -= 40 * dt;
    }
    if (shake > 0) shake = Math.max(0, shake - 40 * dt);
    if (banner.t > 0) banner.t -= dt;
  }

  function update(dt) {
    time += dt;
    if (state.screen === 'playing') {
      var steps = Math.ceil(dt / STEP);
      var h = dt / steps;
      for (var k = 0; k < steps; k++) {
        stepSim(h);
        if (state.screen !== 'playing') break;
      }
      updateHud(false);
    }
    updateEffects(dt);
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  var view = { w: 0, h: 0, dpr: 1, scale: 1, cx: ARENA_W / 2, cy: ARENA_H / 2 };

  function resize() {
    var w = Math.max(1, window.innerWidth);
    var h = Math.max(1, window.innerHeight);
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    view.w = w; view.h = h; view.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var sc = Math.min(Math.min(w, h) / 600, Math.max(w / ARENA_W, h / ARENA_H));
    sc = Math.max(sc, Math.min(w, h) / 900);
    view.scale = sc;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  function updateCamera() {
    var vw = view.w / view.scale, vh = view.h / view.scale;
    var tx = player.x, ty = player.y;
    if (vw >= ARENA_W) tx = ARENA_W / 2; else tx = clamp(tx, vw / 2, ARENA_W - vw / 2);
    if (vh >= ARENA_H) ty = ARENA_H / 2; else ty = clamp(ty, vh / 2, ARENA_H - vh / 2);
    view.cx = tx; view.cy = ty;
  }

  function toScreenX(x) { return (x - view.cx) * view.scale + view.w / 2; }
  function toScreenY(y) { return (y - view.cy) * view.scale + view.h / 2; }

  function render() {
    var dpr = view.dpr, sc = view.scale;
    updateCamera();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, view.w, view.h);

    var sx = 0, sy = 0;
    if (shake > 0) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }
    var ox = view.w / 2 - view.cx * sc + sx;
    var oy = view.h / 2 - view.cy * sc + sy;
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);

    // Arena floor + grid
    ctx.fillStyle = '#0f1524';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    ctx.beginPath();
    var gx;
    for (gx = 50; gx < ARENA_W; gx += 50) { ctx.moveTo(gx, 0); ctx.lineTo(gx, ARENA_H); }
    for (gx = 50; gx < ARENA_H; gx += 50) { ctx.moveTo(0, gx); ctx.lineTo(ARENA_W, gx); }
    ctx.strokeStyle = 'rgba(80,110,170,0.13)';
    ctx.lineWidth = 1 / sc;
    ctx.stroke();
    ctx.beginPath();
    for (gx = 200; gx < ARENA_W; gx += 200) { ctx.moveTo(gx, 0); ctx.lineTo(gx, ARENA_H); }
    for (gx = 200; gx < ARENA_H; gx += 200) { ctx.moveTo(0, gx); ctx.lineTo(ARENA_W, gx); }
    ctx.strokeStyle = 'rgba(80,110,170,0.25)';
    ctx.stroke();
    // border
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#3a86ff';
    ctx.strokeRect(-3, -3, ARENA_W + 6, ARENA_H + 6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(58,134,255,0.35)';
    ctx.strokeRect(-12, -12, ARENA_W + 24, ARENA_H + 24);

    var i, e, b, p;

    // Enemy shots
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    for (i = 0; i < eshots.length; i++) {
      b = eshots[i];
      ctx.moveTo(b.x + b.r, b.y);
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    for (i = 0; i < eshots.length; i++) {
      b = eshots[i];
      ctx.moveTo(b.x + 2.5, b.y);
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
    }
    ctx.fill();

    // Enemies
    for (i = 0; i < enemies.length; i++) drawEnemy(enemies[i]);

    // Player bullets
    ctx.strokeStyle = '#7ff0ff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (i = 0; i < bullets.length; i++) {
      b = bullets[i];
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Player
    if (state.screen !== 'gameover') drawPlayer();

    // Particles
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // ---------- screen space ----------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // floating texts
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < texts.length; i++) {
      var t = texts[i];
      var a = Math.min(1, t.life / t.max * 1.5);
      ctx.globalAlpha = a;
      ctx.font = '800 ' + t.size + 'px system-ui, sans-serif';
      var tx = toScreenX(t.x) + sx, ty = toScreenY(t.y) + sy;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.str, tx, ty);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, tx, ty);
    }
    ctx.globalAlpha = 1;

    if (state.screen === 'playing' || state.screen === 'shop') {
      drawOffscreenIndicators();
    }

    // damage vignette
    if (player.hurtFlash > 0) {
      ctx.globalAlpha = Math.min(0.45, player.hurtFlash * 1.8);
      ctx.fillStyle = '#ff2040';
      ctx.fillRect(0, 0, view.w, 8); ctx.fillRect(0, view.h - 8, view.w, 8);
      ctx.fillRect(0, 0, 8, view.h); ctx.fillRect(view.w - 8, 0, 8, view.h);
      ctx.globalAlpha = 1;
    }

    // banner
    if (state.screen === 'playing' && banner.t > 0) {
      var ba = Math.min(1, banner.t * 2);
      ctx.globalAlpha = ba;
      var fs = Math.max(26, Math.min(56, view.w / 12));
      ctx.font = '900 ' + fs + 'px system-ui, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      var by = view.h * 0.3;
      ctx.strokeText(banner.text, view.w / 2, by);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(banner.text, view.w / 2, by);
      if (banner.sub) {
        ctx.font = '700 ' + Math.round(fs * 0.36) + 'px system-ui, sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeText(banner.sub, view.w / 2, by + fs * 0.8);
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(banner.sub, view.w / 2, by + fs * 0.8);
      }
      ctx.globalAlpha = 1;
    }

    // joystick
    if (joy.active && state.screen === 'playing') {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(joy.ox, joy.oy, JOY_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#3a86ff';
      ctx.beginPath();
      ctx.arc(joy.ox + joy.vx * JOY_R, joy.oy + joy.vy * JOY_R, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (GOD && state.screen === 'playing') {
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('GOD MODE', view.w - 8, view.h - 10);
      ctx.textAlign = 'center';
    }
  }

  function drawEnemy(e) {
    var T = TYPES[e.type];
    var flash = e.flash > 0;
    var fill = flash ? '#ffffff' : T.color;
    var r = e.r;
    if (e.spawnT > 0) ctx.globalAlpha = 1 - e.spawnT / 0.35 * 0.7;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.type === 'chaser') {
      ctx.rotate(e.angle);
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r * 0.9, r * 0.95);
      ctx.lineTo(-r * 0.45, 0);
      ctx.lineTo(-r * 0.9, -r * 0.95);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = T.dark;
      ctx.stroke();
    } else if (e.type === 'tank') {
      ctx.rotate(time * 0.6 + e.id);
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        var a = k * Math.PI / 3;
        if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = flash ? '#ffffff' : T.dark;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = fill;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    } else {
      ctx.rotate(e.angle);
      ctx.beginPath();
      ctx.moveTo(r * 1.15, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 1.15, 0);
      ctx.lineTo(0, -r);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = T.dark;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = flash ? '#ffffff' : '#ff9f1c';
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (e.hp < e.maxHp) {
      var w = Math.max(20, r * 2);
      var y = e.y - r - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 6);
      ctx.fillStyle = T.color;
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  function drawPlayer() {
    var blink = player.iframes > 0 && Math.floor(time * 20) % 2 === 0;
    ctx.save();
    ctx.translate(player.x, player.y);
    // glow ring
    ctx.beginPath();
    ctx.arc(0, 0, player.r + 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(58,214,255,0.12)';
    ctx.fill();
    ctx.rotate(player.aim);
    // barrel
    ctx.fillStyle = '#cfefff';
    var n = statShots();
    ctx.fillRect(player.r - 4, -4, 14, 8);
    if (n > 1) { ctx.fillRect(player.r - 6, -9, 10, 4); ctx.fillRect(player.r - 6, 5, 10, 4); }
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, Math.PI * 2);
    ctx.fillStyle = blink ? '#ffffff' : '#3ad6ff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0b5f7a';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4, 0, player.r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#0b2a3a';
    ctx.fill();
    ctx.restore();
    if (GOD) {
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,210,63,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawOffscreenIndicators() {
    var m = 14;
    var top = 44; // keep clear of HUD a little
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var x = toScreenX(e.x), y = toScreenY(e.y);
      if (x >= 0 && x <= view.w && y >= 0 && y <= view.h) continue;
      var cx = clamp(x, m, view.w - m);
      var cy = clamp(y, top, view.h - m);
      var a = Math.atan2(y - cy, x - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, 6);
      ctx.lineTo(-5, -6);
      ctx.closePath();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = TYPES[e.type].color;
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------
  var lastTime = 0;
  function frame(now) {
    window.requestAnimationFrame(frame);
    if (document.hidden) { lastTime = 0; return; }
    if (!lastTime) lastTime = now;
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!(dt >= 0)) dt = 0;
    if (dt > MAX_DT) dt = MAX_DT;
    try {
      update(dt);
      render();
    } catch (err) {
      if (window.console && console.error) console.error(err);
    }
  }

  // ------------------------------------------------------------------
  // QA interface
  // ------------------------------------------------------------------
  function getState() {
    var list = [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead || e.hp <= 0) continue;
      list.push({ id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp });
    }
    var up = {};
    for (var k = 0; k < UPGRADES.length; k++) up[UPGRADES[k].id] = upgrades[UPGRADES[k].id];
    return {
      screen: state.screen,
      wave: state.screen === 'title' ? 0 : state.wave,
      score: state.score,
      highScore: state.highScore,
      coins: state.coins,
      player: { x: player.x, y: player.y, hp: Math.max(0, player.hp), maxHp: player.maxHp },
      enemies: list,
      upgrades: up,
      arena: { width: ARENA_W, height: ARENA_H }
    };
  }

  window.game = {
    getState: getState,
    upgradeIds: UPGRADES.map(function (u) { return u.id; })
  };

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  buildShop();
  resize();
  setScreen('title');
  window.requestAnimationFrame(frame);
})();
