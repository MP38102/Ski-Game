'use strict';
// Player rider: ski/snowboard physics on the heightmap, air tricks, rails,
// crashes, lifts, paragliding and ziplines. Fixed 120 Hz sub-steps.
(function (GS) {
  const G = 9.81;
  const SURF = GS.Terrain.SURF;
  const SURF_PROPS = [
    // grip, friction, drag extra, spray
    { grip: 7.5, mu: 0.055, sink: 0.12, spray: 1 }, // powder
    { grip: 10, mu: 0.032, sink: 0, spray: 0.35 }, // groomed
    { grip: 1.8, mu: 0.018, sink: 0, spray: 0.1 }, // ice
    { grip: 4, mu: 0.14, sink: 0, spray: 0.2 }, // rock
    { grip: 6, mu: 0.075, sink: 0.3, spray: 1.6 }, // deep powder
  ];
  // name + hand pose (0 right hand, 1 left hand, 2 both at tips, 3 both at tails, 4 both middle)
  const GRABS = [
    { n: 'mute', pose: 0 }, { n: 'safety', pose: 1 }, { n: 'japan', pose: 0 },
    { n: 'tail', pose: 3 }, { n: 'tip', pose: 2 }, { n: 'truck', pose: 4 },
  ];
  const GRABS_BOARD = [
    { n: 'indy', pose: 0 }, { n: 'melon', pose: 1 }, { n: 'method', pose: 1 },
    { n: 'tail', pose: 3 }, { n: 'nose', pose: 2 }, { n: 'stale', pose: 4 },
  ];

  class Player {
    constructor(game) {
      this.game = game;
      this.gear = null;
      this.board = false;
      this.reset(0, 0, 0);
    }

    reset(x, z, heading) {
      const w = this.game.world;
      this.x = x;
      this.z = z;
      this.y = w ? w.terrain.heightAt(x, z) : 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.heading = heading || 0;
      this.mode = 'ski';
      this.ground = true;
      this.spin = 0; this.flip = 0; this.spinV = 0; this.flipV = 0;
      this.grab = 0; this.grabT = 0; this.grabType = 0;
      this.airT = 0; this.maxAirT = 0;
      this.crouch = 0; this.charge = 0;
      this.lean = 0;
      this.crashT = 0;
      this.braking = 0;
      this.tuck = 0;
      this.switch = false;
      this.poleT = 0;
      this.lastSafe = { x, z, h: heading || 0 };
      this.safeT = 0;
      this.rail = null;
      this.lift = null;
      this.zip = null;
      this.glide = null;
      this.combo = { pts: 0, mult: 0, tricks: [], t: 0, active: false };
      this.prevTrackL = null;
      this.trackAcc = 0;
      this.speed = 0;
      this.airStart = 0;
      this.flipQueue = 0;
      this.lastTreeTap = 0;
      this.sprayAcc = 0;
      this.contact = SURF.GROOMED;
      this.stats = { dist: 0, topSpeed: 0, air: 0 };
      this.frozen = false;
      this.pivot = null;
      this.lastPivotT = -9;
      this.pivotChain = 0;
      this.press = 0; this.pressT = 0;
      this.carveT = 0;
      this.slashed = false;
      this.switchT = 0;
      this.nearCd = 0;
      this.grabsDone = [];
    }

    get airborne() { return this.mode === 'air'; }

    // ---------------------------------------------------------------------
    update(dt, input) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) this._step(h, input, i === 0);
      this.speed = Math.hypot(this.vx, this.vy, this.vz);
      if (this.mode === 'ski' && !this.frozen) this._styleTricks(dt, this.speed, SURF_PROPS[this.contact] || SURF_PROPS[0], this.contact);
      if (this.mode === 'ski' || this.mode === 'air') {
        this.stats.topSpeed = Math.max(this.stats.topSpeed, this.speed);
      }
      this._comboTick(dt);
    }

    _step(dt, inp, first) {
      if (this.frozen) return;
      switch (this.mode) {
        case 'ski': this._ski(dt, inp, first); break;
        case 'air': this._air(dt, inp, first); break;
        case 'grind': this._grind(dt, inp, first); break;
        case 'crash': this._crash(dt, inp); break;
        case 'lift': this._lift(dt, inp); break;
        case 'zip': this._zip(dt, inp); break;
        case 'glide': this._glide(dt, inp); break;
        default: break;
      }
    }

    // ---------- Ground --------------------------------------------------------
    _ski(dt, inp, first) {
      const w = this.game.world, T = w.terrain;
      // ski jump in-run: locked into the track
      const sj = this.game.skiJumpMode && w.skijump;
      if (sj && this.z < sj.edgeZ && Math.abs(this.x - sj.x) < 3) {
        this.x = sj.x; this.vx = 0; this.heading = 0;
        inp = Object.assign({}, inp, { steer: 0, aim: null, brake: false, pivot: 0, tuck: true });
      }
      const n = T.normalAt(this.x, this.z, this._n || (this._n = [0, 0, 0]));
      const surf = T.surfAt(this.x, this.z);
      this.contact = surf;
      const sp = SURF_PROPS[surf] || SURF_PROPS[0];
      const speed = Math.hypot(this.vx, this.vy, this.vz);

      // --- ground pivot (butter 180): flips you to riding backwards (switch)
      if (inp.pivot && !this.pivot && speed > 0.5) {
        this.pivot = { dir: inp.pivot, t: 0, dur: 0.34 };
        this.game.sfx('whoosh');
      }
      if (this.pivot) {
        const pv = this.pivot;
        const stepP = Math.min(dt, pv.dur - pv.t);
        this.heading = GS.wrapAngle(this.heading + pv.dir * (Math.PI / pv.dur) * stepP);
        pv.t += dt;
        if (pv.t >= pv.dur) {
          const chain = this.game.time - this.lastPivotT < 0.9 ? this.pivotChain + 1 : 1;
          this.pivotChain = chain;
          this.lastPivotT = this.game.time;
          const L = this.game.t;
          const deg = chain * 180;
          this.game.onTrick([{ name: L('butter') + ' ' + deg, pts: 90 * chain + (deg >= 360 ? 120 : 0) }]);
          this.pivot = null;
        }
      }
      // --- nose / tail press
      const pressIn = inp.press || 0;
      if (pressIn && speed > 2.5) {
        if (!this.press) { this.press = pressIn; this.pressT = 0; }
        this.pressT += dt;
      } else if (this.press) {
        if (this.pressT > 0.45) {
          const L = this.game.t;
          this.game.onTrick([{ name: (this.press > 0 ? L('nosePress') : L('tailPress')), pts: Math.round(80 + Math.min(this.pressT, 4) * 160) }]);
        }
        this.press = 0; this.pressT = 0;
      }

      // --- steering
      const turnRate = (2.1 + 1.6 / (1 + speed * 0.12)) * (surf === SURF.ICE ? 0.75 : 1);
      if (inp.aim != null) {
        const d = GS.angleTo(this.heading, inp.aim);
        this.heading += GS.clamp(d, -turnRate * dt, turnRate * dt) * Math.min(1, inp.aimStrength || 1);
      } else if (inp.steer) {
        const target = inp.steer > 0 ? Math.PI / 2 + 0.4 : -Math.PI / 2 - 0.4;
        let base = this.heading;
        if (this.switch) base = GS.wrapAngle(this.heading + Math.PI);
        base = GS.wrapAngle(base);
        // turn through the fall line unless the rider already faces uphill
        let d = target - base;
        if (Math.abs(d) > Math.PI + 1) d = GS.angleTo(base, target);
        const stepA = turnRate * Math.abs(inp.steer) * dt;
        const nb = base + GS.clamp(d, -stepA, stepA);
        this.heading = this.switch ? GS.wrapAngle(nb + Math.PI) : GS.wrapAngle(nb);
      }
      this.braking = GS.approach(this.braking, inp.brake ? 1 : 0, dt * 6);
      this.tuck = GS.approach(this.tuck, inp.tuck && !inp.brake ? 1 : 0, dt * 4);

      // ski axis in the tangent plane
      let fx = Math.sin(this.heading), fy = 0, fz = Math.cos(this.heading);
      let d = fx * n[0] + fz * n[2];
      fx -= d * n[0]; fy -= d * n[1]; fz -= d * n[2];
      let fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      // side axis = n × f
      const sx = n[1] * fz - n[2] * fy, sy = n[2] * fx - n[0] * fz, sz = n[0] * fy - n[1] * fx;
      let vf = this.vx * fx + this.vy * fy + this.vz * fz;
      let vs = this.vx * sx + this.vy * sy + this.vz * sz;
      this.switch = vf < -0.5 ? true : vf > 0.5 ? false : this.switch;

      // carving: the edges rotate the velocity towards the skis (no energy
      // gained or lost) up to the grip limit; the rest skids and scrubs speed
      const grip = sp.grip * (this.braking > 0.1 ? 0.35 : 1) * (this.pivot ? 0.05 : 1) * (this.press ? 0.7 : 1);
      const lat0 = vs;
      const sp0 = Math.hypot(vf, vs);
      if (sp0 > 0.05) {
        const fsign = vf < 0 ? -1 : 1;
        let th = Math.atan2(vs, Math.abs(vf));
        const rotMax = ((grip * 2.2) / Math.max(sp0, 2.5)) * dt;
        th -= GS.clamp(th, -rotMax, rotMax);
        vf = fsign * sp0 * Math.cos(th);
        vs = sp0 * Math.sin(th);
        // skidding (and the hockey stop) burns speed
        const skid = Math.abs(Math.sin(th));
        const loss = Math.min(sp0, (skid * (5 + this.braking * 9) + this.braking * 2.5) * dt);
        const k = (sp0 - loss) / sp0;
        vf *= k; vs *= k;
      }
      // gravity along the slope: the edge holds against its sideways part
      const gn = -G * n[1];
      const gax = -gn * n[0], gay = -G - gn * n[1], gaz = -gn * n[2];
      const hold = GS.clamp(grip / 8, 0.15, 1) * (this.braking > 0.1 ? 0.6 : 1);
      vf += (gax * fx + gay * fy + gaz * fz) * dt;
      vs += (gax * sx + gay * sy + gaz * sz) * dt * (1 - hold);
      vs *= Math.exp(-grip * 0.6 * dt);

      // friction & drag along the skis
      const mu = sp.mu + this.braking * 0.5;
      const fr = mu * G * n[1] * dt;
      if (Math.abs(vf) <= fr) vf = 0; else vf -= Math.sign(vf) * fr;
      const cda = 0.0062 * (1 - this.tuck * 0.32) + this.braking * 0.008 + sp.sink * 0.004;
      const sp2 = vf * vf + vs * vs;
      const dragA = cda * sp2 * dt;
      const spd = Math.sqrt(sp2) || 1;
      vf -= (vf / spd) * dragA;
      vs -= (vs / spd) * dragA;
      // deep powder bogs you down when slow
      if (sp.sink > 0 && Math.abs(vf) < 6) vf *= Math.exp(-sp.sink * 0.8 * dt);

      // skating/pushing on the flat
      if (inp.steer || inp.aim != null || inp.push) {
        if (Math.abs(vf) < 2.6 && Math.abs(n[1]) > 0.97) vf += Math.sign(vf || 1) * 2.2 * dt;
      }

      this.vx = vf * fx + vs * sx;
      this.vy = vf * fy + vs * sy;
      this.vz = vf * fz + vs * sz;

      // --- jump
      if (inp.jumpHeld) this.charge = Math.min(1, this.charge + dt * 2.2);
      this.crouch = GS.approach(this.crouch, inp.jumpHeld ? 0.9 : this.tuck * 0.85 + this.braking * 0.35, dt * 5);
      if (inp.jump) {
        const ch = inp.jumpCharge != null ? Math.max(inp.jumpCharge, this.charge) : this.charge;
        const pop = 3.3 + ch * 2.4;
        this.vx += n[0] * pop; this.vy += n[1] * pop; this.vz += n[2] * pop;
        this.charge = 0;
        this._takeoff(true);
        this.game.sfx('jump');
        this.x += this.vx * dt; this.y += this.vy * dt + 0.02; this.z += this.vz * dt;
        return;
      }
      if (!inp.jumpHeld) this.charge = Math.max(0, this.charge - dt * 3);

      // --- integrate & follow the ground
      const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
      const predY = this.y + this.vy * dt;
      const gy = T.heightAt(nx, nz);
      if (predY - gy > 0.035 && speed > 3) {
        // terrain falls away -> airborne
        this.x = nx; this.z = nz; this.y = predY;
        this._takeoff(false);
        return;
      }
      // steep wall ahead?
      const rise = (gy - this.y) / (Math.hypot(nx - this.x, nz - this.z) || 1e-3);
      if (rise > 1.9 && speed > 6) {
        this._doCrash('wall');
        return;
      }
      this.x = nx; this.z = nz; this.y = gy;
      // re-project velocity onto the new tangent plane, keep most of the speed
      const n2 = T.normalAt(this.x, this.z, this._n);
      const vn = this.vx * n2[0] + this.vy * n2[1] + this.vz * n2[2];
      const before = Math.hypot(this.vx, this.vy, this.vz);
      this.vx -= vn * n2[0]; this.vy -= vn * n2[1]; this.vz -= vn * n2[2];
      if (vn < 0) {
        const after = Math.hypot(this.vx, this.vy, this.vz) || 1;
        const keep = Math.min(before, after + (before - after) * 0.85) / after;
        this.vx *= keep; this.vy *= keep; this.vz *= keep;
      }

      // carve lean for animation
      const turnSign = GS.clamp(lat0 * 3 + (inp.steer || 0) * Math.min(1, speed / 8), -1, 1);
      const targetLean = -turnSign * Math.min(0.55, speed * 0.035) * (this.switch ? -1 : 1);
      this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);
      this.poleT += dt * (2 + speed * 0.2);

      this._collide(dt, speed);
      this._grindCheck();
      this._bounds();
      if (first) this._groundFx(sp, speed, surf);
      this.stats.dist += Math.hypot(this.vx, this.vz) * dt;
      // remember safe spots for respawns
      this.safeT += dt;
      if (this.safeT > 0.5 && speed > 1 && n2[1] > 0.7 && T.inBounds(this.x, this.z)) {
        this.safeT = 0;
        this.lastSafe = { x: this.x, z: this.z, h: Math.atan2(this.vx, this.vz) };
      }
      if (inp.slap) this._slap();
    }

    _takeoff(ollie) {
      this.mode = 'air';
      this.ground = false;
      this.spin = 0; this.flip = 0; this.spinV = 0; this.flipV = 0;
      this.grab = 0; this.grabT = 0;
      this.airT = 0;
      this.airStart = this.y;
      this.airPeak = this.y;
      this.flipQueue = 0;
      this.ollie = ollie;
      this.taps = 0;
      this.railTricks = null;
      this.grabsDone = [];
      this.grabCur = null;
      this.pivot = null;
      this.press = 0; this.pressT = 0;
    }

    // Ground style: power carves, powder slashes, switch riding.
    _styleTricks(dt, speed, sp, surf) {
      const L = this.game.t;
      if (Math.abs(this.lean) > 0.38 && speed > 11 && this.braking < 0.2) this.carveT += dt;
      else {
        if (this.carveT > 1.1) this.game.onTrick([{ name: L('powerCarve'), pts: Math.round(60 + this.carveT * 70) }]);
        this.carveT = 0;
      }
      const powder = surf === GS.Terrain.SURF.POWDER || surf === GS.Terrain.SURF.DEEP;
      if (powder && this.braking > 0.6 && speed > 9 && !this.slashed) {
        this.slashed = true;
        this.game.onTrick([{ name: L('powderSlash'), pts: 140 }]);
        const R = this.game.renderer;
        for (let k = 0; k < 40; k++) {
          R.emit(this.x, this.y + 0.2, this.z, this.vx * 0.5 + (Math.random() - 0.5) * 6, 2 + Math.random() * 4, this.vz * 0.5 + (Math.random() - 0.5) * 6, 1.2, 0.5, 1, 1, 1, 0.9, 6, 1.4, 1);
        }
      }
      if (this.braking < 0.2) this.slashed = false;
      if (this.switch && speed > 6) {
        this.switchT += dt;
        if (this.switchT > 4) {
          this.switchT = 0;
          this.game.onTrick([{ name: L('switchCruise'), pts: 110 }]);
        }
      } else this.switchT = Math.max(0, this.switchT - dt * 2);
      this.nearCd = Math.max(0, this.nearCd - dt);
    }

    // ---------- Air -----------------------------------------------------------
    _air(dt, inp, first) {
      const w = this.game.world, T = w.terrain;
      this.airT += dt;
      // gravity & light drag (ski jumpers get lift in the V-style)
      let lift = 0;
      if (this.game.skiJumpMode) {
        const v2 = this.vx * this.vx + this.vz * this.vz;
        lift = Math.min(G * 0.45, v2 * 0.0105);
      }
      this.vy -= (G - lift) * dt;
      const sp = Math.hypot(this.vx, this.vy, this.vz) || 1;
      const drag = 0.0028 * sp * sp * dt;
      this.vx -= (this.vx / sp) * drag; this.vy -= (this.vy / sp) * drag; this.vz -= (this.vz / sp) * drag;

      // spins
      const assist = GS.settings.assist !== false;
      const spinIn = inp.aim != null ? GS.clamp(GS.angleTo(this.heading + this.spin, inp.aim) * 2, -1, 1) * (inp.aimStrength || 1) : inp.steer || 0;
      if (spinIn) {
        this.spinV = GS.approach(this.spinV, spinIn * 7.8, dt * 26);
      } else if (assist && Math.abs(this.spin) > 0.6) {
        // snap to the nearest half rotation
        const target = Math.round(this.spin / Math.PI) * Math.PI;
        const d = target - this.spin;
        this.spinV = GS.approach(this.spinV, GS.clamp(d * 9, -7.8, 7.8), dt * 30);
      } else {
        this.spinV = GS.approach(this.spinV, 0, dt * 20);
      }
      this.spin += this.spinV * dt;

      // flips: hold (keyboard/gamepad) or queued swipes (touch)
      let flipIn = inp.flip || 0;
      if (inp.flipSwipe) this.flipQueue += inp.flipSwipe * Math.PI * 2;
      if (!flipIn && this.flipQueue) {
        flipIn = Math.sign(this.flipQueue);
      }
      if (flipIn) {
        this.flipV = GS.approach(this.flipV, flipIn * 6.6, dt * 24);
      } else if (assist && Math.abs(this.flip) > 0.8) {
        const target = Math.round(this.flip / (Math.PI * 2)) * Math.PI * 2;
        const d = target - this.flip;
        this.flipV = GS.approach(this.flipV, GS.clamp(d * 7, -6.6, 6.6), dt * 30);
      } else {
        this.flipV = GS.approach(this.flipV, 0, dt * 16);
      }
      const df = this.flipV * dt;
      this.flip += df;
      if (this.flipQueue) {
        const q = this.flipQueue;
        this.flipQueue -= df;
        if (Math.sign(this.flipQueue) !== Math.sign(q)) this.flipQueue = 0;
      }

      // grabs
      if (inp.grab) {
        if (!this.grabCur) {
          // grab choice: direction held picks the grab, a second grab in the same jump picks the variant
          const dirI = inp.grabType != null ? inp.grabType : (inp.steer || 0) < 0 ? 1 : (inp.steer || 0) > 0 ? 2 : 0;
          const idx = (dirI + (this.grabsDone.length % 2) * 3) % 6;
          const list = this.board ? GRABS_BOARD : GRABS;
          this.grabCur = { def: list[idx], t: 0 };
          this.grabType = list[idx].pose;
        }
        this.grab = GS.approach(this.grab, 1, dt * 8);
        if (this.grab > 0.6) { this.grabT += dt; this.grabCur.t += dt; }
      } else {
        if (this.grabCur) {
          if (this.grabCur.t > 0.18) this.grabsDone.push(this.grabCur);
          this.grabCur = null;
        }
        this.grab = GS.approach(this.grab, 0, dt * 7);
      }
      if (inp.slap) this._slap();

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      this.airPeak = Math.max(this.airPeak, this.y);
      this.crouch = GS.approach(this.crouch, 0.35 + this.grab * 0.4, dt * 4);
      this.lean = GS.approach(this.lean, 0, dt * 3);
      this._bounds();
      this._collide(dt, sp);
      if (this.mode !== 'air') return;
      this._grindCheck();
      if (this.mode !== 'air') return;

      const gy = T.heightAt(this.x, this.z);
      if (this.y <= gy) {
        this.y = gy;
        this._land(T);
      }
    }

    _land(T) {
      const n = T.normalAt(this.x, this.z, this._n || (this._n = [0, 0, 0]));
      const vn = this.vx * n[0] + this.vy * n[1] + this.vz * n[2];
      const yaw = this.heading + this.spin;
      const vdir = Math.atan2(this.vx, this.vz);
      const hsp = Math.hypot(this.vx, this.vz);
      let diff = Math.abs(GS.angleTo(yaw, vdir));
      const sw = diff > Math.PI / 2;
      if (sw) diff = Math.PI - diff;
      const flipErr = Math.abs(GS.wrapAngle(this.flip));
      const tolYaw = hsp < 4 ? Math.PI : 0.85;
      let ok = flipErr < 0.85 && diff < tolYaw && vn > -26 && this.grab < 0.75;
      if (this.game.skiJumpMode && flipErr < 0.85 && vn > -30) ok = true;
      // remove normal velocity, impact costs speed
      const loss = GS.clamp(-vn * 0.04, 0, 0.35);
      this.vx -= vn * n[0]; this.vy -= vn * n[1]; this.vz -= vn * n[2];
      this.vx *= 1 - loss; this.vy *= 1 - loss; this.vz *= 1 - loss;
      const airT = this.airT;
      this.maxAirT = Math.max(this.maxAirT, airT);
      this.stats.air += airT;
      if (!ok) {
        this._doCrash(flipErr >= 0.85 ? 'head' : this.grab >= 0.75 ? 'grab' : 'sideways');
        return;
      }
      if (this.grabCur && this.grabCur.t > 0.18) this.grabsDone.push(this.grabCur);
      this.grabCur = null;
      const tricks = this._scoreAir(airT, sw);
      if (tricks.length && diff < 0.14 && flipErr < 0.2) tricks.push({ name: this.game.t('perfectLanding'), pts: 100 });
      this.lastLanding = { spinDeg: Math.round(Math.abs(this.spin) / Math.PI) * 180, flips: Math.round(Math.abs(this.flip) / (Math.PI * 2)) };
      this.heading = GS.wrapAngle(yaw);
      this.switch = sw;
      this.mode = 'ski';
      this.ground = true;
      this.spin = 0; this.flip = 0; this.spinV = 0; this.flipV = 0; this.grab = 0;
      this.crouch = Math.min(1, 0.4 + -vn * 0.06);
      this.game.onLanding(airT, -vn, tricks);
      // landing spray
      const R = this.game.renderer;
      for (let k = 0; k < 14; k++) {
        R.emit(this.x, this.y + 0.1, this.z, (Math.random() - 0.5) * 5 + this.vx * 0.2, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 5 + this.vz * 0.2, 0.7, 0.35, 1, 1, 1, 0.85, 6, 0.8);
      }
    }

    // ---------- Trick scoring ------------------------------------------------------
    _scoreAir(airT, sw) {
      const tricks = [];
      const spinDeg = Math.round(Math.abs(this.spin) / Math.PI) * 180;
      const flips = Math.round(Math.abs(this.flip) / (Math.PI * 2));
      const L = this.game.t;
      let name = '';
      let pts = 0;
      const pre = flips === 2 ? L('double') + ' ' : flips === 3 ? L('triple') + ' ' : flips > 3 ? flips + 'x ' : '';
      if (flips > 0 && spinDeg >= 180) {
        // off-axis combinations
        const base = this.flip > 0 ? 'Misty' : spinDeg % 360 === 180 ? 'Rodeo' : 'Cork';
        name = pre + base + ' ' + spinDeg;
        pts += flips * 520 + (spinDeg / 180) * 140 + 220;
      } else if (flips > 0) {
        name = pre + (this.flip > 0 ? L('frontflip') : L('backflip'));
        pts += flips * 520;
      } else if (spinDeg >= 180) {
        name = String(spinDeg);
        pts += (spinDeg / 180) * 130;
      }
      for (const gdone of this.grabsDone) {
        const tweak = gdone.t > 1.1;
        const gname = (tweak ? L('tweaked') + ' ' : '') + L('grab_' + gdone.def.n);
        name += (name ? ' ' : '') + gname;
        pts += 140 + Math.min(gdone.t, 3) * 220 + (tweak ? 120 : 0);
      }
      if (!name && this.ollie && airT > 0.45) {
        name = L('ollie');
        pts = 40;
      }
      if (name) {
        if (sw) name = L('switch') + ' ' + name;
        tricks.push({ name, pts: Math.round(pts * (sw ? 1.2 : 1)) });
      }
      if (airT > 1.1) {
        const dropH = this.airPeak - this.y;
        tricks.push({ name: dropH > 9 ? L('cliffDrop') : L('bigAir'), pts: Math.round(airT * 90 + Math.max(0, dropH) * 12) });
      }
      return tricks;
    }

    // ---------- Rails ----------------------------------------------------------------
    _grindCheck() {
      const w = this.game.world;
      if (!w.grinds.length) return;
      for (const g of w.grinds) {
        const dx = g.bx - g.ax, dz = g.bz - g.az;
        const t = ((this.x - g.ax) * dx + (this.z - g.az) * dz) / (g.len * g.len);
        if (t < 0.02 || t > 0.97) continue;
        const px = g.ax + dx * t, pz = g.az + dz * t;
        const lat = Math.hypot(this.x - px, this.z - pz);
        if (lat > (g.kind === 'box' ? 0.6 : 0.45)) continue;
        const ry = GS.lerp(g.ay, g.by, t);
        if (this.y < ry - 0.3 || this.y > ry + 0.7) continue;
        if (this.mode === 'air' && this.vy > 1.5) continue;
        const hs = Math.hypot(this.vx, this.vz);
        if (hs < 2) continue;
        const along = (this.vx * dx + this.vz * dz) / g.len;
        if (Math.abs(along) < hs * 0.55) continue;
        this.mode = 'grind';
        this.rail = { g, t, v: along, dir: Math.sign(along), time: 0 };
        const rail = Math.atan2(dx, dz);
        const rel = Math.abs(GS.angleTo(this.heading + this.spin, rail));
        this.rail.slide = rel > 0.6 && rel < Math.PI - 0.6;
        this.rail.lip = this.rail.slide && GS.angleTo(this.heading + this.spin, rail) < 0;
        this.rail.switchIn = Math.abs(GS.angleTo(Math.atan2(this.vx, this.vz), this.heading + this.spin)) > Math.PI / 2 + 0.3 && !this.rail.slide;
        this.heading = this.heading + this.spin;
        this.spin = 0; this.flip = 0; this.spinV = 0; this.flipV = 0;
        this.y = ry;
        this.game.sfx('grind');
        return;
      }
    }

    _grind(dt, inp) {
      const r = this.rail, g = r.g;
      const slope = (g.ay - g.by) / g.len;
      r.v += Math.sign(r.v) * (slope * G * r.dir - 0.25) * dt;
      r.t += (r.v * dt) / g.len;
      r.time += dt;
      this.x = GS.lerp(g.ax, g.bx, r.t);
      this.z = GS.lerp(g.az, g.bz, r.t);
      this.y = GS.lerp(g.ay, g.by, r.t);
      const dx = (g.bx - g.ax) / g.len, dz = (g.bz - g.az) / g.len, dy = (g.by - g.ay) / g.len;
      this.vx = dx * r.v; this.vz = dz * r.v; this.vy = dy * r.v;
      // balance wobble
      this.lean = Math.sin(r.time * 7) * 0.12;
      this.crouch = 0.45;
      const off = r.t > 1 || r.t < 0 || Math.abs(r.v) < 0.5;
      if (off || inp.jump) {
        const L = this.game.t;
        const pts = Math.round(120 + r.time * 260 * (r.slide ? 1.4 : 1));
        let name = (r.switchIn ? L('switch') + ' ' : '') + (g.kind === 'box' ? L('box') : L('rail')) + ' ' + (r.slide ? (r.lip ? L('lipslide') : L('slide')) : '50-50');
        if (inp.jump && inp.steer) name += ' ' + L('spinOut');
        this.game.onTrick([{ name, pts: Math.round(pts * (r.switchIn ? 1.2 : 1) + (inp.jump && inp.steer ? 120 : 0)) }]);
        this.rail = null;
        if (inp.jump) { this.vy += 3.4; if (inp.steer) this.spinV = inp.steer * 7.8; }
        this._takeoff(!!inp.jump);
        this.y += 0.05;
      }
    }

    // ---------- Collisions --------------------------------------------------------------
    _collide(dt, speed) {
      const w = this.game.world, T = w.terrain;
      const px = this.x, pz = this.z, py = this.y;
      let hit = null, near = null;
      w.forObstacles(px, pz, 3, (o) => {
        if (o.kind === 'house') {
          const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
          const lx = (px - o.x) * c - (pz - o.z) * s;
          const lz = (px - o.x) * s + (pz - o.z) * c;
          if (Math.abs(lx) < o.hx + 0.3 && Math.abs(lz) < o.hz + 0.3) {
            const gy = T.rawHeight(o.x, o.z);
            if (py < gy + o.top) { hit = o; return true; }
          }
          return false;
        }
        const d = Math.hypot(px - o.x, pz - o.z);
        if (d < o.r + 0.32) {
          const gy = T.rawHeight(o.x, o.z);
          if (py < gy + o.top - 0.2) { hit = o; return true; }
        } else if (d < o.r + 1.15 && speed > 11 && !this.nearCd && (o.kind === 'tree' || o.kind === 'rock') && o.nearT !== this.game.time) {
          near = o;
        }
        return false;
      });
      if (!hit && near && this.mode === 'ski') {
        this.nearCd = 0.9;
        this.game.onTrick([{ name: this.game.t('nearMiss'), pts: 70 }]);
      }
      if (!hit) return;
      const hs = Math.hypot(this.vx, this.vz);
      if (hs < 5.5 || hit.kind === 'house') {
        // bump: push out and stop
        let nx, nz;
        if (hit.kind === 'house') {
          nx = px - hit.x; nz = pz - hit.z;
        } else {
          nx = px - hit.x; nz = pz - hit.z;
        }
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) { this.vx -= vn * nx * 1.3; this.vz -= vn * nz * 1.3; }
        this.x += nx * 0.08; this.z += nz * 0.08;
        if (hs > 9 && hit.kind === 'house') this._doCrash('house');
        else if (hs > 2) this.game.sfx('bump');
        return;
      }
      this._doCrash(hit.kind);
    }

    _bounds() {
      const w = this.game.world;
      const m = 70;
      if (this.x < m) { this.x = m; this.vx = Math.abs(this.vx) * 0.3; }
      if (this.x > w.W - m) { this.x = w.W - m; this.vx = -Math.abs(this.vx) * 0.3; }
      if (this.z < 8) { this.z = 8; this.vz = Math.abs(this.vz) * 0.3; }
      if (this.z > w.L - 8) { this.z = w.L - 8; this.vz = -Math.abs(this.vz) * 0.3; }
    }

    _slap() {
      const w = this.game.world, T = w.terrain;
      if (this.game.time - this.lastTreeTap < 0.35) return;
      let best = null, bd = 9;
      w.forObstacles(this.x, this.z, 4, (o) => {
        if (o.kind !== 'tree' && o.kind !== 'rock' && o.kind !== 'post') return false;
        const d = Math.hypot(this.x - o.x, this.z - o.z) - o.r;
        if (d < 3.2 && d < bd) {
          const gy = T.rawHeight(o.x, o.z);
          if (this.y < gy + o.top + 1.6) { bd = d; best = o; }
        }
        return false;
      });
      if (!best) return;
      if (best.tapped && this.game.time - best.tapped < 3) return;
      best.tapped = this.game.time;
      this.lastTreeTap = this.game.time;
      const L = this.game.t;
      const top = this.mode === 'air' && this.y > T.rawHeight(best.x, best.z) + best.top * 0.6;
      const name = best.kind === 'tree' ? (top ? L('treeTopTap') : L('treeTap')) : L('tap');
      this.game.onTrick([{ name, pts: top ? 320 : 180, tree: best.kind === 'tree' }]);
      this.game.sfx('tap');
      GS.haptic('light');
      const R = this.game.renderer;
      const gy = T.rawHeight(best.x, best.z);
      for (let k = 0; k < 18; k++) {
        R.emit(best.x + (Math.random() - 0.5) * 2, gy + 1 + Math.random() * best.top, best.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2, 1.4, 0.3, 1, 1, 1, 0.9, 3, 0.2);
      }
    }

    _doCrash(kind) {
      if (this.mode === 'crash') return;
      this.mode = 'crash';
      this.crashT = 0;
      this.crashKind = kind;
      this.rail = null;
      this.combo.active = false;
      this.combo.pts = 0;
      this.combo.mult = 0;
      this.combo.tricks = [];
      this.game.onCrash(kind);
      const hs = Math.hypot(this.vx, this.vz);
      if (kind === 'tree' || kind === 'rock' || kind === 'post' || kind === 'pylon' || kind === 'wall' || kind === 'house') {
        this.vx *= -0.15; this.vz *= -0.15;
      }
      this.vy = Math.max(this.vy, 0);
      const R = this.game.renderer;
      for (let k = 0; k < 30; k++) {
        R.emit(this.x, this.y + 0.3, this.z, (Math.random() - 0.5) * 6 + this.vx * 0.3, 1 + Math.random() * 3, (Math.random() - 0.5) * 6 + this.vz * 0.3, 1, 0.45, 1, 1, 1, 0.9, 7, 1.2);
      }
      void hs;
    }

    _crash(dt) {
      const T = this.game.world.terrain;
      this.crashT += dt;
      const gy = T.heightAt(this.x, this.z);
      if (this.y > gy + 0.05) {
        this.vy -= G * dt;
        this.y += this.vy * dt;
        if (this.y < gy) { this.y = gy; this.vy = 0; }
      } else {
        this.y = gy;
        const n = T.normalAt(this.x, this.z, this._n || (this._n = [0, 0, 0]));
        this.vx += n[0] * n[1] * G * dt * 0.5;
        this.vz += n[2] * n[1] * G * dt * 0.5;
        const f = Math.exp(-2.2 * dt);
        this.vx *= f; this.vz *= f;
      }
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this._bounds();
      if (this.crashT > 1.7) this.recover();
    }

    recover() {
      const T = this.game.world.terrain;
      let x = this.x, z = this.z;
      const slope = T.slopeAt(x, z);
      let blocked = false;
      this.game.world.forObstacles(x, z, 3, (o) => {
        if (Math.hypot(o.x - x, o.z - z) < o.r + 1.2 || o.kind === 'house') { blocked = true; return true; }
        return false;
      });
      let h = Math.atan2(this.vx, this.vz);
      if (slope > 0.9 || blocked || !T.inBounds(x, z)) {
        x = this.lastSafe.x; z = this.lastSafe.z; h = this.lastSafe.h;
      }
      const n = T.normalAt(x, z, [0, 0, 0]);
      // face across the fall line to start calmly
      const fall = Math.atan2(-n[0], -n[2]);
      if (!isFinite(h) || Math.hypot(this.vx, this.vz) < 0.5) h = Math.atan2(n[0] || 0.0001, n[2] || 1);
      void fall;
      this.x = x; this.z = z; this.y = T.heightAt(x, z);
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.heading = isFinite(h) ? h : 0;
      this.mode = 'ski';
      this.flip = 0; this.spin = 0; this.grab = 0; this.lean = 0;
      this.game.onRecover();
    }

    // ---------- Effects -------------------------------------------------------------------
    _groundFx(sp, speed, surf) {
      const R = this.game.renderer;
      // tracks
      this.trackAcc += speed / 120;
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      if (this.trackAcc > 0.45 && speed > 0.8) {
        this.trackAcc = 0;
        const px = hz, pz = -hx; // perpendicular
        const cur = { x: this.x, y: this.y + 0.02, z: this.z, px, pz };
        const prev = this.prevTrackL;
        if (prev && Math.hypot(prev.x - cur.x, prev.z - cur.z) < 3) {
          const kind = this.board || sp.sink > 0.2 ? 1 : 0;
          R.addTrack(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z, prev.px, prev.pz, cur.px, cur.pz, this.board ? 0.2 : 0.24, kind);
        }
        this.prevTrackL = cur;
      }
      // snow spray from edges
      const lat = Math.abs(this.lean) * speed;
      const amount = (lat * 0.25 + this.braking * speed * 0.5) * sp.spray + (sp.sink > 0 ? speed * 0.12 * sp.sink * 3 : 0);
      this.sprayAcc += amount * (1 / 60);
      while (this.sprayAcc > 1) {
        this.sprayAcc -= 1;
        const side = Math.sign(this.lean || 1);
        const ox = hz * side * 0.4, oz = -hx * side * 0.4;
        R.emit(this.x + ox, this.y + 0.1, this.z + oz,
          this.vx * 0.35 + ox * 3 + (Math.random() - 0.5) * 2, 1.2 + Math.random() * 2, this.vz * 0.35 + oz * 3 + (Math.random() - 0.5) * 2,
          0.55 + Math.random() * 0.3, 0.22 + Math.random() * 0.2, 1, 1, 1, 0.8, 5, 0.9, 1.2);
      }
    }

    // ---------- Combos ----------------------------------------------------------------------
    addTricks(tricks) {
      const c = this.combo;
      for (const t of tricks) {
        c.pts += t.pts;
        c.mult += 1;
        c.tricks.push(t.name);
      }
      c.active = true;
      c.t = 0;
    }

    _comboTick(dt) {
      const c = this.combo;
      if (!c.active) return;
      if (this.mode === 'ski') c.t += dt;
      if (c.t > 2.6) {
        const total = c.pts * Math.max(1, c.mult);
        this.game.onComboBank(total, c.mult, c.tricks.slice());
        c.active = false; c.pts = 0; c.mult = 0; c.tricks = []; c.t = 0;
      }
    }

    // ---------- Lifts ----------------------------------------------------------------------
    boardLift(l) {
      this.mode = 'lift';
      this.lift = { l, k: -1, wait: true, t: 0 };
      this.vx = this.vy = this.vz = 0;
      this.prevTrackL = null;
      this.combo.active = false;
    }

    _lift(dt, inp) {
      const st = this.lift, l = st.l, w = this.game.world;
      st.t += dt;
      if (st.wait) {
        // stand at the station until the next chair passes the start
        const st0 = l.B;
        this.x = GS.lerp(this.x, st0.x + l.side.x * 2.6, Math.min(1, dt * 3));
        this.z = GS.lerp(this.z, st0.z + l.side.z * 2.6, Math.min(1, dt * 3));
        this.y = w.terrain.heightAt(this.x, this.z);
        this.heading = l.yaw;
        for (let k = 0; k < l.count; k++) {
          const q = w.chairQ(l, k);
          if (q >= 0 && q < 0.6 + l.speed * l.boost * dt * 2) {
            st.k = k;
            st.wait = false;
            this.game.sfx('chair');
            break;
          }
        }
        if (st.t > 8 && st.wait) { st.k = 0; st.wait = false; }
        return;
      }
      const q = w.chairQ(l, st.k);
      const tmp = this._tmp || (this._tmp = {});
      w.cableAt(l, q, tmp);
      if (!tmp.up || tmp.u > l.len - 3) {
        this.exitLift();
        return;
      }
      this.heading = l.yaw;
      if (l.type === 'tbar') {
        this.x = tmp.x; this.z = tmp.z;
        this.y = w.terrain.heightAt(this.x, this.z);
      } else {
        this.x = tmp.x; this.z = tmp.z;
        this.y = tmp.y - l.cfg.hang + (l.type === 'gondola' ? -0.3 : 0.05) - (l.type === 'gondola' ? 0 : 0.5);
      }
      l.boost = inp.boost ? 6 : 2.4;
    }

    exitLift() {
      const st = this.lift;
      const l = st.l;
      l.boost = 1;
      const e = this.game.world.liftExit(l);
      this.lift = null;
      this.mode = 'ski';
      this.x = e.x; this.z = e.z; this.y = e.y;
      this.heading = 0;
      this.vx = 0; this.vy = 0; this.vz = 1.5;
      this.prevTrackL = null;
      this.game.onLiftExit(l);
    }

    // ---------- Zipline ---------------------------------------------------------------------
    startZip(z) {
      this.mode = 'zip';
      this.zip = { z, t: 0.01, v: 2 };
      this.prevTrackL = null;
    }

    _zip(dt) {
      const st = this.zip, z = st.z, w = this.game.world;
      const slope = (z.ay - z.by) / z.len;
      st.v = Math.min(27, st.v + (slope * G * 0.95 - 0.004 * st.v * st.v) * dt);
      st.t += (st.v * dt) / z.len;
      const p = w.zipAt(z, Math.min(st.t, 1), this._tmp || (this._tmp = {}));
      this.x = p.x; this.z = p.z; this.y = p.y - 1.75;
      const dx = (z.bx - z.ax) / z.len, dz = (z.bz - z.az) / z.len;
      this.heading = Math.atan2(dx, dz);
      this.vx = dx * st.v; this.vz = dz * st.v; this.vy = -slope * st.v;
      if (st.t >= 0.985) {
        this.zip = null;
        this._takeoff(false);
        this.vy = 1;
        this.game.onZipEnd();
      }
    }

    // ---------- Paragliding ---------------------------------------------------------------
    startGlide(l) {
      this.mode = 'glide';
      this.glide = { roll: 0, v: 11, t: 0 };
      this.x = l.x; this.z = l.z; this.y = l.y + 1.2;
      this.heading = 0;
      this.vx = 0; this.vz = 11; this.vy = 0;
      this.prevTrackL = null;
    }

    _glide(dt, inp) {
      const g = this.glide, w = this.game.world, T = w.terrain;
      g.t += dt;
      let turn = inp.steer || 0;
      if (inp.aim != null) turn = GS.clamp(GS.angleTo(this.heading, inp.aim) * 1.5, -1, 1);
      g.roll = GS.approach(g.roll, turn * 0.45, dt * 2);
      this.heading += g.roll * 1.9 * dt;
      const brake = inp.brake ? 1 : 0;
      const tv = brake ? 7.5 : 11.5;
      g.v = GS.approach(g.v, tv, dt * 2);
      const sink = 1.15 + brake * 1.6 + Math.abs(g.roll) * 0.9;
      // ridge lift near steep terrain facing the wind
      const env = this.game.env;
      const gh = T.heightAt(this.x, this.z);
      const agl = this.y - gh;
      const ridge = T.slopeAt(this.x, this.z) > 0.6 && agl < 40 ? 0.9 : 0;
      this.vx = Math.sin(this.heading) * g.v + env.windX * 0.6;
      this.vz = Math.cos(this.heading) * g.v + env.windZ * 0.6;
      this.vy = -sink + ridge + (this.game.thermalAt ? this.game.thermalAt(this.x, this.z) : 0);
      this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
      this._bounds();
      if (this.y <= T.heightAt(this.x, this.z) + 0.15) {
        this.y = T.heightAt(this.x, this.z);
        this.glide = null;
        this.mode = 'ski';
        this.vx *= 0.6; this.vz *= 0.6; this.vy = 0;
        this.game.onGlideLand(this.x, this.z);
        return;
      }
      // tree crash while flying low
      let hit = false;
      w.forObstacles(this.x, this.z, 2, (o) => {
        if (o.kind === 'tree' && Math.hypot(o.x - this.x, o.z - this.z) < o.r + 0.6 && this.y < T.rawHeight(o.x, o.z) + o.top) { hit = true; return true; }
        return false;
      });
      if (hit) {
        this.glide = null;
        this.mode = 'ski';
        this._doCrash('tree');
      }
    }

    // ---------- Pose for rendering -----------------------------------------------------------
    pose() {
      const p = this._pose || (this._pose = {});
      p.x = this.x; p.y = this.y; p.z = this.z;
      p.board = this.board;
      p.speed = this.speed;
      p.wave = this.game.time;
      p.sit = false; p.hang = false; p.wing = false; p.crash = false; p.arms = null; p.tuck = false;
      p.flip = 0; p.roll = 0; p.lean = 0; p.grab = 0; p.grabType = this.grabType; p.press = 0;
      p.yaw = this.heading;
      p.crouch = this.crouch;
      p.poleT = this.poleT;
      switch (this.mode) {
        case 'air':
          p.yaw = this.heading + this.spin;
          p.flip = this.flip;
          p.grab = this.grab;
          p.arms = this.board ? 'wide' : 'poles';
          if (this.game.skiJumpMode) { p.tuck = true; p.crouch = 0.1; p.arms = 'back'; }
          break;
        case 'grind':
          p.yaw = this.heading + (this.rail && this.rail.slide ? Math.PI / 2 : 0);
          p.lean = this.lean;
          p.arms = 'wide';
          break;
        case 'crash':
          p.crash = true; p.crashT = this.crashT; p.arms = 'wide';
          break;
        case 'lift':
          if (this.lift && !this.lift.wait && this.lift.l.type !== 'tbar') { p.sit = true; p.crouch = 0; }
          break;
        case 'zip':
          p.hang = true; p.crouch = 0.6;
          break;
        case 'glide':
          p.sit = true; p.wing = true; p.wingRoll = this.glide ? -this.glide.roll : 0; p.roll = this.glide ? -this.glide.roll * 0.6 : 0;
          break;
        default:
          p.lean = this.lean;
          p.tuck = this.tuck > 0.5;
          p.press = this.press;
          if (this.braking > 0.3) p.yaw = this.heading + (this.board ? 0 : 0.0);
      }
      return p;
    }
  }

  GS.Player = Player;
  GS.SURF_PROPS = SURF_PROPS;
})(window.GS);
