'use strict';
// Trail map: hill-shaded relief rendered from the heightmap, pistes, lifts,
// huts, challenges and your position. Supports pan, zoom and fast travel.
(function (GS) {
  function baseImage(world) {
    if (world.mapBase) return world.mapBase;
    const T = world.terrain;
    const { nx, nz } = T;
    const c = document.createElement('canvas');
    c.width = nx;
    c.height = nz;
    const g = c.getContext('2d');
    const img = g.createImageData(nx, nz);
    const d = img.data;
    const rock = GS.hexToRgb(world.theme.rock);
    const ice = GS.hexToRgb(world.theme.ice || '#a9d8f2');
    const L = [-0.55, 0.72, -0.42];
    const ll = Math.hypot(L[0], L[1], L[2]);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const id = j * nx + i;
        const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nz - 1, j + 1);
        const dx = (T.h[j * nx + i1] - T.h[j * nx + i0]) / ((i1 - i0) * 4);
        const dz = (T.h[j1 * nx + i] - T.h[j0 * nx + i]) / ((j1 - j0) * 4);
        const n = [-dx, 1, -dz];
        const nl = Math.hypot(n[0], n[1], n[2]);
        const sh = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nl * ll);
        let col = [0.95, 0.97, 1];
        const surf = T.surf[id];
        if (surf === 3) col = GS.mixRgb(col, rock, 0.85);
        else if (surf === 2) col = GS.mixRgb(col, ice, 0.6);
        let k = 0.55 + sh * 0.5;
        // contour lines
        const h = T.h[id];
        if (i > 0 && Math.floor(h / 25) !== Math.floor(T.h[id - 1] / 25)) k *= 0.9;
        if (j > 0 && Math.floor(h / 25) !== Math.floor(T.h[id - nx] / 25)) k *= 0.9;
        d[id * 4] = Math.min(255, col[0] * k * 255);
        d[id * 4 + 1] = Math.min(255, col[1] * k * 255);
        d[id * 4 + 2] = Math.min(255, col[2] * (k * 0.9 + 0.1) * 255);
        d[id * 4 + 3] = 255;
      }
    }
    // trees
    for (const o of world.obstacles) {
      if (o.kind !== 'tree') continue;
      const i = Math.round(o.x / 4), j = Math.round(o.z / 4);
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const id = (j * nx + i) * 4;
      d[id] = d[id] * 0.35 + 30 * 0.65;
      d[id + 1] = d[id + 1] * 0.35 + 90 * 0.65;
      d[id + 2] = d[id + 2] * 0.35 + 70 * 0.65;
    }
    g.putImageData(img, 0, 0);
    world.mapBase = c;
    return c;
  }

  class MapView {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.game = game;
      this.world = game.world;
      this.zoom = 1;
      this.cx = game.player.x;
      this.cz = game.player.z;
      this.hits = [];
      this.sel = null;
    }

    fit() {
      const c = this.canvas;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      this.dpr = dpr;
      const w = this.world;
      this.base = Math.min(c.clientWidth / w.W, c.clientHeight / w.L) * 0.96;
    }

    get scale() { return this.base * this.zoom; }

    toScreen(x, z) {
      const c = this.canvas;
      return [(x - this.cx) * this.scale + c.clientWidth / 2, (z - this.cz) * this.scale + c.clientHeight / 2];
    }

    toWorld(sx, sy) {
      const c = this.canvas;
      return [(sx - c.clientWidth / 2) / this.scale + this.cx, (sy - c.clientHeight / 2) / this.scale + this.cz];
    }

    clampView() {
      const w = this.world, c = this.canvas;
      const hw = c.clientWidth / 2 / this.scale, hh = c.clientHeight / 2 / this.scale;
      this.cx = hw * 2 >= w.W ? w.W / 2 : GS.clamp(this.cx, hw, w.W - hw);
      this.cz = hh * 2 >= w.L ? w.L / 2 : GS.clamp(this.cz, hh, w.L - hh);
    }

    draw() {
      const c = this.canvas, g = c.getContext('2d');
      const w = this.world, game = this.game;
      this.clampView();
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = '#c9d6e6';
      g.fillRect(0, 0, c.clientWidth, c.clientHeight);
      const [ox, oy] = this.toScreen(0, 0);
      const s = this.scale;
      g.imageSmoothingEnabled = true;
      g.drawImage(baseImage(w), ox, oy, w.W * s, w.L * s);
      this.hits = [];
      // pistes
      for (const p of w.pistes) {
        g.lineCap = 'round';
        g.lineJoin = 'round';
        for (const [col, lw] of [['rgba(255,255,255,0.85)', 6.5], [p.color, 3.5]]) {
          g.strokeStyle = col;
          g.lineWidth = lw * Math.min(1.6, Math.max(0.7, this.zoom * 0.8));
          g.beginPath();
          p.pts.forEach((q, k) => {
            const [x, y] = this.toScreen(q.x, q.z);
            if (k) g.lineTo(x, y); else g.moveTo(x, y);
          });
          g.stroke();
        }
        // number badge
        const mid = p.pts[Math.floor(p.pts.length * 0.45)];
        const [bx, by] = this.toScreen(mid.x, mid.z);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(bx, by, 9, 0, GS.TAU);
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = '#fff';
        g.font = '700 10px Fredoka, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(p.num), bx, by + 0.5);
      }
      // lifts
      const prog = GS.Progress;
      for (const l of w.lifts) {
        const ok = prog.liftUnlocked(w.def, l);
        const [ax, ay] = this.toScreen(l.B.x, l.B.z);
        const [bx, by] = this.toScreen(l.T.x, l.T.z);
        g.strokeStyle = ok ? '#1b2a41' : 'rgba(27,42,65,0.45)';
        g.lineWidth = 2.5;
        g.setLineDash(ok ? [] : [6, 5]);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
        g.setLineDash([]);
        for (const [x, y, top] of [[ax, ay, false], [bx, by, true]]) {
          g.fillStyle = ok ? l.color : '#8a94a3';
          g.beginPath();
          g.arc(x, y, top ? 8 : 10, 0, GS.TAU);
          g.fill();
          g.strokeStyle = '#fff';
          g.lineWidth = 2.5;
          g.stroke();
          if (!ok) {
            g.fillStyle = '#fff';
            g.font = '700 10px Fredoka, sans-serif';
            g.fillText('🔒', x, y + 1);
          }
          this.hits.push({ x, y, r: 16, kind: 'lift', l, top, ok });
        }
        // label
        g.font = '600 12px Fredoka, sans-serif';
        const label = l.name;
        const lx = (ax + bx) / 2 + 10, ly = (ay + by) / 2;
        g.fillStyle = 'rgba(255,255,255,0.85)';
        const tw = g.measureText(label).width;
        g.fillRect(lx - 4, ly - 9, tw + 8, 18);
        g.fillStyle = '#1b2a41';
        g.textAlign = 'left';
        g.fillText(label, lx, ly + 1);
        g.textAlign = 'center';
      }
      // huts & village
      for (const h of w.huts) {
        const [x, y] = this.toScreen(h.x, h.z);
        g.font = '16px sans-serif';
        g.fillText('🏠', x, y);
      }
      // launches & zips
      for (const L of w.launches) {
        const [x, y] = this.toScreen(L.x, L.z);
        g.font = '16px sans-serif';
        g.fillText('🪂', x, y);
      }
      for (const z of w.zips) {
        const [x0, y0] = this.toScreen(z.ax, z.az), [x1, y1] = this.toScreen(z.bx, z.bz);
        g.strokeStyle = '#ff7b00';
        g.lineWidth = 2;
        g.setLineDash([3, 4]);
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.setLineDash([]);
      }
      // collectibles found
      for (const cl of w.collectibles) {
        if (!prog.isFound(w.def.id, cl.id)) continue;
        const [x, y] = this.toScreen(cl.x, cl.z);
        g.font = '14px sans-serif';
        g.fillText('✿', x, y);
      }
      // challenges
      if (!GS.settings.zen) {
        for (const ch of w.challenges) {
          const [x, y] = this.toScreen(ch.start.x, ch.start.z);
          const tier = prog.medal(ch.id);
          const locked = game.challengeLocked(ch);
          g.fillStyle = locked ? '#9aa5b4' : ch.color;
          g.beginPath();
          g.arc(x, y, 11, 0, GS.TAU);
          g.fill();
          g.lineWidth = 3;
          g.strokeStyle = tier === 3 ? '#ffd23f' : tier === 2 ? '#d8dee8' : tier === 1 ? '#d08c4f' : '#ffffff';
          g.stroke();
          g.fillStyle = '#fff';
          g.font = '700 11px Fredoka, sans-serif';
          g.fillText(GS.Art.typeGlyph(ch.type), x, y + 1);
          this.hits.push({ x, y, r: 15, kind: 'challenge', ch, locked });
        }
      }
      // player
      const p = game.player;
      const [px, py] = this.toScreen(p.x, p.z);
      g.save();
      g.translate(px, py);
      g.rotate(-p.heading + Math.PI);
      g.fillStyle = '#ff3b30';
      g.strokeStyle = '#fff';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(0, -11);
      g.lineTo(8, 9);
      g.lineTo(0, 4);
      g.lineTo(-8, 9);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      // selection
      if (this.sel) {
        const h = this.sel;
        g.strokeStyle = '#ff3b30';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(h.x, h.y, h.r + 4, 0, GS.TAU);
        g.stroke();
      }
    }

    hit(sx, sy) {
      let best = null, bd = 1e9;
      for (const h of this.hits) {
        const d = Math.hypot(h.x - sx, h.y - sy);
        if (d < h.r + 6 && d < bd) { bd = d; best = h; }
      }
      return best;
    }
  }

  GS.MapView = MapView;
  GS.mapBaseImage = baseImage;
})(window.GS);
