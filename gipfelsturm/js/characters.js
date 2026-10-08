'use strict';
// Procedural rider: smooth-shaded body parts (puffy two-tone jacket with
// collar, hem and zipper, pants, boots, mittens, helmet with vents or beanie,
// goggles with strap) plus real-scale skis with bindings, poles or a
// snowboard with bindings. Every frame the rider is posed from joint
// positions and written into the renderer's dynamic batch.
(function (GS) {
  const M = GS.M;
  const P = GS.Props;
  let parts = null;
  let hi = null, lo = null;

  const C = (hex) => { const c = GS.hexToRgb(hex); return [c[0], c[1], c[2], 0]; };

  function buildParts(d) {
    const MB = GS.MeshBuilder;
    const W = [1, 1, 1, 0];
    const p = {};
    const q = (n) => Math.max(4, Math.round(n * d));
    // unit limb: tapered capsule from y=0 to y=1, radius 0.5, ends overlap joints
    p.limb = new MB().lathe([[0, -0.1], [0.3, -0.07], [0.46, 0.0], [0.5, 0.12], [0.48, 0.88], [0.44, 1.0], [0.3, 1.07], [0, 1.1]], q(10), W).build();
    // puffy jacket body
    p.torso = new MB().lathe([[0, -0.03], [0.42, -0.02], [0.5, 0.1], [0.53, 0.42], [0.52, 0.7], [0.47, 0.88], [0.34, 0.98], [0, 1.02]], q(14), W).build();
    p.hem = new MB().lathe([[0.49, -0.05], [0.535, -0.02], [0.54, 0.09], [0.5, 0.12]], q(14), W).build();
    p.collar = new MB().lathe([[0.32, 0.9], [0.36, 0.95], [0.33, 1.08], [0.25, 1.11]], q(14), W).build();
    p.zip = new MB().col(W).box(0, 0.5, 0.515, 0.04, 0.82, 0.04).build();
    p.sph = new MB().ellipsoid(0, 0, 0, 1, 1, 1, q(10), q(7), W).build();
    // helmet: dome around the head centre, open at the bottom
    const helm = new MB();
    helm.rotX(-0.18).lathe([[0.138, -0.06], [0.15, -0.02], [0.156, 0.03], [0.146, 0.09], [0.115, 0.14], [0.065, 0.168], [0, 0.176]], q(16), W);
    p.helmet = helm.build();
    const vents = new MB().rotX(-0.18);
    for (const x of [-0.045, 0, 0.045]) vents.col(C('#20242b')).box(x, 0.165, 0.02, 0.018, 0.012, 0.09);
    vents.col(C('#20242b')).box(0, 0.06, -0.15, 0.08, 0.02, 0.02);
    p.vents = vents.build();
    p.beanie = new MB().lathe([[0.128, -0.02], [0.14, 0.02], [0.138, 0.08], [0.11, 0.135], [0.06, 0.16], [0, 0.165]], 14, W)
      .lathe([[0.132, -0.035], [0.145, -0.03], [0.146, 0.02], [0.135, 0.03]], 14, W).build();
    p.pompom = new MB().ellipsoid(0, 0, 0, 0.045, 0.045, 0.045, 8, 6, C('#ffffff')).build();
    const cap = new MB().lathe([[0.13, -0.01], [0.138, 0.03], [0.125, 0.09], [0.08, 0.13], [0, 0.14]], 14, W);
    cap.col(W).box(0, 0.0, 0.17, 0.17, 0.012, 0.11);
    p.cap = cap.build();
    // goggles: lens arc (tinted) + frame and strap (dark)
    const A0 = Math.PI / 2 - 1.05, A1 = Math.PI / 2 + 1.05;
    p.lens = new MB().lathe([[0.146, -0.033], [0.153, 0], [0.146, 0.033]], 12, W, 1, 1, A0, A1).build();
    const fr = new MB();
    fr.lathe([[0.139, -0.042], [0.148, -0.04], [0.151, 0.0], [0.148, 0.04], [0.139, 0.042]], 12, C('#1b1f24'), 1, 1, A0 - 0.08, A1 + 0.08);
    fr.lathe([[0.142, -0.016], [0.145, 0], [0.142, 0.016]], 16, C('#1b1f24'), 1, 1, A1, A0 + GS.TAU);
    p.frame = fr.build();
    // boot (sole + shell + buckles)
    const boot = new MB();
    boot.col(C('#1d2128')).box(0, 0.02, 0.02, 0.11, 0.04, 0.33);
    boot.ellipsoid(0, 0.11, 0.01, 0.068, 0.1, 0.15, q(10), q(6), W);
    boot.lathe([[0.062, 0.1], [0.07, 0.16], [0.068, 0.27], [0.06, 0.29]], 10, W, 1, 1.15);
    boot.col(C('#c9d2dc')).box(0.07, 0.2, 0.03, 0.01, 0.018, 0.08).box(-0.07, 0.2, 0.03, 0.01, 0.018, 0.08);
    p.boot = boot.build();
    p.mitten = new MB().ellipsoid(0, 0, 0, 0.05, 0.058, 0.066, q(8), q(6), W).ellipsoid(0.035, 0.012, 0.02, 0.022, 0.03, 0.03, q(6), q(4), W).build();

    // ---- skis (real scale, along +z, top at y≈0.025)
    const ski = new MB();
    const deco = new MB();
    const N = Math.max(8, Math.round(22 * d));
    const prof = (z) => {
      const w = 0.08 + 0.016 * Math.pow(z / 0.85, 2);
      let y = 0;
      if (z > 0.6) y = Math.pow((z - 0.6) / 0.27, 2) * 0.1;
      if (z < -0.66) y = Math.pow((-0.66 - z) / 0.16, 2) * 0.035;
      return [w, y];
    };
    const dark = C('#2b2f36');
    for (let k = 0; k < N; k++) {
      const z0 = -0.82 + (k / N) * 1.69, z1 = -0.82 + ((k + 1) / N) * 1.69;
      let [w0, y0] = prof(z0), [w1, y1] = prof(z1);
      if (k === 0) w0 *= 0.6;
      if (k === N - 1) w1 *= 0.55;
      const t = 0.022;
      ski.quad([-w0 / 2, y0 + t, z0], [-w1 / 2, y1 + t, z1], [w1 / 2, y1 + t, z1], [w0 / 2, y0 + t, z0], W);
      ski.quad([w0 / 2, y0, z0], [w1 / 2, y1, z1], [-w1 / 2, y1, z1], [-w0 / 2, y0, z0], dark);
      ski.quad([w0 / 2, y0, z0], [w0 / 2, y0 + t, z0], [w1 / 2, y1 + t, z1], [w1 / 2, y1, z1], dark);
      ski.quad([-w1 / 2, y1, z1], [-w1 / 2, y1 + t, z1], [-w0 / 2, y0 + t, z0], [-w0 / 2, y0, z0], dark);
      if (k > 1 && k < N - 3) deco.quad([-0.012, y0 + t + 0.001, z0], [-0.012, y1 + t + 0.001, z1], [0.012, y1 + t + 0.001, z1], [0.012, y0 + t + 0.001, z0], C('#f4f6f9'));
    }
    p.ski = ski.build();
    deco.col(C('#3b4048')).box(0, 0.032, 0.0, 0.06, 0.016, 0.44);
    deco.col(C('#c9d2dc')).box(0, 0.058, 0.17, 0.072, 0.035, 0.07);
    deco.col(C('#e63946')).box(0, 0.062, -0.15, 0.072, 0.05, 0.09);
    p.skiDeco = deco.build();

    // ---- snowboard (real scale, along +z)
    const brd = new MB();
    const half = 0.775, rad = 0.135, segE = 8;
    const outline = [];
    for (let k = 0; k <= segE; k++) { const a = (k / segE) * Math.PI; outline.push([Math.cos(a) * rad, half - rad + Math.sin(a) * rad]); }
    for (let k = 0; k <= segE; k++) { const a = Math.PI + (k / segE) * Math.PI; outline.push([Math.cos(a) * rad, -half + rad + Math.sin(a) * rad]); }
    const lift = (z) => (Math.abs(z) > half - 0.2 ? Math.pow((Math.abs(z) - (half - 0.2)) / 0.2, 2) * 0.07 : 0);
    const th = 0.02;
    for (let k = 0; k < outline.length; k++) {
      const a = outline[k], b = outline[(k + 1) % outline.length];
      const A = [a[0], lift(a[1]), a[1]], B = [b[0], lift(b[1]), b[1]];
      brd.tri([0, th, 0], [B[0], B[1] + th, B[2]], [A[0], A[1] + th, A[2]], W);
      brd.tri([0, 0, 0], A, B, dark);
      brd.quad(A, [A[0], A[1] + th, A[2]], [B[0], B[1] + th, B[2]], B, dark);
    }
    p.board = brd.build();
    const bb = new MB();
    for (const z of [-0.24, 0.24]) {
      bb.push().translate(0, th, z).rotY(z > 0 ? 0.25 : -0.2);
      bb.col(C('#2b2f36')).box(0, 0.012, 0, 0.24, 0.024, 0.12);
      bb.col(C('#1b1f24')).box(-0.07, 0.11, 0, 0.03, 0.2, 0.12);
      bb.col(C('#ff6b2c')).box(0.03, 0.06, 0, 0.12, 0.03, 0.13);
      bb.pop();
    }
    p.boardDeco = bb.build();
    p.wing = P.wing();
    p.pack = new MB().ellipsoid(0, 0, 0, 1, 1, 1, q(10), q(7), W).build();
    return p;
  }

  function init() {
    if (!hi) { hi = buildParts(1); lo = buildParts(0.42); parts = hi; }
  }

  const tmpM = new Float32Array(16);
  const segM = new Float32Array(16);
  const outM = new Float32Array(16);

  const rgbCache = new Map();
  function rgb(hex) {
    let c = rgbCache.get(hex);
    if (!c) rgbCache.set(hex, (c = GS.hexToRgb(hex)));
    return c;
  }
  function accent(hex) {
    const k = hex + '#acc';
    let c = rgbCache.get(k);
    if (!c) {
      const b = GS.hexToRgb(hex);
      const lum = b[0] * 0.3 + b[1] * 0.55 + b[2] * 0.15;
      c = lum > 0.62 ? GS.mixRgb(b, [0.1, 0.13, 0.2], 0.55) : GS.mixRgb(b, [1, 1, 1], 0.55);
      rgbCache.set(k, c);
    }
    return c;
  }

  // Stretch a unit mesh between two body-space points.
  function seg(R, frame, a, b, tx, tz, col, mesh, ref) {
    const r = ref || [0, 0, 1];
    M.segment(segM, a[0], a[1], a[2], b[0], b[1], b[2], tx, tz, r[0], r[1], r[2]);
    M.mul(outM, frame, segM);
    R.push(mesh || parts.limb, outM, col[0], col[1], col[2]);
  }

  function put(R, frame, mesh, p, col, sx, sy, sz, yaw, pitch, roll) {
    M.copy(tmpM, frame);
    M.translate(tmpM, p[0], p[1], p[2]);
    if (yaw) M.rotY(tmpM, yaw);
    if (pitch) M.rotX(tmpM, pitch);
    if (roll) M.rotZ(tmpM, roll);
    if (sx != null) M.scale(tmpM, sx, sy, sz);
    if (col) R.push(mesh, tmpM, col[0], col[1], col[2]);
    else R.push(mesh, tmpM);
  }

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // pose: { x,y,z, yaw, flip, roll, lean, crouch, grab, grabType, arms, tuck, press,
  //         crash, crashT, sit, hang, board, poleT, wave, speed, wing, wingRoll }
  // gear: { jacket, jacket2, pants, helmet, goggles, skis, board, gloves, hat, extra, extraColor, skin }
  function draw(R, pose, g) {
    init();
    parts = pose.lod ? lo : hi;
    const LOD = !!pose.lod;
    const cJ = rgb(g.jacket), cJ2 = g.jacket2 ? rgb(g.jacket2) : accent(g.jacket), cP = rgb(g.pants), cH = rgb(g.helmet);
    const cG = rgb(g.goggles || '#1b1f24'), cS = rgb(g.skis), cB = rgb(g.board || g.skis), cGl = rgb(g.gloves || '#1b1f24');
    const cSk = rgb(g.skin || '#f1c7a5'), cBoot = rgb(g.boots || '#2b2f36'), cPole = rgb('#aab4c0'), cDark = rgb('#1b1f24');
    const root = new Float32Array(16);
    M.identity(root);
    M.translate(root, pose.x, pose.y, pose.z);
    M.rotY(root, pose.yaw || 0);
    if (pose.lean) M.rotZ(root, pose.lean);
    if (pose.press) {
      const pz = pose.press > 0 ? 0.78 : -0.78;
      M.translate(root, 0, 0, pz);
      M.rotX(root, pose.press > 0 ? 0.24 : -0.24);
      M.translate(root, 0, 0, -pz);
    }
    if (pose.flip || pose.roll) {
      M.translate(root, 0, 0.9, 0);
      if (pose.flip) M.rotX(root, pose.flip);
      if (pose.roll) M.rotZ(root, pose.roll);
      M.translate(root, 0, -0.9, 0);
    }
    if (pose.crash) {
      const t = pose.crashT || 0;
      M.translate(root, 0, 0.35, 0);
      M.rotX(root, Math.min(1.45, t * 4));
      M.rotZ(root, Math.sin(t * 9) * 0.4 * Math.max(0, 1 - t));
      M.translate(root, 0, -0.35, 0);
    }
    const board = !!pose.board;
    const body = new Float32Array(root);
    if (board) M.rotY(body, -Math.PI / 2);

    const c = GS.clamp(pose.crouch || 0, 0, 1);
    const sit = pose.sit;
    const grab = pose.grab || 0;
    const feetUp = grab * 0.3;
    const stance = board ? 0.24 : 0.11;

    // ---- legs
    const hipY = sit ? 0.56 : 0.95 - 0.32 * c - grab * 0.1;
    const hipZ = sit ? -0.12 : -0.05 - 0.1 * c;
    const feet = [];
    for (const s of [-1, 1]) {
      const ankle = sit ? [s * 0.12, 0.1, 0.44] : [s * stance, 0.12 + feetUp, 0];
      const knee = sit ? [s * 0.13, 0.57, 0.36]
        : board ? [s * (stance - 0.02), 0.5 - 0.15 * c + feetUp * 0.8, 0.13 + 0.13 * c + grab * 0.1]
          : [s * (stance + 0.012), 0.52 - 0.15 * c + feetUp * 0.8, 0.15 + 0.13 * c + grab * 0.12];
      const hip = [s * 0.1, hipY, hipZ];
      seg(R, body, add(ankle, [0, 0.12, 0]), knee, 0.15, 0.16, cP);
      seg(R, body, knee, hip, 0.18, 0.19, cP);
      if (!LOD) put(R, body, parts.sph, knee, cP, 0.085, 0.085, 0.09);
      put(R, body, parts.boot, [ankle[0], ankle[1] - 0.1, ankle[2] - 0.02], cBoot, 1, 1, 1, board ? s * 0.15 : 0, sit ? 0.3 : 0);
      feet.push(ankle);
    }
    put(R, body, parts.sph, [0, hipY + 0.02, hipZ], cP, 0.18, 0.12, 0.13);

    // ---- skis or board (root frame: they follow the heading)
    if (board) {
      put(R, root, parts.board, [0, feet[0][1] - 0.13, 0], cB);
      if (!LOD) put(R, root, parts.boardDeco, [0, feet[0][1] - 0.13, 0]);
    } else {
      for (let k = 0; k < 2; k++) {
        const f = feet[k];
        const pitch = sit ? 0.45 : grab ? (pose.grabType === 2 ? -0.35 : pose.grabType === 3 ? 0.35 : 0) : 0;
        const yaw = grab ? (k ? 0.06 : -0.06) * grab : 0;
        put(R, root, parts.ski, [f[0], f[1] - 0.12, f[2] + (sit ? 0.1 : 0.02)], cS, 1, 1, 1, yaw, pitch);
        if (!LOD) put(R, root, parts.skiDeco, [f[0], f[1] - 0.12, f[2] + (sit ? 0.1 : 0.02)], null, 1, 1, 1, yaw, pitch);
      }
    }

    // ---- torso
    const leanF = sit ? 0.05 : 0.3 + 0.38 * c + (pose.tuck ? 0.42 : 0);
    const tl = 0.56;
    const pel = [0, hipY - 0.03, hipZ];
    const chest = [0, hipY + Math.cos(leanF) * tl, hipZ + Math.sin(leanF) * tl];
    seg(R, body, pel, chest, 0.42, 0.29, cJ, parts.torso);
    seg(R, body, pel, chest, 0.42, 0.29, cJ2, parts.hem);
    if (!LOD) {
      seg(R, body, pel, chest, 0.42, 0.29, cJ2, parts.collar);
      seg(R, body, pel, chest, 0.42, 0.29, cJ2, parts.zip);
    }
    if (g.extra === 'backpack') {
      const ec = rgb(g.extraColor || '#ff6b2c');
      const bp = lerp3(pel, chest, 0.55);
      put(R, body, parts.pack, [0, bp[1], bp[2] - 0.2 * Math.cos(leanF) - 0.02], ec, 0.16, 0.21, 0.09, 0, leanF);
      put(R, body, parts.sph, [0, bp[1] + 0.12, bp[2] - 0.22 * Math.cos(leanF) - 0.06], rgb('#2b2f36'), 0.13, 0.03, 0.05);
    }
    if (g.extra === 'cape') {
      const top = add(chest, [0, -0.03, -0.14]);
      const flap = Math.sin((pose.wave || 0) * 9) * 0.08;
      const end = [0, hipY - 0.3, hipZ - 0.45 - Math.min(pose.speed || 0, 30) * 0.02 + flap];
      seg(R, body, top, end, 0.46, 0.02, rgb(g.extraColor || '#e63946'), parts.zip);
    }

    // ---- head
    const neck = add(chest, [0, 0.02, 0.03]);
    const headC = add(chest, [0, 0.17, 0.07]);
    const headPitch = -leanF * 0.55;
    if (!LOD) put(R, body, parts.sph, neck, cJ2, 0.085, 0.06, 0.085);
    put(R, body, parts.sph, headC, cSk, 0.105, 0.122, 0.11, 0, headPitch);
    if (g.hat === 'beanie') {
      put(R, body, parts.beanie, headC, cH, 1, 1, 1, 0, headPitch);
      M.copy(tmpM, body);
      M.translate(tmpM, headC[0], headC[1], headC[2]);
      M.rotX(tmpM, headPitch);
      M.translate(tmpM, 0, 0.19, -0.01);
      R.push(parts.pompom, tmpM);
    } else if (g.hat === 'cap') {
      put(R, body, parts.cap, headC, cH, 1, 1, 1, 0, headPitch);
    } else {
      put(R, body, parts.helmet, headC, cH, 1, 1, 1, 0, headPitch);
      if (!LOD) put(R, body, parts.vents, headC, null, 1, 1, 1, 0, headPitch);
    }
    put(R, body, parts.frame, add(headC, [0, 0.012, 0]), null, 1, 1, 1, 0, headPitch);
    put(R, body, parts.lens, add(headC, [0, 0.012, 0]), cG, 1, 1, 1, 0, headPitch);
    if (g.extra === 'scarf') {
      const sc = rgb(g.extraColor || '#e63946');
      put(R, body, parts.sph, add(chest, [0, 0.04, 0.02]), sc, 0.15, 0.06, 0.13);
      seg(R, body, add(chest, [0.06, 0.03, -0.08]), add(chest, [0.13, -0.08, -0.4 - Math.min(pose.speed || 0, 30) * 0.01]), 0.08, 0.02, sc, parts.zip);
    }

    // ---- arms
    const arms = pose.arms || (board ? 'wide' : 'poles');
    for (const s of [-1, 1]) {
      const sh = add(chest, [s * 0.2, -0.06, -0.03]);
      let el, hand;
      const grabHand = grab && ((pose.grabType === 0 && s === 1) || (pose.grabType === 1 && s === -1) || pose.grabType >= 2);
      if (sit) {
        el = add(sh, [s * 0.06, -0.26, 0.12]);
        hand = add(el, [s * -0.02, 0.02, 0.26]);
      } else if (pose.hang) {
        el = add(sh, [s * 0.05, 0.28, 0.02]);
        hand = add(el, [s * -0.05, 0.28, 0]);
      } else if (grabHand) {
        const tz = pose.grabType === 2 ? 0.5 : pose.grabType === 3 ? -0.45 : 0.06;
        hand = [s * (board ? 0.05 : stance), feet[0][1] - 0.02, tz];
        el = [(sh[0] + hand[0]) / 2 + s * 0.13, (sh[1] + hand[1]) / 2 + 0.06, (sh[2] + hand[2]) / 2 + 0.1];
      } else if (arms === 'wide') {
        el = add(sh, [s * 0.24, -0.13, 0.03]);
        hand = add(el, [s * 0.22, -0.07, 0.06]);
      } else if (arms === 'back') {
        el = add(sh, [s * 0.08, -0.2, -0.15]);
        hand = add(el, [s * 0.05, -0.1, -0.26]);
      } else if (arms === 'up') {
        el = add(sh, [s * 0.1, 0.25, 0.05]);
        hand = add(el, [s * 0.04, 0.27, 0.02]);
      } else {
        const swing = Math.sin((pose.poleT || 0) + (s > 0 ? 0 : Math.PI)) * 0.06;
        el = add(sh, [s * 0.13, -0.24, 0.1 + swing]);
        hand = add(el, [s * 0.03, -0.05, 0.25 + swing]);
      }
      if (!LOD) put(R, body, parts.sph, sh, cJ, 0.085, 0.085, 0.085);
      seg(R, body, sh, el, 0.12, 0.12, cJ);
      seg(R, body, el, hand, 0.105, 0.105, cJ);
      if (!LOD) seg(R, body, lerp3(el, hand, 0.82), lerp3(el, hand, 1.02), 0.115, 0.115, cJ2);
      const fwd = [hand[0] - el[0], hand[1] - el[1], hand[2] - el[2]];
      const hp = add(hand, [fwd[0] * 0.25, fwd[1] * 0.25, fwd[2] * 0.25]);
      put(R, body, parts.mitten, hp, cGl, 1, 1, 1, Math.atan2(fwd[0], fwd[2]) + (s > 0 ? 0 : Math.PI));
      if (!board && arms === 'poles' && !sit && !pose.hang && !grabHand) {
        const tip = [hand[0] + s * 0.14, Math.max(0.02, hand[1] - 1.05), hand[2] - 0.42];
        if (!LOD) seg(R, body, add(hp, [0, 0.07, 0.01]), add(hp, [0, -0.08, -0.03]), 0.04, 0.04, cDark);
        seg(R, body, hp, tip, 0.02, 0.02, cPole);
        if (!LOD) put(R, body, parts.sph, lerp3(hp, tip, 0.9), cDark, 0.05, 0.008, 0.05);
      }
    }

    // ---- paraglider
    if (pose.wing) {
      const wm = new Float32Array(16);
      M.copy(wm, root);
      M.translate(wm, 0, 2.6, 0.3);
      M.rotZ(wm, pose.wingRoll || 0);
      R.push(parts.wing, wm, 1, 1, 1);
      for (const s of [-1, 1]) {
        for (const off of [0, 1.6]) seg(R, root, [s * 0.18, 1.4, 0], [s * (2.0 + off), 5.6 - off * 0.45, 0.2], 0.008, 0.008, rgb('#ffffff'), parts.zip);
      }
      put(R, root, parts.pack, [0, 0.45, -0.1], rgb('#2b2f36'), 0.26, 0.14, 0.32);
    }
  }

  GS.Rider = { draw, init };

  const JACKETS = ['#e63946', '#2f6feb', '#ffb703', '#2a9d8f', '#8338ec', '#ff006e', '#fb5607', '#f4f1de', '#1d3557', '#06d6a0', '#ef476f', '#118ab2', '#ffd166', '#3a86ff', '#9b5de5', '#f15bb5'];
  const PANTS = ['#1d3557', '#2b2d42', '#343a40', '#264653', '#5c4033', '#e9ecef', '#1b1f24', '#3d405b', '#6c757d', '#9d0208'];
  GS.randomGear = (r) => ({
    jacket: GS.pick(r, JACKETS), pants: GS.pick(r, PANTS), helmet: GS.pick(r, ['#f4f4f4', '#1b1f24', '#e63946', '#2f6feb', '#ffb703', '#adb5bd', '#06d6a0']),
    goggles: GS.pick(r, ['#1b1f24', '#ff8c42', '#4cc9f0', '#c77dff', '#ffd166']), skis: GS.pick(r, ['#e63946', '#f4f4f4', '#1b1f24', '#ffb703', '#2f6feb', '#06d6a0', '#ff006e']),
    board: GS.pick(r, ['#fb5607', '#1b1f24', '#2a9d8f', '#8338ec', '#f4f4f4']),
    gloves: GS.pick(r, ['#1b1f24', '#2b2d42', '#e63946', '#f4f4f4']), hat: r() < 0.22 ? 'beanie' : 'helmet',
    skin: GS.pick(r, ['#f1c7a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
    extra: r() < 0.15 ? 'backpack' : r() < 0.1 ? 'scarf' : null, extraColor: GS.pick(r, JACKETS),
  });
})(window.GS);
