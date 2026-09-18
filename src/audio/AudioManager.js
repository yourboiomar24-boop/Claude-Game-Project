// Fully procedural Web Audio engine — every sound here is synthesized at
// runtime (oscillators + filtered noise), so the game ships with zero audio
// asset files. One "current" ambient/music layer plays at a time and is
// crossfaded out whenever a new one starts.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.current = null;
    this.muted = false;
  }

  _ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Must be called from a user gesture (click/keydown) to satisfy browser
  // autoplay policies before any sound can play.
  unlock() {
    this._ensureContext();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.35;
  }

  _stopCurrent() {
    if (this.current) {
      this.current.stop();
      this.current = null;
    }
  }

  stopAll() {
    this._stopCurrent();
  }

  _noiseBuffer() {
    const size = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ---- Menu / lobby: looping square-wave chiptune arpeggio ----
  playMenuMusic() {
    this._ensureContext();
    this._stopCurrent();
    const ctx = this.ctx;
    const melody = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23];
    const bass = [130.81, 130.81, 146.83, 146.83];
    const stepDur = 0.2;
    let step = 0;
    let stopped = false;
    let timeoutId = null;

    const scheduleStep = () => {
      if (stopped) return;
      const now = ctx.currentTime;
      const lead = ctx.createOscillator();
      lead.type = 'square';
      lead.frequency.value = melody[step % melody.length];
      const leadGain = ctx.createGain();
      leadGain.gain.setValueAtTime(0.0001, now);
      leadGain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      leadGain.gain.exponentialRampToValueAtTime(0.0001, now + stepDur);
      lead.connect(leadGain).connect(this.master);
      lead.start(now);
      lead.stop(now + stepDur + 0.02);

      if (step % 2 === 0) {
        const b = ctx.createOscillator();
        b.type = 'triangle';
        b.frequency.value = bass[(step / 2) % bass.length];
        const bGain = ctx.createGain();
        bGain.gain.setValueAtTime(0.0001, now);
        bGain.gain.linearRampToValueAtTime(0.12, now + 0.03);
        bGain.gain.exponentialRampToValueAtTime(0.0001, now + stepDur * 2);
        b.connect(bGain).connect(this.master);
        b.start(now);
        b.stop(now + stepDur * 2 + 0.02);
      }

      step++;
      timeoutId = setTimeout(scheduleStep, stepDur * 1000);
    };
    timeoutId = setTimeout(scheduleStep, 0);

    this.current = { stop: () => { stopped = true; clearTimeout(timeoutId); } };
  }

  // ---- Battle Bus: low engine drone with a slow vibrato wobble ----
  playBusDrone() {
    this._ensureContext();
    this._stopCurrent();
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 110;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.5);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.master);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain).connect(osc1.frequency);

    osc1.start(); osc2.start(); lfo.start();

    this.current = {
      stop: () => {
        const now = ctx.currentTime;
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc1.stop(now + 0.35); osc2.stop(now + 0.35); lfo.stop(now + 0.35);
      },
    };
  }

  // ---- Skydiving: filtered noise wind rush ----
  playWindRush() {
    this._ensureContext();
    this._stopCurrent();
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer();
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.3);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start();

    this.current = {
      stop: () => {
        const now = ctx.currentTime;
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        noise.stop(now + 0.25);
      },
    };
  }

  // ---- Victory Royale: looping triumphant chord fanfare ----
  playVictoryFanfare() {
    this._ensureContext();
    this._stopCurrent();
    const ctx = this.ctx;
    const chord = [523.25, 659.25, 783.99, 1046.5];
    let stopped = false;
    let timeoutId = null;

    const playChord = () => {
      if (stopped) return;
      const now = ctx.currentTime;
      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now + i * 0.08);
        g.gain.linearRampToValueAtTime(0.2, now + i * 0.08 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 1.0);
        osc.connect(g).connect(this.master);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 1.05);
      });
      timeoutId = setTimeout(playChord, 1800);
    };
    timeoutId = setTimeout(playChord, 0);

    this.current = { stop: () => { stopped = true; clearTimeout(timeoutId); } };
  }
}
