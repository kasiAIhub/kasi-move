import { describe, expect, it } from 'vitest';
import { defaultAddress } from '../src/data/catalogue';
import { demoLines, makeOrder } from '../src/data/seed';
import {
  canTransition,
  deliveryFee,
  riderEarnings,
  tillTotal,
  total,
  transition,
} from '../src/store/machine';
import { restore } from '../src/store/persistence';
describe('One ticket. Several tills. One rider.', () => {
  it('splits the R107 ticket into R70, R22 and R15 without charging the community pool', () => {
    const order = makeOrder(1048, demoLines());
    expect(total(order.lines, order.address)).toBe(107);
    expect(['stall', 'spaza', 'tavern'].map((t) => tillTotal(order.lines, t as 'stall'))).toEqual([
      70, 22, 15,
    ]);
    expect(riderEarnings(order)).toBe(8);
  });
  it('uses the exact free-radius boundary and waives collection fees', () => {
    expect(deliveryFee({ ...defaultAddress, distance: 2 })).toBe(0);
    expect(deliveryFee({ ...defaultAddress, distance: 2.01 })).toBe(15);
    expect(deliveryFee({ ...defaultAddress, distance: 10, mode: 'collection' })).toBe(0);
  });
  it('guards acceptance, packing, ordered collection, and premature delivery', () => {
    let order = makeOrder(1048, demoLines());
    expect(canTransition(order, 'accept')).toBe(false);
    expect(canTransition(order, 'ready_kitchen')).toBe(false);
    order = transition(transition(order, 'start_kitchen'), 'ready_kitchen');
    order = transition(order, 'accept');
    expect(canTransition(order, 'collect_spaza')).toBe(false);
    order = transition(order, 'collect_stall');
    expect(canTransition(order, 'collect_spaza')).toBe(false);
    order = transition(order, 'pack_spaza');
    expect(order.status).toBe('collecting_spaza');
    order = transition(order, 'collect_spaza');
    expect(canTransition(order, 'deliver')).toBe(false);
    expect(canTransition(order, 'collect_tavern')).toBe(false);
    order = transition(transition(order, 'pack_tavern'), 'collect_tavern');
    expect(order.status).toBe('out_for_delivery');
    order = transition(order, 'deliver');
    expect(order.status).toBe('delivered');
    expect(canTransition(order, 'deliver')).toBe(false);
  });
  it('skips absent stops and keeps collection orders away from riders', () => {
    let order = makeOrder(1, [demoLines()[0]], { ...defaultAddress, mode: 'collection' });
    order = transition(transition(order, 'start_kitchen'), 'ready_kitchen');
    expect(canTransition(order, 'accept')).toBe(false);
    expect(canTransition(order, 'pack_spaza')).toBe(false);
    expect(transition(order, 'collect_customer').status).toBe('delivered');
    expect(riderEarnings(order)).toBe(0);
  });
  it('restores an order and recovers safely from invalid storage', () => {
    const state = restore(null);
    state.orders[0] = transition(state.orders[0], 'start_kitchen');
    expect(restore(JSON.stringify(state)).orders[0].kitchen).toBe('preparing');
    expect(restore('broken').version).toBe(1);
  });
});
