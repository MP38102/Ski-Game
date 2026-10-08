'use strict';
// Game orchestration: loading mountains, the frame loop, interactions
// (lifts, challenges, paragliding, ziplines, collectibles) and scoring.
(function (GS) {
  const P = GS.Props;
  const M = GS.M;

  class Game {
    constructor(canvas, ui) {
      this.canvas = canvas;
      this.ui = ui;
      this.renderer = new GS.Renderer(canvas);
      this.env = new GS.Env();
      this.camera = new GS.Camera(this);
      this.player = new GS.Player(this);
      this.t = GS.t;
      this.time = 0;
      this.state = 'boot';
      this.world = null;
      this.run = null;
      this.attract = true;
      this.observe = false;
      this.skiJumpMode = false;
      this.prompt = null;
      this.cardLock = null;
      this.focusNpc = 0;
      this.fps = 60;
      this.frameMs = 16;
      this.meshes = this._meshCache();
      this._applyQuality();
      this.resize();
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    _meshCache() {
      const c = new Map();
      const get = (k, f) => { let m = c.get(k); if (!m) c.set(k, (m = f())); return m; };
      return {
        gate: (col, w) => get('g' + col + w, () => P.gate(col, w)),
        bigGate: (col, w) => get('bg' + col + w, () => P.bigGate(col, w)),
        arch: (w, col) => get('a' + col + w, () => P.arch(w, col)),
        coin: P.coin(),
        ring: P.ring(5.2, 0.35, 28),
        marker: P.marker(),
        edelweiss: P.edelweiss(),
        boulder: new GS.MeshBuilder().col('#f5f8fc').sphere(0, 0, 0, 1, 8, 6, null, 0.3, GS.rng(4)).build(),
        smallRing: P.ring(1.6, 0.12, 20),
      };
    }

    _applyQuality() {
      let q = GS.settings.quality;
      if (q === 'auto') q = GS.isTouch() ? 'med' : 'high';
      this.quality = q;
      this.renderer.setQuality(q);
      this.dprCap = q === 'low' ? 1 : q === 'high' ? 2 : 1.5;
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap || 1.5);
      const W = window.innerWidth, H = window.innerHeight;
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
    }

    get mountain() { return this.world ? this.world.def : null; }

    // ---------- Loading -------------------------------------------------------
    async loadMountain(id, mode) {
      const def = GS.mountainById(id);
      this.state = 'loading';
      this.ui.loading(0, def);
      if (this.run) this.endRun();
      if (this.world) this.world.dispose();
      this.world = null;
      this.renderer.clearTracks();
      this.renderer.clearParticles();
      const w = new GS.World(def, this.renderer, {});
      await w.build((p, label) => this.ui.loading(p, def, label));
      this.world = w;
      GS.Progress.data.lastMountain = id;
      GS.Progress.save();
      this.npcs = new GS.NPCs(this, this._npcCount());
      // carve some tracks before the player arrives
      const ghostRiders = new GS.NPCs(this, 34);
      ghostRiders.warmup(110);
      this._setupEnv();
      GS.Audio.setMood(def.music || 'alps');
      this.player.reset(0, 0, 0);
      this.player.gear = GS.Progress.gear();
      this.player.board = GS.Progress.data.sport === 'board';
      this.cardLock = null;
      this.foundAnim = [];
      if (mode === 'play') this.enterPlay(true);
      else if (mode === 'observe') this.enterObserve();
      else this.enterAttract();
      return w;
    }

    _npcCount() {
      if (GS.settings.zen && !this.observe) return 0;
      const d = GS.settings.npcDensity;
      const base = this.quality === 'low' ? 14 : 26;
      return Math.round(base * (d === 0 ? 0 : d === 0.5 ? 0.5 : d === 2 ? 2 : 1));
    }

    _setupEnv() {
      const def = this.world.def, s = GS.settings, e = this.env;
      e.setTheme(def.theme);
      const tod = { morning: 8.5, noon: 12.5, evening: 18.3, night: 22.5 };
      e.hour = tod[s.timeOfDay] != null ? tod[s.timeOfDay] : def.hour;
      e.dynamicTime = s.timeOfDay === 'auto';
      const wx = s.weather === 'auto' || s.weather === 'dynamic' ? def.weather : s.weather;
      e.dynamicWeather = s.weather === 'dynamic';
      e.setWeather(wx, true);
      e.update(0);
    }

    refreshSettings() {
      this._applyQuality();
      if (this.world) {
        this._setupEnv();
        if (this.npcs) this.npcs.setCount(this.observe ? 140 : this._npcCount());
      }
      this.player.gear = GS.Progress.gear();
      this.player.board = GS.Progress.data.sport === 'board';
      GS.Audio.applySettings();
    }

    enterAttract() {
      this.state = 'title';
      this.attract = true;
      this.observe = false;
      this.camera.free = null;
      this.focusNpc = 0;
      this.camera.snap();
      GS.Audio.setMood('menu');
      GS.Audio.setIntensity(0);
    }

    enterPlay(fresh) {
      const w = this.world;
      this.attract = false;
      this.observe = false;
      this.camera.free = null;
      if (fresh) {
        const l = w.lifts[0];
        const e = w.liftExit(l);
        this.player.reset(e.x, e.z, 0);
        this.player.gear = GS.Progress.gear();
        this.player.board = GS.Progress.data.sport === 'board';
        this.camera.snap();
        this.ui.toast(GS.t('welcome', { name: w.def.name }), 'info');
        if (!GS.Progress.data.tutorial && !/notut/.test(location.search)) {
          setTimeout(() => this.ui.tutorial(), 1200);
          GS.Progress.data.tutorial = true;
          GS.Progress.save();
        }
      }
      if (this.npcs) this.npcs.setCount(this._npcCount());
      GS.Audio.setMood(w.def.music || 'alps');
      this.state = 'play';
      this.ui.show(null);
      this.last = performance.now();
    }

    enterObserve() {
      this.state = 'observe';
      this.observe = true;
      this.attract = false;
      const l = this.world.lifts[0];
      this.camera.free = { x: l.B.x, z: l.B.z - 200, dist: 220 };
      if (this.npcs) this.npcs.setCount(140);
      this.ui.show('observe');
    }

    pause() {
      if (this.state !== 'play') return;
      this.state = 'paused';
      this.ui.show('pause');
    }

    resume() {
      if (this.state !== 'paused' && this.state !== 'map' && this.state !== 'card') return;
      this.state = 'play';
      this.last = performance.now();
      GS.Input.reset();
      this.ui.show(null);
    }

    // ---------- Loop ------------------------------------------------------------
    loop(ts) {
      const dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000));
      this.last = ts;
      this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05;
      try {
        if (this.world && this.state !== 'loading' && this.state !== 'mini') {
          this.update(dt);
          this.draw();
        }
      } catch (e) {
        console.error(e);
      }
      requestAnimationFrame(this.loop);
    }

    update(dt) {
      const live = this.state === 'play' || this.state === 'title' || this.state === 'observe';
      const inp = GS.Input;
      if (inp.takeEdge('pause')) {
        if (this.state === 'play') this.pause();
        else if (this.state === 'paused') this.resume();
        else if (this.state === 'map') this.ui.closeMap();
      }
      if (inp.takeEdge('map') && (this.state === 'play' || this.state === 'map')) {
        if (this.state === 'map') this.ui.closeMap(); else this.openMap();
      }
      const zoom = inp.takeEdge('zoom') + inp.takeWheel();
      if (zoom) {
        if (this.camera.free) this.camera.free.dist = GS.clamp(this.camera.free.dist * (1 + zoom * 0.15), 30, 900);
        else this.camera.setZoom(this.camera.zoom * (1 + zoom * 0.12));
      }
      if (inp.takeEdge('restart') && this.run && this.state === 'play') this.restartRun();
      if (!live) {
        // keep the world gently alive behind menus
        this.env.update(dt * 0.2);
        this.renderer.time += dt;
        this.camera.update(dt, this.player);
        return;
      }
      this.time += dt;
      this.renderer.time += dt;
      this.env.update(dt);
      const p = this.player;

      if (this.state === 'play') {
        const sc = this.renderer.toScreen(p.x, p.y + 1, p.z);
        const input = inp.read({ air: p.mode === 'air' || p.mode === 'glide', skierScreen: sc });
        if (this.bot) this._botInput(input);
        if (p.mode === 'lift') input.boost = input.boost || this.ui.liftBoost;
        p.update(dt, input);
        if (input.interact && this.prompt && this.prompt.action) this.prompt.action();
        if (this.run) this.run.update(dt);
        this._interactions(dt);
        GS.Progress.data.stats.playTime += dt;
      } else {
        inp.read({ air: false });
      }

      this.world.update(dt, this.camera.target);
      if (this.npcs) this.npcs.update(dt, this.camera.target);
      this.renderer.updateParticles(dt);

      // camera focus
      if (this.state === 'title' && this.npcs && this.npcs.list.length) {
        let n = this.npcs.list[this.focusNpc % this.npcs.list.length];
        if (n.state !== 'piste') {
          this.focusNpc = (this.focusNpc + 1) % this.npcs.list.length;
          n = this.npcs.list[this.focusNpc];
        }
        const f = this._attractFocus || (this._attractFocus = { x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 0, mode: 'ski' });
        f.vx = (n.x - f.x) / Math.max(dt, 1e-3); f.vz = (n.z - f.z) / Math.max(dt, 1e-3);
        if (Math.abs(f.vx) > 40 || Math.abs(f.vz) > 40) { f.vx = 0; f.vz = 0; this.camera.snap(); }
        f.x = n.x; f.y = n.y; f.z = n.z;
        this.camera.update(dt, f);
      } else if (this.state === 'title') {
        const l = this.world.lifts[0];
        this.camera.update(dt, { x: l.B.x, y: l.B.y, z: l.B.z - 60, vx: 0, vz: 0, speed: 0, mode: 'ski' });
      } else {
        this.camera.update(dt, p);
      }

      // audio ambience
      const lean = Math.abs(p.lean);
      GS.Audio.ambient({
        speed: this.state === 'play' ? p.speed : 6, carve: this.state === 'play' && p.mode === 'ski' ? Math.min(1, lean * p.speed * 0.12 + p.braking * 0.8) : 0,
        surface: p.contact, air: p.mode === 'air' || p.mode === 'glide', storm: this.env.storm,
        rumble: this.run && this.run.ch.type === 'avalanche' && this.run.front != null ? GS.clamp(1 - (this.run.prog - this.run.front) / 140, 0, 1) : 0,
        lift: p.mode === 'lift' ? 1 : 0,
      });
      if (this.run && this.run.ch.type === 'avalanche' && this.run.front != null) {
        const lead = this.run.prog - this.run.front;
        if (lead < 60) this.camera.shake = Math.max(this.camera.shake, (60 - lead) / 60 * 0.8);
      }
      if (this.state === 'play') this.ui.hud(this._hudData());
    }

    _hudData() {
      const p = this.player;
      const T = this.world.terrain;
      return {
        speed: p.speed, alt: p.y, passes: GS.Progress.passes, credits: GS.Progress.credits,
        run: this.run ? this.run.hud() : null, runName: this.run ? this.ui.chName(this.run.ch) : '',
        combo: p.combo, mode: p.mode, lift: p.mode === 'lift' ? p.lift : null, air: p.mode === 'air',
        piste: T.pisteAt(p.x, p.z),
      };
    }

    // Test/demo autopilot: follows the active course or the nearest piste.
    _botInput(inp) {
      const run = this.run;
      const course = run && run.ch.path ? { path: run.ch.path, gates: run.gates, prog: run.prog, coins: run.coins } : null;
      GS.Challenges.botInput(this.player, this.world, course, inp);
    }

    // ---------- Interactions ---------------------------------------------------
    _interactions(dt) {
      const w = this.world, p = this.player;
      const prog = GS.Progress;
      let prompt = null;
      const ready = (p.mode === 'ski' || p.mode === 'crash') && !this.run;
      if (ready && p.mode === 'ski') {
        // lifts
        const l = w.liftAtBottom(p.x, p.z);
        if (l && p.speed < 16) {
          const ok = prog.liftUnlocked(w.def, l);
          prompt = ok
            ? { text: GS.t('pr_lift', { name: l.name }), action: () => this.boardLift(l), kind: 'lift', key: 'lift' + l.id }
            : { text: GS.t('pr_liftLocked', { name: l.name, n: prog.liftNeed(w.def, l) }), action: null, kind: 'locked', key: 'lock' + l.id };
        }
        // paraglide launch
        for (const L of w.launches) {
          if (Math.hypot(L.x - p.x, L.z - p.z) < 10) prompt = { text: GS.t('pr_glide'), action: () => this.startGlide(L), kind: 'glide', key: 'glide' };
        }
        // zipline
        for (const z of w.zips) {
          if (Math.hypot(z.ax - p.x, z.az - p.z) < 7) prompt = { text: GS.t('pr_zip'), action: () => this.startZip(z), kind: 'zip', key: 'zip' + z.ax };
        }
        // challenges
        if (!GS.settings.zen) {
          for (const ch of w.challenges) {
            const d = Math.hypot(ch.start.x - p.x, ch.start.z - p.z);
            if (d < 5.5) {
              prompt = { text: GS.t('pr_challenge'), action: () => this.openChallenge(ch), kind: 'challenge', key: 'ch' + ch.id };
              if (this.cardLock !== ch.id && p.speed < 14) {
                this.cardLock = ch.id;
                this.openChallenge(ch);
              }
            } else if (this.cardLock === ch.id && d > 10) {
              this.cardLock = null;
            }
          }
        }
      }
      if (p.mode === 'lift') prompt = { text: p.lift && p.lift.wait ? GS.t('pr_wait') : GS.t('pr_boost'), action: () => p.exitLift(), alt: GS.t('pr_skip'), kind: 'ride', key: 'ride' };
      // collectibles
      for (const c of w.collectibles) {
        if (c.got) continue;
        if (Math.hypot(c.x - p.x, c.z - p.z) < 2.6 && Math.abs(c.y - p.y - 1) < 3) {
          c.got = true;
          if (prog.collect(w.def.id, c.id)) {
            this.ui.toast(GS.t('edelweissGot'), 'gold');
            this.sfx('collect');
            this.burst(c.x, c.y, c.z, [1, 1, 1]);
            this._checkUnlocks();
          }
        }
      }
      const key = prompt ? prompt.key + prompt.text : null;
      if (key !== this._promptKey) {
        this._promptKey = key;
        this.prompt = prompt;
        this.ui.prompt(prompt);
      } else {
        this.prompt = prompt;
      }
      void dt;
    }

    boardLift(l) {
      const p = this.player;
      p.boardLift(l);
      GS.Progress.data.stats.lifts++;
      GS.Progress.save();
      this.sfx('ui');
      this._checkAch();
    }

    startGlide(L) {
      this.player.startGlide(L);
      GS.Progress.data.stats.glides++;
      this.sfx('wing');
      this._checkAch();
    }

    startZip(z) {
      this.player.startZip(z);
      GS.Progress.data.stats.zips++;
      this.sfx('whoosh');
      this._checkAch();
    }

    // ---------- Player events -------------------------------------------------
    onLanding(airT, impact, tricks) {
      const st = GS.Progress.data.stats;
      if (airT > st.bestAir) st.bestAir = airT;
      const p = this.player;
      if (p.lastLanding) {
        st.maxSpin = Math.max(st.maxSpin || 0, p.lastLanding.spinDeg);
        if (p.lastLanding.flips >= 2) st.doubleFlip = true;
      }
      this.sfx('land', GS.clamp(impact / 10, 0.3, 1.4));
      if (impact > 8) GS.haptic('medium');
      if (tricks && tricks.length) this.onTrick(tricks);
      if (this.run) this.run.onLanding(airT, tricks || []);
    }

    onTrick(tricks) {
      const p = this.player;
      p.addTricks(tricks);
      GS.Progress.data.stats.tricks += tricks.length;
      for (const t of tricks) {
        this.ui.trick(t.name, t.pts, p.combo.mult);
        if (t.tree) GS.Progress.data.stats.treeTaps++;
      }
      this.sfx('trick', p.combo.mult);
      if (this.run) this.run.onTrick(tricks);
    }

    onComboBank(total, mult, names) {
      const st = GS.Progress.data.stats;
      st.bestCombo = Math.max(st.bestCombo, total);
      st.bestMult = Math.max(st.bestMult, mult);
      GS.Progress.addCredits(total / 40);
      this.ui.bank(total, mult);
      if (total > 300) this.sfx('bank');
      if (this.run) this.run.onBank(total);
      this._checkAch();
      void names;
    }

    onCrash(kind) {
      this.sfx('crash');
      GS.haptic('heavy');
      this.camera.shake = 0.7;
      GS.Progress.data.stats.crashes++;
      this.ui.toast(GS.t('crash_' + kind) || GS.t('crash_tree'), 'bad');
      this.ui.comboLost();
      if (this.run) this.run.onCrash();
    }

    onRecover() { /* rider back on their feet */ }

    onLiftExit(l) {
      this.sfx('chair');
      void l;
    }

    onZipEnd() { this.sfx('whoosh'); }

    onGlideLand(x, z) {
      this.sfx('land', 0.6);
      if (this.run) this.run.onGlideLand(x, z);
    }

    sfx(name, k) { GS.Audio.play(name, k); }

    burst(x, y, z, c) {
      for (let k = 0; k < 24; k++) {
        this.renderer.emit(x, y, z, (Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6, 0.9, 0.25, c[0], c[1], c[2], 1, 5, 0, 1.2);
      }
    }

    // ---------- Challenges ------------------------------------------------------
    challengeLocked(ch) {
      const l = this.world.lifts[ch.reqLift];
      return l && !GS.Progress.liftUnlocked(this.world.def, l) ? l : null;
    }

    openChallenge(ch) {
      if (this.state !== 'play') return;
      this.state = 'card';
      this.ui.showCard(ch, () => this.startChallenge(ch), () => this.resume());
    }

    startChallenge(ch) {
      if (this.run) this.endRun();
      this.ui.show(null);
      this.state = 'play';
      this.run = new GS.Challenges.Run(this, ch);
      this.run.begin();
      this.cardLock = ch.id;
      this.ui.runStarted(ch);
      this.last = performance.now();
    }

    restartRun() {
      if (!this.run) return;
      const ch = this.run.ch;
      this.endRun();
      this.startChallenge(ch);
    }

    endRun() {
      if (!this.run) return;
      this.run.cleanup();
      this.run = null;
      this.ui.runEnded();
    }

    abortRun() {
      if (!this.run) return;
      this.endRun();
      this.resume();
    }

    challengeFinished(run, result) {
      const ch = run.ch;
      const tier = result.ok ? GS.Challenges.medalFor(ch, result.value) : 0;
      const before = GS.Progress.passes;
      const rec = result.ok ? GS.Progress.record(ch, result.value, tier, this.world.def) : { passes: 0, credits: 0, newTier: false, isBest: false };
      this.sfx('medal', tier);
      if (tier) GS.haptic('success');
      setTimeout(() => {
        if (this.run !== run) return;
        this.state = 'result';
        this.ui.showResult(ch, result, tier, rec, {
          retry: () => { this.endRun(); this.startChallenge(ch); },
          next: () => { this.endRun(); this.state = 'play'; this.ui.show(null); this.last = performance.now(); },
        });
        this._checkUnlocks(before);
        this._checkAch();
      }, 900);
    }

    _checkUnlocks(before) {
      const now = GS.Progress.passes;
      if (before == null) before = now - 1;
      for (const m of GS.MOUNTAINS) {
        if (m.unlock > before && m.unlock <= now) setTimeout(() => this.ui.toast(GS.t('unlockedMountain', { name: m.name }), 'gold'), 1600);
      }
      if (this.world) {
        for (const l of this.world.lifts) {
          const need = GS.Progress.liftNeed(this.world.def, l);
          if (l.cost && need > before && need <= now) setTimeout(() => this.ui.toast(GS.t('unlockedLift', { name: l.name }), 'gold'), 2400);
        }
      }
    }

    _checkAch() {
      const st = GS.Progress.data.stats;
      const p = this.player;
      st.topSpeed = Math.max(st.topSpeed, p.stats.topSpeed);
      st.dist += p.stats.dist;
      p.stats.dist = 0;
      const fresh = GS.Progress.checkAchievements();
      for (const a of fresh) this.ui.achievement(a);
      GS.Progress.save();
    }

    // ---------- Map / travel -------------------------------------------------------
    openMap() {
      if (this.state !== 'play' && this.state !== 'paused') return;
      this.state = 'map';
      this.ui.openMap(this);
    }

    travelTo(x, z, heading) {
      if (this.run) this.endRun();
      this.player.reset(x, z, heading || 0);
      this.camera.snap();
      this.cardLock = null;
      this.resume();
    }

    travelToLift(l, top) {
      if (top) {
        const e = this.world.liftExit(l);
        this.travelTo(e.x, e.z, 0);
      } else {
        this.travelTo(l.B.x + l.dir.x * 12, l.B.z + l.dir.z * 12, Math.PI);
      }
    }

    // ---------- Rendering ---------------------------------------------------------------
    draw() {
      const R = this.renderer, w = this.world, p = this.player;
      const cam = this.camera.target;
      if (this.state === 'play' || this.state === 'paused' || this.state === 'card' || this.state === 'result' || this.state === 'map') {
        p.gear = p.gear || GS.Progress.gear();
        GS.Rider.draw(R, p.pose(), p.gear);
      }
      if (this.npcs) this.npcs.render(R, cam);
      const m = new Float32Array(16);
      const t = this.time;
      // challenge start rings
      if (!this.run && !GS.settings.zen && !this.attract) {
        for (const ch of w.challenges) {
          if (Math.abs(ch.start.x - cam[0]) > 220 || Math.abs(ch.start.z - cam[2]) > 220) continue;
          const c = GS.hexToRgb(ch.color);
          const tier = GS.Progress.medal(ch.id);
          M.identity(m);
          M.translate(m, ch.start.x, w.terrain.heightAt(ch.start.x, ch.start.z) + 0.15, ch.start.z);
          M.rotY(m, t * 0.6);
          const locked = this.challengeLocked(ch);
          const k = locked ? 0.25 : 0.9;
          R.push(this.meshes.marker, m, c[0] * k, c[1] * k, c[2] * k, true);
          if (tier) {
            const mc = tier === 3 ? [1, 0.82, 0.25] : tier === 2 ? [0.85, 0.88, 0.95] : [0.85, 0.55, 0.3];
            M.identity(m);
            M.translate(m, ch.start.x + 5.5, w.terrain.heightAt(ch.start.x + 5.5, ch.start.z) + 4.8, ch.start.z);
            M.rotY(m, t * 2);
            M.rotX(m, Math.PI / 2);
            M.scale(m, 0.35, 0.35, 0.35);
            R.push(this.meshes.ring, m, mc[0], mc[1], mc[2], true);
          }
        }
      }
      // collectibles
      for (const c of w.collectibles) {
        if (c.got === undefined) c.got = GS.Progress.isFound(w.def.id, c.id);
        if (c.got) continue;
        if (Math.abs(c.x - cam[0]) > 150 || Math.abs(c.z - cam[2]) > 150) continue;
        M.identity(m);
        M.translate(m, c.x, c.y + Math.sin(t * 2) * 0.2, c.z);
        M.rotY(m, t * 1.5);
        M.scale(m, 1.4, 1.4, 1.4);
        R.push(this.meshes.edelweiss, m, 1, 1, 1, true);
        if (Math.random() < 0.08) R.emit(c.x, c.y, c.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), 1, 0.15, 1, 1, 0.8, 1, -0.5, 0, 0.5);
      }
      // launch & zip markers
      if (this.state === 'play' && !this.run) {
        for (const L of w.launches) {
          if (Math.abs(L.x - cam[0]) > 200 || Math.abs(L.z - cam[2]) > 200) continue;
          M.identity(m);
          M.translate(m, L.x, L.y + 0.15, L.z);
          M.scale(m, 0.7, 1, 0.7);
          R.push(this.meshes.marker, m, 0.1, 0.6, 0.9, true);
        }
        for (const z of w.zips) {
          if (Math.abs(z.ax - cam[0]) > 200 || Math.abs(z.az - cam[2]) > 200) continue;
          M.identity(m);
          M.translate(m, z.ax, w.terrain.heightAt(z.ax, z.az) + 0.15, z.az);
          M.scale(m, 0.6, 1, 0.6);
          R.push(this.meshes.marker, m, 0.9, 0.5, 0.1, true);
        }
      }
      if (this.run) this.run.render(R, cam);
      this.renderer.setLamps(w.lamps, cam, this.env.night > 0.05 || this.env.w.fog > 0.5 ? Math.max(this.env.night, 0.5 * this.env.w.fog) : 0);
      const scene = w.scene();
      scene.shadowRadius = Math.min(140, 40 + this.camera.dist * 1.1);
      R.render(scene, this.env, cam);
    }

    // Headless fast-forward for tests (no rendering).
    simulate(sec, step) {
      step = step || 1 / 60;
      const n = Math.round(sec / step);
      for (let i = 0; i < n; i++) {
        this.update(step);
        this.renderer.bN = 0; this.renderer.bIN = 0; this.renderer.gN = 0; this.renderer.gIN = 0;
      }
    }

    // screenshots / debugging
    debugInfo() {
      return { fps: Math.round(1000 / this.frameMs), draws: this.renderer.stats.draws, state: this.state, mode: this.player.mode, speed: this.player.speed };
    }
  }

  GS.Game = Game;
})(window.GS);
