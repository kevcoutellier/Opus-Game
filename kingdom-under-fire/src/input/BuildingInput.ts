import type * as THREE from 'three';
import type { BuildingSystem } from '../buildings/BuildingSystem';
import type { World } from '../core/World';
import { BUILDING_DEFS } from '../data/buildings';
import { UnitState } from '../entities/Components';
import type { SelectionManager } from '../selection/SelectionManager';
import type { KeyboardInput } from './KeyboardInput';
import { MouseButton, type MouseInput } from './MouseInput';

export interface BuildingInputDeps {
  world: World;
  buildings: BuildingSystem;
  selection: SelectionManager;
  mouse: MouseInput;
  keys: KeyboardInput;
  team: number;
  pickGround(x: number, y: number): THREE.Vector3 | null;
  /** Ghost of the building being placed (null hides it). */
  ghost(g: { type: number; x: number; z: number; rot: number; valid: boolean } | null): void;
  /** Feedback on the ground (rally point set). */
  marker(x: number, z: number): void;
}

/**
 * The player's hands on his base.
 *  - Placing a building (from the build menu): its ghost follows the cursor, green where it can stand,
 *    R turns it, left click lays the foundations (Shift: lay another), right click or Escape cancels.
 *  - Left click on a building selects it (production panel); right click then sets its rally point.
 */
export class BuildingInput {
  placing: { type: number; rot: number } | null = null;
  /** Selected building, -1 when none. */
  selected = -1;
  /** Why the ghost cannot stand where it is (null when it can). */
  reason: string | null = null;
  private swallow = false;
  private ghostAt: { x: number; z: number } | null = null;

  constructor(private readonly d: BuildingInputDeps) {
    d.mouse.listen({
      down: (button) => {
        if (!this.placing) return;
        this.swallow = true;
        if (button === MouseButton.Left) {
          if (this.ghostAt && this.reason === null) {
            d.world.commands.push({ kind: 'build', team: d.team, building: BUILDING_DEFS[this.placing.type].id, ...this.ghostAt, rot: this.placing.rot });
            if (!d.keys.shift) this.cancel();
          }
        } else {
          this.cancel();
        }
      },
      up: (button, x, y, drag) => {
        if (this.placing || this.swallow || drag.moved) return;
        if (button === MouseButton.Left) {
          // A soldier under the cursor wins; else the building whose footprint is clicked.
          this.selected = d.selection.pick(x, y) >= 0 ? -1 : this.buildingAt(x, y);
          if (this.selected >= 0) d.selection.clear();
        } else if (button === MouseButton.Right && this.selected >= 0 && d.world.c.team[this.selected] === d.team && d.selection.size === 0) {
          const p = d.pickGround(x, y);
          if (!p) return;
          d.world.commands.push({ kind: 'rally', team: d.team, building: this.selected, x: p.x, z: p.z });
          d.marker(p.x, p.z);
        }
      },
    });
  }

  /** True while placing a building: selection and orders must ignore the mouse. */
  get busy(): boolean {
    return this.placing !== null || this.swallow;
  }

  place(type: number): void {
    this.placing = { type, rot: this.placing?.rot ?? Math.PI };
    this.selected = -1;
  }

  cancel(): void {
    this.placing = null;
    this.ghostAt = null;
    this.d.ghost(null);
  }

  private buildingAt(x: number, y: number): number {
    const p = this.d.pickGround(x, y);
    if (!p) return -1;
    const { c } = this.d.world;
    for (const b of this.d.world.buildings) {
      if (Math.abs(p.x - c.x[b]) <= c.halfW[b] + 0.5 && Math.abs(p.z - c.z[b]) <= c.halfD[b] + 0.5) return b;
    }
    return -1;
  }

  update(): void {
    const { keys, mouse, world, buildings, team } = this.d;
    if (this.swallow && !mouse.isDown(MouseButton.Left) && !mouse.isDown(MouseButton.Right)) this.swallow = false;
    // Units selected, or the building fell: no building selected any more.
    if (this.selected >= 0 && (this.d.selection.size > 0 || !world.buildings.includes(this.selected) || world.c.state[this.selected] === UnitState.Dying)) {
      this.selected = -1;
    }
    for (const code of keys.justPressed) {
      if (!this.placing) break;
      if (code === 'Escape') this.cancel();
      else if (code === 'KeyR') this.placing.rot += Math.PI / 2;
    }
    if (!this.placing) return;
    const p = this.d.pickGround(mouse.x, mouse.y);
    if (!p) {
      this.ghostAt = null;
      this.d.ghost(null);
      return;
    }
    // Snapped to the navigation grid (2 m), like the footprint it will block.
    const x = Math.round(p.x / 2) * 2;
    const z = Math.round(p.z / 2) * 2;
    const def = BUILDING_DEFS[this.placing.type];
    this.reason = buildings.placementError(team, this.placing.type, x, z, this.placing.rot);
    if (this.reason === null && !world.resources.canAfford(team, def.cost)) this.reason = 'Ressources insuffisantes';
    this.ghostAt = { x, z };
    this.d.ghost({ type: this.placing.type, x, z, rot: this.placing.rot, valid: this.reason === null });
  }
}
