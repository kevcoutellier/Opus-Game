import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl, modelCandidates } from './assets.js';
import { ease, lerp, tween, tweenSpeed, wait } from './tween.js';

// three.js ships the Draco decoder and Vite bundles it (import.meta.url).
const draco = new DRACOLoader();
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
const cache = new Map();
let preferAnimated = true;

/** 'animated' (06wj models with real clips, ~3 MB each) or 'light' (Pokemon-3D-api, ~170 KB). */
export function setModelQuality(quality) {
  const animated = quality !== 'light';
  if (animated !== preferAnimated) cache.clear();
  preferAnimated = animated;
}

// Pokémon that hover above the field, like in Stadium.
const HOVERING = new Set([12, 15, 17, 18, 22, 41, 42, 49, 81, 82, 92, 93, 109, 110, 142, 144, 145, 146, 151]);

/** Resolves to the best available glTF ({ scene, animations, source }) or null. */
export function loadModel(num) {
  if (!cache.has(num)) {
    const attempt = async () => {
      for (const { source, url } of modelCandidates(num, { animated: preferAnimated })) {
        try {
          const gltf = await loader.loadAsync(url);
          gltf.source = source;
          return gltf;
        } catch (err) {
          console.warn(`[models] #${num} ${source} unavailable`, err?.message || err);
        }
      }
      cache.delete(num);
      return null;
    };
    cache.set(num, attempt());
  }
  return cache.get(num);
}

/** World height given the real height in metres, compressed so Onix fits the field. */
export function worldHeight(heightm) {
  return 1.3 * heightm ** 0.55 + 0.55;
}

function classifyClips(clips) {
  const find = (re) => clips.find((c) => re.test(c.name));
  const generic = clips.length === 1 && /take|armature|action/i.test(clips[0].name) ? clips[0] : null;
  return {
    idle: find(/battlewait|defaultwait|aidle|idle|wait/i) || generic,
    attack: find(/attack|fight_b|impactrueno|roar/i),
    hit: find(/damage|fight_d|stun_start/i),
    faint: find(/down_start|\|?\d*ko$|dizzy/i),
    happy: find(/^happy$|glad/i),
    sleep: find(/^sleep$|sleep01_loop|sleep_loop/i),
  };
}

function injectFlash(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlashColor = uniforms.color;
    shader.uniforms.uFlashAmount = uniforms.amount;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlashColor;\nuniform float uFlashAmount;')
      .replace(
        '#include <dithering_fragment>',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlashColor, uFlashAmount);\n#include <dithering_fragment>',
      );
  };
  material.customProgramCacheKey = () => 'stadium-flash';
}

function spriteModel(num) {
  const tex = new THREE.TextureLoader().load(assetUrl('sprites', num));
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  );
  mesh.position.y = 0.5;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.billboard = mesh;
  return g;
}

/**
 * A Pokémon on the field. `root` is placed by the scene (position + facing),
 * `pivot` receives the procedural animation (hops, lunges, squash & stretch).
 */
export class PokemonActor {
  static async create(species) {
    const gltf = await loadModel(species.num);
    return new PokemonActor(species, gltf);
  }

  constructor(species, gltf) {
    this.species = species;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    this.flash = { color: { value: new THREE.Color('#ffffff') }, amount: { value: 0 } };
    this.materials = [];
    this.phase = Math.random() * 10;
    this.hover = HOVERING.has(species.num) ? 0.9 : 0;
    this.idleEnabled = true;
    this.offset = new THREE.Vector3();
    this.squash = 1;

    const model = gltf ? cloneSkinned(gltf.scene) : spriteModel(species.num);
    this.model = model;
    this.billboard = model.userData.billboard || null;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        injectFlash(c, this.flash);
        this.materials.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });

    // Normalise size and put the feet on the ground, centred on the pivot.
    model.updateMatrixWorld(true);
    model.traverse((o) => o.isSkinnedMesh && o.skeleton.update());
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    const target = worldHeight(species.heightm);
    const dim = Math.max(size.y, 0.7 * Math.max(size.x, size.z)) || 1;
    const scale = target / dim;
    model.scale.multiplyScalar(scale);
    const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
    model.position.set(-center.x, -box.min.y * scale, -center.z);
    this.height = size.y * scale;
    this.width = Math.max(size.x, size.z) * scale;
    this.pivot.add(model);

    this.source = gltf?.source || 'sprite';
    this.clips = { idle: null, attack: null, hit: null, faint: null, happy: null, sleep: null };
    this.base = 'idle';
    if (gltf?.animations?.length) {
      this.mixer = new THREE.AnimationMixer(model);
      this.clips = classifyClips(gltf.animations);
      if (this.clips.idle) this.mixer.clipAction(this.clips.idle).play();
      // One-shot clips hand back to the looping base state (idle or sleep) when done.
      this.mixer.addEventListener('finished', (e) => {
        if (e.action === this.oneShot && e.action.getClip() !== this.clips.faint) this.fadeToBase(0.25);
      });
    }
  }

  baseAction() {
    const clip = this.clips[this.base] || this.clips.idle;
    return clip && this.mixer?.clipAction(clip);
  }

  fadeToBase(fade = 0.3) {
    const base = this.baseAction();
    if (!base) return;
    base.enabled = true;
    base.setLoop(THREE.LoopRepeat, Infinity);
    base.reset().fadeIn(fade).play();
    this.oneShot?.fadeOut(fade);
    this.oneShot = null;
  }

  /** Loops the model's sleep clip while asleep (when it has one). */
  setSleeping(on) {
    const next = on && this.clips.sleep ? 'sleep' : 'idle';
    if (next === this.base || !this.mixer) return;
    const previous = this.baseAction();
    this.base = next;
    previous?.fadeOut(0.4);
    this.fadeToBase(0.4);
  }

  /** Chest height in world space, where projectiles come from and land. */
  get center() {
    return new THREE.Vector3(0, this.height * 0.55 + this.hover, 0).applyMatrix4(this.root.matrixWorld);
  }

  update(dt, time, camera) {
    this.mixer?.update(dt * tweenSpeed());
    const t = time + this.phase;
    // Models with a real idle clip only need a hint of procedural breathing.
    const breathe = this.idleEnabled ? Math.sin(t * 2.4) * (this.clips.idle ? 0.008 : 0.025) : 0;
    const bob = this.hover && this.idleEnabled ? Math.sin(t * 1.7) * 0.18 : 0;
    this.pivot.position.set(this.offset.x, this.offset.y + this.hover + bob, this.offset.z);
    this.pivot.scale.set(1 / Math.sqrt(this.squash) - breathe * 0.5, this.squash + breathe, 1 / Math.sqrt(this.squash) - breathe * 0.5);
    if (this.billboard && camera) {
      this.billboard.quaternion.copy(this.root.quaternion).invert().multiply(camera.quaternion);
      this.billboard.scale.setScalar(this.height * 1.1);
    }
  }

  setFlash(color, amount) {
    this.flash.color.value.set(color);
    this.flash.amount.value = amount;
  }

  setOpacity(alpha) {
    for (const m of this.materials) {
      const transparent = alpha < 1;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = alpha;
    }
  }

  /** Plays a one-shot clip; long clips are sped up to fit the battle pacing. Returns its duration. */
  playClip(name, fade = 0.15) {
    const clip = this.clips[name];
    if (!clip || !this.mixer) return 0;
    const maxDuration = { attack: 2.2, happy: 2.8, hit: 0.8 }[name] ?? clip.duration;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = Math.max(1, clip.duration / maxDuration);
    this.baseAction()?.fadeOut(fade);
    if (this.oneShot && this.oneShot !== action) this.oneShot.fadeOut(fade);
    action.fadeIn(fade).play();
    this.oneShot = action;
    return clip.duration / action.timeScale;
  }

  // --------------------------------------------------------------- motions

  async appear() {
    this.root.visible = true;
    this.squash = 1;
    this.setOpacity(1);
    this.setFlash('#ffffff', 1);
    await tween(0.45, (k) => {
      this.root.scale.setScalar(Math.max(0.001, k));
    }, ease.outBack);
    await tween(0.35, (k) => this.setFlash('#ffffff', 1 - k));
  }

  async recall() {
    this.setFlash('#ff3b3b', 0);
    await tween(0.25, (k) => this.setFlash('#ff3b3b', k * 0.9));
    await tween(0.35, (k) => this.root.scale.setScalar(Math.max(0.001, 1 - k)), ease.inCubic);
    this.root.visible = false;
    this.setFlash('#ffffff', 0);
  }

  /** Physical attack: wind up, dash towards the foe, bounce back. */
  async lunge(toward, distance = 4.5) {
    const dir = toward.clone().sub(this.root.position).setY(0).normalize();
    const local = dir.applyQuaternion(this.root.quaternion.clone().invert());
    this.playClip('attack');
    await tween(0.18, (k) => {
      this.offset.copy(local).multiplyScalar(-0.5 * k);
      this.squash = 1 - 0.18 * k;
    });
    await tween(0.16, (k) => {
      this.offset.copy(local).multiplyScalar(lerp(-0.5, distance, k));
      this.offset.y = Math.sin(k * Math.PI) * 0.8;
      this.squash = lerp(0.82, 1.15, k);
    }, ease.inQuad);
    this.squash = 1;
    // Resolve at impact; the way back plays on its own.
    tween(0.35, (k) => {
      this.offset.copy(local).multiplyScalar(lerp(distance, 0, k));
    }, ease.outCubic);
  }

  /** Special attack: rise, glow with the move colour. */
  async channel(color) {
    this.playClip('attack');
    await tween(0.25, (k) => {
      this.offset.y = Math.sin(k * Math.PI * 0.5) * 0.45;
      this.squash = 1 + 0.1 * k;
      this.setFlash(color, 0.45 * k);
    });
    await wait(0.1);
    tween(0.35, (k) => {
      this.offset.y = 0.45 * (1 - k);
      this.squash = 1.1 - 0.1 * k;
      this.setFlash(color, 0.45 * (1 - k));
    });
  }

  /** Stat move on itself: spin around with a glow. */
  async spin(color) {
    const start = this.pivot.rotation.y;
    await tween(0.6, (k) => {
      this.pivot.rotation.y = start + k * Math.PI * 2;
      this.offset.y = Math.sin(k * Math.PI) * 0.6;
      this.setFlash(color, Math.sin(k * Math.PI) * 0.5);
    }, ease.inOutCubic);
    this.pivot.rotation.y = start;
    this.offset.y = 0;
  }

  async hit({ strong = false } = {}) {
    this.playClip('hit');
    const amp = strong ? 0.35 : 0.2;
    await tween(0.45, (k) => {
      const s = Math.sin(k * Math.PI * 9) * (1 - k);
      this.offset.x = s * amp;
      this.offset.z = -Math.sin(k * Math.PI) * amp * 1.5;
      this.setFlash('#ffffff', Math.max(0, Math.sin(k * Math.PI * 5)) * 0.85 * (1 - k * 0.5));
    }, ease.linear);
    this.offset.set(0, 0, 0);
    this.setFlash('#ffffff', 0);
  }

  async shake(color = '#ffffff') {
    await tween(0.4, (k) => {
      this.offset.x = Math.sin(k * Math.PI * 8) * 0.12 * (1 - k);
      this.setFlash(color, Math.sin(k * Math.PI) * 0.4);
    }, ease.linear);
    this.offset.x = 0;
  }

  async heal() {
    await tween(0.8, (k) => this.setFlash('#7dffb2', Math.sin(k * Math.PI) * 0.55));
  }

  async faint() {
    this.idleEnabled = false;
    this.playClip('faint');
    await tween(0.25, (k) => this.setFlash('#1a1a2e', k * 0.35));
    await tween(0.8, (k) => {
      this.offset.y = -k * this.height * 0.9;
      this.squash = 1 - k * 0.4;
      this.setOpacity(1 - k);
    }, ease.inQuad);
    this.root.visible = false;
    this.setOpacity(1);
    this.setFlash('#ffffff', 0);
    this.offset.set(0, 0, 0);
    this.squash = 1;
    this.idleEnabled = true;
  }

  async celebrate() {
    const duration = this.playClip('happy');
    if (duration) {
      await wait(Math.min(duration, 2.8));
      return;
    }
    for (let i = 0; i < 2; i++) {
      await tween(0.28, (k) => {
        this.offset.y = Math.sin(k * Math.PI) * 0.9;
        this.squash = 1 + Math.sin(k * Math.PI) * 0.12;
      });
    }
    this.offset.y = 0;
    this.squash = 1;
  }

  dispose() {
    this.root.removeFromParent();
    this.mixer?.stopAllAction();
    for (const m of this.materials) m.dispose();
  }
}
