import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'),
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle', timeout: 120000 });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'networkidle' });
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller)))
  throw new Error('No controlling service worker');
const manifest = await (
  await page.request.get('http://localhost:4173/manifest.webmanifest')
).json();
if (manifest.name !== 'KASI KOTA' || manifest.icons.length !== 2)
  throw new Error('Manifest mismatch');
for (const icon of manifest.icons) {
  if (!(await page.request.get(`http://localhost:4173${icon.src}`)).ok())
    throw new Error(`Missing icon ${icon.src}`);
}
await page.goto('http://localhost:4173/menu', { waitUntil: 'networkidle' });
if ((await page.locator('.product-card').count()) !== 6) throw new Error('Menu failed');
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Choose Your Kota' }).waitFor();
console.log('Production PWA: manifest, icons, service worker and offline menu reload passed.');
await context.setOffline(false);
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'test-results/desktop-home.png', fullPage: true });
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  throw new Error('Desktop overflow');
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log('Production desktop runtime check passed.');
