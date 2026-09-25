'use strict';
// Infinite, deterministic slope generation in square cells.
(function (YR) {
  const CELL = 240;
  const UNITS_PER_M = 10;

  class World {
    constructor(seed) {
      this.seed = seed;
      this.cells = new Set();
      this.objs = [];
    }

    difficulty(yWorld) {
      const m = yWorld / UNITS_PER_M;
      return YR.clamp(m / 3000, 0, 1);
    }

    ensure(left, right, top, bottom) {
      const cx0 = Math.floor(left / CELL), cx1 = Math.floor(right / CELL);
      const cy0 = Math.max(0, Math.floor(top / CELL)), cy1 = Math.floor(bottom / CELL);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cx + ',' + cy;
          if (!this.cells.has(key)) {
            this.cells.add(key);
            this.generate(cx, cy);
          }
        }
      }
    }

    prune(top) {
      const row = Math.floor(top / CELL) - 1;
      if (this.objs.length > 0) this.objs = this.objs.filter((o) => o.y > top - 160);
      if (this.cells.size > 400) {
        for (const key of this.cells) {
          const cy = +key.split(',')[1];
          if (cy < row) this.cells.delete(key);
        }
      }
    }

    free(list, x, y, r) {
      for (const o of list) {
        const d = Math.hypot(o.x - x, o.y - y);
        if (d < r + (o.space || 30)) return false;
      }
      return true;
    }

    generate(cx, cy) {
      const r = YR.rng(YR.hash3(cx, cy, this.seed));
      const x0 = cx * CELL, y0 = cy * CELL;
      const d = this.difficulty(y0);
      const meters = y0 / UNITS_PER_M;
      const local = [];
      const startZone = (x, y) => y < 900 && Math.abs(x) < 260 + y * 0.1;

      const add = (o) => {
        if (startZone(o.x, o.y)) return false;
        if (!this.free(local, o.x, o.y, o.space || 30)) return false;
        local.push(o);
        return true;
      };

      const table = {
        pine: 40,
        bush: 6,
        rock: 10 + d * 6,
        stump: meters > 150 ? 5 : 0,
        snowman: meters > 300 ? 3 : 0,
        mogul: 9,
        ice: meters > 500 ? 4 + d * 4 : 0,
        ramp: meters > 60 ? 5 : 0,
        crystals: 12,
        gate: meters > 100 ? 5 : 0,
        cocoa: meters > 400 ? 0.9 : 0,
        star: meters > 250 ? 0.9 : 0,
      };

      const n = Math.floor(1 + r() * (2.2 + d * 3.2));
      for (let i = 0; i < n; i++) {
        const type = YR.weighted(r(), table);
        const x = x0 + 20 + r() * (CELL - 40);
        const y = y0 + 20 + r() * (CELL - 40);
        switch (type) {
          case 'pine': {
            const k = [0.8, 1, 1.25][(r() * 3) | 0];
            add({ type: 'pine', x, y, k, v: (r() * 2) | 0, r: 8 * k, space: 22 * k });
            // Trees like company – sometimes spawn a small grove
            if (r() < 0.35) {
              for (let j = 0; j < 2; j++) {
                const k2 = [0.8, 1][(r() * 2) | 0];
                add({ type: 'pine', x: x + (r() - 0.5) * 110, y: y + (r() - 0.5) * 70, k: k2, v: (r() * 2) | 0, r: 8 * k2, space: 22 * k2 });
              }
            }
            break;
          }
          case 'bush': add({ type: 'bush', x, y, k: 1, r: 12, space: 22 }); break;
          case 'rock': {
            const k = r() < 0.3 ? 1.3 : 0.9;
            add({ type: 'rock', x, y, k, v: (r() * 4) | 0, r: 17 * k, space: 26 * k });
            break;
          }
          case 'stump': add({ type: 'stump', x, y, r: 10, space: 18 }); break;
          case 'snowman': add({ type: 'snowman', x, y, r: 14, space: 24 }); break;
          case 'mogul': {
            const cnt = 1 + ((r() * 3) | 0);
            for (let j = 0; j < cnt; j++) add({ type: 'mogul', x: x + j * 56 - 30, y: y + (j % 2) * 30, v: (r() * 2) | 0, flat: true, space: 30 });
            break;
          }
          case 'ice': add({ type: 'ice', x, y, v: (r() * 3) | 0, flat: true, space: 70 }); break;
          case 'ramp': add({ type: 'ramp', x, y, space: 70 }); break;
          case 'crystals': {
            const cnt = 3 + ((r() * 3) | 0);
            const curve = (r() - 0.5) * 60;
            for (let j = 0; j < cnt; j++) {
              const t = j / (cnt - 1);
              add({ type: 'crystal', x: x + Math.sin(t * Math.PI) * curve, y: y - 70 + j * 42, pickup: true, space: 8 });
            }
            break;
          }
          case 'gate': {
            const gap = 120 - d * 35;
            const gx = x0 + CELL / 2 + (r() - 0.5) * 60;
            const color = cy % 2 ? YR.Art.C.red : YR.Art.C.blue;
            add({ type: 'gate', x: gx, y, gap, color, space: gap / 2 + 20 });
            break;
          }
          case 'cocoa': add({ type: 'cocoa', x, y, pickup: true, space: 30 }); break;
          case 'star': add({ type: 'star', x, y, pickup: true, space: 30 }); break;
        }
      }
      for (const o of local) this.objs.push(o);
    }
  }

  YR.World = World;
  YR.CELL = CELL;
  YR.UNITS_PER_M = UNITS_PER_M;
})(window.YR);
