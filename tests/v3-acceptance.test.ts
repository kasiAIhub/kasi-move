import { describe, expect, it } from 'vitest';
import { products, defaultAddress } from '../src/data/catalogue';
import { makeLine, makeOrder } from '../src/data/seed';
import { transition } from '../src/store/machine';
import {
  createNetwork,
  login,
  allowedRoute,
  authoriseAction,
  alcoholAllowed,
  ageConfirmed,
} from '../src/store/v3/access';
import { settle, assertBalanced, deliveryIssue, itemTotalCents } from '../src/store/v3/settlement';
import { billSubscription } from '../src/store/v3/subscriptions';
import { visibleOrders, merchantAccount } from '../src/store/v3/projections';
import { gatewayFee, pricingReviewRecommended } from '../src/store/v3/gateway';
import type { Order } from '../src/types';
const now = new Date('2026-09-06T12:00:00Z');
const network = () => createNetwork(products, now);
function ticket(count = 3, price = 60): Order {
  const lines = [
    makeLine({ ...products.find((p) => p.id === 'russian')!, price, merchantId: 'A-stall' }),
    makeLine({ ...products.find((p) => p.id === 'milk')!, price: 22, merchantId: 'A-spaza' }),
    makeLine({ ...products.find((p) => p.id === 'water')!, price: 15, merchantId: 'A-tavern' }),
  ]
    .slice(0, count)
    .map((l, i) => ({ ...l, merchantId: ['A-stall', 'A-spaza', 'A-tavern'][i] }));
  return {
    ...makeOrder(1048, lines),
    stallId: 'A',
    riderId: 'A-rider',
    customerId: 'demo-customer',
  };
}
function completed(count = 3) {
  let o = ticket(count);
  for (const action of [
    'start_kitchen',
    'ready_kitchen',
    ...(count > 1 ? ['pack_spaza'] : []),
    ...(count > 2 ? ['pack_tavern'] : []),
    'accept',
    'collect_stall',
    ...(count > 1 ? ['collect_spaza'] : []),
    ...(count > 2 ? ['collect_tavern'] : []),
    'deliver',
  ] as Parameters<typeof transition>[1][])
    o = transition(o, action);
  return o;
}
function activity() {
  return [2, 9, 16, 23].map((days, i) => {
    const o = completed();
    o.id = 2000 + i;
    o.history.push({
      status: 'delivered',
      at: new Date(now.getTime() - days * 86400000).toISOString(),
    });
    return o;
  });
}
describe.sequential('V3 acceptance — all fourteen in order', () => {
  it('1 · R60 customer bill contains items only at any distance', () => {
    const o = ticket(1);
    o.address.distance = 10;
    expect(itemTotalCents(o.lines)).toBe(6000);
    expect(settle(o, network().merchants).customerItemTotal).toBe(6000);
  });
  it('2 · solo toll 1500, rider 1000, platform 500 and explicit float', () => {
    const s = settle(completed(1), network().merchants);
    expect(s.merchantSettlements[0].tollContribution).toBe(1500);
    expect(s.rider.netRiderAmount).toBe(1000);
    expect(s.platform.grossPlatformBucket).toBe(500);
    expect(s.platform.platformFloatUsed).toBeGreaterThan(0);
    assertBalanced(s);
  });
  it('3 · three merchants contribute 500 each with rider protected', () => {
    const s = settle(completed(), network().merchants);
    expect(s.customerItemTotal).toBe(9700);
    expect(s.merchantSettlements.map((m) => m.tollContribution)).toEqual([500, 500, 500]);
    expect(s.rider.netRiderAmount).toBe(1000);
    expect(s.platform.grossPlatformBucket).toBe(500);
    assertBalanced(s);
  });
  it('4 · two merchants contribute 750 each', () => {
    const s = settle(completed(2), network().merchants);
    expect(s.customerItemTotal).toBe(8200);
    expect(s.merchantSettlements.map((m) => m.tollContribution)).toEqual([750, 750]);
    expect(s.rider.netRiderAmount).toBe(1000);
    assertBalanced(s);
  });
  it('5 · only Kota value qualifies for delivery; collection stays available', () => {
    const o = ticket(2, 35);
    expect(deliveryIssue(o.lines, 'delivery')).toBe(
      'Collect at the stall, or add more to reach R40.',
    );
    expect(deliveryIssue(o.lines, 'collection')).toBeNull();
    expect(itemTotalCents(o.lines)).toBe(5700);
  });
  it('6 · spaza routes, data and mutations are isolated', () => {
    const n = network(),
      s = login(n, 'spaza', 'A', '3333'),
      o = completed();
    o.settlement = settle(o, n.merchants);
    expect(allowedRoute(s, '/owner/menu')).toBe(false);
    expect(allowedRoute(s, '/rider/earnings')).toBe(false);
    expect(() => merchantAccount(s, n.merchants, 'A-stall')).toThrow();
    expect(() => authoriseAction(s, ticket(), 'ready_kitchen', n.merchants)).toThrow();
    const view = visibleOrders([o], s)[0];
    expect(view.lines.every((l) => l.till === 'spaza')).toBe(true);
    expect(view.settlement?.merchantSettlements).toHaveLength(1);
    expect(view.settlement?.rider.netRiderAmount).toBe(0);
  });
  it('7 · tavern cannot access Kota or spaza administration', () => {
    const n = network(),
      s = login(n, 'tavern', 'A', '4444');
    expect(allowedRoute(s, '/owner/menu')).toBe(false);
    expect(allowedRoute(s, '/spaza-owner/catalogue')).toBe(false);
    expect(() => merchantAccount(s, n.merchants, 'A-spaza')).toThrow();
    expect(() => authoriseAction(s, ticket(), 'pack_spaza', n.merchants)).toThrow();
  });
  it('8 · every reachable rider transition respects ordered collections', () => {
    const queue = [ticket()],
      seen = new Set<string>();
    while (queue.length) {
      const o = queue.shift()!,
        key = [o.kitchen, o.spaza, o.tavern, o.rider, o.status, o.collected.join()].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      for (const action of [
        'start_kitchen',
        'ready_kitchen',
        'pack_spaza',
        'pack_tavern',
        'accept',
        'collect_stall',
        'collect_spaza',
        'collect_tavern',
        'deliver',
      ] as const) {
        try {
          const n = transition(o, action);
          expect(n.collected).toEqual(['stall', 'spaza', 'tavern'].slice(0, n.collected.length));
          if (action === 'deliver') {
            expect(o.status).toBe('out_for_delivery');
            expect(n.collected).toHaveLength(3);
          }
          queue.push(n);
        } catch (e) {
          if (e instanceof Error && e.name === 'AssertionError') throw e;
        }
      }
    }
    expect(seen.size).toBeGreaterThan(20);
  });
  it('9 · add-on escrow held until final customer delivery', () => {
    const n = network();
    let o = ticket();
    for (const action of [
      'start_kitchen',
      'ready_kitchen',
      'pack_spaza',
      'pack_tavern',
      'accept',
      'collect_stall',
      'collect_spaza',
      'collect_tavern',
    ] as const) {
      o = transition(o, action);
      const s = settle(o, n.merchants);
      expect(
        s.merchantSettlements
          .filter((m) => m.merchantType !== 'stall')
          .every((m) => m.escrowStatus === 'held'),
      ).toBe(true);
    }
    expect(settle(o, n.merchants).merchantSettlements[0].escrowStatus).toBe('releasable');
    o = transition(o, 'deliver');
    expect(
      settle(o, n.merchants).merchantSettlements.every((m) => m.escrowStatus === 'released'),
    ).toBe(true);
  });
  it('10 · licence AND customer 18+ gate enforced together', () => {
    const n = network(),
      m = n.merchants.find((m) => m.id === 'A-tavern')!,
      p = products.find((p) => p.id === 'savanna')!;
    expect(() => alcoholAllowed(p, m, true)).toThrow();
    m.licensedDeliveryEnabled = true;
    expect(() => alcoholAllowed(p, m, false)).toThrow();
    expect(ageConfirmed(false)).toBe(false);
    expect(ageConfirmed(undefined as unknown as boolean)).toBe(false);
    expect(ageConfirmed(true)).toBe(true);
    expect(() => alcoholAllowed(p, m, true)).not.toThrow();
  });
  it('11 · two independent vendors have separate credentials, menus, QR, orders and accounts', () => {
    const n = network();
    expect(() => login(n, 'owner', 'B', '1111')).toThrow();
    const a = login(n, 'owner', 'A', '1111'),
      b = login(n, 'owner', 'B', '2222');
    expect(a.merchantId).not.toBe(b.merchantId);
    expect(n.stalls[0].slug).not.toBe(n.stalls[1].slug);
    n.catalogues['A-stall'][0].price = 99;
    expect(n.catalogues['B-stall'][0].price).toBe(35);
    expect(visibleOrders([ticket()], b)).toHaveLength(0);
    expect(() => authoriseAction(b, ticket(), 'start_kitchen', n.merchants)).toThrow();
    expect(n.merchants[0].subAccount).not.toBe(n.merchants[3].subAccount);
  });
  it('12 · eligible R150 subscriptions bill the shop sub-account only', () => {
    const n = network(),
      m = n.merchants.find((m) => m.id === 'A-spaza')!;
    expect(billSubscription(m, activity(), now).invoices).toHaveLength(0);
    m.joinedAt = '2026-07-01T00:00:00Z';
    expect(billSubscription(m, [], now).invoices).toHaveLength(0);
    const billed = billSubscription(m, activity(), now);
    expect(billed.invoices[0].amount).toBe(15000);
    expect(billed.invoices[0].subAccount).toBe(m.subAccount);
    expect(billed.invoices[0].subAccount).not.toBe(n.merchants[0].subAccount);
    expect(billSubscription(billed, activity(), now).invoices).toHaveLength(1);
  });
  it('13 · two missed payments freeze operations and escrow', () => {
    const n = network(),
      m = n.merchants.find((m) => m.id === 'A-spaza')!;
    m.joinedAt = '2026-07-01T00:00:00Z';
    m.mockPaymentSucceeds = false;
    let frozen = billSubscription(m, activity(), now);
    expect(frozen.subscriptionStatus).toBe('overdue');
    frozen = billSubscription(frozen, activity(), new Date('2026-10-06T12:00:00Z'));
    expect(frozen.subscriptionStatus).toBe('frozen');
    n.merchants = n.merchants.map((x) => (x.id === m.id ? frozen : x));
    expect(() =>
      authoriseAction(login(n, 'spaza', 'A', '3333'), ticket(), 'pack_spaza', n.merchants),
    ).toThrow();
    expect(
      settle(completed(), n.merchants).merchantSettlements.find((x) => x.merchantId === m.id)
        ?.escrowStatus,
    ).toBe('frozen');
  });
  it('14 · all payment methods and merchant counts preserve exact R10 net', () => {
    for (const payment of ['Card', 'Instant EFT', 'Capitec Pay', 'Cash on delivery'] as const)
      for (const count of [1, 2, 3])
        for (const payout of [0, 870, 2500]) {
          const n = network(),
            o = completed(count);
          o.payment = payment;
          const s = settle(o, n.merchants, { ...n.gateway, payout });
          expect(s.rider.netRiderAmount).toBe(1000);
          expect(s.rider.gatewayDeduction).toBe(0);
          assertBalanced(s);
        }
    expect(gatewayFee(6000, 'Instant EFT')).toBe(200);
    expect(
      pricingReviewRecommended([
        { month: '2026-06', processed: 5000001 },
        { month: '2026-07', processed: 6000000 },
        { month: '2026-08', processed: 7000000 },
      ]),
    ).toBe(true);
  });
});
