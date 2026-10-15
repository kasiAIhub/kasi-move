import type { Page } from '@playwright/test';
import { currentDemoLines, makeOrder, seedState } from '../../src/data/seed';
export async function seedCurrentTicket(page: Page) {
  const state = seedState();
  state.orders[0] = makeOrder(1048, currentDemoLines());
  await page.addInitScript((state) => {
    if (!localStorage.getItem('kasi-kota:v1'))
      localStorage.setItem('kasi-kota:v1', JSON.stringify(state));
  }, state);
}
