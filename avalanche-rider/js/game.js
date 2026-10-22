'use strict';
// Game state machine, scoring, combo, avalanche, camera, effects and the
// autopilot that drives the title screen and the store captures.
//
// States: title → run ⇄ paused → crashing → (continue) → over
(function (AR) {
  const P = AR.PHYS;
  const FLIP_PTS = [0, 150, 400, 800, 1400];
  const flipPoints = (n) => (n < FLIP_PTS.length ? FLIP_PTS[n] : 1400 + (n - 4) * 700);

  class Game {
    constructor(renderer, ui) {
      this.renderer = renderer;
      this.ui = ui;
      this.state = 'boot';
      this.cam = { x: 0, y: 0, scale: 1 };
      this.shake = 0;
      this.flash = 0;
      this.particles = [];
      this.popups = [];
      this.tod = 0.2;
      this.todStart = 0.2;
      this.snowfall = 0;
      this.danger = 0;
      this.drawAngle = 0;
      this.landSquash = 0;
      this.time = 0;
      this.autopilot = false;
      this.apHold = false;
      this.runsThisSession = 0;
      this.bestDist = 0;
      this.look = null;
      this.world = null;
      this.rider = null;
      this.avalanche = null;
      this.stats = null;
      this.hint = null;
      this.reviveUsed = false;
      this.doubled = false;
      this.continueT = 0;
      this.lastFrame = 0;
    }

    refreshLook() {
      const pr = AR.Progress;
      this.look = { rider: pr.equipped('riders'), board: pr.equipped('boards'), trail: pr.equipped('trails') };
    }

    newWorld(tutorial) {
      const seed = (Math.random() * 1e9) | 0;
      this.world = new AR.World(seed, { tutorial });
      const up = AR.Progress.data.up;
      this.rider = new AR.Rider(this.world, { balance: AR.upgradeValue('balance', up.balance) });
      this.rider.v = 320;
      this.avalanche = { x: this.rider.x - 1100, speed: 0, t: 0 };
      this.particles.length = 0;
      this.popups.length = 0;
      this.danger = 0;
      this.drawAngle = this.rider.angle;
      this.snapCamera();
      this.refreshLook();
    }

    // ---------- flow ----------
    attract() {
      this.state = 'title';
      this.autopilot = true;
      this.newWorld(false);
      this.todStart = AR.posMod(Math.random() * 0.9 - 0.05, 1);
      this.avalanche.x = -1e9;
      this.bestDist = 0;
      AR.Platform.gameplayStop();
    }

    startRun() {
      const pr = AR.Progress.data;
      this.state = 'run';
      this.autopilot = false;
      this.tutorial = !pr.tutorial;
      this.newWorld(this.tutorial);
      this.todStart = 0.16;
      this.bestDist = pr.bestDist;
      this.stats = { dist: 0, flips: 0, coins: 0, score: 0, perfect: 0, combo: 0, maxFlip: 0, gaps: 0, rails: 0, powerups: 0, smash: 0, bigair: 0 };
      this.trickScore = 0;
      this.combo = 0;
      this.comboT = 0;
      this.mult = 1;
      this.reviveUsed = false;
      this.doubled = false;
      this.missionTimer = 0;
      this.hintStage = 0;
      this.hintT = 0;
      this.runTime = 0;
      this.flash = 0;
      this.ui.showHud(true);
      this.ui.setHint(null);
      AR.Input.reset();
      AR.Audio.startMusic();
      AR.Platform.gameplayStart();
    }

    pause() {
      if (this.state !== 'run') return;
      this.state = 'paused';
      AR.Platform.gameplayStop();
      AR.Input.reset();
      AR.Audio.silenceRide();
      this.ui.show('pause');
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'run';
      this.ui.show(null);
      AR.Input.reset();
      AR.Platform.gameplayStart();
    }

    // Leaving a run from the pause menu still banks coins and stats.
    quitRun() {
      if (this.state !== 'paused') return;
      this.finishRun(true);
    }

    onCrash(reason) {
      this.state = 'crashing';
      this.crashT = 0;
      this.crashReason = reason;
      this.combo = 0;
      this.mult = 1;
      AR.Platform.gameplayStop();
      AR.Audio.silenceRide();
      this.ui.setHint(null);
    }

    canRevive() {
      return !this.reviveUsed && this.stats.dist > 150 && AR.Platform.rewardedAvailable();
    }

    afterCrash() {
      if (this.canRevive()) {
        this.state = 'continue';
        this.continueT = 8;
        this.ui.showContinue(this.crashReason);
      } else this.finishRun(false);
    }

    async acceptContinue() {
      if (this.state !== 'continue') return;
      this.state = 'continue-ad';
      this.ui.setContinueLoading(true);
      const ok = await AR.Platform.showRewarded();
      this.ui.setContinueLoading(false);
      if (!ok) {
        this.ui.toast(AR.t('adUnavailable'));
        this.finishRun(false);
        return;
      }
      this.reviveUsed = true;
      this.rider.revive();
      this.avalanche.x = this.rider.x - 1100;
      this.flash = 0;
      this.snapCamera();
      this.state = 'run';
      this.ui.show(null);
      this.ui.showHud(true);
      AR.Audio.sfx.revive();
      this.popup(AR.t('revived'), this.rider.x, this.rider.y - 110, '#7FD3FF', 34);
      AR.Input.reset();
      AR.Platform.gameplayStart();
    }

    declineContinue() {
      if (this.state !== 'continue') return;
      this.finishRun(false);
    }

    finishRun(quit) {
      const pr = AR.Progress;
      const d = pr.data;
      this.state = 'over';
      AR.Platform.gameplayStop();
      AR.Audio.silenceRide();
      this.ui.showHud(false);
      this.ui.setHint(null);
      const st = this.stats;
      st.score = Math.floor(st.dist) + Math.floor(this.trickScore);
      const doneRun = pr.trackRun(st);
      const doneTotal = pr.trackTotals({ dist: st.dist, flips: st.flips, runs: 1 });
      d.coins += st.coins;
      d.runs += 1;
      const newBest = st.score > d.best;
      if (newBest) d.best = st.score;
      if (st.dist > d.bestDist) d.bestDist = Math.floor(st.dist);
      if (!d.tutorial) d.tutorial = true;
      const rankBonus = pr.checkRankUp();
      pr.save();
      this.runsThisSession += 1;
      if (newBest && st.score > 0) AR.Platform.happytime();
      this.ui.showOver({
        reason: quit ? 'quit' : this.crashReason,
        stats: st,
        newBest,
        best: d.best,
        missionsDone: doneRun.concat(doneTotal),
        rankBonus,
        canDouble: st.coins > 0 && AR.Platform.rewardedAvailable(),
      });
    }

    async doubleCoins() {
      if (this.doubled || this.state !== 'over' || !this.stats.coins) return false;
      const ok = await AR.Platform.showRewarded();
      if (!ok) {
        this.ui.toast(AR.t('adUnavailable'));
        return false;
      }
      this.doubled = true;
      AR.Progress.data.coins += this.stats.coins;
      AR.Progress.save();
      AR.Audio.sfx.buy();
      return true;
    }

    // Midgame ads only at the break between runs, never before the first
    // game over of a session (retention matters more than one more ad).
    async breakAd() {
      if (this.runsThisSession < 2) return;
      await AR.Platform.showMidgame();
    }

    // ---------- per frame ----------
    frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - (this.lastFrame || now)) / 1000));
      this.lastFrame = now;
      this.tick(dt);
    }

    tick(dt) {
      this.time += dt;
      AR.Audio.tick(dt);
      const s = this.state;
      if (s === 'paused' || s === 'boot' || AR.Platform.adPlaying) {
        this.render();
        return;
      }
      if (s === 'title' || s === 'run') {
        const input = this.autopilot ? this.autopilotInput() : AR.Input.consume();
        if (this.autopilot) AR.Input.consume();
        this.updateRide(dt, input);
      } else if (s === 'crashing') {
        this.rider.update(dt, { press: false, hold: false });
        this.updateAvalanche(dt, true);
        this.crashT += dt;
        if (this.crashT > (this.crashReason === 'avalanche' ? 1.4 : 1.1)) this.afterCrash();
      } else if (s === 'continue') {
        this.continueT -= dt;
        this.ui.setContinueTimer(this.continueT / 8);
        if (this.continueT <= 0) this.declineContinue();
      }
      if (s !== 'run') AR.Input.consume();
      this.updateEffects(dt);
      this.updateCamera(dt);
      this.render();
    }

    updateRide(dt, input) {
      const r = this.rider;
      const w = this.world;
      if (input.press) AR.Audio.unlock();
      r.update(dt, input);
      w.ensure(r.x + 6000);
      w.prune(Math.min(r.x, this.avalanche.x) - 1500);
      this.handleEvents();
      if (this.state !== 'run' && this.state !== 'title') return;
      if (this.state === 'title') {
        if (!r.alive && r.crashT > 1.4) this.attract();
      } else {
        this.runTime += dt;
        this.stats.dist = Math.max(this.stats.dist, (r.x - w.startX) / P.PX_PER_M);
        this.updateCombo(dt);
        this.updatePickups(dt);
        this.updateAvalanche(dt, false);
        this.updateTutorial(dt);
        this.missionTimer -= dt;
        if (this.missionTimer <= 0) {
          this.missionTimer = 0.5;
          this.checkMissions();
        }
        AR.Audio.setRide(r.speed, r.mode === 'ground', r.mode === 'rail', this.danger);
        AR.Audio.setIntensity(this.danger);
        this.ui.updateHud(this);
      }
      if (this.state === 'title') this.updatePickups(dt);
      this.tod = this.todStart + (r.x - w.startX) / P.PX_PER_M / 4000;
      const m = (r.x - w.startX) / P.PX_PER_M;
      const night = this.renderer.pal ? this.renderer.pal.stars : 0;
      this.snowfall = AR.clamp(Math.sin(m / 650 + (w.seed % 7)) * 1.4 - 0.4, 0, 1) * 0.8 + night * 0.35;
    }

    handleEvents() {
      const r = this.rider;
      const run = this.state === 'run';
      while (r.events.length) {
        const e = r.events.shift();
        switch (e.type) {
          case 'jump':
            AR.Audio.sfx.jump();
            this.burst(r.x, r.y, 8, 'puff', ['#FFFFFF'], 120);
            if (run && this.hintStage === 0) this.hintStage = 1;
            break;
          case 'land':
            this.onLand(e);
            break;
          case 'gapCleared':
            if (run) {
              this.stats.gaps += 1;
              this.addTrick(100, AR.t('gapClear'), 1);
            }
            break;
          case 'railStart':
            if (run) this.popup(AR.t('grind'), r.x, r.y - 90, '#7FD3FF', 26);
            break;
          case 'railEnd':
            if (run && e.time > 0.25) {
              this.stats.rails += 1;
              this.addTrick(Math.round(e.time * 160), null, 1);
            }
            break;
          case 'smash':
            AR.Audio.sfx.smash();
            this.shake = 0.35;
            this.burst(e.x, e.y, 18, 'chunk', ['#4A5568', '#6B7A90', '#F5F9FD'], 380);
            if (run) {
              this.stats.smash += 1;
              this.addTrick(150, AR.t('smash'), 1);
            }
            break;
          case 'shieldSave':
            AR.Audio.sfx.shieldSave();
            this.popup(AR.t('saved'), r.x, r.y - 100, '#7FD3FF', 28);
            break;
          case 'crash':
            this.onCrashEvent(e);
            break;
          default:
        }
      }
    }

    onLand(e) {
      const r = this.rider;
      const run = this.state === 'run';
      AR.Audio.sfx.land(e.quality);
      this.landSquash = e.quality === 'sketchy' ? 1 : 0.7;
      const big = e.airTime > 0.5;
      if (big) this.burst(r.x, r.y, e.quality === 'sketchy' ? 22 : 14, 'puff', ['#FFFFFF', '#E6F0FA'], 260);
      if (e.airTime > 0.9) this.shake = Math.max(this.shake, 0.18);
      if (!run) return;
      if (e.quality === 'sketchy') {
        this.combo = 0;
        this.mult = 1;
        this.comboT = 0;
        this.popup(AR.t('sketchy'), r.x, r.y - 90, '#FFB13B', 28);
        if (e.flips > 0) this.stats.flips += e.flips;
        return;
      }
      let pts = 0;
      let label = null;
      let count = 0;
      if (e.flips > 0) {
        pts += flipPoints(e.flips);
        count += e.flips;
        label = AR.t(e.flips === 1 ? 'flip1' : e.flips === 2 ? 'flip2' : e.flips === 3 ? 'flip3' : 'flipN', { n: e.flips });
        this.stats.flips += e.flips;
        this.stats.maxFlip = Math.max(this.stats.maxFlip, e.flips);
        AR.Audio.sfx.trick(this.mult);
        if (this.hintStage <= 3 && this.tutorial) this.hintStage = 4;
      }
      if (e.airTime > 1.3) {
        pts += 100;
        count += 1;
        this.stats.bigair += 1;
        if (!label) label = AR.t('bigAir');
      }
      if (e.quality === 'perfect' && e.airTime > 0.45) {
        pts += 75;
        count += 1;
        this.stats.perfect += 1;
        this.popup(AR.t('perfect'), r.x + 30, r.y - 50, '#7FD3FF', 22);
      }
      if (pts > 0) this.addTrick(pts, label, count);
    }

    addTrick(pts, label, count) {
      const r = this.rider;
      this.combo += count;
      this.comboT = 2.6;
      this.mult = Math.min(8, 1 + Math.floor(this.combo / 2));
      this.stats.combo = Math.max(this.stats.combo, this.mult);
      const gained = pts * this.mult;
      this.trickScore += gained;
      const text = (label ? label + '  ' : '') + '+' + AR.fmt(gained);
      this.popup(text, r.x, r.y - 110, this.mult > 1 ? '#FFC53D' : '#FFFFFF', label ? 30 : 24);
    }

    updateCombo(dt) {
      const r = this.rider;
      if (r.mode === 'rail') {
        this.trickScore += 120 * this.mult * dt;
        this.comboT = 2.6;
      } else if (r.mode === 'ground' && this.combo > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) {
          this.combo = 0;
          this.mult = 1;
        }
      }
      this.stats.score = Math.floor(this.stats.dist) + Math.floor(this.trickScore);
    }

    onCrashEvent(e) {
      const r = this.rider;
      this.shake = 0.6;
      if (e.reason === 'gap') AR.Audio.sfx.fall();
      else if (e.reason === 'avalanche') AR.Audio.sfx.caught();
      else AR.Audio.sfx.crash();
      this.burst(e.x, e.y, 26, 'chunk', ['#FFFFFF', '#E6F0FA', '#C9D9EE'], 420);
      if (this.state === 'run') this.onCrash(e.reason);
      else if (this.state === 'title') r.crashT = 0;
    }

    updatePickups() {
      const r = this.rider;
      const w = this.world;
      if (!r.alive) return;
      const bx = r.x + Math.sin(r.angle) * 26;
      const by = r.y - Math.cos(r.angle) * 26;
      const magnet = r.magnetT > 0;
      const reach = magnet ? 300 : 0;
      for (const c of w.coins) {
        if (c.taken) continue;
        const dx = c.x - bx;
        if (dx > 340 || dx < -120) continue;
        const dy = c.y - by;
        const dist = Math.hypot(dx, dy);
        if (magnet && dist < reach) {
          c.x -= dx * 0.22;
          c.y -= dy * 0.22;
        }
        if (dist < 40) {
          c.taken = true;
          if (this.state === 'run') this.stats.coins += 1;
          AR.Audio.sfx.coin();
          this.burst(c.x, c.y, 4, 'spark', ['#FFC53D', '#FFF4CC'], 160);
        }
      }
      for (const p of w.powerups) {
        if (p.taken) continue;
        if (Math.hypot(p.x - bx, p.y - by) < 52) {
          p.taken = true;
          const up = AR.Progress.data.up;
          if (p.type === 'magnet') r.magnetT = AR.upgradeValue('magnet', up.magnet);
          else r.shieldT = AR.upgradeValue('shield', up.shield);
          AR.Audio.sfx.powerup();
          this.burst(p.x, p.y, 12, 'spark', ['#FFFFFF', p.type === 'magnet' ? '#E63946' : '#5CC8FF'], 220);
          if (this.state === 'run') {
            this.stats.powerups += 1;
            this.popup(AR.t(p.type), r.x, r.y - 100, '#FFFFFF', 26);
          }
        }
      }
    }

    updateAvalanche(dt, crashed) {
      const av = this.avalanche;
      const r = this.rider;
      const w = this.world;
      av.t += dt;
      const d = w.difficulty(r.x);
      const tut = this.tutorial && r.x < 14000 ? 0.85 : 1;
      const target = (380 + 280 * d) * tut;
      av.speed = AR.lerp(0, target, AR.smoothstep(av.t / 3));
      av.x += av.speed * dt;
      if (crashed) {
        av.x = Math.min(av.x, r.focusX + 260);
        return;
      }
      const maxGap = (1500 - 520 * d) * (tut < 1 ? 1.15 : 1);
      if (r.x - av.x > maxGap) av.x = r.x - maxGap;
      const gap = r.x - av.x;
      this.danger = AR.approach(this.danger, AR.clamp(1 - (gap - 140) / 760, 0, 1), 4, dt);
      this.avalancheGapM = Math.max(0, gap / P.PX_PER_M);
      if (gap < 40 && r.alive) {
        r.caught();
        this.flash = 0.9;
      }
    }

    updateTutorial(dt) {
      if (!this.tutorial) return;
      const r = this.rider;
      const w = this.world;
      this.hintT -= dt;
      let hint = null;
      const k = w.kickers.find((kk) => kk.lipX > r.x - 40);
      const firstRock = w.rocks.find((rk) => rk.x > r.x);
      if (this.hintStage === 0) hint = 'hintJump';
      else if (this.hintStage === 1 && k && k.x0 - r.x < 700) this.hintStage = 2;
      if (this.hintStage === 2) {
        hint = r.mode === 'air' && r.spinning ? 'hintRelease' : 'hintFlip';
        if (r.mode === 'air' && r.spinning) this.hintStage = 3;
      } else if (this.hintStage === 3) {
        hint = r.mode === 'air' ? 'hintRelease' : 'hintFlip';
      } else if (this.hintStage === 4) {
        this.hintStage = 5;
        this.hintT = 2.5;
      }
      if (this.hintStage === 5) {
        if (this.hintT > 0) hint = 'hintCombo';
        else if (firstRock && firstRock.x - r.x < 900) hint = 'hintRock';
        else if (w.rails.some((rl) => rl.x0 - r.x < 700 && rl.x1 > r.x)) hint = 'hintRail';
        else if (w.gaps.some((gp) => gp.x0 - r.x < 900 && gp.x1 > r.x)) hint = 'hintGap';
      }
      if (this.hintStage === 1 && this.runTime > 2 && this.runTime < 6) hint = 'hintAvalanche';
      this.ui.setHint(hint);
    }

    checkMissions() {
      const done = AR.Progress.trackRun(this.stats);
      for (const m of done) {
        AR.Audio.sfx.mission();
        this.ui.toast(AR.t('missionDone', { reward: m.reward }), 'mission');
      }
      if (done.length) AR.Progress.save();
    }

    // ---------- effects ----------
    burst(x, y, n, kind, colors, speed) {
      for (let i = 0; i < n; i++) {
        if (this.particles.length > 600) break;
        const a = Math.random() * Math.PI - Math.PI;
        const v = speed * (0.3 + Math.random() * 0.7);
        this.particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 0.5 + Math.random() * 0.5, max: 1, size: kind === 'chunk' ? 3 + Math.random() * 4 : 3 + Math.random() * 5,
          color: colors[(Math.random() * colors.length) | 0], kind, grav: kind === 'puff' ? 120 : 1200,
        });
      }
    }

    // Popups ride along with the rider so they stay on screen.
    popup(text, x, y, color, size) {
      const dx = this.rider ? x - this.rider.focusX : 0;
      this.popups.push({ text, x, y, dx, color, size, life: 1.1, max: 1.1 });
      if (this.popups.length > 4) this.popups.shift();
    }

    updateEffects(dt) {
      const r = this.rider;
      if (r && r.alive) {
        // board spray / trail
        const trail = this.look.trail;
        const grounded = r.mode === 'ground' || r.mode === 'rail';
        const rate = grounded ? r.speed / 90 : trail.sparkle || trail.id !== 'powder' ? 2 : 0;
        let n = rate * dt * 6;
        while (n > 0 && this.particles.length < 600) {
          if (n < 1 && Math.random() > n) break;
          n -= 1;
          const ca = Math.cos(r.angle);
          const sa = Math.sin(r.angle);
          const px = r.x - ca * 26;
          const py = r.y - sa * 26;
          const col = trail.colors[(Math.random() * trail.colors.length) | 0];
          this.particles.push({
            x: px, y: py,
            vx: -ca * r.speed * 0.12 + (Math.random() - 0.5) * 60,
            vy: -40 - Math.random() * (grounded ? 140 : 40),
            life: 0.35 + Math.random() * 0.4, max: 0.75, size: grounded ? 2.5 + Math.random() * 3.5 : 2.5,
            color: col, kind: trail.sparkle && Math.random() < 0.5 ? 'spark' : 'snow', grav: 500,
          });
        }
      }
      for (const p of this.particles) {
        p.life -= dt;
        p.vy += p.grav * dt;
        p.vx *= 1 - 1.5 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      for (const p of this.popups) {
        p.life -= dt;
        p.y -= 60 * dt;
        if (r) p.x = r.focusX + p.dx;
      }
      this.popups = this.popups.filter((p) => p.life > 0);
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 0.8);
      this.landSquash = Math.max(0, this.landSquash - dt * 3);
      if (r) {
        if (r.mode === 'air' || !r.alive) this.drawAngle = r.angle;
        else this.drawAngle += AR.wrap(r.angle - this.drawAngle) * (1 - Math.exp(-18 * dt));
      }
    }

    // ---------- camera ----------
    cameraTarget() {
      const r = this.rider;
      const w = this.world;
      const W = this.renderer.W;
      const H = this.renderer.H;
      const base = this.renderer.baseScale();
      const sp = AR.clamp((r.speed - 500) / 700, 0, 1);
      const scale = base * (1 - 0.14 * sp);
      const vw = W / scale;
      const vh = H / scale;
      const fx = r.focusX;
      let fy = r.focusY;
      if (r.mode === 'air') {
        const gy = w.gapAt(fx) ? fy : w.groundAt(fx + r.vx * 0.25);
        fy = AR.lerp(fy, Math.min(gy, fy + 500), 0.35);
      }
      // Title screen: rider low and centred, between logo and mission card.
      if (this.state === 'title') return { x: fx - vw * 0.04, y: fy - vh * 0.26, scale };
      return { x: fx + vw * 0.17, y: fy + vh * 0.04, scale };
    }

    snapCamera() {
      const t = this.cameraTarget();
      this.cam.x = t.x;
      this.cam.y = t.y;
      this.cam.scale = t.scale;
    }

    updateCamera(dt) {
      if (!this.rider) return;
      const t = this.cameraTarget();
      const c = this.cam;
      c.scale = AR.approach(c.scale, t.scale, 2, dt);
      c.x = AR.approach(c.x, t.x, 7, dt);
      c.y = AR.approach(c.y, t.y, 4.5, dt);
      if (this.state === 'title') return;
      // Keep the rider inside a safe band of the screen.
      const W = this.renderer.W;
      const H = this.renderer.H;
      const r = this.rider;
      const sx = (r.focusX - c.x) * c.scale + W / 2;
      const sy = (r.focusY - c.y) * c.scale + H / 2;
      if (sx < W * 0.18) c.x -= (W * 0.18 - sx) / c.scale;
      if (sx > W * 0.55) c.x += (sx - W * 0.55) / c.scale;
      if (sy < H * 0.2) c.y -= (H * 0.2 - sy) / c.scale;
      if (sy > H * 0.74) c.y += (sy - H * 0.74) / c.scale;
    }

    render() {
      if (!this.world || this.noRender) return;
      const c = this.cam;
      const sx = c.x;
      const sy = c.y;
      if (this.shake > 0) {
        // Deterministic jitter: rendering never consumes random numbers.
        const m = this.shake * 7 / c.scale;
        c.x += Math.sin(this.time * 91.7) * m;
        c.y += Math.cos(this.time * 77.3) * m;
      }
      this.renderer.draw(this, this.time);
      c.x = sx;
      c.y = sy;
    }

    // ---------- autopilot ----------
    autopilotInput() {
      const r = this.rider;
      const w = this.world;
      let press = false;
      let hold = false;
      if (r.mode === 'ground' || r.mode === 'rail') {
        const v = r.v;
        for (const rk of w.rocks) {
          if (!rk.smashed && rk.x > r.x && rk.x - r.x < v * 0.2 + 50 + rk.r) press = true;
        }
        for (const k of w.kickers) {
          if (k.lipX >= r.x && k.lipX - r.x < v * 0.03 + 6) press = true;
        }
        for (const c of w.cliffs) {
          if (c.x >= r.x && c.x - r.x < v * 0.03 + 6) press = true;
        }
        for (const rl of w.rails) {
          const d = rl.x0 - r.x;
          if (d > v * 0.2 && d < v * 0.3) press = true;
        }
        if (r.mode === 'rail' && r.rail.x1 - r.x < v * 0.04) press = true;
        this.apHold = false;
      } else if (r.mode === 'air') {
        const L = r.predictLanding();
        const rem = AR.posMod(r.angle - L.angle, AR.TAU);
        if (this.apHold) hold = rem > 0.3 && rem / P.SPIN < L.t - 0.04;
        else {
          // Backward rotation still needed to line up with the landing slope.
          const needed = rem < 0.35 ? rem + AR.TAU : rem;
          hold = needed > 1.2 && r.airTime > 0.05 && needed / P.SPIN < L.t - 0.16;
        }
        this.apHold = hold;
      }
      return { press, hold };
    }
  }

  AR.Game = Game;
})(window.AR);
