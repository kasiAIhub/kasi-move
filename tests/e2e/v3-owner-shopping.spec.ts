import { test, expect } from '@playwright/test';

test('owner support stays separate and shopping uses township prices without ID or success popups', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tavern');
  await expect(page.getByLabel('South African ID number')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'I confirm that I am 18 years and older.' }).check();
  await page.getByRole('button', { name: 'Add Savanna Dry 500ml', exact: true }).click();
  await page.getByRole('button', { name: 'Add Hunter’s Dry 660ml', exact: true }).click();
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.locator('.cart-float').getByText('View your order').click();
  await expect(page.locator('main')).toContainText('Savanna Dry 500ml');
  await expect(page.locator('main')).toContainText('Hunter’s Dry 660ml');
  await expect(page.locator('main')).toContainText('R60');
  await expect(page.locator('.builder-card')).toHaveCount(0);
  await page.goto('/spaza');
  await expect(page.getByText('Grand-Pa Headache Tablets 24-pack', { exact: true })).toHaveCount(0);
  await page.goto('/roles');
  await page.locator('.demo-access > summary').click();
  await page.getByLabel('Stall code').selectOption('A');
  await page.getByLabel('Demo PIN', { exact: true }).fill('1111');
  await page.getByRole('button', { name: /^Kota owner/ }).click();
  await page.goto('/owner/more');
  const card = page.locator('.builder-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Building business systems for kasi entrepreneurs.');
  await expect(card).toContainText('Thandi Dlamini');
  await expect(card.getByRole('link', { name: '081 890 5861' })).toHaveAttribute(
    'href',
    'tel:+27818905861',
  );
  await expect(card.getByRole('link', { name: 'Visit website' })).toHaveAttribute(
    'href',
    'https://kasiaihub.com',
  );
  const whatsapp = new URL(
    (await card.getByRole('link', { name: 'WhatsApp us' }).getAttribute('href'))!,
  );
  expect(whatsapp.pathname).toBe('/27818905861');
  expect(whatsapp.searchParams.get('text')).toBe('Hi Thandi, I’m contacting you from KASI KOTA.');
  await expect(card.locator('svg image')).toHaveAttribute(
    'href',
    '/images/kasiaihub-reference.png',
  );
  await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/owner-builder-390.png', fullPage: true });
  expect(errors).toEqual([]);
});
