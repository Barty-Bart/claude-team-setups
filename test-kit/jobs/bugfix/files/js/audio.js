/*
 * audio.js — tiny WebAudio synth. Everything is optional: if audio is
 * blocked or unsupported every call is a silent no-op.
 */
(function (root) {
  'use strict';

  function createAudio(opts) {
    opts = opts || {};
    let ctx = null;
    let master = null;
    let noiseBuf = null;
    let muted = !!opts.muted;
    const lastPlayed = {};

    function ensure() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
      }
      try {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.32;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch (e) {
        ctx = null;
      }
      return ctx;
    }

    function ready() {
      return ctx && ctx.state === 'running' && !muted;
    }

    function throttle(name, ms) {
      const now = performance.now();
      if (lastPlayed[name] && now - lastPlayed[name] < ms) return false;
      lastPlayed[name] = now;
      return true;
    }

    function tone(type, f0, f1, dur, vol, delay) {
      try {
        const t = ctx.currentTime + (delay || 0);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + dur + 0.02);
      } catch (e) { /* ignore */ }
    }

    function noise(dur, vol, freq, delay) {
      try {
        const t = ctx.currentTime + (delay || 0);
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(freq, t);
        f.frequency.exponentialRampToValueAtTime(80, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start(t);
        src.stop(t + dur + 0.02);
      } catch (e) { /* ignore */ }
    }

    const sounds = {
      shoot() { if (throttle('shoot', 70)) tone('square', 880, 440, 0.06, 0.05); },
      enemyHit() { if (throttle('hit', 40)) tone('triangle', 300, 160, 0.06, 0.08); },
      enemyDeath(ev) {
        if (!throttle('death', 45)) return;
        const big = ev && ev.enemyType === 'tank';
        noise(big ? 0.4 : 0.18, big ? 0.35 : 0.2, big ? 1200 : 2400);
        tone('sawtooth', big ? 180 : 320, 50, big ? 0.35 : 0.15, 0.06);
      },
      coin() { if (throttle('coin', 60)) { tone('sine', 1200, 1500, 0.06, 0.05); } },
      playerHit() { if (throttle('phit', 120)) { noise(0.25, 0.4, 900); tone('sawtooth', 220, 70, 0.25, 0.12); } },
      enemyShoot() { if (throttle('eshoot', 80)) tone('sine', 520, 260, 0.12, 0.05); },
      dash() { if (throttle('dash', 100)) noise(0.2, 0.12, 3000); },
      spawn() { if (throttle('spawn', 150)) tone('sine', 140, 260, 0.15, 0.03); },
      waveStart() {
        tone('triangle', 330, 330, 0.12, 0.12);
        tone('triangle', 440, 440, 0.12, 0.12, 0.12);
        tone('triangle', 660, 660, 0.2, 0.12, 0.24);
      },
      waveClear() {
        [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.18, 0.12, i * 0.09));
      },
      buy() { tone('square', 660, 990, 0.1, 0.07); tone('sine', 1320, 1320, 0.12, 0.05, 0.06); },
      buyFail() { tone('square', 160, 120, 0.15, 0.06); },
      gameOver() {
        noise(0.8, 0.5, 1500);
        [392, 311, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.3, 0.08, 0.15 + i * 0.22));
      },
      click() { tone('sine', 700, 900, 0.05, 0.05); },
    };

    return {
      /** Call from a user gesture to unlock audio. */
      unlock() { ensure(); },
      play(name, ev) {
        if (!ready()) return;
        const fn = sounds[name];
        if (fn) fn(ev);
      },
      isMuted() { return muted; },
      setMuted(m) {
        muted = !!m;
        if (master) {
          try { master.gain.value = muted ? 0 : 0.32; } catch (e) { /* ignore */ }
        }
      },
    };
  }

  const Audio = { createAudio };
  (root.AS = root.AS || {}).Audio = Audio;
})(typeof globalThis !== 'undefined' ? globalThis : this);
