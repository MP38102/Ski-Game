'use strict';
// Yeti Rush – small shared helpers. Everything lives on the global YR namespace
// so the game runs from file:// (native iPad wrapper) without module loading.
window.YR = window.YR || {};

(function (YR) {
  YR.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  YR.lerp = (a, b, t) => a + (b - a) * t;
  YR.rand = (a, b) => a + Math.random() * (b - a);
  YR.pick = (arr) => arr[(Math.random() * arr.length) | 0];
  YR.TAU = Math.PI * 2;

  // Deterministic hash for world cells, so terrain is stable while scrolling.
  YR.hash3 = (x, y, seed) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return h >>> 0;
  };

  YR.rng = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  YR.weighted = (r, table) => {
    let total = 0;
    for (const k in table) total += table[k];
    let v = r * total;
    for (const k in table) {
      v -= table[k];
      if (v <= 0) return k;
    }
    return Object.keys(table)[0];
  };

  YR.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('yetirush.' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('yetirush.' + k, JSON.stringify(v));
      } catch (e) { /* private mode – ignore */ }
    },
  };

  YR.settings = Object.assign(
    { music: true, sfx: true, haptics: true, control: 'touch' },
    YR.store.get('settings', {})
  );
  YR.saveSettings = () => YR.store.set('settings', YR.settings);

  // Haptics: native bridge in the iPad app, vibrate() elsewhere.
  YR.haptic = (type) => {
    if (!YR.settings.haptics) return;
    try {
      const mh = window.webkit && window.webkit.messageHandlers;
      if (mh && mh.haptic) mh.haptic.postMessage(type);
      else if (navigator.vibrate) navigator.vibrate(type === 'heavy' ? 40 : type === 'success' ? [15, 40, 15] : 12);
    } catch (e) { /* no haptics available */ }
  };

  YR.isNativeApp = () => !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.haptic);
})(window.YR);
