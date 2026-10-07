import { AIKnowledge } from '../ai/AIKnowledge';
import type { TroopAI } from '../ai/TroopAI';
import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { unitIndex } from '../data/units';
import type { Troop, TroopSystem } from '../troops/TroopSystem';
import { spawnUnit } from '../units/UnitFactory';
import type { Action, Mission, MissionTroop, Trigger } from './Mission';

/** Seconds between two readings of the triggers. */
const STEP = 0.25;

export interface Objective {
  id: string;
  text: string;
  state: 'active' | 'done' | 'failed';
  marker?: { x: number; z: number; radius: number };
}

/** What the director shows the player (the game's UI). */
export interface MissionFeed {
  say(speaker: string | null, text: string): void;
  cutscene(x: number, z: number): void;
  flyover(from: { x: number; z: number }, to: { x: number; z: number }, seconds: number): void;
}

export interface MissionDeps {
  /** The troops of the battle: they exist once the simulation is built (see `attach`). */
  troops: TroopSystem | null;
  /** Commander of the enemy troops, and of the player's allies. */
  enemyAI: TroopAI;
  allyAI: TroopAI;
  feed: MissionFeed;
  playerTeam: number;
  enemyTeam: number;
}

/**
 * Plays the script of a mission inside the simulation: it deploys the troops, reads the triggers (a place
 * reached, troops broken or seen, time after another event) and runs the actions (dialogue, objectives,
 * reinforcements, stances, allies joining the player, fire, cutscenes, the end of the mission).
 */
export class MissionDirector implements System {
  readonly name = 'mission';
  readonly objectives: Objective[] = [];
  outcome: 'victory' | 'defeat' | null = null;
  outcomeText: string | null = null;
  /** Troops by their key in the mission. */
  readonly troopOf = new Map<string, Troop>();
  /** The player's hero. */
  hero = -1;
  /** Incremented when the objectives change (the UI redraws them). */
  version = 0;
  private readonly fired = new Map<string, number>();
  private readonly knowledge: AIKnowledge;
  private next = 0;

  constructor(
    private readonly world: World,
    readonly mission: Mission,
    private readonly d: MissionDeps,
  ) {
    this.knowledge = new AIKnowledge(world, d.playerTeam);
  }

  /** The troops of the battle (they exist once the simulation is built). */
  attach(troops: TroopSystem): void {
    this.d.troops = troops;
  }

  private get troopSystem(): TroopSystem {
    if (!this.d.troops) throw new Error('MissionDirector: attach() the troop system first');
    return this.d.troops;
  }

  /** Deploys the troops that are on the field from the start. */
  deploy(): void {
    for (const t of this.mission.troops) if (!t.reserve) this.raise(t);
  }

  /** When an event fired (simulation time), or undefined. */
  firedAt(id: string): number | undefined {
    return this.fired.get(id);
  }

  update(world: World): void {
    if (this.outcome || world.time.elapsed < this.next) return;
    this.next = world.time.elapsed + STEP;
    let seen = false;
    for (const e of this.mission.events) {
      if (this.fired.has(e.id)) continue;
      if (e.when.kind === 'seen' && !seen) {
        this.knowledge.update();
        seen = true;
      }
      if (!this.triggered(world, e.when)) continue;
      this.fired.set(e.id, world.time.elapsed);
      for (const a of e.do) this.run(world, a);
      if (this.outcome) return;
    }
  }

  private triggered(world: World, w: Trigger): boolean {
    const { c } = world;
    switch (w.kind) {
      case 'start':
        return true;
      case 'reach':
        return this.troopSystem.list(this.d.playerTeam, true, 'player').some((t) => {
          if (w.who === 'hero' && t.leader !== this.hero) return false;
          return Math.hypot(c.x[t.leader] - w.x, c.z[t.leader] - w.z) <= w.radius;
        });
      case 'broken':
        return w.troops.every((key) => {
          const t = this.troopOf.get(key);
          return t !== undefined && (t.status === 'routing' || t.status === 'defeated');
        });
      case 'seen':
        return w.troops.some((key) => this.troopOf.get(key)?.members.some((id) => this.knowledge.enemies.get(id)?.visible));
      case 'after': {
        const at = this.fired.get(w.event);
        return at !== undefined && world.time.elapsed >= at + w.seconds;
      }
      case 'all':
        return w.events.every((id) => this.fired.has(id));
    }
  }

  private run(world: World, a: Action): void {
    switch (a.kind) {
      case 'say':
        this.d.feed.say(a.speaker, a.text);
        break;
      case 'objective': {
        let o = this.objectives.find((x) => x.id === a.id);
        if (!o) {
          o = { id: a.id, text: a.text ?? a.id, state: a.state, marker: a.marker };
          this.objectives.push(o);
        }
        o.state = a.state;
        if (a.text) o.text = a.text;
        if (a.marker) o.marker = a.marker;
        this.version++;
        break;
      }
      case 'spawn':
        for (const key of a.troops) {
          const t = this.mission.troops.find((x) => x.key === key)!;
          if (!this.troopOf.has(key)) this.raise(t);
        }
        break;
      case 'stance':
        for (const key of a.troops) {
          const t = this.troopOf.get(key);
          if (t) (t.team === this.d.enemyTeam ? this.d.enemyAI : this.d.allyAI).setStance(t.id, a.stance);
        }
        break;
      case 'join':
        for (const key of a.troops) {
          const t = this.troopOf.get(key);
          if (t && t.status !== 'defeated' && t.status !== 'routing') t.controller = 'player';
        }
        break;
      case 'burn':
        world.fire.ignite(a.x, a.z, a.radius);
        break;
      case 'cutscene':
        this.d.feed.cutscene(a.x, a.z);
        break;
      case 'flyover':
        this.d.feed.flyover(a.from, a.to, a.seconds);
        break;
      case 'victory':
      case 'defeat':
        this.outcome = a.kind;
        this.outcomeText = a.text ?? null;
        break;
    }
  }

  /** A troop of the mission takes the field. */
  private raise(spec: MissionTroop): Troop {
    const { world } = this;
    const team = spec.side === 'enemy' ? this.d.enemyTeam : this.d.playerTeam;
    const leader = spec.hero ? spawnUnit(world, unitIndex(spec.hero), team, spec.x, spec.z, spec.facing) : undefined;
    const troop = this.troopSystem.create({
      team,
      name: spec.name,
      soldierType: spec.type,
      count: spec.count,
      leader,
      x: spec.x,
      z: spec.z,
      facing: spec.facing,
      controller: spec.side === 'player' ? 'player' : 'ai',
    });
    this.troopOf.set(spec.key, troop);
    if (spec.side === 'player' && spec.hero && this.hero < 0) this.hero = troop.leader;
    if (spec.side !== 'player') {
      const ai = spec.side === 'enemy' ? this.d.enemyAI : this.d.allyAI;
      ai.setStance(troop.id, spec.stance);
      if (spec.engage) ai.setEngage(troop.id, spec.engage);
    }
    return troop;
  }
}
