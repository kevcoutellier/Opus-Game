// Downloads the game's third-party assets into public/assets and writes
// public/assets/manifest.json, which the game reads to prefer local files
// over the remote URLs.
//
//   models/<num>.glb   3D models (Draco + WebP)   github.com/Pokemon-3D-api/assets
//   cries/<num>.ogg    Gen 1 cries                github.com/PokeAPI/cries
//   icons/<num>.png    menu icons                 github.com/PokeAPI/sprites
//   sprites/<num>.png  Red/Blue sprites           github.com/PokeAPI/sprites
//
// Pokémon Stadium (N64) models extracted from your own cartridge can be dropped
// in public/assets/stadium/<num>.glb: they take priority over the models above.
//
// Usage: npm run assets [-- --only=models,cries] [--from=1 --to=151] [--force]

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_SOURCES } from '../src/assetSources.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'public/assets');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);
const from = Number(args.from || 1);
const to = Number(args.to || 151);
const kinds = args.only ? args.only.split(',') : Object.keys(ASSET_SOURCES);
const force = args.force === 'true';

async function download(url, dest, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return 'missing';
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return 'ok';
    } catch (err) {
      if (i === attempts) {
        console.warn(`  ! ${url}: ${err.message}`);
        return 'error';
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
}

async function pool(items, size, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) await worker(items[next++]);
  };
  await Promise.all(Array.from({ length: size }, run));
}

function writeManifest() {
  const manifest = {};
  for (const kind of [...Object.keys(ASSET_SOURCES), 'stadium']) {
    const dir = join(assetsDir, kind);
    if (!existsSync(dir)) continue;
    manifest[kind] = readdirSync(dir)
      .map((f) => Number.parseInt(f, 10))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
  }
  writeFileSync(join(assetsDir, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

async function main() {
  mkdirSync(join(assetsDir, 'stadium'), { recursive: true });
  for (const kind of kinds) {
    const source = ASSET_SOURCES[kind];
    if (!source) throw new Error(`Unknown asset kind "${kind}"`);
    const dir = join(assetsDir, kind);
    mkdirSync(dir, { recursive: true });
    const nums = [];
    for (let n = from; n <= to; n++) nums.push(n);
    const stats = { ok: 0, skipped: 0, missing: 0, error: 0, bytes: 0 };
    console.log(`[assets] ${kind}: #${from}-#${to} <- ${source.url(1).replace(/1\.\w+$/, '*')}`);
    await pool(nums, 8, async (n) => {
      const dest = join(dir, `${n}.${source.ext}`);
      if (!force && existsSync(dest) && statSync(dest).size > 0) {
        stats.skipped++;
        return;
      }
      const result = await download(source.url(n), dest);
      stats[result]++;
      if (result === 'ok') stats.bytes += statSync(dest).size;
    });
    console.log(
      `  ${stats.ok} downloaded (${(stats.bytes / 1e6).toFixed(1)} MB), ` +
        `${stats.skipped} already present, ${stats.missing} missing, ${stats.error} errors`,
    );
  }
  const manifest = writeManifest();
  console.log(
    '[assets] manifest:',
    Object.entries(manifest)
      .map(([k, v]) => `${k}=${v.length}`)
      .join(' '),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
