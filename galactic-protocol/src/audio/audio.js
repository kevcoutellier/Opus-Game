// Sound effects and music. Official samples downloaded by `npm run assets` (sounds of the LucasArts games,
// main theme) are used when present; otherwise everything is synthesised with WebAudio.

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('galactic-protocol:muted') === '1';
    } catch {
      // Storage unavailable.
    }
    this.last = {};
    this.theme = null;
    this.ambient = null;
    this.sfx = {};
    this.buffers = new Map();
    this.themeUrl = null;
    this.themeEl = null;
  }

  /** Registers the downloaded samples (see scripts/fetch-assets.mjs). */
  setManifest(manifest) {
    this.sfx = manifest?.sfx || {};
    this.themeUrl = manifest?.files?.['audio/theme'] ? `assets/${manifest.files['audio/theme']}` : null;
  }

  /** Plays a random official sample of a category; false when none is available. */
  sample(category, { volume = 0.5, throttle = 0 } = {}) {
    const list = this.sfx[category];
    if (!list?.length || this.muted) return false;
    if (throttle && !this.throttle(`s:${category}`, throttle)) return true;
    const ctx = this.ensure();
    if (!ctx) return false;
    const file = list[Math.floor(Math.random() * list.length)];
    if (!this.buffers.has(file)) {
      this.buffers.set(file, fetch(`assets/${file}`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null));
    }
    this.buffers.get(file).then((buffer) => {
      if (!buffer || this.muted) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(this.master);
      src.start();
    });
    return true;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('galactic-protocol:muted', this.muted ? '1' : '0');
    } catch {
      // Storage unavailable.
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    if (this.themeEl) this.themeEl.muted = this.muted;
    return this.muted;
  }

  throttle(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  tone({ freq, type = 'sine', dur = 0.15, vol = 0.2, slide = null, delay = 0, attack = 0.005, dest = null }) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(dest || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.5, vol = 0.3, filter = 800, delay = 0 }) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(lp);
    lp.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  click() { if (!this.sample('ui', { volume: 0.25, throttle: 60 })) this.tone({ freq: 1200, type: 'square', dur: 0.04, vol: 0.05 }); }
  select() { if (!this.sample('hyperspace', { volume: 0.35, throttle: 300 })) this.tone({ freq: 700, type: 'triangle', dur: 0.08, vol: 0.08, slide: 1000 }); }
  error() { this.tone({ freq: 220, type: 'sawtooth', dur: 0.18, vol: 0.08, slide: 140 }); }
  confirm() {
    this.tone({ freq: 660, type: 'triangle', dur: 0.1, vol: 0.1 });
    this.tone({ freq: 990, type: 'triangle', dur: 0.14, vol: 0.1, delay: 0.08 });
  }
  notify() { if (this.throttle('notify', 400)) this.tone({ freq: 880, type: 'sine', dur: 0.25, vol: 0.08, slide: 1320 }); }
  /** Soft shimmer of a hologram switching on. */
  holo() {
    if (!this.throttle('holo', 250)) return;
    this.tone({ freq: 1500, type: 'sine', dur: 0.16, vol: 0.025, slide: 2600 });
    this.tone({ freq: 2250, type: 'triangle', dur: 0.12, vol: 0.015, slide: 3400, delay: 0.04 });
  }
  /** Incoming holographic transmission: warbling chirps over a burst of static. */
  transmission() {
    if (!this.throttle('transmission', 800)) return;
    this.noise({ dur: 0.35, vol: 0.05, filter: 3200 });
    for (let i = 0; i < 3; i++) this.tone({ freq: 1250 + i * 180, type: 'sine', dur: 0.07, vol: 0.05, slide: 1700 + i * 200, delay: 0.1 + i * 0.09 });
  }
  laser() {
    if (!this.throttle('laser', 700)) return;
    if (this.sample('laser', { volume: 0.3 })) return;
    this.tone({ freq: 1800, type: 'sawtooth', dur: 0.18, vol: 0.05, slide: 200 });
    this.tone({ freq: 1400, type: 'square', dur: 0.14, vol: 0.03, slide: 180, delay: 0.09 });
  }
  explosion(big = false) {
    if (!this.throttle(big ? 'boom' : 'pop', big ? 200 : 600)) return;
    if (this.sample('explosion', { volume: big ? 0.9 : 0.4 })) return;
    this.noise({ dur: big ? 2.8 : 0.6, vol: big ? 0.7 : 0.25, filter: big ? 500 : 1200 });
    if (big) this.tone({ freq: 60, type: 'sine', dur: 2.5, vol: 0.5, slide: 25 });
  }
  superlaser() {
    if (this.sample('superlaser', { volume: 0.9 })) {
      this.explosion(true);
      return;
    }
    this.tone({ freq: 110, type: 'sawtooth', dur: 1.6, vol: 0.25, slide: 55, attack: 0.4 });
    this.tone({ freq: 220, type: 'square', dur: 1.4, vol: 0.08, slide: 440, attack: 0.3 });
    this.explosion(true);
  }
  klaxon() {
    if (!this.throttle('klaxon', 3000)) return;
    if (this.sample('alarm', { volume: 0.45 })) return;
    for (let i = 0; i < 3; i++) this.tone({ freq: 520, type: 'square', dur: 0.28, vol: 0.07, slide: 390, delay: i * 0.34 });
  }

  /** Main theme: the official recording when provided, else an original synthesised fanfare. */
  playTheme({ volume = 0.85, restart = true, loop = false } = {}) {
    if (this.themeUrl) {
      if (!this.themeEl) this.themeEl = new window.Audio(this.themeUrl);
      const el = this.themeEl;
      clearInterval(this.fade);
      el.loop = loop;
      el.muted = this.muted;
      el.volume = volume;
      if (restart) el.currentTime = 0;
      el.play().catch(() => {});
      return;
    }
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    this.stopTheme();
    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    bus.connect(lp);
    lp.connect(this.master);
    this.theme = bus;
    // Melody in D minor / F major, an original motif.
    const melody = [[62, 1], [69, 1.5], [67, 0.5], [65, 0.5], [64, 0.5], [74, 2], [69, 1], [67, 0.5], [65, 0.5], [64, 0.5], [74, 2], [69, 1],
      [67, 0.5], [65, 0.5], [67, 0.5], [64, 2.5], [62, 1], [65, 1], [69, 1], [72, 1.5], [70, 0.5], [69, 3]];
    let t = 5.2;
    const beat = 0.55;
    for (const [n, d] of melody) {
      for (const detune of [0, 7]) {
        this.tone({ freq: NOTE(n) * (detune ? 1.003 : 1), type: 'sawtooth', dur: d * beat * 1.05, vol: 0.05, delay: t, attack: 0.04, dest: bus });
      }
      this.tone({ freq: NOTE(n - 12), type: 'triangle', dur: d * beat, vol: 0.06, delay: t, attack: 0.02, dest: bus });
      t += d * beat;
    }
    const chords = [[50, 57, 62], [46, 53, 58], [48, 55, 60], [45, 52, 57]];
    for (let i = 0; i < 8; i++) {
      for (const n of chords[i % 4]) this.tone({ freq: NOTE(n), type: 'triangle', dur: 2.3, vol: 0.035, delay: 5.2 + i * 2.2, attack: 0.3, dest: bus });
    }
  }

  stopTheme() {
    if (this.themeEl && !this.themeEl.paused) {
      const el = this.themeEl;
      clearInterval(this.fade);
      this.fade = setInterval(() => {
        el.volume = Math.max(0, el.volume - 0.05);
        if (el.volume <= 0.01) {
          el.pause();
          clearInterval(this.fade);
        }
      }, 80);
    }
    if (this.theme) {
      try {
        this.theme.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      } catch {
        // Already stopped.
      }
      this.theme = null;
    }
  }

  /** Slow evolving pad during the game. */
  startAmbient() {
    const ctx = this.ensure();
    if (!ctx || this.ambient) return;
    const bus = ctx.createGain();
    bus.gain.value = 0.0;
    bus.gain.setTargetAtTime(0.35, ctx.currentTime, 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    bus.connect(lp);
    lp.connect(this.master);
    this.ambient = { bus, timer: null };
    const progression = [[38, 45, 50, 53], [34, 41, 46, 50], [36, 43, 48, 52], [33, 40, 45, 49]];
    let i = 0;
    const play = () => {
      if (!this.ambient || this.muted) return;
      for (const n of progression[i % progression.length]) {
        this.tone({ freq: NOTE(n), type: 'sine', dur: 9, vol: 0.05, attack: 2.5, dest: bus });
        this.tone({ freq: NOTE(n) * 1.004, type: 'triangle', dur: 9, vol: 0.02, attack: 3, dest: bus });
      }
      i++;
    };
    play();
    this.ambient.timer = setInterval(play, 8000);
  }

  stopAmbient() {
    if (!this.ambient) return;
    clearInterval(this.ambient.timer);
    this.ambient.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    this.ambient = null;
  }
}

export const audio = new SoundSystem();
