/*
 * input.js — keyboard and touch/mouse virtual joystick.
 *
 * keyVector() and dragVector() are pure and unit-tested; attach() wires the
 * DOM listeners in the browser.
 */
(function (root) {
  'use strict';

  const KEY_DIRS = {
    KeyW: [0, -1], ArrowUp: [0, -1],
    KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0],
    KeyD: [1, 0], ArrowRight: [1, 0],
  };

  // Fallback for browsers/keyboards that do not report `code`.
  const KEY_ALIASES = {
    w: 'KeyW', W: 'KeyW', a: 'KeyA', A: 'KeyA', s: 'KeyS', S: 'KeyS', d: 'KeyD', D: 'KeyD',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
  };

  /** Movement vector (length <= 1) from a set/array of held key codes. */
  function keyVector(keys) {
    let x = 0;
    let y = 0;
    const seen = {};
    for (const code of keys) {
      const d = KEY_DIRS[code];
      if (!d) continue;
      const tag = d[0] + ',' + d[1];
      if (seen[tag]) continue; // W and ArrowUp together are not double speed
      seen[tag] = true;
      x += d[0];
      y += d[1];
    }
    const len = Math.sqrt(x * x + y * y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  /**
   * Joystick vector from a drag offset in pixels. Below `deadzone` it is
   * zero; at `radius` or beyond it has length 1. Direction = drag direction.
   */
  function dragVector(dx, dy, radius, deadzone) {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len <= (deadzone || 0) || len === 0) return { x: 0, y: 0 };
    const mag = Math.min(1, (len - (deadzone || 0)) / Math.max(1, radius - (deadzone || 0)));
    return { x: (dx / len) * mag, y: (dy / len) * mag };
  }

  const JOY_RADIUS = 60; // CSS pixels
  const JOY_DEADZONE = 6;

  function createInput() {
    const keys = new Set();
    const joy = { active: false, pointerId: null, ox: 0, oy: 0, x: 0, y: 0 };
    let keyHandler = null;

    function codeOf(e) {
      if (e.code && KEY_DIRS[e.code]) return e.code;
      return KEY_ALIASES[e.key] || e.code || e.key;
    }

    function onKeyDown(e) {
      const code = codeOf(e);
      if (KEY_DIRS[code]) {
        keys.add(code);
        e.preventDefault();
      }
      if (keyHandler) keyHandler(e);
    }

    function onKeyUp(e) {
      keys.delete(codeOf(e));
    }

    function release() {
      keys.clear();
      joy.active = false;
      joy.pointerId = null;
    }

    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      joy.active = true;
      joy.pointerId = e.pointerId;
      joy.ox = joy.x = e.clientX;
      joy.oy = joy.y = e.clientY;
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!joy.active || e.pointerId !== joy.pointerId) return;
      joy.x = e.clientX;
      joy.y = e.clientY;
      // Floating stick: drag the origin along when the finger goes too far.
      const dx = joy.x - joy.ox;
      const dy = joy.y - joy.oy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > JOY_RADIUS) {
        joy.ox = joy.x - (dx / len) * JOY_RADIUS;
        joy.oy = joy.y - (dy / len) * JOY_RADIUS;
      }
      e.preventDefault();
    }

    function onPointerUp(e) {
      if (e.pointerId !== joy.pointerId) return;
      joy.active = false;
      joy.pointerId = null;
    }

    return {
      joy,
      JOY_RADIUS,
      attach(surface, onKey) {
        keyHandler = onKey;
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', release);
        document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
        surface.addEventListener('pointerdown', onPointerDown);
        surface.addEventListener('pointermove', onPointerMove);
        surface.addEventListener('pointerup', onPointerUp);
        surface.addEventListener('pointercancel', onPointerUp);
        surface.addEventListener('lostpointercapture', onPointerUp);
        surface.addEventListener('contextmenu', (e) => e.preventDefault());
      },
      /** Combined movement vector from keys and joystick. */
      getMove() {
        const k = keyVector(keys);
        if (joy.active) {
          const j = dragVector(joy.x - joy.ox, joy.y - joy.oy, JOY_RADIUS, JOY_DEADZONE);
          if (j.x !== 0 || j.y !== 0) return j;
        }
        return k;
      },
      reset: release,
    };
  }

  const Input = { keyVector, dragVector, createInput, KEY_DIRS };

  if (typeof module === 'object' && module.exports) module.exports = Input;
  else (root.AS = root.AS || {}).Input = Input;
})(typeof globalThis !== 'undefined' ? globalThis : this);
