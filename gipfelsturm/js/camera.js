'use strict';
// Follow camera: high top-down view looking up the slope, leading in the
// direction of travel; zoomable, with shake and a free "observe" mode.
(function (GS) {
  class Camera {
    constructor(game) {
      this.game = game;
      this.zoom = GS.settings.zoom || 1;
      this.target = [0, 0, 0];
      this.eye = [0, 50, 50];
      this.dist = 40;
      this.pitch = 1.0;
      this.shake = 0;
      this.free = null;
      this.fovy = 0.72;
    }

    snap() {
      this._snap = true;
    }

    setZoom(z) {
      this.zoom = GS.clamp(z, 0.45, 2.6);
      GS.settings.zoom = this.zoom;
    }

    update(dt, focus) {
      const g = this.game, T = g.world.terrain;
      let tx, ty, tz, dist, pitch;
      if (this.free) {
        const f = this.free;
        tx = f.x; tz = f.z; ty = T.heightAt(f.x, f.z);
        dist = f.dist;
        pitch = 1.05;
      } else {
        const p = focus;
        const lead = GS.clamp(0.45, 0, 1);
        let lx = p.vx * lead, lz = p.vz * lead;
        const ll = Math.hypot(lx, lz);
        if (ll > 14) { lx *= 14 / ll; lz *= 14 / ll; }
        tx = p.x + lx; tz = p.z + lz; ty = p.y + 1;
        const sp = p.speed || 0;
        dist = 40 * this.zoom * (1 + Math.min(sp, 35) / 80);
        pitch = 1.0;
        if (p.mode === 'air') dist += Math.min(12, (p.y - T.heightAt(p.x, p.z)) * 0.35);
        if (p.mode === 'glide') { dist = 62 * this.zoom; pitch = 0.88; }
        if (p.mode === 'lift') { dist = 46 * this.zoom; pitch = 0.92; }
        if (p.mode === 'zip') { dist = 44 * this.zoom; }
        if (g.skiJumpMode) { dist = 52 * this.zoom; pitch = 0.82; }
        if (g.attract) { dist = 58; pitch = 0.9; }
      }
      const k = this._snap ? 1 : 1 - Math.exp(-dt * 5.5);
      const kd = this._snap ? 1 : 1 - Math.exp(-dt * 2.2);
      this.target[0] += (tx - this.target[0]) * k;
      this.target[1] += (ty - this.target[1]) * k;
      this.target[2] += (tz - this.target[2]) * k;
      this.dist += (dist - this.dist) * kd;
      this.pitch += (pitch - this.pitch) * kd;
      this._snap = false;
      const t = this.target;
      const e = this.eye;
      e[0] = t[0];
      e[1] = t[1] + Math.sin(this.pitch) * this.dist;
      e[2] = t[2] + Math.cos(this.pitch) * this.dist;
      const minY = T.heightAt(e[0], Math.min(e[2], g.world.L)) + 6;
      if (e[1] < minY) e[1] = minY;
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 2.5);
        const s = this.shake * 0.6;
        e[0] += (Math.random() - 0.5) * s;
        e[1] += (Math.random() - 0.5) * s;
        e[2] += (Math.random() - 0.5) * s;
      }
      const near = Math.max(0.4, this.dist * 0.04);
      const far = this.dist * 6 + 900;
      g.renderer.setCamera(e, t, this.fovy, near, far);
    }
  }
  GS.Camera = Camera;
})(window.GS);
