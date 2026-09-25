import sources from './sources.json';

export interface AssetManifest {
  version: number;
  /** Asset key (e.g. `portraits/curian`) → path relative to the assets folder. */
  files: Record<string, string>;
  /** Sound category (music, clash, death, horn, march, ack) → paths. */
  sounds: Record<string, string[]>;
  /** Asset key → where it comes from. */
  credits: Record<string, string>;
}

export type SoundCategory = keyof typeof sources.soundCategories;

/** Background artwork candidates, best first (Steam hero art, then store background, screenshots, wiki cover). */
const ARTWORK_KEYS = ['artwork/library_hero', 'artwork/background', 'artwork/screenshot1', 'artwork/cover', 'artwork/header'];

/**
 * Official Kingdom Under Fire assets downloaded or copied by `npm run assets` (public/assets/, never
 * versioned). Reads the manifest once; every lookup returns null when the asset is missing, so the game
 * always has a fallback (heraldic crests, silence).
 */
export class AssetManager {
  private manifest: AssetManifest = { version: 1, files: {}, sounds: {}, credits: {} };

  constructor(private readonly base = 'assets/') {}

  async load(fetcher: typeof fetch = fetch): Promise<void> {
    try {
      const res = await fetcher(`${this.base}manifest.json`, { cache: 'no-cache' });
      if (res.ok) this.use(await res.json());
    } catch {
      // No downloaded assets: procedural fallbacks everywhere.
    }
  }

  /** Installs a manifest (tests, or a manifest built elsewhere). */
  use(manifest: Partial<AssetManifest>): void {
    this.manifest = { version: 1, files: {}, sounds: {}, credits: {}, ...manifest };
  }

  get count(): number {
    return Object.keys(this.manifest.files).length + Object.values(this.manifest.sounds).reduce((n, list) => n + list.length, 0);
  }

  url(key: string): string | null {
    const file = this.manifest.files[key];
    return file ? `${this.base}${file}` : null;
  }

  portrait(characterId: string): string | null {
    return this.url(`portraits/${characterId}`);
  }

  emblem(factionId: string): string | null {
    return this.url(`emblems/${factionId}`);
  }

  artwork(): string | null {
    for (const key of ARTWORK_KEYS) {
      const url = this.url(key);
      if (url) return url;
    }
    return null;
  }

  sounds(category: SoundCategory): string[] {
    return (this.manifest.sounds[category] ?? []).map((file) => `${this.base}${file}`);
  }

  /** Distinct sources of the installed assets, for the credits line. */
  credits(): string[] {
    const names = new Set<string>();
    for (const credit of Object.values(this.manifest.credits)) names.add(credit.split(' — ')[0]);
    if (Object.keys(this.manifest.sounds).length) names.add('vos fichiers audio');
    return [...names];
  }
}
