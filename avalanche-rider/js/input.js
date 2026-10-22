'use strict';
// One-button input: Space / ↑ / W, left mouse button or a touch anywhere on
// the slope. `press` is the edge (jump), `hold` the level (backflip).
(function (AR) {
  const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
  const state = { hold: false, press: false, keys: new Set(), pointers: new Set() };
  let onPause = null;
  let onAny = null;

  function refresh() {
    state.hold = state.keys.size > 0 || state.pointers.size > 0;
  }

  const Input = {
    attach(canvas, handlers) {
      onPause = handlers.pause;
      onAny = handlers.any;
      window.addEventListener('keydown', (e) => {
        if (onAny) onAny();
        if (JUMP_KEYS.has(e.code)) {
          // Keep Space/arrows from scrolling the host page or pressing buttons.
          e.preventDefault();
          if (e.repeat) return;
          if (!state.keys.has(e.code)) {
            state.keys.add(e.code);
            state.press = true;
          }
          refresh();
        } else if (e.code === 'KeyP' || e.code === 'Escape') {
          if (onPause) onPause();
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
        }
      });
      window.addEventListener('keyup', (e) => {
        state.keys.delete(e.code);
        refresh();
      });
      canvas.addEventListener('pointerdown', (e) => {
        if (onAny) onAny();
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        state.pointers.add(e.pointerId);
        state.press = true;
        refresh();
      });
      const up = (e) => {
        state.pointers.delete(e.pointerId);
        refresh();
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('blur', () => Input.reset());
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    consume() {
      const out = { press: state.press, hold: state.hold };
      state.press = false;
      return out;
    },
    reset() {
      state.keys.clear();
      state.pointers.clear();
      state.press = false;
      refresh();
    },
  };

  AR.Input = Input;
})(window.AR);
