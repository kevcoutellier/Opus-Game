import type { Terrain } from '../maps/Terrain';

/** Slope (rise over run) above which the ground is a cliff. */
const MAX_WALKABLE_SLOPE = 1.05;

/**
 * Navigation grid derived from the terrain. Per cell: blocked flag, path cost (>= 1) and speed factor
 * (0..1). Forests and slopes slow units down and cost more to path through; cliffs, rocks and the
 * map border are impassable.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
  readonly cost: Float32Array;
  readonly speed: Float32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
  ) {
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.cost = new Float32Array(n).fill(1);
    this.speed = new Float32Array(n).fill(1);
  }

  static fromTerrain(terrain: Terrain, cellSize = 2): NavGrid {
    const grid = new NavGrid(terrain.size, terrain.size, cellSize);
    const { cols, rows } = grid;
    for (let cz = 0; cz < rows; cz++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cz * cols + cx;
        if (cx === 0 || cz === 0 || cx === cols - 1 || cz === rows - 1) {
          grid.blocked[i] = 1;
          continue;
        }
        const x = (cx + 0.5) * cellSize;
        const z = (cz + 0.5) * cellSize;
        const q = cellSize * 0.35;
        const slope = Math.max(
          terrain.slopeAt(x, z),
          terrain.slopeAt(x - q, z - q),
          terrain.slopeAt(x + q, z - q),
          terrain.slopeAt(x - q, z + q),
          terrain.slopeAt(x + q, z + q),
        );
        if (slope > MAX_WALKABLE_SLOPE) {
          grid.blocked[i] = 1;
          continue;
        }
        const forest = Math.min(1, terrain.forestAt(x, z));
        grid.speed[i] = (1 - forest * 0.4) * Math.min(1, Math.max(0.55, 1.1 - slope * 0.55));
        grid.cost[i] = 1 + forest * 1.5 + slope * 2;
      }
    }
    for (let r = 0; r < terrain.rockCount; r++) {
      const x = terrain.rocks[r * 4];
      const z = terrain.rocks[r * 4 + 1];
      const radius = terrain.rocks[r * 4 + 2] * 0.85;
      grid.forEachCellInDisc(x, z, radius, (i) => (grid.blocked[i] = 1));
    }
    return grid;
  }

  get cellCount(): number {
    return this.cols * this.rows;
  }

  cellX(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
  }

  cellZ(z: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(z / this.cellSize)));
  }

  cellAt(x: number, z: number): number {
    return this.cellZ(z) * this.cols + this.cellX(x);
  }

  centerX(cell: number): number {
    return ((cell % this.cols) + 0.5) * this.cellSize;
  }

  centerZ(cell: number): number {
    return (Math.floor(cell / this.cols) + 0.5) * this.cellSize;
  }

  isBlockedAt(x: number, z: number): boolean {
    if (x < 0 || z < 0 || x >= this.width || z >= this.height) return true;
    return this.blocked[this.cellAt(x, z)] === 1;
  }

  speedAt(x: number, z: number): number {
    return this.speed[this.cellAt(x, z)];
  }

  /** True when the straight segment crosses no blocked cell (sampled every half cell). */
  lineOfSight(x0: number, z0: number, x1: number, z1: number): boolean {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(length / (this.cellSize * 0.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (this.isBlockedAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  /** Nearest walkable cell (breadth-first), or -1 when the whole grid is blocked. */
  nearestWalkable(cell: number): number {
    if (!this.blocked[cell]) return cell;
    const seen = new Uint8Array(this.cellCount);
    const queue = [cell];
    seen[cell] = 1;
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head];
      if (!this.blocked[c]) return c;
      const cx = c % this.cols;
      const cz = (c - cx) / this.cols;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= this.cols || nz >= this.rows) continue;
        const n = nz * this.cols + nx;
        if (!seen[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    return -1;
  }

  private forEachCellInDisc(x: number, z: number, radius: number, fn: (cell: number) => void): void {
    const x0 = this.cellX(x - radius);
    const x1 = this.cellX(x + radius);
    const z0 = this.cellZ(z - radius);
    const z1 = this.cellZ(z + radius);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        // Closest point of the cell to the disc centre.
        const px = Math.max(cx * this.cellSize, Math.min(x, (cx + 1) * this.cellSize));
        const pz = Math.max(cz * this.cellSize, Math.min(z, (cz + 1) * this.cellSize));
        if (Math.hypot(px - x, pz - z) < radius) fn(cz * this.cols + cx);
      }
    }
  }
}
