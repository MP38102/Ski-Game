// Stand-in for the CrazyGames SDK v3 used by test.mjs: records every call
// in window.__cg.calls and simulates ads (finish, error or no answer).
(function () {
  const calls = [];
  const store = {};
  const listeners = [];
  window.__cg = { calls, store, listeners, adMode: 'finish' };
  const log = (n, a) => calls.push(a !== undefined ? n + ':' + a : n);
  window.CrazyGames = {
    SDK: {
      environment: 'local',
      init: async () => log('init'),
      game: {
        settings: { muteAudio: false, disableChat: false },
        addSettingsChangeListener: (f) => listeners.push(f),
        loadingStart: () => log('loadingStart'),
        loadingStop: () => log('loadingStop'),
        gameplayStart: () => log('gameplayStart'),
        gameplayStop: () => log('gameplayStop'),
        happytime: () => log('happytime'),
      },
      ad: {
        hasAdblock: async () => false,
        requestAd: (type, cb) => {
          log('requestAd', type);
          if (window.__cg.adMode === 'error') { setTimeout(() => cb.adError('No ad available'), 50); return; }
          if (window.__cg.adMode === 'hang') return;
          cb.adStarted && cb.adStarted();
          setTimeout(() => cb.adFinished && cb.adFinished(), 200);
        },
      },
      data: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); log('setItem', k); },
        removeItem: (k) => { delete store[k]; },
        clear: () => {},
      },
      user: { getUser: async () => null },
    },
  };
})();
