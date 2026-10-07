import type { AIOptions } from '../ai/AIController';
import type { World } from '../core/World';
import { unitIndex } from '../data/units';
import type { Troop, TroopSystem } from '../troops/TroopSystem';
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

export interface TroopBattle {
  player: Army;
  enemy: Army;
  /** Troops of each side, the hero's first. */
  playerTroops: Troop[];
  enemyTroops: Troop[];
  /** The player's hero (his fall loses the battle). */
  hero: number;
  /** Where the enemy marches when it has not found the player's army yet. */
  objective: { x: number; z: number };
}

/**
 * Field battle fought by troops, as in The Crusaders: each side deploys five troops, the hero leading his
 * own. Skirmish of The Crusaders, outside the campaign: Gerald's guard, spearmen, archers, cavalry and sappers
 * of Hironeiden against Lucretia's guard, dark elf infantry, archers, cavalry archers and cavalry of Vellond.
 */
export function setupTroopBattle(world: World, troops: TroopSystem, mapSize: number): TroopBattle {
  const cx = mapSize / 2;
  type Spec = { name: string; type: string; count: number; dx: number; dz: number; hero?: string };
  const deploy = (team: number, dir: number, specs: Spec[]): Troop[] => {
    const facing = dir > 0 ? Math.PI : 0;
    // dx is towards the troop's right: +x when it faces south (dir > 0), -x when it faces north.
    return specs.map((s) =>
      troops.create({
        team,
        name: s.name,
        soldierType: s.type,
        count: s.count,
        leader: s.hero ? spawnUnit(world, unitIndex(s.hero), team, cx, mapSize / 2, facing) : undefined,
        x: cx + s.dx * dir,
        z: mapSize / 2 + dir * s.dz,
        facing,
      }),
    );
  };
  const playerTroops = deploy(PLAYER_TEAM, 1, [
    { name: 'Garde de Gerald', type: 'hir_infantry', count: 14, dx: 0, dz: 48, hero: 'hero_gerald' },
    { name: 'Lanciers', type: 'hir_spearman', count: 16, dx: -24, dz: 48 },
    { name: 'Archers', type: 'hir_archer', count: 16, dx: 0, dz: 61 },
    { name: 'Cavalerie', type: 'hir_cavalry', count: 9, dx: 28, dz: 50 },
    { name: 'Sapeurs', type: 'hir_sapper', count: 12, dx: -24, dz: 61 },
  ]);
  const enemyTroops = deploy(ENEMY_TEAM, -1, [
    { name: 'Garde de Lucretia', type: 'vel_infantry', count: 14, dx: 0, dz: 48, hero: 'hero_lucretia' },
    { name: 'Infanterie elfe noire', type: 'vel_infantry', count: 16, dx: -24, dz: 48 },
    { name: 'Archers elfes noirs', type: 'vel_archer', count: 16, dx: 0, dz: 61 },
    { name: 'Archers montés', type: 'vel_cavalry_archer', count: 9, dx: 28, dz: 52 },
    { name: 'Cavalerie elfe noire', type: 'vel_cavalry', count: 9, dx: -28, dz: 56 },
  ]);
  const army = (team: number, list: Troop[]): Army => ({ team, units: list.flatMap((t) => t.members) });
  return {
    player: army(PLAYER_TEAM, playerTroops),
    enemy: army(ENEMY_TEAM, enemyTroops),
    playerTroops,
    enemyTroops,
    hero: playerTroops[0].leader,
    objective: { x: cx, z: mapSize / 2 + 48 },
  };
}
