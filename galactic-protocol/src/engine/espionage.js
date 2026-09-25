// Espionage: intelligence points, agents and covert operations.
import { OPS } from '../data/ops.js';
import { BUILDINGS } from '../data/buildings.js';
import { LEADER_POOL } from '../data/factions.js';
import { TECH_BY_ID } from '../data/techs.js';
import {
  addRelation, agency, aliveFactions, clamp, fac, factionBuildingCount, gov, isHidden, reveal, staticSystem,
} from './query.js';
import { canResearch, giveTech, mod } from './research.js';
import { addModifier } from './modifiers.js';
import { spawnUprising } from './politics.js';
import { chance, pick } from './rng.js';
import { newId } from './stacks.js';
import { news } from './news.js';

export function maxAgents(state, fid) {
  return 1 + (agency(state, fid).agents || 0) + factionBuildingCount(state, fid, 'intel_center') + mod(state, fid, 'agents');
}

export function counterIntel(state, fid) {
  const f = fac(state, fid);
  return 10 + (agency(state, fid).counter || 0) + mod(state, fid, 'counter')
    + factionBuildingCount(state, fid, 'counter_center') * 10 + factionBuildingCount(state, fid, 'holonet') * 2
    + (f.counterUntil > state.day ? 30 : 0);
}

export function opCost(state, fid, opId) {
  const op = OPS[opId];
  const mult = Math.max(0.4, 1 + (agency(state, fid).cost || 0) + mod(state, fid, 'opCost'));
  return { ip: Math.round(op.ip * mult), cr: Math.round(op.cr * mult) };
}

export function opChance(state, fid, opId, target) {
  const op = OPS[opId];
  if (op.target === 'self') return 100;
  const bonus = (agency(state, fid).bonus?.[opId] || 0) + mod(state, fid, 'opSuccess');
  const defense = target ? counterIntel(state, target) - 10 : 0;
  // Insurgent cells are compartmentalised: hard to locate.
  const cells = opId === 'recon' && target && gov(state, target).insurgent ? 35 : 0;
  return Math.round(clamp(op.base + bonus - defense * 0.6 - cells, 5, 95));
}

export function freeAgents(state, fid) {
  return maxAgents(state, fid) - fac(state, fid).agents.length;
}

/** Valid targets of an operation for a faction. */
export function opTargets(state, fid, opId) {
  const op = OPS[opId];
  const others = aliveFactions(state).filter((f) => f.id !== fid);
  switch (op.target) {
    case 'self':
      return [fid];
    case 'superweapon':
      return state.superweapons.filter((w) => w.owner !== fid && !w.plans[fid]).map((w) => w.owner).filter((v, i, a) => a.indexOf(v) === i);
    case 'democracy':
      return others.filter((f) => gov(state, f.id).elections).map((f) => f.id);
    case 'senate':
      return state.senate && !state.senate.dissolved && state.senate.current ? [state.senate.presiding] : [];
    default:
      return others.map((f) => f.id);
  }
}

export function opBlocker(state, fid, opId, target) {
  const op = OPS[opId];
  const f = fac(state, fid);
  const cost = opCost(state, fid, opId);
  if (op.target !== 'self' && freeAgents(state, fid) <= 0) return 'Aucun agent disponible.';
  if (f.ip < cost.ip) return `Il faut ${cost.ip} points de renseignement.`;
  if (f.treasury < cost.cr) return 'Trésorerie insuffisante.';
  if (!opTargets(state, fid, opId).includes(target)) return 'Cible invalide.';
  if (f.agents.some((a) => a.op === opId && a.target === target)) return 'Opération déjà en cours.';
  if (opId === 'bribe' && !state.senate?.current) return 'Aucune résolution en cours au Sénat.';
  return null;
}

export function launchOp(state, fid, opId, target, extra = {}) {
  const blocker = opBlocker(state, fid, opId, target);
  if (blocker) return { ok: false, msg: blocker };
  const f = fac(state, fid);
  const op = OPS[opId];
  const cost = opCost(state, fid, opId);
  f.ip -= cost.ip;
  f.treasury -= cost.cr;
  if (op.target === 'self') {
    resolveOp(state, fid, { op: opId, target }, true);
    return { ok: true, done: true };
  }
  f.agents.push({ id: newId(state, 'a'), op: opId, target, days: op.days, ...extra });
  return { ok: true };
}

export function espionageDay(state) {
  for (const f of aliveFactions(state)) {
    if (!f.agents.length) continue;
    const keep = [];
    for (const agent of f.agents) {
      agent.days -= 1;
      if (agent.days > 0 && state.factions[agent.target]?.alive) {
        keep.push(agent);
        continue;
      }
      if (!state.factions[agent.target]?.alive) continue;
      const success = chance(state, opChance(state, f.id, agent.op, agent.target) / 100);
      resolveOp(state, f.id, agent, success);
    }
    f.agents = keep;
  }
}

function report(state, fid, text, important = true) {
  if (fid === state.player) news(state, { text, kind: 'intel', faction: fid, important, visibleTo: [fid] });
}

function resolveOp(state, fid, agent, success) {
  const f = fac(state, fid);
  const t = fac(state, agent.target);
  const op = OPS[agent.op];
  if (!success) {
    const caught = chance(state, agent.op === 'assassinate' ? 0.8 : 0.55);
    report(state, fid, `Échec de l’opération « ${op.name} » contre ${t.name}${caught ? ' : notre agent a été capturé.' : '.'}`);
    if (caught) {
      addRelation(state, fid, t.id, agent.op === 'assassinate' ? -45 : -22);
      state.tension = Math.min(100, state.tension + (agent.op === 'assassinate' ? 6 : 2));
      t.flags.caughtSpies = state.day;
      news(state, { text: `${t.name} démantèle un réseau d’espions de ${f.name} : incident diplomatique !`, kind: 'intel', faction: t.id, important: t.id === state.player });
    }
    return;
  }
  switch (agent.op) {
    case 'recon': {
      f.intel[t.id] = state.day + 180;
      const bases = Object.values(state.systems).filter((s) => s.owner === t.id && isHidden(state, fid, s.id));
      for (const s of bases) reveal(state, fid, s.id);
      report(state, fid, `Reconnaissance réussie : les forces de ${t.name} sont révélées pour 180 jours.${bases.length ? ` Bases secrètes localisées : ${bases.map((s) => staticSystem(s.id).name).join(', ')}.` : ''}`);
      if (bases.length && t.id === state.player) news(state, { text: `Nos bases secrètes (${bases.map((s) => staticSystem(s.id).name).join(', ')}) ont été repérées par ${f.name} !`, kind: 'intel', faction: t.id, important: true });
      break;
    }
    case 'steal_tech': {
      const loot = t.techs.filter((id) => !f.techs.includes(id));
      if (!loot.length) {
        report(state, fid, `${t.name} ne possède aucune technologie qui nous manque.`);
        break;
      }
      const ready = loot.filter((id) => canResearch(state, fid, id));
      const id = pick(state, ready.length ? ready : loot);
      giveTech(state, fid, id);
      report(state, fid, `Vol réussi : nous obtenons « ${TECH_BY_ID[id].name} » aux dépens de ${t.name}.`);
      break;
    }
    case 'sabotage': {
      const systems = Object.values(state.systems).filter((s) => s.owner === t.id && (s.buildings.length || s.build.length));
      if (!systems.length) break;
      systems.sort((a, b) => b.buildings.length - a.buildings.length);
      const s = systems[0];
      if (s.build.length && chance(state, 0.4)) {
        s.build[0].days += Math.round(s.build[0].total * 0.5);
        report(state, fid, `Sabotage : le chantier en cours sur ${staticSystem(s.id).name} prend un retard considérable.`);
      } else if (s.buildings.length) {
        const priority = s.buildings.findIndex((b) => ['shipyard', 'industry', 'superweapon_yard', 'shield'].includes(b));
        const index = priority >= 0 ? priority : 0;
        const [b] = s.buildings.splice(index, 1);
        report(state, fid, `Sabotage réussi sur ${staticSystem(s.id).name} : ${BUILDINGS[b].name} détruit.`);
        news(state, { text: `Explosions sur ${staticSystem(s.id).name} : un sabotage frappe ${t.name}.`, kind: 'intel', faction: t.id, sys: s.id, important: t.id === state.player });
      }
      break;
    }
    case 'destabilize':
      addModifier(state, t.id, { id: `destab_${fid}`, name: `Déstabilisation (${f.short})`, days: 180, stability: -8 });
      for (const s of Object.values(state.systems)) if (s.owner === t.id) s.sympathy = Math.min(100, (s.sympathy || 0) + 8);
      report(state, fid, `Déstabilisation réussie : ${t.name} perd 8 de stabilité.`);
      break;
    case 'incite': {
      const systems = Object.values(state.systems).filter((s) => s.owner === t.id && s.controller === t.id && t.capital !== s.id && !s.destroyed);
      if (!systems.length) break;
      systems.sort((a, b) => a.stability - b.stability);
      spawnUprising(state, systems[0].id, fid);
      report(state, fid, `Nos agents ont armé les insurgés sur ${staticSystem(systems[0].id).name}.`);
      break;
    }
    case 'bribe': {
      const res = state.senate?.current;
      if (!res) break;
      res.bribes[fid] = (res.bribes[fid] || 0) + 1;
      report(state, fid, 'Des sénateurs ont été achetés : leurs voix suivront la nôtre.');
      break;
    }
    case 'assassinate': {
      const old = t.leader;
      t.leader = pick(state, LEADER_POOL.filter((n) => n !== old));
      addModifier(state, t.id, { id: 'assassination', name: 'Assassinat du dirigeant', days: 360, stability: -15 });
      state.tension = Math.min(100, state.tension + 5);
      news(state, { text: `${old}, dirigeant de ${t.name}, a été assassiné ! ${t.leader} lui succède.`, kind: 'intel', faction: t.id, important: true });
      break;
    }
    case 'steal_plans': {
      const weapons = state.superweapons.filter((w) => w.owner === t.id);
      for (const w of weapons) w.plans[fid] = true;
      if (weapons.length) {
        report(state, fid, `Les plans de ${weapons.map((w) => w.name).join(', ')} sont entre nos mains ! Nos chasseurs connaissent désormais son point faible.`);
        news(state, { text: `Des plans secrets de ${t.name} ont été dérobés.`, kind: 'intel', faction: t.id, important: t.id === state.player });
      }
      break;
    }
    case 'election':
      addModifier(state, t.id, { id: `meddling_${fid}`, name: 'Ingérence étrangère', days: 360, approval: -15, stability: -2 });
      report(state, fid, `Campagne de désinformation lancée contre le gouvernement de ${t.name}.`);
      break;
    case 'counter':
      f.counterUntil = state.day + 180;
      report(state, fid, 'Chasse aux espions : contre-espionnage renforcé pour 180 jours.', false);
      break;
    case 'propaganda':
      addModifier(state, fid, { id: 'disinfo', name: 'Désinformation', days: 120, stability: 5 });
      report(state, fid, 'Campagne de désinformation lancée : +5 de stabilité.', false);
      break;
    default:
      break;
  }
}
