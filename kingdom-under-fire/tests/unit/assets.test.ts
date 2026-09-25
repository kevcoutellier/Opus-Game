import { describe, expect, it } from 'vitest';
import { AssetManager } from '../../src/assets/AssetManager';
import sources from '../../src/assets/sources.json';
import { FACTIONS } from '../../src/data/factions';
import { CHARACTERS } from '../../src/data/story/lore';

describe('AssetManager', () => {
  it('resolves installed assets and falls back to null for missing ones', () => {
    const assets = new AssetManager('assets/');
    assets.use({
      files: { 'portraits/curian': 'portraits/curian.png', 'emblems/dark_legion': 'emblems/dark_legion.png', 'artwork/screenshot1': 'artwork/screenshot1.jpg' },
      sounds: { clash: ['audio/clash/a.wav', 'audio/clash/b.wav'] },
      credits: { 'portraits/curian': 'Kingdom Under Fire Wiki — Curian', 'artwork/screenshot1': 'Steam — KUF' },
    });
    expect(assets.portrait('curian')).toBe('assets/portraits/curian.png');
    expect(assets.portrait('likuku')).toBeNull();
    expect(assets.emblem('dark_legion')).toBe('assets/emblems/dark_legion.png');
    expect(assets.emblem('human_alliance')).toBeNull();
    // Hero art is preferred, but any installed artwork will do.
    expect(assets.artwork()).toBe('assets/artwork/screenshot1.jpg');
    expect(assets.sounds('clash')).toEqual(['assets/audio/clash/a.wav', 'assets/audio/clash/b.wav']);
    expect(assets.sounds('music')).toEqual([]);
    expect(assets.credits()).toEqual(['Kingdom Under Fire Wiki', 'Steam', 'vos fichiers audio']);
    expect(assets.count).toBe(5);
  });

  it('loads the manifest, and survives a missing one', async () => {
    const assets = new AssetManager();
    await assets.load((async () => new Response('{"files":{"portraits/gernot":"portraits/gernot.jpg"}}')) as typeof fetch);
    expect(assets.portrait('gernot')).toBe('assets/portraits/gernot.jpg');
    const empty = new AssetManager();
    await empty.load((async () => {
      throw new Error('offline');
    }) as typeof fetch);
    expect(empty.count).toBe(0);
    expect(empty.artwork()).toBeNull();
  });

  it('has a wiki source for every character portrait and faction emblem', () => {
    expect(Object.keys(sources.wiki.portraits).sort()).toEqual(CHARACTERS.map((c) => c.id).sort());
    expect(Object.keys(sources.wiki.emblems).sort()).toEqual(FACTIONS.map((f) => f.id).sort());
  });
});
