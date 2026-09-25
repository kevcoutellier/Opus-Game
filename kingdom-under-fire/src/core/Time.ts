/** Simulation clock: advances only by fixed steps, never by the frame rate. */
export class SimTime {
  tick = 0;
  elapsed = 0;
  readonly dt: number;

  constructor(readonly hz: number) {
    this.dt = 1 / hz;
  }

  advance(): void {
    this.tick++;
    this.elapsed = this.tick * this.dt;
  }
}
