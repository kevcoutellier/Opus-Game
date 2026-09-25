import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CUPS, FREE_RULES, RANKS, allowed, cupById, defaultLevels, isBasic, levelTotal, levelsValid } from '../src/game/rules.js';
import { buildTournament } from '../src/game/teams.js';
import { ELITE_FOUR, GYMS, RIVAL } from '../src/game/castle.js';
import { cupRun, eliteRun, freeRun, gymRun } from '../src/game/runs.js';
import { TRAINER_PICS } from '../src/assetSources.js';
import { badgeCount, emptyProgress, hasTrophy, loadProgress, rankUnlocked, recordVictory, saveProgress } from '../src/game/progress.js';

const data = JSON.parse(readFileSync(new URL('../src/data/gen1.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(data.species.map((s) => [s.id, s]));

test('Petit Cup only accepts small, unevolved Pokémon', () => {
  const petit = cupById('petit');
  assert.ok(allowed(petit, byId.pikachu), 'Pikachu (baby prevo is Gen 2) is basic');
  assert.ok(allowed(petit, byId.eevee));
  assert.ok(!allowed(petit, byId.raichu), 'evolved');
  assert.ok(!allowed(petit, byId.onix), 'too big');
  assert.ok(!allowed(petit, byId.snorlax), 'too heavy');
  assert.ok(!allowed(petit, byId.mew), 'Mew banned');
  assert.ok(isBasic(byId.clefairy) && !isBasic(byId.clefable));
});

test('Mew and Mewtwo are only allowed in the Prime Cup', () => {
  for (const cup of CUPS) {
    assert.equal(allowed(cup, byId.mewtwo), cup.id === 'prime', cup.id);
  }
});

test('default levels respect each cup cap and stay valid', () => {
  const team = [byId.pikachu, byId.eevee, byId.bulbasaur];
  const expected = { petit: [30, 25, 25], pika: [20, 15, 15], poke: [55, 50, 50], prime: [100, 100, 100] };
  for (const cup of CUPS) {
    const levels = defaultLevels(cup, team);
    assert.deepEqual(levels, expected[cup.id], cup.id);
    assert.ok(levelsValid(cup, team, levels), cup.id);
    if (cup.total != null) assert.ok(levelTotal(levels) <= cup.total);
  }
  const poke = cupById('poke');
  assert.ok(!levelsValid(poke, team, [55, 55, 50]), 'total 160 > 155');
  assert.ok(!levelsValid(poke, team, [56, 50, 49]), 'out of range');
  assert.deepEqual(defaultLevels(FREE_RULES.balanced, [byId.mewtwo]), [byId.mewtwo.rental.level]);
});

test('tournaments only field eligible Pokémon and ramp up difficulty', () => {
  for (const cup of CUPS) {
    RANKS.forEach((rank, r) => {
      const rounds = buildTournament(data, cup, r);
      assert.equal(rounds.length, 6);
      for (const round of rounds) {
        assert.equal(round.team.length, 6, `${cup.id}/${rank.id}`);
        assert.equal(new Set(round.team).size, 6, 'no duplicates');
        for (const s of round.team) assert.ok(allowed(cup, s), `${s.id} not allowed in ${cup.id}`);
      }
      assert.ok(rounds.at(-1).ai >= rounds[0].ai);
    });
  }
});

test('gym leader castle: 8 gyms, Elite Four and rival with valid teams', () => {
  assert.equal(GYMS.length, 8);
  assert.equal(ELITE_FOUR.length, 4);
  for (const gym of GYMS) {
    const run = gymRun(data, gym);
    assert.equal(run.rounds.length, 2);
    assert.equal(run.reward.gym, gym.id);
    for (const round of run.rounds) {
      assert.equal(round.team.length, 6);
      for (const s of round.team) assert.ok(s && allowed(run.rules, s), `${gym.id}: ${s?.id}`);
    }
  }
  const elite = eliteRun(data);
  assert.equal(elite.rounds.length, 5);
  assert.equal(elite.rounds.at(-1).name, RIVAL.name);
  assert.ok(elite.rounds.every((r) => r.team.every(Boolean)));
});

test('progress: trophies unlock the next ball, badges and hall of fame', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const p = emptyProgress();
  assert.ok(rankUnlocked(p, 'poke', 0));
  assert.ok(!rankUnlocked(p, 'poke', 1));
  const run = cupRun(data, cupById('poke'), 0);
  const team = [{ num: 25, level: 55 }];
  assert.equal(recordVictory(p, run.reward, { title: run.title, date: 1, turns: 10, team }), true);
  assert.equal(recordVictory(p, run.reward, { title: run.title, date: 2, turns: 8, team }), false, 'already won');
  assert.ok(hasTrophy(p, 'poke', 'poke'));
  assert.ok(rankUnlocked(p, 'poke', 1));
  recordVictory(p, { type: 'badge', gym: 'pierre' }, { title: 'x', date: 3, turns: 1, team });
  assert.equal(badgeCount(p), 1);
  assert.equal(p.hallOfFame.length, 3);
  assert.equal(p.hallOfFame[0].date, 3, 'newest first');
  saveProgress(p, storage);
  assert.deepEqual(loadProgress(storage), p);
  assert.deepEqual(loadProgress({ getItem: () => '{broken' }), emptyProgress());
});

test('every opponent has a FireRed/LeafGreen trainer picture', () => {
  const runs = [
    ...CUPS.map((cup) => cupRun(data, cup, 3)),
    ...GYMS.map((gym) => gymRun(data, gym)),
    eliteRun(data),
    freeRun(data, 'fixed50', 1),
  ];
  for (const run of runs) {
    for (const round of run.rounds) assert.ok(TRAINER_PICS.includes(round.pic), `${round.name}: ${round.pic}`);
  }
});
