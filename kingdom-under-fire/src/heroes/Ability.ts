import { z } from 'zod';
import { DAMAGE_TYPES, PROJECTILE_TYPES } from '../units/UnitStats';

/** What an ability does where it lands. An ability chains one or more effects. */
export const EffectSchema = z.discriminatedUnion('kind', [
  /** Blast on the enemies within `radius` of the target point (or of the caster for a self ability). */
  z.object({
    kind: z.literal('damage'),
    amount: z.number().positive(),
    damageType: z.enum(DAMAGE_TYPES),
    radius: z.number().positive(),
    /** Outward push (m/s). */
    knockback: z.number().nonnegative().default(0),
    /** Seconds the victims can neither move nor strike (frozen, stunned). */
    stun: z.number().nonnegative().default(0),
  }),
  /** The caster crosses the ground to the target point in a flash, striking the enemies on its way. */
  z.object({
    kind: z.literal('dash'),
    damage: z.number().nonnegative(),
    damageType: z.enum(DAMAGE_TYPES),
    /** Half-width (m) of the swept path. */
    width: z.number().positive(),
  }),
  /** A missile flying to the target point and bursting over `radius`. */
  z.object({
    kind: z.literal('missile'),
    projectile: z.enum(PROJECTILE_TYPES),
    damage: z.number().positive(),
    damageType: z.enum(DAMAGE_TYPES),
    radius: z.number().positive(),
    /** Horizontal speed (m/s). */
    speed: z.number().positive(),
  }),
  /** Allies within `radius` (the caster included) fight better for `duration` seconds. */
  z.object({
    kind: z.literal('buff'),
    radius: z.number().positive(),
    duration: z.number().positive(),
    /** Damage multiplier. */
    damage: z.number().positive().default(1),
    /** Attack-rate multiplier (1.3 = 30 % more blows). */
    haste: z.number().positive().default(1),
    /** Flat defence bonus. */
    defense: z.number().default(0),
  }),
  /** Morale gained by allies and lost by enemies within `radius`. */
  z.object({
    kind: z.literal('morale'),
    radius: z.number().positive(),
    allies: z.number().nonnegative(),
    enemies: z.number().nonnegative(),
  }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const AbilitySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  description: z.string(),
  /** One or two characters shown on the ability button. */
  icon: z.string().min(1).max(2),
  /** Colour of the visual effect (sRGB hex). */
  color: z.number().int().nonnegative(),
  /** `self`: centred on the caster; `point`: aimed at a spot of the ground within `range`. */
  targeting: z.enum(['self', 'point']),
  range: z.number().nonnegative().default(0),
  manaCost: z.number().nonnegative(),
  cooldown: z.number().positive(),
  /** Seconds the hero spends casting before the effects happen. */
  castTime: z.number().nonnegative(),
  effects: z.array(EffectSchema).min(1),
});
export type AbilityDef = z.infer<typeof AbilitySchema>;

/** Validates raw ability definitions (throws with a readable message on the first invalid entry). */
export function parseAbilities(raw: readonly unknown[]): AbilityDef[] {
  const defs = raw.map((entry, i) => {
    const result = AbilitySchema.safeParse(entry);
    if (!result.success) {
      const id = (entry as { id?: string })?.id ?? `#${i}`;
      throw new Error(`Invalid ability ${id}: ${z.prettifyError(result.error)}`);
    }
    return result.data;
  });
  const ids = new Set<string>();
  for (const def of defs) {
    if (ids.has(def.id)) throw new Error(`Duplicate ability id ${def.id}`);
    ids.add(def.id);
    if (def.targeting === 'point' && def.range <= 0) throw new Error(`Ability ${def.id} aims at a point but has no range`);
  }
  return defs;
}
