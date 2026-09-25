// Downloads the official Star Wars artwork and sounds used by the game into public/assets/ and writes the
// manifest.
//
//   npm run assets                          everything (GitHub mirrors, Wookieepedia, The Sounds Resource)
//   npm run assets -- --no-wookieepedia     skip Wookieepedia
//   npm run assets -- --no-sounds           skip the sound packs of the classic games
//   npm run assets -- --theme=<file.mp3>    copy your own recording of the main theme
//   npm run assets -- --force               re-download files that are already present
//
// The files stay the property of Lucasfilm / Disney: they are not versioned (see .gitignore).
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readEntry, unzip } from './zip.mjs';
import { fileURLToPath } from 'node:url';
import {
  EMBLEMS, EVENT_ART, EXTRA_ICONS, FA_BASE, LEADERS, PLANETS, SWAPI_BASE, UNIT_ART, WOOKIEEPEDIA_EMBLEMS,
  WOOKIEEPEDIA_LEADERS, WOOKIEEPEDIA_PLANETS, slug,
} from '../src/assetSources.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const WOOKIEEPEDIA = !args.has('--no-wookieepedia');
const SOUNDS = !args.has('--no-sounds');
const THEME = process.argv.find((a) => a.startsWith('--theme='))?.slice(8);
const WIKI_API = 'https://starwars.fandom.com/api.php';

const manifestPath = join(ROOT, 'manifest.json');
const manifest = existsSync(manifestPath) && !FORCE ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { files: {} };
const stats = { ok: 0, cached: 0, failed: [] };

/** Actual format of a downloaded file, or null when it is not a picture (error page...). */
function imageType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';
  // SVG files may start with a long XML prologue or comments.
  const head = buf.subarray(0, 16384).toString('utf8');
  if (/<svg[\s>]/i.test(head) && !/<html[\s>]/i.test(head)) return 'svg';
  return null;
}

const AGENT = { 'User-Agent': 'galactic-protocol-assets/1.0 (fan project)' };
// Fandom's image CDN rejects (403) requests that do not look like a browser displaying the wiki.
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  Referer: 'https://starwars.fandom.com/',
};

/** Downloads the first candidate URL that answers with a valid image. */
async function download(key, urls, file, headers = AGENT) {
  if (!FORCE && manifest.files[key] && existsSync(join(ROOT, manifest.files[key]))) {
    stats.cached++;
    return true;
  }
  let error = null;
  for (const url of [urls].flat()) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const type = imageType(buf);
      if (!type) throw new Error('fichier non reconnu');
      // Keep the real format (the CDN may serve a PNG rendering of an SVG file, for instance).
      const actual = file.replace(/\.[a-z0-9]+$/i, `.${type}`);
      const target = join(ROOT, actual);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, buf);
      manifest.files[key] = actual;
      stats.ok++;
      return true;
    } catch (err) {
      error = err;
    }
  }
  stats.failed.push(`${key} (${error.message})`);
  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pool(tasks, size = 8) {
  const queue = [...tasks];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) await queue.shift()();
  }));
}

// ---------------------------------------------------------------- GitHub sources

function swapiRefs() {
  const refs = new Map();
  const add = ([collection, id]) => refs.set(`${collection}/${id}`, [collection, id]);
  for (const id of Object.values(PLANETS)) add(['planets', id]);
  for (const id of Object.values(LEADERS)) add(['people', id]);
  for (const style of Object.values(UNIT_ART)) for (const ref of Object.values(style)) add(ref);
  for (const ref of Object.values(EVENT_ART)) add(ref);
  return [...refs.values()];
}

async function github() {
  const refs = swapiRefs();
  console.log(`starwars.com (SWAPI) : ${refs.length} images`);
  await pool(refs.map(([c, id]) => () => download(`${c}/${id}`, `${SWAPI_BASE}/${c}/${id}.jpg`, `${c}/${id}.jpg`)));
  const icons = [...new Set([...Object.values(EMBLEMS), ...EXTRA_ICONS])];
  console.log(`Emblèmes officiels (Font Awesome) : ${icons.length}`);
  await pool(icons.map((name) => () => download(`emblems/${name}`, `${FA_BASE}/${name}.svg`, `emblems/${name}.svg`)));
}

// ---------------------------------------------------------------- Wookieepedia

async function wikiQuery(params) {
  const url = `${WIKI_API}?${new URLSearchParams({ action: 'query', format: 'json', redirects: '1', ...params })}`;
  const res = await fetch(url, { headers: AGENT });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Lead picture of each article (PageImages extension). */
async function pageImages(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const data = await wikiQuery({ prop: 'pageimages', piprop: 'original', titles: titles.slice(i, i + 40).join('|') });
    const alias = {};
    for (const r of [...(data.query?.normalized || []), ...(data.query?.redirects || [])]) alias[r.to] = r.from;
    for (const page of Object.values(data.query?.pages || {})) {
      if (!page.original?.source) continue;
      let title = page.title;
      while (alias[title]) title = alias[title];
      out[title] = page.original.source;
    }
  }
  return out;
}

// Files of an article that are not illustrations of its subject.
const NOT_ILLUSTRATION = /(eras?[-_ ]|premium|icon|canon|legends|stub|button|tab[-_ ]|symbol_for|sw-?logo|question|noimage)/i;

/** Largest picture shown in an article, for articles without a lead picture. */
async function largestImage(title) {
  const data = await wikiQuery({ titles: title, generator: 'images', gimlimit: '30', prop: 'imageinfo', iiprop: 'url|size|mime' });
  const files = Object.values(data.query?.pages || {})
    .filter((page) => !NOT_ILLUSTRATION.test(page.title))
    .map((page) => page.imageinfo?.[0])
    .filter((info) => info && /image\/(png|jpeg|webp|gif)/.test(info.mime) && info.width >= 160 && info.height >= 120)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  return files[0]?.url ?? null;
}

function extension(url) {
  const path = url.split('/revision/')[0].split('?')[0];
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) ? ext : 'png';
}

/** The same picture through the CDN variants (original, resized, legacy path). */
function cdnVariants(url) {
  const base = url.split('?')[0];
  const variants = [url];
  if (base.includes('/revision/latest')) {
    variants.push(`${base.replace(/\/revision\/latest.*$/, '/revision/latest/scale-to-width-down/800')}`);
    variants.push(base.replace(/\/revision\/latest.*$/, ''));
  }
  return variants;
}

async function wookieepedia(kind, table) {
  const entries = Object.entries(table);
  const key = (id) => `wookieepedia/${kind}/${kind === 'leaders' ? slug(id) : id}`;
  const todo = entries.filter(([id]) => FORCE || !(manifest.files[key(id)] && existsSync(join(ROOT, manifest.files[key(id)]))));
  stats.cached += entries.length - todo.length;
  if (!todo.length) return;
  const images = {};
  try {
    Object.assign(images, await pageImages(todo.map(([, title]) => title)));
    // Articles without a lead picture: their Legends version, then the largest picture of the page.
    const missing = todo.filter(([, title]) => !images[title]);
    const legends = await pageImages(missing.map(([, title]) => `${title}/Legends`));
    for (const [, title] of missing) if (legends[`${title}/Legends`]) images[title] = legends[`${title}/Legends`];
    for (const [, title] of todo) {
      if (images[title]) continue;
      images[title] = (await largestImage(title)) || (await largestImage(`${title}/Legends`).catch(() => null));
    }
  } catch (err) {
    console.log(`  Wookieepedia injoignable (${err.message}) : ${kind} ignorés.`);
    return;
  }
  const tasks = [];
  for (const [id, title] of todo) {
    const url = images[title];
    if (!url) {
      stats.failed.push(`${key(id)} (pas d’image)`);
      continue;
    }
    tasks.push(async () => {
      await download(key(id), cdnVariants(url), `${key(id)}.${extension(url)}`, BROWSER);
      await sleep(150);
    });
  }
  console.log(`Wookieepedia (${kind}) : ${tasks.length} images`);
  await pool(tasks, 2);
}

// ---------------------------------------------------------------- sounds of the classic games

// Sound effects ripped from LucasArts games, archived by The Sounds Resource.
const SOUND_SITE = 'https://sounds.spriters-resource.com';
const SOUND_PACKS = [
  { id: 'eaw', name: 'Star Wars: Empire at War', path: 'pc_computer/starwarsempireatwar', asset: 396707 },
  { id: 'xvt', name: 'Star Wars: X-Wing vs. TIE Fighter', path: 'pc_computer/starwarsxwingvstiefighter', asset: 396723 },
  { id: 'tie', name: 'Star Wars: TIE Fighter', path: 'pc_computer/starwarstiefighter', asset: 396886 },
  { id: 'xwing', name: 'Star Wars: X-Wing', path: 'pc_computer/starwarsxwing', asset: 396885 },
];

// Categories used by the game (src/audio/audio.js) and the file names that match them.
const SOUND_CATEGORIES = {
  superlaser: /super.?laser|death.?star|deathstar|planet.?destr/i,
  explosion: /explo|expl_|boom|destruct|debris|crash|detonat/i,
  laser: /laser|blast|turbo|cannon|shot|fire|ion_|gun|torpedo|missile/i,
  alarm: /alarm|alert|klaxon|siren|warning|red_?alert/i,
  hyperspace: /hyper|lightspeed|jump/i,
  engine: /engine|flyby|fly_?by|pass_?by|tie_|xwing|x-wing/i,
  ui: /click|button|menu|select|interface|ui_|beep|confirm|cursor/i,
};
const MAX_PER_CATEGORY = 16;
const AUDIO_EXT = /\.(wav|ogg|mp3)$/i;

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: AGENT, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const isZip = (buf) => buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;

/** Finds the archive of a Sounds Resource asset (the site changed its URLs over time). */
async function downloadPack(pack) {
  const candidates = [
    `${SOUND_SITE}/media/assets/${String(pack.asset).slice(0, 3)}/${pack.asset}.zip`,
    `${SOUND_SITE}/download/${pack.asset}/`,
  ];
  for (const url of candidates) {
    try {
      const buf = await fetchBuffer(url);
      if (isZip(buf)) return buf;
    } catch {
      // Try the next URL.
    }
  }
  const page = (await fetchBuffer(`${SOUND_SITE}/${pack.path}/asset/${pack.asset}/`)).toString('utf8');
  const links = [...page.matchAll(/href="([^"]+(?:\.zip[^"]*|\/download\/[^"]*))"/gi)].map((m) => new URL(m[1].replace(/&amp;/g, '&'), SOUND_SITE).href);
  for (const url of links) {
    const buf = await fetchBuffer(url);
    if (isZip(buf)) return buf;
  }
  throw new Error('archive introuvable');
}

async function soundPacks() {
  manifest.sfx = manifest.sfx && !FORCE ? manifest.sfx : {};
  for (const pack of SOUND_PACKS) {
    const already = Object.values(manifest.sfx).flat().some((f) => f.startsWith(`sfx/${pack.id}/`));
    if (already && !FORCE) {
      stats.cached++;
      continue;
    }
    let zip;
    try {
      zip = await downloadPack(pack);
    } catch (err) {
      console.log(`  ${pack.name} : ${err.message} (ignoré)`);
      stats.failed.push(`sons ${pack.id} (${err.message})`);
      continue;
    }
    const entries = unzip(zip).filter((e) => AUDIO_EXT.test(e.name) && e.size > 0 && e.size < 1_500_000);
    let kept = 0;
    for (const [category, pattern] of Object.entries(SOUND_CATEGORIES)) {
      const list = (manifest.sfx[category] ||= []);
      for (const entry of entries) {
        if (list.length >= MAX_PER_CATEGORY) break;
        const name = basename(entry.name);
        if (!pattern.test(name) || entry.used) continue;
        entry.used = true;
        const file = `sfx/${pack.id}/${category}/${name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
        mkdirSync(dirname(join(ROOT, file)), { recursive: true });
        writeFileSync(join(ROOT, file), readEntry(zip, entry));
        list.push(file);
        kept++;
      }
    }
    console.log(`  ${pack.name} : ${kept} sons retenus sur ${entries.length}`);
    stats.ok += kept;
  }
}

function theme() {
  const target = join(ROOT, 'audio', 'theme.mp3');
  if (THEME) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(THEME, target);
  }
  if (existsSync(target) && statSync(target).size > 0) {
    manifest.files['audio/theme'] = 'audio/theme.mp3';
    console.log('Thème principal : public/assets/audio/theme.mp3');
  } else {
    delete manifest.files['audio/theme'];
    console.log('Thème principal : absent (option --theme=<fichier.mp3> pour l’ajouter).');
  }
}

// ---------------------------------------------------------------- main

mkdirSync(ROOT, { recursive: true });
await github();
if (WOOKIEEPEDIA) {
  await wookieepedia('planets', WOOKIEEPEDIA_PLANETS);
  await wookieepedia('emblems', WOOKIEEPEDIA_EMBLEMS);
  await wookieepedia('leaders', WOOKIEEPEDIA_LEADERS);
}
if (SOUNDS) {
  console.log('Sons des jeux LucasArts (The Sounds Resource) :');
  await soundPacks();
}
theme();
manifest.generated = new Date().toISOString();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`\n${stats.ok} téléchargé(s), ${stats.cached} déjà présent(s), ${stats.failed.length} échec(s).`);
// Failures grouped by cause (the game draws or synthesises whatever is missing).
const causes = {};
for (const entry of stats.failed) {
  const [, name, cause] = entry.match(/^(.*) \((.*)\)$/) || [null, entry, '?'];
  (causes[cause] ||= []).push(name.replace(/^wookieepedia\//, ''));
}
for (const [cause, names] of Object.entries(causes)) {
  console.log(`  ${names.length} × ${cause} : ${names.slice(0, 8).join(', ')}${names.length > 8 ? '…' : ''}`);
}
if (stats.failed.length) console.log('Relancez `npm run assets` pour réessayer : les fichiers déjà présents ne sont pas retéléchargés.');
