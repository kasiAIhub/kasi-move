import { test, expect, type Page } from '@playwright/test';
test.describe.serial('Nine locked acceptance criteria', () => {
  let page: Page;
  const errors: string[] = [];
  const go = async (path: string) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').first().waitFor();
  };
  const role = async (name: string) => {
    await go('/roles');
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  };
  const dismiss = async () => {
    const button = page.getByRole('button', { name: 'Dismiss message' });
    if (await button.isVisible()) await button.click();
  };
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterAll(async () => {
    await page.close();
  });
  test('1 · phone browser opens without login and offers five roles', async () => {
    await go('/');
    await expect(page.getByRole('heading', { name: /Real Kota/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.getByRole('link', { name: 'Switch role', exact: true }).last().click();
    for (const name of ['Customer', 'Kota owner', 'Spaza owner', 'Tavern owner', 'Rider'])
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
    await page.getByRole('button', { name: /^Customer/ }).click();
  });
  test('2 · Russian Special + egg + milk + Savanna checks out at R141,99', async () => {
    await go('/menu');
    await expect(page.locator('.product-card')).toHaveCount(6);
    await page.getByRole('link', { name: 'Add Russian Special', exact: true }).click();
    await page.getByRole('switch', { name: 'Extra egg' }).check();
    await expect(page.getByRole('button', { name: /Add to Order/ })).toContainText('R70');
    await page.getByRole('button', { name: /Add to Order/ }).click();
    await dismiss();
    await page.getByRole('button', { name: 'Add Clover Full Cream Milk 1L', exact: true }).click();
    await dismiss();
    await page.getByRole('link', { name: 'Next: a drink from Sbu’s' }).click();
    await page.getByRole('button', { name: 'Add Savanna Dry 330ml', exact: true }).click();
    await dismiss();
    await page.getByRole('link', { name: 'View your ticket', exact: true }).first().click();
    await expect(page.locator('.grand-total')).toContainText('R141,99');
    await page.getByRole('link', { name: 'Checkout', exact: true }).click();
    await expect(page.getByLabel('Street address')).toHaveValue('1142 Mamelodi West');
    await expect(page.getByLabel('Gate note')).toHaveValue('Gate 3. Call when you arrive.');
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Pay R141,99' }).click();
    await expect(page).toHaveURL(/1049\/confirmed/);
    await expect(page.getByRole('heading', { name: 'Order Confirmed' })).toBeVisible();
    await expect(page.locator('.confirmation')).toContainText('R141,99');
    await expect(page.locator('.confirmation')).toContainText('Delivery FREE');
  });
  test('3 · Kota kitchen sees only food, and marks it ready', async () => {
    await role('Rider');
    await expect(
      page.getByTestId('rider-1049').getByRole('button', { name: 'Accept', exact: true }),
    ).toBeDisabled();
    await role('Kota owner');
    const ticket = page.getByTestId('kitchen-1049');
    await expect(ticket).toContainText('Russian Special');
    await expect(ticket).toContainText('Extra egg');
    await expect(ticket).not.toContainText('milk');
    await expect(ticket).not.toContainText('Savanna');
    await ticket.getByRole('button', { name: 'Start order' }).click();
    await ticket.getByRole('button', { name: 'Mark Ready' }).click();
    await expect(ticket).toContainText('Waiting for rider');
  });
  test('4 · Spaza sees and packs only its milk', async () => {
    await role('Spaza owner');
    const ticket = page.getByTestId('spaza-1049');
    await expect(ticket).toContainText('Clover Full Cream Milk');
    await expect(ticket).not.toContainText('Russian Special');
    await expect(ticket).not.toContainText('Savanna');
    await ticket.getByRole('button', { name: 'Mark packed' }).click();
    await expect(ticket.getByRole('button', { name: 'Packed for collection' })).toBeDisabled();
    await dismiss();
    await expect(page.getByTestId('spaza-1045')).toHaveCount(0);
  });
  test('5 · Tavern sees and packs only its Savanna', async () => {
    await role('Tavern owner');
    const ticket = page.getByTestId('tavern-1049');
    await expect(ticket).toContainText('Savanna');
    await expect(ticket).not.toContainText('milk');
    await expect(ticket).not.toContainText('Russian Special');
    await ticket.getByRole('button', { name: 'Mark packed' }).click();
    await expect(ticket.getByRole('button', { name: 'Packed for collection' })).toBeDisabled();
    await dismiss();
  });
  test('6 · Rider completes stall → spaza → Sbu’s → gate', async () => {
    await role('Rider');
    const job = page.getByTestId('rider-1049');
    await expect(job).toContainText('R8');
    await job.getByRole('button', { name: 'Accept', exact: true }).click();
    for (const name of [
      'Collect from stall',
      'Collect from spaza',
      'Collect from Sbu’s',
      'Mark delivered',
    ])
      await job.getByRole('button', { name, exact: true }).click();
    await expect(job).toHaveCount(0);
    await go('/orders/1049/track');
    await expect(page.getByRole('heading', { name: 'Delivered. Enjoy your Kota.' })).toBeVisible();
    await go('/rider/earnings');
    await expect(page.locator('.stats-grid')).toContainText('R253');
  });
  test('7 · Owner dashboards show only their own ticket money', async () => {
    for (const [path, amount] of [
      ['/owner/dashboard', 'R70'],
      ['/spaza-owner/dashboard', 'R22,99'],
      ['/tavern-owner/dashboard', 'R49'],
    ]) {
      await go(path);
      const row = page.getByTestId('till-1049');
      await expect(row).toContainText(amount);
      await expect(row).not.toContainText('R141,99');
      await expect(row).toContainText('paid on shared ticket #1049');
    }
  });
  test('8 · Refresh preserves the active demo order', async () => {
    await go('/kitchen');
    await page.getByTestId('kitchen-1048').getByRole('button', { name: 'Start order' }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('kitchen-1048')).toContainText('Preparing');
    await go('/orders/1049/track');
    await expect(page.getByRole('heading', { name: 'Delivered. Enjoy your Kota.' })).toBeVisible();
  });
  test('9 · /tour walks all eleven steps with a pointer and preserves saved tickets', async () => {
    const before = await page.evaluate(() => localStorage.getItem('kasi-kota:v1'));
    await page.clock.install();
    await go('/tour');
    for (let step = 1; step <= 11; step++) {
      await expect(page.getByTestId('tour-step')).toHaveText(`${step} / 11`);
      await expect(page.getByTestId('tour-pointer')).toBeVisible();
      await page.clock.runFor(6000);
    }
    await expect(page.locator('.tour-caption')).toContainText('Tour complete');
    await page.getByRole('link', { name: 'Exit', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('kasi-kota:v1'))).toBe(before);
    expect(errors).toEqual([]);
  });
});
