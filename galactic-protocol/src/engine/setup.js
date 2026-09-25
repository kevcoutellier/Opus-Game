// Creates the state of a new game from a scenario.
import { SCENARIO_BY_ID } from '../data/scenarios.js';
import { FACTIONS } from '../data/factions.js';
import { TECHS, TECH_BY_ID } from '../data/techs.js';
import { DOCTRINES, UNIT_NAMES, UNIT_TYPES } from '../data/units.js';
import { GALAXY } from './galaxy.js';
import { aliveFactions, neighbors, relation, setRelation, staticSystem } from './query.js';
import { recomputeMods } from './research.js';
import { RES, RES_INFO, refreshEconomy, shieldMax, systemValue } from './economy.js';
import { garrisonMax } from './military.js';
import { blankFaction, settleStability } from './politics.js';
import { addTreaty } from './diplomacy.js';
import { createStack, makeUnit, newId } from './stacks.js';
import { news } from './news.js';
import { weighted } from './rng.js';
import { SW_TYPES } from './superweapons.js';

function withPrereqs(ids) {
  const out = new Set();
  const add = (id) => {
    if (out.has(id) || !TECH_BY_ID[id]) return;
    TECH_BY_ID[id].req.forEach(add);
    out.add(id);
  };
  ids.forEach(add);
  return [...out];
}

function startingBuildings(state, s, f) {
  const stat = staticSystem(s.id);
  const list = [];
  const capital = f.capital === s.id;
  if (capital) list.push('barracks', 'fighter_base', 'intel_center', 'shield', 'turbolaser');
  if (stat.tags.includes('shipyard')) list.push('shipyard');
  const deposits = Object.entries(s.res).sort((a, b) => b[1] - a[1]);
  const extraction = { dura: 'dura_mine', tib: 'tib_refinery', kyb: 'kyber_mine', bacta: 'bacta_farm', spice: 'spice_refinery' };
  if (deposits.length && deposits[0][1] >= 2) list.push(extraction[deposits[0][0]]);
  if (s.dev >= 6) list.push('industry');
  if (stat.tags.includes('academy')) list.push('academy', 'barracks');
  if (stat.tags.includes('archive')) list.push('shield', 'turbolaser');
  if (stat.tags.includes('research')) list.push('lab');
  if (stat.tags.includes('prison')) list.push('bunker');
  if (stat.tags.includes('banking') || stat.tags.includes('trade')) list.push(s.dev >= 5 ? 'bank' : 'spaceport');
  if (s.pop >= 10) list.push('university');
  if (s.dev >= 8) list.push('spaceport', 'holonet');
  if (s.dev >= 7 && stat.region === 'core') list.push('lab');
  const slots = stat.size + 1;
  const unique = [];
  for (const b of list) {
    if (unique.length >= slots) break;
    if (b === 'turbolaser' || !unique.includes(b)) unique.push(b);
  }
  return unique;
}

/** Buys units worth `budget` credits following a doctrine (deterministic through the game RNG). */
function buyUnits(state, f, budget, allowBig) {
  const doctrine = DOCTRINES[f.doctrine] || DOCTRINES.balanced;
  const units = [];
  const buy = (share, cats) => {
    let left = budget * share;
    const weights = Object.fromEntries(Object.entries(doctrine).filter(([t]) => cats.includes(UNIT_TYPES[t].cat)));
    for (let guard = 0; guard < 400 && left > 30; guard++) {
      const affordable = Object.fromEntries(Object.entries(weights).filter(([t]) => UNIT_TYPES[t].cost.cr <= left));
      const type = weighted(state, affordable);
      if (!type) break;
      units.push(makeUnit(state, f.id, type, 10));
      left -= UNIT_TYPES[type].cost.cr;
    }
  };
  if (allowBig && f.mods.unlock.includes('superdestroyer') && budget > 12000) {
    units.push(makeUnit(state, f.id, 'superdestroyer', 30));
    budget -= UNIT_TYPES.superdestroyer.cost.cr;
  }
  buy(0.3, ['ground']);
  buy(0.7, ['air', 'ship']);
  return units;
}

function startingForces(state, f, army) {
  if (!army) return;
  const owned = Object.values(state.systems).filter((s) => s.owner === f.id && !s.destroyed);
  if (!owned.length) return;
  const capital = owned.find((s) => s.id === f.capital) || owned[0];
  const border = (s) => neighbors(s.id).some((n) => state.systems[n].owner && state.systems[n].owner !== f.id);
  const others = owned.filter((s) => s !== capital)
    .map((s) => [s, systemValue(state, s) + (border(s) ? 40 : 0) + (staticSystem(s.id).tags.includes('shipyard') ? 60 : 0)])
    .sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const garrisons = Math.min(others.length, Math.floor(army / 900), 24);
  const main = garrisons ? army * 0.4 : army;
  const name = (s) => `Flotte de ${staticSystem(s.id).name}`;
  createStack(state, f.id, capital.id, buyUnits(state, f, main, true), `Flotte de ${staticSystem(capital.id).name}`);
  for (let i = 0; i < garrisons; i++) {
    const s = others[i];
    createStack(state, f.id, s.id, buyUnits(state, f, (army - main) / garrisons, false), i < 3 ? name(s) : `Garnison de ${staticSystem(s.id).name}`);
  }
}

export function createGame({ scenario: scenarioId, player, seed = Date.now() }) {
  const sc = SCENARIO_BY_ID[scenarioId];
  if (!sc) throw new Error(`Unknown scenario ${scenarioId}`);
  const state = {
    version: 1,
    scenario: sc.id,
    startYear: sc.year,
    day: 0,
    seed: seed >>> 0,
    rng: seed >>> 0,
    player,
    systems: {},
    factions: {},
    stacks: {},
    rel: {},
    treaties: [],
    wars: [],
    truces: [],
    superweapons: [],
    tension: sc.tension,
    insurgency: sc.insurgency ? { ...sc.insurgency, against: [...sc.insurgency.against] } : null,
    senate: null,
    market: {},
    news: [],
    inbox: [],
    flags: {},
    names: {},
    history: [],
    nextId: 1,
    fx: [],
    gameOver: null,
  };

  // Factions.
  for (const entry of sc.factions) {
    const tpl = FACTIONS[entry.id];
    const f = blankFaction(state, {
      id: entry.id, name: tpl.name, short: tpl.short, color: tpl.color, emblem: tpl.emblem, gov: tpl.gov, agency: tpl.agency,
      style: entry.style || tpl.style, doctrine: tpl.doctrine, personality: { ...tpl.personality }, leader: entry.leader,
      capital: entry.capital, goal: entry.goal || null,
    });
    f.subsidy = entry.subsidy || 0;
    f.techs = withPrereqs([...TECHS.filter((t) => t.tier <= (entry.techLevel || 0)).map((t) => t.id), ...(entry.techs || [])]);
    recomputeMods(f);
    state.factions[f.id] = f;
    state.names[f.id] = { ...UNIT_NAMES.generic, ...UNIT_NAMES[f.style] };
  }
  const player0 = state.factions[player];
  if (!player0) throw new Error(`Unknown faction ${player}`);
  player0.isPlayer = true;

  // Systems.
  const assigned = {};
  for (const entry of sc.factions) for (const id of entry.systems || []) assigned[id] = entry.id;
  for (const stat of GALAXY.systems) {
    const destroyed = sc.destroyed.includes(stat.id);
    const owner = destroyed || sc.unowned.includes(stat.id) ? null : assigned[stat.id] || sc.default;
    const over = sc.overrides[stat.id] || {};
    state.systems[stat.id] = {
      id: stat.id, owner, controller: owner, pop: over.pop ?? stat.pop, dev: over.dev ?? stat.dev, res: { ...stat.res },
      stability: 50, sympathy: 0, buildings: [], build: [], garrison: 0, shield: 0, destroyed, acquired: -9999,
      battle: null, blockade: false, uprisingCd: 0, bdzCd: 0, occupied: null,
    };
    if (destroyed) Object.assign(state.systems[stat.id], { pop: 0, dev: 0, res: {} });
  }
  for (const f of Object.values(state.factions)) {
    const cap = state.systems[f.capital];
    if (cap) {
      cap.owner = f.id;
      cap.controller = f.id;
    }
  }
  for (const s of Object.values(state.systems)) {
    if (!s.owner) continue;
    s.buildings = startingBuildings(state, s, state.factions[s.owner]);
  }

  // Diplomacy.
  for (const [a, b, v] of sc.relations) setRelation(state, a, b, v);
  for (const [a, b] of sc.trades) addTreaty(state, 'trade', a, b);
  for (const [a, b] of sc.naps) addTreaty(state, 'nap', a, b);
  for (const [a, b] of sc.alliances) addTreaty(state, 'alliance', a, b);
  for (const [a, b] of sc.vassals) addTreaty(state, 'vassal', a, b);
  for (const t of state.treaties) setRelation(state, t.a, t.b, Math.max(relation(state, t.a, t.b), t.type === 'alliance' ? 60 : 20));
  for (const w of sc.wars) {
    state.wars.push({ id: newId(state, 'war'), name: w.name, att: [...w.attackers], def: [...w.defenders], start: 0, losses: { att: 0, def: 0 } });
    for (const a of w.attackers) for (const d of w.defenders) setRelation(state, a, d, -90);
  }
  // Vassals fight their overlord's wars.
  for (const [lord, vassal] of sc.vassals) {
    for (const w of state.wars) {
      if (w.att.includes(lord) && !w.att.includes(vassal)) w.att.push(vassal);
      if (w.def.includes(lord) && !w.def.includes(vassal)) w.def.push(vassal);
    }
  }
  if (state.insurgency) for (const o of state.insurgency.against) setRelation(state, state.insurgency.faction, o, -100);
  if (sc.senate) {
    state.senate = {
      name: sc.senate.name, presiding: sc.senate.presiding, members: sc.senate.members.filter((m) => state.factions[m]),
      dissolved: false, current: null, active: [], history: [], nextProposal: 40,
    };
  }
  for (const r of RES) state.market[r] = { price: RES_INFO[r].price, pressure: 0, history: [RES_INFO[r].price] };
  for (const [fid, mods] of Object.entries(sc.modifiers || {})) {
    for (const m of mods) state.factions[fid].modifiers.push({ ...m, until: m.days });
  }

  // Economy snapshot, treasury, stocks and garrisons.
  settleStability(state);
  refreshEconomy(state);
  for (const entry of sc.factions) {
    const f = state.factions[entry.id];
    const e = f.econ;
    f.treasury = Math.round((entry.treasury || 30) * Math.max(10, e.revenue));
    for (const r of RES) f.res[r] = Math.round(Math.max(RES_INFO[r].reserve, (e.prod[r] + e.use[r]) * 60));
    f.manpower = Math.round(100 + e.mp * 150);
    f.ip = 30;
  }
  for (const s of Object.values(state.systems)) {
    s.garrison = garrisonMax(state, s);
    s.shield = shieldMax(state, s);
  }

  // Forces, constructions and superweapons.
  for (const entry of sc.factions) startingForces(state, state.factions[entry.id], entry.army || 0);
  for (const c of sc.constructions) {
    const s = state.systems[c.sys];
    if (s.owner !== c.owner) continue;
    const total = 720;
    s.build.push({ b: c.building, days: Math.round(total * (1 - c.progress)), total, cost: {} });
  }
  for (const w of sc.superweapons) {
    const def = SW_TYPES[w.type];
    const sw = { id: newId(state, 'w'), type: w.type, name: def.name, owner: w.owner, stackId: null, sys: null, charge: w.charge ?? 0, plans: {}, fired: 0 };
    if (def.fixed) {
      sw.sys = w.sys;
      const s = state.systems[w.sys];
      s.buildings.push('shield', 'turbolaser', 'turbolaser', 'bunker');
      s.garrison = garrisonMax(state, s);
      s.shield = shieldMax(state, s);
    } else {
      const stack = createStack(state, w.owner, w.sys, [makeUnit(state, w.owner, 'battlestation', 50)], def.name);
      stack.station = true;
      sw.stackId = stack.id;
    }
    state.superweapons.push(sw);
  }
  settleStability(state);
  refreshEconomy(state);
  const totalGdp = Object.values(state.factions).reduce((acc, f) => acc + (f.econ?.gdp || 0), 0) || 1;
  for (const f of Object.values(state.factions)) f.startShare = (f.econ?.gdp || 0) / totalGdp;
  news(state, { text: `${sc.name} — ${player0.name}, sous la direction de ${player0.leader}, entre dans l’histoire.`, kind: 'info', faction: player, important: false });
  return state;
}

/** Difficulty rating (1 = easy, 5 = very hard) of every faction of a scenario, from a fresh state. */
export function difficultyStars(state) {
  const scores = aliveFactions(state).map((f) => {
    const power = Object.values(state.stacks).filter((st) => st.owner === f.id).reduce((acc, st) => acc + st.units.length, 0);
    return [f.id, (f.econ?.gdp || 0) + power * 3];
  });
  const max = Math.max(...scores.map(([, v]) => v));
  const out = {};
  for (const [id, v] of scores) {
    const ratio = v / max;
    out[id] = ratio > 0.5 ? 1 : ratio > 0.15 ? 2 : ratio > 0.05 ? 3 : ratio > 0.015 ? 4 : 5;
  }
  if (out.rebels && out.rebels < 4) out.rebels = 4;
  if (out.resistance && out.resistance < 4) out.resistance = 4;
  return out;
}
