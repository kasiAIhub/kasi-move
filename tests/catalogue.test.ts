import { describe, expect, it } from 'vitest';
import { products } from '../src/data/catalogue';
import { currentDemoLines, demoLines, seedState } from '../src/data/seed';
import { cartIssue } from '../src/store/checkout';
import { restore } from '../src/store/persistence';
import { total, tillTotal } from '../src/store/machine';
import { store } from '../src/store';

describe('Researched catalogue and existing tickets', () => {
  it('keeps Sbu alcohol and the approved water exception and moves 2L soft drinks to the spaza', () => {
    expect(products.filter((p) => p.till === 'tavern')).toHaveLength(9);
    expect(
      products.filter((p) => p.till === 'tavern' && p.id !== 'water').every((p) => p.alcohol),
    ).toBe(true);
    for (const id of ['coke-2l', 'sprite-2l', 'fanta-2l', 'stoney-2l'])
      expect(products.find((p) => p.id === id)?.till).toBe('spaza');
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
  });
  it('migrates availability without changing historical paid amounts', () => {
    const old = seedState();
    old.availability = { russian: false, coke: true };
    const next = restore(JSON.stringify(old));
    expect(next.availability.russian).toBe(false);
    expect(next.availability.savanna).toBe(true);
    expect(next.availability.coke).toBeUndefined();
    expect(next.orders).toEqual(old.orders);
    expect(total(demoLines(), next.address)).toBe(107);
  });
  it('rejects stale carts and derives decimal prices by till', () => {
    const state = seedState();
    expect(cartIssue(demoLines(), state.availability)).toContain('changed or left');
    expect(cartIssue(currentDemoLines(), state.availability)).toBeNull();
    expect(tillTotal(currentDemoLines(), 'spaza')).toBe(22.99);
    expect(total(currentDemoLines(), state.address)).toBe(141.99);
  });
  it('enforces adult confirmation at payment and restores the saved session after a tour', () => {
    const before = store.get();
    store.beginTour();
    try {
      store.add('russian');
      store.add('savanna');
      expect(() => store.pay('Card')).toThrow('18 or older');
      expect(store.get().cart).toHaveLength(2);
      expect(store.pay('Card', true).lines).toHaveLength(2);
    } finally {
      store.endTour();
    }
    expect(store.get()).toEqual(before);
    expect(() => store.reorder(1048)).toThrow('no longer available');
  });
});
