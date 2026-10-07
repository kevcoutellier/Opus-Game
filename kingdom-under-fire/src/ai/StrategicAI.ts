import type { BuildingKind } from '../buildings/Building';
import type { BuildingSystem } from '../buildings/BuildingSystem';
import type { World } from '../core/World';
import { BUILDING_DEFS, BUILDING_INDEX, buildingsOf } from '../data/buildings';
import { UNIT_DEFS, UNIT_INDEX } from '../data/units';
import { Comp, UnitState } from '../entities/Components';
import type { UnitRole } from '../units/UnitStats';

export interface StrategicOptions {
  team: number;
  faction: string;
  /** Centre of the base (the headquarters). */
  baseX: number;
  baseZ: number;
  /** Where the enemy base is (map knowledge, as for the player). */
  enemyX: number;
  enemyZ: number;
  /** Soldiers gathered before the first attack; each wave asks for a few more. */
  firstWave?: number;
}

/** What to build, in order; a kind listed twice means a second building of that kind. */
const BUILD_ORDER: BuildingKind[] = ['farm', 'sawmill', 'archery', 'barracks', 'farm', 'temple', 'stable', 'sawmill', 'farm', 'barracks'];
/** Wanted share of each role in the army. */
const MIX: Partial<Record<UnitRole, number>> = { infantry: 0.34, spear: 0.2, archer: 0.24, cavalry: 0.14 };
/** Heavy troops (templars, ogres) count as infantry but are trained at the temple. */
const HEAVY_SHARE = 0.08;
const QUEUE_TARGET = 2;
/** Soldiers kept whatever the savings. */
const MIN_GUARD = 10;
const MAX_WAVE = 36;

export type StrategicMode = 'defend' | 'attack';

/**
 * Economy and war plan of an AI team, above the tactical layer: raises buildings in a fixed order on
 * free spots around its headquarters, keeps its barracks busy to reach a combined-arms mix, and decides
 * when the gathered army marches on the enemy base (a wave) and when it falls back to regroup. It issues
 * the same `build` and `train` commands as the player, and only knows its own side.
 */
export class StrategicAI {
  mode: StrategicMode = 'defend';
  /** Size of the garrison that must be gathered before the next wave marches. */
  waveSize: number;
  /** Soldiers of the waves on the march; the others form the garrison. */
  readonly attackers = new Set<number>();
  private launched = 0;
  private readonly buildable: Map<BuildingKind, string>;

  constructor(
    private readonly buildings: BuildingSystem,
    readonly options: StrategicOptions,
  ) {
    this.waveSize = options.firstWave ?? 16;
    this.buildable = new Map(buildingsOf(options.faction).filter((b) => !b.hq).map((b) => [b.kind, b.id]));
  }

  /** One decision round: at most one building, a few recruits, attack or regroup. */
  think(world: World): void {
    const saving = this.build(world);
    // Saving for a building: recruit only to keep a minimum guard.
    if (!saving || this.army(world).length < MIN_GUARD) this.recruit(world);
    this.plan(world);
  }

  /** Soldiers of the team able to fight (heroes included). */
  army(world: World): number[] {
    const { entities, c } = world;
    const ids: number[] = [];
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) && c.team[id] === this.options.team && c.state[id] !== UnitState.Dying) ids.push(id);
    }
    return ids;
  }

  /** Lays the next building of the order if affordable; true while saving money for it. */
  private build(world: World): boolean {
    const { team } = this.options;
    const owned = new Map<string, number>();
    for (const b of this.buildings.list(team)) owned.set(b.def.id, (owned.get(b.def.id) ?? 0) + 1);
    const wanted = new Map<string, number>();
    for (const kind of BUILD_ORDER) {
      const id = this.buildable.get(kind);
      if (!id) continue;
      wanted.set(id, (wanted.get(id) ?? 0) + 1);
      if ((owned.get(id) ?? 0) >= wanted.get(id)!) continue;
      const type = BUILDING_INDEX.get(id)!;
      // Wait for the money of the next building in the order.
      if (!world.resources.canAfford(team, BUILDING_DEFS[type].cost)) return true;
      const site = this.findSite(type);
      if (site) world.commands.push({ kind: 'build', team, building: id, x: site.x, z: site.z, rot: site.rot });
      return false;
    }
    return false;
  }

  /** A free spot on rings around the headquarters, the door facing the enemy. */
  private findSite(type: number): { x: number; z: number; rot: number } | null {
    const { team, baseX, baseZ, enemyX, enemyZ } = this.options;
    const toEnemy = Math.atan2(enemyX - baseX, enemyZ - baseZ);
    const rot = Math.round(toEnemy / (Math.PI / 2)) * (Math.PI / 2);
    for (let ring = 16; ring <= 36; ring += 5) {
      const steps = Math.round((ring * Math.PI * 2) / 7);
      for (let k = 0; k < steps; k++) {
        // Start on the flanks, not in front of the door of the headquarters.
        const a = toEnemy + Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ((Math.PI * 2) / steps);
        const x = Math.round(baseX + Math.sin(a) * ring);
        const z = Math.round(baseZ + Math.cos(a) * ring);
        if (this.buildings.placementError(team, type, x, z, rot) === null) return { x, z, rot };
      }
    }
    return null;
  }

  private recruit(world: World): void {
    const { team } = this.options;
    const counts = new Map<string, number>();
    let total = 0;
    for (const id of this.army(world)) {
      const role = UNIT_DEFS[world.c.unitType[id]].role;
      counts.set(role, (counts.get(role) ?? 0) + 1);
      total++;
    }
    for (const b of this.buildings.list(team)) {
      if (!b.complete || !b.def.trains.length || b.queue.length >= QUEUE_TARGET) continue;
      // The most lacking role this building can train.
      let best: string | null = null;
      let bestNeed = -Infinity;
      for (const unit of b.def.trains) {
        const def = UNIT_DEFS[UNIT_INDEX.get(unit)!];
        const heavy = def.role === 'infantry' && (def.cost.mana ?? 0) > 0;
        const share = heavy ? HEAVY_SHARE : (MIX[def.role] ?? 0);
        const need = share * (total + 5) - (counts.get(def.role) ?? 0) * (heavy ? 0.3 : 1);
        if (need > bestNeed) {
          bestNeed = need;
          best = unit;
        }
      }
      if (best && world.resources.canAfford(team, UNIT_DEFS[UNIT_INDEX.get(best)!].cost)) {
        world.commands.push({ kind: 'train', team, building: b.id, unit: best });
      }
    }
  }

  /**
   * The garrison marches as a wave once big enough; a wave reduced to a third of its strength falls back
   * and joins the garrison again.
   */
  private plan(world: World): void {
    const army = this.army(world);
    const alive = new Set(army);
    for (const id of this.attackers) if (!alive.has(id)) this.attackers.delete(id);
    const garrison = army.filter((id) => !this.attackers.has(id));
    if (garrison.length >= this.waveSize) {
      for (const id of garrison) this.attackers.add(id);
      this.launched = this.attackers.size;
      this.waveSize = Math.min(MAX_WAVE, this.waveSize + 4);
    } else if (this.attackers.size > 0 && this.attackers.size < this.launched * 0.35) {
      this.attackers.clear();
    }
    this.mode = this.attackers.size > 0 ? 'attack' : 'defend';
  }
}
