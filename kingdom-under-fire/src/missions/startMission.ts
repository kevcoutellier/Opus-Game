import { TroopAI } from '../ai/TroopAI';
import type { System } from '../core/Simulation';
import { createBattleSimulation, type BattleSimulation } from '../core/SimulationFactory';
import { World } from '../core/World';
import type { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { placeProps } from '../maps/Props';
import { Terrain } from '../maps/Terrain';
import { deploySlots, type Mission, type MissionTroop } from './Mission';
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

/** A troop of the player's campaign army, as the battle needs it. */
export interface ArmyTroopSpec {
  id: string;
  name: string;
  /** Unit definition of its soldiers. */
  type: string;
  /** True for the hero's troop: it takes the place of the mission's. */
  hero?: boolean;
  count: number;
  boost: { health: number; attack: number; defense: number; sp: number };
}

/**
 * The mission with the player's own army: his hero's troop keeps its place, the others stand where the
 * mission's player troops stood, then on its extra slots. Returns the troop key of each army troop.
 */
export function withArmy(mission: Mission, army: ArmyTroopSpec[]): { mission: Mission; keys: Map<string, string> } {
  const heroTroop = mission.troops.find((t) => t.side === 'player' && t.hero && !t.reserve)!;
  const slots = deploySlots(mission);
  const keys = new Map<string, string>();
  const troops: MissionTroop[] = [];
  let slot = 0;
  for (const a of army) {
    if (a.hero) {
      troops.push({ ...heroTroop, name: a.name, type: a.type, count: a.count, boost: a.boost });
      keys.set(a.id, heroTroop.key);
      continue;
    }
    const at = slots[slot++];
    if (!at) break;
    const key = `army_${a.id.toLowerCase()}`;
    troops.push({ key, name: a.name, type: a.type, count: a.count, side: 'player', x: at.x, z: at.z, facing: at.facing, reserve: false, stance: { kind: 'hold' }, boost: a.boost });
    keys.set(a.id, key);
  }
  // Everything else as the mission has it; its own player troops give way to the army.
  for (const t of mission.troops) if (t.side !== 'player' || t.reserve) troops.push(t);
  return { mission: { ...mission, troops }, keys };
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
