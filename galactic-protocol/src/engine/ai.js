// AI of the computer-controlled factions. Every faction thinks on its own schedule (staggered days).
import { BUILDINGS } from '../data/buildings.js';
import { UNIT_TYPES, DOCTRINES } from '../data/units.js';
import { GALAXY, hopsFrom } from './galaxy.js';
import {
  aliveFactions, alliesOf, atWar, canTransit, enemiesOf, fac, friendly, gov, hasGround, isHidden,
  hasSpace, hasTreaty, militaryPower, neighborFactions, neighbors, overlordOf, relation, stackPower, stacksAt,
  stacksOf, warsOf,
} from './query.js';
import {
  buildingBlocker, marketPrice, productionLines, queueBuilding, recruit, recruitBlocker, systemOutput, systemValue,
  unitCost, lineOf,
} from './economy.js';
import { orderMove, mergeStacks, disbandUnits } from './military.js';
import {
  declareIndependence, declareWar, improveRelations, occupiedBy, proposePeace, proposeTreaty, scoreFor, warBlocker,
} from './diplomacy.js';
import { launchOp, opBlocker } from './espionage.js';
import { decisionBlocker, fundInsurrection, insurrectionBlocker, insurrectionCost, takeDecision } from './politics.js';
import { availableTechs, setResearch, techCost } from './research.js';
import { alertLevel, bdzBlocker, fireBlocker, fireSuperweapon, orbitalBombardment, swLocation } from './superweapons.js';
import { hasModifier } from './modifiers.js';
import { chance, jitter, pick, weighted } from './rng.js';

function offset(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h;
}

const revenue = (f) => Math.max(1, f.econ?.revenue || 1);

export function aiDay(state) {
  for (const f of aliveFactions(state)) {
    if (f.isPlayer) continue;
    const d = state.day + offset(f.id);
    if (d % 2 === 0) aiMilitary(state, f);
    if (d % 10 === 0) {
      aiInsurrection(state, f);
      aiEconomy(state, f);
      aiRecruit(state, f);
      aiBuild(state, f);
    }
    if (d % 15 === 0) aiDiplomacy(state, f, d % 30 === 0);
    if (d % 20 === 0) aiEspionage(state, f);
    if (d % 5 === 0) aiSuperweapons(state, f);
    if (d % 30 === 0) aiDecisions(state, f);
    if (!f.research.current) aiResearch(state, f);
  }
}

// ---------------------------------------------------------------- economy

function aiEconomy(state, f) {
  const e = f.econ;
  if (!e) return;
  if (f.stability < 35 && f.taxRate > 12) f.taxRate -= 2;
  else if (f.stability > 60 && e.net < 0 && f.taxRate < 40) f.taxRate += 2;
  else if (f.stability > 70 && f.taxRate < 30) f.taxRate += 1;
  const war = warsOf(state, f.id).length > 0;
  const b = f.budget;
  b.research = 14;
  b.intel = 8;
  b.social = f.stability < 40 ? 18 : f.stability < 55 ? 12 : 8;
  b.infra = war ? 4 : 12;
  if (e.net < 0 && f.treasury < 20 * revenue(f)) {
    b.research = 8;
    b.intel = 5;
    b.infra = 2;
  }
  if (f.treasury > 150 * revenue(f)) {
    // Rich: invest in research and development.
    b.research = 24;
    b.infra = war ? 10 : 22;
  }
  if (f.treasury < -10 * revenue(f)) {
    b.research = 3;
    b.intel = 2;
    b.infra = 0;
    b.social = Math.min(b.social, 8);
  }
}

function aiRecruit(state, f) {
  const e = f.econ;
  if (!e) return;
  const rev = revenue(f);
  // Bankruptcy: disband the cheapest units until the budget balances again.
  if (e.net < 0 && f.treasury < -5 * rev) {
    let toCut = -e.net;
    const stacks = stacksOf(state, f.id).filter((st) => !st.station && !st.move);
    for (const st of stacks) {
      if (toCut <= 0) break;
      const units = [...st.units].sort((a, b) => UNIT_TYPES[a.t].upkeep - UNIT_TYPES[b.t].upkeep);
      for (const u of units) {
        if (toCut <= 0) break;
        toCut -= UNIT_TYPES[u.t].upkeep;
        disbandUnits(state, st.id, u.t, 1);
      }
    }
    return;
  }
  const enemies = enemiesOf(state, f.id);
  const target = (enemies.length ? 0.5 : 0.26) + f.personality.aggression * 0.08;
  // Hoarded credits (spice sales, reserves) finance extra forces.
  const hoard = f.treasury > 80 * rev ? (f.treasury - 80 * rev) / 300 : 0;
  const share = e.unitUpkeep / (rev + hoard + Math.max(0, e.market));
  if (share >= target || f.treasury < 60) return;
  const owned = Object.values(state.systems).filter((s) => s.owner === f.id && s.controller === f.id);
  if (f.production.length > 6 + owned.length / 3) return;
  let budget = Math.min(f.treasury * 0.5, (target - share) * rev * 250);
  const weights = { ...(DOCTRINES[f.doctrine] || DOCTRINES.balanced) };
  const stacks = stacksOf(state, f.id);
  const groundPower = stacks.reduce((acc, st) => acc + stackPower(state, st, ['ground']), 0);
  const total = stacks.reduce((acc, st) => acc + stackPower(state, st), 0) + 1;
  if (groundPower / total < 0.3) {
    weights.infantry *= 2;
    weights.armor *= 2;
  }
  if (f.mods.unlock.includes('superdestroyer') && f.treasury > 12000) weights.superdestroyer = 0.4;
  const sites = owned.filter((s) => !s.battle).map((s) => [s, productionLines(state, s)]);
  for (let i = 0; i < 10 && budget > 40; i++) {
    const type = weighted(state, weights);
    if (!type) break;
    const line = lineOf(type);
    const options = sites.filter(([s, lines]) => lines[line] > 0 && !recruitBlocker(state, f.id, s.id, type));
    if (!options.length) {
      weights[type] = 0;
      continue;
    }
    const load = (s) => f.production.filter((p) => p.sys === s.id && lineOf(p.t) === line).length;
    options.sort((a, b) => load(a[0]) - load(b[0]));
    const res = recruit(state, f.id, options[0][0].id, type);
    if (!res.ok) {
      weights[type] = 0;
      continue;
    }
    budget -= unitCost(state, f.id, type).cr || 0;
  }
}

function buildingScore(state, f, s, id, ctx) {
  const b = BUILDINGS[id];
  const cost = Math.max(50, b.cost.cr || 0);
  const out = systemOutput(state, s);
  const count = (bid) => ctx.counts[bid] || 0;
  switch (id) {
    case 'industry': return (out * 0.2 * 180) / cost;
    case 'spaceport': return (out * 0.12 * 180) / cost;
    case 'bank': return (out * (f.taxRate / 100) * 0.12 * 180) / cost;
    case 'dura_mine': case 'tib_refinery': case 'kyber_mine': case 'bacta_farm': case 'spice_refinery': {
      const r = b.deposit;
      return ((s.res[r] || 0) * 0.8 * marketPrice(state, r) * 180) / cost * (f.deficit[r] ? 3 : 1);
    }
    case 'shipyard': return count('shipyard') < 1 + ctx.owned / 12 && s.dev >= 4 ? 2.5 : 0;
    case 'barracks': return count('barracks') < 1 + ctx.owned / 10 ? 1.8 : 0;
    case 'fighter_base': return count('fighter_base') < 1 + ctx.owned / 14 ? 1.1 : 0;
    case 'lab': return 0.7;
    case 'university': return s.dev >= 6 ? 0.9 : 0;
    case 'intel_center': return count('intel_center') < 1 + ctx.owned / 20 ? 1 : 0;
    case 'counter_center': return (f.flags.caughtSpies || -999) > state.day - 180 ? 1 : 0.15;
    case 'holonet': case 'medical': case 'culture': return s.stability < 40 ? 1.6 : 0.1;
    case 'shield': return (f.capital === s.id || (ctx.war && ctx.border.has(s.id))) && !s.buildings.includes('shield') ? 1.4 : 0;
    case 'turbolaser': case 'bunker': return ctx.war && ctx.border.has(s.id) ? 1 : 0.05;
    case 'ion_cannon': return f.capital === s.id && ctx.war ? 1.2 : 0.05;
    case 'superweapon_yard': return f.personality.ruthless >= 0.7 && f.treasury > 25000 ? 6 : 0;
    case 'arcology': return 0.35;
    case 'academy': return 0.2;
    default: return 0.1;
  }
}

function aiBuild(state, f) {
  const rev = revenue(f);
  if (f.treasury < 20 * rev + 300) return;
  const owned = Object.values(state.systems).filter((s) => s.owner === f.id && s.controller === f.id && !s.destroyed);
  const concurrent = owned.reduce((acc, s) => acc + s.build.length, 0);
  const rich = Math.floor(f.treasury / (100 * rev + 2000));
  if (concurrent >= 1 + Math.floor(owned.length / 6) + Math.min(4, rich)) return;
  const counts = {};
  for (const s of owned) for (const b of [...s.buildings, ...s.build.map((q) => q.b)]) counts[b] = (counts[b] || 0) + 1;
  const border = new Set(owned.filter((s) => neighbors(s.id).some((n) => state.systems[n].owner && state.systems[n].owner !== f.id)).map((s) => s.id));
  const ctx = { counts, owned: owned.length, border, war: enemiesOf(state, f.id).length > 0 };
  let best = null;
  let bestScore = 0.3;
  for (const s of owned) {
    if (s.battle) continue;
    for (const id of Object.keys(BUILDINGS)) {
      if (buildingBlocker(state, f.id, s.id, id)) continue;
      const score = buildingScore(state, f, s, id, ctx) * jitter(state, 0.2);
      if (score > bestScore) {
        bestScore = score;
        best = [s.id, id];
      }
    }
  }
  if (best) queueBuilding(state, f.id, best[0], best[1]);
}

const BRANCH_TASTE = {
  imperial: { fleet: 1.4, army: 1.3, super: 1.2 },
  rebel: { fleet: 1.4, intel: 1.3, log: 1.2 },
  criminal: { eco: 1.4, intel: 1.4 },
  defensive: { super: 1.3, soc: 1.2, eco: 1.2 },
  balanced: {},
};

function aiResearch(state, f) {
  const options = availableTechs(state, f.id);
  if (!options.length) return;
  const taste = BRANCH_TASTE[f.doctrine] || {};
  let best = null;
  let bestScore = -Infinity;
  for (const t of options) {
    const score = (taste[t.branch] || 1) / techCost(state, f.id, t.id) * jitter(state, 0.3);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best) setResearch(state, f.id, best.id);
}

function aiDecisions(state, f) {
  const g = gov(state, f.id);
  const war = enemiesOf(state, f.id).length > 0;
  const tryTake = (id) => !decisionBlocker(state, f.id, id) && takeDecision(state, f.id, id).ok;
  if (f.stability < 28 && g.authoritarian && tryTake('martial_law')) return;
  if (f.stability < 45 && tryTake('propaganda')) return;
  if (f.treasury < -10 * revenue(f) && (tryTake('loan') || tryTake('austerity'))) return;
  if (war && f.manpower < 40 && tryTake('conscription')) return;
  if (war && f.personality.aggression > 0.5 && f.treasury > 30 * revenue(f) && tryTake('war_economy')) return;
  const sympathy = Object.values(state.systems).filter((s) => s.owner === f.id && s.sympathy > 50).length;
  if (sympathy > 3 && !g.authoritarian) tryTake('amnesty');
}

// ---------------------------------------------------------------- diplomacy

function aiDiplomacy(state, f, monthly) {
  const myPower = militaryPower(state, f.id) + 1;
  // Peace.
  for (const war of warsOf(state, f.id)) {
    const leader = war.att.includes(f.id) ? war.def[0] : war.att[0];
    if (!leader || !state.factions[leader]?.alive) continue;
    const score = scoreFor(state, war, f.id);
    const age = state.day - war.start;
    const key = `aipeace:${leader}`;
    if ((f.cooldowns[key] || 0) > state.day) continue;
    let terms = null;
    if (score > 40 && age > 200 && occupiedBy(state, f.id, leader).length) terms = 'demand';
    else if (score < -50 && occupiedBy(state, leader, f.id).length) terms = 'concede';
    else if (score < -25 || f.warWeariness > 55 || (f.flags.seekPeace || 0) > state.day) terms = 'white';
    if (!terms) continue;
    f.cooldowns[key] = state.day + (fac(state, leader).isPlayer ? 90 : 30);
    proposePeace(state, f.id, leader, terms);
  }
  // Independence of vassals.
  const lord = overlordOf(state, f.id);
  if (lord && (relation(state, f.id, lord) < -30 || (enemiesOf(state, lord).length && militaryPower(state, lord) < myPower * 1.2)) && chance(state, 0.3)) {
    declareIndependence(state, f.id);
    return;
  }
  const others = aliveFactions(state).filter((o) => o.id !== f.id);
  const neigh = new Set(neighborFactions(state, f.id));
  for (const o of others) {
    const rel = relation(state, f.id, o.id);
    const key = `aitreaty:${o.id}`;
    if ((f.cooldowns[key] || 0) > state.day || atWar(state, f.id, o.id)) continue;
    const theirPower = militaryPower(state, o.id) + 1;
    let type = null;
    if (rel >= 25 && !hasTreaty(state, 'trade', f.id, o.id) && f.personality.trade > 0.3) type = 'trade';
    else if (neigh.has(o.id) && theirPower > myPower * 1.3 && rel > -15 && rel < 40 && !hasTreaty(state, 'nap', f.id, o.id)) type = 'nap';
    else if (rel >= 45 && !friendly(state, f.id, o.id) && enemiesOf(state, f.id).some((e) => enemiesOf(state, o.id).includes(e))) type = 'alliance';
    if (type) {
      f.cooldowns[key] = state.day + (o.isPlayer ? 240 : 90);
      proposeTreaty(state, f.id, o.id, type);
    } else if (neigh.has(o.id) && rel < 0 && theirPower > myPower && f.personality.diplomacy > 0.4 && f.treasury > 200) {
      improveRelations(state, f.id, o.id);
    }
  }
  if (monthly) aiWarDeclaration(state, f, myPower, neigh);
}

function aiWarDeclaration(state, f, myPower, neigh) {
  if (state.day < 90) return;
  const aggression = f.personality.aggression;
  const enemies = enemiesOf(state, f.id);
  if (enemies.length > 1 || (enemies.length === 1 && aggression < 0.7) || aggression < 0.2) return;
  if (f.stability < 35 || f.warWeariness > 30) return;
  if ((f.flags.lastPeace || -999) > state.day - 360) return;
  const alliesPower = alliesOf(state, f.id).reduce((acc, a) => acc + militaryPower(state, a) * 0.5, 0);
  let best = null;
  let bestScore = 0;
  for (const tid of neigh) {
    if (warBlocker(state, f.id, tid)) continue;
    if (relation(state, f.id, tid) > (aggression > 0.7 ? -20 : -35)) continue;
    const theirs = militaryPower(state, tid) + alliesOf(state, tid).reduce((acc, a) => acc + militaryPower(state, a) * 0.7, 0) + 5;
    const ratio = (myPower + alliesPower) / theirs;
    if (ratio < 2.2 - aggression * 0.6) continue;
    const value = Object.values(state.systems).filter((s) => s.owner === tid).reduce((acc, s) => acc + systemValue(state, s), 0);
    const score = ratio * value;
    if (score > bestScore) {
      bestScore = score;
      best = tid;
    }
  }
  if (best && chance(state, aggression * 0.25)) declareWar(state, f.id, best);
}

/** Insurgent movements arm the cells of sympathetic enemy worlds. */
function aiInsurrection(state, f) {
  if (!gov(state, f.id).insurgent) return;
  const options = Object.values(state.systems)
    .filter((s) => !insurrectionBlocker(state, f.id, s.id))
    .map((s) => [s, (s.sympathy + systemValue(state, s) * 0.2) / (s.garrison + 50)])
    .sort((a, b) => b[1] - a[1]);
  if (options.length && f.treasury > insurrectionCost(state, options[0][0].id) * 2.5) fundInsurrection(state, f.id, options[0][0].id);
}

// ---------------------------------------------------------------- military

function garrisonPower(s) {
  return s.garrison / 3.5 + s.shield / 5;
}

function aiMilitary(state, f) {
  // Merge idle stacks sharing a system.
  const bySys = {};
  for (const st of stacksOf(state, f.id)) {
    if (st.move || st.path.length || st.station) continue;
    (bySys[st.sys] ||= []).push(st.id);
  }
  for (const ids of Object.values(bySys)) if (ids.length > 1) mergeStacks(state, ids);

  const enemies = enemiesOf(state, f.id).filter((e) => state.factions[e]?.alive);
  const idle = stacksOf(state, f.id).filter((st) => !st.move && !st.path.length && !st.station);
  if (!idle.length) return;
  if (!enemies.length) {
    // Peacetime: bring stacks back home.
    for (const st of idle) {
      const s = state.systems[st.sys];
      if (s.controller === f.id || (s.controller && friendly(state, f.id, s.controller))) continue;
      const hops = hopsFrom(GALAXY, st.sys, 12, (id) => canTransit(state, f.id, id));
      const home = Object.entries(hops).filter(([id]) => state.systems[id].controller === f.id).sort((a, b) => a[1] - b[1])[0];
      if (home) orderMove(state, st.id, home[0]);
    }
    return;
  }
  const threat = {};
  for (const st of Object.values(state.stacks)) {
    if (!enemies.includes(st.owner)) continue;
    const where = st.move ? st.move.to : st.sys;
    threat[where] = (threat[where] || 0) + stackPower(state, st);
  }
  const capital = f.capital;
  const capitalHops = capital ? hopsFrom(GALAXY, capital, 3) : {};
  const capitalThreat = Object.keys(capitalHops).reduce((acc, id) => acc + (threat[id] || 0), 0);
  const assigned = {};
  idle.sort((a, b) => stackPower(state, b) - stackPower(state, a));
  for (const st of idle) {
    const p = stackPower(state, st);
    if (p < 4) continue;
    const pGround = stackPower(state, st, ['ground']) + stackPower(state, st, ['air']) * 0.3;
    const withGround = hasGround(st);
    const withSpace = hasSpace(st);
    // Keep a guard at the capital when the enemy is close.
    if (st.sys === capital && capitalThreat > 0 && stacksAt(state, capital).filter((o) => o.owner === f.id).length <= 1) continue;
    const s0 = state.systems[st.sys];
    if (s0.battle && (s0.controller === f.id || !withGround)) continue;
    const hops = hopsFrom(GALAXY, st.sys, 7, (id) => canTransit(state, f.id, id));
    let best = null;
    let bestScore = 0;
    for (const [id, h] of Object.entries(hops)) {
      const s = state.systems[id];
      if (isHidden(state, f.id, id)) continue;
      const enemyHere = threat[id] || 0;
      const already = assigned[id] || 0;
      let score = 0;
      if (s.controller && enemies.includes(s.controller)) {
        const def = enemyHere + garrisonPower(s);
        if (withGround && pGround + already > def * 1.3 && (!enemyHere || p > enemyHere * 1.3)) {
          const capitalBonus = state.factions[s.controller]?.capital === id ? 2.5 : 1;
          const liberation = s.owner === f.id || (s.owner && friendly(state, f.id, s.owner)) ? 2 : 1;
          score = (systemValue(state, s) + 10) * capitalBonus * liberation / (1 + h);
        } else if (withSpace && enemyHere > 0 && p > enemyHere * 1.3) {
          score = (enemyHere + 15) / (1 + h);
        }
      } else if (s.controller && (s.controller === f.id || friendly(state, f.id, s.controller))) {
        if (enemyHere > 0 && p + already > enemyHere * 0.9) score = (systemValue(state, s) + enemyHere) * 1.5 / (1 + h);
      } else if (enemyHere > 0 && withSpace && p > enemyHere * 1.3) {
        score = enemyHere / (1 + h);
      }
      if (already > p * 2) score *= 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (best && best !== st.sys) {
      if (orderMove(state, st.id, best).ok) assigned[best] = (assigned[best] || 0) + p;
    } else if (best === st.sys) assigned[best] = (assigned[best] || 0) + p;
  }
}

// ---------------------------------------------------------------- espionage and superweapons

function aiEspionage(state, f) {
  const enemies = enemiesOf(state, f.id).filter((e) => state.factions[e]?.alive);
  const tryOp = (op, target) => !opBlocker(state, f.id, op, target) && launchOp(state, f.id, op, target).ok;
  for (const sw of state.superweapons) {
    if (enemies.includes(sw.owner) && !sw.plans[f.id] && tryOp('steal_plans', sw.owner)) return;
  }
  if ((f.flags.caughtSpies || -999) > state.day - 60 && f.counterUntil < state.day && tryOp('counter', f.id)) return;
  if (enemies.length) {
    const target = pick(state, enemies);
    const ops = ['sabotage', 'destabilize', 'recon'];
    if (gov(state, f.id).insurgent) ops.push('incite', 'incite');
    if (f.personality.ruthless > 0.6 && chance(state, 0.15)) ops.push('assassinate');
    tryOp(pick(state, ops), target);
    return;
  }
  const rivals = aliveFactions(state).filter((o) => o.id !== f.id && relation(state, f.id, o.id) < -20);
  if (rivals.length && chance(state, 0.5)) {
    const target = pick(state, rivals);
    tryOp(target.techs.length > f.techs.length ? 'steal_tech' : 'destabilize', target.id);
  } else if (f.stability < 45) tryOp('propaganda', f.id);
}

function aiSuperweapons(state, f) {
  const ruthless = f.personality.ruthless;
  const enemies = enemiesOf(state, f.id).filter((e) => state.factions[e]?.alive);
  for (const sw of state.superweapons.filter((w) => w.owner === f.id)) {
    if (sw.charge < 1 || ruthless < 0.6) continue;
    if (alertLevel(state) > 2) {
      if ((enemies.length || sw.target) && !hasModifier(state, f.id, 'mobilization') && !decisionBlocker(state, f.id, 'mobilization')) {
        takeDecision(state, f.id, 'mobilization');
      }
      continue;
    }
    let target = sw.target && !state.systems[sw.target]?.destroyed ? sw.target : null;
    if (!target) {
      const candidates = Object.values(state.systems).filter((s) => !s.destroyed && s.controller && enemies.includes(s.controller) && !isHidden(state, f.id, s.id));
      candidates.sort((a, b) => (systemValue(state, b) + (state.factions[b.controller]?.capital === b.id ? 200 : 0))
        - (systemValue(state, a) + (state.factions[a.controller]?.capital === a.id ? 200 : 0)));
      target = candidates[0]?.id;
    }
    if (!target) continue;
    if (sw.sys) {
      if (!fireBlocker(state, sw, target)) fireSuperweapon(state, sw.id, target);
      continue;
    }
    const stack = state.stacks[sw.stackId];
    if (!stack || stack.move || stack.path.length) continue;
    if (swLocation(state, sw) === target) {
      if (!fireBlocker(state, sw, target)) fireSuperweapon(state, sw.id, target);
      if (sw.target === target) sw.target = null;
    } else orderMove(state, stack.id, target);
  }
  // Base Delta Zero against fortified worlds.
  if (ruthless >= 0.8 && enemies.length) {
    for (const st of stacksOf(state, f.id)) {
      const s = state.systems[st.sys];
      if (st.move || !s.controller || !enemies.includes(s.controller)) continue;
      if (garrisonPower(s) < 150 || bdzBlocker(state, st.id)) continue;
      if (chance(state, 0.12)) orbitalBombardment(state, st.id);
    }
  }
}

