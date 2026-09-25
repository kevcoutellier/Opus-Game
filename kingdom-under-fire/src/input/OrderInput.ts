import type * as THREE from 'three';
import type { World } from '../core/World';
import type { SelectionManager } from '../selection/SelectionManager';
import type { KeyboardInput } from './KeyboardInput';
import { MouseButton, type MouseInput } from './MouseInput';

export interface OrderInputDeps {
  world: World;
  selection: SelectionManager;
  mouse: MouseInput;
  keys: KeyboardInput;
  team: number;
  /** Ground point under a screen position, or null. */
  pickGround(x: number, y: number): THREE.Vector3 | null;
  /** Enemy unit under a screen position, or -1. */
  pickEnemy(x: number, y: number): number;
  /** Feedback on the ground where an order was given. */
  marker(x: number, z: number, attack: boolean): void;
}

/**
 * Turns right clicks into commands for the selected units: move, attack a unit, attack-move
 * (Ctrl + right click or T then click). Right-drag draws the front of a formation (phase 7).
 */
export class OrderInput {
  /** Armed by T: the next click is an attack-move. */
  attackMoveArmed = false;

  constructor(private readonly d: OrderInputDeps) {
    d.mouse.listen({
      up: (button, x, y) => {
        if (button === MouseButton.Right) this.issue(x, y, this.d.keys.ctrl || this.attackMoveArmed);
        else if (button === MouseButton.Left && this.attackMoveArmed) this.issue(x, y, true);
      },
    });
  }

  update(): void {
    for (const code of this.d.keys.justPressed) {
      if (code === 'KeyT' && this.d.selection.commandable) this.attackMoveArmed = true;
      if (code === 'Escape') this.attackMoveArmed = false;
    }
    document.body.classList.toggle('cursor-attack', this.attackMoveArmed);
  }

  private issue(x: number, y: number, attackMove: boolean): void {
    const { selection, world, team } = this.d;
    this.attackMoveArmed = false;
    if (!selection.commandable) return;
    const units = [...selection.ids];
    const enemy = this.d.pickEnemy(x, y);
    if (enemy >= 0) {
      world.commands.push({ kind: 'attack', team, units, target: enemy });
      this.d.marker(world.c.x[enemy], world.c.z[enemy], true);
      return;
    }
    const ground = this.d.pickGround(x, y);
    if (!ground) return;
    world.commands.push({
      kind: 'formationMove',
      team,
      units,
      x: ground.x,
      z: ground.z,
      facing: null,
      width: null,
      formation: null,
      attackMove,
    });
    this.d.marker(ground.x, ground.z, attackMove);
  }
}
