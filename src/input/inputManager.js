export class InputManager {
  constructor(sound) {
    this.sound = sound;
    this.state = { p1_l: false, p1_r: false, p1_jump: false, p2_l: false, p2_r: false, p2_jump: false };
    this.pressTimes = { p1_l: 0, p1_r: 0, p1_jump: 0, p2_l: 0, p2_r: 0, p2_jump: 0 };
    this.heldCodes = new Map();
    this.activePointers = new Map();
    this.singleLayout = localStorage.getItem('crashahead_1p_layout') || 'split';
    this.mode = 'menu';

    this.dom = {
      root: document.getElementById('touch-controls'),
      groupP1: document.getElementById('group-p1'),
      groupP2: document.getElementById('group-p2'),
      p1L: document.getElementById('pad-p1-l'),
      p1R: document.getElementById('pad-p1-r'),
      p1Jump: document.getElementById('pad-p1-jump'),
      p2L: document.getElementById('pad-p2-l'),
      p2R: document.getElementById('pad-p2-r'),
      p2Jump: document.getElementById('pad-p2-jump')
    };

    this.pads = [
      { el: this.dom.p1L, key: 'p1_l' },
      { el: this.dom.p1R, key: 'p1_r' },
      { el: this.dom.p1Jump, key: 'p1_jump' },
      { el: this.dom.p2L, key: 'p2_l' },
      { el: this.dom.p2R, key: 'p2_r' },
      { el: this.dom.p2Jump, key: 'p2_jump' }
    ];

    this._bindKeyboard();
    this._bindUnifiedPointers();
    this.setMode('menu');
  }

  _mapKeyCodeToAction(code) {
    if (this.mode === 'local') {
      if (code === 'KeyA' || code === 'KeyS') return 'p1_l';
      if (code === 'KeyD') return 'p1_r';
      if (code === 'KeyW') return 'p1_jump';
      if (code === 'ArrowLeft') return 'p2_l';
      if (code === 'ArrowRight' || code === 'ArrowDown') return 'p2_r';
      if (code === 'ArrowUp') return 'p2_jump';
      return null;
    }
    if (this.mode === 'online_client') {
      if (code === 'KeyA' || code === 'ArrowLeft' || code === 'KeyS' || code === 'ArrowDown') return 'p2_l';
      if (code === 'KeyD' || code === 'ArrowRight') return 'p2_r';
      if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') return 'p2_jump';
      return null;
    }
    if (code === 'KeyA' || code === 'ArrowLeft' || code === 'KeyS' || code === 'ArrowDown') return 'p1_l';
    if (code === 'KeyD' || code === 'ArrowRight') return 'p1_r';
    if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') return 'p1_jump';
    return null;
  }

  _recomputeState() {
    const next = { p1_l: false, p1_r: false, p1_jump: false, p2_l: false, p2_r: false, p2_jump: false };
    const earliest = { p1_l: 0, p1_r: 0, p1_jump: 0, p2_l: 0, p2_r: 0, p2_jump: 0 };

    const applyEntry = (key, startTime) => {
      if (!key) return;
      next[key] = true;
      if (earliest[key] === 0 || startTime < earliest[key]) earliest[key] = startTime;
    };

    for (const entry of this.heldCodes.values()) applyEntry(entry.key, entry.startTime);
    for (const entry of this.activePointers.values()) applyEntry(entry.key, entry.startTime);

    Object.assign(this.state, next);
    Object.assign(this.pressTimes, earliest);
    this._syncVisuals();
  }

  _clearAllInputs() {
    this.heldCodes.clear();
    this.activePointers.clear();
    this._recomputeState();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (
        document.activeElement &&
        document.activeElement.tagName === 'INPUT' &&
        !document.activeElement.closest('.hidden')
      ) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      const actionKey = this._mapKeyCodeToAction(e.code);
      if (!actionKey) return;
      this.sound.unlock();
      if (!this.heldCodes.has(e.code)) {
        this.heldCodes.set(e.code, { key: actionKey, startTime: performance.now() });
        this._recomputeState();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.heldCodes.delete(e.code)) {
        this._recomputeState();
      }
    });

    window.addEventListener('blur', () => this._clearAllInputs());
    window.addEventListener('pagehide', () => this._clearAllInputs());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._clearAllInputs();
    });
  }

  _isPadVisible(el) {
    if (!el || el.closest('.hidden')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  _padKeyAtPoint(x, y) {
    for (const p of this.pads) {
      if (!this._isPadVisible(p.el)) continue;
      const r = p.el.getBoundingClientRect();
      if (x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10) {
        return p.key;
      }
    }
    return null;
  }

  _bindUnifiedPointers() {
    this.dom.root.addEventListener('contextmenu', (e) => e.preventDefault());

    for (const p of this.pads) {
      p.el.addEventListener('contextmenu', (e) => e.preventDefault());

      p.el.addEventListener('pointerdown', (e) => {
        if (this.mode === 'menu') return;
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        this.sound.unlock();
        try {
          if (this.mode !== 'local' && p.el.setPointerCapture) {
            p.el.setPointerCapture(e.pointerId);
          }
        } catch (_) {}
        this.activePointers.set(e.pointerId, {
          key: p.key,
          startTime: performance.now()
        });
        this._recomputeState();
      });

      p.el.addEventListener('pointermove', (e) => {
        const existing = this.activePointers.get(e.pointerId);
        if (!existing) return;
        if (e.pointerType === 'mouse' && e.buttons === 0) {
          this.activePointers.delete(e.pointerId);
          this._recomputeState();
          return;
        }
        if (this.mode === 'local' && !existing.key.endsWith('_jump')) {
          const hoveredKey = this._padKeyAtPoint(e.clientX, e.clientY);
          if (hoveredKey && !hoveredKey.endsWith('_jump') && hoveredKey !== existing.key) {
            this.activePointers.set(e.pointerId, {
              key: hoveredKey,
              startTime: performance.now()
            });
            this._recomputeState();
          }
        }
      });

      const releasePointer = (e) => {
        if (this.activePointers.delete(e.pointerId)) {
          this._recomputeState();
        }
      };
      p.el.addEventListener('pointerup', releasePointer);
      p.el.addEventListener('pointercancel', releasePointer);
      p.el.addEventListener('lostpointercapture', releasePointer);
    }

    window.addEventListener('pointerup', (e) => {
      if (this.activePointers.delete(e.pointerId)) {
        this._recomputeState();
      }
    });
    window.addEventListener('pointercancel', (e) => {
      if (this.activePointers.delete(e.pointerId)) {
        this._recomputeState();
      }
    });
  }

  _syncVisuals() {
    this.dom.p1L.classList.toggle('pressed', this.state.p1_l);
    this.dom.p1R.classList.toggle('pressed', this.state.p1_r);
    if (this.dom.p1Jump) this.dom.p1Jump.classList.toggle('pressed', this.state.p1_jump);
    this.dom.p2L.classList.toggle('pressed', this.state.p2_l);
    this.dom.p2R.classList.toggle('pressed', this.state.p2_r);
    if (this.dom.p2Jump) this.dom.p2Jump.classList.toggle('pressed', this.state.p2_jump);
  }

  setSingleLayout(layout) {
    this.singleLayout = layout === 'grouped' ? 'grouped' : 'split';
    localStorage.setItem('crashahead_1p_layout', this.singleLayout);
    this._applyLayout();
    return this.singleLayout;
  }

  setMode(mode) {
    this.mode = mode;
    this._clearAllInputs();
    this._applyLayout();
  }

  _applyLayout() {
    const { root, groupP1, groupP2, p1L, p1R, p2L, p2R } = this.dom;
    root.classList.remove('mode-1p-split', 'mode-2p');
    p1L.classList.remove('pad-left-btn');
    p1R.classList.remove('pad-right-btn');
    p2L.classList.remove('pad-left-btn');
    p2R.classList.remove('pad-right-btn');

    if (this.mode === 'menu') {
      root.classList.add('hidden');
      return;
    }
    root.classList.remove('hidden');

    if (this.mode === 'local') {
      root.classList.add('mode-2p');
      groupP1.classList.remove('hidden');
      groupP2.classList.remove('hidden');
    } else if (this.mode === 'online_client') {
      groupP1.classList.add('hidden');
      groupP2.classList.remove('hidden');
      if (this.singleLayout === 'split') {
        root.classList.add('mode-1p-split');
        p2L.classList.add('pad-left-btn');
        p2R.classList.add('pad-right-btn');
      }
    } else {
      groupP1.classList.remove('hidden');
      groupP2.classList.add('hidden');
      if (this.singleLayout === 'split') {
        root.classList.add('mode-1p-split');
        p1L.classList.add('pad-left-btn');
        p1R.classList.add('pad-right-btn');
      }
    }
  }

  _getHoldMsFor(key, now) {
    if (!this.state[key] || !this.pressTimes[key]) return 0;
    return Math.max(0, Math.round(now - this.pressTimes[key]));
  }

  getP1() {
    const now = performance.now();
    if (this.mode === 'ai' || this.mode === 'online_host') {
      const l = this.state.p1_l || this.state.p2_l;
      const r = this.state.p1_r || this.state.p2_r;
      const jump = this.state.p1_jump || this.state.p2_jump;
      const lHoldMs = Math.max(this._getHoldMsFor('p1_l', now), this._getHoldMsFor('p2_l', now));
      const rHoldMs = Math.max(this._getHoldMsFor('p1_r', now), this._getHoldMsFor('p2_r', now));
      return { l, r, jump, lHoldMs, rHoldMs, holdMs: r && !l ? rHoldMs : l && !r ? lHoldMs : 0 };
    }
    const l = this.state.p1_l;
    const r = this.state.p1_r;
    const jump = this.state.p1_jump;
    const lHoldMs = this._getHoldMsFor('p1_l', now);
    const rHoldMs = this._getHoldMsFor('p1_r', now);
    return { l, r, jump, lHoldMs, rHoldMs, holdMs: r && !l ? rHoldMs : l && !r ? lHoldMs : 0 };
  }

  getP2() {
    const now = performance.now();
    if (this.mode === 'online_client') {
      const l = this.state.p1_l || this.state.p2_l;
      const r = this.state.p1_r || this.state.p2_r;
      const jump = this.state.p1_jump || this.state.p2_jump;
      const lHoldMs = Math.max(this._getHoldMsFor('p1_l', now), this._getHoldMsFor('p2_l', now));
      const rHoldMs = Math.max(this._getHoldMsFor('p1_r', now), this._getHoldMsFor('p2_r', now));
      return { l, r, jump, lHoldMs, rHoldMs, holdMs: l && !r ? lHoldMs : r && !l ? rHoldMs : 0 };
    }
    const l = this.state.p2_l;
    const r = this.state.p2_r;
    const jump = this.state.p2_jump;
    const lHoldMs = this._getHoldMsFor('p2_l', now);
    const rHoldMs = this._getHoldMsFor('p2_r', now);
    return { l, r, jump, lHoldMs, rHoldMs, holdMs: l && !r ? lHoldMs : r && !l ? rHoldMs : 0 };
  }
}
