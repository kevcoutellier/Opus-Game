import type { World } from '../core/World';
import type { Outcome } from '../scenes/BattleOutcome';
import type { SelectionManager } from '../selection/SelectionManager';
import type { UnitManager } from '../units/UnitManager';
import { SelectionBox } from './SelectionBox';
import { SelectionPanel } from './SelectionPanel';

const HELP = [
  ['Clic / glisser', 'sélectionner (Maj : ajouter, Ctrl : retirer, double-clic : même type)'],
  ['Clic droit', 'déplacer · sur un ennemi : attaquer'],
  ['Clic droit glissé', 'tracer le front de la formation (largeur et orientation)'],
  ['Ctrl + clic droit / T', 'marche offensive'],
  ['F', 'changer de formation · H : tenir la position'],
  ['Ctrl + 1–9 / 1–9', 'créer / rappeler un groupe (double appui : caméra)'],
  ['WASD (ZQSD) / bords', 'déplacer la caméra · Q/E (A/E) : rotation · molette : zoom'],
  ['PgUp / PgDn', 'inclinaison · C : caméra libre · Origine : recentrer'],
  ['F1 / F2', 'panneau développeur · test de performance'],
];

/** DOM overlay of the battle: army counts, selection panel, help, selection rectangle. */
export class HUD {
  readonly box: SelectionBox;
  readonly panel: SelectionPanel;
  private readonly counts: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private lastCounts = '';

  constructor(
    root: HTMLElement,
    world: World,
    selection: SelectionManager,
    private readonly units: UnitManager,
    teamFactions: string[],
  ) {
    this.box = new SelectionBox(root);

    const top = document.createElement('div');
    top.className = 'top-bar';
    const title = document.createElement('div');
    title.className = 'title game-title panel';
    title.textContent = 'Bannières de Cendre';
    this.counts = document.createElement('div');
    this.counts.className = 'army-counts panel';
    top.append(title, this.counts);

    const help = document.createElement('details');
    help.className = 'help panel interactive';
    help.innerHTML = `<summary>Commandes</summary><dl>${HELP.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

    this.panel = new SelectionPanel(root, world, selection, teamFactions);
    this.banner = document.createElement('div');
    this.banner.className = 'outcome panel interactive';
    this.banner.hidden = true;
    root.append(top, help, this.banner);
  }

  update(outcome: Outcome = null): void {
    if (outcome && this.banner.hidden) {
      this.banner.hidden = false;
      this.banner.innerHTML = `<div class="title">${outcome === 'victory' ? 'Victoire' : 'Défaite'}</div><p>${
        outcome === 'victory' ? 'L’armée ennemie est brisée.' : 'Votre armée est brisée.'
      }</p><button type="button">Rejouer la bataille</button>`;
      this.banner.querySelector('button')!.onclick = () => location.reload();
    }
    const own = this.units.countActive(0);
    const enemy = this.units.countActive(1);
    const text = `<span class="ally">⚑ ${own}</span><span class="sep">contre</span><span class="enemy">${enemy} ⚑</span>`;
    if (text !== this.lastCounts) {
      this.counts.innerHTML = text;
      this.lastCounts = text;
    }
    this.panel.update();
  }
}
