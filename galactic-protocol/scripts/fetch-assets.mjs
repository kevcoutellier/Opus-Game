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

function isImage(buf, svg) {
  if (svg) return buf.subarray(0, 200).toString('utf8').includes('<svg');
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  const webp = buf.subarray(8, 12).toString('ascii') === 'WEBP';
  const gif = buf.subarray(0, 3).toString('ascii') === 'GIF';
  return jpeg || png || webp || gif;
}

async function download(key, url, file) {
  const target = join(ROOT, file);
  if (!FORCE && manifest.files[key] === file && existsSync(target)) {
    stats.cached++;
    return true;
  }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'galactic-protocol-assets/1.0 (fan project)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isImage(buf, file.endsWith('.svg'))) throw new Error('not an image');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buf);
    manifest.files[key] = file;
    stats.ok++;
    return true;
  } catch (err) {
    stats.failed.push(`${key} (${err.message})`);
    return false;
  }
}

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

async function pageImages(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const url = `${WIKI_API}?action=query&format=json&redirects=1&prop=pageimages&piprop=original&titles=${encodeURIComponent(batch.join('|'))}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'galactic-protocol-assets/1.0 (fan project)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
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

function extension(url) {
  const path = url.split('/revision/')[0].split('?')[0];
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) ? ext : 'png';
}

async function wookieepedia(kind, table) {
  const entries = Object.entries(table);
  let images;
  try {
    images = await pageImages(entries.map(([, title]) => title));
  } catch (err) {
    console.log(`  Wookieepedia injoignable (${err.message}) : ${kind} ignorés.`);
    return;
  }
  const tasks = [];
  for (const [id, title] of entries) {
    const url = images[title];
    if (!url) {
      stats.failed.push(`wookieepedia/${kind}/${id} (pas d’image)`);
      continue;
    }
    const key = `wookieepedia/${kind}/${kind === 'leaders' ? slug(id) : id}`;
    tasks.push(() => download(key, url, `${key}.${extension(url)}`));
  }
  console.log(`Wookieepedia (${kind}) : ${tasks.length} images`);
  await pool(tasks, 4);
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
  const res = await fetch(url, { headers: { 'User-Agent': 'galactic-protocol-assets/1.0 (fan project)' }, redirect: 'follow' });
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
if (stats.failed.length) console.log(`Échecs : ${stats.failed.slice(0, 30).join(', ')}${stats.failed.length > 30 ? '…' : ''}`);
