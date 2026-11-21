import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', testMatch: 'localization.spec.ts', workers: 1, retries: 0,
  outputDir: './output/playwright/localization-results', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:39764', headless: true, viewport: { width: 940, height: 600 }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/localization-server.mjs', url: 'http://127.0.0.1:39764/tests/fixtures/localization/', timeout: 60_000, reuseExistingServer: false },
});
