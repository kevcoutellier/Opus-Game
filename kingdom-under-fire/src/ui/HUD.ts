import type { AssetManager } from '../assets/AssetManager';
import type { BattleStory } from '../data/story/battles';
import type { Outcome } from '../scenes/BattleOutcome';
import type { TroopSystem } from '../troops/TroopSystem';
import type { UnitManager } from '../units/UnitManager';

export type BattleMode = 'action' | 'tactic';

const HELP = [
  ['Tab', 'mode action (le héros) ⇄ mode tactique · ou zoomer à fond sur la troupe du héros / dézoomer'],
  ['Q / E (A / E)', 'troupe précédente / suivante : la caméra se place derrière elle'],
  ['Clic sur un soldat', 'choisir sa troupe'],
  ['Clic droit', 'la troupe marche là · sur un ennemi : elle attaque sa troupe'],
  ['Maj + clic droit', 'ajouter un point de passage · Ctrl + clic droit : toute l’armée'],
  ['Minicarte', 'clic : regarder · clic droit : ordre de marche (Maj : point de passage, Ctrl : toute l’armée)'],
  ['F / H', 'formation suivante · tenir la position'],
  ['1–4', 'compétences de la troupe choisie (Flèche de feu, Piège, Incendie, Curatio…) : clic pour viser, clic droit pour annuler · SP gagnés en combattant'],
  ['WASD (ZQSD) / bords', 'déplacer la caméra · clic molette glissé : rotation · molette : zoom · Origine : revenir à la troupe'],
  ['Z X C V (W X C V)', 'capacités du héros (clic : viser, clic droit : annuler)'],
  ['Mode action', 'WASD : marcher · souris : regarder · 1–4 : capacités'],
  ['Clic ×5 (X X X X X)', 'combo faible · clic puis clic droit ×4 (X A A A A) : combo fort · clic droit en marchant vers l’ennemi : estoc'],
  ['R (Y)', 'attaque spéciale · R R : Smash (180 SP)'],
  ['Espace (B)', 'quand l’ennemi frappe : contre-attaque · quand il vient de vous toucher : repousser · sinon : esquive'],
  ['Clic G + D / Espace + R', 'assistance d’un officier (X + A / B + Y, 200 SP) · SP gagnés en combattant'],
  ['Tuer le chef', 'une troupe dont le chef tombe se débande et quitte le champ de bataille'],
  ['Points verts', 'lieux à rejoindre (objectifs en haut à droite, aussi sur la minicarte)'],
  ['Entrée / clic', 'passer une réplique'],
  ['P / M', 'pause · couper le son'],
  ['F1 / F2', 'panneau développeur · test de performance'],
];

export interface OutcomeAction {
  label: string;
  run(): void | Promise<void>;
}
export type OutcomeActions = Record<'victory' | 'defeat', OutcomeAction[]>;

/** Opens another page of the game (a mission, the barracks): each one is a fresh start of the page. */
export function goTo(hash: string): void {
  location.hash = hash;
  location.reload();
}
export const AGAIN: OutcomeAction = { label: 'Rejouer', run: () => location.reload() };

/** DOM overlay of the battle: troops and soldiers left on each side, current mode, help, outcome. */
export class HUD {
  private readonly counts: HTMLDivElement;
  private readonly mode: HTMLDivElement;
  private lastMode = '';
  private readonly banner: HTMLDivElement;
  private lastCounts = '';
  private readonly emblems: string[];

  constructor(
    root: HTMLElement,
    private readonly units: UnitManager,
    private readonly troops: TroopSystem,
    teamFactions: string[],
    private readonly story: BattleStory,
    assets: AssetManager,
    /** Buttons of the end of the battle, after a victory or a defeat. */
    private readonly actions: OutcomeActions = { victory: [AGAIN], defeat: [AGAIN] },
  ) {
    const emblem = (team: number) => {
      const url = assets.emblem(teamFactions[team]);
      return url ? `<img class="emblem" src="${url}" alt="" />` : '⚑';
    };
    this.emblems = [emblem(0), emblem(1)];

    const top = document.createElement('div');
    top.className = 'top-bar';
    const title = document.createElement('div');
    title.className = 'title game-title panel';
    title.innerHTML = `Kingdom Under Fire <span class="battle-name">· ${story.title}</span>`;
    this.counts = document.createElement('div');
    this.counts.className = 'army-counts panel';
    top.append(title, this.counts);

    const help = document.createElement('details');
    help.className = 'help panel interactive';
    help.innerHTML = `<summary>Commandes</summary><dl>${HELP.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

    this.mode = document.createElement('div');
    this.mode.className = 'mode-badge panel';
    this.banner = document.createElement('div');
    this.banner.className = 'outcome panel interactive';
    this.banner.hidden = true;
    root.append(top, help, this.mode, this.banner);
  }

  update(outcome: Outcome, mode: BattleMode, troop: string | null, outcomeText: string | null = null): void {
    if (outcome && this.banner.hidden) {
      this.banner.hidden = false;
      const actions = this.actions[outcome];
      this.banner.innerHTML = `<div class="title">${outcome === 'victory' ? 'Victoire' : 'Défaite'}</div><p>${
        outcomeText ?? (outcome === 'victory' ? this.story.victory : this.story.defeat)
      }</p>${actions.map((a) => `<button type="button">${a.label}</button>`).join('')}`;
      this.banner.querySelectorAll<HTMLButtonElement>('button').forEach((button, i) => {
        button.onclick = () => void actions[i].run();
      });
    }
    const side = (team: number) => {
      const n = this.troops.list(team, true).length;
      return `${n} troupe${n > 1 ? 's' : ''} · ${this.units.countActive(team)}`;
    };
    const text = `<span class="ally">${this.emblems[0]} ${side(0)}</span><span class="sep">contre</span><span class="enemy">${side(1)} ${this.emblems[1]}</span>`;
    if (text !== this.lastCounts) {
      this.counts.innerHTML = text;
      this.lastCounts = text;
    }
    const label = mode === 'action' ? '<b>Mode action</b>' : `<b>Mode tactique</b>${troop ? ` · ${troop}` : ''}`;
    if (label !== this.lastMode) {
      this.mode.innerHTML = label;
      this.lastMode = label;
    }
  }
}
