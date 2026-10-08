'use strict';
// 2D illustrations generated in code: mountain postcards for the resort
// picker, the gear preview figure, challenge glyphs and medals.
(function (GS) {
  const Art = {};

  if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
    };
  }

  const SKY = {
    day: ['#5aa9ff', '#cfe8ff'], morning: ['#7fa8e8', '#ffd6b3'], evening: ['#5b4a9a', '#ff9f6b'], night: ['#0b1430', '#2a3f78'], dusk: ['#3a2a78', '#c08bff'],
  };

  Art.mountainCard = (canvas, def) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth || 280, H = canvas.clientHeight || 170;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const h = def.hour;
    const kind = h >= 20.5 || h < 6 ? 'night' : h >= 19 ? 'dusk' : h >= 17 ? 'evening' : h < 9 ? 'morning' : 'day';
    const sky = SKY[kind];
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, sky[0]);
    grd.addColorStop(1, sky[1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const r = GS.rng(def.seed);
    // stars / aurora
    if (kind === 'night' || kind === 'dusk') {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 40; i++) g.fillRect(r() * W, r() * H * 0.5, 1.2, 1.2);
    }
    if (def.theme.aurora) {
      for (let k = 0; k < 3; k++) {
        const ag = g.createLinearGradient(0, 10, 0, 90);
        ag.addColorStop(0, 'rgba(60,255,170,0)');
        ag.addColorStop(0.5, k === 1 ? 'rgba(150,90,255,0.35)' : 'rgba(60,255,170,0.45)');
        ag.addColorStop(1, 'rgba(60,255,170,0)');
        g.fillStyle = ag;
        g.beginPath();
        g.moveTo(0, 30 + k * 12);
        for (let x = 0; x <= W; x += 10) g.lineTo(x, 30 + k * 12 + Math.sin(x / 40 + k) * 14);
        g.lineTo(W, 100);
        g.lineTo(0, 100);
        g.fill();
      }
    }
    // sun / moon
    const sx = W * (0.2 + r() * 0.6), sy = H * (kind === 'evening' ? 0.42 : 0.22);
    g.fillStyle = kind === 'night' ? '#f4f1de' : kind === 'evening' ? '#ffcf7a' : '#fff6d6';
    g.globalAlpha = 0.95;
    g.beginPath();
    g.arc(sx, sy, kind === 'night' ? 10 : 15, 0, GS.TAU);
    g.fill();
    g.globalAlpha = 1;
    // mountain layers
    const N = new GS.Noise(def.seed);
    const rock = def.theme.rock;
    const layers = [
      { base: 0.55, amp: 0.38, col: GS.rgbCss(GS.mixRgb(GS.hexToRgb(sky[1]), [0.75, 0.8, 0.9], 0.5)), snow: 0.75, f: 1.3 },
      { base: 0.68, amp: 0.36, col: GS.rgbCss(GS.mixRgb(GS.hexToRgb(rock), [0.85, 0.88, 0.95], 0.35)), snow: 0.6, f: 2.1 },
      { base: 0.85, amp: 0.22, col: '#f4f8fd', snow: 1, f: 3 },
    ];
    layers.forEach((L, li) => {
      const pts = [];
      for (let x = 0; x <= W; x += 4) {
        const t = x / W;
        const peak = Math.exp(-Math.pow((t - (0.35 + li * 0.2)) * 2.4, 2));
        const y = H * (L.base - L.amp * (0.4 * peak + 0.6 * (0.5 + 0.5 * N.ridged(t * L.f * 3 + li * 7, li * 3.1, 4))));
        pts.push([x, y]);
      }
      g.fillStyle = L.col;
      g.beginPath();
      g.moveTo(0, H);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(W, H);
      g.fill();
      if (L.snow < 1) {
        g.save();
        g.clip();
        g.fillStyle = 'rgba(255,255,255,0.88)';
        g.beginPath();
        g.moveTo(0, 0);
        for (const [x, y] of pts) g.lineTo(x, y + 8 + (Math.sin(x / 9) + 1) * 5);
        g.lineTo(W, 0);
        g.fill();
        g.restore();
      }
    });
    // foreground trees by theme
    const trees = Object.keys(def.theme.trees || { pine: 1 });
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = H * (0.82 + r() * 0.16), s = 6 + r() * 10;
      const kind = trees[(r() * trees.length) | 0];
      if (kind === 'juhyo') {
        g.fillStyle = '#e8eef6';
        g.beginPath(); g.ellipse(x, y - s, s * 0.6, s * 1.1, 0, 0, GS.TAU); g.fill();
      } else if (kind === 'crystal') {
        g.fillStyle = i % 2 ? '#a98bff' : '#7fe8ff';
        g.beginPath(); g.moveTo(x, y - s * 1.8); g.lineTo(x + s * 0.35, y); g.lineTo(x - s * 0.35, y); g.fill();
      } else if (kind === 'dead') {
        g.strokeStyle = '#2e2a29'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 1.5); g.moveTo(x, y - s); g.lineTo(x + s * 0.4, y - s * 1.4); g.stroke();
      } else if (kind === 'shrub') {
        g.fillStyle = '#4d6b44';
        g.beginPath(); g.ellipse(x, y - s * 0.3, s * 0.6, s * 0.4, 0, 0, GS.TAU); g.fill();
      } else {
        g.fillStyle = (def.theme.pine || ['#1f5a44'])[i % 2];
        g.beginPath(); g.moveTo(x, y - s * 1.8); g.lineTo(x + s * 0.55, y); g.lineTo(x - s * 0.55, y); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath(); g.moveTo(x, y - s * 1.8); g.lineTo(x + s * 0.22, y - s * 1.1); g.lineTo(x - s * 0.22, y - s * 1.1); g.fill();
      }
    }
    // theme accents
    const deco = def.theme.deco;
    if (deco === 'japan') {
      const x = W * 0.78, y = H * 0.9;
      g.fillStyle = '#c8372d';
      g.fillRect(x - 14, y - 26, 4, 26); g.fillRect(x + 10, y - 26, 4, 26);
      g.fillRect(x - 20, y - 30, 40, 4); g.fillRect(x - 15, y - 22, 30, 3);
    }
    if (deco === 'volcano') {
      g.fillStyle = 'rgba(80,70,70,0.35)';
      for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(W * 0.36 + k * 6, H * 0.12 - k * 5, 8 + k * 3, 0, GS.TAU); g.fill(); }
      g.fillStyle = 'rgba(255,90,20,0.6)';
      g.fillRect(W * 0.34, H * 0.2, 10, 3);
    }
    if (deco === 'himalaya') {
      const cols = ['#2e6fd8', '#f4f1de', '#d62828', '#2a9d4f', '#ffd23f'];
      for (let k = 0; k < 12; k++) { g.fillStyle = cols[k % 5]; g.fillRect(W * 0.08 + k * 10, H * 0.72 + Math.sin(k / 3) * 4, 7, 9); }
    }
    if (deco === 'arena') {
      g.strokeStyle = '#3a86ff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(W * 0.15, H * 0.45); g.quadraticCurveTo(W * 0.22, H * 0.75, W * 0.32, H * 0.78); g.stroke();
    }
  };

  // Front view of the rider with the equipped gear.
  Art.gearPreview = (canvas, gear, board) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth || 200, H = canvas.clientHeight || 260;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const cx = W / 2, s = Math.min(W / 200, H / 260);
    g.save();
    g.translate(cx, H * 0.06);
    g.scale(s, s);
    const shadow = 'rgba(16,38,63,0.18)';
    g.fillStyle = shadow;
    g.beginPath(); g.ellipse(0, 236, 80, 10, 0, 0, GS.TAU); g.fill();
    const rr = (x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    // skis / board
    if (board) rr(-78, 222, 156, 14, 7, gear.board);
    else { rr(-44, 150, 14, 86, 6, gear.skis); rr(30, 150, 14, 86, 6, gear.skis); }
    // legs
    rr(-36, 128, 28, 80, 12, gear.pants);
    rr(8, 128, 28, 80, 12, gear.pants);
    rr(-40, 196, 34, 24, 6, '#2b2f36');
    rr(6, 196, 34, 24, 6, '#2b2f36');
    // extras behind
    if (gear.extra === 'cape') { g.fillStyle = gear.extraColor; g.beginPath(); g.moveTo(-40, 62); g.lineTo(40, 62); g.lineTo(60, 190); g.lineTo(-60, 190); g.fill(); }
    if (gear.extra === 'backpack') rr(-34, 60, 68, 70, 12, gear.extraColor);
    // torso
    rr(-44, 56, 88, 86, 22, gear.jacket);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(-2, 62, 4, 76);
    // arms
    rr(-64, 62, 22, 70, 11, gear.jacket);
    rr(42, 62, 22, 70, 11, gear.jacket);
    g.fillStyle = gear.gloves;
    g.beginPath(); g.arc(-53, 136, 11, 0, GS.TAU); g.arc(53, 136, 11, 0, GS.TAU); g.fill();
    if (!board) {
      g.strokeStyle = '#9aa4b1'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(-53, 136); g.lineTo(-70, 228); g.moveTo(53, 136); g.lineTo(70, 228); g.stroke();
    }
    if (gear.extra === 'scarf') { rr(-30, 50, 60, 14, 7, gear.extraColor); rr(14, 56, 12, 40, 6, gear.extraColor); }
    // head
    g.fillStyle = gear.skin || '#f1c7a5';
    g.beginPath(); g.arc(0, 30, 26, 0, GS.TAU); g.fill();
    if (gear.hat === 'beanie') {
      g.fillStyle = gear.helmet;
      g.beginPath(); g.arc(0, 26, 27, Math.PI, 0); g.fill();
      g.fillRect(-28, 20, 56, 9);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -4, 8, 0, GS.TAU); g.fill();
    } else if (gear.hat === 'cap') {
      g.fillStyle = gear.helmet;
      g.beginPath(); g.arc(0, 26, 27, Math.PI, 0); g.fill();
      rr(-6, 18, 40, 7, 3, gear.helmet);
    } else {
      g.fillStyle = gear.helmet;
      g.beginPath(); g.arc(0, 28, 30, Math.PI * 1.02, -0.02 * Math.PI); g.lineTo(28, 34); g.lineTo(-28, 34); g.fill();
    }
    rr(-24, 26, 48, 15, 7, gear.goggles);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-18, 29, 14, 3);
    g.restore();
  };

  const GLYPH = {
    slalom: 'S', giant: 'RS', superg: 'SG', downhill: 'A', night: '☾', fog: '≋', race: '⚑', duel: '⚔', bigair: 'BA', slopestyle: 'SS', freestyle: '★',
    collect: '✦', speed: '»', skijump: 'J', avalanche: '⚠', treetap: '🌲', freeride: 'FR', paraglide: '◎', precision: '◉', airtime: '↑',
  };
  Art.typeGlyph = (t) => GLYPH[t] || '?';

  Art.medalSvg = (tier, size) => {
    const c = tier === 3 ? ['#ffd23f', '#e0a800'] : tier === 2 ? ['#e3e8ef', '#9aa5b4'] : tier === 1 ? ['#e09a5c', '#a45a22'] : ['#d5dbe3', '#b3bcc8'];
    size = size || 40;
    return `<svg viewBox="0 0 40 48" width="${size}" height="${size * 1.2}" aria-hidden="true"><path d="M10 0h8l4 12h-8z" fill="#2f6feb"/><path d="M30 0h-8l-4 12h8z" fill="#e63946"/>` +
      `<circle cx="20" cy="30" r="16" fill="${c[1]}"/><circle cx="20" cy="30" r="13" fill="${c[0]}"/>` +
      (tier ? `<path d="M20 22l2.6 5.4 5.9.8-4.3 4.1 1 5.8L20 35.3 14.8 38l1-5.8-4.3-4.1 5.9-.8z" fill="${c[1]}" opacity=".85"/>` : '') + '</svg>';
  };

  GS.Art = Art;
})(window.GS);
