import type { NavGrid } from './NavGrid';

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const STEP = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

/** Binary min-heap of cell indices keyed by a float array (reused between computations). */
class CellHeap {
  private data: Int32Array;
  size = 0;

  constructor(capacity: number, private readonly keys: Float32Array) {
    this.data = new Int32Array(capacity);
  }

  push(cell: number): void {
    if (this.size === this.data.length) {
      const bigger = new Int32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    let i = this.size++;
    const key = this.keys[cell];
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[this.data[parent]] <= key) break;
      this.data[i] = this.data[parent];
      i = parent;
    }
    this.data[i] = cell;
  }

  pop(): number {
    const top = this.data[0];
    const last = this.data[--this.size];
    let i = 0;
    const key = this.keys[last];
    for (;;) {
      const l = i * 2 + 1;
      if (l >= this.size) break;
      const r = l + 1;
      const child = r < this.size && this.keys[this.data[r]] < this.keys[this.data[l]] ? r : l;
      if (this.keys[this.data[child]] >= key) break;
      this.data[i] = this.data[child];
      i = child;
    }
    this.data[i] = last;
    return top;
  }
}

/**
 * Integration field of the travel cost to one goal cell (Dijkstra over 8 neighbours, no corner cutting).
 * Any number of units share it: each reads the steepest-descent direction at its own position.
 */
export class FlowField {
  readonly dist: Float32Array;
  /** Walkable cell actually used as goal (the requested one may be blocked). */
  readonly goal: number;
  readonly goalX: number;
  readonly goalZ: number;

  constructor(
    readonly grid: NavGrid,
    requestedGoal: number,
  ) {
    this.dist = new Float32Array(grid.cellCount).fill(Infinity);
    this.goal = grid.nearestWalkable(requestedGoal);
    this.goalX = grid.centerX(this.goal);
    this.goalZ = grid.centerZ(this.goal);
    if (this.goal >= 0) this.integrate();
  }

  private integrate(): void {
    const { grid, dist } = this;
    const { cols, rows, blocked, cost } = grid;
    const heap = new CellHeap(1024, dist);
    dist[this.goal] = 0;
    heap.push(this.goal);
    while (heap.size) {
      const cell = heap.pop();
      const d = dist[cell];
      const cx = cell % cols;
      const cz = (cell - cx) / cols;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
        const n = nz * cols + nx;
        if (blocked[n]) continue;
        // Diagonal moves may not cut the corner of a blocked cell.
        if (k >= 4 && (blocked[cz * cols + nx] || blocked[nz * cols + cx])) continue;
        const nd = d + STEP[k] * (cost[n] + cost[cell]) * 0.5;
        if (nd < dist[n]) {
          dist[n] = nd;
          heap.push(n);
        }
      }
    }
  }

  /** Remaining travel cost from a position (Infinity when unreachable). */
  distanceAt(x: number, z: number): number {
    return this.dist[this.grid.cellAt(x, z)];
  }

  /**
   * Unit direction (written into `out`) towards the neighbour cell with the lowest cost. Returns false at
   * the goal cell or when the position cannot reach the goal.
   */
  direction(x: number, z: number, out: { x: number; z: number }): boolean {
    const { grid, dist } = this;
    const { cols, rows, blocked } = grid;
    const cell = grid.cellAt(x, z);
    if (cell === this.goal) return false;
    const cx = cell % cols;
    const cz = (cell - cx) / cols;
    let best = -1;
    let bestDist = dist[cell];
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const nz = cz + DZ[k];
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const n = nz * cols + nx;
      if (k >= 4 && (blocked[cz * cols + nx] || blocked[nz * cols + cx])) continue;
      if (dist[n] < bestDist) {
        bestDist = dist[n];
        best = n;
      }
    }
    if (best < 0) return false;
    const dx = grid.centerX(best) - x;
    const dz = grid.centerZ(best) - z;
    const len = Math.hypot(dx, dz) || 1;
    out.x = dx / len;
    out.z = dz / len;
    return true;
  }
}
