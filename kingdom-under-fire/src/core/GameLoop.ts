/**
 * Fixed-timestep loop: the simulation runs at `hz` whatever the frame rate, the renderer runs on
 * requestAnimationFrame and receives `alpha` (0..1), the fraction of the next step already elapsed, to
 * interpolate positions between the two last simulation states.
 */
export class GameLoop {
  readonly stepSeconds: number;
  timeScale = 1;
  paused = false;
  /** Guard against the spiral of death on a very slow frame: extra time is dropped. */
  maxStepsPerFrame = 5;

  private accumulator = 0;
  private lastTime = -1;
  private rafId = 0;

  constructor(
    readonly hz: number,
    private readonly step: (dt: number) => void,
    private readonly render: (alpha: number, frameSeconds: number) => void,
  ) {
    this.stepSeconds = 1 / hz;
  }

  start(): void {
    const frame = (now: number) => {
      const seconds = this.lastTime < 0 ? 0 : (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.advance(seconds);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.lastTime = -1;
  }

  /** Advances by one frame of real time and renders. Returns the number of simulation steps run. */
  advance(frameSeconds: number): number {
    let steps = 0;
    if (!this.paused) {
      // A tab in the background can return after seconds: never simulate more than 1/4 s at once.
      this.accumulator += Math.min(frameSeconds, 0.25) * this.timeScale;
      while (this.accumulator >= this.stepSeconds && steps < this.maxStepsPerFrame) {
        this.step(this.stepSeconds);
        this.accumulator -= this.stepSeconds;
        steps++;
      }
      if (steps === this.maxStepsPerFrame) this.accumulator = Math.min(this.accumulator, this.stepSeconds);
    }
    this.render(this.paused ? 1 : this.accumulator / this.stepSeconds, frameSeconds);
    return steps;
  }
}
