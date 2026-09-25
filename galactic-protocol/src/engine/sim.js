// Daily simulation loop, player inbox answers, victory conditions and history.
import { economyDay, refreshEconomy } from './economy.js';
import { healingDay, movementDay } from './military.js';
import { combatDay } from './combat.js';
import { checkEliminations, politicsDay } from './politics.js';
import { researchDay } from './research.js';
import { espionageDay } from './espionage.js';
import { senateDay } from './senate.js';
import { superweaponsDay } from './superweapons.js';
import { answerCall, declareWar, diplomacyDay, makePeace, signTreaty, TREATY_NAMES, PEACE_TERMS } from './diplomacy.js';
import { answerEvent, eventsDay } from './events.js';
import { aiDay } from './ai.js';
import { aliveFactions, atWar, fac, militaryPower, relation, addRelation } from './query.js';
import { news } from './news.js';

export function advanceDay(state) {
  state.day += 1;
  economyDay(state);
  movementDay(state);
  combatDay(state);
  healingDay(state);
  politicsDay(state);
  researchDay(state);
  espionageDay(state);
  senateDay(state);
  superweaponsDay(state);
  diplomacyDay(state);
  eventsDay(state);
  aiDay(state);
  checkEliminations(state);
  recordHistory(state);
  checkVictory(state);
}

function recordHistory(state) {
  if (state.day % 30 !== 0) return;
  const snapshot = { day: state.day, f: {} };
  for (const f of aliveFactions(state)) {
    const systems = Object.values(state.systems).filter((s) => s.controller === f.id).length;
    snapshot.f[f.id] = [Math.round(f.econ?.gdp || 0), Math.round(militaryPower(state, f.id)), systems];
  }
  state.history.push(snapshot);
  if (state.history.length > 240) state.history.shift();
}

// ---------------------------------------------------------------- victory

export function goalProgress(state, fid) {
  const f = fac(state, fid);
  const goal = f.goal;
  if (!goal) return null;
  if (goal.type === 'eliminate') {
    const done = goal.targets.filter((t) => !state.factions[t]?.alive).length;
    return { done: done === goal.targets.length, text: goal.text, detail: `${done}/${goal.targets.length} faction(s) éliminée(s)` };
  }
  if (goal.type === 'hold') {
    const held = goal.systems.filter((id) => state.systems[id].controller === fid || state.systems[id].destroyed).length;
    return { done: held === goal.systems.length, text: goal.text, detail: `${held}/${goal.systems.length} système(s) contrôlé(s)` };
  }
  return null;
}

export function gdpShare(state, fid) {
  let total = 0;
  let mine = 0;
  for (const f of aliveFactions(state)) {
    total += f.econ?.gdp || 0;
    if (f.id === fid) mine += f.econ?.gdp || 0;
  }
  return total ? mine / total : 0;
}

/** Share of the galactic GDP needed for a domination victory (harder for factions that start big). */
export function dominationTarget(state, fid) {
  const f = state.factions[fid];
  if (f.startShare === undefined) f.startShare = gdpShare(state, fid);
  return Math.max(0.6, f.startShare + (1 - f.startShare) * 0.6);
}

function checkVictory(state) {
  if (state.gameOver) return;
  const p = state.factions[state.player];
  if (!p.alive) {
    state.gameOver = { result: 'defeat', reason: `${p.name} a été anéanti.`, day: state.day };
    return;
  }
  const target = dominationTarget(state, p.id);
  if (gdpShare(state, p.id) >= target && p.econ.gdp > 0) {
    state.gameOver = { result: 'victory', reason: `Domination galactique : vous produisez ${Math.round(target * 100)} % de la richesse de la galaxie.`, day: state.day };
    return;
  }
  const goal = goalProgress(state, p.id);
  if (goal?.done) state.gameOver = { result: 'victory', reason: `Objectif accompli : ${goal.text}.`, day: state.day };
}

// ---------------------------------------------------------------- inbox

export function inboxTitle(state, item) {
  switch (item.kind) {
    case 'treaty': return `${fac(state, item.from).name} propose : ${TREATY_NAMES[item.type].toLowerCase()}`;
    case 'peace': return `${fac(state, item.from).name} propose la paix`;
    case 'call': return `Appel aux armes de ${fac(state, item.from).name}`;
    case 'peacekeeping': return `Le Sénat appelle à une force de paix contre ${fac(state, item.target).name}`;
    default: return '';
  }
}

export function inboxText(state, item) {
  switch (item.kind) {
    case 'treaty': {
      const rel = Math.round(relation(state, state.player, item.from));
      return `${fac(state, item.from).leader} vous propose de signer ${TREATY_NAMES[item.type].toLowerCase()} (relations : ${rel}).${item.type === 'vassal' ? ' Vous deviendriez leur vassal.' : ''}`;
    }
    case 'peace': return `Conditions : ${PEACE_TERMS[item.terms].toLowerCase()}${item.terms === 'demand' ? ' — ils exigent les systèmes qu’ils occupent chez vous' : item.terms === 'concede' ? ' — ils vous cèdent les systèmes que vous occupez' : ''}.`;
    case 'call': {
      const war = state.wars.find((w) => w.id === item.war);
      return `Votre allié vous demande d’entrer dans la guerre « ${war?.name ?? '?'} ». Refuser rompra l’alliance.`;
    }
    case 'peacekeeping': return 'Le Sénat a voté une force de maintien de la paix. Voulez-vous y participer en déclarant la guerre ?';
    default: return '';
  }
}

export function answerInbox(state, itemId, choice) {
  const item = state.inbox.find((i) => i.id === itemId);
  if (!item) return;
  if (item.kind === 'event') {
    answerEvent(state, itemId, choice);
    refreshEconomy(state);
    return;
  }
  if (item.kind === 'call') {
    answerCall(state, itemId, choice === 0);
    return;
  }
  state.inbox = state.inbox.filter((i) => i !== item);
  const accept = choice === 0;
  if (item.kind === 'treaty') {
    if (!state.factions[item.from]?.alive || atWar(state, state.player, item.from)) return;
    if (accept) {
      if (item.type === 'vassal') signTreaty(state, item.from, state.player, 'vassal');
      else signTreaty(state, item.from, state.player, item.type);
    } else addRelation(state, state.player, item.from, -5);
  } else if (item.kind === 'peace') {
    if (!atWar(state, state.player, item.from)) return;
    if (accept) makePeace(state, item.from, state.player, item.terms);
    else news(state, { text: `Vous rejetez la proposition de paix de ${fac(state, item.from).name}.`, kind: 'peace', faction: state.player });
  } else if (item.kind === 'peacekeeping') {
    if (accept && state.factions[item.target]?.alive) declareWar(state, state.player, item.target, { penalties: false, name: `Maintien de la paix contre ${fac(state, item.target).short}` });
  }
}

