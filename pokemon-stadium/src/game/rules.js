// Pokémon Stadium tournament rules: level ranges, level caps for the 3 Pokémon
// sent into battle, and eligibility (Petit Cup size limits, Mew/Mewtwo bans).

export const MEW_BANNED = new Set([150, 151]);

/** Not an evolved Pokémon (baby pre-evolutions from Gen 2 don't count). */
export function isBasic(species) {
  return species.prevo === null || species.prevo > 151;
}

// Stadium order, from the easiest to the hardest cup.
export const CUPS = [
  {
    id: 'petit',
    name: 'Coupe Petit',
    min: 25,
    max: 30,
    total: 80,
    banned: MEW_BANNED,
    eligible: (s) => isBasic(s) && s.heightm <= 2 && s.weightkg <= 20,
    theme: 'sunset',
    blurb: 'Niv. 25 à 30 · total des 3 ≤ 80 · non évolués, 2 m et 20 kg max.',
  },
  {
    id: 'pika',
    name: 'Coupe Pika',
    min: 15,
    max: 20,
    total: 50,
    banned: MEW_BANNED,
    theme: 'day',
    blurb: 'Niv. 15 à 20 · total des 3 ≤ 50.',
  },
  {
    id: 'poke',
    name: 'Coupe Poké',
    min: 50,
    max: 55,
    total: 155,
    banned: MEW_BANNED,
    theme: 'day',
    blurb: 'Niv. 50 à 55 · total des 3 ≤ 155 · Mew et Mewtwo interdits.',
  },
  {
    id: 'prime',
    name: 'Coupe Prime',
    min: 100,
    max: 100,
    total: null,
    banned: new Set(),
    theme: 'night',
    blurb: 'Niveau 100 · les 151 Pokémon autorisés.',
  },
];

// Each cup is played at four difficulties, like Stadium's four balls.
export const RANKS = [
  { id: 'poke', name: 'Poké Ball', color: '#e3261c', ai: [0, 1], tier: [0.1, 0.45] },
  { id: 'super', name: 'Super Ball', color: '#2f6fd1', ai: [1, 1], tier: [0.3, 0.65] },
  { id: 'hyper', name: 'Hyper Ball', color: '#e0a800', ai: [1, 2], tier: [0.5, 0.85] },
  { id: 'master', name: 'Master Ball', color: '#8e44c9', ai: [2, 2], tier: [0.7, 1] },
];

export const FREE_RULES = {
  fixed50: { id: 'fixed50', name: 'Niveau 50', min: 50, max: 50, total: null, banned: new Set() },
  balanced: { id: 'balanced', name: 'Niveaux équilibrés', balanced: true, banned: new Set() },
  fixed100: { id: 'fixed100', name: 'Niveau 100', min: 100, max: 100, total: null, banned: new Set() },
};

export function cupById(id) {
  return CUPS.find((c) => c.id === id);
}

export function allowed(rules, species) {
  return !rules.banned?.has(species.num) && (!rules.eligible || rules.eligible(species));
}

export function levelRange(rules, species) {
  if (rules.balanced) return [species.rental.level, species.rental.level];
  return [rules.min, rules.max];
}

export function levelLabel(rules, species) {
  const [min, max] = levelRange(rules, species);
  return min === max ? `N.${min}` : `N.${min}–${max}`;
}

/**
 * Starting levels for the three chosen Pokémon: everyone at the minimum, then
 * the spare points of the level cap go to the first ones (the leads).
 */
export function defaultLevels(rules, team) {
  if (rules.balanced) return team.map((s) => s.rental.level);
  const levels = team.map(() => rules.min);
  let spare = rules.total == null ? Infinity : rules.total - rules.min * team.length;
  for (let i = 0; i < levels.length && spare > 0; i++) {
    const add = Math.min(rules.max - rules.min, spare);
    levels[i] += add;
    spare -= add;
  }
  return levels;
}

export function levelTotal(levels) {
  return levels.reduce((a, b) => a + b, 0);
}

export function levelsValid(rules, team, levels) {
  if (levels.length !== team.length) return false;
  const inRange = team.every((s, i) => {
    const [min, max] = levelRange(rules, s);
    return levels[i] >= min && levels[i] <= max;
  });
  return inRange && (rules.total == null || levelTotal(levels) <= rules.total);
}
