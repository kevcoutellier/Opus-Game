// Battle-time Pokémon: Gen 1 stat formula and Stadium's stat recalculation.

export const STATS = ['atk', 'def', 'spc', 'spe'];
export const BOOSTABLE = ['atk', 'def', 'spc', 'spe', 'accuracy', 'evasion'];

// Stadium's stage multipliers (applied to the unmodified stat each time).
const BOOST_UP = [1, 1.5, 2, 2.5, 3, 3.5, 4];
const BOOST_DOWN = [1, 0.66, 0.5, 0.4, 0.33, 0.28, 0.25];

// Rentals use max DVs (15) and max stat experience, like Stadium's rentals at best.
const DV = 15;
const STAT_EXP_BONUS = 63;

export function calcStat(base, level, isHp) {
  const core = Math.floor(((base + DV) * 2 + STAT_EXP_BONUS) * level / 100);
  return isHp ? core + level + 10 : core + 5;
}

export function boostMultiplier(stage) {
  return stage >= 0 ? BOOST_UP[stage] : BOOST_DOWN[-stage];
}

/**
 * @param {object} species entry of gen1.json `species`
 * @param {object} opts { level, moves: string[] }
 */
export function createPokemon(species, data, { level = 50, moves } = {}) {
  const moveIds = (moves || species.rental.moves).filter((id) => data.moves[id]).slice(0, 4);
  const base = {
    hp: calcStat(species.base.hp, level, true),
    atk: calcStat(species.base.atk, level),
    def: calcStat(species.base.def, level),
    spc: calcStat(species.base.spc, level),
    spe: calcStat(species.base.spe, level),
  };
  const mon = {
    species,
    name: species.nameFr,
    num: species.num,
    level,
    types: [...species.types],
    baseStats: base,
    stats: { ...base },
    maxHp: base.hp,
    hp: base.hp,
    moves: moveIds.map((id) => ({ id, pp: data.moves[id].pp, maxPp: data.moves[id].pp })),
    status: null,
    sleepTurns: 0,
    toxicCounter: 0,
    boosts: {},
    volatiles: {},
    lastMove: null,
    fainted: false,
  };
  resetBoosts(mon);
  return mon;
}

export function resetBoosts(mon) {
  for (const s of BOOSTABLE) mon.boosts[s] = 0;
  recalcStats(mon);
}

/** Stadium recalculates every stat from scratch after boosts or status changes. */
export function recalcStats(mon) {
  for (const s of STATS) {
    let value = Math.floor(mon.baseStats[s] * boostMultiplier(mon.boosts[s]));
    if (s === 'spe' && mon.status === 'par') value = Math.floor(value / 4);
    if (s === 'atk' && mon.status === 'brn') value = Math.floor(value / 2);
    mon.stats[s] = Math.max(1, Math.min(999, value));
  }
}

/** Clears everything that does not survive a switch-out. */
export function clearOnSwitch(mon) {
  mon.volatiles = {};
  if (mon.status === 'tox') mon.status = 'psn';
  mon.toxicCounter = 0;
  mon.lastMove = null;
  if (mon.transformedFrom) {
    Object.assign(mon, mon.transformedFrom);
    delete mon.transformedFrom;
  }
  resetBoosts(mon);
}
