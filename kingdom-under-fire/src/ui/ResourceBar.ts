import type { World } from '../core/World';
import { RESOURCE_NAMES, RESOURCE_TYPES } from '../economy/Resources';

/** Short labels (the full names are in the tooltips). */
const LABELS: Record<(typeof RESOURCE_TYPES)[number], string> = { gold: 'Or', wood: 'Bois', food: 'Vivres', stone: 'Pierre', mana: 'Mana' };

/** The team's stock of the five resources, with the income per minute in the tooltip. */
export class ResourceBar {
  private readonly el: HTMLDivElement;
  private readonly values = new Map<string, HTMLElement>();
  private readonly cache = new Map<string, string>();

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly team: number,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'resource-bar panel';
    for (const type of RESOURCE_TYPES) {
      const item = document.createElement('span');
      item.className = `resource ${type}`;
      item.innerHTML = `<span class="label">${LABELS[type]}</span><b></b>`;
      this.el.appendChild(item);
      this.values.set(type, item);
    }
    parent.appendChild(this.el);
  }

  update(): void {
    const rate = this.world.resources.rate(this.team);
    for (const type of RESOURCE_TYPES) {
      const value = `${Math.floor(this.world.resources.get(this.team, type))}|${Math.round(rate[type] * 60)}`;
      if (this.cache.get(type) === value) continue;
      this.cache.set(type, value);
      const item = this.values.get(type)!;
      item.querySelector('b')!.textContent = value.split('|')[0];
      item.title = `${RESOURCE_NAMES[type]} : +${Math.round(rate[type] * 60)} par minute`;
    }
  }
}
