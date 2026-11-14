/*
 * fx.js — purely cosmetic effects: particles, rings, floating text, screen
 * shake, damage flash and banners. Driven by game.events; never changes
 * game rules.
 */
(function (root) {
  'use strict';

  const MAX_PARTICLES = 900;
  const MAX_TEXTS = 40;

  function createFx() {
    const particles = [];
    let cursor = 0; // ring-buffer overwrite index once full
    const rings = [];
    const texts = [];
    const fx = {
      particles, rings, texts,
      shake: 0,
      hurt: 0, // red vignette 0..1
      banner: null, // { text, sub, t, dur }
      muzzle: 0,
      time: 0,
    };

    function addParticle(p) {
      if (particles.length < MAX_PARTICLES) particles.push(p);
      else {
        particles[cursor] = p;
        cursor = (cursor + 1) % MAX_PARTICLES;
      }
    }

    function burst(x, y, n, color, speed, life, size, angle, cone) {
      for (let i = 0; i < n; i++) {
        const a = angle == null ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * cone;
        const s = speed * (0.35 + Math.random() * 0.65);
        addParticle({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: life * (0.6 + Math.random() * 0.4),
          max: life,
          size: size * (0.6 + Math.random() * 0.6),
          color,
        });
      }
    }

    function ring(x, y, r0, r1, life, color, width) {
      rings.push({ x, y, r0, r1, life, max: life, color, width: width || 3 });
    }

    function text(x, y, str, color, size) {
      if (texts.length >= MAX_TEXTS) texts.shift();
      texts.push({ x, y, str, color, size: size || 16, life: 0.9, max: 0.9 });
    }

    fx.banner = null;

    fx.handle = function handle(ev) {
      switch (ev.type) {
        case 'shoot':
          fx.muzzle = 0.06;
          break;
        case 'enemyHit':
          burst(ev.x, ev.y, 4, '#ffffff', 220, 0.22, 2.5, ev.angle + Math.PI, 1.6);
          break;
        case 'enemyDeath': {
          const big = ev.enemyType === 'tank';
          burst(ev.x, ev.y, big ? 34 : 16, ev.color, big ? 320 : 260, big ? 0.8 : 0.55, big ? 5 : 3.5);
          burst(ev.x, ev.y, 6, '#ffffff', 180, 0.3, 2.5);
          ring(ev.x, ev.y, ev.radius * 0.6, ev.radius * (big ? 3.6 : 2.6), big ? 0.45 : 0.3, ev.color, big ? 5 : 3);
          text(ev.x, ev.y - ev.radius, '+' + ev.coins, '#ffd34d', big ? 20 : 15);
          if (big) fx.shake = Math.max(fx.shake, 6);
          break;
        }
        case 'playerHit':
          fx.shake = Math.max(fx.shake, 9);
          fx.hurt = 1;
          burst(ev.x, ev.y, 14, '#ff5470', 260, 0.45, 3);
          text(ev.x, ev.y - 26, '-' + Math.round(ev.amount), '#ff6b81', 18);
          break;
        case 'spawn':
          ring(ev.x, ev.y, 4, 34, 0.35, '#ffffff', 2);
          break;
        case 'wallHit':
          burst(ev.x, ev.y, 3, '#9fd8ff', 120, 0.2, 2);
          break;
        case 'waveStart':
          fx.banner = { text: 'WAVE ' + ev.wave, sub: ev.wave === 1 ? 'Survive!' : 'Get ready', t: 0, dur: 2.0 };
          break;
        case 'waveClear':
          fx.banner = { text: 'WAVE ' + ev.wave + ' CLEARED', sub: '+' + ev.coins + ' bonus coins', t: 0, dur: 2.2 };
          break;
        case 'gameOver':
          fx.shake = 18;
          fx.hurt = 1;
          burst(ev.x, ev.y, 60, '#5ec8ff', 420, 1.1, 5);
          burst(ev.x, ev.y, 30, '#ffffff', 300, 0.7, 3);
          ring(ev.x, ev.y, 10, 160, 0.7, '#5ec8ff', 6);
          fx.banner = null;
          break;
        case 'dash':
          burst(ev.x, ev.y, 6, '#d9f99d', 140, 0.3, 3);
          break;
        default:
          break;
      }
    };

    fx.update = function update(dt) {
      fx.time += dt;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue;
        }
        const drag = Math.exp(-4 * dt);
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (cursor >= particles.length) cursor = 0;
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].life -= dt;
        if (rings[i].life <= 0) rings.splice(i, 1);
      }
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        t.life -= dt;
        t.y -= 40 * dt;
        if (t.life <= 0) texts.splice(i, 1);
      }
      fx.shake = Math.max(0, fx.shake - dt * 40);
      fx.hurt = Math.max(0, fx.hurt - dt * 2.5);
      fx.muzzle = Math.max(0, fx.muzzle - dt);
      if (fx.banner) {
        fx.banner.t += dt;
        if (fx.banner.t >= fx.banner.dur) fx.banner = null;
      }
    };

    fx.clear = function clear() {
      particles.length = 0;
      rings.length = 0;
      texts.length = 0;
      cursor = 0;
      fx.shake = 0;
      fx.hurt = 0;
      fx.banner = null;
    };

    return fx;
  }

  const Fx = { createFx };
  (root.AS = root.AS || {}).Fx = Fx;
})(typeof globalThis !== 'undefined' ? globalThis : this);
