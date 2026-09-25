import type { EntityManager } from '../entities/EntityManager';

/**
 * Uniform grid over the map, rebuilt from scratch every tick with a counting sort (O(n), no allocation):
 * `cellStart[c]..cellStart[c + 1]` indexes the entities of cell c in `items`. Neighbour queries only visit
 * the cells overlapping the search disc.
 */
export class SpatialHashGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly cellStart: Int32Array;
  private readonly cellCount: Int32Array;
  private readonly items: Int32Array;
  private readonly cellOf: Int32Array;

  constructor(
    width: number,
    height: number,
    readonly cellSize: number,
    capacity: number,
  ) {
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
    this.cellCount = new Int32Array(this.cols * this.rows);
    this.items = new Int32Array(capacity);
    this.cellOf = new Int32Array(capacity);
  }

  private cellIndex(x: number, z: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const cz = Math.min(this.rows - 1, Math.max(0, Math.floor(z / this.cellSize)));
    return cz * this.cols + cx;
  }

  /** Indexes every alive entity having all the bits of `mask` (and passing `filter`, if given). */
  rebuild(entities: EntityManager, mask: number, xs: Float32Array, zs: Float32Array, filter?: (id: number) => boolean): void {
    const { cellCount, cellStart, items, cellOf } = this;
    cellCount.fill(0);
    let n = 0;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & mask) !== mask || (filter && !filter(id))) {
        cellOf[id] = -1;
        continue;
      }
      const cell = this.cellIndex(xs[id], zs[id]);
      cellOf[id] = cell;
      cellCount[cell]++;
      n++;
    }
    let sum = 0;
    for (let c = 0; c < cellCount.length; c++) {
      cellStart[c] = sum;
      sum += cellCount[c];
    }
    cellStart[cellCount.length] = sum;
    // Second pass: place ids, using cellCount as a write cursor that counts down.
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      const cell = cellOf[id];
      if (cell < 0) continue;
      items[cellStart[cell] + --cellCount[cell]] = id;
    }
    this.size = n;
  }

  size = 0;

  /**
   * Writes into `out` the ids within `radius` of (x, z), up to out.length. Returns how many were written.
   */
  query(x: number, z: number, radius: number, xs: Float32Array, zs: Float32Array, out: Int32Array): number {
    const { cellSize, cols, rows, cellStart, items } = this;
    const x0 = Math.max(0, Math.floor((x - radius) / cellSize));
    const x1 = Math.min(cols - 1, Math.floor((x + radius) / cellSize));
    const z0 = Math.max(0, Math.floor((z - radius) / cellSize));
    const z1 = Math.min(rows - 1, Math.floor((z + radius) / cellSize));
    const r2 = radius * radius;
    let n = 0;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = cz * cols + cx;
        for (let k = cellStart[cell], end = cellStart[cell + 1]; k < end; k++) {
          const id = items[k];
          const dx = xs[id] - x;
          const dz = zs[id] - z;
          if (dx * dx + dz * dz <= r2) {
            if (n >= out.length) return n;
            out[n++] = id;
          }
        }
      }
    }
    return n;
  }

  /**
   * Nearest item within `radius` for which `accept` is true, or -1. Cells are visited in square rings
   * around the query point and the search stops as soon as a ring cannot hold anything closer: cheap even
   * for a bow range of 45 m in a crowd, where `query` would fill any buffer with allies.
   */
  nearest(x: number, z: number, radius: number, xs: Float32Array, zs: Float32Array, accept: (id: number) => boolean): number {
    const { cellSize, cols, rows, cellStart, items } = this;
    const cx0 = Math.floor(x / cellSize);
    const cz0 = Math.floor(z / cellSize);
    const rings = Math.ceil(radius / cellSize);
    let best = -1;
    let bestD2 = radius * radius;
    for (let ring = 0; ring <= rings; ring++) {
      // Every point of this ring is at least (ring - 1) cells away.
      const inner = (ring - 1) * cellSize;
      if (inner > 0 && inner * inner > bestD2) break;
      for (let cz = cz0 - ring; cz <= cz0 + ring; cz++) {
        if (cz < 0 || cz >= rows) continue;
        // Top and bottom rows of the ring are full, the rows between only have their two ends.
        const step = cz === cz0 - ring || cz === cz0 + ring ? 1 : 2 * ring;
        for (let cx = cx0 - ring; cx <= cx0 + ring; cx += step) {
          if (cx < 0 || cx >= cols) continue;
          const cell = cz * cols + cx;
          for (let k = cellStart[cell], end = cellStart[cell + 1]; k < end; k++) {
            const id = items[k];
            const dx = xs[id] - x;
            const dz = zs[id] - z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2 && accept(id)) {
              best = id;
              bestD2 = d2;
            }
          }
        }
      }
    }
    return best;
  }
}
