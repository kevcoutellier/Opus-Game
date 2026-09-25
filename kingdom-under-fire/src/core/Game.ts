import * as THREE from 'three';
import { Terrain } from '../maps/Terrain';
import { Renderer } from '../renderer/Renderer';
import { SceneManager } from '../renderer/SceneManager';
import { TerrainRenderer } from '../renderer/TerrainRenderer';
import { GameLoop } from './GameLoop';

const MAP_SIZE = 256;

/** Browser orchestrator: owns the renderer, the loop and (in later phases) input, UI and simulation. */
export class Game {
  readonly renderer: Renderer;
  readonly scenes = new SceneManager();
  readonly terrain: Terrain;
  readonly camera: THREE.PerspectiveCamera;
  readonly loop: GameLoop;
  frames = 0;

  constructor(canvas: HTMLCanvasElement, readonly ui: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.terrain = Terrain.generate({ size: MAP_SIZE, seed: 20260925 });
    this.scenes.scene.add(new TerrainRenderer(this.terrain).group);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
    this.camera.position.set(MAP_SIZE / 2 + 40, 70, MAP_SIZE / 2 + 110);
    this.camera.lookAt(MAP_SIZE / 2, this.terrain.heightAt(MAP_SIZE / 2, MAP_SIZE / 2), MAP_SIZE / 2);
    this.loop = new GameLoop(30, () => {}, () => this.render());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.loop.start();
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private render(): void {
    const target = new THREE.Vector3(MAP_SIZE / 2, 0, MAP_SIZE / 2);
    this.scenes.lighting.follow(target.x, this.terrain.heightAt(target.x, target.z), target.z);
    this.scenes.update(this.camera);
    this.renderer.render(this.scenes.scene, this.camera);
    this.frames++;
  }
}
