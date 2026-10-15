import { test, expect } from '@playwright/test';

test('Back and Forward preserve the ticket across customer screens', async ({ page }) => {
  await page.goto('/menu');
  await page.getByRole('link', { name: 'Add Russian Special', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Page navigation' })
    .getByRole('button', { name: 'Back', exact: true })
    .click();
  await expect(page).toHaveURL(/\/menu$/);
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  await expect(page).toHaveURL(/\/menu\/russian$/);
  await page.getByRole('button', { name: /Add to Order/ }).click();
  await expect(page).toHaveURL(/\/spaza$/);
  await page
    .getByRole('navigation', { name: 'Page navigation' })
    .getByRole('button', { name: 'Back', exact: true })
    .click();
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  await expect(page).toHaveURL(/\/spaza$/);
});

test('Every role screen has navigation; all catalogue photographs load at phone width', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const route of [
    '/',
    '/menu',
    '/menu/russian',
    '/spaza',
    '/tavern',
    '/cart',
    '/checkout/delivery',
    '/checkout/payment',
    '/orders/1048/confirmed',
    '/orders/1048/track',
    '/account',
    '/orders',
    '/kitchen',
    '/owner/menu',
    '/owner/dashboard',
    '/owner/orders/1048',
    '/owner/orders',
    '/owner/more',
    '/spaza-owner/packing',
    '/spaza-owner/catalogue',
    '/spaza-owner/dashboard',
    '/spaza-owner/more',
    '/tavern-owner/packing',
    '/tavern-owner/catalogue',
    '/tavern-owner/dashboard',
    '/tavern-owner/more',
    '/rider',
    '/rider/jobs/1048',
    '/rider/earnings',
    '/rider/profile',
    '/roles',
    '/tour',
  ]) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: 'Page navigation' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      route,
    ).toBe(true);
    if (['/menu', '/spaza', '/tavern'].includes(route)) {
      await page.locator('img').evaluateAll((imgs) =>
        Promise.all(
          imgs.map((img) => {
            (img as HTMLImageElement).loading = 'eager';
            return (img as HTMLImageElement).decode();
          }),
        ),
      );
      await page.screenshot({
        path: `test-results/catalogue-${route.slice(1)}.png`,
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
});
