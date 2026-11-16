import { ADMIN_CONFIG } from '../config/constants.js';
import { clamp } from '../utils/math.js';

const GRAVITY_MODES = ['normal', 'low', 'reverse'];

export class AdminManager {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.unlocked = false;
    this.drawerOpen = false;
    this.level = 1;
    this.overrides = {
      godMode: null,
      infiniteJump: null,
      rapidFire: null,
      oneHitKO: null,
      giantSelf: null,
      miniOpp: null
    };
    this.aiFrozen = false;
    this.noWaterRise = false;
    this.cannonKnockback = false;
    this.gravityMode = 'normal';
    this._keyBuffer = '';
    this._lastKeyAt = 0;

    this._loadPersistedState();
    this._checkUrlUnlock();
  }

  _loadPersistedState() {
    try {
      this.unlocked = localStorage.getItem(ADMIN_CONFIG.STORAGE_KEY) === ADMIN_CONFIG.UNLOCK_TOKEN;
      const savedLvl = Number(localStorage.getItem(ADMIN_CONFIG.LEVEL_STORAGE_KEY));
      if (this.unlocked && Number.isFinite(savedLvl)) {
        this.level = clamp(Math.floor(savedLvl), 0, ADMIN_CONFIG.LEVELS.length - 1);
      }
    } catch (_) {
      this.unlocked = false;
    }
  }

  _saveState() {
    try {
      if (this.unlocked) {
        localStorage.setItem(ADMIN_CONFIG.STORAGE_KEY, ADMIN_CONFIG.UNLOCK_TOKEN);
        localStorage.setItem(ADMIN_CONFIG.LEVEL_STORAGE_KEY, String(this.level));
      } else {
        localStorage.removeItem(ADMIN_CONFIG.STORAGE_KEY);
        localStorage.removeItem(ADMIN_CONFIG.LEVEL_STORAGE_KEY);
      }
    } catch (_) {}
  }

  _checkUrlUnlock() {
    try {
      const url = new URL(window.location.href);
      const token = (url.searchParams.get(ADMIN_CONFIG.URL_PARAM) || '').trim().toLowerCase();
      if (ADMIN_CONFIG.URL_TOKENS.includes(token)) {
        this.unlocked = true;
        if (this.level <= 0) this.level = 1;
        this.drawerOpen = true;
        this._saveState();
        url.searchParams.delete(ADMIN_CONFIG.URL_PARAM);
        window.history.replaceState({}, '', url.toString());
      }
    } catch (_) {}
  }

  unlock(openDrawer = true) {
    const wasUnlocked = this.unlocked;
    this.unlocked = true;
    if (this.level <= 0) this.level = 1;
    this.drawerOpen = openDrawer;
    this._saveState();
    if (!wasUnlocked && this.cb.onUnlock) this.cb.onUnlock(this.getEffectiveState());
    else if (this.cb.onStateChange) this.cb.onStateChange(this.getEffectiveState());
  }

  lock() {
    this.unlocked = false;
    this.drawerOpen = false;
    this.aiFrozen = false;
    this.noWaterRise = false;
    this.cannonKnockback = false;
    this.gravityMode = 'normal';
    this._resetOverrides();
    this._saveState();
    if (this.cb.onLock) this.cb.onLock();
    if (this.cb.onStateChange) this.cb.onStateChange(this.getEffectiveState());
  }

  _resetOverrides() {
    for (const k of Object.keys(this.overrides)) this.overrides[k] = null;
  }

  setLevel(lvl) {
    if (!this.unlocked) return;
    this.level = clamp(Math.floor(lvl), 0, ADMIN_CONFIG.LEVELS.length - 1);
    this._resetOverrides();
    if (this.level === 0) {
      this.aiFrozen = false;
      this.gravityMode = 'normal';
    }
    this._saveState();
    if (this.cb.onStateChange) this.cb.onStateChange(this.getEffectiveState());
  }

  stepLevel(delta) {
    this.setLevel(this.level + delta);
  }

  toggleDrawer(force = null) {
    if (!this.unlocked) return false;
    this.drawerOpen = force === null ? !this.drawerOpen : Boolean(force);
    if (this.cb.onStateChange) this.cb.onStateChange(this.getEffectiveState());
    return this.drawerOpen;
  }

  togglePower(key) {
    if (!this.unlocked) return false;
    if (key === 'aiFrozen') {
      this.aiFrozen = !this.aiFrozen;
    } else if (key === 'noWaterRise') {
      this.noWaterRise = !this.noWaterRise;
    } else if (key === 'cannonKnockback') {
      this.cannonKnockback = !this.cannonKnockback;
      if (this.cannonKnockback) {
        this.overrides.oneHitKO = false;
      }
    } else if (Object.prototype.hasOwnProperty.call(this.overrides, key)) {
      const eff = this.getEffectiveState();
      this.overrides[key] = !eff[key];
      if (key === 'oneHitKO' && this.overrides[key]) {
        this.cannonKnockback = false;
      }
      if (this.level === 0 && this.overrides[key]) {
        this.level = 1;
        this._saveState();
      }
    }
    if (this.cb.onStateChange) this.cb.onStateChange(this.getEffectiveState());
    return true;
  }

  cycleGravity() {
    if (!this.unlocked) return 'normal';
    const idx = GRAVITY_MODES.indexOf(this.gravityMode);
    this.gravityMode = GRAVITY_MODES[(idx + 1) % GRAVITY_MODES.length];
    if (this.cb.onStateChange) this.cb.onStateChange(this.getEffectiveState());
    return this.gravityMode;
  }

  getGravityScale() {
    if (!this.unlocked || this.level === 0) return 1.0;
    if (this.gravityMode === 'low') return 0.36;
    if (this.gravityMode === 'reverse') return -0.46;
    return 1.0;
  }

  getLevelMeta() {
    return ADMIN_CONFIG.LEVELS[this.level] || ADMIN_CONFIG.LEVELS[0];
  }

  getEffectiveState() {
    const meta = this.getLevelMeta();
    const active = this.unlocked && this.level > 0;
    const resolve = (k) => {
      if (!this.unlocked) return false;
      if (this.overrides[k] !== null) return this.overrides[k];
      return active && Boolean(meta[k]);
    };
    const cannonKnockback = this.unlocked && this.cannonKnockback;
    return {
      unlocked: this.unlocked,
      drawerOpen: this.drawerOpen,
      active,
      level: this.level,
      levelMeta: meta,
      infiniteJump: resolve('infiniteJump'),
      tankCannon: resolve('tankCannon') || (active && meta.tankCannon) || cannonKnockback,
      cannonKnockback,
      godMode: resolve('godMode'),
      rapidFire: resolve('rapidFire'),
      oneHitKO: cannonKnockback ? false : resolve('oneHitKO'),
      giantSelf: resolve('giantSelf'),
      miniOpp: resolve('miniOpp'),
      aiFrozen: this.unlocked && this.aiFrozen,
      noWaterRise: this.unlocked && this.noWaterRise,
      gravityMode: this.unlocked ? this.gravityMode : 'normal',
      gravityScale: this.unlocked ? (this.gravityMode === 'low' ? 0.36 : this.gravityMode === 'reverse' ? -0.46 : 1.0) : 1.0,
      speedMult: active ? meta.speedMult : 1.0,
      accelMult: active ? meta.accelMult : 1.0
    };
  }

  attachKeyboardListener(actions) {
    window.addEventListener('keydown', (e) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') &&
        !document.activeElement.closest('.hidden')
      ) {
        return;
      }

      // Secret keyboard phrase capture for laptop admin unlock
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key && e.key.length === 1) {
        const now = performance.now();
        if (now - this._lastKeyAt > 1800) this._keyBuffer = '';
        this._lastKeyAt = now;
        this._keyBuffer = (this._keyBuffer + e.key.toLowerCase()).slice(-18);
        for (const phrase of ADMIN_CONFIG.SECRET_PHRASES) {
          if (this._keyBuffer.endsWith(phrase)) {
            this._keyBuffer = '';
            this.unlock(true);
            if (actions.onUnlockToast) actions.onUnlockToast();
            break;
          }
        }
      }

      if (!this.unlocked || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === 'Backquote') {
        e.preventDefault();
        this.toggleDrawer();
        return;
      }
      if (e.code >= 'Digit0' && e.code <= 'Digit5') {
        const lvl = Number(e.code.slice(5));
        this.setLevel(lvl);
        if (actions.onLevelChanged) actions.onLevelChanged(this.getEffectiveState());
        return;
      }
      if (e.code === 'BracketLeft') {
        this.stepLevel(-1);
        if (actions.onLevelChanged) actions.onLevelChanged(this.getEffectiveState());
        return;
      }
      if (e.code === 'BracketRight') {
        this.stepLevel(1);
        if (actions.onLevelChanged) actions.onLevelChanged(this.getEffectiveState());
        return;
      }

      const eff = this.getEffectiveState();
      if (!eff.active && !['KeyT', 'KeyG', 'KeyK', 'KeyH', 'KeyU', 'KeyJ', 'KeyZ', 'KeyX', 'KeyV', 'KeyB', 'KeyN'].includes(e.code)) {
        return;
      }

      switch (e.code) {
        case 'KeyT':
          if (actions.onMorphTank) actions.onMorphTank();
          break;
        case 'KeyG':
          if (actions.onShockwave) actions.onShockwave();
          break;
        case 'KeyK':
          if (actions.onSmite) actions.onSmite();
          break;
        case 'KeyH':
          this.togglePower('aiFrozen');
          if (actions.onAiFreezeChanged) actions.onAiFreezeChanged(this.getEffectiveState());
          break;
        case 'KeyU':
          this.togglePower('noWaterRise');
          if (actions.onNoWaterRiseChanged) actions.onNoWaterRiseChanged(this.getEffectiveState());
          break;
        case 'KeyJ':
          this.togglePower('cannonKnockback');
          if (actions.onCannonKnockbackChanged) actions.onCannonKnockbackChanged(this.getEffectiveState());
          break;
        case 'KeyZ':
          this.togglePower('miniOpp');
          if (actions.onScaleChanged) actions.onScaleChanged(this.getEffectiveState());
          break;
        case 'KeyX':
          this.togglePower('giantSelf');
          if (actions.onScaleChanged) actions.onScaleChanged(this.getEffectiveState());
          break;
        case 'KeyV':
          this.cycleGravity();
          if (actions.onGravityChanged) actions.onGravityChanged(this.getEffectiveState());
          break;
        case 'KeyB':
          if (actions.onTriggerFlood) actions.onTriggerFlood();
          break;
        case 'KeyN':
          if (actions.onInstantWin) actions.onInstantWin();
          break;
      }
    });
  }
}
