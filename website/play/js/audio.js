'use strict';
// Every sound in Yeti Rush is synthesised at runtime with the Web Audio API –
// no audio files are shipped.
(function (YR) {
  let ctx = null;
  let master, sfxBus, musicBus, windGain, windFilter;
  let noiseBuf = null;
  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;
  let intensity = 0; // 0 = calm, 1 = yeti chase

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.32;
    musicBus.connect(master);

    // White noise buffer reused for wind, swooshes and crashes.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Continuous wind whose volume follows the skier speed.
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(sfxBus);
    wind.start();
    applySettings();
  }

  function unlock() {
    init();
    if (ctx && ctx.state !== 'running') ctx.resume();
  }

  function applySettings() {
    if (!ctx) return;
    sfxBus.gain.setTargetAtTime(YR.settings.sfx ? 1 : 0, ctx.currentTime, 0.02);
    musicBus.gain.setTargetAtTime(YR.settings.music ? 0.32 : 0, ctx.currentTime, 0.05);
  }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  function tone(freq, dur, type, vol, when, slideTo, bus) {
    if (!ctx) return;
    const t = (when || ctx.currentTime) + 0.001;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, 0.008, vol || 0.2, dur);
    o.connect(g).connect(bus || sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, fType, fFrom, fTo, when, q) {
    if (!ctx) return;
    const t = (when || ctx.currentTime) + 0.001;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = fType || 'lowpass';
    f.Q.value = q || 1;
    f.frequency.setValueAtTime(fFrom, t);
    if (fTo) f.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    const g = ctx.createGain();
    env(g, t, 0.01, vol, dur);
    s.connect(f).connect(g).connect(sfxBus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  const sfx = {
    click() { tone(880, 0.06, 'triangle', 0.15); },
    crystal(mult) {
      const base = 1046 * Math.pow(1.06, Math.min(mult || 0, 8));
      tone(base, 0.12, 'sine', 0.18);
      tone(base * 1.5, 0.18, 'sine', 0.12, ctx && ctx.currentTime + 0.05);
    },
    gate() {
      [784, 988, 1175].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, ctx && ctx.currentTime + i * 0.06));
    },
    miss() { tone(330, 0.25, 'sawtooth', 0.08, 0, 220); },
    jump() { tone(260, 0.3, 'triangle', 0.18, 0, 620); noise(0.25, 0.15, 'highpass', 1500, 4000); },
    land() { noise(0.18, 0.35, 'lowpass', 900, 200); tone(90, 0.15, 'sine', 0.3); },
    trick() { noise(0.3, 0.2, 'bandpass', 800, 3000, 0, 3); },
    trickDone(mult) {
      const b = 523 * Math.pow(1.06, Math.min(mult || 0, 8));
      [1, 1.25, 1.5, 2].forEach((m, i) => tone(b * m, 0.14, 'square', 0.06, ctx && ctx.currentTime + i * 0.05));
    },
    crash() {
      noise(0.6, 0.5, 'lowpass', 2500, 120);
      tone(140, 0.4, 'sine', 0.35, 0, 50);
    },
    bump() { noise(0.15, 0.2, 'lowpass', 700, 200); },
    ice() { tone(2400, 0.3, 'sine', 0.05, 0, 1800); },
    heart() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, ctx && ctx.currentTime + i * 0.07)); },
    turbo() { tone(200, 0.6, 'sawtooth', 0.1, 0, 900); noise(0.6, 0.2, 'bandpass', 600, 4000, 0, 2); },
    roar() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(110, t);
      o.frequency.linearRampToValueAtTime(75, t + 1.1);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 22;
      const lg = ctx.createGain();
      lg.gain.value = 18;
      lfo.connect(lg).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = ctx.createGain();
      env(g, t, 0.08, 0.4, 1.1);
      o.connect(f).connect(g).connect(sfxBus);
      o.start(t); lfo.start(t);
      o.stop(t + 1.3); lfo.stop(t + 1.3);
      noise(1.0, 0.25, 'bandpass', 400, 200, 0, 1.5);
    },
    chomp() {
      for (let i = 0; i < 3; i++) noise(0.12, 0.4, 'lowpass', 1200, 200, ctx && ctx.currentTime + i * 0.18);
    },
    gameOver() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.14, ctx && ctx.currentTime + i * 0.16)); },
    record() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, 'square', 0.07, ctx && ctx.currentTime + i * 0.09)); },
  };

  // ---- Procedural music: a bouncy alpine loop in C major, 128 BPM ---------
  const BPM = 128;
  const S16 = 60 / BPM / 4;
  const chords = [
    [48, 52, 55], // C
    [45, 48, 52], // Am
    [41, 45, 48], // F
    [43, 47, 50], // G
  ];
  // 16 steps per bar, 4 bars. Scale degrees (semitones from C5), -1 = rest.
  const melodyA = [
    72, -1, 76, -1, 79, -1, 76, 79, 81, -1, 79, -1, 76, -1, 74, -1,
    72, -1, 76, -1, 81, -1, 79, 76, 72, -1, 74, -1, 76, -1, -1, -1,
    77, -1, 76, -1, 74, -1, 72, -1, 69, -1, 72, -1, 77, -1, 76, -1,
    74, -1, 72, -1, 71, -1, 74, -1, 79, -1, 77, 74, 71, -1, -1, -1,
  ];
  const melodyB = [
    84, 83, 81, 79, 76, -1, 79, -1, 84, 83, 81, 79, 76, -1, 72, -1,
    81, 79, 76, 72, 69, -1, 72, -1, 81, 79, 76, 72, 69, -1, 76, -1,
    77, 76, 74, 72, 69, -1, 72, -1, 77, 79, 81, 77, 72, -1, 69, -1,
    79, 77, 74, 71, 67, -1, 71, -1, 74, 77, 79, 83, 86, -1, 83, -1,
  ];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function scheduleStep(s, t) {
    const bar = Math.floor(s / 16) % 4;
    const i = s % 16;
    const chord = chords[bar];
    const chase = intensity > 0.5;
    // Bass
    if (i % 4 === 0 || (chase && i % 2 === 0)) {
      const n = chord[0] - 12 + (i === 8 && !chase ? 7 : 0);
      tone(midi(n), S16 * 1.8, 'triangle', 0.35, t, null, musicBus);
    }
    // Off-beat chord stabs (oom-pah feel)
    if (i % 4 === 2) chord.forEach((n) => tone(midi(n + 12), S16 * 1.2, 'square', 0.035, t, null, musicBus));
    // Melody
    const mel = chase ? melodyB : melodyA;
    const m = mel[bar * 16 + i];
    if (m > 0) tone(midi(m), S16 * 1.6, chase ? 'square' : 'triangle', chase ? 0.06 : 0.11, t, null, musicBus);
    // Percussion
    if (i % 4 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      env(g, t, 0.003, 0.5, 0.14);
      o.connect(g).connect(musicBus);
      o.start(t);
      o.stop(t + 0.2);
    }
    if (i % 2 === 1 || chase) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      env(g, t, 0.002, i % 4 === 3 ? 0.12 : 0.06, 0.04);
      src.connect(f).connect(g).connect(musicBus);
      src.start(t, Math.random());
      src.stop(t + 0.08);
    }
    if (i === 4 || i === 12) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      const g = ctx.createGain();
      env(g, t, 0.002, 0.25, 0.12);
      src.connect(f).connect(g).connect(musicBus);
      src.start(t, Math.random());
      src.stop(t + 0.2);
    }
  }

  function musicTick() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + 0.15) {
      scheduleStep(step, nextNoteTime);
      step++;
      nextNoteTime += S16 * (intensity > 0.5 ? 0.85 : 1);
    }
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(musicTick, 40);
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
  }

  YR.Audio = {
    unlock,
    applySettings,
    sfx: new Proxy(sfx, {
      get(target, name) {
        return (...args) => {
          if (!ctx || !YR.settings.sfx) return;
          try { target[name](...args); } catch (e) { /* ignore audio glitches */ }
        };
      },
    }),
    startMusic,
    stopMusic,
    setIntensity(v) { intensity = v; },
    setWind(speedNorm) {
      if (!ctx) return;
      windGain.gain.setTargetAtTime(Math.min(0.22, speedNorm * 0.2), ctx.currentTime, 0.1);
      windFilter.frequency.setTargetAtTime(300 + speedNorm * 900, ctx.currentTime, 0.1);
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state !== 'running') ctx.resume(); },
  };
})(window.YR);
