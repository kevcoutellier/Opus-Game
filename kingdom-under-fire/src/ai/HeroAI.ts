import type { World } from '../core/World';
import { UNIT_DEFS } from '../data/units';
import { Comp, UnitState } from '../entities/Components';
import type { AbilityDef } from '../heroes/Ability';
import type { HeroState, HeroSystem } from '../heroes/HeroSystem';

export interface CastChoice {
  slot: number;
  x: number;
  z: number;
  /** How many soldiers the cast should affect (for tests and the debug panel). */
  score: number;
}

/** A cast must affect at least this many soldiers to be worth the mana. */
const MIN_SCORE = 3;
const buffer = new Int32Array(512);

/**
 * Ability choice of an AI hero, from what the hero sees around itself (its sight radius): the densest
 * enemy group within reach for blasts and missiles, a dash into a group while healthy, a buff or a war
 * cry when the fight is close. Returns the best cast, or null when none is worth it.
 */
export function chooseCast(world: World, heroes: HeroSystem, h: HeroState): CastChoice | null {
  const { c, entities, spatial } = world;
  const id = h.id;
  const hx = c.x[id];
  const hz = c.z[id];
  const n = spatial.query(hx, hz, UNIT_DEFS[c.unitType[id]].sight, c.x, c.z, buffer);
  const enemies: number[] = [];
  const allies: number[] = [];
  for (let k = 0; k < n; k++) {
    const u = buffer[k];
    if (u === id || !(entities.mask[u] & Comp.Unit) || c.state[u] === UnitState.Dying) continue;
    (c.team[u] === h.team ? allies : enemies).push(u);
  }
  if (!enemies.length) return null;
  const within = (list: number[], x: number, z: number, r: number) => {
    let count = 0;
    for (const u of list) if (Math.hypot(c.x[u] - x, c.z[u] - z) <= r) count++;
    return count;
  };

  let best: CastChoice | null = null;
  h.abilities.forEach((a: AbilityDef, slot) => {
    if (heroes.blocked(world, h, slot)) return;
    let choice: CastChoice | null = null;
    for (const e of a.effects) {
      let option: CastChoice | null = null;
      if (e.kind === 'damage' && a.targeting === 'self') {
        option = { slot, x: hx, z: hz, score: within(enemies, hx, hz, e.radius) * (e.stun > 0 ? 1.2 : 1) };
      } else if (e.kind === 'damage' || e.kind === 'missile') {
        option = densest(world, enemies, hx, hz, a.range, e.radius, slot);
        if (option && e.kind === 'damage' && e.stun > 0) option.score *= 1.2;
      } else if (e.kind === 'dash') {
        // Only while healthy, into a group at a good distance.
        if (c.hp[id] > c.maxHp[id] * 0.5) {
          option = densest(world, enemies, hx, hz, a.range, e.width + 1.5, slot);
          if (option && Math.hypot(option.x - hx, option.z - hz) < 6) option = null;
        }
      } else if (e.kind === 'buff') {
        const threat = within(enemies, hx, hz, 12);
        if (threat >= 4) option = { slot, x: hx, z: hz, score: within(allies, hx, hz, e.radius) * 0.6 + 1 };
      } else if (e.kind === 'morale') {
        const threat = within(enemies, hx, hz, e.radius);
        let shaken = 0;
        for (const u of allies) if (c.morale[u] < 55 && Math.hypot(c.x[u] - hx, c.z[u] - hz) <= e.radius) shaken++;
        if (threat >= 3) option = { slot, x: hx, z: hz, score: shaken * (e.allies / 20) + threat * (e.enemies / 30) };
      }
      if (option && (!choice || option.score > choice.score)) choice = option;
    }
    if (choice && choice.score >= MIN_SCORE && (!best || choice.score > best.score)) best = choice;
  });
  return best;
}

/** Centre of the enemy group of radius `radius` holding the most soldiers within `range` of (x, z). */
function densest(world: World, enemies: number[], x: number, z: number, range: number, radius: number, slot: number): CastChoice | null {
  const { c } = world;
  let best: CastChoice | null = null;
  // Candidate centres: the enemies themselves (at most 40 of them, spread over the list).
  const step = Math.max(1, Math.floor(enemies.length / 40));
  for (let i = 0; i < enemies.length; i += step) {
    const e = enemies[i];
    if (Math.hypot(c.x[e] - x, c.z[e] - z) > range) continue;
    let count = 0;
    let sx = 0;
    let sz = 0;
    for (const o of enemies) {
      if (Math.hypot(c.x[o] - c.x[e], c.z[o] - c.z[e]) > radius) continue;
      count++;
      sx += c.x[o];
      sz += c.z[o];
    }
    if (!best || count > best.score) best = { slot, x: sx / count, z: sz / count, score: count };
  }
  return best;
}
