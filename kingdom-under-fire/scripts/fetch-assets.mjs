// Downloads the official Kingdom Under Fire artwork used by the game and copies your own sound files into
// public/assets/, then writes public/assets/manifest.json.
//
//   npm run assets                               portraits and emblems (Kingdom Under Fire Wiki) + Steam artwork
//   npm run assets -- --no-wiki / --no-steam     skip a source
//   npm run assets -- --music=<file|folder>      your music (e.g. the soundtrack of your copy of the game)
//   npm run assets -- --sounds=<folder>          your sound effects (.wav/.ogg/.mp3), sorted by file name
//   npm run assets -- --force                    download again files already present
//
// The files remain the property of Blueside / Phantagram and of their authors: they are never versioned
// (public/assets/ is in .gitignore) and stay on your machine.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES = JSON.parse(readFileSync(join(HERE, '..', 'src', 'assets', 'sources.json'), 'utf8'));
const ROOT = process.env.KUF_ASSETS_DIR ?? join(HERE, '..', 'public', 'assets');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const FORCE = flag('force');
const USER_AGENT = 'kingdom-under-fire-web/1.0 (non-commercial fan project)';
// Endpoints can be overridden (tests run the script against a local mock server).
const WIKI_API = process.env.KUF_WIKI_API ?? SOURCES.wiki.api;
const STEAM_STORE = process.env.KUF_STEAM_STORE ?? 'https://store.steampowered.com';
const STEAM_CDN = process.env.KUF_STEAM_CDN ?? SOURCES.steam.cdn;
const AUDIO = new Set(['.wav', '.ogg', '.mp3', '.m4a', '.flac', '.opus']);

const manifestPath = join(ROOT, 'manifest.json');
const manifest = existsSync(manifestPath) && !FORCE
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { version: 1, files: {}, sounds: {}, credits: {} };
manifest.sounds ??= {};
manifest.credits ??= {};
const stats = { ok: 0, cached: 0, failed: [] };

function isImage(buf) {
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  const webp = buf.subarray(8, 12).toString('ascii') === 'WEBP';
  const gif = buf.subarray(0, 3).toString('ascii') === 'GIF';
  return jpeg || png || webp || gif;
}

function extensionOf(url) {
  const path = url.split('/revision/')[0].split('?')[0];
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
}

async function download(key, url, file, credit) {
  const target = join(ROOT, file);
  if (!FORCE && manifest.files[key] === file && existsSync(target)) {
    stats.cached++;
    return true;
  }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isImage(buf)) throw new Error('not an image');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buf);
    manifest.files[key] = file;
    manifest.credits[key] = credit;
    stats.ok++;
    return true;
  } catch (err) {
    stats.failed.push(`${key} (${err.message})`);
    return false;
  }
}

/** Main picture of wiki articles (MediaWiki pageimages), following redirects. */
async function pageImages(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const url = `${WIKI_API}?action=query&format=json&redirects=1&prop=pageimages&piprop=original&titles=${encodeURIComponent(batch.join('|'))}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const alias = {};
    for (const r of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) alias[r.to] = r.from;
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (!page.original?.source) continue;
      let title = page.title;
      while (alias[title]) title = alias[title];
      out[title] = page.original.source;
    }
  }
  return out;
}

async function wiki() {
  const groups = [
    ['portraits', SOURCES.wiki.portraits],
    ['emblems', SOURCES.wiki.emblems],
    ['artwork', SOURCES.wiki.artwork],
  ];
  const titles = [...new Set(groups.flatMap(([, table]) => Object.values(table)))];
  console.log(`${SOURCES.wiki.name} : ${titles.length} articles`);
  let images;
  try {
    images = await pageImages(titles);
  } catch (err) {
    stats.failed.push(`wiki (${err.message})`);
    return;
  }
  const tasks = [];
  for (const [kind, table] of groups) {
    for (const [id, title] of Object.entries(table)) {
      const url = images[title];
      if (!url) {
        stats.failed.push(`${kind}/${id} (pas d’image pour « ${title} »)`);
        continue;
      }
      tasks.push(download(`${kind}/${id}`, url, `${kind}/${id}.${extensionOf(url)}`, `${SOURCES.wiki.name} — ${title}`));
    }
  }
  await Promise.all(tasks);
}

async function steam() {
  const { appId, extra, name } = SOURCES.steam;
  console.log(`${name}`);
  let data = null;
  try {
    const res = await fetch(`${STEAM_STORE}/api/appdetails?appids=${appId}&l=french`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json())?.[appId]?.data ?? null;
  } catch (err) {
    stats.failed.push(`steam appdetails (${err.message})`);
  }
  const tasks = [];
  if (data?.header_image) tasks.push(download('artwork/header', data.header_image, 'artwork/header.jpg', name));
  const background = data?.background_raw ?? data?.background;
  if (background) tasks.push(download('artwork/background', background, 'artwork/background.jpg', name));
  (data?.screenshots ?? []).slice(0, 8).forEach((shot, i) => {
    tasks.push(download(`artwork/screenshot${i + 1}`, shot.path_full, `artwork/screenshot${i + 1}.jpg`, name));
  });
  for (const file of extra) {
    const key = `artwork/${basename(file, extname(file))}`;
    tasks.push(download(key, `${STEAM_CDN}/${file}`, `artwork/${file}`, name));
  }
  await Promise.all(tasks);
}

function audioFiles(path) {
  if (!existsSync(path)) {
    stats.failed.push(`audio (${path} introuvable)`);
    return [];
  }
  if (statSync(path).isFile()) return AUDIO.has(extname(path).toLowerCase()) ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = join(path, entry.name);
    return entry.isDirectory() ? audioFiles(full) : AUDIO.has(extname(entry.name).toLowerCase()) ? [full] : [];
  });
}

/** Category of a sound from its file name (and folder), per sources.json; null when unknown. */
export function classifySound(path) {
  const name = path.toLowerCase().replace(/\\/g, '/').split('/').slice(-2).join('/');
  for (const [category, pattern] of Object.entries(SOURCES.soundCategories)) {
    if (new RegExp(pattern).test(name)) return category;
  }
  return null;
}

function copyAudio(files, forced) {
  const unknown = [];
  for (const file of files) {
    const category = forced ?? classifySound(file);
    if (!category) {
      unknown.push(basename(file));
      continue;
    }
    const safe = basename(file).replace(/[^\w.-]+/g, '_');
    const rel = `audio/${category}/${safe}`;
    mkdirSync(join(ROOT, 'audio', category), { recursive: true });
    copyFileSync(file, join(ROOT, rel));
    const list = (manifest.sounds[category] ??= []);
    if (!list.includes(rel)) list.push(rel);
    stats.ok++;
  }
  if (unknown.length) console.log(`  ${unknown.length} fichiers sans catégorie ignorés (renommez-les avec : ${Object.keys(SOURCES.soundCategories).join(', ')})`);
}

async function main() {
  mkdirSync(ROOT, { recursive: true });
  if (!flag('no-wiki')) await wiki();
  if (!flag('no-steam')) await steam();
  const music = option('music');
  if (music) {
    console.log(`Musique : ${music}`);
    copyAudio(audioFiles(music), 'music');
  }
  const sounds = option('sounds');
  if (sounds) {
    console.log(`Sons : ${sounds}`);
    copyAudio(audioFiles(sounds), null);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n${stats.ok} fichiers ajoutés, ${stats.cached} déjà présents, ${stats.failed.length} échecs.`);
  for (const failure of stats.failed) console.log(`  ✗ ${failure}`);
  console.log(`Manifeste : ${manifestPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
