import { seedCurrentTicket } from './current-ticket';
import { test, expect, type Page } from '@playwright/test';

async function mobile(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByText('Kasi flavour. Kota power.', { exact: true })).toBeVisible();
}

test('K1 · newest-first food tickets and Start → Ready → waiting for rider', async ({ page }) => {
  await page.goto('/kitchen', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.kitchen-ticket h2')).toHaveText(['#1048', '#1047', '#1046', '#1045']);
  for (const name of ['Sive', 'Luthando', 'Akhona'])
    await expect(page.locator('.ticket-customer').filter({ hasText: name })).toBeVisible();
  const ticket = page.getByTestId('kitchen-1048');
  await expect(ticket).toContainText('Thabo');
  await expect(ticket).toContainText('min since paid');
  await expect(ticket).toContainText('Russian Special');
  await expect(ticket).toContainText('Extra egg');
  await expect(ticket).not.toContainText('milk');
  await expect(ticket).not.toContainText('Savanna');
  await ticket.getByRole('button', { name: 'Start order' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(ticket).toContainText('Preparing');
  await ticket.getByRole('button', { name: 'Mark Ready' }).click();
  await expect(ticket).toContainText('Waiting for rider');
  await expect(ticket.getByRole('button')).toHaveCount(0);
  await mobile(page);
});

test('K2 · six Kota availability controls persist and update the customer menu', async ({
  page,
}) => {
  await page.goto('/owner/menu', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('switch')).toHaveCount(6);
  await expect(page.getByText('RUSSIAN STOCK LOW — 6 remaining', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Russian Special availability' }).uncheck();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('switch', { name: 'Russian Special availability' }),
  ).not.toBeChecked();
  await mobile(page);
  await page.goto('/menu', { waitUntil: 'domcontentloaded' });
  const russian = page
    .locator('.product-card')
    .filter({ has: page.getByRole('heading', { name: 'Russian Special', exact: true }) });
  await expect(russian).toContainText('Sold out');
  await expect(russian.getByRole('link', { name: 'Add Russian Special' })).toHaveCount(0);
  await page.goto('/owner/menu', { waitUntil: 'domcontentloaded' });
  await page.getByRole('switch', { name: 'Russian Special availability' }).check();
  await page.goto('/menu', { waitUntil: 'domcontentloaded' });
  await expect(russian.getByRole('link', { name: 'Add Russian Special' })).toBeVisible();
});

test('K3 · sample metrics, chart, top items and only R70 from a new R141,99 shared ticket', async ({
  page,
}) => {
  await seedCurrentTicket(page);
  await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('sales-total')).toHaveText(/^R4[\s,]820$/);
  await expect(page.getByTestId('orders-count')).toHaveText('68');
  await expect(page.getByTestId('average-order')).toHaveText('R71');
  await expect(page.locator('.chart .bar')).toHaveCount(7);
  for (const [name, value] of [
    ['Russian Special', '32%'],
    ['The Beast', '21%'],
    ['Cheese Boy', '18%'],
  ])
    await expect(page.locator('.top-item').filter({ hasText: name })).toContainText(value);
  await expect(page.getByText('RUSSIAN STOCK LOW — 6 remaining', { exact: true })).toBeVisible();
  await expect(page.getByTestId('till-1048')).toContainText('paid on shared ticket #1048');
  await expect(page.getByTestId('till-1048').locator('strong')).toHaveText('R70');
  await mobile(page);
  await seedCurrentTicket(page);
  await page.goto('/account', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Reorder', exact: true }).first().click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Pay R141,99' }).click();
  await expect(page).toHaveURL(/1049\/confirmed/);
  await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('sales-total')).toHaveText(/^R4[\s,]890$/);
  await expect(page.getByTestId('orders-count')).toHaveText('69');
  await expect(page.getByTestId('till-1049').locator('strong')).toHaveText('R70');
  await expect(page.locator('main')).not.toContainText('Clover Full Cream Milk');
  await expect(page.locator('main')).not.toContainText('Savanna');
});

test('K4 · food detail, customer, gate note and readable rider status', async ({ page }) => {
  await page.goto('/owner/orders/1048', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Ticket #1048' })).toBeVisible();
  await expect(page.locator('.line-group')).toHaveCount(1);
  await expect(page.locator('.groups')).toContainText('Russian Special');
  await expect(page.locator('.groups')).toContainText('Extra egg');
  await expect(page.locator('main')).not.toContainText('Clover Full Cream Milk');
  await expect(page.locator('main')).not.toContainText('Savanna');
  await expect(page.getByRole('heading', { name: 'Thabo Mokoena' })).toBeVisible();
  await expect(page.getByRole('link', { name: '071 123 4567' })).toHaveAttribute(
    'href',
    'tel:0711234567',
  );
  await expect(page.locator('.profile-details')).toContainText(
    '1142 Mamelodi West, Pretoria, 0122',
  );
  await expect(page.locator('.profile-details')).toContainText('Gate 3. Call when you arrive.');
  await expect(page.getByRole('status')).toContainText('Waiting for kitchen readiness');
  await expect(page.locator('.profile-details')).toContainText('Your till: R70');
  await mobile(page);
  await page.getByRole('link', { name: 'Back to kitchen' }).click();
  await page.getByTestId('kitchen-1048').getByRole('button', { name: 'Start order' }).click();
  await page.getByTestId('kitchen-1048').getByRole('button', { name: 'Mark Ready' }).click();
  await page.goto('/rider', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('rider-1048').getByRole('button', { name: 'Accept', exact: true }).click();
  await page.goto('/owner/orders/1048', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status')).toContainText('Heading to the stall');
  await expect(page.getByRole('button', { name: 'Cancel unstarted ticket' })).toHaveCount(0);
});
