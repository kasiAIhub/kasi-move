import { describe, it, expect } from 'vitest';
import { seedState } from '../src/data/seed';
import { createStreetStore } from '../src/store';
import { prepareTrialState, TRIAL_REVISION } from '../src/store/v3/trial-reset';
import { restore } from '../src/store/persistence';
describe('Clean trial update', () => {
  it('clears old orders and balances once, preserving new orders through refresh', () => {
    const clean = prepareTrialState(seedState());
    expect(clean.orders).toEqual([]);
    expect(clean.nextId).toBe(1);
    expect(clean.network!.withdrawals).toEqual([]);
    let saved = '';
    const s = createStreetStore(clean, (x) => (saved = JSON.stringify(x)));
    s.add('russian');
    const order = s.pay('Card');
    expect(order.id).toBe(1);
    const reloaded = prepareTrialState(restore(saved));
    expect(reloaded.trialRevision).toBe(TRIAL_REVISION);
    expect(reloaded.orders).toHaveLength(1);
  });
  it('adds eggs and maize to saved catalogues and enables only the demo licence, not age confirmation', () => {
    const s = createStreetStore(prepareTrialState(seedState()));
    expect(s.get().catalogue.some((p) => p.id === 'eggs-six')).toBe(true);
    expect(s.get().catalogue.some((p) => p.id === 'maize-meal')).toBe(true);
    expect(s.get().catalogue.some((p) => p.id === 'savanna')).toBe(true);
    expect(() => s.add('savanna')).toThrow('Alcohol requires');
    s.confirmAge(true);
    s.add('savanna');
    expect(s.get().cart[0].productId).toBe('savanna');
  });
  it('does not let the isolated tour reintroduce sample tickets into the clean session', () => {
    const s = createStreetStore(prepareTrialState(seedState()));
    s.beginTour();
    s.endTour();
    expect(s.get().orders).toEqual([]);
  });
  it('updates existing menus and unpaid carts once without rewriting paid tickets', () => {
    const old = prepareTrialState(seedState());
    delete old.catalogueRevision;
    const s = createStreetStore(old);
    s.confirmAge(true);
    s.add('russian');
    s.add('savanna');
    const paid = s.pay('Card');
    let snapshot = old;
    const saved = createStreetStore(old, (x) => {
      snapshot = structuredClone(x);
    });
    saved.add('russian');
    saved.pay('Card');
    snapshot.orders = [structuredClone(paid)];
    const line = snapshot.orders[0].lines.find((l) => l.productId === 'savanna')!;
    line.basePrice = 49;
    const before = JSON.stringify(snapshot.orders);
    const menu = snapshot.network!.catalogues['A-tavern'];
    menu.find((p) => p.id === 'savanna')!.price = 49;
    const updated = prepareTrialState(snapshot);
    expect(updated.network!.catalogues['A-tavern'].find((p) => p.id === 'savanna')!.price).toBe(30);
    expect(
      updated
        .network!.catalogues['A-tavern'].filter((p) => p.category === 'Beer')
        .every((p) => p.price === 22),
    ).toBe(true);
    expect(JSON.stringify(updated.orders)).toBe(before);
    expect(prepareTrialState(updated)).toEqual(updated);
  });
});
