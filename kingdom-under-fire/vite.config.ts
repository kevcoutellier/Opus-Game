import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the build works from any sub-folder (GitHub Pages, itch.io...).
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    benchmark: { include: ['tests/bench/**/*.bench.ts'] },
    environment: 'node',
  },
});
