'use strict';
(function (YR) {
  const $ = (id) => document.getElementById(id);
  const screens = ['title', 'howto', 'settings', 'pause', 'over'];
  const HEART = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.9 1.1 5.3 3 1.4-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="#E63946" stroke="#10263F" stroke-width="1.6"/><path d="M7 7.5c-1.6.2-2.6 1.7-2.3 3.2" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".7"/></svg>';

  const UI = {
    game: null,
    returnTo: 'title',
    lastHearts: -1,
    lastCombo: -1,

    init(game) {
      this.game = game;
      YR.applyI18n();
      this.refreshBest();
      this.syncSettings();

      const click = (id, fn) => $(id).addEventListener('click', (e) => {
        e.stopPropagation();
        YR.Audio.unlock();
        YR.Audio.sfx.click();
        fn();
      });

      click('btn-play', () => this.startGame());
      click('btn-again', () => this.startGame());
      click('btn-restart', () => this.startGame());
      click('btn-resume', () => game.resume());
      click('btn-pause', () => game.pause());
      click('btn-howto', () => { this.returnTo = 'title'; this.show('howto'); });
      click('btn-settings', () => { this.returnTo = 'title'; this.show('settings'); });
      click('btn-share', () => this.share());
      click('btn-reset', () => {
        YR.store.set('best', 0);
        this.refreshBest();
        this.toast(YR.t('resetDone'));
      });
      document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => {
        YR.Audio.sfx.click();
        this.show(this.returnTo);
      }));
      document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', () => {
        YR.Audio.sfx.click();
        this.goHome();
      }));

      ['music', 'sfx', 'haptics'].forEach((k) => {
        $('set-' + k).addEventListener('change', (e) => {
          YR.settings[k] = e.target.checked;
          YR.saveSettings();
          YR.Audio.unlock();
          YR.Audio.applySettings();
          if (k === 'haptics' && e.target.checked) YR.haptic('medium');
        });
      });
      document.querySelectorAll('[data-control]').forEach((b) => b.addEventListener('click', async () => {
        const mode = b.dataset.control;
        if (mode === 'tilt') {
          const ok = await YR.Input.requestTilt();
          if (!ok) return this.toast('⚠︎ ' + YR.t('tiltHint'));
          this.toast(YR.t('tiltHint'));
        }
        YR.settings.control = mode;
        YR.saveSettings();
        this.syncSettings();
      }));
    },

    syncSettings() {
      ['music', 'sfx', 'haptics'].forEach((k) => { $('set-' + k).checked = !!YR.settings[k]; });
      document.querySelectorAll('[data-control]').forEach((b) => b.classList.toggle('on', b.dataset.control === YR.settings.control));
    },

    refreshBest() {
      $('best-score').textContent = YR.fmt(YR.store.get('best', 0));
    },

    show(name) {
      screens.forEach((s) => $('screen-' + s).classList.toggle('hidden', s !== name));
      const inGame = name === null || name === 'pause' || name === 'over';
      $('hud').classList.toggle('hidden', !inGame || name === 'over');
    },

    async startGame() {
      YR.Audio.unlock();
      if (YR.settings.control === 'tilt') {
        await YR.Input.requestTilt();
        YR.Input.tiltZero = 0;
      }
      this.lastHearts = -1;
      this.lastCombo = -1;
      this.show(null);
      this.game.start();
      YR.Audio.startMusic();
    },

    goHome() {
      this.game.toTitle();
      this.refreshBest();
      this.show('title');
    },

    hud(d) {
      $('score').textContent = YR.fmt(d.score);
      $('meters').textContent = YR.fmt(d.meters) + ' m';
      if (d.hearts !== this.lastHearts) {
        this.lastHearts = d.hearts;
        let h = '';
        for (let i = 0; i < 3; i++) h += HEART.replace('<svg', `<svg class="${i < d.hearts ? '' : 'lost'}"`);
        $('hearts').innerHTML = h;
      }
      const combo = $('combo');
      if (d.mult > 1) {
        if (d.mult !== this.lastCombo) {
          $('mult').textContent = '×' + d.mult;
          combo.classList.remove('hidden');
          combo.style.animation = 'none';
          void combo.offsetWidth;
          combo.style.animation = '';
        }
      } else combo.classList.add('hidden');
      this.lastCombo = d.mult;
    },

    yetiWarning(on) {
      const b = $('yeti-banner');
      b.classList.toggle('hidden', !on);
      clearTimeout(this.bannerT);
      if (on) this.bannerT = setTimeout(() => b.classList.add('hidden'), 2600);
    },

    gameOver(r) {
      this.lastResult = r;
      $('over-title').textContent = r.reason === 'yeti' ? YR.t('eaten') : YR.t('gameOver');
      $('over-yeti').classList.toggle('hidden', r.reason !== 'yeti');
      $('new-best').classList.toggle('hidden', !r.isBest);
      $('st-distance').textContent = YR.fmt(r.meters) + ' m';
      $('st-crystals').textContent = YR.fmt(r.crystals);
      $('st-gates').textContent = YR.fmt(r.gates);
      $('st-tricks').textContent = YR.fmt(r.tricks);
      $('over-best').textContent = YR.fmt(r.best);
      $('btn-share').classList.toggle('hidden', !navigator.share && !navigator.clipboard);
      this.refreshBest();
      // Count the score up for a bit of drama
      const el = $('final-score');
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        el.textContent = YR.fmt(r.score * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(() => this.show('over'), 350);
    },

    async share() {
      const r = this.lastResult || { score: 0 };
      const text = YR.t('shareText', { score: YR.fmt(r.score) });
      try {
        if (navigator.share) await navigator.share({ title: 'Yeti Rush', text });
        else {
          await navigator.clipboard.writeText(text);
          this.toast('✓');
        }
      } catch (e) { /* user cancelled */ }
    },

    toast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.remove('hidden');
      clearTimeout(this.toastT);
      this.toastT = setTimeout(() => t.classList.add('hidden'), 1800);
    },
  };

  YR.UI = UI;
})(window.YR);
