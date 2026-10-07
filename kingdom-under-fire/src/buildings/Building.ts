import { z } from 'zod';
import { RESOURCE_TYPES } from '../economy/Resources';
import { CostSchema } from '../units/UnitStats';

/** Kinds of building; each is modelled in the style of its faction. */
export const BUILDING_KINDS = ['hq', 'barracks', 'archery', 'stable', 'farm', 'sawmill', 'temple'] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];
export const BUILDING_STYLES = ['human', 'orc'] as const;
export type BuildingStyle = (typeof BUILDING_STYLES)[number];

export const BuildingDefSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  description: z.string(),
  faction: z.string(),
  kind: z.enum(BUILDING_KINDS),
  style: z.enum(BUILDING_STYLES),
  /** Footprint (m) along x and z before rotation. */
  width: z.number().positive(),
  depth: z.number().positive(),
  health: z.number().positive(),
  defense: z.number().nonnegative(),
  cost: CostSchema,
  /** Seconds of construction. */
  buildTime: z.number().positive(),
  sight: z.number().positive(),
  /** Resources produced per second once built. */
  income: z.partialRecord(z.enum(RESOURCE_TYPES), z.number().positive()).default({}),
  /** Unit ids it trains. */
  trains: z.array(z.string()).default([]),
  /** Buildings the team must own (completed) before placing this one. */
  requires: z.array(z.string()).default([]),
  /** Headquarters: placed by the scenario, not buildable; losing it loses the battle. */
  hq: z.boolean().default(false),
});
export type BuildingDef = z.infer<typeof BuildingDefSchema>;

export function parseBuildingDefs(raw: readonly unknown[]): BuildingDef[] {
  const defs = raw.map((entry, i) => {
    const result = BuildingDefSchema.safeParse(entry);
    if (!result.success) {
      const id = (entry as { id?: string })?.id ?? `#${i}`;
      throw new Error(`Invalid building ${id}: ${z.prettifyError(result.error)}`);
    }
    return result.data;
  });
  const ids = new Set(defs.map((d) => d.id));
  if (ids.size !== defs.length) throw new Error('Duplicate building id');
  for (const def of defs) {
    for (const req of def.requires) if (!ids.has(req)) throw new Error(`Building ${def.id} requires unknown ${req}`);
  }
  return defs;
}
