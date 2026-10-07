import { parseOfficers, type OfficerDef } from '../../heroes/Officer';

/**
 * Officers of the heroes' troops. The Crusaders gives each commander two lieutenants; the paladin's assist
 * (B + Y) is Curatio, which heals the wounded of the troop. Until the heroes of The Crusaders and their own
 * officers (Rupert and Ellen for Gerald) arrive, Curian leads two officers named after their rank.
 */
const RAW_OFFICERS = [
  {
    id: 'hironeiden_lieutenant',
    name: 'Lieutenant',
    description: 'Chevalier de la garde d’Hironeiden. Son assaut traverse les rangs ennemis devant le héros.',
    unit: 'human_templar',
    chord: 'XA',
    assist: {
      id: 'lieutenant_assault',
      name: 'Assaut du lieutenant',
      description: 'Le lieutenant s’élance à travers les ennemis devant le héros et frappe tous ceux qu’il croise.',
      icon: '⚔',
      color: 0xffc070,
      targeting: 'point',
      range: 16,
      effects: [{ kind: 'dash', damage: 80, damageType: 'SLASH', width: 1.8 }],
    },
  },
  {
    id: 'hironeiden_paladin',
    name: 'Paladin',
    description: 'Paladin d’Hironeiden, seul officier capable de soigner.',
    unit: 'human_templar',
    chord: 'BY',
    assist: {
      id: 'paladin_curatio',
      name: 'Curatio',
      description: 'Le paladin soigne les soldats blessés de la troupe autour de lui.',
      icon: '✚',
      color: 0xfff2a8,
      targeting: 'self',
      effects: [{ kind: 'heal', radius: 24, amount: 0.45 }],
    },
  },
] as const;

export const OFFICERS: readonly OfficerDef[] = parseOfficers(RAW_OFFICERS);
const BY_ID: ReadonlyMap<string, OfficerDef> = new Map(OFFICERS.map((o) => [o.id, o]));

export function officer(id: string): OfficerDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown officer ${id}`);
  return def;
}
