// Galactic Senate: membership, resolutions, votes and their effects.
import { RESOLUTIONS } from '../data/senate.js';
import {
  addRelation, aliveFactions, atWar, enemiesOf, fac, friendly, gov, militaryPower, relation, sum,
} from './query.js';
import { addModifier } from './modifiers.js';
import { declareWar } from './diplomacy.js';
import { chance, pick, weighted } from './rng.js';
import { newId } from './stacks.js';
import { news } from './news.js';

const VOTE_DAYS = 15;

export function senateActive(state) {
  return !!state.senate && !state.senate.dissolved;
}

export function isMember(state, fid) {
  return senateActive(state) && state.senate.members.includes(fid);
}

export function seats(state, fid) {
  let pop = 0;
  let count = 0;
  for (const s of Object.values(state.systems)) {
    if (s.owner !== fid) continue;
    pop += s.pop;
    count++;
  }
  return Math.round(3 + Math.sqrt(pop) * 1.5 + count * 0.5);
}

export function totalSeats(state) {
  return sum(state.senate.members, (m) => seats(state, m));
}

export function joinSenate(state, fid) {
  if (!senateActive(state)) return { ok: false, msg: 'Le Sénat a été dissous.' };
  if (isMember(state, fid)) return { ok: false, msg: 'Déjà membre.' };
  const presiding = state.senate.presiding;
  if (presiding && state.factions[presiding]?.alive && (atWar(state, fid, presiding) || relation(state, fid, presiding) < -20)) {
    return { ok: false, msg: 'Le président du Sénat s’oppose à votre adhésion.' };
  }
  state.senate.members.push(fid);
  news(state, { text: `${fac(state, fid).name} rejoint le ${state.senate.name}.`, kind: 'senate', faction: fid });
  return { ok: true };
}

export function leaveSenate(state, fid) {
  if (!isMember(state, fid)) return { ok: false, msg: 'Vous n’êtes pas membre.' };
  if (state.senate.presiding === fid) return { ok: false, msg: 'Le président ne peut pas quitter le Sénat.' };
  state.senate.members = state.senate.members.filter((m) => m !== fid);
  if (state.senate.presiding) addRelation(state, fid, state.senate.presiding, -10);
  news(state, { text: `${fac(state, fid).name} quitte le ${state.senate.name}.`, kind: 'senate', faction: fid });
  return { ok: true };
}

export function proposalBlocker(state, fid, type, target) {
  if (!senateActive(state)) return 'Le Sénat a été dissous.';
  if (!isMember(state, fid)) return 'Seuls les membres peuvent proposer une résolution.';
  if (state.senate.current) return 'Une résolution est déjà en cours de vote.';
  if ((fac(state, fid).cooldowns.senate || 0) > state.day) return `Nouvelle proposition possible dans ${fac(state, fid).cooldowns.senate - state.day} jours.`;
  if (RESOLUTIONS[type].needsTarget && (!target || !state.factions[target]?.alive)) return 'Choisissez une cible.';
  if (RESOLUTIONS[type].needsTarget && target === fid) return 'Vous ne pouvez pas vous viser vous-même.';
  if (state.senate.active.some((r) => r.type === type && r.target === (target || null) && r.until > state.day)) return 'Résolution déjà en vigueur.';
  return null;
}

export function proposeResolution(state, fid, type, target = null) {
  const blocker = proposalBlocker(state, fid, type, target);
  if (blocker) return { ok: false, msg: blocker };
  fac(state, fid).cooldowns.senate = state.day + 90;
  state.senate.current = { id: newId(state, 'r'), type, target: RESOLUTIONS[type].needsTarget ? target : null, proposer: fid, days: VOTE_DAYS, votes: {}, bribes: {} };
  const t = target ? ` contre ${fac(state, target).name}` : '';
  news(state, { text: `${state.senate.name} : ${fac(state, fid).name} propose « ${RESOLUTIONS[type].name} »${t}.`, kind: 'senate', faction: fid, important: isMember(state, state.player) });
  return { ok: true };
}

/** AI vote: 'yes', 'no' or 'abstain'. */
export function aiVote(state, voter, res) {
  const f = fac(state, voter);
  const t = res.target;
  if (t === voter) return 'no';
  let score = relation(state, voter, res.proposer) * 0.25;
  switch (res.type) {
    case 'sanctions':
    case 'condemn':
    case 'peacekeeping':
      score += -relation(state, voter, t) * 0.8 + (atWar(state, voter, t) ? 50 : 0) - (friendly(state, voter, t) ? 80 : 0);
      if (res.type === 'peacekeeping') score -= 15;
      break;
    case 'aid':
      score += relation(state, voter, t) * 0.6 - (atWar(state, voter, t) ? 60 : 0) + 5;
      break;
    case 'ban_superweapons':
      score += 25 - f.personality.ruthless * 40 - (state.superweapons.some((w) => w.owner === voter) ? 80 : 0);
      break;
    case 'trade_pact':
      score += f.personality.trade * 40 - (gov(state, voter).isolationist ? 30 : 0);
      break;
    case 'emergency_powers':
      score += voter === state.senate.presiding ? 100 : relation(state, voter, state.senate.presiding) * 0.7 - 10;
      break;
    default:
      break;
  }
  if (score > 12) return 'yes';
  if (score < -12) return 'no';
  return 'abstain';
}

export function castVote(state, fid, vote) {
  const res = state.senate?.current;
  if (!res || !isMember(state, fid)) return;
  res.votes[fid] = vote;
}

export function tally(state, res = state.senate.current) {
  const result = { yes: 0, no: 0, abstain: 0, total: totalSeats(state), votes: {} };
  for (const m of state.senate.members) {
    if (!state.factions[m]?.alive) continue;
    const vote = res.votes[m] ?? (state.factions[m].isPlayer ? 'abstain' : aiVote(state, m, res));
    result.votes[m] = vote;
    result[vote] += seats(state, m);
  }
  // Bought senators follow their sponsor's vote.
  for (const [briber, n] of Object.entries(res.bribes)) {
    const side = result.votes[briber] === 'no' ? 'no' : 'yes';
    const swing = Math.round(result.total * 0.08 * n);
    result[side] += swing;
    result[side === 'yes' ? 'no' : 'yes'] = Math.max(0, result[side === 'yes' ? 'no' : 'yes'] - swing);
  }
  return result;
}

function resolve(state) {
  const res = state.senate.current;
  state.senate.current = null;
  const result = tally(state, res);
  let passed = result.yes > result.no && result.yes >= result.total * 0.25;
  const presiding = state.senate.presiding;
  let vetoed = false;
  if (passed && presiding && state.factions[presiding]?.alive && result.votes[presiding] === 'no' && presiding !== res.proposer) {
    vetoed = true;
    passed = false;
    addModifier(state, presiding, { id: 'veto', name: 'Veto impopulaire', days: 180, stability: -5 });
    for (const [m, v] of Object.entries(result.votes)) if (v === 'yes') addRelation(state, presiding, m, -10);
  }
  const def = RESOLUTIONS[res.type];
  const target = res.target ? ` contre ${fac(state, res.target).name}` : '';
  state.senate.history.unshift({ day: state.day, type: res.type, target: res.target, proposer: res.proposer, yes: result.yes, no: result.no, passed, vetoed });
  if (state.senate.history.length > 30) state.senate.history.pop();
  if (!passed) {
    news(state, { text: `${state.senate.name} : « ${def.name} »${target} est ${vetoed ? `bloquée par le veto de ${fac(state, presiding).name}` : 'rejetée'} (${result.yes} pour, ${result.no} contre).`, kind: 'senate', faction: res.proposer, important: isMember(state, state.player) });
    return;
  }
  news(state, { text: `${state.senate.name} : « ${def.name} »${target} est adoptée (${result.yes} pour, ${result.no} contre).`, kind: 'senate', faction: res.proposer, important: true });
  applyResolution(state, res);
}

export function applyResolution(state, res) {
  const members = state.senate.members.filter((m) => state.factions[m]?.alive);
  const def = RESOLUTIONS[res.type];
  if (def.days) state.senate.active.push({ type: res.type, target: res.target, until: state.day + def.days });
  const t = res.target;
  switch (res.type) {
    case 'sanctions':
      break;
    case 'condemn':
      addModifier(state, t, { id: 'condemned', name: 'Condamnation du Sénat', days: 360, stability: -10 });
      for (const m of members) if (m !== t) addRelation(state, m, t, -20);
      break;
    case 'ban_superweapons':
      state.tension = Math.max(0, state.tension - 20);
      break;
    case 'aid':
      for (const m of members) {
        if (m === t) continue;
        const f = fac(state, m);
        const gift = Math.min(400, Math.max(0, f.treasury * 0.02));
        f.treasury -= gift;
        fac(state, t).treasury += gift;
        fac(state, t).res.bacta += 10;
      }
      break;
    case 'peacekeeping':
      for (const m of members) {
        if (m === t || atWar(state, m, t) || friendly(state, m, t)) continue;
        if (fac(state, m).isPlayer) {
          state.inbox.push({ id: newId(state, 'i'), kind: 'peacekeeping', target: t, day: state.day });
          continue;
        }
        if (relation(state, m, t) < 0 && militaryPower(state, m) > 50) declareWar(state, m, t, { name: `Maintien de la paix contre ${fac(state, t).short}`, penalties: false });
      }
      break;
    case 'trade_pact':
      for (const m of members) addModifier(state, m, { id: 'trade_pact', name: 'Pacte commercial galactique', days: def.days, output: 0.05 });
      break;
    case 'emergency_powers':
      if (state.senate.presiding) addModifier(state, state.senate.presiding, { id: 'emergency', name: 'Pouvoirs d’urgence', days: def.days, stability: 10 });
      break;
    default:
      break;
  }
}

function aiPropose(state) {
  const members = state.senate.members.filter((m) => state.factions[m]?.alive && !state.factions[m].isPlayer);
  if (!members.length) return;
  const proposer = weighted(state, Object.fromEntries(members.map((m) => [m, seats(state, m)])));
  if (!proposer || (fac(state, proposer).cooldowns.senate || 0) > state.day) return;
  const options = [];
  for (const e of enemiesOf(state, proposer)) {
    if (!state.factions[e]?.alive) continue;
    options.push(['sanctions', e], ['condemn', e]);
    if (militaryPower(state, e) < militaryPower(state, proposer) * 2) options.push(['peacekeeping', e]);
  }
  for (const o of aliveFactions(state)) {
    if (o.id !== proposer && relation(state, proposer, o.id) < -55) options.push(['sanctions', o.id]);
    if (o.id !== proposer && relation(state, proposer, o.id) > 40 && o.warWeariness > 30) options.push(['aid', o.id]);
  }
  if (state.tension > 60 && !state.superweapons.some((w) => w.owner === proposer)) options.push(['ban_superweapons', null], ['ban_superweapons', null]);
  if (fac(state, proposer).personality.trade > 0.6) options.push(['trade_pact', null]);
  if (proposer === state.senate.presiding && gov(state, proposer).authoritarian) options.push(['emergency_powers', null]);
  const valid = options.filter(([type, target]) => !proposalBlocker(state, proposer, type, target));
  if (!valid.length) return;
  const [type, target] = pick(state, valid);
  proposeResolution(state, proposer, type, target);
}

export function senateDay(state) {
  if (!senateActive(state)) return;
  state.senate.members = state.senate.members.filter((m) => state.factions[m]?.alive);
  state.senate.active = state.senate.active.filter((r) => r.until > state.day);
  const res = state.senate.current;
  if (res) {
    res.days -= 1;
    if (res.days <= 0) resolve(state);
  } else if (state.day >= state.senate.nextProposal) {
    state.senate.nextProposal = state.day + 45;
    if (chance(state, 0.8)) aiPropose(state);
  }
}
