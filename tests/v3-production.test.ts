import { describe, expect, it } from 'vitest';
import { nextOpen, scheduleOpen } from '../src/server/hours';
import { verifyYoco } from '../src/server/payments';
describe('production boundaries', () => {
  it('supports overnight opening hours in South African time', () => {
    expect(scheduleOpen('18:00–02:00', Date.parse('2026-09-09T23:00:00Z'))).toBe(true);
    expect(scheduleOpen('18:00–02:00', Date.parse('2026-09-10T01:00:00Z'))).toBe(false);
    expect(nextOpen('08:00–21:00', Date.parse('2026-09-09T07:00:00Z'))).toBe(Date.parse('2026-09-10T06:00:00Z'));
  });
  it('requires authentic, recent Yoco signatures over the unmodified body', async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32)), secret = 'whsec_' + btoa(String.fromCharCode(...bytes));
    const now = Date.now(), timestamp = String(Math.floor(now / 1000)), body = JSON.stringify({ type: 'payment.succeeded' });
    const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`event-1.${timestamp}.${body}`)))));
    const request = new Request('https://kasi.test/api/payments/yoco', { headers: { 'webhook-id': 'event-1', 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` } });
    expect(await verifyYoco(request, body, secret, now)).toBe(true);
    expect(await verifyYoco(request, body + ' ', secret, now)).toBe(false);
    expect(await verifyYoco(request, body, secret, now + 181000)).toBe(false);
  });
});


describe('order-specific route presentation', () => {
  it('shows only the required shops in collection order, and no rider gate for collection', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { RouteStops } = await import('../src/v21/route-stops');
    for (const shops of [['stall'], ['stall', 'spaza'], ['stall', 'tavern'], ['stall', 'spaza', 'tavern']]) {
      for (const fulfilment of ['delivery', 'collection'] as const) {
        if (fulfilment === 'collection' && shops.length > 1) continue;
        const order = { fulfilment, state: 'new', customerName: 'Thabo', lines: shops.map(shop => ({shop,shopName:shop,outcome:'pending'})) } as unknown as import('../src/server/contracts').GateOrder;
        const html = renderToStaticMarkup(createElement(RouteStops, {order,stallName:'Kitchen'}));
        expect((html.match(/<li /g) || []).length).toBe(shops.length + (fulfilment === 'delivery' ? 1 : 0));
        expect(html.includes('spaza')).toBe(shops.includes('spaza'));
        expect(html.includes('tavern')).toBe(shops.includes('tavern'));
        expect(html.includes('Thabo')).toBe(fulfilment === 'delivery');
      }
    }
  });
});
