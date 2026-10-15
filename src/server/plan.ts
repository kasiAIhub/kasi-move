import type { StallRow } from './database';
import type { StallSettings } from './settings';
export const ONBOARDING_CENTS = 30000;
export const MONTHLY_CENTS = 15000;
export const LAUNCH_PRICE = 'Launch price: R300 once-off setup - includes your first month.';
export const MONTHLY_PRICE = 'Then R150 per month.';
export const SETUP_PAYMENT_URL = 'https://paystack.shop/pay/kasi-move-setup';
export const SETUP_PAYMENT_LABEL = 'Pay R300 - Open my stall';
export function nextMonth(time: number) {
  const date = new Date(time), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last)); return date.getTime();
}
export function stallPlan(stall: StallRow, now: number) {
  const settings: StallSettings = JSON.parse(stall.settings);
  const paidThrough = settings.billing?.paidThrough ?? (stall.activated_at === null ? null : nextMonth(stall.activated_at));
  const active = Boolean(paidThrough && now < paidThrough);
  return { paidThrough, onboardingCents: ONBOARDING_CENTS, monthlyCents: MONTHLY_CENTS,
    amountDueCents: stall.activated_at === null ? ONBOARDING_CENTS : active ? 0 : MONTHLY_CENTS,
    active, payments: settings.billing?.payments ?? [] };
}

export const PHOTO_GATE_MESSAGE = "You can't launch the stall without photos. Your food photos are still outstanding.";
export const PAYMENT_PROMPT = 'Your stall is live. Make a payment to open.';
/** A stall is live only when every food item on its menu has the vendor's own photo. */
export function hasFoodPhotos(items: { shop: string; enabled: boolean; image?: string | null }[]) {
  const food = items.filter(item => item.shop === 'stall' && item.enabled);
  return food.length > 0 && food.every(item => Boolean(item.image));
}
