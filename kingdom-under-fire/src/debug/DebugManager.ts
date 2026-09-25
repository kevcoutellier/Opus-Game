import type { PerfResult } from '../scenes/PerformanceTestScene';
import type { PerformanceMonitor } from './PerformanceMonitor';

export interface DebugStats {
  fps: number;
  frameMs: number;
  gpuMs: number | null;
  drawCalls: number;
  triangles: number;
  entities: number;
  units: number;
  visibleUnits: number;
  animatedUnits: number;
  particles: number;
  /** Missiles in flight. */
  projectiles: number;
  formations: number;
  flowFields: number;
}

const SIM_SECTIONS: [string, string][] = [
  ['sim', 'Simulation (tick)'],
  ['sim.spatial', '· grille spatiale'],
  ['sim.formations', '· formations'],
  ['sim.combat', '· combat'],
  ['sim.morale', '· moral'],
  ['sim.movement', '· mouvement'],
  ['sim.ai', '· IA'],
  ['pathfinding', 'Pathfinding (flow fields)'],
  ['frame', 'Frame CPU (rendu + UI)'],
];

/** F1 developer panel. Refreshed 4 times per second to stay cheap. */
export class DebugManager {
  private readonly el: HTMLDivElement;
  private visible = false;
  private refresh = 0;
  private results: PerfResult[] = [];
  status = '';

  constructor(
    root: HTMLElement,
    private readonly perf: PerformanceMonitor,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'debug-panel panel';
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  toggle(force?: boolean): void {
    this.visible = force ?? !this.visible;
    this.el.hidden = !this.visible;
  }

  setResults(results: PerfResult[]): void {
    this.results = results;
    this.refresh = 0;
  }

  update(dt: number, stats: DebugStats): void {
    if (!this.visible) return;
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.25;
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const ms = (v: number) => `${v.toFixed(2)} ms`;
    const rows: [string, string][] = [
      ['FPS', `${stats.fps.toFixed(0)} (${ms(stats.frameMs)})`],
      ['GPU', stats.gpuMs === null ? 'n/d (extension de timer absente)' : ms(stats.gpuMs)],
      ['Draw calls', String(stats.drawCalls)],
      ['Triangles', stats.triangles.toLocaleString('fr-FR')],
      ['Entités', String(stats.entities)],
      ['Unités (visibles)', `${stats.units} (${stats.visibleUnits})`],
      ['Animations actives', `${stats.animatedUnits} unités (GPU) · ${stats.particles} particules · ${stats.projectiles} projectiles`],
      ['Formations / flow fields', `${stats.formations} / ${stats.flowFields}`],
      ...SIM_SECTIONS.map(([key, label]): [string, string] => [label, ms(this.perf.average(key))]),
      ['Mémoire JS', memory ? `${(memory.usedJSHeapSize / 1048576).toFixed(0)} Mo` : 'n/d'],
    ];
    const results = this.results.length
      ? `<table class="perf-results"><tr><th>Unités</th><th>FPS</th><th>Frame</th><th>Sim</th><th>GPU</th><th>Draw calls</th></tr>${this.results
          .map(
            (r) =>
              `<tr><td>${r.units}</td><td>${r.fps.toFixed(0)}</td><td>${r.frameMs.toFixed(1)} ms</td><td>${r.simMs.toFixed(2)} ms</td><td>${
                r.gpuMs === null ? 'n/d' : `${r.gpuMs.toFixed(1)} ms`
              }</td><td>${r.drawCalls.toFixed(0)}</td></tr>`,
          )
          .join('')}</table>`
      : '';
    this.el.innerHTML = `<div class="title">Développeur (F1)</div><dl>${rows
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join('')}</dl><div class="debug-status">${this.status || 'F2 : test de performance (100 → 1000 unités)'}</div>${results}`;
  }
}
