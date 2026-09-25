import { faction } from '../data/factions';
import type { BattleStory } from '../data/story/battles';
import { character, LORE, type Character } from '../data/story/lore';

export interface BriefingOptions {
  story: BattleStory;
  /** URL of a character portrait (downloaded official artwork), or null for the heraldic fallback. */
  portrait(id: string): string | null;
  /** Background artwork, or null. */
  artwork: string | null;
  /** Sources of the installed official assets (credits line), empty when none. */
  credits: string[];
  onStart(): void;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Pre-battle screen: story, objective, the commanders of both sides and the chronicles of Bersia. */
export class BriefingScreen {
  private readonly el: HTMLDivElement;
  private readonly keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') this.start();
  };

  constructor(
    root: HTMLElement,
    private readonly options: BriefingOptions,
  ) {
    const { story } = options;
    this.el = document.createElement('div');
    this.el.className = 'briefing interactive';
    if (options.artwork) this.el.style.setProperty('--artwork', `url("${options.artwork}")`);
    this.el.innerHTML = `
      <div class="briefing-card panel">
        <header>
          <div class="briefing-game title">Kingdom Under Fire</div>
          <div class="briefing-subtitle">La Guerre des Héros · ${escape(story.era)}</div>
          <h1 class="title">${escape(story.title)}</h1>
        </header>
        <div class="briefing-body">
          <section class="briefing-text">
            ${story.briefing.map((p) => `<p>${escape(p)}</p>`).join('')}
            <div class="briefing-objective"><b>Objectif</b> ${escape(story.objective)}</div>
          </section>
          <aside class="briefing-commanders">
            <div class="side-label ally">${escape(faction(story.playerFaction).name)}</div>
            ${story.allies.map((id) => this.card(character(id))).join('')}
            <div class="side-label enemy">Face à vous · ${escape(faction(story.enemyFaction).name)}</div>
            ${story.enemies.map((id) => this.card(character(id))).join('')}
          </aside>
        </div>
        <details class="chronicles">
          <summary>Chroniques de Bersia</summary>
          ${LORE.map((ch) => `<h3>${escape(ch.title)}</h3>${ch.paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')}`).join('')}
        </details>
        <footer><button type="button" class="briefing-start">Commencer la bataille</button><span class="hint">Entrée</span></footer>
        <div class="briefing-credits">${
          options.credits.length
            ? `Illustrations et sons : ${options.credits.map(escape).join(', ')}.`
            : 'Portraits et illustrations officiels : <code>npm run assets</code>.'
        } Kingdom Under Fire © Blueside / Phantagram — projet de fan non commercial.</div>
      </div>`;
    this.el.querySelector<HTMLButtonElement>('.briefing-start')!.onclick = () => this.start();
    root.appendChild(this.el);
    window.addEventListener('keydown', this.keyHandler);
  }

  private card(c: Character): string {
    const url = this.options.portrait(c.id);
    const colour = faction(c.faction).color;
    const initials = c.name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2);
    const picture = url
      ? `<img src="${escape(url)}" alt="${escape(c.name)}" loading="lazy" />`
      : `<div class="crest" style="--crest:${colour}">${escape(initials)}</div>`;
    return `<div class="commander" title="${escape(c.bio)}">${picture}<div><b>${escape(c.name)}</b><span>${escape(c.title)}</span></div></div>`;
  }

  private start(): void {
    if (!this.el.isConnected) return;
    window.removeEventListener('keydown', this.keyHandler);
    this.el.remove();
    this.options.onStart();
  }
}
