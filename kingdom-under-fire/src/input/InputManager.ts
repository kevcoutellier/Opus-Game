import { KeyboardInput } from './KeyboardInput';
import { MouseInput } from './MouseInput';

/** Aggregates the raw devices. Game-specific bindings (selection, orders) are wired by their owners. */
export class InputManager {
  readonly keys: KeyboardInput;
  readonly mouse: MouseInput;

  constructor(canvas: HTMLElement) {
    this.keys = new KeyboardInput();
    this.mouse = new MouseInput(canvas);
  }

  endFrame(): void {
    this.keys.endFrame();
    this.mouse.endFrame();
  }
}
