// Gym Leader Castle (Château des Champions): the 8 Kanto gyms, then the Elite
// Four and the rival. Battles follow the Poké Cup rules (levels 50-55).
// Teams are built around each leader's speciality with Gen 1 Pokémon; they are
// inspired by the games, not a copy of Stadium's exact rosters.

import { buildTeam } from './teams.js';

export const GYMS = [
  {
    id: 'pierre', leader: 'Pierre', city: 'Argenta', type: 'Rock', badge: 'Badge Roche', color: '#b8a038',
    disciple: 'Montagnard', discipleTypes: ['Rock', 'Ground'],
    team: ['onix', 'golem', 'rhydon', 'omastar', 'kabutops', 'aerodactyl'],
  },
  {
    id: 'ondine', leader: 'Ondine', city: 'Azuria', type: 'Water', badge: 'Badge Cascade', color: '#6890f0',
    disciple: 'Nageuse', discipleTypes: ['Water'],
    team: ['starmie', 'lapras', 'gyarados', 'cloyster', 'golduck', 'seaking'],
  },
  {
    id: 'bob', leader: 'Major Bob', city: 'Carmin sur Mer', type: 'Electric', badge: 'Badge Foudre', color: '#f8d030',
    disciple: 'Marin', discipleTypes: ['Electric'],
    team: ['raichu', 'electrode', 'magneton', 'jolteon', 'electabuzz', 'zapdos'],
  },
  {
    id: 'erika', leader: 'Érika', city: 'Céladopole', type: 'Grass', badge: 'Badge Prisme', color: '#78c850',
    disciple: 'Fillette', discipleTypes: ['Grass'],
    team: ['vileplume', 'victreebel', 'tangela', 'exeggutor', 'venusaur', 'parasect'],
  },
  {
    id: 'koga', leader: 'Koga', city: 'Parmanie', type: 'Poison', badge: 'Badge Âme', color: '#a040a0',
    disciple: 'Jongleur', discipleTypes: ['Poison'],
    team: ['weezing', 'muk', 'venomoth', 'golbat', 'nidoking', 'tentacruel'],
  },
  {
    id: 'morgane', leader: 'Morgane', city: 'Safrania', type: 'Psychic', badge: 'Badge Marais', color: '#f85888',
    disciple: 'Médium', discipleTypes: ['Psychic'],
    team: ['alakazam', 'mrmime', 'hypno', 'slowbro', 'jynx', 'starmie'],
  },
  {
    id: 'auguste', leader: 'Auguste', city: "Cramois'Île", type: 'Fire', badge: 'Badge Volcan', color: '#f08030',
    disciple: 'Cambrioleur', discipleTypes: ['Fire'],
    team: ['arcanine', 'ninetales', 'rapidash', 'magmar', 'flareon', 'charizard'],
  },
  {
    id: 'giovanni', leader: 'Giovanni', city: 'Jadielle', type: 'Ground', badge: 'Badge Terre', color: '#e0c068',
    disciple: 'Topdresseur', discipleTypes: ['Ground', 'Poison'],
    team: ['nidoking', 'nidoqueen', 'rhydon', 'dugtrio', 'marowak', 'persian'],
  },
];

export const ELITE_FOUR = [
  { id: 'olga', name: 'Olga', title: 'Conseil 4 · Olga', type: 'Ice', team: ['dewgong', 'cloyster', 'slowbro', 'jynx', 'lapras', 'articuno'] },
  { id: 'aldo', name: 'Aldo', title: 'Conseil 4 · Aldo', type: 'Fighting', team: ['onix', 'hitmonchan', 'hitmonlee', 'machamp', 'primeape', 'poliwrath'] },
  { id: 'agatha', name: 'Agatha', title: 'Conseil 4 · Agatha', type: 'Ghost', team: ['gengar', 'haunter', 'golbat', 'arbok', 'weezing', 'muk'] },
  { id: 'peter', name: 'Peter', title: 'Conseil 4 · Peter', type: 'Dragon', team: ['dragonite', 'gyarados', 'dragonair', 'aerodactyl', 'charizard', 'seadra'] },
];

export const RIVAL = { name: 'Blue', title: 'Maître de la Ligue · Blue', team: ['pidgeot', 'alakazam', 'rhydon', 'exeggutor', 'gyarados', 'arcanine'] };

const toSpecies = (data, ids) => ids.map((id) => data.species.find((s) => s.id === id));

/** "d'Argenta" / "de Jadielle": French elision before a vowel. */
export function ofCity(city) {
  return /^[aeiouyéèêàâîô]/i.test(city) ? `d'${city}` : `de ${city}`;
}

/** Two battles per gym: a disciple, then the leader. */
export function gymRounds(data, gym, rules) {
  return [
    {
      name: `${gym.disciple} de ${gym.leader}`,
      title: `Arène ${ofCity(gym.city)}`,
      ai: 1,
      theme: 'sunset',
      team: buildTeam(data, { types: gym.discipleTypes, tier: 0.55, rules }),
    },
    {
      name: `Champion ${gym.leader}`,
      title: `${gym.badge}`,
      ai: 2,
      theme: 'night',
      team: toSpecies(data, gym.team),
    },
  ];
}

export function eliteRounds(data) {
  return [
    ...ELITE_FOUR.map((e) => ({ name: e.name, title: e.title, ai: 2, theme: 'night', team: toSpecies(data, e.team) })),
    { name: RIVAL.name, title: RIVAL.title, ai: 2, theme: 'night', team: toSpecies(data, RIVAL.team) },
  ];
}
