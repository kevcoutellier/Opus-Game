import type { BuildingSystem } from '../buildings/BuildingSystem';
import type { World } from '../core/World';
import { BUILDING_DEFS, BUILDING_INDEX, buildingsOf } from '../data/buildings';
import { formatCost } from '../economy/Resources';
import type { BuildingInput } from '../input/BuildingInput';

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Bottom right: the buildings the player can raise, with their cost; greyed when out of reach. */
export class BuildMenu {
  private readonly el: HTMLDivElement;
  private readonly buttons: { button: HTMLButtonElement; type: number }[] = [];
  private readonly cache = new Map<number, string>();

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly buildings: BuildingSystem,
    private readonly input: BuildingInput,
    faction: string,
    private readonly team: number,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'build-menu panel interactive';
    this.el.innerHTML = '<div class="title">Bâtir</div><div class="build-list"></div><div class="build-hint">R : tourner · Maj : en poser plusieurs · clic droit : annuler</div>';
    const list = this.el.querySelector('.build-list')!;
    for (const def of buildingsOf(faction).filter((b) => !b.hq)) {
      const type = BUILDING_INDEX.get(def.id)!;
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `<b>${escape(def.name)}</b><span>${escape(formatCost(def.cost))}</span>`;
      button.onclick = () => this.input.place(type);
      list.appendChild(button);
      this.buttons.push({ button, type });
    }
    parent.appendChild(this.el);
  }

  update(): void {
    const placing = this.input.placing?.type ?? -1;
    for (const { button, type } of this.buttons) {
      const def = BUILDING_DEFS[type];
      const missing = def.requires.find((r) => !this.buildings.owns(this.team, r));
      const affordable = this.world.resources.canAfford(this.team, def.cost);
      const state = `${missing ?? ''}|${affordable}|${placing === type}`;
      if (this.cache.get(type) === state) continue;
      this.cache.set(type, state);
      button.classList.toggle('unavailable', !!missing || !affordable);
      button.classList.toggle('active', placing === type);
      const need = missing ? `\nNécessite : ${BUILDING_DEFS[BUILDING_INDEX.get(missing)!].name}` : !affordable ? '\nRessources insuffisantes' : '';
      button.title = `${def.name} — ${def.description}\n${formatCost(def.cost)} · ${def.buildTime} s${need}`;
    }
    const hint = this.el.querySelector<HTMLElement>('.build-hint')!;
    const reason = this.input.placing ? (this.input.reason ?? 'Clic : poser les fondations') : '';
    hint.textContent = this.input.placing ? `${reason} · R : tourner · clic droit : annuler` : 'Choisissez un bâtiment à élever près de vos bâtiments.';
  }
}
