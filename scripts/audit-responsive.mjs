import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
await mkdir('test-results', { recursive: true });
try {
  for (const [width, height] of [
    [768, 1024],
    [1440, 900],
  ]) {
    const p = await browser.newPage({ viewport: { width, height } });
    p.on('pageerror', (e) => errors.push(e.message));
    for (const route of ['/', '/menu', '/spaza', '/tavern', '/roles']) {
      await p.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.locator('h1').first().waitFor();
      expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    console.log(width + 'px tablet/desktop routes PASS');
    await p.screenshot({ path: 'test-results/audit-' + width + '.png', fullPage: true });
    await p.close();
  }
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => errors.push(e.message));
  const go = async (route) => {
    await p.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.locator('h1').first().waitFor();
    expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  };
  const login = async (role, pin) => {
    await go('/roles');
    await p.getByLabel('Demo PIN', { exact: true }).fill(pin);
    await p.getByRole('button', { name: new RegExp('^' + role) }).click();
  };
  await go('/stall/mamelodi-kota');
  await expect(p.locator('.product-card')).toHaveCount(6);
  await go('/menu/russian');
  await p.getByRole('switch', { name: /Extra egg/ }).check();
  await p.getByRole('button', { name: /Add to Order/ }).click();
  await p.getByRole('button', { name: 'Add Clover Full Cream Milk 1L', exact: true }).click();
  await go('/tavern');
  await p
    .getByRole('button', { name: 'Add Coca-Cola Original Taste Less Sugar 2L', exact: true })
    .click();
  await go('/cart');
  await expect(p.locator('.grand-total')).toContainText('R121,98');
  await go('/checkout/delivery');
  await expect(p.getByLabel('Gate note')).toHaveValue(/Gate 3/);
  await p.getByRole('button', { name: 'Continue to payment' }).click();
  await p.getByRole('button', { name: 'Pay R121,98', exact: true }).click();
  await expect(p).toHaveURL(/1049\/confirmed/);
  console.log('390px mixed checkout R121.98 PASS');
  await login('Kota owner', '1111');
  const kitchen = p.getByTestId('kitchen-1049');
  await expect(kitchen).not.toContainText('Coca-Cola');
  await expect(kitchen).not.toContainText('Clover');
  await kitchen.getByRole('button', { name: 'Start order' }).click();
  await kitchen.getByRole('button', { name: 'Mark Ready' }).click();
  for (const [role, pin, till] of [
    ['Spaza owner', '3333', 'spaza'],
    ['Tavern owner', '4444', 'tavern'],
  ]) {
    await login(role, pin);
    await p
      .getByTestId(till + '-1049')
      .getByRole('button', { name: 'Mark packed' })
      .click();
  }
  await login('Rider', '5555');
  const job = p.getByTestId('rider-1049');
  for (const name of [
    'Accept',
    'Collect from stall',
    'Collect from spaza',
    'Collect from Sbu’s',
    'Mark delivered',
  ])
    await job.getByRole('button', { name, exact: true }).click();
  for (const [role, pin, url, net] of [
    ['Kota owner', '1111', '/owner/dashboard', 'R65'],
    ['Spaza owner', '3333', '/spaza-owner/dashboard', 'R17,99'],
    ['Tavern owner', '4444', '/tavern-owner/dashboard', 'R23,99'],
  ]) {
    await login(role, pin);
    await go(url);
    await expect(p.getByTestId('settlement-1049')).toContainText(net);
  }
  await p.reload({ waitUntil: 'domcontentloaded' });
  await expect(p.getByTestId('settlement-1049')).toContainText('RELEASED');
  expect(errors).toEqual([]);
  console.log('390px mixed route, own settlements, refresh and runtime PASS');
} finally {
  await browser.close();
}
console.log('Final audit responsive/mixed QA PASS');
