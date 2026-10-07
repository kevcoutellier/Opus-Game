import type { World } from '../core/World';
import { character } from '../data/story/lore';
import { MAX_LEVEL, xpForLevel, type HeroState, type HeroSystem } from '../heroes/HeroSystem';
import { move } from '../heroes/Moves';
import { ASSIST_SP } from '../heroes/Officer';
import type { HeroInput } from '../input/HeroInput';

const RTS_KEYS = ['Z', 'X', 'C', 'V'];
const DIRECT_KEYS = ['1', '2', '3', '4'];
const REASON: Record<string, string> = {
  cooldown: 'en recharge',
  sp: 'SP insuffisants',
  casting: 'incantation en cours',
  stunned: 'étourdi',
  dead: 'tombé au combat',
  none: 'absent',
};
/** The chord of each officer, on the pad and on the keyboard and mouse. */
const CHORD_KEYS: Record<string, { pad: string; pc: string }> = {
  XA: { pad: 'X + A', pc: 'clic G + clic D' },
  BY: { pad: 'B + Y', pc: 'Espace + R' },
};
/** Seconds the name of a special move stays under the combo counter. */
const MOVE_LABEL_SECONDS = 1.4;

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * The player's hero, bottom left: portrait, level, health, SP and experience, the four abilities with
 * their cooldowns (click or Z X C V; 1–4 in action mode), his officers and their assists, and the
 * action-mode toggle (Tab). In action mode, a combo counter shows the enemies struck and the special moves.
 * The DOM is only touched when a displayed value changes.
 */
export class HeroBar {
  private readonly el: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly directHint: HTMLDivElement;
  private readonly comboEl: HTMLDivElement;
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
      '<b>Mode action</b> WASD · souris · clic : X (attaque) · clic droit : A · R : Y (spécial) · Espace : B (contre, esquive) · clic G + D, Espace + R : officiers · 1–4 : capacités · Tab : mode tactique';
    this.comboEl = document.createElement('div');
    this.comboEl.className = 'combo-counter';
    this.comboEl.hidden = true;
    this.comboEl.innerHTML = '<span class="combo-hits"></span><span class="combo-move"></span>';
    root.append(this.el, this.crosshair, this.directHint, this.comboEl);
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
        <div class="gauge sp" title="SP : gagnés en combattant, dépensés en capacités, Smash (180) et assistances (200)"><i></i><span class="gauge-text"></span></div>
        <div class="gauge xp" title="Expérience"><i></i></div>
      </div>
      <div class="hero-abilities">${h.abilities
        .map(
          (a, slot) => `<button type="button" class="ability" data-slot="${slot}">
            <span class="icon">${escape(a.icon)}</span><span class="key"></span><span class="cost">${a.spCost}</span><span class="cd"></span>
          </button>`,
        )
        .join('')}</div>
      <div class="hero-officers">${h.officers
        .map((o, slot) =>
          o
            ? `<button type="button" class="officer" data-slot="${slot}">
            <span class="icon">${escape(o.def.assist.icon)}</span>
            <span class="officer-name">${escape(o.def.name)}<small>${escape(o.def.assist.name)}</small></span>
            <span class="key">${CHORD_KEYS[o.def.chord].pad}</span><span class="cost">${ASSIST_SP}</span>
          </button>`
            : '',
        )
        .join('')}</div>
      <button type="button" class="hero-direct">Mode action <span class="key">Tab</span></button>`;
    this.el.querySelectorAll<HTMLButtonElement>('.ability').forEach((button) => {
      button.onclick = () => this.input.trigger(Number(button.dataset.slot));
    });
    this.el.querySelectorAll<HTMLButtonElement>('.officer').forEach((button) => {
      button.onclick = () => this.input.assist(Number(button.dataset.slot));
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
      this.comboEl.hidden = true;
      this.cache.delete('combo');
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
    gauge('sp', pct(h.sp / h.maxSp));
    this.set('spText', `${Math.floor(h.sp)}/${h.maxSp}`, () => (this.el.querySelector('.gauge.sp .gauge-text')!.textContent = `SP ${Math.floor(h.sp)} / ${h.maxSp}`));
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
        button.title = `${a.name} — ${a.description}\n${a.spCost} SP · recharge ${a.cooldown} s${reason ? ` · ${REASON[reason]}` : ''}`;
      });
    });
    h.officers.forEach((o, slot) => {
      if (!o) return;
      const reason = this.heroes.assistBlocked(this.world, h, slot);
      this.set(`officer${slot}`, `${reason}`, () => {
        const button = this.el.querySelector<HTMLButtonElement>(`.officer[data-slot="${slot}"]`);
        if (!button) return;
        button.classList.toggle('unavailable', reason !== null);
        button.classList.toggle('fallen', reason === 'dead');
        const keys = CHORD_KEYS[o.def.chord];
        button.title = `${o.def.name} — ${o.def.description}\n${o.def.assist.name} : ${o.def.assist.description}\n${ASSIST_SP} SP · ${keys.pad} (${keys.pc})${reason ? ` · ${REASON[reason]}` : ''}`;
      });
    });
    // Combo counter (action mode): enemies struck in a row, and the name of the last special move.
    const now = this.world.time.elapsed;
    const special = h.lastMove && !h.lastMove.startsWith('weak') && now - h.lastMoveAt < MOVE_LABEL_SECONDS ? move(h.lastMove).label : '';
    const showCombo = direct && (h.combo > 1 || special !== '');
    this.set('combo', `${showCombo}|${h.combo}|${special}`, () => {
      this.comboEl.hidden = !showCombo;
      this.comboEl.querySelector('.combo-hits')!.textContent = h.combo > 1 ? `${h.combo} coups` : '';
      this.comboEl.querySelector('.combo-move')!.textContent = special;
    });
  }
}
