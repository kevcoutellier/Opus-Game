// Gym Leader Castle (Château des Champions): the 8 Kanto gyms, then the Elite
// Four and the rival. Battles follow the Poké Cup rules (levels 50-55).
// Teams are built around each leader's speciality with Gen 1 Pokémon; they are
// inspired by the games, not a copy of Stadium's exact rosters.

import { buildTeam } from './teams.js';

export const GYMS = [
  {
    id: 'pierre', pic: 'leader_brock', disciplePic: 'hiker', leader: 'Pierre', city: 'Argenta', type: 'Rock', badge: 'Badge Roche', color: '#b8a038',
    disciple: 'Montagnard', discipleTypes: ['Rock', 'Ground'],
    team: ['onix', 'golem', 'rhydon', 'omastar', 'kabutops', 'aerodactyl'],
  },
  {
    id: 'ondine', pic: 'leader_misty', disciplePic: 'swimmer_f', leader: 'Ondine', city: 'Azuria', type: 'Water', badge: 'Badge Cascade', color: '#6890f0',
    disciple: 'Nageuse', discipleTypes: ['Water'],
    team: ['starmie', 'lapras', 'gyarados', 'cloyster', 'golduck', 'seaking'],
  },
  {
    id: 'bob', pic: 'leader_lt_surge', disciplePic: 'sailor', leader: 'Major Bob', city: 'Carmin sur Mer', type: 'Electric', badge: 'Badge Foudre', color: '#f8d030',
    disciple: 'Marin', discipleTypes: ['Electric'],
    team: ['raichu', 'electrode', 'magneton', 'jolteon', 'electabuzz', 'zapdos'],
  },
  {
    id: 'erika', pic: 'leader_erika', disciplePic: 'lass', leader: 'Érika', city: 'Céladopole', type: 'Grass', badge: 'Badge Prisme', color: '#78c850',
    disciple: 'Fillette', discipleTypes: ['Grass'],
    team: ['vileplume', 'victreebel', 'tangela', 'exeggutor', 'venusaur', 'parasect'],
  },
  {
    id: 'koga', pic: 'leader_koga', disciplePic: 'juggler', leader: 'Koga', city: 'Parmanie', type: 'Poison', badge: 'Badge Âme', color: '#a040a0',
    disciple: 'Jongleur', discipleTypes: ['Poison'],
    team: ['weezing', 'muk', 'venomoth', 'golbat', 'nidoking', 'tentacruel'],
  },
  {
    id: 'morgane', pic: 'leader_sabrina', disciplePic: 'channeler', leader: 'Morgane', city: 'Safrania', type: 'Psychic', badge: 'Badge Marais', color: '#f85888',
    disciple: 'Médium', discipleTypes: ['Psychic'],
    team: ['alakazam', 'mrmime', 'hypno', 'slowbro', 'jynx', 'starmie'],
  },
  {
    id: 'auguste', pic: 'leader_blaine', disciplePic: 'burglar', leader: 'Auguste', city: "Cramois'Île", type: 'Fire', badge: 'Badge Volcan', color: '#f08030',
    disciple: 'Cambrioleur', discipleTypes: ['Fire'],
    team: ['arcanine', 'ninetales', 'rapidash', 'magmar', 'flareon', 'charizard'],
  },
  {
    id: 'giovanni', pic: 'leader_giovanni', disciplePic: 'cool_trainer_m', leader: 'Giovanni', city: 'Jadielle', type: 'Ground', badge: 'Badge Terre', color: '#e0c068',
    disciple: 'Topdresseur', discipleTypes: ['Ground', 'Poison'],
    team: ['nidoking', 'nidoqueen', 'rhydon', 'dugtrio', 'marowak', 'persian'],
  },
];

export const ELITE_FOUR = [
  { id: 'olga', pic: 'elite_four_lorelei', name: 'Olga', title: 'Conseil 4 · Olga', type: 'Ice', team: ['dewgong', 'cloyster', 'slowbro', 'jynx', 'lapras', 'articuno'] },
  { id: 'aldo', pic: 'elite_four_bruno', name: 'Aldo', title: 'Conseil 4 · Aldo', type: 'Fighting', team: ['onix', 'hitmonchan', 'hitmonlee', 'machamp', 'primeape', 'poliwrath'] },
  { id: 'agatha', pic: 'elite_four_agatha', name: 'Agatha', title: 'Conseil 4 · Agatha', type: 'Ghost', team: ['gengar', 'haunter', 'golbat', 'arbok', 'weezing', 'muk'] },
  { id: 'peter', pic: 'elite_four_lance', name: 'Peter', title: 'Conseil 4 · Peter', type: 'Dragon', team: ['dragonite', 'gyarados', 'dragonair', 'aerodactyl', 'charizard', 'seadra'] },
];

export const RIVAL = { name: 'Blue', pic: 'champion_rival', title: 'Maître de la Ligue · Blue', team: ['pidgeot', 'alakazam', 'rhydon', 'exeggutor', 'gyarados', 'arcanine'] };

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
      pic: gym.disciplePic,
      title: `Arène ${ofCity(gym.city)}`,
      ai: 1,
      theme: 'sunset',
      team: buildTeam(data, { types: gym.discipleTypes, tier: 0.55, rules }),
    },
    {
      name: `Champion ${gym.leader}`,
      pic: gym.pic,
      title: `${gym.badge}`,
      ai: 2,
      theme: 'night',
      team: toSpecies(data, gym.team),
    },
  ];
}

export function eliteRounds(data) {
  return [
    ...ELITE_FOUR.map((e) => ({ name: e.name, pic: e.pic, title: e.title, ai: 2, theme: 'night', team: toSpecies(data, e.team) })),
    { name: RIVAL.name, pic: RIVAL.pic, title: RIVAL.title, ai: 2, theme: 'night', team: toSpecies(data, RIVAL.team) },
  ];
}
