import type { World } from '../core/World';
import type { AIKnowledge } from './AIKnowledge';

export interface TacticalPlan {
  kind: 'hold' | 'advance' | 'engage';
  x: number;
  z: number;
}

export interface TacticalOptions {
  /** Where the enemy is expected (its deployment zone: map knowledge, not unit knowledge). */
  objectiveX: number;
  objectiveZ: number;
  /** Seconds spent holding the start position before scouting towards the objective. */
  advanceDelay: number;
  /** Known enemies within this radius of the nearest one are treated as one group. */
  groupRadius?: number;
}

/**
 * Battlefield decisions of an AI army from what it knows: engage the nearest known enemy group (centre
 * of the enemies around the nearest one), else advance towards the expected enemy position once the
 * waiting time is over, else hold. Pure function of the knowledge: testable and cheap.
 */
export function planTactics(world: World, knowledge: AIKnowledge, armyX: number, armyZ: number, options: TacticalOptions): TacticalPlan {
  let nearest: { x: number; z: number } | null = null;
  let nearestDistance = Infinity;
  for (const s of knowledge.enemies.values()) {
    const d = Math.hypot(s.x - armyX, s.z - armyZ);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = s;
    }
  }
  if (nearest) {
    const radius = options.groupRadius ?? 18;
    let gx = 0;
    let gz = 0;
    let n = 0;
    for (const s of knowledge.enemies.values()) {
      if (Math.hypot(s.x - nearest.x, s.z - nearest.z) > radius) continue;
      gx += s.x;
      gz += s.z;
      n++;
    }
    return { kind: 'engage', x: gx / n, z: gz / n };
  }
  if (world.time.elapsed >= options.advanceDelay) return { kind: 'advance', x: options.objectiveX, z: options.objectiveZ };
  return { kind: 'hold', x: armyX, z: armyZ };
}
