/**
 * Entity ids are plain integers indexing the component arrays. Alive ids are kept in a dense array
 * (swap-remove) so systems iterate without holes. Never-used ids are handed out first, then freed ids
 * first-in first-out: an id is reused as late as possible, so a stale reference (a target that died) is
 * dropped long before its id designates another entity.
 */
export class EntityManager {
  readonly mask: Uint32Array;
  /** Dense list of alive ids: iterate `dense[0..count)`. Order changes when an entity is destroyed. */
  readonly dense: Int32Array;
  private readonly sparse: Int32Array;
  private readonly free: Int32Array;
  private freeHead = 0;
  private freeCount = 0;
  private nextId = 0;
  private pendingDestroy: number[] = [];
  count = 0;

  constructor(readonly capacity: number) {
    this.mask = new Uint32Array(capacity);
    this.dense = new Int32Array(capacity);
    this.sparse = new Int32Array(capacity).fill(-1);
    this.free = new Int32Array(capacity);
  }

  create(mask: number): number {
    let id: number;
    if (this.nextId < this.capacity) {
      id = this.nextId++;
    } else if (this.freeCount > 0) {
      id = this.free[this.freeHead];
      this.freeHead = (this.freeHead + 1) % this.capacity;
      this.freeCount--;
    } else {
      throw new Error(`EntityManager: capacity of ${this.capacity} entities reached`);
    }
    this.mask[id] = mask;
    this.sparse[id] = this.count;
    this.dense[this.count++] = id;
    return id;
  }

  isAlive(id: number): boolean {
    return id >= 0 && id < this.capacity && this.sparse[id] >= 0;
  }

  has(id: number, components: number): boolean {
    return this.isAlive(id) && (this.mask[id] & components) === components;
  }

  /** Destroys at the end of the tick (safe while systems iterate). */
  destroyLater(id: number): void {
    this.pendingDestroy.push(id);
  }

  flush(): void {
    for (const id of this.pendingDestroy) this.destroy(id);
    this.pendingDestroy.length = 0;
  }

  destroy(id: number): void {
    const index = this.sparse[id];
    if (index < 0) return;
    const last = this.dense[--this.count];
    this.dense[index] = last;
    this.sparse[last] = index;
    this.sparse[id] = -1;
    this.mask[id] = 0;
    this.free[(this.freeHead + this.freeCount) % this.capacity] = id;
    this.freeCount++;
  }

  /** Calls `fn` for every alive entity having all the given components. */
  each(components: number, fn: (id: number) => void): void {
    for (let i = 0; i < this.count; i++) {
      const id = this.dense[i];
      if ((this.mask[id] & components) === components) fn(id);
    }
  }
}
