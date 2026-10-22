'use strict';
// CrazyGames HTML5 SDK v3 integration.
//
// The game never talks to the SDK directly – every call goes through this
// wrapper, so the build keeps working when the SDK is missing (file://, ad
// blockers, offline, or hosted on another domain where the SDK reports the
// "disabled" environment and throws on every call).
//
// Used SDK surface (window.CrazyGames.SDK):
//   init(), environment
//   game.loadingStart/loadingStop, game.gameplayStart/gameplayStop, game.happytime
//   game.settings.muteAudio + game.addSettingsChangeListener
//   ad.requestAd('midgame' | 'rewarded', { adStarted, adFinished, adError })
//   ad.hasAdblock()
//   data.getItem/setItem (cloud save for signed-in players)
(function (AR) {
  const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
  const SAVE_KEY = 'avalancheRider.save';

  let sdk = null;
  let env = 'none';
  let gameplayOn = false;
  let loadingOn = false;
  let adPlaying = false;
  let adblock = false;
  const listeners = { mute: [], ad: [] };

  function loadScript(url, timeoutMs) {
    return new Promise((resolve) => {
      if (window.CrazyGames && window.CrazyGames.SDK) return resolve(true);
      if (location.protocol === 'file:' || AR.params.get('nosdk')) return resolve(false);
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      const timer = setTimeout(() => resolve(false), timeoutMs);
      s.onload = () => {
        clearTimeout(timer);
        resolve(!!(window.CrazyGames && window.CrazyGames.SDK));
      };
      s.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }

  function safe(fn) {
    if (!sdk) return undefined;
    try {
      return fn();
    } catch (e) {
      console.warn('[CrazyGames SDK]', e && e.message ? e.message : e);
      return undefined;
    }
  }

  const Platform = {
    get env() { return env; },
    get active() { return !!sdk; },
    get adPlaying() { return adPlaying; },

    async init() {
      const ok = await loadScript(SDK_URL, 6000);
      if (!ok) return;
      const candidate = window.CrazyGames.SDK;
      try {
        await candidate.init();
      } catch (e) {
        console.warn('[CrazyGames SDK] init failed', e);
        return;
      }
      env = candidate.environment || 'crazygames';
      // On foreign domains every SDK call throws – behave as if there is no SDK.
      if (env === 'disabled') return;
      sdk = candidate;
      safe(() => sdk.game.addSettingsChangeListener(() => listeners.mute.forEach((f) => f())));
      try {
        if (sdk.ad && typeof sdk.ad.hasAdblock === 'function') adblock = !!(await sdk.ad.hasAdblock());
      } catch (e) {
        adblock = false;
      }
    },

    // ---- lifecycle events ----
    loadingStart() {
      if (loadingOn) return;
      loadingOn = true;
      safe(() => sdk.game.loadingStart());
    },
    loadingStop() {
      if (!loadingOn) return;
      loadingOn = false;
      safe(() => sdk.game.loadingStop());
    },
    gameplayStart() {
      if (gameplayOn) return;
      gameplayOn = true;
      safe(() => sdk.game.gameplayStart());
    },
    gameplayStop() {
      if (!gameplayOn) return;
      gameplayOn = false;
      safe(() => sdk.game.gameplayStop());
    },
    happytime() {
      safe(() => sdk.game.happytime());
    },

    // ---- audio ----
    // The website's mute setting wins over the in-game toggles.
    platformMuted() {
      return !!safe(() => sdk.game.settings && sdk.game.settings.muteAudio);
    },
    onMuteChange(fn) { listeners.mute.push(fn); },
    onAd(fn) { listeners.ad.push(fn); },

    // ---- ads ----
    adsAvailable() {
      return !!sdk && (env === 'crazygames' || env === 'local');
    },
    rewardedAvailable() {
      return Platform.adsAvailable() && !adblock;
    },

    // Resolves to true only when the ad was watched to the end. If the SDK
    // neither starts nor rejects an ad within 10 s, the game moves on; a late
    // ad still pauses and mutes the game while it plays.
    requestAd(type) {
      return new Promise((resolve) => {
        if (!Platform.adsAvailable() || adPlaying) return resolve(false);
        let settled = false;
        const settle = (result) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          resolve(result);
        };
        const ended = () => {
          if (!adPlaying) return;
          adPlaying = false;
          listeners.ad.forEach((f) => f(false));
        };
        const timer = setTimeout(() => settle(false), 10000);
        const started = safe(() => {
          sdk.ad.requestAd(type, {
            adStarted: () => {
              clearTimeout(timer);
              adPlaying = true;
              listeners.ad.forEach((f) => f(true));
            },
            adFinished: () => {
              ended();
              settle(true);
            },
            adError: (err) => {
              console.info('[CrazyGames SDK] ad not shown:', err);
              ended();
              settle(false);
            },
          });
          return true;
        });
        if (!started) settle(false);
      });
    },
    showMidgame() {
      return Platform.requestAd('midgame');
    },
    showRewarded() {
      return Platform.requestAd('rewarded');
    },

    // ---- save data ----
    // Signed-in CrazyGames players get the SDK data module (synced to their
    // account); everyone else falls back to localStorage.
    loadSave() {
      let raw = null;
      if (sdk && sdk.data) raw = safe(() => sdk.data.getItem(SAVE_KEY));
      if (raw == null) {
        try {
          raw = localStorage.getItem(SAVE_KEY);
        } catch (e) { /* storage blocked */ }
      }
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },
    writeSave(obj) {
      const raw = JSON.stringify(obj);
      if (sdk && sdk.data) {
        safe(() => sdk.data.setItem(SAVE_KEY, raw));
        return;
      }
      try {
        localStorage.setItem(SAVE_KEY, raw);
      } catch (e) { /* storage blocked – progress lives for this session only */ }
    },
  };

  AR.Platform = Platform;
})(window.AR);
