'use strict';
// All artwork is drawn procedurally with Canvas 2D paths. Static sprites are
// rendered once per zoom level into offscreen canvases; animated characters
// (skier, yeti, pickups) are drawn live every frame.
(function (YR) {
  const C = {
    snow: '#F4F8FC',
    snowShade: '#DCE7F2',
    shadow: 'rgba(38, 72, 120, 0.16)',
    pineA: '#1E6B50',
    pineB: '#2A8A62',
    pineDark: '#124534',
    trunk: '#6B4A2E',
    rockA: '#7C8898',
    rockB: '#5C6776',
    rockC: '#A3AEBB',
    orange: '#FF6B2C',
    orangeDark: '#D9491A',
    navy: '#1B3A5C',
    red: '#E63946',
    blue: '#2F6FEB',
    ice: '#BDE9FF',
    gold: '#FFC53D',
    wood: '#B7773F',
    woodDark: '#8A5325',
    yetiFur: '#F7FBFF',
    yetiShade: '#C8DAEE',
    yetiFace: '#6FB6E8',
  };

  const cache = new Map();
  let pxScale = 1;

  function setScale(s) {
    if (Math.abs(s - pxScale) > 1e-3) {
      pxScale = s;
      cache.clear();
    }
  }

  function sprite(key, w, h, ax, ay, drawFn) {
    let s = cache.get(key);
    if (!s) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w * pxScale));
      c.height = Math.max(1, Math.ceil(h * pxScale));
      const g = c.getContext('2d');
      g.scale(pxScale, pxScale);
      drawFn(g);
      s = { c, w, h, ax, ay };
      cache.set(key, s);
    }
    return s;
  }

  function blit(ctx, s, x, y) {
    ctx.drawImage(s.c, x - s.ax, y - s.ay, s.w, s.h);
  }

  function ellipse(g, x, y, rx, ry, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, YR.TAU);
    g.fill();
  }

  // ---------- Static sprites ----------------------------------------------

  function pine(k, v) {
    const w = 70 * k, h = 104 * k;
    return sprite('pine' + k + v, w, h, w / 2, h - 10 * k, (g) => {
      const cx = w / 2, base = h - 10 * k;
      ellipse(g, cx + 10 * k, base + 1 * k, 25 * k, 8 * k, C.shadow);
      g.fillStyle = C.trunk;
      g.fillRect(cx - 4 * k, base - 16 * k, 8 * k, 16 * k);
      const tiers = [
        { b: 12, t: 46, w: 30 },
        { b: 34, t: 68, w: 23 },
        { b: 55, t: 90, w: 15 },
      ];
      tiers.forEach((tr, i) => {
        const bot = base - tr.b * k, top = base - tr.t * k, tw = tr.w * k;
        g.fillStyle = i % 2 ? C.pineB : C.pineA;
        g.beginPath();
        g.moveTo(cx, top);
        g.lineTo(cx + tw, bot);
        g.quadraticCurveTo(cx, bot + 6 * k, cx - tw, bot);
        g.closePath();
        g.fill();
        g.fillStyle = C.pineDark;
        g.globalAlpha = 0.35;
        g.beginPath();
        g.moveTo(cx, top);
        g.lineTo(cx + tw, bot);
        g.quadraticCurveTo(cx + tw * 0.5, bot + 4 * k, cx + 2 * k, bot + 3 * k);
        g.closePath();
        g.fill();
        g.globalAlpha = 1;
        // Snow cap with scalloped edge
        const f = v === 1 ? 0.55 : 0.42;
        const sy = top + (bot - top) * f;
        const sx = tw * f;
        g.fillStyle = '#FFFFFF';
        g.beginPath();
        g.moveTo(cx, top - 1 * k);
        g.lineTo(cx + sx + 1 * k, sy);
        const n = 3;
        for (let j = 0; j < n; j++) {
          const x0 = cx + sx - (2 * sx * j) / n;
          const x1 = cx + sx - (2 * sx * (j + 1)) / n;
          g.quadraticCurveTo((x0 + x1) / 2, sy + 7 * k, x1, sy + (j === n - 1 ? 0 : 1 * k));
        }
        g.closePath();
        g.fill();
        // Snow lump on the tier edge
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        g.ellipse(cx - tw * 0.55, bot - 2 * k, 6 * k, 2.5 * k, -0.3, 0, YR.TAU);
        g.fill();
      });
    });
  }

  function bush(k) {
    const w = 50 * k, h = 40 * k;
    return sprite('bush' + k, w, h, w / 2, h - 8 * k, (g) => {
      const cx = w / 2, base = h - 8 * k;
      ellipse(g, cx + 6 * k, base, 20 * k, 6 * k, C.shadow);
      ellipse(g, cx - 8 * k, base - 8 * k, 11 * k, 9 * k, C.pineA);
      ellipse(g, cx + 8 * k, base - 8 * k, 11 * k, 9 * k, C.pineB);
      ellipse(g, cx, base - 15 * k, 12 * k, 10 * k, C.pineA);
      ellipse(g, cx - 2 * k, base - 20 * k, 10 * k, 5 * k, '#FFFFFF');
      ellipse(g, cx - 10 * k, base - 13 * k, 6 * k, 3 * k, '#FFFFFF');
    });
  }

  function rock(k, v) {
    const w = 62 * k, h = 46 * k;
    return sprite('rock' + k + v, w, h, w / 2, h - 10 * k, (g) => {
      const cx = w / 2, base = h - 10 * k;
      ellipse(g, cx + 6 * k, base + 1 * k, 26 * k, 8 * k, C.shadow);
      const r = YR.rng(v * 977 + 13);
      const pts = [];
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i / (n - 1)) * Math.PI;
        const rr = (0.75 + r() * 0.35);
        pts.push([cx + Math.cos(a) * 24 * k * rr, base + Math.sin(a) * 26 * k * rr]);
      }
      g.fillStyle = C.rockB;
      g.beginPath();
      g.moveTo(cx - 24 * k, base);
      pts.forEach((p) => g.lineTo(p[0], p[1]));
      g.lineTo(cx + 24 * k, base);
      g.quadraticCurveTo(cx, base + 6 * k, cx - 24 * k, base);
      g.fill();
      // light facet
      g.fillStyle = C.rockA;
      g.beginPath();
      g.moveTo(cx - 20 * k, base);
      for (let i = 0; i < 5; i++) g.lineTo(pts[i][0] * 0.92 + cx * 0.08, pts[i][1] * 0.95 + base * 0.05);
      g.lineTo(cx, base - 4 * k);
      g.closePath();
      g.fill();
      g.fillStyle = C.rockC;
      g.beginPath();
      g.moveTo(pts[1][0] + 3 * k, pts[1][1] + 4 * k);
      g.lineTo(pts[2][0], pts[2][1] + 3 * k);
      g.lineTo(cx - 6 * k, base - 10 * k);
      g.closePath();
      g.fill();
      // snow cap
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.moveTo(pts[2][0], pts[2][1] + 1 * k);
      for (let i = 3; i <= 5; i++) g.lineTo(pts[i][0], pts[i][1] - 1 * k);
      g.quadraticCurveTo(pts[5][0] - 3 * k, pts[5][1] + 8 * k, cx, pts[4][1] + 7 * k);
      g.quadraticCurveTo(pts[3][0], pts[3][1] + 9 * k, pts[2][0], pts[2][1] + 1 * k);
      g.fill();
    });
  }

  function stump() {
    const w = 40, h = 34;
    return sprite('stump', w, h, w / 2, h - 8, (g) => {
      const cx = w / 2, base = h - 8;
      ellipse(g, cx + 5, base + 1, 15, 5, C.shadow);
      g.fillStyle = C.trunk;
      g.beginPath();
      g.moveTo(cx - 11, base - 14);
      g.lineTo(cx - 12, base);
      g.quadraticCurveTo(cx, base + 5, cx + 12, base);
      g.lineTo(cx + 11, base - 14);
      g.fill();
      ellipse(g, cx, base - 14, 11, 4.5, '#D9A873');
      g.strokeStyle = '#B98552';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx, base - 14, 6, 2.4, 0, 0, YR.TAU);
      g.stroke();
      ellipse(g, cx - 3, base - 16, 7, 2.5, '#FFFFFF');
    });
  }

  function snowman() {
    const w = 60, h = 86;
    return sprite('snowman', w, h, w / 2, h - 10, (g) => {
      const cx = w / 2, base = h - 10;
      ellipse(g, cx + 8, base + 1, 20, 6, C.shadow);
      // arms
      g.strokeStyle = C.trunk;
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 10, base - 36); g.lineTo(cx - 26, base - 48); g.lineTo(cx - 30, base - 46);
      g.moveTo(cx - 26, base - 48); g.lineTo(cx - 27, base - 54);
      g.moveTo(cx + 10, base - 36); g.lineTo(cx + 25, base - 44);
      g.stroke();
      const ball = (y, r) => {
        ellipse(g, cx, y, r, r, '#FFFFFF');
        g.fillStyle = C.snowShade;
        g.beginPath();
        g.arc(cx, y, r, -0.2, Math.PI * 0.9);
        g.arc(cx - r * 0.25, y - r * 0.2, r * 0.9, Math.PI * 0.9, -0.2, true);
        g.fill();
      };
      ball(base - 14, 17);
      ball(base - 38, 13);
      ball(base - 58, 10);
      // scarf
      g.fillStyle = C.red;
      g.beginPath();
      g.ellipse(cx, base - 49, 10, 3.5, 0, 0, YR.TAU);
      g.fill();
      g.fillRect(cx + 3, base - 49, 5, 12);
      // hat
      g.fillStyle = '#23262E';
      g.fillRect(cx - 10, base - 68, 20, 3);
      g.fillRect(cx - 6.5, base - 80, 13, 12);
      g.fillStyle = C.red;
      g.fillRect(cx - 6.5, base - 71, 13, 2.5);
      // face
      g.fillStyle = '#23262E';
      [[-4, -60], [4, -60], [-4.5, -53], [-1.5, -52], [1.5, -52], [4.5, -53]].forEach(([x, y], i) => {
        g.beginPath();
        g.arc(cx + x, base + y, i < 2 ? 1.6 : 1, 0, YR.TAU);
        g.fill();
      });
      g.fillStyle = C.orange;
      g.beginPath();
      g.moveTo(cx - 1, base - 58); g.lineTo(cx + 9, base - 56); g.lineTo(cx - 1, base - 55);
      g.fill();
      // buttons
      g.fillStyle = '#23262E';
      [-42, -35].forEach((y) => { g.beginPath(); g.arc(cx, base + y, 1.5, 0, YR.TAU); g.fill(); });
    });
  }

  function ramp() {
    const w = 110, h = 84;
    return sprite('ramp', w, h, w / 2, h - 12, (g) => {
      const cx = w / 2, base = h - 12;
      const lipY = base - 16, backY = base - 66;
      ellipse(g, cx + 8, base + 1, 50, 9, C.shadow);
      // side walls: grow from nothing at the back to full height at the lip
      g.fillStyle = '#B9CFE6';
      g.beginPath();
      g.moveTo(cx - 30, backY); g.lineTo(cx - 46, lipY); g.lineTo(cx - 45, base); g.closePath();
      g.fill();
      g.fillStyle = '#9FB9D6';
      g.beginPath();
      g.moveTo(cx + 30, backY); g.lineTo(cx + 46, lipY); g.lineTo(cx + 45, base); g.closePath();
      g.fill();
      // running surface fades into the slope at the back
      const grad = g.createLinearGradient(0, backY, 0, lipY);
      grad.addColorStop(0, 'rgba(244,248,252,0)');
      grad.addColorStop(0.35, '#F4F8FC');
      grad.addColorStop(1, '#FFFFFF');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx - 30, backY);
      g.lineTo(cx + 30, backY);
      g.lineTo(cx + 46, lipY);
      g.lineTo(cx - 46, lipY);
      g.closePath();
      g.fill();
      // groomed grooves
      g.strokeStyle = 'rgba(160,190,222,0.6)';
      g.lineWidth = 1.5;
      for (const k of [-0.45, -0.15, 0.15, 0.45]) {
        g.beginPath();
        g.moveTo(cx + k * 60, backY + 18);
        g.lineTo(cx + k * 90, lipY - 2);
        g.stroke();
      }
      // wooden front face
      g.fillStyle = C.wood;
      g.beginPath();
      g.moveTo(cx - 46, lipY);
      g.lineTo(cx + 46, lipY);
      g.lineTo(cx + 45, base);
      g.quadraticCurveTo(cx, base + 3, cx - 45, base);
      g.closePath();
      g.fill();
      g.strokeStyle = C.woodDark;
      g.lineWidth = 1.2;
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(cx - 45, lipY + i * 4);
        g.lineTo(cx + 45, lipY + i * 4);
        g.stroke();
      }
      // hazard stripe along the lip
      g.save();
      g.beginPath();
      g.rect(cx - 46, lipY - 4, 92, 5);
      g.clip();
      g.fillStyle = C.gold;
      g.fillRect(cx - 46, lipY - 4, 92, 5);
      g.fillStyle = '#23262E';
      for (let x = -56; x < 50; x += 10) {
        g.beginPath();
        g.moveTo(cx + x, lipY + 1); g.lineTo(cx + x + 5, lipY - 4); g.lineTo(cx + x + 10, lipY - 4); g.lineTo(cx + x + 5, lipY + 1);
        g.fill();
      }
      g.restore();
      // little marker flags on the corners
      for (const sx of [-1, 1]) {
        g.strokeStyle = '#2B2F38';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(cx + sx * 48, lipY + 2);
        g.lineTo(cx + sx * 48, lipY - 20);
        g.stroke();
        g.fillStyle = C.orange;
        g.beginPath();
        g.moveTo(cx + sx * 48, lipY - 20);
        g.lineTo(cx + sx * 48 + sx * 9, lipY - 16);
        g.lineTo(cx + sx * 48, lipY - 12);
        g.fill();
      }
    });
  }

  function flag(color) {
    const w = 40, h = 64;
    return sprite('flag' + color, w, h, 10, h - 6, (g) => {
      const x = 10, base = h - 6;
      ellipse(g, x + 5, base, 7, 2.5, C.shadow);
      g.strokeStyle = '#2B2F38';
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, base);
      g.lineTo(x, base - 52);
      g.stroke();
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x + 1, base - 52);
      g.quadraticCurveTo(x + 14, base - 50, x + 26, base - 44);
      g.quadraticCurveTo(x + 14, base - 40, x + 1, base - 34);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(x + 1, base - 52);
      g.quadraticCurveTo(x + 10, base - 50, x + 18, base - 47);
      g.lineTo(x + 1, base - 45);
      g.fill();
      ellipse(g, x, base - 1, 3.5, 1.5, '#FFFFFF');
    });
  }

  function mogul(v) {
    const w = 70, h = 36;
    return sprite('mogul' + v, w, h, w / 2, h / 2 + 4, (g) => {
      const cx = w / 2, cy = h / 2;
      const grad = g.createRadialGradient(cx - 10, cy - 6, 2, cx, cy, 30);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.6, '#EEF4FA');
      grad.addColorStop(1, 'rgba(200,218,236,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, cy, 32, 15, 0, 0, YR.TAU);
      g.fill();
      g.fillStyle = 'rgba(120,150,190,0.22)';
      g.beginPath();
      g.ellipse(cx + 6, cy + 6, 24, 7, 0, 0, Math.PI);
      g.fill();
      if (v) {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath();
        g.ellipse(cx - 9, cy - 5, 9, 3, -0.2, 0, YR.TAU);
        g.fill();
      }
    });
  }

  function icePatch(v) {
    const w = 150, h = 70;
    return sprite('ice' + v, w, h, w / 2, h / 2, (g) => {
      const cx = w / 2, cy = h / 2;
      const r = YR.rng(v * 31 + 7);
      g.fillStyle = 'rgba(160, 220, 255, 0.55)';
      g.beginPath();
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * YR.TAU;
        const rr = 0.8 + r() * 0.2;
        const x = cx + Math.cos(a) * 68 * rr, y = cy + Math.sin(a) * 30 * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 2;
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const x = cx - 40 + i * 22 + r() * 8, y = cy - 10 + r() * 14;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 14, y - 6);
        g.stroke();
      }
    });
  }

  function snowTile() {
    const S = 256;
    return sprite('snowtile', S, S, 0, 0, (g) => {
      g.fillStyle = C.snow;
      g.fillRect(0, 0, S, S);
      const r = YR.rng(4242);
      // Soft drifts, wrapped on all sides so the tile is seamless.
      for (let i = 0; i < 18; i++) {
        const x = r() * S, y = r() * S, rx = 30 + r() * 60, ry = 4 + r() * 7;
        const col = r() > 0.45 ? 'rgba(214,228,244,0.28)' : 'rgba(255,255,255,0.6)';
        g.fillStyle = col;
        for (let dx = -S; dx <= S; dx += S) {
          for (let dy = -S; dy <= S; dy += S) {
            g.beginPath();
            g.ellipse(x + dx, y + dy, rx, ry, 0, 0, YR.TAU);
            g.fill();
          }
        }
      }
      for (let i = 0; i < 70; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(170,195,225,0.3)' : 'rgba(255,255,255,0.95)';
        g.fillRect(r() * (S - 2), r() * (S - 2), 1.2, 1.2);
      }
    });
  }

  // ---------- Live-drawn objects ------------------------------------------

  function crystal(ctx, x, y, t) {
    const bob = Math.sin(t * 4 + x) * 3;
    ellipse(ctx, x + 3, y + 2, 8, 3, C.shadow);
    ctx.save();
    ctx.translate(x, y - 14 + bob);
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
    glow.addColorStop(0, 'rgba(140,220,255,0.7)');
    glow.addColorStop(1, 'rgba(140,220,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, YR.TAU);
    ctx.fill();
    ctx.scale(Math.cos(t * 3 + x) * 0.35 + 0.75, 1);
    ctx.fillStyle = '#5CC8FF';
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(8, -2); ctx.lineTo(0, 11); ctx.lineTo(-8, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#B7ECFF';
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(8, -2); ctx.lineTo(0, 0); ctx.lineTo(-8, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-2, -7); ctx.lineTo(1, -8); ctx.lineTo(-3, -2);
    ctx.fill();
    ctx.restore();
  }

  function cocoa(ctx, x, y, t) {
    const bob = Math.sin(t * 3) * 2;
    ellipse(ctx, x + 3, y + 2, 11, 3.5, C.shadow);
    ctx.save();
    ctx.translate(x, y - 12 + bob);
    // steam
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      const ph = t * 5 + i;
      ctx.moveTo(i * 3, -10);
      ctx.bezierCurveTo(i * 3 + Math.sin(ph) * 3, -14, i * 3 - Math.sin(ph) * 3, -18, i * 3, -22);
      ctx.stroke();
    }
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.roundRect(-9, -9, 18, 18, 3);
    ctx.fill();
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(10, 0, 5, -1.3, 1.3);
    ctx.stroke();
    ellipse(ctx, 0, -9, 9, 3, '#6B3B1F');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 11px Fredoka, ui-rounded, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♥', 0, 2);
    ctx.restore();
  }

  function star(ctx, x, y, t) {
    const bob = Math.sin(t * 4) * 3;
    ellipse(ctx, x + 3, y + 2, 11, 3.5, C.shadow);
    ctx.save();
    ctx.translate(x, y - 15 + bob);
    ctx.rotate(Math.sin(t * 2) * 0.3);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
    glow.addColorStop(0, 'rgba(255,210,80,0.8)');
    glow.addColorStop(1, 'rgba(255,210,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, YR.TAU);
    ctx.fill();
    starPath(ctx, 12, 5.5);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.strokeStyle = '#E09A00';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#FFF4C2';
    ctx.beginPath();
    ctx.arc(-3, -3, 2.5, 0, YR.TAU);
    ctx.fill();
    ctx.restore();
  }

  function starPath(ctx, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r : R;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  // Skier. a = heading (0 = straight downhill, +right), z = air height.
  function skier(ctx, s, t) {
    const { x, y } = s;
    const z = s.z || 0;
    // Shadow on the ground
    const shR = 16 - Math.min(z, 60) * 0.12;
    ellipse(ctx, x + 3, y + 2, shR, shR * 0.35, C.shadow);

    if (s.crashed) {
      drawCrashed(ctx, s, t);
      return;
    }
    ctx.save();
    ctx.translate(x, y - z);

    let a = s.a;
    let flipScale = 1;
    let grab = 0;
    if (s.trick) {
      const p = s.trick.p;
      if (s.trick.kind === 'spin') a += p * YR.TAU;
      if (s.trick.kind === 'flip') flipScale = Math.cos(p * YR.TAU);
      if (s.trick.kind === 'grab') grab = Math.sin(p * Math.PI);
    }
    if (s.blink && Math.floor(t * 12) % 2) ctx.globalAlpha = 0.35;

    const dx = Math.sin(a), dy = Math.cos(a) * 0.62; // ground plane squash
    const px = Math.cos(a), py = -Math.sin(a) * 0.62;

    if (flipScale !== 1) {
      // Rotate around the hips for the flip trick.
      ctx.translate(0, -16);
      ctx.scale(1, Math.max(0.15, Math.abs(flipScale)) * (flipScale < 0 ? -1 : 1));
      ctx.translate(0, 16);
    }

    // Skis
    const skiLen = 21;
    const sep = 4.2 * (1 - grab * 0.5);
    for (const side of [-1, 1]) {
      const ox = px * sep * side, oy = py * sep * side;
      const cross = grab * side * 0.35;
      const ddx = Math.sin(a + cross), ddy = Math.cos(a + cross) * 0.62;
      ctx.strokeStyle = C.navy;
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ox - ddx * skiLen, oy - ddy * skiLen);
      ctx.lineTo(ox + ddx * skiLen, oy + ddy * skiLen);
      ctx.stroke();
      ctx.strokeStyle = C.orange;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ox + ddx * (skiLen - 5), oy + ddy * (skiLen - 5));
      ctx.lineTo(ox + ddx * skiLen, oy + ddy * skiLen);
      ctx.stroke();
    }

    // Poles (behind the body)
    ctx.strokeStyle = '#555C68';
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      const hx = side * 9, hy = -15;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + px * side * 5 - dx * 14, -dy * 14 + 2);
      ctx.stroke();
    }

    const lean = YR.clamp(s.turn || 0, -1, 1) * 3;
    const crouch = grab * 5 + (s.tuck ? 3 : 0);
    // Legs
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-3.5 + lean * 0.3, -2); ctx.lineTo(-3 + lean, -13 + crouch);
    ctx.moveTo(3.5 + lean * 0.3, -2); ctx.lineTo(3 + lean, -13 + crouch);
    ctx.stroke();
    // Body (jacket)
    ctx.fillStyle = C.orange;
    ctx.beginPath();
    ctx.roundRect(-8 + lean, -27 + crouch, 16, 16, 6);
    ctx.fill();
    ctx.fillStyle = C.orangeDark;
    ctx.beginPath();
    ctx.roundRect(1 + lean, -27 + crouch, 7, 16, [0, 6, 6, 0]);
    ctx.fill();
    // Zip & stripe
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-8 + lean, -18 + crouch, 16, 2.2);
    // Arms
    ctx.strokeStyle = C.orange;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(-7 + lean, -24 + crouch); ctx.lineTo(-10 + lean * 0.5, -15 + crouch * 0.5);
    ctx.moveTo(7 + lean, -24 + crouch); ctx.lineTo(10 + lean * 0.5, -15 + crouch * 0.5);
    ctx.stroke();
    ellipse(ctx, -10 + lean * 0.5, -15 + crouch * 0.5, 2.4, 2.4, C.navy);
    ellipse(ctx, 10 + lean * 0.5, -15 + crouch * 0.5, 2.4, 2.4, C.navy);
    // Head: helmet + goggles facing the travel direction
    const hx = lean * 1.2, hy = -33 + crouch;
    ellipse(ctx, hx, hy, 7.5, 7.5, '#F2C9A0');
    ctx.fillStyle = C.navy;
    ctx.beginPath();
    ctx.arc(hx, hy - 0.5, 7.8, Math.PI * 1.02, Math.PI * 1.98);
    ctx.lineTo(hx + 7.8, hy + 1);
    ctx.lineTo(hx - 7.8, hy + 1);
    ctx.fill();
    ellipse(ctx, hx, hy - 7.5, 2.2, 1.6, C.orange);
    // goggles shift with heading
    const gx = hx + Math.sin(a) * 3.5;
    ctx.fillStyle = '#2B2F38';
    ctx.beginPath();
    ctx.roundRect(gx - 5.5, hy, 11, 4.2, 2);
    ctx.fill();
    ctx.fillStyle = '#7FD3FF';
    ctx.beginPath();
    ctx.roundRect(gx - 4.5, hy + 0.8, 9, 2.6, 1.3);
    ctx.fill();
    ctx.restore();

    // Turbo aura
    if (s.turbo > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(t * 20) * 0.1;
      ellipse(ctx, x, y - z - 16, 26, 30, C.gold);
      ctx.restore();
    }
  }

  function drawCrashed(ctx, s, t) {
    const { x, y } = s;
    ctx.save();
    ctx.translate(x, y);
    // scattered skis
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, -4); ctx.lineTo(10, 8);
    ctx.moveTo(-6, 12); ctx.lineTo(20, -8);
    ctx.stroke();
    // body lying down
    ctx.rotate(-1.2);
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-3, 0); ctx.lineTo(-6, 12);
    ctx.moveTo(3, 0); ctx.lineTo(8, 11);
    ctx.stroke();
    ctx.fillStyle = C.orange;
    ctx.beginPath();
    ctx.roundRect(-8, -14, 16, 15, 6);
    ctx.fill();
    ellipse(ctx, 0, -20, 7.5, 7.5, '#F2C9A0');
    ctx.fillStyle = C.navy;
    ctx.beginPath();
    ctx.arc(0, -20.5, 7.8, Math.PI * 1.02, Math.PI * 1.98);
    ctx.fill();
    ctx.restore();
    // dizzy stars
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * YR.TAU) / 3;
      ctx.save();
      ctx.translate(x - 10 + Math.cos(a) * 14, y - 28 + Math.sin(a) * 5);
      starPath(ctx, 4, 1.8);
      ctx.fillStyle = C.gold;
      ctx.fill();
      ctx.restore();
    }
    // snow puff
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(x - 18 + i * 9, y + 6 + Math.sin(i * 2) * 3, 5 + (i % 2) * 2, 0, YR.TAU);
      ctx.fill();
    }
  }

  function furBlob(ctx, cx, cy, rx, ry, spikes, jag, fill, stroke) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * YR.TAU;
      const r = i % 2 ? 1 : 1 + jag;
      const px = cx + Math.cos(a) * rx * r, py = cy + Math.sin(a) * ry * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  // Yeti. state: 'chase' | 'eat' | 'leave'
  function yeti(ctx, yt, t) {
    const { x, y } = yt;
    const run = Math.sin(t * 16);
    ellipse(ctx, x + 5, y + 3, 30, 9, C.shadow);
    ctx.save();
    ctx.translate(x, y);
    const k = 1.25;
    ctx.scale(k * (yt.dir || 1), k);
    const bounce = Math.abs(run) * 3;
    // legs
    const legA = yt.state === 'eat' ? 0 : run * 6;
    ellipse(ctx, -9, -8 + legA * 0.3, 8, 11, C.yetiShade);
    ellipse(ctx, 9, -8 - legA * 0.3, 8, 11, C.yetiShade);
    ellipse(ctx, -9 + legA * 0.2, -1, 8, 4, C.yetiFace);
    ellipse(ctx, 9 - legA * 0.2, -1, 8, 4, C.yetiFace);
    // arms
    const armA = yt.state === 'eat' ? Math.sin(t * 20) * 0.4 : run * 0.6;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 18, -44 - bounce);
      ctx.rotate(side * (-2.2 + armA * side));
      furBlob(ctx, 0, 14, 7, 16, 8, 0.15, C.yetiFur, '#7E9CC0');
      ellipse(ctx, 0, 28, 6, 5, C.yetiFace);
      ctx.restore();
    }
    // body
    furBlob(ctx, 0, -32 - bounce, 22, 24, 16, 0.12, C.yetiShade, '#7E9CC0');
    furBlob(ctx, -2, -34 - bounce, 20, 22, 16, 0.12, C.yetiFur);
    // face
    ellipse(ctx, 0, -40 - bounce, 13, 11, C.yetiFace);
    // brows
    ctx.strokeStyle = '#2A4E73';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, -48 - bounce); ctx.lineTo(-2, -45 - bounce);
    ctx.moveTo(9, -48 - bounce); ctx.lineTo(2, -45 - bounce);
    ctx.stroke();
    // eyes
    ellipse(ctx, -5, -42 - bounce, 2.8, 2.8, '#FFFFFF');
    ellipse(ctx, 5, -42 - bounce, 2.8, 2.8, '#FFFFFF');
    ellipse(ctx, -5, -41.5 - bounce, 1.4, 1.4, '#E63946');
    ellipse(ctx, 5, -41.5 - bounce, 1.4, 1.4, '#E63946');
    // mouth
    const open = yt.state === 'eat' ? 3 + Math.abs(Math.sin(t * 14)) * 4 : 4 + Math.abs(run) * 2;
    ctx.fillStyle = '#1B2A3A';
    ctx.beginPath();
    ctx.ellipse(0, -34 - bounce, 7, open, 0, 0, YR.TAU);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(i * 4.5, -34 - bounce - open + 0.5);
      ctx.lineTo(i * 3, -34 - bounce - open + 4);
      ctx.lineTo(i * 1.5, -34 - bounce - open + 0.8);
      ctx.fill();
    }
    ctx.restore();
  }

  YR.Art = {
    C,
    setScale,
    blit,
    pine,
    bush,
    rock,
    stump,
    snowman,
    ramp,
    flag,
    mogul,
    icePatch,
    snowTile,
    crystal,
    cocoa,
    star,
    starPath,
    skier,
    yeti,
    ellipse,
  };
})(window.YR);
