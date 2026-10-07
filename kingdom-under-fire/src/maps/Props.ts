import { z } from 'zod';
import type { World } from '../core/World';

export const PROP_KINDS = ['house', 'hut', 'wall', 'tower', 'tent', 'palisade'] as const;
export type PropKind = (typeof PROP_KINDS)[number];

/** A building or a fortification of a mission map. */
export const PropSchema = z.object({
  kind: z.enum(PROP_KINDS),
  x: z.number(),
  z: z.number(),
  /** Rotation around the vertical axis (radians). */
  rot: z.number().default(0),
  /** Length (m) of a wall or palisade segment. */
  length: z.number().positive().default(10),
});
export type Prop = z.infer<typeof PropSchema>;

/** Footprint (width along the prop's x, depth along its z), height, and whether it burns. */
export const PROP_SHAPES: Record<PropKind, { width: (p: Prop) => number; depth: number; height: number; flammable: boolean }> = {
  house: { width: () => 6, depth: 5, height: 3, flammable: true },
  hut: { width: () => 4, depth: 4, height: 2.4, flammable: true },
  wall: { width: (p) => p.length, depth: 2.2, height: 5, flammable: false },
  tower: { width: () => 5, depth: 5, height: 9, flammable: false },
  tent: { width: () => 3.2, depth: 3.2, height: 2.6, flammable: true },
  palisade: { width: (p) => p.length, depth: 0.8, height: 3, flammable: true },
};

/** True when (x, z) lies within the prop's footprint (plus `margin`). */
export function insideProp(p: Prop, x: number, z: number, margin = 0): boolean {
  const shape = PROP_SHAPES[p.kind];
  const dx = x - p.x;
  const dz = z - p.z;
  // Into the prop's own axes: its x is (cos rot, −sin rot), its z (sin rot, cos rot).
  const lx = dx * Math.cos(p.rot) - dz * Math.sin(p.rot);
  const lz = dx * Math.sin(p.rot) + dz * Math.cos(p.rot);
  return Math.abs(lx) <= shape.width(p) / 2 + margin && Math.abs(lz) <= shape.depth / 2 + margin;
}

/**
 * Raises the props of a mission on the battlefield: their footprints block the way (flow fields are
 * recomputed), and the wooden ones become fuel for the fire (a burning village).
 */
export function placeProps(world: World, props: readonly Prop[]): void {
  const { nav, fire } = world;
  for (const p of props) {
    world.props.push(p);
    const shape = PROP_SHAPES[p.kind];
    const reach = Math.hypot(shape.width(p), shape.depth) / 2 + 1;
    const blocked: number[] = [];
    for (const cell of nav.cellsInRect(p.x, p.z, reach * 2, reach * 2)) {
      if (insideProp(p, nav.centerX(cell), nav.centerZ(cell), 0.3)) blocked.push(cell);
    }
    nav.occupy(blocked);
    if (!shape.flammable) continue;
    const cells = new Set<number>();
    for (let dz = -reach; dz <= reach; dz += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        if (!insideProp(p, p.x + dx, p.z + dz)) continue;
        const cell = fire.cellAt(p.x + dx, p.z + dz);
        if (cell >= 0) cells.add(cell);
      }
    }
    for (const cell of cells) fire.fuel[cell] = Math.max(fire.fuel[cell], 1);
  }
}
