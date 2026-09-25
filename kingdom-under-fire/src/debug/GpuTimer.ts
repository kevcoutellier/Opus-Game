/**
 * GPU time of a frame through EXT_disjoint_timer_query_webgl2 (desktop Chrome/Edge on most GPUs; absent
 * on Safari, Firefox and software rendering). Results arrive a few frames late; `ms` stays null when
 * the extension is unavailable.
 */
export class GpuTimer {
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  ms: number | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  get supported(): boolean {
    return this.ext !== null;
  }

  begin(): void {
    if (!this.ext || this.active || this.pending.length > 4) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    this.poll();
  }

  private poll(): void {
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext!.GPU_DISJOINT_EXT) as boolean;
    while (this.pending.length) {
      const query = this.pending[0];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
      if (!disjoint) this.ms = this.ms === null ? ns / 1e6 : this.ms + (ns / 1e6 - this.ms) * 0.1;
      gl.deleteQuery(query);
      this.pending.shift();
    }
  }
}
