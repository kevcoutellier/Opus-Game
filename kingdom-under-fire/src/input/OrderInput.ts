import type * as THREE from 'three';
import type { World } from '../core/World';
import { FORMATION_SPACING } from '../formations/Formation';
import { columnsForWidth, computeSlots } from '../formations/FormationSolver';
import { FORMATION_TYPES, type FormationType } from '../formations/FormationType';
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
  /** Current formation type of the selection (null when mixed). */
  formationOf(units: readonly number[]): FormationType | null;
  /** Feedback on the ground where an order was given. */
  marker(x: number, z: number, attack: boolean): void;
  /** Ghost slots of the formation being drawn ([x0, z0, x1, z1, ...]) or null. */
  preview(points: ArrayLike<number> | null): void;
}

/** Shortest right-drag (m) that draws a front instead of a plain click. */
const MIN_FRONT = 2;

/**
 * Turns the player's input into commands for the selected units:
 *  - right click: move (formation keeps its type), on an enemy: attack;
 *  - right drag: draw the front line — its width sets the files, its direction the facing;
 *  - Ctrl + right click, or T then click: attack-move;
 *  - F: next formation type, H: hold position.
 */
export class OrderInput {
  /** Armed by T: the next click is an attack-move. */
  attackMoveArmed = false;
  /** When it returns true (the hero controls own the mouse), no order is given. */
  blocked: () => boolean = () => false;
  private frontStart: THREE.Vector3 | null = null;
  private front: { x: number; z: number; facing: number; width: number } | null = null;

  constructor(private readonly d: OrderInputDeps) {
    d.mouse.listen({
      down: (button, x, y) => {
        if (button === MouseButton.Right && d.selection.commandable && !this.blocked()) this.frontStart = d.pickGround(x, y);
      },
      up: (button, x, y) => {
        if (this.blocked()) {
          this.frontStart = null;
          this.front = null;
          d.preview(null);
          return;
        }
        if (button === MouseButton.Right) {
          const front = this.front;
          this.frontStart = null;
          this.front = null;
          d.preview(null);
          if (front) this.issueFront(front, d.keys.ctrl || this.attackMoveArmed);
          else this.issue(x, y, d.keys.ctrl || this.attackMoveArmed);
        } else if (button === MouseButton.Left && this.attackMoveArmed) {
          this.issue(x, y, true);
        }
      },
    });
  }

  /** Per frame: hotkeys and the live preview of a front being drawn. */
  update(): void {
    const { keys, selection, mouse } = this.d;
    for (const code of keys.justPressed) {
      if (!selection.commandable || this.blocked()) continue;
      if (code === 'KeyT') this.attackMoveArmed = true;
      else if (code === 'Escape') this.attackMoveArmed = false;
      else if (code === 'KeyF') this.cycleFormation(keys.shift ? -1 : 1);
      else if (code === 'KeyH') this.hold();
    }
    if (!selection.commandable) this.attackMoveArmed = false;
    document.body.classList.toggle('cursor-attack', this.attackMoveArmed);

    const drag = mouse.drags.get(MouseButton.Right);
    if (this.frontStart && drag?.moved) {
      const end = this.d.pickGround(mouse.x, mouse.y);
      if (end) {
        const dx = end.x - this.frontStart.x;
        const dz = end.z - this.frontStart.z;
        const width = Math.hypot(dx, dz);
        if (width >= MIN_FRONT) {
          // Dragging left to right on screen faces away from the camera.
          const facing = Math.atan2(dx, dz) + Math.PI / 2;
          this.front = { x: (this.frontStart.x + end.x) / 2, z: (this.frontStart.z + end.z) / 2, facing, width };
          this.d.preview(this.slotsPreview(this.front));
          return;
        }
      }
    }
    if (this.front) {
      this.front = null;
      this.d.preview(null);
    }
  }

  setFormation(type: FormationType): void {
    const { selection, world, team } = this.d;
    if (selection.commandable) world.commands.push({ kind: 'setFormation', team, units: [...selection.ids], formation: type });
  }

  hold(): void {
    const { selection, world, team } = this.d;
    if (selection.commandable) world.commands.push({ kind: 'hold', team, units: [...selection.ids] });
  }

  private cycleFormation(step: number): void {
    const current = this.d.formationOf(this.d.selection.ids) ?? 'LINE';
    const i = FORMATION_TYPES.indexOf(current);
    this.setFormation(FORMATION_TYPES[(i + step + FORMATION_TYPES.length) % FORMATION_TYPES.length]);
  }

  private slotsPreview(front: { x: number; z: number; facing: number; width: number }): Float32Array {
    const n = this.d.selection.size;
    const type = this.d.formationOf(this.d.selection.ids) ?? 'LINE';
    const layout = computeSlots(type, n, FORMATION_SPACING, columnsForWidth(front.width, FORMATION_SPACING, n));
    const out = new Float32Array(n * 2);
    const sin = Math.sin(front.facing);
    const cos = Math.cos(front.facing);
    for (let s = 0; s < n; s++) {
      out[s * 2] = front.x + layout.lateral[s] * cos + layout.forward[s] * sin;
      out[s * 2 + 1] = front.z - layout.lateral[s] * sin + layout.forward[s] * cos;
    }
    return out;
  }

  private issueFront(front: { x: number; z: number; facing: number; width: number }, attackMove: boolean): void {
    const { selection, world, team } = this.d;
    this.attackMoveArmed = false;
    if (!selection.commandable) return;
    world.commands.push({
      kind: 'formationMove',
      team,
      units: [...selection.ids],
      x: front.x,
      z: front.z,
      facing: front.facing,
      width: front.width,
      formation: null,
      attackMove,
    });
    this.d.marker(front.x, front.z, attackMove);
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
    world.commands.push({ kind: 'formationMove', team, units, x: ground.x, z: ground.z, facing: null, width: null, formation: null, attackMove });
    this.d.marker(ground.x, ground.z, attackMove);
  }
}
