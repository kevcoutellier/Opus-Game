/**
 * Keyboard state keyed by `KeyboardEvent.code` (physical position): WASD camera keys are the same keys on
 * QWERTY and AZERTY (ZQSD) keyboards.
 */
export class KeyboardInput {
  private readonly down = new Set<string>();
  private readonly pressed: string[] = [];
  shift = false;
  ctrl = false;
  alt = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.updateModifiers(e);
      if (!this.down.has(e.code)) this.pressed.push(e.code);
      this.down.add(e.code);
      // Keep the browser from scrolling, opening help (F1) or the find bar while playing.
      if (/^(F\d+|Space|Arrow|Page|Home|Tab)/.test(e.code) || (e.ctrlKey && /^Digit/.test(e.code))) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => {
      this.updateModifiers(e);
      this.down.delete(e.code);
    });
    target.addEventListener('blur', () => {
      this.down.clear();
      this.shift = this.ctrl = this.alt = false;
    });
  }

  isDown(...codes: string[]): boolean {
    for (const code of codes) if (this.down.has(code)) return true;
    return false;
  }

  /** Keys pressed since the last `endFrame()`, in order. */
  get justPressed(): readonly string[] {
    return this.pressed;
  }

  endFrame(): void {
    this.pressed.length = 0;
  }

  private updateModifiers(e: KeyboardEvent): void {
    this.shift = e.shiftKey;
    this.ctrl = e.ctrlKey || e.metaKey;
    this.alt = e.altKey;
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
