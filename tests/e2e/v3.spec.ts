import { test, expect, type Page } from '@playwright/test';
import { seedState, makeLine, makeOrder } from '../../src/data/seed';
import { products } from '../../src/data/catalogue';
import { createNetwork } from '../../src/store/v3/access';
import { transition } from '../../src/store/machine';
async function login(page: Page, role: string, pin: string, code = 'A') {
  await page.goto('/roles');
  await page.locator('.demo-access > summary').click();
  await page.getByLabel('Stall code').selectOption(code);
  await page.getByLabel('Demo PIN', { exact: true }).fill(pin);
  await page.getByRole('button', { name: new RegExp(`^${role}`) }).click();
}
const mobile = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

test('V3 customer, settlements, private roles and rider fulfilment stay connected', async ({
  page,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/stall/mamelodi-kota');
  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.locator('.product-card')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/v3-menu.png', fullPage: true });
  await expect(page.locator('.product-artwork image').first()).toHaveAttribute(
    'href',
    '/images/kota-approved-menu.png',
  );
  await page.getByRole('link', { name: 'Add Russian Special', exact: true }).click();
  await page.getByRole('button', { name: /Add to Order/ }).click();
  await page.goto('/checkout/delivery');
  await page.getByLabel('Distance from stall (demo)').fill('9');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page.getByRole('button', { name: 'Pay R60', exact: true })).toBeEnabled();
  await expect(page.locator('main')).not.toContainText('R15');
  await page.getByRole('button', { name: 'Pay R60', exact: true }).click();
  await expect(page).toHaveURL(/1\/confirmed/);
  await mobile(page);
  await login(page, 'Kota owner', '1111');
  await page.getByTestId('kitchen-1').getByRole('button', { name: 'Paid. Make it.' }).click();
  await page.getByTestId('kitchen-1').getByRole('button', { name: 'Ready for rider' }).click();
  await page.goto('/owner/orders/1');
  await expect(page.locator('main')).toContainText('Customer phone ending 4567');
  await expect(page.locator('main')).not.toContainText('071 123 4567');
  await page.goto('/owner/dashboard');
  await page.getByText('Money by order', { exact: true }).click();
  await expect(page.getByTestId('settlement-1')).toContainText('R15');
  await expect(page.getByTestId('settlement-1')).toContainText('R45');
  await mobile(page);
  await page.screenshot({ path: 'test-results/v3-owner.png', fullPage: true });
  await login(page, 'Rider', '5555');
  await page.getByTestId('rider-1').getByRole('button', { name: 'Accept', exact: true }).click();
  await page.getByTestId('rider-1').getByRole('button', { name: 'Collect from stall' }).click();
  await page.getByTestId('rider-1').getByRole('button', { name: 'Mark delivered' }).click();
  await page.goto('/rider/earnings');
  await expect(page.locator('.stats-grid')).toContainText('R10');
  await expect(page.locator('main')).not.toContainText('R45');
  await page.goto('/owner/dashboard');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await login(page, 'Kota owner', '1111');
  await page.goto('/owner/dashboard');
  await page.getByText('Money by order', { exact: true }).click();
  await page
    .getByTestId('settlement-1')
    .getByRole('button', { name: 'Withdraw own balance · demo' })
    .click();
  await page.reload();
  await expect(
    page.getByTestId('settlement-1').getByRole('button', { name: 'Withdrawn' }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test('V3 R40 Kota minimum cannot be padded with groceries; collection remains available', async ({
  page,
}) => {
  await page.goto('/menu/classic');
  await page.getByRole('button', { name: /Add to Order/ }).click();
  await page.getByRole('button', { name: 'Add Clover Full Cream Milk 1L', exact: true }).click();
  await page.goto('/checkout/delivery');
  await expect(page.getByRole('button', { name: 'Delivery', exact: true })).toBeDisabled();
  await expect(
    page.getByText('Collect at the stall, or add more to reach R40.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Collection', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('button', { name: 'Pay R57,99', exact: true }).click();
  await expect(page).toHaveURL(/1\/confirmed/);
});

test('V3 licensed demo alcohol is visible and needs ephemeral 18+ confirmation', async ({
  page,
}) => {
  await page.goto('/tavern');
  await expect(page.getByRole('button', { name: 'Add Savanna Dry 500ml' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add Valpré Still Water 500ml' })).toBeVisible();
  await login(page, 'Tavern owner', '4444');
  await page.goto('/tavern-owner/more');
  await page.getByRole('switch').check();
  await login(page, 'Customer', '');
  await page.goto('/tavern');
  await page.getByRole('button', { name: 'Add Savanna Dry 500ml', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Alcohol requires');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Add Savanna Dry 500ml', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('kasi-kota:v1'))).not.toContain(
    '9001015009087',
  );
  await page.goto('/menu/russian');
  await page.getByRole('button', { name: /Add to Order/ }).click();
  await page.goto('/checkout/payment');
  await expect(page.getByRole('button', { name: 'Pay R90', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Pay R90', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pay R90', exact: true })).toBeDisabled();
  await mobile(page);
});

test('V3 vendor QR, own menu editing and role-protected routes', async ({ page }) => {
  test.setTimeout(300000);
  await login(page, 'Kota owner', '2222', 'B');
  await page.goto('/owner/menu');
  const item = page.locator('.catalogue-toggle').filter({ hasText: 'Russian Special' });
  await item.getByLabel('Price (R)', { exact: true }).fill('65');
  await item.getByRole('button', { name: 'Save item' }).click();
  await page.goto('/owner/more');
  await expect(page.getByRole('img', { name: 'QR for Meadowlands Kota' })).toBeVisible();
  await mobile(page);
  await page.goto('/stall/meadowlands-kota');
  await expect(page.locator('.product-card').filter({ hasText: 'Russian Special' })).toContainText(
    'R65',
  );
  await page.goto('/stall/mamelodi-kota');
  await expect(page.locator('.product-card').filter({ hasText: 'Russian Special' })).toContainText(
    'R60',
  );
  await login(page, 'Spaza owner', '3333');
  for (const path of ['/owner/menu', '/rider/earnings', '/tavern-owner/catalogue']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  }
  await login(page, 'Tavern owner', '4444');
  for (const path of ['/owner/menu', '/spaza-owner/catalogue']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  }
});

test('V3 frozen shop shows overdue invoices and cannot operate', async ({ page }) => {
  const state = seedState();
  state.trialRevision = 20260907;
  state.network = createNetwork(products);
  const m = state.network.merchants.find((m) => m.id === 'A-spaza')!;
  m.subscriptionStatus = 'frozen';
  m.joinedAt = '2026-01-01T00:00:00Z';
  m.invoices = [1, 2].map((i) => ({
    id: `missed-${i}`,
    dueAt: `2026-0${i}-01T00:00:00Z`,
    amount: 15000,
    subAccount: m.subAccount,
    status: 'missed' as const,
  }));
  await page.addInitScript(
    (state) => localStorage.setItem('kasi-kota:v1', JSON.stringify(state)),
    state,
  );
  await login(page, 'Spaza owner', '3333');
  await expect(page.getByRole('heading', { name: 'Merchant account overdue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark packed' })).toHaveCount(0);
  await expect(page.locator('main')).toContainText('PF-DEMO-A-SPAZA');
  await expect(page.locator('main')).not.toContainText('PF-DEMO-A-STALL');
  await mobile(page);
});

test('V3 tour still completes eleven steps and restores the saved session', async ({ page }) => {
  await page.goto('/');
  await page.goto('/roles');
  await page.locator('.demo-access > summary').click();
  await page.getByRole('button', { name: /^Customer/ }).click();
  const before = await page.evaluate(() => localStorage.getItem('kasi-kota:v1'));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto('/tour');
  for (let i = 1; i <= 11; i++) {
    await expect(page.getByTestId('tour-step')).toHaveText(`${i} / 11`);
    await page.clock.runFor(6100);
  }
  await page.getByRole('link', { name: 'Exit', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('kasi-kota:v1'))).toBe(before);
  expect(errors).toEqual([]);
});

test('V3 PWA manifest, installability and offline vendor deep link', async ({ page, context }) => {
  test.skip(process.env.PW_PRODUCTION !== '1', 'Service worker runs in production builds.');
  await page.goto('/stall/mamelodi-kota');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.goto('/owner/menu');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await page.goto('/stall/mamelodi-kota');
  await expect(page.locator('.product-card')).toHaveCount(6);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('KASI KOTA');
  expect(manifest.icons).toHaveLength(2);
  const client = await context.newCDPSession(page);
  const install = await client.send('Page.getInstallabilityErrors'); // Playwright contexts are private windows; ignore only that browser restriction.
  expect(
    install.installabilityErrors.filter((e: { errorId: string }) => e.errorId !== 'in-incognito'),
  ).toEqual([]);
  await context.setOffline(true);
  await page.goto('/stall/mamelodi-kota');
  await expect(page.locator('.product-card')).toHaveCount(6);
  await mobile(page);
  await context.setOffline(false);
});
