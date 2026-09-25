import type { Rect } from '../selection/SelectionManager';

/** HTML overlay drawn while the player drags a selection rectangle. */
export class SelectionBox {
  private readonly el: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'selection-box';
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  show(rect: Rect): void {
    const x = Math.min(rect.x0, rect.x1);
    const y = Math.min(rect.y0, rect.y1);
    this.el.style.transform = `translate(${x}px, ${y}px)`;
    this.el.style.width = `${Math.abs(rect.x1 - rect.x0)}px`;
    this.el.style.height = `${Math.abs(rect.y1 - rect.y0)}px`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
