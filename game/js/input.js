'use strict';
(function (YR) {
  const Input = {
    touchX: null,
    pointerId: null,
    taps: 0,
    tilt: null,
    tiltZero: 0,
    keys: { left: false, right: false, down: false },

    reset() {
      this.touchX = null;
      this.pointerId = null;
      this.taps = 0;
    },

    consumeTap() {
      if (this.taps > 0) {
        this.taps = 0;
        return true;
      }
      return false;
    },

    attach(el, onPause) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        YR.Audio.unlock();
        this.taps++;
        if (this.pointerId == null) {
          this.pointerId = e.pointerId;
          this.touchX = e.clientX;
        }
      });
      el.addEventListener('pointermove', (e) => {
        if (e.pointerId === this.pointerId) this.touchX = e.clientX;
      });
      const up = (e) => {
        if (e.pointerId === this.pointerId) {
          this.pointerId = null;
          this.touchX = null;
        }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);

      const setKey = (e, v) => {
        switch (e.key) {
          case 'ArrowLeft': case 'a': this.keys.left = v; break;
          case 'ArrowRight': case 'd': this.keys.right = v; break;
          case 'ArrowDown': case 's': this.keys.down = v; break;
          case ' ': case 'ArrowUp': case 'w': if (v && !e.repeat) this.taps++; break;
          case 'Escape': case 'p': if (v) onPause(); break;
          default: return;
        }
        e.preventDefault();
      };
      window.addEventListener('keydown', (e) => setKey(e, true));
      window.addEventListener('keyup', (e) => setKey(e, false));

      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma == null) return;
        const ang = (screen.orientation && screen.orientation.angle) != null ? screen.orientation.angle : window.orientation || 0;
        let v;
        switch ((ang + 360) % 360) {
          case 90: v = e.beta; break;
          case 270: v = -e.beta; break;
          case 180: v = -e.gamma; break;
          default: v = e.gamma;
        }
        this.tilt = v - this.tiltZero;
      });
    },

    // iOS requires a user gesture to grant motion access.
    async requestTilt() {
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        try {
          return (await DOE.requestPermission()) === 'granted';
        } catch (e) {
          return false;
        }
      }
      return !!DOE;
    },
  };
  YR.Input = Input;
})(window.YR);
