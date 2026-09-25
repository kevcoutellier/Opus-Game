// Technology research.
import { TECHS, TECH_BY_ID } from '../data/techs.js';
import { UNIT_TYPES } from '../data/units.js';
import { aliveFactions, fac } from './query.js';
import { news } from './news.js';

/** Recomputes the faction-wide modifiers granted by technologies. */
export function recomputeMods(faction) {
  const mods = { unlock: [] };
  for (const id of faction.techs) {
    const tech = TECH_BY_ID[id];
    if (!tech) continue;
    for (const [key, value] of Object.entries(tech.mods)) {
      if (key === 'unlock') mods.unlock.push(value);
      else mods[key] = (mods[key] || 0) + value;
    }
  }
  mods.maxHp = {};
  for (const [type, u] of Object.entries(UNIT_TYPES)) {
    mods.maxHp[type] = u.hp * (1 + (mods[`hp.${type}`] || 0) + (mods[`hp.${u.cat}`] || 0));
  }
  faction.mods = mods;
}

export const mod = (state, fid, key) => state.factions[fid]?.mods?.[key] || 0;
export const unlocked = (state, fid, what) => !!state.factions[fid]?.mods?.unlock?.includes(what);
export const hasTech = (state, fid, id) => state.factions[fid].techs.includes(id);

export function canResearch(state, fid, id) {
  const f = fac(state, fid);
  const tech = TECH_BY_ID[id];
  return !!tech && !f.techs.includes(id) && tech.req.every((r) => f.techs.includes(r));
}

/** Technologies already known by many factions are cheaper (diffusion). */
export function techCost(state, fid, id) {
  const tech = TECH_BY_ID[id];
  const others = aliveFactions(state).filter((f) => f.id !== fid && f.techs.includes(id)).length;
  return Math.round(tech.cost * (1 - Math.min(0.4, others * 0.06)));
}

export function giveTech(state, fid, id) {
  const f = fac(state, fid);
  if (f.techs.includes(id)) return;
  f.techs.push(id);
  recomputeMods(f);
  if (f.research.current === id) {
    f.research.current = null;
    f.research.progress = 0;
  }
  f.research.queue = f.research.queue.filter((q) => q !== id);
}

export function setResearch(state, fid, id) {
  const f = fac(state, fid);
  if (!canResearch(state, fid, id)) return false;
  if (f.research.current && f.research.current !== id) {
    // Switching keeps half the progress.
    f.research.progress = Math.floor(f.research.progress / 2);
  }
  f.research.current = id;
  f.research.queue = f.research.queue.filter((q) => q !== id);
  return true;
}

export function queueResearch(state, fid, id) {
  const f = fac(state, fid);
  if (f.techs.includes(id) || f.research.queue.includes(id) || f.research.current === id) return false;
  // Queue missing prerequisites first.
  for (const req of TECH_BY_ID[id].req) if (!f.techs.includes(req)) queueResearch(state, fid, req);
  f.research.queue.push(id);
  if (!f.research.current) startNext(state, fid);
  return true;
}

function startNext(state, fid) {
  const f = fac(state, fid);
  while (f.research.queue.length) {
    const next = f.research.queue.shift();
    if (canResearch(state, fid, next)) {
      f.research.current = next;
      return;
    }
  }
}

export function researchDay(state) {
  for (const f of aliveFactions(state)) {
    if (!f.research.current) startNext(state, f.id);
    if (!f.research.current) {
      f.research.bank = Math.min((f.research.bank || 0) + f.rpDay, 3000);
      continue;
    }
    f.research.progress += f.rpDay + Math.min(f.research.bank || 0, f.rpDay);
    f.research.bank = Math.max(0, (f.research.bank || 0) - f.rpDay);
    const id = f.research.current;
    if (f.research.progress >= techCost(state, f.id, id)) {
      f.research.progress = 0;
      giveTech(state, f.id, id);
      if (f.isPlayer) news(state, { text: `Recherche terminée : ${TECH_BY_ID[id].name}.`, kind: 'tech', faction: f.id, important: true });
      startNext(state, f.id);
    }
  }
}

export function availableTechs(state, fid) {
  return TECHS.filter((t) => canResearch(state, fid, t.id));
}
