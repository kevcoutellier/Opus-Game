import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from './assets.js';

// The battle field is a raised rectangle; Pokémon stand at z = ±FIELD_SPOT.
export const FIELD = { width: 16, length: 28, height: 0.6 };
export const FIELD_SPOT = 7.2;
export const TRAINER_SPOT = 12.4;

const THEMES = {
  day: { top: '#3d8fe0', horizon: '#bfe3ff', sun: 1.0, hemi: 1.1, fog: '#b9d9f2', exposure: 1.05, towers: 0.35, env: 0.8 },
  sunset: { top: '#2b3a78', horizon: '#ffb07a', sun: 0.8, hemi: 0.8, fog: '#d99a7c', exposure: 1.0, towers: 0.8, env: 0.55 },
  night: { top: '#050a1c', horizon: '#1c2b52', sun: 0.55, hemi: 0.45, fog: '#101a33', exposure: 1.15, towers: 1.6, env: 0.35 },
};

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function drawPokeball(ctx, x, y, r, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = r * 0.09;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = 'rgba(230, 60, 60, 0.55)';
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r * 0.28, y);
  ctx.moveTo(x + r * 0.28, y);
  ctx.lineTo(x + r, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function fieldTexture() {
  return canvasTexture(1024, 1792, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3f6e8f');
    g.addColorStop(0.5, '#4f86a6');
    g.addColorStop(1, '#3f6e8f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // mowing-style stripes
    for (let i = 0; i < 14; i++) {
      if (i % 2) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(0, (i * h) / 14, w, h / 14);
    }
    // subtle noise
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    const m = 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 12;
    ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(m, h / 2);
    ctx.lineTo(w - m, h / 2);
    ctx.stroke();
    drawPokeball(ctx, w / 2, h / 2, 190);
    // Pokémon spots
    for (const y of [h * 0.24, h * 0.76]) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(w / 2, y, 120, 0, Math.PI * 2);
      ctx.stroke();
    }
    // end boxes
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeRect(w * 0.3, m, w * 0.4, h * 0.08);
    ctx.strokeRect(w * 0.3, h - m - h * 0.08, w * 0.4, h * 0.08);
  });
}

function groundTexture() {
  const tex = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4c7a3a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) {
      const v = 60 + Math.random() * 60;
      ctx.fillStyle = `rgba(${v * 0.6},${v + 40},${v * 0.4},0.25)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 4);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  return tex;
}

function trackTexture() {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a8f99';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#767b86';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo((i * w) / 4, 0);
      ctx.lineTo((i * w) / 4, h);
      ctx.moveTo(0, (i * h) / 4);
      ctx.lineTo(w, (i * h) / 4);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

/** Stepped elliptical bowl built with a lathe, coloured by tier and section. */
function buildStands() {
  const tiers = 12;
  const r0 = 30;
  const step = 2.1;
  const rise = 1.25;
  const base = 2.2;
  const pts = [new THREE.Vector2(r0 - 0.5, 0), new THREE.Vector2(r0, 0), new THREE.Vector2(r0, base)];
  for (let i = 0; i < tiers; i++) {
    const r = r0 + i * step;
    const y = base + i * rise;
    pts.push(new THREE.Vector2(r + step, y));
    pts.push(new THREE.Vector2(r + step, y + rise));
  }
  const rTop = r0 + tiers * step;
  const yTop = base + tiers * rise;
  pts.push(new THREE.Vector2(rTop + 3, yTop + 1.5));
  pts.push(new THREE.Vector2(rTop + 3, 0));
  const segments = 96;
  const geo = new THREE.LatheGeometry(pts, segments);
  const colors = [];
  const palette = [new THREE.Color('#d8443c'), new THREE.Color('#2f6fd1'), new THREE.Color('#f2c230'), new THREE.Color('#2f9b5a')];
  const concrete = new THREE.Color('#c9ccd4');
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / pts.length);
    const j = i % pts.length;
    const angle = (seg / segments) * Math.PI * 2;
    const section = Math.floor(((angle + Math.PI / 8) / (Math.PI * 2)) * 8) % 4;
    let c = concrete;
    if (j >= 3 && j < pts.length - 2) {
      const riser = (j - 3) % 2 === 1;
      c = riser ? palette[section].clone().multiplyScalar(0.72) : palette[section];
    }
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, side: THREE.DoubleSide }),
  );
  mesh.scale.set(0.82, 1, 1);
  mesh.receiveShadow = true;
  return { mesh, tiers, r0, step, rise, base, rTop, yTop, scaleX: 0.82 };
}

function buildCrowd(stands) {
  // Kept very low-poly: there are ~2,700 spectators.
  const body = new THREE.CylinderGeometry(0.2, 0.3, 0.75, 5, 1, true);
  body.translate(0, 0.38, 0);
  const head = new THREE.IcosahedronGeometry(0.2, 0);
  head.translate(0, 0.95, 0);
  const geo = mergeGeometries([body.toNonIndexed(), head]);
  const uniforms = { uTime: { value: 0 }, uCheer: { value: 0.12 } };
  const mat = new THREE.MeshLambertMaterial();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCheer = uniforms.uCheer;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uCheer;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = float(gl_InstanceID) * 1.618;
        transformed.y += abs(sin(uTime * (5.0 + mod(ph, 3.0)) + ph)) * uCheer;`,
      );
  };
  const spots = [];
  for (let t = 0; t < stands.tiers; t++) {
    const r = stands.r0 + t * stands.step + stands.step * 0.55;
    const y = stands.base + t * stands.rise;
    const count = Math.floor((2 * Math.PI * r) / 0.78);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      // aisles every 1/16th of the bowl
      if (Math.abs(((a / (Math.PI * 2)) * 16) % 1 - 0.5) < 0.05) continue;
      if (Math.random() < 0.18) continue;
      spots.push([Math.cos(a) * r * stands.scaleX, y, Math.sin(a) * r, a]);
    }
  }
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const colors = ['#e84a4a', '#f7d046', '#4a86e8', '#ffffff', '#57c26a', '#f08fb8', '#ff9a3d', '#9b6be8', '#333a45'];
  const c = new THREE.Color();
  spots.forEach(([x, y, z, a], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2);
    const k = 0.9 + Math.random() * 0.25;
    s.set(k, k, k);
    m.compose(new THREE.Vector3(x, y, z), q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(colors[Math.floor(Math.random() * colors.length)]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, uniforms };
}

function buildTower(glowMaterial) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa3b2', metalness: 0.6, roughness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 40, 8), metal);
  pole.position.y = 20;
  g.add(pole);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 1), metal);
  frame.position.y = 41;
  g.add(frame);
  const lamp = new THREE.PlaneGeometry(1.1, 1.1);
  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 3; y++) {
      const l = new THREE.Mesh(lamp, glowMaterial);
      l.position.set(-3.5 + x * 1.4, 39.6 + y * 1.4, 0.55);
      g.add(l);
    }
  }
  return g;
}

function glowSprite(color, size) {
  const tex = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  sprite.scale.setScalar(size);
  return sprite;
}

function buildSky() {
  const uniforms = {
    topColor: { value: new THREE.Color() },
    horizonColor: { value: new THREE.Color() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 topColor; uniform vec3 horizonColor; varying vec3 vPos;
      void main() { float h = normalize(vPos).y; float k = pow(clamp(h, 0.0, 1.0), 0.55);
        gl_FragColor = vec4(mix(horizonColor, topColor, k), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
  return { sky, uniforms };
}

export class Arena {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    stage.scene.add(this.group);

    const { sky, uniforms } = buildSky();
    this.skyUniforms = uniforms;
    this.group.add(sky);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(400, 48),
      new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.group.add(ground);

    const track = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ map: trackTexture(), roughness: 0.9 }),
    );
    track.rotation.x = -Math.PI / 2;
    track.scale.set(0.82, 1, 1);
    track.receiveShadow = true;
    this.group.add(track);

    // Battle field
    const fieldMat = new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.7 });
    const side = new THREE.MeshStandardMaterial({ color: '#e9edf5', roughness: 0.5 });
    const field = new THREE.Mesh(new THREE.BoxGeometry(FIELD.width, FIELD.height, FIELD.length), [side, side, fieldMat, side, side, side]);
    field.position.y = -FIELD.height / 2 + 0.001;
    field.receiveShadow = true;
    this.group.add(field);
    const edgeMat = new THREE.MeshBasicMaterial({ color: '#7ff3ff' });
    this.edgeMat = edgeMat;
    for (const [w, l, x, z] of [
      [FIELD.width + 0.3, 0.18, 0, FIELD.length / 2],
      [FIELD.width + 0.3, 0.18, 0, -FIELD.length / 2],
      [0.18, FIELD.length, FIELD.width / 2, 0],
      [0.18, FIELD.length, -FIELD.width / 2, 0],
    ]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, l), edgeMat);
      e.position.set(x, -0.12, z);
      this.group.add(e);
    }

    // Trainer boxes
    this.trainerBoxes = [];
    for (const [z, color] of [[TRAINER_SPOT, '#e2493b'], [-TRAINER_SPOT, '#3b6fe2']]) {
      const box = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.7, 0.5, 24),
        [new THREE.MeshStandardMaterial({ color: '#dfe3ea' }), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 })],
      );
      box.position.set(0, 0.25, z);
      box.castShadow = box.receiveShadow = true;
      this.group.add(box);
      this.trainerBoxes.push(box);
    }

    const stands = buildStands();
    this.group.add(stands.mesh);
    const crowd = buildCrowd(stands);
    this.crowd = crowd;
    this.group.add(crowd.mesh);

    // Banners on the rim
    const bannerColors = ['#a8a878', '#c03028', '#a890f0', '#a040a0', '#e0c068', '#b8a038', '#a8b820', '#705898', '#f08030', '#6890f0', '#78c850', '#f8d030', '#f85888', '#98d8d8', '#7038f8'];
    const bannerGeo = new THREE.PlaneGeometry(2.4, 4.2);
    const count = 40;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = stands.rTop + 3.2;
      const b = new THREE.Mesh(
        bannerGeo,
        new THREE.MeshStandardMaterial({ color: bannerColors[i % bannerColors.length], side: THREE.DoubleSide, roughness: 0.9 }),
      );
      b.position.set(Math.cos(a) * r * stands.scaleX, stands.yTop + 4.2, Math.sin(a) * r);
      b.lookAt(0, b.position.y, 0);
      this.group.add(b);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6.5), new THREE.MeshStandardMaterial({ color: '#cccccc' }));
      pole.position.set(b.position.x, stands.yTop + 3.3, b.position.z);
      this.group.add(pole);
    }

    // Light towers
    this.towerGlow = new THREE.MeshBasicMaterial({ color: '#fffbe6' });
    this.towerSprites = [];
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const t = buildTower(this.towerGlow);
      t.position.set(x * 40, 0, z * 44);
      t.lookAt(0, 0, 0);
      this.group.add(t);
      const s = glowSprite('#fff4d0', 26);
      s.position.set(x * 40 * 0.97, 41, z * 44 * 0.97);
      this.group.add(s);
      this.towerSprites.push(s);
    }

    // Giant screens behind each end
    this.screens = [];
    for (const z of [1, -1]) {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(22, 12.5, 1), new THREE.MeshStandardMaterial({ color: '#2a2f3a', metalness: 0.5, roughness: 0.4 }));
      g.add(frame);
      const tex = canvasTexture(1024, 560, () => {});
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(20.6, 11.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      screen.position.z = 0.51;
      g.add(screen);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), frame.material);
      leg.position.y = -15;
      g.add(leg);
      g.position.set(0, stands.yTop + 16, z * (stands.rTop + 6));
      g.lookAt(0, g.position.y, 0);
      this.group.add(g);
      this.screens.push({ tex, canvas: tex.image });
    }
    this.setScoreboard({ title: 'POKéMON STADIUM', left: 'OPUS', right: 'STADIUM' });

    this.stage.onUpdate((dt, time) => {
      crowd.uniforms.uTime.value = time;
    });
    this.setTheme('day');
  }

  setCheer(amount) {
    this.crowd.uniforms.uCheer.value = amount;
  }

  /** Short burst of crowd excitement that settles back down. */
  cheer(intensity = 0.6, duration = 1.6) {
    this.setCheer(intensity);
    clearTimeout(this.cheerTimer);
    this.cheerTimer = setTimeout(() => this.setCheer(0.12), duration * 1000);
  }

  /** `environment`: 'forest_slope_1k' (outdoor, default) or 'studio_small_09_1k'. */
  setTheme(name, { environment = 'forest_slope_1k' } = {}) {
    const t = THEMES[name] || THEMES.day;
    this.theme = name;
    // HDRI lighting for the PBR Pokémon models; the hemisphere light is dimmed to compensate.
    const hemi = this.stage.scene.children.find((c) => c.isHemisphereLight);
    this.stage.setEnvironment(assetUrl('env', environment), t.env).then((ok) => {
      if (this.theme === name) hemi.intensity = ok ? t.hemi * 0.55 : t.hemi;
    });
    this.skyUniforms.topColor.value.set(t.top);
    this.skyUniforms.horizonColor.value.set(t.horizon);
    this.stage.scene.fog = new THREE.Fog(t.fog, 90, 420);
    this.stage.sun.intensity = 2.4 * t.sun;
    this.stage.scene.children.find((c) => c.isHemisphereLight).intensity = t.hemi;
    this.stage.renderer.toneMappingExposure = t.exposure;
    for (const s of this.towerSprites) s.material.opacity = Math.min(1, t.towers);
    this.towerGlow.color.setScalar(Math.min(1, 0.5 + t.towers * 0.4));
  }

  /** Draws the jumbotrons: title + both trainers and their remaining Pokémon. */
  setScoreboard({ title, left, right, leftBalls = [], rightBalls = [] }) {
    for (const { tex, canvas } of this.screens) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0b1f4d');
      g.addColorStop(1, '#122d6b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd84a';
      ctx.font = 'bold 64px "Trebuchet MS", sans-serif';
      ctx.fillText(title, w / 2, 100);
      ctx.font = 'bold 72px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#ff6b5b';
      ctx.fillText(left, w * 0.25, 260);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('VS', w / 2, 260);
      ctx.fillStyle = '#6ba8ff';
      ctx.fillText(right, w * 0.75, 260);
      const balls = (list, cx) => {
        list.forEach((alive, i) => {
          const x = cx + (i - (list.length - 1) / 2) * 70;
          ctx.fillStyle = alive ? '#ff4a3a' : '#555';
          ctx.beginPath();
          ctx.arc(x, 380, 26, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = alive ? '#fff' : '#777';
          ctx.beginPath();
          ctx.arc(x, 380, 26, 0, Math.PI);
          ctx.fill();
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x, 380, 26, 0, Math.PI * 2);
          ctx.moveTo(x - 26, 380);
          ctx.lineTo(x + 26, 380);
          ctx.stroke();
        });
      };
      balls(leftBalls, w * 0.25);
      balls(rightBalls, w * 0.75);
      tex.needsUpdate = true;
    }
  }
}
