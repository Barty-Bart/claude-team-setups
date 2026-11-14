/*
 * render.js — draws the world on the canvas. Reads game state and fx; never
 * changes game rules.
 */
(function (root) {
  'use strict';

  const Config = root.AS.Config;
  const Geometry = root.AS.Geometry;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const TAU = Math.PI * 2;

  function shade(hex, f) {
    // f < 0 darkens, f > 0 lightens.
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    const t = f < 0 ? 0 : 255;
    const p = Math.abs(f);
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  const COLORS = {};
  for (const type in Config.ENEMIES) {
    const c = Config.ENEMIES[type].color;
    COLORS[type] = { fill: c, dark: shade(c, -0.45), light: shade(c, 0.5) };
  }

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const view = { W: 1, H: 1, dpr: 1, scale: 1 };
    const cam = { x: Config.ARENA.width / 2, y: Config.ARENA.height / 2, snapped: false };

    function resize() {
      const W = Math.max(1, canvas.clientWidth || window.innerWidth);
      const H = Math.max(1, canvas.clientHeight || window.innerHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      view.W = W;
      view.H = H;
      view.dpr = dpr;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      view.scale = Geometry.clamp(Math.sqrt((W * H) / Config.VIEW_AREA), Config.MIN_SCALE, Config.MAX_SCALE);
    }

    function cameraAxis(target, viewSize, arenaSize) {
      const m = Config.CAMERA_MARGIN;
      if (viewSize >= arenaSize + 2 * m) return arenaSize / 2;
      return Geometry.clamp(target, viewSize / 2 - m, arenaSize - viewSize / 2 + m);
    }

    function updateCamera(game, fx, dt) {
      let tx, ty;
      if (game.screen === 'title') {
        const t = fx.time * 0.12;
        tx = game.arena.width / 2 + Math.cos(t) * 260;
        ty = game.arena.height / 2 + Math.sin(t * 1.3) * 200;
      } else {
        tx = game.player.x;
        ty = game.player.y;
      }
      const vw = view.W / view.scale;
      const vh = view.H / view.scale;
      tx = cameraAxis(tx, vw, game.arena.width);
      ty = cameraAxis(ty, vh, game.arena.height);
      if (!cam.snapped) {
        cam.x = tx;
        cam.y = ty;
        cam.snapped = true;
      } else {
        const k = 1 - Math.exp(-10 * dt);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
      }
    }

    // ------------------------------------------------------------ world ---

    function drawArena(game) {
      const A = game.arena;
      ctx.fillStyle = '#0d1322';
      ctx.fillRect(0, 0, A.width, A.height);
      ctx.beginPath();
      for (let x = 75; x < A.width; x += 75) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, A.height);
      }
      for (let y = 75; y < A.height; y += 75) {
        ctx.moveTo(0, y);
        ctx.lineTo(A.width, y);
      }
      ctx.strokeStyle = 'rgba(120,150,255,0.06)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(80,110,230,0.35)';
      ctx.lineWidth = 14;
      ctx.strokeRect(-7, -7, A.width + 14, A.height + 14);
      ctx.strokeStyle = '#6d8cff';
      ctx.lineWidth = 3;
      ctx.strokeRect(-1.5, -1.5, A.width + 3, A.height + 3);
    }

    function drawPending(game, time) {
      for (const ps of game.pendingSpawns) {
        const c = COLORS[ps.type];
        const prog = 1 - ps.timer / ps.total;
        const r = Config.ENEMIES[ps.type].radius;
        const pulse = 0.5 + 0.5 * Math.sin(time * 18);
        ctx.globalAlpha = 0.25 + 0.5 * prog;
        ctx.strokeStyle = c.fill;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, r + 14 * (1 - prog) + pulse * 2, 0, TAU);
        ctx.stroke();
        const s = r * 0.55;
        ctx.beginPath();
        ctx.moveTo(ps.x - s, ps.y - s);
        ctx.lineTo(ps.x + s, ps.y + s);
        ctx.moveTo(ps.x + s, ps.y - s);
        ctx.lineTo(ps.x - s, ps.y + s);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawRings(fx) {
      for (const r of fx.rings) {
        const t = 1 - r.life / r.max;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width * (1 - t * 0.6);
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * t, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function polygon(x, y, r, sides, rot) {
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * TAU;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }

    function drawEnemy(e, time) {
      const c = COLORS[e.type];
      const flash = e.flash > 0;
      const fill = flash ? '#ffffff' : c.fill;
      const r = e.radius;
      const pop = e.age < 0.15 ? 0.4 + (e.age / 0.15) * 0.6 : 1; // spawn pop-in
      const R = r * pop;
      let x = e.x;
      let y = e.y;
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.dark;
      ctx.fillStyle = fill;
      switch (e.type) {
        case 'chaser': {
          const a = e.angle;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * R * 1.3, y + Math.sin(a) * R * 1.3);
          ctx.lineTo(x + Math.cos(a + 2.4) * R, y + Math.sin(a + 2.4) * R);
          ctx.lineTo(x + Math.cos(a + Math.PI) * R * 0.45, y + Math.sin(a + Math.PI) * R * 0.45);
          ctx.lineTo(x + Math.cos(a - 2.4) * R, y + Math.sin(a - 2.4) * R);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'tank': {
          const rot = time * 0.6 + e.wobble;
          polygon(x, y, R, 6, rot);
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.stroke();
          polygon(x, y, R * 0.55, 6, -rot);
          ctx.fillStyle = flash ? '#ffffff' : c.dark;
          ctx.fill();
          break;
        }
        case 'shooter': {
          if (e.mode === 'aim') {
            const t = 1 - e.timer / e.stats.aimTime;
            ctx.strokeStyle = '#fff3c4';
            ctx.globalAlpha = 0.4 + 0.6 * t;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, R + 12 * (1 - t) + 4, 0, TAU);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = c.dark;
            ctx.lineWidth = 3;
          }
          polygon(x, y, R * 1.2, 4, e.age * 1.5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = flash ? '#ffffff' : '#3b2600';
          ctx.beginPath();
          ctx.arc(x + Math.cos(e.angle) * R * 0.3, y + Math.sin(e.angle) * R * 0.3, R * 0.38, 0, TAU);
          ctx.fill();
          break;
        }
        case 'charger': {
          const a = e.angle;
          if (e.mode === 'windup') {
            x += (Math.random() - 0.5) * 4;
            y += (Math.random() - 0.5) * 4;
            ctx.fillStyle = flash ? '#ffffff' : (Math.floor(time * 20) % 2 ? '#f7fee7' : c.fill);
            // Telegraph the dash direction.
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = c.light;
            ctx.lineWidth = R * 1.4;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * 160, y + Math.sin(a) * 160);
            ctx.stroke();
            ctx.restore();
            ctx.strokeStyle = c.dark;
            ctx.lineWidth = 3;
          } else if (e.mode === 'dash') {
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = c.fill;
            for (let i = 1; i <= 3; i++) {
              ctx.beginPath();
              ctx.arc(x - e.dashX * i * 14, y - e.dashY * i * 14, R * (1 - i * 0.2), 0, TAU);
              ctx.fill();
            }
            ctx.restore();
            ctx.fillStyle = fill;
          }
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * R * 1.4, y + Math.sin(a) * R * 1.4);
          ctx.lineTo(x + Math.cos(a + 1.9) * R, y + Math.sin(a + 1.9) * R);
          ctx.lineTo(x + Math.cos(a + Math.PI) * R * 0.9, y + Math.sin(a + Math.PI) * R * 0.9);
          ctx.lineTo(x + Math.cos(a - 1.9) * R, y + Math.sin(a - 1.9) * R);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        }
        default:
          ctx.beginPath();
          ctx.arc(x, y, R, 0, TAU);
          ctx.fill();
      }
      if (e.hp < e.maxHp && e.hp > 0) {
        const w = Math.max(24, r * 2);
        const bx = e.x - w / 2;
        const by = e.y - r - 12;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx - 1, by - 1, w + 2, 6);
        ctx.fillStyle = c.light;
        ctx.fillRect(bx, by, w * (e.hp / e.maxHp), 4);
      }
    }

    function drawEnemyBullets(game) {
      const list = game.enemyBullets;
      if (!list.length) return;
      ctx.fillStyle = 'rgba(255,120,40,0.35)';
      ctx.beginPath();
      for (const b of list) {
        ctx.moveTo(b.x + b.radius * 1.8, b.y);
        ctx.arc(b.x, b.y, b.radius * 1.8, 0, TAU);
      }
      ctx.fill();
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      for (const b of list) {
        ctx.moveTo(b.x + b.radius, b.y);
        ctx.arc(b.x, b.y, b.radius, 0, TAU);
      }
      ctx.fill();
      ctx.fillStyle = '#fff1d6';
      ctx.beginPath();
      for (const b of list) {
        ctx.moveTo(b.x + b.radius * 0.45, b.y);
        ctx.arc(b.x, b.y, b.radius * 0.45, 0, TAU);
      }
      ctx.fill();
    }

    function drawBullets(game) {
      const list = game.bullets;
      if (!list.length) return;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const b of list) {
        ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = 'rgba(94,200,255,0.45)';
      ctx.lineWidth = Config.PLAYER.bulletRadius * 2.2;
      ctx.stroke();
      ctx.strokeStyle = '#e8f7ff';
      ctx.lineWidth = Config.PLAYER.bulletRadius;
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    function drawPlayer(game, fx) {
      const p = game.player;
      if (!p.alive) return;
      if (p.invuln > 0 && Math.floor(fx.time * 24) % 2 === 0) ctx.globalAlpha = 0.45;
      const r = p.radius;
      // soft glow
      ctx.fillStyle = 'rgba(56,189,248,0.18)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.9, 0, TAU);
      ctx.fill();
      // barrel
      const a = p.aim;
      ctx.strokeStyle = '#cfefff';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a) * (r + 9), p.y + Math.sin(a) * (r + 9));
      ctx.stroke();
      ctx.lineCap = 'butt';
      if (fx.muzzle > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * (r + 11), p.y + Math.sin(a) * (r + 11), 6, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#0c4a6e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f0fbff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.42, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawParticles(fx) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of fx.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        const s = p.size;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawTexts(fx) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of fx.texts) {
        ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2);
        ctx.font = 'bold ' + t.size + 'px ' + FONT;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(t.str, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }

    // ----------------------------------------------------------- screen ---

    function drawIndicators(game, ox, oy) {
      if (game.screen !== 'playing') return;
      const s = view.scale;
      const W = view.W;
      const H = view.H;
      const pad = 16;
      for (const e of game.enemies) {
        const sx = e.x * s + ox;
        const sy = e.y * s + oy;
        if (sx >= -e.radius * s && sx <= W + e.radius * s && sy >= -e.radius * s && sy <= H + e.radius * s) continue;
        const dx = sx - W / 2;
        const dy = sy - H / 2;
        const k = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
        const ix = W / 2 + dx * k;
        const iy = H / 2 + dy * k;
        const a = Math.atan2(dy, dx);
        ctx.fillStyle = COLORS[e.type].fill;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(ix + Math.cos(a) * 9, iy + Math.sin(a) * 9);
        ctx.lineTo(ix + Math.cos(a + 2.5) * 7, iy + Math.sin(a + 2.5) * 7);
        ctx.lineTo(ix + Math.cos(a - 2.5) * 7, iy + Math.sin(a - 2.5) * 7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawJoystick(input, game) {
      const j = input && input.joy;
      if (!j || !j.active || game.screen !== 'playing') return;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(j.ox, j.oy, input.JOY_RADIUS, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(j.x, j.y, 24, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawVignette(game, fx) {
      const p = game.player;
      let a = fx.hurt * 0.55;
      if (game.screen === 'playing' && p.hp > 0 && p.hp / p.maxHp < 0.3) {
        a = Math.max(a, 0.18 + 0.12 * Math.sin(fx.time * 6));
      }
      if (a <= 0.01) return;
      const W = view.W;
      const H = view.H;
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(255,0,40,0)');
      g.addColorStop(1, 'rgba(255,0,40,' + a.toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    function drawBanner(fx, game) {
      const b = fx.banner;
      if (!b || game.screen === 'title') return;
      const t = b.t;
      const alpha = Math.min(1, t / 0.2, (b.dur - t) / 0.4);
      const W = view.W;
      const H = view.H;
      const size = Math.round(Geometry.clamp(Math.min(W, H) * 0.09, 28, 72));
      const y = game.screen === 'shop' ? H * 0.12 : H * 0.3;
      if (game.screen === 'shop') return; // the shop panel shows its own header
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 ' + size + 'px ' + FONT;
      ctx.lineWidth = Math.max(4, size / 8);
      ctx.strokeStyle = 'rgba(5,8,20,0.85)';
      const scaleIn = 1 + Math.max(0, 0.25 - t) * 1.2;
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.scale(scaleIn, scaleIn);
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.text, 0, 0);
      ctx.font = '600 ' + Math.round(size * 0.38) + 'px ' + FONT;
      ctx.lineWidth = 4;
      ctx.strokeText(b.sub, 0, size * 0.75);
      ctx.fillStyle = '#9fd8ff';
      ctx.fillText(b.sub, 0, size * 0.75);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function draw(game, fx, input, dt) {
      updateCamera(game, fx, dt);
      const s = view.scale;
      let shx = 0;
      let shy = 0;
      if (fx.shake > 0) {
        shx = (Math.random() - 0.5) * fx.shake;
        shy = (Math.random() - 0.5) * fx.shake;
      }
      const ox = view.W / 2 - cam.x * s + shx;
      const oy = view.H / 2 - cam.y * s + shy;
      const d = view.dpr;

      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.fillStyle = '#05070e';
      ctx.fillRect(0, 0, view.W, view.H);

      ctx.setTransform(d * s, 0, 0, d * s, d * ox, d * oy);
      drawArena(game);
      if (game.screen !== 'title') {
        drawPending(game, fx.time);
        drawRings(fx);
        drawEnemyBullets(game);
        for (let i = 0; i < game.enemies.length; i++) drawEnemy(game.enemies[i], fx.time);
        drawBullets(game);
        drawPlayer(game, fx);
        drawParticles(fx);
        drawTexts(fx);
      }

      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawIndicators(game, ox, oy);
      drawJoystick(input, game);
      drawVignette(game, fx);
      drawBanner(fx, game);
    }

    resize();
    return { resize, draw, view, cam, resetCamera() { cam.snapped = false; } };
  }

  const Render = { createRenderer };
  (root.AS = root.AS || {}).Render = Render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
