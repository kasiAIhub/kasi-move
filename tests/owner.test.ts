import { describe, expect, it } from 'vitest';
import { demoLines, makeOrder } from '../src/data/seed';
import { dashboardTotals, foodTickets, kitchenLabel, riderLabel } from '../src/app/owner/selectors';
import { transition } from '../src/store/machine';

describe('Kota owner projections', () => {
  it('sorts food tickets newest first without mutating the store or including non-food drafts', () => {
    const older = makeOrder(1048, demoLines());
    older.createdAt = '2026-09-06T08:00:00Z';
    const newer = makeOrder(1049, demoLines());
    newer.createdAt = '2026-09-06T09:00:00Z';
    const spaza = makeOrder(1050, [demoLines()[1]]);
    const draft = { ...newer, id: 1051, status: 'draft' as const };
    const source = [older, spaza, newer, draft];
    expect(foodTickets(source).map((order) => order.id)).toEqual([1049, 1048]);
    expect(source[0]).toBe(older);
  });
  it('counts today in South African time and adds only the food portion to the sample baseline', () => {
    const today = makeOrder(1049, demoLines());
    today.createdAt = '2026-09-05T22:30:00Z';
    const yesterday = { ...today, id: 1050, createdAt: '2026-09-05T20:00:00Z' };
    const cancelled = { ...today, id: 1051, status: 'cancelled' as const };
    const draft = { ...today, id: 1052, status: 'draft' as const };
    const orders = [today, yesterday, cancelled, draft];
    const now = new Date('2026-09-06T00:00:00Z');
    const result = dashboardTotals(orders, 'stall', now);
    expect(result.sales).toBe(4890);
    expect(result.count).toBe(69);
    expect(result.shared.map((order) => order.id)).toEqual([1049]);
    expect(dashboardTotals(orders, 'spaza', now).sales).toBe(22);
    expect(dashboardTotals(orders, 'tavern', now).sales).toBe(15);
  });
  it('presents kitchen and rider status independently of other merchants packing', () => {
    let order = makeOrder(1048, demoLines());
    expect(riderLabel(order)).toBe('Waiting for kitchen readiness');
    order = transition(order, 'start_kitchen');
    order = transition(order, 'pack_spaza');
    expect(kitchenLabel(order)).toBe('Preparing');
    order = transition(order, 'ready_kitchen');
    expect(riderLabel(order)).toBe('Waiting for acceptance');
    order = transition(order, 'accept');
    expect(riderLabel(order)).toBe('Heading to the stall');
    const cancelled = transition(makeOrder(1048, demoLines()), 'cancel');
    expect(kitchenLabel(cancelled)).toBe('Cancelled');
    expect(riderLabel(cancelled)).toContain('Not dispatched');
  });
});
