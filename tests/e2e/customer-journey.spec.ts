import { seedCurrentTicket } from './current-ticket';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

test.describe.serial('C1–C11 customer journey at 390px', () => {
  let page: Page;
  let context: BrowserContext;
  const errors: string[] = [];
  const dismiss = async () => {
    const button = page.getByRole('button', { name: 'Dismiss message' });
    if (await button.isVisible()) await button.click();
  };
  const mobile = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(page.getByText('Kasi flavour. Kota power.', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  };
  test.beforeAll(async ({ browser, baseURL }) => {
    context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });
  test.afterAll(async () => {
    await context.close();
  });

  test('C1 · Home offers the street, nearby stall and active ticket', async () => {
    await expect(page.getByRole('heading', { name: /Real Kota/ })).toBeVisible();
    await expect(
      page.getByText('Kota, plus milk from the spaza, plus a drink from Sbu’s, one rider.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kasi Kota · Mamelodi' })).toBeVisible();
    await expect(page.getByText('Track active order')).toBeVisible();
    await mobile();
    await page.getByRole('link', { name: 'Build your ticket' }).click();
  });
  test('C2 · Exactly six locked Kota products and prices', async () => {
    const cards = page.locator('.product-card');
    await expect(cards).toHaveCount(6);
    for (const [name, price] of [
      ['Kasi Classic', 'R35'],
      ['Cheese Boy', 'R45'],
      ['Russian Special', 'R60'],
      ['Breakfast Kota', 'R50'],
      ['The Beast', 'R75'],
      ['Chicken Kasi', 'R55'],
    ])
      await expect(
        cards.filter({ has: page.getByRole('heading', { name, exact: true }) }),
      ).toContainText(price);
    await mobile();
    await page.getByRole('link', { name: 'Add Russian Special', exact: true }).click();
  });
  test('C3 · Included ingredients, all extras, quantity and live total', async () => {
    await expect(page.locator('.included')).toContainText('Chips · Russian · Cheese · Sauce');
    await expect(page.getByRole('switch')).toHaveCount(8);
    await page.getByRole('switch', { name: 'Extra egg' }).check();
    await page.getByRole('switch', { name: 'Bacon' }).check();
    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(page.getByRole('button', { name: /Add to Order/ })).toContainText('R164');
    await page.getByRole('button', { name: 'Decrease quantity' }).click();
    await page.getByRole('switch', { name: 'Bacon' }).uncheck();
    await expect(page.getByRole('button', { name: /Add to Order/ })).toContainText('R70');
    await mobile();
    await page.getByRole('button', { name: /Add to Order/ }).click();
    await dismiss();
  });
  test('C4 · Branded small spaza packs add milk to the same ticket', async () => {
    await expect(page.locator('.catalogue-row')).toHaveCount(21);
    await page.getByRole('button', { name: 'Add Clover Full Cream Milk 1L', exact: true }).click();
    await dismiss();
    await expect(page.getByText('1 on your ticket')).toBeVisible();
    await mobile();
    await page.getByRole('link', { name: 'Next: a drink from Sbu’s' }).click();
  });
  test('C5 · Nine tavern products keep Sbu’s ownership clear', async () => {
    await expect(page.locator('.catalogue-row')).toHaveCount(9);
    await expect(page.getByText('Sbu’s place around the corner', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add Savanna Dry 330ml', exact: true }).click();
    await dismiss();
    await mobile();
    await page.getByRole('link', { name: 'View your ticket', exact: true }).first().click();
  });
  test('C6 · Grouped tills, editable quantities, R141,99 and FREE delivery survive refresh', async () => {
    await expect(page.locator('.line-group')).toHaveCount(3);
    const milk = page.locator('.order-line').filter({ hasText: 'Clover Full Cream Milk' });
    await milk.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(page.locator('.grand-total')).toContainText('R164,98');
    await milk.getByRole('button', { name: 'Decrease quantity' }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.grand-total')).toContainText('R141,99');
    await expect(page.locator('.price-summary')).toContainText('FREE');
    await mobile();
    await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  });
  test('C7 · Validation, saved draft, distance fee and collection toggle', async () => {
    await page.getByLabel('Mobile number').fill('071');
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page.getByRole('alert')).toContainText('valid South African mobile number');
    await page.getByLabel('Mobile number').fill('071 123 4567');
    await page.getByLabel('Gate note').fill('Gate 3. Please call Thabo.');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Gate note')).toHaveValue('Gate 3. Please call Thabo.');
    await page.getByRole('button', { name: 'Soweto sample' }).click();
    await expect(page.locator('[data-tour="distance"]')).toContainText('R15');
    await page.getByRole('button', { name: 'Collection', exact: true }).click();
    await expect(page.locator('[data-tour="distance"]')).toContainText('FREE');
    await page.getByRole('button', { name: 'Delivery', exact: true }).click();
    await page.getByRole('button', { name: 'Mamelodi sample' }).click();
    await expect(page.getByLabel('Gate note')).toHaveValue('Gate 3. Call when you arrive.');
    await expect(page.locator('[data-tour="distance"]')).toContainText('1.8 km');
    await mobile();
    await page.getByRole('button', { name: 'Continue to payment' }).click();
  });
  test('C8 · Three payment methods, per-till breakdown and one payment', async () => {
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.locator('.till-split strong')).toHaveText(['R70', 'R22,99', 'R49']);
    await page.getByRole('radio', { name: 'Instant EFT' }).check();
    await page.getByRole('radio', { name: 'Cash on delivery' }).check();
    await page.getByRole('radio', { name: 'Card', exact: true }).check();
    await mobile();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Pay R141,99' }).click();
    await expect(page).toHaveURL(/1049\/confirmed/);
  });
  test('C9 · Confirmed ticket, summary, progress and demo rider contact', async () => {
    await expect(page.getByRole('heading', { name: 'Order Confirmed' })).toBeVisible();
    await expect(page.locator('.confirmation')).toContainText('Ticket #1049');
    await expect(page.locator('.confirmation')).toContainText('R141,99');
    await expect(page.locator('.confirmation')).toContainText('Delivery FREE');
    await expect(page.locator('.progress li')).toHaveCount(4);
    await expect(page.locator('.line-group')).toHaveCount(3);
    await page.getByRole('button', { name: 'Contact Rider' }).click();
    await expect(page.locator('.toast')).toContainText('rider will be assigned');
    await dismiss();
    await mobile();
    await page.getByRole('link', { name: 'Track Live' }).click();
  });
  test('C10 · Live progress follows merchant updates and highlights the next stop', async () => {
    await expect(page.locator('.stop-list strong')).toHaveText([
      'Kasi Kota stall',
      'Mamelodi Corner Spaza',
      'Sbu’s place',
      'Your gate',
    ]);
    const merchant = await page.context().newPage();
    await merchant.goto('/kitchen', { waitUntil: 'domcontentloaded' });
    await merchant.getByTestId('kitchen-1049').getByRole('button', { name: 'Start order' }).click();
    await expect(page.locator('.progress [aria-current="step"]')).toContainText(
      'Kitchen Preparing',
    );
    await merchant.getByTestId('kitchen-1049').getByRole('button', { name: 'Mark Ready' }).click();
    await merchant.goto('/rider', { waitUntil: 'domcontentloaded' });
    await merchant
      .getByTestId('rider-1049')
      .getByRole('button', { name: 'Accept', exact: true })
      .click();
    await merchant
      .getByTestId('rider-1049')
      .getByRole('button', { name: 'Collect from stall' })
      .click();
    await expect(page.locator('.stop-list [aria-current="step"]')).toContainText(
      'Mamelodi Corner Spaza',
    );
    await expect(page.getByRole('status')).toContainText('Collecting from the spaza');
    await expect(page.locator('.route-map')).toHaveClass(/point-1/);
    await merchant.close();
    await mobile();
    await seedCurrentTicket(page);
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
  });
  test('C11 · Saved addresses, order history and faithful reorder', async () => {
    await expect(page.getByRole('heading', { name: 'Thabo Mokoena' })).toBeVisible();
    await expect(page.locator('.address-card')).toHaveCount(2);
    await page.locator('.address-card').filter({ hasText: '123 Makgatho St' }).click();
    await dismiss();
    await expect(
      page.locator('.address-card').filter({ hasText: '123 Makgatho St' }),
    ).toContainText('Selected');
    await page.locator('.address-card').filter({ hasText: '1142 Mamelodi West' }).click();
    await dismiss();
    await mobile();
    await page.getByRole('button', { name: 'Reorder', exact: true }).first().click();
    await expect(page.locator('.grand-total')).toContainText('R141,99');
    await expect(page.locator('.order-line')).toHaveCount(3);
    await expect(page.locator('.groups')).toContainText('Extra egg');
    await page.getByRole('link', { name: 'Checkout', exact: true }).click();
    await page.getByLabel('Gate note').fill('Gate 3. Please call twice.');
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await seedCurrentTicket(page);
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    await page.locator('.address-card').filter({ hasText: '123 Makgatho St' }).click();
    await dismiss();
    await page.locator('.address-card').filter({ hasText: '1142 Mamelodi West' }).click();
    await dismiss();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('.address-card').filter({ hasText: '1142 Mamelodi West' }),
    ).toContainText('Gate 3. Please call twice.');
    expect(errors).toEqual([]);
  });
});

test('C6/C8 · stock changes block stale-cart payment and offer a recovery path', async ({
  page,
}) => {
  await seedCurrentTicket(page);
  await page.goto('/account', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Reorder', exact: true }).first().click();
  await page.goto('/spaza-owner/catalogue', { waitUntil: 'domcontentloaded' });
  await page.getByRole('switch', { name: 'Clover Full Cream Milk 1L availability' }).uncheck();
  await page.goto('/cart', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('alert')).toContainText('Clover Full Cream Milk');
  await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toHaveCount(0);
  await page.goto('/checkout/payment', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Pay R141,99' })).toBeDisabled();
  await page.getByRole('link', { name: 'Update your ticket' }).click();
  await page
    .locator('.order-line')
    .filter({ hasText: 'Clover Full Cream Milk' })
    .getByRole('button', { name: 'Decrease quantity' })
    .click();
  await expect(page.locator('.grand-total')).toContainText('R119');
  await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toBeVisible();
});

test('C9/C10 · cancelled tickets never show a moving rider or ETA', async ({ page }) => {
  await page.goto('/owner/orders/1048', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Cancel unstarted ticket' }).click();
  await page.goto('/orders/1048/track', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Order cancelled' })).toBeVisible();
  await expect(page.locator('.route-map')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Contact Rider' })).toHaveCount(0);
  await expect(page.getByText('18 mins · demo', { exact: true })).toHaveCount(0);
});

test('C7–C10 · collection stays free beyond the radius and has no rider', async ({ page }) => {
  await seedCurrentTicket(page);
  await page.goto('/account', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Reorder', exact: true }).first().click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await page.getByRole('button', { name: 'Soweto sample' }).click();
  await page.getByRole('button', { name: 'Collection', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('radio', { name: 'Instant EFT' }).check();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Pay R141,99' }).click();
  await expect(page.locator('.confirmation')).toContainText('Collection FREE');
  await expect(page.getByRole('button', { name: 'Contact Rider' })).toHaveCount(0);
  await expect(page.locator('.stop-list strong')).toHaveText([
    'Kasi Kota stall',
    'Mamelodi Corner Spaza',
    'Sbu’s place',
  ]);
  await page.goto('/rider', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('rider-1049')).toHaveCount(0);
});
