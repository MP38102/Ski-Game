'use strict';
// Gipfelsturm – shared helpers. Everything lives on the global GS namespace so
// the game also runs from file:// (native wrapper) without a module loader.
window.GS = window.GS || {};

(function (GS) {
  const TAU = Math.PI * 2;
  GS.TAU = TAU;
  GS.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  GS.lerp = (a, b, t) => a + (b - a) * t;
  GS.invLerp = (a, b, v) => GS.clamp((v - a) / (b - a), 0, 1);
  GS.smooth = (a, b, v) => {
    const t = GS.clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  GS.wrapAngle = (a) => {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  };
  GS.angleTo = (from, to) => GS.wrapAngle(to - from);
  GS.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
  GS.dist2 = (ax, az, bx, bz) => {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  };

  // Deterministic PRNG (mulberry32).
  GS.rng = (seed) => {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  GS.hash2 = (x, y, seed) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Seeded 2D gradient noise (Perlin) with fbm and ridged variants.
  class Noise {
    constructor(seed) {
      const r = GS.rng(seed);
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = (r() * (i + 1)) | 0;
        const t = p[i]; p[i] = p[j]; p[j] = t;
      }
      this.perm = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
      this.gx = new Float32Array(256);
      this.gy = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const a = r() * TAU;
        this.gx[i] = Math.cos(a);
        this.gy[i] = Math.sin(a);
      }
    }

    n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const P = this.perm, gx = this.gx, gy = this.gy;
      const a = P[P[X] + Y], b = P[P[X + 1] + Y], c = P[P[X] + Y + 1], d = P[P[X + 1] + Y + 1];
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
      const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
      const n00 = gx[a] * xf + gy[a] * yf;
      const n10 = gx[b] * (xf - 1) + gy[b] * yf;
      const n01 = gx[c] * xf + gy[c] * (yf - 1);
      const n11 = gx[d] * (xf - 1) + gy[d] * (yf - 1);
      const x1 = n00 + (n10 - n00) * u;
      const x2 = n01 + (n11 - n01) * u;
      return (x1 + (x2 - x1) * v) * 1.41;
    }

    fbm(x, y, oct, gain, lac) {
      gain = gain || 0.5;
      lac = lac || 2.03;
      let s = 0, amp = 1, norm = 0;
      for (let i = 0; i < oct; i++) {
        s += this.n2(x, y) * amp;
        norm += amp;
        amp *= gain;
        x = x * lac + 17.3;
        y = y * lac - 9.1;
      }
      return s / norm;
    }

    ridged(x, y, oct) {
      let s = 0, amp = 1, norm = 0, prev = 1;
      for (let i = 0; i < oct; i++) {
        let n = 1 - Math.abs(this.n2(x, y));
        n *= n;
        s += n * amp * prev;
        prev = n;
        norm += amp;
        amp *= 0.5;
        x = x * 2.01 + 5.2;
        y = y * 2.01 - 3.7;
      }
      return s / norm;
    }
  }
  GS.Noise = Noise;

  GS.pick = (r, arr) => arr[(r() * arr.length) | 0];

  GS.hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  GS.mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  GS.rgbCss = (c, a) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a == null ? 1 : a})`;

  // ---------- Persistence --------------------------------------------------
  const PREFIX = 'gipfelsturm.';
  GS.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(PREFIX + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(PREFIX + k, JSON.stringify(v));
      } catch (e) { /* private mode or quota – ignore */ }
    },
    remove(k) {
      try {
        localStorage.removeItem(PREFIX + k);
      } catch (e) { /* ignore */ }
    },
  };

  GS.settings = Object.assign(
    {
      music: 0.7, sfx: 0.9, haptics: true, control: 'sides', quality: 'auto',
      lang: (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en',
      units: 'kmh', unlockAll: false, zen: false, timeOfDay: 'default', weather: 'auto', assist: true,
      zoom: 1, showSpeed: true, npcDensity: 1,
    },
    GS.store.get('settings', {})
  );
  GS.saveSettings = () => GS.store.set('settings', GS.settings);

  GS.haptic = (type) => {
    if (!GS.settings.haptics) return;
    try {
      const mh = window.webkit && window.webkit.messageHandlers;
      if (mh && mh.haptic) mh.haptic.postMessage(type);
      else if (navigator.vibrate) navigator.vibrate(type === 'heavy' ? 40 : type === 'success' ? [15, 40, 15] : 10);
    } catch (e) { /* no haptics */ }
  };

  // ---------- Formatting ---------------------------------------------------
  GS.fmtInt = (n) => {
    const s = String(Math.round(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, GS.settings.lang === 'de' ? '.' : ',');
  };
  GS.fmtTime = (t) => {
    if (!isFinite(t)) return '–';
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    const ss = s.toFixed(2).padStart(5, '0');
    return (m > 0 ? m + ':' + ss : s.toFixed(2)).replace('.', GS.settings.lang === 'de' ? ',' : '.');
  };
  GS.fmtSpeed = (ms) => {
    if (GS.settings.units === 'mph') return Math.round(ms * 2.23694) + ' mph';
    return Math.round(ms * 3.6) + ' km/h';
  };
  GS.fmtDist = (m) => {
    if (GS.settings.units === 'mph') return (m * 3.28084).toFixed(0) + ' ft';
    return m.toFixed(1).replace('.', GS.settings.lang === 'de' ? ',' : '.') + ' m';
  };

  GS.isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
})(window.GS);
