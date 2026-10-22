'use strict';
// Boot: CrazyGames SDK → save data → language → title screen.
(function (AR) {
  const canvas = document.getElementById('game');
  const renderer = new AR.Renderer(canvas);
  const game = new AR.Game(renderer, AR.UI);
  AR.game = game;
  AR.setLang('auto');

  AR.Input.attach(canvas, {
    pause: () => {
      if (game.state === 'run') game.pause();
      else if (game.state === 'paused' && AR.UI.current === 'pause') game.resume();
    },
    any: () => {
      AR.Audio.unlock();
      AR.Audio.startMusic();
    },
  });
  const unlock = () => {
    AR.Audio.unlock();
    AR.Audio.startMusic();
  };
  window.addEventListener('pointerdown', unlock, true);

  window.addEventListener('resize', () => renderer.resize());

  // Pause when the tab or the game iframe loses focus.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.pause();
      AR.Audio.suspend();
    } else AR.Audio.resume();
  });
  window.addEventListener('blur', () => game.pause());

  async function boot() {
    await AR.Platform.init();
    AR.Platform.loadingStart();
    AR.Progress.load();
    AR.setLang(AR.Progress.data.settings.lang);
    AR.UI.init(game);
    try {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    } catch (e) { /* fonts are optional */ }
    game.attract();
    AR.Platform.loadingStop();
    AR.UI.showTitle();
  }

  // ?capture=1 drives the game frame by frame (store screenshots and videos).
  if (AR.params.get('capture')) {
    AR.capture = {
      // Only the last frame is drawn, so fast-forwarding stays cheap.
      step(frames, dt) {
        for (let i = 0; i < frames; i++) {
          game.noRender = i < frames - 1;
          game.tick(dt || 1 / 30);
        }
        game.noRender = false;
      },
    };
  } else {
    const loop = (now) => {
      game.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  boot();
})(window.AR);
