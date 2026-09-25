import * as THREE from 'three';
import { Lighting, SUN_DIRECTION } from './Lighting';

const SKY_TOP = new THREE.Color(0x3b4b5e);
const SKY_HORIZON = new THREE.Color(0xb3a38b);
const SKY_GROUND = new THREE.Color(0x5b554a);

/** Scene graph root: sky dome, atmospheric fog, lights. Game renderers add their own persistent objects. */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly lighting: Lighting;
  private readonly sky: THREE.Mesh;

  constructor() {
    this.scene.fog = new THREE.Fog(SKY_HORIZON.clone().multiplyScalar(0.92), 140, 520);
    this.scene.background = SKY_HORIZON;
    this.lighting = new Lighting(this.scene);
    this.sky = createSkyDome();
    this.scene.add(this.sky);
  }

  /** The dome is centred on the camera every frame: it is always at "infinity". */
  update(camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);
  }
}

function createSkyDome(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: SKY_TOP },
      horizon: { value: SKY_HORIZON },
      ground: { value: SKY_GROUND },
      sunDir: { value: SUN_DIRECTION },
      sunColor: { value: new THREE.Color(0xffd9a6) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 ground;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, clamp(-h * 5.0, 0.0, 1.0));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 900.0) * 2.5 + pow(s, 14.0) * 0.28);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
