'use strict';
// Snowboarder physics. One button: press on the ground to jump, hold in the
// air to backflip. Landing angle decides between perfect, clean, sketchy and a
// crash. Events (jump, land, crash, …) are queued for the game to score.
(function (AR) {
  const P = AR.PHYS;
  const DT = 1 / 120;
  const DEG = Math.PI / 180;

  class Rider {
    constructor(world, opts) {
      opts = opts || {};
      this.world = world;
      this.x = world.startX;
      this.y = world.groundAt(this.x);
      this.vx = 0;
      this.vy = 0;
      this.v = 0;
      this.mode = 'ground';
      this.angle = world.angleAt(this.x);
      this.airTime = 0;
      this.airRot = 0;
      this.spinDelay = 0;
      this.jumped = false;
      this.rail = null;
      this.railTime = 0;
      this.groundTime = 0;
      this.shieldT = 0;
      this.magnetT = 0;
      this.invulnT = 0;
      this.crashT = 0;
      this.crashReason = '';
      this.body = null;
      this.board = null;
      this.balance = (opts.balance || 0) * DEG;
      this.events = [];
      this.anim = 0;
      this.spinning = false;
      this.lastGroundAngle = this.angle;
      this.takeoffAngle = this.angle;
    }

    get alive() {
      return this.mode === 'ground' || this.mode === 'air' || this.mode === 'rail';
    }

    // Camera / effects anchor: follows the tumbling body after a crash.
    get focusX() { return this.body ? this.body.x : this.x; }
    get focusY() { return this.body ? this.body.y : this.y; }

    get speed() {
      if (this.mode === 'air') return Math.hypot(this.vx, this.vy);
      return this.v;
    }

    update(dt, input) {
      this.anim += dt;
      this.shieldT = Math.max(0, this.shieldT - dt);
      this.magnetT = Math.max(0, this.magnetT - dt);
      this.invulnT = Math.max(0, this.invulnT - dt);
      const n = Math.max(1, Math.ceil(dt / DT));
      const h = dt / n;
      let press = input.press;
      for (let i = 0; i < n; i++) {
        this.step(h, press, input.hold);
        press = false;
      }
    }

    step(h, press, hold) {
      switch (this.mode) {
        case 'ground': return this.stepGround(h, press);
        case 'air': return this.stepAir(h, press, hold);
        case 'rail': return this.stepRail(h, press);
        case 'crash':
        case 'fall':
        case 'caught':
          return this.stepCrash(h);
        default:
      }
    }

    // The pop is mostly upwards (tilted a little with the slope), so jumping
    // off an uphill ramp does not throw the rider backwards.
    jumpFrom(theta, speed) {
      const nx = Math.sin(theta) * 0.35;
      const inv = 1 / Math.hypot(nx, 1);
      this.vx = speed * Math.cos(theta) + P.JUMP * nx * inv;
      this.vy = speed * Math.sin(theta) - P.JUMP * inv;
      this.toAir(true);
      this.events.push({ type: 'jump' });
    }

    toAir(jumped) {
      this.mode = 'air';
      this.airTime = 0;
      this.airRot = 0;
      this.jumped = jumped;
      this.spinDelay = 0.14;
      this.takeoffAngle = this.angle;
      this.rail = null;
    }

    stepGround(h, press) {
      const w = this.world;
      const th = w.angleAt(this.x);
      this.lastGroundAngle = th;
      let v = this.v + (P.G * Math.sin(th) - P.MU * P.G * Math.cos(th) - P.DRAG * this.v * Math.abs(this.v)) * h;
      // Booster ramps guarantee enough speed to clear what follows.
      for (const k of w.kickers) {
        if (this.x > k.x0 - 80 && this.x <= k.lipX && v < k.vmin) {
          v += (k.vmin - v) * Math.min(1, 9 * h);
          if (k.lipX - this.x < 30) v = k.vmin;
        }
      }
      this.v = AR.clamp(v, P.VMIN, P.VMAX);
      this.angle = th;
      this.groundTime += h;
      if (press) {
        this.jumpFrom(th, this.v);
        return;
      }
      const nx = this.x + this.v * Math.cos(th) * h;
      const by = this.y + this.v * Math.sin(th) * h + 0.5 * P.G * h * h;
      const gy = w.groundAt(nx);
      if (by < gy - 0.6) {
        // Terrain falls away faster than gravity pulls: take off.
        this.vx = this.v * Math.cos(th);
        this.vy = this.v * Math.sin(th) + P.G * h;
        this.x = nx;
        this.y = by;
        this.toAir(false);
        this.spinDelay = 0.08;
      } else {
        this.x = nx;
        this.y = gy;
      }
      this.checkRocks();
    }

    stepAir(h, press, hold) {
      const w = this.world;
      this.airTime += h;
      // Coyote jump: a press right after rolling off a crest still jumps.
      if (press && !this.jumped && this.airTime < 0.12) {
        const th = this.lastGroundAngle;
        const sp = this.vx * Math.cos(th) + this.vy * Math.sin(th);
        this.jumpFrom(th, sp);
        return;
      }
      const px = this.x;
      const py = this.y;
      this.vy += P.G * h;
      this.x += this.vx * h;
      this.y += this.vy * h;

      const gap = w.gapAt(this.x);
      const lookX = this.x + this.vx * 0.12;
      const lookGap = w.gapAt(lookX);
      const target = lookGap ? w.angleAt(lookGap.x1 + 30) : w.angleAt(lookX);
      this.spinning = hold && this.airTime > this.spinDelay;
      if (this.spinning) {
        const rot = -P.SPIN * h;
        this.angle += rot;
        this.airRot += rot;
      } else {
        // Self-righting towards the landing slope, the short way round and at
        // a capped rate, so a flip released too late still ends in a crash.
        const diff = AR.wrap(target - this.angle);
        const rot = AR.clamp(diff * (1 - Math.exp(-6 * h)), -2.6 * h, 2.6 * h);
        this.angle += rot;
        this.airRot += rot;
      }

      // Rails: land on them from above.
      for (const r of w.rails) {
        if (this.x < r.x0 || this.x > r.x1 || this.vy < 0) continue;
        const ry = r.y0 + ((this.x - r.x0) / (r.x1 - r.x0)) * (r.y1 - r.y0);
        const pry = r.y0 + ((px - r.x0) / (r.x1 - r.x0)) * (r.y1 - r.y0);
        if (py <= pry + 2 && this.y >= ry) {
          const ra = Math.atan2(r.y1 - r.y0, r.x1 - r.x0);
          if (Math.abs(AR.wrap(this.angle - ra)) < 1.0) {
            const flips = this.flipCount(ra);
            this.mode = 'rail';
            this.rail = r;
            this.railTime = 0;
            this.y = ry;
            this.v = AR.clamp(this.vx * Math.cos(ra) + this.vy * Math.sin(ra), 260, P.VMAX);
            this.angle = ra;
            this.events.push({ type: 'land', quality: 'clean', flips, airTime: this.airTime, rail: true });
            this.events.push({ type: 'railStart' });
            return;
          }
        }
      }

      if (gap) {
        if (this.y > gap.yFar + 320) this.crash('gap');
        return;
      }
      // Far wall of a crevasse.
      const pg = w.gapAt(px);
      if (pg && this.x >= pg.x1 && this.y > pg.yFar + 6) {
        this.crash('wall');
        return;
      }
      if (pg && this.x >= pg.x1) this.events.push({ type: 'gapCleared' });

      const gy = w.groundAt(this.x);
      if (this.y >= gy) this.land(gy);
      else this.checkRocks();
    }

    // Backflips relative to the slope: a jump off a kicker that lands on a
    // steeper slope needs less than 360° of rotation for a full flip.
    flipCount(landAngle) {
      const net = -this.airRot + (landAngle - this.takeoffAngle);
      return Math.max(0, Math.round(net / AR.TAU));
    }

    land(gy) {
      const th = this.world.angleAt(this.x);
      const diff = Math.abs(AR.wrap(this.angle - th));
      const clean = (24 * DEG) + this.balance;
      const sketchy = 55 * DEG + this.balance;
      const flips = this.flipCount(th);
      let quality;
      if (diff < 9 * DEG) quality = 'perfect';
      else if (diff <= clean) quality = 'clean';
      else if (diff <= sketchy) quality = 'sketchy';
      else if (this.invulnT > 0) quality = 'sketchy';
      else if (this.shieldT > 0) {
        quality = 'sketchy';
        this.shieldT = 0;
        this.events.push({ type: 'shieldSave' });
      } else {
        this.y = gy;
        this.crash('landing');
        return;
      }
      let v = this.vx * Math.cos(th) + this.vy * Math.sin(th);
      if (v > P.VSOFT) v = P.VSOFT + (v - P.VSOFT) * 0.3;
      if (quality === 'perfect') v = v * 1.05 + 30;
      if (quality === 'sketchy') v *= 0.6;
      this.v = AR.clamp(v, P.VMIN, P.VMAX);
      this.y = gy;
      this.angle = th;
      this.mode = 'ground';
      this.groundTime = 0;
      this.events.push({ type: 'land', quality, flips, airTime: this.airTime, impact: this.vy });
    }

    stepRail(h, press) {
      const r = this.rail;
      const ra = Math.atan2(r.y1 - r.y0, r.x1 - r.x0);
      this.v = AR.clamp(this.v + (P.G * Math.sin(ra) - 0.012 * P.G * Math.cos(ra) - P.DRAG * this.v * this.v) * h, 220, P.VMAX);
      this.railTime += h;
      this.angle = ra;
      this.lastGroundAngle = ra;
      if (press) {
        this.events.push({ type: 'railEnd', time: this.railTime });
        this.jumpFrom(ra, this.v);
        return;
      }
      this.x += this.v * Math.cos(ra) * h;
      if (this.x >= r.x1) {
        this.vx = this.v * Math.cos(ra);
        this.vy = this.v * Math.sin(ra);
        this.events.push({ type: 'railEnd', time: this.railTime });
        this.toAir(false);
        this.spinDelay = 0.05;
        return;
      }
      this.y = r.y0 + ((this.x - r.x0) / (r.x1 - r.x0)) * (r.y1 - r.y0);
    }

    checkRocks() {
      const ca = Math.sin(this.angle);
      const cb = Math.cos(this.angle);
      const bx = this.x + ca * 26;
      const by = this.y - cb * 26;
      for (const rk of this.world.rocks) {
        if (rk.smashed || Math.abs(rk.x - this.x) > rk.r + 60) continue;
        const cx = rk.x;
        const cy = rk.y - rk.r * 0.55;
        const hitFeet = Math.hypot(this.x - cx, this.y - cy) < rk.r + 6;
        const hitBody = Math.hypot(bx - cx, by - cy) < rk.r + 10;
        if (!hitFeet && !hitBody) continue;
        if (this.shieldT > 0 || this.invulnT > 0) {
          rk.smashed = true;
          this.events.push({ type: 'smash', x: cx, y: cy, shield: this.shieldT > 0 });
        } else {
          this.crash('rock');
          return;
        }
      }
    }

    crash(reason) {
      const vx = this.mode === 'air' ? this.vx : this.v * Math.cos(this.angle);
      const vy = this.mode === 'air' ? this.vy : this.v * Math.sin(this.angle);
      this.mode = reason === 'gap' ? 'fall' : 'crash';
      this.crashReason = reason;
      this.crashT = 0;
      const k = reason === 'wall' || reason === 'rock' ? -0.25 : 0.55;
      this.body = { x: this.x, y: this.y - 18, vx: vx * k, vy: Math.min(vy, 0) - 260, rot: this.angle, spin: reason === 'rock' ? -9 : 7 };
      this.board = { x: this.x, y: this.y, vx: vx * 0.75, vy: -420, rot: this.angle, spin: 13 };
      this.events.push({ type: 'crash', reason, x: this.x, y: this.y });
    }

    caught() {
      if (!this.alive) return;
      this.crash('avalanche');
      this.mode = 'caught';
      this.body.vx = 520;
      this.body.vy = -380;
    }

    stepCrash(h) {
      this.crashT += h;
      const w = this.world;
      for (const o of [this.body, this.board]) {
        if (!o) continue;
        o.vy += P.G * h;
        o.x += o.vx * h;
        o.y += o.vy * h;
        o.rot += o.spin * h;
        if (this.mode === 'fall' || w.gapAt(o.x)) continue;
        const gy = w.groundAt(o.x) - 8;
        if (o.y > gy) {
          o.y = gy;
          o.vy = -Math.abs(o.vy) * 0.32;
          o.vx *= 0.72;
          o.spin *= 0.6;
        }
      }
    }

    // Revive after a rewarded ad: put the rider back on safe ground ahead.
    revive() {
      const w = this.world;
      let x = Math.max(this.x, this.body ? this.body.x : this.x);
      for (let i = 0; i < 400; i++) {
        const bad = w.gapAt(x - 60) || w.gapAt(x) || w.gapAt(x + 260) ||
          w.rocks.some((r) => !r.smashed && r.x > x - 80 && r.x < x + 320) ||
          Math.abs(w.angleAt(x)) > 0.8;
        if (!bad) break;
        x += 20;
      }
      this.x = x;
      this.y = w.groundAt(x);
      this.angle = w.angleAt(x);
      this.v = 560;
      this.mode = 'ground';
      this.body = null;
      this.board = null;
      this.invulnT = 2.5;
      this.airRot = 0;
      this.groundTime = 0;
    }

    // Ballistic look-ahead used by the autopilot (attract mode, captures).
    predictLanding() {
      const w = this.world;
      let x = this.x;
      let y = this.y;
      let vx = this.vx;
      let vy = this.vy;
      const s = 1 / 60;
      for (let t = 0; t < 3; t += s) {
        vy += P.G * s;
        x += vx * s;
        y += vy * s;
        if (!w.gapAt(x) && y >= w.groundAt(x)) return { t, x, angle: w.angleAt(x) };
      }
      return { t: 3, x, angle: w.angleAt(x) };
    }
  }

  AR.Rider = Rider;
})(window.AR);
