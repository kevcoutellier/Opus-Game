// Faction emblems: official SVG icons recoloured with the faction colour, or a procedural insignia.
import { emblemIcon } from '../assetSources.js';

const official = new Map(); // factionId -> { viewBox, paths } | { url } (bitmap from Wookieepedia)

export async function preloadEmblems(factions) {
  await Promise.all(factions.map(async (f) => {
    if (official.has(f.id)) return;
    const icon = emblemIcon(f.id);
    if (!icon) return;
    if (!icon.svg) {
      official.set(f.id, { url: icon.url });
      return;
    }
    try {
      const res = await fetch(icon.url);
      if (!res.ok) return;
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      const paths = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean);
      if (svg && paths.length) official.set(f.id, { viewBox: svg.getAttribute('viewBox'), paths });
    } catch {
      // Offline: the procedural insignia is used instead.
    }
  }));
}

const SHAPES = {
  cog: (c) => `<circle cx="50" cy="50" r="36" fill="none" stroke="${c}" stroke-width="9"/><circle cx="50" cy="50" r="13" fill="${c}"/>${
    [0, 60, 120, 180, 240, 300].map((a) => `<rect x="46" y="10" width="8" height="30" fill="${c}" transform="rotate(${a} 50 50)"/>`).join('')}`,
  starbird: (c) => `<path fill="${c}" d="M50 8 L57 40 L88 22 L64 52 L82 88 L50 66 L18 88 L36 52 L12 22 L43 40 Z"/>`,
  hutt: (c) => `<path fill="${c}" d="M50 10a40 40 0 1 0 0.1 0zM50 22a28 28 0 1 1-0.1 0z"/><circle cx="50" cy="50" r="12" fill="${c}"/><path fill="${c}" d="M20 80 L50 58 L80 80 Z"/>`,
  chiss: (c) => `<path fill="${c}" d="M50 8 L90 80 L10 80 Z M50 30 L28 70 L72 70 Z" fill-rule="evenodd"/><circle cx="50" cy="58" r="7" fill="${c}"/>`,
  diamond: (c) => `<path fill="${c}" d="M50 6 L92 50 L50 94 L8 50 Z M50 26 L72 50 L50 74 L28 50 Z" fill-rule="evenodd"/>`,
  crown: (c) => `<path fill="${c}" d="M14 76 L20 30 L36 50 L50 20 L64 50 L80 30 L86 76 Z"/><rect x="14" y="80" width="72" height="8" fill="${c}"/>`,
  mando: (c) => `<path fill="${c}" d="M20 18 H80 V46 H58 V86 H42 V46 H20 Z"/>`,
  hex: (c) => `<path fill="none" stroke="${c}" stroke-width="10" d="M50 10 L85 30 L85 70 L50 90 L15 70 L15 30 Z"/><circle cx="50" cy="50" r="10" fill="${c}"/>`,
  sun: (c) => `<circle cx="50" cy="50" r="18" fill="${c}"/>${
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M46 26 L50 6 L54 26 Z" fill="${c}" transform="rotate(${a} 50 50)"/>`).join('')}`,
  claw: (c) => `<path fill="${c}" d="M22 20 L34 20 L46 84 L36 84 Z M44 14 L56 14 L62 86 L52 86 Z M66 20 L78 20 L72 84 L62 84 Z"/>`,
  cloud: (c) => `<ellipse cx="50" cy="44" rx="40" ry="14" fill="${c}"/><path fill="${c}" d="M40 56 L60 56 L54 88 L46 88 Z"/>`,
  ring: (c) => `<circle cx="50" cy="50" r="22" fill="${c}"/><ellipse cx="50" cy="50" rx="44" ry="12" fill="none" stroke="${c}" stroke-width="6" transform="rotate(-20 50 50)"/>`,
  spire: (c) => `<path fill="${c}" d="M50 6 L60 70 L72 92 H28 L40 70 Z"/>`,
  hexring: (c) => `<circle cx="50" cy="50" r="42" fill="none" stroke="${c}" stroke-width="7"/><path fill="${c}" d="M50 20 L76 35 L76 65 L50 80 L24 65 L24 35 Z"/>`,
  newrep: (c) => `<circle cx="50" cy="50" r="16" fill="${c}"/><path fill="${c}" d="M6 50 L34 40 L34 60 Z M94 50 L66 40 L66 60 Z M50 8 L58 34 L42 34 Z"/>`,
  firstorder: (c) => `<circle cx="50" cy="50" r="14" fill="${c}"/>${
    [0, 60, 120, 180, 240, 300].map((a) => `<path d="M42 30 L50 6 L58 30 Z" fill="${c}" transform="rotate(${a} 50 50)"/>`).join('')}`,
};

/** Inline SVG markup of a faction emblem. */
export function emblemSvg(faction, size = 32, color = faction.color) {
  const off = official.get(faction.id);
  if (off?.url) return `<img src="${off.url}" width="${size}" height="${size}" alt="" style="object-fit:contain">`;
  if (off) {
    return `<svg width="${size}" height="${size}" viewBox="${off.viewBox}" aria-hidden="true">${off.paths.map((d) => `<path d="${d}" fill="${color}"/>`).join('')}</svg>`;
  }
  const shape = SHAPES[faction.emblem] || SHAPES.ring;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">${shape(color)}</svg>`;
}

/** Canvas version (Path2D) of the official icon, for the map. */
const path2d = new Map();
export function emblemPath(factionId) {
  if (path2d.has(factionId)) return path2d.get(factionId);
  const off = official.get(factionId);
  if (!off || off.url || typeof Path2D === 'undefined') return null;
  const [, , w, h] = off.viewBox.split(/\s+/).map(Number);
  const value = { w, h, paths: off.paths.map((d) => new Path2D(d)) };
  path2d.set(factionId, value);
  return value;
}
