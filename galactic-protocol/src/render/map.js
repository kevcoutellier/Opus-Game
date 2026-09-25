// Canvas renderer of the galaxy map: spiral galaxy, territories, hyperlanes, systems, fleets and effects.
import { GALAXY } from '../engine/galaxy.js';
import { REGIONS } from '../data/systems.js';
import { UNIT_TYPES } from '../data/units.js';
import {
  atWar, dayCache, friendly, hasTreaty, isHidden, relation, visibleSystems,
} from '../engine/query.js';
import { systemOutput } from '../engine/economy.js';
import { planetImage } from '../assetSources.js';
import { emblemPath } from '../ui/emblems.js';

const WORLD = 1300; // Half-size of the rendered world square.
const TERR_RES = 3; // World units per territory pixel.
const TERR_RADIUS = 150;
const TERR_SIZE = Math.round((WORLD * 2) / TERR_RES);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- static layers

function buildGalaxyBackground() {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const k = size / (WORLD * 2);
  const cx = size / 2;
  const rnd = mulberry(1977);
  // Nebulae.
  const nebulaColors = ['120,60,200', '40,120,220', '200,60,140', '40,180,190', '90,70,210'];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = (200 + rnd() * 900) * k;
    const x = cx + Math.cos(a) * r;
    const y = cx + Math.sin(a) * r;
    const rad = (120 + rnd() * 260) * k;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = nebulaColors[i % nebulaColors.length];
    grad.addColorStop(0, `rgba(${col},0.10)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Galactic core.
  const core = g.createRadialGradient(cx, cx, 0, cx, cx, 420 * k);
  core.addColorStop(0, 'rgba(255,240,210,0.38)');
  core.addColorStop(0.25, 'rgba(255,200,140,0.16)');
  core.addColorStop(1, 'rgba(255,160,90,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);
  // Spiral arms (logarithmic spirals): soft glowing clouds, then stars.
  g.globalCompositeOperation = 'lighter';
  const arms = 4;
  for (let i = 0; i < 1400; i++) {
    const arm = i % arms;
    const t = Math.pow(rnd(), 0.9);
    const theta = t * Math.PI * 3.1 + (arm * Math.PI * 2) / arms + (rnd() - 0.5) * 0.25;
    const r = (80 + t * 1000) * (arm % 2 ? 0.92 : 1);
    const x = cx + Math.cos(theta) * r * k;
    const y = cx + Math.sin(theta) * r * k;
    const rad = (25 + rnd() * 55) * k * (1.2 - t * 0.5);
    const blob = g.createRadialGradient(x, y, 0, x, y, rad);
    const hue = t < 0.3 ? '255,210,160' : rnd() < 0.3 ? '190,120,255' : '120,160,255';
    blob.addColorStop(0, `rgba(${hue},${0.05 + (1 - t) * 0.04})`);
    blob.addColorStop(1, `rgba(${hue},0)`);
    g.fillStyle = blob;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 52000; i++) {
    const arm = i % arms;
    const t = Math.pow(rnd(), 0.8);
    const theta = t * Math.PI * 3.1 + (arm * Math.PI * 2) / arms;
    const r = (60 + t * 1050) * (arm % 2 ? 0.92 : 1);
    const spread = (30 + t * 120) * (rnd() + rnd() - 1);
    const ang = theta + spread / Math.max(80, r);
    const x = cx + Math.cos(ang) * (r + spread * 0.4) * k;
    const y = cx + Math.sin(ang) * (r + spread * 0.4) * k;
    const warm = 1 - t;
    const cr = Math.round(150 + 105 * warm);
    const cg = Math.round(170 + 60 * warm);
    const cb = Math.round(255 - 90 * warm);
    g.fillStyle = `rgba(${cr},${cg},${cb},${0.05 + rnd() * 0.12})`;
    const s = rnd() < 0.02 ? 2.4 : 1.2;
    g.fillRect(x, y, s, s);
  }
  // Diffuse halo stars.
  for (let i = 0; i < 9000; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.pow(rnd(), 0.6) * 1150 * k;
    g.fillStyle = `rgba(210,220,255,${0.04 + rnd() * 0.08})`;
    g.fillRect(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 1.1, 1.1);
  }
  g.globalCompositeOperation = 'source-over';
  return c;
}

function buildStarTile() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const rnd = mulberry(42);
  for (let i = 0; i < 260; i++) {
    const b = rnd();
    g.fillStyle = `rgba(${200 + b * 55},${210 + b * 45},255,${0.25 + b * 0.6})`;
    const s = b > 0.93 ? 1.8 : 1;
    g.fillRect(rnd() * size, rnd() * size, s, s);
  }
  return c;
}

/** Nearest system of every territory pixel (-1 when too far). */
function buildTerritoryIndex() {
  const n = TERR_SIZE * TERR_SIZE;
  const index = new Int16Array(n).fill(-1);
  const edge = new Uint8Array(n);
  const systems = GALAXY.systems;
  const r2 = TERR_RADIUS * TERR_RADIUS;
  for (let py = 0; py < TERR_SIZE; py++) {
    const wy = -WORLD + (py + 0.5) * TERR_RES;
    for (let px = 0; px < TERR_SIZE; px++) {
      const wx = -WORLD + (px + 0.5) * TERR_RES;
      let best = -1;
      let bestD = r2;
      for (let i = 0; i < systems.length; i++) {
        const dx = systems[i].x - wx;
        if (dx > TERR_RADIUS || dx < -TERR_RADIUS) continue;
        const dy = systems[i].y - wy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const k = py * TERR_SIZE + px;
      index[k] = best;
      edge[k] = best < 0 ? 0 : Math.round(255 * Math.sqrt(bestD / r2));
    }
  }
  return { index, edge };
}

// ---------------------------------------------------------------- map modes

export const MAP_MODES = {
  political: 'Politique',
  diplomatic: 'Diplomatique',
  stability: 'Stabilité',
  economy: 'Économie',
  sympathy: 'Insurrection',
  resources: 'Ressources',
};

const RES_COLORS = { dura: '#9aa6b2', tib: '#f0a24a', kyb: '#6fd3ff', bacta: '#6fe38a', spice: '#f5d06b' };

function gradient(t) {
  // Red -> amber -> green.
  const a = [230, 70, 60];
  const b = [240, 190, 70];
  const c = [80, 210, 110];
  const [from, to, u] = t < 0.5 ? [a, b, t * 2] : [b, c, (t - 0.5) * 2];
  return from.map((v, i) => Math.round(v + (to[i] - v) * u));
}

// ---------------------------------------------------------------- renderer

export class GalaxyMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 0.6 };
    this.mode = 'political';
    this.state = null;
    this.player = null;
    this.selection = null;
    this.hoverSys = null;
    this.pathPreview = null;
    this.effects = [];
    this.chipRects = [];
    this.images = new Map();
    this.dirty = true;
    this.background = buildGalaxyBackground();
    this.starTile = buildStarTile();
    this.terr = buildTerritoryIndex();
    this.terrCanvas = document.createElement('canvas');
    this.terrCanvas.width = TERR_SIZE;
    this.terrCanvas.height = TERR_SIZE;
    this.terrCtx = this.terrCanvas.getContext('2d');
    this.terrImage = this.terrCtx.createImageData(TERR_SIZE, TERR_SIZE);
    // Upscaled and softened copy of the territory layer (smooth borders).
    this.terrSmooth = document.createElement('canvas');
    this.terrSmooth.width = TERR_SIZE * 2;
    this.terrSmooth.height = TERR_SIZE * 2;
    this.terrSmoothCtx = this.terrSmooth.getContext('2d');
    this.resize();
  }

  setState(state) {
    this.state = state;
    this.player = state?.player ?? null;
    this.dirty = true;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
  }

  // ------------------------------------------------------------ camera

  toScreen(x, y) {
    return [(x - this.cam.x) * this.cam.zoom + this.w / 2, (y - this.cam.y) * this.cam.zoom + this.h / 2];
  }

  toWorld(sx, sy) {
    return [(sx - this.w / 2) / this.cam.zoom + this.cam.x, (sy - this.h / 2) / this.cam.zoom + this.cam.y];
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.zoom = Math.max(0.3, Math.min(4.5, this.cam.zoom * factor));
    const [nx, ny] = this.toWorld(sx, sy);
    this.cam.x += wx - nx;
    this.cam.y += wy - ny;
    this.clampCamera();
  }

  pan(dx, dy) {
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.clampCamera();
  }

  clampCamera() {
    this.cam.x = Math.max(-WORLD, Math.min(WORLD, this.cam.x));
    this.cam.y = Math.max(-WORLD, Math.min(WORLD, this.cam.y));
  }

  centerOn(sysId, zoom = null) {
    const s = GALAXY.byId[sysId];
    if (!s) return;
    this.cam.x = s.x;
    this.cam.y = s.y;
    if (zoom) this.cam.zoom = zoom;
  }

  // ------------------------------------------------------------ helpers

  visible() {
    return dayCache(this.state, `vis:${this.player}`, () => visibleSystems(this.state, this.player));
  }

  hidden(sysId) {
    return this.player && isHidden(this.state, this.player, sysId);
  }

  factionColor(fid) {
    return this.state.factions[fid]?.color ?? '#888';
  }

  systemFill(s) {
    const state = this.state;
    const p = this.player;
    const owner = this.hidden(s.id) ? null : s.owner;
    if (!owner || s.destroyed) return null;
    switch (this.mode) {
      case 'diplomatic': {
        if (owner === p) return [255, 214, 90];
        if (friendly(state, p, owner)) return [80, 220, 120];
        if (atWar(state, p, owner)) return [240, 60, 60];
        if (hasTreaty(state, 'nap', p, owner) || hasTreaty(state, 'trade', p, owner)) return [80, 170, 240];
        const r = relation(state, p, owner);
        return r < -30 ? [240, 150, 70] : [140, 150, 165];
      }
      case 'stability':
        return gradient(s.stability / 100);
      case 'economy': {
        const v = Math.min(1, Math.log10(1 + systemOutput(state, s)) / 3);
        return [Math.round(40 + 215 * v), Math.round(60 + 160 * v), Math.round(90 - 40 * v)];
      }
      case 'sympathy': {
        const v = (s.sympathy || 0) / 100;
        return [Math.round(80 + 175 * v), Math.round(120 - 20 * v), Math.round(170 - 130 * v)];
      }
      case 'resources': {
        const entries = Object.entries(s.res).filter(([, l]) => l > 0).sort((a, b) => b[1] - a[1]);
        return entries.length ? hexToRgb(RES_COLORS[entries[0][0]]) : [70, 76, 90];
      }
      default:
        return hexToRgb(this.factionColor(owner));
    }
  }

  /** Recolours the territory layer (after ownership changes or a map mode switch). */
  paintTerritory() {
    const state = this.state;
    const systems = GALAXY.systems;
    const fills = systems.map((stat) => this.systemFill(state.systems[stat.id]));
    const keys = systems.map((stat) => {
      const s = state.systems[stat.id];
      return s.destroyed || this.hidden(stat.id) ? null : s.owner;
    });
    const occupied = systems.map((stat) => {
      const s = state.systems[stat.id];
      return s.controller && s.owner && s.controller !== s.owner && !this.hidden(stat.id) ? hexToRgb(this.factionColor(s.controller)) : null;
    });
    const { index, edge } = this.terr;
    const data = this.terrImage.data;
    const N = TERR_SIZE;
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const k = py * N + px;
        const o = k * 4;
        const i = index[k];
        const fill = i >= 0 ? fills[i] : null;
        if (!fill) {
          data[o + 3] = 0;
          continue;
        }
        const key = keys[i];
        let border = false;
        if (px > 0 && px < N - 1 && py > 0 && py < N - 1) {
          const neighbors = [index[k - 1], index[k + 1], index[k - N], index[k + N]];
          for (const j of neighbors) {
            if (j < 0 || keys[j] !== key) {
              border = true;
              break;
            }
          }
        }
        let [r, g, b] = fill;
        const occ = occupied[i];
        if (occ && ((px + py) % 10) < 4) [r, g, b] = occ;
        const fade = edge[k] > 215 ? (255 - edge[k]) / 40 : 1;
        data[o] = border ? Math.min(255, r + 40) : r;
        data[o + 1] = border ? Math.min(255, g + 40) : g;
        data[o + 2] = border ? Math.min(255, b + 40) : b;
        data[o + 3] = Math.round((border ? 215 : 78) * fade);
      }
    }
    this.terrCtx.putImageData(this.terrImage, 0, 0);
    const g = this.terrSmoothCtx;
    g.clearRect(0, 0, this.terrSmooth.width, this.terrSmooth.height);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.filter = 'blur(1.2px)';
    g.drawImage(this.terrCanvas, 0, 0, this.terrSmooth.width, this.terrSmooth.height);
    g.filter = 'none';
    this.dirty = false;
    this.ownershipKey = this.computeOwnershipKey();
  }

  computeOwnershipKey() {
    let key = this.mode;
    for (const s of Object.values(this.state.systems)) key += `${s.owner || '-'}${s.controller || '-'}${s.destroyed ? 'x' : ''}`;
    if (this.mode !== 'political') key += `:${this.state.day >> 3}`;
    return key;
  }

  planetImg(sysId) {
    if (this.images.has(sysId)) return this.images.get(sysId);
    const url = planetImage(sysId);
    let img = null;
    if (url) {
      img = new Image();
      img.src = url;
    }
    this.images.set(sysId, img);
    return img;
  }

  addEffect(effect) {
    const now = performance.now();
    if (effect.type === 'battle' || effect.type === 'ground') {
      const existing = this.effects.find((e) => e.type === effect.type && e.sys === effect.sys);
      if (existing) {
        existing.until = now + 1400;
        return;
      }
    }
    const duration = { battle: 1400, ground: 1400, explosion: effect.big ? 3200 : 1400, superlaser: 2600, bdz: 2600, capture: 1300 }[effect.type] ?? 1500;
    this.effects.push({ ...effect, start: now, until: now + duration });
  }

  // ------------------------------------------------------------ drawing

  /** Slowly rotating galaxy behind the title screen. */
  drawIdle(t) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#03050b';
    ctx.fillRect(0, 0, this.w, this.h);
    this.cam.x = Math.sin(t / 30000) * 400;
    this.cam.y = Math.cos(t / 41000) * 300;
    this.cam.zoom = 1;
    this.drawStarfield();
    const size = Math.max(this.w, this.h) * 1.35;
    ctx.save();
    ctx.translate(this.w / 2, this.h * 0.55);
    ctx.rotate(t / 90000);
    ctx.scale(1, 0.62);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.background, -size / 2, -size / 2, size, size);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  draw() {
    const { ctx, state } = this;
    if (!state) return;
    if (this.dirty || this.computeOwnershipKey() !== this.ownershipKey) this.paintTerritory();
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#03050b';
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawStarfield();
    const z = this.cam.zoom;
    // World-space layers.
    const [bx, by] = this.toScreen(-WORLD, -WORLD);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.background, bx, by, WORLD * 2 * z, WORLD * 2 * z);
    ctx.globalAlpha = 1;
    this.drawRegions();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrSmooth, bx, by, WORLD * 2 * z, WORLD * 2 * z);
    this.drawLanes();
    this.drawSystems(now);
    this.drawPath();
    this.drawStacks(now);
    this.drawEffects(now);
  }

  drawStarfield() {
    const { ctx } = this;
    const tile = 512;
    const ox = -((this.cam.x * 0.08 * this.cam.zoom) % tile) - tile;
    const oy = -((this.cam.y * 0.08 * this.cam.zoom) % tile) - tile;
    ctx.globalAlpha = 0.7;
    for (let x = ox; x < this.w; x += tile) for (let y = oy; y < this.h; y += tile) ctx.drawImage(this.starTile, x, y);
    ctx.globalAlpha = 1;
  }

  drawRegions() {
    const { ctx } = this;
    const z = this.cam.zoom;
    if (z > 0.8) return;
    const [cx, cy] = this.toScreen(0, 0);
    ctx.save();
    ctx.setLineDash([4, 10]);
    ctx.strokeStyle = 'rgba(140,170,220,0.10)';
    ctx.lineWidth = 1;
    const rings = ['deep', 'core', 'colonies', 'inner', 'expansion', 'mid'];
    ctx.font = '600 10px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(170,190,230,0.32)';
    ctx.textAlign = 'center';
    for (const id of rings) {
      const r = REGIONS[id].band[1] * z;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const labels = [['Noyau', 'core', -0.35], ['Colonies', 'colonies', -0.55], ['Bordure Intérieure', 'inner', -0.7],
      ['Région d’Expansion', 'expansion', -0.85], ['Bordure Médiane', 'mid', -1.0], ['Bordure Extérieure', 'outer', -1.25]];
    for (const [text, id, ang] of labels) {
      const [r0, r1] = REGIONS[id].band;
      const r = ((r0 + r1) / 2) * z;
      ctx.fillText(text.toUpperCase(), cx + Math.cos(ang - Math.PI / 2) * r, cy + Math.sin(ang - Math.PI / 2) * r);
    }
    ctx.fillText('RÉGIONS INCONNUES', cx - 980 * z, cy + 260 * z);
    ctx.restore();
  }

  drawLanes() {
    const { ctx } = this;
    const z = this.cam.zoom;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(150,180,230,0.16)';
    ctx.lineWidth = Math.max(0.6, 0.8 * Math.sqrt(z));
    ctx.beginPath();
    for (const lane of GALAXY.lanes) {
      if (lane.major) continue;
      const a = GALAXY.byId[lane.a];
      const b = GALAXY.byId[lane.b];
      const [x1, y1] = this.toScreen(a.x, a.y);
      const [x2, y2] = this.toScreen(b.x, b.y);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,205,120,0.38)';
    ctx.lineWidth = Math.max(1, 1.5 * Math.sqrt(z));
    ctx.beginPath();
    for (const lane of GALAXY.lanes) {
      if (!lane.major) continue;
      const a = GALAXY.byId[lane.a];
      const b = GALAXY.byId[lane.b];
      const [x1, y1] = this.toScreen(a.x, a.y);
      const [x2, y2] = this.toScreen(b.x, b.y);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  systemRadius(stat, s) {
    const z = this.cam.zoom;
    const base = 2.2 + Math.log10(1 + (s.pop || 0) * 10) * 1.1;
    return base * Math.min(2.2, Math.max(0.8, Math.sqrt(z)));
  }

  drawSystems(now) {
    const { ctx, state } = this;
    const z = this.cam.zoom;
    const capitals = new Map();
    for (const f of Object.values(state.factions)) if (f.alive && f.capital) capitals.set(f.capital, f.id);
    const showPlanets = z >= 1.9;
    for (const stat of GALAXY.systems) {
      const s = state.systems[stat.id];
      const [x, y] = this.toScreen(stat.x, stat.y);
      if (x < -60 || y < -60 || x > this.w + 60 || y > this.h + 60) continue;
      const hidden = this.hidden(stat.id);
      const owner = hidden ? null : s.owner;
      const r = this.systemRadius(stat, s);
      if (s.destroyed) {
        ctx.fillStyle = 'rgba(180,150,130,0.7)';
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4;
          ctx.fillRect(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.1, 1.5, 1.5);
        }
        if (z > 0.8) this.label(stat.name, x, y + r + 12, 'rgba(200,160,150,0.7)', false);
        continue;
      }
      if (showPlanets) {
        const pr = Math.max(7, r * 2.1);
        const img = this.planetImg(stat.id);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.closePath();
        if (img && img.complete && img.naturalWidth) {
          ctx.clip();
          const scale = 1.28; // The databank pictures have a margin around the planet.
          ctx.drawImage(img, x - pr * scale, y - pr * scale, pr * 2 * scale, pr * 2 * scale);
        } else {
          const grad = ctx.createRadialGradient(x - pr * 0.4, y - pr * 0.4, pr * 0.1, x, y, pr);
          const [cr, cg, cb] = owner ? hexToRgb(this.factionColor(owner)) : [150, 160, 180];
          grad.addColorStop(0, `rgb(${Math.min(255, cr + 60)},${Math.min(255, cg + 60)},${Math.min(255, cb + 60)})`);
          grad.addColorStop(1, `rgb(${cr * 0.25 | 0},${cg * 0.25 | 0},${cb * 0.3 | 0})`);
          ctx.fillStyle = grad;
          ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = owner ? this.factionColor(owner) : 'rgba(200,210,230,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, pr + 1.5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
        glow.addColorStop(0, 'rgba(255,255,255,0.9)');
        glow.addColorStop(0.3, 'rgba(190,215,255,0.35)');
        glow.addColorStop(1, 'rgba(160,190,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = owner ? this.factionColor(owner) : '#cfd8e8';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const capOf = capitals.get(stat.id);
      if (capOf && !hidden) this.drawCapital(x, y, r, capOf, showPlanets);
      if (s.battle) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 160);
        ctx.strokeStyle = `rgba(255,80,60,${0.35 + pulse * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4 + 5 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.selection?.type === 'system' && this.selection.id === stat.id) {
        ctx.strokeStyle = '#ffd35a';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(x, y, (showPlanets ? Math.max(7, r * 2.1) : r) + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (this.hoverSys === stat.id) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, (showPlanets ? Math.max(7, r * 2.1) : r) + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      const important = capOf || stat.pop >= 10 || this.selection?.id === stat.id;
      if (z >= 0.95 || (important && z >= 0.45)) {
        const labelY = y + (showPlanets ? Math.max(7, r * 2.1) : r) + 12;
        this.label(hidden ? `${stat.name} ?` : stat.name, x, labelY, capOf ? '#ffe7a8' : 'rgba(225,232,245,0.88)', !!capOf);
      }
    }
  }

  drawCapital(x, y, r, fid, big) {
    const { ctx } = this;
    const size = big ? 16 : 11;
    const oy = y - (big ? Math.max(7, r * 2.1) + 14 : r + 10);
    const icon = emblemPath(fid);
    ctx.save();
    if (icon) {
      const s = size / Math.max(icon.w, icon.h);
      ctx.translate(x - (icon.w * s) / 2, oy - (icon.h * s) / 2);
      ctx.scale(s, s);
      ctx.fillStyle = this.factionColor(fid);
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6 / s;
      for (const p of icon.paths) ctx.fill(p);
    } else {
      ctx.fillStyle = this.factionColor(fid);
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const h = size / 2;
      ctx.moveTo(x, oy - h);
      ctx.lineTo(x + h, oy);
      ctx.lineTo(x, oy + h);
      ctx.lineTo(x - h, oy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  label(text, x, y, color, bold) {
    const { ctx } = this;
    ctx.font = `${bold ? 700 : 500} ${bold ? 12 : 11}px "Exo 2", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(3,5,11,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  drawPath() {
    const { ctx } = this;
    const draw = (path, color, dash) => {
      if (!path || path.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash);
      ctx.beginPath();
      path.forEach((id, i) => {
        const s = GALAXY.byId[id];
        const [x, y] = this.toScreen(s.x, s.y);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const sel = this.selection?.type === 'stack' ? this.state.stacks[this.selection.id] : null;
    if (sel && (sel.path.length || sel.move)) {
      const start = sel.move ? [sel.move.from, sel.move.to] : [sel.sys];
      draw([...start, ...sel.path], 'rgba(120,220,255,0.8)', [6, 5]);
    }
    if (this.pathPreview) draw(this.pathPreview, 'rgba(255,215,90,0.85)', [3, 4]);
  }

  stackPosition(st) {
    if (!st.move) {
      const s = GALAXY.byId[st.sys];
      return [s.x, s.y];
    }
    const a = GALAXY.byId[st.move.from];
    const b = GALAXY.byId[st.move.to];
    const t = Math.min(1, st.move.progress);
    return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
  }

  stackVisible(st, vis) {
    const p = this.player;
    if (st.owner === p || friendly(this.state, p, st.owner)) return true;
    const where = st.move ? [st.move.from, st.move.to] : [st.sys];
    if (!where.some((id) => vis.has(id))) return false;
    const intel = this.state.factions[p]?.intel?.[st.owner] > this.state.day;
    const stealthy = st.units.every((u) => UNIT_TYPES[u.t].stealth);
    return intel || !stealthy;
  }

  drawStacks(now) {
    const { ctx, state } = this;
    const z = this.cam.zoom;
    const vis = this.visible();
    this.chipRects = [];
    const bySys = new Map();
    for (const st of Object.values(state.stacks)) {
      if (!this.stackVisible(st, vis)) continue;
      if (st.move) {
        const [wx, wy] = this.stackPosition(st);
        const [x, y] = this.toScreen(wx, wy);
        const b = GALAXY.byId[st.move.to];
        const [tx, ty] = this.toScreen(b.x, b.y);
        const ang = Math.atan2(ty - y, tx - x);
        // Hyperspace streak.
        ctx.strokeStyle = `rgba(200,230,255,${0.3 + 0.2 * Math.sin(now / 90)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(ang) * 14, y - Math.sin(ang) * 14);
        ctx.lineTo(x, y);
        ctx.stroke();
        this.chip(st, x, y - 2, true);
        continue;
      }
      if (!bySys.has(st.sys)) bySys.set(st.sys, []);
      bySys.get(st.sys).push(st);
    }
    for (const [sysId, stacks] of bySys) {
      const stat = GALAXY.byId[sysId];
      const [x, y] = this.toScreen(stat.x, stat.y);
      if (x < -80 || y < -80 || x > this.w + 80 || y > this.h + 80) continue;
      stacks.sort((a, b) => (a.owner === this.player ? -1 : 1) - (b.owner === this.player ? -1 : 1));
      const offset = z >= 1.9 ? 26 : 14;
      stacks.slice(0, 5).forEach((st, i) => this.chip(st, x + offset, y - 10 + i * 15, false));
      if (stacks.length > 5) this.label(`+${stacks.length - 5}`, x + offset + 20, y - 10 + 5 * 15 + 4, '#ccd', false);
    }
  }

  chip(st, x, y, moving) {
    const { ctx } = this;
    const own = st.owner === this.player;
    const color = this.factionColor(st.owner);
    const count = st.units.length;
    const text = st.station ? '◉' : String(count);
    ctx.font = '700 10px "Exo 2", sans-serif';
    const w = Math.max(18, ctx.measureText(text).width + 12);
    const h = 13;
    const rx = x;
    const ry = y - h / 2;
    ctx.fillStyle = 'rgba(6,10,18,0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = own ? 1.8 : 1;
    ctx.beginPath();
    ctx.roundRect(rx, ry, w, h, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(rx + 2, ry + 2, 3, h - 4);
    ctx.fillStyle = own ? '#fff' : '#dde4f0';
    ctx.textAlign = 'center';
    ctx.fillText(text, rx + w / 2 + 2, ry + h - 3);
    const selected = this.selection?.type === 'stack' && this.selection.id === st.id;
    if (selected) {
      ctx.strokeStyle = '#ffd35a';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx - 2, ry - 2, w + 4, h + 4);
    }
    if (moving && own) {
      ctx.fillStyle = 'rgba(120,220,255,0.9)';
      ctx.beginPath();
      ctx.arc(rx - 3, ry + h / 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    this.chipRects.push({ id: st.id, x: rx, y: ry, w, h });
  }

  drawEffects(now) {
    const { ctx } = this;
    this.effects = this.effects.filter((e) => e.until > now);
    for (const e of this.effects) {
      const t = (now - e.start) / (e.until - e.start);
      if (e.type === 'superlaser') {
        const a = GALAXY.byId[e.from];
        const b = GALAXY.byId[e.to];
        const [x1, y1] = this.toScreen(a.x, a.y);
        const [x2, y2] = this.toScreen(b.x, b.y);
        const beam = t < 0.5 ? t * 2 : 1;
        ctx.strokeStyle = e.color || '#5dff7a';
        ctx.shadowColor = e.color || '#5dff7a';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 3 + 3 * Math.sin(now / 40);
        ctx.globalAlpha = 1 - Math.max(0, t - 0.7) / 0.3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + (x2 - x1) * beam, y1 + (y2 - y1) * beam);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        if (t > 0.5) this.ring(x2, y2, (t - 0.5) * 2, '#fff2c0', 90);
        continue;
      }
      const s = GALAXY.byId[e.sys];
      if (!s) continue;
      const [x, y] = this.toScreen(s.x, s.y);
      if (e.type === 'battle' || e.type === 'ground') {
        const colors = e.type === 'battle' ? ['#ff5a4a', '#5dff7a', '#ffd35a'] : ['#ffa040', '#ffdd88'];
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 6 + Math.random() * 16;
          ctx.strokeStyle = colors[i % colors.length];
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
          ctx.lineTo(x + Math.cos(a + 0.4) * (d + 7), y + Math.sin(a + 0.4) * (d + 7));
          ctx.stroke();
        }
      } else if (e.type === 'explosion') {
        this.ring(x, y, t, e.big ? '#ffe6a0' : '#ffb070', e.big ? 110 : 30);
        if (e.big) this.ring(x, y, Math.min(1, t * 1.6), '#ff7040', 60);
      } else if (e.type === 'bdz') {
        ctx.fillStyle = `rgba(255,60,30,${0.5 * (1 - t) * (0.5 + 0.5 * Math.sin(now / 30))})`;
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'capture') {
        this.ring(x, y, t, this.factionColor(e.faction), 30);
      }
    }
  }

  ring(x, y, t, color, maxR) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(x, y, 4 + t * maxR * Math.sqrt(this.cam.zoom), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ picking

  pick(sx, sy) {
    for (let i = this.chipRects.length - 1; i >= 0; i--) {
      const r = this.chipRects[i];
      if (sx >= r.x - 2 && sx <= r.x + r.w + 2 && sy >= r.y - 2 && sy <= r.y + r.h + 2) return { type: 'stack', id: r.id };
    }
    const sys = this.pickSystem(sx, sy);
    return sys ? { type: 'system', id: sys } : null;
  }

  pickSystem(sx, sy) {
    let best = null;
    let bestD = (this.cam.zoom >= 1.9 ? 20 : 14) ** 2;
    for (const stat of GALAXY.systems) {
      const [x, y] = this.toScreen(stat.x, stat.y);
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = stat.id;
      }
    }
    return best;
  }

  /** Small overview used by the minimap. */
  drawMinimap(canvas) {
    const g = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = 0.9;
    g.drawImage(this.background, 0, 0, w, h);
    g.globalAlpha = 1;
    g.drawImage(this.terrSmooth, 0, 0, w, h);
    const k = w / (WORLD * 2);
    const vw = (this.w / this.cam.zoom) * k;
    const vh = (this.h / this.cam.zoom) * k;
    g.strokeStyle = '#ffd35a';
    g.lineWidth = 1;
    g.strokeRect((this.cam.x + WORLD) * k - vw / 2, (this.cam.y + WORLD) * k - vh / 2, vw, vh);
  }

  minimapToWorld(mx, my, canvas) {
    const k = (WORLD * 2) / canvas.clientWidth;
    return [mx * k - WORLD, my * k - WORLD];
  }
}
