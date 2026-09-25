import { defineConfig } from '@playwright/test';

// Browser smoke tests. The pre-installed Chromium is used when present (cloud sessions), otherwise the one
// installed by `npx playwright install chromium`.
const executablePath = process.env.PW_CHROMIUM ?? (process.env.CI ? undefined : '/opt/pw-browsers/chromium');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      executablePath: executablePath && (await import('node:fs')).existsSync(executablePath) ? executablePath : undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
