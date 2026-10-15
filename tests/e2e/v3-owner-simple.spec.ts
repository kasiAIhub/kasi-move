import { test, expect } from '@playwright/test';
test('one-thumb owner entry, own till, kitchen and optional settings', async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/roles');
  await expect(page.getByLabel('Demo PIN', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'I sell kota', exact: true }).click();
  await expect(page).toHaveURL(/owner\/start/);
  await page.getByLabel('Stall name').fill('Thumb Kota');
  await page.getByRole('button', { name: 'Open my stall', exact: true }).click();
  await expect(page).toHaveURL(/kitchen/);
  await expect(page.getByRole('heading', { name: 'Thumb Kota' })).toBeVisible();
  await expect(page.locator('.owner-overview')).toContainText('Today · mine');
  await expect(page.locator('.bottom-nav a')).toHaveText(['Orders', 'Menu', 'Money', 'More']);
  await expect(page.getByRole('link', { name: 'Share my stall on WhatsApp' })).toHaveAttribute(
    'href',
    /wa.me/,
  );
  await page.getByRole('switch').click();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch').click();
  await page.screenshot({ path: 'test-results/owner-simple-390.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.goto('/owner/more');
  await expect(page.getByText('My neighbours · optional', { exact: true })).toBeVisible();
  await expect(page.locator('.builder-card')).toBeVisible();
  await expect(page.getByText('Overdue invoices', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
