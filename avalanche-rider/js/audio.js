'use strict';
// All music and sound effects are synthesised at runtime with the Web Audio
// API – the game ships no audio files. The website's mute setting (CrazyGames
// SDK) and ad playback silence the master bus regardless of in-game toggles.
(function (AR) {
  let ctx = null;
  let master, musicBus, sfxBus, noiseBuf;
  let windGain, windFilter, rumbleGain, grindGain;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let intensity = 0;
  let musicOn = false;
  let adMuted = false;
  let coinStreak = 0;
  let coinStreakT = 0;

  const BPM = 104;
  const S16 = 60 / BPM / 4;
  // Am – F – C – G, two bars each (as MIDI note numbers).
  const CHORDS = [
    [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62],
  ];
  const ARP = [0, 1, 2, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 1, 2, 3];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Continuous layers: wind (speed), avalanche rumble (distance), rail grind.
    const loop = (type, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(sfxBus);
      src.start();
      return { g, f };
    };
    const wind = loop('bandpass', 600, 0.8);
    windGain = wind.g;
    windFilter = wind.f;
    rumbleGain = loop('lowpass', 140, 0.7).g;
    grindGain = loop('bandpass', 3200, 6).g;
    apply();
  }

  function unlock() {
    init();
    if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume();
  }

  function apply() {
    if (!ctx) return;
    const s = AR.Progress.data.settings;
    const silent = adMuted || AR.Platform.platformMuted();
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(silent ? 0 : 0.9, t, 0.03);
    musicBus.gain.setTargetAtTime(s.music ? 0.26 : 0, t, 0.08);
    sfxBus.gain.setTargetAtTime(s.sfx ? 1 : 0, t, 0.03);
  }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  function tone(freq, dur, type, vol, when, slideTo, bus, attack) {
    if (!ctx) return;
    const t = Math.max(when || 0, ctx.currentTime) + 0.002;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, attack || 0.006, vol, dur);
    o.connect(g).connect(bus || sfxBus);
    o.start(t);
    o.stop(t + dur + (attack || 0.006) + 0.05);
  }

  function noise(dur, vol, type, from, to, when, q, bus) {
    if (!ctx) return;
    const t = Math.max(when || 0, ctx.currentTime) + 0.002;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.Q.value = q || 1;
    f.frequency.setValueAtTime(from, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    env(g, t, 0.008, vol, dur);
    s.connect(f).connect(g).connect(bus || sfxBus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  // ---------- music ----------
  function schedule() {
    while (nextTime < ctx.currentTime + 0.12) {
      playStep(step, nextTime);
      nextTime += S16;
      step = (step + 1) % 128;
    }
  }

  function playStep(i, t) {
    const bar = Math.floor(i / 16);
    const chord = CHORDS[Math.floor(bar / 2) % 4];
    const s = i % 16;
    if (s === 0 && bar % 2 === 0) {
      for (const m of chord) {
        tone(mtof(m), S16 * 30, 'triangle', 0.05, t, null, musicBus, 0.5);
        tone(mtof(m) * 1.005, S16 * 30, 'sawtooth', 0.012, t, null, musicBus, 0.6);
      }
    }
    if (s % 2 === 0) {
      const root = chord[0] - 24;
      tone(mtof(s % 8 === 6 ? root + 7 : root), S16 * 1.6, 'triangle', 0.16, t, null, musicBus);
    }
    const arpOn = bar >= 4 || intensity > 0.2;
    if (arpOn && s % 2 === 1) {
      const idx = ARP[(s + bar * 3) % 16];
      const note = idx === 3 ? chord[0] + 12 : chord[idx] + 12;
      tone(mtof(note), S16 * 1.2, 'square', 0.025, t, null, musicBus);
    }
    // drums
    if (s === 0 || s === 8 || (intensity > 0.5 && (s === 4 || s === 12))) {
      tone(110, 0.16, 'sine', 0.35, t, 40, musicBus);
    }
    if (s === 4 || s === 12) noise(0.12, 0.08 + intensity * 0.06, 'bandpass', 1800, 900, t, 0.8, musicBus);
    if (s % 2 === 1 && bar >= 2) noise(0.04, 0.03 + intensity * 0.04, 'highpass', 7000, null, t, 1, musicBus);
  }

  const Audio = {
    unlock,
    apply,

    startMusic() {
      if (!ctx) return;
      if (musicOn) return;
      musicOn = true;
      nextTime = ctx.currentTime + 0.05;
      step = 0;
      timer = setInterval(schedule, 25);
    },
    stopMusic() {
      musicOn = false;
      if (timer) clearInterval(timer);
      timer = null;
    },
    setIntensity(v) {
      intensity = AR.clamp(v, 0, 1);
    },

    // Continuous layers, called every frame while riding.
    setRide(speed, grounded, grinding, danger) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const sp = AR.clamp(speed / 1100, 0, 1);
      windGain.gain.setTargetAtTime(0.03 + sp * (grounded ? 0.16 : 0.1), t, 0.1);
      windFilter.frequency.setTargetAtTime(400 + sp * 1400, t, 0.1);
      rumbleGain.gain.setTargetAtTime(0.05 + danger * 0.55, t, 0.2);
      grindGain.gain.setTargetAtTime(grinding ? 0.12 : 0, t, 0.03);
    },
    silenceRide() {
      if (!ctx) return;
      const t = ctx.currentTime;
      windGain.gain.setTargetAtTime(0, t, 0.15);
      rumbleGain.gain.setTargetAtTime(0, t, 0.3);
      grindGain.gain.setTargetAtTime(0, t, 0.05);
    },

    setAdMuted(on) {
      adMuted = on;
      apply();
    },
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend();
    },
    resume() {
      if (ctx && ctx.state !== 'running') ctx.resume();
    },

    tick(dt) {
      coinStreakT -= dt;
      if (coinStreakT <= 0) coinStreak = 0;
    },

    sfx: {
      click() { tone(760, 0.06, 'triangle', 0.14); },
      jump() {
        tone(240, 0.22, 'triangle', 0.12, 0, 520);
        noise(0.22, 0.14, 'highpass', 1600, 4200);
      },
      spin() { noise(0.18, 0.08, 'bandpass', 900, 2400, 0, 2.5); },
      land(q) {
        noise(0.2, q === 'sketchy' ? 0.5 : 0.32, 'lowpass', 1100, 180);
        tone(85, 0.14, 'sine', 0.28);
        if (q === 'perfect') {
          const t = ctx && ctx.currentTime;
          [1318, 1760].forEach((f, i) => tone(f, 0.16, 'sine', 0.1, t + i * 0.06));
        }
      },
      trick(mult) {
        if (!ctx) return;
        const b = 523 * Math.pow(1.059, Math.min(mult || 1, 10) * 2);
        const t = ctx.currentTime;
        [1, 1.25, 1.5, 2].forEach((m, i) => tone(b * m, 0.14, 'square', 0.05, t + i * 0.055));
      },
      coin() {
        if (!ctx) return;
        coinStreak = Math.min(coinStreak + 1, 14);
        coinStreakT = 0.6;
        const f = 1046 * Math.pow(1.059, coinStreak);
        tone(f, 0.08, 'sine', 0.12);
        tone(f * 1.5, 0.12, 'sine', 0.07, ctx.currentTime + 0.04);
      },
      powerup() {
        tone(330, 0.4, 'sawtooth', 0.06, 0, 1320);
        tone(660, 0.4, 'triangle', 0.1, 0, 1980);
      },
      smash() {
        noise(0.35, 0.45, 'lowpass', 3000, 200);
        tone(180, 0.2, 'square', 0.08, 0, 60);
      },
      shieldSave() {
        tone(880, 0.25, 'triangle', 0.14, 0, 440);
        noise(0.2, 0.2, 'highpass', 3000, 900);
      },
      crash() {
        noise(0.7, 0.55, 'lowpass', 2600, 110);
        tone(130, 0.45, 'sine', 0.35, 0, 45);
      },
      fall() {
        tone(700, 1.1, 'triangle', 0.12, 0, 90);
      },
      caught() {
        noise(1.4, 0.7, 'lowpass', 900, 80);
        tone(70, 1.2, 'sawtooth', 0.12, 0, 35);
      },
      mission() {
        if (!ctx) return;
        const t = ctx.currentTime;
        [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, t + i * 0.07));
      },
      rankup() {
        if (!ctx) return;
        const t = ctx.currentTime;
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, t + i * 0.08));
      },
      revive() {
        tone(220, 0.6, 'triangle', 0.14, 0, 880);
        noise(0.6, 0.15, 'bandpass', 500, 3000, 0, 1.5);
      },
      buy() {
        if (!ctx) return;
        const t = ctx.currentTime;
        [1046, 1318, 1568].forEach((f, i) => tone(f, 0.12, 'sine', 0.13, t + i * 0.05));
      },
      deny() { tone(220, 0.18, 'square', 0.06, 0, 160); },
    },
  };

  AR.Audio = Audio;
})(window.AR);
