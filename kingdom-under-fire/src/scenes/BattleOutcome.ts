import type { World } from '../core/World';
import { Comp, MoraleState, UnitState } from '../entities/Components';
import type { TroopSystem } from '../troops/TroopSystem';

export type Outcome = 'victory' | 'defeat' | null;

/** Seconds an army must stay broken (dead or routing) before the battle is decided. */
const BROKEN_SECONDS = 4;

/** Rules of a battle fought by troops (The Crusaders). */
export interface TroopRules {
  troops: TroopSystem;
  /** The player's hero: the mission is lost when he falls (-1: no such rule). */
  hero: number;
}

/**
 * Decides the battle. With troops: the player loses when his hero falls or when none of his troops still
 * stands, and wins when every enemy troop is broken or destroyed. Without: an army is beaten when none of
 * its soldiers still fights.
 */
export class BattleOutcome {
  private brokenSince = [Infinity, Infinity];
  result: Outcome = null;

  constructor(
    private readonly playerTeam: number,
    private readonly rules: TroopRules | null = null,
  ) {}

  /** Soldiers of a team still able to fight (alive, not routing). */
  static fighting(world: World, team: number): number {
    const { entities, c } = world;
    let n = 0;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) === 0 || c.team[id] !== team) continue;
      if (c.state[id] !== UnitState.Dying && c.moraleState[id] !== MoraleState.Routing) n++;
    }
    return n;
  }

  /** True while a team can still fight under the rules of the battle. */
  private standing(world: World, team: number): boolean {
    if (!this.rules) return BattleOutcome.fighting(world, team) > 0;
    const { troops, hero } = this.rules;
    if (team === this.playerTeam && hero >= 0) {
      const { entities, c } = world;
      if (!entities.has(hero, Comp.Unit) || c.state[hero] === UnitState.Dying) return false;
    }
    return troops.list(team, true).length > 0;
  }

  update(world: World): Outcome {
    if (this.result) return this.result;
    const now = world.time.elapsed;
    for (const team of [0, 1]) {
      if (this.standing(world, team)) this.brokenSince[team] = Infinity;
      else if (this.brokenSince[team] === Infinity) this.brokenSince[team] = now;
    }
    const playerBroken = now - this.brokenSince[this.playerTeam] >= BROKEN_SECONDS;
    const enemyBroken = now - this.brokenSince[1 - this.playerTeam] >= BROKEN_SECONDS;
    if (enemyBroken) this.result = 'victory';
    else if (playerBroken) this.result = 'defeat';
    return this.result;
  }
}
