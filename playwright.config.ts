import { defineConfig } from '@playwright/test';
const production = process.env.PW_PRODUCTION === '1';
const baseURL = production ? 'http://localhost:4173' : 'http://localhost:5173';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/v3*.spec.ts',
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.PW_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'),
    headless: true,
    viewport: { width: 390, height: 844 },
    trace: 'off',
    screenshot: 'only-on-failure',
    navigationTimeout: 120000,
  },
  webServer: {
    command: production ? 'npm run preview -- --port 4173' : 'npm run dev -- --port 5173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
