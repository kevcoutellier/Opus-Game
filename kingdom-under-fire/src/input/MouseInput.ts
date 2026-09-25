export const MouseButton = { Left: 0, Middle: 1, Right: 2 } as const;

export interface PointerDrag {
  button: number;
  startX: number;
  startY: number;
  /** True once the pointer moved more than the click tolerance. */
  moved: boolean;
}

export type MouseListener = {
  down?(button: number, x: number, y: number): void;
  up?(button: number, x: number, y: number, drag: PointerDrag): void;
  doubleClick?(x: number, y: number): void;
};

const CLICK_TOLERANCE = 5;

/**
 * Mouse state over the game canvas: position, buttons, drags, wheel and whether the pointer is inside the
 * window (edge scrolling). Clicks on UI panels (elements with pointer events) never reach the canvas.
 */
export class MouseInput {
  x = 0;
  y = 0;
  /** Movement since the last `endFrame()`. */
  dx = 0;
  dy = 0;
  wheel = 0;
  inside = false;
  readonly drags = new Map<number, PointerDrag>();
  private readonly listeners: MouseListener[] = [];

  constructor(readonly element: HTMLElement) {
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    element.addEventListener('pointerdown', (e) => {
      element.setPointerCapture(e.pointerId);
      this.move(e.clientX, e.clientY);
      this.drags.set(e.button, { button: e.button, startX: e.clientX, startY: e.clientY, moved: false });
      for (const l of this.listeners) l.down?.(e.button, e.clientX, e.clientY);
      if (e.button === MouseButton.Middle) e.preventDefault();
    });
    element.addEventListener('pointerup', (e) => {
      this.move(e.clientX, e.clientY);
      const drag = this.drags.get(e.button);
      if (!drag) return;
      this.drags.delete(e.button);
      for (const l of this.listeners) l.up?.(e.button, e.clientX, e.clientY, drag);
    });
    element.addEventListener('dblclick', (e) => {
      for (const l of this.listeners) l.doubleClick?.(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', (e) => {
      this.inside = true;
      // movementX keeps counting while the pointer is locked (third-person mouse look).
      this.dx += e.movementX;
      this.dy += e.movementY;
      if (!this.locked) this.move(e.clientX, e.clientY);
    });
    document.documentElement.addEventListener('pointerleave', () => (this.inside = false));
    window.addEventListener('blur', () => {
      this.inside = false;
      this.drags.clear();
    });
    element.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 100 || 1);
      },
      { passive: false },
    );
  }

  /** True while the pointer is captured for mouse look (direct control of a hero). */
  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  lock(): void {
    if (!this.locked) void Promise.resolve(this.element.requestPointerLock()).catch(() => {});
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  listen(listener: MouseListener): void {
    this.listeners.push(listener);
  }

  isDown(button: number): boolean {
    return this.drags.has(button);
  }

  endFrame(): void {
    this.dx = this.dy = 0;
    this.wheel = 0;
  }

  private move(x: number, y: number): void {
    this.x = x;
    this.y = y;
    for (const drag of this.drags.values()) {
      if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) > CLICK_TOLERANCE) drag.moved = true;
    }
  }
}
