'use strict';
// 3D gear preview: the real in-game rider on a small snow podium, rendered
// with its own WebGL context and slowly turning.
(function (GS) {
  class Preview {
    constructor(canvas) {
      this.canvas = canvas;
      this.R = new GS.Renderer(canvas);
      this.R.setQuality('med');
      this.env = new GS.Env();
      this.env.hour = 11;
      this.env.dynamicTime = false;
      this.env.setWeather('clear', true);
      this.env.update(0);
      this.env.fogDen = 0;
      this.env.fogCol.set([0.86, 0.92, 0.99]);
      const b = new GS.MeshBuilder();
      b.col('#f4f8fd').cyl(0.85, 0.95, -0.18, 0, 28, null, true, false);
      b.col('#c9d6e6').cyl(0.95, 0.97, -0.5, -0.18, 28, null, false, false);
      this.podium = this.R.upload(b.build());
      this.yaw = 0.5;
      this.running = false;
      this.t = 0;
      this.loop = this.loop.bind(this);
    }

    start(getGear) {
      this.getGear = getGear;
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }

    stop() { this.running = false; }

    loop(ts) {
      if (!this.running) return;
      const dt = Math.min(0.05, (ts - this.last) / 1000);
      this.last = ts;
      this.t += dt;
      this.yaw += dt * 0.5;
      const c = this.canvas;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
      const g = this.getGear();
      const R = this.R;
      const dist = 4.3;
      R.setCamera([0, 1.75, dist], [0, 0.8, 0], 0.6, 0.1, 50);
      GS.Rider.draw(R, { x: 0, y: 0, z: 0, yaw: this.yaw, crouch: 0.18 + Math.sin(this.t * 1.6) * 0.04, board: g.board, poleT: 0, arms: g.board ? 'wide' : 'poles', speed: 0, wave: this.t }, g.gear);
      R.time = this.t;
      R.render({ terrain: [], statics: [{ mesh: this.podium, box: [-2, -1, -2, 2, 1, 2] }], inst: [], dynInst: [], shadowRadius: 3 }, this.env, [0, 0.5, 0]);
      requestAnimationFrame(this.loop);
    }
  }
  GS.Preview = Preview;
})(window.GS);
