'use strict';
// Endless mountain generator. The slope is a height field sampled every
// STEP world units (y grows downwards, so a downhill slope has a positive
// gradient). It is built section by section: rolling hills, kickers,
// crevasses (gaps), cliffs, rock gardens and rails. Every feature is placed so
// it can be cleared at the speed the game guarantees there.
(function (AR) {
  // Shared physics constants (world units: 20 units = 1 metre).
  AR.PHYS = {
    G: 1500,
    JUMP: 520,
    SPIN: 7.4,
    MU: 0.03,
    DRAG: 0.0012,
    VMIN: 120,
    VMAX: 1250,
    // Landing speed above this is only partly kept (soft cap), so big drops
    // cannot turn into endless, unreactable speed.
    VSOFT: 880,
    PX_PER_M: 20,
  };

  const STEP = 10;
  const DEEP = 4000;
  const DEG = Math.PI / 180;

  class World {
    constructor(seed, opts) {
      opts = opts || {};
      this.seed = seed;
      this.r = AR.rng(seed);
      this.ys = [0];
      this.endX = 0;
      this.endY = 0;
      this.endS = 0.05;
      this.rocks = [];
      this.gaps = [];
      this.rails = [];
      this.coins = [];
      this.powerups = [];
      this.trees = [];
      this.kickers = [];
      this.cliffs = [];
      this.lastType = '';
      this.sinceCoins = 0;
      this.sincePower = 0;
      this.script = opts.tutorial
        ? ['start', 'rollingEasy', 'kicker', 'rolling', 'kicker', 'rocksEasy', 'rail', 'gap']
        : ['start', 'rollingEasy'];
      this.startX = 200;
      this.ensure(4000);
    }

    // ---------- queries ----------
    difficulty(x) {
      return AR.clamp((x / AR.PHYS.PX_PER_M - 250) / 3200, 0, 1);
    }

    gapAt(x) {
      const g = this.gaps;
      let lo = 0;
      let hi = g.length - 1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (x < g[m].x0) hi = m - 1;
        else if (x >= g[m].x1) lo = m + 1;
        else return g[m];
      }
      return null;
    }

    groundAt(x) {
      const f = x / STEP;
      let i = Math.floor(f);
      const ys = this.ys;
      if (i < 0) return ys[0];
      if (i >= ys.length - 1) return ys[ys.length - 1];
      return ys[i] + (ys[i + 1] - ys[i]) * (f - i);
    }

    // Surface angle (radians, positive = downhill to the right). Next to a
    // crevasse only the solid side is sampled.
    angleAt(x) {
      if (this.gapAt(x)) return 0;
      let xa = x - STEP * 0.6;
      let xb = x + STEP * 0.6;
      if (this.gapAt(xb)) xb = x;
      if (this.gapAt(xa)) xa = x;
      if (xb - xa < 1) return 0;
      return Math.atan2(this.groundAt(xb) - this.groundAt(xa), xb - xa);
    }

    // True for height samples that lie inside a crevasse (not its rims).
    isDeep(i) {
      const g = this.gapAt(i * STEP);
      return !!g && this.ys[i] > g.yLip + DEEP * 0.5;
    }

    ensure(x) {
      while (this.endX < x) this.nextSection();
    }

    prune(x) {
      const keep = (o) => (o.x1 != null ? o.x1 : o.x) > x;
      this.rocks = this.rocks.filter(keep);
      this.rails = this.rails.filter(keep);
      this.coins = this.coins.filter(keep);
      this.powerups = this.powerups.filter(keep);
      this.trees = this.trees.filter(keep);
      this.kickers = this.kickers.filter((k) => k.lipX > x);
      this.cliffs = this.cliffs.filter(keep);
      // gaps stay sorted; drop the ones far behind
      while (this.gaps.length && this.gaps[0].x1 < x) this.gaps.shift();
    }

    // ---------- building blocks ----------
    add(slope) {
      this.endY += slope * STEP;
      this.endX += STEP;
      this.ys.push(this.endY);
      this.endS = slope;
    }

    // Append `len` units whose slope is given by fn(u) (u = distance into run).
    run(len, fn) {
      const n = Math.max(1, Math.round(len / STEP));
      for (let k = 1; k <= n; k++) this.add(fn(k * STEP, n * STEP));
    }

    baseSlope() {
      const d = this.difficulty(this.endX);
      return Math.tan((this.r.range(15, 21) + 7 * d) * DEG);
    }

    blendTo(target, len) {
      const s0 = this.endS;
      this.run(len, (u, L) => AR.lerp(s0, target, AR.smoothstep(u / L)));
    }

    addTrees(x0, x1, density) {
      let x = x0 + this.r.range(40, 200) / density;
      while (x < x1) {
        if (!this.gapAt(x) && Math.abs(this.angleAt(x)) < 0.75) {
          this.trees.push({ x, s: this.r.range(0.75, 1.35), kind: this.r() < 0.15 ? 1 : 0, shade: this.r() });
        }
        x += this.r.range(90, 320) / density;
      }
    }

    coinLine(x0, n, spacing, lift) {
      for (let i = 0; i < n; i++) {
        const x = x0 + i * spacing;
        if (this.gapAt(x)) continue;
        this.coins.push({ x, y: this.groundAt(x) - lift, taken: false });
      }
    }

    // Coins along the no-jump flight path from a kicker lip.
    coinArc(x, y, angle, v, until) {
      const G = AR.PHYS.G;
      let vx = v * Math.cos(angle);
      let vy = -v * Math.sin(angle);
      let t = 0;
      let px = x;
      let py = y - 26;
      while (px < until && t < 3) {
        t += 0.016;
        vy += G * 0.016;
        px += vx * 0.016;
        py += vy * 0.016;
        if (t > 0.1 && Math.round(t / 0.016) % 5 === 0) {
          if (py > this.groundAt(px) - 30 && !this.gapAt(px)) break;
          this.coins.push({ x: px, y: py, taken: false });
        }
      }
    }

    maybePowerup(x, lift) {
      this.sincePower += 1;
      if (this.sincePower < 3 || !this.r.chance(0.55)) return;
      this.sincePower = 0;
      const type = this.r() < 0.5 ? 'magnet' : 'shield';
      this.powerups.push({ x, y: this.groundAt(x) - lift, type, taken: false });
    }

    // ---------- sections ----------
    nextSection() {
      let type = this.script.shift();
      if (!type) {
        const d = this.difficulty(this.endX);
        const w = {
          rolling: 2.0 - d,
          kicker: 2.4,
          gap: 0.7 + 1.6 * d,
          cliff: 0.7 + 0.8 * d,
          boulders: 1.0 + 1.8 * d,
          rail: 1.2,
        };
        if (this.lastType === 'gap' || this.lastType === 'cliff') {
          w.gap *= 0.2;
          w.cliff *= 0.2;
        }
        if (this.lastType === 'rail') w.rail = 0;
        type = AR.weighted(this.r(), w);
      }
      this.lastType = type;
      const x0 = this.endX;
      this[type]();
      if (type !== 'gap' && type !== 'cliff') this.addTrees(x0, this.endX, 1);
      else this.addTrees(x0, this.endX, 0.6);
    }

    start() {
      this.run(320, () => 0.05);
      this.blendTo(0.36, 260);
      this.run(240, () => 0.36);
    }

    rollingEasy() {
      const sB = Math.tan(17 * DEG);
      const x0 = this.endX;
      this.blendTo(sB, 160);
      this.run(700, (u, L) => sB + 0.12 * Math.sin((u / 380) * AR.TAU) * AR.smoothstep(u / 120) * AR.smoothstep((L - u) / 120));
      this.coinLine(x0 + 380, 8, 44, 34);
    }

    rolling() {
      const sB = this.baseSlope();
      const d = this.difficulty(this.endX);
      const A = this.r.range(0.15, 0.32) * (1 + 0.3 * d);
      const lambda = this.r.range(320, 520);
      const L = this.r.range(700, 1300);
      const x0 = this.endX;
      this.blendTo(sB, 140);
      this.run(L, (u, len) => sB + A * Math.sin((u / lambda) * AR.TAU) * AR.smoothstep(u / 150) * AR.smoothstep((len - u) / 150));
      this.sinceCoins += 1;
      if (this.sinceCoins >= 1 && this.r.chance(0.7)) {
        this.sinceCoins = 0;
        this.coinLine(x0 + 200 + this.r.range(0, L * 0.3), this.r.int(6, 10), 42, 34);
      }
      this.maybePowerup(x0 + L * 0.7, this.r.chance(0.5) ? 46 : 96);
    }

    // Shared ramp: approach, curved take-off, lip. Returns the lip data.
    ramp(lipDeg, vmin, gap) {
      const sB = this.baseSlope();
      this.blendTo(sB * 0.55, 220);
      const sA = this.endS;
      const sL = -Math.tan(lipDeg * DEG);
      const R = this.r.range(120, 160);
      const x0 = this.endX;
      this.run(R, (u, L) => sA + (sL - sA) * Math.pow(u / L, 1.6));
      const k = { x0, lipX: this.endX, lipY: this.endY, angle: lipDeg * DEG, vmin, gap };
      this.kickers.push(k);
      return k;
    }

    landing(deg, len) {
      const sLand = Math.tan(deg * DEG);
      this.run(len, () => sLand);
      this.blendTo(this.baseSlope(), 280);
    }

    kicker() {
      const d = this.difficulty(this.endX);
      const lip = this.r.range(22, 32);
      const k = this.ramp(lip, 540 + 100 * d, false);
      // Corner at the lip: the slope drops away so the rider takes off.
      this.landing(this.r.range(33, 40), this.r.range(560, 780));
      this.coinArc(k.lipX, k.lipY, k.angle, k.vmin * 1.04, k.lipX + 700);
    }

    gap() {
      const d = this.difficulty(this.endX);
      const G = AR.PHYS.G;
      const lip = this.r.range(22, 30);
      const vmin = 650 + 160 * d;
      // Long run-in, so a rider still airborne from the previous feature
      // lands before the booster ramp instead of flying past it.
      const sB = this.baseSlope();
      this.blendTo(sB, 160);
      this.run(460, () => sB);
      const k = this.ramp(lip, vmin, true);
      const h = this.r.range(50, 90);
      // Horizontal reach of the no-jump flight down to the far edge height.
      const a = lip * DEG;
      const vy = vmin * Math.sin(a);
      const t = (vy + Math.sqrt(vy * vy + 2 * G * h)) / G;
      const reach = vmin * Math.cos(a) * t;
      const W = Math.round(AR.clamp(reach * (0.5 + 0.12 * d), 170, 520) / STEP) * STEP;
      // x0 is the lip, x1 the far edge (exclusive).
      const gap = { x0: this.endX, x1: this.endX + W, yLip: this.endY, yFar: this.endY + h };
      const deep = this.endY + DEEP;
      for (let i = 0; i < W / STEP - 1; i++) {
        this.endX += STEP;
        this.ys.push(deep);
      }
      this.endX += STEP;
      this.endY = gap.yFar;
      this.ys.push(this.endY);
      this.endS = Math.tan(32 * DEG);
      this.gaps.push(gap);
      this.landing(this.r.range(30, 36), this.r.range(560, 760));
      this.coinArc(k.lipX, k.lipY, k.angle, vmin * 1.02, gap.x1 + 260);
    }

    cliff() {
      const sB = this.baseSlope();
      const d = this.difficulty(this.endX);
      this.blendTo(sB * 0.7, 160);
      this.run(120, () => sB * 0.7);
      const D = this.r.range(160, 300) + 100 * d;
      const sF = Math.tan(62 * DEG);
      this.cliffs.push({ x: this.endX, y: this.endY });
      this.run(D / sF, () => sF);
      const sLand = Math.tan(36 * DEG);
      this.run(140, (u, L) => AR.lerp(sF, sLand, AR.smoothstep(u / L)));
      this.landing(36, this.r.range(380, 560));
    }

    rocksEasy() {
      const sB = Math.tan(16 * DEG);
      const x0 = this.endX;
      this.blendTo(sB, 140);
      this.run(1100, () => sB);
      this.rock(x0 + 520, 20);
    }

    // Rock groups are either a single rock or a tight pair cleared with one
    // jump; groups sit further apart than a full jump, so a landing never
    // comes down on the next rock.
    boulders() {
      const sB = this.baseSlope();
      const d = this.difficulty(this.endX);
      const n = Math.min(3, 1 + Math.floor(this.r() * (1.3 + 2 * d)));
      const spacing = this.r.range(1100, 1350) + 250 * d;
      const L = 820 + (n - 1) * spacing + 500;
      const x0 = this.endX;
      this.blendTo(sB, 140);
      this.run(L, (u, len) => sB + 0.06 * Math.sin((u / 400) * AR.TAU) * AR.smoothstep(u / 120) * AR.smoothstep((len - u) / 120));
      for (let i = 0; i < n; i++) {
        const x = x0 + 820 + i * spacing;
        this.rock(x, this.r.range(18, 28 + 4 * d));
        if (this.r.chance(0.25 + 0.35 * d)) this.rock(x + this.r.range(70, 110), this.r.range(16, 22));
      }
    }

    rock(x, r) {
      const y = this.groundAt(x);
      this.rocks.push({ x, y, r, seed: this.r() * 1000, smashed: false });
      // A small coin arc over the rock rewards jumping it.
      for (let i = -2; i <= 2; i++) {
        const cx = x + i * 40;
        this.coins.push({ x: cx, y: this.groundAt(cx) - 92 + i * i * 9, taken: false });
      }
    }

    rail() {
      const sB = this.baseSlope();
      const sR = sB * 0.85;
      const len = this.r.range(380, 620);
      const x0 = this.endX;
      this.blendTo(sR, 140);
      this.run(220 + len + 260, () => sR);
      const rx0 = x0 + 140 + 220;
      const rx1 = rx0 + len;
      const h = 40;
      const rail = { x0: rx0, y0: this.groundAt(rx0) - h, x1: rx1, y1: this.groundAt(rx1) - h };
      this.rails.push(rail);
      for (let x = rx0 + 30; x < rx1 - 10; x += 46) {
        const y = rail.y0 + ((x - rx0) / (rx1 - rx0)) * (rail.y1 - rail.y0);
        this.coins.push({ x, y: y - 34, taken: false });
      }
      this.maybePowerup(rx1 + 160, 46);
    }
  }

  AR.World = World;
  AR.World.STEP = STEP;
})(window.AR);
