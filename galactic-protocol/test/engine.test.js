import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GALAXY, hopsFrom } from '../src/engine/galaxy.js';
import { SCENARIOS } from '../src/data/scenarios.js';
import { TECHS, TECH_BY_ID } from '../src/data/techs.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { FACTIONS } from '../src/data/factions.js';
import { createGame } from '../src/engine/setup.js';
import { advanceDay } from '../src/engine/sim.js';
import { queueBuilding, recruit, refreshEconomy, systemOutput } from '../src/engine/economy.js';
import { orderMove } from '../src/engine/military.js';
import { createStack, makeUnit } from '../src/engine/stacks.js';
import { atWar, canTransit, relation } from '../src/engine/query.js';
import { declareWar, makePeace, warScore } from '../src/engine/diplomacy.js';
import { launchOp } from '../src/engine/espionage.js';
import { proposeResolution, castVote } from '../src/engine/senate.js';
import { alertLevel, fireSuperweapon, orbitalBombardment } from '../src/engine/superweapons.js';
import { takeDecision } from '../src/engine/politics.js';
import { serialize, deserialize } from '../src/engine/save.js';

const game = (scenario = 'bby0', player = 'rebels', seed = 7) => createGame({ scenario, player, seed });
const run = (state, days) => {
  for (let i = 0; i < days; i++) advanceDay(state);
};

test('the galaxy has 131 well separated systems on a connected hyperlane network', () => {
  assert.equal(GALAXY.systems.length, 131);
  const reach = hopsFrom(GALAXY, 'coruscant');
  assert.equal(Object.keys(reach).length, GALAXY.systems.length, 'every system is reachable');
  for (const a of GALAXY.systems) {
    for (const b of GALAXY.systems) {
      if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 60, `${a.id} and ${b.id} overlap`);
    }
  }
  assert.ok(GALAXY.lanes.some((l) => l.major && l.route === 'Couloir Corellien'));
});

test('data tables are consistent', () => {
  assert.equal(TECHS.length, 47);
  for (const t of TECHS) for (const r of t.req) assert.ok(TECH_BY_ID[r], `${t.id} requires unknown ${r}`);
  for (const b of Object.values(BUILDINGS)) if (b.tech) assert.ok(TECH_BY_ID[b.tech]);
  for (const sc of SCENARIOS) {
    for (const f of sc.factions) {
      assert.ok(FACTIONS[f.id], `${sc.id}: unknown faction ${f.id}`);
      assert.ok(GALAXY.byId[f.capital], `${sc.id}: unknown capital ${f.capital}`);
      for (const id of f.systems || []) assert.ok(GALAXY.byId[id], `${sc.id}: unknown system ${id}`);
      for (const id of f.techs || []) assert.ok(TECH_BY_ID[id], `${sc.id}: unknown tech ${id}`);
    }
  }
});

test('every scenario starts with living factions that can reach all of their worlds', () => {
  for (const sc of SCENARIOS) {
    const state = createGame({ scenario: sc.id, player: sc.factions[0].id, seed: 1 });
    for (const f of Object.values(state.factions)) {
      assert.equal(state.systems[f.capital].owner, f.id, `${sc.id}: ${f.id} owns its capital`);
      assert.ok(f.econ.revenue > 0, `${sc.id}: ${f.id} has revenue`);
      const reach = hopsFrom(GALAXY, f.capital, 99, (id) => canTransit(state, f.id, id));
      for (const s of Object.values(state.systems)) {
        if (s.owner === f.id) assert.ok(reach[s.id] !== undefined, `${sc.id}: ${f.id} cannot reach ${s.id}`);
      }
    }
    for (const id of sc.destroyed) assert.ok(state.systems[id].destroyed);
  }
});

test('buildings are paid for and completed', () => {
  const state = game('bby0', 'chiss');
  const s = state.systems.csilla;
  s.buildings = [];
  const before = state.factions.chiss.treasury;
  const res = queueBuilding(state, 'chiss', 'csilla', 'lab');
  assert.ok(res.ok, res.msg);
  assert.ok(state.factions.chiss.treasury < before);
  run(state, 55);
  assert.ok(state.systems.csilla.buildings.includes('lab'));
});

test('units are recruited and join a stack in the system', () => {
  const state = game('bby0', 'empire');
  const count = () => Object.values(state.stacks).filter((st) => st.sys === 'coruscant' && st.owner === 'empire' && !st.move)
    .reduce((acc, st) => acc + st.units.filter((u) => u.t === 'infantry').length, 0);
  const before = count();
  assert.ok(recruit(state, 'empire', 'coruscant', 'infantry', 2).ok);
  run(state, 25);
  assert.ok(count() >= before + 2 - 0, 'two new infantry units');
});

test('stacks travel along the hyperlanes', () => {
  const state = game('bby0', 'empire');
  const stack = createStack(state, 'empire', 'coruscant', [makeUnit(state, 'empire', 'frigate')]);
  const res = orderMove(state, stack.id, 'kuat');
  assert.ok(res.ok, res.msg);
  run(state, res.days + 2);
  assert.equal(state.stacks[stack.id].sys, 'kuat');
});

test('an overwhelming army captures an enemy world, and peace hands it back', () => {
  const state = game('bby0', 'empire');
  const target = state.systems.takodana;
  assert.equal(target.owner, 'takodana');
  assert.ok(declareWar(state, 'empire', 'takodana').ok);
  assert.ok(atWar(state, 'empire', 'takodana'));
  const units = [];
  for (let i = 0; i < 6; i++) units.push(makeUnit(state, 'empire', 'capital'));
  for (let i = 0; i < 25; i++) units.push(makeUnit(state, 'empire', 'armor'));
  createStack(state, 'empire', 'takodana', units);
  run(state, 20);
  assert.equal(state.systems.takodana.controller, 'empire');
  const war = state.wars.find((w) => w.att.includes('empire') && w.def.includes('takodana'));
  assert.ok(warScore(state, war) > 50);
  makePeace(state, 'empire', 'takodana', 'white');
  assert.equal(state.systems.takodana.controller, 'takodana');
  assert.ok(!atWar(state, 'empire', 'takodana'));
});

test('self-targeted covert operations and decisions apply modifiers', () => {
  const state = game('bby0', 'empire');
  state.factions.empire.ip = 200;
  assert.ok(launchOp(state, 'empire', 'counter', 'empire').ok);
  assert.ok(state.factions.empire.counterUntil > state.day);
  assert.ok(takeDecision(state, 'empire', 'propaganda').ok);
  assert.ok(state.factions.empire.modifiers.some((m) => m.id === 'propaganda'));
  assert.equal(takeDecision(state, 'empire', 'propaganda').ok, false, 'cooldown');
});

test('the Senate votes resolutions', () => {
  const state = game('aby34', 'newrepublic');
  const res = proposeResolution(state, 'newrepublic', 'trade_pact');
  assert.ok(res.ok, res.msg);
  castVote(state, 'newrepublic', 'yes');
  run(state, 16);
  assert.equal(state.senate.current, null);
  assert.equal(state.senate.history[0].type, 'trade_pact');
});

test('the Death Star destroys a planet once the alert level allows it', () => {
  const state = game('bby0', 'empire');
  const sw = state.superweapons[0];
  const stack = state.stacks[sw.stackId];
  stack.sys = 'yavin';
  sw.charge = 1;
  state.tension = 30;
  assert.equal(fireSuperweapon(state, sw.id, 'yavin').ok, false, 'blocked at a low alert level');
  state.tension = 70;
  assert.equal(alertLevel(state), 2);
  const res = fireSuperweapon(state, sw.id, 'yavin');
  assert.ok(res.ok, res.msg);
  assert.ok(state.systems.yavin.destroyed);
  assert.equal(state.systems.yavin.owner, null);
  assert.ok(state.tension > 90);
  assert.ok(relation(state, 'hutts', 'empire') < 0);
});

test('Base Delta Zero devastates an enemy world', () => {
  const state = game('bby0', 'empire');
  state.tension = 50;
  const stack = createStack(state, 'empire', 'mon_cala', [makeUnit(state, 'empire', 'capital')]);
  for (const st of Object.values(state.stacks)) if (st.sys === 'mon_cala' && st.owner === 'rebels') delete state.stacks[st.id];
  const pop = state.systems.mon_cala.pop;
  const res = orbitalBombardment(state, stack.id);
  assert.ok(res.ok, res.msg);
  assert.ok(state.systems.mon_cala.pop < pop * 0.2);
  assert.equal(state.systems.mon_cala.buildings.length, 0);
});

test('a saved game reloads identically', () => {
  const state = game('bby0', 'rebels', 3);
  run(state, 30);
  const copy = deserialize(serialize(state));
  assert.equal(copy.day, state.day);
  assert.deepEqual(Object.keys(copy.stacks), Object.keys(state.stacks));
  run(state, 20);
  run(copy, 20);
  assert.equal(serialize(copy), serialize(state), 'same seed, same future');
});

test('every scenario runs a year of AI turns', () => {
  for (const sc of SCENARIOS) {
    const state = createGame({ scenario: sc.id, player: sc.factions[sc.factions.length - 1].id, seed: 11 });
    run(state, 360);
    refreshEconomy(state);
    assert.ok(Object.values(state.factions).filter((f) => f.alive).length >= 3, `${sc.id}: factions survive`);
    for (const s of Object.values(state.systems)) {
      assert.ok(s.stability >= 0 && s.stability <= 100);
      assert.ok(Number.isFinite(systemOutput(state, s)));
    }
    for (const f of Object.values(state.factions)) assert.ok(Number.isFinite(f.treasury), `${sc.id}: ${f.id} treasury`);
  }
});
