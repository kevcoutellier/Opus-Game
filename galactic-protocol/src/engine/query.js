// Read-only helpers shared by the simulation, the AI and the interface.
import { GALAXY, hopsFrom } from './galaxy.js';
import { GOVERNMENTS, AGENCIES } from '../data/factions.js';
import { UNIT_TYPES, unitPower } from '../data/units.js';

export const DAYS_PER_YEAR = 360;
export const DAYS_PER_MONTH = 30;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const caches = new WeakMap();

/** Memoises a value for the current day (not saved with the game). */
export function dayCache(state, key, compute) {
  let bag = caches.get(state);
  if (!bag) caches.set(state, (bag = {}));
  const hit = bag[key];
  if (hit && hit.day === state.day) return hit.value;
  const value = compute();
  bag[key] = { day: state.day, value };
  return value;
}
export const sum = (list, fn = (x) => x) => list.reduce((acc, x) => acc + fn(x), 0);

export const fac = (state, id) => state.factions[id];
export const gov = (state, id) => GOVERNMENTS[state.factions[id].gov];
export const agency = (state, id) => AGENCIES[state.factions[id].agency];
export const aliveFactions = (state) => Object.values(state.factions).filter((f) => f.alive);

export function ownedSystems(state, fid) {
  return Object.values(state.systems).filter((s) => s.owner === fid);
}

export function controlledSystems(state, fid) {
  return Object.values(state.systems).filter((s) => s.controller === fid);
}

// ---------------------------------------------------------------- diplomacy

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function relation(state, a, b) {
  if (a === b) return 100;
  return state.rel[pairKey(a, b)] ?? 0;
}

export function setRelation(state, a, b, value) {
  if (a === b) return;
  state.rel[pairKey(a, b)] = clamp(Math.round(value * 10) / 10, -100, 100);
}

export function addRelation(state, a, b, delta) {
  setRelation(state, a, b, relation(state, a, b) + delta);
}

export function relationLabel(value) {
  if (value <= -60) return 'Hostile';
  if (value <= -20) return 'Froide';
  if (value < 20) return 'Neutre';
  if (value < 50) return 'Cordiale';
  if (value < 80) return 'Amicale';
  return 'Fraternelle';
}

export function hasTreaty(state, type, a, b) {
  return state.treaties.some((t) => t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
}

export function overlordOf(state, fid) {
  return state.treaties.find((t) => t.type === 'vassal' && t.b === fid)?.a ?? null;
}

export function vassalsOf(state, fid) {
  return state.treaties.filter((t) => t.type === 'vassal' && t.a === fid).map((t) => t.b);
}

/** Same side: alliance or vassal link. */
export function friendly(state, a, b) {
  if (a === b) return true;
  return hasTreaty(state, 'alliance', a, b) || hasTreaty(state, 'vassal', a, b);
}

export function alliesOf(state, fid) {
  return aliveFactions(state).map((f) => f.id).filter((id) => id !== fid && friendly(state, fid, id));
}

export function warBetween(state, a, b) {
  return state.wars.find((w) => (w.att.includes(a) && w.def.includes(b)) || (w.def.includes(a) && w.att.includes(b)));
}

export const atWar = (state, a, b) => a !== b && !!warBetween(state, a, b);

export function enemiesOf(state, fid) {
  const out = new Set();
  for (const w of state.wars) {
    if (w.att.includes(fid)) w.def.forEach((f) => out.add(f));
    if (w.def.includes(fid)) w.att.forEach((f) => out.add(f));
  }
  return [...out];
}

export function warsOf(state, fid) {
  return state.wars.filter((w) => w.att.includes(fid) || w.def.includes(fid));
}

export function inTruce(state, a, b) {
  return state.truces.some((t) => t.until > state.day && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
}

/** May faction `fid` move into this system? */
export function canEnter(state, fid, sysId) {
  const sys = state.systems[sysId];
  const ctrl = sys.controller;
  if (!ctrl || ctrl === fid) return true;
  if (friendly(state, fid, ctrl) || atWar(state, fid, ctrl)) return true;
  return hasTreaty(state, 'access', fid, ctrl);
}

/**
 * Secret bases: small worlds held by an insurgent movement stay invisible to its enemies until a
 * reconnaissance succeeds or a fleet stumbles upon them.
 */
export function isHidden(state, viewer, sysId) {
  const s = state.systems[sysId];
  if (!s.owner || s.owner === viewer || s.pop >= 0.5 || s.destroyed) return false;
  if (!GOVERNMENTS[state.factions[s.owner].gov].insurgent) return false;
  if (friendly(state, viewer, s.owner)) return false;
  if (s.revealed?.includes(viewer)) return false;
  return !(state.factions[viewer]?.intel?.[s.owner] > state.day);
}

export function reveal(state, viewer, sysId) {
  const s = state.systems[sysId];
  if (!s.revealed) s.revealed = [];
  if (!s.revealed.includes(viewer)) s.revealed.push(viewer);
}

/**
 * May faction `fid` fly through this system without stopping? Neutral territory can be crossed on the
 * hyperlanes (innocent passage) unless relations are hostile.
 */
export function canTransit(state, fid, sysId) {
  if (canEnter(state, fid, sysId)) return true;
  const ctrl = state.systems[sysId].controller;
  return relation(state, fid, ctrl) > -30;
}

// ---------------------------------------------------------------- stacks

export function stacksAt(state, sysId) {
  const out = [];
  for (const id in state.stacks) {
    const st = state.stacks[id];
    if (st.sys === sysId && !st.move) out.push(st);
  }
  return out;
}

export function stacksOf(state, fid) {
  return Object.values(state.stacks).filter((st) => st.owner === fid);
}

export function hostileStacksAt(state, fid, sysId) {
  return stacksAt(state, sysId).filter((st) => atWar(state, fid, st.owner));
}

export function maxHp(state, owner, type) {
  return state.factions[owner]?.mods?.maxHp?.[type] ?? UNIT_TYPES[type].hp;
}

export function stackPower(state, stack, cats = null) {
  let p = 0;
  for (const unit of stack.units) {
    if (cats && !cats.includes(UNIT_TYPES[unit.t].cat)) continue;
    p += unitPower(unit.t) * (unit.hp / maxHp(state, stack.owner, unit.t));
  }
  return p;
}

export function stackCounts(stack) {
  const counts = {};
  for (const unit of stack.units) counts[unit.t] = (counts[unit.t] || 0) + 1;
  return counts;
}

export const hasCat = (stack, cat) => stack.units.some((u) => UNIT_TYPES[u.t].cat === cat);
export const hasSpace = (stack) => stack.units.some((u) => UNIT_TYPES[u.t].cat !== 'ground');
export const hasGround = (stack) => stack.units.some((u) => UNIT_TYPES[u.t].cat === 'ground');

/** Military power of every faction (cached for the day). */
export function powerIndex(state) {
  return dayCache(state, 'power', () => {
    const out = {};
    for (const id in state.stacks) {
      const st = state.stacks[id];
      out[st.owner] = (out[st.owner] || 0) + stackPower(state, st);
    }
    return out;
  });
}

export function militaryPower(state, fid) {
  return powerIndex(state)[fid] || 0;
}

export function unitName(state, fid, type) {
  return state.names?.[fid]?.[type] ?? UNIT_TYPES[type].label;
}

// ---------------------------------------------------------------- misc

export function staticSystem(id) {
  return GALAXY.byId[id];
}

export function buildingCount(sys, id) {
  let n = 0;
  for (const b of sys.buildings) if (b === id) n++;
  return n;
}

/** Faction-wide count of a building in controlled systems. */
export function factionBuildingCount(state, fid, id) {
  let n = 0;
  for (const s of Object.values(state.systems)) if (s.controller === fid && s.owner === fid) n += buildingCount(s, id);
  return n;
}

export function neighbors(sysId) {
  return GALAXY.adj[sysId].map((e) => e.to);
}

/** Factions whose territory touches `fid`'s territory (hyperlane adjacency). */
export function neighborFactions(state, fid) {
  const out = new Set();
  for (const s of Object.values(state.systems)) {
    if (s.owner !== fid) continue;
    for (const n of neighbors(s.id)) {
      const o = state.systems[n].owner;
      if (o && o !== fid) out.add(o);
    }
  }
  return [...out];
}

/** Systems whose units and contents faction `fid` can see (fog of war on armies). */
export function visibleSystems(state, fid) {
  const vis = new Set();
  const f = state.factions[fid];
  const reach = 1 + (f?.mods?.vision || 0);
  const seeders = [];
  for (const s of Object.values(state.systems)) {
    if (s.controller && (s.controller === fid || friendly(state, fid, s.controller))) {
      seeders.push([s.id, reach + (s.buildings.includes('listening') ? 1 : 0)]);
    } else if (s.controller && f?.intel?.[s.controller] > state.day) vis.add(s.id);
  }
  for (const st of Object.values(state.stacks)) {
    if (st.owner === fid) seeders.push([st.move ? st.move.to : st.sys, 1]);
  }
  for (const [id, r] of seeders) {
    for (const seen of Object.keys(hopsFrom(GALAXY, id, r))) vis.add(seen);
  }
  return vis;
}

export function formatDate(state) {
  const year = state.startYear + Math.floor(state.day / DAYS_PER_YEAR);
  const inYear = state.day % DAYS_PER_YEAR;
  const month = Math.floor(inYear / DAYS_PER_MONTH) + 1;
  const day = (inYear % DAYS_PER_MONTH) + 1;
  return { year: yearLabel(year), month, day, label: `${day}/${month} · ${yearLabel(year)}` };
}

export function yearLabel(year) {
  return year <= 0 ? `${-year} BBY` : `${year} ABY`;
}
