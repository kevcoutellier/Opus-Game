// Diplomacy: relations, treaties, war declarations, alliances, war score and peace treaties.
import {
  addRelation, aliveFactions, alliesOf, atWar, clamp, dayCache, enemiesOf, fac, friendly, gov, hasTreaty, inTruce,
  militaryPower, overlordOf, relation, setRelation, vassalsOf, warBetween,
} from './query.js';
import { systemValue } from './economy.js';
import { addModifier } from './modifiers.js';
import { newId } from './stacks.js';
import { news } from './news.js';

export const TREATY_NAMES = {
  trade: 'Accord commercial',
  nap: 'Pacte de non-agression',
  access: 'Droit de passage',
  alliance: 'Alliance défensive',
  vassal: 'Vassalité',
};

export function addTreaty(state, type, a, b) {
  if (!hasTreaty(state, type, a, b)) state.treaties.push({ type, a, b, since: state.day });
}

export function removeTreaty(state, type, a, b) {
  state.treaties = state.treaties.filter((t) => !(t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a))));
}

function cooldown(state, fid, key, days) {
  const f = fac(state, fid);
  if ((f.cooldowns[key] || 0) > state.day) return false;
  f.cooldowns[key] = state.day + days;
  return true;
}

export function cooldownLeft(state, fid, key) {
  return Math.max(0, (fac(state, fid).cooldowns[key] || 0) - state.day);
}

const dailyRevenue = (state, fid) => Math.max(10, fac(state, fid).econ?.revenue || 10);

// ---------------------------------------------------------------- simple actions

export function envoyCost(state, fid) {
  return Math.round(20 + dailyRevenue(state, fid) * 2);
}

export function improveRelations(state, fid, target) {
  const cost = envoyCost(state, fid);
  const f = fac(state, fid);
  if (f.treasury < cost) return { ok: false, msg: 'Trésorerie insuffisante.' };
  if (!cooldown(state, fid, `envoy:${target}`, 60)) return { ok: false, msg: 'Un émissaire est déjà en route.' };
  f.treasury -= cost;
  addRelation(state, fid, target, 10);
  return { ok: true };
}

export function insult(state, fid, target) {
  if (!cooldown(state, fid, `insult:${target}`, 60)) return { ok: false, msg: 'Trop tôt pour un nouvel affront.' };
  addRelation(state, fid, target, -25);
  addModifier(state, fid, { id: 'nationalism', name: 'Ferveur nationaliste', days: 60, stability: 1 });
  news(state, { text: `${fac(state, fid).name} insulte publiquement ${fac(state, target).name} sur l’HoloNet.`, kind: 'diplo', faction: fid });
  return { ok: true };
}

export function sendGift(state, fid, target, amount) {
  const f = fac(state, fid);
  amount = Math.floor(amount);
  if (amount <= 0 || amount > f.treasury) return { ok: false, msg: 'Montant invalide.' };
  f.treasury -= amount;
  fac(state, target).treasury += amount;
  const gain = Math.min(30, (100 * amount) / (dailyRevenue(state, target) * 30 + 100));
  addRelation(state, fid, target, gain);
  return { ok: true, gain };
}

// ---------------------------------------------------------------- treaties

/** Does the AI faction `ai` accept a treaty proposed by `from`? Returns { accept, reason }. */
export function aiAcceptsTreaty(state, ai, from, type) {
  const rel = relation(state, ai, from);
  const p = fac(state, ai).personality;
  if (atWar(state, ai, from)) return { accept: false, reason: 'Nous sommes en guerre.' };
  const myPower = militaryPower(state, ai) + 1;
  const theirPower = militaryPower(state, from) + 1;
  switch (type) {
    case 'trade':
      return rel >= 20 - p.trade * 30 ? { accept: true } : { accept: false, reason: 'Relations insuffisantes.' };
    case 'nap':
      return rel >= 20 || (rel >= -15 && theirPower > myPower * 0.8) ? { accept: true } : { accept: false, reason: 'Nous ne vous faisons pas confiance.' };
    case 'access':
      return rel >= 30 ? { accept: true } : { accept: false, reason: 'Relations insuffisantes (30 requis).' };
    case 'alliance': {
      const shared = enemiesOf(state, ai).some((e) => enemiesOf(state, from).includes(e));
      const threat = aliveFactions(state).some((o) => o.id !== ai && o.id !== from && relation(state, ai, o.id) < -30 && relation(state, from, o.id) < -30);
      if (rel >= 75 || (rel >= 45 && (shared || threat))) return { accept: true };
      return { accept: false, reason: rel < 45 ? 'Relations insuffisantes (45 requis).' : 'Aucun intérêt commun.' };
    }
    case 'vassal': {
      const allies = alliesOf(state, ai).reduce((acc, a) => acc + militaryPower(state, a), 0);
      if (theirPower > (myPower + allies) * 4 && rel > -30) return { accept: true };
      return { accept: false, reason: 'Nous ne plierons pas le genou.' };
    }
    default:
      return { accept: false, reason: '' };
  }
}

export function treatyBlocker(state, fid, target, type) {
  if (fid === target) return 'Impossible.';
  if (atWar(state, fid, target)) return 'Vous êtes en guerre.';
  if (hasTreaty(state, type, fid, target)) return 'Traité déjà en vigueur.';
  if (type === 'vassal' && (overlordOf(state, target) || overlordOf(state, fid) === target)) return 'Déjà engagé dans une vassalité.';
  if (type === 'alliance' && hasTreaty(state, 'vassal', fid, target)) return 'Lien de vassalité existant.';
  return null;
}

export function proposeTreaty(state, fid, target, type) {
  const blocker = treatyBlocker(state, fid, target, type);
  if (blocker) return { ok: false, msg: blocker };
  if (fac(state, target).isPlayer) {
    state.inbox.push({ id: newId(state, 'i'), kind: 'treaty', from: fid, type, day: state.day });
    return { ok: true, pending: true };
  }
  if (!cooldown(state, fid, `treaty:${type}:${target}`, 30)) return { ok: false, msg: 'Proposition déjà refusée récemment.' };
  const { accept, reason } = aiAcceptsTreaty(state, target, fid, type);
  if (!accept) return { ok: true, accepted: false, msg: reason };
  signTreaty(state, fid, target, type);
  return { ok: true, accepted: true };
}

export function signTreaty(state, a, b, type) {
  if (type === 'vassal') addTreaty(state, 'vassal', a, b);
  else addTreaty(state, type, a, b);
  addRelation(state, a, b, 8);
  news(state, { text: `${fac(state, a).name} et ${fac(state, b).name} signent : ${TREATY_NAMES[type].toLowerCase()}.`, kind: 'diplo', faction: a });
}

export function cancelTreaty(state, fid, target, type) {
  if (!hasTreaty(state, type, fid, target)) return { ok: false, msg: 'Aucun traité.' };
  removeTreaty(state, type, fid, target);
  const penalty = { alliance: 35, nap: 25, vassal: 30, access: 10, trade: 8 }[type] || 10;
  addRelation(state, fid, target, -penalty);
  news(state, { text: `${fac(state, fid).name} rompt ${TREATY_NAMES[type].toLowerCase()} avec ${fac(state, target).name}.`, kind: 'diplo', faction: fid });
  return { ok: true };
}

// ---------------------------------------------------------------- war

export function isMajor(state, fid) {
  const majors = dayCache(state, 'majors', () => aliveFactions(state).map((f) => [f.id, militaryPower(state, f.id)])
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id));
  return majors.includes(fid);
}

export function warBlocker(state, fid, target) {
  if (fid === target) return 'Impossible.';
  if (!fac(state, target)?.alive) return 'Faction disparue.';
  if (atWar(state, fid, target)) return 'Déjà en guerre.';
  if (friendly(state, fid, target)) return 'Rompez d’abord votre alliance ou votre vassalité.';
  if (hasTreaty(state, 'nap', fid, target)) return 'Rompez d’abord le pacte de non-agression.';
  if (inTruce(state, fid, target)) return 'Une trêve est en vigueur.';
  return null;
}

export function declareWar(state, fid, target, { name = null, silent = false, penalties = true } = {}) {
  const blocker = warBlocker(state, fid, target);
  if (blocker) return { ok: false, msg: blocker };
  const f = fac(state, fid);
  const t = fac(state, target);
  const war = { id: newId(state, 'war'), name: name || `Guerre ${f.short} – ${t.short}`, att: [fid], def: [target], start: state.day, losses: { att: 0, def: 0 } };
  state.wars.push(war);
  removeTreaty(state, 'trade', fid, target);
  removeTreaty(state, 'access', fid, target);
  if (penalties) {
    const rel = relation(state, fid, target);
    const penalty = 8 * gov(state, fid).warPenalty * (rel <= -60 ? 0.5 : 1);
    if (penalty > 0) addModifier(state, fid, { id: `war_${war.id}`, name: 'Guerre d’agression', days: 240, stability: -penalty });
    for (const o of aliveFactions(state)) {
      if (o.id === fid || o.id === target) continue;
      addRelation(state, o.id, fid, -(3 + (relation(state, o.id, target) > 30 ? 10 : 0)));
    }
    state.tension = Math.min(100, state.tension + 6 + (isMajor(state, fid) && isMajor(state, target) ? 8 : 0));
  }
  setRelation(state, fid, target, Math.min(relation(state, fid, target), -60));
  if (!silent) {
    news(state, { text: `${f.name} déclare la guerre à ${t.name} !`, kind: 'war', faction: fid, important: true });
  }
  // Vassals follow their overlord; defensive allies and overlords defend.
  for (const v of vassalsOf(state, fid)) joinWar(state, war, v, 'att');
  for (const v of vassalsOf(state, target)) joinWar(state, war, v, 'def');
  const defenders = new Set([...alliesOf(state, target)]);
  const lord = overlordOf(state, target);
  if (lord) defenders.add(lord);
  for (const a of defenders) {
    if (war.att.includes(a) || war.def.includes(a) || a === fid) continue;
    callToArms(state, war, a, 'def', target);
  }
  for (const a of alliesOf(state, fid)) {
    if (war.att.includes(a) || war.def.includes(a) || a === target) continue;
    if (fac(state, a).isPlayer) callToArms(state, war, a, 'att', fid);
    else if (relation(state, a, target) < -10 && !hasTreaty(state, 'nap', a, target)) joinWar(state, war, a, 'att');
  }
  return { ok: true, war };
}

function callToArms(state, war, ally, side, asker) {
  if (fac(state, ally).isPlayer) {
    state.inbox.push({ id: newId(state, 'i'), kind: 'call', war: war.id, side, from: asker, day: state.day });
    return;
  }
  const enemy = side === 'def' ? war.att[0] : war.def[0];
  if (hasTreaty(state, 'nap', ally, enemy) && relation(state, ally, asker) < 70) {
    removeTreaty(state, 'alliance', ally, asker);
    return;
  }
  if (side === 'def' || relation(state, ally, enemy) < 0) joinWar(state, war, ally, side);
}

export function joinWar(state, war, fid, side) {
  if (war.att.includes(fid) || war.def.includes(fid)) return;
  const enemies = side === 'att' ? war.def : war.att;
  if (enemies.some((e) => friendly(state, fid, e) && !hasTreaty(state, 'vassal', fid, e))) return;
  (side === 'att' ? war.att : war.def).push(fid);
  for (const e of enemies) {
    removeTreaty(state, 'nap', fid, e);
    removeTreaty(state, 'trade', fid, e);
    removeTreaty(state, 'access', fid, e);
    setRelation(state, fid, e, Math.min(relation(state, fid, e), -50));
  }
  news(state, { text: `${fac(state, fid).name} entre en guerre (${war.name}).`, kind: 'war', faction: fid });
}

export function answerCall(state, itemId, accept) {
  const item = state.inbox.find((i) => i.id === itemId);
  if (!item) return;
  state.inbox = state.inbox.filter((i) => i !== item);
  const war = state.wars.find((w) => w.id === item.war);
  if (!war) return;
  if (accept) joinWar(state, war, state.player, item.side);
  else {
    removeTreaty(state, 'alliance', state.player, item.from);
    addRelation(state, state.player, item.from, -40);
    news(state, { text: `Vous refusez l’appel aux armes de ${fac(state, item.from).name} : l’alliance est rompue.`, kind: 'diplo', faction: state.player });
  }
}

/** War score from the attackers' point of view (-100..100). */
export function warScore(state, war) {
  const occupied = (occupiers, victims) => {
    let taken = 0;
    let total = 0;
    for (const s of Object.values(state.systems)) {
      if (!victims.includes(s.owner)) continue;
      const v = systemValue(state, s);
      total += v;
      if (occupiers.includes(s.controller)) taken += v;
    }
    return total ? (taken / total) * 100 : 0;
  };
  const att = occupied(war.att, war.def);
  const def = occupied(war.def, war.att);
  const scale = Math.max(3000, [...war.att, ...war.def].reduce((acc, f) => acc + (fac(state, f).econ?.revenue || 0), 0) * 20);
  const battles = clamp(((war.losses.def - war.losses.att) / scale) * 25, -25, 25);
  return clamp(Math.round(att - def + battles), -100, 100);
}

export function scoreFor(state, war, fid) {
  const s = warScore(state, war);
  return war.att.includes(fid) ? s : -s;
}

/** Systems of `victim` occupied by `occupier`. */
export function occupiedBy(state, occupier, victim) {
  return Object.values(state.systems).filter((s) => s.owner === victim && s.controller === occupier);
}

export const PEACE_TERMS = {
  white: 'Paix blanche (statu quo)',
  demand: 'Exiger les systèmes occupés',
  concede: 'Céder les systèmes qu’ils occupent',
  vassal: 'Exiger leur vassalité',
};

export function peaceCost(state, fid, target, terms) {
  if (terms !== 'demand') return 0;
  const taken = occupiedBy(state, fid, target).reduce((acc, s) => acc + systemValue(state, s), 0);
  const total = Object.values(state.systems).filter((s) => s.owner === target).reduce((acc, s) => acc + systemValue(state, s), 0);
  return total ? Math.round((taken / total) * 100) : 0;
}

export function aiAcceptsPeace(state, ai, from, terms) {
  const war = warBetween(state, ai, from);
  if (!war) return { accept: false, reason: 'Pas en guerre.' };
  const score = scoreFor(state, war, ai);
  const f = fac(state, ai);
  const weariness = f.warWeariness;
  const age = state.day - war.start;
  const owned = Object.values(state.systems).filter((s) => s.owner === ai);
  const held = owned.filter((s) => s.controller === ai).length;
  const desperate = !owned.length || held / owned.length < 0.35 || (f.capital && state.systems[f.capital].controller !== ai);
  const sworn = relation(state, ai, from) <= -90;
  // The oppressor never negotiates with the insurgency unless it is collapsing (and vice versa).
  const ins = state.insurgency;
  const insurgencyPair = ins && ((ins.faction === ai && ins.against.includes(from)) || (ins.faction === from && ins.against.includes(ai)));
  if (insurgencyPair && !desperate && f.stability > 20 && terms !== 'vassal') {
    return { accept: false, reason: ins.faction === ai ? 'La Rébellion ne pactisera jamais avec la tyrannie.' : 'Nous ne négocions pas avec des terroristes.' };
  }
  switch (terms) {
    case 'white': {
      const ok = sworn
        ? score <= -30 || weariness >= 70
        : score <= 10 || weariness > 45 || (age > 900 && score < 30);
      return ok ? { accept: true } : { accept: false, reason: score > 10 ? 'Nous gagnons cette guerre.' : 'Nous ne sommes pas prêts à la paix.' };
    }
    case 'demand': {
      const cost = peaceCost(state, from, ai, 'demand');
      if (!occupiedBy(state, from, ai).length) return { accept: false, reason: 'Vous n’occupez aucun de nos systèmes.' };
      const ok = -score >= cost * 0.9 || (desperate && -score >= cost * 0.5) || (weariness > 70 && -score >= cost * 0.4);
      return ok ? { accept: true } : { accept: false, reason: `Score de guerre insuffisant (${-score} / ${cost}).` };
    }
    case 'concede':
      if (!occupiedBy(state, ai, from).length) return { accept: false, reason: 'Vous n’avez rien à nous céder.' };
      return score >= -15 || weariness > 30 ? { accept: true } : { accept: false, reason: 'Cela ne suffit pas.' };
    case 'vassal':
      return -score >= 65 || (desperate && -score > 40) ? { accept: true } : { accept: false, reason: 'Nous préférons nous battre.' };
    default:
      return { accept: false, reason: '' };
  }
}

export function proposePeace(state, fid, target, terms) {
  const war = warBetween(state, fid, target);
  if (!war) return { ok: false, msg: 'Pas en guerre.' };
  if (fac(state, target).isPlayer) {
    state.inbox.push({ id: newId(state, 'i'), kind: 'peace', from: fid, terms, war: war.id, day: state.day });
    return { ok: true, pending: true };
  }
  if (!cooldown(state, fid, `peace:${target}`, 20)) return { ok: false, msg: 'Proposition déjà refusée récemment.' };
  const { accept, reason } = aiAcceptsPeace(state, target, fid, terms);
  if (!accept) return { ok: true, accepted: false, msg: reason };
  makePeace(state, fid, target, terms);
  return { ok: true, accepted: true };
}

/** Applies a peace treaty between `fid` (proposer) and `target`. */
export function makePeace(state, fid, target, terms) {
  const war = warBetween(state, fid, target);
  if (!war) return;
  const f = fac(state, fid);
  const t = fac(state, target);
  const annexed = [];
  if (terms === 'demand') for (const s of occupiedBy(state, fid, target)) annexed.push([s, fid]);
  if (terms === 'concede') for (const s of occupiedBy(state, target, fid)) annexed.push([s, target]);
  for (const [s, newOwner] of annexed) {
    s.owner = newOwner;
    s.controller = newOwner;
    s.acquired = state.day;
    s.occupied = null;
  }
  const leaders = [war.att[0], war.def[0]];
  const wholeWar = leaders.includes(fid) && leaders.includes(target);
  const pairs = wholeWar ? { a: war.att, b: war.def } : { a: [fid], b: [target] };
  // Occupied systems go back to their owners.
  for (const s of Object.values(state.systems)) {
    if (!s.owner || s.controller === s.owner) continue;
    const back = (pairs.a.includes(s.owner) && pairs.b.includes(s.controller)) || (pairs.b.includes(s.owner) && pairs.a.includes(s.controller));
    if (back) {
      s.controller = s.owner;
      s.occupied = null;
    }
  }
  if (wholeWar) state.wars = state.wars.filter((w) => w !== war);
  else {
    const leaving = leaders.includes(fid) ? target : fid;
    war.att = war.att.filter((x) => x !== leaving);
    war.def = war.def.filter((x) => x !== leaving);
    if (!war.att.length || !war.def.length) state.wars = state.wars.filter((w) => w !== war);
  }
  for (const a of pairs.a) for (const b of pairs.b) state.truces.push({ a, b, until: state.day + 360 });
  for (const id of [...pairs.a, ...pairs.b]) fac(state, id).flags.lastPeace = state.day;
  if (terms === 'vassal') addTreaty(state, 'vassal', fid, target);
  setRelation(state, fid, target, Math.max(relation(state, fid, target), -40));
  const detail = annexed.length ? ` ${annexed.length} système(s) change(nt) de mains.` : terms === 'vassal' ? ` ${t.name} devient vassal de ${f.name}.` : '';
  news(state, { text: `Paix signée entre ${f.name} et ${t.name} (${PEACE_TERMS[terms].toLowerCase()}).${detail}`, kind: 'peace', faction: fid, important: true });
}

export function demandVassal(state, fid, target) {
  const res = proposeTreaty(state, fid, target, 'vassal');
  if (res.ok && res.accepted === false) addRelation(state, fid, target, -20);
  return res;
}

export function declareIndependence(state, vassal) {
  const lord = overlordOf(state, vassal);
  if (!lord) return { ok: false, msg: 'Vous n’êtes vassal de personne.' };
  removeTreaty(state, 'vassal', lord, vassal);
  const res = declareWar(state, vassal, lord, { name: `Guerre d’indépendance (${fac(state, vassal).short})`, penalties: false });
  news(state, { text: `${fac(state, vassal).name} proclame son indépendance face à ${fac(state, lord).name} !`, kind: 'war', faction: vassal, important: true });
  return res;
}

// ---------------------------------------------------------------- daily upkeep

function baseline(state, a, b) {
  let v = 0;
  if (hasTreaty(state, 'trade', a, b)) v += 10;
  if (hasTreaty(state, 'nap', a, b)) v += 10;
  if (hasTreaty(state, 'access', a, b)) v += 5;
  if (hasTreaty(state, 'alliance', a, b)) v += 35;
  if (hasTreaty(state, 'vassal', a, b)) v += 15;
  if (atWar(state, a, b)) v -= 70;
  const ins = state.insurgency;
  if (ins && ((ins.faction === a && ins.against.includes(b)) || (ins.faction === b && ins.against.includes(a)))) v -= 80;
  const ga = gov(state, a);
  const gb = gov(state, b);
  if (ga.authoritarian && gb.authoritarian) v += 5;
  else if ((ga.authoritarian && (gb.elections || gb.insurgent)) || (gb.authoritarian && (ga.elections || ga.insurgent))) v -= 12;
  const shared = enemiesOf(state, a).some((e) => enemiesOf(state, b).includes(e));
  if (shared) v += 15;
  return clamp(v, -95, 90);
}

export function diplomacyDay(state) {
  state.truces = state.truces.filter((t) => t.until > state.day);
  // Unanswered treaty proposals expire after 60 days.
  state.inbox = state.inbox.filter((i) => i.kind !== 'treaty' || state.day - i.day < 60);
  state.wars = state.wars.filter((w) => w.att.some((f) => state.factions[f]?.alive) && w.def.some((f) => state.factions[f]?.alive));
  for (const w of state.wars) {
    w.att = w.att.filter((f) => state.factions[f]?.alive);
    w.def = w.def.filter((f) => state.factions[f]?.alive);
  }
  if (state.day % 10 !== 0) return;
  const alive = aliveFactions(state);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i].id;
      const b = alive[j].id;
      const r = relation(state, a, b);
      setRelation(state, a, b, r + (baseline(state, a, b) - r) * 0.06);
    }
  }
}
