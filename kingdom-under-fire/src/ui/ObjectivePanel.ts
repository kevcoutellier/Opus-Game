import type { MissionDirector } from '../missions/MissionDirector';

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const MARK = { active: '◆', done: '✓', failed: '✗' } as const;

/** The objectives of the mission, top right: those to fulfil, those done (✓) and those failed (✗). */
export class ObjectivePanel {
  private readonly el: HTMLDivElement;
  private version = -1;

  constructor(
    root: HTMLElement,
    private readonly director: MissionDirector,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'objectives panel';
    this.el.hidden = true;
    root.append(this.el);
  }

  update(): void {
    const d = this.director;
    if (d.version === this.version) return;
    this.version = d.version;
    this.el.hidden = d.objectives.length === 0;
    this.el.innerHTML = `<div class="title">Objectifs</div><ul>${d.objectives
      .map((o) => `<li class="${o.state}"><span class="mark">${MARK[o.state]}</span>${escape(o.text)}</li>`)
      .join('')}</ul>`;
  }
}
