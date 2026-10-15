import { describe, expect, it } from 'vitest';
import { closingTime, stallShareMessage } from '../src/v21/share-text';
const base = { id: 'abc', name: 'Mama T Kota', takesCard: true, delivery: true, deliveryName: 'Tsepo', hours: '08:00–23:00' };
describe('share text', () => {
  it('builds the approved message with driver, hours and speed point', () => {
    expect(stallShareMessage(base, 'https://x.test')).toBe([
      '🎉 *Mama T Kota just opened!* 🎉', 'Fresh food, made for you. Order online, no queue.', '🕚 The kitchen is now open until 23:00.',
      '🛵 Tsepo will be delivering to your gate - tell us if you need him to bring a speed point.', '🏪 Or order and collect from the stall.', '👉 https://x.test/stall/abc'].join('\n'));
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
