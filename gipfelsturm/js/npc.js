'use strict';
// Background skiers and boarders: they carve down pistes, queue at the
// bottom station, ride the chairs up and pick a new run at the top.
(function (GS) {
  class NPCs {
    constructor(game, count) {
      this.game = game;
      this.list = [];
      this.trackT = 0;
      this.setCount(count);
    }

    setCount(n) {
      const w = this.game.world;
      const r = GS.rng((w.def.seed * 5 + this.list.length) | 0);
      while (this.list.length > n) this.list.pop();
      while (this.list.length < n) {
        const p = w.pistes[(r() * w.pistes.length) | 0];
        const n0 = {
          gear: GS.randomGear(r), board: r() < 0.3, skill: 0.5 + r() * 0.6,
          state: 'piste', piste: p, s: r() * p.len, lat: 0, latPh: r() * 6, latAmp: 0.25 + r() * 0.3, latF: 0.7 + r() * 0.6,
          v: 4 + r() * 6, x: 0, y: 0, z: 0, yaw: 0, lean: 0, poleT: r() * 6, crashT: 0, lift: null, k: -1, prev: null, wait: 0,
          id: this.list.length, seed: (r() * 1e6) | 0,
        };
        if (r() < 0.35) {
          const l = w.lifts[(r() * w.lifts.length) | 0];
          n0.state = 'lift';
          n0.lift = l;
          n0.k = (r() * l.count) | 0;
        }
        this.list.push(n0);
      }
    }

    update(dt, cam) {
      const w = this.game.world, T = w.terrain, R = this.game.renderer;
      const q = {};
      const tmp = {};
      const p = this.game.player;
      this.trackT += dt;
      const doTracks = this.trackT > 0.06;
      if (doTracks) this.trackT = 0;
      for (const n of this.list) {
        if (n.state === 'piste') {
          const pi = n.piste;
          w.pisteAt(pi, n.s, q);
          const ahead = w.pisteAt(pi, Math.min(pi.len, n.s + 4), tmp);
          const drop = (T.heightAt(q.x, q.z) - T.heightAt(ahead.x, ahead.z)) / 4;
          const vt = GS.clamp(5 + drop * 26 * n.skill, 3.5, 7 + n.skill * 9);
          n.v += (vt - n.v) * Math.min(1, dt * 0.8);
          n.s += n.v * dt;
          n.latPh += dt * n.latF * (0.6 + n.v * 0.05);
          const lat = Math.sin(n.latPh) * pi.width * n.latAmp;
          const nx = q.x - q.tz * lat, nz = q.z + q.tx * lat;
          const dx = nx - n.x, dz = nz - n.z;
          if (Math.hypot(dx, dz) > 0.01 && n.x !== 0) n.yaw = Math.atan2(dx, dz);
          n.x = nx; n.z = nz;
          n.y = T.heightAt(nx, nz);
          n.lean = -Math.cos(n.latPh) * 0.4 * Math.min(1, n.v / 10);
          n.poleT += dt * 3;
          // tracks near the camera
          if (doTracks && (this.prefill || (Math.abs(n.x - cam[0]) < 90 && Math.abs(n.z - cam[2]) < 90))) {
            const hx = Math.sin(n.yaw), hz = Math.cos(n.yaw);
            const cur = { x: n.x, y: n.y + 0.02, z: n.z, px: hz, pz: -hx };
            if (n.prev && Math.hypot(n.prev.x - cur.x, n.prev.z - cur.z) < 3) {
              R.addTrack(n.prev.x, n.prev.y, n.prev.z, cur.x, cur.y, cur.z, n.prev.px, n.prev.pz, cur.px, cur.pz, n.board ? 0.2 : 0.24, n.board ? 1 : 0);
            }
            n.prev = cur;
          } else if (doTracks) n.prev = null;
          // bump into the player
          if (p.mode === 'ski' && Math.hypot(p.x - n.x, p.z - n.z) < 1.1 && Math.abs(p.y - n.y) < 1.5) {
            const rel = Math.hypot(p.vx - Math.sin(n.yaw) * n.v, p.vz - Math.cos(n.yaw) * n.v);
            if (rel > 7) {
              p._doCrash('skier');
              n.state = 'crash';
              n.crashT = 0;
            } else {
              const ax = p.x - n.x, az = p.z - n.z, l = Math.hypot(ax, az) || 1;
              p.x += (ax / l) * 0.1; p.z += (az / l) * 0.1;
            }
          }
          if (n.s >= pi.len - 1) {
            const l = w.lifts[pi.to];
            n.state = 'queue';
            n.lift = l;
            n.prev = null;
            n.wait = 0;
            n.qx = l.B.x - l.side.x * (3 + (n.id % 4)) + l.dir.x * (n.id % 3) * -1.2;
            n.qz = l.B.z - l.side.z * (3 + (n.id % 4)) + l.dir.z * (n.id % 3) * -1.2;
          }
        } else if (n.state === 'queue') {
          const l = n.lift;
          n.x += (n.qx - n.x) * Math.min(1, dt * 1.5);
          n.z += (n.qz - n.z) * Math.min(1, dt * 1.5);
          n.y = T.heightAt(n.x, n.z);
          n.yaw = l.yaw;
          n.lean = 0;
          n.wait += dt;
          if (n.wait > 1.5) {
            for (let k = 0; k < l.count; k++) {
              const qq = w.chairQ(l, k);
              if (qq >= 0 && qq < 0.8 + l.speed * l.boost * dt * 2) { n.k = k; n.state = 'lift'; break; }
            }
          }
        } else if (n.state === 'lift') {
          const l = n.lift;
          w.cableAt(l, w.chairQ(l, n.k), tmp);
          if (!tmp.up || tmp.u > l.len - 3) {
            // exit and choose a run from this lift
            const e = w.liftExit(l);
            const opts = w.pistes.filter((pp) => pp.from === l.id);
            const r = Math.abs(Math.sin(n.seed + this.game.time));
            n.piste = opts.length ? opts[(r * opts.length) | 0] : w.pistes[0];
            n.s = 0;
            n.state = 'piste';
            n.x = e.x; n.z = e.z; n.y = e.y;
            n.v = 3;
            continue;
          }
          n.x = tmp.x; n.z = tmp.z;
          n.y = l.type === 'tbar' ? T.heightAt(tmp.x, tmp.z) : tmp.y - l.cfg.hang - 0.45;
          n.yaw = l.yaw;
          n.lean = 0;
        } else if (n.state === 'crash') {
          n.crashT += dt;
          if (n.crashT > 2.2) { n.state = 'piste'; n.v = 2; }
        }
      }
    }

    render(R, cam) {
      const range = 120;
      for (const n of this.list) {
        if (Math.abs(n.x - cam[0]) > range || Math.abs(n.z - cam[2]) > range) continue;
        const l = n.lift;
        const pose = {
          lod: Math.abs(n.x - cam[0]) > 24 || Math.abs(n.z - cam[2]) > 24,
          x: n.x, y: n.y, z: n.z, yaw: n.yaw, lean: n.lean, crouch: n.state === 'piste' ? 0.3 : 0.05,
          board: n.board, poleT: n.poleT, sit: n.state === 'lift' && l && l.type !== 'tbar', crash: n.state === 'crash', crashT: n.crashT,
        };
        if (n.state === 'lift' && l && l.type === 'gondola') continue;
        GS.Rider.draw(R, pose, n.gear);
      }
    }
  }

  // Simulate a while so the pistes are already covered in carved tracks.
  NPCs.prototype.warmup = function (seconds) {
    this.prefill = true;
    const steps = Math.round(seconds / 0.07);
    for (let i = 0; i < steps; i++) this.update(0.07, [0, 0, 0]);
    this.prefill = false;
  };

  GS.NPCs = NPCs;
})(window.GS);
