// Rental teams, Poké Cup opponents and level rules.

// Pokémon Stadium's Poké Cup forbids Mew and Mewtwo.
export const CUP_BANNED = new Set([150, 151]);

export const CUP_ROUNDS = [
  { name: 'Gamin Théo', title: 'Huitième de finale', types: ['Bug', 'Normal'], ai: 0, tier: 0.25, theme: 'day' },
  { name: 'Pêcheur Marcel', title: 'Quart de finale', types: ['Water'], ai: 1, tier: 0.45, theme: 'day' },
  { name: 'Motard Rémi', title: 'Demi-finale', types: ['Poison', 'Fighting', 'Ground'], ai: 1, tier: 0.65, theme: 'sunset' },
  { name: 'Médium Élise', title: 'Finale', types: ['Psychic', 'Ghost'], ai: 2, tier: 0.85, theme: 'sunset' },
  { name: 'Maître Régis', title: 'Grande finale', types: null, ai: 2, tier: 1, theme: 'night' },
];

export const FREE_OPPONENTS = ['Rival Blue', 'Dresseuse Aurore', 'Scientifique Lucas', 'Karatéka Kenji', 'Topdresseur Nils'];

export function bst(species) {
  const b = species.base;
  return b.hp + b.atk + b.def + b.spc + b.spe;
}

function sample(list, n) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

/**
 * Six Pokémon for an opponent: themed by type when possible and drawn from a
 * strength window (tier 0 = weakest rentals, 1 = strongest).
 */
export function buildTeam(data, { types = null, tier = 0.5, banned = CUP_BANNED, size = 6 } = {}) {
  const sorted = data.species
    .filter((s) => !banned.has(s.num))
    .sort((a, b) => bst(a) - bst(b));
  const windowSize = Math.floor(sorted.length * 0.35);
  const start = Math.min(sorted.length - windowSize, Math.floor((sorted.length - windowSize) * tier));
  const window = sorted.slice(start, start + windowSize);
  const themed = types ? window.filter((s) => s.types.some((t) => types.includes(t))) : [];
  const team = sample(themed, Math.min(4, themed.length));
  const rest = window.filter((s) => !team.includes(s));
  team.push(...sample(rest, size - team.length));
  return team;
}

export function randomTeam(data, { banned = new Set(), size = 6 } = {}) {
  const pool = data.species.filter((s) => !banned.has(s.num) && bst(s) > 300);
  return sample(pool, size);
}

/** The opponent keeps its 3 best Pokémon against the player's 6. */
export function pickThree(battleData, team, foeTeam) {
  const typeScore = (mon) =>
    foeTeam.reduce((acc, foe) => {
      const attack = Math.max(...mon.types.map((t) => foe.types.reduce((m, ft) => m * (battleData.typeChart[t]?.[ft] ?? 1), 1)));
      const defend = Math.max(...foe.types.map((t) => mon.types.reduce((m, mt) => m * (battleData.typeChart[t]?.[mt] ?? 1), 1)));
      return acc + attack - defend * 0.8;
    }, 0);
  return [...team]
    .map((s) => ({ s, score: bst(s) / 60 + typeScore(s) + Math.random() * 1.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.s);
}

export const LEVEL_MODES = {
  fixed50: { label: 'Niveau 50', level: () => 50 },
  balanced: { label: 'Niveaux équilibrés', level: (s) => s.rental.level },
  fixed100: { label: 'Niveau 100', level: () => 100 },
};
