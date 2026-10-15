import type { Merchant } from '../../types/v3';
import type { Order } from '../../types';
import { MONEY } from './gateway';
const DAY = 86400000;
export function subscriptionEligible(merchant: Merchant, orders: Order[], now: Date) {
  if (merchant.type === 'stall' || now.getTime() - Date.parse(merchant.joinedAt) < 30 * DAY)
    return false;
  // Four consecutive complete seven-day windows immediately before assessment.
  return [0, 1, 2, 3].every((week) =>
    orders.some(
      (o) =>
        o.status === 'delivered' &&
        o.address.mode === 'delivery' &&
        o.lines.some((l) => l.merchantId === merchant.id) &&
        (() => {
          const at = Date.parse(o.history.at(-1)?.at || o.createdAt);
          return at <= now.getTime() - week * 7 * DAY && at > now.getTime() - (week + 1) * 7 * DAY;
        })(),
    ),
  );
}
function nextMonth(iso: string) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}
export function billSubscription(merchant: Merchant, orders: Order[], now: Date): Merchant {
  const next = structuredClone(merchant);
  if (next.type === 'stall') return next;
  if (!next.nextBillingAt) {
    if (!subscriptionEligible(next, orders, now)) return next;
    next.nextBillingAt = now.toISOString();
  }
  let guard = 0;
  while (Date.parse(next.nextBillingAt) <= now.getTime() && guard++ < 120) {
    const due = next.nextBillingAt;
    const id = `${next.id}:${due}`;
    if (!next.invoices.some((i) => i.id === id))
      next.invoices.push({
        id,
        dueAt: due,
        amount: MONEY.subscription,
        subAccount: next.subAccount,
        status: next.mockPaymentSucceeds ? 'paid' : 'missed',
      });
    next.nextBillingAt = nextMonth(due);
  }
  const missed = next.invoices.filter((i) => i.status === 'missed').length;
  next.subscriptionStatus = missed >= 2 ? 'frozen' : missed ? 'overdue' : 'active';
  return next;
}
