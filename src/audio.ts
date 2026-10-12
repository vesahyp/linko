/**
 * Web Audio synth: every sound is an oscillator or a burst of noise with an
 * envelope, made on the spot. The sim pushes names onto `state.sounds`; the
 * game loop drains them here. The context starts on the first touch.
 */
class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    } catch {
      this.ctx = null;
    }
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(this.master!);
    o.start();
    o.stop(c.currentTime + dur);
  }

  private hiss(dur: number, vol: number, freq: number): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(60, c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start();
    s.stop(c.currentTime + dur);
  }

  play(name: string): void {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const gap = name === 'shot' ? 70 : name === 'pop' || name === 'eshot' ? 40 : 20;
    if (now - (this.last.get(name) ?? 0) < gap) return;
    this.last.set(name, now);
    switch (name) {
      case 'shot':
        return this.tone('square', 1300, 700, 0.05, 0.03);
      case 'charge-shot':
        return this.tone('sawtooth', 500, 120, 0.25, 0.12);
      case 'beam':
        this.tone('sawtooth', 300, 60, 0.5, 0.18);
        return this.hiss(0.4, 0.2, 3000);
      case 'missile':
        return this.hiss(0.15, 0.06, 2000);
      case 'eshot':
        return this.tone('triangle', 520, 300, 0.12, 0.06);
      case 'ering':
        return this.tone('sine', 300, 600, 0.3, 0.08);
      case 'pop':
        return this.hiss(0.2, 0.18, 2500);
      case 'boom':
        this.hiss(0.5, 0.3, 1600);
        return this.tone('sine', 120, 40, 0.4, 0.2);
      case 'bigboom':
        this.hiss(1.2, 0.45, 1200);
        return this.tone('sine', 90, 30, 1.0, 0.35);
      case 'hurt':
        return this.tone('square', 200, 60, 0.25, 0.15);
      case 'pod':
        return this.tone('triangle', 300, 900, 0.18, 0.12);
      case 'pod-back':
        return this.tone('triangle', 900, 300, 0.18, 0.1);
      case 'dock':
        return this.tone('square', 900, 1200, 0.06, 0.06);
      case 'clang':
        return this.tone('square', 260, 180, 0.08, 0.08);
      case 'sling':
        return this.tone('sine', 400, 1600, 0.35, 0.14);
      case 'warp':
        return this.tone('sine', 1400, 200, 0.4, 0.07);
      case 'mine':
        return this.tone('sine', 700, 680, 0.1, 0.05);
      case 'wave':
        return this.tone('triangle', 220, 440, 0.4, 0.12);
      case 'clear':
        this.tone('triangle', 440, 880, 0.3, 0.12);
        return this.tone('triangle', 660, 1320, 0.4, 0.08);
      case 'upgrade':
        return this.tone('square', 600, 1500, 0.2, 0.08);
    }
  }
}

export const audio = new Audio();
