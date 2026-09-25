import type { World } from '../core/World';
import { FACTIONS } from '../data/factions';
import { UNIT_DEFS } from '../data/units';
import type { SelectionManager } from '../selection/SelectionManager';

/** Bottom panel: what is selected (count per unit type, health, faction). Rebuilt only on change. */
export class SelectionPanel {
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

  update(): void {
    const { selection, world } = this;
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
