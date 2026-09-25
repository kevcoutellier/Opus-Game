import type { World } from '../core/World';
import { FACTIONS } from '../data/factions';
import { UNIT_DEFS } from '../data/units';
import type { SelectionManager } from '../selection/SelectionManager';

export interface PanelAction {
  label: string;
  title: string;
  onClick(): void;
  /** Highlighted when true (current formation, armed order). */
  active?(): boolean;
}

/** Bottom panel: what is selected (count per unit type, health, faction) and the order buttons. */
export class SelectionPanel {
  private buttons: { el: HTMLButtonElement; action: PanelAction }[] = [];
  readonly el: HTMLDivElement;
  private readonly summary: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  readonly actions: HTMLDivElement;
  private version = -1;

  constructor(
    root: HTMLElement,
    private readonly world: World,
    private readonly selection: SelectionManager,
    private readonly teamFactions: string[],
  ) {
    this.el = document.createElement('div');
    this.el.className = 'selection-panel panel interactive';
    this.summary = document.createElement('div');
    this.summary.className = 'selection-summary';
    this.stats = document.createElement('div');
    this.stats.className = 'selection-stats';
    this.actions = document.createElement('div');
    this.actions.className = 'selection-actions';
    this.el.append(this.summary, this.stats, this.actions);
    root.appendChild(this.el);
  }

  setActions(actions: PanelAction[]): void {
    this.buttons = actions.map((action) => {
      const el = document.createElement('button');
      el.textContent = action.label;
      el.title = action.title;
      el.onclick = () => action.onClick();
      return { el, action };
    });
    this.actions.replaceChildren(...this.buttons.map((b) => b.el));
  }

  update(): void {
    const { selection, world } = this;
    if (selection.commandable) {
      for (const { el, action } of this.buttons) {
        const on = action.active?.() ?? false;
        if (el.classList.contains('active') !== on) el.classList.toggle('active', on);
      }
    }
    if (selection.version !== this.version) {
      this.version = selection.version;
      this.el.classList.toggle('empty', selection.size === 0);
      this.summary.replaceChildren(...this.renderSummary());
      this.actions.hidden = !selection.commandable;
    }
    if (!selection.size) return;
    let hp = 0;
    let maxHp = 0;
    for (const id of selection.ids) {
      hp += world.c.hp[id];
      maxHp += world.c.maxHp[id];
    }
    const pct = maxHp ? Math.round((hp / maxHp) * 100) : 0;
    const text = `Santé ${pct} %`;
    if (this.stats.textContent !== text) this.stats.textContent = text;
  }

  private renderSummary(): HTMLElement[] {
    const { selection, world } = this;
    if (!selection.size) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Cliquez ou tracez un rectangle pour sélectionner vos troupes.';
      return [hint];
    }
    const first = selection.ids[0];
    const faction = FACTIONS.find((f) => f.id === this.teamFactions[world.c.team[first]]);
    const title = document.createElement('div');
    title.className = 'title selection-title';
    title.textContent = `${selection.commandable ? '' : 'Ennemi — '}${faction?.name ?? ''} · ${selection.size} unité${selection.size > 1 ? 's' : ''}`;
    const counts = new Map<number, number>();
    for (const id of selection.ids) counts.set(world.c.unitType[id], (counts.get(world.c.unitType[id]) ?? 0) + 1);
    const list = document.createElement('div');
    list.className = 'selection-types';
    for (const [type, count] of counts) {
      const chip = document.createElement('button');
      chip.className = 'type-chip';
      chip.innerHTML = `<b>${count}</b> ${UNIT_DEFS[type].name}${count > 1 ? 's' : ''}`;
      chip.title = `${UNIT_DEFS[type].description}\nClic : ne garder que ce type.`;
      chip.onclick = () => selection.filter((id) => world.c.unitType[id] === type);
      list.appendChild(chip);
    }
    return [title, list];
  }
}
