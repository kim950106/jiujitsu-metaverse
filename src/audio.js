// Small WebAudio layer: crowd ambience for the arena and a few cue sounds. Everything is optional:
// if the browser refuses audio the game keeps running silently.
export class Sound {
  constructor() {
    this.on = true;
    this.ctx = null;
    this.amb = null;
    this.kind = null;
  }

  // Must be called from a click handler.
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.on ? 1 : 0;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) {
      this.ctx = null;
    }
  }

  setOn(on) {
    this.on = on;
    try {
      if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    } catch (e) { /* ignore */ }
  }

  _noise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  setAmbience(kind) {
    if (!this.ctx || this.kind === kind) return;
    try {
      const ctx = this.ctx;
      if (this.amb) {
        const old = this.amb;
        old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        setTimeout(() => { try { old.src.stop(); } catch (e) { /* ignore */ } }, 1200);
        this.amb = null;
      }
      this.kind = kind;
      if (!kind) return;
      const src = ctx.createBufferSource();
      src.buffer = this._noise(4);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = kind === 'arena' ? 520 : 140;
      f.Q.value = kind === 'arena' ? 0.5 : 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(kind === 'arena' ? 0.5 : 0.12, ctx.currentTime, 0.8);
      src.connect(f);
      f.connect(gain);
      gain.connect(this.master);
      src.start();
      this.amb = { src, gain };
    } catch (e) { /* ignore */ }
  }

  _tone(freq, t0, dur, type, vol, slideTo) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.setValueAtTime(vol, t0 + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    return { o, g };
  }

  sfx(name) {
    if (!this.ctx || !this.on) return;
    try {
      const t = this.ctx.currentTime + 0.01;
      if (name === 'whistle') {
        const a = this._tone(2850, t, 0.42, 'square', 0.035, 2950);
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 34;
        lg.gain.value = 90;
        lfo.connect(lg);
        lg.connect(a.o.frequency);
        lfo.start(t);
        lfo.stop(t + 0.45);
      } else if (name === 'beep') {
        this._tone(880, t, 0.14, 'sine', 0.12);
        this._tone(880, t + 0.2, 0.22, 'sine', 0.12);
      } else if (name === 'thud') {
        this._tone(150, t, 0.2, 'sine', 0.3, 48);
      } else if (name === 'tap') {
        for (let i = 0; i < 3; i++) this._tone(210, t + i * 0.14, 0.06, 'square', 0.07, 120);
      } else if (name === 'ding') {
        this._tone(1318, t, 0.16, 'triangle', 0.1);
        this._tone(1760, t + 0.14, 0.2, 'triangle', 0.1);
        this._tone(2093, t + 0.3, 0.34, 'triangle', 0.1);
      }
    } catch (e) { /* ignore */ }
  }
}
