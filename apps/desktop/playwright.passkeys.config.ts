import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'passkeys.spec.ts',
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: process.env.PASSKEY_BROWSER_ARTIFACTS,
  use: { channel: 'chrome', headless: true, ignoreHTTPSErrors: true },
});
