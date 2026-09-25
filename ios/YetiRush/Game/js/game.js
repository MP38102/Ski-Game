'use strict';
(function (YR) {
  const A = YR.Art;
  const MAX_A = 1.45;
  const TURN_RATE = 4.4;
  const GRAVITY = 950;
  const FIRST_YETI_M = 1000;
  const TRICKS = ['spin', 'flip', 'grab'];
  const TRICK_TIME = 0.42;

  class Game {
    constructor(canvas, ui) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ui = ui;
      this.state = 'title';
      this.time = 0;
      this.flakes = [];
      for (let i = 0; i < 90; i++) {
        this.flakes.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, s: 0.4 + Math.random() * 0.6 });
      }
      this.resize();
      this.reset(true);
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const W = window.innerWidth, H = window.innerHeight;
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
      this.W = W;
      this.H = H;
      this.dpr = dpr;
      this.scale = Math.min(W, H) / (W > H ? 580 : 520);
      this.viewW = W / this.scale;
      this.viewH = H / this.scale;
      A.setScale(this.scale * dpr);
    }

    // ---------------------------------------------------------------------
    reset(attract) {
      this.attract = !!attract;
      this.autopilotOn = false;
      this.world = new YR.World((Math.random() * 1e9) | 0);
      this.s = {
        x: 0, y: 0, a: 0, target: 0, speed: attract ? 300 : 0, z: 0, vz: 0, air: false,
        trick: null, crashed: false, crashT: 0, blink: 0, turbo: 0, ice: 0, turn: 0,
        hearts: 3, airTricks: 0,
      };
      this.camX = 0;
      this.camY = -this.viewH * 0.3;
      this.camFrac = 0.3;
      this.tracks = [];
      this.particles = [];
      this.popups = [];
      this.bonus = 0;
      this.combo = 0;
      this.comboT = 0;
      this.stats = { crystals: 0, gates: 0, tricks: 0 };
      this.yeti = null;
      this.nextYetiM = FIRST_YETI_M;
      this.shake = 0;
      this.ended = false;
      this.lastHud = '';
      YR.Audio.setIntensity(0);
    }

    start() {
      this.reset(false);
      this.state = 'play';
      YR.Input.reset();
      this.ui.hud(this.hudData());
    }

    pause() {
      if (this.state !== 'play') return;
      this.state = 'paused';
      YR.Audio.setWind(0);
      this.ui.show('pause');
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'play';
      this.last = performance.now();
      YR.Input.reset();
      this.ui.show(null);
    }

    toTitle() {
      this.reset(true);
      this.state = 'title';
      YR.Audio.setWind(0);
    }

    get meters() { return Math.max(0, this.s.y / YR.UNITS_PER_M); }
    get score() { return Math.floor(this.meters + this.bonus); }
    get mult() { return Math.min(5, 1 + Math.floor(this.combo / 6)); }
    maxSpeed() { return 360 + Math.min(this.meters * 0.06, 300); }

    // ---------------------------------------------------------------------
    loop(ts) {
      const dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000));
      this.last = ts;
      if (this.state === 'play' || this.state === 'title') {
        this.time += dt;
        this.update(dt);
      }
      this.render();
      requestAnimationFrame(this.loop);
    }

    skierScreen() {
      return {
        x: (this.s.x - (this.camX - this.viewW / 2)) * this.scale,
        y: (this.s.y - this.camY) * this.scale,
      };
    }

    steerTarget(dt) {
      const s = this.s;
      if (this.attract || this.autopilotOn) return this.autopilot();
      const inp = YR.Input;
      if (inp.keys.left || inp.keys.right) {
        const dir = (inp.keys.right ? 1 : 0) - (inp.keys.left ? 1 : 0);
        return YR.clamp(s.target + dir * 3.2 * dt, -MAX_A, MAX_A);
      }
      if (inp.keys.down) return 0;
      if (YR.settings.control === 'tilt' && inp.tilt != null) {
        return YR.clamp(inp.tilt / 22, -1, 1) * MAX_A;
      }
      if (inp.touchX != null) {
        const sx = this.skierScreen().x;
        const range = Math.min(this.W, this.H) * 0.28;
        return YR.clamp((inp.touchX - sx) / range, -1, 1) * MAX_A;
      }
      return s.target;
    }

    // Simple lookahead AI for the title-screen demo run.
    autopilot() {
      const s = this.s;
      let best = 0, bestCost = Infinity;
      for (let a = -0.9; a <= 0.91; a += 0.15) {
        let cost = Math.abs(a) * 40 + Math.abs(a - s.target) * 20;
        for (const o of this.world.objs) {
          const dy = o.y - s.y;
          if (dy < 5 || dy > 320) continue;
          const px = s.x + Math.tan(a) * dy;
          const dx = Math.abs(px - o.x);
          if (o.type === 'crystal' && dx < 20) cost -= 30;
          else if (o.r && dx < o.r + 26) cost += 1000 * (1 - dy / 330);
          else if (o.type === 'gate') {
            if (Math.abs(px - o.x) < o.gap / 2 - 12) cost -= 60;
          }
        }
        if (cost < bestCost) { bestCost = cost; best = a; }
      }
      return best;
    }

    update(dt) {
      const s = this.s;
      const ms = this.maxSpeed();

      // Timers
      if (s.blink > 0) s.blink -= dt;
      if (s.turbo > 0) s.turbo -= dt;
      if (s.ice > 0) s.ice -= dt;
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this.combo = 0;
      }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);

      const prevY = s.y;

      if (s.crashed) {
        s.crashT -= dt;
        s.speed *= Math.pow(0.02, dt);
        s.x += Math.sin(s.a) * s.speed * dt;
        s.y += Math.cos(s.a) * s.speed * dt;
        if (s.crashT <= 0 && !this.ended) {
          if (s.hearts <= 0) return this.gameOver('crash');
          s.crashed = false;
          s.blink = 2;
          s.a = 0;
          s.target = 0;
          s.speed = 60;
          YR.Input.reset();
        }
      } else {
        const target = this.steerTarget(dt);
        s.target = target;
        const prevA = s.a;
        if (!s.air && s.ice <= 0) {
          const diff = target - s.a;
          const step = TURN_RATE * dt;
          s.a += Math.abs(diff) < step ? diff : Math.sign(diff) * step;
        }
        s.turn = YR.lerp(s.turn, (s.a - prevA) / Math.max(dt, 1e-3) / TURN_RATE, 0.2);

        const maxS = ms * (s.turbo > 0 ? 1.55 : 1);
        const c = Math.max(0, Math.cos(s.a));
        let tgt = maxS * Math.pow(c, 1.6);
        if (Math.abs(s.a) > 1.3) tgt = 0;
        let rate = tgt > s.speed ? 0.8 : 2.2;
        if (s.ice > 0) rate *= 0.3;
        if (s.air) rate = 0.05;
        s.speed += (tgt - s.speed) * Math.min(1, rate * dt);
        s.x += Math.sin(s.a) * s.speed * dt;
        s.y += Math.cos(s.a) * s.speed * dt;
        s.tuck = Math.abs(s.a) < 0.15 && s.speed > ms * 0.8;

        // Airborne
        if (s.air) {
          s.vz -= GRAVITY * dt;
          s.z += s.vz * dt;
          if (s.trick) {
            s.trick.p += dt / TRICK_TIME;
            if (s.trick.p >= 1) this.finishTrick();
          }
          if (!s.trick && YR.Input.consumeTap() && !this.attract) this.startTrick();
          if (s.z <= 0) this.land();
        } else {
          YR.Input.consumeTap();
        }

        // Spray when carving hard
        const carve = Math.abs(s.target - s.a) + Math.abs(s.turn) * 0.5;
        if (!s.air && s.speed > 120 && (carve > 0.35 || Math.abs(s.a) > 1.1)) {
          for (let i = 0; i < 2; i++) {
            this.particles.push({
              x: s.x - Math.sin(s.a) * 10 + YR.rand(-6, 6), y: s.y - Math.cos(s.a) * 6,
              vx: Math.cos(s.a) * Math.sign(s.a || 1) * YR.rand(-60, -10) + YR.rand(-20, 20),
              vy: YR.rand(-60, -10), life: YR.rand(0.3, 0.6), max: 0.6, r: YR.rand(2, 4.5), c: '#FFFFFF',
            });
          }
        }
        if (s.turbo > 0 && Math.random() < 0.6) {
          this.particles.push({ x: s.x + YR.rand(-10, 10), y: s.y - s.z - YR.rand(0, 30), vx: 0, vy: -80, life: 0.4, max: 0.4, r: YR.rand(1.5, 3), c: A.C.gold });
        }
      }

      // Tracks
      if (!s.air && !s.crashed) {
        const lt = this.tracks[this.tracks.length - 1];
        if (!lt || Math.hypot(lt.x - s.x, lt.y - s.y) > 7) this.tracks.push({ x: s.x, y: s.y, a: s.a });
      } else if (this.tracks.length && this.tracks[this.tracks.length - 1] !== null) {
        this.tracks.push(null);
      }
      if (this.tracks.length > 600) this.tracks.splice(0, this.tracks.length - 600);

      // Camera
      const spN = YR.clamp(s.speed / 700, 0, 1);
      const chased = this.yeti && this.yeti.state !== 'leave';
      this.camFrac = YR.lerp(this.camFrac, (chased ? 0.47 : 0.34) - spN * 0.1, 1 - Math.exp(-1.5 * dt));
      this.camX = YR.lerp(this.camX, s.x + Math.sin(s.a) * 60, 1 - Math.exp(-4 * dt));
      this.camY = s.y - this.viewH * this.camFrac;

      // World streaming
      const left = this.camX - this.viewW / 2 - 60;
      this.world.ensure(left, left + this.viewW + 120, this.camY - 60, this.camY + this.viewH + 480);
      this.world.prune(this.camY - 100);

      if (!s.crashed) this.collide(prevY);
      this.updateYeti(dt);

      // Particles & popups
      for (const p of this.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      if (this.particles.length > 300) this.particles.splice(0, this.particles.length - 300);
      for (const p of this.popups) p.t += dt;
      this.popups = this.popups.filter((p) => p.t < 1.1);

      if (this.state === 'play') {
        YR.Audio.setWind(s.crashed ? 0 : spN);
        const hd = this.hudData();
        const key = JSON.stringify(hd);
        if (key !== this.lastHud) {
          this.lastHud = key;
          this.ui.hud(hd);
        }
      }
    }

    hudData() {
      return {
        score: this.score,
        meters: Math.floor(this.meters),
        hearts: this.s.hearts,
        combo: this.combo,
        mult: this.mult,
      };
    }

    addCombo(n) {
      this.combo += n;
      this.comboT = 6;
    }

    popup(x, y, text, color, big) {
      this.popups.push({ x, y, text, color: color || '#1B3A5C', t: 0, big: !!big });
    }

    collide(prevY) {
      const s = this.s;
      const invuln = s.blink > 0 || this.attract || this.autopilotOn;
      for (const o of this.world.objs) {
        const dy = o.y - s.y;
        if (dy < -90 || dy > 90) continue;
        const dx = o.x - s.x;
        switch (o.type) {
          case 'crystal':
          case 'cocoa':
          case 'star':
            if (!o.taken && s.z < 60 && Math.hypot(dx, dy + (s.z > 0 ? 0 : 0)) < 22) this.pickup(o);
            break;
          case 'ramp':
            if (!s.air && Math.abs(dx) < 46 && dy > 8 && dy < 54) this.jump(260 + s.speed * 0.35);
            break;
          case 'mogul':
            if (!s.air && !o.hit && (dx * dx) / 900 + (dy * dy) / 170 < 1) {
              o.hit = true;
              s.speed *= 0.82;
              this.jump(110, true);
              if (!this.attract) YR.Audio.sfx.bump();
            }
            break;
          case 'ice':
            if (!s.air && (dx * dx) / 3700 + (dy * dy) / 650 < 1) {
              if (s.ice <= 0 && !this.attract) YR.Audio.sfx.ice();
              s.ice = 0.12;
            }
            break;
          case 'gate':
            if (!o.done && prevY < o.y && s.y >= o.y) {
              o.done = true;
              if (this.attract) break;
              if (Math.abs(dx) < o.gap / 2) {
                this.addCombo(2);
                this.stats.gates++;
                const pts = 100 * this.mult;
                this.bonus += pts;
                this.popup(o.x, o.y - 30, YR.t('gate') + ' +' + pts, o.color);
                YR.Audio.sfx.gate();
                YR.haptic('light');
              } else if (Math.abs(dx) < o.gap * 2.2) {
                this.combo = 0;
                this.popup(s.x, s.y - 50, YR.t('missed'), '#7C8898');
                YR.Audio.sfx.miss();
              }
            }
            break;
          default:
            if (o.r && !o.smashed && !s.air) {
              const d = Math.hypot(dx, dy * 1.3);
              if (d < o.r + 7) {
                if (s.turbo > 0) this.smash(o);
                else if (!invuln) this.crash();
              }
            }
        }
      }
    }

    pickup(o) {
      o.taken = true;
      if (this.attract) return;
      const s = this.s;
      if (o.type === 'crystal') {
        this.stats.crystals++;
        this.addCombo(1);
        const pts = 20 * this.mult;
        this.bonus += pts;
        this.popup(o.x, o.y - 30, '+' + pts, '#2F9BD8');
        YR.Audio.sfx.crystal(this.combo);
        for (let i = 0; i < 6; i++) {
          this.particles.push({ x: o.x, y: o.y - 14, vx: YR.rand(-80, 80), vy: YR.rand(-80, 40), life: 0.4, max: 0.4, r: 2, c: '#7FD3FF' });
        }
      } else if (o.type === 'cocoa') {
        if (s.hearts < 3) {
          s.hearts++;
          this.popup(o.x, o.y - 30, YR.t('extraLife'), A.C.red, true);
        } else {
          this.bonus += 250;
          this.popup(o.x, o.y - 30, '+250', A.C.red, true);
        }
        YR.Audio.sfx.heart();
        YR.haptic('success');
      } else if (o.type === 'star') {
        s.turbo = 4.5;
        this.popup(o.x, o.y - 30, YR.t('turbo'), '#E09A00', true);
        YR.Audio.sfx.turbo();
        YR.haptic('medium');
      }
    }

    smash(o) {
      o.smashed = true;
      this.bonus += 30;
      this.shake = 5;
      for (let i = 0; i < 14; i++) {
        this.particles.push({
          x: o.x + YR.rand(-10, 10), y: o.y - YR.rand(0, 30), vx: YR.rand(-200, 200), vy: YR.rand(-200, 50),
          life: 0.6, max: 0.6, r: YR.rand(2, 5), c: o.type === 'pine' || o.type === 'bush' ? A.C.pineA : o.type === 'rock' ? A.C.rockA : '#FFFFFF',
        });
      }
      YR.Audio.sfx.bump();
    }

    jump(vz, small) {
      const s = this.s;
      if (s.air) return;
      s.air = true;
      s.vz = vz;
      s.z = 0.01;
      s.airTricks = 0;
      s.small = !!small;
      if (!small && !this.attract) {
        YR.Audio.sfx.jump();
        YR.haptic('light');
      }
    }

    startTrick() {
      const s = this.s;
      if (s.small || s.z < 8) return;
      s.trick = { kind: TRICKS[s.airTricks % TRICKS.length], p: 0 };
      YR.Audio.sfx.trick();
    }

    finishTrick() {
      const s = this.s;
      s.airTricks++;
      this.stats.tricks++;
      this.addCombo(2);
      const pts = 150 * this.mult * s.airTricks;
      this.bonus += pts;
      const name = { spin: 'trickSpin', flip: 'trickFlip', grab: 'trickGrab' }[s.trick.kind];
      this.popup(s.x, s.y - s.z - 50, YR.t(name) + ' +' + pts, A.C.orange, true);
      YR.Audio.sfx.trickDone(this.combo);
      s.trick = null;
    }

    land() {
      const s = this.s;
      s.air = false;
      s.z = 0;
      s.vz = 0;
      if (s.trick && !this.attract) {
        // Landed mid-trick – wipeout!
        s.trick = null;
        this.crash();
        return;
      }
      s.trick = null;
      if (!s.small && !this.attract) {
        YR.Audio.sfx.land();
        YR.haptic('medium');
        if (s.airTricks > 0) {
          const pts = 50 * s.airTricks * this.mult;
          this.bonus += pts;
          this.popup(s.x, s.y - 70, YR.t('landed') + ' +' + pts, '#2A8A62');
        }
      }
      for (let i = 0; i < (s.small ? 3 : 10); i++) {
        this.particles.push({ x: s.x + YR.rand(-14, 14), y: s.y, vx: YR.rand(-90, 90), vy: YR.rand(-40, 10), life: 0.4, max: 0.4, r: YR.rand(2, 4), c: '#FFFFFF' });
      }
    }

    crash() {
      const s = this.s;
      if (s.crashed || this.attract) return;
      s.crashed = true;
      s.crashT = 1.3;
      s.air = false;
      s.z = 0;
      s.trick = null;
      s.hearts--;
      s.speed *= 0.4;
      this.combo = 0;
      this.shake = 12;
      YR.Audio.sfx.crash();
      YR.haptic('heavy');
      for (let i = 0; i < 24; i++) {
        this.particles.push({ x: s.x + YR.rand(-8, 8), y: s.y - YR.rand(0, 20), vx: YR.rand(-160, 160), vy: YR.rand(-160, 40), life: YR.rand(0.4, 0.9), max: 0.9, r: YR.rand(2, 6), c: '#FFFFFF' });
      }
    }

    updateYeti(dt) {
      const s = this.s;
      if (this.attract) return;
      if (!this.yeti) {
        if (this.meters >= this.nextYetiM) {
          this.yeti = {
            x: s.x + YR.rand(-200, 200), y: s.y - this.viewH * 1.1, state: 'chase', t: 0, dir: 1,
          };
          this.popup(s.x, s.y - 90, YR.t('yetiAwake'), A.C.red, true);
          YR.Audio.sfx.roar();
          YR.Audio.setIntensity(1);
          YR.haptic('heavy');
          this.ui.yetiWarning(true);
        }
        return;
      }
      const y = this.yeti;
      y.t += dt;
      const ms = this.maxSpeed();
      if (y.state === 'chase') {
        const spd = ms * Math.min(1.0, 0.72 + y.t * 0.012);
        const dx = s.x - y.x, dy = s.y - 10 - y.y;
        const d = Math.hypot(dx, dy) || 1;
        y.x += (dx / d) * spd * dt;
        y.y += (dy / d) * spd * dt;
        y.dir = dx < 0 ? -1 : 1;
        if (d < 26 && !(s.turbo > 0)) {
          y.state = 'eat';
          y.t = 0;
          s.crashed = true;
          s.crashT = 99;
          s.hidden = true;
          this.shake = 14;
          YR.Audio.sfx.chomp();
          YR.haptic('heavy');
          this.ui.yetiWarning(false);
          return;
        }
        if (s.y - y.y > this.viewH * 1.7 || y.t > 15) {
          y.state = 'leave';
          y.t = 0;
          this.bonus += 500;
          this.popup(s.x, s.y - 80, YR.t('yetiEscaped') + ' +500', '#2A8A62', true);
          YR.Audio.sfx.gate();
          this.ui.yetiWarning(false);
          YR.Audio.setIntensity(0);
        }
      } else if (y.state === 'leave') {
        y.x += y.dir * 300 * dt;
        y.y += 100 * dt;
        if (y.t > 3) {
          this.yeti = null;
          this.nextYetiM = this.meters + YR.rand(900, 1400);
        }
      } else if (y.state === 'eat') {
        y.x = YR.lerp(y.x, s.x, 0.2);
        y.y = YR.lerp(y.y, s.y, 0.2);
        if (y.t > 1.6 && !this.ended) this.gameOver('yeti');
      }
    }

    gameOver(reason) {
      this.ended = true;
      this.state = 'over';
      YR.Audio.setWind(0);
      YR.Audio.setIntensity(0);
      this.ui.yetiWarning(false);
      const score = this.score;
      const best = YR.store.get('best', 0);
      const isBest = score > best;
      if (isBest) YR.store.set('best', score);
      YR.store.set('bestDistance', Math.max(YR.store.get('bestDistance', 0), Math.floor(this.meters)));
      YR.store.set('runs', YR.store.get('runs', 0) + 1);
      if (isBest) YR.Audio.sfx.record();
      else YR.Audio.sfx.gameOver();
      this.ui.gameOver({
        reason,
        score,
        best: Math.max(best, score),
        isBest,
        meters: Math.floor(this.meters),
        ...this.stats,
      });
    }

    // ---------------------------------------------------------------------
    render() {
      const ctx = this.ctx;
      const sc = this.scale * this.dpr;
      const left = this.camX - this.viewW / 2;
      const top = this.camY;
      let shx = 0, shy = 0;
      if (this.shake > 0) {
        shx = YR.rand(-1, 1) * this.shake;
        shy = YR.rand(-1, 1) * this.shake;
      }
      ctx.setTransform(sc, 0, 0, sc, 0, 0);
      ctx.translate(-left + shx, -top + shy);

      // Snow texture
      const tile = A.snowTile();
      const T = 256;
      const tx0 = Math.floor(left / T) * T, ty0 = Math.floor(top / T) * T;
      for (let ty = ty0; ty < top + this.viewH + T; ty += T) {
        for (let tx = tx0; tx < left + this.viewW + T; tx += T) {
          ctx.drawImage(tile.c, tx, ty, T + 0.5, T + 0.5);
        }
      }

      const t = this.time;
      const objs = this.world.objs;
      const inView = (o, m) => o.y > top - m && o.y < top + this.viewH + m && o.x > left - 120 && o.x < left + this.viewW + 120;

      // Flat things first
      for (const o of objs) {
        if (!o.flat || !inView(o, 100)) continue;
        if (o.type === 'mogul') A.blit(ctx, A.mogul(o.v), o.x, o.y);
        else if (o.type === 'ice') A.blit(ctx, A.icePatch(o.v), o.x, o.y);
      }

      // Ski tracks
      this.drawTracks(ctx);

      // Sorted sprites
      const list = [];
      for (const o of objs) {
        if (o.flat || o.taken || !inView(o, 140)) continue;
        list.push(o);
      }
      if (!this.s.hidden) list.push({ type: 'skier', y: this.s.y + 0.5 });
      if (this.yeti) list.push({ type: 'yeti', y: this.yeti.y + 1 });
      // Ramps are drawn behind anything on their surface.
      const key = (o) => (o.type === 'ramp' ? o.y - 60 : o.y);
      list.sort((a, b) => key(a) - key(b));

      for (const o of list) {
        switch (o.type) {
          case 'pine': this.drawSmashable(ctx, o, A.pine(o.k, o.v)); break;
          case 'bush': this.drawSmashable(ctx, o, A.bush(o.k)); break;
          case 'rock': this.drawSmashable(ctx, o, A.rock(o.k, o.v)); break;
          case 'stump': this.drawSmashable(ctx, o, A.stump()); break;
          case 'snowman': this.drawSmashable(ctx, o, A.snowman()); break;
          case 'ramp': A.blit(ctx, A.ramp(), o.x, o.y); break;
          case 'gate':
            A.blit(ctx, A.flag(o.color), o.x - o.gap / 2, o.y);
            A.blit(ctx, A.flag(o.color), o.x + o.gap / 2, o.y);
            break;
          case 'crystal': A.crystal(ctx, o.x, o.y, t); break;
          case 'cocoa': A.cocoa(ctx, o.x, o.y, t); break;
          case 'star': A.star(ctx, o.x, o.y, t); break;
          case 'skier':
            A.skier(ctx, Object.assign({}, this.s, { blink: this.s.blink > 0 && !this.attract }), t);
            break;
          case 'yeti': A.yeti(ctx, this.yeti, t); break;
        }
      }

      // Particles
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, YR.TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Popups
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of this.popups) {
        const k = p.t / 1.1;
        const size = p.big ? 22 : 17;
        ctx.globalAlpha = 1 - k * k;
        ctx.font = `700 ${size * (1 + Math.max(0, 0.15 - p.t) * 3)}px Fredoka, ui-rounded, system-ui, sans-serif`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineJoin = 'round';
        ctx.strokeText(p.text, p.x, p.y - k * 40);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y - k * 40);
      }
      ctx.globalAlpha = 1;

      // Screen-space effects
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawSnowfall(ctx);
      this.drawSpeedLines(ctx);
      this.drawYetiIndicator(ctx);
      if (this.state === 'title') {
        const g = ctx.createLinearGradient(0, 0, 0, this.H);
        g.addColorStop(0, 'rgba(18,40,72,0.35)');
        g.addColorStop(0.5, 'rgba(18,40,72,0.12)');
        g.addColorStop(1, 'rgba(18,40,72,0.4)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.W, this.H);
      }
    }

    drawSmashable(ctx, o, spr) {
      if (o.smashed) return;
      A.blit(ctx, spr, o.x, o.y);
    }

    drawTracks(ctx) {
      const tr = this.tracks;
      if (tr.length < 2) return;
      ctx.strokeStyle = 'rgba(150, 178, 212, 0.45)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        let pen = false;
        for (const p of tr) {
          if (!p) { pen = false; continue; }
          const ox = Math.cos(p.a) * 4.2 * side, oy = -Math.sin(p.a) * 4.2 * side * 0.62;
          if (!pen) { ctx.moveTo(p.x + ox, p.y + oy); pen = true; }
          else ctx.lineTo(p.x + ox, p.y + oy);
        }
        ctx.stroke();
      }
    }

    drawSnowfall(ctx) {
      const s = this.s;
      const vx = -Math.sin(s.a) * s.speed * 0.25 * this.scale;
      const vy = 40 - Math.cos(s.a) * s.speed * 0.35 * this.scale;
      const dt = 1 / 60;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const f of this.flakes) {
        if (this.state === 'play' || this.state === 'title') {
          f.x += ((vx + Math.sin(this.time + f.y * 10) * 15) * f.s * dt) / this.W;
          f.y += (vy * f.s * dt) / this.H;
          if (f.y > 1.02) f.y -= 1.04;
          if (f.y < -0.02) f.y += 1.04;
          if (f.x > 1.02) f.x -= 1.04;
          if (f.x < -0.02) f.x += 1.04;
        }
        ctx.beginPath();
        ctx.arc(f.x * this.W, f.y * this.H, f.r * Math.max(1, this.scale * 0.8), 0, YR.TAU);
        ctx.fill();
      }
    }

    drawSpeedLines(ctx) {
      const s = this.s;
      const strength = s.turbo > 0 ? 1 : YR.clamp((s.speed - 520) / 200, 0, 1);
      if (strength <= 0 || s.crashed) return;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * strength})`;
      ctx.lineWidth = 2;
      const n = 14;
      for (let i = 0; i < n; i++) {
        const seed = i * 97.13;
        const x = ((Math.sin(seed) * 0.5 + 0.5) * this.W);
        const ph = (this.time * 2.5 + i / n) % 1;
        const y = this.H * (1 - ph);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 40 + strength * 60);
        ctx.stroke();
      }
    }

    drawYetiIndicator(ctx) {
      const y = this.yeti;
      if (!y || y.state !== 'chase') return;
      const sy = (y.y - this.camY) * this.scale;
      const dist = this.s.y - y.y;
      const closeness = YR.clamp(1 - dist / (this.viewH * 1.2), 0, 1);
      // red vignette pulse
      const pulse = (Math.sin(this.time * 8) * 0.5 + 0.5) * 0.25 * closeness + 0.08;
      const g = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
      g.addColorStop(0, 'rgba(230,57,70,0)');
      g.addColorStop(1, `rgba(230,57,70,${pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
      if (sy < 20) {
        const sx = YR.clamp((y.x - (this.camX - this.viewW / 2)) * this.scale, 40, this.W - 40);
        const top = 90 + (window.YRSafeTop || 0);
        ctx.save();
        ctx.translate(sx, top);
        const s = 1 + Math.sin(this.time * 10) * 0.08;
        ctx.scale(s, s);
        ctx.fillStyle = '#E63946';
        ctx.beginPath();
        ctx.moveTo(0, -26); ctx.lineTo(22, 12); ctx.lineTo(-22, 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 24px Fredoka, ui-rounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 0);
        ctx.restore();
      }
    }
  }

  YR.Game = Game;
})(window.YR);
