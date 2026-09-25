// Opponent AI. Scores each option with a deterministic damage estimate so it
// never consumes the battle RNG; `level` controls how greedy it is.
//   0 = random, 1 = sensible, 2 = sharp (fewer mistakes, switches out of bad matchups)

const AVG_ROLL = 236;

function expectedDamage(battle, user, target, move) {
  if (move.category === 'Status' || target.volatiles.substitute) return 0;
  if (move.id === 'dreameater' && target.status !== 'slp') return 0;
  if (move.id === 'counter' || move.id === 'bide') return 0;
  if (move.ohko) {
    if (target.stats.spe > user.stats.spe) return 0;
    return target.hp * (move.accuracy / 100);
  }
  const { damage, immune } = battle.computeDamage(user, target, move, { roll: AVG_ROLL, crit: false });
  if (immune) return 0;
  let hits = 1;
  if (Array.isArray(move.multihit)) hits = 3;
  else if (move.multihit) hits = move.multihit;
  const accuracy = move.accuracy == null ? 1 : move.accuracy / 100;
  let dmg = Math.min(damage * hits, target.hp) * accuracy;
  if (move.charge) dmg *= 0.55;
  if (move.recharge && damage < target.hp) dmg *= 0.7;
  if (move.selfdestruct) dmg *= damage >= target.hp ? 0.9 : 0.25;
  if (move.recoil) dmg *= 0.9;
  return dmg;
}

function statusValue(battle, user, target, move, userSide) {
  const hpRatio = user.hp / user.maxHp;
  if (move.status) {
    if (target.status || target.volatiles.substitute) return -1;
    if (move.status === 'psn' || move.status === 'tox') {
      if (target.types.includes('Poison')) return -1;
      return target.maxHp * 0.18;
    }
    if (move.id === 'thunderwave' && target.types.includes('Ground')) return -1;
    if (move.status === 'slp') {
      const team = battle.sides[1 - userSide].pokemon;
      if (team.some((p) => p.status === 'slp' && !p.fainted)) return -1;
      return target.maxHp * 0.45 * ((move.accuracy ?? 100) / 100);
    }
    if (move.status === 'par') return target.maxHp * 0.35 * ((move.accuracy ?? 100) / 100);
    return target.maxHp * 0.2;
  }
  if (move.volatile === 'confusion') return target.volatiles.confusion ? -1 : target.maxHp * 0.15;
  if (move.volatile === 'leechseed') {
    return target.volatiles.leechseed || target.types.includes('Grass') ? -1 : target.maxHp * 0.15;
  }
  if (move.boosts) {
    const self = move.target === 'self';
    const mon = self ? user : target;
    const total = Object.entries(move.boosts).reduce((acc, [stat, d]) => {
      const room = d > 0 ? 6 - mon.boosts[stat] : mon.boosts[stat] + 6;
      return acc + (room > 0 ? Math.abs(d) : 0);
    }, 0);
    if (!total) return -1;
    const stage = Math.max(...Object.values(mon.boosts).map(Math.abs));
    const worth = self ? hpRatio * user.maxHp * 0.22 : target.maxHp * 0.1;
    return (worth * total) / (1 + stage);
  }
  switch (move.id) {
    case 'recover':
    case 'softboiled':
      return hpRatio < 0.55 ? user.maxHp * (0.9 - hpRatio) : -1;
    case 'rest':
      return hpRatio < 0.4 || (user.status && hpRatio < 0.7) ? user.maxHp * 0.6 : -1;
    case 'substitute':
      return !user.volatiles.substitute && hpRatio > 0.6 ? user.maxHp * 0.2 : -1;
    case 'reflect':
    case 'lightscreen':
    case 'focusenergy':
    case 'mist':
      return user.volatiles[move.id] ? -1 : user.maxHp * 0.12;
    case 'transform':
      return user.volatiles.transformed ? -1 : target.maxHp * 0.3;
    case 'haze':
      return Object.values(target.boosts).some((b) => b > 0) ? target.maxHp * 0.3 : -1;
    case 'counter': {
      const last = target.lastMove && battle.data.moves[target.lastMove];
      const counterable = last && last.power > 0 && ['Normal', 'Fighting'].includes(last.type);
      return counterable && user.lastDamageTaken ? Math.min(user.lastDamageTaken * 1.6, target.hp) : -1;
    }
    case 'bide':
      return hpRatio > 0.7 ? user.maxHp * 0.1 : -1;
    case 'splash':
    case 'teleport':
    case 'whirlwind':
    case 'roar':
      return -1;
    default:
      return user.maxHp * 0.05;
  }
}

/** Best matchup score for `mon` against `foe`: how hard it hits minus how hard it gets hit. */
function matchup(battle, mon, foe) {
  const offense = Math.max(0, ...mon.moves.map((m) => expectedDamage(battle, mon, foe, battle.data.moves[m.id]) / foe.maxHp));
  const defense = Math.max(0, ...foe.moves.map((m) => expectedDamage(battle, foe, mon, battle.data.moves[m.id]) / mon.maxHp));
  return offense - defense + (mon.hp / mon.maxHp) * 0.3;
}

export function chooseAction(battle, side, level = 1) {
  const req = battle.getRequest(side);
  if (req.kind === 'locked') return { type: 'locked' };
  if (req.kind === 'switch') return { type: 'switch', index: chooseReplacement(battle, side, level) };
  if (req.kind !== 'move') return null;
  if (req.struggle) return { type: 'move', index: -1 };

  const usable = req.moves.filter((m) => m.usable);
  if (level <= 0) return { type: 'move', index: battle.rng.pick(usable).index };

  const user = battle.active(side);
  const target = battle.active(1 - side);
  const scored = usable.map((m) => {
    const move = battle.data.moves[m.id];
    let score;
    if (move.category === 'Status' || move.id === 'counter' || move.id === 'bide') {
      score = statusValue(battle, user, target, move, side);
    } else {
      score = expectedDamage(battle, user, target, move);
      if (score >= target.hp) score = target.hp * 1.5 + (move.priority > 0 ? target.maxHp : 0);
    }
    // A little noise keeps the AI from being fully predictable.
    const noise = level >= 2 ? 0.08 : 0.25;
    score *= 1 + (Math.random() * 2 - 1) * noise;
    return { index: m.index, score };
  });
  scored.sort((a, b) => b.score - a.score);

  if (level >= 2 && req.switches.length && !user.volatiles.trapped) {
    const here = matchup(battle, user, target);
    const best = req.switches
      .map((i) => ({ i, s: matchup(battle, battle.sides[side].pokemon[i], target) }))
      .sort((a, b) => b.s - a.s)[0];
    if (best && here < -0.6 && best.s - here > 0.9 && Math.random() < 0.7) return { type: 'switch', index: best.i };
  }
  return { type: 'move', index: scored[0].index };
}

export function chooseReplacement(battle, side, level = 1) {
  const { switches } = battle.getRequest(side);
  if (!switches?.length) return -1;
  if (level <= 0) return battle.rng.pick(switches);
  const foe = battle.active(1 - side);
  return switches
    .map((i) => ({ i, s: matchup(battle, battle.sides[side].pokemon[i], foe) }))
    .sort((a, b) => b.s - a.s)[0].i;
}
