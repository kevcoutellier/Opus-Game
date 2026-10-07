import { AIKnowledge } from '../ai/AIKnowledge';
import type { World } from '../core/World';
import { Comp, UnitState } from '../entities/Components';
import type { Terrain } from '../maps/Terrain';
import type { TroopSystem } from '../troops/TroopSystem';

/** Pixels of the minimap texture (square). */
const SIZE = 224;
/** Seconds between two redraws (the minimap does not need the frame rate). */
const REFRESH = 0.12;

export interface MinimapDeps {
  world: World;
  terrain: Terrain;
  troops: TroopSystem;
  team: number;
  /** Troop receiving the orders (its waypoints are drawn), -1 when none. */
  selected(): number;
  /** Ground point the camera looks at, and the direction it looks (radians, simulation convention). */
  view(): { x: number; z: number; facing: number };
  /** Left click or drag: look there. */
  onLook(x: number, z: number): void;
  /** Right click: march order there (Shift: waypoint, Ctrl: the whole army). */
  onOrder(x: number, z: number, queue: boolean, all: boolean): void;
}

/**
 * Minimap of the battlefield, bottom right (north up: the enemy's side of the plain). It shows the terrain,
 * the player's troops, the enemies his soldiers see (and, dimmed, where they last saw others), the route
 * of the chosen troop and where the camera looks. Left click moves the view, right click gives a march
 * order, Shift + right click adds a waypoint (The Crusaders: hold L and press A on the minimap).
 */
export class Minimap {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private readonly knowledge: AIKnowledge;
  private wait = 0;
  private dragging = false;

  constructor(
    root: HTMLElement,
    private readonly d: MinimapDeps,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'minimap panel interactive';
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.el.append(this.canvas);
    root.append(this.el);
    this.background = this.paintTerrain(d.terrain);
    this.knowledge = new AIKnowledge(d.world, d.team);

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointerdown', (e) => {
      const p = this.toWorld(e);
      if (e.button === 0) {
        this.dragging = true;
        this.canvas.setPointerCapture(e.pointerId);
        d.onLook(p.x, p.z);
      } else if (e.button === 2) {
        d.onOrder(p.x, p.z, e.shiftKey, e.ctrlKey || e.metaKey);
      }
      e.preventDefault();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const p = this.toWorld(e);
      d.onLook(p.x, p.z);
    });
    const stop = () => (this.dragging = false);
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
  }

  /** World point under a pointer event on the minimap. */
  private toWorld(e: PointerEvent): { x: number; z: number } {
    const r = this.canvas.getBoundingClientRect();
    const size = this.d.world.size;
    return {
      x: Math.min(size, Math.max(0, ((e.clientX - r.left) / r.width) * size)),
      z: Math.min(size, Math.max(0, ((e.clientY - r.top) / r.height) * size)),
    };
  }

  /** Relief, forests and rocky slopes, painted once. */
  private paintTerrain(terrain: Terrain): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = out.height = SIZE;
    const g = out.getContext('2d')!;
    const image = g.createImageData(SIZE, SIZE);
    const scale = terrain.size / SIZE;
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const x = (px + 0.5) * scale;
        const z = (py + 0.5) * scale;
        const h = terrain.heightAt(x, z);
        // Light from the north-west.
        const shade = Math.max(0.55, Math.min(1.25, 1 + (h - terrain.heightAt(x + scale, z + scale)) * 0.35));
        const forest = terrain.forestAt(x, z);
        const rock = Math.min(1, Math.max(0, (terrain.slopeAt(x, z) - 0.45) * 2));
        let r = 84 + h * 0.7;
        let gr = 98 + h * 0.5;
        let b = 54;
        r += (40 - r) * forest * 0.85;
        gr += (60 - gr) * forest * 0.85;
        b += (32 - b) * forest * 0.85;
        r += (118 - r) * rock;
        gr += (112 - gr) * rock;
        b += (102 - b) * rock;
        const i = (py * SIZE + px) * 4;
        image.data[i] = r * shade;
        image.data[i + 1] = gr * shade;
        image.data[i + 2] = b * shade;
        image.data[i + 3] = 255;
      }
    }
    g.putImageData(image, 0, 0);
    return out;
  }

  update(dt: number): void {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = REFRESH;
    this.knowledge.update();
    const { world, troops, team } = this.d;
    const { entities, c } = world;
    const ctx = this.ctx;
    const k = SIZE / world.size;
    ctx.drawImage(this.background, 0, 0);
    // Burnt woods, and the fire.
    const fire = world.fire;
    const cell = (k * world.size) / fire.cols;
    ctx.fillStyle = 'rgba(30, 26, 22, 0.75)';
    for (let i = 0; i < fire.burnt.length; i++) {
      if (fire.burnt[i]) ctx.fillRect((i % fire.cols) * cell, Math.floor(i / fire.cols) * cell, cell, cell);
    }
    ctx.fillStyle = 'rgba(255, 120, 30, 0.85)';
    for (const i of fire.active) ctx.fillRect((i % fire.cols) * cell, Math.floor(i / fire.cols) * cell, cell, cell);

    // Enemies: those in sight, and where the others were last seen.
    for (const [, s] of this.knowledge.enemies) {
      ctx.fillStyle = s.visible ? '#ff5a46' : 'rgba(255, 110, 90, 0.35)';
      ctx.fillRect(s.x * k - 1, s.z * k - 1, 2.4, 2.4);
    }
    // Own soldiers.
    ctx.fillStyle = '#7fb0ff';
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) === 0 || c.team[id] !== team || c.state[id] === UnitState.Dying) continue;
      ctx.fillRect(c.x[id] * k - 1, c.z[id] * k - 1, 2.4, 2.4);
    }
    // Leaders: enemy leaders in sight in red, own ones in blue, the chosen troop in gold with its route.
    const selected = this.d.selected();
    for (const t of troops.list(undefined, true)) {
      const own = t.team === team;
      const leader = t.leader;
      if (!own && !this.knowledge.enemies.get(leader)?.visible) continue;
      const x = c.x[leader] * k;
      const z = c.z[leader] * k;
      if (t.id === selected) {
        ctx.strokeStyle = 'rgba(240, 210, 122, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, z);
        for (const w of t.waypoints) ctx.lineTo(w.x * k, w.z * k);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f0d27a';
        for (const w of t.waypoints) {
          ctx.beginPath();
          ctx.arc(w.x * k, w.z * k, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = own ? (t.id === selected ? '#f0d27a' : '#3f78e0') : '#e0302a';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (t.hero) ctx.arc(x, z, 5, 0, Math.PI * 2);
      else ctx.rect(x - 4, z - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
    }
    // Where the camera looks.
    const v = this.d.view();
    const vx = v.x * k;
    const vz = v.z * k;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(vx, vz, 7, 0, Math.PI * 2);
    ctx.moveTo(vx, vz);
    ctx.lineTo(vx + Math.sin(v.facing) * 13, vz + Math.cos(v.facing) * 13);
    ctx.stroke();
  }
}
