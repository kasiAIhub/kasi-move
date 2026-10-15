import { test, expect, type Page } from '@playwright/test';
import type { AppState } from '../../src/types';

test.describe.serial('Ticket #1048 — seven transaction-engine proofs', () => {
  let page: Page;
  const errors: string[] = [];
  const go = async (path: string) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').first().waitFor();
  };
  const snapshot = async () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('kasi-kota:v1')!) as AppState);
  const dismiss = async () => {
    const button = page.getByRole('button', { name: 'Dismiss message' });
    if (await button.isVisible()) await button.click();
  };
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await go('/roles');
    await page.getByRole('button', { name: /^Customer/ }).click();
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('1 · exact R107 ticket and food-only kitchen', async () => {
    const state = await snapshot();
    const order = state.orders.find((order) => order.id === 1048)!;
    expect(order.address.distance).toBe(1.8);
    expect(order.lines.map((line) => [line.productId, line.basePrice, line.quantity])).toEqual([
      ['russian', 60, 1],
      ['milk', 22, 1],
      ['coke', 15, 1],
    ]);
    expect(order.lines[0].extras).toEqual([{ id: 'egg', name: 'Extra egg', price: 10 }]);
    await go('/orders/1048/confirmed');
    await expect(page.locator('.confirmation')).toContainText('R107');
    await expect(page.locator('.confirmation')).toContainText('Delivery FREE');
    await go('/kitchen');
    const ticket = page.getByTestId('kitchen-1048');
    await expect(ticket.locator('.food-line')).toHaveCount(1);
    await expect(ticket).toContainText('Russian Special');
    await expect(ticket).toContainText('Extra egg');
    await expect(ticket).not.toContainText('milk');
    await expect(ticket).not.toContainText('Coca-Cola');
  });
  test('2 · Spaza sees only milk', async () => {
    await go('/spaza-owner/packing');
    const ticket = page.getByTestId('spaza-1048');
    await expect(ticket.locator('.food-line')).toHaveCount(1);
    await expect(ticket).toContainText('Full cream milk 1L bottle');
    await expect(ticket).not.toContainText('Russian Special');
    await expect(ticket).not.toContainText('Extra egg');
    await expect(ticket).not.toContainText('Coca-Cola');
  });
  test('3 · Sbu’s place sees only Coke', async () => {
    await go('/tavern-owner/packing');
    const ticket = page.getByTestId('tavern-1048');
    await expect(ticket.locator('.food-line')).toHaveCount(1);
    await expect(ticket).toContainText('Coca-Cola 500ml');
    await expect(ticket).not.toContainText('Russian Special');
    await expect(ticket).not.toContainText('Extra egg');
    await expect(ticket).not.toContainText('milk');
  });
  test('4 · Rider gets one #1048 job, ordered stops and separate R8 earning', async () => {
    await go('/rider');
    const job = page.getByTestId('rider-1048');
    await expect(job).toHaveCount(1);
    await expect(job.locator('.stop-list strong')).toHaveText([
      'Kasi Kota stall',
      'Mamelodi Corner Spaza',
      'Sbu’s place',
      'Your gate',
    ]);
    await expect(job).toContainText('Community run · pooled earnings');
    await expect(job).toContainText('R8');
    await expect(job.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled();
  });
  test('5 · Unready merchants block collection and departure in the actual UI/store', async () => {
    await go('/kitchen');
    await page.getByTestId('kitchen-1048').getByRole('button', { name: 'Start order' }).click();
    await page.getByTestId('kitchen-1048').getByRole('button', { name: 'Mark Ready' }).click();
    await go('/rider');
    const job = page.getByTestId('rider-1048');
    await job.getByRole('button', { name: 'Accept', exact: true }).click();
    await job.getByRole('button', { name: 'Collect from stall', exact: true }).click();
    await expect(
      job.getByRole('button', { name: 'Collect from spaza', exact: true }),
    ).toBeDisabled();
    expect((await snapshot()).orders.find((o) => o.id === 1048)!.status).toBe('collecting_spaza');
    await go('/spaza-owner/packing');
    await page.getByTestId('spaza-1048').getByRole('button', { name: 'Mark packed' }).click();
    await dismiss();
    await go('/rider');
    await job.getByRole('button', { name: 'Collect from spaza', exact: true }).click();
    await expect(
      job.getByRole('button', { name: 'Collect from Sbu’s', exact: true }),
    ).toBeDisabled();
    expect((await snapshot()).orders.find((o) => o.id === 1048)!.status).toBe('collecting_tavern');
    await go('/tavern-owner/packing');
    await page.getByTestId('tavern-1048').getByRole('button', { name: 'Mark packed' }).click();
    await dismiss();
    await go('/rider');
    await job.getByRole('button', { name: 'Collect from Sbu’s', exact: true }).click();
    const order = (await snapshot()).orders.find((o) => o.id === 1048)!;
    expect(order.status).toBe('out_for_delivery');
    expect([order.kitchen, order.spaza, order.tavern]).toEqual(['ready', 'ready', 'ready']);
    expect(order.collected).toEqual(['stall', 'spaza', 'tavern']);
  });
  test('6 · Browser refresh preserves the complete active order', async () => {
    const before = (await snapshot()).orders.find((o) => o.id === 1048);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByTestId('rider-1048').getByRole('button', { name: 'Mark delivered' }),
    ).toBeEnabled();
    expect((await snapshot()).orders.find((o) => o.id === 1048)).toEqual(before);
    await go('/orders/1048/confirmed');
    await expect(page.locator('.confirmation')).toContainText('R107');
  });
  test('7 · Each dashboard records its own portion against shared ticket #1048', async ({}, testInfo) => {
    for (const [path, amount] of [
      ['/owner/dashboard', 'R70'],
      ['/spaza-owner/dashboard', 'R22'],
      ['/tavern-owner/dashboard', 'R15'],
    ]) {
      await go(path);
      const row = page.getByTestId('till-1048');
      await expect(row).toHaveCount(1);
      await expect(row.locator('strong')).toHaveText(amount);
      await expect(row).toContainText('paid on shared ticket #1048');
      await expect(row).not.toContainText('R107');
    }
    const order = (await snapshot()).orders.find((o) => o.id === 1048)!;
    await testInfo.attach('verified-ticket-1048', {
      body: JSON.stringify(order, null, 2),
      contentType: 'application/json',
    });
    expect(errors).toEqual([]);
  });
});
