import { describe, it, expect } from 'vitest';
import { createStreetStore } from '../src/store';
import { seedState } from '../src/data/seed';
import { restore } from '../src/store/persistence';
import { total } from '../src/store/machine';
const fresh = () => createStreetStore(seedState());
describe('V3 live store boundaries', () => {
  it('guards live mutations, data projections and separate stall menus', () => {
    const s = fresh();
    expect(() => s.available('russian')).toThrow();
    s.login('spaza', 'A', '3333');
    expect(() => s.editProduct('russian', { name: 'Bad', price: 1, description: '' })).toThrow();
    expect(() => s.act(1048, 'start_kitchen')).toThrow();
    expect(s.get().catalogue.every((p) => p.till === 'spaza')).toBe(true);
    expect(s.get().network.merchants.find((m) => m.type === 'stall')?.subAccount).toBe('');
    expect(() => s.merchant('A-stall')).toThrow();
    s.login('owner', 'B', '2222');
    expect(s.get().orders).toHaveLength(0);
    s.editProduct('russian', { name: 'B Russian', price: 65, description: 'Own menu' });
    s.login('owner', 'A', '1111');
    expect(s.get().catalogue.find((p) => p.id === 'russian')?.price).toBe(60);
    expect(() => s.act(1048, 'pack_spaza')).toThrow();
  });
  it('allows item-only checkout beyond 2 km and enforces the Kota minimum', () => {
    const s = fresh();
    s.add('classic');
    s.add('milk');
    expect(() => s.pay('Card')).toThrow('Collect at the stall');
    s.address({ ...s.get().address, mode: 'collection', distance: 10 });
    expect(total(s.pay('Card').lines, s.get().address)).toBe(57.99);
  });
  it('enforces licence and ephemeral 18+ declaration at add and payment', () => {
    let saved = '';
    const s = createStreetStore(seedState(), (state) => {
      saved = JSON.stringify(state);
    });
    expect(() => s.add('savanna')).toThrow();
    s.login('tavern', 'A', '4444');
    s.setLicensed(true);
    s.role('customer');
    expect(() => s.add('savanna')).toThrow();
    s.confirmAge(false);
    expect(() => s.add('savanna')).toThrow();
    s.confirmAge(true);
    s.add('russian');
    s.add('savanna');
    expect(saved).not.toContain('9001015009087');
    s.login('tavern', 'A', '4444');
    s.setLicensed(false);
    s.role('customer');
    expect(() => s.pay('Card', true)).toThrow();
  });
  it('persists V3 orders and pays water without an alcohol prompt', () => {
    let saved = '';
    const s = createStreetStore(seedState(), (state) => {
      saved = JSON.stringify(state);
    });
    s.add('russian');
    s.add('water');
    const o = s.pay('Instant EFT');
    expect(total(o.lines, o.address)).toBe(74);
    const restored = createStreetStore(restore(saved));
    expect(restored.get().orders.find((x) => x.id === o.id)?.lines).toHaveLength(2);
    restored.login('tavern', 'A', '4444');
    expect(
      restored
        .get()
        .orders.find((x) => x.id === o.id)
        ?.lines.map((l) => l.productId),
    ).toEqual(['water']);
  });
  it('releases only owned escrow and rejects duplicate withdrawals', () => {
    const s = fresh();
    s.add('russian');
    s.add('water');
    const id = s.pay('Card').id;
    s.login('owner', 'A', '1111');
    expect(() => s.withdraw(id)).toThrow();
    s.act(id, 'start_kitchen');
    s.act(id, 'ready_kitchen');
    s.login('tavern', 'A', '4444');
    s.act(id, 'pack_tavern');
    s.login('rider', 'A', '5555');
    s.act(id, 'accept');
    expect(() => s.act(id, 'collect_tavern')).toThrow();
    s.act(id, 'collect_stall');
    s.login('owner', 'A', '1111');
    s.withdraw(id);
    expect(() => s.withdraw(id)).toThrow();
    s.login('tavern', 'A', '4444');
    expect(() => s.withdraw(id)).toThrow();
    s.login('rider', 'A', '5555');
    s.act(id, 'collect_tavern');
    s.act(id, 'deliver');
    expect(s.get().orders.find((o) => o.id === id)?.settlement?.rider.netRiderAmount).toBe(1000);
    s.login('tavern', 'A', '4444');
    s.withdraw(id);
    expect(s.get().network.withdrawals.every((w) => w.merchantId === 'A-tavern')).toBe(true);
  });
  it('keeps collection without a toll and balances refunds', () => {
    const s = fresh();
    s.add('russian');
    s.address({ ...s.get().address, mode: 'collection' });
    const id = s.pay('Card').id;
    s.login('owner', 'A', '1111');
    s.act(id, 'cancel');
    expect(
      s.get().orders.find((o) => o.id === id)?.settlement?.merchantSettlements[0].escrowStatus,
    ).toBe('refunded');
  });
});
