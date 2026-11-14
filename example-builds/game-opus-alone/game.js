/* Arena Survival — plain JS, canvas rendering, WebAudio synth. */
(() => {
'use strict';

// ---------------------------------------------------------------------------
// Utilities & config
// ---------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const TAU = Math.PI * 2;

const params = new URLSearchParams(location.search);
const START_WAVE = (() => {
  const n = parseInt(params.get('wave'), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 999) : 1;
})();
const GOD = params.get('god') === '1';

const ARENA = { width: 1600, height: 1200 };
const HS_KEY = 'arenaSurvival.highScore.v1';
const MUTE_KEY = 'arenaSurvival.muted.v1';

function loadHighScore() {
  try { const v = parseInt(localStorage.getItem(HS_KEY), 10); return Number.isFinite(v) && v > 0 ? v : 0; }
  catch (e) { return 0; }
}
function saveHighScore(v) {
  try { localStorage.setItem(HS_KEY, String(v)); } catch (e) { /* storage blocked */ }
}

// Upgrades: price = round(base * growth^level)
const UPGRADES = [
  { id: 'damage',    name: 'Damage',      desc: '+25% bullet damage',     base: 12, growth: 1.45, max: 30 },
  { id: 'fireRate',  name: 'Fire Rate',   desc: '+15% shots per second',  base: 12, growth: 1.45, max: 30 },
  { id: 'moveSpeed', name: 'Move Speed',  desc: '+8% movement speed',     base: 10, growth: 1.5,  max: 10 },
  { id: 'maxHp',     name: 'Max HP',      desc: '+25 max HP & heal 25',   base: 10, growth: 1.4,  max: 30 },
  { id: 'multishot', name: 'Multishot',   desc: '+1 bullet per shot',     base: 35, growth: 1.9,  max: 6 },
  { id: 'pierce',    name: 'Piercing',    desc: 'Bullets pass +1 enemy',  base: 25, growth: 1.8,  max: 5 },
  { id: 'regen',     name: 'Regen',       desc: '+1 HP per second',       base: 15, growth: 1.6,  max: 10 },
  { id: 'heal',      name: 'Repair',      desc: 'Restore 50% of max HP',  base: 8,  growth: 1.25, max: 99, consumable: true },
];
function upgradePrice(u, level) { return Math.round(u.base * Math.pow(u.growth, level)); }

// Enemy archetypes
const ENEMY_TYPES = {
  chaser:  { r: 12, hp: 20,  speed: 135, dmg: 10, score: 10,  coins: 2,  kbResist: 1.0, color: '#ff4d6a' },
  tank:    { r: 26, hp: 130, speed: 55,  dmg: 25, score: 40,  coins: 6,  kbResist: 0.2, color: '#a46bff' },
  shooter: { r: 16, hp: 40,  speed: 85,  dmg: 10, score: 25,  coins: 4,  kbResist: 0.7, color: '#4dff9a' },
  dasher:  { r: 14, hp: 35,  speed: 100, dmg: 15, score: 25,  coins: 4,  kbResist: 0.6, color: '#ffa03a' },
  boss:    { r: 52, hp: 650, speed: 50,  dmg: 35, score: 400, coins: 40, kbResist: 0.05, color: '#ff2d55' },
};

// ---------------------------------------------------------------------------
// Audio (synthesised; silently disabled if unavailable/blocked)
// ---------------------------------------------------------------------------
const Sound = (() => {
  let ctx = null, master = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
  const last = {};
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.35;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }
  function tone({ freq = 440, to = null, dur = 0.1, type = 'square', vol = 0.3, delay = 0, noise = false }) {
    if (!ctx || muted || ctx.state !== 'running') return;
    try {
      const t0 = ctx.currentTime + delay;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let src;
      if (noise) {
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        src = ctx.createBufferSource(); src.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
        src.connect(f); f.connect(g);
      } else {
        src = ctx.createOscillator(); src.type = type;
        src.frequency.setValueAtTime(freq, t0);
        if (to) src.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        src.connect(g);
      }
      g.connect(master);
      src.start(t0); src.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  function play(name) {
    if (!ctx || muted) return;
    const now = performance.now();
    const gap = { shoot: 70, hit: 45, kill: 40, ehit: 120, coin: 60 }[name] || 0;
    if (gap && last[name] && now - last[name] < gap) return;
    last[name] = now;
    switch (name) {
      case 'shoot': tone({ freq: 880, to: 440, dur: 0.06, type: 'square', vol: 0.05 }); break;
      case 'hit':   tone({ freq: 300, to: 160, dur: 0.05, type: 'triangle', vol: 0.12 }); break;
      case 'kill':  tone({ freq: 1800, dur: 0.12, noise: true, vol: 0.25 }); tone({ freq: 500, to: 120, dur: 0.12, type: 'square', vol: 0.06 }); break;
      case 'big':   tone({ freq: 900, dur: 0.5, noise: true, vol: 0.45 }); tone({ freq: 160, to: 40, dur: 0.5, type: 'sawtooth', vol: 0.15 }); break;
      case 'hurt':  tone({ freq: 220, to: 70, dur: 0.25, type: 'sawtooth', vol: 0.25 }); break;
      case 'eshot': tone({ freq: 500, to: 300, dur: 0.08, type: 'sine', vol: 0.08 }); break;
      case 'dash':  tone({ freq: 200, to: 900, dur: 0.18, type: 'sawtooth', vol: 0.07 }); break;
      case 'buy':   tone({ freq: 660, dur: 0.07, type: 'square', vol: 0.12 }); tone({ freq: 990, dur: 0.12, type: 'square', vol: 0.12, delay: 0.07 }); break;
      case 'deny':  tone({ freq: 140, dur: 0.15, type: 'square', vol: 0.12 }); break;
      case 'wave':  [440, 554, 659, 880].forEach((f, i) => tone({ freq: f, dur: 0.15, type: 'triangle', vol: 0.18, delay: i * 0.08 })); break;
      case 'clear': [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'square', vol: 0.1, delay: i * 0.09 })); break;
      case 'over':  [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'sawtooth', vol: 0.14, delay: i * 0.16 })); break;
    }
  }
  function toggle() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : 0.35;
    return muted;
  }
  return { ensure, play, toggle, isMuted: () => muted };
})();

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const ui = {
  hud: $('hud'), hpFill: $('hpFill'), hpText: $('hpText'), wave: $('hudWave'), score: $('hudScore'),
  coins: $('hudCoins'), left: $('hudLeft'), mute: $('muteBtn'),
  title: $('titleScreen'), titleHigh: $('titleHigh'), startBtn: $('startBtn'),
  shop: $('shopScreen'), shopTitle: $('shopTitle'), shopCoins: $('shopCoins'), shopHp: $('shopHp'),
  upgradeList: $('upgradeList'), continueBtn: $('continueBtn'),
  over: $('gameOverScreen'), goScore: $('goScore'), goWave: $('goWave'), goHigh: $('goHigh'),
  newBest: $('newBest'), restartBtn: $('restartBtn'), menuBtn: $('menuBtn'),
};

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let nextId = 1;
const G = {
  screen: 'title',
  wave: 0,
  score: 0,
  highScore: loadHighScore(),
  coins: 0,
  upgrades: {},
  player: null,
  enemies: [],
  bullets: [],
  ebullets: [],
  particles: [],
  texts: [],
  spawnQueue: [],
  pending: [],     // telegraphed spawns
  spawnTimer: 0,
  waveCfg: null,
  waveClearTimer: -1,
  banner: null,
  time: 0,
  shake: 0,
  hurtFlash: 0,
  newBest: false,
  waveTotal: 0,
  killed: 0,
};

function resetUpgrades() {
  G.upgrades = {};
  for (const u of UPGRADES) G.upgrades[u.id] = 0;
}
resetUpgrades();

function stats() {
  const L = G.upgrades;
  return {
    damage: 10 * (1 + 0.25 * L.damage),
    fireRate: 2.6 * (1 + 0.15 * L.fireRate),
    speed: 230 * (1 + 0.08 * L.moveSpeed),
    maxHp: 100 + 25 * L.maxHp,
    shots: 1 + L.multishot,
    pierce: L.pierce,
    regen: L.regen * 1.0,
    range: 720,
    bulletSpeed: 820,
  };
}

function newPlayer() {
  const s = stats();
  return {
    x: ARENA.width / 2, y: ARENA.height / 2, r: 15,
    hp: s.maxHp, maxHp: s.maxHp,
    vx: 0, vy: 0, invuln: 0, fireCd: 0.3, aim: -Math.PI / 2, recoil: 0, alive: true,
  };
}

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------
function buildWave(n) {
  const list = [];
  const add = (t, c) => { for (let i = 0; i < c; i++) list.push(t); };
  if (n === 1) {
    add('chaser', 8);
  } else {
    add('chaser', 6 + n * 3);
    add('tank', Math.floor(n * 0.7));                              // wave2: 1
    if (n >= 3) add('shooter', 2 + Math.floor((n - 3) * 0.7));    // wave3: 2
    if (n >= 4) add('dasher', 1 + Math.floor((n - 4) * 0.7));
  }
  // shuffle
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  // Guarantee the newest type shows up early in its introduction wave
  if (n === 2) { const i = list.indexOf('tank'); if (i > 2) { list.splice(i, 1); list.splice(2, 0, 'tank'); } }
  if (n === 3) { const i = list.indexOf('shooter'); if (i > 2) { list.splice(i, 1); list.splice(1, 0, 'shooter'); } }
  if (n % 5 === 0) {
    const bosses = n / 5;
    for (let b = 0; b < bosses; b++) list.splice(Math.floor(list.length * (0.35 + 0.5 * b / bosses)), 0, 'boss');
  }
  return {
    list,
    hpMult: 1 + 0.17 * (n - 1) + 0.006 * (n - 1) * (n - 1),
    spdMult: 1 + Math.min(0.35, 0.02 * (n - 1)),
    dmgMult: 1 + Math.min(1.5, 0.06 * (n - 1)),
    interval: n === 1 ? 0.95 : Math.max(0.12, 0.9 - n * 0.06),
    group: 1 + Math.floor(n / 4),
    scoreMult: 1 + 0.1 * (n - 1),
  };
}

function startWave(n) {
  G.wave = n;
  G.waveCfg = buildWave(n);
  G.spawnQueue = G.waveCfg.list.slice();
  G.waveTotal = G.spawnQueue.length;
  G.killed = 0;
  G.pending.length = 0;
  G.spawnTimer = 0.6;
  G.waveClearTimer = -1;
  G.ebullets.length = 0;
  G.bullets.length = 0;
  G.screen = 'playing';
  G.banner = { text: 'WAVE ' + n, sub: n === 1 ? 'Survive!' : (n % 5 === 0 ? 'Boss wave!' : ''), t: 2.2 };
  const p = G.player;
  p.invuln = Math.max(p.invuln, 1.0);
  Sound.play('wave');
  showScreen('playing');
}

function pickSpawnPoint(r) {
  const p = G.player;
  let best = null, bestD = -1;
  for (let i = 0; i < 12; i++) {
    const side = randInt(0, 3);
    const m = r + 20;
    let x, y;
    if (side === 0) { x = rand(m, ARENA.width - m); y = m; }
    else if (side === 1) { x = ARENA.width - m; y = rand(m, ARENA.height - m); }
    else if (side === 2) { x = rand(m, ARENA.width - m); y = ARENA.height - m; }
    else { x = m; y = rand(m, ARENA.height - m); }
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > 420) return { x, y };
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

function queueSpawn(type) {
  const def = ENEMY_TYPES[type];
  const pt = pickSpawnPoint(def.r);
  G.pending.push({ type, x: pt.x, y: pt.y, t: type === 'boss' ? 1.4 : 0.75, max: type === 'boss' ? 1.4 : 0.75 });
}

function spawnEnemy(type, x, y) {
  const def = ENEMY_TYPES[type];
  const cfg = G.waveCfg;
  const hp = Math.round(def.hp * cfg.hpMult);
  const e = {
    id: nextId++, type, x, y, r: def.r, hp, maxHp: hp,
    speed: def.speed * cfg.spdMult * rand(0.92, 1.08),
    dmg: Math.round(def.dmg * cfg.dmgMult),
    vx: 0, vy: 0, kbx: 0, kby: 0, flash: 0, t: rand(0, 1), state: 0, stateT: rand(1.2, 2.4),
    fireCd: rand(1.2, 2.4), dir: Math.atan2(G.player.y - y, G.player.x - x), wob: rand(0, TAU),
    spawnT: 0.25, burst: 0,
  };
  G.enemies.push(e);
  burst(x, y, def.color, type === 'boss' ? 40 : 10, 160, 0.4);
}

// ---------------------------------------------------------------------------
// Spatial grid (for collisions with many enemies)
// ---------------------------------------------------------------------------
const CELL = 80;
const GW = Math.ceil(ARENA.width / CELL), GH = Math.ceil(ARENA.height / CELL);
const grid = new Array(GW * GH);
for (let i = 0; i < grid.length; i++) grid[i] = [];
function buildGrid() {
  for (let i = 0; i < grid.length; i++) grid[i].length = 0;
  for (const e of G.enemies) {
    const cx = clamp((e.x / CELL) | 0, 0, GW - 1), cy = clamp((e.y / CELL) | 0, 0, GH - 1);
    grid[cy * GW + cx].push(e);
  }
}
function query(x, y, rad, out) {
  out.length = 0;
  const x0 = clamp(((x - rad) / CELL) | 0, 0, GW - 1), x1 = clamp(((x + rad) / CELL) | 0, 0, GW - 1);
  const y0 = clamp(((y - rad) / CELL) | 0, 0, GH - 1), y1 = clamp(((y + rad) / CELL) | 0, 0, GH - 1);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const c = grid[cy * GW + cx];
    for (let i = 0; i < c.length; i++) out.push(c[i]);
  }
  return out;
}
const qbuf = [];

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
const MAX_PARTICLES = 900;
function burst(x, y, color, n, spd, life) {
  for (let i = 0; i < n; i++) {
    if (G.particles.length >= MAX_PARTICLES) G.particles.shift();
    const a = rand(0, TAU), s = rand(spd * 0.3, spd);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.5, life), max: life, color, size: rand(2, 4.5) });
  }
}
function floatText(x, y, text, color, size = 16) {
  if (G.texts.length > 60) G.texts.shift();
  G.texts.push({ x, y, text, color, size, t: 0.9, max: 0.9 });
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = new Set();
const joy = { id: null, active: false, ox: 0, oy: 0, x: 0, y: 0 };

window.addEventListener('keydown', (e) => {
  Sound.ensure();
  const code = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
  keys.add(code);
  if (code === 'Enter' || code === 'NumpadEnter') {
    e.preventDefault(); // prevents a focused <button> from also firing a click
    if (e.repeat) return;
    if (G.screen === 'title') startGame();
    else if (G.screen === 'gameover') startGame();
    else if (G.screen === 'shop') continueFromShop();
    return;
  }
  if (code === 'KeyM' && !e.repeat) { toggleMute(); return; }
  if (G.screen === 'shop' && !e.repeat) {
    let d = -1;
    if (/^Digit[1-9]$/.test(code)) d = +code.slice(5);
    else if (/^Numpad[1-9]$/.test(code)) d = +code.slice(6);
    if (d >= 1 && d <= UPGRADES.length) { e.preventDefault(); buyUpgrade(d - 1); }
  }
}, true);
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); joy.active = false; joy.id = null; });

canvas.addEventListener('pointerdown', (e) => {
  Sound.ensure();
  if (G.screen !== 'playing' || joy.id !== null) return;
  e.preventDefault();
  joy.id = e.pointerId; joy.active = true;
  joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joy.id) return;
  e.preventDefault();
  joy.x = e.clientX; joy.y = e.clientY;
  // let the joystick base follow if dragged far, so reversing direction is quick
  const R = joyRadius();
  const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
  if (d > R * 1.6) { joy.ox = joy.x - dx / d * R * 1.6; joy.oy = joy.y - dy / d * R * 1.6; }
});
const endJoy = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.active = false; } };
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);
canvas.addEventListener('lostpointercapture', endJoy);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });

function joyRadius() { return clamp(Math.min(view.w, view.h) * 0.11, 40, 80); }

function inputVector() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (x || y) { const d = Math.hypot(x, y); return { x: x / d, y: y / d }; }
  if (joy.active) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
    const R = joyRadius();
    if (d > 6) {
      const m = clamp((d - 6) / (R * 0.6), 0, 1);
      return { x: dx / d * m, y: dy / d * m };
    }
  }
  return { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------
// Screens / flow
// ---------------------------------------------------------------------------
function showScreen(name) {
  ui.title.classList.toggle('hidden', name !== 'title');
  ui.shop.classList.toggle('hidden', name !== 'shop');
  ui.over.classList.toggle('hidden', name !== 'gameover');
  ui.hud.classList.toggle('hidden', name === 'title');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (name === 'title') ui.titleHigh.textContent = G.highScore;
}

function startGame() {
  Sound.ensure();
  resetUpgrades();
  G.score = 0; G.coins = 0; G.newBest = false;
  G.enemies.length = 0; G.bullets.length = 0; G.ebullets.length = 0;
  G.particles.length = 0; G.texts.length = 0; G.pending.length = 0;
  G.player = newPlayer();
  joy.active = false; joy.id = null;
  cam.x = G.player.x; cam.y = G.player.y;
  startWave(START_WAVE);
}

function openShop() {
  G.screen = 'shop';
  G.bullets.length = 0; G.ebullets.length = 0;
  joy.active = false; joy.id = null;
  ui.shopTitle.textContent = 'Wave ' + G.wave + ' cleared!';
  ui.continueBtn.textContent = 'Continue to Wave ' + (G.wave + 1) + ' ▶';
  saveHighScore(G.highScore);
  renderShop();
  showScreen('shop');
  Sound.play('clear');
}

function continueFromShop() {
  if (G.screen !== 'shop') return;
  const p = G.player;
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.15); // small breather heal
  startWave(G.wave + 1);
}

function gameOver() {
  G.screen = 'gameover';
  G.player.alive = false;
  joy.active = false; joy.id = null;
  if (G.score > G.highScore) { G.highScore = G.score; G.newBest = true; }
  saveHighScore(G.highScore);
  ui.goScore.textContent = G.score;
  ui.goWave.textContent = G.wave;
  ui.goHigh.textContent = G.highScore;
  ui.newBest.classList.toggle('hidden', !G.newBest);
  showScreen('gameover');
  Sound.play('over');
}

function toGameTitle() {
  G.screen = 'title';
  G.wave = 0; G.score = 0; G.coins = 0;
  G.enemies.length = 0; G.bullets.length = 0; G.ebullets.length = 0; G.pending.length = 0;
  resetUpgrades();
  G.player = newPlayer();
  showScreen('title');
}

// Shop UI -------------------------------------------------------------------
const upgButtons = [];
function buildShopButtons() {
  UPGRADES.forEach((u, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'upg';
    b.dataset.id = u.id;
    b.innerHTML = `<span class="key">${i + 1}</span><span class="name"></span><span class="lvl"></span><span class="desc"></span><span class="price"></span>`;
    b.addEventListener('click', () => { buyUpgrade(i); });
    ui.upgradeList.appendChild(b);
    upgButtons.push(b);
  });
}
function renderShop() {
  ui.shopCoins.textContent = G.coins;
  const p = G.player;
  ui.shopHp.textContent = Math.ceil(p.hp) + '/' + p.maxHp;
  UPGRADES.forEach((u, i) => {
    const b = upgButtons[i];
    const lvl = G.upgrades[u.id];
    const price = upgradePrice(u, lvl);
    const maxed = lvl >= u.max;
    const useless = u.id === 'heal' && p.hp >= p.maxHp;
    b.querySelector('.name').textContent = u.name;
    b.querySelector('.lvl').textContent = u.consumable ? (lvl ? '×' + lvl : '') : 'Lv ' + lvl;
    b.querySelector('.desc').textContent = u.desc;
    b.querySelector('.price').innerHTML = maxed ? 'MAX' : useless ? 'HP full' : `<i class="coin-ic"></i>${price}`;
    b.classList.toggle('maxed', maxed);
    b.disabled = maxed || useless || G.coins < price;
    b.setAttribute('aria-label', `${u.name}, level ${lvl}, ${u.desc}, costs ${price} coins`);
  });
}
function buyUpgrade(i) {
  if (G.screen !== 'shop') return false;
  const u = UPGRADES[i];
  if (!u) return false;
  const lvl = G.upgrades[u.id];
  const price = upgradePrice(u, lvl);
  const p = G.player;
  if (lvl >= u.max || G.coins < price || (u.id === 'heal' && p.hp >= p.maxHp)) { Sound.play('deny'); return false; }
  G.coins -= price;
  G.upgrades[u.id] = lvl + 1;
  if (u.id === 'maxHp') { p.maxHp = stats().maxHp; p.hp = Math.min(p.maxHp, p.hp + 25); }
  if (u.id === 'heal') { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5); }
  Sound.play('buy');
  renderShop();
  const b = upgButtons[i];
  b.classList.remove('bought'); void b.offsetWidth; b.classList.add('bought');
  return true;
}

ui.startBtn.addEventListener('click', () => { if (G.screen === 'title') startGame(); });
ui.restartBtn.addEventListener('click', () => { if (G.screen === 'gameover') startGame(); });
ui.menuBtn.addEventListener('click', () => { if (G.screen === 'gameover') toGameTitle(); });
ui.continueBtn.addEventListener('click', () => continueFromShop());
ui.mute.addEventListener('click', () => toggleMute());
function toggleMute() { Sound.ensure(); const m = Sound.toggle(); ui.mute.classList.toggle('muted', m); }
ui.mute.classList.toggle('muted', Sound.isMuted());
document.addEventListener('pointerdown', () => Sound.ensure(), { capture: true, passive: true });

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(dt) {
  G.time += dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  if (G.hurtFlash > 0) G.hurtFlash = Math.max(0, G.hurtFlash - dt * 2.5);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }

  if (G.screen === 'playing') updatePlaying(dt);
  updateEffects(dt);
}

function updatePlaying(dt) {
  const p = G.player;
  const s = stats();

  // --- player movement
  const iv = inputVector();
  const tvx = iv.x * s.speed, tvy = iv.y * s.speed;
  const k = 1 - Math.exp(-dt * 18);
  p.vx += (tvx - p.vx) * k; p.vy += (tvy - p.vy) * k;
  p.x = clamp(p.x + p.vx * dt, p.r, ARENA.width - p.r);
  p.y = clamp(p.y + p.vy * dt, p.r, ARENA.height - p.r);
  if (p.invuln > 0) p.invuln -= dt;
  if (p.recoil > 0) p.recoil = Math.max(0, p.recoil - dt * 40);
  if (s.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + s.regen * dt);

  // --- spawning
  if (G.spawnQueue.length) {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      G.spawnTimer += G.waveCfg.interval;
      for (let i = 0; i < G.waveCfg.group && G.spawnQueue.length; i++) queueSpawn(G.spawnQueue.shift());
    }
  }
  for (let i = G.pending.length - 1; i >= 0; i--) {
    const sp = G.pending[i];
    sp.t -= dt;
    if (sp.t <= 0) { spawnEnemy(sp.type, sp.x, sp.y); G.pending.splice(i, 1); }
  }

  buildGrid();

  // --- enemies
  for (const e of G.enemies) updateEnemy(e, dt, p);

  // separation between enemies
  for (const e of G.enemies) {
    query(e.x, e.y, e.r + 30, qbuf);
    for (let i = 0; i < qbuf.length; i++) {
      const o = qbuf[i];
      if (o === e || o.id < e.id) continue;
      const dx = o.x - e.x, dy = o.y - e.y;
      const min = o.r + e.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        const we = o.r * o.r / (e.r * e.r + o.r * o.r); // heavier pushes lighter
        e.x -= nx * push * we * 2 * 0.5; e.y -= ny * push * we * 2 * 0.5;
        o.x += nx * push * (1 - we) * 2 * 0.5; o.y += ny * push * (1 - we) * 2 * 0.5;
      }
    }
  }
  for (const e of G.enemies) { e.x = clamp(e.x, e.r, ARENA.width - e.r); e.y = clamp(e.y, e.r, ARENA.height - e.r); }

  // contact damage
  if (p.alive) {
    for (const e of G.enemies) {
      if (e.spawnT > 0) continue;
      const dx = e.x - p.x, dy = e.y - p.y, min = e.r + p.r - 3;
      if (dx * dx + dy * dy < min * min) {
        hurtPlayer(e.dmg, e.x, e.y);
        // push enemy back a bit so it doesn't sit inside the player
        const d = Math.hypot(dx, dy) || 1;
        e.kbx += dx / d * 260 * ENEMY_TYPES[e.type].kbResist; e.kby += dy / d * 260 * ENEMY_TYPES[e.type].kbResist;
      }
    }
  }

  buildGrid();

  // --- player weapon
  p.fireCd -= dt;
  if (p.fireCd <= 0) {
    const target = nearestEnemy(p.x, p.y, s.range);
    if (target) {
      p.fireCd = 1 / s.fireRate;
      // lead the target slightly
      const dist = Math.hypot(target.x - p.x, target.y - p.y);
      const tt = dist / s.bulletSpeed;
      const ang = Math.atan2(target.y + target.vy * tt * 0.7 - p.y, target.x + target.vx * tt * 0.7 - p.x);
      p.aim = ang; p.recoil = 4;
      const n = s.shots, spread = 0.13;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * spread;
        G.bullets.push({
          x: p.x + Math.cos(a) * (p.r + 4), y: p.y + Math.sin(a) * (p.r + 4),
          vx: Math.cos(a) * s.bulletSpeed, vy: Math.sin(a) * s.bulletSpeed,
          dmg: s.damage, life: 1.0, pierce: s.pierce, hits: [], r: 5,
        });
      }
      Sound.play('shoot');
    } else {
      p.fireCd = 0;
    }
  }

  // --- player bullets
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < -20 || b.y < -20 || b.x > ARENA.width + 20 || b.y > ARENA.height + 20;
    if (!dead) {
      query(b.x, b.y, 60, qbuf);
      for (let j = 0; j < qbuf.length; j++) {
        const e = qbuf[j];
        if (e.hp <= 0 || b.hits.includes(e.id)) continue;
        const dx = e.x - b.x, dy = e.y - b.y, min = e.r + b.r;
        if (dx * dx + dy * dy < min * min) {
          damageEnemy(e, b.dmg, b.vx, b.vy);
          b.hits.push(e.id);
          if (b.pierce > 0) b.pierce--; else { dead = true; break; }
        }
      }
    }
    if (dead) { G.bullets[i] = G.bullets[G.bullets.length - 1]; G.bullets.pop(); }
  }

  // --- enemy bullets
  for (let i = G.ebullets.length - 1; i >= 0; i--) {
    const b = G.ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > ARENA.width || b.y > ARENA.height;
    if (!dead && p.alive) {
      const dx = p.x - b.x, dy = p.y - b.y, min = p.r + b.r - 2;
      if (dx * dx + dy * dy < min * min) {
        if (p.invuln <= 0) { hurtPlayer(b.dmg, b.x, b.y); dead = true; burst(b.x, b.y, '#ffb3c0', 8, 150, 0.3); }
      }
    }
    if (dead) { G.ebullets[i] = G.ebullets[G.ebullets.length - 1]; G.ebullets.pop(); }
  }

  // remove dead enemies
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    if (G.enemies[i].hp <= 0) { G.enemies[i] = G.enemies[G.enemies.length - 1]; G.enemies.pop(); }
  }

  // --- wave completion
  if (G.screen === 'playing' && !G.spawnQueue.length && !G.pending.length && !G.enemies.length) {
    if (G.waveClearTimer < 0) {
      G.waveClearTimer = 1.3;
      G.banner = { text: 'WAVE ' + G.wave + ' CLEARED', sub: '', t: 1.3 };
      G.ebullets.length = 0;
    } else {
      G.waveClearTimer -= dt;
      if (G.waveClearTimer <= 0) openShop();
    }
  }
}

function nearestEnemy(x, y, range) {
  let best = null, bd = range * range;
  for (const e of G.enemies) {
    if (e.hp <= 0) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function updateEnemy(e, dt, p) {
  e.t += dt;
  if (e.flash > 0) e.flash -= dt;
  if (e.spawnT > 0) e.spawnT -= dt;
  const dx = p.x - e.x, dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist, ny = dy / dist;
  let mvx = 0, mvy = 0;

  switch (e.type) {
    case 'chaser': {
      // weave slightly so swarms look alive
      const w = Math.sin(e.t * 4 + e.wob) * 0.35;
      mvx = (nx - ny * w) * e.speed; mvy = (ny + nx * w) * e.speed;
      break;
    }
    case 'tank': mvx = nx * e.speed; mvy = ny * e.speed; break;
    case 'shooter': {
      const strafe = Math.sin(e.t * 0.8 + e.wob) > 0 ? 1 : -1;
      let fwd = 0;
      if (dist > 380) fwd = 1; else if (dist < 250) fwd = -1;
      mvx = (nx * fwd - ny * strafe * 0.6) * e.speed; mvy = (ny * fwd + nx * strafe * 0.6) * e.speed;
      e.fireCd -= dt;
      if (e.fireCd <= 0 && dist < 620 && e.spawnT <= 0) {
        e.fireCd = rand(1.8, 2.6);
        const a = Math.atan2(dy, dx);
        enemyShot(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, 270, Math.round(10 * G.waveCfg.dmgMult), 6);
        e.flash = Math.max(e.flash, 0.05);
      }
      break;
    }
    case 'dasher': {
      e.stateT -= dt;
      if (e.state === 0) { // approach
        mvx = nx * e.speed; mvy = ny * e.speed;
        if (e.stateT <= 0 && dist < 460) { e.state = 1; e.stateT = 0.55; }
        else if (e.stateT <= 0) e.stateT = 0.3;
      } else if (e.state === 1) { // wind-up (telegraph)
        e.dir = Math.atan2(dy, dx);
        if (e.stateT <= 0) { e.state = 2; e.stateT = 0.42; Sound.play('dash'); }
      } else if (e.state === 2) { // dash
        const sp = 640 * G.waveCfg.spdMult;
        mvx = Math.cos(e.dir) * sp; mvy = Math.sin(e.dir) * sp;
        if (Math.random() < 0.6) G.particles.length < MAX_PARTICLES && G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#ffa03a', size: 5 });
        if (e.stateT <= 0) { e.state = 3; e.stateT = 0.5; }
      } else { // recover
        mvx = nx * e.speed * 0.3; mvy = ny * e.speed * 0.3;
        if (e.stateT <= 0) { e.state = 0; e.stateT = rand(1.0, 2.0); }
      }
      break;
    }
    case 'boss': {
      mvx = nx * e.speed; mvy = ny * e.speed;
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.spawnT <= 0) {
        e.burst++;
        e.fireCd = 2.6;
        const dmg = Math.round(12 * G.waveCfg.dmgMult);
        if (e.burst % 3 === 0) {
          const a = Math.atan2(dy, dx);
          for (let i = -3; i <= 3; i++) enemyShot(e.x, e.y, a + i * 0.12, 330, dmg, 8);
        } else {
          const n = 16, off = rand(0, TAU);
          for (let i = 0; i < n; i++) enemyShot(e.x, e.y, off + i * TAU / n, 220, dmg, 8);
        }
        e.flash = 0.08;
        G.shake = Math.max(G.shake, 4);
      }
      break;
    }
  }
  if (e.spawnT > 0) { mvx *= 0.2; mvy *= 0.2; }
  e.vx = mvx; e.vy = mvy;
  if (e.type !== 'dasher' || e.state !== 2) e.dir = Math.atan2(mvy || ny, mvx || nx);
  // knockback decays
  const kd = Math.exp(-dt * 9);
  e.x += (mvx + e.kbx) * dt; e.y += (mvy + e.kby) * dt;
  e.kbx *= kd; e.kby *= kd;
}

function enemyShot(x, y, a, speed, dmg, r) {
  if (G.ebullets.length > 600) return;
  G.ebullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, r, life: 4 });
  Sound.play('eshot');
}

function damageEnemy(e, dmg, bvx, bvy) {
  e.hp -= dmg;
  e.flash = 0.09;
  const def = ENEMY_TYPES[e.type];
  const bl = Math.hypot(bvx, bvy) || 1;
  const kb = 160 * def.kbResist;
  e.kbx += bvx / bl * kb; e.kby += bvy / bl * kb;
  burst(e.x - bvx / bl * e.r * 0.6, e.y - bvy / bl * e.r * 0.6, '#ffffff', 3, 180, 0.18);
  if (e.hp <= 0) killEnemy(e);
  else Sound.play('hit');
}

function killEnemy(e) {
  const def = ENEMY_TYPES[e.type];
  const pts = Math.round(def.score * G.waveCfg.scoreMult);
  G.score += pts;
  G.coins += def.coins;
  G.killed++;
  if (G.score > G.highScore) { G.highScore = G.score; G.newBest = true; }
  const big = e.type === 'boss' || e.type === 'tank';
  burst(e.x, e.y, def.color, e.type === 'boss' ? 70 : big ? 26 : 14, e.type === 'boss' ? 420 : 260, big ? 0.8 : 0.55);
  burst(e.x, e.y, '#ffffff', big ? 10 : 4, 200, 0.25);
  floatText(e.x, e.y - e.r, '+' + def.coins, '#ffd34d', e.type === 'boss' ? 26 : 15);
  if (e.type === 'boss') { G.shake = Math.max(G.shake, 18); Sound.play('big'); }
  else { if (big) G.shake = Math.max(G.shake, 5); Sound.play('kill'); }
}

function hurtPlayer(dmg, sx, sy) {
  const p = G.player;
  if (!p.alive || p.invuln > 0) return;
  p.invuln = 0.7;
  if (GOD) { G.hurtFlash = Math.max(G.hurtFlash, 0.25); return; }
  p.hp -= dmg;
  G.shake = Math.max(G.shake, 9);
  G.hurtFlash = 1;
  floatText(p.x, p.y - 26, '-' + dmg, '#ff5470', 18);
  burst(p.x, p.y, '#ff5470', 12, 220, 0.4);
  // knock player away from the source
  const dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy) || 1;
  p.vx += dx / d * 380; p.vy += dy / d * 380;
  Sound.play('hurt');
  if (p.hp <= 0) {
    p.hp = 0;
    burst(p.x, p.y, '#5ff3ff', 60, 380, 1.0);
    burst(p.x, p.y, '#ffffff', 25, 250, 0.6);
    G.shake = 20;
    gameOver();
  }
}

function updateEffects(dt) {
  const ps = G.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const q = ps[i];
    q.life -= dt;
    if (q.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    const f = Math.exp(-dt * 4); q.vx *= f; q.vy *= f;
  }
  for (let i = G.texts.length - 1; i >= 0; i--) {
    const t = G.texts[i];
    t.t -= dt; t.y -= 40 * dt;
    if (t.t <= 0) G.texts.splice(i, 1);
  }
  // keep enemies animating (flash) when not playing
  if (G.screen !== 'playing') for (const e of G.enemies) { if (e.flash > 0) e.flash -= dt; e.t += dt; }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const view = { w: 0, h: 0, dpr: 1, scale: 1 };
const cam = { x: ARENA.width / 2, y: ARENA.height / 2 };

function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.w = w; view.h = h;
  canvas.width = Math.round(w * view.dpr);
  canvas.height = Math.round(h * view.dpr);
  // world-to-screen scale: show roughly 1000x750 arena units' worth of area
  let sc = Math.sqrt((w * h) / (900 * 680));
  sc = Math.max(sc, Math.max(w / (ARENA.width + 200), h / (ARENA.height + 200))); // never show far beyond the arena
  view.scale = clamp(sc, 0.35, 3);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
resize();

function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  const k = 1 - Math.exp(-dt * 8);
  cam.x += (p.x - cam.x) * k; cam.y += (p.y - cam.y) * k;
  const hw = view.w / view.scale / 2, hh = view.h / view.scale / 2;
  const pad = 60;
  if (hw * 2 >= ARENA.width + pad * 2) cam.x = ARENA.width / 2; else cam.x = clamp(cam.x, hw - pad, ARENA.width - hw + pad);
  if (hh * 2 >= ARENA.height + pad * 2) cam.y = ARENA.height / 2; else cam.y = clamp(cam.y, hh - pad, ARENA.height - hh + pad);
}

function render() {
  const { w, h, dpr, scale } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#070910';
  ctx.fillRect(0, 0, w, h);

  let sx = 0, sy = 0;
  if (G.shake > 0) { sx = rand(-1, 1) * G.shake; sy = rand(-1, 1) * G.shake; }
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (w / 2 - cam.x * scale + sx), dpr * (h / 2 - cam.y * scale + sy));

  drawArena();
  drawPending();
  drawEnemyBulletsAndEnemies();
  drawPlayerBullets();
  if (G.player && G.player.alive && G.screen !== 'title') drawPlayer(G.player);
  drawParticles();
  drawTexts();

  // screen-space overlays
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.screen === 'playing') drawOffscreenIndicators();
  if (G.hurtFlash > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(255,40,70,0)');
    g.addColorStop(1, `rgba(255,40,70,${0.45 * G.hurtFlash})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  if (G.screen === 'playing' && G.player && G.player.hp < G.player.maxHp * 0.3) {
    const a = 0.18 + 0.12 * Math.sin(G.time * 6);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.8);
    g.addColorStop(0, 'rgba(255,0,40,0)'); g.addColorStop(1, `rgba(255,0,40,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  if (G.screen === 'playing' && joy.active) drawJoystick();
  if (G.banner && (G.screen === 'playing')) drawBanner();
}

function drawArena() {
  const W = ARENA.width, H = ARENA.height;
  ctx.fillStyle = '#10152a';
  ctx.fillRect(0, 0, W, H);
  // grid
  ctx.strokeStyle = 'rgba(90,120,220,0.09)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += 80) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // center emblem
  ctx.strokeStyle = 'rgba(95,243,255,0.07)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 160, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 60, 0, TAU); ctx.stroke();
  // border
  ctx.strokeStyle = 'rgba(95,243,255,0.25)'; ctx.lineWidth = 14;
  ctx.strokeRect(-7, -7, W + 14, H + 14);
  ctx.strokeStyle = '#5ff3ff'; ctx.lineWidth = 3;
  ctx.strokeRect(-1.5, -1.5, W + 3, H + 3);
}

function drawPending() {
  for (const sp of G.pending) {
    const def = ENEMY_TYPES[sp.type];
    const k = 1 - sp.t / sp.max;
    const r = def.r * (1.8 - k * 0.8);
    ctx.globalAlpha = 0.35 + 0.5 * k;
    ctx.strokeStyle = def.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sp.x - r * 0.5, sp.y - r * 0.5); ctx.lineTo(sp.x + r * 0.5, sp.y + r * 0.5);
    ctx.moveTo(sp.x + r * 0.5, sp.y - r * 0.5); ctx.lineTo(sp.x - r * 0.5, sp.y + r * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function poly(x, y, r, n, rot) {
  ctx.moveTo(x + Math.cos(rot) * r, y + Math.sin(rot) * r);
  for (let i = 1; i < n; i++) { const a = rot + i * TAU / n; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath();
}

function drawEnemyBulletsAndEnemies() {
  // view culling bounds
  const hw = view.w / view.scale / 2 + 80, hh = view.h / view.scale / 2 + 80;
  const minX = cam.x - hw, maxX = cam.x + hw, minY = cam.y - hh, maxY = cam.y + hh;

  for (const e of G.enemies) {
    if (e.x < minX || e.x > maxX || e.y < minY || e.y > maxY) continue;
    drawEnemy(e);
  }

  // enemy bullets (batched)
  ctx.fillStyle = '#ff7b93';
  ctx.beginPath();
  for (const b of G.ebullets) { ctx.moveTo(b.x + b.r + 3, b.y); ctx.arc(b.x, b.y, b.r + 3, 0, TAU); }
  ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffe1e7';
  ctx.beginPath();
  for (const b of G.ebullets) { ctx.moveTo(b.x + b.r * 0.6, b.y); ctx.arc(b.x, b.y, b.r * 0.6, 0, TAU); }
  ctx.fill();
}

function drawEnemy(e) {
  const def = ENEMY_TYPES[e.type];
  const white = e.flash > 0;
  const sc = e.spawnT > 0 ? 1 - e.spawnT * 1.6 : 1;
  const r = e.r * Math.max(0.3, sc);
  const col = white ? '#ffffff' : def.color;
  ctx.fillStyle = col;
  ctx.strokeStyle = white ? '#ffffff' : 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  switch (e.type) {
    case 'chaser': {
      const a = e.dir;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a) * r * 1.35, e.y + Math.sin(a) * r * 1.35);
      ctx.lineTo(e.x + Math.cos(a + 2.4) * r, e.y + Math.sin(a + 2.4) * r);
      ctx.lineTo(e.x + Math.cos(a + Math.PI) * r * 0.45, e.y + Math.sin(a + Math.PI) * r * 0.45);
      ctx.lineTo(e.x + Math.cos(a - 2.4) * r, e.y + Math.sin(a - 2.4) * r);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'tank': {
      const a = e.t * 0.6;
      ctx.beginPath(); poly(e.x, e.y, r * 1.12, 8, a); ctx.fill(); ctx.stroke();
      ctx.fillStyle = white ? '#fff' : '#6c3fc4';
      ctx.beginPath(); poly(e.x, e.y, r * 0.62, 4, -a * 1.5); ctx.fill();
      break;
    }
    case 'shooter': {
      ctx.beginPath(); poly(e.x, e.y, r * 1.15, 4, 0); ctx.fill(); ctx.stroke();
      // eye / barrel aimed at player
      const p = G.player;
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      ctx.fillStyle = white ? '#fff' : '#0d3b24';
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.45, 0, TAU); ctx.fill();
      const charge = clamp(1 - e.fireCd / 0.6, 0, 1);
      ctx.fillStyle = charge > 0 ? `rgb(255,${200 - charge * 120},${200 - charge * 120})` : '#c8ffe0';
      ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * r * 0.25, e.y + Math.sin(a) * r * 0.25, r * (0.2 + charge * 0.12), 0, TAU); ctx.fill();
      break;
    }
    case 'dasher': {
      let a = e.dir;
      let ox = 0, oy = 0;
      if (e.state === 1) { ox = rand(-2, 2); oy = rand(-2, 2); }
      const x = e.x + ox, y = e.y + oy;
      if (e.state === 1) {
        // telegraph line
        ctx.strokeStyle = 'rgba(255,160,58,0.35)'; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 260, y + Math.sin(a) * 260); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
        if (!white && Math.floor(e.t * 16) % 2) ctx.fillStyle = '#fff3c4';
      }
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5);
      ctx.lineTo(x + Math.cos(a + 2.2) * r * 1.1, y + Math.sin(a + 2.2) * r * 1.1);
      ctx.lineTo(x + Math.cos(a + Math.PI) * r * 0.2, y + Math.sin(a + Math.PI) * r * 0.2);
      ctx.lineTo(x + Math.cos(a - 2.2) * r * 1.1, y + Math.sin(a - 2.2) * r * 1.1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'boss': {
      const a = e.t * 0.4;
      ctx.beginPath(); poly(e.x, e.y, r * 1.1, 6, a); ctx.fill(); ctx.stroke();
      ctx.fillStyle = white ? '#fff' : '#7a0f26';
      ctx.beginPath(); poly(e.x, e.y, r * 0.7, 6, -a); ctx.fill();
      ctx.fillStyle = white ? '#fff' : '#ffd34d';
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.28 + Math.sin(e.t * 6) * 2, 0, TAU); ctx.fill();
      break;
    }
  }
  // HP bar for sturdier enemies when damaged
  if (e.hp < e.maxHp && (e.type === 'tank' || e.type === 'boss' || e.type === 'shooter' || e.type === 'dasher')) {
    const bw = e.r * 2, bh = e.type === 'boss' ? 7 : 4, by = e.y - e.r - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = def.color; ctx.fillRect(e.x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), bh);
  }
}

function drawPlayerBullets() {
  ctx.strokeStyle = 'rgba(95,243,255,0.45)';
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const b of G.bullets) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); }
  ctx.stroke();
  ctx.fillStyle = '#eaffff';
  ctx.beginPath();
  for (const b of G.bullets) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, TAU); }
  ctx.fill();
  ctx.lineCap = 'butt';
}

function drawPlayer(p) {
  if (p.invuln > 0 && Math.floor(G.time * 20) % 2 === 0 && !GOD) ctx.globalAlpha = 0.45;
  // glow
  ctx.fillStyle = 'rgba(95,243,255,0.12)';
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.1, 0, TAU); ctx.fill();
  // barrel
  const a = p.aim, br = p.r + 10 - p.recoil;
  ctx.strokeStyle = '#bff9ff'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * br, p.y + Math.sin(a) * br); ctx.stroke();
  ctx.lineCap = 'butt';
  // body
  ctx.fillStyle = '#5ff3ff';
  ctx.strokeStyle = '#0a3a48'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e9fdff';
  ctx.beginPath(); ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.35, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // small hp ring
  const f = p.hp / p.maxHp;
  ctx.strokeStyle = f > 0.5 ? '#7cffa0' : f > 0.25 ? '#ffd34d' : '#ff5470';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
}

function drawParticles() {
  for (const q of G.particles) {
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    ctx.fillStyle = q.color;
    const s = q.size;
    ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    ctx.globalAlpha = clamp(t.t / t.max * 1.5, 0, 1);
    ctx.font = `800 ${t.size}px system-ui, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawOffscreenIndicators() {
  // Point to enemies off-screen when few remain, so the last stragglers are easy to find.
  const remaining = G.enemies.length;
  if (remaining === 0 || remaining > 6) return;
  const { w, h, scale } = view;
  const m = 28;
  for (const e of G.enemies) {
    const sx = (e.x - cam.x) * scale + w / 2, sy = (e.y - cam.y) * scale + h / 2;
    if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) continue;
    const a = Math.atan2(sy - h / 2, sx - w / 2);
    const top = 70;
    const x = clamp(sx, m, w - m), y = clamp(sy, top, h - m);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = ENEMY_TYPES[e.type].color; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-4, 0); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawJoystick() {
  const R = joyRadius();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, R, 0, TAU); ctx.stroke();
  const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
  const k = d > R ? R / d : 1;
  ctx.fillStyle = '#5ff3ff'; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.arc(joy.ox + dx * k, joy.oy + dy * k, R * 0.42, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBanner() {
  const b = G.banner;
  const { w, h } = view;
  const life = b.text.includes('CLEARED') ? 1.3 : 2.2;
  const t = life - b.t;
  const a = clamp(Math.min(t * 4, b.t * 2.5), 0, 1);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const size = clamp(Math.min(w, h) * 0.11, 34, 84);
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  const y = h * 0.32;
  ctx.strokeText(b.text, w / 2, y);
  ctx.fillStyle = b.text.includes('CLEARED') ? '#7cffa0' : '#5ff3ff';
  ctx.fillText(b.text, w / 2, y);
  if (b.sub) {
    ctx.font = `700 ${size * 0.4}px system-ui, sans-serif`;
    ctx.lineWidth = 5; ctx.strokeText(b.sub, w / 2, y + size * 0.75);
    ctx.fillStyle = b.sub.includes('Boss') ? '#ff5470' : '#e8ecff';
    ctx.fillText(b.sub, w / 2, y + size * 0.75);
  }
  ctx.globalAlpha = 1;
}

// HUD (DOM) — only touch the DOM when values change
const hudCache = {};
function setText(el, key, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } }
function updateHud() {
  if (G.screen === 'title' || !G.player) return;
  const p = G.player;
  const hp = Math.ceil(p.hp);
  setText(ui.hpText, 'hp', hp + ' / ' + p.maxHp);
  const pct = (clamp(p.hp / p.maxHp, 0, 1) * 100).toFixed(1) + '%';
  if (hudCache.pct !== pct) { hudCache.pct = pct; ui.hpFill.style.width = pct; }
  setText(ui.wave, 'wave', String(G.wave));
  setText(ui.score, 'score', String(G.score));
  setText(ui.coins, 'coins', String(G.coins));
  setText(ui.left, 'left', String(Math.max(0, G.waveTotal - G.killed)));
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let lastT = performance.now();
function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 0.1);
  // sub-step for stability at low frame rates
  const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) update(h);
  updateCamera(dt);
  render();
  updateHud();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// QA interface
// ---------------------------------------------------------------------------
window.game = {
  getState() {
    const p = G.player;
    return {
      screen: G.screen,
      wave: G.screen === 'title' ? 0 : G.wave,
      score: G.score,
      highScore: G.highScore,
      coins: G.coins,
      player: p ? { x: p.x, y: p.y, hp: Math.max(0, p.hp), maxHp: p.maxHp } : { x: ARENA.width / 2, y: ARENA.height / 2, hp: 100, maxHp: 100 },
      enemies: G.enemies.filter((e) => e.hp > 0).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp })),
      upgrades: Object.assign({}, G.upgrades),
      arena: { width: ARENA.width, height: ARENA.height },
    };
  },
};

// Persist high score if the page is closed mid-run
window.addEventListener('pagehide', () => saveHighScore(G.highScore));
document.addEventListener('visibilitychange', () => { if (document.hidden) { saveHighScore(G.highScore); keys.clear(); } lastT = performance.now(); });

// Boot
buildShopButtons();
G.player = newPlayer();
showScreen('title');
requestAnimationFrame((t) => { lastT = t; frame(t); });
})();
