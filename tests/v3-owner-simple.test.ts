import { describe, it, expect } from 'vitest';
import { seedState } from '../src/data/seed';
import { prepareTrialState } from '../src/store/v3/trial-reset';
import { createStreetStore } from '../src/store';

describe('Simple Kota owner operations', () => {
  it('starts alone and persists open/closed without weakening owner isolation', () => {
    let saved = prepareTrialState(seedState());
    const s = createStreetStore(saved, (x) => {
      saved = structuredClone(x);
    });
    expect(() => s.setStallOpen(false)).toThrow();
    s.login('owner', 'A', '1111');
    s.completeOwnerSetup('My Kota', '09:00–21:00');
    expect(s.get().stall.ownerSetupDone).toBe(true);
    expect(
      s
        .get()
        .streetNodes.filter((x) => x.type !== 'stall')
        .every((x) => !x.enabled),
    ).toBe(true);
    s.setStallOpen(false);
    expect(createStreetStore(saved).get().stall.isOpen).toBe(false);
    s.login('customer', 'A', '');
    expect(() => s.add('russian')).toThrow('closed');
    s.login('owner', 'A', '1111');
    s.setStallOpen(true);
    expect(() => s.setNeighbour('B-spaza', true)).toThrow();
    s.setNeighbour('A-spaza', true);
    s.login('customer', 'A', '');
    s.add('russian');
    s.add('milk');
    const order = s.pay('Card');
    s.login('owner', 'A', '1111');
    expect(() => s.setNeighbour('A-spaza', false)).toThrow('active orders');
    s.setStallOpen(false);
    s.act(order.id, 'start_kitchen');
    expect(s.get().orders[0].kitchen).toBe('preparing');
  });
});
