import { MAX_QUEUE, type BuildingSystem } from '../buildings/BuildingSystem';
import type { World } from '../core/World';
import { UNIT_DEFS, UNIT_INDEX } from '../data/units';
import { RESOURCE_NAMES, RESOURCE_TYPES, formatCost } from '../economy/Resources';
import type { BuildingInput } from '../input/BuildingInput';

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Bottom centre, in place of the selection panel while a building is selected: its health, construction,
 * income, the soldiers it trains (click to queue), its queue (click to cancel, refunded) and the rally
 * point (right click on the ground).
 */
export class ProductionPanel {
  private readonly el: HTMLDivElement;
  private shown = -1;
  private cache = '';

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly buildings: BuildingSystem,
    private readonly input: BuildingInput,
    private readonly team: number,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'production-panel panel interactive';
    this.el.hidden = true;
    this.el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-train],[data-cancel]');
      if (!target || this.shown < 0) return;
      if (target.dataset.train) this.world.commands.push({ kind: 'train', team: this.team, building: this.shown, unit: target.dataset.train });
      else this.world.commands.push({ kind: 'cancelTrain', team: this.team, building: this.shown, index: Number(target.dataset.cancel) });
    });
    parent.appendChild(this.el);
  }

  update(): void {
    const id = this.input.selected;
    const b = id >= 0 ? this.buildings.get(id) : undefined;
    document.body.classList.toggle('building-selected', !!b);
    if (!b) {
      this.el.hidden = true;
      this.shown = -1;
      return;
    }
    this.el.hidden = false;
    this.shown = id;
    const c = this.world.c;
    const own = b.team === this.team;
    const hp = Math.max(0, c.hp[id] / c.maxHp[id]);
    const training = b.queue.length ? b.training / UNIT_DEFS[UNIT_INDEX.get(b.queue[0])!].trainTime : 0;
    const key = [id, Math.round(hp * 100), Math.round(b.progress * 100), b.queue.join(','), Math.round(training * 50), own && b.def.trains.map((u) => this.world.resources.canAfford(this.team, UNIT_DEFS[UNIT_INDEX.get(u)!].cost)).join()].join('|');
    if (key === this.cache) return;
    this.cache = key;
    const income = RESOURCE_TYPES.filter((t) => b.def.income[t])
      .map((t) => `+${Math.round(b.def.income[t]! * 60)} ${RESOURCE_NAMES[t].toLowerCase()}/min`)
      .join(', ');
    const status = !b.complete ? `En construction : ${Math.round(b.progress * 100)} %` : income ? `Produit ${income}` : '';
    let html = `<div class="production-head"><div class="title">${escape(b.def.name)}</div><div class="${own ? 'ally' : 'enemy'}">${own ? '' : 'Ennemi'}</div></div>
      <div class="gauge hp"><i style="width:${(hp * 100).toFixed(1)}%"></i></div>
      <div class="production-status">${escape(status)} <span class="dim">${escape(b.def.description)}</span></div>`;
    if (own && b.complete && b.def.trains.length) {
      html += `<div class="train-list">${b.def.trains
        .map((u) => {
          const def = UNIT_DEFS[UNIT_INDEX.get(u)!];
          const off = !this.world.resources.canAfford(this.team, def.cost) || b.queue.length >= MAX_QUEUE;
          return `<button type="button" data-train="${u}" class="${off ? 'unavailable' : ''}" title="${escape(def.description)}\n${escape(formatCost(def.cost))} · ${def.trainTime} s"><b>${escape(def.name)}</b><span>${escape(formatCost(def.cost))}</span></button>`;
        })
        .join('')}</div>`;
      html += `<div class="queue">${b.queue
        .map((u, i) => {
          const name = UNIT_DEFS[UNIT_INDEX.get(u)!].name;
          const progress = i === 0 ? `<i style="width:${(training * 100).toFixed(0)}%"></i>` : '';
          return `<button type="button" data-cancel="${i}" title="Annuler (remboursé)">${progress}<span>${escape(name)}</span></button>`;
        })
        .join('')}${b.queue.length ? '' : '<span class="dim">Aucune recrue en formation.</span>'}</div>
        <div class="dim">Clic droit sur le terrain : point de ralliement.</div>`;
    }
    this.el.innerHTML = html;
  }
}
