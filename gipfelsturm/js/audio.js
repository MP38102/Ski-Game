'use strict';
// All sound is synthesised live with the Web Audio API: a generative music
// engine with a mood per mountain, ambient wind/carving loops and effects.
(function (GS) {
  let ctx = null;
  let master, sfxBus, musicBus, musicFilter, verb, verbGain;
  let noise = null;
  let windG, windF, carveG, carveF, rumbleG, liftG;
  let timer = null;
  let nextT = 0, step = 0, bar = 0;
  let mood = null;
  let intensity = 0;
  let targetIntensity = 0;

  const MOODS = {
    menu: { bpm: 84, root: 60, prog: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], scale: [0, 2, 4, 7, 9], wave: 'triangle', pad: 'sawtooth', bright: 1600 },
    alps: { bpm: 92, root: 60, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], scale: [0, 2, 4, 7, 9], wave: 'triangle', pad: 'sawtooth', bright: 1800 },
    forest: { bpm: 84, root: 55, prog: [[0, 4, 7], [4, 7, 11], [5, 9, 12], [0, 4, 7]], scale: [0, 2, 4, 7, 9], wave: 'sine', pad: 'triangle', bright: 1400, vib: 1 },
    glacier: { bpm: 88, root: 62, prog: [[0, 4, 7, 14], [2, 6, 9, 14], [9, 12, 16, 21], [7, 11, 14, 18]], scale: [0, 2, 4, 6, 7, 9, 11], wave: 'sine', pad: 'sawtooth', bright: 2200, bell: 1 },
    nordic: { bpm: 78, root: 57, prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]], scale: [0, 2, 3, 5, 7, 9, 10], wave: 'triangle', pad: 'sawtooth', bright: 1100 },
    japan: { bpm: 86, root: 62, prog: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-5, -1, 2]], scale: [0, 1, 5, 7, 8], wave: 'triangle', pad: 'triangle', bright: 1700, koto: 1 },
    volcano: { bpm: 96, root: 52, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]], scale: [0, 1, 3, 5, 7, 8, 10], wave: 'sawtooth', pad: 'sawtooth', bright: 900 },
    canyon: { bpm: 90, root: 52, prog: [[0, 4, 7], [-2, 2, 5], [5, 9, 12], [0, 4, 7]], scale: [0, 2, 4, 5, 7, 9, 10], wave: 'sawtooth', pad: 'triangle', bright: 1500, twang: 1 },
    andes: { bpm: 100, root: 53, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], scale: [0, 2, 4, 7, 9], wave: 'triangle', pad: 'sawtooth', bright: 1900 },
    storm: { bpm: 104, root: 48, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], scale: [0, 2, 3, 5, 7, 8, 10], wave: 'sawtooth', pad: 'sawtooth', bright: 1000 },
    crystal: { bpm: 76, root: 66, prog: [[0, 4, 7, 11], [2, 6, 9, 13], [-1, 4, 7, 11], [-3, 2, 6, 9]], scale: [0, 2, 4, 6, 7, 9, 11], wave: 'sine', pad: 'triangle', bright: 2600, bell: 1 },
    arena: { bpm: 112, root: 58, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], scale: [0, 2, 4, 7, 9], wave: 'square', pad: 'sawtooth', bright: 2000 },
    himalaya: { bpm: 72, root: 50, prog: [[0, 5, 7], [0, 5, 10], [-2, 3, 7], [0, 5, 7]], scale: [0, 2, 5, 7, 9], wave: 'sine', pad: 'sawtooth', bright: 1200, drone: 1 },
  };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3.5;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 6000;
    musicBus.connect(musicFilter).connect(master);
    // simple feedback-delay "reverb" for the music
    const d1 = ctx.createDelay(1), d2 = ctx.createDelay(1);
    d1.delayTime.value = 0.23;
    d2.delayTime.value = 0.37;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const vf = ctx.createBiquadFilter();
    vf.type = 'lowpass';
    vf.frequency.value = 2200;
    verb = ctx.createGain();
    verbGain = ctx.createGain();
    verbGain.gain.value = 0.32;
    verb.connect(d1);
    verb.connect(d2);
    d1.connect(vf);
    d2.connect(vf);
    vf.connect(fb).connect(d1);
    vf.connect(verbGain).connect(musicBus);

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const loop = (type, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(sfxBus);
      src.start();
      return [g, f];
    };
    [windG, windF] = loop('bandpass', 500, 0.6);
    [carveG, carveF] = loop('bandpass', 2600, 1.2);
    [rumbleG] = loop('lowpass', 140, 0.8);
    [liftG] = loop('lowpass', 300, 2);
    applySettings();
  }

  function unlock() {
    init();
    if (ctx && ctx.state !== 'running') ctx.resume();
    if (ctx && !timer) timer = setInterval(schedule, 30);
  }

  function applySettings() {
    if (!ctx) return;
    const s = GS.settings;
    sfxBus.gain.setTargetAtTime(s.sfx, ctx.currentTime, 0.05);
    musicBus.gain.setTargetAtTime(s.music * 0.3, ctx.currentTime, 0.2);
  }

  function env(g, t, a, peak, dec, sus) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (sus) {
      g.gain.setTargetAtTime(peak * 0.6, t + a, dec * 0.3);
      g.gain.setTargetAtTime(0.0001, t + a + dec, dec * 0.25);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    }
  }

  function osc(type, freq, t, dur, vol, bus, opts) {
    opts = opts || {};
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.vib) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = 5;
      lg.gain.value = freq * 0.006;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.2);
    }
    const g = ctx.createGain();
    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filterType || 'lowpass';
      f.frequency.setValueAtTime(opts.filter, t);
      if (opts.filterTo) f.frequency.exponentialRampToValueAtTime(opts.filterTo, t + dur);
      f.Q.value = opts.q || 0.8;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(bus || sfxBus);
    if (opts.send) g.connect(verb);
    env(g, t, opts.attack || 0.005, vol, dur, opts.sus);
    o.start(t);
    o.stop(t + (opts.attack || 0.005) + dur + 0.3);
  }

  function noiseHit(t, dur, vol, type, freq, q, bus, to) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = type || 'highpass';
    f.frequency.setValueAtTime(freq || 2000, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q || 0.7;
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(bus || sfxBus);
    env(g, t, 0.003, vol, dur);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.1);
  }

  // ---------- Music ------------------------------------------------------------
  function schedule() {
    if (!ctx || !mood) return;
    const m = MOODS[mood] || MOODS.alps;
    const spb = 60 / m.bpm / 2; // eighth notes
    intensity += (targetIntensity - intensity) * 0.02;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.15) {
      playStep(m, step, nextT, spb);
      nextT += spb;
      step++;
      if (step % 16 === 0) bar++;
    }
  }

  function playStep(m, s, t, spb) {
    const chord = m.prog[bar % m.prog.length];
    const root = m.root;
    const pos = s % 16;
    const I = intensity;
    const bus = musicBus;
    // pad at bar start
    if (pos === 0) {
      for (const n of chord) {
        osc(m.pad, mtof(root + n - 12), t, spb * 15, 0.035, bus, { attack: 0.6, sus: true, filter: m.bright * 0.6, detune: (Math.random() - 0.5) * 12, send: true });
        osc(m.pad, mtof(root + n - 12), t, spb * 15, 0.025, bus, { attack: 0.7, sus: true, filter: m.bright * 0.5, detune: 9, send: true });
      }
      if (m.drone) osc('sawtooth', mtof(root - 24), t, spb * 16, 0.05, bus, { attack: 1, sus: true, filter: 300 });
    }
    // bass
    if ((pos === 0 || pos === 8 || (I > 0.5 && (pos === 6 || pos === 14))) && I > 0.15) {
      osc('triangle', mtof(root + chord[0] - 24), t, spb * 3, 0.12 * Math.min(1, I + 0.3), bus, { filter: 600 });
    }
    // arpeggio / melody
    const density = 0.35 + I * 0.5;
    const arpOn = pos % 2 === 0 || I > 0.6;
    if (arpOn && hashStep(s, bar) < density) {
      const pool = chord.concat(chord.map((n) => n + 12));
      const n = pool[(s * 3 + bar * 5) % pool.length];
      const wave = m.koto ? 'triangle' : m.wave;
      const dur = m.koto ? spb * 1.2 : spb * 2.5;
      const opts = { filter: m.bright, filterTo: m.bright * 0.4, send: true, vib: m.vib };
      if (m.twang) { opts.filterType = 'bandpass'; opts.q = 3; }
      osc(wave, mtof(root + n + 12), t, dur, m.wave === 'square' || m.wave === 'sawtooth' ? 0.035 : 0.06, bus, opts);
      if (m.bell && pos % 4 === 0) osc('sine', mtof(root + n + 24), t, spb * 4, 0.03, bus, { send: true });
    }
    // occasional melody note from the scale
    if (pos === 4 && hashStep(s + 7, bar) > 0.45) {
      const n = m.scale[(bar * 3 + s) % m.scale.length];
      osc(m.vib ? 'sine' : 'triangle', mtof(root + n + 24), t, spb * 5, 0.04, bus, { attack: 0.03, send: true, vib: 1 });
    }
    // drums with intensity
    if (I > 0.35) {
      if (pos % 8 === 0) {
        osc('sine', 120, t, 0.18, 0.28 * I, bus, { slide: 45 });
      }
      if (pos % 8 === 4) noiseHit(t, 0.12, 0.08 * I, 'bandpass', 1800, 0.8, bus);
      if (pos % 2 === 1) noiseHit(t, 0.04, 0.035 * I, 'highpass', 7000, 0.7, bus);
    } else if (pos % 4 === 2) {
      noiseHit(t, 0.03, 0.012, 'highpass', 8000, 0.7, bus);
    }
  }

  function hashStep(s, b) {
    const x = Math.sin(s * 12.9898 + b * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  // ---------- Effects -------------------------------------------------------------
  const SFX = {
    jump(t) { noiseHit(t, 0.18, 0.18, 'bandpass', 1200, 0.8, null, 3000); },
    land(t, k) { osc('sine', 90, t, 0.18, 0.3 * (k || 1), null, { slide: 50 }); noiseHit(t, 0.2, 0.22 * (k || 1), 'lowpass', 1400); },
    crash(t) {
      osc('sine', 110, t, 0.35, 0.45, null, { slide: 40 });
      noiseHit(t, 0.6, 0.4, 'lowpass', 2400, 0.7, null, 300);
      noiseHit(t + 0.08, 0.3, 0.18, 'bandpass', 900);
    },
    bump(t) { osc('sine', 140, t, 0.1, 0.2, null, { slide: 70 }); },
    gate(t) { osc('triangle', 1318, t, 0.18, 0.16); osc('triangle', 1760, t + 0.06, 0.25, 0.12); },
    miss(t) { osc('square', 220, t, 0.25, 0.08, null, { slide: 150, filter: 900 }); },
    coin(t) { osc('triangle', 1568, t, 0.1, 0.16); osc('triangle', 2093, t + 0.07, 0.2, 0.14); },
    tap(t) { osc('triangle', 520, t, 0.07, 0.25, null, { slide: 300 }); noiseHit(t, 0.08, 0.15, 'bandpass', 1500, 2); },
    grind(t) { noiseHit(t, 0.4, 0.12, 'bandpass', 3800, 6); osc('sawtooth', 210, t, 0.4, 0.03, null, { filter: 1600 }); },
    chair(t) { noiseHit(t, 0.05, 0.25, 'bandpass', 900, 3); noiseHit(t + 0.09, 0.05, 0.18, 'bandpass', 700, 3); },
    beep(t) { osc('square', 880, t, 0.12, 0.08, null, { filter: 2500 }); },
    go(t) { osc('square', 1760, t, 0.35, 0.09, null, { filter: 3500 }); },
    trick(t, k) { const f = 660 * Math.pow(1.122, Math.min(k || 0, 12)); osc('triangle', f, t, 0.12, 0.12); osc('sine', f * 1.5, t + 0.05, 0.2, 0.07); },
    bank(t) { [0, 4, 7, 12].forEach((n, i) => osc('triangle', mtof(76 + n), t + i * 0.05, 0.25, 0.1)); },
    ui(t) { osc('sine', 880, t, 0.05, 0.06); },
    unlock(t) { [0, 4, 7, 11, 14, 19].forEach((n, i) => osc('triangle', mtof(72 + n), t + i * 0.06, 0.35, 0.09, null, { send: true })); },
    medal(t, tier) {
      const seq = tier >= 3 ? [0, 4, 7, 12, 16, 19, 24] : tier === 2 ? [0, 4, 7, 12, 16] : tier === 1 ? [0, 4, 7, 12] : [7, 3, 0];
      seq.forEach((n, i) => osc(tier ? 'triangle' : 'square', mtof(67 + n), t + i * 0.09, 0.4, tier ? 0.12 : 0.06, null, { filter: 3000 }));
    },
    whoosh(t) { noiseHit(t, 0.35, 0.12, 'bandpass', 600, 1, null, 2200); },
    collect(t) { [0, 7, 12, 19, 24].forEach((n, i) => osc('sine', mtof(79 + n), t + i * 0.05, 0.3, 0.1)); },
    wing(t) { noiseHit(t, 0.8, 0.12, 'lowpass', 800, 0.7, null, 300); },
  };

  const Audio = {
    unlock,
    applySettings,
    setMood(m) {
      if (mood === m) return;
      mood = m;
      bar = 0;
      step = 0;
    },
    setIntensity(v) { targetIntensity = v; },
    play(name, k) {
      if (!ctx || ctx.state !== 'running') return;
      const f = SFX[name];
      if (f) f(ctx.currentTime + 0.005, k);
    },
    // continuous loops: speed (m/s), carve 0..1, surface, rumble 0..1, lift 0..1, air
    ambient(o) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const sp = Math.min(1, (o.speed || 0) / 30);
      windG.gain.setTargetAtTime(0.02 + sp * sp * 0.22 + (o.storm || 0) * 0.12, t, 0.15);
      windF.frequency.setTargetAtTime(300 + sp * 900 + (o.air ? 400 : 0), t, 0.2);
      carveG.gain.setTargetAtTime(o.air ? 0 : (o.carve || 0) * 0.16, t, 0.05);
      carveF.frequency.setTargetAtTime(o.surface === 2 ? 4200 : o.surface === 0 || o.surface === 4 ? 1500 : 2600, t, 0.1);
      rumbleG.gain.setTargetAtTime((o.rumble || 0) * 0.9, t, 0.2);
      liftG.gain.setTargetAtTime((o.lift || 0) * 0.05, t, 0.3);
    },
    suspend() { if (ctx) ctx.suspend(); },
    resume() { if (ctx) ctx.resume(); },
  };
  GS.Audio = Audio;
})(window.GS);
