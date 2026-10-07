import { character } from '../data/story/lore';

const escape = (text: string) => text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Seconds a line stays on screen: long enough to read it. */
const lineSeconds = (text: string) => Math.max(3.2, text.length * 0.065);

interface Line {
  speaker: string | null;
  text: string;
}

/**
 * Lines of dialogue of a mission, bottom centre above the troops: portrait and name of the speaker (or
 * the narrator), one line at a time. Each line stays a few seconds; a click or Enter skips it.
 */
export class DialogueBox {
  private readonly el: HTMLDivElement;
  private readonly queue: Line[] = [];
  private current: Line | null = null;
  private left = 0;
  private readonly keyHandler = (e: KeyboardEvent) => {
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.current) this.next();
  };

  constructor(
    root: HTMLElement,
    private readonly portrait: (character: string) => string | null,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'dialogue panel interactive';
    this.el.hidden = true;
    this.el.onclick = () => this.next();
    root.append(this.el);
    window.addEventListener('keydown', this.keyHandler);
  }

  /** True while lines are shown or waiting. */
  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  say(speaker: string | null, text: string): void {
    this.queue.push({ speaker, text });
    if (!this.current) this.next();
  }

  /** Per frame (real time: the lines run on during a cutscene, while the battle waits). */
  update(dt: number): void {
    if (!this.current) return;
    this.left -= dt;
    if (this.left <= 0) this.next();
  }

  private next(): void {
    this.current = this.queue.shift() ?? null;
    this.el.hidden = !this.current;
    if (!this.current) return;
    const { speaker, text } = this.current;
    this.left = lineSeconds(text);
    const who = speaker ? character(speaker) : null;
    const url = speaker ? this.portrait(speaker) : null;
    const picture = !who ? '' : url ? `<img src="${escape(url)}" alt="" />` : `<div class="crest">${escape(who.name.slice(0, 2))}</div>`;
    this.el.classList.toggle('narrator', !who);
    this.el.innerHTML = `${picture ? `<div class="dialogue-portrait">${picture}</div>` : ''}<div class="dialogue-text">${
      who ? `<b>${escape(who.name)}</b>` : ''
    }<p>${escape(text)}</p></div>`;
  }
}
