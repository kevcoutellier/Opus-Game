import type { AssetManager, SoundCategory } from '../assets/AssetManager';
import type { World } from '../core/World';

/** Minimum milliseconds between two sounds of the same category (a melee of 500 is not 500 clangs). */
const THROTTLE: Partial<Record<SoundCategory, number>> = { clash: 70, death: 140, march: 400, ack: 250, horn: 2000 };
/** Beyond this distance (m) from what the camera looks at, battle sounds fade to a murmur. */
const HEARING = 90;

/**
 * Plays the music and sound effects copied by `npm run assets` from your own files (for example those of
 * your copy of Kingdom Under Fire). Without them the game is silent. Audio starts after the first click or
 * key press (browser autoplay policy); M mutes.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundCategory, AudioBuffer[]>();
  private readonly lastPlayed = new Map<SoundCategory, number>();
  private readonly music: HTMLAudioElement | null;
  private readonly playlist: string[];
  private track = 0;
  muted = false;

  constructor(private readonly assets: AssetManager) {
    this.playlist = assets.sounds('music');
    this.music = this.playlist.length ? new Audio() : null;
    if (this.music) {
      this.music.volume = 0.45;
      this.music.addEventListener('ended', () => this.nextTrack());
    }
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      void this.unlock();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /** True when at least one sound or track is installed. */
  get available(): boolean {
    return this.playlist.length > 0 || (['clash', 'death', 'horn', 'march', 'ack'] as const).some((c) => this.assets.sounds(c).length > 0);
  }

  private async unlock(): Promise<void> {
    if (this.ctx || !this.available) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.nextTrack();
    for (const category of ['clash', 'death', 'horn', 'march', 'ack'] as const) void this.decode(category);
  }

  private async decode(category: SoundCategory): Promise<void> {
    const list: AudioBuffer[] = [];
    this.buffers.set(category, list);
    for (const url of this.assets.sounds(category)) {
      try {
        const data = await (await fetch(url)).arrayBuffer();
        list.push(await this.ctx!.decodeAudioData(data));
      } catch {
        // Unreadable file (codec not supported by the browser): skipped.
      }
    }
  }

  private nextTrack(): void {
    if (!this.music || !this.playlist.length) return;
    this.music.src = this.playlist[this.track % this.playlist.length];
    this.track++;
    if (!this.muted) void this.music.play().catch(() => {});
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    if (this.music) {
      if (this.muted) this.music.pause();
      else void this.music.play().catch(() => {});
    }
  }

  /** Plays a random sound of the category, `gain` 0..1. */
  play(category: SoundCategory, gain = 1): void {
    const ctx = this.ctx;
    const list = this.buffers.get(category);
    if (!ctx || !this.master || this.muted || !list?.length || gain <= 0.02) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(category) ?? -Infinity) < (THROTTLE[category] ?? 0)) return;
    this.lastPlayed.set(category, now);
    const source = ctx.createBufferSource();
    source.buffer = list[Math.floor(Math.random() * list.length)];
    source.playbackRate.value = 0.93 + Math.random() * 0.14;
    const volume = ctx.createGain();
    volume.gain.value = gain;
    source.connect(volume).connect(this.master);
    source.start();
  }

  /** Battle sounds from simulation events, fading with the distance to the camera target. */
  attach(world: World, listener: () => { x: number; z: number }): void {
    const near = (x: number, z: number) => {
      const l = listener();
      return Math.max(0, 1 - Math.hypot(x - l.x, z - l.z) / HEARING);
    };
    world.events.on('unitHit', ({ attack }) => this.play('clash', 0.35 + 0.65 * near(attack.x, attack.z)));
    world.events.on('unitDied', ({ x, z }) => this.play('death', 0.3 + 0.7 * near(x, z)));
    world.events.on('unitRouted', ({ id }) => this.play('horn', 0.4 * near(world.c.x[id], world.c.z[id])));
  }
}
