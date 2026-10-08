'use strict';
(function (GS) {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById('game');
  GS.Progress.load();
  let game;
  try {
    game = new GS.Game(canvas, GS.UI);
  } catch (e) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;text-align:center"><h2>WebGL 2 wird benötigt</h2><p>Bitte aktualisiere deinen Browser (Safari 15+, Chrome, Firefox, Edge).</p></div>';
    return;
  }
  GS.game = game;
  GS.UI.init(game);

  GS.Input.attach(canvas, {
    onDown() { GS.Audio.unlock(); },
    // free camera panning in observe mode
    onDrag(dx, dy, n) {
      if (game.state !== 'observe' || !game.camera.free) return false;
      const f = game.camera.free;
      if (n === 1) {
        const k = f.dist / 520;
        f.x = GS.clamp(f.x - dx * k, 0, game.world.W);
        f.z = GS.clamp(f.z - dy * k * 1.3, 0, game.world.L);
      }
      return true;
    },
  });

  window.addEventListener('resize', () => game.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => game.resize(), 200));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.pause();
      GS.Audio.suspend();
      GS.Progress.save();
    } else {
      GS.Audio.resume();
    }
  });
  window.addEventListener('pagehide', () => GS.Progress.save());
  const unlock = () => { GS.Audio.unlock(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Boot: build the last mountain behind the title screen.
  const start = params.get('m') || GS.Progress.data.lastMountain || 'sonnalm';
  const def = GS.mountainById(start);
  const first = GS.Progress.mountainUnlocked(def) || params.get('m') ? def.id : 'sonnalm';
  const mode = params.get('play') ? 'play' : params.get('observe') ? 'observe' : null;
  game.loadMountain(first, mode).then(() => {
    if (!mode) GS.UI.show('title');
    if (params.get('hour')) { game.env.hour = +params.get('hour'); game.env.dynamicTime = false; }
    if (params.get('weather')) game.env.setWeather(params.get('weather'), true);
    if (params.get('bot')) game.bot = true;
    if (params.get('ch') != null && game.world.challenges[+params.get('ch')]) {
      game.startChallenge(game.world.challenges[+params.get('ch')]);
    }
    document.title = document.title.replace(/ ·.*/, '');
    window.__ready = true;
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !params.get('nosw') && !params.get('m')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})(window.GS);
