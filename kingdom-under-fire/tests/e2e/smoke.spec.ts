import { expect, test, type Page } from '@playwright/test';

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

test('the battle scene boots, renders and logs no error', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect.poll(() => game(page, 'g?.frames ?? 0'), { timeout: 60_000 }).toBeGreaterThan(3);
  const stats = (await game(page, 'g.renderer.stats()')) as { calls: number; triangles: number };
  expect(stats.calls).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(1000);
  expect(await game(page, 'g.units.countActive(0) + g.units.countActive(1)')).toBe(40);
  expect(errors).toEqual([]);
});

test('the player selects the army with a drag, draws a front and the formation marches', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect.poll(() => game(page, 'g?.frames ?? 0'), { timeout: 60_000 }).toBeGreaterThan(3);
  await game(page, 'g.rtsCamera.focus(128, 172, 50, true)');
  await page.waitForTimeout(1000);
  // Screen bounding box of the 20 player units.
  const box = (await game(
    page,
    `(() => { const xs = [], ys = []; for (let id = 0; id < 20; id++) { const p = g.projector.project(g.world.c.x[id], 1, g.world.c.z[id]); xs.push(p.x); ys.push(p.y); } return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; })()`,
  )) as number[];
  await page.mouse.move(box[0] - 25, box[1] - 25);
  await page.mouse.down();
  await page.mouse.move(box[2] + 25, box[3] + 25, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => game(page, 'g.selection.size')).toBe(20);

  // Right-drag a front ahead of the army.
  const view = page.viewportSize()!;
  await page.mouse.move(view.width * 0.4, view.height * 0.3);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(view.width * 0.6, view.height * 0.3, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(() => game(page, 'g.formations.count')).toBe(1);
  const startZ = (await game(page, 'g.world.c.z[0]')) as number;
  await expect.poll(() => game(page, 'g.world.c.z[0]'), { timeout: 60_000 }).toBeLessThan(startZ - 3);
  expect(errors).toEqual([]);
});
