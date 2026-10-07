import { z } from 'zod';
import { AbilitySchema } from './Ability';

/** Button pairs calling an officer (The Crusaders: X + A or B + Y, depending on the officer). */
export const CHORDS = ['XA', 'BY'] as const;
export type Chord = (typeof CHORDS)[number];

/** SP spent by an assist attack. */
export const ASSIST_SP = 200;

/**
 * An officer of the hero's troop: a seasoned soldier fighting in its ranks who, for 200 SP, performs his
 * signature attack (assist) when the hero presses his two buttons together.
 */
export const OfficerSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  description: z.string(),
  /** Unit definition of the officer. */
  unit: z.string(),
  chord: z.enum(CHORDS),
  /** The assist: an ability of the officer, aimed in front of the hero (`point`) or around the officer (`self`). */
  assist: AbilitySchema.omit({ spCost: true, cooldown: true, castTime: true }),
});
export type OfficerDef = z.infer<typeof OfficerSchema>;

export function parseOfficers(raw: readonly unknown[]): OfficerDef[] {
  const defs = raw.map((entry, i) => {
    const result = OfficerSchema.safeParse(entry);
    if (!result.success) throw new Error(`Invalid officer ${(entry as { id?: string })?.id ?? `#${i}`}: ${z.prettifyError(result.error)}`);
    return result.data;
  });
  const ids = new Set<string>();
  for (const def of defs) {
    if (ids.has(def.id)) throw new Error(`Duplicate officer id ${def.id}`);
    ids.add(def.id);
  }
  return defs;
}
