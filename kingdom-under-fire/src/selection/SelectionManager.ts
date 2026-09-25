/** Screen position of an entity, provided by the renderer side (camera projection). */
export interface ScreenPoint {
  x: number;
  y: number;
  /** In front of the camera and inside the viewport. */
  visible: boolean;
}

export interface SelectionContext {
  /** Every entity that could be picked (alive, not dying), own and enemy. */
  candidates(): Iterable<number>;
  /** True for entities of the local player (only those can be box-selected and commanded). */
  isOwn(id: number): boolean;
  project(id: number): ScreenPoint;
  /** Grouping key for double-click selection (unit type). */
  kind(id: number): number;
  isAlive(id: number): boolean;
}

export type SelectMode = 'replace' | 'add' | 'remove';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Pixels around a unit's projected centre that still pick it. */
const PICK_RADIUS = 22;
const DOUBLE_TAP_MS = 350;

/**
 * Selection logic, independent of the DOM and of Three.js: click and box selection with shift (add) and
 * ctrl (remove), double-click on a unit type, filters, control groups with double-tap to focus.
 */
export class SelectionManager {
  private selected: number[] = [];
  private readonly groups = new Map<number, number[]>();
  private lastRecall = { group: -1, time: -Infinity };
  /** Incremented at every change: the UI refreshes only when it moves. */
  version = 0;

  constructor(private readonly ctx: SelectionContext) {}

  get ids(): readonly number[] {
    return this.selected;
  }

  get size(): number {
    return this.selected.length;
  }

  has(id: number): boolean {
    return this.selected.includes(id);
  }

  /** True when the current selection can receive orders (it contains units of the local player). */
  get commandable(): boolean {
    return this.selected.length > 0 && this.ctx.isOwn(this.selected[0]);
  }

  set(ids: Iterable<number>, mode: SelectMode = 'replace'): void {
    const incoming = [...ids];
    let next: number[];
    if (mode === 'replace') {
      next = incoming;
    } else if (mode === 'add') {
      // Own units and a selected enemy never mix: adding own units drops an inspected enemy.
      next = this.commandable || this.selected.length === 0 ? [...this.selected] : [];
      for (const id of incoming) if (!next.includes(id)) next.push(id);
    } else {
      const remove = new Set(incoming);
      next = this.selected.filter((id) => !remove.has(id));
    }
    this.replace(next);
  }

  clear(): void {
    this.replace([]);
  }

  /** Nearest entity under the cursor, own units first, or -1. */
  pick(x: number, y: number): number {
    let best = -1;
    let bestScore = Infinity;
    for (const id of this.ctx.candidates()) {
      const p = this.ctx.project(id);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > PICK_RADIUS) continue;
      const score = d + (this.ctx.isOwn(id) ? 0 : PICK_RADIUS);
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  }

  /** Own units whose projected centre lies in the screen rectangle. */
  inRect(rect: Rect): number[] {
    const x0 = Math.min(rect.x0, rect.x1);
    const x1 = Math.max(rect.x0, rect.x1);
    const y0 = Math.min(rect.y0, rect.y1);
    const y1 = Math.max(rect.y0, rect.y1);
    const out: number[] = [];
    for (const id of this.ctx.candidates()) {
      if (!this.ctx.isOwn(id)) continue;
      const p = this.ctx.project(id);
      if (p.visible && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) out.push(id);
    }
    return out;
  }

  /** Left click: select what is under the cursor (an enemy alone, for inspection). */
  click(x: number, y: number, mode: SelectMode): void {
    const id = this.pick(x, y);
    if (id < 0) {
      if (mode === 'replace') this.clear();
      return;
    }
    if (!this.ctx.isOwn(id)) {
      if (mode === 'replace') this.replace([id]);
      return;
    }
    if (mode === 'add' && this.has(id)) this.set([id], 'remove');
    else this.set([id], mode);
  }

  box(rect: Rect, mode: SelectMode): void {
    this.set(this.inRect(rect), mode);
  }

  /** Double-click: every own unit of the same type visible on screen. */
  selectSameKind(x: number, y: number, mode: SelectMode): void {
    const id = this.pick(x, y);
    if (id < 0 || !this.ctx.isOwn(id)) return;
    const kind = this.ctx.kind(id);
    const same: number[] = [];
    for (const other of this.ctx.candidates()) {
      if (this.ctx.isOwn(other) && this.ctx.kind(other) === kind && this.ctx.project(other).visible) same.push(other);
    }
    this.set(same, mode === 'remove' ? 'remove' : mode);
  }

  /** Keeps only the selected units matching the predicate (selection filters). */
  filter(predicate: (id: number) => boolean): void {
    this.replace(this.selected.filter(predicate));
  }

  assignGroup(group: number): void {
    if (!this.commandable) return;
    this.groups.set(group, [...this.selected]);
  }

  /**
   * Selects a control group. Returns true on a double tap (same group within 350 ms): the caller then
   * focuses the camera on it.
   */
  recallGroup(group: number, now: number, mode: SelectMode = 'replace'): boolean {
    const members = (this.groups.get(group) ?? []).filter((id) => this.ctx.isAlive(id));
    this.groups.set(group, members);
    if (!members.length) return false;
    this.set(members, mode);
    const doubleTap = this.lastRecall.group === group && now - this.lastRecall.time < DOUBLE_TAP_MS;
    this.lastRecall = { group, time: doubleTap ? -Infinity : now };
    return doubleTap;
  }

  groupSize(group: number): number {
    return this.groups.get(group)?.length ?? 0;
  }

  /** Drops dead units (call once per frame). */
  prune(): void {
    if (this.selected.some((id) => !this.ctx.isAlive(id))) {
      this.replace(this.selected.filter((id) => this.ctx.isAlive(id)));
    }
  }

  private replace(next: number[]): void {
    const same = next.length === this.selected.length && next.every((id, i) => id === this.selected[i]);
    if (same) return;
    this.selected = next;
    this.version++;
  }
}
