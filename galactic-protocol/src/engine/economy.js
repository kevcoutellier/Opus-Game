// Economy: system output, taxes and budget, strategic resources, galactic market, construction and production.
import { BUILDINGS } from '../data/buildings.js';
import { UNIT_TYPES } from '../data/units.js';
import {
  aliveFactions, buildingCount, clamp, fac, gov, overlordOf, staticSystem, stacksOf,
} from './query.js';
import { mod, unlocked } from './research.js';
import { modSum } from './modifiers.js';
import { addUnits, newId } from './stacks.js';
import { news } from './news.js';

export const RES = ['dura', 'tib', 'kyb', 'bacta', 'spice'];

// Share of a unit's listed upkeep actually charged each day.
const UPKEEP_MULT = 1.5;

export const RES_INFO = {
  dura: { name: 'Durasteel', short: 'Dura', price: 4, volume: 3000, reserve: 200 },
  tib: { name: 'Tibanna', short: 'Tib', price: 6, volume: 2000, reserve: 120 },
  kyb: { name: 'Kyber', short: 'Kyb', price: 30, volume: 300, reserve: 20 },
  bacta: { name: 'Bacta', short: 'Bacta', price: 8, volume: 1500, reserve: 60 },
  spice: { name: 'Épice', short: 'Épice', price: 12, volume: 800, reserve: 0 },
};

export const BUDGET_KEYS = {
  research: 'Recherche',
  intel: 'Renseignement',
  social: 'Programmes sociaux',
  infra: 'Infrastructures',
};

export function buildingFx(sys, key) {
  let total = 0;
  for (const id of sys.buildings) {
    const v = BUILDINGS[id].fx[key];
    if (typeof v === 'number') total += v;
  }
  return total;
}

export function baseOutput(sys) {
  if (sys.destroyed) return 0;
  return sys.dev * Math.sqrt(sys.pop + 0.02) * 4 + 2;
}

/** Buildings on poor worlds cost less to maintain. */
export function upkeepFactor(sys) {
  return Math.min(1, (baseOutput(sys) + 6) / 40);
}

/** Daily output (GDP) of a system for its controller. */
export function systemOutput(state, sys) {
  if (sys.destroyed || !sys.controller) return 0;
  const f = sys.controller;
  const mult = 1 + buildingFx(sys, 'output') + mod(state, f, 'output') + modSum(state, f, 'output');
  let out = baseOutput(sys) * Math.max(0.2, mult) * (0.6 + 0.006 * sys.stability);
  if (sys.controller !== sys.owner) out *= 0.5;
  if (sys.blockade) out *= 0.5;
  return out;
}

/** Value of a system for war score and AI targeting. */
export function systemValue(state, sys) {
  return baseOutput(sys) + 5 + sys.buildings.length * 3;
}

export function isSanctioned(state, fid) {
  return state.senate?.active?.some((r) => r.type === 'sanctions' && r.target === fid && r.until > state.day);
}

export function slotCount(state, sys) {
  return staticSystem(sys.id).size + 1 + (sys.owner ? mod(state, sys.owner, 'slots') : 0);
}

export function productionLines(state, sys) {
  const lines = { ground: 0, air: 0, ship: 0 };
  if (!sys.owner || sys.controller !== sys.owner || sys.destroyed) return lines;
  if (state.factions[sys.owner].capital === sys.id) {
    lines.ground += 1;
    lines.air += 1;
  }
  for (const id of sys.buildings) {
    const l = BUILDINGS[id].fx.lines;
    if (l) for (const k in l) lines[k] += l[k];
  }
  if (lines.ship && staticSystem(sys.id).tags.includes('major-yard')) lines.ship += 1;
  return lines;
}

// ---------------------------------------------------------------- daily economy

export function unitUpkeep(state, fid) {
  let total = 0;
  const use = { dura: 0, tib: 0, kyb: 0, bacta: 0, spice: 0 };
  for (const st of stacksOf(state, fid)) {
    for (const u of st.units) {
      const type = UNIT_TYPES[u.t];
      total += type.upkeep;
      for (const r in type.use) use[r] += type.use[r];
    }
  }
  return { credits: total * UPKEEP_MULT * Math.max(0.3, 1 + mod(state, fid, 'upkeep') + modSum(state, fid, 'upkeep')), use };
}

function computeEconomy(state, f) {
  const g = gov(state, f.id);
  const econ = {
    gdp: 0, tax: 0, trade: 0, subsidy: f.subsidy || 0, donations: 0, tribute: 0, loans: 0,
    revenue: 0, unitUpkeep: 0, buildingUpkeep: 0, alloc: {}, interest: 0, net: 0, market: f.marketDay || 0,
    prod: { dura: 0, tib: 0, kyb: 0, bacta: 0, spice: 0 }, use: { dura: 0, tib: 0, kyb: 0, bacta: 0, spice: 0 },
    mp: 0, rp: 0, ip: 0,
  };
  const taxRate = f.taxRate / 100;
  const taxEff = g.taxEff + mod(state, f.id, 'taxEff');
  const extractBonus = 1 + mod(state, f.id, 'extract');
  let spaceportTrade = 0;
  let labRp = 0;
  let centerIp = 0;
  let mpBuildings = 0;
  for (const s of Object.values(state.systems)) {
    if (s.controller !== f.id || s.destroyed) continue;
    const out = systemOutput(state, s);
    econ.gdp += out;
    econ.tax += out * taxRate * (taxEff + buildingFx(s, 'tax'));
    spaceportTrade += out * buildingFx(s, 'trade');
    const stabF = 0.6 + 0.006 * s.stability;
    const occ = s.owner === f.id ? 1 : 0.5;
    for (const r in s.res) {
      const level = s.res[r];
      if (!level) continue;
      const ext = s.buildings.some((b) => BUILDINGS[b].fx.extract === r) ? 2 : 1;
      econ.prod[r] += 0.8 * level * ext * (extractBonus + mod(state, f.id, `extract.${r}`)) * stabF * occ;
    }
    if (s.owner === f.id) {
      const factor = upkeepFactor(s);
      for (const id of s.buildings) {
        const b = BUILDINGS[id];
        econ.buildingUpkeep += b.upkeep * factor;
        if (b.use) for (const r in b.use) econ.use[r] += b.use[r];
      }
      labRp += buildingFx(s, 'rp');
      centerIp += buildingFx(s, 'ip');
      mpBuildings += buildingFx(s, 'mp');
      econ.mp += Math.sqrt(s.pop) * 0.15;
    }
  }
  // Trade agreements (suspended by Senate sanctions).
  const sanctioned = isSanctioned(state, f.id);
  if (!sanctioned) {
    const partners = state.treaties.filter((t) => t.type === 'trade' && (t.a === f.id || t.b === f.id))
      .map((t) => (t.a === f.id ? t.b : t.a)).filter((p) => !isSanctioned(state, p) && state.factions[p]?.alive);
    econ.trade = (econ.gdp * 0.015 * Math.min(6, partners.length) + spaceportTrade) * (1 + mod(state, f.id, 'trade'));
  }
  // Donations of sympathizers for insurgent movements.
  if (g.insurgent && state.insurgency?.faction === f.id) {
    for (const s of Object.values(state.systems)) {
      if (!s.controller || !state.insurgency.against.includes(s.owner) || !s.sympathy) continue;
      econ.donations += systemOutput(state, s) * (s.sympathy / 100) * 0.05;
      econ.mp += Math.sqrt(s.pop) * (s.sympathy / 100) * 0.04;
    }
  }
  econ.revenue = econ.tax + econ.trade + econ.subsidy + econ.donations;
  econ.loans = econ.revenue * -modSum(state, f.id, 'income');
  const upkeep = unitUpkeep(state, f.id);
  econ.unitUpkeep = upkeep.credits;
  for (const r in upkeep.use) econ.use[r] += upkeep.use[r];
  econ.buildingUpkeep *= 1 + Math.min(0, mod(state, f.id, 'upkeep'));
  let allocTotal = 0;
  for (const k in BUDGET_KEYS) {
    econ.alloc[k] = Math.max(0, econ.revenue) * (f.budget[k] / 100);
    allocTotal += econ.alloc[k];
  }
  econ.interest = f.treasury < 0 ? -f.treasury * 0.001 : 0;
  econ.net = econ.revenue - econ.unitUpkeep - econ.buildingUpkeep - allocTotal - econ.interest - econ.loans;
  econ.rp = (1 + 2.5 * Math.sqrt(econ.alloc.research) + labRp) * (1 + mod(state, f.id, 'rp'));
  econ.ip = (0.4 + 1.5 * Math.sqrt(econ.alloc.intel) + centerIp) * (1 + mod(state, f.id, 'ip'));
  econ.mp = (econ.mp + mpBuildings) * (1 + mod(state, f.id, 'manpower') + modSum(state, f.id, 'manpower'));
  return econ;
}

/** Recomputes every faction's balance sheet without applying it (for the interface and the AI). */
export function refreshEconomy(state) {
  for (const f of aliveFactions(state)) {
    f.econ = computeEconomy(state, f);
    f.rpDay = f.econ.rp;
    f.ipDay = f.econ.ip;
  }
}

export function economyDay(state) {
  refreshEconomy(state);
  // Vassals pay 10 % of their taxes to their overlord.
  for (const f of aliveFactions(state)) {
    const lord = overlordOf(state, f.id);
    if (!lord || !state.factions[lord]?.alive) continue;
    const tribute = f.econ.tax * 0.1;
    f.econ.tribute -= tribute;
    f.econ.net -= tribute;
    state.factions[lord].econ.tribute += tribute;
    state.factions[lord].econ.net += tribute;
  }
  for (const f of aliveFactions(state)) {
    const e = f.econ;
    f.marketDay = 0;
    f.treasury += e.net;
    f.rpDay = e.rp;
    f.ip = Math.min(f.ip + e.ip, 600);
    f.ipDay = e.ip;
    const g = gov(state, f.id);
    f.manpower = Math.min(f.manpower + e.mp, Math.max(300, e.mp * 360));
    if (g.droids) f.manpower = Math.max(f.manpower, 0);
    for (const r of RES) {
      f.res[r] += e.prod[r] - e.use[r];
      f.deficit[r] = f.res[r] < 0;
      if (f.res[r] < 0) f.res[r] = 0;
    }
    if (f.autoTrade) autoTrade(state, f);
    // Development growth driven by the infrastructure budget.
    const growth = (f.budget.infra / 100) * 0.0005 * (1 + mod(state, f.id, 'growth') + modSum(state, f.id, 'growth'));
    if (growth > 0) {
      for (const s of Object.values(state.systems)) {
        if (s.owner !== f.id || s.controller !== f.id || s.destroyed) continue;
        const cap = 10;
        const g2 = growth * (1 + buildingFx(s, 'growth')) * (s.stability >= 40 ? 1 : 0.3);
        s.dev = Math.min(cap, s.dev + g2);
        if (s.stability > 50 && s.pop > 0) s.pop *= 1 + 0.00002;
      }
    }
  }
  marketDay(state);
  constructionDay(state);
  productionDay(state);
}

// ---------------------------------------------------------------- galactic market

export function marketPrice(state, r) {
  return state.market[r].price;
}

function fee(state, fid) {
  return Math.max(0.03, 0.1 + mod(state, fid, 'fee'));
}

export function buyResource(state, fid, r, qty) {
  const f = fac(state, fid);
  qty = Math.floor(qty);
  if (qty <= 0) return { ok: false, msg: 'Quantité invalide.' };
  if (isSanctioned(state, fid)) return { ok: false, msg: 'Votre faction est sous embargo du Sénat.' };
  const cost = qty * marketPrice(state, r) * (1 + fee(state, fid));
  if (cost > f.treasury) return { ok: false, msg: 'Trésorerie insuffisante.' };
  f.treasury -= cost;
  f.marketDay = (f.marketDay || 0) - cost;
  f.res[r] += qty;
  state.market[r].pressure += qty;
  updatePrice(state, r);
  return { ok: true, cost };
}

export function sellResource(state, fid, r, qty) {
  const f = fac(state, fid);
  qty = Math.floor(Math.min(qty, f.res[r]));
  if (qty <= 0) return { ok: false, msg: 'Stock insuffisant.' };
  if (isSanctioned(state, fid)) return { ok: false, msg: 'Votre faction est sous embargo du Sénat.' };
  const gain = qty * marketPrice(state, r) * (1 - fee(state, fid));
  f.treasury += gain;
  f.marketDay = (f.marketDay || 0) + gain;
  f.res[r] -= qty;
  state.market[r].pressure -= qty;
  updatePrice(state, r);
  return { ok: true, gain };
}

function updatePrice(state, r) {
  const m = state.market[r];
  m.price = RES_INFO[r].price * clamp(1 + m.pressure / RES_INFO[r].volume, 0.4, 3);
}

function marketDay(state) {
  for (const r of RES) {
    state.market[r].pressure *= 0.97;
    updatePrice(state, r);
    const hist = state.market[r].history;
    if (state.day % 10 === 0) {
      hist.push(Math.round(state.market[r].price * 100) / 100);
      if (hist.length > 36) hist.shift();
    }
  }
}

function autoTrade(state, f) {
  if (isSanctioned(state, f.id)) return;
  const e = f.econ;
  for (const r of RES) {
    const reserve = Math.max(RES_INFO[r].reserve, (e.use[r] - e.prod[r]) * 60, e.use[r] * 30);
    if (f.res[r] > reserve * 2 + 30) sellResource(state, f.id, r, f.res[r] - reserve * 1.5);
    else if (f.res[r] < reserve * 0.5 && f.treasury > 200) {
      const want = reserve - f.res[r];
      const affordable = (f.treasury * 0.2) / (marketPrice(state, r) * 1.1);
      buyResource(state, f.id, r, Math.min(want, affordable));
    }
  }
}

// ---------------------------------------------------------------- costs

export function canAfford(state, fid, cost, qty = 1) {
  const f = fac(state, fid);
  if ((cost.cr || 0) * qty > f.treasury) return false;
  for (const r of RES) if ((cost[r] || 0) * qty > f.res[r]) return false;
  return true;
}

export function pay(state, fid, cost, qty = 1) {
  const f = fac(state, fid);
  f.treasury -= (cost.cr || 0) * qty;
  for (const r of RES) f.res[r] -= (cost[r] || 0) * qty;
}

export function missingFor(state, fid, cost, qty = 1) {
  const f = fac(state, fid);
  const missing = [];
  if ((cost.cr || 0) * qty > f.treasury) missing.push('crédits');
  for (const r of RES) if ((cost[r] || 0) * qty > f.res[r]) missing.push(RES_INFO[r].name.toLowerCase());
  return missing;
}

// ---------------------------------------------------------------- buildings

export function buildingCost(state, fid, id) {
  const b = BUILDINGS[id];
  const mult = 1 + Math.min(0, mod(state, fid, 'buildCost'));
  const out = {};
  for (const k in b.cost) out[k] = Math.round(b.cost[k] * mult);
  return out;
}

/** Why a building cannot be queued here (null if it can). */
export function buildingBlocker(state, fid, sysId, id) {
  const s = state.systems[sysId];
  const b = BUILDINGS[id];
  const stat = staticSystem(sysId);
  if (s.destroyed) return 'Système détruit.';
  if (s.owner !== fid || s.controller !== fid) return 'Vous ne contrôlez pas ce système.';
  if (s.battle) return 'Combat en cours.';
  if (s.buildings.length + s.build.length >= slotCount(state, s)) return 'Aucun emplacement libre.';
  if (b.deposit && !s.res[b.deposit]) return 'Aucun gisement.';
  if (b.minDev && s.dev < b.minDev) return `Développement ${b.minDev} requis.`;
  if (b.tech && !state.factions[fid].techs.includes(b.tech)) return 'Technologie requise.';
  if (b.tag && !stat.tags.includes(b.tag)) return 'Chantier naval majeur requis.';
  if (b.deposit && (buildingCount(s, id) + s.build.filter((q) => q.b === id).length) >= 1) return 'Déjà construit.';
  if (id === 'shipyard' && buildingCount(s, id) + s.build.filter((q) => q.b === id).length >= 1) return 'Déjà construit.';
  if (b.unique) {
    const already = Object.values(state.systems).some((x) => x.owner === fid && (x.buildings.includes(id) || x.build.some((q) => q.b === id)));
    if (already) return 'Un seul mégaprojet à la fois.';
    if (state.superweapons.some((sw) => sw.owner === fid && sw.type !== 'starkiller')) return 'Vous possédez déjà une station de combat.';
  }
  const cost = buildingCost(state, fid, id);
  const missing = missingFor(state, fid, cost);
  if (missing.length) return `Manque : ${missing.join(', ')}.`;
  return null;
}

export function queueBuilding(state, fid, sysId, id) {
  const blocker = buildingBlocker(state, fid, sysId, id);
  if (blocker) return { ok: false, msg: blocker };
  const cost = buildingCost(state, fid, id);
  pay(state, fid, cost);
  const days = Math.max(5, Math.round(BUILDINGS[id].days * (1 + mod(state, fid, 'buildTime'))));
  state.systems[sysId].build.push({ b: id, days, total: days, cost });
  return { ok: true };
}

export function cancelBuilding(state, fid, sysId, index) {
  const s = state.systems[sysId];
  const item = s.build[index];
  if (!item || s.owner !== fid) return;
  const f = fac(state, fid);
  f.treasury += (item.cost.cr || 0) * 0.5;
  for (const r of RES) f.res[r] += (item.cost[r] || 0) * 0.5;
  s.build.splice(index, 1);
}

export function demolishBuilding(state, fid, sysId, index) {
  const s = state.systems[sysId];
  if (s.owner !== fid || s.controller !== fid) return;
  s.buildings.splice(index, 1);
}

function constructionDay(state) {
  for (const s of Object.values(state.systems)) {
    if (!s.build.length) continue;
    if (s.controller !== s.owner || s.battle || s.destroyed) continue;
    const item = s.build[0];
    item.days -= 1;
    if (item.days > 0) continue;
    s.build.shift();
    const b = BUILDINGS[item.b];
    if (b.fx.mega) {
      completeMegaproject(state, s);
      continue;
    }
    s.buildings.push(item.b);
    if (item.b === 'shield') s.shield = shieldMax(state, s);
    if (state.factions[s.owner].isPlayer) news(state, { text: `${b.name} achevé sur ${staticSystem(s.id).name}.`, kind: 'build', faction: s.owner, sys: s.id });
  }
}

export function shieldMax(state, s) {
  if (!s.owner) return 0;
  return buildingFx(s, 'shield') * (1 + mod(state, s.owner, 'shield'));
}

function completeMegaproject(state, s) {
  const owner = s.owner;
  const style = state.factions[owner].style;
  const stack = addUnits(state, owner, s.id, 'battlestation', 1);
  stack.station = true;
  const name = style === 'imperial' || style === 'clone' ? 'Étoile de la Mort' : 'Station de combat';
  stack.name = name;
  state.superweapons.push({ id: newId(state, 'w'), type: 'deathstar', name, owner, stackId: stack.id, sys: null, charge: 0, plans: {}, fired: 0 });
  state.tension = Math.min(100, state.tension + 15);
  news(state, { text: `${state.factions[owner].name} achève la construction d’une ${name} en orbite de ${staticSystem(s.id).name} !`, kind: 'superweapon', faction: owner, sys: s.id, important: true });
}

// ---------------------------------------------------------------- units

export function unitCost(state, fid, type) {
  const u = UNIT_TYPES[type];
  const mult = 1 + modSum(state, fid, 'milCost');
  const out = {};
  for (const k in u.cost) out[k] = Math.round(u.cost[k] * mult);
  return out;
}

export const lineOf = (type) => ({ ground: 'ground', air: 'air', ship: 'ship' })[UNIT_TYPES[type].cat];

export function recruitBlocker(state, fid, sysId, type, qty = 1) {
  const s = state.systems[sysId];
  const u = UNIT_TYPES[type];
  const f = fac(state, fid);
  if (u.cat === 'station') return 'Les stations de combat sont des mégaprojets.';
  if (s.owner !== fid || s.controller !== fid) return 'Vous ne contrôlez pas ce système.';
  if (s.battle) return 'Combat en cours.';
  if (u.requires?.tech && !unlocked(state, fid, 'superdestroyer')) return 'Technologie « Super-cuirassés » requise.';
  if (u.requires?.tag && !staticSystem(sysId).tags.includes(u.requires.tag)) return 'Chantier naval majeur requis.';
  const lines = productionLines(state, s);
  if (!lines[lineOf(type)]) {
    return { ground: 'Caserne requise.', air: 'Base de chasseurs ou chantier naval requis.', ship: 'Chantier naval requis.' }[lineOf(type)];
  }
  if (!gov(state, fid).droids && u.mp * qty > f.manpower) return 'Effectifs insuffisants.';
  const missing = missingFor(state, fid, unitCost(state, fid, type), qty);
  if (missing.length) return `Manque : ${missing.join(', ')}.`;
  return null;
}

export function recruit(state, fid, sysId, type, qty = 1) {
  const blocker = recruitBlocker(state, fid, sysId, type, qty);
  if (blocker) return { ok: false, msg: blocker };
  const f = fac(state, fid);
  pay(state, fid, unitCost(state, fid, type), qty);
  if (!gov(state, fid).droids) f.manpower -= UNIT_TYPES[type].mp * qty;
  const days = Math.max(3, Math.round(UNIT_TYPES[type].days * (1 + mod(state, fid, 'prodTime') + modSum(state, fid, 'prodTime'))));
  for (let i = 0; i < qty; i++) f.production.push({ id: newId(state, 'p'), t: type, sys: sysId, days, total: days });
  return { ok: true };
}

export function cancelProduction(state, fid, itemId) {
  const f = fac(state, fid);
  const index = f.production.findIndex((p) => p.id === itemId);
  if (index < 0) return;
  const item = f.production[index];
  const cost = unitCost(state, fid, item.t);
  f.treasury += (cost.cr || 0) * 0.75;
  for (const r of RES) f.res[r] += (cost[r] || 0) * 0.75;
  if (!gov(state, fid).droids) f.manpower += UNIT_TYPES[item.t].mp;
  f.production.splice(index, 1);
}

function productionDay(state) {
  for (const f of aliveFactions(state)) {
    if (!f.production.length) continue;
    const used = {};
    const keep = [];
    for (const item of f.production) {
      const s = state.systems[item.sys];
      if (s.controller !== f.id || s.owner !== f.id) continue; // Lost with the system.
      const line = lineOf(item.t);
      const key = `${item.sys}:${line}`;
      const lines = productionLines(state, s)[line];
      used[key] = (used[key] || 0) + 1;
      if (used[key] <= lines && !s.battle) item.days -= 1;
      if (item.days <= 0) {
        const xp = buildingFx(s, 'xp');
        addUnits(state, f.id, item.sys, item.t, 1, xp);
      } else keep.push(item);
    }
    f.production = keep;
  }
}

export function setTax(state, fid, rate) {
  fac(state, fid).taxRate = clamp(Math.round(rate), 0, 60);
}

export function setBudget(state, fid, key, pct) {
  const f = fac(state, fid);
  const others = Object.keys(BUDGET_KEYS).filter((k) => k !== key).reduce((acc, k) => acc + f.budget[k], 0);
  f.budget[key] = clamp(Math.round(pct), 0, Math.max(0, 90 - others));
}
