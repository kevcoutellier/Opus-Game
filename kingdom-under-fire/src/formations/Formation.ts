import type { OrderId } from '../entities/Components';
import type { SlotLayout } from './FormationSolver';
import type { FormationType } from './FormationType';

/** Distance between neighbouring soldiers of a close-order formation (m). */
export const FORMATION_SPACING = 1.65;

/**
 * A body of troops moving and fighting as one: an anchor travelling along a flow field, a front facing,
 * and one slot per member. Members are entity ids; `slotOf[k]` is the slot of `members[k]`.
 */
export class Formation {
  members: number[] = [];
  slotOf: Int32Array = new Int32Array(0);
  layout: SlotLayout | null = null;
  /** Files requested by the player (right-drag), null = automatic. */
  columns: number | null = null;
  spacing = FORMATION_SPACING;
  facing = 0;
  anchorX = 0;
  anchorZ = 0;
  destX = 0;
  destZ = 0;
  moving = false;
  order: OrderId;
  /** Flow-field key (destination cell) followed by the anchor and by lost members. */
  flow = -1;
  /** Members at creation, for casualty-driven morale. */
  initialSize = 0;
  /** Members were lost or left: the ranks close up at the next re-deal (throttled). */
  dirty = true;
  /** A new order or layout: slots are re-dealt at the next update, without waiting. */
  forceSolve = true;
  /** Seconds before casualties may trigger the next re-deal. */
  resolveCooldown = 0;

  constructor(
    readonly id: number,
    readonly team: number,
    public type: FormationType,
    order: OrderId,
  ) {
    this.order = order;
  }

  get size(): number {
    return this.members.length;
  }

  /** Share of the initial strength lost (0..1). */
  get losses(): number {
    return this.initialSize ? 1 - this.members.length / this.initialSize : 0;
  }
}
