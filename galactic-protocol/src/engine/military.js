// Stack orders (movement, split, merge, disband), garrisons, healing and attrition.
import { UNIT_TYPES } from '../data/units.js';
import { GALAXY, laneBetween, laneCost, shortestPath } from './galaxy.js';
import {
  atWar, canEnter, canTransit, fac, friendly, gov, hasGround, hasTreaty, isHidden, maxHp, reveal, stacksAt, staticSystem,
} from './query.js';
import { mod } from './research.js';
import { modSum } from './modifiers.js';
import { buildingFx } from './economy.js';
import { createStack, removeStack } from './stacks.js';
import { news } from './news.js';

export function garrisonMax(state, s) {
  if (s.destroyed || !s.controller) return 0;
  const owner = s.owner || s.controller;
  let hp = 60 + 40 * Math.sqrt(s.pop) + 25 * s.dev + buildingFx(s, 'garrison');
  hp *= 1 + mod(state, owner, 'garrison') + modSum(state, s.controller, 'garrison');
  if (s.controller !== s.owner) hp *= 0.4;
  return hp;
}

export function garrisonAttack(s) {
  return s.garrison / 12 + buildingFx(s, 'gatk');
}

// ---------------------------------------------------------------- movement

export function stackSpeed(state, stack, fromSys = stack.sys) {
  let speed = Infinity;
  for (const u of stack.units) speed = Math.min(speed, UNIT_TYPES[u.t].speed);
  if (!Number.isFinite(speed)) return 0;
  const f = fac(state, stack.owner);
  speed *= 1 + mod(state, stack.owner, 'speed');
  if (f.deficit.tib) speed *= 0.6;
  const from = state.systems[fromSys];
  if (from && from.controller && friendly(state, stack.owner, from.controller)) speed *= 1 + buildingFx(from, 'speed');
  return speed;
}

/** Estimated days to follow a path (list of ids including the start). */
export function travelDays(state, stack, path) {
  let days = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const lane = laneBetween(GALAXY, path[i], path[i + 1]);
    days += laneCost(lane) / Math.max(0.1, stackSpeed(state, stack, path[i]));
  }
  return Math.ceil(days);
}

export function planPath(state, stack, dest) {
  const from = stack.move ? stack.move.to : stack.sys;
  if (!canEnter(state, stack.owner, dest)) return null;
  return shortestPath(GALAXY, from, dest, (id) => (id === dest ? canEnter(state, stack.owner, id) : canTransit(state, stack.owner, id)));
}

export function orderMove(state, stackId, dest) {
  const stack = state.stacks[stackId];
  if (!stack) return { ok: false, msg: 'Groupe introuvable.' };
  if (!stackSpeed(state, stack)) return { ok: false, msg: 'Ce groupe ne peut pas se déplacer.' };
  if (!canEnter(state, stack.owner, dest)) return { ok: false, msg: 'Accès refusé : il faut être en guerre, allié ou disposer d’un droit de passage.' };
  const path = planPath(state, stack, dest);
  if (!path) return { ok: false, msg: 'Aucune route praticable.' };
  stack.path = path.slice(1);
  stack.dest = dest;
  if (!stack.move) startLeg(state, stack);
  return { ok: true, days: travelDays(state, stack, path) };
}

export function stopStack(state, stackId) {
  const stack = state.stacks[stackId];
  if (!stack) return;
  stack.path = [];
  stack.dest = null;
}

function startLeg(state, stack) {
  const next = stack.path[0];
  if (!next) {
    stack.dest = null;
    return;
  }
  const allowed = stack.path.length === 1 ? canEnter(state, stack.owner, next) : canTransit(state, stack.owner, next);
  if (!allowed) {
    stack.path = [];
    stack.dest = null;
    return;
  }
  stack.move = { from: stack.sys, to: next, progress: 0 };
  stack.path.shift();
}

/** Enemy units in a system pin a stack down; a garrison alone does not. */
function pinned(state, stack) {
  return stacksAt(state, stack.sys).some((o) => atWar(state, o.owner, stack.owner));
}

function arrive(state, stack) {
  stack.sys = stack.move.to;
  stack.move = null;
  if (!stack.path.length) stack.dest = null;
  if (isHidden(state, stack.owner, stack.sys)) {
    reveal(state, stack.owner, stack.sys);
    if (stack.owner === state.player || state.systems[stack.sys].owner === state.player) {
      news(state, { text: `${fac(state, stack.owner).name} découvre la base secrète de ${staticSystem(stack.sys).name} !`, kind: 'intel', sys: stack.sys, faction: stack.owner, important: true });
    }
  }
}

export function movementDay(state) {
  for (const stack of Object.values(state.stacks)) {
    if (!stack.move && stack.path.length) {
      if (pinned(state, stack) && !stack.retreating) continue;
      stack.retreating = false;
      startLeg(state, stack);
    }
    // A stack may chain several short lanes in one day.
    let budget = 1;
    for (let guard = 0; stack.move && budget > 0 && guard < 6; guard++) {
      const lane = laneBetween(GALAXY, stack.move.from, stack.move.to);
      const cost = laneCost(lane);
      const perDay = stackSpeed(state, stack, stack.move.from) / cost;
      const needed = (1 - stack.move.progress) / perDay;
      if (needed > budget) {
        stack.move.progress += perDay * budget;
        budget = 0;
      } else {
        budget -= needed;
        arrive(state, stack);
        if (stack.path.length && !pinned(state, stack)) startLeg(state, stack);
      }
    }
  }
}

// ---------------------------------------------------------------- organisation

export function splitStack(state, stackId, counts) {
  const stack = state.stacks[stackId];
  if (!stack || stack.move) return null;
  const moved = [];
  for (const [type, n] of Object.entries(counts)) {
    let left = n;
    for (let i = stack.units.length - 1; i >= 0 && left > 0; i--) {
      if (stack.units[i].t === type) {
        moved.push(stack.units.splice(i, 1)[0]);
        left--;
      }
    }
  }
  if (!moved.length) return null;
  const created = createStack(state, stack.owner, stack.sys, moved);
  if (!stack.units.length) removeStack(state, stack.id);
  return created;
}

export function mergeStacks(state, ids) {
  const stacks = ids.map((id) => state.stacks[id]).filter(Boolean);
  if (stacks.length < 2) return null;
  const [first, ...rest] = stacks;
  for (const other of rest) {
    if (other.owner !== first.owner || other.sys !== first.sys || other.move || first.move) continue;
    if (other.station || first.station) continue;
    first.units.push(...other.units);
    removeStack(state, other.id);
  }
  return first;
}

/** Merges all idle stacks of the owner in the stack's system into it. */
export function mergeAllHere(state, stackId) {
  const stack = state.stacks[stackId];
  if (!stack) return null;
  const ids = stacksAt(state, stack.sys).filter((o) => o.owner === stack.owner && !o.station && o.id !== stack.id).map((o) => o.id);
  return mergeStacks(state, [stack.id, ...ids]);
}

export function disbandUnits(state, stackId, type = null, count = Infinity) {
  const stack = state.stacks[stackId];
  if (!stack || stack.station) return;
  const f = fac(state, stack.owner);
  let left = count;
  for (let i = stack.units.length - 1; i >= 0 && left > 0; i--) {
    const u = stack.units[i];
    if (type && u.t !== type) continue;
    if (!gov(state, f.id).droids) f.manpower += UNIT_TYPES[u.t].mp * 0.5;
    stack.units.splice(i, 1);
    left--;
  }
  if (!stack.units.length) removeStack(state, stack.id);
}

export function renameStack(state, stackId, name) {
  const stack = state.stacks[stackId];
  if (stack && name.trim()) stack.name = name.trim().slice(0, 40);
}

/** Establishes an outpost on an unclaimed system with ground troops present. */
export function claimSystem(state, fid, sysId) {
  const s = state.systems[sysId];
  if (s.owner || s.destroyed) return { ok: false, msg: 'Ce système est déjà revendiqué.' };
  const here = stacksAt(state, sysId).some((st) => st.owner === fid && hasGround(st));
  if (!here) return { ok: false, msg: 'Des troupes au sol doivent être présentes.' };
  const f = fac(state, fid);
  if (f.treasury < 150) return { ok: false, msg: 'Il faut 150 crédits.' };
  f.treasury -= 150;
  s.owner = fid;
  s.controller = fid;
  s.acquired = state.day;
  s.revealed = [];
  s.garrison = garrisonMax(state, s);
  s.stability = 50;
  news(state, { text: `${f.name} établit un avant-poste sur ${staticSystem(sysId).name}.`, kind: 'claim', faction: fid, sys: sysId });
  return { ok: true };
}

// ---------------------------------------------------------------- upkeep of forces

export function healingDay(state) {
  for (const stack of Object.values(state.stacks)) {
    if (stack.move) continue;
    const s = state.systems[stack.sys];
    if (s.battle) continue;
    const f = fac(state, stack.owner);
    const ctrl = s.controller;
    const home = ctrl && (ctrl === stack.owner || friendly(state, stack.owner, ctrl) || hasTreaty(state, 'access', stack.owner, ctrl));
    let rate = 0;
    if (home) {
      rate = 0.02 + 0.03 * Math.min(1, buildingFx(s, 'repair')) + 0.02 * mod(state, stack.owner, 'heal');
      if (f.deficit.bacta) rate *= 0.5;
    } else if (ctrl && atWar(state, stack.owner, ctrl) && !mod(state, stack.owner, 'attrition')) {
      rate = -0.003;
    }
    if (!rate) continue;
    for (const u of stack.units) {
      const max = maxHp(state, stack.owner, u.t);
      u.hp = Math.min(max, Math.max(max * 0.3, u.hp + max * rate));
    }
  }
  for (const s of Object.values(state.systems)) {
    if (s.battle || !s.controller) continue;
    const max = garrisonMax(state, s);
    s.garrison = Math.min(max, s.garrison + max * 0.02);
    if (s.buildings.includes('shield') && s.controller === s.owner) {
      const smax = buildingFx(s, 'shield') * (1 + mod(state, s.owner, 'shield'));
      s.shield = Math.min(smax, s.shield + smax * 0.03);
    }
  }
}
