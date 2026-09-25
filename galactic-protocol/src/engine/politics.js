// Domestic politics: stability, war weariness, insurgent sympathy, uprisings, elections, capitals,
// bankruptcy, national decisions and the elimination of factions.
import { GOVERNMENTS, LEADER_POOL } from '../data/factions.js';
import { UNIT_NAMES } from '../data/units.js';
import {
  aliveFactions, atWar, clamp, fac, gov, hasGround, stacksAt, staticSystem, warsOf,
} from './query.js';
import { GALAXY, hopsFrom } from './galaxy.js';
import { mod } from './research.js';
import { addModifier, expireModifiers, modSum } from './modifiers.js';
import { buildingFx, systemOutput } from './economy.js';
import { garrisonMax } from './military.js';
import { declareWar } from './diplomacy.js';
import { addUnits, newId, removeStack } from './stacks.js';
import { chance, pick } from './rng.js';
import { news } from './news.js';

// ---------------------------------------------------------------- stability

export function socialEffect(pct) {
  return 18 * (1 - Math.exp(-pct / 10)) - 6;
}

export function taxEffect(rate) {
  return rate > 20 ? -(rate - 20) * 0.5 : (20 - rate) * 0.25;
}

/** Breakdown of the national stability target (shown in the Politics panel). */
export function stabilityFactors(state, fid) {
  const f = fac(state, fid);
  const g = gov(state, fid);
  const systems = Object.values(state.systems).filter((x) => x.owner === fid).length;
  const factors = [
    ['Base', 46],
    [g.name, g.stability],
    ['Étendue du territoire', systems > 4 ? -1.1 * Math.sqrt(systems) : 0],
    ['Programmes sociaux', socialEffect(f.budget.social)],
    ['Fiscalité', taxEffect(f.taxRate)],
    ['Technologies', mod(state, fid, 'stability')],
    ['Lassitude de guerre', -f.warWeariness * 0.25],
  ];
  for (const m of f.modifiers) if (m.until > state.day && m.stability) factors.push([m.name, m.stability]);
  if (f.bankrupt) factors.push(['Faillite', -15]);
  if (f.deficit.bacta) factors.push(['Pénurie de bacta', -5]);
  if (f.capital && state.systems[f.capital].controller !== fid) factors.push(['Capitale occupée', -12]);
  if (!f.capital) factors.push(['Gouvernement en exil', -8]);
  return factors.filter(([, v]) => Math.abs(v) >= 0.05);
}

export function nationalTarget(state, fid) {
  return stabilityFactors(state, fid).reduce((acc, [, v]) => acc + v, 0);
}

/** Hop distances from each faction's capital (recomputed every 10 days). */
function capitalDistances(state) {
  if (state._capHops && state._capHops.day > state.day - 10 && state._capHops.day <= state.day) return state._capHops.data;
  const data = {};
  for (const f of aliveFactions(state)) data[f.id] = f.capital ? hopsFrom(GALAXY, f.capital, 30) : {};
  Object.defineProperty(state, '_capHops', { value: { day: state.day, data }, writable: true, configurable: true, enumerable: false });
  return data;
}

export function distancePenalty(state, s) {
  const hops = capitalDistances(state)[s.owner]?.[s.id];
  return Math.min(15, (hops ?? 12) * 1.2);
}

function systemTarget(state, s, national) {
  const fid = s.owner;
  const f = fac(state, fid);
  let t = national + buildingFx(s, 'stability') - distancePenalty(state, s);
  if (f.capital === s.id) t += 8;
  if (s.controller !== s.owner) t -= 25;
  if (s.acquired > state.day - 720) t -= 15 * (1 - (state.day - s.acquired) / 720) * (1 - mod(state, fid, 'occupation'));
  const troops = stacksAt(state, s.id).some((st) => st.owner === fid && hasGround(st));
  if (troops) t += gov(state, fid).authoritarian ? 6 : 3;
  t -= (s.sympathy || 0) * 0.15;
  return clamp(t, 0, 100);
}

function stabilityDay(state) {
  for (const f of aliveFactions(state)) f.stabilityTarget = nationalTarget(state, f.id);
  const weights = {};
  const totals = {};
  for (const s of Object.values(state.systems)) {
    if (!s.owner || s.destroyed) continue;
    const target = systemTarget(state, s, state.factions[s.owner].stabilityTarget);
    s.stability = clamp(s.stability + (target - s.stability) * 0.03, 0, 100);
    const w = 1 + systemOutput(state, s);
    weights[s.owner] = (weights[s.owner] || 0) + w;
    totals[s.owner] = (totals[s.owner] || 0) + s.stability * w;
  }
  for (const f of aliveFactions(state)) {
    f.stability = weights[f.id] ? totals[f.id] / weights[f.id] : f.stabilityTarget;
    const wars = warsOf(state, f.id).length;
    f.warWeariness = clamp(f.warWeariness + (wars ? 0.02 * wars : -0.08), 0, 100);
  }
}

/** Sets every system straight to its stability and sympathy targets (start of a game). */
export function settleStability(state) {
  for (let i = 0; i < 3; i++) {
    for (const f of aliveFactions(state)) f.stabilityTarget = nationalTarget(state, f.id);
    for (const s of Object.values(state.systems)) {
      if (!s.owner || s.destroyed) continue;
      s.stability = systemTarget(state, s, state.factions[s.owner].stabilityTarget);
      s.sympathy = sympathyTarget(state, s);
    }
  }
  for (const f of aliveFactions(state)) {
    const own = Object.values(state.systems).filter((s) => s.owner === f.id);
    f.stability = own.length ? own.reduce((acc, s) => acc + s.stability, 0) / own.length : f.stabilityTarget;
  }
}

// ---------------------------------------------------------------- insurgency

function sympathyTarget(state, s) {
  const ins = state.insurgency;
  if (!ins || !ins.against.includes(s.owner) || !state.factions[ins.faction]?.alive) return 0;
  const authoritarian = gov(state, s.owner).authoritarian;
  let target = 75 - s.stability - (authoritarian ? 0 : 20) + modSum(state, s.owner, 'sympathy') * 100;
  target += (buildingFx(s, 'sympathy') + mod(state, s.owner, 'sympathy')) * 100;
  return clamp(target, 0, 100);
}

function sympathyDay(state) {
  const ins = state.insurgency;
  for (const s of Object.values(state.systems)) {
    if (!s.owner || s.destroyed) {
      s.sympathy = 0;
      continue;
    }
    if (!ins || !ins.against.includes(s.owner) || !state.factions[ins.faction]?.alive) {
      s.sympathy = Math.max(0, (s.sympathy || 0) - 0.05);
      continue;
    }
    const target = sympathyTarget(state, s);
    s.sympathy = clamp((s.sympathy || 0) + (target - (s.sympathy || 0)) * 0.01, 0, 100);
  }
}

/** Uprisings in very unstable systems: insurgent units or a breakaway state. */
function uprisingsDay(state) {
  const ins = state.insurgency;
  const cells = ins && state.factions[ins.faction]?.alive;
  for (const s of Object.values(state.systems)) {
    if (!s.owner || s.destroyed || s.battle || s.controller !== s.owner) continue;
    if ((s.uprisingCd || 0) > state.day || fac(state, s.owner).capital === s.id) continue;
    // Insurgent cells rise in restless worlds; elsewhere only deep crises cause revolts.
    const insurgentTarget = cells && ins.against.includes(s.owner) && atWar(state, ins.faction, s.owner);
    const threshold = insurgentTarget && (s.sympathy || 0) > 45 ? 38 : 22;
    if (s.stability >= threshold) continue;
    const p = 0.0015 * (1 + (s.sympathy || 0) / 50) * (threshold - s.stability) / 10;
    if (chance(state, p)) spawnUprising(state, s.id);
  }
}

export function spawnUprising(state, sysId, sponsor = null) {
  const s = state.systems[sysId];
  const owner = s.owner;
  s.uprisingCd = state.day + 360;
  const name = staticSystem(sysId).name;
  const ins = state.insurgency;
  const power = Math.max(4, Math.round(garrisonMax(state, s) / 70));
  if (ins && ins.against.includes(owner) && state.factions[ins.faction]?.alive && atWar(state, ins.faction, owner)) {
    const stack = addUnits(state, ins.faction, sysId, 'infantry', power);
    for (let i = 0; i < Math.ceil(power / 4); i++) stack.units.push({ t: 'armor', hp: 100, xp: 10 });
    stack.name = `Insurgés de ${name}`;
    news(state, { text: `Soulèvement sur ${name} ! Les insurgés rejoignent ${fac(state, ins.faction).name}.`, kind: 'uprising', faction: ins.faction, sys: sysId, important: owner === state.player || ins.faction === state.player });
    return;
  }
  const owned = Object.values(state.systems).filter((x) => x.owner === owner).length;
  if (owned <= 2 && !sponsor) {
    s.stability = Math.max(s.stability, 25);
    return;
  }
  const rebel = createBreakaway(state, sysId, owner);
  const stack = addUnits(state, rebel, sysId, 'infantry', power);
  stack.name = 'Milices révolutionnaires';
  news(state, { text: `${name} proclame son indépendance et prend les armes contre ${fac(state, owner).name} !`, kind: 'uprising', faction: rebel, sys: sysId, important: owner === state.player });
}

/** Cost of arming the local cells of a sympathetic enemy world (insurgent movements only). */
export function insurrectionCost(state, sysId) {
  return Math.round(150 + state.systems[sysId].garrison / 2);
}

export function insurrectionBlocker(state, fid, sysId) {
  const s = state.systems[sysId];
  if (!gov(state, fid).insurgent) return 'Réservé aux mouvements insurgés.';
  if (!s.owner || s.destroyed || s.controller !== s.owner) return 'Système invalide.';
  if (!atWar(state, fid, s.owner)) return 'Vous devez être en guerre contre ce système.';
  if ((s.sympathy || 0) < 40) return 'Sympathie insuffisante (40 requis).';
  if ((s.uprisingCd || 0) > state.day) return 'Les cellules locales se reconstituent.';
  if (fac(state, fid).treasury < insurrectionCost(state, sysId)) return 'Trésorerie insuffisante.';
  return null;
}

export function fundInsurrection(state, fid, sysId) {
  const blocker = insurrectionBlocker(state, fid, sysId);
  if (blocker) return { ok: false, msg: blocker };
  const s = state.systems[sysId];
  fac(state, fid).treasury -= insurrectionCost(state, sysId);
  s.uprisingCd = state.day + 180;
  const count = Math.max(3, Math.round(s.garrison / 55 * (0.6 + s.sympathy / 100)));
  const stack = addUnits(state, fid, sysId, 'infantry', count, 10);
  for (let i = 0; i < Math.ceil(count / 4); i++) stack.units.push({ t: 'armor', hp: 100, xp: 10 });
  stack.name = `Cellules de ${staticSystem(sysId).name}`;
  news(state, { text: `Insurrection armée sur ${staticSystem(sysId).name}, soutenue par ${fac(state, fid).name} !`, kind: 'uprising', faction: fid, sys: sysId, important: fid === state.player || s.owner === state.player });
  return { ok: true };
}

const BREAKAWAY_COLORS = ['#e0a458', '#7fb7be', '#d3a5ff', '#b8e986', '#f78fb3', '#9ee6ff', '#ffd166', '#c6d8af'];

function createBreakaway(state, sysId, from) {
  const s = state.systems[sysId];
  const id = newId(state, 'free_');
  const name = staticSystem(sysId).name;
  state.factions[id] = blankFaction(state, {
    id, name: `${name} libre`, short: name, color: pick(state, BREAKAWAY_COLORS), emblem: 'ring', gov: 'freeworld',
    agency: 'local', style: 'generic', doctrine: 'defensive', personality: { aggression: 0.1, diplomacy: 0.7, ruthless: 0, trade: 0.6 },
    leader: pick(state, LEADER_POOL), capital: sysId,
  });
  state.names[id] = { ...UNIT_NAMES.generic };
  const f = state.factions[id];
  f.techs = [...state.factions[from].techs.filter((t) => !t.startsWith('super'))];
  f.treasury = 200;
  s.owner = id;
  s.controller = id;
  s.acquired = state.day;
  s.stability = 45;
  s.sympathy = 0;
  s.build = [];
  declareWar(state, from, id, { name: `Révolte de ${name}`, silent: true, penalties: false });
  return id;
}

/** Default dynamic fields of a faction (used by setup and breakaway states). */
export function blankFaction(state, template) {
  return {
    ...template,
    alive: true,
    isPlayer: false,
    treasury: 0,
    taxRate: 25,
    budget: { research: 14, intel: 8, social: 10, infra: 10 },
    res: { dura: 150, tib: 100, kyb: 10, bacta: 60, spice: 10 },
    deficit: {},
    manpower: 100,
    rpDay: 0,
    ip: 20,
    ipDay: 0,
    research: { current: null, progress: 0, queue: [], bank: 0 },
    techs: [],
    mods: { unlock: [] },
    stability: 50,
    stabilityTarget: 50,
    warWeariness: 0,
    agents: [],
    intel: {},
    counterUntil: 0,
    modifiers: [],
    cooldowns: {},
    production: [],
    autoTrade: true,
    subsidy: 0,
    bankrupt: false,
    nextElection: GOVERNMENTS[template.gov]?.elections ? state.day + 360 * 3 : null,
    stats: { lost: 0, kills: 0, captures: 0 },
    flags: {},
    ai: { next: {} },
    econ: null,
  };
}

// ---------------------------------------------------------------- elections, capitals, bankruptcy

function electionsDay(state) {
  for (const f of aliveFactions(state)) {
    if (!gov(state, f.id).elections || !f.nextElection || f.nextElection > state.day) continue;
    runElection(state, f.id);
  }
}

export function approval(state, fid) {
  const f = fac(state, fid);
  return clamp(f.stability + modSum(state, fid, 'approval') - f.warWeariness * 0.2 + (f.econ?.net > 0 ? 3 : -3), 0, 100);
}

export function runElection(state, fid) {
  const f = fac(state, fid);
  f.nextElection = state.day + 360 * 3;
  const support = approval(state, fid);
  if (support >= 45) {
    addModifier(state, fid, { id: 'mandate', name: 'Mandat renouvelé', days: 180, stability: 3 });
    news(state, { text: `Élections : ${f.leader} est reconduit à la tête de ${f.name} (${Math.round(support)} % d’approbation).`, kind: 'politics', faction: fid, important: f.isPlayer });
    return true;
  }
  const old = f.leader;
  f.leader = pick(state, LEADER_POOL.filter((n) => n !== old));
  f.budget = { research: 14, intel: 8, social: 12, infra: 10 };
  addModifier(state, fid, { id: 'new_government', name: 'Nouveau gouvernement', days: 150, stability: -4 });
  f.warWeariness = Math.max(0, f.warWeariness - 15);
  f.flags.seekPeace = state.day + 180;
  news(state, { text: `Élections : ${old} est battu ! ${f.leader} forme un nouveau gouvernement pour ${f.name}.`, kind: 'politics', faction: fid, important: true });
  return false;
}

function capitalsDay(state) {
  for (const f of aliveFactions(state)) {
    const cap = f.capital ? state.systems[f.capital] : null;
    if (cap && cap.owner === f.id && !cap.destroyed) continue;
    // The capital was annexed or destroyed: move the government to the richest system left.
    const candidates = Object.values(state.systems).filter((s) => s.owner === f.id && s.controller === f.id && !s.destroyed);
    candidates.sort((a, b) => systemOutput(state, b) - systemOutput(state, a));
    const next = candidates[0];
    f.capital = next ? next.id : null;
    if (next && f.isPlayer) news(state, { text: `Le gouvernement se replie sur ${staticSystem(next.id).name}, nouvelle capitale.`, kind: 'politics', faction: f.id, important: true });
  }
}

function bankruptcyDay(state) {
  for (const f of aliveFactions(state)) {
    const limit = -30 * Math.max(20, f.econ?.revenue || 20);
    const broke = f.treasury < limit;
    if (broke && !f.bankrupt) news(state, { text: `${f.name} est en cessation de paiements ! La solde des troupes n’est plus versée.`, kind: 'economy', faction: f.id, important: f.isPlayer });
    f.bankrupt = broke;
  }
}

// ---------------------------------------------------------------- elimination

export function checkEliminations(state) {
  for (const f of aliveFactions(state)) {
    const holds = Object.values(state.systems).some((s) => s.controller === f.id || s.owner === f.id);
    if (holds) continue;
    const forces = Object.values(state.stacks).some((st) => st.owner === f.id);
    // Insurgent movements survive as long as they keep fleets in the field.
    if (forces && gov(state, f.id).insurgent) continue;
    eliminate(state, f.id);
  }
}

export function eliminate(state, fid) {
  const f = fac(state, fid);
  f.alive = false;
  f.eliminatedDay = state.day;
  for (const st of Object.values(state.stacks)) if (st.owner === fid) removeStack(state, st.id);
  for (const s of Object.values(state.systems)) {
    if (s.owner === fid) {
      s.owner = s.controller && s.controller !== fid ? s.controller : null;
      s.acquired = state.day;
    }
    if (s.controller === fid) s.controller = s.owner;
  }
  state.treaties = state.treaties.filter((t) => t.a !== fid && t.b !== fid);
  for (const w of state.wars) {
    w.att = w.att.filter((x) => x !== fid);
    w.def = w.def.filter((x) => x !== fid);
  }
  state.wars = state.wars.filter((w) => w.att.length && w.def.length);
  state.superweapons = state.superweapons.filter((w) => w.owner !== fid);
  if (state.senate) state.senate.members = state.senate.members.filter((m) => m !== fid);
  news(state, { text: `${f.name} a cessé d’exister.`, kind: 'war', faction: fid, important: true });
}

// ---------------------------------------------------------------- decisions

export const DECISIONS = {
  propaganda: {
    name: 'Campagne de propagande', cost: 15, cooldown: 180,
    desc: '+6 de stabilité pendant 180 jours.',
    apply: (state, fid) => addModifier(state, fid, { id: 'propaganda', name: 'Propagande', days: 180, stability: 6 }),
  },
  martial_law: {
    name: 'Loi martiale', cost: 0, cooldown: 360, authoritarian: true,
    desc: '+12 de stabilité, -15 % de production, la sympathie insurgée augmente (180 jours).',
    apply: (state, fid) => addModifier(state, fid, { id: 'martial_law', name: 'Loi martiale', days: 180, stability: 12, output: -0.15, sympathy: 0.1 }),
  },
  conscription: {
    name: 'Conscription générale', cost: 0, cooldown: 360,
    desc: 'Effectifs doublés, -6 de stabilité (360 jours).',
    apply: (state, fid) => addModifier(state, fid, { id: 'conscription', name: 'Conscription', days: 360, manpower: 1, stability: -6 }),
  },
  war_economy: {
    name: 'Économie de guerre', cost: 0, cooldown: 360,
    desc: 'Production militaire 30 % plus rapide et 15 % moins chère ; croissance stoppée, -4 de stabilité (360 jours).',
    apply: (state, fid) => addModifier(state, fid, { id: 'war_economy', name: 'Économie de guerre', days: 360, prodTime: -0.3, milCost: -0.15, growth: -1, stability: -4 }),
  },
  mobilization: {
    name: 'Mobilisation générale', cost: 10, cooldown: 360,
    desc: 'Tension galactique +10, garnisons +50 %, production +15 % ; -3 de stabilité (360 jours).',
    apply: (state, fid) => {
      state.tension = Math.min(100, state.tension + 10);
      addModifier(state, fid, { id: 'mobilization', name: 'Mobilisation', days: 360, garrison: 0.5, prodTime: -0.15, stability: -3, mobilized: 1 });
      news(state, { text: `${fac(state, fid).name} décrète la mobilisation générale. La tension galactique monte.`, kind: 'alert', faction: fid, important: true });
    },
  },
  amnesty: {
    name: 'Amnistie générale', cost: 20, cooldown: 360,
    desc: 'Sympathie insurgée -25 dans vos systèmes, lassitude de guerre -10, +3 de stabilité.',
    apply: (state, fid) => {
      for (const s of Object.values(state.systems)) if (s.owner === fid) s.sympathy = Math.max(0, (s.sympathy || 0) - 25);
      const f = fac(state, fid);
      f.warWeariness = Math.max(0, f.warWeariness - 10);
      addModifier(state, fid, { id: 'amnesty', name: 'Amnistie', days: 180, stability: 3 });
    },
  },
  austerity: {
    name: 'Mesures d’austérité', cost: 0, cooldown: 360,
    desc: 'Encaisse immédiatement 30 jours de revenus ; -8 de stabilité et croissance réduite (360 jours).',
    apply: (state, fid) => {
      const f = fac(state, fid);
      f.treasury += 30 * Math.max(10, f.econ?.revenue || 10);
      addModifier(state, fid, { id: 'austerity', name: 'Austérité', days: 360, stability: -8, growth: -0.5 });
    },
  },
  loan: {
    name: 'Emprunt au Clan Bancaire', cost: 0, cooldown: 720,
    desc: 'Reçoit 90 jours de revenus ; 8 % des revenus remboursés pendant 720 jours.',
    apply: (state, fid) => {
      const f = fac(state, fid);
      f.treasury += 90 * Math.max(10, f.econ?.revenue || 10);
      addModifier(state, fid, { id: 'loan', name: 'Remboursement de l’emprunt', days: 720, income: 0.08 });
    },
  },
  dissolve_senate: {
    name: 'Dissoudre le Sénat', cost: 0, cooldown: 99999, authoritarian: true,
    desc: 'Les gouverneurs régionaux prennent le contrôle direct : +8 de stabilité pendant 720 jours, mais la sympathie insurgée grimpe.',
    available: (state, fid) => state.senate && !state.senate.dissolved && state.senate.presiding === fid,
    apply: (state, fid) => {
      state.senate.dissolved = true;
      state.senate.current = null;
      addModifier(state, fid, { id: 'moffs', name: 'Gouverneurs régionaux', days: 720, stability: 8, sympathy: 0.15 });
      news(state, { text: `${fac(state, fid).leader} dissout le ${state.senate.name} ! Les derniers vestiges de l’ancienne République ont été balayés.`, kind: 'senate', faction: fid, important: true });
    },
  },
  tarkin_doctrine: {
    name: 'Doctrine Tarkin', cost: 0, cooldown: 720, authoritarian: true,
    desc: 'Gouverner par la peur de la superarme : +12 de stabilité pendant 720 jours (exige d’avoir fait feu).',
    available: (state, fid) => fac(state, fid).flags.firedSuperweapon,
    apply: (state, fid) => addModifier(state, fid, { id: 'tarkin', name: 'Doctrine Tarkin', days: 720, stability: 12, sympathy: 0.1 }),
  },
  snap_election: {
    name: 'Élections anticipées', cost: 0, cooldown: 720, elections: true,
    desc: 'Organise des élections immédiatement.',
    apply: (state, fid) => runElection(state, fid),
  },
};

export function decisionBlocker(state, fid, id) {
  const d = DECISIONS[id];
  const f = fac(state, fid);
  const g = gov(state, fid);
  if (d.authoritarian && !g.authoritarian) return 'Réservé aux régimes autoritaires.';
  if (d.elections && !g.elections) return 'Réservé aux démocraties.';
  if (d.available && !d.available(state, fid)) return 'Conditions non remplies.';
  if ((f.cooldowns[`decision:${id}`] || 0) > state.day) return `Disponible dans ${f.cooldowns[`decision:${id}`] - state.day} jours.`;
  if (decisionCost(state, fid, id) > f.treasury) return 'Trésorerie insuffisante.';
  return null;
}

export function decisionCost(state, fid, id) {
  const cost = DECISIONS[id].cost;
  return cost ? Math.round(cost * Math.max(10, fac(state, fid).econ?.revenue || 10)) : 0;
}

export function takeDecision(state, fid, id) {
  const blocker = decisionBlocker(state, fid, id);
  if (blocker) return { ok: false, msg: blocker };
  const f = fac(state, fid);
  f.treasury -= decisionCost(state, fid, id);
  f.cooldowns[`decision:${id}`] = state.day + DECISIONS[id].cooldown;
  DECISIONS[id].apply(state, fid);
  return { ok: true };
}

// ---------------------------------------------------------------- daily

export function politicsDay(state) {
  expireModifiers(state);
  stabilityDay(state);
  sympathyDay(state);
  uprisingsDay(state);
  electionsDay(state);
  capitalsDay(state);
  bankruptcyDay(state);
}
