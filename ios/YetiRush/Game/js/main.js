'use strict';
(function (YR) {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById('game');
  const game = new YR.Game(canvas, YR.UI);
  YR.game = game;
  YR.UI.init(game);
  YR.UI.show('title');

  YR.Input.attach(canvas, () => {
    if (game.state === 'play') game.pause();
    else if (game.state === 'paused') game.resume();
  });

  window.addEventListener('resize', () => game.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => game.resize(), 200));

  // Pause when the app goes to the background.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.pause();
      YR.Audio.suspend();
    } else {
      YR.Audio.resume();
    }
  });

  // Unlock audio on the very first touch anywhere (iOS requirement).
  const unlock = () => {
    YR.Audio.unlock();
    window.removeEventListener('pointerdown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);

  // Block pinch-zoom and double-tap zoom on iPadOS Safari.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // Demo hooks used for automated screenshots: ?autoplay=1&yeti=1
  if (params.get('autoplay')) {
    game.start();
    game.autopilotOn = true;
    game.s.y = 3200;
    game.s.speed = 420;
    game.bonus = 1840;
    game.combo = 13;
    YR.UI.show(null);
    if (params.get('yeti')) game.nextYetiM = 330;
  }

  // Offline support when running as a website / home-screen web app.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !params.get('demo')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})(window.YR);
