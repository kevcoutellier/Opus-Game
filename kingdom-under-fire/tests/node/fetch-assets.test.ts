import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** Stands in for the Kingdom Under Fire Wiki (MediaWiki API), the Steam store API and the Steam CDN. */
function mockServer(): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const base = `http://localhost:${(server.address() as { port: number }).port}`;
    if (url.pathname === '/api.php') {
      const titles = url.searchParams.get('titles')!.split('|');
      const pages: Record<string, unknown> = {};
      titles.forEach((title, i) => {
        if (title === 'Lord Demetrich') return; // an article without a picture
        // The wiki redirects this article to its canonical title.
        const canonical = title === 'Amaruak the Lich' ? 'Amaruak' : title;
        pages[i] = { title: canonical, original: { source: `${base}/images/${encodeURIComponent(canonical)}.png/revision/latest?cb=1` } };
      });
      res.end(JSON.stringify({ query: { redirects: [{ from: 'Amaruak the Lich', to: 'Amaruak' }], pages } }));
    } else if (url.pathname.startsWith('/images/')) {
      res.end(PNG);
    } else if (url.pathname === '/api/appdetails') {
      const data = { header_image: `${base}/steam/header.jpg`, background_raw: `${base}/steam/bg.jpg`, screenshots: [{ path_full: `${base}/steam/s1.jpg` }] };
      res.end(JSON.stringify({ 2183600: { success: true, data } }));
    } else if (url.pathname.startsWith('/steam/') || url.pathname === '/cdn/library_hero.jpg') {
      res.end(JPEG);
    } else {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, base: `http://localhost:${(server.address() as { port: number }).port}` })));
}

describe('npm run assets (scripts/fetch-assets.mjs)', () => {
  let server: Server;
  let base: string;
  const work = mkdtempSync(join(tmpdir(), 'kuf-assets-'));
  const out = join(work, 'public-assets');

  beforeAll(async () => {
    ({ server, base } = await mockServer());
    mkdirSync(join(work, 'sfx', 'combat'), { recursive: true });
    mkdirSync(join(work, 'music'), { recursive: true });
    writeFileSync(join(work, 'sfx', 'combat', 'Sword_Hit01.wav'), 'RIFF');
    writeFileSync(join(work, 'sfx', 'orc_die.ogg'), 'OggS');
    writeFileSync(join(work, 'sfx', 'mystery.wav'), 'RIFF');
    writeFileSync(join(work, 'sfx', 'readme.txt'), 'not audio');
    writeFileSync(join(work, 'music', 'battle 1.mp3'), 'ID3');
  });

  afterAll(() => {
    server.close();
    rmSync(work, { recursive: true, force: true });
  });

  it('downloads portraits, emblems and artwork, copies and sorts the sounds, and writes the manifest', async () => {
    const { stdout } = await run(process.execPath, ['scripts/fetch-assets.mjs', `--sounds=${join(work, 'sfx')}`, `--music=${join(work, 'music')}`], {
      env: { ...process.env, KUF_ASSETS_DIR: out, KUF_WIKI_API: `${base}/api.php`, KUF_STEAM_STORE: base, KUF_STEAM_CDN: `${base}/cdn` },
    });
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    expect(manifest.files['portraits/curian']).toBe('portraits/curian.png');
    expect(manifest.files['portraits/amaruak']).toBe('portraits/amaruak.png'); // through the redirect
    expect(manifest.files['portraits/demetrich']).toBeUndefined();
    expect(manifest.files['emblems/dark_legion']).toBe('emblems/dark_legion.png');
    expect(manifest.files['artwork/header']).toBe('artwork/header.jpg');
    expect(manifest.files['artwork/background']).toBe('artwork/background.jpg');
    expect(manifest.files['artwork/screenshot1']).toBe('artwork/screenshot1.jpg');
    expect(manifest.files['artwork/library_hero']).toBe('artwork/library_hero.jpg');
    expect(manifest.files['artwork/library_600x900']).toBeUndefined();
    expect(readFileSync(join(out, 'portraits', 'curian.png'))).toEqual(PNG);
    expect(manifest.sounds.clash).toEqual(['audio/clash/Sword_Hit01.wav']);
    expect(manifest.sounds.death).toEqual(['audio/death/orc_die.ogg']);
    expect(manifest.sounds.music).toEqual(['audio/music/battle_1.mp3']);
    expect(existsSync(join(out, 'audio', 'clash', 'Sword_Hit01.wav'))).toBe(true);
    expect(stdout).toContain('Lord Demetrich');
    expect(stdout).toContain('1 fichiers sans catégorie ignorés');
    expect(manifest.credits['portraits/curian']).toContain('Kingdom Under Fire Wiki');
  });

  it('keeps already downloaded files on a second run', async () => {
    const { stdout } = await run(process.execPath, ['scripts/fetch-assets.mjs', '--no-steam'], {
      env: { ...process.env, KUF_ASSETS_DIR: out, KUF_WIKI_API: `${base}/api.php` },
    });
    expect(stdout).toMatch(/0 fichiers ajoutés, \d+ déjà présents/);
  });
});
