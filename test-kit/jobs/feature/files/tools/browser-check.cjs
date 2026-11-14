/*
 * Browser smoke test (not part of `node --test`; needs the Node `playwright`
 * module with Chromium):  node tools/browser-check.cjs
 *
 * Drives the real game through index.html (file://) and checks the QA
 * interface, screens, keyboard, touch, shop, high-score persistence, layout
 * sizes and frame rate. Screenshots go to /tmp/arena-*.png.
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;
function check(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failures++;
}
const state = (p) => p.evaluate(() => window.game.getState());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(p, fn, timeout = 20000, arg) {
  try {
    await p.waitForFunction(fn, arg, { timeout, polling: 50 });
    return true;
  } catch (e) {
    return false;
  }
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('request', (r) => { if (!r.url().startsWith('file:')) errors.push('network: ' + r.url()); });
  };

  // ---------------------------------------------------- desktop full flow
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  watch(p);
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  let s = await state(p);
  check(s.screen === 'title' && s.wave === 0, 'starts on title with wave 0');
  check(s.arena.width > 0 && s.arena.height > 0, 'arena size reported');
  check(await p.isVisible('#btn-start'), 'title has a visible Play <button>');

  await p.keyboard.press('Enter');
  s = await state(p);
  check(s.screen === 'playing' && s.wave === 1, 'Enter starts wave 1');
  check(s.player.hp === s.player.maxHp, 'player starts at full HP');
  await waitFor(p, () => window.game.getState().enemies.length > 0, 5000);
  s = await state(p);
  check(s.enemies.length > 0, 'enemies spawn in wave 1');
  check(s.enemies.every((e) => e.type === 'chaser'), 'wave 1 is chasers only');
  const ids = new Set(s.enemies.map((e) => e.id));
  check(ids.size === s.enemies.length, 'enemy ids unique');

  // Movement: hold D then A; player must move and stay inside the arena.
  const x0 = s.player.x;
  await p.keyboard.down('KeyD');
  await sleep(400);
  await p.keyboard.up('KeyD');
  s = await state(p);
  check(s.player.x > x0 + 30, 'D moves the player right');
  const y0 = s.player.y;
  await p.keyboard.down('ArrowUp');
  await sleep(400);
  await p.keyboard.up('ArrowUp');
  s = await state(p);
  check(s.player.y < y0 - 30, 'ArrowUp moves the player up');
  await p.keyboard.down('ArrowLeft');
  await p.keyboard.down('KeyW');
  await sleep(6000);
  s = await state(p);
  check(s.player.x >= 0 && s.player.y >= 0 && s.player.x <= s.arena.width && s.player.y <= s.arena.height,
    'player clamped inside arena (' + Math.round(s.player.x) + ',' + Math.round(s.player.y) + ')');
  if (s.screen === 'playing') check(s.player.x < 40 && s.player.y < 40, 'player reached top-left corner');
  await p.keyboard.up('ArrowLeft');
  await p.keyboard.up('KeyW');

  // Let the auto-gun clear wave 1 by kiting around the middle.
  await p.keyboard.down('KeyD');
  await p.keyboard.down('KeyS');
  await sleep(2500);
  await p.keyboard.up('KeyD');
  await p.keyboard.up('KeyS');
  const cleared = await waitFor(p, () => window.game.getState().screen !== 'playing', 40000);
  s = await state(p);
  check(cleared && s.screen === 'shop', 'wave 1 cleared -> shop (hp ' + s.player.hp + ')');
  check(s.score > 0 && s.coins > 0, 'kills gave score ' + s.score + ' and coins ' + s.coins);
  check(s.highScore >= s.score, 'highScore tracks score');
  await sleep(600);
  await p.screenshot({ path: '/tmp/arena-shop.png' });
  const nUpgrades = await p.locator('#shop-list button').count();
  check(nUpgrades >= 4, 'shop offers ' + nUpgrades + ' upgrade buttons');

  // Buy with key 1 (damage) if affordable; price must rise.
  const price1 = await p.evaluate(() => {
    const b = document.querySelector('#shop-list button');
    return { disabled: b.disabled, text: b.querySelector('.price').textContent };
  });
  const coinsBefore = s.coins;
  await p.keyboard.press('1');
  s = await state(p);
  if (!price1.disabled) {
    check(s.upgrades.damage === 1 && s.coins === coinsBefore - Number(price1.text), 'key 1 bought damage for ' + price1.text);
    const price2 = await p.evaluate(() => document.querySelector('#shop-list button .price').textContent);
    check(Number(price2) > Number(price1.text), 'price rises ' + price1.text + ' -> ' + price2);
  } else {
    check(false, 'damage should be affordable after wave 1 (' + coinsBefore + ' coins)');
  }
  // Spend everything on clicks until nothing is affordable, then verify a
  // disabled button cannot buy.
  for (let i = 0; i < 20; i++) {
    const idx = await p.evaluate(() => [...document.querySelectorAll('#shop-list button')].findIndex((b) => !b.disabled));
    if (idx < 0) break;
    await p.locator('#shop-list button').nth(idx).click();
  }
  s = await state(p);
  const before = JSON.stringify(s.upgrades);
  for (let k = 1; k <= 7; k++) await p.keyboard.press(String(k));
  await p.locator('#shop-list button').first().click({ force: true }).catch(() => {});
  s = await state(p);
  check(JSON.stringify(s.upgrades) === before && s.coins >= 0, 'unaffordable upgrades cannot be bought (coins ' + s.coins + ')');

  await p.keyboard.press('Enter');
  s = await state(p);
  check(s.screen === 'playing' && s.wave === 2, 'Enter in shop starts wave 2');
  await waitFor(p, () => window.game.getState().enemies.length > 0, 5000);
  await p.screenshot({ path: '/tmp/arena-wave2.png' });

  // Die: a fresh game started at wave 8 with no upgrades, standing still.
  await p.goto(URL + '?wave=8');
  const prevBest = (await state(p)).highScore;
  check(prevBest > 0, 'best score from wave 1 already saved (' + prevBest + ')');
  await p.keyboard.press('Enter');
  const died = await waitFor(p, () => window.game.getState().screen === 'gameover', 120000);
  s = await state(p);
  check(died && s.screen === 'gameover', 'standing still eventually ends in game over');
  check(s.player.hp === 0, 'game over at 0 HP');
  const finalScore = Math.max(s.score, prevBest);
  check(s.highScore === finalScore, 'getState highScore = max(previous best, score)');
  await sleep(700);
  await p.screenshot({ path: '/tmp/arena-gameover.png' });
  check(await p.isVisible('#btn-restart'), 'game-over has a visible restart <button>');
  const goBest = await p.textContent('#go-best');
  check(Number(goBest.replace(/,/g, '')) === finalScore, 'game over shows best score ' + goBest);

  // Game-over Title button returns to the title screen.
  await p.click('#btn-title');
  s = await state(p);
  check(s.screen === 'title' && s.wave === 0, 'Title button returns to title');
  // Reload (without URL params): high score persists.
  await p.goto(URL);
  s = await state(p);
  check(s.highScore === finalScore && s.screen === 'title', 'high score survives reload (' + s.highScore + ')');
  const titleBest = await p.textContent('#title-best');
  check(Number(titleBest.replace(/,/g, '')) === finalScore, 'title shows best score ' + titleBest);

  // Click-only flow: Play button, then game-over Title button.
  await p.click('#btn-start');
  s = await state(p);
  check(s.screen === 'playing' && s.score === 0 && s.wave === 1, 'Play button starts a fresh game');
  await ctx.close();

  // ------------------------------------------------- QA URL parameters
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const q = await ctx2.newPage();
  watch(q);
  await q.goto(URL + '?wave=3&god=1');
  await q.keyboard.press('Enter');
  s = await state(q);
  check(s.wave === 3, '?wave=3 starts at wave 3');
  await waitFor(q, () => window.game.getState().screen !== 'playing', 60000);
  s = await state(q);
  check(s.screen === 'shop' && s.player.hp === s.player.maxHp, '?god=1 wave 3 cleared with no damage');
  // Fresh game at wave 3: all three base types must appear.
  await q.goto(URL + '?wave=3&god=1');
  await q.keyboard.press('Enter');
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const g = await state(q);
    g.enemies.forEach((e) => seen.add(e.type));
    if (g.screen !== 'playing') break;
    await sleep(100);
  }
  check(['chaser', 'tank', 'shooter'].every((t) => seen.has(t)), 'wave 3 includes chaser, tank, shooter: ' + [...seen].join(','));
  await ctx2.close();

  // --------------------------------------------- perf with 100+ enemies
  const ctx3 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const r = await ctx3.newPage();
  watch(r);
  await r.goto(URL + '?wave=40&god=1');
  await r.keyboard.press('Enter');
  await waitFor(r, () => window.game.getState().enemies.length >= 100, 30000);
  s = await state(r);
  check(s.enemies.length >= 100, 'wave 40 has ' + s.enemies.length + ' enemies alive');
  const fps = await r.evaluate(() => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    let worst = 0;
    let last = t0;
    function f(t) {
      worst = Math.max(worst, t - last);
      last = t;
      if (++n < 120) requestAnimationFrame(f);
      else res({ fps: (n * 1000) / (t - t0), worst, enemies: window.game.getState().enemies.length });
    }
    requestAnimationFrame(f);
  }));
  check(fps.fps > 50, 'fps with ' + fps.enemies + ' enemies: ' + fps.fps.toFixed(1) + ' (worst frame ' + fps.worst.toFixed(1) + 'ms)');
  const positionsOk = (await state(r)).enemies.every((e) => e.x >= 0 && e.y >= 0 && e.x <= s.arena.width && e.y <= s.arena.height);
  check(positionsOk, 'all enemies inside arena');
  await r.screenshot({ path: '/tmp/arena-crowd.png' });
  await ctx3.close();

  // ------------------------------------------------ mobile + touch drag
  const ctx4 = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const m = await ctx4.newPage();
  watch(m);
  await m.goto(URL + '?god=1');
  await m.screenshot({ path: '/tmp/arena-mobile-title.png' });
  const noScroll = () => m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth &&
    document.documentElement.scrollHeight <= window.innerHeight);
  check(await noScroll(), '360x640 title has no scrollbars');
  await m.tap('#btn-start');
  s = await state(m);
  check(s.screen === 'playing', 'tap on Play starts');
  const cdp = await ctx4.newCDPSession(m);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const t0 = await state(m);
  await touch('touchStart', 180, 400);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', 180 + i * 12, 400); await sleep(16); }
  await sleep(500);
  const t1 = await state(m);
  await touch('touchEnd');
  check(t1.player.x > t0.player.x + 40 && Math.abs(t1.player.y - t0.player.y) < 40, 'touch drag right moves player right (' + Math.round(t1.player.x - t0.player.x) + ')');
  await touch('touchStart', 100, 300);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', 100, 300 - i * 12); await sleep(16); }
  await sleep(500);
  const t2 = await state(m);
  await touch('touchEnd');
  check(t2.player.y < t1.player.y - 40, 'touch drag up moves player up');
  await m.screenshot({ path: '/tmp/arena-mobile-play.png' });
  await waitFor(m, () => window.game.getState().screen === 'shop', 60000);
  await sleep(600);
  check(await noScroll(), '360x640 shop has no page scrollbars');
  const shopFits = await m.evaluate(() => {
    const b = document.getElementById('btn-continue').getBoundingClientRect();
    return b.bottom <= window.innerHeight && b.top >= 0;
  });
  check(shopFits, 'continue button visible on 360x640');
  await m.screenshot({ path: '/tmp/arena-mobile-shop.png' });
  await m.tap('#btn-continue');
  s = await state(m);
  check(s.screen === 'playing' && s.wave === 2, 'tap continue starts wave 2');

  // Resize to landscape and desktop sizes without scrollbars.
  for (const [w, h] of [[640, 360], [1920, 1080], [800, 600]]) {
    await m.setViewportSize({ width: w, height: h });
    await sleep(150);
    const dims = await m.evaluate(() => {
      const c = document.getElementById('game');
      return { cw: c.clientWidth, ch: c.clientHeight, iw: innerWidth, ih: innerHeight };
    });
    check(dims.cw === dims.iw && dims.ch === dims.ih && await noScroll(), `canvas fills ${w}x${h} without scrollbars`);
  }
  await ctx4.close();

  check(errors.length === 0, 'no page errors / network requests' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll browser checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
