'use strict';
// Optional web-portal integration (CrazyGames SDK v3). Every call is guarded,
// so the game behaves exactly the same when no SDK is loaded (iPad app, own website).
(function (YR) {
  let sdk = null;
  let playing = false;

  const safe = (fn) => {
    try { fn(); } catch (e) { /* SDK unavailable or call not supported */ }
  };

  YR.Platform = {
    name: 'none',

    async init() {
      const cg = window.CrazyGames && window.CrazyGames.SDK;
      if (!cg) return;
      try {
        await cg.init();
        sdk = cg;
        this.name = 'crazygames';
        document.documentElement.classList.add('portal');
        // Respect the portal's global mute switch.
        const s = sdk.game && sdk.game.settings;
        if (s && s.muteAudio) YR.Audio.setMuted(true);
        if (sdk.game && sdk.game.addSettingsChangeListener) {
          sdk.game.addSettingsChangeListener((ns) => YR.Audio.setMuted(!!(ns && ns.muteAudio)));
        }
      } catch (e) {
        sdk = null;
      }
    },

    loadingStart() { if (sdk) safe(() => sdk.game.loadingStart()); },
    loadingStop() { if (sdk) safe(() => sdk.game.loadingStop()); },

    gameplayStart() {
      if (sdk && !playing) safe(() => sdk.game.gameplayStart());
      playing = true;
    },

    gameplayStop() {
      if (sdk && playing) safe(() => sdk.game.gameplayStop());
      playing = false;
    },

    // Celebrate special moments (new best score).
    happytime() { if (sdk) safe(() => sdk.game.happytime()); },
  };
})(window.YR);
