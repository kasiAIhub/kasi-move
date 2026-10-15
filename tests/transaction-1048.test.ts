import { describe, expect, it } from 'vitest';
import { demoLines, makeOrder, seedState } from '../src/data/seed';
import {
  deliveryFee,
  lineTotal,
  requiredTills,
  riderEarnings,
  tillTotal,
  total,
  transition,
} from '../src/store/machine';
import { restore } from '../src/store/persistence';
import type { Order, OrderAction } from '../src/types';

describe('Ticket #1048 transaction proof', () => {
  it('balances R107 across three tills and keeps the R8 pool outside customer charges', () => {
    const order = makeOrder(1048, demoLines());
    expect(order.id).toBe(1048);
    expect(order.address.distance).toBe(1.8);
    expect(order.lines.map(lineTotal)).toEqual([70, 22, 15]);
    expect(order.lines[0].basePrice).toBe(60);
    expect(order.lines[0].extras).toEqual([{ id: 'egg', name: 'Extra egg', price: 10 }]);
    expect(deliveryFee(order.address)).toBe(0);
    expect(total(order.lines, order.address)).toBe(107);
    const merchantSplit = {
      kota: tillTotal(order.lines, 'stall'),
      spaza: tillTotal(order.lines, 'spaza'),
      sbus: tillTotal(order.lines, 'tavern'),
    };
    expect(merchantSplit).toEqual({ kota: 70, spaza: 22, sbus: 15 });
    expect(Object.values(merchantSplit).reduce((a, b) => a + b, 0)).toBe(107);
    expect(riderEarnings(order)).toBe(8);
    expect(total(order.lines, order.address)).not.toBe(115);
    expect(requiredTills(order)).toEqual(['stall', 'spaza', 'tavern']);
  });

  it('rejects premature acceptance, skipped stops and departure with unpacked merchants without mutating the ticket', () => {
    let order = makeOrder(1048, demoLines());
    const reject = (action: OrderAction) => {
      const snapshot = structuredClone(order);
      expect(() => transition(order, action)).toThrow();
      expect(order).toEqual(snapshot);
    };
    reject('accept');
    reject('collect_stall');
    reject('deliver');
    order = transition(transition(order, 'start_kitchen'), 'ready_kitchen');
    order = transition(order, 'accept');
    reject('collect_spaza');
    reject('collect_tavern');
    reject('deliver');
    order = transition(order, 'collect_stall');
    reject('collect_spaza');
    reject('collect_tavern');
    reject('deliver');
    order = transition(order, 'pack_spaza');
    expect(order.status).toBe('collecting_spaza');
    order = transition(order, 'collect_spaza');
    reject('collect_tavern');
    reject('deliver');
    order = transition(order, 'pack_tavern');
    expect(order.status).toBe('collecting_tavern');
    order = transition(order, 'collect_tavern');
    expect(order.status).toBe('out_for_delivery');
    expect(order.collected).toEqual(['stall', 'spaza', 'tavern']);
  });

  it('checks every reachable fulfilment state, including different packing sequences', () => {
    const actions: OrderAction[] = [
      'start_kitchen',
      'ready_kitchen',
      'pack_spaza',
      'pack_tavern',
      'accept',
      'collect_stall',
      'collect_spaza',
      'collect_tavern',
      'deliver',
      'cancel',
    ];
    const queue: Order[] = [makeOrder(1048, demoLines())];
    const visited = new Set<string>();
    let departures = 0;
    while (queue.length) {
      const order = queue.shift()!;
      const key = JSON.stringify([
        order.status,
        order.kitchen,
        order.spaza,
        order.tavern,
        order.rider,
        order.collected,
      ]);
      if (visited.has(key)) continue;
      visited.add(key);
      expect(order.collected).toEqual(
        ['stall', 'spaza', 'tavern'].slice(0, order.collected.length),
      );
      if (order.status === 'out_for_delivery' || order.status === 'delivered') {
        expect([order.kitchen, order.spaza, order.tavern]).toEqual(['ready', 'ready', 'ready']);
        expect(order.collected).toEqual(['stall', 'spaza', 'tavern']);
        departures++;
      }
      for (const action of actions) {
        let next: Order;
        try {
          next = transition(order, action);
        } catch {
          continue;
        }
        expect(total(next.lines, next.address)).toBe(107);
        expect(riderEarnings(next)).toBe(8);
        queue.push(next);
      }
    }
    expect(visited.size).toBeGreaterThan(20);
    expect(departures).toBeGreaterThan(0);
    console.log(
      `Ticket #1048: ${visited.size} reachable states checked; every departure requires three ready and collected merchants.`,
    );
  });

  it('round-trips the exact active ticket through the real persistence parser', () => {
    const state = seedState();
    state.orders[0] = transition(state.orders[0], 'start_kitchen');
    const restored = restore(JSON.stringify(state));
    expect(restored.orders.find((order) => order.id === 1048)).toEqual(state.orders[0]);
    expect(total(restored.orders[0].lines, restored.orders[0].address)).toBe(107);
  });
});
