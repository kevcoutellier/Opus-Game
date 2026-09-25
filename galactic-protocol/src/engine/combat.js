// Daily battle resolution: space battle, orbital bombardment, ground invasion, retreats and occupation.
import { UNIT_TYPES } from '../data/units.js';
import { GALAXY } from './galaxy.js';
import {
  atWar, canEnter, fac, friendly, gov, maxHp, neighbors, reveal, stacksAt, staticSystem, warBetween,
} from './query.js';
import { mod } from './research.js';
import { buildingFx, unitCost } from './economy.js';
import { garrisonAttack, garrisonMax } from './military.js';
import { cleanStacks, removeStack } from './stacks.js';
import { jitter, chance } from './rng.js';
import { news, fx } from './news.js';

const DMG = 2.5;

const classOf = (type) => {
  const cat = UNIT_TYPES[type].cat;
  return cat === 'station' ? 'ship' : cat;
};

function attackMult(state, fid, type) {
  const u = UNIT_TYPES[type];
  const f = fac(state, fid);
  const mods = f.mods;
  let m = 1 + (mods[`atk.${type}`] || 0) + (mods[`atk.${u.cat}`] || 0) + (gov(state, fid).military || 0);
  if (f.bankrupt) m -= 0.2;
  if (u.cat !== 'ground' && f.deficit.tib) m -= 0.2;
  if (u.cat === 'ground' && f.deficit.bacta) m -= 0.1;
  return Math.max(0.2, m);
}

function defenseMult(state, fid, type) {
  const mods = fac(state, fid).mods;
  return 1 + (mods[`def.${UNIT_TYPES[type].cat}`] || 0) + (mods[`def.${type}`] || 0);
}

/** Collects the units of a side as combat entries. */
function entries(state, stacks) {
  const out = [];
  for (const stack of stacks) {
    for (const unit of stack.units) out.push({ stack, unit, owner: stack.owner, type: unit.t, cls: classOf(unit.t) });
  }
  return out;
}

/** Damage pools (air / ship / ground) produced by a list of attackers. */
function pools(state, list, factor = { air: 1, ship: 1, ground: 1 }, hangarBonus = 0) {
  const p = { air: 0, ship: 0, ground: 0 };
  for (const e of list) {
    const u = UNIT_TYPES[e.type];
    let m = attackMult(state, e.owner, e.type) * (1 + (e.unit.xp || 0) / 100 * 0.3);
    if (e.cls === 'air') m *= 1 + hangarBonus;
    p.air += u.atk.air * m * factor.air;
    p.ship += u.atk.ship * m * factor.ship;
    p.ground += u.atk.ground * m * factor.ground;
  }
  return p;
}

/** Spreads a damage pool over targets weighted by their size. Returns the value of destroyed units. */
function applyPool(state, pool, targets, onKill) {
  if (pool <= 0 || !targets.length) return;
  let weight = 0;
  for (const t of targets) weight += t.weight ?? maxHp(state, t.owner, t.type);
  for (const t of targets) {
    const w = t.weight ?? maxHp(state, t.owner, t.type);
    const def = t.def ?? UNIT_TYPES[t.type].def * defenseMult(state, t.owner, t.type);
    const dmg = pool * (w / weight) * DMG * jitter(state, 0.15) * (100 / (100 + def * 4)) * (t.dmgMult ?? 1);
    if (t.apply) {
      t.apply(dmg);
      continue;
    }
    const before = t.unit.hp;
    t.unit.hp -= dmg;
    if (before > 0 && t.unit.hp <= 0) onKill(t);
  }
}

function hangarBonus(list) {
  let hangar = 0;
  let air = 0;
  for (const e of list) {
    hangar += UNIT_TYPES[e.type].hangar || 0;
    if (e.cls === 'air') air++;
  }
  return air && hangar >= air ? 0.15 : 0;
}

function sideHp(list) {
  let hp = 0;
  for (const e of list) if (e.unit.hp > 0) hp += e.unit.hp;
  return hp;
}

/** Determines the two sides of a battle in a system, or null if nobody fights. */
function sidesFor(state, s, present) {
  const owners = [...new Set(present.map((st) => st.owner))];
  const ctrl = s.controller;
  if (ctrl && owners.some((o) => atWar(state, o, ctrl))) {
    const attackers = owners.filter((o) => atWar(state, o, ctrl));
    const defenders = [ctrl, ...owners.filter((o) => o !== ctrl && !atWar(state, o, ctrl) && attackers.some((a) => atWar(state, a, o)))];
    return { A: defenders, B: attackers, controllerSide: true };
  }
  for (const a of owners) {
    const foes = owners.filter((b) => atWar(state, a, b));
    if (!foes.length) continue;
    const A = [a, ...owners.filter((o) => o !== a && !foes.includes(o) && foes.some((f) => atWar(state, f, o)))];
    return { A, B: foes, controllerSide: false };
  }
  return null;
}

function recordLoss(state, e, killers) {
  const cost = unitCost(state, e.owner, e.type).cr || 0;
  const f = fac(state, e.owner);
  f.stats.lost += cost;
  f.warWeariness = Math.min(100, f.warWeariness + cost / Math.max(600, (f.econ?.revenue || 0) * 25));
  for (const k of killers) {
    const war = warBetween(state, k, e.owner);
    if (war) {
      if (war.att.includes(k)) war.losses.def += cost;
      else war.losses.att += cost;
    }
    fac(state, k).stats.kills += cost / killers.length;
  }
}

export function combatDay(state) {
  const bySys = {};
  for (const st of Object.values(state.stacks)) {
    if (st.move) continue;
    (bySys[st.sys] ||= []).push(st);
  }
  for (const s of Object.values(state.systems)) s.blockade = false;
  for (const s of Object.values(state.systems)) {
    const present = bySys[s.id] || [];
    const sides = present.length ? sidesFor(state, s, present) : null;
    if (!sides) {
      if (s.battle) endBattle(state, s);
      continue;
    }
    fight(state, s, present, sides);
  }
  cleanStacks(state);
}

function fight(state, s, present, { A, B, controllerSide }) {
  const stacksA = present.filter((st) => A.includes(st.owner));
  const stacksB = present.filter((st) => B.includes(st.owner));
  const all = { A: entries(state, stacksA), B: entries(state, stacksB) };
  const garrisonSide = controllerSide ? 'A' : null;
  if (!s.battle) {
    s.battle = { since: state.day, A: [...A], B: [...B], hp0: { A: sideHp(all.A), B: sideHp(all.B) } };
    for (const f of [...A, ...B]) reveal(state, f, s.id);
    const involved = [...A, ...B];
    if (involved.includes(state.player)) {
      news(state, { text: `Combat à ${staticSystem(s.id).name} : ${B.map((f) => fac(state, f).short).join(', ')} contre ${A.map((f) => fac(state, f).short).join(', ')}.`, kind: 'battle', sys: s.id, faction: state.player, important: true, visibleTo: involved });
    }
  } else {
    s.battle.A = [...A];
    s.battle.B = [...B];
  }
  s.battle.day = state.day;
  const onKill = (sideKiller) => (t) => recordLoss(state, t, sideKiller === 'A' ? A : B);

  const space = { A: all.A.filter((e) => e.cls !== 'ground'), B: all.B.filter((e) => e.cls !== 'ground') };
  const ground = { A: all.A.filter((e) => e.cls === 'ground'), B: all.B.filter((e) => e.cls === 'ground') };
  const satk = garrisonSide && s.controller ? buildingFx(s, 'satk') : 0;
  const shieldUp = () => garrisonSide && s.shield > 0;

  // 1. Space battle.
  if (space.A.length && space.B.length) {
    const pA = pools(state, space.A, undefined, hangarBonus(space.A));
    const pB = pools(state, space.B, undefined, hangarBonus(space.B));
    pA.ship += satk * 0.8;
    pA.air += satk * 0.2;
    spaceExchange(state, pA, space.B, onKill('A'));
    spaceExchange(state, pB, space.A, onKill('B'));
    fx(state, { type: 'battle', sys: s.id });
  } else if (space.B.length && !space.A.length && garrisonSide) {
    // 2. Orbital bombardment and blockade by the attacker; planetary guns fire back.
    s.blockade = true;
    const pB = pools(state, space.B, { air: 0, ship: 0, ground: 0.3 });
    const targets = bombardTargets(state, s, ground.A);
    applyPool(state, pB.ground, targets, onKill('B'));
    if (satk) spaceExchange(state, { air: satk * 0.2, ship: satk * 0.8, ground: 0 }, space.B, onKill('A'));
    if (ground.B.length || satk) fx(state, { type: 'battle', sys: s.id });
  } else if (space.A.length && !space.B.length && ground.B.length) {
    // Transports without escort are shot down.
    const pA = pools(state, space.A, { air: 0, ship: 0.3, ground: 0.3 });
    applyPool(state, pA.ship + pA.ground, ground.B.filter((e) => e.unit.hp > 0), onKill('A'));
    fx(state, { type: 'battle', sys: s.id });
  }

  // Superweapon weak points exploited by fighters.
  exhaustPort(state, s, stacksA, space.B);
  exhaustPort(state, s, stacksB, space.A);
  if (thermalOscillator(state, s, [...space.A, ...space.B])) return;

  // 3. Ground invasion once the attacker controls orbit.
  const spaceALeft = space.A.some((e) => e.unit.hp > 0);
  const groundB = ground.B.filter((e) => e.unit.hp > 0);
  if (garrisonSide && groundB.length && !spaceALeft) {
    const groundA = ground.A.filter((e) => e.unit.hp > 0);
    const airB = space.B.filter((e) => e.unit.hp > 0);
    const pB = pools(state, groundB, { air: 0, ship: 0, ground: 1 });
    const supportB = pools(state, airB, { air: 0, ship: 0, ground: 1 });
    let attack = pB.ground + supportB.ground * 0.35;
    const invasion = B.reduce((acc, f) => Math.max(acc, mod(state, f, 'invasion')), 0);
    const siege = B.reduce((acc, f) => Math.max(acc, mod(state, f, 'siege')), 0);
    const artillery = groundB.filter((e) => e.type === 'artillery').length / groundB.length;
    attack *= 1 + invasion;
    if (shieldUp()) {
      const onShield = attack * 0.5 * (1 + siege + artillery * 0.6);
      s.shield = Math.max(0, s.shield - onShield * DMG);
      attack *= 0.25;
    }
    const pA = pools(state, groundA, { air: 0, ship: 0, ground: 1 });
    const defense = pA.ground + garrisonAttack(s);
    const targetsA = bombardTargets(state, s, groundA, 1 + siege + artillery * 0.6);
    applyPool(state, attack, targetsA, onKill('B'));
    applyPool(state, defense, groundB, onKill('A'));
    fx(state, { type: 'ground', sys: s.id });
    const defendersLeft = groundA.some((e) => e.unit.hp > 0) || s.garrison > 1;
    const attackersLeft = groundB.filter((e) => e.unit.hp > 0);
    if (!defendersLeft && attackersLeft.length) {
      const power = {};
      for (const e of attackersLeft) power[e.owner] = (power[e.owner] || 0) + e.unit.hp;
      const capturer = Object.entries(power).sort((a, b) => b[1] - a[1])[0][0];
      cleanStacks(state);
      capture(state, s, capturer);
      return;
    }
  }

  // Experience for survivors.
  for (const e of [...all.A, ...all.B]) if (e.unit.hp > 0) e.unit.xp = Math.min(100, (e.unit.xp || 0) + 0.5);

  // 4. Retreats of beaten sides.
  cleanStacks(state);
  for (const side of ['A', 'B']) {
    const hp = sideHp(all[side]);
    if (!hp || hp > s.battle.hp0[side] * 0.3) continue;
    const other = side === 'A' ? 'B' : 'A';
    const interdicted = all[other].some((e) => e.unit.hp > 0 && UNIT_TYPES[e.type].hangar && mod(state, e.owner, 'interdict'));
    if (interdicted) continue;
    for (const stack of side === 'A' ? stacksA : stacksB) {
      if (!state.stacks[stack.id] || stack.station) continue;
      retreat(state, stack, s);
    }
  }
}

function spaceExchange(state, pool, targetsAll, onKill) {
  const targets = targetsAll.filter((e) => e.unit.hp > 0);
  const air = targets.filter((e) => e.cls === 'air');
  const ships = targets.filter((e) => e.cls === 'ship');
  let a = pool.air;
  let sh = pool.ship;
  if (!air.length) {
    sh += a * 0.3;
    a = 0;
  }
  if (!ships.length) {
    a += sh * 0.3;
    sh = 0;
  }
  applyPool(state, a, air, onKill);
  applyPool(state, sh, ships, onKill);
}

/** Ground targets of a system: defending troops, then the garrison (shield first when up). */
function bombardTargets(state, s, groundA, garrisonMult = 1) {
  const targets = groundA.filter((e) => e.unit.hp > 0);
  if (s.shield > 0) {
    targets.push({ weight: Math.max(200, s.shield), def: 10, apply: (dmg) => { s.shield = Math.max(0, s.shield - dmg); } });
    return targets;
  }
  if (s.garrison > 0) {
    const gdef = buildingFx(s, 'gdef');
    targets.push({
      weight: Math.max(50, garrisonMax(state, s)), def: 3, dmgMult: garrisonMult * (1 - gdef),
      apply: (dmg) => { s.garrison = Math.max(0, s.garrison - dmg); },
    });
  }
  return targets;
}

function exhaustPort(state, s, stationSideStacks, enemySpace) {
  for (const stack of stationSideStacks) {
    if (!stack.station) continue;
    const sw = state.superweapons.find((w) => w.stackId === stack.id);
    if (!sw) continue;
    const pilots = enemySpace.filter((e) => e.unit.hp > 0 && (e.type === 'fighter' || e.type === 'bomber') && sw.plans[e.owner]);
    if (!pilots.length || !chance(state, 0.05 * Math.min(1, pilots.length / 6))) continue;
    const hero = pilots[0].owner;
    news(state, { text: `Un pilote de ${fac(state, hero).name} a touché le point faible : ${sw.name} explose au-dessus de ${staticSystem(s.id).name} !`, kind: 'superweapon', faction: hero, sys: s.id, important: true });
    fx(state, { type: 'explosion', sys: s.id, big: true });
    fac(state, hero).stats.kills += 20000;
    destroySuperweapon(state, sw);
    removeStack(state, stack.id);
  }
}

/** Fixed superweapons (Starkiller): a raid that knows the weak point can blow up the whole planet. */
function thermalOscillator(state, s, space) {
  const sw = state.superweapons.find((w) => w.sys === s.id);
  if (!sw) return false;
  const pilots = space.filter((e) => e.unit.hp > 0 && (e.type === 'fighter' || e.type === 'bomber') && sw.plans[e.owner] && atWar(state, e.owner, sw.owner));
  if (!pilots.length || !chance(state, 0.06 * Math.min(1, pilots.length / 6))) return false;
  const hero = pilots[0].owner;
  news(state, { text: `L’oscillateur thermique de la ${sw.name} est détruit ! ${staticSystem(s.id).name} se désintègre.`, kind: 'superweapon', faction: hero, sys: s.id, important: true });
  fac(state, hero).stats.kills += 30000;
  obliterate(state, s.id, { spare: (st) => st.owner !== sw.owner });
  return true;
}

export function destroySuperweapon(state, sw) {
  state.superweapons = state.superweapons.filter((w) => w !== sw);
  state.tension = Math.max(0, state.tension - 10);
}

/** Wipes out a system (superlaser, Starkiller or exploding planet). */
export function obliterate(state, sysId, { spare = () => false } = {}) {
  const s = state.systems[sysId];
  const owner = s.owner;
  for (const st of stacksAt(state, sysId)) if (!spare(st)) removeStack(state, st.id);
  s.destroyed = true;
  s.pop = 0;
  s.dev = 0;
  s.buildings = [];
  s.build = [];
  s.garrison = 0;
  s.shield = 0;
  s.owner = null;
  s.controller = null;
  s.battle = null;
  s.sympathy = 0;
  for (const sw of [...state.superweapons]) if (sw.sys === sysId) destroySuperweapon(state, sw);
  fx(state, { type: 'explosion', sys: sysId, big: true });
  if (owner && state.factions[owner]?.capital === sysId) state.factions[owner].capital = null;
}

function retreat(state, stack, s) {
  const options = neighbors(s.id).filter((n) => {
    const t = state.systems[n];
    if (!canEnter(state, stack.owner, n)) return false;
    if (!t.controller || !(t.controller === stack.owner || friendly(state, stack.owner, t.controller))) return false;
    return !stacksAt(state, n).some((o) => atWar(state, o.owner, stack.owner));
  });
  if (!options.length) return;
  options.sort((a, b) => GALAXY.adj[s.id].find((e) => e.to === a).lane.len - GALAXY.adj[s.id].find((e) => e.to === b).lane.len);
  stack.path = [options[0]];
  stack.dest = options[0];
  stack.retreating = true;
  if (stack.owner === state.player) news(state, { text: `${stack.name} bat en retraite de ${staticSystem(s.id).name}.`, kind: 'battle', sys: s.id, faction: stack.owner });
}

function endBattle(state, s) {
  s.battle = null;
}

export function capture(state, s, by) {
  const name = staticSystem(s.id).name;
  const prev = s.controller;
  if (!s.owner) {
    s.owner = by;
    s.acquired = state.day;
  }
  s.controller = s.owner && friendly(state, by, s.owner) ? s.owner : by;
  // Worlds liberated by an insurgent movement join it at once.
  const joins = gov(state, by).insurgent && s.owner !== by && (s.sympathy || 0) >= 30;
  if (joins) {
    s.owner = by;
    s.acquired = state.day;
    s.revealed = [];
  }
  s.garrison = garrisonMax(state, s) * 0.3;
  s.shield = 0;
  s.battle = null;
  s.build = [];
  if (s.controller !== s.owner) {
    s.stability = Math.min(s.stability, 30);
    s.occupied = state.day;
  }
  const f = fac(state, by);
  f.stats.captures += 1;
  const capital = prev && state.factions[prev]?.capital === s.id;
  news(state, {
    text: joins ? `${name} se soulève et rejoint ${f.name} !` : s.controller === s.owner && s.owner !== by
      ? `${f.name} libère ${name} au profit de ${fac(state, s.owner).name}.`
      : `${f.name} s’empare de ${name}${prev ? ` (${fac(state, prev).short})` : ''}${capital ? ' — la capitale est tombée !' : '.'}`,
    kind: 'capture', faction: by, sys: s.id, important: capital || by === state.player || prev === state.player,
  });
  fx(state, { type: 'capture', sys: s.id, faction: by });
}
