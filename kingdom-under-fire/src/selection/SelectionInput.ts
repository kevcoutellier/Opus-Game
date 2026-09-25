import type { KeyboardInput } from '../input/KeyboardInput';
import { MouseButton, type MouseInput } from '../input/MouseInput';
import type { SelectionBox } from '../ui/SelectionBox';
import type { SelectMode, SelectionManager } from './SelectionManager';

/**
 * Binds mouse and keyboard to the selection: left click / drag, double click, shift / ctrl modifiers,
 * Ctrl+1-9 to store a group, 1-9 to recall it (double tap focuses the camera), Escape to clear.
 */
export class SelectionInput {
  /** When it returns true (an order cursor is armed), left clicks do not select. */
  blocked: () => boolean = () => false;

  constructor(
    private readonly selection: SelectionManager,
    private readonly mouse: MouseInput,
    private readonly keys: KeyboardInput,
    private readonly box: SelectionBox,
    private readonly focus: (ids: readonly number[]) => void,
  ) {
    mouse.listen({
      up: (button, x, y, drag) => {
        if (button !== MouseButton.Left) return;
        this.box.hide();
        if (this.blocked()) return;
        if (drag.moved) this.selection.box({ x0: drag.startX, y0: drag.startY, x1: x, y1: y }, this.mode());
        else this.selection.click(x, y, this.mode());
      },
      doubleClick: (x, y) => {
        if (!this.blocked()) this.selection.selectSameKind(x, y, this.mode());
      },
    });
  }

  private mode(): SelectMode {
    if (this.keys.ctrl) return 'remove';
    if (this.keys.shift) return 'add';
    return 'replace';
  }

  /** Per frame: selection rectangle and group hotkeys. */
  update(now: number): void {
    const drag = this.mouse.drags.get(MouseButton.Left);
    if (drag?.moved && !this.blocked()) {
      this.box.show({ x0: drag.startX, y0: drag.startY, x1: this.mouse.x, y1: this.mouse.y });
    }
    for (const code of this.keys.justPressed) {
      const digit = /^Digit([1-9])$/.exec(code);
      if (digit) {
        const group = Number(digit[1]);
        if (this.keys.ctrl) this.selection.assignGroup(group);
        else if (this.selection.recallGroup(group, now, this.keys.shift ? 'add' : 'replace')) this.focus(this.selection.ids);
      } else if (code === 'Escape' && !this.blocked()) {
        this.selection.clear();
      }
    }
  }
}
