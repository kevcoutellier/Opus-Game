import type { AIOptions } from '../ai/AIController';
import type { StrategicOptions } from '../ai/StrategicAI';
import type { BuildingSystem } from '../buildings/BuildingSystem';
import type { World } from '../core/World';
import { buildingIndex } from '../data/buildings';
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

/** Clearings of the two bases (the terrain is levelled there). */
export const BASE_SITES = [
  { x: 128, z: 212, radius: 30 },
  { x: 128, z: 44, radius: 30 },
] as const;

/** The AI of the Legion in the battle with bases (map knowledge: where the Alliance's keep stands). */
export const BASE_AI: AIOptions = { team: ENEMY_TEAM, objectiveX: BASE_SITES[0].x, objectiveZ: BASE_SITES[0].z, advanceDelay: 0, formation: 'LINE' };

/** Resources of each side at the start of a battle with bases. */
export const STARTING_RESOURCES = { gold: 450, wood: 250, food: 250, stone: 150, mana: 40 };

export interface BaseBattle {
  player: Army;
  enemy: Army;
  /** Headquarters of both sides. */
  keeps: [number, number];
  ai: AIOptions;
  strategy: StrategicOptions;
}

/**
 * Battle with bases: the keep of Hironeiden to the north (a barracks, a farm and a sawmill already
 * standing), the stronghold of Likuku to the south (war camp, pen, lumber camp), each hero with a small
 * company. Both sides build, recruit and must destroy the other's headquarters. Needs the BuildingSystem,
 * so it runs once the simulation exists.
 */
export function setupBaseBattle(world: World, buildings: BuildingSystem): BaseBattle {
  const [north, south] = BASE_SITES;
  const place = (id: string, team: number, x: number, z: number, rot: number) => buildings.place(buildingIndex(id), team, x, z, rot, true);
  const keep = place('human_keep', PLAYER_TEAM, north.x, north.z + 2, Math.PI);
  place('human_barracks', PLAYER_TEAM, north.x - 18, north.z - 10, Math.PI);
  place('human_farm', PLAYER_TEAM, north.x + 20, north.z + 10, Math.PI);
  place('human_sawmill', PLAYER_TEAM, north.x - 20, north.z + 10, Math.PI);
  const stronghold = place('orc_stronghold', ENEMY_TEAM, south.x, south.z - 2, 0);
  place('orc_warcamp', ENEMY_TEAM, south.x + 18, south.z + 10, 0);
  place('orc_pen', ENEMY_TEAM, south.x - 20, south.z - 10, 0);
  place('orc_lumber', ENEMY_TEAM, south.x + 20, south.z - 10, 0);

  const company = (team: number, z: number, dir: number, roster: [string, string, string, string]) => {
    const rot = dir > 0 ? Math.PI : 0;
    return [
      ...spawnBlock(world, unitIndex(roster[0]), team, 8, 8, north.x, z, rot),
      ...spawnBlock(world, unitIndex(roster[1]), team, 6, 6, north.x, z + dir * 2.5, rot),
      ...spawnBlock(world, unitIndex(roster[2]), team, 6, 6, north.x, z + dir * 5, rot),
      spawnUnit(world, unitIndex(roster[3]), team, north.x, z + dir * 7.5, rot),
    ];
  };
  const player = company(PLAYER_TEAM, north.z - 24, 1, ['human_footman', 'human_spearman', 'human_archer', 'hero_curian']);
  const enemy = company(ENEMY_TEAM, south.z + 24, -1, ['orc_warrior', 'orc_spearman', 'dark_elf_archer', 'hero_likuku']);
  for (const team of [PLAYER_TEAM, ENEMY_TEAM]) world.resources.set(team, STARTING_RESOURCES);
  return {
    player: { team: PLAYER_TEAM, units: player },
    enemy: { team: ENEMY_TEAM, units: enemy },
    keeps: [keep, stronghold],
    ai: BASE_AI,
    strategy: { team: ENEMY_TEAM, faction: 'dark_legion', baseX: south.x, baseZ: south.z, enemyX: north.x, enemyZ: north.z, firstWave: 30 },
  };
}
