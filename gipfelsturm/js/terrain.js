'use strict';
// Heightmap terrain: generation, piste grooming, pads, sampling and chunk
// meshing. World space: x = east (screen right), z = downhill (screen down),
// y = up. z = 0 is the summit edge, z = L the valley floor.
(function (GS) {
  const CS = 4; // metres per cell
  const CHUNK = 32; // cells per chunk side

  const SURF = { POWDER: 0, GROOMED: 1, ICE: 2, ROCK: 3, DEEP: 4 };

  class Terrain {
    constructor(def) {
      this.def = def;
      this.W = def.W;
      this.L = def.L;
      this.cs = CS;
      this.nx = Math.round(this.W / CS) + 1;
      this.nz = Math.round(this.L / CS) + 1;
      const n = this.nx * this.nz;
      this.h = new Float32Array(n);
      this.surf = new Uint8Array(n);
      this.groom = new Float32Array(n);
      this.pisteId = new Int16Array(n).fill(-1);
      this.pisteD = new Float32Array(n).fill(1e9);
      this.ice = new Float32Array(n);
      this.features = [];
      this.featGrid = new Map();
      this.noise = new GS.Noise(def.seed);
      this.noise2 = new GS.Noise(def.seed + 77);
    }

    idx(i, j) { return j * this.nx + i; }

    // ---------- Generation ---------------------------------------------------
    generateBase() {
      const d = this.def, N = this.noise, N2 = this.noise2;
      const { nx, nz, W, L } = this;
      const g = d.gen;
      // base profile: cumulative slope from the valley up
      const prof = g.slopes; // top .. bottom
      const H = new Float32Array(nz);
      let acc = 0;
      for (let j = nz - 1; j >= 0; j--) {
        H[j] = acc;
        const t = j / (nz - 1);
        const f = t * (prof.length - 1);
        const k = Math.min(prof.length - 2, Math.floor(f));
        const s = GS.lerp(prof[k], prof[k + 1], f - k);
        acc += s * CS;
      }
      this.baseTop = acc;
      const margin = g.margin || 110;
      const cx = W / 2;
      const cliffs = this._cliffs();
      for (let j = 0; j < nz; j++) {
        const z = j * CS;
        const tz = z / L;
        // near the valley the big noise fades so the village floor stays flat
        const valleyFade = 1 - GS.smooth(0.82, 0.97, tz);
        for (let i = 0; i < nx; i++) {
          const x = i * CS;
          let h = H[j];
          // ridges at the side walls
          const e = Math.max(0, margin - x, x - (W - margin));
          if (e > 0) h += e * e * (g.wall || 0.0075) * (1 + N2.fbm(x / 60, z / 60, 2) * 0.35);
          // bowl
          const bx = (x - cx) / (W / 2);
          h += bx * bx * (g.bowl || 40);
          // big landforms stretched along the fall line (ridges & gullies)
          h += N.fbm(x / (g.bigX || 220), z / (g.bigZ || 520), 4) * (g.big || 40) * valleyFade;
          if (g.ridge) h += (N2.ridged(x / 240, z / 600, 4) - 0.45) * g.ridge * valleyFade;
          h += N.fbm(x / 80 + 40, z / 95, 3) * (g.mid || 6) * (0.4 + 0.6 * valleyFade);
          h += N2.fbm(x / 21, z / 21, 2) * (g.small || 0.8) * 1.4;
          h += N.n2(x / 11 + 7, z / 13) * (g.small || 0.8) * 0.5;
          // cliff bands
          for (const c of cliffs) {
            if (x < c.x0 - 30 || x > c.x1 + 30 || z > c.z + 6 || z < c.z - 140) continue;
            const zc = c.z + N.n2(x / 40, c.z) * 6;
            const mask = GS.smooth(c.x0 - 30, c.x0 + 8, x) * (1 - GS.smooth(c.x1 - 8, c.x1 + 30, x));
            if (mask <= 0) continue;
            const above = Math.exp(-Math.max(0, zc - z) / 70);
            h += c.drop * above * (1 - GS.smooth(zc - 2.6, zc + 2.6, z)) * mask;
          }
          this.h[j * nx + i] = h;
        }
      }
      // glacier ice patches
      if (g.ice) {
        for (let j = 0; j < nz; j++) {
          for (let i = 0; i < nx; i++) {
            const n = N2.fbm(i * CS / 70, j * CS / 70, 3);
            const tz = (j * CS) / L;
            this.ice[j * nx + i] = GS.smooth(0.18, 0.32, n + (0.5 - tz) * g.ice * 0.6) * g.ice;
          }
        }
      }
    }

    cliffZ(c, x) {
      return c.z + this.noise.n2(x / 40, c.z) * 6;
    }

    _cliffs() {
      const g = this.def.gen;
      const r = GS.rng(this.def.seed * 7 + 3);
      const out = [];
      const n = g.cliffs || 0;
      for (let k = 0; k < n; k++) {
        const w = 60 + r() * 160;
        const x0 = 130 + r() * (this.W - 260 - w);
        out.push({ x0, x1: x0 + w, z: this.L * (0.12 + r() * 0.62), drop: (g.cliffDrop || 9) * (0.6 + r() * 0.8) });
      }
      this.cliffList = out;
      return out;
    }

    // Gaussian-ish box blur (3 passes) of an array, radius in cells.
    _blur(src, rad) {
      const { nx, nz } = this;
      let a = new Float32Array(src), b = new Float32Array(src.length);
      for (let pass = 0; pass < 3; pass++) {
        // horizontal
        for (let j = 0; j < nz; j++) {
          let acc = 0, cnt = 0;
          const row = j * nx;
          for (let i = -rad; i <= rad; i++) if (i >= 0 && i < nx) { acc += a[row + i]; cnt++; }
          for (let i = 0; i < nx; i++) {
            b[row + i] = acc / cnt;
            const o = i - rad, n = i + rad + 1;
            if (o >= 0) { acc -= a[row + o]; cnt--; }
            if (n < nx) { acc += a[row + n]; cnt++; }
          }
        }
        // vertical
        for (let i = 0; i < nx; i++) {
          let acc = 0, cnt = 0;
          for (let j = -rad; j <= rad; j++) if (j >= 0 && j < nz) { acc += b[j * nx + i]; cnt++; }
          for (let j = 0; j < nz; j++) {
            a[j * nx + i] = acc / cnt;
            const o = j - rad, n = j + rad + 1;
            if (o >= 0) { acc -= b[o * nx + i]; cnt--; }
            if (n < nz) { acc += b[n * nx + i]; cnt++; }
          }
        }
      }
      return a;
    }

    // Mark piste corridors (distance field) and groom them smooth.
    groomPistes(pistes) {
      const { nx, nz } = this;
      for (const p of pistes) {
        const half = p.width / 2;
        const reach = half + 16;
        for (let k = 0; k < p.pts.length - 1; k++) {
          const a = p.pts[k], b = p.pts[k + 1];
          const minx = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach) / CS));
          const maxx = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + reach) / CS));
          const minz = Math.max(0, Math.floor((Math.min(a.z, b.z) - reach) / CS));
          const maxz = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z) + reach) / CS));
          const dx = b.x - a.x, dz = b.z - a.z;
          const len2 = dx * dx + dz * dz || 1;
          for (let j = minz; j <= maxz; j++) {
            for (let i = minx; i <= maxx; i++) {
              const x = i * CS, z = j * CS;
              let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              const px = a.x + dx * t, pz = a.z + dz * t;
              const d = Math.hypot(x - px, z - pz) - half;
              const id = j * nx + i;
              if (d < this.pisteD[id]) {
                this.pisteD[id] = d;
                this.pisteId[id] = p.id;
              }
            }
          }
        }
      }
      const soft = this._blur(this.h, 3);
      const softer = this._blur(this.h, 6);
      for (let id = 0; id < this.h.length; id++) {
        const d = this.pisteD[id];
        if (d > 16) continue;
        const w = 1 - GS.smooth(-2, 16, d);
        const p = pistes[this.pisteId[id]];
        const target = p && p.smooth > 1 ? softer[id] : soft[id];
        this.h[id] = GS.lerp(this.h[id], target, w);
        this.groom[id] = 1 - GS.smooth(-1, 3, d);
      }
    }

    // Flatten a circular pad (stations, huts, village) to a given height.
    pad(x, z, r, blend, height) {
      const { nx, nz } = this;
      const y = height == null ? this.heightAt(x, z) : height;
      const R = r + blend;
      const i0 = Math.max(0, Math.floor((x - R) / CS)), i1 = Math.min(nx - 1, Math.ceil((x + R) / CS));
      const j0 = Math.max(0, Math.floor((z - R) / CS)), j1 = Math.min(nz - 1, Math.ceil((z + R) / CS));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(i * CS - x, j * CS - z);
          if (d > R) continue;
          const w = 1 - GS.smooth(r, R, d);
          const id = j * nx + i;
          this.h[id] = GS.lerp(this.h[id], y, w);
        }
      }
      return y;
    }

    // Rectangular pad along a direction (used for the ski-jump landing hill).
    shapeStrip(x, z, dirx, dirz, len, width, profile) {
      const { nx, nz } = this;
      const R = len + width + 40;
      const i0 = Math.max(0, Math.floor((x - R) / CS)), i1 = Math.min(nx - 1, Math.ceil((x + R) / CS));
      const j0 = Math.max(0, Math.floor((z - R) / CS)), j1 = Math.min(nz - 1, Math.ceil((z + R) / CS));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const px = i * CS - x, pz = j * CS - z;
          const u = px * dirx + pz * dirz;
          const v = -px * dirz + pz * dirx;
          if (u < -8 || u > len + 8) continue;
          const lat = 1 - GS.smooth(width / 2, width / 2 + 34, Math.abs(v));
          const lon = GS.smooth(-8, 0, u) * (1 - GS.smooth(len, len + 8, u));
          const w = lat * lon;
          if (w <= 0) continue;
          const id = j * nx + i;
          this.h[id] = GS.lerp(this.h[id], profile(GS.clamp(u, 0, len)), w);
          this.groom[id] = Math.max(this.groom[id], lat > 0.9 ? 1 : 0);
        }
      }
    }

    finalize() {
      const { nx, nz } = this;
      const g = this.def.gen;
      // surfaces
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const id = j * nx + i;
          const s = this._slopeCell(i, j);
          let surf = g.deep ? SURF.DEEP : SURF.POWDER;
          if (this.groom[id] > 0.5) surf = SURF.GROOMED;
          if (this.ice[id] > 0.5 && this.groom[id] < 0.5) surf = SURF.ICE;
          if (s > 1.05 && this.groom[id] < 0.5) surf = SURF.ROCK;
          this.surf[id] = surf;
        }
      }
      this.blurH = this._blur(this.h, 4);
    }

    _slopeCell(i, j) {
      const { nx, nz } = this;
      const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1);
      const j0 = Math.max(0, j - 1), j1 = Math.min(nz - 1, j + 1);
      const dx = (this.h[j * nx + i1] - this.h[j * nx + i0]) / ((i1 - i0) * CS);
      const dz = (this.h[j1 * nx + i] - this.h[j0 * nx + i]) / ((j1 - j0) * CS);
      return Math.hypot(dx, dz);
    }

    // ---------- Features (analytic additions to the ground) ------------------
    addFeature(f) {
      this.features.push(f);
      const c = 32;
      const x0 = Math.floor(f.minx / c), x1 = Math.floor(f.maxx / c);
      const z0 = Math.floor(f.minz / c), z1 = Math.floor(f.maxz / c);
      for (let a = x0; a <= x1; a++) {
        for (let b = z0; b <= z1; b++) {
          const k = a * 4096 + b;
          let l = this.featGrid.get(k);
          if (!l) this.featGrid.set(k, (l = []));
          l.push(f);
        }
      }
    }

    _featHeight(x, z) {
      const l = this.featGrid.get(Math.floor(x / 32) * 4096 + Math.floor(z / 32));
      if (!l) return 0;
      let best = 0;
      for (const f of l) {
        if (x < f.minx || x > f.maxx || z < f.minz || z > f.maxz) continue;
        const v = f.height(x, z);
        if (v > best) best = v;
      }
      return best;
    }

    // ---------- Sampling ------------------------------------------------------
    rawHeight(x, z) {
      const { nx, nz } = this;
      let fx = x / CS, fz = z / CS;
      if (fx < 0) fx = 0; else if (fx > nx - 1.001) fx = nx - 1.001;
      if (fz < 0) fz = 0; else if (fz > nz - 1.001) fz = nz - 1.001;
      const i = fx | 0, j = fz | 0;
      const tx = fx - i, tz = fz - j;
      const id = j * nx + i;
      const h = this.h;
      // triangle interpolation matching the mesh split (i,j)-(i,j+1)-(i+1,j)
      if (tx + tz <= 1) {
        return h[id] + (h[id + 1] - h[id]) * tx + (h[id + nx] - h[id]) * tz;
      }
      const h11 = h[id + nx + 1];
      return h11 + (h[id + nx] - h11) * (1 - tx) + (h[id + 1] - h11) * (1 - tz);
    }

    heightAt(x, z) {
      return this.rawHeight(x, z) + (this.features.length ? this._featHeight(x, z) : 0);
    }

    // Smooth gradient (bilinear of central differences) for physics.
    gradAt(x, z, out) {
      // smooth terrain gradient + sharp gradient for features (kicker lips)
      const e = 0.9;
      out[0] = (this.rawHeight(x + e, z) - this.rawHeight(x - e, z)) / (2 * e);
      out[1] = (this.rawHeight(x, z + e) - this.rawHeight(x, z - e)) / (2 * e);
      if (this.features.length && this._featHeight(x, z) > 0) {
        const f = 0.15;
        out[0] += (this._featHeight(x + f, z) - this._featHeight(x - f, z)) / (2 * f);
        out[1] += (this._featHeight(x, z + f) - this._featHeight(x, z - f)) / (2 * f);
      }
      return out;
    }

    normalAt(x, z, out) {
      const g = this.gradAt(x, z, out);
      const nx = -g[0], nz = -g[1];
      const l = Math.hypot(nx, 1, nz);
      out[0] = nx / l; out[1] = 1 / l; out[2] = nz / l;
      return out;
    }

    surfAt(x, z) {
      const i = GS.clamp(Math.round(x / CS), 0, this.nx - 1);
      const j = GS.clamp(Math.round(z / CS), 0, this.nz - 1);
      return this.surf[j * this.nx + i];
    }

    pisteAt(x, z) {
      const i = GS.clamp(Math.round(x / CS), 0, this.nx - 1);
      const j = GS.clamp(Math.round(z / CS), 0, this.nz - 1);
      const id = j * this.nx + i;
      return this.pisteD[id] < 0 ? this.pisteId[id] : -1;
    }

    pisteDistAt(x, z) {
      const i = GS.clamp(Math.round(x / CS), 0, this.nx - 1);
      const j = GS.clamp(Math.round(z / CS), 0, this.nz - 1);
      return this.pisteD[j * this.nx + i];
    }

    slopeAt(x, z) {
      const g = this.gradAt(x, z, [0, 0]);
      return Math.hypot(g[0], g[1]);
    }

    inBounds(x, z) {
      return x > 20 && x < this.W - 20 && z > 10 && z < this.L - 10;
    }

    // ---------- Meshing --------------------------------------------------------
    buildChunks(renderer, theme) {
      const { nx, nz } = this;
      const chunks = [];
      const rock = GS.hexToRgb(theme.rock);
      const rock2 = GS.hexToRgb(theme.rock2 || theme.rock);
      const snow = GS.hexToRgb(theme.snow || '#f6f9ff');
      const groomC = GS.hexToRgb(theme.groomed || '#eef3fb');
      const iceC = GS.hexToRgb(theme.ice || '#a9d8f2');
      const N = this.noise2;
      // per-vertex attributes for the whole grid
      const nor = new Float32Array(nx * nz * 3);
      const col = new Float32Array(nx * nz * 4);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const id = j * nx + i;
          const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1);
          const j0 = Math.max(0, j - 1), j1 = Math.min(nz - 1, j + 1);
          const dx = (this.h[j * nx + i1] - this.h[j * nx + i0]) / ((i1 - i0) * CS);
          const dz = (this.h[j1 * nx + i] - this.h[j0 * nx + i]) / ((j1 - j0) * CS);
          const l = Math.hypot(dx, 1, dz);
          nor[id * 3] = -dx / l; nor[id * 3 + 1] = 1 / l; nor[id * 3 + 2] = -dz / l;
          const slope = Math.hypot(dx, dz);
          const x = i * CS, z = j * CS;
          const v = N.fbm(x / 35, z / 35, 2) * 0.025;
          let c = [snow[0] + v, snow[1] + v, snow[2] + v * 0.5];
          const gr = this.groom[id];
          if (gr > 0) c = GS.mixRgb(c, groomC, gr);
          if (this.ice[id] > 0) c = GS.mixRgb(c, iceC, GS.smooth(0.3, 0.7, this.ice[id]) * (1 - gr));
          void rock; void rock2;
          // concavity shading
          const ao = GS.clamp(1 + (this.h[id] - this.blurH[id]) * 0.02, 0.9, 1.03);
          col[id * 4] = c[0] * ao; col[id * 4 + 1] = c[1] * ao; col[id * 4 + 2] = Math.min(1.05, c[2] * (ao * 0.6 + 0.4));
          col[id * 4 + 3] = gr;
        }
      }
      for (let cj = 0; cj < Math.ceil((nz - 1) / CHUNK); cj++) {
        for (let ci = 0; ci < Math.ceil((nx - 1) / CHUNK); ci++) {
          const i0 = ci * CHUNK, j0 = cj * CHUNK;
          const i1 = Math.min(nx - 1, i0 + CHUNK), j1 = Math.min(nz - 1, j0 + CHUNK);
          const w = i1 - i0 + 1, hgt = j1 - j0 + 1;
          const v = new Float32Array(w * hgt * 10);
          let miny = 1e9, maxy = -1e9;
          let o = 0;
          for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
              const id = j * nx + i;
              const y = this.h[id];
              if (y < miny) miny = y;
              if (y > maxy) maxy = y;
              v[o++] = i * CS; v[o++] = y; v[o++] = j * CS;
              v[o++] = nor[id * 3]; v[o++] = nor[id * 3 + 1]; v[o++] = nor[id * 3 + 2];
              v[o++] = col[id * 4]; v[o++] = col[id * 4 + 1]; v[o++] = col[id * 4 + 2]; v[o++] = col[id * 4 + 3];
            }
          }
          const idx = new Uint16Array((w - 1) * (hgt - 1) * 6);
          let k = 0;
          for (let j = 0; j < hgt - 1; j++) {
            for (let i = 0; i < w - 1; i++) {
              const a = j * w + i, b = (j + 1) * w + i, c = j * w + i + 1, d = (j + 1) * w + i + 1;
              idx[k++] = a; idx[k++] = b; idx[k++] = c;
              idx[k++] = b; idx[k++] = d; idx[k++] = c;
            }
          }
          const mesh = renderer.upload({ v, i: idx, count: idx.length, vcount: w * hgt });
          chunks.push({ mesh, box: [i0 * CS, miny - 1, j0 * CS, i1 * CS, maxy + 1, j1 * CS], ci, cj });
        }
      }
      this.chunks = chunks;
      return chunks;
    }
  }

  Terrain.CS = CS;
  Terrain.CHUNK = CHUNK;
  Terrain.SURF = SURF;
  GS.Terrain = Terrain;
})(window.GS);
