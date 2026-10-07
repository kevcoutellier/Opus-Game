import { TroopAI } from '../ai/TroopAI';
import type { System } from '../core/Simulation';
import { createBattleSimulation, type BattleSimulation } from '../core/SimulationFactory';
import { World } from '../core/World';
import type { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { placeProps } from '../maps/Props';
import { Terrain } from '../maps/Terrain';
import type { Mission } from './Mission';
import { MissionDirector, type MissionFeed } from './MissionDirector';

export const MISSION_PLAYER_TEAM = 0;
export const MISSION_ENEMY_TEAM = 1;

export interface MissionBattle {
  world: World;
  terrain: Terrain;
  battle: BattleSimulation;
  director: MissionDirector;
  enemyAI: TroopAI;
  allyAI: TroopAI;
}

/** The battlefield of a mission: its terrain (with its clearings), its buildings, its troops and its script. */
export function startMission(mission: Mission, feed: MissionFeed, options: { hz?: number; perf?: PerformanceMonitor; extra?: System[] } = {}): MissionBattle {
  const terrain = Terrain.generate({ size: mission.map.size, seed: mission.map.seed, sites: mission.map.sites });
  const world = new World({ seed: mission.map.seed, hz: options.hz, terrain, perf: options.perf });
  // AI troops wait where the script put them until they see the player or are told to move.
  const enemyAI = new TroopAI(world, { team: MISSION_ENEMY_TEAM, engageRadius: 40 });
  const allyAI = new TroopAI(world, { team: MISSION_PLAYER_TEAM, engageRadius: 30 });
  const director = new MissionDirector(world, mission, {
    troops: null,
    enemyAI,
    allyAI,
    feed,
    playerTeam: MISSION_PLAYER_TEAM,
    enemyTeam: MISSION_ENEMY_TEAM,
  });
  const battle = createBattleSimulation(world, [director, enemyAI, allyAI, ...(options.extra ?? [])], options.perf);
  for (const ai of [enemyAI, allyAI]) {
    ai.troops = battle.troops;
    ai.heroes = battle.heroes;
  }
  director.attach(battle.troops);
  placeProps(world, mission.map.props);
  director.deploy();
  return { world, terrain, battle, director, enemyAI, allyAI };
}
