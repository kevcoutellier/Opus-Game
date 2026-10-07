import * as THREE from 'three';
import { AIController } from '../ai/AIController';
import { StrategicAI } from '../ai/StrategicAI';
import type { AssetManager } from '../assets/AssetManager';
import { AudioManager } from '../audio/AudioManager';
import type { BuildingSystem } from '../buildings/BuildingSystem';
import { HeroCamera } from '../camera/HeroCamera';
import { RTSCamera } from '../camera/RTSCamera';
import { faction } from '../data/factions';
import { DebugManager } from '../debug/DebugManager';
import { GpuTimer } from '../debug/GpuTimer';
import { PerformanceMonitor } from '../debug/PerformanceMonitor';
import type { HeroSystem } from '../heroes/HeroSystem';
import { BuildingInput } from '../input/BuildingInput';
import { HeroInput } from '../input/HeroInput';
import { InputManager } from '../input/InputManager';
import { OrderInput } from '../input/OrderInput';
import { Terrain } from '../maps/Terrain';
import { buildingHeight } from '../renderer/BuildingMeshes';
import { BuildingRenderer } from '../renderer/BuildingRenderer';
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
import { BASE_AI, BASE_SITES, PLAYER_TEAM, setupBaseBattle, setupFieldBattle, type Army } from '../scenes/BattleScene';
import { PerformanceTestScene } from '../scenes/PerformanceTestScene';
import { setupShowcase } from '../scenes/ShowcaseScene';
import { SelectionInput } from '../selection/SelectionInput';
import { SelectionManager } from '../selection/SelectionManager';
import { BASE_BATTLE, PROTOTYPE_BATTLE, type BattleStory } from '../data/story/battles';
import { BriefingScreen } from '../ui/BriefingScreen';
import { BuildMenu } from '../ui/BuildMenu';
import { HeroBar } from '../ui/HeroBar';
import { HUD } from '../ui/HUD';
import { ProductionPanel } from '../ui/ProductionPanel';
import { ResourceBar } from '../ui/ResourceBar';
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

/** `bases`: the battle with bases (default); `field`: the pitched battle (`#field`, also for `#showcase` and `#perf`). */
export type Scenario = 'bases' | 'field';
const scenarioOf = (hash: string): Scenario => (/^#(field|showcase|perf=)/.test(hash) ? 'field' : 'bases');

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
  readonly buildings: BuildingSystem;
  readonly scenario: Scenario;
  readonly story: BattleStory;
  readonly ai: AIController;
  /** Units deployed at the start of the battle. */
  readonly armies: { player: Army; enemy: Army };
  readonly units: UnitManager;
  readonly rtsCamera: RTSCamera;
  readonly heroCamera: HeroCamera;
  readonly heroInput: HeroInput;
  readonly buildingInput: BuildingInput;
  private readonly heroBar: HeroBar;
  private readonly economyUI: { update(): void }[] = [];
  private readonly buildingRenderer: BuildingRenderer;
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
    this.scenario = scenarioOf(location.hash);
    const bases = this.scenario === 'bases';
    this.story = bases ? BASE_BATTLE : PROTOTYPE_BATTLE;
    this.terrain = Terrain.generate({ size: MAP_SIZE, seed: 20260925, sites: bases ? BASE_SITES : [] });
    const heightAt = (x: number, z: number) => this.terrain.heightAt(x, z);

    this.world = new World({ seed: 1337, hz: SIM_HZ, terrain: this.terrain, perf: this.perf });
    const field = bases ? null : setupFieldBattle(this.world, MAP_SIZE);
    this.ai = new AIController(this.world, field?.ai ?? BASE_AI);
    const battle = createBattleSimulation(this.world, [this.ai], this.perf);
    this.simulation = battle.simulation;
    this.formations = battle.formations;
    this.heroes = battle.heroes;
    this.buildings = battle.buildings;
    this.ai.heroes = battle.heroes;
    // The bases need the BuildingSystem: they are laid once the simulation exists.
    const baseSetup = bases ? setupBaseBattle(this.world, battle.buildings) : null;
    const setup = field ?? baseSetup!;
    if (baseSetup) this.ai.strategy = new StrategicAI(battle.buildings, baseSetup.strategy);
    this.armies = { player: setup.player, enemy: setup.enemy };
    this.outcome = new BattleOutcome(PLAYER_TEAM, bases ? (team) => this.buildings.hasHeadquarters(team) : null);
    this.units = new UnitManager(this.world);

    const teamColors = TEAM_FACTIONS.map((id) => new THREE.Color(faction(id).color));
    this.unitRenderer = new UnitRenderer(this.world.entities.capacity, teamColors, heightAt);
    this.overlay = new OverlayRenderer(heightAt);
    this.effects = new EffectsRenderer(this.world, heightAt);
    this.missiles = new ProjectileRenderer(this.world);
    this.buildingRenderer = new BuildingRenderer(this.buildings, teamColors, heightAt, this.effects);
    this.overlay.buildingTop = (id) => {
      const b = this.buildings.get(id);
      return b ? buildingHeight(b.def) + 1 : 8;
    };
    this.scenes.scene.add(
      new TerrainRenderer(this.terrain).group,
      this.buildingRenderer.group,
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
    if (bases) this.rtsCamera.focus(BASE_SITES[0].x, BASE_SITES[0].z - 22, 75, true);
    else this.rtsCamera.focus(MAP_SIZE / 2, MAP_SIZE / 2 + 70, 70, true);
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
    this.hud = new HUD(ui, world, this.selection, this.units, TEAM_FACTIONS, this.story, assets);
    this.audio = new AudioManager(assets);
    this.audio.attach(world, () => this.rtsCamera.target);
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
      marker: (x, z, attack) => {
        this.overlay.marker(x, z, attack);
        this.audio.play('ack', 0.9);
      },
      preview: (points) => this.overlay.preview(points),
    });
    this.heroCamera = new HeroCamera(heightAt);
    this.heroInput = new HeroInput({
      world,
      heroes: this.heroes,
      selection: this.selection,
      mouse: this.input.mouse,
      keys: this.input.keys,
      camera: this.heroCamera,
      team: PLAYER_TEAM,
      pickGround: (x, y) => this.picker.pick(x, y, this.projector.width, this.projector.height),
      viewport: () => ({ width: this.projector.width, height: this.projector.height }),
      preview: (target) => this.overlay.target(target),
      onDirect: (hero) => this.directControl(hero),
    });
    this.heroBar = new HeroBar(ui, world, this.heroes, this.heroInput, (id) => this.assets.portrait(id));
    this.buildingInput = new BuildingInput({
      world,
      buildings: this.buildings,
      selection: this.selection,
      mouse: this.input.mouse,
      keys: this.input.keys,
      team: PLAYER_TEAM,
      pickGround: (x, y) => this.picker.pick(x, y, this.projector.width, this.projector.height),
      ghost: (g) => (g ? this.buildingRenderer.showGhost(g.type, g.x, g.z, g.rot, g.valid) : this.buildingRenderer.hideGhost()),
      marker: (x, z) => {
        this.overlay.marker(x, z, false);
        this.audio.play('ack', 0.9);
      },
    });
    if (bases) {
      const top = ui.querySelector<HTMLElement>('.top-bar') ?? ui;
      this.economyUI.push(
        new ResourceBar(top, world, PLAYER_TEAM),
        new BuildMenu(ui, world, this.buildings, this.buildingInput, TEAM_FACTIONS[PLAYER_TEAM], PLAYER_TEAM),
        new ProductionPanel(ui, world, this.buildings, this.buildingInput, PLAYER_TEAM),
      );
    }
    this.selectionInput.blocked = () => this.orderInput.attackMoveArmed || this.heroInput.busy || this.buildingInput.busy;
    this.orderInput.blocked = () => this.heroInput.busy || this.buildingInput.busy;
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
    // `#showcase`: every unit type side by side (models and animations).
    if (location.hash === '#showcase') {
      this.ai.enabled = false;
      this.showcase = setupShowcase(this.world, MAP_SIZE / 2, MAP_SIZE / 2);
      this.rtsCamera.focus(MAP_SIZE / 2, MAP_SIZE / 2 - 7, 34, true);
      return;
    }
    // The battle waits for the player to read the briefing (the scene keeps rendering behind it).
    this.loop.paused = true;
    new BriefingScreen(this.ui, {
      story: this.story,
      scenarios: [
        { label: 'Bataille avec bases', hash: '', active: this.scenario === 'bases' },
        { label: 'Bataille rangée', hash: '#field', active: this.scenario === 'field' },
      ],
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
      if (code === 'KeyL') this.rtsCamera.freeCamera = !this.rtsCamera.freeCamera;
      if (code === 'F1') this.debug.toggle();
      if (code === 'F2') this.startPerfTest();
      if (code === 'KeyP' || code === 'Pause') this.loop.paused = !this.loop.paused;
      if (code === 'KeyM') this.audio.toggleMute();
    }
    this.heroInput.update();
    this.buildingInput.update();
    const direct = this.heroInput.direct;
    const camera = this.rtsCamera.camera;
    if (direct >= 0) {
      const c = this.world.c;
      const x = c.prevX[direct] + (c.x[direct] - c.prevX[direct]) * alpha;
      const z = c.prevZ[direct] + (c.z[direct] - c.prevZ[direct]) * alpha;
      this.heroCamera.update(camera, dt, x, this.terrain.heightAt(x, z), z);
    } else {
      this.rtsCamera.update(dt, keys, mouse, this.renderer, !mouse.isDown(0));
      this.heroCamera.release(camera, dt);
    }
    camera.updateMatrixWorld();
    this.selection.prune();
    if (direct < 0) {
      this.selectionInput.update(performance.now());
      this.orderInput.update();
    }

    const t = this.rtsCamera.target;
    this.scenes.lighting.follow(t.x, t.y, t.z);
    this.scenes.update(this.rtsCamera.camera);
    this.unitRenderer.update(this.world, alpha, dt, this.rtsCamera.camera, this.time);
    const building = this.buildingInput.selected;
    this.overlay.update(this.world, alpha, dt, building >= 0 ? [...this.selection.ids, building] : this.selection.ids, PLAYER_TEAM);
    const c = this.world.c;
    this.overlay.outline(building >= 0 ? { x: c.x[building], z: c.z[building], halfW: c.halfW[building], halfD: c.halfD[building], own: c.team[building] === PLAYER_TEAM } : null);
    this.buildingRenderer.update(this.world, this.loop.paused ? 0 : dt * this.loop.timeScale);
    this.effects.update(this.loop.paused ? 0 : dt * this.loop.timeScale);
    this.missiles.update(this.world, alpha, this.loop.paused ? 0 : dt * this.loop.timeScale);
    this.hud.update(this.perfTest.current === null ? this.outcome.update(this.world) : null);
    this.heroBar.update();
    for (const panel of this.economyUI) panel.update();
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

  /** Direct control taken (hero id) or given back (-1): glide between the RTS and the hero cameras. */
  private directControl(hero: number): void {
    const c = this.world.c;
    const camera = this.rtsCamera.camera;
    if (hero >= 0) {
      this.heroCamera.enter(camera, c.x[hero], this.terrain.heightAt(c.x[hero], c.z[hero]), c.z[hero], c.rot[hero]);
      return;
    }
    this.heroCamera.exit(camera);
    // The RTS view comes back above the hero, looking the way the player last looked.
    const last = this.heroInput.hero();
    if (last) this.rtsCamera.focus(c.x[last.id], c.z[last.id], undefined, true);
  }

  get visibleUnits(): number {
    return this.unitRenderer.visible;
  }
}
