import * as THREE from 'three';

/** Drawing-buffer budget: never render more pixels than a native 4K screen (3840×2160). */
const MAX_PIXELS = 3840 * 2160;

export interface RenderStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

/** Owns the WebGL context. The UI is DOM, so its resolution stays independent of `renderScale`. */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  /** Multiplier of the device pixel ratio (0.5 = half resolution, for weak GPUs). */
  renderScale = 1;
  width = 1;
  height = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    let ratio = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const pixels = width * height * ratio * ratio;
    if (pixels > MAX_PIXELS) ratio *= Math.sqrt(MAX_PIXELS / pixels);
    this.gl.setPixelRatio(ratio);
    this.gl.setSize(width, height, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.gl.render(scene, camera);
  }

  stats(): RenderStats {
    const { render, memory, programs } = this.gl.info;
    return {
      calls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      programs: programs?.length ?? 0,
    };
  }
}
