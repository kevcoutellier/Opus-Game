import { ASSET_SOURCES } from '../assetSources.js';

// Files downloaded by `npm run assets` are listed in public/assets/manifest.json.
// Anything missing is streamed from GitHub instead, so the game also works
// without the download step (just slower on first load).

const BASE = import.meta.env.BASE_URL;
let manifest = {};

export async function loadManifest() {
  try {
    const res = await fetch(`${BASE}assets/manifest.json`, { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch {
    manifest = {};
  }
  return manifest;
}

export function hasStadiumModel(num) {
  return !!manifest.stadium?.includes(num);
}

export function assetUrl(kind, num) {
  if (kind === 'models' && hasStadiumModel(num)) return `${BASE}assets/stadium/${num}.glb`;
  const source = ASSET_SOURCES[kind];
  if (manifest[kind]?.includes(num)) return `${BASE}assets/${kind}/${num}.${source.ext}`;
  return source.url(num);
}

export function assetStats() {
  return Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.length]));
}
