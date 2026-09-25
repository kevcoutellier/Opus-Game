import type { AIOptions } from '../ai/AIController';
import type { World } from '../core/World';
import { unitIndex } from '../data/units';
import { spawnBlock, spawnUnit } from '../units/UnitFactory';

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

/**
 * Battle of the second prototype, both armies at full strength around their heroes: for the Alliance,
 * Curian with footmen and templars in front, spearmen, archers behind and knights on the right wing; for
 * the Legion, Likuku with orc warriors and ogres, orc spearmen, dark elf archers and riders on the left.
 */
export function setupFieldBattle(world: World, mapSize: number): { player: Army; enemy: Army; ai: AIOptions } {
  const cx = mapSize / 2;
  type Roster = { front: string; heavy: string; spear: string; archer: string; horse: string; hero: string };
  const deploy = (team: number, dir: number, roster: Roster, heavyCount: number): Army => {
    const z = (d: number) => mapSize / 2 + dir * d;
    const rot = dir > 0 ? Math.PI : 0;
    // The army's right wing: +x when it faces south (dir > 0, towards -z), -x when it faces north.
    const wing = dir;
    const units = [
      ...spawnBlock(world, unitIndex(roster.front), team, 14, 14, cx - 4 * wing, z(48), rot),
      ...spawnBlock(world, unitIndex(roster.heavy), team, heavyCount, heavyCount, cx + 12 * wing, z(48), rot, heavyCount > 3 ? 1.6 : 2.4),
      ...spawnBlock(world, unitIndex(roster.spear), team, 10, 10, cx, z(51.5), rot),
      ...spawnBlock(world, unitIndex(roster.archer), team, 10, 10, cx, z(56), rot),
      ...spawnBlock(world, unitIndex(roster.horse), team, 6, 3, cx + 26 * wing, z(50), rot, 2.4),
      spawnUnit(world, unitIndex(roster.hero), team, cx, z(53.5), rot),
    ];
    return { team, units };
  };
  const player = deploy(PLAYER_TEAM, 1, { front: 'human_footman', heavy: 'human_templar', spear: 'human_spearman', archer: 'human_archer', horse: 'human_knight', hero: 'hero_curian' }, 6);
  const enemy = deploy(ENEMY_TEAM, -1, { front: 'orc_warrior', heavy: 'ogre', spear: 'orc_spearman', archer: 'dark_elf_archer', horse: 'dark_elf_rider', hero: 'hero_likuku' }, 3);
  const ai: AIOptions = { team: ENEMY_TEAM, objectiveX: cx, objectiveZ: mapSize / 2 + 50, advanceDelay: 20, formation: 'LINE' };
  return { player, enemy, ai };
}
