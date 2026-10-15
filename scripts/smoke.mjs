import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await mkdir('test-results', { recursive: true });
for (const route of process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      '/',
      '/menu',
      '/menu/russian',
      '/spaza',
      '/tavern',
      '/cart',
      '/account',
      '/orders/1048/track',
    ]) {
  await page.goto(`http://localhost:5173${route}`, {
    timeout: 120000,
    waitUntil: 'domcontentloaded',
  });
  await page.locator('h1').first().waitFor();
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    images: [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src),
  }));
  if (layout.scroll > layout.width) errors.push(`${route}: horizontal overflow ${layout.scroll}`);
  await page.screenshot({
    path: `test-results/smoke-${route.replaceAll('/', '-') || 'home'}.png`,
    fullPage: true,
  });
  console.log(`${route}: ${await page.locator('h1').first().textContent()} · ${layout.scroll}px`);
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Runtime smoke passed; no console or page errors.');
