'use strict';
// DOM screens and HUD. The canvas keeps rendering the mountain behind every
// screen; screens only ever cover it with a dim layer or a card.
(function (AR) {
  const $ = (id) => document.getElementById(id);
  const SCREENS = ['loading', 'title', 'pause', 'continue', 'over', 'shop', 'settings', 'gift'];

  let game = null;
  let current = null;
  const stack = [];
  let shownAt = 0;
  let toastTimer = null;
  let shopTab = 'riders';
  const hudCache = {};
  let hintKey = null;
  let busy = false;

  function setText(id, v) {
    if (hudCache[id] === v) return;
    hudCache[id] = v;
    $(id).textContent = v;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function hiDpiCanvas(w, h) {
    const c = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    return { c, g };
  }

  const UI = {
    get current() { return current; },

    init(g) {
      game = g;
      const on = (id, fn) => $(id).addEventListener('click', (e) => {
        AR.Audio.unlock();
        AR.Audio.sfx.click();
        fn(e);
      });

      on('btn-play', () => UI.play());
      on('btn-shop', () => UI.open('shop'));
      on('btn-settings', () => UI.open('settings'));
      on('btn-pause', () => game.pause());
      on('btn-resume', () => game.resume());
      on('btn-p-settings', () => UI.open('settings'));
      on('btn-endrun', () => game.quitRun());
      on('btn-continue', () => game.acceptContinue());
      on('btn-nothanks', () => game.declineContinue());
      on('btn-again', () => UI.again());
      on('btn-o-shop', () => UI.open('shop'));
      on('btn-o-menu', () => UI.toMenu());
      on('btn-double', async () => {
        const b = $('btn-double');
        b.disabled = true;
        const ok = await game.doubleCoins();
        if (ok) {
          b.querySelector('span').textContent = AR.t('doubled');
          setText('o-coins', '+' + AR.fmt(game.stats.coins * 2));
        } else b.disabled = false;
      });
      on('btn-gift', () => {
        const got = AR.Progress.claimGift();
        if (got) {
          AR.Audio.sfx.buy();
          UI.toast('+' + AR.fmt(got), 'mission');
        }
        UI.show('title');
      });
      document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => {
        AR.Audio.sfx.click();
        UI.back();
      }));
      document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
        AR.Audio.sfx.click();
        shopTab = b.dataset.tab;
        UI.renderShop();
      }));
      document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
        AR.Audio.sfx.click();
        AR.Progress.data.settings.lang = b.dataset.lang;
        AR.Progress.save();
        AR.setLang(b.dataset.lang);
        UI.renderSettings();
        UI.renderTitle();
      }));
      ['music', 'sfx'].forEach((k) => {
        $('set-' + k).addEventListener('change', (e) => {
          AR.Progress.data.settings[k] = e.target.checked;
          AR.Progress.save();
          AR.Audio.apply();
        });
      });

      window.addEventListener('keydown', (e) => {
        const confirm = e.code === 'Space' || e.code === 'Enter';
        if (e.code === 'Escape' && (current === 'shop' || current === 'settings')) UI.back();
        else if (confirm && current === 'title' && !e.repeat) UI.play();
        else if (confirm && current === 'over' && !e.repeat && performance.now() - shownAt > 700) UI.again();
        else if (confirm && current === 'gift' && !e.repeat) $('btn-gift').click();
      });

      AR.Platform.onMuteChange(() => {
        AR.Audio.apply();
        if (current === 'settings') UI.renderSettings();
      });
      AR.Platform.onAd((playing) => AR.Audio.setAdMuted(playing));

      // power-up HUD slots
      for (const type of ['magnet', 'shield']) {
        const box = el('div', 'power hidden');
        box.id = 'pw-' + type;
        const { c, g: ctx } = hiDpiCanvas(40, 40);
        AR.drawPowerIcon(ctx, type, 20, 20, 1.1);
        box.appendChild(c);
        box.appendChild(el('i'));
        $('hud-powers').appendChild(box);
      }
    },

    // ---------- navigation ----------
    show(name) {
      stack.length = 0;
      UI._display(name);
    },
    open(name) {
      if (current) stack.push(current);
      UI._display(name);
    },
    back() {
      UI._display(stack.pop() || 'title');
    },
    _display(name) {
      current = name;
      shownAt = performance.now();
      for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
      if (name === 'title') UI.renderTitle();
      if (name === 'shop') UI.renderShop();
      if (name === 'settings') UI.renderSettings();
      if (name === 'gift') UI.renderGift();
      // The rewarded "Continue" button is never pre-focused: a video only
      // plays after a deliberate click or tap.
      const focus = { title: 'btn-play', pause: 'btn-resume', over: 'btn-again', gift: 'btn-gift' }[name];
      if (focus) $(focus).focus({ preventScroll: true });
    },

    play() {
      if (busy) return;
      UI.show(null);
      game.startRun();
    },
    async again() {
      if (busy) return;
      busy = true;
      UI.setOverButtons(false);
      await game.breakAd();
      busy = false;
      UI.setOverButtons(true);
      UI.show(null);
      game.startRun();
    },
    async toMenu() {
      if (busy) return;
      busy = true;
      UI.setOverButtons(false);
      await game.breakAd();
      busy = false;
      UI.setOverButtons(true);
      game.attract();
      UI.showTitle();
    },
    setOverButtons(on) {
      ['btn-again', 'btn-o-shop', 'btn-o-menu'].forEach((id) => { $(id).disabled = !on; });
    },
    showTitle() {
      if (AR.Progress.giftAvailable() && AR.Progress.data.runs > 0) UI.show('gift');
      else UI.show('title');
    },

    // ---------- HUD ----------
    showHud(on) {
      $('hud').classList.toggle('hidden', !on);
      if (!on) $('hud-avalanche').classList.add('hidden');
    },
    updateHud(g) {
      const st = g.stats;
      setText('hud-dist', AR.fmt(Math.floor(st.dist)));
      setText('hud-coins', AR.fmt(st.coins));
      setText('hud-score', AR.fmt(st.score));
      const comboOn = g.mult > 1;
      const combo = $('hud-combo');
      if (comboOn !== hudCache.comboOn) {
        hudCache.comboOn = comboOn;
        combo.classList.toggle('hidden', !comboOn);
      }
      if (comboOn) {
        if (hudCache.mult !== g.mult) {
          combo.classList.remove('bump');
          void combo.offsetWidth;
          combo.classList.add('bump');
        }
        setText('hud-mult', String(g.mult));
        $('hud-combo-bar').style.transform = `scaleX(${AR.clamp(g.comboT / 2.6, 0, 1).toFixed(3)})`;
      }
      hudCache.mult = g.mult;
      const r = g.rider;
      const up = AR.Progress.data.up;
      for (const [type, t, max] of [['magnet', r.magnetT, AR.upgradeValue('magnet', up.magnet)], ['shield', r.shieldT, AR.upgradeValue('shield', up.shield)]]) {
        const box = $('pw-' + type);
        const vis = t > 0;
        if (box.classList.contains('hidden') === vis) box.classList.toggle('hidden', !vis);
        if (vis) box.lastChild.style.width = ((t / max) * 100).toFixed(1) + '%';
      }
      const warn = $('hud-avalanche');
      const show = g.danger > 0.2;
      if (warn.classList.contains('hidden') === show) warn.classList.toggle('hidden', !show);
      if (show) {
        setText('hud-av-dist', Math.round(g.avalancheGapM) + ' m');
        warn.classList.toggle('critical', g.danger > 0.7);
      }
    },
    setHint(key) {
      if (key === hintKey) return;
      hintKey = key;
      const h = $('hint');
      if (!key) {
        h.classList.add('hidden');
        return;
      }
      h.textContent = AR.t(key);
      h.classList.remove('hidden');
      h.style.animation = 'none';
      void h.offsetWidth;
      h.style.animation = '';
    },

    toast(msg, kind) {
      const t = $('toast');
      t.textContent = msg;
      t.className = 'toast' + (kind ? ' ' + kind : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
    },

    // ---------- continue ----------
    showContinue(reason) {
      $('c-title').textContent = AR.t('r_' + reason);
      UI.setContinueLoading(false);
      UI.setContinueTimer(1);
      UI.showHud(false);
      UI.show('continue');
    },
    setContinueLoading(on) {
      $('btn-continue').disabled = on;
      $('btn-nothanks').disabled = on;
      $('c-sub').textContent = AR.t(on ? 'loadingVideo' : 'watchVideo');
    },
    setContinueTimer(f) {
      $('c-timer').style.transform = `scaleX(${AR.clamp(f, 0, 1).toFixed(3)})`;
    },

    // ---------- game over ----------
    showOver(res) {
      const st = res.stats;
      $('o-title').textContent = AR.t('r_' + (res.reason || 'landing'));
      $('o-newbest').classList.toggle('hidden', !res.newBest);
      $('o-score').textContent = AR.fmt(st.score);
      $('o-dist').textContent = AR.fmt(Math.floor(st.dist)) + ' m';
      $('o-flips').textContent = AR.fmt(st.flips);
      $('o-combo').textContent = '×' + Math.max(1, st.combo);
      hudCache['o-coins'] = null;
      setText('o-coins', '+' + AR.fmt(st.coins));
      const dbl = $('btn-double');
      dbl.classList.toggle('hidden', !res.canDouble);
      dbl.disabled = false;
      dbl.querySelector('span').textContent = AR.t('doubleCoins');
      const rk = $('o-rankup');
      rk.classList.toggle('hidden', !res.rankBonus);
      if (res.rankBonus) rk.textContent = AR.t('rankUp', { n: AR.Progress.data.missions.rank, bonus: res.rankBonus });
      UI.renderMissions($('o-missions'), res.rankBonus ? [] : res.missionsDone.map((m) => m.id));
      UI.setOverButtons(true);
      UI.show('over');
    },

    // ---------- title & missions ----------
    renderTitle() {
      const d = AR.Progress.data;
      $('t-best').textContent = AR.fmt(d.best);
      $('t-coins').textContent = AR.fmt(d.coins);
      $('t-rank').textContent = AR.t('rank', { n: d.missions.rank });
      UI.renderMissions($('t-missions'), []);
    },
    renderMissions(list, freshIds) {
      list.textContent = '';
      for (const a of AR.Progress.data.missions.active) {
        const li = el('li', a.done ? 'done' : '');
        if (freshIds.includes(a.id)) li.classList.add('fresh');
        li.appendChild(el('span', 'txt', AR.t('m_' + a.id, { n: a.target })));
        const rw = el('span', 'reward');
        if (a.done) rw.textContent = '✓ ';
        rw.appendChild(el('i', 'coin'));
        rw.appendChild(document.createTextNode(AR.fmt(a.reward)));
        li.appendChild(rw);
        const prog = el('span', 'prog');
        const bar = el('i');
        bar.style.width = ((a.progress / a.target) * 100).toFixed(1) + '%';
        prog.appendChild(bar);
        li.appendChild(prog);
        li.appendChild(el('span', 'count', AR.fmt(a.progress) + ' / ' + AR.fmt(a.target)));
        list.appendChild(li);
      }
    },

    // ---------- shop ----------
    renderShop() {
      const d = AR.Progress.data;
      $('s-coins').textContent = AR.fmt(d.coins);
      document.querySelectorAll('.tabs button').forEach((b) => {
        const on = b.dataset.tab === shopTab;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on);
      });
      const grid = $('s-grid');
      grid.textContent = '';
      if (shopTab === 'upgrades') {
        for (const u of AR.UPGRADES) grid.appendChild(UI.upgradeCard(u));
        return;
      }
      const kind = shopTab;
      for (const item of AR.Progress.listFor(kind)) grid.appendChild(UI.itemCard(kind, item));
    },

    itemCard(kind, item) {
      const P = AR.Progress;
      const owned = P.owns(kind, item.id);
      const eq = P.data.eq[P.eqKey(kind)] === item.id;
      const card = el('div', 'item' + (eq ? ' equipped' : ''));
      const { c, g } = hiDpiCanvas(150, 96);
      UI.drawPreview(g, kind, item, 150, 96);
      card.appendChild(c);
      card.appendChild(el('div', 'name', item.name));
      const need = el('div', 'need', '');
      const btn = el('button', 'btn');
      if (eq) {
        btn.textContent = AR.t('equipped');
        btn.classList.add('equipped-btn');
        btn.disabled = true;
        btn.style.opacity = 1;
        btn.style.filter = 'none';
      } else if (owned) {
        btn.textContent = AR.t('equip');
        btn.addEventListener('click', () => {
          AR.Audio.sfx.click();
          P.equip(kind, item.id);
          game.refreshLook();
          UI.renderShop();
        });
      } else {
        btn.classList.add('price');
        btn.appendChild(el('i', 'coin'));
        btn.appendChild(document.createTextNode(AR.fmt(item.price)));
        if (P.data.coins < item.price) {
          btn.disabled = true;
          need.textContent = AR.t('needMore', { n: item.price - P.data.coins });
        } else {
          btn.addEventListener('click', () => {
            if (P.buy(kind, item.id)) {
              AR.Audio.sfx.buy();
              game.refreshLook();
              UI.toast(AR.t('bought') + ' ' + item.name, 'mission');
              UI.renderShop();
            }
          });
        }
      }
      card.appendChild(need);
      card.appendChild(btn);
      return card;
    },

    upgradeCard(u) {
      const P = AR.Progress;
      const lvl = P.data.up[u.id];
      const card = el('div', 'item upgrade');
      const { c, g } = hiDpiCanvas(56, 56);
      if (u.id === 'balance') {
        g.translate(28, 36);
        g.rotate(-0.25);
        g.scale(0.62, 0.62);
        AR.drawBoard(g, P.equipped('boards'), 0);
        g.setTransform(1, 0, 0, 1, 0, 0);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        g.scale(dpr, dpr);
        g.strokeStyle = '#FF6B2C';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(28, 36, 20, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      } else AR.drawPowerIcon(g, u.id, 28, 28, 1.6);
      card.appendChild(c);
      const val = AR.upgradeValue(u.id, lvl);
      card.appendChild(el('div', 'name', AR.t('up_' + u.id)));
      const price = P.upgradePrice(u.id);
      const unit = (v) => (u.unit === 's' ? v + ' s' : '+' + v + '°');
      const now = val === 0 ? AR.t('up_' + u.id + '_d0') : AR.t('up_' + u.id + '_d', { v: val });
      const desc = now + (price != null ? ' · ' + AR.t('upNext', { v: unit(AR.upgradeValue(u.id, lvl + 1)) }) : '');
      card.appendChild(el('div', 'desc', desc));
      const pips = el('div', 'pips');
      for (let i = 0; i < u.prices.length; i++) pips.appendChild(el('i', i < lvl ? 'on' : ''));
      card.appendChild(pips);
      const btn = el('button', 'btn');
      if (price == null) {
        btn.textContent = AR.t('max');
        btn.disabled = true;
      } else {
        btn.classList.add('price');
        btn.appendChild(el('i', 'coin'));
        btn.appendChild(document.createTextNode(AR.fmt(price)));
        if (P.data.coins < price) {
          btn.disabled = true;
          btn.title = AR.t('needMore', { n: price - P.data.coins });
        } else {
          btn.addEventListener('click', () => {
            if (P.buyUpgrade(u.id)) {
              AR.Audio.sfx.buy();
              UI.renderShop();
            }
          });
        }
      }
      card.appendChild(btn);
      return card;
    },

    drawPreview(g, kind, item, w, h) {
      const P = AR.Progress;
      const rider = kind === 'riders' ? item : P.equipped('riders');
      const board = kind === 'boards' ? item : P.equipped('boards');
      // a short slope line for context
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.moveTo(0, h * 0.78);
      g.lineTo(w, h * 0.92);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.fill();
      if (kind === 'boards') {
        g.save();
        g.translate(w / 2, h * 0.62);
        g.rotate(-0.12);
        g.scale(1.75, 1.75);
        AR.drawBoard(g, board, 0.5);
        g.restore();
        return;
      }
      if (kind === 'trails') {
        for (let i = 0; i < 26; i++) {
          const t = i / 26;
          g.fillStyle = item.colors[i % item.colors.length];
          g.globalAlpha = 1 - t * 0.8;
          const x = w * 0.42 - t * w * 0.4;
          const y = h * 0.8 - Math.sin(t * 3) * 10 - (i % 3) * 3;
          if (item.sparkle && i % 2) g.fillRect(x - 2, y - 2, 4, 4);
          else {
            g.beginPath();
            g.arc(x, y, 4 - t * 2, 0, AR.TAU);
            g.fill();
          }
        }
        g.globalAlpha = 1;
      }
      g.save();
      g.translate(w * 0.55, h * 0.84);
      g.rotate(0.14);
      g.scale(1.25, 1.25);
      AR.drawRider(g, rider, board, { crouch: 0.25, arms: 'balance', t: 0.3, speed: 400 });
      g.restore();
    },

    // ---------- settings ----------
    renderSettings() {
      const s = AR.Progress.data.settings;
      const muted = AR.Platform.platformMuted();
      for (const k of ['music', 'sfx']) {
        const input = $('set-' + k);
        input.checked = s[k];
        input.disabled = muted;
        input.closest('.toggle').classList.toggle('locked', muted);
      }
      $('muted-note').classList.toggle('hidden', !muted);
      document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.lang === AR.lang));
    },

    // ---------- daily gift ----------
    renderGift() {
      const p = AR.Progress.giftPreview();
      $('g-streak').textContent = AR.t('giftStreak', { n: p.streak });
      $('g-amount').textContent = '+' + AR.fmt(p.coins);
      const days = $('g-days');
      days.textContent = '';
      for (let i = 1; i <= 7; i++) {
        const li = el('li', i <= p.streak ? 'on' : '', String(i));
        if (i === p.streak) li.classList.add('today');
        days.appendChild(li);
      }
    },
  };

  AR.UI = UI;
})(window.AR);
