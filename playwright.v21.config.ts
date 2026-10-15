import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/v21*.spec.ts', workers: 1, timeout: 180000,
  expect: { timeout: 15000 }, reporter: [['list']],
  use: { baseURL: 'http://localhost:5181', browserName: 'chromium', channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true, viewport: { width: 390, height: 844 }, screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/serve-test-build.mjs', url: 'http://localhost:5181/api/health', timeout: 300000, reuseExistingServer: false,
    env: { KASI_DATA_DIR: 'test-results/v21-browser-data', ACTIVATION_ADMIN_KEY: 'browser-test-admin-key-never-used-in-production', SUPPORT_WHATSAPP: '+27820000000', ALLOW_ALCOHOL_TESTING: 'true' } },
});
