import * as THREE from 'three';
import { ease, lerp, tween } from './tween.js';

let dotTexture;
function getDotTexture() {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

function glyphTexture(glyph, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4;
  ctx.strokeText(glyph, 32, 34);
  ctx.fillText(glyph, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const particleVertex = `
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  varying float vAlpha; varying vec3 vColor;
  void main() {
    vAlpha = aAlpha; vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const particleFragment = `
  uniform sampler2D uMap; varying float vAlpha; varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  }`;

/** A CPU-simulated cloud of additive point sprites. */
class Particles {
  constructor(count, { additive = true, map } = {}) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.baseSize = new Float32Array(count);
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: map || getDotTexture() } },
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.gravity = 0;
    this.drag = 0;
  }

  spawn(i, p, v, color, size, life) {
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = this.baseSize[i] = size;
    this.life[i] = this.maxLife[i] = life;
    this.alpha[i] = 1;
  }

  update(dt) {
    let alive = 0;
    const damp = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.gravity * dt;
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= damp;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
      this.alpha[i] = Math.min(1, k * 2);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * k);
    }
    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = attrs.aAlpha.needsUpdate = attrs.aSize.needsUpdate = attrs.aColor.needsUpdate = true;
    return alive;
  }
}

const rand = (a, b) => a + Math.random() * (b - a);
const randomDir = () => new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();

export class Effects {
  constructor(stage, overlay) {
    this.stage = stage;
    this.scene = stage.scene;
    this.overlay = overlay;
    this.systems = new Set();
    this.meshes = new Set();
    stage.onUpdate((dt) => {
      for (const s of this.systems) {
        if (s.update(dt) === 0 && s.done) {
          this.scene.remove(s.points);
          s.points.geometry.dispose();
          s.points.material.dispose();
          this.systems.delete(s);
        }
      }
      for (const m of this.meshes) m.userData.update?.(dt);
    });
  }

  addSystem(sys) {
    this.scene.add(sys.points);
    this.systems.add(sys);
    return sys;
  }

  /** Particles exploding outward from a point. */
  burst(at, color, { count = 40, speed = 5, size = 0.6, life = 0.6, gravity = 0, spread = 1, up = 0, drag = 1.5 } = {}) {
    const sys = this.addSystem(new Particles(count));
    sys.gravity = gravity;
    sys.drag = drag;
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const v = randomDir().multiplyScalar(speed * rand(0.4, 1) * spread);
      v.y += up;
      const tint = c.clone().offsetHSL(0, 0, rand(-0.1, 0.2));
      sys.spawn(i, at, v, tint, size * rand(0.6, 1.3), life * rand(0.6, 1));
    }
    sys.done = true;
    return sys;
  }

  /** Continuous emission between two points over time (flamethrower, water gun...). */
  stream(from, to, color, { duration = 0.7, rate = 160, size = 0.55, speed = 16, jitter = 0.35, gravity = 0, map, additive = true } = {}) {
    const total = Math.ceil(duration * rate);
    const sys = this.addSystem(new Particles(total, { map, additive }));
    sys.gravity = gravity;
    const dir = to.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    const c = new THREE.Color(color);
    const life = dist / speed;
    let spawned = 0;
    return tween(duration, (k) => {
      const target = Math.floor(k * total);
      for (; spawned < target; spawned++) {
        const v = dir.clone().multiplyScalar(speed).add(randomDir().multiplyScalar(jitter * speed * 0.15));
        sys.spawn(spawned, from, v, c.clone().offsetHSL(rand(-0.03, 0.03), 0, rand(-0.1, 0.15)), size * rand(0.7, 1.3), life * rand(0.9, 1.1));
      }
    }, ease.linear).then(() => {
      sys.done = true;
      return new Promise((r) => setTimeout(r, life * 700));
    });
  }

  /** A glowing orb flying from A to B, leaving a trail. Resolves on impact. */
  projectile(from, to, color, { duration = 0.45, size = 0.9, arc = 0, map } = {}) {
    const trail = this.addSystem(new Particles(80, { map }));
    const c = new THREE.Color(color);
    const orb = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: map || getDotTexture(), color: c, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    orb.scale.setScalar(size);
    this.scene.add(orb);
    let i = 0;
    const p = new THREE.Vector3();
    return tween(duration, (k) => {
      p.lerpVectors(from, to, k);
      p.y += Math.sin(k * Math.PI) * arc;
      orb.position.copy(p);
      for (let n = 0; n < 3 && i < trail.count; n++, i++) {
        trail.spawn(i, p, randomDir().multiplyScalar(0.4), c, size * 0.7, 0.35);
      }
    }, ease.inQuad).then(() => {
      this.scene.remove(orb);
      orb.material.dispose();
      trail.done = true;
    });
  }

  /** Glowing cylinder between two points (Hyper Beam, Ice Beam, Solar Beam...). */
  beam(from, to, color, { width = 0.35, duration = 0.8 } = {}) {
    const dist = from.distanceTo(to);
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.45, width * 0.45, 1, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(width, width, 1, 16, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    group.add(core, glow);
    group.position.copy(from);
    group.lookAt(to);
    core.rotation.x = glow.rotation.x = Math.PI / 2;
    this.scene.add(group);
    const sparks = this.addSystem(new Particles(120));
    const c = new THREE.Color(color);
    let n = 0;
    return tween(duration, (k) => {
      const grow = Math.min(1, k * 4);
      const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      for (const m of [core, glow]) {
        m.scale.set(fade * (1 + Math.sin(k * 60) * 0.15), dist * grow, fade * (1 + Math.sin(k * 60) * 0.15));
        m.position.z = (dist * grow) / 2;
      }
      glow.material.opacity = 0.6 * fade;
      if (grow >= 1 && n < sparks.count) {
        for (let s = 0; s < 4 && n < sparks.count; s++, n++) sparks.spawn(n, to, randomDir().multiplyScalar(4), c, 0.5, 0.4);
      }
    }, ease.linear).then(() => {
      this.scene.remove(group);
      core.geometry.dispose();
      glow.geometry.dispose();
      sparks.done = true;
    });
  }

  /** Expanding flat ring on the ground or around a target. */
  ring(at, color, { radius = 3, duration = 0.6, vertical = false, thickness = 0.25 } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(1 - thickness, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.copy(at);
    if (!vertical) mesh.rotation.x = -Math.PI / 2;
    else mesh.lookAt(this.stage.camera.position);
    this.scene.add(mesh);
    return tween(duration, (k) => {
      mesh.scale.setScalar(0.1 + radius * k);
      mesh.material.opacity = 1 - k;
    }, ease.outCubic).then(() => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  }

  /** Jagged lightning between two points, flickering. */
  lightning(from, to, color = '#fff27a', { duration = 0.5, bolts = 3 } = {}) {
    const lines = [];
    for (let b = 0; b < bolts; b++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: b === 0 ? '#ffffff' : color, transparent: true, blending: THREE.AdditiveBlending }));
      line.frustumCulled = false;
      this.scene.add(line);
      lines.push(line);
    }
    const glowA = this.burst(to, color, { count: 30, speed: 3, size: 0.8, life: duration });
    let timer = 0;
    const reshape = () => {
      for (const line of lines) {
        const arr = line.geometry.attributes.position.array;
        for (let i = 0; i < 16; i++) {
          const k = i / 15;
          const p = new THREE.Vector3().lerpVectors(from, to, k);
          if (i > 0 && i < 15) p.add(randomDir().multiplyScalar(0.55 * Math.sin(k * Math.PI)));
          arr.set([p.x, p.y, p.z], i * 3);
        }
        line.geometry.attributes.position.needsUpdate = true;
      }
    };
    reshape();
    return tween(duration, (k) => {
      timer += 1;
      if (timer % 3 === 0) reshape();
      for (const l of lines) l.material.opacity = Math.random() > 0.2 ? 1 - k * 0.5 : 0.1;
    }, ease.linear).then(() => {
      for (const l of lines) {
        this.scene.remove(l);
        l.geometry.dispose();
        l.material.dispose();
      }
      glowA.done = true;
    });
  }

  /** Stat arrows or motes floating up (buff) or sinking (debuff) around a Pokémon. */
  aura(at, color, { up = true, count = 36, radius = 1.1, height = 2.2 } = {}) {
    const sys = this.addSystem(new Particles(count, { map: glyphTexture(up ? '▲' : '▼', '#ffffff') }));
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const p = at.clone().add(new THREE.Vector3(Math.cos(a) * radius, up ? rand(-1, 0.2) : rand(0.5, height), Math.sin(a) * radius));
      sys.spawn(i, p, new THREE.Vector3(0, up ? 2.5 : -2.5, 0), c, 0.7, rand(0.5, 0.9));
    }
    sys.done = true;
    return new Promise((r) => setTimeout(r, 800));
  }

  /** Slow falling spores / dust. */
  powder(at, color, { count = 70, spread = 1.6, height = 3 } = {}) {
    const sys = this.addSystem(new Particles(count));
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = at.clone().add(new THREE.Vector3(rand(-spread, spread), rand(0.5, height), rand(-spread, spread)));
      sys.spawn(i, p, new THREE.Vector3(rand(-0.3, 0.3), rand(-1.6, -0.8), rand(-0.3, 0.3)), c, 0.45, rand(0.9, 1.4));
    }
    sys.done = true;
    return new Promise((r) => setTimeout(r, 1100));
  }

  /** Floating glyphs (music notes for Sing, Z's for sleep...). */
  glyphs(at, glyph, color, { count = 10, rise = 1.5 } = {}) {
    const sys = this.addSystem(new Particles(count, { additive: false, map: glyphTexture(glyph, color) }));
    for (let i = 0; i < count; i++) {
      const p = at.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.4, 0.6), rand(-1, 1)));
      sys.spawn(i, p, new THREE.Vector3(rand(-0.5, 0.5), rise, rand(-0.5, 0.5)), new THREE.Color('#ffffff'), 1.1, rand(0.8, 1.3));
    }
    sys.done = true;
    return new Promise((r) => setTimeout(r, 1000));
  }

  /** Boulders falling on a target. */
  rocks(at, { count = 6, color = '#8b7355' } = {}) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    const rocks = [];
    for (let i = 0; i < count; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.35, 0.7)), mat);
      r.position.copy(at).add(new THREE.Vector3(rand(-1.4, 1.4), rand(6, 11), rand(-1.4, 1.4)));
      r.castShadow = true;
      r.userData.v = 0;
      r.userData.delay = i * 0.07;
      this.scene.add(r);
      rocks.push(r);
    }
    return tween(1.0, (k) => {
      for (const r of rocks) {
        if (k < r.userData.delay) continue;
        r.userData.v += 0.9;
        r.position.y = Math.max(at.y - 0.8, r.position.y - r.userData.v * 0.05);
        r.rotation.x += 0.1;
        r.rotation.z += 0.07;
      }
    }, ease.linear).then(() => {
      for (const r of rocks) {
        this.scene.remove(r);
        r.geometry.dispose();
      }
      mat.dispose();
    });
  }

  /** Translucent wall in front of a Pokémon (Reflect / Light Screen / Barrier). */
  wall(at, facing, color) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.copy(at).add(facing.clone().multiplyScalar(1.4));
    mesh.position.y = 1.5;
    mesh.lookAt(mesh.position.clone().add(facing));
    this.scene.add(mesh);
    return tween(1.0, (k) => {
      mesh.material.opacity = Math.sin(k * Math.PI) * 0.55;
      mesh.scale.setScalar(0.6 + k * 0.4);
    }).then(() => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  }

  /** Full-screen colour flash through the DOM overlay. */
  flashScreen(color = '#ffffff', duration = 0.35, peak = 0.85) {
    const el = this.overlay;
    el.style.background = color;
    return tween(duration, (k) => {
      el.style.opacity = String(Math.sin(k * Math.PI) * peak);
    }, ease.linear).then(() => {
      el.style.opacity = '0';
    });
  }

  explosion(at) {
    this.flashScreen('#fff3c4', 0.5, 0.9);
    this.burst(at, '#ffb347', { count: 120, speed: 12, size: 1.4, life: 0.9, up: 2 });
    this.burst(at, '#ff4d1a', { count: 80, speed: 8, size: 1.8, life: 1.1 });
    this.burst(at, '#555555', { count: 50, speed: 4, size: 2.2, life: 1.4, up: 3 });
    this.ring(at.clone().setY(0.05), '#ffd27a', { radius: 9, duration: 0.8 });
    return new Promise((r) => setTimeout(r, 900));
  }

  lerpPoint(a, b, k) {
    return new THREE.Vector3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
  }
}
