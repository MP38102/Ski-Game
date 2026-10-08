'use strict';
// Retro trials: two Canvas-2D mini games with their own levels.
//  - "Seitenansicht": side-view downhill platformer with kickers, gaps,
//    rocks, rollers, stars and flips (18 levels).
//  - "Draufsicht": top-down slalom through forests (12 levels).
// Rating per level: 1-3 stars; new stars pay credits.
(function (GS) {
  const G = 9.81;
  const TAU = Math.PI * 2;

  const THEMES = [
    { sky: ['#5aa9ff', '#d6ecff'], far: '#a9c4e6', mid: '#7f9fc9', tree: '#1f5a44', snow: '#f4f8fd', shade: '#c9d9ee', rock: '#6e737b' },
    { sky: ['#ff9f6b', '#ffe2c6'], far: '#d9a39a', mid: '#b5767a', tree: '#3d4a3c', snow: '#fff6f0', shade: '#e9c9c0', rock: '#a4482e' },
    { sky: ['#0b1430', '#2a3f78'], far: '#3a4a7a', mid: '#2b3760', tree: '#173f37', snow: '#c9d6f0', shade: '#8ea2cc', rock: '#4f5560' },
    { sky: ['#7b2cbf', '#c08bff'], far: '#a685d6', mid: '#7a5cb0', tree: '#2d557a', snow: '#f2f4ff', shade: '#c7c4f0', rock: '#4b4e7a' },
    { sky: ['#8d99ae', '#e9ecef'], far: '#b5bcc7', mid: '#8d96a5', tree: '#244839', snow: '#f4f6f9', shade: '#cfd6df', rock: '#5e6168' },
  ];

  // ---------- Level generation (side view) ---------------------------------
  function sideLevel(n) {
    const r = GS.rng(9100 + n * 37);
    const diff = Math.min(1, n / 17);
    const len = 420 + n * 70;
    const pts = [];
    const feats = { rocks: [], coins: [], checkpoints: [0] };
    let x = 0, y = 0, slope = -0.3;
    const push = (nx, ny) => { pts.push([nx, ny]); };
    push(-30, 18); push(-10, 6); push(0, 0);
    while (x < len) {
      const k = r();
      if (x > 30 && k < 0.18 + diff * 0.12) {
        // kicker
        const run = 18 + r() * 14;
        for (let i = 1; i <= run / 2; i++) { x += 2; y += slope * 2; push(x, y); }
        const h = 1.8 + r() * (1.5 + diff * 1.5);
        for (let i = 1; i <= 4; i++) { x += 1.5; y += h / 4 * (0.5 + i * 0.25); push(x, y); }
        const lipX = x, lipY = y;
        x += 0.6; y -= h + 1.5; push(x, y);
        const land = 8 + r() * 10;
        for (let i = 1; i <= land / 2; i++) { x += 2; y -= 0.9 * 2; push(x, y); }
        for (let i = 0; i < 6; i++) feats.coins.push([lipX + 4 + i * 3.2, lipY + 3.5 + Math.sin((i / 5) * Math.PI) * 4.5]);
      } else if (x > 40 && k < 0.32 + diff * 0.15) {
        // cliff gap
        for (let i = 1; i <= 5; i++) { x += 2; y += -0.15 * 2; push(x, y); }
        const drop = 6 + r() * (6 + diff * 14);
        x += 0.8; y -= drop; push(x, y);
        for (let i = 1; i <= 8; i++) { x += 2; y -= 0.75 * 2; push(x, y); }
        for (let i = 0; i < 4; i++) feats.coins.push([x - 22 + i * 3, y + drop * 0.5 + 6]);
      } else if (k < 0.5) {
        // rollers
        const amp = 1 + r() * (1 + diff);
        const wl = 12 + r() * 8;
        const cnt = 2 + (r() * 3 | 0);
        for (let i = 0; i < cnt * wl / 2; i++) {
          x += 2;
          y += slope * 0.7 * 2;
          push(x, y + Math.sin((i * 2 / wl) * TAU) * amp);
        }
        for (let i = 0; i < cnt; i++) feats.coins.push([x - (cnt - i) * wl + wl * 0.25, y + amp + 3.5]);
      } else if (k < 0.65 + diff * 0.1 && x > 30) {
        // rock to jump over
        for (let i = 1; i <= 12; i++) { x += 2; y += slope * 2; push(x, y); }
        feats.rocks.push([x - 8, 0.9 + r() * (0.5 + diff * 0.6)]);
        feats.coins.push([x - 8, y + 4.5]);
      } else {
        // steep or gentle slope
        slope = -(0.2 + r() * (0.25 + diff * 0.25));
        const l = 20 + r() * 40;
        for (let i = 1; i <= l / 2; i++) { x += 2; y += slope * 2 + Math.sin(x * 0.3) * 0.04; push(x, y); }
        if (r() < 0.5) for (let i = 0; i < 4; i++) feats.coins.push([x - l + i * 6 + 6, y - slope * (l - i * 6 - 6) + 1.4]);
      }
      if (feats.checkpoints[feats.checkpoints.length - 1] < x - 140) feats.checkpoints.push(x);
    }
    for (let i = 1; i <= 25; i++) { x += 2; y += -0.08 * 2; push(x, y); }
    // coins must sit above the ground
    const groundY = (gx) => interp(pts, gx);
    feats.coins = feats.coins.map(([cx, cy]) => [cx, Math.max(cy, groundY(cx) + 1.2)]);
    feats.rocks = feats.rocks.map(([rx, rh]) => [rx, rh]);
    return { n, pts, len, finish: len + 10, ...feats, theme: THEMES[n % THEMES.length], par: len / (13 + diff * 4) };
  }

  function interp(pts, x) {
    let lo = 0, hi = pts.length - 1;
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[hi][0]) return pts[hi][1];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (pts[m][0] <= x) lo = m; else hi = m;
    }
    const a = pts[lo], b = pts[hi];
    return a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0] || 1));
  }

  // ---------- Level generation (top down) -------------------------------------
  function topLevel(n) {
    const r = GS.rng(7300 + n * 53);
    const diff = Math.min(1, n / 11);
    const len = 360 + n * 60;
    const W = 44;
    const trees = [], rocks = [], gates = [], stars = [], moguls = [];
    for (let z = 30; z < len - 20; z += 3.2) {
      const dens = 0.12 + diff * 0.22;
      if (r() < dens) trees.push([4 + r() * (W - 8), z + r() * 3, 0.8 + r() * 0.6]);
      if (r() < 0.04 + diff * 0.04) rocks.push([4 + r() * (W - 8), z + r() * 3, 0.6 + r() * 0.5]);
      if (r() < 0.02) moguls.push([4 + r() * (W - 8), z, 3 + r() * 4]);
    }
    let gx = W / 2;
    for (let z = 50; z < len - 40; z += 34 - diff * 8) {
      gx = GS.clamp(gx + (r() - 0.5) * 22, 9, W - 9);
      gates.push({ x: gx, z, w: 5.5 - diff * 1.2, color: gates.length % 2 ? '#2f6feb' : '#e63946' });
      stars.push([GS.clamp(gx + (r() - 0.5) * 12, 5, W - 5), z + 15]);
    }
    // keep gate lanes clear
    const clear = (x, z) => gates.every((g) => Math.hypot(g.x - x, (g.z - z) * 0.6) > 7) && stars.every((s) => Math.hypot(s[0] - x, s[1] - z) > 3) && z > 22;
    return {
      n, W, len, gates, stars,
      trees: trees.filter(([x, z]) => clear(x, z)), rocks: rocks.filter(([x, z]) => clear(x, z)), moguls,
      par: len / (14 + diff * 5) + gates.length * 0.2, theme: THEMES[n % THEMES.length],
    };
  }

  const SIDE_COUNT = 18, TOP_COUNT = 12;

  // ---------- Runtime -------------------------------------------------------------
  class Mini {
    constructor(canvas, ui) {
      this.c = canvas;
      this.g = canvas.getContext('2d');
      this.ui = ui;
      this.running = false;
      this.keys = {};
      this.touch = { left: false, right: false, hold: false, tap: false };
      this.loop = this.loop.bind(this);
      this._bind();
    }

    _bind() {
      const ptrs = new Map();
      const upd = () => {
        const W = this.c.clientWidth;
        let l = false, rr = false;
        for (const p of ptrs.values()) { if (p.x < W / 2) l = true; else rr = true; }
        this.touch.left = l; this.touch.right = rr; this.touch.hold = ptrs.size > 0;
      };
      this.c.addEventListener('pointerdown', (e) => { e.preventDefault(); ptrs.set(e.pointerId, { x: e.clientX }); this.touch.tap = true; upd(); GS.Audio.unlock(); });
      this.c.addEventListener('pointermove', (e) => { if (ptrs.has(e.pointerId)) { ptrs.set(e.pointerId, { x: e.clientX }); upd(); } });
      const up = (e) => { ptrs.delete(e.pointerId); upd(); };
      this.c.addEventListener('pointerup', up);
      this.c.addEventListener('pointercancel', up);
      window.addEventListener('keydown', (e) => {
        if (!this.running) return;
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { if (!this.keys.jump) this.touch.tap = true; this.keys.jump = true; }
        if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = true;
        if (e.key === 'Escape') this.stop(true);
      });
      window.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') this.keys.jump = false;
        if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = false;
      });
    }

    start(kind, n) {
      this.kind = kind;
      this.n = n;
      this.level = kind === 'side' ? sideLevel(n) : topLevel(n);
      this.gear = GS.Progress.gear();
      this.board = GS.Progress.data.sport === 'board';
      this.reset(0);
      this.time = 0;
      this.coins = new Set();
      this.missed = 0;
      this.done = false;
      this.parts = [];
      this.popups = [];
      this.score = 0;
      this.running = true;
      this.last = performance.now();
      this.c.classList.remove('hidden');
      this.resize();
      requestAnimationFrame(this.loop);
    }

    stop(abort) {
      this.running = false;
      this.c.classList.add('hidden');
      if (abort && this.onExit) this.onExit(null);
    }

    reset(cpIndex) {
      const L = this.level;
      if (this.kind === 'side') {
        const x = L.checkpoints ? L.checkpoints[cpIndex || 0] : 0;
        this.p = { x, y: interp(L.pts, x), s: 4, vx: 4, vy: 0, ground: true, ang: 0, rot: 0, crashT: 0, cp: cpIndex || 0, airT: 0 };
      } else {
        this.p = { x: L.W / 2, z: 6, v: 4, h: 0, crashT: 0, gate: 0 };
      }
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      this.c.width = Math.round(window.innerWidth * dpr);
      this.c.height = Math.round(window.innerHeight * dpr);
    }

    loop(ts) {
      if (!this.running) return;
      const dt = Math.min(0.033, (ts - this.last) / 1000);
      this.last = ts;
      if (this.c.width !== Math.round(window.innerWidth * this.dpr)) this.resize();
      if (!this.done) {
        const steps = 4;
        for (let i = 0; i < steps; i++) this.kind === 'side' ? this.stepSide(dt / steps, i === 0) : this.stepTop(dt / steps, i === 0);
        this.time += dt;
      }
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 9 * dt; p.t -= dt; }
      this.parts = this.parts.filter((p) => p.t > 0);
      for (const p of this.popups) p.t -= dt;
      this.popups = this.popups.filter((p) => p.t > 0);
      this.kind === 'side' ? this.drawSide() : this.drawTop();
      this.touch.tap = false;
      requestAnimationFrame(this.loop);
    }

    // ---------- side view ----------
    stepSide(dt, first) {
      const L = this.level, p = this.p;
      const hold = this.touch.hold || this.keys.jump;
      const tap = first && this.touch.tap;
      if (p.crashT > 0) {
        p.crashT -= dt;
        p.rot += 8 * dt;
        p.vy -= G * dt; p.x += p.vx * 0.3 * dt; p.y = Math.max(interp(L.pts, p.x), p.y + p.vy * dt);
        if (p.crashT <= 0) this.reset(p.cp);
        return;
      }
      const gy = (x) => interp(L.pts, x);
      if (p.ground) {
        const e = 0.5;
        const th = Math.atan2(gy(p.x + e) - gy(p.x - e), 2 * e);
        p.s += (-G * Math.sin(th) - 0.04 * G * Math.cos(th) - 0.004 * p.s * p.s) * dt;
        p.s = Math.max(2.5, p.s);
        p.vx = p.s * Math.cos(th);
        p.vy = p.s * Math.sin(th);
        p.ang += (th - p.ang) * Math.min(1, dt * 14);
        if (tap) {
          p.ground = false;
          p.vy += 7.2;
          p.rot = 0;
          p.airT = 0;
          GS.Audio.play('jump');
          return;
        }
        const nx = p.x + p.vx * dt;
        const pred = p.y + p.vy * dt;
        const ny = gy(nx);
        p.x = nx;
        if (pred - ny > 0.06) { p.y = pred; p.ground = false; p.rot = 0; p.airT = 0; }
        else p.y = ny;
        // rocks
        for (const [rx, rh] of L.rocks) if (Math.abs(p.x - rx) < 0.6 && p.y < gy(rx) + rh) this.crash();
        if (Math.random() < 0.3 && first) this.parts.push({ x: p.x - 0.5, y: p.y + 0.1, vx: -p.vx * 0.2 + (Math.random() - 0.5), vy: Math.random() * 2, t: 0.5, s: 0.15 + Math.random() * 0.2 });
      } else {
        p.airT += dt;
        p.vy -= G * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const spin = hold && p.airT > 0.12 ? 6.4 : 0;
        p.rot += spin * dt;
        // the body follows the flight path when not flipping
        p.ang += (Math.atan2(p.vy, p.vx) - p.ang) * Math.min(1, dt * 3.5);
        if (!spin) {
          const target = Math.round(p.rot / TAU) * TAU;
          p.rot += GS.clamp(target - p.rot, -4 * dt, 4 * dt);
        }
        const g = gy(p.x);
        if (p.y <= g) {
          const e = 0.5;
          const th = Math.atan2(gy(p.x + e) - gy(p.x - e), 2 * e);
          const bodyAng = p.ang + p.rot;
          const err = Math.abs(GS.wrapAngle(bodyAng - th));
          p.y = g;
          if (err > 1.0) { this.crash(); return; }
          const flips = Math.round(p.rot / TAU);
          p.ground = true;
          p.ang = th;
          p.rot = 0;
          p.s = Math.hypot(p.vx, p.vy) * Math.max(0.55, Math.cos(Math.atan2(p.vy, p.vx) - th));
          GS.Audio.play('land', 0.6);
          if (flips > 0) {
            const pts = flips * 500;
            this.score += pts;
            this.popups.push({ text: (flips > 1 ? flips + '× ' : '') + GS.t('backflip') + ' +' + pts, t: 1.5 });
            GS.Audio.play('trick', flips);
          } else if (p.airT > 1.2) {
            this.score += 100;
            this.popups.push({ text: GS.t('bigAir') + ' +100', t: 1.2 });
          }
        }
      }
      // checkpoints and coins
      while (L.checkpoints[p.cp + 1] != null && p.x > L.checkpoints[p.cp + 1]) p.cp++;
      L.coins.forEach(([cx, cy], i) => {
        if (!this.coins.has(i) && Math.hypot(cx - p.x, cy - (p.y + 0.9)) < 1.4) {
          this.coins.add(i);
          GS.Audio.play('coin');
        }
      });
      if (p.x >= L.finish) this.finish();
    }

    crash() {
      const p = this.p;
      if (p.crashT > 0) return;
      p.crashT = 1.1;
      p.vy = 3;
      GS.Audio.play('crash');
      for (let i = 0; i < 24; i++) this.parts.push({ x: p.x, y: p.y + 0.5, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, t: 0.9, s: 0.2 + Math.random() * 0.3 });
      this.crashes = (this.crashes || 0) + 1;
    }

    // ---------- top down ----------
    stepTop(dt, first) {
      const L = this.level, p = this.p;
      const left = this.touch.left || this.keys.left, right = this.touch.right || this.keys.right;
      if (p.crashT > 0) { p.crashT -= dt; p.v = 0; return; }
      if (left && !right) p.h -= 2.6 * dt;
      if (right && !left) p.h += 2.6 * dt;
      p.h = GS.clamp(p.h, -1.35, 1.35);
      const target = 6 + 17 * Math.cos(p.h);
      let slow = 0;
      for (const [mx, mz, mr] of L.moguls) if (Math.hypot(mx - p.x, mz - p.z) < mr) slow = 0.5;
      p.v += (target * (1 - slow) - p.v) * Math.min(1, dt * 0.9);
      const pz = p.z;
      p.x += Math.sin(p.h) * p.v * dt;
      p.z += Math.cos(p.h) * p.v * dt;
      if (p.x < 1.2 || p.x > L.W - 1.2) { p.x = GS.clamp(p.x, 1.2, L.W - 1.2); p.v *= 0.9; }
      for (const [tx, tz, ts] of L.trees) if (Math.hypot(tx - p.x, tz - p.z) < 0.9 * ts) this.crashTop();
      for (const [rx, rz, rs] of L.rocks) if (Math.hypot(rx - p.x, rz - p.z) < 0.8 * rs + 0.3) this.crashTop();
      // gates
      const g = L.gates[p.gate];
      if (g && pz < g.z && p.z >= g.z) {
        if (Math.abs(p.x - g.x) <= g.w / 2) { GS.Audio.play('gate'); this.popups.push({ text: GS.t('gate_ok') || '✓', t: 0.6 }); }
        else { this.missed++; GS.Audio.play('miss'); this.popups.push({ text: GS.t('gateMissed'), t: 1 }); }
        p.gate++;
      }
      L.stars.forEach(([sx, sz], i) => {
        if (!this.coins.has(i) && Math.hypot(sx - p.x, sz - p.z) < 1.5) { this.coins.add(i); GS.Audio.play('coin'); }
      });
      if (first && Math.random() < 0.4) this.parts.push({ x: p.x, y: p.z, vx: (Math.random() - 0.5) * 2, vy: -p.v * 0.1, t: 0.4, s: 0.2 });
      if (p.z >= L.len) this.finish();
    }

    crashTop() {
      const p = this.p;
      if (p.crashT > 0) return;
      p.crashT = 1;
      p.z -= 1.2;
      GS.Audio.play('crash');
      this.crashes = (this.crashes || 0) + 1;
    }

    finish() {
      if (this.done) return;
      this.done = true;
      const L = this.level;
      const total = this.kind === 'side' ? L.coins.length : L.stars.length;
      const got = this.coins.size;
      let stars = 1;
      if (this.kind === 'side') {
        if (got >= total * 0.6) stars = 2;
        if (got >= total * 0.95 && this.time <= L.par * 1.15) stars = 3;
      } else {
        const t = this.time + this.missed * 3;
        if (t <= L.par * 1.2 && got >= total * 0.5) stars = 2;
        if (t <= L.par && this.missed === 0) stars = 3;
      }
      GS.Audio.play('medal', stars);
      const d = GS.Progress.data;
      d.mini = d.mini || { side: [], top: [] };
      const arr = d.mini[this.kind];
      const old = arr[this.n] || 0;
      let credits = 0;
      if (stars > old) { arr[this.n] = stars; credits = (stars - old) * 60; GS.Progress.addCredits(credits); }
      GS.Progress.save();
      setTimeout(() => {
        this.stop(false);
        if (this.onExit) this.onExit({ stars, credits, time: this.time, got, total, missed: this.missed, score: this.score });
      }, 1200);
    }

    // ---------- drawing ----------
    _sky(t) {
      const g = this.g, W = this.c.width, H = this.c.height;
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, t.sky[0]);
      gr.addColorStop(1, t.sky[1]);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }

    drawSide() {
      const g = this.g, L = this.level, p = this.p, t = L.theme;
      const W = this.c.width, H = this.c.height, dpr = this.dpr;
      const scale = Math.min(W, H) / 22;
      const camX = p.x + 6, camY = p.y + 2;
      const sx = (x) => W * 0.36 + (x - camX) * scale;
      const sy = (y) => H * 0.5 - (y - camY) * scale;
      this._sky(t);
      // parallax ranges
      const ridge = (par, base, amp, col, seed) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, H);
        for (let i = 0; i <= 40; i++) {
          const X = (i / 40) * W;
          const wx = (X / scale + camX * par) * 0.05;
          const y = base + Math.sin(wx + seed) * amp + Math.sin(wx * 2.7 + seed * 2) * amp * 0.4 + p.y * scale * par * 0.15;
          g.lineTo(X, y);
        }
        g.lineTo(W, H);
        g.fill();
      };
      ridge(0.08, H * 0.42, H * 0.08, t.far, 1);
      ridge(0.22, H * 0.55, H * 0.06, t.mid, 4);
      // background trees
      g.fillStyle = t.tree;
      for (let i = -2; i < 26; i++) {
        const wx = Math.floor(camX * 0.5 / 7) * 7 + i * 7;
        const X = W * 0.36 + (wx - camX * 0.5) * scale * 0.5;
        const hh = (2.5 + ((wx * 13) % 7) * 0.3) * scale * 0.5;
        const by = H * 0.66 + Math.sin(wx * 0.11) * H * 0.03;
        g.beginPath(); g.moveTo(X, by - hh); g.lineTo(X + hh * 0.35, by); g.lineTo(X - hh * 0.35, by); g.fill();
      }
      // ground
      const x0 = camX - W * 0.36 / scale - 4, x1 = camX + (W * 0.64) / scale + 4;
      const gr = g.createLinearGradient(0, sy(camY + 4), 0, H);
      gr.addColorStop(0, t.snow);
      gr.addColorStop(1, t.shade);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(sx(x0), H + 10);
      for (let x = x0; x <= x1; x += 0.5) g.lineTo(sx(x), sy(interp(L.pts, x)));
      g.lineTo(sx(x1), H + 10);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 3 * dpr;
      g.beginPath();
      for (let x = x0; x <= x1; x += 0.5) { const X = sx(x), Y = sy(interp(L.pts, x)); x === x0 ? g.moveTo(X, Y) : g.lineTo(X, Y); }
      g.stroke();
      // rocks
      for (const [rx, rh] of L.rocks) {
        if (rx < x0 || rx > x1) continue;
        const gy = interp(L.pts, rx);
        g.fillStyle = t.rock;
        g.beginPath();
        g.ellipse(sx(rx), sy(gy + rh * 0.45), 0.8 * scale, rh * 0.6 * scale, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.ellipse(sx(rx) - 0.1 * scale, sy(gy + rh * 0.85), 0.5 * scale, 0.16 * scale, 0, 0, TAU);
        g.fill();
      }
      // coins
      L.coins.forEach(([cx, cy], i) => {
        if (this.coins.has(i) || cx < x0 || cx > x1) return;
        this._star(sx(cx), sy(cy), scale * 0.5, this.time * 3 + i);
      });
      // finish banner
      if (L.finish > x0 && L.finish < x1) {
        const fy = interp(L.pts, L.finish);
        g.fillStyle = '#e63946';
        g.fillRect(sx(L.finish) - 0.15 * scale, sy(fy + 5), 0.3 * scale, 5 * scale);
        g.fillRect(sx(L.finish) + 3.85 * scale, sy(fy + 5), 0.3 * scale, 5 * scale);
        g.fillStyle = '#fff';
        g.fillRect(sx(L.finish), sy(fy + 5.2), 4 * scale, 1.1 * scale);
        g.fillStyle = '#1b2a41';
        g.font = `700 ${Math.round(scale * 0.8)}px Fredoka, sans-serif`;
        g.textAlign = 'center';
        g.fillText('ZIEL', sx(L.finish + 2), sy(fy + 4.4));
      }
      // particles
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (const q of this.parts) { g.beginPath(); g.arc(sx(q.x), sy(q.y), q.s * scale, 0, TAU); g.fill(); }
      // rider
      this._riderSide(sx(p.x), sy(p.y), scale, p.ang + p.rot + (p.crashT > 0 ? p.crashT * 3 : 0), !p.ground);
      this._hud(L.coins.length);
    }

    _star(x, y, r, ph) {
      const g = this.g;
      const k = Math.abs(Math.cos(ph));
      g.save();
      g.translate(x, y);
      g.scale(0.35 + 0.65 * k, 1);
      g.fillStyle = '#ffd23f';
      g.strokeStyle = '#e0a800';
      g.lineWidth = r * 0.15;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * TAU;
        const rr = i % 2 ? r * 0.45 : r;
        i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }

    _riderSide(x, y, s, ang, air) {
      const g = this.g, ge = this.gear;
      g.save();
      g.translate(x, y);
      g.rotate(-ang);
      const crouch = air ? 0.3 : 0.12;
      // skis / board
      g.strokeStyle = this.board ? ge.board : ge.skis;
      g.lineCap = 'round';
      g.lineWidth = s * 0.12;
      g.beginPath();
      g.moveTo(-0.9 * s, -0.05 * s);
      g.lineTo(0.9 * s, -0.05 * s);
      g.quadraticCurveTo(1.05 * s, -0.05 * s, 1.1 * s, -0.25 * s);
      g.stroke();
      // legs
      g.strokeStyle = ge.pants;
      g.lineWidth = s * 0.22;
      g.beginPath();
      g.moveTo(0, -0.2 * s);
      g.lineTo(0.22 * s, -(0.55 - crouch * 0.4) * s);
      g.lineTo(-0.05 * s, -(0.95 - crouch) * s);
      g.stroke();
      // boot
      g.fillStyle = '#2b2f36';
      g.fillRect(-0.12 * s, -0.3 * s, 0.3 * s, 0.22 * s);
      // torso
      g.save();
      g.translate(-0.05 * s, -(0.95 - crouch) * s);
      g.rotate(0.45 + crouch);
      g.fillStyle = ge.jacket;
      g.beginPath();
      g.roundRect(-0.2 * s, -0.62 * s, 0.42 * s, 0.66 * s, 0.18 * s);
      g.fill();
      // arm & pole
      g.strokeStyle = ge.jacket;
      g.lineWidth = s * 0.14;
      g.beginPath();
      g.moveTo(0, -0.5 * s);
      g.lineTo(0.3 * s, -0.2 * s);
      g.lineTo(0.5 * s, -0.25 * s);
      g.stroke();
      if (!this.board) {
        g.strokeStyle = '#9aa4b1';
        g.lineWidth = s * 0.04;
        g.beginPath();
        g.moveTo(0.5 * s, -0.25 * s);
        g.lineTo(-0.2 * s, 0.75 * s);
        g.stroke();
      }
      // head
      g.fillStyle = ge.skin || '#f1c7a5';
      g.beginPath();
      g.arc(0.02 * s, -0.8 * s, 0.17 * s, 0, TAU);
      g.fill();
      g.fillStyle = ge.helmet;
      g.beginPath();
      g.arc(0.0 * s, -0.84 * s, 0.19 * s, Math.PI * 0.95, Math.PI * 2.05);
      g.fill();
      g.fillStyle = ge.goggles;
      g.beginPath();
      g.roundRect(0.03 * s, -0.86 * s, 0.2 * s, 0.09 * s, 0.04 * s);
      g.fill();
      g.restore();
      g.restore();
    }

    drawTop() {
      const g = this.g, L = this.level, p = this.p, t = L.theme;
      const W = this.c.width, H = this.c.height, dpr = this.dpr;
      const scale = Math.min(W / (L.W + 4), H / 30);
      const ox = (W - L.W * scale) / 2;
      const camZ = p.z + 8;
      const sx = (x) => ox + x * scale;
      const sy = (z) => H * 0.5 + (z - camZ) * scale;
      g.fillStyle = t.sky[0];
      g.fillRect(0, 0, W, H);
      g.fillStyle = t.snow;
      g.fillRect(ox, 0, L.W * scale, H);
      // snow speckles
      g.fillStyle = t.shade;
      for (let i = 0; i < 120; i++) {
        const wz = Math.floor((camZ - 20) / 2) * 2 + (i % 30) * 1.4;
        const wx = ((i * 7.31 + Math.floor(wz) * 3.7) % L.W);
        g.fillRect(sx(wx), sy(wz), 2 * dpr, 2 * dpr);
      }
      const visible = (z) => z > camZ - H / scale && z < camZ + H / scale;
      for (const [mx, mz, mr] of L.moguls) {
        if (!visible(mz)) continue;
        g.fillStyle = 'rgba(160,185,215,0.35)';
        for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(sx(mx + Math.cos(k * 1.6) * mr * 0.5), sy(mz + Math.sin(k * 1.6) * mr * 0.5), mr * 0.3 * scale, mr * 0.2 * scale, 0, 0, TAU); g.fill(); }
      }
      // finish
      if (visible(L.len)) {
        for (let i = 0; i < L.W; i += 2) { g.fillStyle = (i / 2) % 2 ? '#1b2a41' : '#fff'; g.fillRect(sx(i), sy(L.len), 2 * scale, scale * 0.7); }
      }
      for (const gt of L.gates) {
        if (!visible(gt.z)) continue;
        g.fillStyle = gt.color;
        for (const xx of [gt.x - gt.w / 2, gt.x + gt.w / 2]) {
          g.fillRect(sx(xx) - 0.15 * scale, sy(gt.z) - 0.9 * scale, 0.3 * scale, 0.9 * scale);
          g.beginPath(); g.moveTo(sx(xx), sy(gt.z) - 0.9 * scale); g.lineTo(sx(xx) + 0.7 * scale * Math.sign(gt.x - xx || 1), sy(gt.z) - 0.6 * scale); g.lineTo(sx(xx), sy(gt.z) - 0.35 * scale); g.fill();
        }
      }
      L.stars.forEach(([x, z], i) => { if (!this.coins.has(i) && visible(z)) this._star(sx(x), sy(z), scale * 0.55, this.time * 3 + i); });
      for (const [rx, rz, rs] of L.rocks) {
        if (!visible(rz)) continue;
        g.fillStyle = t.rock;
        g.beginPath(); g.ellipse(sx(rx), sy(rz), rs * scale, rs * 0.7 * scale, 0, 0, TAU); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.ellipse(sx(rx) - 0.2 * scale, sy(rz) - 0.25 * scale, rs * 0.55 * scale, rs * 0.3 * scale, 0, 0, TAU); g.fill();
      }
      // player (drawn before trees further down so trees overlap)
      const drawPlayer = () => {
        g.save();
        g.translate(sx(p.x), sy(p.z));
        g.rotate(-p.h);
        if (p.crashT > 0) g.rotate(p.crashT * 9);
        const ge = this.gear;
        g.strokeStyle = this.board ? ge.board : ge.skis;
        g.lineWidth = 0.18 * scale;
        g.lineCap = 'round';
        g.beginPath();
        if (this.board) { g.moveTo(0, -0.8 * scale); g.lineTo(0, 0.8 * scale); }
        else { g.moveTo(-0.22 * scale, -0.8 * scale); g.lineTo(-0.22 * scale, 0.9 * scale); g.moveTo(0.22 * scale, -0.8 * scale); g.lineTo(0.22 * scale, 0.9 * scale); }
        g.stroke();
        g.fillStyle = ge.jacket;
        g.beginPath(); g.ellipse(0, 0, 0.42 * scale, 0.3 * scale, 0, 0, TAU); g.fill();
        g.fillStyle = ge.helmet;
        g.beginPath(); g.arc(0, 0.05 * scale, 0.22 * scale, 0, TAU); g.fill();
        g.restore();
      };
      drawPlayer();
      for (const [tx, tz, ts] of L.trees) {
        if (!visible(tz)) continue;
        const X = sx(tx), Y = sy(tz), r = ts * scale;
        g.fillStyle = 'rgba(40,70,110,0.18)';
        g.beginPath(); g.ellipse(X + r * 0.5, Y + r * 0.15, r * 1.1, r * 0.45, 0, 0, TAU); g.fill();
        g.fillStyle = t.tree;
        g.beginPath(); g.moveTo(X, Y - r * 2.4); g.lineTo(X + r, Y); g.lineTo(X - r, Y); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath(); g.moveTo(X, Y - r * 2.4); g.lineTo(X + r * 0.42, Y - r * 1.4); g.lineTo(X - r * 0.42, Y - r * 1.4); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (const q of this.parts) { g.beginPath(); g.arc(sx(q.x), sy(q.y), q.s * scale, 0, TAU); g.fill(); }
      // borders
      g.fillStyle = t.tree;
      for (let z = Math.floor(camZ - H / scale); z < camZ + H / scale; z += 2) {
        for (const bx of [0, L.W]) {
          const X = sx(bx), Y = sy(z), r = scale * 1.1;
          g.beginPath(); g.moveTo(X, Y - r * 2); g.lineTo(X + r, Y); g.lineTo(X - r, Y); g.fill();
        }
      }
      this._hud(L.stars.length);
    }

    _hud(total) {
      const g = this.g, dpr = this.dpr, W = this.c.width;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(20,33,61,0.75)';
      const w = 300 * dpr, h = 54 * dpr;
      g.beginPath(); g.roundRect(W / 2 - w / 2, 12 * dpr, w, h, 16 * dpr); g.fill();
      g.fillStyle = '#fff';
      g.font = `700 ${22 * dpr}px Fredoka, sans-serif`;
      const name = (this.kind === 'side' ? GS.t('mini_side') : GS.t('mini_top')) + ' ' + (this.n + 1);
      g.fillText(`${name} · ★ ${this.coins.size}/${total} · ${GS.fmtTime(this.time)}`, W / 2, 46 * dpr);
      let y = 110 * dpr;
      for (const p of this.popups) {
        g.globalAlpha = Math.min(1, p.t * 2);
        g.font = `700 ${24 * dpr}px Fredoka, sans-serif`;
        g.fillStyle = '#ffd23f';
        g.fillText(p.text, W / 2, y);
        y += 32 * dpr;
      }
      g.globalAlpha = 1;
      if (this.done) {
        g.font = `700 ${56 * dpr}px Fredoka, sans-serif`;
        g.fillStyle = '#fff';
        g.strokeStyle = 'rgba(20,33,61,0.6)';
        g.lineWidth = 6 * dpr;
        g.strokeText(GS.t('go_finish'), W / 2, this.c.height * 0.42);
        g.fillText(GS.t('go_finish'), W / 2, this.c.height * 0.42);
      }
    }
  }

  // Headless check used by tests: ride a level without input.
  Mini.simulate = function (kind, n, policy) {
    const fake = { getContext: () => null, classList: { add() {}, remove() {} }, addEventListener() {}, clientWidth: 800, width: 800, height: 600 };
    const m = Object.create(Mini.prototype);
    m.c = fake; m.keys = {}; m.touch = { left: false, right: false, hold: false, tap: false };
    m.kind = kind; m.n = n; m.level = kind === 'side' ? sideLevel(n) : topLevel(n);
    m.reset(0); m.time = 0; m.coins = new Set(); m.missed = 0; m.done = false; m.parts = []; m.popups = []; m.score = 0; m.crashes = 0;
    m.finish = function () { this.done = true; };
    for (let i = 0; i < 240 * 200 && !m.done; i++) {
      if (policy) policy(m);
      m.kind === 'side' ? m.stepSide(1 / 240, true) : m.stepTop(1 / 240, true);
      m.time += 1 / 240;
      m.touch.tap = false;
    }
    return { done: m.done, time: +m.time.toFixed(1), crashes: m.crashes, coins: m.coins.size, par: +m.level.par.toFixed(1) };
  };

  GS.Mini = Mini;
  GS.MINI_COUNTS = { side: SIDE_COUNT, top: TOP_COUNT };
})(window.GS);
