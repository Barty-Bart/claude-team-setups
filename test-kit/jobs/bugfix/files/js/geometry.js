/*
 * geometry.js — small pure math helpers (vectors, circles, arena bounds, RNG).
 */
(function (root) {
  'use strict';

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function dist2(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return dx * dx + dy * dy;
  }

  function dist(ax, ay, bx, by) {
    return Math.sqrt(dist2(ax, ay, bx, by));
  }

  /** Unit vector of (x, y); the zero vector stays zero. */
  function normalize(x, y) {
    const len = Math.sqrt(x * x + y * y);
    if (len === 0) return { x: 0, y: 0, len: 0 };
    return { x: x / len, y: y / len, len };
  }

  /** True when two circles {x, y, radius} overlap (touching counts). */
  function circlesOverlap(a, b) {
    const r = a.radius + b.radius;
    return dist2(a.x, a.y, b.x, b.y) <= r * r;
  }

  /** Clamp a circle's centre so the whole circle stays inside the arena. */
  function clampToArena(x, y, radius, arena) {
    const r = Math.min(radius, arena.width / 2, arena.height / 2);
    return {
      x: clamp(x, r, arena.width - r),
      y: clamp(y, r, arena.height - r),
    };
  }

  function isInsideArena(x, y, arena) {
    return x >= 0 && y >= 0 && x <= arena.width && y <= arena.height;
  }

  /** Nearest item of `list` (objects with x, y) to the point, or null. */
  function nearest(x, y, list, filter) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (filter && !filter(e)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /**
   * Push needed to separate two overlapping circles, split by mass.
   * Returns null when they do not overlap.
   */
  function separation(a, b, massA, massB) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const r = a.radius + b.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    let d = Math.sqrt(d2);
    let nx, ny;
    if (d < 1e-6) {
      nx = 1;
      ny = 0;
      d = 0;
    } else {
      nx = dx / d;
      ny = dy / d;
    }
    const overlap = r - d;
    const total = massA + massB;
    const shareA = massB / total;
    const shareB = massA / total;
    return {
      ax: -nx * overlap * shareA,
      ay: -ny * overlap * shareA,
      bx: nx * overlap * shareB,
      by: ny * overlap * shareB,
    };
  }

  /** Deterministic PRNG (mulberry32). Returns a function giving [0, 1). */
  function createRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const Geometry = {
    clamp, dist2, dist, normalize, circlesOverlap, clampToArena,
    isInsideArena, nearest, separation, createRng,
  };

  if (typeof module === 'object' && module.exports) module.exports = Geometry;
  else (root.AS = root.AS || {}).Geometry = Geometry;
})(typeof globalThis !== 'undefined' ? globalThis : this);
