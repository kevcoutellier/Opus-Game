import type { AIOptions } from '../ai/AIController';
import type { World } from '../core/World';
import { unitIndex } from '../data/units';
import { spawnBlock } from '../units/UnitFactory';

export const PLAYER_TEAM = 0;
export const ENEMY_TEAM = 1;

export interface Army {
  team: number;
  units: number[];
}

/**
 * Prototype battle: 20 soldiers of Hironeiden (10 footmen in front, 10 spearmen behind) against the orc
 * vanguard of Hexter (10 warriors, 10 spearmen), deployed at both ends of the central plain.
 */
export function setupPrototypeBattle(world: World, mapSize: number): { player: Army; enemy: Army; ai: AIOptions } {
  const cx = mapSize / 2;
  const player = [
    ...spawnBlock(world, unitIndex('human_footman'), PLAYER_TEAM, 10, 10, cx, mapSize / 2 + 52, Math.PI),
    ...spawnBlock(world, unitIndex('human_spearman'), PLAYER_TEAM, 10, 10, cx, mapSize / 2 + 55, Math.PI),
  ];
  const enemy = [
    ...spawnBlock(world, unitIndex('orc_warrior'), ENEMY_TEAM, 10, 10, cx, mapSize / 2 - 52, 0),
    ...spawnBlock(world, unitIndex('orc_spearman'), ENEMY_TEAM, 10, 10, cx, mapSize / 2 - 55, 0),
  ];
  // The AI knows the map (where the player deploys), not where the player's troops are.
  const ai: AIOptions = { team: ENEMY_TEAM, objectiveX: cx, objectiveZ: mapSize / 2 + 50, advanceDelay: 15, formation: 'LINE' };
  return { player: { team: PLAYER_TEAM, units: player }, enemy: { team: ENEMY_TEAM, units: enemy }, ai };
}
