// A "run" is a sequence of battles fought with the same 6 rentals: a cup
// tournament, a gym (disciple + leader), the Elite Four + rival, or a free battle.

import { cupById, FREE_RULES, RANKS } from './rules.js';
import { buildTournament, FREE_OPPONENTS, randomTeam } from './teams.js';
import { eliteRounds, gymRounds, ofCity } from './castle.js';

// Gym Leader Castle uses the Poké Cup rules.
export const CASTLE_RULES = cupById('poke');

export function cupRun(data, cup, rankIndex) {
  const rank = RANKS[rankIndex];
  return {
    kind: 'cup',
    title: `${cup.name} · ${rank.name}`,
    rules: cup,
    rounds: buildTournament(data, cup, rankIndex),
    round: 0,
    team: null,
    reward: { type: 'cup', cup: cup.id, rank: rank.id },
  };
}

export function gymRun(data, gym) {
  return {
    kind: 'castle',
    title: `Château · Arène ${ofCity(gym.city)}`,
    rules: CASTLE_RULES,
    rounds: gymRounds(data, gym, CASTLE_RULES),
    round: 0,
    team: null,
    reward: { type: 'badge', gym: gym.id, label: gym.badge },
  };
}

export function eliteRun(data) {
  return {
    kind: 'castle',
    title: 'Château · Conseil 4',
    rules: CASTLE_RULES,
    rounds: eliteRounds(data),
    round: 0,
    team: null,
    reward: { type: 'elite' },
  };
}

export function freeRun(data, rulesId, ai) {
  const rules = FREE_RULES[rulesId] || FREE_RULES.fixed50;
  return {
    kind: 'free',
    title: `Combat Libre · ${rules.name}`,
    rules,
    rounds: [
      {
        ...FREE_OPPONENTS[Math.floor(Math.random() * FREE_OPPONENTS.length)],
        title: 'Combat Libre',
        ai,
        theme: 'day',
        team: randomTeam(data, { rules }),
      },
    ],
    round: 0,
    team: null,
    reward: null,
  };
}

export function currentRound(run) {
  return run.rounds[run.round];
}

export function runFinished(run) {
  return run.round >= run.rounds.length;
}
