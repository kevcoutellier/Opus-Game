import { describe, expect, it } from 'vitest';
import { MISSIONS, mission } from '../../src/data/missions';
import { UNIT_DEFS } from '../../src/data/units';
import { parseMission } from '../../src/missions/Mission';
import { startMission } from '../../src/missions/startMission';

function play(id: string) {
  const lines: { speaker: string | null; text: string }[] = [];
  const cutscenes: { x: number; z: number }[] = [];
  const m = mission(id)!;
  const battle = startMission(m, {
    say: (speaker, text) => lines.push({ speaker, text }),
    cutscene: (x, z) => cutscenes.push({ x, z }),
    flyover: () => {},
  });
  const { world, director } = battle;
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * world.time.hz); i++) battle.battle.simulation.step(world.time.dt);
  };
  /** Breaks a troop of the mission at once (as if the player had beaten it). */
  const rout = (key: string) => {
    const t = director.troopOf.get(key)!;
    for (const u of t.members) world.c.hp[u] = 0;
    for (const u of t.members) world.entities.destroy(u);
  };
  const go = (key: string, x: number, z: number) => world.commands.push({ kind: 'troopMove', team: 0, troop: director.troopOf.get(key)!.id, x, z, queue: false });
  return { battle, world, director, run, rout, go, lines, cutscenes, m };
}

describe('mission data', () => {
  it('validates the missions of Gerald, their troops and their script', () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(['greyhampton', 'ravenmeadow']);
    for (const m of MISSIONS) {
      for (const t of m.troops) {
        expect(UNIT_DEFS.some((d) => d.id === t.type)).toBe(true);
        // Every reserve is brought in by the script.
        if (t.reserve) expect(m.events.some((e) => e.do.some((a) => a.kind === 'spawn' && a.troops.includes(t.key)))).toBe(true);
      }
      expect(m.events.some((e) => e.do.some((a) => a.kind === 'victory'))).toBe(true);
    }
    expect(() => parseMission({ ...MISSIONS[0], events: [{ id: 'x', when: { kind: 'broken', troops: ['nobody'] }, do: [{ kind: 'victory' }] }] })).toThrow(/unknown troop/);
  });
});

describe('Greyhampton', () => {
  it('two green spots, the airship, the burning village, Rithrin, and the report', () => {
    const { world, director, run, rout, go, lines, cutscenes } = play('greyhampton');
    run(0.5);
    expect(director.objectives.filter((o) => o.state === 'active' && o.marker)).toHaveLength(2);
    // The enemies are not there yet; the village stands.
    expect(director.troopOf.has('rithrin')).toBe(false);
    expect(world.props.length).toBeGreaterThan(8);
    go('guard', 128, 176);
    for (let s = 0; s < 40 && director.firedAt('spot1') === undefined; s++) run(1);
    expect(director.firedAt('spot1')).toBeDefined();
    expect(lines.some((l) => l.speaker === 'rupert')).toBe(true);
    go('guard', 128, 134);
    for (let s = 0; s < 40 && director.firedAt('village') === undefined; s++) run(1);
    expect(director.firedAt('village')).toBeDefined();
    expect(cutscenes).toHaveLength(1);
    expect(world.fire.active.size).toBeGreaterThan(0);
    expect(director.troopOf.get('rithrin')).toBeDefined();
    expect(director.objectives.find((o) => o.id === 'rithrin')!.state).toBe('active');
    // Their infantry broken, Rithrin's archers fall back and the patrol goes home.
    rout('raiders');
    run(10);
    expect(director.outcome).toBe('victory');
    expect(lines.some((l) => l.speaker === 'rithrin')).toBe(true);
  });
});

describe('Ravenmeadow', () => {
  it('the sappers fall before Gerald can reach them; the archers saved in the east join him', () => {
    const { director, run, rout, go } = play('ravenmeadow');
    go('guard', 128, 70);
    // The guard needs about a minute to cross the field: the sappers are lost before.
    for (let s = 0; s < 60 && director.firedAt('too_late') === undefined; s++) run(1);
    expect(director.firedAt('too_late')).toBeDefined();
    expect(director.objectives.find((o) => o.id === 'sappers')!.state).toBe('failed');
    rout('field');
    rout('rithrin');
    run(1);
    const archers = director.troopOf.get('shore_archers')!;
    expect(archers.controller).toBe('ai');
    rout('raiders');
    rout('riders');
    run(1);
    expect(archers.controller).toBe('player');
    expect(director.troopOf.get('gate_cavalry')).toBeDefined();
    rout('gate_cavalry');
    rout('garrison');
    run(1);
    expect(director.outcome).toBe('victory');
  });
});
