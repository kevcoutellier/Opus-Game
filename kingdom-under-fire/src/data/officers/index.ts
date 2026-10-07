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
  // ---- The Crusaders. Who the officers are is known; what their assists do is not (ours).
  {
    id: 'rupert',
    name: 'Rupert',
    description: 'Frère d’armes de Gerald, colosse au marteau de cinquante livres.',
    unit: 'officer_rupert',
    chord: 'XA',
    assist: {
      id: 'rupert_hammer',
      name: 'Marteau de Rupert',
      description: 'Rupert bondit devant Gerald et abat son marteau : les ennemis alentour sont projetés et étourdis.',
      icon: '⚒',
      color: 0xffb070,
      targeting: 'point',
      range: 9,
      effects: [
        { kind: 'dash', damage: 30, damageType: 'BLUNT', width: 1.2 },
        { kind: 'damage', amount: 70, damageType: 'BLUNT', radius: 3.5, knockback: 6, stun: 1 },
      ],
    },
  },
  {
    id: 'ellen',
    name: 'Ellen',
    description: 'Officier de Gerald, archère.',
    unit: 'officer_ellen',
    chord: 'BY',
    assist: {
      id: 'ellen_volley',
      name: 'Volée d’Ellen',
      description: 'Ellen fait pleuvoir une volée de flèches sur les ennemis devant Gerald.',
      icon: '➹',
      color: 0xd8f0a0,
      targeting: 'point',
      range: 22,
      effects: [{ kind: 'damage', amount: 45, damageType: 'PIERCING', radius: 5 }],
    },
  },
  {
    id: 'morene',
    name: 'Morene',
    description: 'Demi-vampire, surveillante de la troupe de Lucretia.',
    unit: 'officer_morene',
    chord: 'XA',
    assist: {
      id: 'morene_drain',
      name: 'Soif de Morene',
      description: 'Morene se jette sur les ennemis devant Lucretia ; le sang versé ranime la troupe.',
      icon: '♆',
      color: 0xc0304a,
      targeting: 'point',
      range: 10,
      effects: [
        { kind: 'dash', damage: 40, damageType: 'MAGICAL', width: 1.4 },
        { kind: 'damage', amount: 50, damageType: 'MAGICAL', radius: 3 },
        { kind: 'heal', radius: 12, amount: 0.15 },
      ],
    },
  },
  {
    id: 'cirith',
    name: 'Cirith',
    description: 'Officier elfe noire de Lucretia.',
    unit: 'officer_cirith',
    chord: 'BY',
    assist: {
      id: 'cirith_storm',
      name: 'Orage de Cirith',
      description: 'Cirith appelle la foudre sur les ennemis devant Lucretia.',
      icon: 'ϟ',
      color: 0xb0c8ff,
      targeting: 'point',
      range: 18,
      effects: [{ kind: 'damage', amount: 55, damageType: 'LIGHTNING', radius: 4.5, stun: 0.6 }],
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
