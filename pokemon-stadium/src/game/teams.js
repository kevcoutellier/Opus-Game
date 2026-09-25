// Rental teams and opponents (cup tournaments, free battles).

import { allowed, RANKS } from './rules.js';

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
 * strength window (tier 0 = weakest eligible rentals, 1 = strongest).
 */
export function buildTeam(data, { types = null, tier = 0.5, rules, size = 6 } = {}) {
  const sorted = data.species.filter((s) => !rules || allowed(rules, s)).sort((a, b) => bst(a) - bst(b));
  const windowSize = Math.max(size + 4, Math.floor(sorted.length * 0.35));
  const start = Math.max(0, Math.min(sorted.length - windowSize, Math.floor((sorted.length - windowSize) * tier)));
  const window = sorted.slice(start, start + windowSize);
  const themed = types ? window.filter((s) => s.types.some((t) => types.includes(t))) : [];
  const team = sample(themed, Math.min(4, themed.length));
  const rest = window.filter((s) => !team.includes(s));
  team.push(...sample(rest, size - team.length));
  return team;
}

export function randomTeam(data, { rules, size = 6 } = {}) {
  const eligible = data.species.filter((s) => !rules || allowed(rules, s));
  const decent = eligible.filter((s) => bst(s) > 300);
  return sample(decent.length >= size ? decent : eligible, size);
}

/** The opponent keeps its 3 best Pokémon against the player's 6. */
export function pickThree(data, team, foeTeam) {
  const typeScore = (mon) =>
    foeTeam.reduce((acc, foe) => {
      const attack = Math.max(...mon.types.map((t) => foe.types.reduce((m, ft) => m * (data.typeChart[t]?.[ft] ?? 1), 1)));
      const defend = Math.max(...foe.types.map((t) => mon.types.reduce((m, mt) => m * (data.typeChart[t]?.[mt] ?? 1), 1)));
      return acc + attack - defend * 0.8;
    }, 0);
  return [...team]
    .map((s) => ({ s, score: bst(s) / 60 + typeScore(s) + Math.random() * 1.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.s);
}

// Gen 1 French trainer classes, the types they like and their FRLG picture.
const CLASSES = [
  ['Gamin', ['Normal', 'Bug'], 'youngster'],
  ['Fillette', ['Normal', 'Grass'], 'lass'],
  ['Scout', ['Bug', 'Grass'], 'bug_catcher'],
  ['Pêcheur', ['Water'], 'fisherman'],
  ['Nageuse', ['Water', 'Ice'], 'swimmer_f'],
  ['Montagnard', ['Rock', 'Ground'], 'hiker'],
  ['Karatéka', ['Fighting'], 'black_belt'],
  ['Motard', ['Poison'], 'biker'],
  ['Ornithologue', ['Flying', 'Normal'], 'bird_keeper'],
  ['Scientifique', ['Electric', 'Poison'], 'scientist'],
  ['Médium', ['Ghost', 'Psychic'], 'channeler'],
  ['Jongleur', ['Psychic', 'Normal'], 'juggler'],
  ['Dompteur', ['Fire', 'Normal'], 'tamer'],
  ['Canon', ['Water', 'Grass', 'Normal'], 'beauty'],
];
const NAMES = ['Théo', 'Léa', 'Hugo', 'Manon', 'Lucas', 'Chloé', 'Nathan', 'Inès', 'Enzo', 'Jade', 'Louis', 'Emma', 'Jules', 'Lina', 'Rémi', 'Zoé', 'Marcel', 'Élise', 'Kenji', 'Aurore', 'Nils', 'Sacha', 'Clément', 'Maëlle'];
const ROUND_TITLES = ['1er tour', '2e tour', '3e tour', 'Quart de finale', 'Demi-finale', 'Finale'];

export const FREE_OPPONENTS = [
  { name: 'Rival Blue', pic: 'champion_rival' },
  { name: 'Topdresseuse Aurore', pic: 'cool_trainer_f' },
  { name: 'Scientifique Lucas', pic: 'scientist' },
  { name: 'Karatéka Kenji', pic: 'black_belt' },
  { name: 'Topdresseur Nils', pic: 'cool_trainer_m' },
];

/** The six opponents of a cup at a given rank; difficulty ramps up each round. */
export function buildTournament(data, cup, rankIndex) {
  const rank = RANKS[rankIndex];
  const classes = sample(CLASSES, ROUND_TITLES.length - 1);
  const names = sample(NAMES, ROUND_TITLES.length);
  return ROUND_TITLES.map((title, i) => {
    const k = i / (ROUND_TITLES.length - 1);
    const last = i === ROUND_TITLES.length - 1;
    const [cls, types, pic] = last ? ['Topdresseur', null, 'cool_trainer_m'] : classes[i];
    const ai = Math.round(rank.ai[0] + (rank.ai[1] - rank.ai[0]) * k);
    const tier = rank.tier[0] + (rank.tier[1] - rank.tier[0]) * k;
    return {
      name: `${cls} ${names[i]}`,
      pic,
      title,
      ai,
      theme: last ? 'night' : k > 0.5 ? 'sunset' : cup.theme,
      team: buildTeam(data, { types, tier, rules: cup }),
    };
  });
}
