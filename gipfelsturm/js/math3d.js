'use strict';
// Minimal column-major 4x4 matrix and vector helpers for the WebGL renderer.
(function (GS) {
  const M = {};

  M.create = () => {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  };

  M.identity = (m) => {
    m.fill(0);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  };

  M.copy = (o, a) => {
    o.set(a);
    return o;
  };

  M.mul = (o, a, b) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  };

  M.perspective = (o, fovy, aspect, near, far) => {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0);
    o[0] = f / aspect;
    o[5] = f;
    o[10] = (far + near) * nf;
    o[11] = -1;
    o[14] = 2 * far * near * nf;
    return o;
  };

  M.ortho = (o, l, r, b, t, n, f) => {
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    o.fill(0);
    o[0] = -2 * lr;
    o[5] = -2 * bt;
    o[10] = 2 * nf;
    o[12] = (l + r) * lr;
    o[13] = (t + b) * bt;
    o[14] = (f + n) * nf;
    o[15] = 1;
    return o;
  };

  M.lookAt = (o, ex, ey, ez, cx, cy, cz, ux, uy, uz) => {
    let z0 = ex - cx, z1 = ey - cy, z2 = ez - cz;
    let len = 1 / Math.hypot(z0, z1, z2);
    z0 *= len; z1 *= len; z2 *= len;
    let x0 = uy * z2 - uz * z1, x1 = uz * z0 - ux * z2, x2 = ux * z1 - uy * z0;
    len = Math.hypot(x0, x1, x2);
    if (len < 1e-6) { x0 = 1; x1 = 0; x2 = 0; } else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }
    const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
    o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
    o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * ex + x1 * ey + x2 * ez);
    o[13] = -(y0 * ex + y1 * ey + y2 * ez);
    o[14] = -(z0 * ex + z1 * ey + z2 * ez);
    o[15] = 1;
    return o;
  };

  M.invert = (o, a) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  };

  // In-place post-multiplications (m = m * T).
  M.translate = (m, x, y, z) => {
    m[12] += m[0] * x + m[4] * y + m[8] * z;
    m[13] += m[1] * x + m[5] * y + m[9] * z;
    m[14] += m[2] * x + m[6] * y + m[10] * z;
    m[15] += m[3] * x + m[7] * y + m[11] * z;
    return m;
  };

  M.scale = (m, x, y, z) => {
    for (let i = 0; i < 4; i++) {
      m[i] *= x;
      m[4 + i] *= y;
      m[8 + i] *= z;
    }
    return m;
  };

  M.rotY = (m, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < 4; i++) {
      const x = m[i], z = m[8 + i];
      m[i] = x * c - z * s;
      m[8 + i] = x * s + z * c;
    }
    return m;
  };

  M.rotX = (m, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < 4; i++) {
      const y = m[4 + i], z = m[8 + i];
      m[4 + i] = y * c + z * s;
      m[8 + i] = z * c - y * s;
    }
    return m;
  };

  M.rotZ = (m, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < 4; i++) {
      const x = m[i], y = m[4 + i];
      m[i] = x * c + y * s;
      m[4 + i] = y * c - x * s;
    }
    return m;
  };

  // Rotation about an arbitrary unit axis (post-multiply).
  M.rotAxis = (m, ax, ay, az, a) => {
    const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    const r = [
      t * ax * ax + c, t * ax * ay + s * az, t * ax * az - s * ay,
      t * ax * ay - s * az, t * ay * ay + c, t * ay * az + s * ax,
      t * ax * az + s * ay, t * ay * az - s * ax, t * az * az + c,
    ];
    const o = new Float32Array(16);
    o[0] = r[0]; o[1] = r[1]; o[2] = r[2];
    o[4] = r[3]; o[5] = r[4]; o[6] = r[5];
    o[8] = r[6]; o[9] = r[7]; o[10] = r[8];
    o[15] = 1;
    const tmp = new Float32Array(m);
    return M.mul(m, tmp, o);
  };

  // Matrix whose local +Y axis runs from p0 to p1, with the given thickness
  // on X and Z. Used to stretch unit limbs between two joints.
  M.segment = (o, x0, y0, z0, x1, y1, z1, tx, tz, refx, refy, refz) => {
    let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz) || 1e-4;
    dx /= len; dy /= len; dz /= len;
    // x axis = normalize(cross(ref, y))
    let rx = refx == null ? 0 : refx, ry = refy == null ? 0 : refy, rz = refz == null ? 1 : refz;
    let ax = ry * dz - rz * dy, ay = rz * dx - rx * dz, az = rx * dy - ry * dx;
    let al = Math.hypot(ax, ay, az);
    if (al < 1e-4) {
      rx = 1; ry = 0; rz = 0;
      ax = ry * dz - rz * dy; ay = rz * dx - rx * dz; az = rx * dy - ry * dx;
      al = Math.hypot(ax, ay, az) || 1;
    }
    ax /= al; ay /= al; az /= al;
    const bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax;
    o[0] = ax * tx; o[1] = ay * tx; o[2] = az * tx; o[3] = 0;
    o[4] = dx * len; o[5] = dy * len; o[6] = dz * len; o[7] = 0;
    o[8] = bx * tz; o[9] = by * tz; o[10] = bz * tz; o[11] = 0;
    o[12] = x0; o[13] = y0; o[14] = z0; o[15] = 1;
    return o;
  };

  M.apply = (m, x, y, z, out) => {
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return out;
  };

  // Project a world point to clip space; returns [ndcX, ndcY, w].
  M.project = (m, x, y, z, out) => {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out[2] = w;
    return out;
  };

  GS.M = M;
})(window.GS);
