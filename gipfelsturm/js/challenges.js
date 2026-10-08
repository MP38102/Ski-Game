'use strict';
// Challenge generation (per mountain, deterministic) and the runtime for all
// twenty challenge types: gate races, AI races, trick contests, collecting,
// speed traps, ski jumping, avalanche escapes, tree taps, freeride lines,
// paragliding rings, precision landings and airtime contests.
(function (GS) {
  const G = 9.81;
  const P = GS.Props;
  const M = GS.M;

  const TYPES = {
    slalom: { color: '#e63946', metric: 'time', better: 'low' },
    giant: { color: '#2f6feb', metric: 'time', better: 'low' },
    superg: { color: '#8338ec', metric: 'time', better: 'low' },
    downhill: { color: '#ff7b00', metric: 'time', better: 'low' },
    night: { color: '#4361ee', metric: 'time', better: 'low', cond: { hour: 22.5 } },
    fog: { color: '#8d99ae', metric: 'time', better: 'low', cond: { weather: 'fog' } },
    race: { color: '#06d6a0', metric: 'place', better: 'low' },
    duel: { color: '#ef476f', metric: 'gap', better: 'low' },
    bigair: { color: '#ffb703', metric: 'score', better: 'high' },
    slopestyle: { color: '#fb5607', metric: 'score', better: 'high' },
    freestyle: { color: '#ff006e', metric: 'score', better: 'high' },
    collect: { color: '#ffd166', metric: 'count', better: 'high' },
    speed: { color: '#d00000', metric: 'speed', better: 'high' },
    skijump: { color: '#3a86ff', metric: 'distance', better: 'high' },
    avalanche: { color: '#adb5bd', metric: 'margin', better: 'high' },
    treetap: { color: '#2a9d4f', metric: 'count', better: 'high' },
    freeride: { color: '#9b5de5', metric: 'time', better: 'low' },
    paraglide: { color: '#00bbf9', metric: 'count', better: 'high' },
    precision: { color: '#00f5d4', metric: 'distance', better: 'low' },
    airtime: { color: '#f15bb5', metric: 'airtime', better: 'high' },
  };

  const RIVALS = ['Lena', 'Jonas', 'Mia', 'Elias', 'Sofia', 'Noah', 'Hanna', 'Paul', 'Emma', 'Luca', 'Ida', 'Felix', 'Yuki', 'Ingrid', 'Mateo', 'Aiko', 'Sven', 'Chloé', 'Tenzin', 'Rafael'];

  // ---------- Course helpers ------------------------------------------------------
  function pistePath(world, p, s0, len, step) {
    const pts = [];
    const q = {};
    step = step || 4;
    for (let s = s0; s <= Math.min(p.len, s0 + len) + 0.01; s += step) {
      world.pisteAt(p, s, q);
      pts.push({ x: q.x, z: q.z, tx: q.tx, tz: q.tz });
    }
    return withCum(pts);
  }

  function withCum(pts) {
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      pts[k].tx = (b.x - a.x) / l;
      pts[k].tz = (b.z - a.z) / l;
    }
    return { pts, cum, len: cum[cum.length - 1] };
  }

  function pathAt(path, s, out) {
    out = out || {};
    const cum = path.cum;
    s = GS.clamp(s, 0, path.len);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const a = path.pts[lo], b = path.pts[hi];
    const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.tx = a.tx + (b.tx - a.tx) * t;
    out.tz = a.tz + (b.tz - a.tz) * t;
    const l = Math.hypot(out.tx, out.tz) || 1;
    out.tx /= l; out.tz /= l;
    return out;
  }

  function pathProject(path, x, z, hint) {
    const pts = path.pts;
    let k0 = 0, k1 = pts.length - 1;
    if (hint != null) {
      let lo = 0, hi = path.cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (path.cum[mid] <= hint) lo = mid; else hi = mid;
      }
      k0 = Math.max(0, lo - 10);
      k1 = Math.min(pts.length - 1, lo + 14);
    }
    let best = 0, bd = 1e18;
    for (let k = k0; k < k1; k++) {
      const a = pts[k], b = pts[k + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const t = GS.clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < bd) { bd = d; best = path.cum[k] + Math.sqrt(l2) * t; }
    }
    return { s: best, d: Math.sqrt(bd) };
  }

  // Expected run time for a skilled rider along a polyline (point-mass sim).
  function estimate(world, path, opts) {
    opts = opts || {};
    const T = world.terrain;
    const mu = opts.mu || 0.034, k = opts.k || 0.0052, alat = opts.alat || 17;
    const rCap = opts.radius ? Math.sqrt(alat * opts.radius) : 1e9;
    let v = opts.v0 || 3, t = 0, vmax = 0;
    const ds = 2;
    const q = {};
    let prevH = null;
    const trap = opts.trap;
    let trapV = 0, trapN = 0;
    for (let s = 0; s < path.len; s += ds) {
      pathAt(path, s, q);
      const h = T.heightAt(q.x, q.z);
      if (prevH == null) { prevH = h; continue; }
      const drop = (prevH - h) / ds;
      prevH = h;
      let v2 = v * v + 2 * ds * (G * drop - mu * G - k * v * v);
      v = Math.sqrt(Math.max(1.5, v2));
      if (v > rCap) v = rCap;
      if (opts.vcap && v > opts.vcap) v = opts.vcap;
      vmax = Math.max(vmax, v);
      t += ds / v;
      if (trap && s >= trap[0] && s <= trap[1]) { trapV += v; trapN++; }
    }
    return { t, vmax, trapV: trapN ? trapV / trapN : vmax };
  }

  function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
    const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
    if (Math.abs(d) < 1e-9) return false;
    const u = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
    const v = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }

  const r3 = (x) => Math.round(x * 100) / 100;

  // ---------- Generation -------------------------------------------------------------
  function generate(world) {
    const def = world.def;
    const r = GS.rng(def.seed * 3 + 11);
    const out = [];
    const used = [];
    const pistes = world.pistes.slice();
    let pi = 0;
    // occupied piste intervals: the park and every course already placed
    const occ = [];
    if (world.parkPiste) occ.push({ p: world.parkPiste.id, a: world.parkRange[0] - 30, b: world.parkRange[1] + 20 });
    const free = (p, a, b) => occ.every((o) => o.p !== p.id || b < o.a || a > o.b);
    world._occ = occ;
    const freeStart = (x, z) => used.every((u) => Math.hypot(u.x - x, u.z - z) > 60) &&
      world.lifts.every((l) => Math.hypot(l.B.x - x, l.B.z - z) > 30 && Math.hypot(l.T.x - x, l.T.z - z) > 20);

    // pick a piste segment of given length, preferring pistes with enough drop
    // course must follow the fall line (no long uphill traverses)
    const downhill = (p, s0, len) => {
      const T = world.terrain, g = [0, 0], q = {};
      let min = 1, sum = 0, n = 0;
      for (let s = s0; s <= s0 + len; s += 15) {
        world.pisteAt(p, s, q);
        T.gradAt(q.x, q.z, g);
        const gl = Math.hypot(g[0], g[1]) || 1;
        const d = (-g[0] * q.tx - g[1] * q.tz) / gl;
        min = Math.min(min, d * Math.min(1, gl / 0.08));
        sum += d; n++;
      }
      return min > 0.1 && sum / n > 0.5;
    };
    const freeP = pistes.filter((pp) => !world.lifts[pp.from].cost);
    let early = 0;
    const pickSeg = (len, prefer) => {
      const pool = early < 6 && freeP.length ? freeP : pistes;
      for (let tries = 0; tries < 60; tries++) {
        let p;
        if (prefer === 'steep') p = pool.slice().sort((a, b) => b.steep - a.steep)[(tries + (r() * 3 | 0)) % pool.length];
        else if (prefer === 'park' && world.parkPiste) p = world.parkPiste;
        else p = pool[(pi++ + tries) % pool.length];
        const maxS0 = p.len - len - 25;
        if (maxS0 < 10) continue;
        const s0 = 12 + r() * (maxS0 - 12);
        const q = world.pisteAt(p, s0);
        if (!freeStart(q.x, q.z)) continue;
        if (prefer !== 'park' && tries < 50 && !free(p, s0 - 10, s0 + len + 10)) continue;
        if (len > 150 && tries < 45 && !downhill(p, s0, Math.min(len, p.len - s0 - 5))) continue;
        return { p, s0, q };
      }
      // fallback: longest piste from the top
      const p = pistes.slice().sort((a, b) => b.len - a.len)[0];
      const s0 = 10;
      return { p, s0, q: world.pisteAt(p, s0) };
    };

    def.challenges.forEach((type, idx) => {
      const meta = TYPES[type];
      let ch = null;
      try {
        ch = build(world, type, meta, pickSeg, r, out.length);
      } catch (e) {
        console.warn('challenge failed', type, e);
      }
      if (!ch) return;
      early++;
      if (ch.piste && ch.path && !ch.freeride && ch.type !== 'slopestyle') occ.push({ p: ch.piste.id, a: ch.s0 - 10, b: ch.s0 + ch.path.len + 10 });
      ch.id = def.id + ':' + idx;
      ch.idx = out.length;
      ch.type = type;
      ch.color = meta.color;
      ch.metric = meta.metric;
      ch.better = meta.better;
      ch.cond = meta.cond || null;
      ch.diff = ch.diff || def.diff;
      out.push(ch);
      used.push({ x: ch.start.x, z: ch.start.z });
      // start marker flag
      world.addStatic(P.flagPole(meta.color), ch.start.x + 5.5, world.terrain.rawHeight(ch.start.x + 5.5, ch.start.z), ch.start.z, 0);
    });
    return out;
  }

  function startFromPiste(world, p, s0) {
    const q = world.pisteAt(p, s0);
    return { x: q.x, z: q.z, heading: Math.atan2(q.tx, q.tz) };
  }

  function gatesAlong(world, path, spacing, offset, width, colors, firstAt) {
    const gates = [];
    const q = {};
    let i = 0;
    for (let s = firstAt || 30; s < path.len - 20; s += spacing) {
      pathAt(path, s, q);
      const nx = -q.tz, nz = q.tx;
      const side = i % 2 ? 1 : -1;
      const off = offset * side * (0.75 + ((i * 37) % 10) / 20);
      gates.push({
        x: q.x + nx * off, z: q.z + nz * off, nx, nz, w: width / 2, s,
        color: colors[i % colors.length], yaw: Math.atan2(q.tx, q.tz),
      });
      i++;
    }
    return gates;
  }

  function build(world, type, meta, pickSeg, r, n) {
    const T = world.terrain;
    switch (type) {
      case 'slalom': case 'night': case 'giant': case 'superg': case 'downhill': case 'fog': {
        const cfg = {
          slalom: [380, 15, 3.2, 4.4, 7.2], night: [360, 15, 3.2, 4.4, 7.2], giant: [560, 27, 5.5, 6, 13],
          superg: [760, 42, 7, 7.5, 26], downhill: [900, 70, 4, 12, 0], fog: [700, 55, 4, 12, 0],
        }[type];
        const { p, s0 } = pickSeg(Math.min(cfg[0], 9999), type === 'downhill' || type === 'superg' ? 'steep' : null);
        const len = Math.min(cfg[0], p.len - s0 - 15);
        const path = pistePath(world, p, s0, len);
        const big = type === 'downhill' || type === 'fog';
        const gates = gatesAlong(world, path, cfg[1], cfg[2], cfg[3], big ? ['#ff7b00'] : type === 'superg' ? ['#8338ec', '#e63946'] : ['#e63946', '#2f6feb'], 30);
        if (big) gates.forEach((g) => { g.big = true; g.x = g.x * 0.3 + pathAt(path, g.s).x * 0.7; g.z = g.z * 0.3 + pathAt(path, g.s).z * 0.7; });
        const est = estimate(world, path, { radius: cfg[4] || null, alat: 17 });
        const gold = est.t * 1.0;
        return {
          piste: p, s0, path, gates, start: startFromPiste(world, p, s0), reqLift: p.from,
          medals: [r3(gold * 1.32), r3(gold * 1.14), r3(gold)], penalty: type === 'slalom' || type === 'night' ? 3 : 2,
          len: path.len,
        };
      }
      case 'race': case 'duel': {
        const { p, s0 } = pickSeg(type === 'race' ? 620 : 520);
        const len = Math.min(type === 'race' ? 620 : 520, p.len - s0 - 15);
        const path = pistePath(world, p, s0, len);
        const gates = gatesAlong(world, path, 60, 3, 14, ['#06d6a0'], 50).map((g) => Object.assign(g, { big: true, check: true }));
        const est = estimate(world, path, { radius: 40 });
        const skills = type === 'race' ? [0.84, 0.9, 0.95, 0.99] : [1.0];
        const rnd = GS.rng(n * 31 + 7);
        const rivals = skills.map((sk, i) => ({ name: RIVALS[(n * 3 + i) % RIVALS.length], skill: sk, lane: (i - (skills.length - 1) / 2) * 3.2, seed: (rnd() * 1e6) | 0 }));
        return {
          piste: p, s0, path, gates, start: startFromPiste(world, p, s0), reqLift: p.from, rivals, est: est.t,
          medals: type === 'race' ? [3, 2, 1] : [4, 1.5, 0], len: path.len,
        };
      }
      case 'bigair': {
        // steepest free 130 m stretch of any piste for a proper in-run
        let best = null;
        for (const pp of world.pistes) {
          for (let a = 20; a < pp.len - 170; a += 10) {
            if (world._occ && world._occ.some((o) => o.p === pp.id && !(a + 150 < o.a || a - 10 > o.b))) continue;
            const qa = world.pisteAt(pp, a), qb = world.pisteAt(pp, a + 100);
            const drop = (T.heightAt(qa.x, qa.z) - T.heightAt(qb.x, qb.z)) / 100;
            if (!best || drop > best.drop) best = { p: pp, s0: a, drop };
          }
        }
        const { p, s0 } = best || pickSeg(160, 'steep');
        const kq = world.pisteAt(p, s0 + 105);
        const k = world.addKicker(kq.x, kq.z, kq.tx, kq.tz, 12, 3.2, 8, 'bigair', 0.85);
        const path = pistePath(world, p, s0, 175);
        return { piste: p, s0, path, kicker: k, start: startFromPiste(world, p, s0), reqLift: p.from, attempts: 3, medals: [700, 1500, 2600], len: path.len };
      }
      case 'slopestyle': {
        if (!world.parkPiste) return null;
        const p = world.parkPiste;
        const [a, b] = world.parkRange;
        const s0 = Math.max(5, a - 40);
        const path = pistePath(world, p, s0, Math.min(p.len - s0 - 5, b - s0 + 30));
        return { piste: p, s0, path, start: startFromPiste(world, p, s0), reqLift: p.from, medals: [1500, 3500, 6500], len: path.len, finishOnly: true };
      }
      case 'freestyle': {
        const { p, s0 } = pickSeg(300, world.parkPiste ? 'park' : null);
        return { piste: p, s0, start: startFromPiste(world, p, s0), reqLift: p.from, limit: 60, medals: [2000, 5000, 9500], len: 0 };
      }
      case 'collect': {
        const { p, s0 } = pickSeg(520);
        const len = Math.min(520, p.len - s0 - 10);
        const path = pistePath(world, p, s0, len);
        const coins = [];
        const q = {};
        const count = 20;
        for (let i = 0; i < count; i++) {
          const s = 25 + (i / count) * (path.len - 40);
          pathAt(path, s, q);
          const off = Math.sin(s / 34 + n) * p.width * 0.38 + (i % 7 === 3 ? (i % 2 ? 1 : -1) * (p.width * 0.5 + 6) : 0);
          const x = q.x - q.tz * off, z = q.z + q.tx * off;
          coins.push({ x, z, y: T.heightAt(x, z) + 1.1 + (i % 5 === 2 ? 1.6 : 0) });
        }
        const est = estimate(world, path, { radius: 30 });
        return { piste: p, s0, path, coins, start: startFromPiste(world, p, s0), reqLift: p.from, limit: Math.ceil(est.t * 1.6 + 8), medals: [10, 15, 20], len: path.len };
      }
      case 'speed': {
        const { p, s0 } = pickSeg(420, 'steep');
        const len = Math.min(420, p.len - s0 - 10);
        const path = pistePath(world, p, s0, len);
        const trap = [len - 90, len - 50];
        const est = estimate(world, path, { k: 0.0043, trap });
        const v = est.trapV;
        const q1 = pathAt(path, trap[0]), q2 = pathAt(path, trap[1]);
        return {
          piste: p, s0, path, trap, trapPts: [q1, q2], start: startFromPiste(world, p, s0), reqLift: p.from,
          medals: [r3(v * 0.8), r3(v * 0.9), r3(v * 0.985)], len: path.len,
        };
      }
      case 'skijump': {
        const sj = world.skijump;
        if (!sj) return null;
        const exists = n;
        void exists;
        return {
          start: { x: sj.x, z: sj.z0 + 1.5, heading: 0 }, sj, reqLift: 1, medals: [52, 70, 86], len: sj.len, attempts: 2,
          piste: world.pistes[0],
        };
      }
      case 'avalanche': {
        const { p, s0 } = pickSeg(700, 'steep');
        const len = Math.min(700, p.len - s0 - 15);
        const path = pistePath(world, p, s0, len);
        const est = estimate(world, path, { radius: 40 });
        const tAv = est.t * 1.3;
        return {
          piste: p, s0, path, start: startFromPiste(world, p, s0), reqLift: p.from, est: est.t, avSpeed: (path.len + 35) / tAv, tAv,
          medals: [0.01, r3(est.t * 0.14), r3(est.t * 0.26)], len: path.len,
        };
      }
      case 'treetap': {
        // find a piste spot with lots of trees nearby
        let best = null, bestC = -1;
        for (let k = 0; k < 40; k++) {
          const { p, s0, q } = pickSeg(200);
          let c = 0;
          world.forObstacles(q.x, q.z, 90, (o) => { if (o.kind === 'tree' && Math.hypot(o.x - q.x, o.z - q.z) < 90) c++; return false; });
          if (c > bestC) { bestC = c; best = { p, s0 }; }
          if (c > 120) break;
        }
        if (!best) return null;
        const g = bestC > 160 ? [6, 11, 16] : bestC > 60 ? [5, 9, 13] : [3, 6, 9];
        return { piste: best.p, s0: best.s0, start: startFromPiste(world, best.p, best.s0), reqLift: best.p.from, limit: 45, medals: g, len: 0, trees: bestC };
      }
      case 'freeride': {
        // off-piste line of checkpoints below a lift top
        const lifts = world.lifts.slice().sort(() => r() - 0.5);
        for (const l of lifts) {
          const ex = world.liftExit(l);
          let x = ex.x + (r() - 0.5) * 60, z = ex.z + 40;
          const pts = [{ x: ex.x, z: ex.z }];
          let ok = true;
          for (let k = 0; k < 9; k++) {
            let found = null;
            for (let t = 0; t < 30; t++) {
              const cx = GS.clamp(x + (r() - 0.5) * 140, 150, world.W - 150), cz = z + 60 + r() * 35;
              if (cz > world.L - 60) break;
              if (T.pisteDistAt(cx, cz) < 16) continue;
              if (T.slopeAt(cx, cz) > 0.95) continue;
              let blocked = false;
              world.forObstacles(cx, cz, 8, (o) => { if (Math.hypot(o.x - cx, o.z - cz) < o.r + 6) { blocked = true; return true; } return false; });
              if (blocked) continue;
              found = { x: cx, z: cz };
              break;
            }
            if (!found) { if (k < 5) ok = false; break; }
            pts.push(found);
            x = found.x; z = found.z;
          }
          if (!ok || pts.length < 6) continue;
          const path = withCum(pts.map((pp) => ({ x: pp.x, z: pp.z })));
          const gates = pts.slice(1).map((pp, i) => {
            const q = pathAt(path, path.cum[i + 1]);
            return { x: pp.x, z: pp.z, nx: -q.tz, nz: q.tx, w: 7, s: path.cum[i + 1], color: '#9b5de5', big: true, check: true, yaw: Math.atan2(q.tx, q.tz) };
          });
          const est = estimate(world, path, { mu: 0.06, k: 0.0062, radius: 45 });
          const st = { x: ex.x, z: ex.z, heading: Math.atan2(pts[1].x - ex.x, pts[1].z - ex.z) };
          return { path, gates, start: st, reqLift: l.id, medals: [r3(est.t * 1.45), r3(est.t * 1.2), r3(est.t * 1.02)], len: path.len, piste: world.pistes.find((pp) => pp.from === l.id) || world.pistes[0], freeride: true };
        }
        return null;
      }
      case 'paraglide': case 'precision': {
        const L = world.launches[0];
        if (!L) return null;
        const rings = [];
        let x = L.x, z = L.z, y = L.y + 1;
        let hd = 0;
        const rr = GS.rng(n * 17 + 3);
        const count = 12;
        for (let k = 0; k < (type === 'paraglide' ? count : 5); k++) {
          hd += (rr() - 0.5) * 0.9;
          hd = GS.clamp(hd, -0.9, 0.9);
          x += Math.sin(hd) * 70; z += Math.cos(hd) * 70;
          x = GS.clamp(x, 160, world.W - 160);
          if (z > world.L - 80) break;
          y -= 70 / 9.5;
          const ground = T.heightAt(x, z);
          if (y < ground + 14) y = ground + 14;
          rings.push({ x, y, z, yaw: hd });
        }
        if (type === 'precision') {
          // target in the valley below the last ring
          const last = rings[rings.length - 1];
          let tx = last.x, tz = Math.min(world.L - 90, last.z + 260);
          for (let t = 0; t < 30; t++) {
            if (T.slopeAt(tx, tz) < 0.35 && T.pisteDistAt(tx, tz) > 5) break;
            tx = GS.clamp(last.x + (rr() - 0.5) * 200, 160, world.W - 160);
            tz = Math.min(world.L - 90, last.z + 120 + rr() * 260);
          }
          return { start: { x: L.x, z: L.z, heading: 0 }, launch: L, rings: [], target: { x: tx, z: tz, y: T.heightAt(tx, tz) }, reqLift: L.lift, medals: [30, 14, 5], len: 0, piste: world.pistes[0] };
        }
        return { start: { x: L.x, z: L.z, heading: 0 }, launch: L, rings, reqLift: L.lift, medals: [Math.ceil(rings.length * 0.5), Math.ceil(rings.length * 0.75), rings.length], len: 0, piste: world.pistes[0] };
      }
      case 'airtime': {
        const cl = (T.cliffList || []).slice().sort((a, b) => b.drop - a.drop);
        let st = null, drop = 6;
        for (const c of cl) {
          const cx = (c.x0 + c.x1) / 2, cz = c.z - 60;
          if (cz < 30) continue;
          st = { x: cx, z: cz, heading: 0 };
          drop = c.drop;
          break;
        }
        if (!st) {
          const { p, s0 } = pickSeg(200);
          st = startFromPiste(world, p, s0);
        }
        const tt = Math.sqrt((2 * drop) / G) + 0.5;
        const l = world.lifts.slice().sort((a, b) => Math.hypot(a.T.x - st.x, a.T.z - st.z) - Math.hypot(b.T.x - st.x, b.T.z - st.z)).find((ll) => ll.T.z < st.z) || world.lifts[0];
        return { start: st, reqLift: l.id, limit: 45, medals: [r3(tt * 0.6), r3(tt * 0.9), r3(tt * 1.2)], len: 0, piste: world.pistes[0] };
      }
      default: return null;
    }
  }

  // ---------- Runtime ---------------------------------------------------------------
  class Run {
    constructor(game, ch) {
      this.game = game;
      this.ch = ch;
      this.state = 'countdown';
      this.t = 0;
      this.cd = 3.2;
      this.time = 0;
      this.penalty = 0;
      this.passed = 0;
      this.missed = 0;
      this.score = 0;
      this.count = 0;
      this.best = 0;
      this.attempt = 1;
      this.prog = 0;
      this.result = null;
      this.taps = new Set();
      this.lastX = null;
      this.gates = (ch.gates || []).map((g) => Object.assign({}, g, { passed: false, missed: false }));
      this.coins = (ch.coins || []).map((c) => Object.assign({}, c, { got: false }));
      this.rings = (ch.rings || []).map((c) => Object.assign({}, c, { got: false }));
      this.maxSpeed = 0;
      this.trapSum = 0;
      this.trapN = 0;
      this.airBest = 0;
      this.jumpScore = 0;
    }

    begin() {
      const g = this.game, ch = this.ch, p = g.player;
      if (ch.type === 'paraglide' || ch.type === 'precision') {
        p.reset(ch.launch.x, ch.launch.z, 0);
        p.startGlide(ch.launch);
        p.frozen = true;
      } else {
        p.reset(ch.start.x, ch.start.z, ch.start.heading);
        p.frozen = true;
      }
      g.skiJumpMode = ch.type === 'skijump';
      if (ch.cond) g.env.setOverride(ch.cond);
      if (ch.rivals) {
        this.rivals = ch.rivals.map((rv) => ({
          name: rv.name, skill: rv.skill, target: rv.target, lane: rv.lane, s: -3, v: 0, done: false, time: 0,
          gear: GS.randomGear(GS.rng(rv.seed)), x: 0, y: 0, z: 0, yaw: 0, lean: 0, poleT: 0,
        }));
      }
      g.camera.snap();
      GS.Audio.setIntensity(0.8);
    }

    get running() { return this.state === 'run'; }

    update(dt) {
      const g = this.game, ch = this.ch, p = g.player;
      this.t += dt;
      if (this.state === 'countdown') {
        const before = Math.ceil(this.cd);
        this.cd -= dt;
        const after = Math.ceil(this.cd);
        if (after !== before && after > 0 && after <= 3) { g.sfx('beep'); g.ui.countdown(after); }
        if (this.cd <= 0) {
          this.state = 'run';
          p.frozen = false;
          g.sfx('go');
          g.ui.countdown(0);
          if (ch.type === 'skijump') { p.vz = 3; }
        }
        return;
      }
      if (this.state !== 'run') return;
      this.time += dt;
      const px = p.x, pz = p.z;
      if (this.lastX == null) { this.lastX = px; this.lastZ = pz; }
      const ox = this.lastX, oz = this.lastZ;
      this.lastX = px; this.lastZ = pz;
      if (p.speed > this.maxSpeed) this.maxSpeed = p.speed;

      // course progress & leaving the course
      if (ch.path) {
        const pr = pathProject(ch.path, px, pz, this.prog);
        if (pr.s > this.prog || Math.abs(pr.s - this.prog) < 30) this.prog = pr.s;
        const maxOff = ch.freeride ? 140 : ch.type === 'slopestyle' ? 70 : 85;
        if (pr.d > maxOff && p.mode !== 'lift' && p.mode !== 'air') { this.fail('offCourse'); return; }
      }
      if (p.mode === 'lift') { this.fail('offCourse'); return; }

      // gates
      for (const gt of this.gates) {
        if (gt.passed || gt.missed) continue;
        const ax = gt.x - gt.nx * gt.w, az = gt.z - gt.nz * gt.w, bx = gt.x + gt.nx * gt.w, bz = gt.z + gt.nz * gt.w;
        if (segCross(ox, oz, px, pz, ax, az, bx, bz)) {
          gt.passed = true;
          this.passed++;
          g.sfx('gate');
          g.ui.flash(gt.check ? 'check' : 'gate');
        } else if (this.prog > gt.s + 6) {
          gt.missed = true;
          this.missed++;
          if (ch.penalty) this.penalty += ch.penalty;
          g.sfx('miss');
          g.ui.toast(g.t('gateMissed') + (ch.penalty ? ' +' + ch.penalty + 's' : ''), 'bad');
          if (ch.type === 'freeride' || ch.rivals) { /* checkpoints must be taken */ }
        }
      }

      switch (ch.type) {
        case 'collect':
          for (const c of this.coins) {
            if (c.got) continue;
            if (Math.hypot(c.x - px, c.z - pz) < 2.3 && Math.abs(c.y - (p.y + 1)) < 2.4) {
              c.got = true;
              this.count++;
              g.sfx('coin');
              g.burst(c.x, c.y, c.z, [1, 0.85, 0.3]);
            }
          }
          if (this.time >= ch.limit) { this.finish(this.count); return; }
          if (this.count === this.coins.length) { this.finish(this.count); return; }
          break;
        case 'speed': {
          if (this.prog >= ch.trap[0] && this.prog <= ch.trap[1]) { this.trapSum += p.speed; this.trapN++; }
          break;
        }
        case 'freestyle': case 'treetap': case 'airtime':
          if (this.time >= ch.limit) {
            this.finish(ch.type === 'treetap' ? this.count : ch.type === 'airtime' ? this.airBest : this.score + this._pending());
            return;
          }
          break;
        case 'avalanche': {
          const front = -35 + ch.avSpeed * this.time;
          this.front = front;
          if (front >= this.prog && this.prog < ch.path.len - 2) { this.fail('caught'); return; }
          break;
        }
        case 'paraglide':
          for (const rg of this.rings) {
            if (rg.got) continue;
            const d = Math.hypot(rg.x - px, rg.y - (p.y + 1.5), rg.z - pz);
            if (d < 6.5) { rg.got = true; this.count++; g.sfx('coin'); g.burst(rg.x, rg.y, rg.z, [0.3, 0.8, 1]); }
          }
          break;
        default: break;
      }

      // rivals
      if (this.rivals) this._rivals(dt);

      // finish line
      if (ch.path && !ch.noFinish && this.prog >= ch.path.len - 1.5 && ['bigair', 'freestyle', 'treetap', 'airtime', 'skijump'].indexOf(ch.type) < 0) {
        this._crossFinish();
      }
    }

    _pending() {
      const c = this.game.player.combo;
      return c.active ? c.pts * Math.max(1, c.mult) : 0;
    }

    _crossFinish() {
      const ch = this.ch;
      switch (ch.type) {
        case 'race': case 'duel': {
          const me = this.time + this.penalty;
          const missedChecks = this.gates.filter((g) => g.missed).length;
          if (missedChecks > 1) { this.fail('missedChecks'); return; }
          if (ch.type === 'race') {
            const before = this.rivals.filter((rv) => rv.done && rv.time < me).length;
            const ahead = this.rivals.filter((rv) => !rv.done && rv.s > ch.path.len - 1).length;
            this.finish(1 + before + ahead, { time: me });
          } else {
            const rv = this.rivals[0];
            const rt = rv.done ? rv.time : this._rivalEta(rv);
            this.finish(r3(me - rt), { time: me, rival: rt });
          }
          return;
        }
        case 'slopestyle':
          this.finish(this.score + this._pending());
          return;
        case 'collect':
          this.finish(this.count);
          return;
        case 'speed':
          this.finish(r3(this.trapN ? this.trapSum / this.trapN : 0));
          return;
        case 'avalanche':
          this.finish(r3(this.ch.tAv - this.time));
          return;
        case 'freeride': {
          const missed = this.gates.filter((g) => !g.passed).length;
          if (missed > 1) { this.fail('missedChecks'); return; }
          this.finish(r3(this.time + missed * 5));
          return;
        }
        default:
          this.finish(r3(this.time + this.penalty));
      }
    }

    _rivalEta(rv) {
      const left = this.ch.path.len - rv.s;
      return this.time + left / Math.max(4, rv.v);
    }

    _rivals(dt) {
      const ch = this.ch, T = this.game.world.terrain;
      const q = {};
      for (const rv of this.rivals) {
        if (rv.done) continue;
        pathAt(ch.path, Math.max(0, rv.s), q);
        const ahead = pathAt(ch.path, Math.min(ch.path.len, Math.max(0, rv.s) + 3), {});
        const drop = (T.heightAt(q.x, q.z) - T.heightAt(ahead.x, ahead.z)) / 3;
        const k = 0.0052 / rv.skill;
        rv.v = Math.max(2, rv.v + (G * drop - 0.034 * G - k * rv.v * rv.v + (rv.v < 6 ? 2.5 : 0)) * dt * rv.skill);
        rv.v = Math.min(rv.v, Math.sqrt(17 * 40) * rv.skill);
        if (rv.target) {
          // keep on schedule for the calibrated finishing time
          const want = (ch.path.len - rv.s) / Math.max(0.5, rv.target - rv.time);
          rv.v += (GS.clamp(want, 3, 45) - rv.v) * Math.min(1, dt * 0.6);
        }
        rv.s += rv.v * dt;
        rv.time += dt;
        const wob = Math.sin(rv.s / 18 + rv.lane) * 2.2;
        const lat = rv.lane + wob;
        rv.x = q.x - q.tz * lat; rv.z = q.z + q.tx * lat;
        rv.y = T.heightAt(rv.x, rv.z);
        rv.yaw = Math.atan2(q.tx, q.tz) + Math.cos(rv.s / 18 + rv.lane) * 0.25;
        rv.lean = -Math.cos(rv.s / 18 + rv.lane) * 0.35;
        rv.poleT += dt * 4;
        if (rv.s >= ch.path.len) {
          rv.done = true;
          rv.time = this.time;
        }
      }
    }

    // events from the game -------------------------------------------------
    onBank(points) {
      if (this.state !== 'run') return;
      if (['freestyle', 'slopestyle'].indexOf(this.ch.type) >= 0) this.score += points;
    }

    onTrick(tricks) {
      if (this.state !== 'run') return;
      if (this.ch.type === 'treetap') {
        for (const t of tricks) if (t.tree) { this.count++; }
      }
      if (this.ch.type === 'bigair') {
        this.jumpScore += tricks.reduce((a, t) => a + t.pts, 0);
      }
    }

    onLanding(airT, tricks) {
      if (this.state !== 'run') return;
      const ch = this.ch;
      if (airT > this.airBest) this.airBest = r3(airT);
      if (ch.type === 'bigair' && this.prog > 95 && airT > 0.6) {
        const s = tricks.reduce((a, t) => a + t.pts, 0) * (1 + 0.25 * Math.max(0, tricks.length - 1));
        this._attemptDone(s);
      }
      if (ch.type === 'skijump' && airT > 0.6) {
        const d = r3(Math.max(0, this.game.player.z - ch.sj.edgeZ));
        this._jumpDone(d);
      }
    }

    onCrash() {
      if (this.state !== 'run') return;
      const ch = this.ch;
      if (ch.type === 'bigair' && this.prog > 97) this._attemptDone(0);
      if (ch.type === 'skijump' && this.game.player.z > ch.sj.edgeZ) this._jumpDone(0);
    }

    onGlideLand(x, z) {
      if (this.state !== 'run') return;
      const ch = this.ch;
      if (ch.type === 'paraglide') this.finish(this.count);
      if (ch.type === 'precision') this.finish(r3(Math.hypot(x - ch.target.x, z - ch.target.z)));
    }

    _attemptDone(s) {
      this.best = Math.max(this.best, Math.round(s));
      this.game.ui.toast(this.game.t('attempt') + ' ' + this.attempt + ': ' + GS.fmtInt(s), s > 0 ? 'good' : 'bad');
      if (this.attempt >= this.ch.attempts) { this.finish(this.best); return; }
      this.attempt++;
      this._reattempt();
    }

    _jumpDone(d) {
      this.best = Math.max(this.best, d);
      this.game.ui.toast(this.game.t('attempt') + ' ' + this.attempt + ': ' + GS.fmtDist(d), d > 0 ? 'good' : 'bad');
      if (this.attempt >= this.ch.attempts) { this.finish(this.best); return; }
      this.attempt++;
      this._reattempt();
    }

    _reattempt() {
      this.state = 'between';
      setTimeout(() => {
        if (this.state !== 'between') return;
        const p = this.game.player;
        p.reset(this.ch.start.x, this.ch.start.z, this.ch.start.heading);
        p.frozen = true;
        this.prog = 0;
        this.jumpScore = 0;
        this.lastX = null;
        this.state = 'countdown';
        this.cd = 2.2;
        this.game.camera.snap();
      }, 1400);
    }

    finish(value, extra) {
      if (this.state === 'done') return;
      this.state = 'done';
      this.result = { value, extra: extra || {}, ok: true };
      this.game.challengeFinished(this, this.result);
    }

    fail(reason) {
      if (this.state === 'done') return;
      this.state = 'done';
      this.result = { value: null, ok: false, reason };
      this.game.challengeFinished(this, this.result);
    }

    cleanup() {
      const g = this.game;
      g.env.setOverride(null);
      g.skiJumpMode = false;
      g.player.frozen = false;
      GS.Audio.setIntensity(0);
    }

    // HUD data
    hud() {
      const ch = this.ch, L = this.game.t;
      const o = { main: '', sub: '', bar: null };
      switch (ch.metric) {
        case 'time':
          o.main = GS.fmtTime(this.time + this.penalty);
          if (this.gates.length) o.sub = L('gates') + ' ' + this.passed + '/' + this.gates.length;
          break;
        case 'place': {
          const me = this.prog;
          const place = 1 + (this.rivals || []).filter((rv) => rv.s > me).length;
          o.main = place + '. ' + L('place');
          o.sub = GS.fmtTime(this.time);
          break;
        }
        case 'gap': {
          const rv = this.rivals[0];
          const gapM = this.prog - rv.s;
          o.main = (gapM >= 0 ? '+' : '') + Math.round(gapM) + ' m';
          o.sub = 'vs ' + rv.name;
          break;
        }
        case 'score':
          if (ch.type === 'bigair') { o.main = GS.fmtInt(this.best); o.sub = L('attempt') + ' ' + this.attempt + '/' + ch.attempts; }
          else { o.main = GS.fmtInt(this.score + this._pending()); o.sub = ch.limit ? GS.fmtTime(Math.max(0, ch.limit - this.time)) : ''; }
          break;
        case 'count':
          o.main = this.count + (ch.type === 'collect' ? '/' + this.coins.length : ch.type === 'paraglide' ? '/' + this.rings.length : '');
          o.sub = ch.limit ? GS.fmtTime(Math.max(0, ch.limit - this.time)) : '';
          break;
        case 'speed':
          o.main = GS.fmtSpeed(this.game.player.speed);
          o.sub = this.trapN ? L('trap') + ' ' + GS.fmtSpeed(this.trapSum / this.trapN) : L('trapAhead');
          break;
        case 'distance':
          if (ch.type === 'skijump') { o.main = GS.fmtDist(this.best); o.sub = L('attempt') + ' ' + this.attempt + '/' + ch.attempts; }
          else { const p = this.game.player; o.main = GS.fmtDist(Math.hypot(p.x - ch.target.x, p.z - ch.target.z)); o.sub = L('target'); }
          break;
        case 'margin': {
          const lead = this.prog - (this.front || -35);
          o.main = Math.round(lead) + ' m';
          o.sub = L('avalancheLead');
          o.bar = GS.clamp(lead / 120, 0, 1);
          break;
        }
        case 'airtime':
          o.main = this.airBest.toFixed(2) + ' s';
          o.sub = GS.fmtTime(Math.max(0, ch.limit - this.time));
          break;
        default: break;
      }
      return o;
    }

    // ---------- Rendering ---------------------------------------------------
    render(R, cam) {
      const ch = this.ch, T = this.game.world.terrain;
      const g = this.game;
      const m = new Float32Array(16);
      const near = (x, z, d) => Math.abs(x - cam[0]) < d && Math.abs(z - cam[2]) < d;
      const meshes = g.meshes;
      for (const gt of this.gates) {
        if (!near(gt.x, gt.z, 170)) continue;
        const mesh = gt.big ? meshes.bigGate(gt.color, gt.w * 2) : meshes.gate(gt.color, gt.w * 2);
        M.identity(m);
        M.translate(m, gt.x, T.heightAt(gt.x, gt.z) - 0.05, gt.z);
        M.rotY(m, Math.atan2(gt.nz, -gt.nx) - Math.PI / 2 + Math.PI / 2);
        // align local x with the gate line
        M.identity(m);
        M.translate(m, gt.x, T.heightAt(gt.x, gt.z) - 0.05, gt.z);
        M.rotY(m, Math.atan2(-gt.nz, gt.nx));
        const fade = gt.passed ? 0.55 : 1;
        R.push(mesh, m, fade, fade, fade);
      }
      // finish line arch
      if (ch.path && ['bigair', 'freestyle', 'treetap', 'airtime', 'skijump'].indexOf(ch.type) < 0) {
        const f = pathAt(ch.path, ch.path.len);
        if (near(f.x, f.z, 250)) {
          M.identity(m);
          M.translate(m, f.x, T.heightAt(f.x, f.z), f.z);
          M.rotY(m, Math.atan2(f.tx, f.tz));
          R.push(meshes.arch(ch.piste ? Math.min(ch.piste.width, 30) : 20, ch.color), m);
        }
      }
      const t = g.time;
      for (const c of this.coins) {
        if (c.got || !near(c.x, c.z, 140)) continue;
        M.identity(m);
        M.translate(m, c.x, c.y + Math.sin(t * 3 + c.x) * 0.15, c.z);
        M.rotY(m, t * 3 + c.z);
        M.scale(m, 1.1, 1.1, 1.1);
        R.push(meshes.coin, m, 1, 1, 1, true);
      }
      for (const rg of this.rings) {
        if (!near(rg.x, rg.z, 600)) continue;
        M.identity(m);
        M.translate(m, rg.x, rg.y, rg.z);
        M.rotY(m, rg.yaw);
        M.rotX(m, Math.PI / 2);
        const c = rg.got ? [0.2, 0.25, 0.3] : [0.2, 0.75, 1];
        R.push(meshes.ring, m, c[0], c[1], c[2], true);
      }
      if (ch.target) {
        M.identity(m);
        M.translate(m, ch.target.x, ch.target.y + 0.15, ch.target.z);
        for (const [rad, c] of [[1.2, [1, 0.2, 0.2]], [2.6, [1, 1, 1]], [5, [1, 0.2, 0.2]], [9, [1, 1, 1]], [14, [1, 0.3, 0.3]]]) {
          const mm = new Float32Array(m);
          M.scale(mm, rad / 4, 1, rad / 4);
          R.push(meshes.marker, mm, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, true);
        }
      }
      if (ch.type === 'speed' && ch.trapPts) {
        for (const q of ch.trapPts) {
          M.identity(m);
          M.translate(m, q.x, T.heightAt(q.x, q.z), q.z);
          M.rotY(m, Math.atan2(q.tx, q.tz));
          R.push(meshes.arch(26, '#d00000'), m);
        }
      }
      if (ch.type === 'avalanche' && this.front != null && this.state === 'run') this._renderAvalanche(R, cam);
      if (this.rivals) {
        for (const rv of this.rivals) {
          if (rv.s < 0 && this.state === 'countdown') {
            const q = pathAt(ch.path, 0);
            rv.x = q.x - q.tz * rv.lane; rv.z = q.z + q.tx * rv.lane - 3;
            rv.y = T.heightAt(rv.x, rv.z); rv.yaw = Math.atan2(q.tx, q.tz);
          }
          if (!near(rv.x, rv.z, 200)) continue;
          GS.Rider.draw(R, { x: rv.x, y: rv.y, z: rv.z, yaw: rv.yaw, lean: rv.lean, crouch: 0.35, poleT: rv.poleT }, rv.gear);
        }
      }
    }

    _renderAvalanche(R, cam) {
      const ch = this.ch, T = this.game.world.terrain;
      const q = {};
      const s = Math.max(0, this.front);
      pathAt(ch.path, s, q);
      const w = 46;
      const m = new Float32Array(16);
      const sph = this.game.meshes.boulder;
      for (let k = -6; k <= 6; k++) {
        const lat = (k / 6) * w * 0.5;
        const x = q.x - q.tz * lat, z = q.z + q.tx * lat;
        const y = T.heightAt(x, z);
        const t = this.game.time;
        for (let j = 0; j < 3; j++) {
          const back = j * 5;
          const bx = x - q.tx * back, bz = z - q.tz * back;
          M.identity(m);
          M.translate(m, bx, y + 2.5 + j * 1.5 + Math.sin(t * 5 + k) * 0.6, bz);
          M.rotX(m, t * 3 + k);
          const sc = 3.2 + ((k * 7 + j * 3) % 5) * 0.5;
          M.scale(m, sc, sc * 0.85, sc);
          R.push(sph, m, 0.98, 0.99, 1);
        }
        if (Math.random() < 0.5) {
          R.emit(x + (Math.random() - 0.5) * 6, y + 2 + Math.random() * 6, z, (Math.random() - 0.5) * 4 + q.tx * 10, 2 + Math.random() * 4, (Math.random() - 0.5) * 4 + q.tz * 10, 2.2, 3 + Math.random() * 3, 1, 1, 1, 0.75, 1, 2.5, 0.8);
        }
      }
      void cam;
    }
  }

  // ---------- Autopilot (tests, demo and medal calibration) -------------------
  function botInput(p, world, course, inp) {
    if (p.mode !== 'ski' && p.mode !== 'air') return inp;
    let tx, tz;
    if (course && course.path) {
      const prog = course.prog || 0;
      let g = null;
      for (const gt of course.gates || []) {
        if (gt.passed || gt.missed || gt.s < prog - 1) continue;
        g = gt;
        break;
      }
      const T = world.terrain;
      if (g && (Math.hypot(g.x - p.x, g.z - p.z) < 4.5 && !g.big || (p.speed < 4 && T.heightAt(g.x, g.z) > p.y + 0.4))) {
        const nxt = (course.gates || []).find((gt) => !gt.passed && !gt.missed && gt.s > g.s);
        if (nxt) g = nxt;
      }
      const ahead = pathAt(course.path, prog + 14);
      if (g && Math.hypot(g.x - p.x, g.z - p.z) < 40) {
        const side = Math.sign((p.x - g.x) * g.nx + (p.z - g.z) * g.nz) || 1;
        const k = g.big ? 0 : Math.min(0.6, g.w * 0.3);
        tx = g.x - g.nx * k * side; tz = g.z - g.nz * k * side;
      } else { tx = ahead.x; tz = ahead.z; }
      if (course.coins) {
        let best = null, bd = 30;
        for (const c of course.coins) {
          if (c.got) continue;
          const d = Math.hypot(c.x - p.x, c.z - p.z);
          const fwd = (c.x - p.x) * Math.sin(p.heading) + (c.z - p.z) * Math.cos(p.heading);
          if (d < bd && fwd > 2) { bd = d; best = c; }
        }
        if (best) { tx = best.x; tz = best.z; }
      }
    } else {
      const pi = world.terrain.pisteAt(p.x, p.z);
      const pst = world.pistes[pi >= 0 ? pi : 0];
      const pr = world.pisteProject(pst, p.x, p.z);
      const q = world.pisteAt(pst, pr.s + 16);
      tx = q.x; tz = q.z;
    }
    if (p.mode === 'ski') {
      inp.aim = Math.atan2(tx - p.x, tz - p.z);
      inp.aimStrength = 1;
      inp.steer = 0;
      inp.tuck = Math.abs(GS.angleTo(p.heading, inp.aim)) < 0.15 && p.speed < 30;
    }
    return inp;
  }

  // Run a headless ghost rider with the autopilot along a course.
  function ghost(world, ch, maxT) {
    const stub = {
      world, renderer: { emit() {}, addTrack() {} }, sfx() {}, t: GS.t, time: 0, env: { windX: 0, windZ: 0 }, skiJumpMode: false,
      crashes: 0, onLanding() {}, onTrick() {}, onComboBank() {}, onCrash() { this.crashes++; }, onRecover() {}, onLiftExit() {}, onZipEnd() {}, onGlideLand() {},
    };
    const p = new GS.Player(stub);
    p.reset(ch.start.x, ch.start.z, ch.start.heading);
    const course = { path: ch.path, gates: (ch.gates || []).map((g) => Object.assign({}, g)), prog: 0 };
    const dt = 1 / 60;
    let t = 0, ox = p.x, oz = p.z, missed = 0, trapSum = 0, trapN = 0;
    while (t < (maxT || 150)) {
      const inp = botInput(p, world, course, { steer: 0, aim: null, brake: false, tuck: false, jump: false, jumpHeld: false, flip: 0, grab: false, slap: false, pivot: 0, press: 0 });
      p.update(dt, inp);
      t += dt;
      stub.time = t;
      const pr = pathProject(ch.path, p.x, p.z, course.prog);
      if (pr.s > course.prog || Math.abs(pr.s - course.prog) < 30) course.prog = pr.s;
      if (pr.d > 85) return null;
      for (const g of course.gates) {
        if (g.passed || g.missed) continue;
        if (segCross(ox, oz, p.x, p.z, g.x - g.nx * g.w, g.z - g.nz * g.w, g.x + g.nx * g.w, g.z + g.nz * g.w)) g.passed = true;
        else if (course.prog > g.s + 6) { g.missed = true; missed++; }
      }
      if (ch.trap && course.prog >= ch.trap[0] && course.prog <= ch.trap[1]) { trapSum += p.speed; trapN++; }
      ox = p.x; oz = p.z;
      if (course.prog >= ch.path.len - 1.5) return { t, missed, crashes: stub.crashes, trap: trapN ? trapSum / trapN : 0 };
    }
    return null;
  }

  // Calibrate medal thresholds of path-based challenges against the ghost.
  function calibrate(world, ch) {
    if (ch.calibrated || !ch.path) return;
    ch.calibrated = true;
    const timeTypes = ['slalom', 'giant', 'superg', 'downhill', 'night', 'fog', 'race', 'duel', 'avalanche', 'speed'];
    if (timeTypes.indexOf(ch.type) < 0) return;
    const g = ghost(world, ch, 160);
    if (!g || g.crashes > 1 || g.missed > Math.max(1, (ch.gates || []).length * 0.15)) return;
    const pen = (ch.penalty || 0) * g.missed;
    const ref = g.t + pen;
    ch.ref = ref;
    switch (ch.type) {
      case 'race': case 'duel':
        ch.est = ref;
        if (ch.rivals) {
          const mult = ch.type === 'race' ? [1.16, 1.08, 1.03, 0.995] : [1.0];
          ch.rivals.forEach((rv, i) => { rv.target = ref * mult[i]; });
        }
        break;
      case 'avalanche':
        ch.est = ref;
        ch.tAv = ref * 1.3;
        ch.avSpeed = (ch.path.len + 35) / ch.tAv;
        ch.medals = [0.01, r3(ref * 0.14), r3(ref * 0.26)];
        break;
      case 'speed':
        ch.medals = [r3(g.trap * 0.86), r3(g.trap * 0.94), r3(g.trap * 0.995)];
        break;
      default:
        ch.medals = [r3(ref * 1.32), r3(ref * 1.15), r3(ref * 1.02)];
    }
  }

  // Medal tier for a result (0 none .. 3 gold).
  function medalFor(ch, value) {
    if (value == null) return 0;
    const m = ch.medals;
    let tier = 0;
    for (let i = 0; i < 3; i++) {
      const ok = ch.better === 'low' ? value <= m[i] : value >= m[i];
      if (ok) tier = i + 1;
    }
    return tier;
  }

  function fmtValue(ch, v) {
    if (v == null) return '–';
    switch (ch.metric) {
      case 'time': return GS.fmtTime(v);
      case 'place': return v + '.';
      case 'gap': return (v <= 0 ? '' : '+') + GS.fmtTime(Math.abs(v)).replace(/^/, v < 0 ? '−' : '');
      case 'score': return GS.fmtInt(v);
      case 'count': return String(v);
      case 'speed': return GS.fmtSpeed(v);
      case 'distance': return GS.fmtDist(v);
      case 'margin': return GS.fmtTime(Math.max(0, v));
      case 'airtime': return v.toFixed(2) + ' s';
      default: return String(v);
    }
  }

  GS.Challenges = { TYPES, generate, Run, medalFor, fmtValue, pathAt, estimate, botInput, ghost, calibrate };
})(window.GS);
