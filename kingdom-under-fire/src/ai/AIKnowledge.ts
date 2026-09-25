import type { World } from '../core/World';
import { UNIT_DEFS } from '../data/units';
import { Comp, UnitState } from '../entities/Components';

/** Cell size (m) of the coarse visibility grid. */
const VISION_CELL = 8;
/** Seconds after which an enemy not seen again is forgotten. */
const MEMORY_SECONDS = 45;

export interface Sighting {
  x: number;
  z: number;
  /** Simulation time of the last sighting. */
  seen: number;
  /** Currently in sight. */
  visible: boolean;
}

/**
 * What an AI team knows: only the enemies inside the sight of its own soldiers (rasterised on a coarse
 * visibility grid), plus the last known position of those it lost sight of, forgotten after a while or
 * when that spot is seen empty. The AI never reads the enemy positions directly.
 */
export class AIKnowledge {
  readonly cols: number;
  readonly rows: number;
  private readonly visible: Uint8Array;
  readonly enemies = new Map<number, Sighting>();

  constructor(
    private readonly world: World,
    readonly team: number,
  ) {
    this.cols = Math.ceil(world.size / VISION_CELL);
    this.rows = Math.ceil(world.size / VISION_CELL);
    this.visible = new Uint8Array(this.cols * this.rows);
  }

  isVisible(x: number, z: number): boolean {
    const cx = Math.floor(x / VISION_CELL);
    const cz = Math.floor(z / VISION_CELL);
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return false;
    return this.visible[cz * this.cols + cx] === 1;
  }

  update(): void {
    const { entities, c, time } = this.world;
    this.visible.fill(0);
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) === 0 || c.team[id] !== this.team || c.state[id] === UnitState.Dying) continue;
      this.reveal(c.x[id], c.z[id], UNIT_DEFS[c.unitType[id]].sight);
    }
    for (const sighting of this.enemies.values()) sighting.visible = false;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) === 0 || c.team[id] === this.team || c.state[id] === UnitState.Dying) continue;
      if (!this.isVisible(c.x[id], c.z[id])) continue;
      this.enemies.set(id, { x: c.x[id], z: c.z[id], seen: time.elapsed, visible: true });
    }
    for (const [id, s] of this.enemies) {
      const stale = time.elapsed - s.seen > MEMORY_SECONDS;
      // We look at the spot where it was and it is not there any more (or it is dead).
      const disproved = !s.visible && this.isVisible(s.x, s.z);
      const dead = !entities.isAlive(id) || c.state[id] === UnitState.Dying;
      if (stale || disproved || (dead && s.visible === false)) this.enemies.delete(id);
    }
  }

  private reveal(x: number, z: number, radius: number): void {
    const r = radius / VISION_CELL;
    const cx = x / VISION_CELL;
    const cz = z / VISION_CELL;
    const z0 = Math.max(0, Math.floor(cz - r));
    const z1 = Math.min(this.rows - 1, Math.floor(cz + r));
    for (let gz = z0; gz <= z1; gz++) {
      const dz = gz + 0.5 - cz;
      const half = Math.sqrt(Math.max(0, r * r - dz * dz));
      const x0 = Math.max(0, Math.floor(cx - half));
      const x1 = Math.min(this.cols - 1, Math.floor(cx + half));
      const row = gz * this.cols;
      for (let gx = x0; gx <= x1; gx++) this.visible[row + gx] = 1;
    }
  }
}
