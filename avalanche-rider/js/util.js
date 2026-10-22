'use strict';
// Avalanche Rider – small shared helpers. Everything lives on the global AR
// namespace (classic scripts), so the build also runs from file:// without a
// module loader or bundler.
window.AR = window.AR || {};

(function (AR) {
  AR.TAU = Math.PI * 2;
  AR.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  AR.lerp = (a, b, t) => a + (b - a) * t;
  AR.smoothstep = (t) => {
    t = AR.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  // Frame-rate independent exponential approach towards a target.
  AR.approach = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);
  // Wrap an angle into (-PI, PI].
  AR.wrap = (a) => {
    a = (a + Math.PI) % AR.TAU;
    if (a < 0) a += AR.TAU;
    return a - Math.PI;
  };
  AR.posMod = (a, m) => ((a % m) + m) % m;

  // Seeded PRNG (mulberry32) so a run's mountain is reproducible from its seed.
  AR.rng = (seed) => {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.chance = (p) => next() < p;
    return next;
  };

  // Stable hash for decoration placement (trees, stars) independent of order.
  AR.hash = (n, seed) => {
    let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  AR.weighted = (r, table) => {
    let total = 0;
    for (const k in table) total += table[k];
    let v = r * total;
    for (const k in table) {
      v -= table[k];
      if (v <= 0) return k;
    }
    return Object.keys(table)[0];
  };

  AR.fmt = (n) => {
    try {
      return Math.round(n).toLocaleString(AR.lang === 'de' ? 'de-DE' : 'en-US');
    } catch (e) {
      return String(Math.round(n));
    }
  };

  AR.dayKey = (d) => {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  AR.params = new URLSearchParams(location.search);
})(window.AR);
