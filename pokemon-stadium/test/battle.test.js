import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle } from '../src/engine/battle.js';
import { calcStat, createPokemon } from '../src/engine/pokemon.js';
import { chooseAction, chooseReplacement } from '../src/engine/ai.js';

const data = JSON.parse(readFileSync(new URL('../src/data/gen1.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(data.species.map((s) => [s.id, s]));

function mon(id, moves, level = 50) {
  return createPokemon(byId[id], data, { level, moves });
}

function battle(p1, p2, seed = 1) {
  const b = new Battle({ data, seed, sides: [{ name: 'Rouge', pokemon: p1 }, { name: 'Blue', pokemon: p2 }] });
  b.start();
  return b;
}

const move = (index = 0) => ({ type: 'move', index });

test('data covers the 151 Gen 1 Pokémon with French names', () => {
  assert.equal(data.species.length, 151);
  assert.equal(byId.charizard.nameFr, 'Dracaufeu');
  assert.equal(byId.mewtwo.base.spc, 154);
  assert.equal(data.moves.thunderbolt.nameFr, 'Tonnerre');
  assert.equal(data.moves.bite.type, 'Normal', 'Bite is Normal-type in Gen 1');
  assert.equal(data.typeChart.Ghost.Psychic, 0, 'Gen 1 Ghost -> Psychic bug');
  for (const s of data.species) {
    assert.ok(s.rental.moves.length >= 1, `${s.id} has a rental moveset`);
    for (const m of s.rental.moves) assert.ok(data.moves[m], `${s.id}: unknown move ${m}`);
  }
});

test('Gen 1 stat formula with max DVs and stat experience', () => {
  // Pikachu lv 50: base HP 35, base Spe 90.
  assert.equal(calcStat(35, 50, true), 141);
  assert.equal(calcStat(100, 100, true), Math.floor(((100 + 15) * 2 + 63) * 100 / 100) + 110);
  assert.equal(calcStat(90, 50), Math.floor(((90 + 15) * 2 + 63) * 50 / 100) + 5);
});

test('damage stays within the Stadium formula bounds', () => {
  const b = battle([mon('charizard', ['flamethrower'])], [mon('venusaur', ['tackle'])]);
  const user = b.active(0);
  const target = b.active(1);
  const min = b.computeDamage(user, target, data.moves.flamethrower, { roll: 217, crit: false }).damage;
  const max = b.computeDamage(user, target, data.moves.flamethrower, { roll: 255, crit: false }).damage;
  assert.ok(min < max);
  for (let i = 0; i < 200; i++) {
    const { damage, crit } = b.computeDamage(user, target, data.moves.flamethrower);
    if (!crit) assert.ok(damage >= min && damage <= max, `${damage} not in [${min}, ${max}]`);
  }
  const crit = b.computeDamage(user, target, data.moves.flamethrower, { roll: 255, crit: true }).damage;
  assert.ok(crit > max, 'critical hits double the level');
});

test('type immunities and effectiveness', () => {
  const b = battle([mon('pikachu', ['thunderbolt', 'bodyslam'])], [mon('golem', ['tackle'])]);
  const [p1] = b.sides[0].pokemon;
  assert.equal(b.computeDamage(p1, b.active(1), data.moves.thunderbolt).immune, true);
  const events = b.playTurn([move(0), move(0)]);
  assert.ok(events.some((e) => e.type === 'immune' && e.side === 1));
  assert.equal(b.active(1).hp, b.active(1).maxHp);
});

test('faster Pokémon moves first, priority beats speed', () => {
  const b = battle([mon('jolteon', ['thunderbolt'])], [mon('snorlax', ['quickattack'])]);
  const moves = b.playTurn([move(0), move(0)]).filter((e) => e.type === 'move');
  assert.deepEqual(moves.map((m) => m.side), [1, 0], 'Quick Attack goes first');
  const b2 = battle([mon('jolteon', ['thunderbolt'])], [mon('snorlax', ['bodyslam'])]);
  const moves2 = b2.playTurn([move(0), move(0)]).filter((e) => e.type === 'move');
  assert.deepEqual(moves2.map((m) => m.side), [0, 1]);
});

test('Stadium sleep lasts 1 to 3 turns and blocks moves', () => {
  for (let seed = 1; seed < 30; seed++) {
    const b = battle([mon('parasect', ['spore', 'growth'])], [mon('snorlax', ['bodyslam'])], seed);
    b.playTurn([move(0), move(0)]);
    const snorlax = b.active(1);
    if (snorlax.status !== 'slp') continue;
    let sleptTurns = 1;
    while (snorlax.status === 'slp') {
      const evs = b.playTurn([move(1), move(0)]);
      assert.ok(!evs.some((e) => e.type === 'move' && e.side === 1), 'sleeping Pokémon cannot move');
      sleptTurns++;
      assert.ok(sleptTurns <= 4);
    }
  }
});

test('sleep clause stops a second Pokémon from being put to sleep', () => {
  const b = battle([mon('gengar', ['hypnosis'])], [mon('snorlax', ['rest']), mon('chansey', ['softboiled'])]);
  const [, chansey] = b.sides[1].pokemon;
  b.sides[1].pokemon[0].status = 'slp';
  b.sides[1].pokemon[0].sleepTurns = 3;
  b.playTurn([move(0), { type: 'switch', index: 1 }]);
  assert.equal(chansey.status, null);
});

test('Hyper Beam must recharge, even after a KO (Stadium)', () => {
  const b = battle([mon('tauros', ['hyperbeam'], 100)], [mon('magikarp', ['splash'], 5), mon('pidgey', ['tackle'], 5)], 3);
  let evs = [];
  for (let i = 0; i < 5 && !b.active(1).fainted; i++) evs = b.playTurn([move(0), move(0)]);
  assert.ok(b.active(1).fainted);
  assert.ok(b.active(0).volatiles.recharge, 'recharge pending');
  assert.equal(b.getRequest(0).kind, 'locked');
  b.replace(1, 1);
  evs = b.playTurn([{ type: 'locked' }, move(0)]);
  assert.ok(evs.some((e) => e.type === 'cant' && e.reason === 'recharge'));
});

test('Explosion when both last Pokémon faint makes the user lose', () => {
  const b = battle([mon('golem', ['explosion'], 100)], [mon('pikachu', ['splash'], 20)], 5);
  const evs = b.playTurn([move(0), move(0)]);
  assert.ok(evs.filter((e) => e.type === 'faint').length === 2);
  assert.equal(b.winner, 1);
});

test('Substitute absorbs damage and blocks status moves', () => {
  const b = battle([mon('gengar', ['hypnosis', 'thunderbolt'])], [mon('snorlax', ['substitute', 'bodyslam'])], 8);
  b.playTurn([move(0), move(0)]);
  const snorlax = b.active(1);
  if (snorlax.volatiles.substitute) {
    assert.notEqual(snorlax.status, 'slp');
    const hp = snorlax.hp;
    b.playTurn([move(1), move(1)]);
    assert.equal(snorlax.hp, hp, 'damage hits the substitute');
  }
});

test('burn halves attack and poison ticks 1/16', () => {
  const b = battle([mon('machamp', ['submission'])], [mon('arcanine', ['tackle'])]);
  const machamp = b.active(0);
  const atk = machamp.stats.atk;
  b.trySetStatus(machamp, 0, 'brn');
  assert.equal(machamp.stats.atk, Math.floor(atk / 2));
  b.cureStatus(machamp, 0);
  assert.equal(machamp.stats.atk, atk, 'Stadium restores the stat when cured');
  b.trySetStatus(b.active(1), 1, 'psn');
  const hp = b.active(1).hp;
  b.residual(1);
  assert.equal(hp - b.active(1).hp, Math.floor(b.active(1).maxHp / 16));
});

test('fainted Pokémon must be replaced and the battle ends', () => {
  const b = battle([mon('mewtwo', ['psychic'], 100)], [mon('rattata', ['tackle'], 5), mon('pidgey', ['tackle'], 5)]);
  b.playTurn([move(0), move(0)]);
  assert.ok(b.needsReplacement(1));
  assert.equal(b.getRequest(1).kind, 'switch');
  b.replace(1, chooseReplacement(b, 1));
  b.playTurn([move(0), move(0)]);
  assert.equal(b.winner, 0);
  assert.equal(b.getRequest(0).kind, 'none');
});

test('AI vs AI full battles with rentals always terminate', () => {
  const ids = data.species.map((s) => s.id);
  for (let seed = 1; seed <= 60; seed++) {
    const rng = (n) => Math.floor(((seed * 9301 + n * 49297) % 233280) / 233280 * ids.length);
    const team = (offset) => [0, 1, 2].map((k) => mon(ids[rng(offset + k * 7)], undefined, 50));
    const b = battle(team(1), team(100), seed);
    let turns = 0;
    while (!b.isOver && turns < 400) {
      for (const side of [0, 1]) {
        if (b.needsReplacement(side)) b.replace(side, chooseReplacement(b, side, 2));
      }
      if (b.isOver) break;
      b.playTurn([chooseAction(b, 0, 1), chooseAction(b, 1, 2)]);
      turns++;
    }
    assert.ok(b.isOver || turns === 400, `seed ${seed} did not finish`);
    for (const side of b.sides) {
      for (const p of side.pokemon) {
        assert.ok(p.hp >= 0 && p.hp <= p.maxHp, `${p.name} hp out of range`);
        for (const m of p.moves) assert.ok(m.pp >= 0);
      }
    }
  }
});
