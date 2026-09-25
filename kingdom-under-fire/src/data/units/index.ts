import { parseUnitDefs, type UnitDef } from '../../units/UnitStats';

// Unit definitions are data, validated with Zod at load time (see units/UnitStats.ts). Prototype roster:
// two infantry types shared by both factions; each faction will get its own units in the next milestones.
const RAW_UNITS = [
  {
    id: 'swordsman',
    name: 'Épéiste',
    description: 'Fantassin polyvalent, épée et bouclier. Solide en mêlée, efficace contre l’infanterie légère.',
    role: 'infantry',
    model: 'swordsman',
    health: 120,
    attack: 20,
    defense: 15,
    speed: 2.8,
    radius: 0.42,
    mass: 80,
    reach: 0.75,
    attackPeriod: 1.4,
    attackWindup: 0.45,
    damageType: 'SLASH',
    armorType: 'MEDIUM',
    criticalChance: 0.06,
    aggroRange: 7,
    sight: 32,
    morale: 70,
    discipline: 0.5,
    cost: { gold: 50, food: 20 },
    trainTime: 12,
  },
  {
    id: 'spearman',
    name: 'Lancier',
    description: 'Longue lance et petit bouclier. Frappe à distance de mêlée, tient la ligne face aux charges.',
    role: 'spear',
    model: 'spearman',
    health: 110,
    attack: 16,
    defense: 12,
    speed: 2.7,
    radius: 0.42,
    mass: 75,
    reach: 1.6,
    attackPeriod: 1.6,
    attackWindup: 0.5,
    damageType: 'PIERCING',
    armorType: 'MEDIUM',
    criticalChance: 0.05,
    aggroRange: 7,
    sight: 32,
    morale: 65,
    discipline: 0.6,
    cost: { gold: 45, wood: 10, food: 20 },
    trainTime: 12,
  },
] as const;

export const UNIT_DEFS: readonly UnitDef[] = parseUnitDefs(RAW_UNITS);
export const UNIT_INDEX: ReadonlyMap<string, number> = new Map(UNIT_DEFS.map((def, i) => [def.id, i]));

export function unitIndex(id: string): number {
  const index = UNIT_INDEX.get(id);
  if (index === undefined) throw new Error(`Unknown unit ${id}`);
  return index;
}
