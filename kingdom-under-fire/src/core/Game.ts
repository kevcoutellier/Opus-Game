import { RTSCamera } from '../camera/RTSCamera';
import { InputManager } from '../input/InputManager';
import { Terrain } from '../maps/Terrain';
import { Renderer } from '../renderer/Renderer';
import { SceneManager } from '../renderer/SceneManager';
import { TerrainRenderer } from '../renderer/TerrainRenderer';
import { GameLoop } from './GameLoop';

const MAP_SIZE = 256;
const CAMERA_MARGIN = 20;

/** Browser orchestrator: owns the renderer, the loop, the input and (in later phases) UI and simulation. */
export class Game {
  readonly renderer: Renderer;
  readonly scenes = new SceneManager();
  readonly terrain: Terrain;
  readonly rtsCamera: RTSCamera;
  readonly input: InputManager;
  readonly loop: GameLoop;
  frames = 0;

  constructor(canvas: HTMLCanvasElement, readonly ui: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.terrain = Terrain.generate({ size: MAP_SIZE, seed: 20260925 });
    this.scenes.scene.add(new TerrainRenderer(this.terrain).group);
    this.rtsCamera = new RTSCamera((x, z) => this.terrain.heightAt(x, z), {
      minX: CAMERA_MARGIN,
      maxX: MAP_SIZE - CAMERA_MARGIN,
      minZ: CAMERA_MARGIN,
      maxZ: MAP_SIZE - CAMERA_MARGIN,
    });
    this.rtsCamera.focus(MAP_SIZE / 2, MAP_SIZE / 2 + 40, 95, true);
    this.input = new InputManager(canvas);
    this.loop = new GameLoop(30, () => {}, (_alpha, frameSeconds) => this.frame(frameSeconds));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.loop.start();
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.rtsCamera.setAspect(window.innerWidth / window.innerHeight);
  }

  private frame(frameSeconds: number): void {
    const { keys, mouse } = this.input;
    for (const code of keys.justPressed) {
      if (code === 'Home') this.rtsCamera.reset();
      if (code === 'KeyC') this.rtsCamera.freeCamera = !this.rtsCamera.freeCamera;
    }
    const dt = Math.min(frameSeconds, 0.1);
    this.rtsCamera.update(dt, keys, mouse, this.renderer);
    const t = this.rtsCamera.target;
    this.scenes.lighting.follow(t.x, t.y, t.z);
    this.scenes.update(this.rtsCamera.camera);
    this.renderer.render(this.scenes.scene, this.rtsCamera.camera);
    this.input.endFrame();
    this.frames++;
  }
}
