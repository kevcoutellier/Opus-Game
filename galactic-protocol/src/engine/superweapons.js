// Galactic alert level (the DEFCON of the original game) and weapons of mass destruction:
// Base Delta Zero orbital bombardment, the Death Star superlaser and Starkiller Base.
import {
  addRelation, aliveFactions, atWar, clamp, fac, friendly, gov, militaryPower, stacksAt, staticSystem,
} from './query.js';
import { unlocked, mod } from './research.js';
import { addModifier, modSum } from './modifiers.js';
import { declareWar, isMajor } from './diplomacy.js';
import { obliterate } from './combat.js';
import { GALAXY } from './galaxy.js';
import { news, fx } from './news.js';

export const ALERT_LEVELS = {
  5: { name: 'PAIX FRAGILE', desc: 'La galaxie respire. Aucune arme de destruction massive ne peut être employée.' },
  4: { name: 'VIGILANCE', desc: 'Les états-majors sont en alerte.' },
  3: { name: 'MOBILISATION', desc: 'Bombardements orbitaux (Base Delta Zéro) autorisés.' },
  2: { name: 'GUERRE OUVERTE', desc: 'Les superlasers peuvent faire feu.' },
  1: { name: 'GUERRE TOTALE', desc: 'La galaxie est au bord de l’abîme.' },
};

export const SW_TYPES = {
  deathstar: { name: 'Étoile de la Mort', rate: 1 / 60, level: 2 },
  starkiller: { name: 'Base Starkiller', rate: 1 / 200, level: 2, fixed: true, multi: 2 },
};

export function alertLevel(state) {
  return clamp(5 - Math.floor(state.tension / 20), 1, 5);
}

export function swLocation(state, sw) {
  if (sw.sys) return sw.sys;
  const st = state.stacks[sw.stackId];
  return st && !st.move ? st.sys : null;
}

export function chargeRate(state, sw) {
  return SW_TYPES[sw.type].rate / Math.max(0.3, 1 + mod(state, sw.owner, 'superCharge'));
}

// ---------------------------------------------------------------- superlasers

export function fireBlocker(state, sw, targetSys) {
  const t = state.systems[targetSys];
  if (!t) return 'Cible invalide.';
  if (sw.charge < 1) return `Rechargement en cours (${Math.floor(sw.charge * 100)} %).`;
  if (alertLevel(state) > SW_TYPES[sw.type].level) return `Niveau d’alerte ${SW_TYPES[sw.type].level} requis (actuel : ${alertLevel(state)}).`;
  if (t.destroyed) return 'Ce système est déjà détruit.';
  const holder = t.controller || t.owner;
  // A "demonstration" on one of your own worlds is only possible when explicitly ordered.
  if (holder && (holder === sw.owner || friendly(state, sw.owner, holder)) && sw.target !== targetSys) return 'Cible alliée.';
  if (!SW_TYPES[sw.type].fixed) {
    const here = swLocation(state, sw);
    if (here !== targetSys) return 'La station doit être en orbite du système visé.';
  }
  return null;
}

export function fireSuperweapon(state, swId, targetSys) {
  const sw = state.superweapons.find((w) => w.id === swId);
  if (!sw) return { ok: false, msg: 'Superarme introuvable.' };
  const blocker = fireBlocker(state, sw, targetSys);
  if (blocker) return { ok: false, msg: blocker };
  const shooter = fac(state, sw.owner);
  const origin = swLocation(state, sw) || targetSys;
  const victims = [targetSys];
  if (SW_TYPES[sw.type].multi) {
    const t = state.systems[targetSys];
    const holder = t.owner;
    const target = GALAXY.byId[targetSys];
    const near = Object.values(state.systems)
      .filter((s) => s.id !== targetSys && !s.destroyed && s.owner && s.owner === holder)
      .map((s) => [s, Math.hypot(GALAXY.byId[s.id].x - target.x, GALAXY.byId[s.id].y - target.y)])
      .filter(([, d]) => d < 230).sort((a, b) => a[1] - b[1]).slice(0, SW_TYPES[sw.type].multi);
    for (const [s] of near) victims.push(s.id);
  }
  const hit = new Set();
  for (const id of victims) {
    const s = state.systems[id];
    const holder = s.controller || s.owner;
    if (holder && holder !== sw.owner && !friendly(state, sw.owner, holder) && !atWar(state, sw.owner, holder)) {
      declareWar(state, sw.owner, holder, { name: `Agression de ${shooter.short}`, penalties: true });
    }
    if (s.owner) hit.add(s.owner);
    if (s.controller) hit.add(s.controller);
    fx(state, { type: 'superlaser', from: origin, to: id, color: sw.type === 'starkiller' ? '#ff4b3a' : '#5dff7a' });
    obliterate(state, id, { spare: (st) => st.owner === sw.owner && st.station });
  }
  sw.charge = 0;
  sw.fired += 1;
  if (sw.target && victims.includes(sw.target)) sw.target = null;
  shooter.flags.firedSuperweapon = true;
  state.tension = Math.min(100, state.tension + 25);
  const names = victims.map((id) => staticSystem(id).name).join(', ');
  const banned = state.senate?.active?.some((r) => r.type === 'ban_superweapons');
  for (const o of aliveFactions(state)) {
    if (o.id === sw.owner) continue;
    const victimFriend = [...hit].some((v) => v === o.id || friendly(state, o.id, v));
    addRelation(state, o.id, sw.owner, victimFriend ? -60 : banned ? -55 : -35);
  }
  if (gov(state, sw.owner).authoritarian) addModifier(state, sw.owner, { id: 'fear', name: 'Terreur', days: 360, stability: 4, sympathy: 0.08 });
  else addModifier(state, sw.owner, { id: 'shame', name: 'Crime contre la galaxie', days: 720, stability: -15 });
  if (banned && state.senate && !state.senate.dissolved) {
    state.senate.active.push({ type: 'sanctions', target: sw.owner, until: state.day + 1080 });
  }
  for (const s of Object.values(state.systems)) {
    if (s.owner === sw.owner) s.sympathy = Math.min(100, (s.sympathy || 0) + 12);
  }
  news(state, { text: `${sw.name} de ${shooter.name} a fait feu : ${names} ${victims.length > 1 ? 'ont été anéantis' : 'a été anéanti'} !`, kind: 'superweapon', faction: sw.owner, sys: targetSys, important: true });
  return { ok: true, victims };
}

// ---------------------------------------------------------------- Base Delta Zero

export function bdzBlocker(state, stackId) {
  const stack = state.stacks[stackId];
  if (!stack || stack.move) return 'Le groupe doit être en orbite.';
  const s = state.systems[stack.sys];
  if (!unlocked(state, stack.owner, 'bdz')) return 'Technologie « Doctrine Base Delta Zéro » requise.';
  if (!stack.units.some((u) => ['capital', 'superdestroyer', 'battlestation'].includes(u.t))) return 'Un vaisseau capital est nécessaire.';
  if (alertLevel(state) > 3) return `Niveau d’alerte 3 requis (actuel : ${alertLevel(state)}).`;
  if (s.destroyed || !s.controller || !atWar(state, stack.owner, s.controller)) return 'La planète doit appartenir à un ennemi en guerre.';
  if (stacksAt(state, s.id).some((o) => atWar(state, o.owner, stack.owner) && o.units.some((u) => u.t !== 'infantry' && u.t !== 'armor' && u.t !== 'artillery'))) {
    return 'Il faut d’abord la supériorité spatiale.';
  }
  if ((s.bdzCd || 0) > state.day) return 'Planète déjà bombardée récemment.';
  return null;
}

export function orbitalBombardment(state, stackId) {
  const blocker = bdzBlocker(state, stackId);
  if (blocker) return { ok: false, msg: blocker };
  const stack = state.stacks[stackId];
  const s = state.systems[stack.sys];
  const victim = s.controller;
  s.pop = s.pop < 0.05 ? 0 : s.pop * 0.1;
  s.dev = Math.max(1, s.dev * 0.4);
  s.buildings = [];
  s.build = [];
  s.garrison = 0;
  s.shield = 0;
  s.stability = 5;
  s.sympathy = Math.min(100, (s.sympathy || 0) + 40);
  s.bdzCd = state.day + 360;
  state.tension = Math.min(100, state.tension + 12);
  for (const o of aliveFactions(state)) {
    if (o.id === stack.owner) continue;
    addRelation(state, o.id, stack.owner, o.id === victim ? -40 : -15);
  }
  if (!gov(state, stack.owner).authoritarian) addModifier(state, stack.owner, { id: 'bdz_shame', name: 'Bombardement de civils', days: 360, stability: -8 });
  addModifier(state, stack.owner, { id: 'bdz_outrage', name: 'Indignation galactique', days: 360, sympathy: 0.05 });
  fx(state, { type: 'bdz', sys: s.id });
  news(state, { text: `Base Delta Zéro : ${fac(state, stack.owner).name} réduit ${staticSystem(s.id).name} en cendres.`, kind: 'superweapon', faction: stack.owner, sys: s.id, important: true });
  return { ok: true };
}

// ---------------------------------------------------------------- daily

/** Level towards which the galactic tension drifts: wars weighted by the forces involved. */
export function tensionTarget(state) {
  const power = {};
  let total = 1;
  for (const f of aliveFactions(state)) {
    power[f.id] = militaryPower(state, f.id);
    total += power[f.id];
  }
  let target = 12;
  for (const w of state.wars) {
    const involved = [...w.att, ...w.def].reduce((acc, f) => acc + (power[f] || 0), 0);
    target += 5 + 18 * (involved / total);
    if (w.att.some((f) => isMajor(state, f)) && w.def.some((f) => isMajor(state, f))) target += 6;
  }
  target += state.superweapons.filter((w) => w.charge >= 1).length * 8;
  for (const f of aliveFactions(state)) target += modSum(state, f.id, 'mobilized') * 10;
  if (state.senate?.active?.some((r) => r.type === 'ban_superweapons')) target -= 15;
  return clamp(target, 0, 100);
}

export function superweaponsDay(state) {
  state.superweapons = state.superweapons.filter((sw) => sw.sys || state.stacks[sw.stackId]);
  for (const sw of state.superweapons) {
    const before = sw.charge;
    sw.charge = Math.min(1, sw.charge + chargeRate(state, sw));
    if (before < 1 && sw.charge >= 1 && sw.owner === state.player) {
      news(state, { text: `${sw.name} est chargée et prête à faire feu.`, kind: 'superweapon', faction: sw.owner, important: true });
    }
  }
  const before = alertLevel(state);
  state.tension = clamp(state.tension + (tensionTarget(state) - state.tension) * 0.002, 0, 100);
  const after = alertLevel(state);
  if (after !== before) {
    news(state, { text: `Niveau d’alerte galactique : ${after} — ${ALERT_LEVELS[after].name}.`, kind: 'alert', important: true });
  }
}
