import { test, expect } from '@playwright/test';
test('Still water belongs to Sbu and can be checked out without alcohol confirmation', async ({
  page,
}) => {
  await page.goto('/menu/russian');
  await page.getByRole('button', { name: /Add to Order/ }).click();
  await page.goto('/tavern');
  const water = page.locator('.catalogue-row').filter({ hasText: 'Valpré Still Water 500ml' });
  await expect(water.locator('.price')).toHaveText('R14');
  await expect(water).not.toContainText('18+');
  await water.getByRole('button', { name: 'Add Valpré Still Water 500ml' }).click();
  await page.goto('/checkout/payment');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('.till-split').filter({ hasText: 'From Sbu' })).toContainText('R14');
  await page.getByRole('button', { name: 'Pay R74', exact: true }).click();
  await expect(page).toHaveURL(/1049\/confirmed/);
  await page.goto('/tavern-owner/packing');
  await expect(page.getByTestId('tavern-1049')).toContainText('Valpré Still Water 500ml');
  await expect(page.getByTestId('tavern-1049')).not.toContainText('Russian Special');
  await page.reload();
  await expect(page.getByTestId('tavern-1049')).toContainText('R14');
});
