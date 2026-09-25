import { assetUrl } from '../render/assets.js';

// Everything is synthesised with WebAudio (no copyrighted music): chiptune
// SFX, two original looping themes and crowd noise. Cries are the Gen 1 ones
// from PokeAPI.

const NOTE = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const idx = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((idx + (Number(m[3]) + 1) * 12 - 69) / 12);
};

// Patterns are arrays of notes per step ('.' = rest, '-' = hold).
const THEMES = {
  menu: {
    bpm: 112,
    steps: 8,
    lead: 'E5 - G5 - C6 - B5 A5 | G5 - E5 - C5 - D5 E5 | F5 - A5 - C6 - A5 F5 | G5 - - - D5 - . . | E5 - G5 - C6 - D6 E6 | D6 - B5 - G5 - A5 B5 | C6 - A5 - F5 - A5 C6 | B5 - - - G5 - . .',
    bass: 'C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . B2 . | C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . B2 .',
    drums: 'k . h . s . h . | k . h . s . h h',
  },
  battle: {
    bpm: 152,
    steps: 8,
    lead: 'A4 - C5 - E5 - D5 C5 | F4 - A4 - C5 - B4 A4 | G4 - B4 - D5 - C5 B4 | E5 - - D5 C5 B4 G#4 - | A4 - C5 - E5 - A5 G5 | F5 - E5 - D5 - C5 D5 | E5 - D5 - C5 - B4 C5 | B4 - - - E5 - - -',
    bass: 'A2 A2 A3 A2 A2 A2 A3 A2 | F2 F2 F3 F2 F2 F2 F3 F2 | G2 G2 G3 G2 G2 G2 G3 G2 | E2 E2 E3 E2 E2 E2 G#2 B2 | A2 A2 A3 A2 A2 A2 A3 A2 | F2 F2 F3 F2 F2 F2 F3 F2 | C3 C3 C4 C3 C3 C3 C4 C3 | E2 E2 E3 E2 E2 E2 G#2 B2',
    drums: 'k . h k s . h . | k . h k s . h s',
  },
  victory: {
    bpm: 132,
    steps: 8,
    lead: 'C5 - E5 - G5 - C6 - | B5 - G5 - D6 - - - | C6 - G5 - E5 - G5 - | C6 - - - - - . .',
    bass: 'C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | A2 . E3 . F2 . C3 . | C3 . G3 . C3 . . .',
    drums: 'k . h . s . h . | k . h . s . k .',
  },
};

function parse(pattern) {
  return pattern.replace(/\|/g, ' ').trim().split(/\s+/);
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.settings = { music: true, sfx: true, voice: true, volume: 0.8 };
    this.cries = new Map();
    this.theme = null;
    this.voice = null;
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    if ('speechSynthesis' in window) {
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this.voice = voices.find((v) => v.lang?.startsWith('fr')) || null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.volume;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.settings.music ? 0.32 : 0;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.settings.sfx ? 1 : 0;
      this.sfxBus.connect(this.master);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (this.pendingTheme) this.playTheme(this.pendingTheme);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  apply(settings) {
    Object.assign(this.settings, settings);
    if (!this.ctx) return;
    this.master.gain.value = this.settings.volume;
    this.musicBus.gain.value = this.settings.music ? 0.32 : 0;
    this.sfxBus.gain.value = this.settings.sfx ? 1 : 0;
    if (!this.settings.voice && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  // ------------------------------------------------------------ synthesis

  tone(freq, { type = 'square', start = 0, dur = 0.1, gain = 0.2, slide = 0, bus = this.sfxBus, attack = 0.005 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseHit({ start = 0, dur = 0.15, gain = 0.3, filter = 1200, type = 'lowpass', bus = this.sfxBus, q = 0.8 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filter;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  sfx(name, opts = {}) {
    if (!this.ensure() || !this.settings.sfx) return;
    switch (name) {
      case 'cursor':
        this.tone(1320, { dur: 0.05, gain: 0.08 });
        break;
      case 'select':
        this.tone(988, { dur: 0.06, gain: 0.12 });
        this.tone(1480, { start: 0.06, dur: 0.1, gain: 0.12 });
        break;
      case 'back':
        this.tone(660, { dur: 0.08, gain: 0.1, slide: 0.6 });
        break;
      case 'throw':
        this.tone(400, { dur: 0.35, gain: 0.1, slide: 3, type: 'triangle' });
        break;
      case 'open':
        this.noiseHit({ dur: 0.4, gain: 0.35, filter: 4000, type: 'highpass' });
        this.tone(1760, { dur: 0.3, gain: 0.08, slide: 0.5, type: 'sine' });
        break;
      case 'recall':
        this.tone(1200, { dur: 0.4, gain: 0.1, slide: 0.3, type: 'sawtooth' });
        break;
      case 'hit': {
        const strong = opts.strong;
        this.noiseHit({ dur: strong ? 0.35 : 0.2, gain: strong ? 0.55 : 0.4, filter: strong ? 900 : 1600 });
        this.tone(strong ? 90 : 140, { dur: 0.2, gain: 0.35, slide: 0.4, type: 'sine' });
        break;
      }
      case 'weak':
        this.noiseHit({ dur: 0.12, gain: 0.25, filter: 2500 });
        break;
      case 'miss':
        this.noiseHit({ dur: 0.35, gain: 0.2, filter: 3000, type: 'bandpass', q: 3 });
        break;
      case 'faint':
        this.tone(600, { dur: 0.7, gain: 0.15, slide: 0.15, type: 'square' });
        break;
      case 'statUp':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, { start: i * 0.06, dur: 0.12, gain: 0.08 }));
        break;
      case 'statDown':
        [1046, 784, 659, 523].forEach((f, i) => this.tone(f, { start: i * 0.06, dur: 0.12, gain: 0.08 }));
        break;
      case 'heal':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, { start: i * 0.08, dur: 0.2, gain: 0.07, type: 'triangle' }));
        break;
      case 'status':
        this.tone(300, { dur: 0.3, gain: 0.12, slide: 1.8, type: 'sawtooth' });
        break;
      case 'explosion':
        this.noiseHit({ dur: 1.2, gain: 0.8, filter: 500 });
        this.tone(60, { dur: 0.8, gain: 0.5, slide: 0.5, type: 'sine' });
        break;
      case 'thunder':
        this.noiseHit({ dur: 0.7, gain: 0.6, filter: 2500, type: 'bandpass', q: 0.5 });
        break;
      case 'crowd':
        this.noiseHit({ dur: opts.dur || 1.6, gain: opts.gain || 0.18, filter: 900, type: 'bandpass', q: 0.7 });
        break;
      case 'lowhp':
        this.tone(1760, { dur: 0.08, gain: 0.05 });
        this.tone(1760, { start: 0.14, dur: 0.08, gain: 0.05 });
        break;
      default:
    }
  }

  // ------------------------------------------------------------- cries

  async cry(num, { rate = 1 } = {}) {
    if (!this.ensure() || !this.settings.sfx) return;
    try {
      if (!this.cries.has(num)) {
        this.cries.set(
          num,
          fetch(assetUrl('cries', num))
            .then((r) => r.arrayBuffer())
            .then((b) => this.ctx.decodeAudioData(b)),
        );
      }
      const buffer = await this.cries.get(num);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = 0.55;
      src.connect(g).connect(this.sfxBus);
      src.start();
    } catch (err) {
      this.cries.delete(num);
      console.warn('[audio] cry unavailable', num, err);
    }
  }

  // ------------------------------------------------------------- music

  playTheme(name) {
    if (!this.ctx) {
      this.pendingTheme = name;
      return;
    }
    if (this.theme?.name === name) return;
    this.stopTheme();
    const theme = THEMES[name];
    if (!theme) return;
    const lead = parse(theme.lead);
    const bass = parse(theme.bass);
    const drums = parse(theme.drums);
    const stepDur = 60 / theme.bpm / 2;
    const state = { name, step: 0, next: this.ctx.currentTime + 0.1 };
    this.theme = state;
    const schedule = () => {
      while (state.next < this.ctx.currentTime + 0.15) {
        const start = state.next - this.ctx.currentTime;
        const i = state.step;
        const holdLen = (list, idx) => {
          let len = 1;
          while (list[(idx + len) % list.length] === '-') len++;
          return len;
        };
        const l = lead[i % lead.length];
        if (l !== '.' && l !== '-') this.tone(NOTE(l), { start, dur: stepDur * holdLen(lead, i % lead.length) * 0.95, gain: 0.09, bus: this.musicBus, type: 'square' });
        const b = bass[i % bass.length];
        if (b !== '.' && b !== '-') this.tone(NOTE(b), { start, dur: stepDur * 0.9, gain: 0.16, bus: this.musicBus, type: 'triangle' });
        const d = drums[i % drums.length];
        if (d === 'k') this.tone(110, { start, dur: 0.12, gain: 0.3, slide: 0.4, type: 'sine', bus: this.musicBus });
        if (d === 's') this.noiseHit({ start, dur: 0.12, gain: 0.16, filter: 2200, type: 'bandpass', bus: this.musicBus });
        if (d === 'h') this.noiseHit({ start, dur: 0.03, gain: 0.07, filter: 7000, type: 'highpass', bus: this.musicBus });
        state.step++;
        state.next += stepDur;
      }
    };
    state.timer = setInterval(schedule, 30);
    schedule();
  }

  stopTheme() {
    if (this.theme) clearInterval(this.theme.timer);
    this.theme = null;
    this.pendingTheme = null;
  }

  // ------------------------------------------------------------ commentator

  say(text) {
    if (!this.settings.voice || !text || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    if (this.voice) u.voice = this.voice;
    u.rate = 1.12;
    u.pitch = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}
