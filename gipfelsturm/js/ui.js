'use strict';
// DOM user interface: menus, HUD, trick feed, prompts, challenge and result
// cards, gear shop, mountain picker, map screen, settings and achievements.
(function (GS) {
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => GS.t(k, v);
  const SCREENS = ['title', 'mountains', 'gear', 'modes', 'settings', 'achievements', 'howto', 'pause', 'map', 'observe', 'retro'];

  const UI = {
    game: null,
    current: null,
    stack: [],
    liftBoost: false,
    last: {},

    init(game) {
      this.game = game;
      GS.applyI18n();
      // navigation
      document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { GS.Audio.play('ui'); this.open(b.dataset.go); }));
      document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { GS.Audio.play('ui'); this.back(); }));
      $('btn-play').addEventListener('click', () => this.play());
      $('btn-pause').addEventListener('click', () => game.pause());
      $('btn-map').addEventListener('click', () => game.openMap());
      $('btn-resume').addEventListener('click', () => game.resume());
      $('btn-pmap').addEventListener('click', () => { game.state = 'play'; game.openMap(); });
      $('btn-prestart').addEventListener('click', () => { game.state = 'play'; game.restartRun(); });
      $('btn-pabort').addEventListener('click', () => game.abortRun());
      $('btn-home').addEventListener('click', () => { game.endRun(); game.enterAttract(); this.show('title'); });
      $('btn-observe').addEventListener('click', () => this.observe());
      $('btn-retro').addEventListener('click', () => { GS.Audio.play('ui'); this.open('retro'); });
      $('mini-exit').addEventListener('click', () => { if (this.mini) this.mini.stop(true); });
      document.querySelectorAll('#retro-seg button').forEach((b) => b.addEventListener('click', () => { this.retroKind = b.dataset.kind; this._renderRetro(); }));
      $('btn-observe-exit').addEventListener('click', () => { game.enterAttract(); this.show('title'); });
      $('map-close').addEventListener('click', () => this.closeMap());
      $('map-zin').addEventListener('click', () => this._mapZoom(1.35));
      $('map-zout').addEventListener('click', () => this._mapZoom(1 / 1.35));
      // prompt
      const pb = $('prompt-btn');
      const onPrompt = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const p = game.prompt;
        if (p && p.kind === 'ride') { this.liftBoost = true; return; }
        if (p && p.action) { GS.Audio.play('ui'); p.action(); }
      };
      pb.addEventListener('pointerdown', onPrompt);
      const endBoost = () => { this.liftBoost = false; };
      pb.addEventListener('pointerup', endBoost);
      pb.addEventListener('pointerleave', endBoost);
      pb.addEventListener('pointercancel', endBoost);
      $('prompt-alt').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (game.prompt && game.prompt.action) game.prompt.action(); });
      // on-screen control buttons
      document.querySelectorAll('#touch-buttons [data-b]').forEach((b) => GS.Input.bindButton(b, b.dataset.b));
      this._settingsInit();
      this._modesInit();
      this._applyControlMode();
      window.addEventListener('gamepadconnected', () => this.toast(t('gamepadOn'), 'info'));
    },

    play() {
      GS.Audio.unlock();
      GS.Audio.play('ui');
      const g = this.game;
      const want = GS.Progress.data.lastMountain || 'sonnalm';
      const def = GS.mountainById(want);
      if (g.world && g.world.def.id === def.id && GS.Progress.mountainUnlocked(def)) {
        g.enterPlay(true);
      } else {
        g.loadMountain(GS.Progress.mountainUnlocked(def) ? def.id : 'sonnalm', 'play');
      }
    },

    observe() {
      GS.Audio.unlock();
      this.game.enterObserve();
    },

    // ---------- Screen management ------------------------------------------
    show(name) {
      for (const s of SCREENS) {
        const el = $('screen-' + s);
        if (el) el.classList.toggle('hidden', s !== name);
      }
      $('card-challenge').classList.add('hidden');
      $('card-result').classList.add('hidden');
      $('loading').classList.add('hidden');
      const playing = name === null && (this.game.state === 'play');
      $('hud').classList.toggle('hidden', !(playing || name === null));
      this.current = name;
      if (name !== 'gear' && this.preview) this.preview.stop();
      if (name === 'title') this._refreshTitle();
      if (name === 'pause') this._refreshPause();
      if (name !== null) this.prompt(null);
      if (name === null) this._promptRestore();
      this._applyControlMode();
    },

    open(name) {
      this.stack.push(this.current);
      this.show(name);
      if (name === 'mountains') this._renderMountains();
      if (name === 'gear') this._renderGear();
      if (name === 'achievements') this._renderAchievements();
      if (name === 'settings') this._settingsSync();
      if (name === 'modes') this._modesSync();
      if (name === 'retro') this._renderRetro();
    },

    _renderRetro() {
      const kind = this.retroKind || 'side';
      document.querySelectorAll('#retro-seg button').forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
      const d = GS.Progress.data;
      const stars = (d.mini && d.mini[kind]) || [];
      const list = $('retro-list');
      list.innerHTML = '';
      const n = GS.MINI_COUNTS[kind];
      for (let i = 0; i < n; i++) {
        const open = GS.settings.unlockAll || i === 0 || (stars[i - 1] || 0) > 0;
        const st = stars[i] || 0;
        const b = document.createElement('button');
        b.className = 'lvl' + (open ? '' : ' locked');
        b.innerHTML = `<span class="small muted">${t('level')}</span><b>${i + 1}</b><span class="st">${'★'.repeat(st)}<i>${'★'.repeat(3 - st)}</i></span>`;
        b.onclick = () => {
          if (!open) return;
          GS.Audio.unlock();
          GS.Audio.play('ui');
          this.startMini(kind, i);
        };
        list.appendChild(b);
      }
      document.querySelectorAll('.v-credits').forEach((e) => { e.textContent = GS.fmtInt(GS.Progress.credits); });
    },

    startMini(kind, n) {
      if (!this.mini) this.mini = new GS.Mini($('mini-canvas'), this);
      const g = this.game;
      this._prevState = g.state;
      g.state = 'mini';
      $('mini-exit').classList.remove('hidden');
      this.mini.onExit = (res) => {
        $('mini-exit').classList.add('hidden');
        g.state = this._prevState === 'mini' ? 'title' : this._prevState;
        this.show('retro');
        this._renderRetro();
        if (res) this.toast((res.credits ? '' : '') + t('miniDone', { n: res.stars, c: res.credits }), res.stars === 3 ? 'gold' : 'good');
      };
      for (const s2 of SCREENS) { const el = $('screen-' + s2); if (el) el.classList.add('hidden'); }
      this.mini.start(kind, n);
    },

    back() {
      const prev = this.stack.pop();
      if (prev === 'pause' || (prev == null && this.game.state === 'paused')) { this.show('pause'); return; }
      this.show(prev || 'title');
    },

    loading(p, def, label) {
      $('loading').classList.remove('hidden');
      $('hud').classList.add('hidden');
      for (const s of SCREENS) { const el = $('screen-' + s); if (el) el.classList.add('hidden'); }
      $('load-name').textContent = def.name;
      $('load-region').textContent = GS.tl(def.region);
      $('load-bar').style.width = Math.round(p * 100) + '%';
      $('load-label').textContent = label ? t('ld_' + label) : t('loading');
    },

    _refreshTitle() {
      document.querySelectorAll('.v-passes').forEach((e) => { e.textContent = GS.fmtInt(GS.Progress.passes); });
      document.querySelectorAll('.v-credits').forEach((e) => { e.textContent = GS.fmtInt(GS.Progress.credits); });
      const d = GS.Progress.data;
      $('btn-play').textContent = d.stats.runs > 0 || d.tutorial ? t('continue') + ' · ' + GS.mountainById(d.lastMountain).name : t('play');
    },

    _refreshPause() {
      const g = this.game;
      $('pause-title').textContent = g.run ? this.chName(g.run.ch) : (g.world ? g.world.def.name : '');
      document.querySelectorAll('.run-only').forEach((e) => e.classList.toggle('hidden', !g.run));
    },

    // ---------- HUD ---------------------------------------------------------------
    hud(d) {
      const L = this.last;
      const sp = GS.settings.units === 'mph' ? Math.round(d.speed * 2.23694) : Math.round(d.speed * 3.6);
      if (L.sp !== sp) { $('speed').textContent = sp; L.sp = sp; }
      const unit = GS.settings.units === 'mph' ? 'mph' : 'km/h';
      if (L.unit !== unit) { $('speed-unit').textContent = unit; L.unit = unit; }
      if (L.passes !== d.passes) { $('hud-passes').textContent = GS.fmtInt(d.passes); L.passes = d.passes; }
      const cr = Math.floor(d.credits);
      if (L.credits !== cr) { $('hud-credits').textContent = GS.fmtInt(cr); L.credits = cr; }
      if (d.run) {
        $('run-panel').classList.remove('hidden');
        if (L.runName !== d.runName) { $('run-name').textContent = d.runName; L.runName = d.runName; }
        if (L.runMain !== d.run.main) { $('run-main').textContent = d.run.main; L.runMain = d.run.main; }
        if (L.runSub !== d.run.sub) { $('run-sub').textContent = d.run.sub; L.runSub = d.run.sub; }
        const bar = $('run-bar');
        bar.classList.toggle('hidden', d.run.bar == null);
        if (d.run.bar != null) bar.firstElementChild.style.width = Math.round(d.run.bar * 100) + '%';
      } else if (!L.noRun) {
        $('run-panel').classList.add('hidden');
      }
      L.noRun = !d.run;
      // combo
      const c = d.combo;
      if (c.active && c.mult >= 1) {
        const txt = GS.fmtInt(c.pts);
        const el = $('combo');
        el.classList.remove('hidden');
        if (L.cpts !== txt) { $('combo-pts').textContent = txt; L.cpts = txt; }
        if (L.cmult !== c.mult) { $('combo-mult').textContent = '×' + c.mult; L.cmult = c.mult; }
      } else if (!this._banking) {
        $('combo').classList.add('hidden');
      }
    },

    trick(name, pts, mult) {
      const feed = $('trickfeed');
      const el = document.createElement('div');
      el.className = 'trick';
      el.innerHTML = `${escapeHtml(name)}<em>+${GS.fmtInt(pts)}</em>`;
      feed.appendChild(el);
      while (feed.children.length > 4) feed.firstChild.remove();
      setTimeout(() => el.remove(), 1700);
      void mult;
    },

    bank(total, mult) {
      const el = $('combo');
      el.classList.remove('hidden', 'bank');
      void el.offsetWidth;
      el.classList.add('bank');
      $('combo-pts').textContent = GS.fmtInt(total);
      $('combo-mult').textContent = mult > 1 ? '×' + mult + ' ✓' : '✓';
      this._banking = true;
      clearTimeout(this._bankT);
      this._bankT = setTimeout(() => { this._banking = false; this.last.cpts = null; this.last.cmult = null; }, 1100);
    },

    comboLost() {
      $('combo').classList.add('hidden');
      this._banking = false;
    },

    prompt(p) {
      this._lastPrompt = p;
      const box = $('prompt');
      if (!p || this.current !== null) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      const b = $('prompt-btn');
      b.textContent = p.text;
      b.className = p.action || p.kind === 'ride' ? 'kind-' + p.kind : 'locked';
      const alt = $('prompt-alt');
      alt.classList.toggle('hidden', !p.alt);
      if (p.alt) alt.textContent = p.alt;
    },

    _promptRestore() {
      if (this._lastPrompt) this.prompt(this._lastPrompt);
    },

    countdown(n) {
      const el = $('countdown');
      if (n <= 0) {
        el.textContent = t('go');
        el.classList.remove('hidden');
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
        setTimeout(() => el.classList.add('hidden'), 700);
        return;
      }
      el.textContent = n;
      el.classList.remove('hidden');
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    },

    flash(kind) {
      const f = $('flash');
      f.className = 'flash';
      void f.offsetWidth;
      f.className = 'flash go ' + kind;
    },

    toast(text, kind) {
      const box = $('toasts');
      const el = document.createElement('div');
      el.className = 'toast ' + (kind || '');
      el.textContent = text;
      box.appendChild(el);
      while (box.children.length > 3) box.firstChild.remove();
      setTimeout(() => el.remove(), 3300);
    },

    achievement(a) {
      this.toast('🏆 ' + t('achievementUnlocked') + ': ' + t('ach_' + a.id) + '  +' + a.reward + ' ◆', 'gold');
      GS.Audio.play('unlock');
    },

    tutorial() {
      if (document.querySelector('.tutorial')) return;
      const el = document.createElement('div');
      el.className = 'tutorial';
      const touch = GS.isTouch();
      el.innerHTML = `<p>${t('ht_steer')}</p><p>${t('ht_jump')}</p><p>${t('ht_tricks')}</p><p>${t('ht_switch')}</p>` +
        (touch ? '' : `<p class="small">${t('ht_keyboard')}</p>`) + `<button class="btn btn-primary">OK</button>`;
      document.body.appendChild(el);
      el.querySelector('button').addEventListener('click', () => el.remove());
      setTimeout(() => el.remove(), 25000);
    },

    runStarted() { this.last.runName = null; this.last.noRun = false; },
    runEnded() { $('run-panel').classList.add('hidden'); },

    chName(ch) {
      const base = t('ct_' + ch.type);
      if (ch.piste && ['paraglide', 'precision', 'skijump', 'freeride', 'airtime'].indexOf(ch.type) < 0) return base + ' · ' + ch.piste.name;
      return base;
    },

    _goalText(ch, i) {
      const v = ch.medals[i];
      if (ch.metric === 'place') return v + '.';
      if (ch.metric === 'gap') return i === 2 ? t('winBy') : '+' + GS.fmtTime(v);
      if (ch.metric === 'margin') return i === 0 ? '✓' : '+' + GS.fmtTime(v);
      return GS.Challenges.fmtValue(ch, v);
    },

    _goalsHtml(ch, tier) {
      return [0, 1, 2].map((i) => `<div class="${tier > i ? 'got' : ''}">${GS.Art.medalSvg(i + 1, 22)}<span>${this._goalText(ch, i)}</span></div>`).join('');
    },

    showCard(ch, onStart, onClose) {
      const g = this.game;
      $('card-challenge').classList.remove('hidden');
      $('hud').classList.add('hidden');
      $('ch-icon').style.background = ch.color;
      $('ch-icon').textContent = GS.Art.typeGlyph(ch.type);
      $('ch-name').textContent = this.chName(ch);
      $('ch-type').textContent = g.world.def.name + (ch.piste && ch.piste.diff ? ' · ' + t({ green: 'pisteEasy', blue: 'pisteMed', red: 'pisteHard', black: 'pisteExpert' }[ch.piste.diff]) : '');
      $('ch-desc').textContent = t('cd_' + ch.type);
      const tier = GS.Progress.medal(ch.id);
      $('ch-goals').innerHTML = this._goalsHtml(ch, tier);
      const best = GS.Progress.best(ch.id);
      $('ch-best').textContent = best != null ? t('bestResult') + ': ' + GS.Challenges.fmtValue(ch, best) : '';
      const locked = g.challengeLocked(ch);
      $('ch-locked').classList.toggle('hidden', !locked);
      if (locked) $('ch-locked').textContent = '🔒 ' + t('requires') + ' ' + locked.name + ' (' + GS.Progress.liftNeed(g.world.def, locked) + ' 🎫)';
      $('ch-start').disabled = !!locked;
      $('ch-start').style.opacity = locked ? 0.5 : 1;
      $('ch-start').onclick = () => { if (!locked) { GS.Audio.unlock(); GS.Audio.play('ui'); $('card-challenge').classList.add('hidden'); onStart(); } };
      $('ch-close').onclick = () => { $('card-challenge').classList.add('hidden'); onClose(); };
    },

    showResult(ch, result, tier, rec, actions) {
      $('card-result').classList.remove('hidden');
      $('hud').classList.add('hidden');
      $('res-medal').innerHTML = GS.Art.medalSvg(tier, 92);
      $('res-medal').style.animation = 'none';
      void $('res-medal').offsetWidth;
      $('res-medal').style.animation = '';
      $('res-title').textContent = !result.ok ? t('res_failed') + ' – ' + t('fail_' + result.reason) : tier ? t(['', 'bronze', 'silver', 'gold'][tier]) + '!' : t('noMedal');
      let val = result.ok ? GS.Challenges.fmtValue(ch, result.value) : '–';
      if (result.ok && ch.metric === 'gap') val = result.value <= 0 ? '🏁 ' + t('winBy') + ' ' + GS.fmtTime(-result.value) : '+' + GS.fmtTime(result.value);
      if (result.ok && ch.metric === 'margin') val = t('avalancheLead') + ' ' + GS.fmtTime(Math.max(0, result.value));
      $('res-value').textContent = val;
      $('res-best').classList.toggle('hidden', !rec.isBest);
      const gains = [];
      if (rec.passes) gains.push(`<div class="pill"><span class="ico">🎫</span><b>+${rec.passes}</b></div>`);
      if (rec.credits) gains.push(`<div class="pill"><span class="ico coin">◆</span><b>+${rec.credits}</b></div>`);
      $('res-gains').innerHTML = gains.join('');
      $('res-goals').innerHTML = this._goalsHtml(ch, GS.Progress.medal(ch.id));
      $('res-next').onclick = () => { $('card-result').classList.add('hidden'); actions.next(); };
      $('res-retry').onclick = () => { $('card-result').classList.add('hidden'); actions.retry(); };
    },

    // ---------- Map ---------------------------------------------------------------
    openMap(game) {
      this.show('map');
      const c = $('map-canvas');
      this.map = new GS.MapView(c, game);
      this.map.fit();
      this.map.zoom = 1;
      $('map-title').textContent = t('map_title') + ' · ' + game.world.def.name;
      const st = GS.Progress.mountainStats(game.world.def);
      $('map-legend').innerHTML =
        `<div><i style="background:#2a9d4f"></i>${t('pisteEasy')} <i style="background:#2f6feb;margin-left:8px"></i>${t('pisteMed')}</div>` +
        `<div><i style="background:#e63946"></i>${t('pisteHard')} <i style="background:#1b1f24;margin-left:8px"></i>${t('pisteExpert')}</div>` +
        `<div>🎫 ${st.passes}/${st.max} · ✿ ${t('edelweiss')} ${st.found}/5 · 🥇 ${st.gold}/${st.total}</div>`;
      $('map-pop').classList.add('hidden');
      this.map.draw();
      if (!this._mapBound) this._bindMap(c);
    },

    _mapZoom(f) {
      if (!this.map) return;
      this.map.zoom = GS.clamp(this.map.zoom * f, 1, 6);
      this.map.draw();
    },

    _bindMap(c) {
      this._mapBound = true;
      let drag = null;
      const pts = new Map();
      c.addEventListener('pointerdown', (e) => {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        drag = { x: e.clientX, y: e.clientY, moved: 0 };
        if (pts.size === 2) { const [a, b] = [...pts.values()]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      });
      c.addEventListener('pointermove', (e) => {
        if (!drag || !this.map) return;
        const prev = pts.get(e.pointerId);
        if (!prev) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2 && drag.pinch) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          this.map.zoom = GS.clamp(this.map.zoom * (d / drag.pinch), 1, 6);
          drag.pinch = d;
          drag.moved += 10;
        } else {
          const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
          drag.moved += Math.abs(dx) + Math.abs(dy);
          this.map.cx -= dx / this.map.scale;
          this.map.cz -= dy / this.map.scale;
        }
        this.map.draw();
      });
      const up = (e) => {
        pts.delete(e.pointerId);
        if (drag && drag.moved < 8 && this.map) {
          const r = c.getBoundingClientRect();
          this._mapTap(e.clientX - r.left, e.clientY - r.top);
        }
        if (!pts.size) drag = null;
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', () => { pts.clear(); drag = null; });
      c.addEventListener('wheel', (e) => { e.preventDefault(); this._mapZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
      window.addEventListener('resize', () => { if (this.map && this.current === 'map') { this.map.fit(); this.map.draw(); } });
    },

    _mapTap(x, y) {
      const h = this.map.hit(x, y);
      const pop = $('map-pop');
      this.map.sel = h;
      this.map.draw();
      if (!h) { pop.classList.add('hidden'); return; }
      const g = this.game;
      pop.classList.remove('hidden');
      if (h.kind === 'lift') {
        const l = h.l;
        const need = GS.Progress.liftNeed(g.world.def, l);
        pop.innerHTML = `<h3>${escapeHtml(l.name)}</h3><p class="small muted">${h.top ? '⬆ Bergstation / top station' : '⬇ Talstation / bottom station'}</p>` +
          (h.ok ? `<button class="btn btn-primary" id="mp-go">${t('fastTravel')}</button>` : `<p class="locked-note">🔒 ${need} 🎫 ${t('need')}</p>`);
        const b = $('mp-go');
        if (b) b.onclick = () => { this.closeMap(true); g.travelToLift(l, h.top); };
      } else {
        const ch = h.ch;
        const tier = GS.Progress.medal(ch.id);
        pop.innerHTML = `<h3>${escapeHtml(this.chName(ch))}</h3><p class="small">${t('cd_' + ch.type)}</p><div class="medal-goals">${this._goalsHtml(ch, tier)}</div>` +
          (h.locked ? `<p class="locked-note">🔒 ${t('requires')} ${escapeHtml(h.locked.name)}</p>` : `<button class="btn btn-primary" id="mp-go">${t('fastTravel')}</button>`);
        const b = $('mp-go');
        if (b) b.onclick = () => {
          this.closeMap(true);
          const st = ch.start;
          const back = 9;
          g.travelTo(st.x - Math.sin(st.heading) * back, st.z - Math.cos(st.heading) * back, st.heading);
          g.cardLock = null;
        };
      }
    },

    closeMap(silent) {
      this.map = null;
      if (!silent) this.game.resume();
      else this.show(null);
    },

    // ---------- Mountains ------------------------------------------------------------
    _renderMountains() {
      const list = $('mountain-list');
      list.innerHTML = '';
      const cur = this.game.world ? this.game.world.def.id : null;
      GS.MOUNTAINS.forEach((m) => {
        const open = GS.Progress.mountainUnlocked(m);
        const st = GS.Progress.mountainStats(m);
        const b = document.createElement('button');
        b.className = 'm-card' + (open ? '' : ' locked') + (m.id === cur ? ' current' : '');
        const dots = [1, 2, 3, 4].map((i) => `<i class="${i <= m.diff ? 'on' : ''}"></i>`).join('');
        b.innerHTML = `<canvas></canvas>${open ? '' : `<span class="lock">🔒 ${m.unlock} 🎫</span>`}<div class="m-body"><h3>${m.name}</h3>` +
          `<div class="m-meta"><span>${escapeHtml(GS.tl(m.region))}</span><span class="diff">${dots}</span></div>` +
          `<div class="m-meta"><span>🥇 ${st.gold}/${st.total}</span><span>🎫 ${st.passes}/${st.max}</span><span>✿ ${st.found}/5</span></div>` +
          `<div class="prog-bar"><i style="width:${Math.round((st.passes / st.max) * 100)}%"></i></div>` +
          `<p class="small muted" style="margin:2px 0 0">${escapeHtml(GS.tl(m.desc))}</p></div>`;
        list.appendChild(b);
        requestAnimationFrame(() => GS.Art.mountainCard(b.querySelector('canvas'), m));
        b.addEventListener('click', () => {
          if (!open) { this.toast('🔒 ' + m.unlock + ' 🎫 ' + t('need'), 'bad'); return; }
          GS.Audio.unlock();
          GS.Audio.play('ui');
          this.stack = [];
          this.game.loadMountain(m.id, 'play');
        });
      });
    },

    // ---------- Gear -----------------------------------------------------------------
    _renderGear() {
      const tabs = $('gear-tabs');
      this.gearCat = this.gearCat || 'jacket';
      tabs.innerHTML = '';
      for (const c of GS.CATS) {
        const b = document.createElement('button');
        b.textContent = t('cat_' + c);
        b.className = c === this.gearCat ? 'on' : '';
        b.onclick = () => { this.gearCat = c; this._renderGear(); };
        tabs.appendChild(b);
      }
      const seg = $('sport-seg');
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b.dataset.sport === GS.Progress.data.sport);
        b.onclick = () => {
          GS.Progress.data.sport = b.dataset.sport;
          GS.Progress.save();
          this.game.refreshSettings();
          this._renderGear();
        };
      });
      const items = $('gear-items');
      items.innerHTML = '';
      const d = GS.Progress.data;
      for (const it of GS.CATALOG.filter((i) => i.cat === this.gearCat)) {
        const owned = GS.Progress.owns(it.id);
        const eq = d.equip[it.cat] === it.id;
        const el = document.createElement('button');
        el.className = 'item' + (eq ? ' equipped' : '') + (owned ? '' : ' locked');
        const icon = it.hat === 'beanie' ? '🧶' : it.hat === 'cap' ? '🧢' : it.extra === 'cape' ? '🦸' : it.extra === 'backpack' ? '🎒' : it.extra === 'scarf' ? '🧣' : '';
        el.innerHTML = `<div class="sw" style="background:${it.color}">${icon ? `<span style="font-size:1.6rem;line-height:54px">${icon}</span>` : ''}</div><b>${escapeHtml(GS.tl(it.name))}</b>` +
          `<span class="price">${eq ? t('equipped') : owned ? t('equip') : '◆ ' + GS.fmtInt(it.price)}</span>`;
        el.onclick = () => {
          if (!owned) {
            if (!GS.Progress.buy(it)) { this.toast(t('notEnough'), 'bad'); return; }
            GS.Audio.play('bank');
          } else GS.Audio.play('ui');
          GS.Progress.equip(it);
          this.game.refreshSettings();
          this._renderGear();
        };
        items.appendChild(el);
      }
      document.querySelectorAll('.v-credits').forEach((e) => { e.textContent = GS.fmtInt(GS.Progress.credits); });
      this._startPreview();
    },

    _startPreview() {
      const c = $('gear-canvas');
      if (!this.preview) {
        try { this.preview = new GS.Preview(c); } catch (e) { this.preview = null; }
      }
      if (this.preview) this.preview.start(() => ({ gear: GS.Progress.gear(), board: GS.Progress.data.sport === 'board' }));
      else GS.Art.gearPreview(c, GS.Progress.gear(), GS.Progress.data.sport === 'board');
    },

    // ---------- Achievements -------------------------------------------------------------
    _renderAchievements() {
      const d = GS.Progress.data, s = d.stats;
      let medals = 0;
      for (const k in d.medals) if (d.medals[k]) medals++;
      const h = Math.floor(s.playTime / 3600), mi = Math.floor((s.playTime % 3600) / 60);
      const stats = [
        ['stat_dist', (s.dist / 1000).toFixed(1).replace('.', GS.settings.lang === 'de' ? ',' : '.') + ' km'],
        ['stat_top', GS.fmtSpeed(s.topSpeed)], ['stat_air', s.bestAir.toFixed(2) + ' s'], ['stat_combo', GS.fmtInt(s.bestCombo)],
        ['stat_tricks', GS.fmtInt(s.tricks)], ['stat_crashes', GS.fmtInt(s.crashes)], ['stat_lifts', GS.fmtInt(s.lifts)],
        ['stat_medals', medals], ['stat_time', h + ' h ' + mi + ' min'],
      ];
      $('stats').innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${t(k)}</span></div>`).join('');
      $('ach-list').innerHTML = GS.ACHIEVEMENTS.map((a) => {
        const done = !!d.achievements[a.id];
        return `<div class="ach ${done ? 'done' : 'todo'}"><div class="ai">${done ? '🏆' : '🔒'}</div><div><b>${t('ach_' + a.id)}</b><small>${t('achd_' + a.id)} · +${a.reward} ◆</small></div></div>`;
      }).join('');
    },

    // ---------- Settings ---------------------------------------------------------------
    _seg(id, options, get, set) {
      const el = $(id);
      el.innerHTML = '';
      for (const [val, label] of options) {
        const b = document.createElement('button');
        b.textContent = label;
        b.dataset.v = val;
        b.onclick = () => { set(val); GS.saveSettings(); this._segSync(el, get()); GS.Audio.play('ui'); };
        el.appendChild(b);
      }
      this._segSync(el, get());
    },

    _segSync(el, v) {
      el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(b.dataset.v) === String(v)));
    },

    _settingsInit() {
      const s = GS.settings;
      $('set-music').addEventListener('input', (e) => { s.music = +e.target.value; GS.saveSettings(); GS.Audio.applySettings(); });
      $('set-sfx').addEventListener('input', (e) => { s.sfx = +e.target.value; GS.saveSettings(); GS.Audio.applySettings(); });
      $('set-haptics').addEventListener('change', (e) => { s.haptics = e.target.checked; GS.saveSettings(); });
      $('set-assist').addEventListener('change', (e) => { s.assist = e.target.checked; GS.saveSettings(); });
      $('set-unlock').addEventListener('change', (e) => { s.unlockAll = e.target.checked; GS.saveSettings(); this._refreshTitle(); });
      let armed = false;
      $('btn-reset').addEventListener('click', () => {
        if (!armed) { armed = true; this.toast(t('resetConfirm'), 'bad'); setTimeout(() => { armed = false; }, 4000); return; }
        armed = false;
        GS.Progress.reset();
        this.toast(t('resetDone'), 'info');
        this.game.refreshSettings();
      });
    },

    _settingsSync() {
      const s = GS.settings;
      $('set-music').value = s.music;
      $('set-sfx').value = s.sfx;
      $('set-haptics').checked = s.haptics;
      $('set-assist').checked = s.assist !== false;
      $('set-unlock').checked = !!s.unlockAll;
      this._seg('seg-control', [['sides', t('ctrl_sides')], ['aim', t('ctrl_aim')], ['buttons', t('ctrl_buttons')]], () => s.control, (v) => { s.control = v; this._applyControlMode(); });
      this._seg('seg-quality', [['auto', t('q_auto')], ['low', t('q_low')], ['med', t('q_med')], ['high', t('q_high')]], () => s.quality, (v) => { s.quality = v; this.game.refreshSettings(); });
      this._seg('seg-units', [['kmh', 'km/h'], ['mph', 'mph']], () => s.units, (v) => { s.units = v; });
      this._seg('seg-lang', [['de', 'Deutsch'], ['en', 'English']], () => s.lang, (v) => { s.lang = v; GS.applyI18n(); this._settingsSync(); this._modesSync(); });
    },

    _modesInit() {
      $('set-zen').addEventListener('change', (e) => { GS.settings.zen = e.target.checked; GS.saveSettings(); this.game.refreshSettings(); });
    },

    _modesSync() {
      const s = GS.settings;
      $('set-zen').checked = !!s.zen;
      this._seg('seg-tod', [['default', t('tod_default')], ['auto', t('tod_auto')], ['morning', t('tod_morning')], ['noon', t('tod_noon')], ['evening', t('tod_evening')], ['night', t('tod_night')]],
        () => s.timeOfDay, (v) => { s.timeOfDay = v; this.game.refreshSettings(); });
      this._seg('seg-weather', [['auto', t('w_auto')], ['dynamic', t('w_dynamic')], ['clear', t('w_clear')], ['cloudy', t('w_cloudy')], ['snow', t('w_snow')], ['fog', t('w_fog')], ['storm', t('w_storm')]],
        () => s.weather, (v) => { s.weather = v; this.game.refreshSettings(); });
      this._seg('seg-npc', [[0, t('npc_none')], [0.5, t('npc_few')], [1, t('npc_normal')], [2, t('npc_many')]], () => s.npcDensity, (v) => { s.npcDensity = +v; this.game.refreshSettings(); });
    },

    _applyControlMode() {
      const playing = this.current === null;
      const btns = GS.settings.control === 'buttons';
      $('touch-buttons').classList.toggle('hidden', !(playing && btns));
      const hint = $('hint-keys');
      const desktop = !GS.isTouch();
      hint.classList.toggle('hidden', !(playing && desktop && !btns));
      if (desktop && !hint.innerHTML) {
        hint.innerHTML = GS.settings.lang === 'de'
          ? '<kbd>←</kbd><kbd>→</kbd> lenken · <kbd>Leer</kbd> Sprung/Grab · <kbd>↑</kbd><kbd>↓</kbd> Flips · <kbd>C</kbd> 180° · <kbd>E</kbd> Lift · <kbd>M</kbd> Karte'
          : '<kbd>←</kbd><kbd>→</kbd> steer · <kbd>Space</kbd> jump/grab · <kbd>↑</kbd><kbd>↓</kbd> flips · <kbd>C</kbd> 180° · <kbd>E</kbd> lift · <kbd>M</kbd> map';
      }
    },
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  GS.UI = UI;
})(window.GS);
