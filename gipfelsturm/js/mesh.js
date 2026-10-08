'use strict';
// CPU-side geometry builder. Produces flat-shaded low-poly meshes with
// per-vertex colors. Vertex layout: position(3) normal(3) color(4) = 10 floats.
// The color alpha flags surfaces that collect snow on top (1) or not (0).
(function (GS) {
  const M = GS.M;
  const STRIDE = 10;

  class MeshBuilder {
    constructor() {
      this.v = [];
      this.i = [];
      this.mat = M.create();
      this.stack = [];
      this.color = [1, 1, 1, 0];
    }

    get vertexCount() { return this.v.length / STRIDE; }

    push() { this.stack.push(new Float32Array(this.mat)); return this; }
    pop() { this.mat = this.stack.pop(); return this; }
    translate(x, y, z) { M.translate(this.mat, x, y, z); return this; }
    rotY(a) { M.rotY(this.mat, a); return this; }
    rotX(a) { M.rotX(this.mat, a); return this; }
    rotZ(a) { M.rotZ(this.mat, a); return this; }
    scale(x, y, z) { M.scale(this.mat, x, y == null ? x : y, z == null ? x : z); return this; }
    col(hex, snow) {
      const c = typeof hex === 'string' ? GS.hexToRgb(hex) : hex;
      this.color = [c[0], c[1], c[2], snow ? 1 : 0];
      return this;
    }

    _tp(x, y, z) {
      const m = this.mat;
      return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ];
    }

    // Triangle given in local space; normal computed after transform (flat).
    tri(a, b, c, color) {
      const p0 = this._tp(a[0], a[1], a[2]);
      const p1 = this._tp(b[0], b[1], b[2]);
      const p2 = this._tp(c[0], c[1], c[2]);
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const col = color || this.color;
      const base = this.vertexCount;
      for (const p of [p0, p1, p2]) this.v.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], col[3]);
      this.i.push(base, base + 1, base + 2);
      return this;
    }

    quad(a, b, c, d, color) {
      this.tri(a, b, c, color);
      this.tri(a, c, d, color);
      return this;
    }

    // Axis-aligned box centred at (cx, cy, cz) in local space.
    box(cx, cy, cz, sx, sy, sz, color) {
      const x0 = cx - sx / 2, x1 = cx + sx / 2;
      const y0 = cy - sy / 2, y1 = cy + sy / 2;
      const z0 = cz - sz / 2, z1 = cz + sz / 2;
      const P = (x, y, z) => [x, y, z];
      this.quad(P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), color); // top
      this.quad(P(x0, y0, z1), P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), color); // bottom
      this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), color); // +z
      this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), color); // -z
      this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), color); // +x
      this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), color); // -x
      return this;
    }

    // Frustum / cylinder / cone along +Y from y0 to y1.
    cyl(r0, r1, y0, y1, seg, color, capTop, capBottom, jitter, rnd) {
      const pts0 = [], pts1 = [];
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * GS.TAU;
        const j0 = jitter ? 1 + (rnd() - 0.5) * jitter : 1;
        const j1 = jitter ? 1 + (rnd() - 0.5) * jitter : 1;
        pts0.push([Math.cos(a) * r0 * j0, y0, Math.sin(a) * r0 * j0]);
        pts1.push([Math.cos(a) * r1 * j1, y1, Math.sin(a) * r1 * j1]);
      }
      for (let k = 0; k < seg; k++) {
        const n = (k + 1) % seg;
        if (r1 > 1e-5) this.quad(pts0[k], pts1[k], pts1[n], pts0[n], color);
        else this.tri(pts0[k], [0, y1, 0], pts0[n], color);
      }
      if (capTop && r1 > 1e-5) for (let k = 1; k < seg - 1; k++) this.tri(pts1[0], pts1[k + 1], pts1[k], color);
      if (capBottom) for (let k = 1; k < seg - 1; k++) this.tri(pts0[0], pts0[k], pts0[k + 1], color);
      return this;
    }

    // Low-poly sphere (UV) – used for heads, rocks (with jitter) and bushes.
    sphere(cx, cy, cz, r, segU, segV, color, jitter, rnd, sy) {
      sy = sy || 1;
      const rows = [];
      for (let j = 0; j <= segV; j++) {
        const v = j / segV, phi = v * Math.PI;
        const row = [];
        for (let k = 0; k < segU; k++) {
          const th = (k / segU) * GS.TAU;
          let rr = r;
          if (jitter && j > 0 && j < segV) rr *= 1 + (rnd() - 0.5) * jitter;
          row.push([cx + Math.sin(phi) * Math.cos(th) * rr, cy + Math.cos(phi) * rr * sy, cz + Math.sin(phi) * Math.sin(th) * rr]);
        }
        rows.push(row);
      }
      for (let j = 0; j < segV; j++) {
        for (let k = 0; k < segU; k++) {
          const n = (k + 1) % segU;
          if (j === 0) this.tri(rows[0][k], rows[1][n], rows[1][k], color);
          else if (j === segV - 1) this.tri(rows[j][k], rows[j][n], rows[j + 1][k], color);
          else this.quad(rows[j][k], rows[j][n], rows[j + 1][n], rows[j + 1][k], color);
        }
      }
      return this;
    }

    // Flat double-sided panel in the local XY plane (flags, banners, signs).
    panel(x0, y0, x1, y1, z, color) {
      this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], color);
      this.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], color);
      return this;
    }

    torus(R, r, segR, segr, color) {
      const pt = (i, j) => {
        const a = (i / segR) * GS.TAU, b = (j / segr) * GS.TAU;
        const rr = R + Math.cos(b) * r;
        return [Math.cos(a) * rr, Math.sin(b) * r, Math.sin(a) * rr];
      };
      for (let i = 0; i < segR; i++) {
        for (let j = 0; j < segr; j++) {
          this.quad(pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j), color);
        }
      }
      return this;
    }

    // ---------- Smooth-shaded primitives (shared vertices) ----------------------
    sv(x, y, z, nx, ny, nz, color) {
      const m = this.mat;
      const px = m[0] * x + m[4] * y + m[8] * z + m[12];
      const py = m[1] * x + m[5] * y + m[9] * z + m[13];
      const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      let qx = m[0] * nx + m[4] * ny + m[8] * nz;
      let qy = m[1] * nx + m[5] * ny + m[9] * nz;
      let qz = m[2] * nx + m[6] * ny + m[10] * nz;
      const l = Math.hypot(qx, qy, qz) || 1;
      const c = color || this.color;
      this.v.push(px, py, pz, qx / l, qy / l, qz / l, c[0], c[1], c[2], c[3]);
      return this.vertexCount - 1;
    }

    // Surface of revolution around +Y from a profile [[radius, y], ...]
    // (bottom to top). sx/sz stretch the cross-section into an ellipse.
    lathe(profile, seg, color, sx, sz, a0, a1) {
      sx = sx || 1; sz = sz || 1;
      const full = a0 == null;
      a0 = full ? 0 : a0;
      a1 = full ? GS.TAU : a1;
      const cols = full ? seg : seg + 1;
      const rows = [];
      for (let k = 0; k < profile.length; k++) {
        const p0 = profile[Math.max(0, k - 1)], p1 = profile[Math.min(profile.length - 1, k + 1)];
        const dr = p1[0] - p0[0], dy = p1[1] - p0[1];
        const l = Math.hypot(dr, dy) || 1;
        const nr = dy / l, ny = -dr / l;
        const [r, y] = profile[k];
        const row = [];
        for (let i = 0; i < cols; i++) {
          const a = a0 + ((a1 - a0) * i) / seg;
          const ca = Math.cos(a), sa = Math.sin(a);
          row.push(this.sv(r * ca * sx, y, r * sa * sz, (nr * ca) / sx, ny, (nr * sa) / sz, color));
        }
        rows.push(row);
      }
      for (let k = 0; k < rows.length - 1; k++) {
        for (let i = 0; i < (full ? seg : seg); i++) {
          const n = full ? (i + 1) % seg : i + 1;
          const b0 = rows[k][i], t0 = rows[k + 1][i], t1 = rows[k + 1][n], b1 = rows[k][n];
          this.i.push(b0, t0, t1, b0, t1, b1);
        }
      }
      return this;
    }

    ellipsoid(cx, cy, cz, rx, ry, rz, segU, segV, color) {
      const rows = [];
      for (let j = 0; j <= segV; j++) {
        const phi = (j / segV) * Math.PI;
        const row = [];
        for (let k = 0; k < segU; k++) {
          const th = (k / segU) * GS.TAU;
          const ux = Math.sin(phi) * Math.cos(th), uy = Math.cos(phi), uz = Math.sin(phi) * Math.sin(th);
          row.push(this.sv(cx + ux * rx, cy + uy * ry, cz + uz * rz, ux / rx, uy / ry, uz / rz, color));
        }
        rows.push(row);
      }
      for (let j = 0; j < segV; j++) {
        for (let k = 0; k < segU; k++) {
          const n = (k + 1) % segU;
          const a = rows[j][k], b = rows[j][n], c = rows[j + 1][n], d = rows[j + 1][k];
          this.i.push(a, b, c, a, c, d);
        }
      }
      return this;
    }

    append(other) {
      const base = this.vertexCount;
      const m = this.mat;
      const v = other.v;
      for (let k = 0; k < v.length; k += STRIDE) {
        const x = v[k], y = v[k + 1], z = v[k + 2];
        const nx = v[k + 3], ny = v[k + 4], nz = v[k + 5];
        const tx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const ty = m[1] * x + m[5] * y + m[9] * z + m[13];
        const tz = m[2] * x + m[6] * y + m[10] * z + m[14];
        let qx = m[0] * nx + m[4] * ny + m[8] * nz;
        let qy = m[1] * nx + m[5] * ny + m[9] * nz;
        let qz = m[2] * nx + m[6] * ny + m[10] * nz;
        const l = Math.hypot(qx, qy, qz) || 1;
        this.v.push(tx, ty, tz, qx / l, qy / l, qz / l, v[k + 6], v[k + 7], v[k + 8], v[k + 9]);
      }
      for (const idx of other.i) this.i.push(base + idx);
      return this;
    }

    build() {
      return {
        v: new Float32Array(this.v),
        i: this.vertexCount > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i),
        count: this.i.length,
        vcount: this.vertexCount,
      };
    }
  }

  GS.MeshBuilder = MeshBuilder;
  GS.STRIDE = STRIDE;
})(window.GS);
