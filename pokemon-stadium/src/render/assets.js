import { ASSET_SOURCES, NAMED_ASSETS } from '../assetSources.js';

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

export function isLocal(kind, key) {
  return !!manifest[kind]?.includes(key);
}

export function hasStadiumModel(num) {
  return isLocal('stadium', num);
}

/** URL of an asset by dex number (numbered kinds) or name (fx, trainers, people, env). */
export function assetUrl(kind, key) {
  const source = NAMED_ASSETS[kind] || ASSET_SOURCES[kind];
  if (isLocal(kind, key)) return `${BASE}assets/${kind}/${key}.${source.ext}`;
  return source.url(key);
}

/** Model candidates, best first: Stadium rip > animated model > light model. */
export function modelCandidates(num, { animated = true } = {}) {
  const list = [];
  if (hasStadiumModel(num)) list.push({ source: 'stadium', url: `${BASE}assets/stadium/${num}.glb` });
  if (animated) list.push({ source: 'animated', url: assetUrl('animated', num) });
  list.push({ source: 'models', url: assetUrl('models', num) });
  return list;
}

export function assetStats() {
  return Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.length]));
}
