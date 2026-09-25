import * as THREE from 'three';
import { AIController } from '../ai/AIController';
import { RTSCamera } from '../camera/RTSCamera';
import { faction } from '../data/factions';
import { DebugManager } from '../debug/DebugManager';
import { GpuTimer } from '../debug/GpuTimer';
import { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { InputManager } from '../input/InputManager';
import { OrderInput } from '../input/OrderInput';
import { Terrain } from '../maps/Terrain';
import { EffectsRenderer } from '../renderer/EffectsRenderer';
import { OverlayRenderer } from '../renderer/OverlayRenderer';
import { Renderer } from '../renderer/Renderer';
import { SceneManager } from '../renderer/SceneManager';
import { ScreenProjector } from '../renderer/ScreenProjector';
import { TerrainPicker } from '../renderer/TerrainPicker';
import { TerrainRenderer } from '../renderer/TerrainRenderer';
import { UnitRenderer } from '../renderer/UnitRenderer';
import { BattleOutcome } from '../scenes/BattleOutcome';
import { PLAYER_TEAM, setupPrototypeBattle } from '../scenes/BattleScene';
import { PerformanceTestScene } from '../scenes/PerformanceTestScene';
import { SelectionInput } from '../selection/SelectionInput';
import { SelectionManager } from '../selection/SelectionManager';
import { PROTOTYPE_BATTLE } from '../data/story/battles';
import { BriefingScreen } from '../ui/BriefingScreen';
import { HUD } from '../ui/HUD';
import { UnitManager } from '../units/UnitManager';
import type { FormationManager } from '../formations/FormationManager';
import { FORMATION_LABELS, FORMATION_TYPES } from '../formations/FormationType';
import { GameLoop } from './GameLoop';
import type { Simulation } from './Simulation';
import { createBattleSimulation } from './SimulationFactory';
import { World } from './World';

const MAP_SIZE = 256;
const CAMERA_MARGIN = 20;
const SIM_HZ = 30;
const TEAM_FACTIONS = ['human_alliance', 'dark_legion'];

/** Browser orchestrator: owns the renderer, the loop, the input, the UI and the simulation. */
export class Game {
  readonly perf = new PerformanceMonitor();
  readonly renderer: Renderer;
  readonly scenes = new SceneManager();
  readonly terrain: Terrain;
  readonly world: World;
  readonly simulation: Simulation;
  readonly formations: FormationManager;
  readonly ai: AIController;
  readonly units: UnitManager;
  readonly rtsCamera: RTSCamera;
  readonly input: InputManager;
  readonly projector: ScreenProjector;
  readonly selection: SelectionManager;
  readonly selectionInput: SelectionInput;
  readonly orderInput: OrderInput;
  readonly picker: TerrainPicker;
  readonly hud: HUD;
  readonly loop: GameLoop;
  private readonly unitRenderer: UnitRenderer;
  private readonly overlay: OverlayRenderer;
  private readonly effects: EffectsRenderer;
  readonly outcome = new BattleOutcome(PLAYER_TEAM);
  readonly debug: DebugManager;
  readonly perfTest = new PerformanceTestScene();
  private readonly gpu: GpuTimer;
  private fps = 60;
  private time = 0;
  frames = 0;

  constructor(canvas: HTMLCanvasElement, readonly ui: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.terrain = Terrain.generate({ size: MAP_SIZE, seed: 20260925 });
    const heightAt = (x: number, z: number) => this.terrain.heightAt(x, z);

    this.world = new World({ seed: 1337, hz: SIM_HZ, terrain: this.terrain, perf: this.perf });
    const setup = setupPrototypeBattle(this.world, MAP_SIZE);
    this.ai = new AIController(this.world, setup.ai);
    const battle = createBattleSimulation(this.world, [this.ai], this.perf);
    this.simulation = battle.simulation;
    this.formations = battle.formations;
    this.units = new UnitManager(this.world);

    const teamColors = TEAM_FACTIONS.map((id) => new THREE.Color(faction(id).color));
    this.unitRenderer = new UnitRenderer(this.world.entities.capacity, teamColors, heightAt);
    this.overlay = new OverlayRenderer(heightAt);
    this.effects = new EffectsRenderer(this.world, heightAt);
    this.scenes.scene.add(new TerrainRenderer(this.terrain).group, this.unitRenderer.group, this.overlay.group, this.effects.group);

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
    this.selection = new SelectionManager({
      candidates: () => this.activeUnits(),
      isOwn: (id) => world.c.team[id] === PLAYER_TEAM,
      project: (id) => this.projector.project(world.c.x[id], heightAt(world.c.x[id], world.c.z[id]) + 1.1, world.c.z[id]),
      kind: (id) => world.c.unitType[id],
      isAlive: (id) => this.units.isActive(id),
    });
    this.hud = new HUD(ui, world, this.selection, this.units, TEAM_FACTIONS, PROTOTYPE_BATTLE);
    this.selectionInput = new SelectionInput(this.selection, this.input.mouse, this.input.keys, this.hud.box, (ids) => {
      const centre = this.units.centroid(ids);
      if (centre) this.rtsCamera.focus(centre.x, centre.z);
    });

    this.orderInput = new OrderInput({
      world,
      selection: this.selection,
      mouse: this.input.mouse,
      keys: this.input.keys,
      team: PLAYER_TEAM,
      pickGround: (x, y) => this.picker.pick(x, y, this.projector.width, this.projector.height),
      pickEnemy: (x, y) => {
        const id = this.selection.pick(x, y);
        return id >= 0 && world.c.team[id] !== PLAYER_TEAM ? id : -1;
      },
      formationOf: (units) => this.formations.typeOf(units),
      marker: (x, z, attack) => this.overlay.marker(x, z, attack),
      preview: (points) => this.overlay.preview(points),
    });
    this.selectionInput.blocked = () => this.orderInput.attackMoveArmed;
    const orders = this.orderInput;
    this.hud.panel.setActions([
      ...FORMATION_TYPES.map((type) => ({
        label: FORMATION_LABELS[type],
        title: `Formation : ${FORMATION_LABELS[type]} (F : suivante)`,
        onClick: () => orders.setFormation(type),
        active: () => this.formations.typeOf(this.selection.ids) === type,
      })),
      { label: 'Tenir (H)', title: 'Tenir la position : ne combattre qu’à portée', onClick: () => orders.hold() },
      {
        label: 'Marche offensive (T)',
        title: 'Le prochain clic engage tout ennemi rencontré en chemin',
        onClick: () => (orders.attackMoveArmed = true),
        active: () => orders.attackMoveArmed,
      },
    ]);

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
    // The battle waits for the player to read the briefing (the scene keeps rendering behind it).
    this.loop.paused = true;
    new BriefingScreen(this.ui, {
      story: PROTOTYPE_BATTLE,
      portrait: () => null,
      artwork: null,
      onStart: () => (this.loop.paused = false),
    });
  }

  /** F2: stress test with the next unit count (the AI is switched off, both armies charge). */
  startPerfTest(units?: number): void {
    this.ai.enabled = false;
    this.selection.clear();
    const n = this.perfTest.next(this.world, units);
    this.rtsCamera.focus(MAP_SIZE / 2, MAP_SIZE / 2 + 45, 110, true);
    this.debug.toggle(true);
    this.debug.status = `Test de performance : ${n} unités, mesure en cours (10 s)…`;
  }

  private *activeUnits(): Iterable<number> {
    const { entities } = this.world;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if (this.units.isActive(id)) yield id;
    }
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
      if (code === 'Home') this.rtsCamera.reset();
      if (code === 'KeyC') this.rtsCamera.freeCamera = !this.rtsCamera.freeCamera;
      if (code === 'F1') this.debug.toggle();
      if (code === 'F2') this.startPerfTest();
      if (code === 'KeyP' || code === 'Pause') this.loop.paused = !this.loop.paused;
    }
    this.rtsCamera.update(dt, keys, mouse, this.renderer, !mouse.isDown(0));
    this.rtsCamera.camera.updateMatrixWorld();
    this.selection.prune();
    this.selectionInput.update(performance.now());
    this.orderInput.update();

    const t = this.rtsCamera.target;
    this.scenes.lighting.follow(t.x, t.y, t.z);
    this.scenes.update(this.rtsCamera.camera);
    this.unitRenderer.update(this.world, alpha, dt, this.rtsCamera.camera, this.time);
    this.overlay.update(this.world, alpha, dt, this.selection.ids, PLAYER_TEAM);
    this.effects.update(this.loop.paused ? 0 : dt * this.loop.timeScale);
    this.hud.update(this.perfTest.current === null ? this.outcome.update(this.world) : null);
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
      formations: this.formations.count,
      flowFields: this.world.paths.computed,
    });
  }

  get visibleUnits(): number {
    return this.unitRenderer.visible;
  }
}
