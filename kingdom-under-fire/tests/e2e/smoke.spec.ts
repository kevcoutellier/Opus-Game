import { expect, test, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

// Resource errors of third-party hosts (web fonts behind a proxy, offline machines) are not game errors.
const isExternalResourceError = (text: string) => /Failed to load resource|ERR_CERT|ERR_NAME|ERR_INTERNET/.test(text);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isExternalResourceError(m.text())) errors.push(m.text());
  });
  return errors;
}

const game = (page: Page, expression: string) => page.evaluate(`(() => { const g = window.game; return ${expression}; })()`);

/**
 * Waits until `count` more frames have been rendered. Screen projections read the camera matrices of the
 * last frame, and the software renderer of CI machines (SwiftShader) can take a second per frame.
 */
async function waitFrames(page: Page, count: number): Promise<void> {
  const start = (await game(page, 'g.frames')) as number;
  await expect.poll(() => game(page, 'g.frames'), { timeout: 60_000 }).toBeGreaterThanOrEqual(start + count);
}

test('the battle scene boots behind the briefing, renders and logs no error', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByText('Les plaines de Hironeiden').first()).toBeVisible();
  await expect.poll(() => game(page, 'g?.frames ?? 0'), { timeout: 60_000 }).toBeGreaterThan(3);
  // The simulation waits for the player.
  expect(await game(page, 'g.world.time.tick')).toBe(0);
  await page.getByRole('button', { name: 'Commencer la bataille' }).click();
  await expect.poll(() => game(page, 'g.world.time.tick')).toBeGreaterThan(0);
  const stats = (await game(page, 'g.renderer.stats()')) as { calls: number; triangles: number };
  expect(stats.calls).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(1000);
  expect(await game(page, 'g.units.countActive(0) + g.units.countActive(1)')).toBe(await game(page, 'g.armies.player.units.length + g.armies.enemy.units.length'));
  expect(await game(page, 'g.heroes.list().length')).toBe(2);
  expect(errors).toEqual([]);
});

test('the player commands troops: Q / E choose one, right click marches, Shift adds a waypoint on the minimap', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect.poll(() => game(page, 'g?.frames ?? 0'), { timeout: 60_000 }).toBeGreaterThan(3);
  await page.keyboard.press('Enter');
  await expect(page.locator('.troop-card')).toHaveCount(4);
  const ids = (await game(page, 'g.deployed.player.map((t) => t.id)')) as number[];
  // The hero's troop is chosen first; E chooses the next one and the camera follows it.
  await expect.poll(() => game(page, 'g.troopInput.selected')).toBe(ids[0]);
  await page.keyboard.press('KeyE');
  await expect.poll(() => game(page, 'g.troopInput.selected')).toBe(ids[1]);
  await expect(page.locator('.troop-card.selected')).toContainText('Lanciers');
  await expect.poll(() => game(page, 'g.follow')).toBe(ids[1]);
  await page.keyboard.press('KeyQ');
  await expect.poll(() => game(page, 'g.troopInput.selected')).toBe(ids[0]);
  // A click on a soldier of the archers chooses their troop.
  await game(page, 'g.rtsCamera.focus(128, 182, 60, true)');
  await waitFrames(page, 2);
  const archer = (await game(
    page,
    `(() => { const t = g.deployed.player[2]; const id = t.members[t.members.length - 1]; const p = g.projector.project(g.world.c.x[id], g.terrain.heightAt(g.world.c.x[id], g.world.c.z[id]) + 1.1, g.world.c.z[id]); return [p.x, p.y]; })()`,
  )) as number[];
  await page.mouse.click(archer[0], archer[1]);
  await expect.poll(() => game(page, 'g.troopInput.selected')).toBe(ids[2]);

  // Right click ahead: the archers march.
  const startZ = (await game(page, 'g.world.c.z[g.deployed.player[2].leader]')) as number;
  const ahead = (await game(page, `(() => { const p = g.projector.project(128, g.terrain.heightAt(128, 150), 150); return [p.x, p.y]; })()`)) as number[];
  await page.mouse.click(ahead[0], ahead[1], { button: 'right' });
  await expect.poll(() => game(page, `g.deployed.player[2].waypoints.length`)).toBe(1);
  // Shift + right click on the minimap: a second waypoint.
  const map = (await page.locator('.minimap canvas').boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.click(map.x + map.width * 0.3, map.y + map.height * 0.55, { button: 'right' });
  await page.keyboard.up('Shift');
  await expect.poll(() => game(page, `g.deployed.player[2].waypoints.length`)).toBe(2);
  await expect.poll(() => game(page, 'g.world.c.z[g.deployed.player[2].leader]'), { timeout: 60_000 }).toBeLessThan(startZ - 3);
  expect(errors).toEqual([]);
});

test('the hero: an ability is aimed then cancelled, direct control is taken and given back', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect.poll(() => game(page, 'g?.frames ?? 0'), { timeout: 60_000 }).toBeGreaterThan(3);
  await page.keyboard.press('Enter');
  await expect(page.locator('.hero-bar')).toBeVisible();
  await expect(page.locator('.hero-bar .hero-name')).toContainText('Curian');
  // His troop's two officers and their assists.
  await expect(page.locator('.hero-bar .officer')).toHaveCount(2);
  await expect(page.locator('.hero-bar .officer').nth(1)).toContainText('Curatio');
  // X aims Gel, Escape cancels.
  await page.keyboard.press('KeyX');
  await expect.poll(() => game(page, 'g.heroInput.targeting?.slot ?? -1')).toBe(1);
  await page.keyboard.press('Escape');
  await expect.poll(() => game(page, 'g.heroInput.targeting')).toBeNull();
  // Tab: action mode with Curian (his troop becomes the chosen one), then back to tactic mode.
  const hero = (await game(page, 'g.heroes.list(0)[0].id')) as number;
  await page.keyboard.press('KeyE');
  await page.keyboard.press('Tab');
  await expect.poll(() => game(page, 'g.heroInput.direct')).toBe(hero);
  await expect.poll(() => game(page, `g.world.c.order[${hero}]`), { timeout: 60_000 }).toBe(5);
  await expect(page.locator('.crosshair')).toBeVisible();
  await expect(page.locator('.mode-badge')).toContainText('Mode action');
  // R is Y on the pad: the special attack.
  await page.keyboard.press('KeyR');
  await expect.poll(() => game(page, `g.heroes.get(${hero}).lastMove`), { timeout: 60_000 }).toBe('special');
  await expect.poll(() => game(page, 'g.troopInput.selected')).toBe(await game(page, 'g.deployed.player[0].id'));
  await page.keyboard.press('Tab');
  await expect.poll(() => game(page, 'g.heroInput.direct')).toBe(-1);
  await expect.poll(() => game(page, `g.world.c.order[${hero}]`), { timeout: 60_000 }).not.toBe(5);
  await expect(page.locator('.mode-badge')).toContainText('Mode tactique');
  // Zooming all the way in on the hero's troop enters action mode, zooming out of it leaves it.
  await game(page, 'g.rtsCamera.zoom(-40)');
  await page.mouse.move(640, 300);
  await page.mouse.wheel(0, -200);
  await expect.poll(() => game(page, 'g.heroInput.direct'), { timeout: 60_000 }).toBe(hero);
  await game(page, 'g.heroCamera.zoom(40)');
  await page.mouse.wheel(0, 200);
  await expect.poll(() => game(page, 'g.heroInput.direct'), { timeout: 60_000 }).toBe(-1);
  expect(errors).toEqual([]);
});

/** Minimal valid PNG (solid colour) and WAV (short tone), standing in for files installed by `npm run assets`. */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(rgb, y * (width * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function wav(): Buffer {
  const samples = 4410;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test('uses the official assets installed by npm run assets (portraits, artwork, sounds)', async ({ page }) => {
  const errors = collectErrors(page);
  const manifest = {
    version: 1,
    files: { 'portraits/gernot': 'portraits/gernot.png', 'portraits/likuku': 'portraits/likuku.png', 'artwork/library_hero': 'artwork/library_hero.png', 'emblems/dark_legion': 'emblems/dark_legion.png' },
    sounds: { clash: ['audio/clash/hit.wav'] },
    credits: { 'portraits/gernot': 'Kingdom Under Fire Wiki — Gernot', 'artwork/library_hero': 'Steam — KUF' },
  };
  await page.route('**/assets/manifest.json', (route) => route.fulfill({ json: manifest }));
  await page.route('**/assets/**/*.png', (route) => route.fulfill({ body: png(8, 8, [180, 40, 30]), contentType: 'image/png' }));
  await page.route('**/assets/**/*.wav', (route) => route.fulfill({ body: wav(), contentType: 'audio/wav' }));
  await page.goto('/');
  await expect(page.locator('.commander img[alt="Gernot"]')).toHaveAttribute('src', 'assets/portraits/gernot.png');
  await expect(page.locator('.commander img[alt="Likuku"]')).toBeVisible();
  // Characters without an installed portrait keep their heraldic crest.
  await expect(page.locator('.commander .crest')).toHaveCount(2);
  await expect(page.locator('.briefing-credits')).toContainText('Kingdom Under Fire Wiki');
  await expect(page.locator('.army-counts img.emblem')).toHaveCount(1);
  expect(await game(page, 'g.audio.available')).toBe(true);
  await page.getByRole('button', { name: 'Commencer la bataille' }).click();
  // The first click unlocked the audio: a battle hit plays the installed sound without error.
  await page.waitForTimeout(1500);
  await game(page, "g.audio.play('clash', 1)");
  expect(errors).toEqual([]);
});
