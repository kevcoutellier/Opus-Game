import { parseAbilities, type AbilityDef } from '../../heroes/Ability';

/**
 * Abilities of the heroes. Curian, the messenger turned warrior, fights with the magic of Hironeiden;
 * Likuku, the ogre chieftain, with brute strength and the fury of the horde.
 */
const RAW_ABILITIES = [
  {
    id: 'curian_shift',
    name: 'Déplacement',
    description: 'Curian traverse le champ de bataille en un éclair et frappe tous les ennemis sur son passage.',
    icon: '➶',
    color: 0x9fd8ff,
    targeting: 'point',
    range: 14,
    manaCost: 20,
    cooldown: 8,
    castTime: 0.2,
    effects: [{ kind: 'dash', damage: 40, damageType: 'MAGICAL', width: 1.4 }],
  },
  {
    id: 'curian_freeze',
    name: 'Gel',
    description: 'Un souffle glacé fige les ennemis sur place pendant 3 secondes.',
    icon: '❄',
    color: 0xbfe8ff,
    targeting: 'point',
    range: 22,
    manaCost: 35,
    cooldown: 16,
    castTime: 0.6,
    effects: [{ kind: 'damage', amount: 25, damageType: 'ICE', radius: 5, stun: 3 }],
  },
  {
    id: 'curian_energy',
    name: 'Salve d’énergie',
    description: 'Une sphère d’énergie pure qui éclate au milieu des rangs ennemis.',
    icon: '✺',
    color: 0xc18cff,
    targeting: 'point',
    range: 30,
    manaCost: 45,
    cooldown: 14,
    castTime: 0.5,
    effects: [{ kind: 'missile', projectile: 'magic', damage: 70, damageType: 'MAGICAL', radius: 4, speed: 26 }],
  },
  {
    id: 'curian_oath',
    name: 'Serment de la garde',
    description: 'Curian lève son épée : ses soldats reprennent courage et resserrent les boucliers.',
    icon: '⚜',
    color: 0xffe08a,
    targeting: 'self',
    manaCost: 30,
    cooldown: 24,
    castTime: 0.4,
    effects: [
      { kind: 'morale', radius: 16, allies: 30, enemies: 0 },
      { kind: 'buff', radius: 16, duration: 10, defense: 6 },
    ],
  },
  {
    id: 'likuku_quake',
    name: 'Séisme',
    description: 'Likuku frappe le sol : la terre tremble, projette et étourdit tout ce qui l’entoure.',
    icon: '✹',
    color: 0xc9a86b,
    targeting: 'self',
    manaCost: 30,
    cooldown: 12,
    castTime: 0.7,
    effects: [{ kind: 'damage', amount: 45, damageType: 'BLUNT', radius: 6, knockback: 5, stun: 1.2 }],
  },
  {
    id: 'likuku_bloodrage',
    name: 'Rage sanguinaire',
    description: 'La horde autour de Likuku frappe plus fort et plus vite pendant 12 secondes.',
    icon: '♨',
    color: 0xd0302a,
    targeting: 'self',
    manaCost: 35,
    cooldown: 22,
    castTime: 0.3,
    effects: [{ kind: 'buff', radius: 10, duration: 12, damage: 1.3, haste: 1.3 }],
  },
  {
    id: 'likuku_warcry',
    name: 'Cri de guerre',
    description: 'Un rugissement qui galvanise les orcs et glace le sang des hommes.',
    icon: '☄',
    color: 0xffa040,
    targeting: 'self',
    manaCost: 25,
    cooldown: 20,
    castTime: 0.5,
    effects: [{ kind: 'morale', radius: 18, allies: 25, enemies: 20 }],
  },
  {
    id: 'likuku_boulder',
    name: 'Rocher',
    description: 'Likuku arrache un bloc de roche et l’abat sur les rangs ennemis.',
    icon: '◉',
    color: 0x8a7a60,
    targeting: 'point',
    range: 28,
    manaCost: 30,
    cooldown: 10,
    castTime: 0.8,
    effects: [{ kind: 'missile', projectile: 'rock', damage: 60, damageType: 'BLUNT', radius: 2.5, speed: 20 }],
  },
] as const;

export const ABILITIES: readonly AbilityDef[] = parseAbilities(RAW_ABILITIES);
const BY_ID: ReadonlyMap<string, AbilityDef> = new Map(ABILITIES.map((a) => [a.id, a]));

export function ability(id: string): AbilityDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown ability ${id}`);
  return def;
}
