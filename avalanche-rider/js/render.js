'use strict';
// Canvas 2D renderer: sky with day/night cycle, parallax ranges, the slope,
// props, the rider and the avalanche. Everything is drawn from code.
(function (AR) {
  const STEP = AR.World.STEP;

  // ---------- colours ----------
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const KEYS = ['skyTop', 'skyBot', 'sun', 'far', 'mid', 'forest', 'snow', 'shade', 'tree', 'haze'];
  const PAL = {
    dawn: { skyTop: '#3a4f9a', skyBot: '#ffb38a', sun: '#ffd29a', far: '#8a86c0', mid: '#5e639f', forest: '#2f3a6b', snow: '#fff4ee', shade: '#d9c2d6', tree: '#2c3d63', haze: '#ffc7a8', stars: 0.25, aurora: 0 },
    day: { skyTop: '#2f6feb', skyBot: '#a9dbff', sun: '#fff2b3', far: '#a4c6ee', mid: '#6d93cf', forest: '#24426e', snow: '#f5f9fd', shade: '#c6d8ee', tree: '#1f4a5e', haze: '#d8eeff', stars: 0, aurora: 0 },
    sunset: { skyTop: '#40327a', skyBot: '#ff9966', sun: '#ffb36b', far: '#b7779f', mid: '#7d5089', forest: '#3b2c5a', snow: '#fff1e8', shade: '#e2b9c3', tree: '#33294f', haze: '#ffb48f', stars: 0.1, aurora: 0 },
    night: { skyTop: '#081127', skyBot: '#1c3260', sun: '#e8f0ff', far: '#2b3d68', mid: '#1f2d52', forest: '#111d38', snow: '#d3e0f5', shade: '#90a6cd', tree: '#0f1a30', haze: '#2b4677', stars: 1, aurora: 1 },
  };
  for (const k in PAL) for (const c of KEYS) PAL[k][c] = hex(PAL[k][c]);
  const FRAMES = [[0, 'dawn'], [0.12, 'day'], [0.38, 'day'], [0.5, 'sunset'], [0.62, 'night'], [0.88, 'night'], [1, 'dawn']];

  function palette(tod) {
    tod = AR.posMod(tod, 1);
    let i = 0;
    while (i < FRAMES.length - 2 && tod > FRAMES[i + 1][0]) i++;
    const [t0, a] = FRAMES[i];
    const [t1, b] = FRAMES[i + 1];
    const t = AR.smoothstep((tod - t0) / (t1 - t0 || 1));
    const out = { tod };
    for (const c of KEYS) {
      const x = PAL[a][c];
      const y = PAL[b][c];
      out[c] = [AR.lerp(x[0], y[0], t), AR.lerp(x[1], y[1], t), AR.lerp(x[2], y[2], t)];
    }
    out.stars = AR.lerp(PAL[a].stars, PAL[b].stars, t);
    out.aurora = AR.lerp(PAL[a].aurora, PAL[b].aurora, t);
    return out;
  }
  const rgb = (c, a) => (a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  const mix = (c, d, t) => [AR.lerp(c[0], d[0], t), AR.lerp(c[1], d[1], t), AR.lerp(c[2], d[2], t)];

  const tri = (x) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);

  // ---------- rider ----------
  const SKIN = '#F2C7A5';

  function limb(g, pts, w, color) {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  }

  function boardPath(g) {
    g.beginPath();
    g.moveTo(-26, -5);
    g.lineTo(26, -5);
    g.quadraticCurveTo(33, -5, 35, -10);
    g.lineTo(37.5, -9);
    g.quadraticCurveTo(35, 0, 26, 0);
    g.lineTo(-26, 0);
    g.quadraticCurveTo(-35, 0, -37.5, -9);
    g.lineTo(-35, -10);
    g.quadraticCurveTo(-33, -5, -26, -5);
    g.closePath();
  }

  function drawBoard(g, b, t) {
    boardPath(g);
    g.fillStyle = b.top;
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = b.accent;
    if (b.pattern === 'stripe') {
      g.fillRect(-40, -3.2, 80, 1.4);
    } else if (b.pattern === 'flame') {
      g.beginPath();
      for (let x = -30; x < 30; x += 9) {
        g.moveTo(x, 0);
        g.quadraticCurveTo(x + 3, -6, x + 8, -7);
        g.quadraticCurveTo(x + 5, -3, x + 7, 0);
      }
      g.fill();
    } else if (b.pattern === 'wave') {
      g.beginPath();
      g.moveTo(-40, -2);
      for (let x = -40; x <= 40; x += 4) g.lineTo(x, -2.6 + Math.sin(x * 0.4 + t * 2) * 1.4);
      g.lineTo(40, 0);
      g.lineTo(-40, 0);
      g.fill();
    } else if (b.pattern === 'candy') {
      for (let x = -44; x < 44; x += 8) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 4, 0);
        g.lineTo(x + 10, -10);
        g.lineTo(x + 6, -10);
        g.fill();
      }
    } else if (b.pattern === 'stars') {
      for (let i = 0; i < 9; i++) {
        const x = -30 + i * 7.3;
        const tw = 0.6 + 0.4 * Math.sin(t * 5 + i);
        g.globalAlpha = tw;
        g.fillRect(x, -3.5 + (i % 2) * 1.6, 1.4, 1.4);
      }
      g.globalAlpha = 1;
    }
    g.restore();
    g.strokeStyle = b.base;
    g.lineWidth = 1.6;
    boardPath(g);
    g.stroke();
  }

  // pose: { crouch 0..1, arms: 'balance'|'up'|'tuck'|'grind'|'flail', scarf, t, speed }
  function drawRider(g, look, board, pose) {
    const c = pose.crouch || 0;
    const t = pose.t || 0;
    const hipX = -1;
    const hipY = -25 + c * 8;
    const shX = 3 + c * 3;
    const shY = -42 + c * 11;
    const hdX = shX + 2.5;
    const hdY = shY - 9.5;

    // scarf (behind)
    const sl = 12 + AR.clamp((pose.speed || 0) / 50, 0, 18);
    g.strokeStyle = look.scarf;
    g.lineCap = 'round';
    g.lineWidth = 3.4;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      g.moveTo(shX, shY - 1);
      for (let i = 1; i <= 5; i++) {
        const u = i / 5;
        g.lineTo(shX - u * sl - k * 2, shY - 2 + Math.sin(t * 14 + u * 4 + k) * 2.4 * u + k * 2.5);
      }
      g.stroke();
    }

    // arms
    let back;
    let front;
    switch (pose.arms) {
      case 'up': back = [-9, -50, -17, -58]; front = [13, -49, 20, -57]; break;
      case 'tuck': back = [-4, -30, 4, -16]; front = [10, -30, 13, -14]; break;
      case 'grind': back = [-10, shY + 1, -21, shY - 2]; front = [14, shY + 1, 25, shY - 3]; break;
      case 'flail': back = [-10, -50 + Math.sin(t * 20) * 6, -18, -44]; front = [14, -50, 22, -46 + Math.cos(t * 18) * 6]; break;
      default: back = [-6, shY + 9, -14, shY + 14]; front = [12, shY + 8, 19, shY + 13];
    }
    limb(g, [shX - 1, shY + 2, back[0], back[1], back[2], back[3]], 5.5, look.jacket2);
    g.fillStyle = '#1B2A41';
    g.beginPath();
    g.arc(back[2], back[3], 2.8, 0, AR.TAU);
    g.fill();

    // back leg, board, front leg
    const kneeF = [11 + c * 3, -13 + c * 2.5];
    const kneeB = [-6 + c * 2, -13 + c * 2.5];
    limb(g, [-12, -5, kneeB[0], kneeB[1], hipX, hipY], 7.5, look.pants);
    if (board) {
      drawBoard(g, board, t);
      g.fillStyle = '#1B2A41';
      g.fillRect(-16, -8, 8, 3.5);
      g.fillRect(8, -8, 8, 3.5);
    }
    limb(g, [12, -5, kneeF[0], kneeF[1], hipX, hipY], 7.5, look.pants);

    // torso
    limb(g, [hipX, hipY, shX, shY], 13, look.jacket);
    limb(g, [hipX - 2.5, hipY - 1, shX - 3, shY + 1], 4, look.jacket2);
    if (look.plaid) {
      g.strokeStyle = 'rgba(20,20,20,.45)';
      g.lineWidth = 1.2;
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const y = AR.lerp(hipY, shY, 0.25 + i * 0.25);
        const x = AR.lerp(hipX, shX, 0.25 + i * 0.25);
        g.moveTo(x - 6, y);
        g.lineTo(x + 6, y);
      }
      g.moveTo(AR.lerp(hipX, shX, 0.5) + 1, hipY + 2);
      g.lineTo(shX + 1, shY - 2);
      g.stroke();
    }
    if (look.fur) {
      g.fillStyle = look.jacket2;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(AR.lerp(hipX, shX, i / 3) - 6, AR.lerp(hipY, shY, i / 3), 2.2, 0, AR.TAU);
        g.fill();
      }
    }

    // head
    g.fillStyle = look.hatStyle === 'yeti' ? look.hat : SKIN;
    g.beginPath();
    g.arc(hdX, hdY, 7.6, 0, AR.TAU);
    g.fill();
    g.fillStyle = look.hat;
    if (look.hatStyle === 'beanie') {
      g.beginPath();
      g.arc(hdX, hdY, 8, Math.PI * 1.02, Math.PI * 1.98);
      g.closePath();
      g.fill();
      g.fillRect(hdX - 8.2, hdY - 2.4, 16.4, 3);
      if (look.pom) {
        g.fillStyle = look.pom;
        g.beginPath();
        g.arc(hdX - 1.5, hdY - 9.5, 3, 0, AR.TAU);
        g.fill();
      }
    } else if (look.hatStyle === 'helmet') {
      g.beginPath();
      g.arc(hdX, hdY + 0.5, 9, Math.PI * 0.92, Math.PI * 2.02);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.beginPath();
      g.ellipse(hdX - 2, hdY - 5.5, 3.6, 1.6, -0.3, 0, AR.TAU);
      g.fill();
    } else if (look.hatStyle === 'hood') {
      g.strokeStyle = look.hat;
      g.lineWidth = 3.5;
      g.beginPath();
      g.arc(hdX - 0.5, hdY, 8.6, Math.PI * 0.55, Math.PI * 2.1);
      g.stroke();
    } else if (look.hatStyle === 'headband') {
      g.fillStyle = '#1B1B1B';
      g.beginPath();
      g.arc(hdX, hdY, 8, Math.PI, Math.PI * 2);
      g.fill();
      g.fillStyle = look.pom;
      g.fillRect(hdX - 8, hdY - 3.5, 16, 2.6);
      g.beginPath();
      g.moveTo(hdX - 7.5, hdY - 3);
      g.lineTo(hdX - 15, hdY - 6 + Math.sin(t * 12) * 2);
      g.lineTo(hdX - 14, hdY - 1 + Math.sin(t * 12 + 1) * 2);
      g.closePath();
      g.fill();
    } else if (look.hatStyle === 'yeti') {
      g.fillStyle = look.jacket2;
      g.beginPath();
      g.moveTo(hdX - 5, hdY - 6);
      g.lineTo(hdX - 7, hdY - 12);
      g.lineTo(hdX - 2, hdY - 7.5);
      g.moveTo(hdX + 3, hdY - 7.5);
      g.lineTo(hdX + 6, hdY - 12.5);
      g.lineTo(hdX + 6.5, hdY - 5.5);
      g.fill();
      g.fillStyle = '#5A7BA6';
      g.beginPath();
      g.ellipse(hdX + 3.5, hdY + 1.5, 3.6, 4.2, 0, 0, AR.TAU);
      g.fill();
    }
    // goggles
    g.fillStyle = '#1B2A41';
    g.fillRect(hdX - 7.5, hdY - 1.6, 9, 2.4);
    g.fillStyle = look.lens;
    g.beginPath();
    g.roundRect ? g.roundRect(hdX + 1.2, hdY - 2.8, 7.4, 5, 2) : g.rect(hdX + 1.2, hdY - 2.8, 7.4, 5);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.fillRect(hdX + 2.4, hdY - 2, 2.4, 1.2);

    // front arm
    limb(g, [shX + 1, shY + 2, front[0], front[1], front[2], front[3]], 5.5, look.jacket);
    g.fillStyle = '#1B2A41';
    g.beginPath();
    g.arc(front[2], front[3], 2.9, 0, AR.TAU);
    g.fill();
  }

  // ---------- renderer ----------
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.W = 0;
      this.H = 0;
      this.dpr = 1;
      const r = AR.rng(77);
      this.stars = [];
      for (let i = 0; i < 140; i++) this.stars.push({ x: r(), y: r() * 0.7, s: r.range(0.6, 1.8), p: r() * 10 });
      this.flakes = [];
      for (let i = 0; i < 140; i++) this.flakes.push({ x: r(), y: r(), s: r.range(1, 3.2), v: r.range(0.6, 1.4), p: r() * 10 });
      this.resize();
    }

    resize() {
      const W = Math.max(1, window.innerWidth);
      const H = Math.max(1, window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.6e6 / (W * H)));
      this.W = W;
      this.H = H;
      this.dpr = Math.max(0.5, dpr);
      this.canvas.width = Math.round(W * this.dpr);
      this.canvas.height = Math.round(H * this.dpr);
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
    }

    // Base zoom: 650 world units tall on a 16:9 screen, never narrower than 760.
    baseScale() {
      return Math.min(this.H / 650, this.W / 760);
    }

    draw(game, time) {
      const g = this.g;
      const { W, H, dpr } = this;
      const cam = game.cam;
      const pal = palette(game.tod);
      this.pal = pal;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawSky(g, pal, time, cam);
      this.drawRanges(g, pal, cam);

      // world space
      const s = cam.scale;
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - cam.x * s), dpr * (H / 2 - cam.y * s));
      const view = {
        x0: cam.x - W / 2 / s - 60,
        x1: cam.x + W / 2 / s + 60,
        y0: cam.y - H / 2 / s - 60,
        y1: cam.y + H / 2 / s + 60,
      };
      this.view = view;
      const w = game.world;
      this.drawGaps(g, w, view, pal);
      this.drawMarkers(g, game, view, pal, time);
      this.drawTrees(g, w, view, pal);
      this.drawTerrain(g, w, view, pal);
      this.drawKickers(g, w, view, pal);
      this.drawRails(g, w, view);
      this.drawRocks(g, w, view);
      this.drawCoins(g, w, view, time);
      this.drawPowerups(g, w, view, time);
      this.drawParticles(g, game.particles, view);
      this.drawRiderInWorld(g, game, time);
      this.drawAvalanche(g, game, view, pal, time);
      this.drawPopups(g, game.popups, s);

      // screen space overlays
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawSnowfall(g, game, pal, time);
      this.drawDanger(g, game);
      if (game.flash > 0) {
        g.fillStyle = `rgba(255,255,255,${AR.clamp(game.flash, 0, 1)})`;
        g.fillRect(0, 0, W, H);
      }
    }

    drawSky(g, pal, time, cam) {
      const { W, H } = this;
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, rgb(pal.skyTop));
      sky.addColorStop(0.75, rgb(pal.skyBot));
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);

      if (pal.stars > 0.02) {
        g.fillStyle = '#fff';
        for (const st of this.stars) {
          g.globalAlpha = pal.stars * (0.5 + 0.5 * Math.sin(time * 2 + st.p));
          g.fillRect(st.x * W, st.y * H, st.s, st.s);
        }
        g.globalAlpha = 1;
      }
      if (pal.aurora > 0.02) this.drawAurora(g, pal.aurora, time);

      // sun by day, moon by night
      const tod = pal.tod;
      let p = -1;
      let moon = false;
      if (tod < 0.56) p = tod / 0.56;
      else if (tod > 0.58) {
        p = (tod - 0.58) / 0.42;
        moon = true;
      }
      if (p >= 0) {
        const x = W * (0.1 + 0.8 * p) - cam.x * 0.002;
        const y = H * (0.62 - 0.48 * Math.sin(Math.PI * p));
        const r = Math.min(W, H) * (moon ? 0.035 : 0.05);
        const glow = g.createRadialGradient(x, y, r * 0.5, x, y, r * 4);
        glow.addColorStop(0, rgb(pal.sun, moon ? 0.3 : 0.5));
        glow.addColorStop(1, rgb(pal.sun, 0));
        g.fillStyle = glow;
        g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
        g.fillStyle = rgb(pal.sun);
        g.beginPath();
        g.arc(x, y, r, 0, AR.TAU);
        g.fill();
        if (moon) {
          g.fillStyle = rgb(pal.skyTop, 0.9);
          g.beginPath();
          g.arc(x + r * 0.45, y - r * 0.2, r * 0.85, 0, AR.TAU);
          g.fill();
        }
      }
    }

    drawAurora(g, a, time) {
      const { W, H } = this;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const bands = [[0.18, '80,255,190', 0], [0.26, '150,110,255', 2]];
      for (const [yy, col, ph] of bands) {
        const grad = g.createLinearGradient(0, H * (yy - 0.12), 0, H * (yy + 0.1));
        grad.addColorStop(0, `rgba(${col},0)`);
        grad.addColorStop(0.6, `rgba(${col},${0.32 * a})`);
        grad.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grad;
        g.beginPath();
        const n = 24;
        for (let i = 0; i <= n; i++) {
          const x = (i / n) * W;
          const y = H * yy + Math.sin(i * 0.5 + time * 0.4 + ph) * H * 0.04 + Math.sin(i * 0.17 + time * 0.25) * H * 0.03;
          if (i === 0) g.moveTo(x, y - H * 0.12);
          else g.lineTo(x, y - H * 0.12);
        }
        for (let i = n; i >= 0; i--) {
          const x = (i / n) * W;
          const y = H * yy + Math.sin(i * 0.5 + time * 0.4 + ph) * H * 0.04 + Math.sin(i * 0.17 + time * 0.25) * H * 0.03;
          g.lineTo(x, y + H * 0.1);
        }
        g.fill();
      }
      g.restore();
    }

    // Three parallax layers: far peaks, mid peaks, forest hills.
    drawRanges(g, pal, cam) {
      const { W, H } = this;
      const bs = this.baseScale();
      const layers = [
        { p: 0.03, base: 0.6, height: 0.36, f: [1 / 1100, 1 / 520, 1 / 210], a: [0.6, 0.28, 0.12], col: pal.far, cap: true, seed: 0.13 },
        { p: 0.07, base: 0.72, height: 0.3, f: [1 / 800, 1 / 360, 1 / 150], a: [0.55, 0.3, 0.15], col: pal.mid, cap: true, seed: 0.61 },
      ];
      for (const L of layers) {
        const off = cam.x * L.p;
        const ys = [];
        const stepPx = 6;
        for (let sx = -stepPx; sx <= W + stepPx; sx += stepPx) {
          const u = (sx - W / 2) / bs + off;
          const h = L.a[0] * tri(u * L.f[0] + L.seed) + L.a[1] * tri(u * L.f[1] + L.seed * 3) + L.a[2] * tri(u * L.f[2] + L.seed * 7);
          ys.push([sx, H * L.base - h * H * L.height, h]);
        }
        g.fillStyle = rgb(L.col);
        g.beginPath();
        g.moveTo(-stepPx, H);
        for (const [x, y] of ys) g.lineTo(x, y);
        g.lineTo(W + stepPx, H);
        g.fill();
        if (L.cap) {
          g.fillStyle = rgb(mix(L.col, pal.snow, 0.75));
          g.beginPath();
          g.moveTo(ys[0][0], ys[0][1]);
          for (const [x, y] of ys) g.lineTo(x, y);
          for (let i = ys.length - 1; i >= 0; i--) {
            const [x, y, h] = ys[i];
            g.lineTo(x, y + Math.max(0, h - 0.55) * H * L.height * 0.9);
          }
          g.fill();
        }
      }
      // forest hills with tree silhouettes
      const p = 0.16;
      const off = cam.x * p;
      const base = H * 0.86;
      g.fillStyle = rgb(pal.forest);
      g.beginPath();
      g.moveTo(0, H);
      const hill = (sx) => {
        const u = (sx - W / 2) / bs + off;
        return base - (Math.sin(u / 260) * 0.5 + Math.sin(u / 97 + 1) * 0.2 + 0.6) * H * 0.07;
      };
      for (let sx = 0; sx <= W + 8; sx += 8) g.lineTo(sx, hill(sx));
      g.lineTo(W, H);
      g.fill();
      const spacing = 15 * bs;
      const first = Math.floor((off * bs - W / 2) / spacing) - 1;
      for (let i = first; i < first + W / spacing + 3; i++) {
        const sx = i * spacing - off * bs + W / 2;
        const hsh = AR.hash(i, 5);
        if (hsh < 0.25) continue;
        const th = (18 + hsh * 26) * bs;
        const y = hill(sx) + 4 * bs;
        g.beginPath();
        g.moveTo(sx, y - th);
        g.lineTo(sx + th * 0.32, y);
        g.lineTo(sx - th * 0.32, y);
        g.fill();
      }
      const haze = g.createLinearGradient(0, H * 0.55, 0, H);
      haze.addColorStop(0, rgb(pal.haze, 0));
      haze.addColorStop(1, rgb(pal.haze, 0.35));
      g.fillStyle = haze;
      g.fillRect(0, H * 0.55, W, H * 0.45);
    }

    terrainPath(g, w, view, offset) {
      const i0 = Math.max(0, Math.floor(view.x0 / STEP));
      const i1 = Math.min(w.ys.length - 1, Math.ceil(view.x1 / STEP));
      const bottom = view.y1 + 400;
      let open = false;
      let lastX = 0;
      g.beginPath();
      for (let i = i0; i <= i1; i++) {
        const x = i * STEP;
        if (w.isDeep(i)) {
          if (open) {
            g.lineTo(lastX, bottom);
            g.closePath();
            open = false;
          }
          continue;
        }
        const y = w.ys[i] + offset;
        if (!open) {
          g.moveTo(x, bottom);
          g.lineTo(x, y);
          open = true;
        } else g.lineTo(x, y);
        lastX = x;
      }
      if (open) {
        g.lineTo(lastX, bottom);
        g.closePath();
      }
    }

    drawTerrain(g, w, view, pal) {
      this.terrainPath(g, w, view, 0);
      g.fillStyle = rgb(pal.snow);
      g.fill();
      this.terrainPath(g, w, view, 16);
      g.fillStyle = rgb(pal.shade, 0.45);
      g.fill();
      this.terrainPath(g, w, view, 70);
      g.fillStyle = rgb(pal.shade, 0.35);
      g.fill();
      this.terrainPath(g, w, view, 170);
      g.fillStyle = rgb(mix(pal.shade, pal.mid, 0.4), 0.35);
      g.fill();
      // bright rim
      const i0 = Math.max(0, Math.floor(view.x0 / STEP));
      const i1 = Math.min(w.ys.length - 1, Math.ceil(view.x1 / STEP));
      g.strokeStyle = 'rgba(255,255,255,.95)';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.beginPath();
      let open = false;
      for (let i = i0; i <= i1; i++) {
        const x = i * STEP;
        if (w.isDeep(i)) {
          open = false;
          continue;
        }
        if (!open) g.moveTo(x, w.ys[i]);
        else g.lineTo(x, w.ys[i]);
        open = true;
      }
      g.stroke();
    }

    drawGaps(g, w, view, pal) {
      for (const gp of w.gaps) {
        if (gp.x1 < view.x0 || gp.x0 > view.x1) continue;
        const top = Math.min(gp.yLip, gp.yFar);
        const grad = g.createLinearGradient(0, top, 0, top + 600);
        grad.addColorStop(0, rgb(mix(pal.shade, [70, 140, 200], 0.6)));
        grad.addColorStop(0.5, rgb(mix(pal.mid, [20, 50, 100], 0.6)));
        grad.addColorStop(1, '#050b18');
        g.fillStyle = grad;
        // The opening runs from the lip down to the (lower) far edge.
        g.beginPath();
        g.moveTo(gp.x0 - 2, gp.yLip);
        g.lineTo(gp.x1 + 2, gp.yFar);
        g.lineTo(gp.x1 + 2, view.y1 + 500);
        g.lineTo(gp.x0 - 2, view.y1 + 500);
        g.fill();
        // icy walls
        g.fillStyle = 'rgba(160,220,255,.55)';
        g.beginPath();
        g.moveTo(gp.x0 - 1, gp.yLip);
        g.lineTo(gp.x0 + 26, gp.yLip + 60);
        g.lineTo(gp.x0 + 8, gp.yLip + 160);
        g.lineTo(gp.x0 + 30, gp.yLip + 320);
        g.lineTo(gp.x0 - 1, gp.yLip + 420);
        g.fill();
        g.beginPath();
        g.moveTo(gp.x1 + 1, gp.yFar);
        g.lineTo(gp.x1 - 22, gp.yFar + 80);
        g.lineTo(gp.x1 - 6, gp.yFar + 190);
        g.lineTo(gp.x1 - 28, gp.yFar + 330);
        g.lineTo(gp.x1 + 1, gp.yFar + 420);
        g.fill();
      }
    }

    drawMarkers(g, game, view, pal, time) {
      const w = game.world;
      const PX = AR.PHYS.PX_PER_M;
      // start gate
      const sx = w.startX - 30;
      if (sx > view.x0 - 200 && sx < view.x1 + 200) {
        const gy = w.groundAt(sx);
        g.fillStyle = '#1D3557';
        g.fillRect(sx - 70, gy - 130, 7, 130);
        g.fillRect(sx + 63, gy - 130, 7, 130);
        g.fillStyle = '#FF6B2C';
        g.fillRect(sx - 72, gy - 140, 144, 30);
        g.fillStyle = '#fff';
        g.font = '700 20px Fredoka, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('START', sx, gy - 124);
      }
      // distance posts every 250 m
      const first = Math.max(1, Math.floor((view.x0 - w.startX) / (250 * PX)));
      for (let k = first; k * 250 * PX + w.startX < view.x1; k++) {
        const x = w.startX + k * 250 * PX;
        if (w.gapAt(x)) continue;
        const gy = w.groundAt(x);
        g.fillStyle = '#1D3557';
        g.fillRect(x - 2.5, gy - 70, 5, 72);
        g.fillStyle = '#fff';
        g.strokeStyle = '#1D3557';
        g.lineWidth = 3;
        g.beginPath();
        g.roundRect ? g.roundRect(x - 34, gy - 98, 68, 30, 8) : g.rect(x - 34, gy - 98, 68, 30);
        g.fill();
        g.stroke();
        g.fillStyle = '#1D3557';
        g.font = '700 17px Fredoka, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(k * 250 + ' m', x, gy - 82);
      }
      // personal best flag
      if (game.bestDist > 50) {
        const x = w.startX + game.bestDist * PX;
        if (x > view.x0 && x < view.x1 && !w.gapAt(x)) {
          const gy = w.groundAt(x);
          g.fillStyle = '#1B2A41';
          g.fillRect(x - 2, gy - 120, 4, 122);
          const wave = Math.sin(time * 6) * 4;
          g.fillStyle = '#FFC53D';
          g.beginPath();
          g.moveTo(x + 2, gy - 120);
          g.quadraticCurveTo(x + 40, gy - 120 + wave, x + 74, gy - 112);
          g.lineTo(x + 74, gy - 84);
          g.quadraticCurveTo(x + 40, gy - 92 + wave, x + 2, gy - 90);
          g.fill();
          g.fillStyle = '#1B2A41';
          g.font = '700 16px Fredoka, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(AR.t('bestFlag'), x + 38, gy - 102);
        }
      }
    }

    drawTrees(g, w, view, pal) {
      const trunk = rgb(mix(pal.tree, [90, 60, 40], 0.5));
      const leaf = rgb(pal.tree);
      const leaf2 = rgb(mix(pal.tree, [255, 255, 255], 0.12));
      const snow = rgb(pal.snow);
      for (const tr of w.trees) {
        if (tr.x < view.x0 - 80 || tr.x > view.x1 + 80) continue;
        const y = w.groundAt(tr.x) + 6;
        const s = tr.s;
        g.fillStyle = trunk;
        g.fillRect(tr.x - 4 * s, y - 22 * s, 8 * s, 22 * s);
        for (let k = 0; k < 3; k++) {
          const ty = y - (18 + k * 26) * s;
          const hw = (36 - k * 9) * s;
          g.fillStyle = k % 2 ? leaf2 : leaf;
          g.beginPath();
          g.moveTo(tr.x, ty - 44 * s);
          g.lineTo(tr.x + hw, ty);
          g.lineTo(tr.x - hw, ty);
          g.fill();
          g.fillStyle = snow;
          g.beginPath();
          g.moveTo(tr.x, ty - 44 * s);
          g.lineTo(tr.x + hw * 0.42, ty - 26 * s);
          g.lineTo(tr.x + hw * 0.1, ty - 28 * s);
          g.lineTo(tr.x - hw * 0.3, ty - 24 * s);
          g.lineTo(tr.x - hw * 0.42, ty - 26 * s);
          g.fill();
        }
      }
    }

    drawKickers(g, w, view) {
      for (const k of w.kickers) {
        if (k.lipX < view.x0 - 40 || k.x0 > view.x1) continue;
        // booster chevrons on ramps that lead into a crevasse
        if (k.gap) {
          g.fillStyle = 'rgba(255,107,44,.85)';
          for (let x = k.x0 + 20; x < k.lipX - 14; x += 34) {
            const y = w.groundAt(x);
            const a = w.angleAt(x);
            g.save();
            g.translate(x, y + 9);
            g.rotate(a);
            g.beginPath();
            g.moveTo(-8, -6);
            g.lineTo(2, 0);
            g.lineTo(-8, 6);
            g.lineTo(-3, 0);
            g.fill();
            g.restore();
          }
        }
        // pennant on the lip
        const fy = k.lipY;
        g.fillStyle = '#1D3557';
        g.fillRect(k.lipX - 2, fy - 64, 3.5, 64);
        g.fillStyle = k.gap ? '#E63946' : '#FF6B2C';
        g.beginPath();
        g.moveTo(k.lipX + 1, fy - 64);
        g.lineTo(k.lipX + 30, fy - 56);
        g.lineTo(k.lipX + 1, fy - 46);
        g.fill();
      }
    }

    drawRails(g, w, view) {
      for (const r of w.rails) {
        if (r.x1 < view.x0 || r.x0 > view.x1) continue;
        g.fillStyle = '#5B6B82';
        for (let x = r.x0 + 12; x <= r.x1 - 6; x += 90) {
          const ry = r.y0 + ((x - r.x0) / (r.x1 - r.x0)) * (r.y1 - r.y0);
          g.fillRect(x - 3, ry, 6, w.groundAt(x) - ry + 6);
        }
        g.lineCap = 'round';
        g.strokeStyle = '#2A3A55';
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(r.x0, r.y0);
        g.lineTo(r.x1, r.y1);
        g.stroke();
        g.strokeStyle = '#E8EEF7';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(r.x0 + 2, r.y0 - 2);
        g.lineTo(r.x1 - 2, r.y1 - 2);
        g.stroke();
      }
    }

    drawRocks(g, w, view) {
      for (const rk of w.rocks) {
        if (rk.smashed || rk.x < view.x0 - 60 || rk.x > view.x1 + 60) continue;
        const cx = rk.x;
        const cy = rk.y - rk.r * 0.55;
        const r = rk.r;
        const pts = [];
        for (let i = 0; i < 8; i++) {
          const a = Math.PI + (i / 7) * Math.PI;
          const rr = r * (0.82 + 0.3 * AR.hash(i, rk.seed | 0));
          pts.push([cx + Math.cos(a) * rr * 1.2, cy + Math.sin(a) * rr]);
        }
        g.fillStyle = '#4A5568';
        g.beginPath();
        g.moveTo(cx - r * 1.25, rk.y + 6);
        for (const [x, y] of pts) g.lineTo(x, y);
        g.lineTo(cx + r * 1.25, rk.y + 6);
        g.fill();
        g.fillStyle = '#6B7A90';
        g.beginPath();
        g.moveTo(pts[1][0], pts[1][1]);
        for (let i = 2; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.lineTo(cx, cy + r * 0.2);
        g.fill();
        g.fillStyle = '#F5F9FD';
        g.beginPath();
        g.moveTo(pts[2][0], pts[2][1]);
        for (let i = 3; i < 6; i++) g.lineTo(pts[i][0], pts[i][1] - 1);
        g.lineTo(pts[5][0] - r * 0.1, pts[5][1] + r * 0.3);
        g.lineTo(pts[3][0], pts[3][1] + r * 0.32);
        g.fill();
      }
    }

    drawCoins(g, w, view, time) {
      for (const c of w.coins) {
        if (c.taken || c.x < view.x0 || c.x > view.x1) continue;
        const sx = Math.abs(Math.cos(time * 3.4 + c.x * 0.01));
        g.save();
        g.translate(c.x, c.y);
        g.scale(Math.max(0.18, sx), 1);
        g.fillStyle = '#D99A00';
        g.beginPath();
        g.arc(0, 0, 11, 0, AR.TAU);
        g.fill();
        g.fillStyle = '#FFC53D';
        g.beginPath();
        g.arc(0, -1, 10, 0, AR.TAU);
        g.fill();
        g.strokeStyle = '#FFE38A';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, -1, 6, 0, AR.TAU);
        g.stroke();
        g.restore();
      }
    }

    drawPowerups(g, w, view, time) {
      for (const p of w.powerups) {
        if (p.taken || p.x < view.x0 || p.x > view.x1) continue;
        const y = p.y + Math.sin(time * 3 + p.x) * 5;
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.strokeStyle = 'rgba(255,255,255,.95)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(p.x, y, 22, 0, AR.TAU);
        g.fill();
        g.stroke();
        AR.drawPowerIcon(g, p.type, p.x, y, 1);
      }
    }

    drawParticles(g, ps, view) {
      for (const p of ps) {
        if (p.x < view.x0 || p.x > view.x1) continue;
        const a = AR.clamp(p.life / p.max, 0, 1);
        g.globalAlpha = p.fade === false ? 1 : a;
        g.fillStyle = p.color;
        if (p.kind === 'spark') {
          const s = p.size * (0.5 + a * 0.5);
          g.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        } else {
          g.beginPath();
          g.arc(p.x, p.y, p.size * (p.kind === 'puff' ? 1.6 - a * 0.6 : 1), 0, AR.TAU);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }

    drawRiderInWorld(g, game, time) {
      const r = game.rider;
      const look = game.look;
      if (!r) return;
      if (r.body) {
        if (r.mode === 'fall' && r.crashT > 1.5) return;
        g.save();
        g.translate(r.board.x, r.board.y);
        g.rotate(r.board.rot);
        drawBoard(g, look.board, time);
        g.restore();
        g.save();
        g.translate(r.body.x, r.body.y);
        g.rotate(r.body.rot);
        drawRider(g, look.rider, null, { crouch: 0.4, arms: 'flail', t: time, speed: 0 });
        g.restore();
        return;
      }
      const flicker = r.invulnT > 0 && Math.floor(time * 16) % 2 === 0;
      g.save();
      g.translate(r.x, r.y);
      g.rotate(game.drawAngle);
      if (flicker) g.globalAlpha = 0.45;
      let arms = 'balance';
      let crouch = 0.2 + AR.clamp(r.v / 1400, 0, 0.4);
      if (r.mode === 'air') {
        arms = r.spinning ? 'tuck' : 'up';
        crouch = r.spinning ? 0.9 : 0.15;
      } else if (r.mode === 'rail') {
        arms = 'grind';
        crouch = 0.35;
      }
      crouch = Math.max(crouch, game.landSquash);
      drawRider(g, look.rider, look.board, { crouch, arms, t: time, speed: r.speed });
      g.restore();
      if (r.shieldT > 0 && (r.shieldT > 1.5 || Math.floor(time * 10) % 2 === 0)) {
        g.strokeStyle = 'rgba(92,200,255,.9)';
        g.fillStyle = 'rgba(92,200,255,.16)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(r.x + Math.sin(game.drawAngle) * 28, r.y - Math.cos(game.drawAngle) * 28, 46, 0, AR.TAU);
        g.fill();
        g.stroke();
      }
      if (r.magnetT > 0) {
        g.strokeStyle = `rgba(230,57,70,${0.25 + 0.2 * Math.sin(time * 8)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(r.x, r.y - 28, 70 + (time * 60) % 40, 0, AR.TAU);
        g.stroke();
      }
    }

    // A towering powder cloud: a billowing front that leans back with height,
    // texture billows inside, a tumbling toe and spray thrown ahead.
    drawAvalanche(g, game, view, pal, time) {
      const av = game.avalanche;
      if (!av || av.x < view.x0 - 400) return;
      const w = game.world;
      const front = av.x;
      const ground = (x) => {
        const gp = w.gapAt(x);
        return gp ? gp.yLip : w.groundAt(x);
      };
      const gy = ground(front);
      const white = rgb(mix(pal.snow, [255, 255, 255], 0.65));
      const soft = rgb(mix(pal.shade, pal.snow, 0.45), 0.6);
      const dark = rgb(mix(pal.shade, pal.mid, 0.3));
      const circle = (x, y, r) => {
        g.beginPath();
        g.arc(x, y, r, 0, AR.TAU);
        g.fill();
      };
      const H = 1400;
      const N = 16;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const wob = Math.sin(time * 2.2 + i * 1.3) * 12 + Math.sin(time * 3.7 + i * 0.7) * 7;
        pts.push([front - 30 - 260 * Math.pow(t, 1.3) + wob, gy + 6 - t * H, 46 + 150 * t]);
      }
      // fog thrown ahead of the front
      const fog = g.createLinearGradient(front, 0, front + 520, 0);
      fog.addColorStop(0, rgb(pal.snow, 0.6));
      fog.addColorStop(1, rgb(pal.snow, 0));
      g.fillStyle = fog;
      g.fillRect(front - 20, view.y0, 540, view.y1 - view.y0);
      // bulk
      g.fillStyle = white;
      g.beginPath();
      g.moveTo(view.x0 - 200, view.y1 + 300);
      g.lineTo(view.x0 - 200, Math.min(view.y0, gy - H) - 200);
      for (let i = N; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1]);
      g.lineTo(front - 10, view.y1 + 300);
      g.fill();
      // texture billows inside the cloud
      for (let k = 0; k < 22; k++) {
        const x = front - 220 - AR.hash(k, 3) * 1100 + Math.sin(time * 1.4 + k) * 18;
        const y = gy - 60 - AR.hash(k, 9) * (H - 120) + Math.cos(time * 1.1 + k) * 12;
        if (x < view.x0 - 200 || y > view.y1 + 200 || y < view.y0 - 300) continue;
        const r = 70 + AR.hash(k, 5) * 110;
        g.fillStyle = soft;
        circle(x + r * 0.2, y + r * 0.25, r);
        g.fillStyle = white;
        circle(x, y, r * 0.9);
      }
      // billowing front edge: shadow pass, then light pass
      g.fillStyle = dark;
      for (const [x, y, r] of pts) circle(x + r * 0.16, y + r * 0.24, r);
      g.fillStyle = white;
      for (const [x, y, r] of pts) circle(x, y, r);
      // tumbling toe along the ground
      for (let k = 0; k < 8; k++) {
        const x = front - 6 - k * 24 + Math.sin(time * 9 + k * 2) * 6;
        const y = ground(x) - 14 - (k % 3) * 10 + Math.cos(time * 11 + k) * 4;
        const r = 26 - k * 1.6;
        g.fillStyle = dark;
        circle(x + 4, y + 6, r);
        g.fillStyle = white;
        circle(x, y, r);
      }
      // spray and chunks flying ahead
      for (let k = 0; k < 16; k++) {
        const ph = (time * 1.5 + k * 0.173) % 1;
        const x = front - 10 + ph * (120 + (k % 4) * 40);
        const y = ground(Math.min(x, front + 60)) - 18 - Math.sin(ph * Math.PI) * (40 + (k % 5) * 26);
        g.globalAlpha = 1 - ph * 0.8;
        g.fillStyle = k % 3 ? white : dark;
        circle(x, y, 4 + (k % 3) * 3.5);
      }
      g.globalAlpha = 1;
    }

    drawPopups(g, pops, s) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const p of pops) {
        const a = AR.clamp(p.life / 0.3, 0, 1);
        const grow = 1 + Math.max(0, p.life - (p.max - 0.15)) * 3;
        const size = (p.size || 30) * grow / Math.max(0.7, s);
        g.globalAlpha = a;
        g.font = `700 ${size}px Fredoka, sans-serif`;
        g.lineWidth = size * 0.22;
        g.strokeStyle = '#14213D';
        g.lineJoin = 'round';
        g.strokeText(p.text, p.x, p.y);
        g.fillStyle = p.color || '#fff';
        g.fillText(p.text, p.x, p.y);
      }
      g.globalAlpha = 1;
    }

    drawSnowfall(g, game, pal, time) {
      const amt = game.snowfall;
      if (amt <= 0.02) return;
      const { W, H } = this;
      g.fillStyle = rgb(mix(pal.snow, [255, 255, 255], 0.6), 0.85);
      const n = Math.floor(this.flakes.length * Math.min(1, amt));
      const camShiftX = game.cam.x * 0.0004;
      const camShiftY = game.cam.y * 0.0003;
      for (let i = 0; i < n; i++) {
        const f = this.flakes[i];
        const x = AR.posMod(f.x - camShiftX * f.v + Math.sin(time + f.p) * 0.01, 1) * W;
        const y = AR.posMod(f.y + time * 0.08 * f.v - camShiftY * f.v, 1) * H;
        g.beginPath();
        g.arc(x, y, f.s, 0, AR.TAU);
        g.fill();
      }
    }

    drawDanger(g, game) {
      const d = game.danger;
      if (d <= 0.05) return;
      const { W, H } = this;
      // White-out creeping in from the left, with a thin red warning edge.
      const grad = g.createLinearGradient(0, 0, W * 0.35, 0);
      grad.addColorStop(0, `rgba(255,255,255,${0.7 * d})`);
      grad.addColorStop(0.5, `rgba(255,255,255,${0.15 * d})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W * 0.35, H);
      const edge = g.createLinearGradient(0, 0, W * 0.05, 0);
      edge.addColorStop(0, `rgba(230,57,70,${0.45 * d})`);
      edge.addColorStop(1, 'rgba(230,57,70,0)');
      g.fillStyle = edge;
      g.fillRect(0, 0, W * 0.05, H);
    }
  }

  // Power-up icons, shared with the HUD.
  AR.drawPowerIcon = (g, type, x, y, s) => {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    if (type === 'magnet') {
      g.lineWidth = 7;
      g.lineCap = 'butt';
      g.strokeStyle = '#E63946';
      g.beginPath();
      g.arc(0, -1, 9, Math.PI, 0, true);
      g.stroke();
      g.fillStyle = '#E8EEF7';
      g.fillRect(-12.5, -3, 7, 6);
      g.fillRect(5.5, -3, 7, 6);
      g.fillStyle = '#E63946';
      g.fillRect(-12.5, -7, 7, 4);
      g.fillRect(5.5, -7, 7, 4);
    } else {
      g.fillStyle = '#2F6FEB';
      g.beginPath();
      g.moveTo(0, -13);
      g.lineTo(11, -8);
      g.quadraticCurveTo(11, 7, 0, 13);
      g.quadraticCurveTo(-11, 7, -11, -8);
      g.closePath();
      g.fill();
      g.fillStyle = '#7FD3FF';
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(7, -6);
      g.quadraticCurveTo(7, 4, 0, 8.5);
      g.closePath();
      g.fill();
    }
    g.restore();
  };

  AR.drawRider = drawRider;
  AR.drawBoard = drawBoard;
  AR.palette = palette;
  AR.Renderer = Renderer;
})(window.AR);
