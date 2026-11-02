import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// CI runners share one VM (HDD-backed): fewer workers and longer timeouts so load does not fail tests.
const ci = Boolean(process.env.CI);

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
    coverage: { reporter: ['text', 'lcov'] },
    ...(ci && { maxWorkers: 2, testTimeout: 30_000, hookTimeout: 30_000 }),
  },
});
