import type { World } from '../core/World';
import { Comp, MoraleState, UnitState } from '../entities/Components';

export type Outcome = 'victory' | 'defeat' | null;

/** Seconds an army must stay broken (dead or routing) before the battle is decided. */
const BROKEN_SECONDS = 4;

/** Decides the battle: an army is beaten when none of its soldiers still fights. */
export class BattleOutcome {
  private brokenSince = [Infinity, Infinity];
  result: Outcome = null;

  constructor(private readonly playerTeam: number) {}

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

  update(world: World): Outcome {
    if (this.result) return this.result;
    const now = world.time.elapsed;
    for (const team of [0, 1]) {
      if (BattleOutcome.fighting(world, team) > 0) this.brokenSince[team] = Infinity;
      else if (this.brokenSince[team] === Infinity) this.brokenSince[team] = now;
    }
    const playerBroken = now - this.brokenSince[this.playerTeam] >= BROKEN_SECONDS;
    const enemyBroken = now - this.brokenSince[1 - this.playerTeam] >= BROKEN_SECONDS;
    if (enemyBroken) this.result = 'victory';
    else if (playerBroken) this.result = 'defeat';
    return this.result;
  }
}
