'use strict';
// Builds a playable resort from a mountain definition: terrain, lifts, pistes,
// forests, buildings, park features, ziplines, collectibles and challenges.
(function (GS) {
  const P = GS.Props;
  const M = GS.M;
  const OBJ_CELL = 16;
  const RCHUNK = GS.Terrain.CS * GS.Terrain.CHUNK; // 128 m render chunks

  const PISTE_COL = { green: '#2a9d4f', blue: '#2f6feb', red: '#e63946', black: '#1b1f24' };

  class World {
    constructor(def, renderer, opts) {
      this.def = def;
      this.r = renderer;
      this.opts = opts || {};
      this.theme = def.theme;
      this.rand = GS.rng(def.seed * 13 + 5);
      this.terrain = new GS.Terrain(def);
      this.W = def.W;
      this.L = def.L;
      this.lifts = [];
      this.pistes = [];
      this.obstacles = [];
      this.obsGrid = new Map();
      this.grinds = [];
      this.kickers = [];
      this.zips = [];
      this.launches = [];
      this.vents = [];
      this.lamps = [];
      this.collectibles = [];
      this.buildings = [];
      this.statics = new Map();
      this.inst = new Map();
      this.huts = [];
      this.time = 0;
    }

    async build(progress) {
      const step = async (p, label) => {
        if (progress) progress(p, label);
        await new Promise((r) => setTimeout(r, 0));
      };
      const T = this.terrain;
      await step(0.05, 'terrain');
      T.generateBase();
      await step(0.25, 'lifts');
      this._layoutLifts();
      this._layoutPistes();
      await step(0.35, 'pistes');
      T.groomPistes(this.pistes);
      for (const l of this.lifts) {
        l.B.y = T.pad(l.B.x, l.B.z, 12, 16);
        l.T.y = T.pad(l.T.x, l.T.z, 11, 14);
      }
      this._layoutVillage();
      this._layoutHuts();
      if (this.def.skijump) this._layoutSkiJump();
      T.finalize();
      this._pisteMeta();
      await step(0.5, 'objects');
      this._buildLifts();
      this._buildPisteDeco();
      this._buildPark();
      this._buildZips();
      this._buildLaunches();
      this._buildBuildings();
      this._buildDeco();
      this._placeTrees();
      this._placeCollectibles();
      await step(0.7, 'challenges');
      this.challenges = GS.Challenges.generate(this);
      for (const ch of this.challenges) GS.Challenges.calibrate(this, ch);
      await step(0.8, 'meshes');
      this.terrainChunks = T.buildChunks(this.r, this.theme);
      this._uploadObjects();
      await step(1, 'done');
    }

    // ---------- Layout ---------------------------------------------------------
    _layoutLifts() {
      const { W, L } = this;
      this.def.lifts.forEach((ld, i) => {
        const B = { x: ld.b[0] * W, z: ld.b[1] * L, y: 0 };
        const Tp = { x: ld.t[0] * W, z: ld.t[1] * L, y: 0 };
        const dx = Tp.x - B.x, dz = Tp.z - B.z;
        const len = Math.hypot(dx, dz);
        const dir = { x: dx / len, z: dz / len };
        const side = { x: -dir.z, z: dir.x }; // right of the uphill direction
        this.lifts.push({
          id: i, def: ld, type: ld.type, name: ld.name, color: ld.color, cost: ld.cost || 0,
          B, T: Tp, dir, side, len, yaw: Math.atan2(dir.x, dir.z),
        });
      });
    }

    _liftTopExit(l) {
      // beside the top station on the downhill side
      const s = l.side.x * (l.T.x < this.W / 2 ? 1 : -1) >= 0 ? 1 : -1;
      return { x: l.T.x + l.side.x * 11 * s, z: l.T.z + 9 + l.side.z * 11 * s };
    }

    _liftBottomEntry(l) {
      const s = l.id % 2 ? 1 : -1;
      return { x: l.B.x + l.dir.x * 10 + l.side.x * 10 * s, z: l.B.z + l.dir.z * 10 + l.side.z * 10 * s };
    }

    _layoutPistes() {
      const T = this.terrain, r = this.rand;
      const names = GS.PISTE_NAMES[this.theme.deco] || GS.PISTE_NAMES.alpine;
      const margin = 128;
      this.def.pistes.forEach(([from, to], id) => {
        const a = this._liftTopExit(this.lifts[from]);
        const b = this._liftBottomEntry(this.lifts[to]);
        const pts = [];
        const steps = Math.max(6, Math.ceil(Math.abs(b.z - a.z) / 14));
        const amp = 18 + r() * 45, waves = 1 + r() * 2.5, ph = r() * 6.28;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const z = GS.lerp(a.z, b.z, t);
          let x = GS.lerp(a.x, b.x, t * t * (3 - 2 * t)) + Math.sin(t * Math.PI * waves + ph) * amp * Math.sin(t * Math.PI);
          x = GS.clamp(x, margin, this.W - margin);
          pts.push({ x, z });
        }
        // terrain-aware nudging: avoid cliffs and strong cross slopes
        for (let pass = 0; pass < 4; pass++) {
          for (let k = 2; k < pts.length - 2; k++) {
            const p = pts[k];
            let best = p.x, bestC = 1e9;
            for (let o = -24; o <= 24; o += 6) {
              const x = GS.clamp(p.x + o, margin, this.W - margin);
              const g = T.gradAt(x, p.z, [0, 0]);
              const steep = Math.max(0, Math.hypot(g[0], g[1]) - 0.55);
              let c = Math.abs(g[0]) * 2 + steep * 6 + Math.abs(o) * 0.012;
              for (const l of this.lifts) {
                const dl = this._distToLift(l, x, p.z);
                if (dl < 22) c += (22 - dl) * 0.12;
              }
              if (c < bestC) { bestC = c; best = x; }
            }
            p.x = best;
          }
          for (let k = 1; k < pts.length - 1; k++) pts[k].x = (pts[k - 1].x + pts[k].x * 2 + pts[k + 1].x) / 4;
        }
        // densify (catmull-rom) for smooth course sampling
        const dense = [];
        for (let k = 0; k < pts.length - 1; k++) {
          const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
          for (let q = 0; q < 3; q++) {
            const t = q / 3, t2 = t * t, t3 = t2 * t;
            const cr = (a0, a1, a2, a3) => 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 + (-a0 + 3 * a1 - 3 * a2 + a3) * t3);
            dense.push({ x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) });
          }
        }
        dense.push(pts[pts.length - 1]);
        const cum = [0];
        for (let k = 1; k < dense.length; k++) cum.push(cum[k - 1] + Math.hypot(dense[k].x - dense[k - 1].x, dense[k].z - dense[k - 1].z));
        this.pistes.push({
          id, from, to, pts: dense, cum, len: cum[cum.length - 1],
          width: 20 + r() * 10, smooth: 1 + (r() > 0.5 ? 1 : 0),
          name: names[id % names.length] + (id >= names.length ? ' ' + (1 + Math.floor(id / names.length)) : ''),
          num: id + 1,
        });
      });
    }

    _pisteMeta() {
      const T = this.terrain;
      for (const p of this.pistes) {
        const slopes = [];
        for (let s = 0; s < p.len; s += 8) {
          const q = this.pisteAt(p, s);
          slopes.push(T.slopeAt(q.x, q.z));
        }
        slopes.sort((a, b) => b - a);
        const top = slopes.slice(0, Math.max(1, Math.floor(slopes.length * 0.15)));
        const steep = top.reduce((a, b) => a + b, 0) / top.length;
        p.steep = steep;
        p.diff = steep < 0.24 ? 'green' : steep < 0.36 ? 'blue' : steep < 0.52 ? 'red' : 'black';
        p.color = PISTE_COL[p.diff];
        p.drop = T.heightAt(p.pts[0].x, p.pts[0].z) - T.heightAt(p.pts[p.pts.length - 1].x, p.pts[p.pts.length - 1].z);
      }
    }

    // Position/tangent on a piste at arc length s.
    pisteAt(p, s, out) {
      out = out || {};
      s = GS.clamp(s, 0, p.len);
      const cum = p.cum;
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= s) lo = mid; else hi = mid;
      }
      const a = p.pts[lo], b = p.pts[hi];
      const seg = cum[hi] - cum[lo] || 1;
      const t = (s - cum[lo]) / seg;
      out.x = a.x + (b.x - a.x) * t;
      out.z = a.z + (b.z - a.z) * t;
      out.tx = (b.x - a.x) / seg;
      out.tz = (b.z - a.z) / seg;
      return out;
    }

    // Closest arc length on a piste to a point (coarse + refine).
    pisteProject(p, x, z, hint) {
      let best = 0, bd = 1e18;
      const pts = p.pts;
      let k0 = 0, k1 = pts.length - 1;
      if (hint != null) {
        let lo = 0, hi = p.cum.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (p.cum[mid] <= hint) lo = mid; else hi = mid;
        }
        k0 = Math.max(0, lo - 12);
        k1 = Math.min(pts.length - 1, lo + 12);
      }
      for (let k = k0; k < k1; k++) {
        const a = pts[k], b = pts[k + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const l2 = dx * dx + dz * dz || 1;
        let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
        t = GS.clamp(t, 0, 1);
        const px = a.x + dx * t, pz = a.z + dz * t;
        const d = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (d < bd) { bd = d; best = p.cum[k] + Math.sqrt(l2) * t; }
      }
      return { s: best, d: Math.sqrt(bd) };
    }

    _layoutVillage() {
      const T = this.terrain, r = this.rand;
      const base = this.lifts[0].B;
      this.village = [];
      const tries = 60;
      let placed = 0;
      for (let k = 0; k < tries && placed < 9; k++) {
        const a = Math.PI * (0.05 + r() * 0.9);
        const d = 40 + r() * 90;
        const x = base.x + Math.cos(a) * d * (r() > 0.5 ? 1 : -1) * 1.4;
        const z = Math.min(this.L - 26, base.z + Math.sin(a) * d * 0.35 + 10);
        if (!this._freeSpot(x, z, 16, true)) continue;
        const y = T.pad(x, z, 8, 10);
        this.village.push({ x, z, y, yaw: (r() - 0.5) * 0.6 + (r() > 0.5 ? Math.PI : 0), seed: (r() * 1e6) | 0 });
        this.buildings.push({ x, z, r: 9 });
        placed++;
      }
    }

    _layoutHuts() {
      const T = this.terrain, r = this.rand;
      const want = Math.min(3, this.pistes.length);
      for (let k = 0; k < this.pistes.length && this.huts.length < want; k += 2) {
        const p = this.pistes[k];
        const q = this.pisteAt(p, p.len * (0.35 + r() * 0.3));
        const side = r() > 0.5 ? 1 : -1;
        const nx = -q.tz * side, nz = q.tx * side;
        const off = p.width / 2 + 14;
        const x = q.x + nx * off, z = q.z + nz * off;
        if (!this._freeSpot(x, z, 14, true)) continue;
        const y = T.pad(x, z, 10, 12);
        const yaw = Math.atan2(-nx, -nz);
        this.huts.push({ x, z, y, yaw, seed: (r() * 1e6) | 0, name: this._hutName(this.huts.length) });
        this.buildings.push({ x, z, r: 12 });
      }
    }

    _hutName(i) {
      const n = {
        alpine: ['Gamshütte', 'Almstüberl', 'Edelweißhütte'], nordic: ['Hytte Nord', 'Elchhütte', 'Lavvu'],
        japan: ['Onsen-Hütte', 'Ramen-Ya', 'Teehaus'], volcano: ['Aschehütte', 'Basalt-Bar', 'Lavastube'],
        canyon: ['Mesa Diner', 'Coyote Café', 'Trading Post'], crystal: ['Kristallgrotte', 'Mondhütte', 'Prismabar'],
        arena: ['VIP-Lounge', 'Zielstadion', 'Athletenhaus'], himalaya: ['Sherpa-Lodge', 'Teehaus', 'Klosterhütte'],
      };
      const l = n[this.theme.deco] || n.alpine;
      return l[i % l.length];
    }

    _layoutSkiJump() {
      const T = this.terrain;
      const x = this.W * 0.2, z0 = this.L * 0.42;
      const len = 150;
      const edgeZ = z0 + 70;
      const edgeY = T.rawHeight(x, edgeZ) + 2;
      // landing hill profile below the table edge
      const prof = [];
      let y = edgeY - 3.2, slope = 0.18;
      for (let u = 0; u <= len; u += 1) {
        prof.push(y);
        const t = u / len;
        slope = t < 0.18 ? GS.lerp(0.18, 0.56, t / 0.18) : t < 0.6 ? 0.56 : GS.lerp(0.56, 0.06, (t - 0.6) / 0.4);
        y -= slope;
        // never dig a trench much deeper than the natural slope
        const nat = T.rawHeight(x, edgeZ + u + 1);
        if (y < nat - 9) y = GS.lerp(y, nat - 9, 0.5);
      }
      T.shapeStrip(x, edgeZ, 0, 1, len, 40, (u) => prof[Math.min(prof.length - 1, Math.round(u))]);
      // flatten outrun into terrain
      const inrun = [];
      // inrun: 58 m at ~35°, curved transition, 8 m table at -10°
      let iy = edgeY, iu = 0;
      const pts = [[0, edgeY]];
      for (let u = 1; u <= 70; u++) {
        const back = u;
        let s;
        if (back < 8) s = 0.18;
        else if (back < 22) s = GS.lerp(0.18, 0.72, (back - 8) / 14);
        else s = 0.72;
        iy += s;
        pts.push([-u, iy]);
      }
      pts.reverse();
      for (const [u, yy] of pts) inrun.push([u + 70, yy]);
      void iu;
      const sj = {
        x, z0, edgeZ, edgeY, len, prof,
        inrun: inrun.map(([u, yy]) => [u, yy]), // u from 0 (top) to 70 (edge), absolute y
        topY: inrun[0][1],
      };
      this.skijump = sj;
      const self = this;
      T.addFeature({
        minx: x - 2, maxx: x + 2, minz: z0 - 1, maxz: edgeZ + 0.6,
        height(px, pz) {
          if (Math.abs(px - x) > 1.6) return 0;
          const u = pz - z0;
          if (u < 0 || u > 70.5) return 0;
          const k = Math.min(69, Math.floor(u));
          const t = u - k;
          const yy = GS.lerp(sj.inrun[k][1], sj.inrun[k + 1][1], t);
          return Math.max(0, yy - self.terrain.rawHeight(px, pz));
        },
      });
      this.buildings.push({ x, z: z0 + 35, r: 0, skip: true });
    }

    // Spot is free of pistes, lifts and buildings.
    _freeSpot(x, z, r, allowNearPiste) {
      if (x < 120 || x > this.W - 120 || z < 30 || z > this.L - 20) return false;
      const d = this.terrain.pisteDistAt(x, z);
      if (d < (allowNearPiste ? 4 : 10) + (allowNearPiste ? 0 : r)) return false;
      for (const l of this.lifts) {
        if (this._distToLift(l, x, z) < r + 8) return false;
        if (Math.hypot(l.B.x - x, l.B.z - z) < r + 18) return false;
        if (Math.hypot(l.T.x - x, l.T.z - z) < r + 16) return false;
      }
      for (const b of this.buildings) if (Math.hypot(b.x - x, b.z - z) < r + b.r) return false;
      return true;
    }

    _distToLift(l, x, z) {
      const px = x - l.B.x, pz = z - l.B.z;
      let t = (px * l.dir.x + pz * l.dir.z) / l.len;
      t = GS.clamp(t, 0, 1);
      const cx = l.B.x + l.dir.x * l.len * t, cz = l.B.z + l.dir.z * l.len * t;
      return Math.hypot(x - cx, z - cz);
    }

    // ---------- Object registration --------------------------------------------
    _chunkKey(x, z) {
      return Math.floor(x / RCHUNK) + ',' + Math.floor(z / RCHUNK);
    }

    addStatic(mesh, x, y, z, yaw, scale, pitch, roll) {
      const m = M.create();
      M.translate(m, x, y, z);
      if (yaw) M.rotY(m, yaw);
      if (pitch) M.rotX(m, pitch);
      if (roll) M.rotZ(m, roll);
      if (scale && scale !== 1) M.scale(m, scale, scale, scale);
      this.addStaticM(mesh, m, x, z);
    }

    addStaticM(mesh, m, x, z) {
      const key = this._chunkKey(x, z);
      let b = this.statics.get(key);
      if (!b) this.statics.set(key, (b = new GS.MeshBuilder()));
      b.mat = m;
      b.append(mesh);
    }

    addInstance(proto, x, y, z, yaw, sx, sy, sz, snow) {
      const key = this._chunkKey(x, z);
      let m = this.inst.get(key);
      if (!m) this.inst.set(key, (m = new Map()));
      let a = m.get(proto);
      if (!a) m.set(proto, (a = []));
      a.push(x, y, z, yaw, sx, sy, sz, snow);
    }

    addObstacle(o) {
      const i = this.obstacles.length;
      this.obstacles.push(o);
      const r = o.r + (o.hx ? Math.max(o.hx, o.hz) : 0);
      const x0 = Math.floor((o.x - r) / OBJ_CELL), x1 = Math.floor((o.x + r) / OBJ_CELL);
      const z0 = Math.floor((o.z - r) / OBJ_CELL), z1 = Math.floor((o.z + r) / OBJ_CELL);
      for (let a = x0; a <= x1; a++) {
        for (let b = z0; b <= z1; b++) {
          const k = a * 8192 + b;
          let l = this.obsGrid.get(k);
          if (!l) this.obsGrid.set(k, (l = []));
          l.push(i);
        }
      }
    }

    // Calls fn(obstacle) for obstacles whose cell overlaps (x±r, z±r).
    forObstacles(x, z, r, fn) {
      const x0 = Math.floor((x - r) / OBJ_CELL), x1 = Math.floor((x + r) / OBJ_CELL);
      const z0 = Math.floor((z - r) / OBJ_CELL), z1 = Math.floor((z + r) / OBJ_CELL);
      for (let a = x0; a <= x1; a++) {
        for (let b = z0; b <= z1; b++) {
          const l = this.obsGrid.get(a * 8192 + b);
          if (!l) continue;
          for (const i of l) if (fn(this.obstacles[i]) === true) return;
        }
      }
    }

    // ---------- Lifts ------------------------------------------------------------
    _buildLifts() {
      const T = this.terrain;
      for (const l of this.lifts) {
        const cfg = l.type === 'gondola' ? { hang: 2.7, clear: 3.2, pyl: 12, spacing: 42, speed: 9 }
          : l.type === 'tbar' ? { hang: 0, clear: 4.4, pyl: 6.5, spacing: 14, speed: 6 }
            : { hang: 3.3, clear: 2.6, pyl: 9.5, spacing: 20, speed: 7.5 };
        l.cfg = cfg;
        const g = (u) => T.rawHeight(l.B.x + l.dir.x * u, l.B.z + l.dir.z * u);
        const stH = l.type === 'tbar' ? 5.4 : 4.4;
        const sup = [{ u: 0, y: l.B.y + stH, station: true }];
        const n = Math.max(1, Math.round(l.len / 70) - 1);
        for (let k = 1; k <= n; k++) {
          const u = (l.len * k) / (n + 1);
          sup.push({ u, y: g(u) + cfg.pyl });
        }
        sup.push({ u: l.len, y: l.T.y + stH, station: true });
        const need = (u) => g(u) + cfg.hang + cfg.clear;
        // keep towers off the pistes
        const offPiste = (u) => {
          const at = (uu) => T.pisteDistAt(l.B.x + l.dir.x * uu, l.B.z + l.dir.z * uu);
          if (at(u) >= 3) return u;
          for (let du = 4; du <= 32; du += 4) {
            for (const sgn of [1, -1]) {
              const uu = u + du * sgn;
              if (uu > 20 && uu < l.len - 20 && at(uu) >= 3) return uu;
            }
          }
          return u;
        };
        for (const sp of sup) if (!sp.station) { sp.u = offPiste(sp.u); sp.y = g(sp.u) + cfg.pyl; }
        sup.sort((a, b) => a.u - b.u);
        for (let it = 0; it < 12; it++) {
          let changed = false;
          for (let k = 0; k < sup.length - 1; k++) {
            const a = sup[k], b = sup[k + 1];
            let worst = 0, wu = 0;
            for (let u = a.u + 4; u < b.u - 4; u += 4) {
              const y = GS.lerp(a.y, b.y, (u - a.u) / (b.u - a.u));
              const d = need(u) - y;
              if (d > worst) { worst = d; wu = u; }
            }
            if (worst > 0.05) {
              changed = true;
              if (a.station && b.station || b.u - a.u > 140) {
                const uu = offPiste(wu);
                sup.splice(k + 1, 0, { u: uu, y: g(uu) + cfg.pyl + worst * 0.5 });
                sup.sort((x, y) => x.u - y.u);
              } else {
                if (!a.station) a.y += worst + 0.3;
                if (!b.station) b.y += worst + 0.3;
              }
              break;
            }
          }
          if (!changed) break;
        }
        l.sup = sup;
        // stations
        const sm = P.station(l.color, false);
        this.addStatic(sm, l.B.x, l.B.y, l.B.z, l.yaw);
        this.addStatic(P.station(l.color, true), l.T.x, l.T.y, l.T.z, l.yaw);
        for (const st of [l.B, l.T]) {
          for (const sx of [-5, 5]) for (const sz of [-3.5, 3.5]) {
            const ox = l.dir.z * sx + l.dir.x * sz, oz = -l.dir.x * sx + l.dir.z * sz;
            this.addObstacle({ x: st.x + ox, z: st.z + oz, r: 0.5, top: 6, kind: 'post' });
          }
        }
        // pylons
        for (const s of sup) {
          if (s.station) continue;
          const x = l.B.x + l.dir.x * s.u, z = l.B.z + l.dir.z * s.u;
          const gy = T.rawHeight(x, z);
          this.addStatic(P.pylon(s.y - gy + 0.35, l.color), x, gy, z, l.yaw);
          this.addObstacle({ x, z, r: 0.7, top: s.y - gy, kind: 'pylon' });
        }
        // chairs: loop parameter q in [0, 2len)
        const loop = l.len * 2;
        l.loop = loop;
        l.count = Math.max(4, Math.floor(loop / cfg.spacing));
        l.spacing = loop / l.count;
        l.offset = 0;
        l.speed = cfg.speed;
        l.boost = 1;
        const cm = l.type === 'gondola' ? P.gondola(l.color) : l.type === 'tbar' ? P.tbar(l.color) : P.chair(l.color);
        l.chairMesh = cm;
        l.chairData = new Float32Array(l.count * 8);
        l.cableMesh = this._cableMesh(l);
        l.unlocked = true;
      }
    }

    // Cable (two lines) as a static thin-box mesh.
    _cableMesh(l) {
      const b = new GS.MeshBuilder();
      b.col('#2a2f36');
      for (const off of [-2.6, 2.6]) {
        for (let k = 0; k < l.sup.length - 1; k++) {
          const a = l.sup[k], c = l.sup[k + 1];
          const ax = l.B.x + l.dir.x * a.u + l.side.x * off, az = l.B.z + l.dir.z * a.u + l.side.z * off;
          const cx = l.B.x + l.dir.x * c.u + l.side.x * off, cz = l.B.z + l.dir.z * c.u + l.side.z * off;
          const m = M.segment(new Float32Array(16), ax, a.y, az, cx, c.y, cz, 0.07, 0.07, 0, 1, 0);
          b.mat = m;
          b.box(0, 0.5, 0, 1, 1, 1);
        }
      }
      return b;
    }

    // Cable position for loop parameter q.
    cableAt(l, q, out) {
      q = ((q % l.loop) + l.loop) % l.loop;
      let u, off, up;
      if (q < l.len) { u = q; off = 2.6; up = true; } else { u = l.loop - q; off = -2.6; up = false; }
      const sup = l.sup;
      let k = 0;
      while (k < sup.length - 2 && sup[k + 1].u < u) k++;
      const a = sup[k], b = sup[k + 1];
      const t = GS.clamp((u - a.u) / (b.u - a.u || 1), 0, 1);
      out.x = l.B.x + l.dir.x * u + l.side.x * off;
      out.z = l.B.z + l.dir.z * u + l.side.z * off;
      out.y = GS.lerp(a.y, b.y, t);
      out.u = u;
      out.up = up;
      return out;
    }

    chairQ(l, k) {
      return (k * l.spacing + l.offset) % l.loop;
    }

    // ---------- Piste decoration ---------------------------------------------------
    _buildPisteDeco() {
      const T = this.terrain;
      const deco = this.theme.deco;
      for (const p of this.pistes) {
        const mk = P.pisteMarker(p.color);
        const q = {};
        for (let s = 20; s < p.len - 20; s += 34) {
          this.pisteAt(p, s, q);
          const nx = -q.tz, nz = q.tx;
          for (const side of [-1, 1]) {
            const x = q.x + nx * side * (p.width / 2 + 1.5), z = q.z + nz * side * (p.width / 2 + 1.5);
            this.addStatic(mk, x, T.rawHeight(x, z) - 0.05, z, 0);
          }
          if ((this.def.lamps) && Math.floor(s / 34) % 2 === 0) {
            const side = Math.floor(s / 68) % 2 ? 1 : -1;
            const x = q.x + nx * side * (p.width / 2 + 4), z = q.z + nz * side * (p.width / 2 + 4);
            if (T.pisteDistAt(x, z) < 1.5) continue;
            const yaw = Math.atan2(-nx * side, -nz * side) - Math.PI / 2;
            if (deco === 'japan') this.addStatic(P.stoneLantern(), x, T.rawHeight(x, z), z, yaw);
            else this.addStatic(P.lamp(), x, T.rawHeight(x, z), z, yaw + Math.PI / 2);
            const ly = T.rawHeight(x, z) + (deco === 'japan' ? 1.9 : 5.6);
            const lx = deco === 'japan' ? x : x + Math.cos(yaw + Math.PI / 2) * 1, lz = deco === 'japan' ? z : z - Math.sin(yaw + Math.PI / 2) * 1;
            this.lamps.push({ x: lx, z: lz, y: ly, i: deco === 'japan' ? 0.35 : 0.55 });
            this.addObstacle({ x, z, r: 0.35, top: 6, kind: 'post' });
          }
        }
        // start sign
        this.pisteAt(p, 6, q);
        const sx = q.x - q.tz * (p.width / 2 + 3), sz = q.z + q.tx * (p.width / 2 + 3);
        if (T.pisteDistAt(sx, sz) > 0.5) this.addStatic(P.signPost(p.color), sx, T.rawHeight(sx, sz), sz, Math.atan2(q.tx, q.tz) + Math.PI);
        p.sign = { x: sx, z: sz };
        if (deco === 'japan') {
          this.pisteAt(p, 24, q);
          // local +x of the gate runs along the piste normal (-tz, tx)
          const x = q.x + 2.3 * q.tz, z = q.z - 2.3 * q.tx;
          const yaw = Math.atan2(-q.tx, -q.tz);
          this.addStatic(P.torii(), x, T.rawHeight(q.x, q.z) - 0.1, z, yaw);
          this.addObstacle({ x, z, r: 0.4, top: 5, kind: 'post' });
          this.addObstacle({ x: x - q.tz * 4.6, z: z + q.tx * 4.6, r: 0.4, top: 5, kind: 'post' });
        }
      }
    }

    // ---------- Park (kickers, rails, boxes) ---------------------------------------
    // Kicker ramp as an analytic height feature. "lift" raises the ramp's
    // base line towards horizontal so the lip points upwards even on steep
    // slopes (big-air kickers stand on scaffolding).
    addKicker(x, z, dirx, dirz, len, height, width, tag, lift) {
      const T = this.terrain;
      lift = lift == null ? 0.4 : lift;
      const yaw = Math.atan2(dirx, dirz);
      const k = { x, z, dirx, dirz, len, height, width, tag, yaw };
      const groundAt = (u) => T.rawHeight(x + dirx * u, z + dirz * u);
      const y0 = groundAt(0);
      const yEnd = groundAt(len);
      k.y0 = y0;
      k.slope = Math.max(0, (y0 - yEnd) / len);
      const bs = k.slope * (1 - lift);
      k.baseSlope = bs;
      T.addFeature({
        minx: x - len - width, maxx: x + len + width, minz: z - len - width, maxz: z + len + width,
        height(px, pz) {
          const dx = px - x, dz = pz - z;
          const u = dx * dirx + dz * dirz;
          const v = -dx * dirz + dz * dirx;
          if (u < 0 || u > len + 0.6 || Math.abs(v) > width / 2 + 0.6) return 0;
          const hh = u <= len ? height * Math.pow(u / len, 1.6) : height * (1 - (u - len) / 0.6);
          const side = 1 - GS.smooth(width / 2, width / 2 + 0.6, Math.abs(v));
          const base = y0 - bs * Math.min(u, len);
          const ground = T.rawHeight(px, pz);
          return Math.max(0, (base + hh) - ground) * side;
        },
      });
      const depth = 0.4 + (k.slope - bs) * len;
      const mesh = P.kicker(len, height, width, this.theme.groomed, depth);
      const m = M.create();
      M.translate(m, x, y0, z);
      M.rotY(m, yaw);
      const sh = M.create();
      sh[9] = -bs;
      const out = M.create();
      M.mul(out, m, sh);
      this.addStaticM(mesh, out, x, z);
      this.kickers.push(k);
      return k;
    }

    addGrind(x, z, dirx, dirz, len, h, kind) {
      const T = this.terrain;
      const ya = T.rawHeight(x, z), yb = T.rawHeight(x + dirx * len, z + dirz * len);
      const g = { ax: x, az: z, ay: ya + h, bx: x + dirx * len, bz: z + dirz * len, by: yb + h, len, dirx, dirz, kind, h };
      const pitch = Math.atan2(ya - yb, len);
      this.addStatic(P.rail(len / Math.cos(pitch), h, kind), x, ya, z, Math.atan2(dirx, dirz), 1, pitch);
      this.grinds.push(g);
      return g;
    }

    _buildPark() {
      if (this.def.park == null) return;
      const p = this.pistes.find((pp) => pp.from === this.def.park) || this.pistes[0];
      this.parkPiste = p;
      const seq = ['k1', 'rail', 'k2', 'box', 'k3', 'rail', 'k2', 'box', 'k1'];
      const q = {};
      let s = p.len * 0.22;
      const end = Math.min(p.len * 0.8, s + seq.length * 48);
      let i = 0;
      this.parkRange = [s, end];
      while (s < end && i < seq.length) {
        this.pisteAt(p, s, q);
        const lat = (i % 2 ? 1 : -1) * p.width * 0.18;
        const x = q.x - q.tz * lat, z = q.z + q.tx * lat;
        const t = seq[i];
        if (t[0] === 'k') {
          const sz = +t[1];
          this.addKicker(x, z, q.tx, q.tz, 5 + sz * 2, 1 + sz * 0.7, 5 + sz, 'park', 0.35);
        } else {
          this.addGrind(x, z, q.tx, q.tz, t === 'rail' ? 12 : 10, t === 'rail' ? 0.7 : 0.55, t);
        }
        s += 46;
        i++;
      }
      // banner arch at the park entrance
      this.pisteAt(p, p.len * 0.22 - 12, q);
      const yaw = Math.atan2(q.tx, q.tz);
      this.addStatic(P.arch(p.width * 0.7, this.theme.palette ? this.theme.palette[0] : '#ff6b2c'), q.x, this.terrain.rawHeight(q.x, q.z), q.z, yaw);
      const hw = p.width * 0.35;
      this.addObstacle({ x: q.x + Math.cos(yaw) * hw, z: q.z - Math.sin(yaw) * hw, r: 0.6, top: 5, kind: 'post' });
      this.addObstacle({ x: q.x - Math.cos(yaw) * hw, z: q.z + Math.sin(yaw) * hw, r: 0.6, top: 5, kind: 'post' });
    }

    // ---------- Ziplines & paragliding ------------------------------------------------
    _buildZips() {
      const T = this.terrain, r = this.rand;
      const n = this.def.zip || 0;
      const order = this.lifts.slice().sort((a, b) => a.T.z - b.T.z);
      for (let k = 0; k < n; k++) {
        const l = order[(k + 1) % order.length];
        for (let tries = 0; tries < 80; tries++) {
          const sx = l.T.x + (r() - 0.5) * 160, sz = l.T.z + 25 + r() * 90;
          const ang = (r() - 0.5) * 1.6;
          const len = 200 + r() * 220;
          const ex = sx + Math.sin(ang) * len, ez = sz + Math.cos(ang) * len;
          if (!this._freeSpot(sx, sz, 3, true) || !this._freeSpot(ex, ez, 3, true)) continue;
          if (this.terrain.pisteDistAt(sx, sz) < 3 || this.terrain.pisteDistAt(ex, ez) < 3) continue;
          if (ex < 140 || ex > this.W - 140 || ez > this.L - 60) continue;
          const ya = T.rawHeight(sx, sz) + 9, yb = T.rawHeight(ex, ez) + 4;
          if (ya - yb < 18) continue;
          let ok = true;
          for (let t = 0.05; t < 1; t += 0.05) {
            const y = GS.lerp(ya, yb, t) - Math.sin(t * Math.PI) * len * 0.02;
            if (y - 4 < T.rawHeight(GS.lerp(sx, ex, t), GS.lerp(sz, ez, t))) { ok = false; break; }
          }
          if (!ok) continue;
          const z = { ax: sx, az: sz, ay: ya, bx: ex, bz: ez, by: yb, len: Math.hypot(ex - sx, ez - sz), sag: len * 0.02 };
          this.addStatic(P.zipTower(8.6), sx, ya - 9, sz, Math.atan2(ex - sx, ez - sz));
          this.addStatic(P.zipTower(3.6), ex, yb - 4, ez, Math.atan2(ex - sx, ez - sz));
          this.addObstacle({ x: sx, z: sz, r: 2.2, top: 9, kind: 'post' });
          this.addObstacle({ x: ex, z: ez, r: 2.2, top: 4, kind: 'post' });
          // cable
          const b = new GS.MeshBuilder();
          b.col('#2a2f36');
          let px = sx, py = ya + 1.6, pz = sz;
          for (let t = 0.05; t <= 1.0001; t += 0.05) {
            const x = GS.lerp(sx, ex, t), zz = GS.lerp(sz, ez, t);
            const y = GS.lerp(ya, yb, t) + 1.6 - Math.sin(t * Math.PI) * z.sag;
            b.mat = M.segment(new Float32Array(16), px, py, pz, x, y, zz, 0.06, 0.06, 0, 1, 0);
            b.box(0, 0.5, 0, 1, 1, 1);
            px = x; py = y; pz = zz;
          }
          this.zipCables = this.zipCables || [];
          this.zipCables.push(b);
          this.zips.push(z);
          break;
        }
      }
    }

    zipAt(z, t, out) {
      out.x = GS.lerp(z.ax, z.bx, t);
      out.z = GS.lerp(z.az, z.bz, t);
      out.y = GS.lerp(z.ay, z.by, t) + 1.6 - Math.sin(t * Math.PI) * z.sag;
      return out;
    }

    _buildLaunches() {
      if (!this.def.paraglide) return;
      const T = this.terrain;
      const top = this.lifts.slice().sort((a, b) => a.T.z - b.T.z)[0];
      const x = top.T.x + (top.T.x < this.W / 2 ? 30 : -30), z = top.T.z + 28;
      const y = T.rawHeight(x, z);
      this.addStatic(P.windsock(), x + 4, y, z, 0);
      this.addObstacle({ x: x + 4, z, r: 0.3, top: 4.5, kind: 'post' });
      this.launches.push({ x, z, y, lift: top.id });
    }

    // ---------- Buildings & decoration ------------------------------------------------
    _buildBuildings() {
      const deco = this.theme.deco;
      const style = {
        alpine: {}, nordic: { wood: '#a33b2c', roof: '#2d3640' }, japan: { wood: '#6b4e3d', roof: '#2b2d42' },
        volcano: { wood: '#4a3b35', roof: '#262322' }, canyon: { wood: '#c97d4f', roof: '#7a3b2e' },
        crystal: { wood: '#4b4e7a', roof: '#2a1b5c' }, arena: { wood: '#d8dde4', roof: '#3a86ff' },
        himalaya: { wood: '#9b8b7a', roof: '#a3271f' },
      }[deco] || {};
      for (const v of this.village) {
        const m = P.chalet(v.seed, style);
        this.addStatic(m, v.x, v.y, v.z, v.yaw);
        this.addObstacle({ x: v.x, z: v.z, r: 0, hx: 6, hz: 5, yaw: v.yaw, top: 9, kind: 'house' });
      }
      for (const h of this.huts) {
        const m = P.chalet(h.seed, Object.assign({ w: 12, d: 9, h: 5, terrace: true }, style));
        this.addStatic(m, h.x, h.y, h.z, h.yaw);
        this.addObstacle({ x: h.x, z: h.z, r: 0, hx: 7, hz: 5.5, yaw: h.yaw, top: 10, kind: 'house' });
      }
    }

    _buildDeco() {
      const T = this.terrain, r = this.rand;
      const deco = this.theme.deco;
      // snow cannons along some pistes
      if (deco === 'alpine' || deco === 'arena') {
        for (const p of this.pistes) {
          if (r() > 0.5) continue;
          const q = {};
          for (let s = 60; s < p.len - 60; s += 110) {
            this.pisteAt(p, s, q);
            const side = r() > 0.5 ? 1 : -1;
            const x = q.x - q.tz * side * (p.width / 2 + 3), z = q.z + q.tx * side * (p.width / 2 + 3);
            if (T.pisteDistAt(x, z) < 1.5) continue;
            this.addStatic(P.snowCannon(), x, T.rawHeight(x, z), z, Math.atan2(-q.tz * side, q.tx * side));
            this.addObstacle({ x, z, r: 0.6, top: 2, kind: 'post' });
          }
        }
      }
      if (deco === 'himalaya') {
        for (const l of this.lifts) {
          const x = l.T.x + l.side.x * 20, z = l.T.z + 6;
          this.addStatic(P.prayerFlags(26), x, T.rawHeight(x, z), z, r() * 6);
          this.addStatic(P.prayerFlags(18), l.B.x - 16, T.rawHeight(l.B.x - 16, l.B.z + 6), l.B.z + 6, r() * 6);
        }
      }
      if (this.def.vents) {
        for (let k = 0; k < 18; k++) {
          const x = 150 + r() * (this.W - 300), z = this.L * (0.05 + r() * 0.6);
          if (T.pisteDistAt(x, z) < 6) continue;
          this.vents.push({ x, z, y: T.rawHeight(x, z), t: r() * 5 });
        }
      }
      // finish arch in the valley
      const base = this.lifts[0].B;
      const ax = base.x + 26, az = base.z - 34;
      if (deco === 'arena') this.addStatic(P.arch(22, '#ff006e'), ax, T.rawHeight(ax, az), az, 0);
      // fences above cliffs that cross pistes
      for (const c of T.cliffList || []) {
        for (const p of this.pistes) {
          const pr = this.pisteProject(p, (c.x0 + c.x1) / 2, c.z);
          if (pr.d < 60) {
            const q = this.pisteAt(p, pr.s);
            for (const side of [-1, 1]) {
              const x = q.x - q.tz * side * (p.width / 2 + 3), z = q.z + q.tx * side * (p.width / 2 + 3) - 4;
              this.addStatic(P.fence(14), x, T.rawHeight(x, z), z, Math.PI / 2 + (r() - 0.5) * 0.3);
            }
          }
        }
      }
    }

    // ---------- Trees & rocks ----------------------------------------------------------
    _placeTrees() {
      const T = this.terrain, th = this.theme;
      const N = new GS.Noise(this.def.seed + 991);
      const r = GS.rng(this.def.seed + 55);
      const kinds = th.trees || { pine: 1 };
      const kindList = [];
      for (const k in kinds) for (let n = 0; n < kinds[k]; n++) kindList.push(k);
      // prototypes
      this.protos = [];
      const protoFor = {};
      const mk = (kind, v) => {
        const seed = this.def.seed * 31 + v * 7 + kind.length;
        switch (kind) {
          case 'spruce': return P.spruce(seed, th);
          case 'birch': return P.birch(seed);
          case 'dead': return P.dead(seed);
          case 'juhyo': return P.juhyo(seed);
          case 'shrub': return P.shrub(seed);
          case 'crystal': return P.crystal(seed);
          default: return P.pine(seed, th);
        }
      };
      for (const k of Object.keys(kinds)) {
        protoFor[k] = [];
        for (let v = 0; v < 3; v++) {
          protoFor[k].push(this.protos.length);
          this.protos.push({ mesh: mk(k, v), kind: k });
        }
      }
      const rockProtos = [];
      for (let v = 0; v < 3; v++) {
        rockProtos.push(this.protos.length);
        this.protos.push({ mesh: P.rock(this.def.seed + v * 3, th), kind: 'rock' });
      }
      const seracProtos = [];
      if (th.seracs) {
        for (let v = 0; v < 2; v++) {
          seracProtos.push(this.protos.length);
          this.protos.push({ mesh: P.serac(this.def.seed + v * 5), kind: 'serac' });
        }
      }
      const cell = 7;
      const dens = th.treeDensity || 0.5;
      const treelineZ = (th.treeline || 0.2) * this.L;
      const parkPiste = this.parkPiste;
      this.treeCount = 0;
      for (let z = 30; z < this.L - 20; z += cell) {
        for (let x = 40; x < this.W - 40; x += cell) {
          const px = x + (r() - 0.5) * cell * 0.9, pz = z + (r() - 0.5) * cell * 0.9;
          const n = N.fbm(px / 160, pz / 160, 3) * 0.5 + 0.5;
          const fade = GS.smooth(treelineZ - 120, treelineZ + 60, pz);
          let p = GS.smooth(1 - dens - 0.15, 1 - dens + 0.25, n) * fade;
          const pd = T.pisteDistAt(px, pz);
          if (pd < 1.5) continue;
          if (pd < 10) p *= 0.55 + (pd - 1.5) / 20;
          if (r() > p) {
            // occasional loner trees
            if (!(pd > 6 && r() < 0.012 * fade)) continue;
          }
          if (T.slopeAt(px, pz) > 1.05) continue;
          if (!this._clearOfStructures(px, pz)) continue;
          const kind = kindList[(r() * kindList.length) | 0];
          const pr = protoFor[kind][(r() * 3) | 0];
          const sz = (0.75 + r() * 0.65) * (0.65 + 0.35 * GS.smooth(treelineZ - 120, treelineZ + 250, pz));
          const y = T.rawHeight(px, pz) - 0.2;
          this.addInstance(pr, px, y, pz, r() * 6.28, sz, sz * (0.9 + r() * 0.25), sz, 1);
          const cr = kind === 'shrub' ? 0.9 : kind === 'crystal' ? 1.1 : kind === 'juhyo' ? 1.2 : 0.75;
          this.addObstacle({ x: px, z: pz, r: cr * sz, top: (kind === 'shrub' ? 1.5 : 5.5) * sz, kind: 'tree', s: sz });
          this.treeCount++;
        }
      }
      this._dressCliffs(rockProtos, r);
      // rocks
      const nr = Math.floor((this.W * this.L) / 2600 * (th.rocks || 0.3));
      for (let k = 0; k < nr; k++) {
        const px = 60 + r() * (this.W - 120), pz = 20 + r() * (this.L - 60);
        const slope = T.slopeAt(px, pz);
        if (T.pisteDistAt(px, pz) < 5) continue;
        if (r() > 0.25 + slope * 0.9) continue;
        if (!this._clearOfStructures(px, pz)) continue;
        const sz = 0.6 + r() * r() * 3.2;
        const useSerac = seracProtos.length && T.ice[T.idx(Math.round(px / 4), Math.round(pz / 4))] > 0.3;
        const pr = useSerac ? seracProtos[(r() * seracProtos.length) | 0] : rockProtos[(r() * 3) | 0];
        this.addInstance(pr, px, T.rawHeight(px, pz) - 0.3 * sz, pz, r() * 6.28, sz, sz, sz, 1);
        if (sz > 0.8) this.addObstacle({ x: px, z: pz, r: 0.9 * sz, top: 0.9 * sz, kind: 'rock', s: sz });
      }
    }

    // Boulders on steep faces so cliffs read as rock, not smeared colour.
    _dressCliffs(rockProtos, r) {
      const T = this.terrain;
      let n = 0;
      for (let z = 20; z < this.L - 20; z += 9) {
        for (let x = 60; x < this.W - 60; x += 9) {
          const px = x + (r() - 0.5) * 8, pz = z + (r() - 0.5) * 8;
          const sl = T.slopeAt(px, pz);
          if (sl < 0.95 || r() > 0.55) continue;
          if (T.pisteDistAt(px, pz) < 4) continue;
          if (!this._clearOfStructures(px, pz)) continue;
          const sz = 1.4 + r() * 2.6 * Math.min(1.6, sl);
          const pr = rockProtos[(r() * rockProtos.length) | 0];
          this.addInstance(pr, px, T.rawHeight(px, pz) - 0.5 * sz, pz, r() * 6.28, sz * 1.3, sz * (0.7 + r() * 0.5), sz * 1.1, 1);
          if (sz > 1.2) this.addObstacle({ x: px, z: pz, r: 1.0 * sz, top: 1.0 * sz, kind: 'rock', s: sz });
          n++;
        }
      }
      // rock walls along the cliff bands
      for (const c of T.cliffList || []) {
        for (let x = c.x0 + 6; x < c.x1 - 6; x += 3.2 + r() * 2) {
          const z = T.cliffZ(c, x) + (r() - 0.3) * 3;
          if (T.pisteDistAt(x, z) < 6) continue;
          if (!this._clearOfStructures(x, z)) continue;
          const sz = 2.2 + r() * 2.4 * Math.min(1.5, c.drop / 10);
          const pr = rockProtos[(r() * rockProtos.length) | 0];
          const y = T.rawHeight(x, z);
          this.addInstance(pr, x, y - 0.3 * sz, z, r() * 6.28, sz * 1.4, sz * (0.9 + r() * 0.6), sz * 1.2, 1);
          this.addObstacle({ x, z, r: 1.1 * sz, top: 1.1 * sz, kind: 'rock', s: sz });
          n++;
        }
      }
      this.cliffRocks = n;
    }

    _clearOfStructures(x, z) {
      for (const l of this.lifts) {
        if (this._distToLift(l, x, z) < 9) return false;
        if (Math.hypot(l.B.x - x, l.B.z - z) < 22 || Math.hypot(l.T.x - x, l.T.z - z) < 20) return false;
      }
      for (const b of this.buildings) if (Math.hypot(b.x - x, b.z - z) < b.r + 8) return false;
      for (const k of this.kickers) if (Math.hypot(k.x - x, k.z - z) < k.len + 10) return false;
      for (const zz of this.zips) {
        const dx = zz.bx - zz.ax, dz = zz.bz - zz.az, l2 = dx * dx + dz * dz;
        const t = GS.clamp(((x - zz.ax) * dx + (z - zz.az) * dz) / l2, 0, 1);
        if (Math.hypot(zz.ax + dx * t - x, zz.az + dz * t - z) < 6) return false;
      }
      for (const lc of this.launches) if (Math.hypot(lc.x - x, lc.z - z) < 30) return false;
      if (this.skijump) {
        const sj = this.skijump;
        if (Math.abs(x - sj.x) < 26 && z > sj.z0 - 10 && z < sj.edgeZ + sj.len + 10) return false;
      }
      return true;
    }

    _placeCollectibles() {
      const T = this.terrain;
      const r = GS.rng(this.def.seed + 4242);
      let tries = 0;
      while (this.collectibles.length < 5 && tries++ < 4000) {
        const x = 150 + r() * (this.W - 300), z = this.L * (0.08 + r() * 0.8);
        if (T.pisteDistAt(x, z) < 22) continue;
        if (!this._clearOfStructures(x, z)) continue;
        let blocked = false;
        this.forObstacles(x, z, 4, (o) => {
          if (Math.hypot(o.x - x, o.z - z) < o.r + 3) { blocked = true; return true; }
          return false;
        });
        if (blocked) continue;
        if (this.collectibles.some((c) => Math.hypot(c.x - x, c.z - z) < 200)) continue;
        this.collectibles.push({ id: this.collectibles.length, x, z, y: T.rawHeight(x, z) + 1.2 });
      }
    }

    // ---------- Upload -----------------------------------------------------------------
    _uploadObjects() {
      const R = this.r;
      this.staticChunks = [];
      const addBuilt = (b) => {
        if (!b.vertexCount) return;
        const built = b.build();
        const v = built.v;
        const box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
        for (let k = 0; k < v.length; k += GS.STRIDE) {
          if (v[k] < box[0]) box[0] = v[k];
          if (v[k + 1] < box[1]) box[1] = v[k + 1];
          if (v[k + 2] < box[2]) box[2] = v[k + 2];
          if (v[k] > box[3]) box[3] = v[k];
          if (v[k + 1] > box[4]) box[4] = v[k + 1];
          if (v[k + 2] > box[5]) box[5] = v[k + 2];
        }
        this.staticChunks.push({ mesh: R.upload(built), box });
      };
      for (const b of this.statics.values()) addBuilt(b);
      for (const l of this.lifts) addBuilt(l.cableMesh);
      for (const b of this.zipCables || []) addBuilt(b);
      if (this.skijump) {
        const sj = this.skijump;
        const b = new GS.MeshBuilder();
        b.mat = M.create();
        M.translate(b.mat, sj.x, 0, sj.z0);
        b.append(P.skiJump(sj.inrun.map(([u, y]) => [u, y])));
        // judges tower
        b.mat = M.create();
        M.translate(b.mat, sj.x + 18, this.terrain.rawHeight(sj.x + 18, sj.edgeZ + 30), sj.edgeZ + 30);
        b.append(P.chalet(5, { w: 5, d: 5, h: 9, wood: '#d8dde4', roof: '#3a86ff' }));
        addBuilt(b);
      }
      this.statics = null;
      // gpu prototypes
      this.protoGpu = this.protos.map((p) => R.upload(p.mesh));
      this.instChunks = [];
      for (const [key, m] of this.inst) {
        const [cx, cz] = key.split(',').map(Number);
        for (const [proto, arr] of m) {
          const data = new Float32Array(arr);
          let miny = 1e9, maxy = -1e9;
          for (let k = 0; k < data.length; k += 8) {
            miny = Math.min(miny, data[k + 1]);
            maxy = Math.max(maxy, data[k + 1] + 8 * data[k + 5]);
          }
          this.instChunks.push({
            inst: R.instanced(this.protoGpu[proto], data),
            box: [cx * RCHUNK - 4, miny, cz * RCHUNK - 4, (cx + 1) * RCHUNK + 4, maxy, (cz + 1) * RCHUNK + 4],
          });
        }
      }
      this.inst = null;
      // chairs
      for (const l of this.lifts) {
        l.chairGpu = R.upload(l.chairMesh);
        l.chairInst = R.instanced(l.chairGpu, l.chairData, true);
      }
    }

    dispose() {
      const R = this.r;
      for (const c of this.terrainChunks || []) R.freeMesh(c.mesh);
      for (const c of this.staticChunks || []) R.freeMesh(c.mesh);
      for (const c of this.instChunks || []) R.freeInstanced(c.inst);
      for (const m of this.protoGpu || []) R.freeMesh(m);
      for (const l of this.lifts) {
        if (l.chairInst) R.freeInstanced(l.chairInst);
        if (l.chairGpu) R.freeMesh(l.chairGpu);
      }
    }

    // ---------- Runtime ----------------------------------------------------------------
    update(dt, focus) {
      this.time += dt;
      const tmp = {};
      for (const l of this.lifts) {
        l.offset = (l.offset + l.speed * l.boost * dt) % l.loop;
        const d = l.chairData;
        for (let k = 0; k < l.count; k++) {
          const q = this.chairQ(l, k);
          this.cableAt(l, q, tmp);
          const o = k * 8;
          const hang = l.cfg.hang;
          let y = tmp.y - hang - (l.type === 'gondola' ? 0.3 : 0);
          if (l.type === 'tbar') y = this.terrain.rawHeight(tmp.x, tmp.z) + 0.75;
          d[o] = tmp.x; d[o + 1] = y; d[o + 2] = tmp.z;
          d[o + 3] = l.yaw + (tmp.up ? 0 : Math.PI);
          d[o + 4] = 1; d[o + 5] = l.type === 'tbar' ? (tmp.y - y) / 3.6 : 1; d[o + 6] = 1; d[o + 7] = 1;
        }
        this.r.updateInstanced(l.chairInst, d, l.count);
      }
      // volcanic steam
      for (const v of this.vents) {
        if (Math.abs(v.x - focus[0]) > 160 || Math.abs(v.z - focus[2]) > 160) continue;
        v.t += dt;
        if (v.t > 0.08) {
          v.t = 0;
          this.r.emit(v.x + (Math.random() - 0.5), v.y + 0.5, v.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.6, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.6,
            3.5, 1.5, 0.92, 0.9, 0.88, 0.35, -0.2, 1.6, 0.4);
        }
      }
    }

    scene() {
      return {
        terrain: this.terrainChunks,
        statics: this.staticChunks,
        inst: this.instChunks,
        dynInst: this.lifts.map((l) => l.chairInst),
      };
    }

    // Lift whose boarding zone contains the point.
    liftAtBottom(x, z) {
      for (const l of this.lifts) if (Math.hypot(l.B.x - x, l.B.z - z) < 15) return l;
      return null;
    }

    liftExit(l) {
      const e = this._liftTopExit(l);
      return { x: e.x, z: e.z, y: this.terrain.heightAt(e.x, e.z) };
    }
  }

  World.PISTE_COL = PISTE_COL;
  GS.World = World;
})(window.GS);
