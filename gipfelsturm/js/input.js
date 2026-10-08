'use strict';
// Touch gestures, keyboard, on-screen buttons and gamepad merged into one
// per-frame input state.
(function (GS) {
  const SWIPE_PX = 42;
  const SWIPE_MS = 320;

  const Input = {
    pointers: new Map(),
    keys: {},
    edges: { jump: false, slap: false, interact: false, flipSwipe: 0, map: false, pause: false, zoom: 0 },
    lastTap: { t: 0, x: 0, y: 0 },
    buttons: {},
    wheel: 0,
    pinch: null,
    padPrev: {},
    skierScreen: null,
    observeDrag: null,

    attach(el, handlers) {
      this.el = el;
      this.handlers = handlers || {};
      el.addEventListener('pointerdown', (e) => this._down(e));
      el.addEventListener('pointermove', (e) => this._move(e));
      const up = (e) => this._up(e);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      }, { passive: false });
      window.addEventListener('keydown', (e) => this._key(e, true));
      window.addEventListener('keyup', (e) => this._key(e, false));
      window.addEventListener('blur', () => { this.keys = {}; this.pointers.clear(); });
    },

    reset() {
      this.pointers.clear();
      this.keys = {};
      for (const k in this.edges) this.edges[k] = typeof this.edges[k] === 'number' ? 0 : false;
      for (const k in this.buttons) this.buttons[k] = false;
    },

    _down(e) {
      e.preventDefault();
      if (this.el.setPointerCapture) try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const W = this.el.clientWidth;
      const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), side: e.clientX < W / 2 ? -1 : 1, role: 'steer' };
      this.pointers.set(e.pointerId, p);
      // double tap -> slap
      const now = performance.now();
      if (now - this.lastTap.t < 280 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 60) {
        this.edges.slap = true;
        this.lastTap.t = 0;
        p.role = 'press';
      } else {
        this.lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), applied: 0 };
      }
      if (this.handlers.onDown) this.handlers.onDown(e);
    },

    _move(e) {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.handlers.onDrag && this.handlers.onDrag(dx, dy, this.pointers.size)) return;
      if (p.role === 'steer' && performance.now() - p.t0 < SWIPE_MS) {
        const ddx = p.x - p.x0, ddy = p.y - p.y0;
        if (Math.abs(ddy) > SWIPE_PX && Math.abs(ddy) > Math.abs(ddx) * 1.3) {
          if (ddy < 0) { p.role = 'swipeUp'; this.edges.jump = true; this.edges.flipSwipe = -1; }
          else { p.role = 'swipeDown'; this.edges.flipSwipe = 1; }
        } else if (Math.abs(ddx) > SWIPE_PX * 1.3 && Math.abs(ddx) > Math.abs(ddy) * 1.6) {
          p.role = 'swipeSide';
          this.edges.pivot = Math.sign(ddx);
        }
      }
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = d / (this.pinch.d0 || 1);
        if (Math.abs(ratio - 1) > 0.25) {
          this.edges.zoom += ratio > 1 ? -1 : 1;
          this.pinch.d0 = d;
          this.pinch.applied++;
        }
      }
    },

    _up(e) {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
    },

    _key(e, down) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const k = e.key;
      const map = {
        ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
        ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
        ' ': 'space', Shift: 'slap', x: 'slap', X: 'slap', q: 'grab2', Q: 'grab2', z: 'grab3', Z: 'grab3', y: 'grab3', Y: 'grab3', f: 'boost', F: 'boost',
      };
      const name = map[k];
      if (name) {
        if (down && !this.keys[name] && name === 'slap') this.edges.slap = true;
        if (!down && name === 'space' && this.keys.space) this.edges.jumpRelease = true;
        this.keys[name] = down;
        e.preventDefault();
        return;
      }
      if (!down) return;
      if (k === 'e' || k === 'E' || k === 'Enter') { this.edges.interact = true; e.preventDefault(); }
      else if (k === 'm' || k === 'M') this.edges.map = true;
      else if (k === 'Escape' || k === 'p' || k === 'P') this.edges.pause = true;
      else if (k === '+' || k === '=') this.edges.zoom -= 1;
      else if (k === '-' || k === '_') this.edges.zoom += 1;
      else if (k === 'r' || k === 'R') this.edges.restart = true;
      else if (k === 'c' || k === 'C') this.edges.pivot = this.keys.left ? -1 : 1;
    },

    // On-screen buttons (control mode "buttons").
    bindButton(el, name) {
      const on = (e) => { e.preventDefault(); e.stopPropagation(); this.buttons[name] = true; if (name === 'jump') this.edges.btnJump = true; if (name === 'tap') this.edges.slap = true; if (name === 'pivot') this.edges.pivot = 1; el.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.buttons[name] = false; if (name === 'jump') this.edges.btnJumpUp = true; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    },

    // Build the per-frame state. ctx: { air, mode, skierScreen, control }
    read(ctx) {
      const out = {
        steer: 0, aim: null, aimStrength: 1, brake: false, tuck: false, jump: false, jumpHeld: false,
        flip: 0, flipSwipe: 0, grab: false, grabType: null, slap: false, interact: false, boost: false, push: false, pivot: 0, press: 0,
      };
      const air = ctx.air;
      const control = GS.settings.control;
      // ---- touch
      const ptrs = [...this.pointers.values()];
      const steerP = ptrs.filter((p) => p.role === 'steer');
      const left = steerP.some((p) => p.side < 0), right = steerP.some((p) => p.side > 0);
      if (control !== 'buttons') {
        if (left && right) {
          if (air) out.grab = true; else out.tuck = true;
        } else if (steerP.length) {
          const p = steerP[steerP.length - 1];
          if (control === 'aim' && !air && ctx.skierScreen) {
            const dx = p.x - ctx.skierScreen[0], dy = p.y - ctx.skierScreen[1];
            if (Math.hypot(dx, dy) > 24) {
              out.aim = Math.atan2(dx, dy * 1.25);
              out.aimStrength = GS.clamp(Math.hypot(dx, dy) / 80, 0.3, 1);
            }
          } else {
            out.steer = p.side;
          }
          out.boost = true;
        }
        if (ptrs.some((p) => p.role === 'swipeDown') && !air) out.brake = true;
        const pr = ptrs.find((p) => p.role === 'press');
        if (pr && !air && performance.now() - pr.t0 > 200) out.press = pr.side;
        if (ptrs.some((p) => p.role === 'swipeUp') && air) out.flip = -1;
        if (ptrs.some((p) => p.role === 'swipeDown') && air) out.flip = 1;
      }
      if (this.edges.jump) { out.jump = !air; out.jumpCharge = 0.6; }
      if (this.edges.flipSwipe && air) out.flipSwipe = this.edges.flipSwipe;
      // ---- on-screen buttons
      const b = this.buttons;
      if (b.left) out.steer = -1;
      if (b.right) out.steer = 1;
      if (b.left || b.right) out.boost = true;
      if (b.grab) { if (air) out.grab = true; else out.tuck = true; }
      if (b.brake) { if (air) out.flip = 1; else out.brake = true; }
      if (b.jump) { if (air) out.flip = -1; else out.jumpHeld = true; }
      if (b.press && !air) out.press = b.left ? -1 : 1;
      if (this.edges.btnJumpUp && !air) out.jump = true;
      // ---- keyboard
      const k = this.keys;
      if (k.left) out.steer = -1;
      if (k.right) out.steer = 1;
      if (k.left || k.right || k.up) out.boost = true;
      if (air) {
        if (k.up) out.flip = -1;
        if (k.down) out.flip = 1;
        if (k.space) out.grab = true;
        if (k.grab2) { out.grab = true; out.grabType = 2; }
      } else {
        if (k.down) out.brake = true;
        if (k.up) out.tuck = true;
        if (k.space) out.jumpHeld = true;
        if (this.edges.jumpRelease) out.jump = true;
        if (k.grab2) out.press = 1;
        if (k.grab3) out.press = -1;
      }
      if (air && k.grab3) { out.grab = true; out.grabType = 1; }
      if (k.boost) out.boost = true;
      // ---- gamepad
      this._pad(out, air);
      // ---- edges
      if (this.edges.slap) out.slap = true;
      if (this.edges.pivot && !air) out.pivot = this.edges.pivot;
      this.edges.pivot = 0;
      if (this.edges.interact) out.interact = true;
      out.push = !!(out.steer || out.aim != null);
      if (out.jump && out.jumpHeld === false && out.jumpCharge == null) out.jumpCharge = 0.4;
      this.edges.jump = false;
      this.edges.jumpRelease = false;
      this.edges.btnJump = false;
      this.edges.btnJumpUp = false;
      this.edges.flipSwipe = 0;
      this.edges.slap = false;
      this.edges.interact = false;
      return out;
    },

    _pad(out, air) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && [...pads].find((p) => p && p.connected);
      if (!gp) return;
      this.hasPad = true;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const edge = (i) => {
        const v = btn(i);
        const was = this.padPrev[i];
        this.padPrev[i] = v;
        return v && !was;
      };
      const mag = Math.hypot(ax, ay);
      if (!air) {
        if (mag > 0.35) {
          out.aim = Math.atan2(ax, ay);
          out.aimStrength = GS.clamp((mag - 0.35) / 0.5, 0.2, 1);
          out.boost = true;
        }
        if (btn(0)) out.jumpHeld = true;
        if (this.padPrev.a && !btn(0)) out.jump = true;
        this.padPrev.a = btn(0);
        if (btn(1)) out.brake = true;
        if (btn(7)) out.tuck = true;
        if (edge(4)) out.pivot = -1;
        if (edge(5)) out.pivot = 1;
        if (btn(6)) out.press = -1;
        if (btn(10) || btn(11)) out.press = 1;
      } else {
        if (Math.abs(ax) > 0.35) out.steer = Math.sign(ax);
        if (ay < -0.5) out.flip = -1;
        if (ay > 0.5) out.flip = 1;
        if (btn(0) || btn(7)) out.grab = true;
        this.padPrev.a = btn(0);
        if (btn(4)) out.steer = -1;
        if (btn(5)) out.steer = 1;
        this.padPrev[4] = btn(4);
        this.padPrev[5] = btn(5);
      }
      if (edge(2)) out.slap = true;
      if (edge(3)) out.interact = true;
      if (edge(9)) this.edges.pause = true;
      if (edge(8)) this.edges.map = true;
      if (edge(12)) this.edges.zoom -= 1;
      if (edge(13)) this.edges.zoom += 1;
    },

    takeEdge(name) {
      const v = this.edges[name];
      if (typeof v === 'number') { this.edges[name] = 0; return v; }
      this.edges[name] = false;
      return v;
    },

    takeWheel() {
      const w = this.wheel;
      this.wheel = 0;
      return w;
    },
  };

  GS.Input = Input;
})(window.GS);
