import * as THREE from 'three';
import { RTSCamera } from '../camera/RTSCamera';
import { faction } from '../data/factions';
import { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { InputManager } from '../input/InputManager';
import { OrderInput } from '../input/OrderInput';
import { SpatialSystem } from '../navigation/SpatialSystem';
import { Terrain } from '../maps/Terrain';
import { OverlayRenderer } from '../renderer/OverlayRenderer';
import { Renderer } from '../renderer/Renderer';
import { SceneManager } from '../renderer/SceneManager';
import { ScreenProjector } from '../renderer/ScreenProjector';
import { TerrainPicker } from '../renderer/TerrainPicker';
import { TerrainRenderer } from '../renderer/TerrainRenderer';
import { UnitRenderer } from '../renderer/UnitRenderer';
import { PLAYER_TEAM, setupPrototypeBattle } from '../scenes/BattleScene';
import { SelectionInput } from '../selection/SelectionInput';
import { SelectionManager } from '../selection/SelectionManager';
import { HUD } from '../ui/HUD';
import { UnitManager } from '../units/UnitManager';
import { MovementSystem } from '../units/MovementSystem';
import { registerMoveOrders } from '../units/MoveOrders';
import { GameLoop } from './GameLoop';
import { Simulation } from './Simulation';
import { World } from './World';

const MAP_SIZE = 256;
const CAMERA_MARGIN = 20;
const SIM_HZ = 30;
const TEAM_FACTIONS = ['valdrenne', 'vhorsk'];

/** Browser orchestrator: owns the renderer, the loop, the input, the UI and the simulation. */
export class Game {
  readonly perf = new PerformanceMonitor();
  readonly renderer: Renderer;
  readonly scenes = new SceneManager();
  readonly terrain: Terrain;
  readonly world: World;
  readonly simulation: Simulation;
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
  private time = 0;
  frames = 0;

  constructor(canvas: HTMLCanvasElement, readonly ui: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.terrain = Terrain.generate({ size: MAP_SIZE, seed: 20260925 });
    const heightAt = (x: number, z: number) => this.terrain.heightAt(x, z);

    this.world = new World({ seed: 1337, hz: SIM_HZ, terrain: this.terrain, perf: this.perf });
    registerMoveOrders(this.world);
    this.simulation = new Simulation(this.world, [new SpatialSystem(), new MovementSystem()], this.perf);
    this.units = new UnitManager(this.world);
    setupPrototypeBattle(this.world, MAP_SIZE);

    const teamColors = TEAM_FACTIONS.map((id) => new THREE.Color(faction(id).color));
    this.unitRenderer = new UnitRenderer(this.world.entities.capacity, teamColors, heightAt);
    this.overlay = new OverlayRenderer(heightAt);
    this.scenes.scene.add(new TerrainRenderer(this.terrain).group, this.unitRenderer.group, this.overlay.group);

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
    this.hud = new HUD(ui, world, this.selection, this.units, TEAM_FACTIONS);
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
      marker: (x, z, attack) => this.overlay.marker(x, z, attack),
    });
    this.selectionInput.blocked = () => this.orderInput.attackMoveArmed;

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
    this.hud.update();
    this.renderer.render(this.scenes.scene, this.rtsCamera.camera);
    this.input.endFrame();
    this.perf.record('frame', performance.now() - start);
    this.frames++;
  }

  get visibleUnits(): number {
    return this.unitRenderer.visible;
  }
}
