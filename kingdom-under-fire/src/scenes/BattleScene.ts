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
 * First vertical slice: two armies of 20 (10 swordsmen in front, 10 spearmen behind) deployed at both
 * ends of the central plain, facing each other.
 */
export function setupPrototypeBattle(world: World, mapSize: number): { player: Army; enemy: Army } {
  const cx = mapSize / 2;
  const player = [
    ...spawnBlock(world, unitIndex('swordsman'), PLAYER_TEAM, 10, 10, cx, mapSize / 2 + 52, Math.PI),
    ...spawnBlock(world, unitIndex('spearman'), PLAYER_TEAM, 10, 10, cx, mapSize / 2 + 55, Math.PI),
  ];
  const enemy = [
    ...spawnBlock(world, unitIndex('swordsman'), ENEMY_TEAM, 10, 10, cx, mapSize / 2 - 52, 0),
    ...spawnBlock(world, unitIndex('spearman'), ENEMY_TEAM, 10, 10, cx, mapSize / 2 - 55, 0),
  ];
  return { player: { team: PLAYER_TEAM, units: player }, enemy: { team: ENEMY_TEAM, units: enemy } };
}
