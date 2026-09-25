import type { World } from '../core/World';
import { character } from '../data/story/lore';
import { MAX_LEVEL, xpForLevel, type HeroState, type HeroSystem } from '../heroes/HeroSystem';
import type { HeroInput } from '../input/HeroInput';

const RTS_KEYS = ['Z', 'X', 'C', 'V'];
const DIRECT_KEYS = ['1', '2', '3', '4'];
const REASON: Record<string, string> = {
  cooldown: 'en recharge',
  mana: 'mana insuffisant',
  casting: 'incantation en cours',
  stunned: 'étourdi',
  dead: 'tombé au combat',
};

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * The player's hero, bottom left: portrait, level, health, mana and experience, the four abilities with
 * their cooldowns (click or Z X C V; 1–4 under direct control) and the direct-control toggle (Tab).
 * The DOM is only touched when a displayed value changes.
 */
export class HeroBar {
  private readonly el: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly directHint: HTMLDivElement;
  private shown: number | null = null;
  private readonly cache = new Map<string, string>();

  constructor(
    root: HTMLElement,
    private readonly world: World,
    private readonly heroes: HeroSystem,
    private readonly input: HeroInput,
    private readonly portrait: (character: string) => string | null,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'hero-bar panel interactive';
    this.el.hidden = true;
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.crosshair.hidden = true;
    this.directHint = document.createElement('div');
    this.directHint.className = 'direct-hint panel';
    this.directHint.hidden = true;
    this.directHint.innerHTML =
      '<b>Contrôle direct</b> WASD : marcher · souris : regarder (cliquez pour la capturer) · clic : frapper · clic droit : coup puissant · Espace : esquive · 1–4 : capacités · Tab : rendre la main';
    root.append(this.el, this.crosshair, this.directHint);
  }

  private build(h: HeroState): void {
    const url = this.portrait(h.character);
    const who = character(h.character);
    const picture = url ? `<img src="${escape(url)}" alt="" />` : `<div class="crest">${escape(h.name.slice(0, 2))}</div>`;
    this.el.innerHTML = `
      <div class="hero-portrait" title="${escape(who.bio)}">${picture}</div>
      <div class="hero-info">
        <div class="hero-name">${escape(h.name)} <span class="hero-level"></span></div>
        <div class="gauge hp" title="Santé"><i></i></div>
        <div class="gauge mana" title="Mana"><i></i></div>
        <div class="gauge xp" title="Expérience"><i></i></div>
      </div>
      <div class="hero-abilities">${h.abilities
        .map(
          (a, slot) => `<button type="button" class="ability" data-slot="${slot}">
            <span class="icon">${escape(a.icon)}</span><span class="key"></span><span class="cost">${a.manaCost}</span><span class="cd"></span>
          </button>`,
        )
        .join('')}</div>
      <button type="button" class="hero-direct">Contrôle direct <span class="key">Tab</span></button>`;
    this.el.querySelectorAll<HTMLButtonElement>('.ability').forEach((button) => {
      button.onclick = () => this.input.trigger(Number(button.dataset.slot));
    });
    this.el.querySelector<HTMLButtonElement>('.hero-direct')!.onclick = () => this.input.toggleDirect();
    this.cache.clear();
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply();
  }

  update(): void {
    const h = this.input.hero();
    const direct = this.input.direct >= 0;
    this.crosshair.hidden = !direct;
    this.directHint.hidden = !direct;
    document.body.classList.toggle('hero-direct-mode', direct);
    document.body.classList.toggle('cursor-target', this.input.targeting !== null);
    if (!h) {
      this.el.hidden = true;
      this.shown = null;
      return;
    }
    this.el.hidden = false;
    if (this.shown !== h.id) {
      this.shown = h.id;
      this.build(h);
    }
    const c = this.world.c;
    const pct = (v: number) => `${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%`;
    const gauge = (name: string, value: string) =>
      this.set(name, value, () => this.el.querySelector<HTMLElement>(`.gauge.${name} i`)!.style.setProperty('width', value));
    gauge('hp', pct(c.hp[h.id] / c.maxHp[h.id]));
    gauge('mana', pct(h.mana / h.maxMana));
    const from = xpForLevel(h.level);
    const to = xpForLevel(Math.min(MAX_LEVEL, h.level + 1));
    gauge('xp', h.level >= MAX_LEVEL ? '100%' : pct((h.xp - from) / (to - from)));
    this.set('level', `${h.level}`, () => (this.el.querySelector('.hero-level')!.textContent = `niveau ${h.level}`));
    this.set('dead', `${!h.alive}`, () => this.el.classList.toggle('fallen', !h.alive));
    this.set('direct', `${direct}`, () => {
      this.el.querySelector('.hero-direct')!.classList.toggle('active', direct);
      this.el.querySelectorAll<HTMLElement>('.ability .key').forEach((k, i) => (k.textContent = (direct ? DIRECT_KEYS : RTS_KEYS)[i]));
    });
    h.abilities.forEach((a, slot) => {
      const reason = this.heroes.blocked(this.world, h, slot);
      const cd = h.cooldowns[slot] > 0 ? (h.cooldowns[slot] / a.cooldown).toFixed(2) : '0';
      const aiming = this.input.targeting?.slot === slot;
      this.set(`ability${slot}`, `${reason}|${cd}|${aiming}`, () => {
        const button = this.el.querySelector<HTMLButtonElement>(`.ability[data-slot="${slot}"]`)!;
        button.classList.toggle('unavailable', reason !== null);
        button.classList.toggle('aiming', aiming);
        button.style.setProperty('--cd', cd);
        button.title = `${a.name} — ${a.description}\nMana ${a.manaCost} · recharge ${a.cooldown} s${reason ? ` · ${REASON[reason]}` : ''}`;
      });
    });
  }
}
