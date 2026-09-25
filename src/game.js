import { Stage } from './render/stage.js';
import { Arena } from './render/arena.js';
import { Effects } from './render/effects.js';
import { Director } from './render/director.js';
import { BattleScene } from './render/battleScene.js';
import { Showcase } from './render/showcase.js';
import { setTweenSpeed } from './render/tween.js';
import { Audio } from './audio/audio.js';
import { loadProgress, saveProgress } from './game/progress.js';

const SETTINGS_KEY = 'opus-stadium-settings';
const DEFAULT_SETTINGS = {
  playerName: 'ROUGE',
  music: true,
  sfx: true,
  voice: true,
  speed: 1,
  freeRules: 'fixed50',
  difficulty: 1,
};

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Owns the shared 3D/audio systems and swaps the active screen. */
export class Game {
  constructor({ data, canvas, root }) {
    this.data = data;
    this.root = root;
    this.byNum = new Map(data.species.map((s) => [s.num, s]));
    this.byId = new Map(data.species.map((s) => [s.id, s]));
    this.settings = loadSettings();
    this.stage = new Stage(canvas);
    this.arena = new Arena(this.stage);
    this.effects = new Effects(this.stage, document.getElementById('flash'));
    this.director = new Director(this.stage);
    this.battleScene = new BattleScene(this.stage, this.arena, this.effects, this.director);
    this.showcase = new Showcase(this.stage, this.director);
    this.audio = new Audio();
    this.applySettings();
    this.screen = null;
    this.run = null;
    this.progress = loadProgress();
  }

  saveProgress() {
    saveProgress(this.progress);
  }

  saveSettings(patch) {
    Object.assign(this.settings, patch);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // storage unavailable (private mode): settings only last for this session
    }
    this.applySettings();
  }

  applySettings() {
    setTweenSpeed(this.settings.speed);
    this.audio.apply({ music: this.settings.music, sfx: this.settings.sfx, voice: this.settings.voice });
  }

  /** Mounts a screen module: `factory(game, params)` must return { el, destroy? }. */
  async show(factory, params = {}) {
    this.screen?.destroy?.();
    this.root.replaceChildren();
    this.screen = await factory(this, params);
    if (this.screen?.el) this.root.append(this.screen.el);
    return this.screen;
  }

  resetField() {
    this.showcase.clear();
    this.battleScene.clear();
    this.battleScene.setTrainersVisible(false);
  }
}
