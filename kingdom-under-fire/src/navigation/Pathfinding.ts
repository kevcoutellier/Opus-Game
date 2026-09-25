import type { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { FlowField } from './FlowField';
import type { NavGrid } from './NavGrid';

const CACHE_SIZE = 32;

/**
 * Flow-field service: one field per destination cell, shared by every unit and formation heading there,
 * kept in a small LRU cache. A formation order costs one Dijkstra, never one A* per soldier.
 */
export class Pathfinding {
  private readonly cache = new Map<number, FlowField>();
  /** Number of fields computed since the start (debug). */
  computed = 0;

  constructor(
    readonly grid: NavGrid,
    private readonly perf?: PerformanceMonitor,
  ) {}

  /** Field leading to (x, z). Its key is the requested cell. */
  field(x: number, z: number): FlowField {
    return this.fieldForCell(this.grid.cellAt(x, z));
  }

  fieldForCell(cell: number): FlowField {
    let field = this.cache.get(cell);
    if (field) {
      // Refresh its LRU position.
      this.cache.delete(cell);
      this.cache.set(cell, field);
      return field;
    }
    const start = performance.now();
    field = new FlowField(this.grid, cell);
    this.computed++;
    this.perf?.add('pathfinding', performance.now() - start);
    this.cache.set(cell, field);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
    return field;
  }
}
