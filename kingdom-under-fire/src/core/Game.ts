import * as THREE from 'three';
import { TroopAI } from '../ai/TroopAI';
import type { AssetManager } from '../assets/AssetManager';
import { AudioManager } from '../audio/AudioManager';
import { HeroCamera } from '../camera/HeroCamera';
import { RTSCamera } from '../camera/RTSCamera';
import { faction } from '../data/factions';
import { DebugManager } from '../debug/DebugManager';
import { GpuTimer } from '../debug/GpuTimer';
import { PerformanceMonitor } from '../debug/PerformanceMonitor';
import type { HeroSystem } from '../heroes/HeroSystem';
import { HeroInput } from '../input/HeroInput';
import { InputManager } from '../input/InputManager';
import { TroopInput } from '../input/TroopInput';
import { Terrain } from '../maps/Terrain';
import { EffectsRenderer } from '../renderer/EffectsRenderer';
import { ProjectileRenderer } from '../renderer/ProjectileRenderer';
import { OverlayRenderer } from '../renderer/OverlayRenderer';
import { Renderer } from '../renderer/Renderer';
import { SceneManager } from '../renderer/SceneManager';
import { ScreenProjector } from '../renderer/ScreenProjector';
import { TerrainPicker } from '../renderer/TerrainPicker';
import { TerrainRenderer } from '../renderer/TerrainRenderer';
import { UnitRenderer } from '../renderer/UnitRenderer';
import { BattleOutcome } from '../scenes/BattleOutcome';
import { ENEMY_TEAM, PLAYER_TEAM, setupTroopBattle, type Army } from '../scenes/BattleScene';
import { PerformanceTestScene } from '../scenes/PerformanceTestScene';
import { setupShowcase } from '../scenes/ShowcaseScene';
import { SKIRMISH_BATTLE } from '../data/story/battles';
import { BriefingScreen } from '../ui/BriefingScreen';
import { HeroBar } from '../ui/HeroBar';
import { HUD } from '../ui/HUD';
import { Minimap } from '../ui/Minimap';
import { TroopPanel } from '../ui/TroopPanel';
import { UnitManager } from '../units/UnitManager';
import type { FormationManager } from '../formations/FormationManager';
import type { Troop, TroopSystem } from '../troops/TroopSystem';
import { Comp, UnitState } from '../entities/Components';
import { GameLoop } from './GameLoop';
import type { Simulation } from './Simulation';
import { createBattleSimulation } from './SimulationFactory';
import { FLY_HEIGHT } from '../units/Unit';
import { World } from './World';

const MAP_SIZE = 256;
const CAMERA_MARGIN = 20;
const SIM_HZ = 30;
const TEAM_FACTIONS = ['human_alliance', 'dark_legion'];
/** Pixels around a unit's projected centre that still pick it. */
const PICK_RADIUS = 22;
/** Seconds before the enemy marches on the player's deployment if it has not met him yet. */
const ENEMY_ADVANCE = 20;

/** Browser orchestrator: owns the renderer, the loop, the input, the UI and the simulation. */
export class Game {
  readonly perf = new PerformanceMonitor();
  readonly renderer: Renderer;
  readonly scenes = new SceneManager();
  readonly terrain: Terrain;
  readonly world: World;
  readonly simulation: Simulation;
  readonly formations: FormationManager;
  readonly heroes: HeroSystem;
  readonly troops: TroopSystem;
  readonly ai: TroopAI;
  /** Units deployed at the start of the battle. */
  readonly armies: { player: Army; enemy: Army };
  /** Troops deployed at the start of the battle (the hero's first). */
  readonly deployed: { player: Troop[]; enemy: Troop[] };
  readonly units: UnitManager;
  readonly rtsCamera: RTSCamera;
  readonly heroCamera: HeroCamera;
  readonly heroInput: HeroInput;
  private readonly heroBar: HeroBar;
  readonly input: InputManager;
  readonly projector: ScreenProjector;
  readonly troopInput: TroopInput;
  readonly picker: TerrainPicker;
  readonly hud: HUD;
  private readonly troopPanel: TroopPanel;
  readonly minimap: Minimap;
  /** Troop the tactic camera follows, -1 when the player moves the camera himself. */
  follow = -1;
  private readonly waypoints = new Float32Array(64);
  readonly loop: GameLoop;
  private readonly unitRenderer: UnitRenderer;
  private readonly overlay: OverlayRenderer;
  private readonly effects: EffectsRenderer;
  private readonly missiles: ProjectileRenderer;
  readonly outcome: BattleOutcome;
  readonly debug: DebugManager;
  readonly perfTest = new PerformanceTestScene();
  private readonly gpu: GpuTimer;
  readonly audio: AudioManager;
  private fps = 60;
  private time = 0;
  frames = 0;
  /** Units of the `#showcase` scene (for inspection from the console). */
  showcase: number[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    readonly ui: HTMLElement,
    readonly assets: AssetManager,
  ) {
    this.renderer = new Renderer(canvas);
    this.terrain = Terrain.generate({ size: MAP_SIZE, seed: 20260925 });
    const heightAt = (x: number, z: number) => this.terrain.heightAt(x, z);

    this.world = new World({ seed: 1337, hz: SIM_HZ, terrain: this.terrain, perf: this.perf });
    this.ai = new TroopAI(this.world, { team: ENEMY_TEAM });
    const battle = createBattleSimulation(this.world, [this.ai], this.perf);
    this.simulation = battle.simulation;
    this.formations = battle.formations;
    this.heroes = battle.heroes;
    this.troops = battle.troops;
    this.ai.heroes = battle.heroes;
    this.ai.troops = battle.troops;
    const setup = setupTroopBattle(this.world, this.troops, MAP_SIZE);
    this.armies = { player: setup.player, enemy: setup.enemy };
    this.deployed = { player: setup.playerTroops, enemy: setup.enemyTroops };
    // The enemy knows where the player deploys, not where his troops are.
    this.ai.stance = { kind: 'advance', x: setup.objective.x, z: setup.objective.z, after: ENEMY_ADVANCE };
    this.outcome = new BattleOutcome(PLAYER_TEAM, { troops: this.troops, hero: setup.hero });
    this.units = new UnitManager(this.world);

    const teamColors = TEAM_FACTIONS.map((id) => new THREE.Color(faction(id).color));
    this.unitRenderer = new UnitRenderer(this.world.entities.capacity, teamColors, heightAt);
    this.overlay = new OverlayRenderer(heightAt);
    this.effects = new EffectsRenderer(this.world, heightAt);
    this.missiles = new ProjectileRenderer(this.world);
    const terrainRenderer = new TerrainRenderer(this.terrain);
    this.world.events.on('fireCell', ({ cell, burning }) => terrainRenderer.burnCell(cell, burning));
    this.scenes.scene.add(
      terrainRenderer.group,
      this.unitRenderer.group,
      this.overlay.group,
      this.effects.group,
      this.missiles.group,
    );

    this.rtsCamera = new RTSCamera(heightAt, {
      minX: CAMERA_MARGIN,
      maxX: MAP_SIZE - CAMERA_MARGIN,
      minZ: CAMERA_MARGIN,
      maxZ: MAP_SIZE - CAMERA_MARGIN,
    });
    this.rtsCamera.focus(MAP_SIZE / 2, MAP_SIZE / 2 + 70, 70, true);
    this.projector = new ScreenProjector(this.rtsCamera.camera);
    this.picker = new TerrainPicker(this.terrain, this.rtsCamera.camera);
    this.input = new InputManager(canvas);

    const world = this.world;
    this.hud = new HUD(ui, this.units, this.troops, TEAM_FACTIONS, SKIRMISH_BATTLE, assets);
    this.audio = new AudioManager(assets);
    this.audio.attach(world, () => this.rtsCamera.target);
    const pickGround = (x: number, y: number) => this.picker.pick(x, y, this.projector.width, this.projector.height);
    this.troopInput = new TroopInput({
      world,
      troops: this.troops,
      formations: this.formations,
      mouse: this.input.mouse,
      keys: this.input.keys,
      team: PLAYER_TEAM,
      pickGround,
      pickUnit: (x, y, prefer) => this.pickUnit(x, y, prefer),
      marker: (x, z, attack) => {
        this.overlay.marker(x, z, attack);
        this.audio.play('ack', 0.9);
      },
      onSelect: (troop, focus) => {
        if (focus) this.lookBehind(troop);
      },
      preview: (target) => this.overlay.target(target),
    });
    this.heroCamera = new HeroCamera(heightAt);
    this.heroInput = new HeroInput({
      world,
      heroes: this.heroes,
      mouse: this.input.mouse,
      keys: this.input.keys,
      camera: this.heroCamera,
      team: PLAYER_TEAM,
      pickGround,
      viewport: () => ({ width: this.projector.width, height: this.projector.height }),
      preview: (target) => this.overlay.target(target),
      onDirect: (hero) => this.directControl(hero),
    });
    this.heroBar = new HeroBar(ui, world, this.heroes, this.heroInput, (id) => this.assets.portrait(id));
    this.troopInput.blocked = () => this.heroInput.busy;
    this.troopPanel = new TroopPanel(ui, world, this.troops, this.troopInput, PLAYER_TEAM);
    this.minimap = new Minimap(ui, {
      world,
      terrain: this.terrain,
      troops: this.troops,
      team: PLAYER_TEAM,
      selected: () => this.troopInput.selected,
      view: () => {
        const direct = this.heroInput.direct;
        if (direct >= 0) return { x: world.c.x[direct], z: world.c.z[direct], facing: this.heroCamera.aim };
        return { x: this.rtsCamera.target.x, z: this.rtsCamera.target.z, facing: this.rtsCamera.yaw + Math.PI };
      },
      onLook: (x, z) => {
        if (this.heroInput.direct >= 0) this.heroInput.toggleDirect();
        this.follow = -1;
        this.rtsCamera.focus(x, z);
      },
      onOrder: (x, z, queue, all) => this.troopInput.moveTo(x, z, queue, all),
    });
    const first = setup.playerTroops[0];
    this.troopInput.select(first, false);
    this.lookBehind(first, true);

    this.debug = new DebugManager(ui, this.perf);
    this.gpu = new GpuTimer(this.renderer.gl.getContext() as WebGL2RenderingContext);

    this.loop = new GameLoop(
      SIM_HZ,
      (dt) => this.simulation.step(dt),
      (alpha, frameSeconds) => this.frame(alpha, frameSeconds),
    );
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.loop.start();
    // `#perf=N` deploys N soldiers for a measurement straight away (e.g. #perf=50, #perf=1000).
    const perf = /#perf=(\d+)/.exec(location.hash);
    if (perf) {
      this.startPerfTest(Number(perf[1]));
      return;
    }
    // `#showcase`: every unit type side by side (models and animations).
    if (location.hash === '#showcase') {
      this.ai.enabled = false;
      this.follow = -1;
      this.showcase = setupShowcase(this.world, MAP_SIZE / 2, MAP_SIZE / 2);
      this.rtsCamera.focus(MAP_SIZE / 2, MAP_SIZE / 2 - 7, 60, true);
      return;
    }
    // The battle waits for the player to read the briefing (the scene keeps rendering behind it).
    this.loop.paused = true;
    new BriefingScreen(this.ui, {
      story: SKIRMISH_BATTLE,
      portrait: (id) => this.assets.portrait(id),
      artwork: this.assets.artwork(),
      credits: this.assets.credits(),
      onStart: () => {
        this.loop.paused = false;
        this.audio.play('horn');
      },
    });
  }

  /** F2: stress test with the next unit count (the AI is switched off, both armies charge). */
  startPerfTest(units?: number): void {
    this.ai.enabled = false;
    this.follow = -1;
    const n = this.perfTest.next(this.world, units);
    this.rtsCamera.focus(MAP_SIZE / 2, MAP_SIZE / 2 + 45, 110, true);
    this.debug.toggle(true);
    this.debug.status = `Test de performance : ${n} unités, mesure en cours (10 s)…`;
  }

  /** Unit whose projected centre is closest to a screen position, those of the preferred side first. */
  pickUnit(x: number, y: number, prefer: 'own' | 'enemy'): number {
    const { entities, c } = this.world;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) === 0 || c.state[id] === UnitState.Dying) continue;
      const p = this.projector.project(c.x[id], this.terrain.heightAt(c.x[id], c.z[id]) + 1.1 + (c.flying[id] ? FLY_HEIGHT : 0), c.z[id]);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > PICK_RADIUS) continue;
      const own = c.team[id] === PLAYER_TEAM;
      const score = d + (own === (prefer === 'own') ? 0 : PICK_RADIUS);
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  }

  /** Centre of a troop's soldiers. */
  private centre(t: Troop): { x: number; z: number } {
    const c = this.world.c;
    let x = 0;
    let z = 0;
    for (const id of t.members) {
      x += c.x[id];
      z += c.z[id];
    }
    const n = t.members.length || 1;
    return { x: x / n, z: z / n };
  }

  /** Tactic camera behind a troop, looking the way it faces, then following it. */
  lookBehind(t: Troop, instant = false): void {
    const p = this.centre(t);
    this.follow = t.id;
    this.rtsCamera.turnTo(this.world.c.rot[t.leader] + Math.PI, instant);
    this.rtsCamera.focus(p.x, p.z, Math.max(28, Math.min(this.rtsCamera.zoomGoal, 60)), instant);
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.rtsCamera.setAspect(window.innerWidth / window.innerHeight);
    this.projector.width = window.innerWidth;
    this.projector.height = window.innerHeight;
  }

  private frame(alpha: number, frameSeconds: number): void {
    const start = performance.now();
    const { keys, mouse } = this.input;
    const dt = Math.min(frameSeconds, 0.1);
    this.time += dt;
    for (const code of keys.justPressed) {
      if (code === 'Home') {
        this.rtsCamera.reset();
        const t = this.troopInput.troop();
        if (t) this.lookBehind(t);
      }
      if (code === 'KeyL') this.rtsCamera.freeCamera = !this.rtsCamera.freeCamera;
      if (code === 'F1') this.debug.toggle();
      if (code === 'F2') this.startPerfTest();
      if (code === 'KeyP' || code === 'Pause') this.loop.paused = !this.loop.paused;
      if (code === 'KeyM') this.audio.toggleMute();
    }
    // Action and tactic modes, one seamless camera: zooming all the way in on the hero's troop takes the
    // hero in hand, zooming all the way out of the hero gives the battlefield back; Q / E in action mode
    // go back to tactic mode on the next or previous troop.
    if (this.heroInput.direct >= 0) {
      const cycle = keys.justPressed.includes('KeyQ') || keys.justPressed.includes('KeyE');
      if ((mouse.wheel > 0 && this.heroCamera.farthest) || cycle) this.heroInput.toggleDirect();
    } else if (mouse.wheel < 0 && this.rtsCamera.closest && this.troopInput.troop()?.hero && !this.heroInput.targeting) {
      this.heroInput.toggleDirect();
    }
    this.heroInput.update();
    const direct = this.heroInput.direct;
    const camera = this.rtsCamera.camera;
    if (direct < 0) this.troopInput.update();
    const followed = this.troops.get(this.follow);
    if (followed && followed.status !== 'defeated' && followed.status !== 'routing') {
      const p = this.centre(followed);
      this.rtsCamera.focus(p.x, p.z);
    } else {
      this.follow = -1;
    }
    if (direct >= 0) {
      const c = this.world.c;
      const x = c.prevX[direct] + (c.x[direct] - c.prevX[direct]) * alpha;
      const z = c.prevZ[direct] + (c.z[direct] - c.prevZ[direct]) * alpha;
      this.heroCamera.update(camera, dt, x, this.terrain.heightAt(x, z), z);
    } else {
      // Panning frees the camera from the troop it followed.
      if (this.rtsCamera.update(dt, keys, mouse, this.renderer, !mouse.isDown(0))) this.follow = -1;
      this.heroCamera.release(camera, dt);
    }
    camera.updateMatrixWorld();
    const chosen = direct < 0 ? this.troopInput.troop() : null;
    let n = 0;
    for (const w of chosen?.waypoints ?? []) {
      if (n + 2 > this.waypoints.length) break;
      this.waypoints[n++] = w.x;
      this.waypoints[n++] = w.z;
    }
    this.overlay.preview(this.waypoints.subarray(0, n));

    const t = this.rtsCamera.target;
    this.scenes.lighting.follow(t.x, t.y, t.z);
    this.scenes.update(this.rtsCamera.camera);
    this.unitRenderer.update(this.world, alpha, dt, this.rtsCamera.camera, this.time);
    this.overlay.update(this.world, alpha, dt, chosen?.members ?? [], PLAYER_TEAM);
    this.overlay.traps(this.world.traps, PLAYER_TEAM);
    this.effects.update(this.loop.paused ? 0 : dt * this.loop.timeScale);
    this.missiles.update(this.world, alpha, this.loop.paused ? 0 : dt * this.loop.timeScale);
    this.hud.update(this.perfTest.current === null ? this.outcome.update(this.world) : null, direct >= 0 ? 'action' : 'tactic', chosen?.name ?? null);
    this.heroBar.update();
    this.troopPanel.update();
    this.minimap.update(dt);
    const cpuMs = performance.now() - start;
    this.gpu.begin();
    this.renderer.render(this.scenes.scene, this.rtsCamera.camera);
    this.gpu.end();
    this.input.endFrame();
    const frameMs = performance.now() - start;
    this.perf.record('frame', frameMs);
    if (frameSeconds > 0) this.fps += (1 / frameSeconds - this.fps) * 0.08;
    this.measure(frameSeconds, frameMs, cpuMs);
    this.frames++;
  }

  private measure(frameSeconds: number, frameMs: number, cpuMs: number): void {
    const render = this.renderer.stats();
    const result = this.perfTest.sample({
      frameSeconds,
      frameMs,
      simMs: this.perf.average('sim'),
      gpuMs: this.gpu.ms,
      drawCalls: render.calls,
      triangles: render.triangles,
    });
    if (result) {
      this.debug.setResults(this.perfTest.results);
      this.debug.status = `Terminé : ${result.units} unités — F2 pour le palier suivant.`;
      console.info('[perf]', JSON.stringify(result));
    }
    this.debug.update(frameSeconds, {
      fps: this.fps,
      frameMs: cpuMs,
      gpuMs: this.gpu.ms,
      drawCalls: render.calls,
      triangles: render.triangles,
      entities: this.world.entities.count,
      units: this.units.countActive(0) + this.units.countActive(1),
      visibleUnits: this.unitRenderer.visible,
      animatedUnits: this.unitRenderer.visible,
      particles: this.effects.active,
      projectiles: this.world.projectiles.count,
      formations: this.formations.count,
      flowFields: this.world.paths.computed,
    });
  }

  /**
   * Action mode entered (hero id) or left (-1): glide between the tactic and the hero cameras. The hero's
   * troop becomes the chosen one.
   */
  private directControl(hero: number): void {
    const c = this.world.c;
    const camera = this.rtsCamera.camera;
    if (hero >= 0) {
      const troop = this.troops.of(hero);
      if (troop) this.troopInput.selected = troop.id;
      this.heroCamera.enter(camera, c.x[hero], this.terrain.heightAt(c.x[hero], c.z[hero]), c.z[hero], c.rot[hero]);
      return;
    }
    this.heroCamera.exit(camera);
    // The tactic view comes back above the hero, looking the way the player last looked, and follows his troop.
    const last = this.heroInput.hero();
    if (!last) return;
    this.rtsCamera.turnTo(this.heroCamera.yaw, true);
    this.rtsCamera.focus(c.x[last.id], c.z[last.id], 30, true);
    this.follow = this.troops.of(last.id)?.id ?? -1;
  }

  get visibleUnits(): number {
    return this.unitRenderer.visible;
  }
}
