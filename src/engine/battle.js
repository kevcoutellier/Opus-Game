// Gen 1 battle engine following Pokémon Stadium's mechanics (as documented by
// Pokémon Showdown's "gen1stadium" mod). It is pure logic: every turn returns a
// list of events that the 3D scene and the HUD play back.
//
// Stadium differences from the cartridges that are implemented here:
//  - crit chance: ((baseSpe + 76) >> 2) << 1, Focus Energy works (x4 + 160)
//  - no 1/256 miss on 100% moves, sleep lasts 1-3 turns
//  - Hyper Beam recharges even after a KO, Substitute blocks status and drain
//  - stats are recalculated from scratch, so par/brn drops don't stack

import { Rng } from './rng.js';
import { BOOSTABLE, clearOnSwitch, recalcStats } from './pokemon.js';

// Stadium accuracy/evasion table (Gen 2 table, 1/3 at -6).
const ACC_TABLE = [1 / 3, 0.36, 0.43, 0.5, 0.66, 0.75, 1, 1.33, 1.66, 2, 2.33, 2.66, 3];
const MULTIHIT_2_5 = [2, 2, 2, 3, 3, 3, 4, 5];
const METRONOME_BANNED = new Set(['metronome', 'struggle']);
const LOCKING = ['recharge', 'charging', 'rampage', 'bide', 'trapping'];

export class Battle {
  /**
   * @param {object} opts
   * @param {object} opts.data   gen1.json
   * @param {Array<{name: string, pokemon: object[]}>} opts.sides  two trainers
   * @param {number} [opts.seed]
   */
  constructor({ data, sides, seed = Date.now(), rules = {} }) {
    this.data = data;
    this.rng = new Rng(seed);
    this.sides = sides.map((s, i) => ({ index: i, name: s.name, pokemon: s.pokemon, active: 0 }));
    this.rules = { sleepClause: true, freezeClause: true, ...rules };
    this.turn = 0;
    this.winner = null;
    this.events = [];
    this.faintedThisTurn = false;
  }

  // ---------------------------------------------------------------- helpers

  active(side) {
    const s = this.sides[side];
    return s.pokemon[s.active];
  }

  foeOf(side) {
    return 1 - side;
  }

  sideOf(mon) {
    return this.sides.findIndex((s) => s.pokemon.includes(mon));
  }

  emit(type, props = {}) {
    const ev = { type, ...props };
    if (ev.side !== undefined && ev.name === undefined) ev.name = this.active(ev.side)?.name;
    this.events.push(ev);
    return ev;
  }

  flush() {
    const out = this.events;
    this.events = [];
    return out;
  }

  typeMultiplier(moveType, defTypes) {
    let mult = 1;
    for (const t of defTypes) mult *= this.data.typeChart[moveType]?.[t] ?? 1;
    return mult;
  }

  get isOver() {
    return this.winner !== null;
  }

  aliveCount(side) {
    return this.sides[side].pokemon.filter((p) => !p.fainted).length;
  }

  // ------------------------------------------------------------- public API

  start() {
    for (const side of [0, 1]) this.sendOut(side, 0, true);
    return this.flush();
  }

  /** What the given side may do this turn. */
  getRequest(side) {
    if (this.isOver) return { kind: 'none' };
    const mon = this.active(side);
    const bench = this.sides[side].pokemon
      .map((p, i) => ({ p, i }))
      .filter(({ p, i }) => !p.fainted && i !== this.sides[side].active)
      .map(({ i }) => i);
    if (mon.fainted) return { kind: 'switch', switches: bench };
    if (LOCKING.some((v) => mon.volatiles[v])) return { kind: 'locked', switches: [] };
    const moves = mon.moves.map((m, index) => {
      const disabled = mon.volatiles.disable?.moveId === m.id;
      return { index, id: m.id, pp: m.pp, maxPp: m.maxPp, disabled, usable: m.pp > 0 && !disabled };
    });
    const struggle = !moves.some((m) => m.usable);
    return { kind: 'move', moves, struggle, switches: bench };
  }

  needsReplacement(side) {
    return !this.isOver && this.active(side).fainted && this.aliveCount(side) > 0;
  }

  /** Sends in a replacement after a faint (outside of a regular turn). */
  replace(side, index) {
    this.sendOut(side, index);
    return this.flush();
  }

  /**
   * Plays a full turn.
   * @param {Array<{type: 'move'|'switch'|'locked', index?: number}>} actions per side
   */
  playTurn(actions) {
    if (this.isOver) return [];
    this.turn++;
    this.faintedThisTurn = false;
    this.emit('turn', { turn: this.turn });

    // Switches happen before any move.
    for (const side of [0, 1]) {
      if (actions[side]?.type === 'switch') this.switchOut(side, actions[side].index);
    }

    const movers = [0, 1].filter((side) => actions[side]?.type !== 'switch');
    const order = movers
      .map((side) => ({ side, priority: this.actionPriority(side, actions[side]), speed: this.active(side).stats.spe, tie: this.rng.next() }))
      .sort((a, b) => b.priority - a.priority || b.speed - a.speed || a.tie - b.tie)
      .map((o) => o.side);

    for (const side of order) {
      if (this.isOver || this.faintedThisTurn) break;
      const mon = this.active(side);
      if (mon.fainted) continue;
      this.runAction(side, actions[side]);
      if (!this.isOver && !this.faintedThisTurn) this.residual(side);
    }
    // Pokémon that switched still take residual damage.
    for (const side of [0, 1]) {
      if (actions[side]?.type === 'switch' && !this.isOver && !this.faintedThisTurn) this.residual(side);
    }

    for (const side of [0, 1]) delete this.active(side).volatiles.flinch;
    this.checkWin();
    return this.flush();
  }

  // ----------------------------------------------------------- turn pieces

  actionPriority(side, action) {
    const mon = this.active(side);
    if (!action || action.type !== 'move') return 0;
    const id = mon.moves[action.index]?.id;
    return id ? this.data.moves[id].priority : 0;
  }

  sendOut(side, index, initial = false) {
    const s = this.sides[side];
    s.active = index;
    const mon = s.pokemon[index];
    clearOnSwitch(mon);
    this.emit('switchIn', { side, index, num: mon.num, hp: mon.hp, maxHp: mon.maxHp, initial });
  }

  switchOut(side, index) {
    const mon = this.active(side);
    this.emit('switchOut', { side });
    this.releaseTrap(mon);
    this.restoreMimic(mon);
    clearOnSwitch(mon);
    this.sendOut(side, index);
  }

  releaseTrap(mon) {
    const side = this.sideOf(mon);
    const foe = this.active(this.foeOf(side));
    if (mon.volatiles.trapping) delete foe.volatiles.trapped;
    if (mon.volatiles.trapped) delete foe.volatiles.trapping;
  }

  restoreMimic(mon) {
    const mimic = mon.volatiles.mimic;
    if (mimic) mon.moves[mimic.slot] = mimic.original;
  }

  runAction(side, action) {
    const mon = this.active(side);
    const v = mon.volatiles;

    if (v.recharge) {
      delete v.recharge;
      this.emit('cant', { side, reason: 'recharge' });
      return;
    }
    if (!this.canMove(side)) {
      this.interruptLocks(mon);
      return;
    }

    if (v.bide) return this.continueBide(side);
    if (v.trapping) return this.continueTrap(side);
    if (v.charging) {
      const { moveId } = v.charging;
      delete v.charging;
      delete v.semiInvulnerable;
      return this.useMove(side, moveId, { charged: true });
    }
    if (v.rampage) {
      const rampage = v.rampage;
      this.useMove(side, rampage.moveId, { locked: true });
      if (mon.fainted || !mon.volatiles.rampage) return;
      rampage.turns--;
      if (rampage.turns <= 0) {
        delete v.rampage;
        this.emit('fatigue', { side });
        this.confuse(mon, side);
      }
      return;
    }

    if (action?.type !== 'move') return;
    const req = this.getRequest(side);
    if (req.kind !== 'move') return;
    if (req.struggle || action.index < 0) return this.useMove(side, 'struggle', { locked: true });
    const slot = mon.moves[action.index];
    if (!slot || slot.pp <= 0 || v.disable?.moveId === slot.id) {
      this.emit('cant', { side, reason: 'disable' });
      return;
    }
    slot.pp--;
    this.useMove(side, slot.id);
  }

  /** Sleep, freeze, trap, flinch, confusion, disable and paralysis checks. */
  canMove(side) {
    const mon = this.active(side);
    const v = mon.volatiles;
    if (mon.status === 'slp') {
      mon.sleepTurns--;
      this.emit('cant', { side, reason: 'slp' });
      if (mon.sleepTurns <= 0) this.cureStatus(mon, side, 'wake');
      return false;
    }
    if (mon.status === 'frz') {
      this.emit('cant', { side, reason: 'frz' });
      return false;
    }
    if (v.trapped) {
      this.emit('cant', { side, reason: 'trapped' });
      return false;
    }
    if (v.flinch) {
      delete v.flinch;
      this.emit('cant', { side, reason: 'flinch' });
      return false;
    }
    if (v.disable) {
      v.disable.turns--;
      if (v.disable.turns <= 0) {
        delete v.disable;
        this.emit('disableEnd', { side });
      }
    }
    if (v.confusion) {
      v.confusion--;
      if (v.confusion <= 0) {
        delete v.confusion;
        this.emit('confusionEnd', { side });
      } else {
        this.emit('confused', { side });
        if (this.rng.chance(1, 2)) {
          const dmg = this.computeDamage(mon, mon, { power: 40, type: '???', category: 'Physical' }, { noCrit: true });
          this.emit('hitSelf', { side });
          this.dealDamage(mon, side, dmg.damage, { source: 'confusion' });
          return false;
        }
      }
    }
    if (mon.status === 'par' && this.rng.chance(1, 4)) {
      this.emit('cant', { side, reason: 'par' });
      return false;
    }
    return true;
  }

  interruptLocks(mon) {
    const v = mon.volatiles;
    this.releaseTrap(mon);
    delete v.charging;
    delete v.semiInvulnerable;
    delete v.rampage;
    delete v.bide;
    delete v.trapping;
  }

  // ------------------------------------------------------------- move usage

  useMove(side, moveId, { charged = false, locked = false, called = false } = {}) {
    const user = this.active(side);
    const foeSide = this.foeOf(side);
    const target = this.active(foeSide);
    let move = this.data.moves[moveId];

    this.emit('move', { side, moveId: move.id, moveName: move.nameFr, moveType: move.type, category: move.category, called });

    if (move.id === 'metronome') {
      const pool = Object.values(this.data.moves).filter((m) => !METRONOME_BANNED.has(m.id));
      return this.useMove(side, this.rng.pick(pool).id, { called: true });
    }
    if (move.id === 'mirrormove') {
      const last = target.lastMove;
      if (!last || last === 'mirrormove') return this.emit('fail', { side });
      return this.useMove(side, last, { called: true });
    }

    user.lastMove = move.id;
    if (move.id !== 'rage') delete user.volatiles.rage;

    if (move.charge && !charged) {
      user.volatiles.charging = { moveId: move.id };
      if (move.semiInvulnerable) user.volatiles.semiInvulnerable = move.id;
      this.emit('charge', { side, moveId: move.id });
      return;
    }

    const special = SPECIAL_MOVES[move.id];
    if (special) return special.call(this, { side, user, foeSide, target, move, locked });
    if (move.category === 'Status') return this.statusMove(side, user, foeSide, target, move);
    return this.attack(side, user, foeSide, target, move);
  }

  rollAccuracy(user, target, move) {
    if (target.volatiles.semiInvulnerable) return false;
    if (move.accuracy == null) return true;
    let acc = Math.floor(move.accuracy * 255 / 100);
    acc = Math.floor(acc * ACC_TABLE[user.boosts.accuracy + 6]);
    acc = Math.floor(acc * ACC_TABLE[-target.boosts.evasion + 6]);
    acc = Math.min(acc, 255);
    return this.rng.int(256) <= acc;
  }

  critChance(user, move) {
    let chance = (user.species.base.spe + 76) >> 2;
    if (user.volatiles.focusenergy) chance = (chance << 2) + 160;
    else chance <<= 1;
    if (move.highCrit) chance <<= 2;
    else chance >>= 1;
    return Math.max(1, Math.min(255, chance));
  }

  /**
   * Stadium damage formula. `opts.roll` (217-255) and `opts.crit` make it
   * deterministic, which the AI uses to estimate damage without touching the RNG.
   */
  computeDamage(user, target, move, opts = {}) {
    const typeless = move.type === '???';
    const eff = typeless ? 1 : this.typeMultiplier(move.type, target.types);
    if (eff === 0) return { damage: 0, eff, crit: false, immune: true };

    if (move.ohko) return { damage: target.hp, eff: 1, crit: false };
    if (move.fixedDamage === 'level') return { damage: user.level, eff: 1, crit: false };
    if (typeof move.fixedDamage === 'number') return { damage: move.fixedDamage, eff: 1, crit: false };
    if (move.id === 'superfang') return { damage: Math.max(1, Math.floor(target.hp / 2)), eff: 1, crit: false };
    if (move.id === 'psywave') {
      const max = Math.floor(user.level * 1.5);
      const damage = opts.roll !== undefined ? Math.floor(max / 2) : this.rng.int(1, max);
      return { damage, eff: 1, crit: false };
    }

    const power = move.power;
    if (!power) return { damage: 0, eff, crit: false };

    let crit = false;
    if (opts.crit !== undefined) crit = opts.crit;
    else if (!opts.noCrit) crit = this.rng.int(256) < this.critChance(user, move);

    const physical = move.category === 'Physical';
    const atkStat = physical ? 'atk' : 'spc';
    const defStat = physical ? 'def' : 'spc';
    let level = user.level;
    let attack;
    let defense;
    if (crit) {
      level *= 2;
      attack = user.baseStats[atkStat];
      defense = target.baseStats[defStat];
    } else {
      attack = user.stats[atkStat];
      defense = target.stats[defStat];
      const screen = physical ? target.volatiles.reflect : target.volatiles.lightscreen;
      if (screen) defense = Math.min(defense * 2, 1998);
    }
    if (attack >= 256 || defense >= 256) {
      attack = Math.max(1, Math.floor(attack / 4) % 256);
      defense = Math.max(1, Math.floor(defense / 4) % 256);
    }
    if (move.selfdestruct && physical) defense = Math.max(1, Math.floor(defense / 2));

    let damage = Math.floor((level * 2) / 5) + 2;
    damage = Math.floor((damage * power * attack) / defense);
    damage = Math.min(Math.floor(damage / 50), 997) + 2;
    if (!typeless && user.types.includes(move.type)) damage += Math.floor(damage / 2);
    if (!typeless) {
      for (const t of target.types) {
        const m = this.data.typeChart[move.type]?.[t] ?? 1;
        if (m > 1) damage = Math.floor((damage * 20) / 10);
        if (m < 1) damage = Math.floor((damage * 5) / 10);
      }
    }
    if (damage > 1) {
      const roll = opts.roll ?? this.rng.int(217, 256);
      damage = Math.floor((damage * roll) / 255);
    }
    return { damage, eff, crit };
  }

  /** Applies damage, routing attacks into a Substitute. Returns damage dealt. */
  dealDamage(mon, side, amount, info = {}) {
    if (amount <= 0 || mon.fainted) return { dealt: 0 };
    const sub = mon.volatiles.substitute;
    if (sub && info.fromAttack) {
      const dealt = Math.min(amount, sub.hp);
      sub.hp -= amount;
      this.emit('subDamage', { side, amount: dealt, crit: info.crit, eff: info.eff });
      if (sub.hp <= 0) {
        delete mon.volatiles.substitute;
        this.emit('subBreak', { side });
      }
      return { dealt, sub: true };
    }
    const dealt = Math.min(amount, mon.hp);
    mon.hp -= dealt;
    this.emit('damage', {
      side, amount: dealt, hp: mon.hp, maxHp: mon.maxHp,
      source: info.source || 'move', crit: info.crit, eff: info.eff,
    });
    if (mon.hp <= 0) this.faint(mon, side);
    return { dealt };
  }

  heal(mon, side, amount) {
    const healed = Math.min(amount, mon.maxHp - mon.hp);
    if (healed <= 0) return 0;
    mon.hp += healed;
    this.emit('heal', { side, amount: healed, hp: mon.hp, maxHp: mon.maxHp });
    return healed;
  }

  faint(mon, side) {
    if (mon.fainted) return;
    mon.hp = 0;
    mon.fainted = true;
    this.faintedThisTurn = true;
    this.interruptLocks(mon);
    this.emit('faint', { side, name: mon.name });
    if (!this.deferWin) this.checkWin(side);
  }

  checkWin(lastFaintedSide) {
    if (this.isOver) return;
    const out = [0, 1].filter((s) => this.aliveCount(s) === 0);
    if (!out.length) return;
    // Stadium: whoever makes both last Pokémon faint (Explosion...) loses.
    const loser = out.length === 2 ? lastFaintedSide ?? 0 : out[0];
    this.winner = this.foeOf(loser);
    this.emit('win', { side: this.winner, trainer: this.sides[this.winner].name });
  }

  attack(side, user, foeSide, target, move, opts = {}) {
    if (!move.selfdestruct) return this.resolveAttack(side, user, foeSide, target, move, opts);
    // The user's own faint must be known before deciding who won.
    this.deferWin = true;
    try {
      this.resolveAttack(side, user, foeSide, target, move, opts);
    } finally {
      this.deferWin = false;
    }
    this.checkWin(side);
  }

  resolveAttack(side, user, foeSide, target, move, { fixed } = {}) {
    if (target.fainted) return this.emit('fail', { side });
    const eff = move.type === '???' ? 1 : this.typeMultiplier(move.type, target.types);
    if (eff === 0) {
      this.emit('immune', { side: foeSide });
      if (move.selfdestruct) this.faint(user, side);
      this.releaseTrap(user);
      delete user.volatiles.trapping;
      return;
    }
    if (move.id === 'dreameater' && target.status !== 'slp') return this.emit('fail', { side });
    if (move.ohko && target.stats.spe > user.stats.spe) return this.emit('fail', { side });

    if (!this.rollAccuracy(user, target, move)) {
      this.emit('miss', { side });
      if (move.id === 'highjumpkick' || move.id === 'jumpkick') this.dealDamage(user, side, 1, { source: 'crash' });
      if (move.selfdestruct) this.faint(user, side);
      delete user.volatiles.rampage;
      return;
    }

    let hits = 1;
    if (Array.isArray(move.multihit)) hits = this.rng.pick(MULTIHIT_2_5);
    else if (move.multihit) hits = move.multihit;

    let result = fixed ?? this.computeDamage(user, target, move);
    if (result.damage === 0 && !result.immune) {
      this.emit('miss', { side });
      return;
    }
    let total = 0;
    let hitSub = false;
    let count = 0;
    for (let i = 0; i < hits; i++) {
      const { dealt, sub } = this.dealDamage(target, foeSide, result.damage, {
        fromAttack: true, crit: result.crit, eff: result.eff,
      });
      count++;
      total += dealt;
      hitSub ||= !!sub;
      if (target.fainted || sub && !target.volatiles.substitute) break;
    }
    if (hits > 1) this.emit('hitCount', { side: foeSide, count });

    target.lastDamageTaken = total;
    target.lastHitType = move.type;
    if (target.volatiles.bide) target.volatiles.bide.damage += total;
    if (target.volatiles.rage && !target.fainted && total > 0) this.boost(target, foeSide, { atk: 1 });

    if (move.recoil && total > 0) {
      this.emit('recoil', { side });
      this.dealDamage(user, side, Math.max(1, Math.floor(total * move.recoil)), { source: 'recoil' });
    }
    if (move.drain && total > 0 && !hitSub) {
      this.heal(user, side, Math.max(1, Math.floor(total * move.drain)));
      this.emit('drain', { side: foeSide });
    }
    if (move.type === 'Fire' && target.status === 'frz' && !target.fainted) this.cureStatus(target, foeSide, 'thaw');

    if (move.secondary && !target.fainted && !hitSub && this.rng.chance(move.secondary.chance)) {
      const sec = move.secondary;
      if (sec.status) this.trySetStatus(target, foeSide, sec.status, { secondary: true, moveType: move.type });
      if (sec.volatile === 'flinch') target.volatiles.flinch = true;
      if (sec.volatile === 'confusion' && !target.volatiles.confusion) this.confuse(target, foeSide);
      if (sec.boosts && !target.volatiles.mist) this.boost(target, foeSide, sec.boosts, { silentFail: true });
    }
    if (move.selfBoosts && !user.fainted) this.boost(user, side, move.selfBoosts);

    if (move.recharge) user.volatiles.recharge = true;
    if (move.rampage && !user.volatiles.rampage) user.volatiles.rampage = { moveId: move.id, turns: this.rng.int(1, 3) };
    if (move.trap && !target.fainted && !user.volatiles.trapping) {
      user.volatiles.trapping = { moveId: move.id, turns: this.rng.pick(MULTIHIT_2_5) - 1, damage: result.damage };
      target.volatiles.trapped = true;
      delete target.volatiles.recharge;
      this.emit('trap', { side: foeSide, moveId: move.id });
      if (user.volatiles.trapping.turns <= 0) this.endTrap(user, target);
    }
    if (move.id === 'rage') user.volatiles.rage = true;
    if (move.id === 'payday') this.emit('payday', { side });
    if (move.selfdestruct) this.faint(user, side);
  }

  continueTrap(side) {
    const user = this.active(side);
    const foeSide = this.foeOf(side);
    const target = this.active(foeSide);
    const trap = user.volatiles.trapping;
    const move = this.data.moves[trap.moveId];
    this.emit('move', { side, moveId: move.id, moveName: move.nameFr, moveType: move.type, category: move.category, continued: true });
    if (!target.volatiles.trapped) {
      delete user.volatiles.trapping;
      return this.emit('fail', { side });
    }
    this.dealDamage(target, foeSide, trap.damage, { fromAttack: true, eff: 1 });
    trap.turns--;
    if (trap.turns <= 0 || target.fainted) this.endTrap(user, target);
  }

  endTrap(user, target) {
    delete user.volatiles.trapping;
    if (target.volatiles.trapped) {
      delete target.volatiles.trapped;
      this.emit('trapEnd', { side: this.sideOf(target) });
    }
  }

  continueBide(side) {
    const user = this.active(side);
    const bide = user.volatiles.bide;
    bide.turns--;
    if (bide.turns > 0) return this.emit('bideStore', { side });
    delete user.volatiles.bide;
    this.emit('bideUnleash', { side });
    const foeSide = this.foeOf(side);
    const target = this.active(foeSide);
    if (!bide.damage || target.volatiles.semiInvulnerable) return this.emit('fail', { side });
    this.dealDamage(target, foeSide, bide.damage * 2, { fromAttack: true, eff: 1 });
  }

  statusMove(side, user, foeSide, target, move) {
    const selfTarget = move.target === 'self';
    const mon = selfTarget ? user : target;
    const monSide = selfTarget ? side : foeSide;

    if (!selfTarget) {
      if (target.fainted) return this.emit('fail', { side });
      if (!this.rollAccuracy(user, target, move)) return this.emit('miss', { side });
      const sub = target.volatiles.substitute;
      if (sub && (move.status || move.volatile || move.boosts)) return this.emit('fail', { side });
    }

    if (move.status) {
      if (move.id === 'thunderwave' && target.types.includes('Ground')) return this.emit('immune', { side: foeSide });
      if (!this.trySetStatus(mon, monSide, move.status, { byMove: true })) return;
    }
    if (move.volatile === 'confusion') {
      if (mon.volatiles.confusion) return this.emit('fail', { side });
      this.confuse(mon, monSide);
    }
    if (move.volatile === 'leechseed') {
      if (mon.types.includes('Grass') || mon.volatiles.leechseed) return this.emit('fail', { side });
      mon.volatiles.leechseed = true;
      this.emit('leechseed', { side: monSide });
    }
    if (move.boosts) {
      if (!selfTarget && mon.volatiles.mist) return this.emit('mistProtect', { side: monSide });
      this.boost(mon, monSide, move.boosts);
    }
  }

  trySetStatus(mon, side, status, { secondary = false, byMove = false, moveType } = {}) {
    if (mon.status) {
      if (!secondary) this.emit(mon.status === status ? 'alreadyStatus' : 'fail', { side, status: mon.status });
      return false;
    }
    const baseStatus = status === 'tox' ? 'psn' : status;
    // Gen 1: a move cannot inflict its own-type status on a Pokémon sharing the
    // type (Body Slam on Normal, Ember on Fire...), and Poison types can't be poisoned.
    if (baseStatus === 'psn' && mon.types.includes('Poison')) {
      if (!secondary) this.emit('immune', { side });
      return false;
    }
    if (secondary && moveType && mon.types.includes(moveType)) return false;
    const team = this.sides[side].pokemon;
    if (this.rules.sleepClause && status === 'slp' && byMove && team.some((p) => p !== mon && p.status === 'slp' && !p.restSleep && !p.fainted)) {
      this.emit('clause', { side, clause: 'sleep' });
      return false;
    }
    if (this.rules.freezeClause && status === 'frz' && team.some((p) => p !== mon && p.status === 'frz' && !p.fainted)) return false;

    mon.status = status;
    mon.restSleep = false;
    if (status === 'slp') mon.sleepTurns = this.rng.int(1, 4);
    if (status === 'tox') mon.toxicCounter = 0;
    recalcStats(mon);
    this.emit('status', { side, status });
    if (status === 'frz' || status === 'slp') this.interruptLocks(mon);
    return true;
  }

  cureStatus(mon, side, reason = 'cure') {
    const status = mon.status;
    mon.status = null;
    mon.sleepTurns = 0;
    mon.toxicCounter = 0;
    mon.restSleep = false;
    recalcStats(mon);
    this.emit('cure', { side, status, reason });
  }

  confuse(mon, side) {
    mon.volatiles.confusion = this.rng.int(2, 6);
    this.emit('confusion', { side });
  }

  boost(mon, side, boosts, { silentFail = false } = {}) {
    let changed = false;
    for (const [stat, delta] of Object.entries(boosts)) {
      const before = mon.boosts[stat];
      const after = Math.max(-6, Math.min(6, before + delta));
      if (after === before) {
        if (!silentFail) this.emit('boostFail', { side, stat, up: delta > 0 });
        continue;
      }
      mon.boosts[stat] = after;
      changed = true;
      this.emit('boost', { side, stat, amount: after - before });
    }
    recalcStats(mon);
    return changed;
  }

  residual(side) {
    const mon = this.active(side);
    if (mon.fainted) return;
    const eighth = Math.max(1, Math.floor(mon.maxHp / 16));
    if (mon.status === 'psn' || mon.status === 'brn') {
      this.dealDamage(mon, side, eighth, { source: mon.status });
    } else if (mon.status === 'tox') {
      mon.toxicCounter++;
      this.dealDamage(mon, side, eighth * mon.toxicCounter, { source: 'psn' });
    }
    if (mon.volatiles.leechseed && !mon.fainted) {
      const { dealt } = this.dealDamage(mon, side, eighth, { source: 'leechseed' });
      const foeSide = this.foeOf(side);
      const foe = this.active(foeSide);
      if (!foe.fainted && dealt) this.heal(foe, foeSide, dealt);
    }
  }
}

// Moves whose behaviour does not fit the generic attack/status paths.
const SPECIAL_MOVES = {
  splash() {
    this.emit('nothing');
  },
  teleport({ side }) {
    this.emit('fail', { side });
  },
  whirlwind({ side }) {
    this.emit('fail', { side });
  },
  roar({ side }) {
    this.emit('fail', { side });
  },
  haze({ side, user, foeSide, target }) {
    for (const [mon, s] of [[user, side], [target, foeSide]]) {
      for (const stat of BOOSTABLE) mon.boosts[stat] = 0;
      for (const v of ['confusion', 'leechseed', 'focusenergy', 'reflect', 'lightscreen', 'mist', 'disable']) delete mon.volatiles[v];
      if (mon.status === 'tox') mon.status = 'psn';
      recalcStats(mon);
      if (s === foeSide && target.status) this.cureStatus(target, foeSide);
    }
    this.emit('haze');
  },
  rest({ side, user }) {
    if (user.hp === user.maxHp) return this.emit('fail', { side });
    user.status = 'slp';
    user.sleepTurns = 2;
    user.restSleep = true;
    recalcStats(user);
    this.emit('status', { side, status: 'slp', rest: true });
    this.heal(user, side, user.maxHp);
  },
  recover(ctx) {
    healHalf.call(this, ctx);
  },
  softboiled(ctx) {
    healHalf.call(this, ctx);
  },
  substitute({ side, user }) {
    const cost = Math.floor(user.maxHp / 4);
    if (user.volatiles.substitute) return this.emit('fail', { side, reason: 'hasSub' });
    if (user.hp <= cost) return this.emit('fail', { side, reason: 'weak' });
    this.dealDamage(user, side, cost, { source: 'substitute' });
    user.volatiles.substitute = { hp: cost + 1 };
    this.emit('substitute', { side });
  },
  reflect(ctx) {
    sideVolatile.call(this, ctx, 'reflect');
  },
  lightscreen(ctx) {
    sideVolatile.call(this, ctx, 'lightscreen');
  },
  mist(ctx) {
    sideVolatile.call(this, ctx, 'mist');
  },
  focusenergy(ctx) {
    sideVolatile.call(this, ctx, 'focusenergy');
  },
  transform({ side, user, target }) {
    if (target.fainted || target.volatiles.semiInvulnerable) return this.emit('fail', { side });
    user.transformedFrom = {
      species: user.species, types: user.types, baseStats: user.baseStats, moves: user.moves,
    };
    user.species = target.species;
    user.types = [...target.types];
    user.baseStats = { ...target.baseStats, hp: user.maxHp };
    user.moves = target.moves.map((m) => ({ id: m.id, pp: 5, maxPp: 5 }));
    Object.assign(user.boosts, target.boosts);
    recalcStats(user);
    this.emit('transform', { side, num: target.num, into: target.name });
  },
  conversion({ side, user, target }) {
    user.types = [...target.types];
    this.emit('conversion', { side, types: user.types });
  },
  disable({ side, user, foeSide, target }) {
    if (!this.rollAccuracy(user, target, this.data.moves.disable)) return this.emit('miss', { side });
    const candidates = target.moves.filter((m) => m.pp > 0);
    if (target.volatiles.disable || !candidates.length) return this.emit('fail', { side });
    const pick = this.rng.pick(candidates);
    target.volatiles.disable = { moveId: pick.id, turns: this.rng.int(1, 9) };
    this.emit('disable', { side: foeSide, moveName: this.data.moves[pick.id].nameFr });
  },
  mimic({ side, user, target }) {
    const slot = user.moves.findIndex((m) => m.id === 'mimic');
    const candidates = target.moves.filter((m) => m.id !== 'mimic');
    if (slot < 0 || !candidates.length || user.volatiles.mimic) return this.emit('fail', { side });
    const pick = this.rng.pick(candidates);
    user.volatiles.mimic = { slot, original: user.moves[slot] };
    user.moves[slot] = { id: pick.id, pp: user.moves[slot].pp, maxPp: user.moves[slot].maxPp };
    this.emit('mimic', { side, moveName: this.data.moves[pick.id].nameFr });
  },
  counter({ side, user, foeSide, target, move }) {
    const lastType = user.lastHitType;
    const lastFoeMove = target.lastMove && this.data.moves[target.lastMove];
    const counterable = lastFoeMove && lastFoeMove.power > 0 && (lastType === 'Normal' || lastType === 'Fighting');
    if (!counterable || !user.lastDamageTaken) return this.emit('fail', { side });
    const damage = user.lastDamageTaken * 2;
    this.attack(side, user, foeSide, target, { ...move, type: '???' }, { fixed: { damage, eff: 1, crit: false } });
  },
  bide({ side, user }) {
    user.volatiles.bide = { turns: this.rng.int(2, 4), damage: 0 };
    this.emit('bideStart', { side });
  },
  struggle({ side, user, foeSide, target, move }) {
    this.attack(side, user, foeSide, target, { ...move, recoil: 0.5 });
  },
};

function healHalf({ side, user }) {
  if (user.hp === user.maxHp) return this.emit('fail', { side });
  this.heal(user, side, Math.floor(user.maxHp / 2));
}

function sideVolatile({ side, user }, name) {
  if (user.volatiles[name]) return this.emit('fail', { side });
  user.volatiles[name] = true;
  this.emit('volatile', { side, volatile: name });
}
