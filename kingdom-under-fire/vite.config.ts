import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the build works from any sub-folder (GitHub Pages, itch.io...).
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts', 'tests/node/**/*.test.ts'] } },
      // CPU benchmarks of the simulation (npm run bench): slow, printed tables, never part of `npm test`.
      { extends: true, test: { name: 'bench', include: ['tests/bench/**/*.test.ts'], testTimeout: 600_000 } },
    ],
  },
});
