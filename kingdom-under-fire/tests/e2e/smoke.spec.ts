import { expect, test } from '@playwright/test';

// Resource errors of third-party hosts (web fonts behind a proxy, offline machines) are not game errors.
const isExternalResourceError = (text: string) => /Failed to load resource|ERR_CERT|ERR_NAME|ERR_INTERNET/.test(text);

test('the battle scene boots, renders and logs no error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isExternalResourceError(m.text())) errors.push(m.text());
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as any).game?.frames ?? 0), { timeout: 60_000 }).toBeGreaterThan(3);
  const stats = await page.evaluate(() => (window as any).game.renderer.stats());
  expect(stats.calls).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
