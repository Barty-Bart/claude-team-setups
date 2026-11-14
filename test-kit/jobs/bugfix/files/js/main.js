/*
 * main.js — bootstraps the game: wires input, UI, audio and rendering
 * around the simulation and runs the frame loop. Exposes window.game.
 */
(function (root) {
  'use strict';

  const { Config, State, World, Input, Fx, Render, UI } = root.AS;
  const AudioMod = root.AS.Audio;

  // Storage may throw on file:// or in private modes; treat it as optional.
  let storage = null;
  try {
    storage = root.localStorage;
    storage.getItem('__probe__');
  } catch (e) {
    storage = null;
  }

  const params = State.parseParams(root.location ? root.location.search : '');

  function freshGame() {
    return State.createGame({
      highScore: State.loadHighScore(storage),
      startWave: params.startWave,
      god: params.god,
    });
  }

  let game = freshGame();
  let savedHighScore = game.highScore;

  const canvas = document.getElementById('game');
  const renderer = Render.createRenderer(canvas);
  const fx = Fx.createFx();
  const input = Input.createInput();

  let muted = false;
  try { muted = storage && storage.getItem(Config.STORAGE_KEYS.muted) === '1'; } catch (e) { /* ignore */ }
  const audio = AudioMod.createAudio({ muted });

  const ui = UI.createUI({
    onStart: startGame,
    onRestart: startGame,
    onTitle: toTitle,
    onContinue: continueWave,
    onBuy: buy,
    onToggleMute: toggleMute,
  });
  ui.setMuted(muted);

  let shownScreen = null;

  function persistHighScore() {
    if (game.highScore > savedHighScore) {
      if (State.saveHighScore(storage, game.highScore)) savedHighScore = game.highScore;
    }
  }

  function syncScreen() {
    if (game.screen === shownScreen) return;
    shownScreen = game.screen;
    if (game.screen === 'shop' || game.screen === 'gameover') persistHighScore();
    ui.showScreen(game.screen, game);
  }

  // Actions ---------------------------------------------------------------

  function startGame() {
    if (game.screen !== 'title' && game.screen !== 'gameover') return;
    audio.unlock();
    audio.play('click');
    persistHighScore();
    World.newGame(game);
    fx.clear();
    input.reset();
    renderer.resetCamera();
    drainEvents();
    syncScreen();
  }

  function toTitle() {
    if (game.screen !== 'gameover') return;
    audio.unlock();
    persistHighScore();
    const best = Math.max(game.highScore, savedHighScore);
    game = freshGame();
    game.highScore = best;
    fx.clear();
    syncScreen();
  }

  function continueWave() {
    if (game.screen !== 'shop') return;
    audio.unlock();
    World.continueToNextWave(game);
    input.reset();
    drainEvents();
    syncScreen();
  }

  function buy(id) {
    audio.unlock();
    const res = World.buy(game, id);
    drainEvents();
    ui.refreshShop(game, res.ok ? id : null);
  }

  function toggleMute() {
    audio.unlock();
    muted = !muted;
    audio.setMuted(muted);
    ui.setMuted(muted);
    try { if (storage) storage.setItem(Config.STORAGE_KEYS.muted, muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  // Keyboard --------------------------------------------------------------

  function onKey(e) {
    audio.unlock();
    const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (e.code === 'KeyM' && !e.repeat) {
      toggleMute();
      return;
    }
    if (game.screen === 'title' || game.screen === 'gameover') {
      if (isEnter) {
        e.preventDefault(); // do not also "click" a focused button
        if (!e.repeat) startGame();
      }
    } else if (game.screen === 'shop') {
      if (isEnter) {
        e.preventDefault();
        if (!e.repeat) continueWave();
        return;
      }
    }
    // Shop hotkeys: 1-9 buy the matching upgrade.
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '') || /^([1-9])$/.exec(e.key || '');
    if (m && game.screen !== 'title' && game.screen !== 'gameover') {
      e.preventDefault();
      if (e.repeat) return;
      const u = root.AS.Shop.UPGRADE_LIST[Number(m[1]) - 1];
      if (u) buy(u.id);
    }
  }

  input.attach(canvas, onKey);
  canvas.addEventListener('pointerdown', () => audio.unlock());

  // Frame loop ------------------------------------------------------------

  function drainEvents() {
    const evs = game.events;
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      fx.handle(ev);
      audio.play(ev.type, ev);
      if (ev.type === 'enemyDeath') audio.play('coin');
    }
    evs.length = 0;
  }

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, Config.MAX_FRAME_DT);

    World.step(game, dt, input.getMove());
    drainEvents();
    syncScreen();
    fx.update(dt);
    renderer.draw(game, fx, input, dt);
    if (game.screen === 'playing') ui.updateHud(game);
    root.requestAnimationFrame(frame);
  }

  function onResize() {
    renderer.resize();
  }
  root.addEventListener('resize', onResize);
  if (root.visualViewport) root.visualViewport.addEventListener('resize', onResize);
  root.addEventListener('orientationchange', onResize);
  root.addEventListener('pagehide', persistHighScore);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persistHighScore();
  });

  // QA interface ----------------------------------------------------------
  root.game = {
    getState() {
      return State.snapshot(game);
    },
  };

  syncScreen();
  root.requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : this);
