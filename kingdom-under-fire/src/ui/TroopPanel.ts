import type { World } from '../core/World';
import { UNIT_DEFS, unitIndex } from '../data/units';
import { FORMATION_LABELS, FORMATION_TYPES } from '../formations/FormationType';
import type { TroopInput } from '../input/TroopInput';
import type { Troop, TroopStatus, TroopSystem } from '../troops/TroopSystem';

const STATUS: Record<TroopStatus, string> = {
  idle: 'en position',
  moving: 'en marche',
  fighting: 'au combat',
  routing: 'en déroute',
  defeated: 'anéantie',
};

const REASON: Record<string, string> = {
  broken: 'troupe brisée',
  casting: 'en préparation',
  cooldown: 'en recharge',
  sp: 'SP insuffisants',
};

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * The player's troops, bottom centre: one card per troop (name, soldiers left, health of its leader, what
 * it is doing, waypoints) and the orders of the chosen troop (formations, hold). Click a card to choose
 * the troop and look at it. The DOM is only touched when a displayed value changes.
 */
export class TroopPanel {
  readonly el: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly actions: HTMLDivElement;
  private readonly skills: HTMLDivElement;
  /** Troop whose skills are shown. */
  private skillsOf = -2;
  private readonly cards = new Map<number, HTMLButtonElement>();
  private readonly cache = new Map<string, string>();

  constructor(
    root: HTMLElement,
    private readonly world: World,
    private readonly troops: TroopSystem,
    private readonly input: TroopInput,
    private readonly team: number,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'troop-panel panel interactive';
    this.list = document.createElement('div');
    this.list.className = 'troop-list';
    this.actions = document.createElement('div');
    this.actions.className = 'troop-actions';
    for (const type of FORMATION_TYPES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.formation = type;
      b.textContent = FORMATION_LABELS[type];
      b.title = `Formation : ${FORMATION_LABELS[type]} (F : suivante)`;
      b.onclick = () => input.setFormation(type);
      this.actions.append(b);
    }
    const hold = document.createElement('button');
    hold.type = 'button';
    hold.textContent = 'Tenir (H)';
    hold.title = 'La troupe s’arrête et tient sa position';
    hold.onclick = () => input.hold();
    this.actions.append(hold);
    this.skills = document.createElement('div');
    this.skills.className = 'troop-skills';
    this.el.append(this.list, this.skills, this.actions);
    root.append(this.el);
  }

  private card(t: Troop): HTMLButtonElement {
    let el = this.cards.get(t.id);
    if (el) return el;
    el = document.createElement('button');
    el.type = 'button';
    el.className = `troop-card${t.hero ? ' hero' : ''}`;
    el.dataset.troop = `${t.id}`;
    const def = UNIT_DEFS[unitIndex(t.soldierType)];
    el.title = `${t.name} — ${def.name}\n${def.description}\nClic : choisir cette troupe (Q / E : précédente / suivante)`;
    el.innerHTML = `<span class="troop-name">${escape(t.name)}</span>
      <span class="troop-count"></span>
      <span class="gauge leader" title="Chef de troupe"><i></i></span>
      <span class="troop-status"></span>
      <span class="troop-sp" title="SP de la troupe : gagnés en combattant, dépensés en compétences"></span>`;
    el.onclick = () => {
      const troop = this.troops.get(t.id);
      if (troop && troop.status !== 'defeated' && troop.status !== 'routing') this.input.select(troop, true);
    };
    this.list.append(el);
    this.cards.set(t.id, el);
    return el;
  }

  /** Skill buttons of the chosen troop (1–4), with their cost, cooldown and why they cannot be used. */
  private updateSkills(): void {
    const t = this.input.troop();
    const id = t && t.skills.length ? t.id : -1;
    if (id !== this.skillsOf) {
      this.skillsOf = id;
      this.skills.hidden = id < 0;
      this.skills.innerHTML = t
        ? t.skills
            .map(
              (a, slot) => `<button type="button" class="troop-skill" data-slot="${slot}">
          <span class="icon">${escape(a.icon)}</span><span class="name">${escape(a.name)}</span>
          <span class="key">${slot + 1}</span><span class="cost">${a.spCost}</span><span class="cd"></span></button>`,
            )
            .join('')
        : '';
      this.skills.querySelectorAll<HTMLButtonElement>('.troop-skill').forEach((b) => (b.onclick = () => this.input.skill(Number(b.dataset.slot))));
      for (const key of [...this.cache.keys()]) if (key.startsWith('skill')) this.cache.delete(key);
    }
    if (!t || id < 0) return;
    t.skills.forEach((a, slot) => {
      const reason = this.troops.skillBlocked(t, slot);
      const cd = t.cooldowns[slot] > 0 ? (t.cooldowns[slot] / a.cooldown).toFixed(2) : '0';
      const aiming = this.input.targeting?.troop === t.id && this.input.targeting.slot === slot;
      this.set(`skill${slot}`, `${reason}|${cd}|${aiming}`, () => {
        const b = this.skills.querySelector<HTMLButtonElement>(`.troop-skill[data-slot="${slot}"]`)!;
        b.classList.toggle('unavailable', reason !== null);
        b.classList.toggle('aiming', aiming);
        b.style.setProperty('--cd', cd);
        b.title = `${a.name} — ${a.description}\n${a.spCost} SP · recharge ${a.cooldown} s · touche ${slot + 1}${reason ? ` · ${REASON[reason]}` : ''}`;
      });
    });
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply();
  }

  update(): void {
    const { c } = this.world;
    const selected = this.input.troop()?.id ?? -1;
    for (const t of this.troops.list(this.team, false, 'player')) {
      const el = this.card(t);
      const k = `t${t.id}`;
      const leaderAlive = c.hp[t.leader] > 0 && t.members.includes(t.leader);
      const hp = leaderAlive ? Math.max(0, Math.min(1, c.hp[t.leader] / c.maxHp[t.leader])) : 0;
      this.set(`${k}count`, `${t.members.length}/${t.initialSize}`, () => (el.querySelector('.troop-count')!.textContent = `${t.members.length} / ${t.initialSize}`));
      this.set(`${k}hp`, hp.toFixed(3), () => el.querySelector<HTMLElement>('.gauge.leader i')!.style.setProperty('width', `${(hp * 100).toFixed(1)}%`));
      const sp = t.hero ? '' : `SP ${Math.floor(t.sp)}`;
      this.set(`${k}sp`, sp, () => (el.querySelector('.troop-sp')!.textContent = sp));
      const status = `${STATUS[t.status]}${t.waypoints.length > 1 ? ` · ${t.waypoints.length} étapes` : ''}`;
      this.set(`${k}status`, status, () => (el.querySelector('.troop-status')!.textContent = status));
      this.set(`${k}state`, `${t.status}|${t.id === selected}`, () => {
        el.classList.toggle('selected', t.id === selected);
        el.classList.toggle('broken', t.status === 'routing' || t.status === 'defeated');
      });
    }
    this.updateSkills();
    const formation = this.input.formation();
    this.set('formation', `${formation}`, () => {
      this.actions.querySelectorAll<HTMLButtonElement>('button[data-formation]').forEach((b) => b.classList.toggle('active', b.dataset.formation === formation));
    });
    this.set('actions', `${selected >= 0}`, () => (this.actions.hidden = selected < 0));
  }
}
