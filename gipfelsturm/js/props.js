'use strict';
// Procedural low-poly prop library: trees, rocks, buildings, lift hardware,
// course markers, collectibles and character parts. Every asset in the game
// is generated here from code – no model files.
(function (GS) {
  const MB = GS.MeshBuilder;
  const P = {};

  const greens = ['#1f5a44', '#24694c', '#2c7a56', '#1a4d3b'];

  P.pine = (seed, theme) => {
    const r = GS.rng(seed);
    const b = new MB();
    const g = theme && theme.pine ? theme.pine : greens;
    b.col('#5e4330').cyl(0.2, 0.12, 0, 1.4, 5, null, false, false);
    const tiers = [[1.75, 0.7, 2.9], [1.4, 1.75, 3.8], [1.05, 2.75, 4.7], [0.68, 3.7, 5.5], [0.36, 4.6, 6.1]];
    tiers.forEach((t, k) => {
      const rot = r() * 6;
      b.col(g[k % g.length], false);
      b.push().rotY(rot).cyl(t[0], 0, t[1], t[2], 7, null, false, true, 0.22, r).pop();
      // snow cap on the upper part of the tier
      const f = 0.42 + r() * 0.12;
      b.col('#f4f8fd', true);
      b.push().rotY(rot + 0.2).cyl(t[0] * (1 - f) * 1.06, 0, t[1] + (t[2] - t[1]) * f + 0.03, t[2] + 0.06, 7, null, false, true, 0.25, r).pop();
    });
    return b.build();
  };

  P.spruce = (seed, theme) => {
    const r = GS.rng(seed);
    const b = new MB();
    const g = theme && theme.pine ? theme.pine : greens;
    b.col('#55402e').cyl(0.16, 0.1, 0, 1.2, 5);
    for (let k = 0; k < 6; k++) {
      const rad = 1.25 - k * 0.18;
      const y0 = 0.8 + k * 0.95, y1 = 2.4 + k * 0.95;
      const rot = r() * 6;
      b.col(g[(k + 1) % g.length], false);
      b.push().rotY(rot).cyl(rad, 0, y0, y1, 6, null, false, true, 0.25, r).pop();
      const f = 0.5 + r() * 0.12;
      b.col('#f4f8fd', true);
      b.push().rotY(rot + 0.25).cyl(rad * (1 - f) * 1.08, 0, y0 + (y1 - y0) * f + 0.03, y1 + 0.05, 6, null, false, true, 0.2, r).pop();
    }
    return b.build();
  };

  P.birch = (seed) => {
    const r = GS.rng(seed);
    const b = new MB();
    b.col('#e9e6df').cyl(0.15, 0.09, 0, 5.2, 6);
    for (let k = 0; k < 4; k++) b.col('#2b2b2b').push().translate(0, 0.8 + k * 1.1, 0).cyl(0.152, 0.15, 0, 0.12, 6).pop();
    for (let k = 0; k < 6; k++) {
      const a = r() * 6.28, y = 2.4 + r() * 2.4;
      b.col('#cfc9bf', true).push().translate(0, y, 0).rotY(a).rotZ(0.7 + r() * 0.4).cyl(0.06, 0.02, 0, 1.4 + r(), 4).pop();
    }
    b.col('#9c8f80', true).sphere(0, 4.6, 0, 1.25, 6, 4, null, 0.45, r, 0.9);
    b.col('#f2f5fa', true).sphere(0.1, 5.1, 0.05, 0.85, 5, 3, null, 0.4, r, 0.6);
    return b.build();
  };

  P.dead = (seed) => {
    const r = GS.rng(seed);
    const b = new MB();
    b.col('#2e2a29').cyl(0.22, 0.08, 0, 4.2, 5);
    for (let k = 0; k < 5; k++) {
      const a = r() * 6.28, y = 1.5 + r() * 2.4;
      b.col('#3a3534', true).push().translate(0, y, 0).rotY(a).rotZ(0.8 + r() * 0.5).cyl(0.07, 0.02, 0, 1 + r() * 1.2, 4).pop();
    }
    return b.build();
  };

  // Snow monster (Juhyo) – rime-encrusted firs of Japanese mountains.
  P.juhyo = (seed) => {
    const r = GS.rng(seed);
    const b = new MB();
    const h = 4.5 + r() * 2;
    for (let k = 0; k < 5; k++) {
      const y = 0.6 + k * h / 5;
      const rad = 1.6 - k * 0.27;
      b.col(k % 2 ? '#e8eef6' : '#f6f9fd', true).sphere((r() - 0.5) * 0.4, y, (r() - 0.5) * 0.4, rad, 7, 5, null, 0.35, r, 0.8);
    }
    b.col('#9fb3c6').sphere(0.4, 1.8, 1.0, 0.25, 5, 3, null, 0.4, r);
    return b.build();
  };

  P.shrub = (seed) => {
    const r = GS.rng(seed);
    const b = new MB();
    b.col('#3e5b3a', true).sphere(0, 0.7, 0, 1.1, 6, 4, null, 0.4, r, 0.7);
    b.col('#4d6b44', true).sphere(0.6, 0.6, 0.3, 0.7, 5, 4, null, 0.4, r, 0.7);
    return b.build();
  };

  P.crystal = (seed) => {
    const r = GS.rng(seed);
    const b = new MB();
    for (let k = 0; k < 4; k++) {
      const h = 1.2 + r() * 2.8;
      const cols = ['#7fe8ff', '#a98bff', '#64c8ff', '#c7b3ff'];
      b.col(cols[k], false).push().translate((r() - 0.5) * 1.4, 0, (r() - 0.5) * 1.4).rotZ((r() - 0.5) * 0.8).rotX((r() - 0.5) * 0.8);
      b.cyl(0.35, 0.3, 0, h, 6, null);
      b.cyl(0.3, 0, h, h + 0.6, 6, null);
      b.pop();
    }
    return b.build();
  };

  P.rock = (seed, theme) => {
    const r = GS.rng(seed);
    const b = new MB();
    const c = theme && theme.rock ? theme.rock : '#6d737c';
    b.col(c, true).sphere(0, 0.25, 0, 1, 7, 5, null, 0.55, r, 0.62);
    if (r() > 0.4) b.col(theme && theme.rock2 ? theme.rock2 : c, true).sphere(0.8, 0.1, 0.4, 0.55, 6, 4, null, 0.5, r, 0.7);
    return b.build();
  };

  P.serac = (seed) => {
    const r = GS.rng(seed);
    const b = new MB();
    for (let k = 0; k < 3; k++) {
      b.col(k ? '#9fd4f0' : '#c4e8fa', true).push().translate((r() - 0.5) * 2, 0, (r() - 0.5) * 2).rotY(r() * 3).rotZ((r() - 0.5) * 0.4);
      b.box(0, 1 + r(), 0, 1.4 + r() * 1.5, 2 + r() * 2.5, 1.2 + r());
      b.pop();
    }
    return b.build();
  };

  // ---------- Buildings ------------------------------------------------------
  P.chalet = (seed, opt) => {
    const r = GS.rng(seed);
    opt = opt || {};
    const b = new MB();
    const w = opt.w || 8 + r() * 4, d = opt.d || 7 + r() * 3, h = opt.h || 4 + r() * 2.5;
    const wood = opt.wood || GS.pick(r, ['#8a5a3b', '#7a4e33', '#9b6a45', '#6f4a35']);
    const roofC = opt.roof || GS.pick(r, ['#4a3a34', '#5b3b2e', '#3d4652', '#7a3b2e']);
    b.col('#b9b2a8').box(0, 0.6, 0, w + 0.4, 1.2, d + 0.4); // stone base
    b.col(wood).box(0, 1.2 + h / 2, 0, w, h, d);
    // windows (glow at night)
    const win = [1, 0.82, 0.48, 3];
    for (let k = 0; k < 3; k++) {
      const x = (-w / 2) + w * (k + 0.5) / 3;
      b.box(x, 1.2 + h * 0.55, d / 2 + 0.03, 1.1, 1.2, 0.08, win);
      b.box(x, 1.2 + h * 0.55, -d / 2 - 0.03, 1.1, 1.2, 0.08, win);
    }
    b.box(w / 2 + 0.03, 1.2 + h * 0.55, 0, 0.08, 1.2, 1.1, win);
    b.box(-w / 2 - 0.03, 1.2 + h * 0.55, 0, 0.08, 1.2, 1.1, win);
    b.col('#4b3226').box(0, 2.2, d / 2 + 0.05, 1.3, 2, 0.1);
    // gable roof, ridge along x
    const ry = 1.2 + h, rh = 2.4 + r(), ov = 0.9;
    const X0 = -w / 2 - ov, X1 = w / 2 + ov, Z0 = -d / 2 - ov, Z1 = d / 2 + ov;
    b.col(roofC);
    b.quad([X0, ry - 0.3, Z1], [X1, ry - 0.3, Z1], [X1, ry + rh, 0], [X0, ry + rh, 0]);
    b.quad([X1, ry - 0.3, Z0], [X0, ry - 0.3, Z0], [X0, ry + rh, 0], [X1, ry + rh, 0]);
    b.col('#f4f8fd', true);
    b.quad([X0, ry - 0.1, Z1], [X1, ry - 0.1, Z1], [X1, ry + rh + 0.22, 0], [X0, ry + rh + 0.22, 0]);
    b.quad([X1, ry - 0.1, Z0], [X0, ry - 0.1, Z0], [X0, ry + rh + 0.22, 0], [X1, ry + rh + 0.22, 0]);
    b.col(wood);
    b.tri([-w / 2, ry, d / 2], [-w / 2, ry + rh, 0], [-w / 2, ry, -d / 2]);
    b.tri([w / 2, ry, -d / 2], [w / 2, ry + rh, 0], [w / 2, ry, d / 2]);
    b.col('#7d7066').box(w * 0.25, ry + rh * 0.8, d * 0.15, 0.7, 2, 0.7);
    if (opt.terrace) {
      b.col('#8a6a4c').box(0, 0.75, d / 2 + 3, w + 2, 0.3, 5);
      for (let k = 0; k < 3; k++) {
        const x = -w / 2 + 1.5 + k * (w / 2 - 0.5);
        b.col('#6b5a4a').box(x, 1.9, d / 2 + 3, 0.12, 2.4, 0.12);
        b.col(GS.pick(r, ['#e63946', '#ffb703', '#2a9d8f', '#f4f1de'])).push().translate(x, 3.1, d / 2 + 3).cyl(1.5, 0, 0, 0.7, 8).pop();
        b.col('#8a6a4c').box(x, 1.05, d / 2 + 3, 1.6, 0.12, 0.8);
      }
    }
    return b.build();
  };

  P.station = (color, top) => {
    const b = new MB();
    b.col('#a7a39b').box(0, 0.4, 0, 12, 0.8, 9);
    for (const x of [-5, 5]) for (const z of [-3.5, 3.5]) b.col('#6c7480').box(x, 3, z, 0.6, 5, 0.6);
    b.col('#5a646f').box(0, 5.6, 0, 13, 0.5, 10);
    b.col(color).box(0, 5.15, 0, 13.1, 0.45, 10.1);
    b.col('#f3f7fd', true).box(0, 5.95, 0, 12.6, 0.25, 9.6);
    // bullwheel
    b.col('#3a3f46').push().translate(0, 4.4, top ? 2 : -2).cyl(3.2, 3.2, -0.15, 0.15, 12, null, true, true).pop();
    b.col('#d8dde4').box(-4.2, 1.6, 0, 2.6, 2.4, 3.2);
    b.box(-4.2, 2, 1.62, 1.8, 0.9, 0.05, [1, 0.85, 0.5, 3]);
    return b.build();
  };

  P.pylon = (h, color) => {
    const b = new MB();
    b.col('#7f8893').cyl(0.42, 0.3, 0, h, 7);
    b.col('#6a737e').box(0, 0.25, 0, 1.6, 0.5, 1.6);
    b.col(color).box(0, h, 0, 6.2, 0.4, 0.5);
    for (const x of [-2.6, 2.6]) b.col('#3a3f46').box(x, h - 0.35, 0, 0.3, 0.3, 1.8);
    return b.build();
  };

  P.chair = (color) => {
    const b = new MB();
    b.col('#3e444c').box(0, 1.6, 0, 0.08, 3.4, 0.08);
    b.col('#3e444c').box(0, 3.3, 0, 0.3, 0.2, 0.3);
    b.col(color).box(0, 0, 0, 2.4, 0.12, 0.65);
    b.col(color).box(0, 0.45, -0.32, 2.4, 0.8, 0.1);
    b.col('#3e444c').box(0, 0.75, 0.55, 2.4, 0.06, 0.06);
    b.col('#3e444c').box(-1.2, 0.35, 0.25, 0.06, 0.8, 0.06);
    b.col('#3e444c').box(1.2, 0.35, 0.25, 0.06, 0.8, 0.06);
    return b.build();
  };

  P.gondola = (color) => {
    const b = new MB();
    b.col('#3e444c').box(0, 2.6, 0, 0.1, 1.6, 0.1);
    b.col(color).box(0, 0.9, 0, 1.9, 1.9, 1.7);
    b.col('#f2f5f9', true).box(0, 1.9, 0, 1.95, 0.12, 1.75);
    b.box(0, 1.15, 0.87, 1.5, 0.7, 0.04, [0.18, 0.27, 0.38, 0]);
    b.box(0, 1.15, -0.87, 1.5, 0.7, 0.04, [0.18, 0.27, 0.38, 0]);
    b.box(0.97, 1.15, 0, 0.04, 0.7, 1.3, [0.18, 0.27, 0.38, 0]);
    b.box(-0.97, 1.15, 0, 0.04, 0.7, 1.3, [0.18, 0.27, 0.38, 0]);
    return b.build();
  };

  P.tbar = (color) => {
    const b = new MB();
    b.col('#3e444c').box(0, 1.8, 0, 0.06, 3.6, 0.06);
    b.col(color).box(0, 0.05, 0, 1.2, 0.12, 0.12);
    return b.build();
  };

  P.lamp = () => {
    const b = new MB();
    b.col('#3a3f46').cyl(0.1, 0.08, 0, 6, 5);
    b.col('#3a3f46').box(0.5, 6, 0, 1.2, 0.15, 0.2);
    b.box(1, 5.85, 0, 0.5, 0.2, 0.4, [1, 0.92, 0.7, 3]);
    return b.build();
  };

  P.torii = () => {
    const b = new MB();
    const red = '#c8372d';
    b.col(red).cyl(0.28, 0.24, 0, 5.2, 8).push().translate(4.6, 0, 0).cyl(0.28, 0.24, 0, 5.2, 8).pop();
    b.col('#222').box(2.3, 5.45, 0, 7, 0.45, 0.6);
    b.col('#f4f8fd', true).box(2.3, 5.75, 0, 7.2, 0.15, 0.7);
    b.col(red).box(2.3, 4.3, 0, 5.8, 0.35, 0.4);
    return b.build();
  };

  P.stoneLantern = () => {
    const b = new MB();
    b.col('#8a8a85').box(0, 0.3, 0, 0.9, 0.6, 0.9).cyl(0.18, 0.18, 0.6, 1.6, 6);
    b.box(0, 1.9, 0, 0.8, 0.6, 0.8);
    b.box(0, 1.9, 0, 0.5, 0.4, 0.82, [1, 0.8, 0.45, 3]);
    b.col('#8a8a85', true).cyl(0.75, 0.05, 2.2, 2.8, 6);
    return b.build();
  };

  P.prayerFlags = (len) => {
    const b = new MB();
    const cols = ['#2e6fd8', '#f4f1de', '#d62828', '#2a9d4f', '#ffd23f'];
    b.col('#6b5a4a').cyl(0.06, 0.05, 0, 4, 4).push().translate(0, 0, len).cyl(0.06, 0.05, 0, 4, 4).pop();
    const n = Math.floor(len / 0.8);
    for (let k = 0; k < n; k++) {
      const z = 0.4 + k * 0.8;
      const sag = Math.sin((z / len) * Math.PI) * 0.7;
      b.col(cols[k % 5]).push().translate(0, 3.8 - sag, z).rotY(Math.PI / 2).panel(-0.25, -0.6, 0.25, 0, 0).pop();
    }
    return b.build();
  };

  P.windsock = () => {
    const b = new MB();
    b.col('#d8dde4').cyl(0.07, 0.06, 0, 4.5, 5);
    b.col('#ff6b2c').push().translate(0, 4.4, 0.2).rotX(Math.PI / 2 - 0.3).cyl(0.35, 0.15, 0, 1.8, 7).pop();
    return b.build();
  };

  P.zipTower = (h) => {
    const b = new MB();
    for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) b.col('#7a5a3c').box(x, h / 2, z, 0.3, h, 0.3);
    b.col('#8a6a4c').box(0, h, 0, 3.4, 0.3, 3.4);
    b.col('#6b4e34').box(0, h + 1.6, -1.4, 3.2, 0.2, 0.2);
    for (const x of [-1.5, 1.5]) b.col('#6b4e34').box(x, h + 0.8, -1.4, 0.2, 1.6, 0.2);
    b.col('#f4f8fd', true).box(0, h + 0.18, 0, 3.4, 0.08, 3.4);
    return b.build();
  };

  P.snowCannon = () => {
    const b = new MB();
    b.col('#5a646f').box(0, 0.5, 0, 0.2, 1, 0.2);
    b.col('#e9edf2').push().translate(0, 1.2, 0).rotX(-0.6).cyl(0.45, 0.4, 0, 1.4, 8, null, true, true).pop();
    b.col('#ffb703').push().translate(0, 1.2, 0).rotX(-0.6).cyl(0.47, 0.47, 0.3, 0.5, 8).pop();
    return b.build();
  };

  P.signPost = (color) => {
    const b = new MB();
    b.col('#6c7480').cyl(0.06, 0.06, 0, 2.6, 4);
    b.col(color).box(0, 2.4, 0.06, 0.9, 0.9, 0.06);
    b.col('#ffffff').box(0, 2.4, 0.1, 0.45, 0.45, 0.02);
    return b.build();
  };

  P.pisteMarker = (color) => {
    const b = new MB();
    b.col(color).cyl(0.05, 0.05, 0, 1.6, 4);
    b.col('#f4f4f4').cyl(0.052, 0.052, 1.6, 1.85, 4);
    b.col(color).cyl(0.052, 0.04, 1.85, 2.1, 4);
    return b.build();
  };

  P.fence = (len) => {
    const b = new MB();
    const n = Math.max(1, Math.round(len / 2.5));
    for (let k = 0; k <= n; k++) b.col('#6c7480').box(0, 0.6, (k / n) * len, 0.06, 1.2, 0.06);
    b.col('#ff7a1a').box(0, 0.75, len / 2, 0.03, 0.7, len);
    return b.build();
  };

  P.kicker = (len, height, width, snowHex, depth) => {
    const D = -(depth || 0.3);
    // shape must match World kicker profile: y = h * (u/len)^1.6
    const b = new MB();
    const snow = snowHex || '#eef3fb';
    const segs = 10;
    const prof = (u) => height * Math.pow(u / len, 1.6);
    for (let k = 0; k < segs; k++) {
      const u0 = (k / segs) * len, u1 = ((k + 1) / segs) * len;
      const y0 = prof(u0), y1 = prof(u1);
      b.col(snow).quad([-width / 2, y0, u0], [-width / 2, y1, u1], [width / 2, y1, u1], [width / 2, y0, u0]);
      const side = depth > 1 ? '#b9875a' : '#dfe8f3';
      b.col(side).quad([width / 2, D * (u0 / len), u0], [width / 2, y0, u0], [width / 2, y1, u1], [width / 2, D * (u1 / len), u1]);
      b.col(side).quad([-width / 2, D * (u1 / len), u1], [-width / 2, y1, u1], [-width / 2, y0, u0], [-width / 2, D * (u0 / len), u0]);
    }
    b.col(depth > 1 ? '#9c6b42' : '#cfdbe9').quad([width / 2, D, len], [width / 2, height, len], [-width / 2, height, len], [-width / 2, D, len]);
    if (depth > 1) {
      // scaffolding legs under a lifted big-air ramp
      for (const sx of [-width / 2 + 0.3, width / 2 - 0.3]) for (const u of [len * 0.5, len - 0.3]) b.col('#5a646f').box(sx, D * (u / len) / 2, u, 0.25, Math.abs(D * (u / len)), 0.25);
    }
    b.col('#2f6feb').box(0, height + 0.02, len - 0.12, width, 0.05, 0.24);
    // shaping lines across the ramp make the slope readable from above
    for (const f of [0.35, 0.6, 0.82]) {
      const u = f * len, y = prof(u) + 0.015;
      b.col('#c4d3e6').box(0, y, u, width * 0.92, 0.02, 0.12);
    }
    // coloured side boards
    b.col('#ff6b2c').box(width / 2 + 0.03, height * 0.55, len * 0.78, 0.06, 0.18, len * 0.4);
    b.col('#ff6b2c').box(-width / 2 - 0.03, height * 0.55, len * 0.78, 0.06, 0.18, len * 0.4);
    return b.build();
  };

  P.rail = (len, h, kind) => {
    const b = new MB();
    if (kind === 'box') {
      b.col('#3d6fd8').box(0, h / 2, len / 2, 0.8, h, len);
      b.col('#e9eef5').box(0, h + 0.02, len / 2, 0.84, 0.05, len);
    } else {
      b.col('#c9d2dc').push().translate(0, h, 0).rotX(Math.PI / 2).cyl(0.07, 0.07, 0, len, 6).pop();
      b.col('#5a646f').box(0, h / 2, 0.4, 0.1, h, 0.1).box(0, h / 2, len - 0.4, 0.1, h, 0.1);
      b.box(0, 0.05, 0.4, 0.6, 0.1, 0.6).box(0, 0.05, len - 0.4, 0.6, 0.1, 0.6);
    }
    return b.build();
  };

  P.gate = (color, width) => {
    const b = new MB();
    for (const x of [-width / 2, width / 2]) {
      b.push().translate(x, 0, 0);
      b.col(color).cyl(0.045, 0.045, 0, 1.95, 5);
      b.pop();
    }
    b.col(color).panel(-width / 2, 1.0, -width / 2 + 0.7, 1.75, 0);
    b.col(color).panel(width / 2 - 0.7, 1.0, width / 2, 1.75, 0);
    b.col('#ffffff').panel(-width / 2 + 0.05, 1.3, -width / 2 + 0.65, 1.45, 0.01);
    b.col('#ffffff').panel(width / 2 - 0.65, 1.3, width / 2 - 0.05, 1.45, 0.01);
    return b.build();
  };

  P.bigGate = (color, width) => {
    const b = new MB();
    for (const x of [-width / 2, width / 2]) b.col('#e9eef5').push().translate(x, 0, 0).cyl(0.12, 0.12, 0, 3.6, 6).pop();
    b.col(color).box(0, 3.4, 0, width, 0.7, 0.12);
    return b.build();
  };

  P.arch = (width, color) => {
    const b = new MB();
    b.col(color).box(-width / 2, 2.3, 0, 0.8, 4.6, 0.8).box(width / 2, 2.3, 0, 0.8, 4.6, 0.8);
    b.col(color).box(0, 4.9, 0, width + 0.8, 1.2, 0.6);
    b.col('#ffffff').box(0, 4.9, 0.31, width * 0.6, 0.45, 0.02);
    b.col('#1b2a41').box(0, 4.9, 0.32, width * 0.6, 0.12, 0.02);
    return b.build();
  };

  P.coin = () => {
    const b = new MB();
    const c = [1, 0.8, 0.2, 2];
    // star-ish octahedron
    const t = [0, 0.75, 0], d = [0, -0.75, 0];
    const ring = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * GS.TAU, rr = k % 2 ? 0.32 : 0.6;
      ring.push([Math.cos(a) * rr, 0, Math.sin(a) * rr * 0.4]);
    }
    for (let k = 0; k < 6; k++) {
      const n = (k + 1) % 6;
      b.tri(ring[k], t, ring[n], c);
      b.tri(ring[n], d, ring[k], c);
    }
    return b.build();
  };

  P.edelweiss = () => {
    const b = new MB();
    const white = [0.98, 0.98, 1, 2];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * GS.TAU;
      b.push().rotY(a);
      b.tri([0, 0, 0.1], [0.18, 0.02, 0.5], [0, 0.05, 0.75], white);
      b.tri([0, 0, 0.1], [0, 0.05, 0.75], [-0.18, 0.02, 0.5], white);
      b.pop();
    }
    b.col([1, 0.82, 0.25, 2]).sphere(0, 0.06, 0, 0.16, 6, 4, null);
    return b.build();
  };

  P.ring = (R, r, seg) => {
    const b = new MB();
    b.color = [1, 1, 1, 2];
    b.torus(R, r, seg || 24, 6, null);
    return b.build();
  };

  P.marker = () => {
    const b = new MB();
    b.color = [1, 1, 1, 2];
    b.torus(4, 0.18, 32, 4, null);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * GS.TAU;
      b.push().translate(Math.cos(a) * 4, 0, Math.sin(a) * 4).box(0, 0.4, 0, 0.12, 0.8, 0.12).pop();
    }
    return b.build();
  };

  P.flagPole = (color) => {
    const b = new MB();
    b.col('#e9eef5').cyl(0.07, 0.06, 0, 4.2, 5);
    b.col(color).panel(0, 3.1, 1.6, 4.1, 0);
    return b.build();
  };

  P.skiJump = (inrun) => {
    // inrun: array of [u, y] points (local), width 3
    const b = new MB();
    const w = 3.2;
    for (let k = 0; k < inrun.length - 1; k++) {
      const [u0, y0] = inrun[k], [u1, y1] = inrun[k + 1];
      b.col('#eef3fb').quad([-w / 2, y0, u0], [w / 2, y0, u0], [w / 2, y1, u1], [-w / 2, y1, u1]);
      b.col('#a0612f').quad([w / 2 + 0.1, y0 - 1, u0], [w / 2 + 0.1, y1 - 1, u1], [w / 2 + 0.1, y1, u1], [w / 2 + 0.1, y0, u0]);
      b.col('#a0612f').quad([-w / 2 - 0.1, y1 - 1, u1], [-w / 2 - 0.1, y0 - 1, u0], [-w / 2 - 0.1, y0, u0], [-w / 2 - 0.1, y1, u1]);
      b.col('#4a5560').quad([w / 2, y0 - 1, u0], [-w / 2, y0 - 1, u0], [-w / 2, y1 - 1, u1], [w / 2, y1 - 1, u1]);
      if (k % 3 === 0) {
        for (const x of [-w / 2, w / 2]) b.col('#5a646f').box(x, (y0 - 1) / 2 - 20, u0, 0.4, Math.max(0.1, y0 - 1 + 40), 0.4);
      }
    }
    return b.build();
  };

  // ---------- Character parts (unit sized, stretched at runtime) --------------
  P.unitBox = () => new MB().col('#ffffff').box(0, 0.5, 0, 1, 1, 1).build();
  P.unitCyl = () => new MB().col('#ffffff').cyl(0.5, 0.5, 0, 1, 7, null, true, true).build();
  P.unitSphere = () => new MB().col('#ffffff').sphere(0, 0, 0, 1, 9, 6, null).build();
  P.ski = () => {
    const b = new MB().col('#ffffff');
    b.box(0, 0, 0, 1, 1, 1);
    b.push().translate(0, 0.35, 0.53).rotX(-0.55).box(0, 0, 0.04, 1, 1, 0.12).pop();
    b.push().translate(0, 0.2, -0.5).rotX(0.3).box(0, 0, -0.03, 1, 1, 0.06).pop();
    return b.build();
  };
  P.board = () => {
    const b = new MB().col('#ffffff');
    b.box(0, 0, 0, 1, 1, 0.84);
    b.push().translate(0, 0.25, 0.44).rotX(-0.35).box(0, 0, 0, 0.92, 1, 0.1).pop();
    b.push().translate(0, 0.25, -0.44).rotX(0.35).box(0, 0, 0, 0.92, 1, 0.1).pop();
    return b.build();
  };
  P.wing = () => {
    const b = new MB();
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a0 = -1.1 + (k / n) * 2.2, a1 = -1.1 + ((k + 1) / n) * 2.2;
      const c = k % 2 ? '#ff6b2c' : '#ffd23f';
      const p = (a, z, o) => [Math.sin(a) * (5 - o), Math.cos(a) * (3.2 - o), z];
      b.col(c).quad(p(a0, 1.2, 0), p(a1, 1.2, 0), p(a1, -1.2, 0), p(a0, -1.2, 0));
      b.col('#3b3f46').quad(p(a1, 1.2, 0.08), p(a0, 1.2, 0.08), p(a0, -1.2, 0.08), p(a1, -1.2, 0.08));
      b.col('#2b2f36').quad(p(a0, 1.2, 0), p(a0, 1.2, 0.08), p(a1, 1.2, 0.08), p(a1, 1.2, 0));
    }
    return b.build();
  };

  GS.Props = P;
})(window.GS);
