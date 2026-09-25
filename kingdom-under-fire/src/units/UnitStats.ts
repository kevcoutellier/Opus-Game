import { z } from 'zod';

export const DAMAGE_TYPES = ['PHYSICAL', 'MAGICAL', 'PIERCING', 'SLASH', 'BLUNT', 'FIRE', 'ICE', 'LIGHTNING'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const ARMOR_TYPES = ['LIGHT', 'MEDIUM', 'HEAVY', 'MOUNTED', 'STRUCTURE'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

export const UNIT_ROLES = ['infantry', 'spear', 'archer', 'cavalry', 'siege', 'hero', 'worker'] as const;
export type UnitRole = (typeof UNIT_ROLES)[number];

/** Procedural 3D models available to the renderer. */
export const UNIT_MODELS = [
  'human_footman',
  'human_spearman',
  'human_archer',
  'human_knight',
  'human_templar',
  'hero_curian',
  'orc_warrior',
  'orc_spearman',
  'dark_elf_archer',
  'dark_elf_rider',
  'ogre',
  'hero_likuku',
] as const;
export type UnitModel = (typeof UNIT_MODELS)[number];

export const PROJECTILE_TYPES = ['arrow', 'bolt', 'fireball', 'rock', 'magic'] as const;
export type ProjectileType = (typeof PROJECTILE_TYPES)[number];

/** Missile attack of archers (their `attack` stays their melee blow). */
export const RangedSchema = z.object({
  /** Maximum shooting distance (m). */
  range: z.number().positive(),
  damage: z.number().positive(),
  damageType: z.enum(DAMAGE_TYPES),
  projectile: z.enum(PROJECTILE_TYPES),
  /** Horizontal speed of the missile (m/s). */
  speed: z.number().positive(),
  /** Aim (0..1): a shot lands within (1 − accuracy) × (0.5 m + 6 % of the distance) of its aim point, roughly. */
  accuracy: z.number().min(0).max(1),
  /** Seconds between two shots. */
  period: z.number().positive(),
  /** Seconds to draw and aim before the release. */
  windup: z.number().nonnegative(),
});
export type RangedDef = z.infer<typeof RangedSchema>;

/** Cavalry charge. */
export const ChargeSchema = z.object({
  /** Speed multiplier at full gallop. */
  speed: z.number().min(1),
  /** Damage dealt by the impact at full speed, on top of the normal attack. */
  damage: z.number().positive(),
  /** Seconds before the horses can charge again. */
  cooldown: z.number().positive(),
});
export type ChargeDef = z.infer<typeof ChargeSchema>;

/** What makes a hero more than a strong soldier. */
export const HeroSchema = z.object({
  /** Character of the lore (portrait, biography). */
  character: z.string(),
  mana: z.number().positive(),
  /** Mana per second. */
  manaRegen: z.number().nonnegative(),
  /** Ability ids, in the order of the keys 1–4. */
  abilities: z.array(z.string()).min(1).max(4),
  /** Allies within `radius` (m) gain `morale` points per second and hold better. */
  aura: z.object({ radius: z.number().positive(), morale: z.number().nonnegative() }),
});
export type HeroDef = z.infer<typeof HeroSchema>;

export const CostSchema = z
  .object({
    gold: z.number().int().nonnegative(),
    wood: z.number().int().nonnegative(),
    food: z.number().int().nonnegative(),
    stone: z.number().int().nonnegative(),
    mana: z.number().int().nonnegative(),
  })
  .partial();
export type Cost = z.infer<typeof CostSchema>;

export const UnitDefSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  description: z.string(),
  role: z.enum(UNIT_ROLES),
  model: z.enum(UNIT_MODELS),
  /** Render scale of the model (orcs and ogres are bigger than men). */
  scale: z.number().positive().default(1),
  health: z.number().positive(),
  attack: z.number().nonnegative(),
  defense: z.number().nonnegative(),
  /** Metres per second on open ground. */
  speed: z.number().positive(),
  /** Collision radius (m). */
  radius: z.number().positive(),
  mass: z.number().positive(),
  /** Weapon reach beyond both collision radii (m). */
  reach: z.number().positive(),
  /** Seconds between two swings. */
  attackPeriod: z.number().positive(),
  /** Seconds from the start of a swing to the impact. */
  attackWindup: z.number().nonnegative(),
  damageType: z.enum(DAMAGE_TYPES),
  armorType: z.enum(ARMOR_TYPES),
  criticalChance: z.number().min(0).max(1),
  /** Radius (m) in which an idle unit engages enemies on its own. */
  aggroRange: z.number().positive(),
  /** Vision radius (m). */
  sight: z.number().positive(),
  /** Starting morale (0-100). */
  morale: z.number().min(1).max(100),
  /** 0..1: resistance to morale losses. */
  discipline: z.number().min(0).max(1),
  /** Extra enemies hit by each blow (sweeping clubs of the ogres). */
  cleave: z.number().int().nonnegative().default(0),
  /** Fraction of the damage of missiles coming from the front that the shield stops (0..0.9). */
  shield: z.number().min(0).max(0.9).default(0),
  /**
   * Spears set against a charge: a charger hitting this unit from the front while it stands takes
   * `brace` × its attack in return and is stopped dead; 0 = cannot brace.
   */
  brace: z.number().nonnegative().default(0),
  ranged: RangedSchema.optional(),
  charge: ChargeSchema.optional(),
  hero: HeroSchema.optional(),
  cost: CostSchema,
  trainTime: z.number().positive(),
});
export type UnitDef = z.infer<typeof UnitDefSchema>;

/** Validates raw unit definitions (throws with a readable message on the first invalid entry). */
export function parseUnitDefs(raw: readonly unknown[]): UnitDef[] {
  const defs = raw.map((entry, i) => {
    const result = UnitDefSchema.safeParse(entry);
    if (!result.success) {
      const id = (entry as { id?: string })?.id ?? `#${i}`;
      throw new Error(`Invalid unit definition ${id}: ${z.prettifyError(result.error)}`);
    }
    return result.data;
  });
  const ids = new Set<string>();
  for (const def of defs) {
    if (ids.has(def.id)) throw new Error(`Duplicate unit id ${def.id}`);
    ids.add(def.id);
  }
  return defs;
}
