import { describe, it, expect } from 'vitest';
import { createStreetStore } from '../src/store';
import { seedState } from '../src/data/seed';
import { restore } from '../src/store/persistence';
import { transition } from '../src/store/machine';

const fresh = () => createStreetStore(seedState());
function prepared() {
  const s = fresh();
  s.add('russian');
  s.add('milk');
  s.add('water');
  const id = s.pay('Card').id;
  s.login('owner', 'A', '1111');
  s.act(id, 'start_kitchen');
  s.act(id, 'ready_kitchen');
  for (const [role, pin, action] of [
    ['spaza', '3333', 'pack_spaza'],
    ['tavern', '4444', 'pack_tavern'],
  ] as const) {
    s.login(role, 'A', pin);
    s.act(id, action);
  }
  s.login('rider', 'A', '5555');
  s.act(id, 'accept');
  return { s, id };
}
describe('Final audit: additional failure paths', () => {
  it('does not trust a mutable public catalogue for price or alcohol validation', () => {
    const s = fresh();
    s.get().catalogue.find((p) => p.id === 'russian')!.price = 0.01;
    s.add('russian');
    expect(s.pay('Card').lines[0].basePrice).toBe(60);
    s.login('tavern', 'A', '4444');
    s.setLicensed(true);
    s.role('customer');
    s.get().catalogue.find((p) => p.id === 'savanna')!.alcohol = false;
    expect(() => s.add('savanna')).toThrow('Alcohol requires');
  });
  it('projects only the Kota owner item lines, not other merchant prices', () => {
    const s = fresh();
    s.login('owner', 'A', '1111');
    expect(
      s
        .get()
        .orders.find((o) => o.id === 1048)!
        .lines.every((l) => l.merchantId === 'A-stall'),
    ).toBe(true);
  });
  it.each([
    ['spaza', '3333', 'pack_spaza', 'collect_spaza'],
    ['tavern', '4444', 'pack_tavern', 'collect_tavern'],
  ] as const)(
    'revokes packed readiness when %s reports missing stock, then rejects post-collection changes',
    (role, pin, pack, collect) => {
      const { s, id } = prepared();
      s.act(id, 'collect_stall');
      if (role === 'tavern') s.act(id, 'collect_spaza');
      s.login(role, 'A', pin);
      s.acknowledge(id, false);
      expect(() => s.act(id, pack)).toThrow('missing');
      s.login('rider', 'A', '5555');
      expect(() => s.act(id, collect)).toThrow('not ready');
      s.login(role, 'A', pin);
      s.acknowledge(id, true);
      s.act(id, pack);
      s.login('rider', 'A', '5555');
      s.act(id, collect);
      s.login(role, 'A', pin);
      expect(() => s.acknowledge(id, false)).toThrow('cannot be changed');
    },
  );
  it('rejects a second Pay or repeated callback without creating a second ticket', () => {
    const s = fresh();
    s.add('russian');
    const id = s.pay('Card').id;
    expect(() => s.pay('Card')).toThrow();
    expect(s.get().orders.filter((o) => o.id === id)).toHaveLength(1);
  });
  it('recovers persisted payment even if the caller loses the UI callback', () => {
    let saved = '';
    const s = createStreetStore(seedState(), (x) => {
      saved = JSON.stringify(x);
    });
    s.add('russian');
    try {
      s.pay('Card');
      throw new Error('UI callback lost');
    } catch {}
    const r = createStreetStore(restore(saved));
    expect(r.get().orders.filter((o) => o.id === 1049)).toHaveLength(1);
    expect(() => r.pay('Card')).toThrow();
  });
  it('resumes rider interruption and rejects duplicate collection, delivery and paid-ticket refund', () => {
    const { s, id } = prepared();
    s.act(id, 'collect_stall');
    // Exercise serialized raw persistence through a second store for the interrupted job.
    let saved = '';
    const restored = createStreetStore(seedState(), (x) => {
      saved = JSON.stringify(x);
    });
    restored.add('russian');
    const job = restored.pay('Card').id;
    restored.login('owner', 'A', '1111');
    restored.act(job, 'start_kitchen');
    restored.act(job, 'ready_kitchen');
    restored.login('rider', 'A', '5555');
    restored.act(job, 'accept');
    restored.act(job, 'collect_stall');
    const resumed = createStreetStore(restore(saved));
    expect(() => resumed.act(job, 'collect_stall')).toThrow();
    resumed.act(job, 'deliver');
    expect(() => resumed.act(job, 'deliver')).toThrow();
    resumed.login('owner', 'A', '1111');
    expect(() => resumed.act(job, 'cancel')).toThrow();
    resumed.withdraw(job);
    expect(() => resumed.withdraw(job)).toThrow();
    expect(resumed.get().network.withdrawals).toHaveLength(1);
  });
  it('keeps paid prices fixed when catalogue availability changes', () => {
    const s = fresh();
    s.add('russian');
    const id = s.pay('Card').id;
    s.login('owner', 'A', '1111');
    s.available('russian');
    expect(s.get().orders.find((o) => o.id === id)!.lines[0].basePrice).toBe(60);
    s.role('customer');
    expect(() => s.add('russian')).toThrow('unavailable');
  });
  it('rejects unknown actions without creating an invalid history event', () => {
    const s = fresh();
    const order = s.get().orders[0];
    const before = JSON.stringify(order);
    expect(() => transition(order, 'paid=true' as never)).toThrow();
    expect(JSON.stringify(order)).toBe(before);
  });
});
