import { describe, expect, it } from 'vitest';
import { closingTime, stallShareMessage } from '../src/v21/share-text';
const base = { id: 'abc', name: 'Mama T Kota', takesCard: true, delivery: true, deliveryName: 'Tsepo', hours: '08:00–23:00' };
describe('share text', () => {
  it('builds the approved message with driver, hours and speed point', () => {
    expect(stallShareMessage(base, 'https://x.test')).toBe([
      '🎉 *Mama T Kota just opened!* 🎉', 'Fresh food, made for you. Order online, no queue.', '🕚 The kitchen is now open until 23:00.',
      '🛵 Tsepo will be delivering to your gate - tell us if you need them to bring a speed point.', '🏪 Or order and collect from the stall.', '👉 https://x.test/stall/abc'].join('\n'));
  });
  it('leaves out the driver line when no driver accepted, and the speed point when cash only', () => {
    const text = stallShareMessage({ ...base, delivery: false, deliveryName: undefined, takesCard: false }, 'https://x.test');
    expect(text).not.toContain('🛵'); expect(text).not.toContain('speed point'); expect(text).toContain('Cash only.');
    expect(text.endsWith('👉 https://x.test/stall/abc')).toBe(true);
  });
  it('never prints an empty name and skips unreadable hours', () => {
    const text = stallShareMessage({ ...base, name: ' ', hours: '' }, 'https://x.test');
    expect(text).toContain('*Our stall just opened!*'); expect(text).not.toContain('🕚');
    expect(closingTime('08:00-21:00')).toBe('21:00');
  });
});
import { describe as d2, expect as e2, it as i2 } from 'vitest';
import { stallShareMessage as msg } from '../src/v21/share-text';
d2('short share link', () => {
  i2('uses the short slug link when the stall has one, the long link otherwise', () => {
    const base = { id: 'abc-123', name: 'Mama T Kota', takesCard: false, delivery: false };
    e2(msg({ ...base, slug: 'mama-t-kota' }, 'https://move.kasiaihub.com').split('\n').pop()).toBe('👉 https://move.kasiaihub.com/mama-t-kota');
    e2(msg(base, 'https://x.test').split('\n').pop()).toBe('👉 https://x.test/stall/abc-123');
  });
});
