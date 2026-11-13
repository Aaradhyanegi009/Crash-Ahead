export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('crashahead_muted') === '1';
    this.engineOsc = null;
    this.engineGain = null;
    this.lastBumpAt = 0;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.engineOsc && this.ctx) {
      try {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 54;
        filter.type = 'lowpass';
        filter.frequency.value = 210;
        gain.gain.value = 0;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        this.engineOsc = osc;
        this.engineGain = gain;
      } catch (_) {}
    }
  }

  setMuted(m) {
    this.muted = !!m;
    localStorage.setItem('crashahead_muted', this.muted ? '1' : '0');
    if (this.muted && this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    }
  }

  updateEngine(active, throttle, speedNorm) {
    if (!this.ctx || !this.engineGain || !this.engineOsc) return;
    const now = this.ctx.currentTime;
    if (this.muted || !active) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }
    const targetFreq = 52 + throttle * 46 + speedNorm * 40;
    const targetVol = 0.014 + throttle * 0.028;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.06);
    this.engineGain.gain.setTargetAtTime(targetVol, now, 0.06);
  }

  playCountdown(isGo = false) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 520, t);
    if (isGo) osc.frequency.exponentialRampToValueAtTime(1046, t + 0.14);
    gain.gain.setValueAtTime(isGo ? 0.22 : 0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isGo ? 0.22 : 0.12));
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + (isGo ? 0.24 : 0.14));
  }

  playBump(strength = 0.6) {
    if (this.muted || !this.ctx) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBumpAt < 70) return;
    this.lastBumpAt = nowMs;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160 + strength * 70, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.09);
    gain.gain.setValueAtTime(Math.min(0.18, 0.06 + strength * 0.12), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  playBonk() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(340, t);
    o1.frequency.exponentialRampToValueAtTime(95, t + 0.16);
    g1.gain.setValueAtTime(0.28, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o1.connect(g1);
    g1.connect(this.ctx.destination);
    o1.start(t);
    o1.stop(t + 0.19);
  }

  playSplash() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.34;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let lfsr = 0x9E3779B9;
    for (let i = 0; i < data.length; i++) {
      lfsr ^= lfsr << 13;
      lfsr ^= lfsr >>> 17;
      lfsr ^= lfsr << 5;
      const norm = ((lfsr >>> 0) / 4294967295) * 2 - 1;
      data[i] = norm * Math.exp(-i / (data.length * 0.32));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(750, t);
    bp.frequency.exponentialRampToValueAtTime(240, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.26, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
  }

  playVictory() {
    if (this.muted || !this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const t0 = this.ctx.currentTime;
    notes.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const s = t0 + idx * 0.095;
      osc.frequency.setValueAtTime(f, s);
      gain.gain.setValueAtTime(0.16, s);
      gain.gain.exponentialRampToValueAtTime(0.001, s + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(s);
      osc.stop(s + 0.3);
    });
  }

  playClick() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.045);
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.055);
  }

  playJump() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(510, t + 0.14);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.17);
  }
}

export const Haptics = {
  bump() { try { if (navigator.vibrate) navigator.vibrate(20); } catch (_) {} },
  ko() { try { if (navigator.vibrate) navigator.vibrate(140); } catch (_) {} }
};
