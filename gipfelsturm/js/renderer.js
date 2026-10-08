'use strict';
// WebGL2 renderer: shadow pass + forward pass for terrain chunks, merged
// static meshes, instanced props (trees, rocks, chairs, coins), a per-frame
// dynamic batch (characters, gates…), ski tracks, particles and snowfall.
(function (GS) {
  const M = GS.M;
  const S = GS.Shaders;
  const STRIDE = GS.STRIDE;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      console.error(log, src);
      throw new Error('shader: ' + log);
    }
    return sh;
  }

  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  // Frustum planes from a view-projection matrix (for AABB culling).
  function planes(m, out) {
    const rows = [
      [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
      [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
      [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
      [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
      [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
      [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],
    ];
    for (let i = 0; i < 6; i++) out[i] = rows[i];
    return out;
  }

  function boxVisible(pl, b) {
    for (let i = 0; i < 6; i++) {
      const p = pl[i];
      const x = p[0] > 0 ? b[3] : b[0];
      const y = p[1] > 0 ? b[4] : b[1];
      const z = p[2] > 0 ? b[5] : b[2];
      if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
    }
    return true;
  }

  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!gl) throw new Error('webgl2');
      this.gl = gl;
      this.canvas = canvas;
      this.progObj = program(gl, S.OBJ_VS, S.OBJ_FS);
      this.progTer = program(gl, S.OBJ_VS, S.TER_FS);
      this.progDepth = program(gl, S.DEPTH_VS, S.DEPTH_FS);
      this.progTrack = program(gl, S.TRACK_VS, S.TRACK_FS);
      this.progPart = program(gl, S.PART_VS, S.PART_FS);
      this.progSnow = program(gl, S.SNOW_VS, S.SNOW_FS);
      this.progGlow = program(gl, S.OBJ_VS, S.GLOW_FS);
      this.vp = M.create();
      this.view = M.create();
      this.proj = M.create();
      this.invVP = M.create();
      this.lightVP = M.create();
      this.pl = new Array(6);
      this.lpl = new Array(6);
      this.camPos = [0, 0, 0];
      this.time = 0;
      this.shadowSize = 2048;
      this.shadowOn = true;
      this._initShadow(2048);
      this._initBatch(180000);
      this._initGlow(30000);
      this._initTracks(20000);
      this._initParticles(3000);
      this._initSnow(5000);
      this.stats = { draws: 0 };
      this.lampData = new Float32Array(48);
      this.lampOn = 0;
    }

    // Up to 12 point lights (street lamps) nearest to the focus point.
    setLamps(list, focus, on) {
      this.lampOn = on;
      const d = this.lampData;
      d.fill(0);
      if (!on || !list.length) return;
      const near = [];
      for (const l of list) {
        const dd = (l.x - focus[0]) * (l.x - focus[0]) + (l.z - focus[2]) * (l.z - focus[2]);
        if (dd < 160 * 160) near.push([dd, l]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < Math.min(12, near.length); i++) {
        const l = near[i][1];
        d[i * 4] = l.x; d[i * 4 + 1] = l.y; d[i * 4 + 2] = l.z; d[i * 4 + 3] = l.i || 1.4;
      }
    }

    setQuality(q) {
      const size = q === 'low' ? 1024 : q === 'high' ? 4096 : 2048;
      this.shadowOn = true;
      if (size !== this.shadowSize) this._initShadow(size);
    }

    _initShadow(size) {
      const gl = this.gl;
      if (this.shadowTex) gl.deleteTexture(this.shadowTex);
      if (this.shadowFbo) gl.deleteFramebuffer(this.shadowFbo);
      this.shadowSize = size;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.shadowTex = t;
      this.shadowFbo = f;
    }

    // ---------- Meshes ------------------------------------------------------
    upload(built) {
      const gl = this.gl;
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, built.v, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, built.i, gl.STATIC_DRAW);
      const mesh = {
        vbo, ibo, count: built.count,
        itype: built.i instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      };
      mesh.vao = this._vao(mesh, null);
      return mesh;
    }

    _vao(mesh, instBuf) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE * 4, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE * 4, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * 4, 24);
      if (instBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0);
        gl.vertexAttribDivisor(3, 1);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16);
        gl.vertexAttribDivisor(4, 1);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.bindVertexArray(null);
      return vao;
    }

    // Instances: Float32Array of 8 floats each (x,y,z,rotY, sx,sy,sz,snow).
    instanced(mesh, data, dynamic) {
      const gl = this.gl;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      return { mesh, buf, vao: this._vao(mesh, buf), count: data.length / 8, cap: data.length / 8 };
    }

    updateInstanced(inst, data, count) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, inst.buf);
      if (count > inst.cap) {
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        inst.cap = data.length / 8;
      } else {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 8);
      }
      inst.count = count;
    }

    freeMesh(mesh) {
      const gl = this.gl;
      if (!mesh) return;
      gl.deleteBuffer(mesh.vbo);
      gl.deleteBuffer(mesh.ibo);
      gl.deleteVertexArray(mesh.vao);
    }

    freeInstanced(inst) {
      const gl = this.gl;
      gl.deleteBuffer(inst.buf);
      gl.deleteVertexArray(inst.vao);
    }

    // ---------- Dynamic batch ------------------------------------------------
    _initBatch(maxV) {
      const gl = this.gl;
      this.bMax = maxV;
      this.bV = new Float32Array(maxV * STRIDE);
      this.bI = new Uint32Array(maxV * 6);
      this.bN = 0;
      this.bIN = 0;
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.bV.byteLength, gl.DYNAMIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.bI.byteLength, gl.DYNAMIC_DRAW);
      this.batch = { vbo, ibo, count: 0, itype: gl.UNSIGNED_INT };
      this.batch.vao = this._vao(this.batch, null);
    }

    _initGlow(maxV) {
      const gl = this.gl;
      this.gMax = maxV;
      this.gV = new Float32Array(maxV * STRIDE);
      this.gI = new Uint32Array(maxV * 6);
      this.gN = 0;
      this.gIN = 0;
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.gV.byteLength, gl.DYNAMIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.gI.byteLength, gl.DYNAMIC_DRAW);
      this.glowBatch = { vbo, ibo, count: 0, itype: gl.UNSIGNED_INT };
      this.glowBatch.vao = this._vao(this.glowBatch, null);
    }

    // Append a CPU mesh transformed by matrix m, colors multiplied by tint.
    push(mesh, m, tr, tg, tb, glow) {
      const V = glow ? this.gV : this.bV;
      const I = glow ? this.gI : this.bI;
      let n = glow ? this.gN : this.bN;
      let ni = glow ? this.gIN : this.bIN;
      const max = glow ? this.gMax : this.bMax;
      const vc = mesh.vcount;
      if (n + vc > max || ni + mesh.i.length > I.length) return;
      if (tr == null) { tr = 1; tg = 1; tb = 1; }
      // normal matrix = inverse transpose of upper 3x3
      const a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[4], a11 = m[5], a12 = m[6], a20 = m[8], a21 = m[9], a22 = m[10];
      const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
      let det = a00 * b01 + a01 * b11 + a02 * b21;
      det = det ? 1 / det : 0;
      const n00 = b01 * det, n01 = (-a22 * a01 + a02 * a21) * det, n02 = (a12 * a01 - a02 * a11) * det;
      const n10 = b11 * det, n11 = (a22 * a00 - a02 * a20) * det, n12 = (-a12 * a00 + a02 * a10) * det;
      const n20 = b21 * det, n21 = (-a21 * a00 + a01 * a20) * det, n22 = (a11 * a00 - a01 * a10) * det;
      const src = mesh.v;
      let o = n * STRIDE;
      for (let k = 0, e = vc * STRIDE; k < e; k += STRIDE) {
        const x = src[k], y = src[k + 1], z = src[k + 2];
        V[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
        V[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        V[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        const nx = src[k + 3], ny = src[k + 4], nz = src[k + 5];
        // inverse transpose: rows of inverse become columns
        const qx = n00 * nx + n01 * ny + n02 * nz;
        const qy = n10 * nx + n11 * ny + n12 * nz;
        const qz = n20 * nx + n21 * ny + n22 * nz;
        const l = 1 / (Math.sqrt(qx * qx + qy * qy + qz * qz) || 1);
        V[o + 3] = qx * l;
        V[o + 4] = qy * l;
        V[o + 5] = qz * l;
        V[o + 6] = src[k + 6] * tr;
        V[o + 7] = src[k + 7] * tg;
        V[o + 8] = src[k + 8] * tb;
        V[o + 9] = src[k + 9];
        o += STRIDE;
      }
      const idx = mesh.i;
      for (let k = 0; k < idx.length; k++) I[ni++] = idx[k] + n;
      n += vc;
      if (glow) { this.gN = n; this.gIN = ni; } else { this.bN = n; this.bIN = ni; }
    }

    _flushBatch(b, V, I, n, ni) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, V, 0, n * STRIDE);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ibo);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, I, 0, ni);
      b.count = ni;
    }

    // ---------- Tracks ------------------------------------------------------
    _initTracks(maxSeg) {
      const gl = this.gl;
      this.tMax = maxSeg;
      this.tV = new Float32Array(maxSeg * 4 * 6);
      this.tHead = 0;
      this.tUsed = 0;
      this.tDirtyFrom = maxSeg;
      this.tDirtyTo = 0;
      const idx = new Uint32Array(maxSeg * 6);
      for (let s = 0; s < maxSeg; s++) {
        const b = s * 4;
        idx.set([b, b + 1, b + 2, b, b + 2, b + 3], s * 6);
      }
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.tV, gl.DYNAMIC_DRAW);
      const ibo = gl.createBuffer();
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      this.tracks = { vbo, ibo, vao };
    }

    clearTracks() {
      this.tV.fill(0);
      this.tHead = 0;
      this.tUsed = 0;
      this.tDirtyFrom = 0;
      this.tDirtyTo = this.tMax;
    }

    // Quad from (ax,ay,az)±(px,pz)*w to (bx,by,bz)±(qx,qz)*w.
    addTrack(ax, ay, az, bx, by, bz, pxa, pza, pxb, pzb, w, kind) {
      const s = this.tHead;
      const V = this.tV;
      let o = s * 24;
      const t = this.time;
      const put = (x, y, z, u) => {
        V[o] = x; V[o + 1] = y; V[o + 2] = z; V[o + 3] = u; V[o + 4] = t; V[o + 5] = kind;
        o += 6;
      };
      put(ax - pxa * w, ay, az - pza * w, 0);
      put(ax + pxa * w, ay, az + pza * w, 1);
      put(bx + pxb * w, by, bz + pzb * w, 1);
      put(bx - pxb * w, by, bz - pzb * w, 0);
      this.tDirtyFrom = Math.min(this.tDirtyFrom, s);
      this.tDirtyTo = Math.max(this.tDirtyTo, s + 1);
      this.tHead = (s + 1) % this.tMax;
      this.tUsed = Math.min(this.tUsed + 1, this.tMax);
    }

    // ---------- Particles ---------------------------------------------------
    _initParticles(max) {
      const gl = this.gl;
      this.pMax = max;
      this.pPos = new Float32Array(max * 3);
      this.pVel = new Float32Array(max * 3);
      this.pLife = new Float32Array(max);
      this.pMaxLife = new Float32Array(max);
      this.pSize = new Float32Array(max);
      this.pGrow = new Float32Array(max);
      this.pCol = new Float32Array(max * 4);
      this.pGrav = new Float32Array(max);
      this.pDrag = new Float32Array(max);
      this.pNext = 0;
      this.pOut = new Float32Array(max * 8);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.pOut.byteLength, gl.DYNAMIC_DRAW);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
      gl.bindVertexArray(null);
      this.parts = { vbo, vao, count: 0 };
    }

    emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, grav, grow, drag) {
      const i = this.pNext;
      this.pNext = (i + 1) % this.pMax;
      this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
      this.pVel[i * 3] = vx; this.pVel[i * 3 + 1] = vy; this.pVel[i * 3 + 2] = vz;
      this.pLife[i] = life;
      this.pMaxLife[i] = life;
      this.pSize[i] = size;
      this.pGrow[i] = grow || 0;
      this.pCol[i * 4] = r; this.pCol[i * 4 + 1] = g; this.pCol[i * 4 + 2] = b; this.pCol[i * 4 + 3] = a;
      this.pGrav[i] = grav == null ? 9.8 : grav;
      this.pDrag[i] = drag == null ? 1.5 : drag;
    }

    clearParticles() {
      this.pLife.fill(0);
    }

    updateParticles(dt) {
      let n = 0;
      const out = this.pOut;
      for (let i = 0; i < this.pMax; i++) {
        let life = this.pLife[i];
        if (life <= 0) continue;
        life -= dt;
        this.pLife[i] = life;
        if (life <= 0) continue;
        const d = Math.exp(-this.pDrag[i] * dt);
        const j = i * 3;
        this.pVel[j] *= d;
        this.pVel[j + 1] = this.pVel[j + 1] * d - this.pGrav[i] * dt;
        this.pVel[j + 2] *= d;
        this.pPos[j] += this.pVel[j] * dt;
        this.pPos[j + 1] += this.pVel[j + 1] * dt;
        this.pPos[j + 2] += this.pVel[j + 2] * dt;
        this.pSize[i] += this.pGrow[i] * dt;
        const t = life / this.pMaxLife[i];
        const o = n * 8;
        out[o] = this.pPos[j]; out[o + 1] = this.pPos[j + 1]; out[o + 2] = this.pPos[j + 2];
        out[o + 3] = this.pCol[i * 4]; out[o + 4] = this.pCol[i * 4 + 1]; out[o + 5] = this.pCol[i * 4 + 2];
        out[o + 6] = this.pCol[i * 4 + 3] * Math.min(1, t * 2.5);
        out[o + 7] = this.pSize[i];
        n++;
      }
      this.parts.count = n;
    }

    // ---------- Snowfall ----------------------------------------------------
    _initSnow(max) {
      const gl = this.gl;
      const r = GS.rng(99);
      const d = new Float32Array(max * 4);
      for (let i = 0; i < max; i++) {
        d[i * 4] = r(); d[i * 4 + 1] = r(); d[i * 4 + 2] = r(); d[i * 4 + 3] = r();
      }
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
      gl.bindVertexArray(null);
      this.snow = { vbo, vao, max };
    }

    // ---------- Camera ------------------------------------------------------
    setCamera(eye, target, fovy, near, far) {
      const aspect = this.canvas.width / this.canvas.height;
      M.perspective(this.proj, fovy, aspect, near, far);
      M.lookAt(this.view, eye[0], eye[1], eye[2], target[0], target[1], target[2], 0, 1, 0);
      M.mul(this.vp, this.proj, this.view);
      M.invert(this.invVP, this.vp);
      planes(this.vp, this.pl);
      this.camPos[0] = eye[0]; this.camPos[1] = eye[1]; this.camPos[2] = eye[2];
      this.fovy = fovy;
    }

    // World point -> CSS pixel coordinates.
    toScreen(x, y, z, out) {
      out = out || [0, 0, 0];
      M.project(this.vp, x, y, z, out);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      out[0] = (out[0] * 0.5 + 0.5) * w;
      out[1] = (1 - (out[1] * 0.5 + 0.5)) * h;
      return out;
    }

    // Ray through CSS pixel; returns {o:[..], d:[..]}.
    screenRay(px, py) {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
      const a = [0, 0, 0], b = [0, 0, 0];
      const m = this.invVP;
      const un = (x, y, z, out) => {
        const ww = m[3] * x + m[7] * y + m[11] * z + m[15];
        out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / ww;
        out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / ww;
        out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / ww;
      };
      un(nx, ny, -1, a);
      un(nx, ny, 1, b);
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l = Math.hypot(d[0], d[1], d[2]);
      return { o: a, d: [d[0] / l, d[1] / l, d[2] / l] };
    }

    _lightMatrix(env, focus, radius) {
      const sd = env.sunDir;
      const dist = 400;
      const ex = focus[0] + sd[0] * dist, ey = focus[1] + sd[1] * dist, ez = focus[2] + sd[2] * dist;
      const view = M.create();
      M.lookAt(view, ex, ey, ez, focus[0], focus[1], focus[2], 0, 1, 0);
      // snap to texel grid to avoid shimmering
      const texel = (radius * 2) / this.shadowSize;
      const cx = view[12], cy = view[13];
      view[12] = Math.round(cx / texel) * texel;
      view[13] = Math.round(cy / texel) * texel;
      const proj = M.create();
      M.ortho(proj, -radius, radius, -radius, radius, 1, dist * 2);
      M.mul(this.lightVP, proj, view);
      planes(this.lightVP, this.lpl);
    }

    _setLight(u, env) {
      const gl = this.gl;
      gl.uniform3fv(u.uSunDir, env.sunDir);
      gl.uniform3fv(u.uSunCol, env.sunCol);
      gl.uniform3fv(u.uSkyCol, env.skyCol);
      gl.uniform3fv(u.uGndCol, env.gndCol);
      gl.uniform3fv(u.uFogCol, env.fogCol);
      gl.uniform1f(u.uFogDen, env.fogDen);
      gl.uniform3fv(u.uCamPos, this.camPos);
      gl.uniform1f(u.uNight, env.night);
      if (u.uShadow) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(u.uShadow, 0);
        gl.uniformMatrix4fv(u.uShadowMat, false, this.lightVP);
        gl.uniform1f(u.uShadowTexel, 1 / this.shadowSize);
        gl.uniform1f(u.uShadowOn, this.shadowOn ? 1 : 0);
      }
      if (u.uSnowCol) gl.uniform3fv(u.uSnowCol, env.snowCol);
      if (u['uLamps[0]']) {
        gl.uniform4fv(u['uLamps[0]'], this.lampData);
        gl.uniform1f(u.uLampOn, this.lampOn);
      }
      if (u.uTime) gl.uniform1f(u.uTime, this.time);
      if (u.uWind) gl.uniform1f(u.uWind, 0);
    }

    _draw(mesh) {
      const gl = this.gl;
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.itype, 0);
      this.stats.draws++;
    }

    _drawInst(inst) {
      if (!inst.count) return;
      const gl = this.gl;
      gl.bindVertexArray(inst.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, inst.mesh.count, inst.mesh.itype, 0, inst.count);
      this.stats.draws++;
    }

    // scene: { terrain:[{mesh,box}], statics:[{mesh,box}], inst:[{inst,box,sway}], dynInst:[inst] }
    render(scene, env, focus) {
      const gl = this.gl;
      this.stats.draws = 0;
      const W = this.canvas.width, H = this.canvas.height;
      const constI = () => {
        gl.vertexAttrib4f(3, 0, 0, 0, 0);
        gl.vertexAttrib4f(4, 1, 1, 1, env.objSnow);
      };

      // upload batches
      this._flushBatch(this.batch, this.bV, this.bI, this.bN, this.bIN);
      this._flushBatch(this.glowBatch, this.gV, this.gI, this.gN, this.gIN);
      if (this.tDirtyTo > this.tDirtyFrom) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.tracks.vbo);
        const a = this.tDirtyFrom * 24, b = this.tDirtyTo * 24;
        gl.bufferSubData(gl.ARRAY_BUFFER, a * 4, this.tV, a, b - a);
        this.tDirtyFrom = this.tMax;
        this.tDirtyTo = 0;
      }

      // ---- shadow pass
      const shadowR = scene.shadowRadius || 70;
      this._lightMatrix(env, focus, shadowR);
      if (this.shadowOn) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.5, 3);
        const P = this.progDepth;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.uVP, false, this.lightVP);
        constI();
        for (const c of scene.terrain) if (boxVisible(this.lpl, c.box)) this._draw(c.mesh);
        for (const c of scene.statics) if (boxVisible(this.lpl, c.box)) this._draw(c.mesh);
        for (const c of scene.inst) if (boxVisible(this.lpl, c.box)) this._drawInst(c.inst);
        for (const inst of scene.dynInst) this._drawInst(inst);
        constI();
        if (this.batch.count) this._draw(this.batch);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }

      // ---- main pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.clearColor(env.fogCol[0], env.fogCol[1], env.fogCol[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      // terrain
      let P = this.progTer;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
      this._setLight(P.u, env);
      constI();
      for (const c of scene.terrain) if (boxVisible(this.pl, c.box)) this._draw(c.mesh);

      // objects
      gl.disable(gl.CULL_FACE);
      P = this.progObj;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
      this._setLight(P.u, env);
      constI();
      for (const c of scene.statics) if (boxVisible(this.pl, c.box)) this._draw(c.mesh);
      gl.uniform1f(P.u.uWind, env.wind);
      for (const c of scene.inst) if (boxVisible(this.pl, c.box)) this._drawInst(c.inst);
      gl.uniform1f(P.u.uWind, 0);
      for (const inst of scene.dynInst) this._drawInst(inst);
      constI();
      if (this.batch.count) this._draw(this.batch);

      // tracks
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -4);
      P = this.progTrack;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
      gl.uniform1f(P.u.uTime, this.time);
      gl.uniform3fv(P.u.uTrackCol, env.trackCol);
      gl.uniform3fv(P.u.uFogCol, env.fogCol);
      gl.uniform1f(P.u.uFogDen, env.fogDen);
      gl.uniform3fv(P.u.uCamPos, this.camPos);
      gl.bindVertexArray(this.tracks.vao);
      gl.drawElements(gl.TRIANGLES, this.tUsed * 6, gl.UNSIGNED_INT, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);

      // glow markers (additive)
      if (this.glowBatch.count) {
        gl.blendFunc(gl.ONE, gl.ONE);
        P = this.progGlow;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
        gl.uniform1f(P.u.uTime, this.time);
        gl.uniform3fv(P.u.uFogCol, env.fogCol);
        gl.uniform1f(P.u.uFogDen, env.fogDen);
        gl.uniform3fv(P.u.uCamPos, this.camPos);
        gl.uniform1f(P.u.uWind, 0);
        constI();
        this._draw(this.glowBatch);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }

      // particles
      const pxScale = H / (2 * Math.tan(this.fovy / 2));
      if (this.parts.count) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.parts.vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pOut, 0, this.parts.count * 8);
        P = this.progPart;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
        gl.uniform1f(P.u.uPxScale, pxScale);
        gl.bindVertexArray(this.parts.vao);
        gl.drawArrays(gl.POINTS, 0, this.parts.count);
      }

      // falling snow
      if (env.snowfall > 0.01) {
        P = this.progSnow;
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
        gl.uniform3f(P.u.uCenter, focus[0], focus[1] + 12, focus[2]);
        gl.uniform1f(P.u.uTime, this.time);
        gl.uniform3f(P.u.uFall, env.windX * 1.5, -2.2 - env.storm * 2, env.windZ * 1.5);
        gl.uniform1f(P.u.uBox, 70);
        gl.uniform1f(P.u.uPxScale, pxScale);
        gl.uniform1f(P.u.uCount, env.snowfall);
        gl.uniform3fv(P.u.uFlakeCol, env.flakeCol);
        gl.bindVertexArray(this.snow.vao);
        gl.drawArrays(gl.POINTS, 0, this.snow.max);
      }

      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);

      this.bN = 0; this.bIN = 0;
      this.gN = 0; this.gIN = 0;
    }
  }

  GS.Renderer = Renderer;
  GS.boxVisible = boxVisible;
})(window.GS);
