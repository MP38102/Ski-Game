'use strict';
// Lighting and weather: turns a time of day (hours) and a weather state into
// the uniforms the renderer needs, blended smoothly over time.
(function (GS) {
  const rgb = GS.hexToRgb;
  const mix = GS.mixRgb;

  // Keyframes: hour -> sky palette
  const KEYS = [
    { h: 0, sun: '#a9c0f2', sky: '#3a5a9c', gnd: '#1a2440', fog: '#1d3158', sunI: 0.66 },
    { h: 5.5, sun: '#a9b8e6', sky: '#3c5a8c', gnd: '#1c2440', fog: '#2c3f6a', sunI: 0.62 },
    { h: 7, sun: '#ffb27a', sky: '#9fb4d8', gnd: '#5a5a78', fog: '#e8c2b0', sunI: 0.9 },
    { h: 9, sun: '#fff1d8', sky: '#a9c8ef', gnd: '#7a8aa6', fog: '#cfe2f6', sunI: 1.0 },
    { h: 13, sun: '#fffaf0', sky: '#a6c8f2', gnd: '#8696b4', fog: '#d6e7f8', sunI: 1.05 },
    { h: 16.5, sun: '#ffe2b4', sky: '#a7bfe6', gnd: '#7e86a8', fog: '#e6dccf', sunI: 0.95 },
    { h: 18.5, sun: '#ff8a5c', sky: '#8a8fc4', gnd: '#5a4d6e', fog: '#f0a98e', sunI: 0.8 },
    { h: 20, sun: '#8c86c8', sky: '#3d4a86', gnd: '#1c1c34', fog: '#34406e', sunI: 0.5 },
    { h: 24, sun: '#a9c0f2', sky: '#3a5a9c', gnd: '#1a2440', fog: '#1d3158', sunI: 0.66 },
  ].map((k) => ({ h: k.h, sun: rgb(k.sun), sky: rgb(k.sky), gnd: rgb(k.gnd), fog: rgb(k.fog), sunI: k.sunI }));

  const WEATHER = {
    clear: { cloud: 0, snow: 0, fog: 0, wind: 0.3 },
    cloudy: { cloud: 0.6, snow: 0, fog: 0.1, wind: 0.5 },
    snow: { cloud: 0.75, snow: 0.55, fog: 0.4, wind: 0.6 },
    fog: { cloud: 0.8, snow: 0.05, fog: 1, wind: 0.2 },
    storm: { cloud: 1, snow: 1, fog: 0.75, wind: 1 },
  };
  const WEATHER_CYCLE = ['clear', 'clear', 'cloudy', 'snow', 'clear', 'cloudy', 'fog', 'clear', 'snow', 'storm', 'cloudy', 'clear'];

  class Env {
    constructor() {
      this.hour = 10;
      this.dayLength = 900; // real seconds per in-game day in dynamic mode
      this.dynamicTime = true;
      this.weatherName = 'clear';
      this.w = Object.assign({}, WEATHER.clear);
      this.target = WEATHER.clear;
      this.weatherT = 0;
      this.weatherIdx = 0;
      this.dynamicWeather = false;
      this.theme = null;
      this.aurora = 0;
      this.t = 0;
      this.override = null;
      // outputs
      this.sunDir = new Float32Array([0.3, 0.8, 0.5]);
      this.sunCol = new Float32Array(3);
      this.skyCol = new Float32Array(3);
      this.gndCol = new Float32Array(3);
      this.fogCol = new Float32Array(3);
      this.snowCol = new Float32Array([0.95, 0.97, 1]);
      this.rockCol = new Float32Array([0.43, 0.45, 0.48]);
      this.rockCol2 = new Float32Array([0.54, 0.56, 0.59]);
      this.trackCol = new Float32Array([0.42, 0.55, 0.75]);
      this.flakeCol = new Float32Array([1, 1, 1]);
      this.fogDen = 0.002;
      this.night = 0;
      this.snowfall = 0;
      this.storm = 0;
      this.wind = 0.3;
      this.windX = 0.4;
      this.windZ = 0.2;
      this.objSnow = 1;
      this.visibility = 1;
    }

    setTheme(theme) {
      this.theme = theme;
      if (theme && theme.rock) {
        this.rockCol.set(GS.hexToRgb(theme.rock));
        this.rockCol2.set(GS.hexToRgb(theme.rock2 || theme.rock));
      }
    }

    setWeather(name, instant) {
      this.weatherName = name;
      this.target = WEATHER[name] || WEATHER.clear;
      if (instant) this.w = Object.assign({}, this.target);
    }

    // Temporary conditions for a challenge (e.g. night slalom, fog run).
    setOverride(o) {
      this.override = o;
      if (o && o.weather) this.setWeather(o.weather, true);
    }

    update(dt) {
      this.t += dt;
      const o = this.override;
      if (!o || o.hour == null) {
        if (this.dynamicTime) this.hour = (this.hour + (dt * 24) / this.dayLength) % 24;
      } else {
        this.hour = o.hour;
      }
      if (this.dynamicWeather && !(o && o.weather)) {
        this.weatherT += dt;
        if (this.weatherT > 120) {
          this.weatherT = 0;
          this.weatherIdx = (this.weatherIdx + 1) % WEATHER_CYCLE.length;
          this.setWeather(WEATHER_CYCLE[this.weatherIdx]);
        }
      }
      const k = Math.min(1, dt * 0.25);
      for (const key in this.target) this.w[key] += (this.target[key] - this.w[key]) * k;
      this._compute();
    }

    _compute() {
      const h = this.hour;
      let a = KEYS[0], b = KEYS[1];
      for (let i = 0; i < KEYS.length - 1; i++) {
        if (h >= KEYS[i].h && h <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
      }
      const t = (h - a.h) / (b.h - a.h || 1);
      const th = this.theme || {};
      let sun = mix(a.sun, b.sun, t);
      let sky = mix(a.sky, b.sky, t);
      let gnd = mix(a.gnd, b.gnd, t);
      let fog = mix(a.fog, b.fog, t);
      let sunI = GS.lerp(a.sunI, b.sunI, t);
      if (th.tint) {
        const tint = rgb(th.tint);
        sky = mix(sky, tint, th.tintAmt || 0.15);
        fog = mix(fog, tint, (th.tintAmt || 0.15) * 1.2);
      }

      // sun path: rises in the east (+x), passes on the camera side (+z)
      // and sets in the west; elevation 22° .. 64°.
      const day = GS.clamp((h - 6) / 13, 0, 1);
      const night = h < 5.5 || h > 20 ? 1 : h < 7 ? 1 - (h - 5.5) / 1.5 : h > 18.5 ? (h - 18.5) / 1.5 : 0;
      this.night = GS.clamp(night, 0, 1);
      let az = Math.PI * (0.15 + day * 0.7);
      let el = (22 + 42 * Math.sin(day * Math.PI)) * Math.PI / 180;
      if (this.night > 0.5) {
        const nt = ((h + 24 - 20) % 24) / 9.5;
        az = Math.PI * (0.25 + nt * 0.5);
        el = 50 * Math.PI / 180;
      }
      this.sunDir[0] = Math.cos(el) * Math.cos(az);
      this.sunDir[1] = Math.sin(el);
      this.sunDir[2] = Math.cos(el) * Math.sin(az);

      // weather
      const w = this.w;
      const grey = [0.72, 0.76, 0.82];
      const cloudDim = 1 - w.cloud * 0.55;
      sunI *= cloudDim;
      sky = mix(sky, mix(grey, sky, 0.4), w.cloud * 0.6);
      fog = mix(fog, mix(grey, fog, 0.5), w.cloud * 0.7);
      if (this.night > 0) {
        const nf = mix(grey, fog, 0.3);
        fog = mix(fog, [nf[0] * 0.25, nf[1] * 0.3, nf[2] * 0.45], w.cloud * this.night * 0.5);
      }
      // ambient brightens when overcast (diffuse light)
      const ambBoost = 1 + w.cloud * 0.25;

      // aurora (Nordic night)
      let aur = 0;
      if (th.aurora && this.night > 0.4) aur = this.night * (0.5 + 0.5 * Math.sin(this.t * 0.3));
      this.aurora = aur;
      if (aur > 0) {
        const ac = [0.25, 0.95, 0.6];
        sky = mix(sky, ac, aur * 0.25);
        fog = mix(fog, [0.1, 0.35, 0.3], aur * 0.25);
      }

      for (let i = 0; i < 3; i++) {
        this.sunCol[i] = sun[i] * sunI * 0.86;
        this.skyCol[i] = sky[i] * 0.5 * ambBoost;
        this.gndCol[i] = gnd[i] * 0.4 * ambBoost;
        this.fogCol[i] = fog[i];
      }
      // dimmer, bluish snow & brighter tracks at night
      const snowNight = this.night;
      this.trackCol[0] = 0.4 - snowNight * 0.25;
      this.trackCol[1] = 0.52 - snowNight * 0.3;
      this.trackCol[2] = 0.74 - snowNight * 0.35;
      const baseFog = th.fog != null ? th.fog : 0.0018;
      this.fogDen = baseFog + w.fog * 0.0105 + w.snow * 0.0025;
      this.visibility = 1 - GS.clamp(w.fog * 0.8 + w.snow * 0.3, 0, 0.9);
      this.snowfall = GS.clamp(w.snow, 0, 1);
      this.storm = GS.clamp((w.wind - 0.5) * 2, 0, 1);
      this.wind = w.wind;
      this.windX = Math.cos(this.t * 0.05) * w.wind;
      this.windZ = 0.3 * w.wind;
      const fc = this.night > 0.5 ? 0.8 : 1;
      this.flakeCol[0] = fc; this.flakeCol[1] = fc; this.flakeCol[2] = fc * 1.02;
    }

    get isNight() { return this.night > 0.5; }
  }

  Env.WEATHER = WEATHER;
  GS.Env = Env;
})(window.GS);
