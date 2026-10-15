import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Database, Statement } from '../src/server/database';
import { directoryHtml, directoryJson, listedStalls, robotsTxt, sitemapXml, stallLdTag } from '../src/server/directory';
import { DEMO_PHONE } from '../src/server/demo';

class Sqlite implements Database {
  constructor(readonly s: DatabaseSync) {}
  prepare(sql: string): Statement {
    const make = (args: unknown[]): Statement => ({ bind: (...v) => make(v), first: async <T>() => (this.s.prepare(sql).get(...args as never[]) as T) ?? null, all: async <T>() => ({ results: this.s.prepare(sql).all(...args as never[]) as T[] }), run: async () => ({ meta: { changes: Number(this.s.prepare(sql).run(...args as never[]).changes) } }) });
    return make([]);
  }
  async batch(st: Statement[]) { const r = []; for (const x of st) r.push(await x.run()); return r; }
}
const NOW = Date.parse('2026-10-15T10:00:00Z');
function setup() {
  const s = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) s.exec(readFileSync(join('drizzle', f), 'utf8'));
  const db = new Sqlite(s);
  const stall = (id: string, phone: string, name: string, town: string, o: { step?: number; activated?: number | null; paid?: number; rider?: string } = {}) =>
    s.prepare('INSERT INTO stalls(id,phone,name,town,hours,is_open,activated_at,rider_phone,settings) VALUES (?,?,?,?,?,?,?,?,?)').run(id, phone, name, town, '08:00–21:00', 1, o.activated === undefined ? NOW - 1000 : o.activated, o.rider ?? null, JSON.stringify({ setupStep: o.step ?? 9, billing: { paidThrough: o.paid ?? NOW + 86400000, payments: [] } }));
  const item = (id: string, stallId: string, extra: object) => s.prepare('INSERT INTO menu(id,stall_id,body) VALUES (?,?,?)').run(id, stallId, JSON.stringify({ id, name: 'Fish and chips', priceCents: 4000, shop: 'stall', shopName: 'Stall', enabled: true, ...extra }));
  return { s, db, stall, item };
}
describe('public directory', () => {
  it('lists only trading stalls and never leaks phones, test or half-set-up stalls', async () => {
    const { db, stall, item } = setup();
    stall('a', '+27811111111', 'Mama Fish', 'Mamelodi'); item('a1', 'a', {}); item('a2', 'a', { name: 'Castle Lager', priceCents: 3000 }); item('a3', 'a', { name: 'Hidden', enabled: false }); item('a4', 'a', { name: 'No price', priceCents: null });
    stall('b', '+27822222222', 'Half Setup', 'Mamelodi', { step: 5 }); item('b1', 'b', {});
    stall('c', '+27833333333', 'Unpaid', 'Soweto', { activated: null }); item('c1', 'c', {});
    stall('d', '+27844444444', 'Lapsed', 'Soweto', { paid: NOW - 1 }); item('d1', 'd', {});
    stall('e', '+27855555555', 'No menu', 'Soweto');
    stall('f', DEMO_PHONE, 'Demo Stall', 'Mamelodi'); item('f1', 'f', {});
    stall('g', '+27866666666', 'Neighbour only', 'Soweto'); item('g1', 'g', { shop: 'spaza' });
    const list = await listedStalls(db, NOW);
    expect(list.map(x => x.id)).toEqual(['a']);
    expect(list[0].items).toEqual([{ name: 'Fish and chips', priceCents: 4000 }]);
    const origin = 'https://move.kasiaihub.com';
    const all = JSON.stringify(directoryJson(list, origin)) + directoryHtml(list, origin) + sitemapXml(list, origin) + stallLdTag(list[0], origin);
    expect(all).not.toContain('27811111111'); expect(all).not.toContain('Castle'); expect(all).not.toContain('Demo');
    expect(directoryJson(list, origin, 'soweto').stalls).toHaveLength(0);
    expect(directoryJson(list, origin, 'mamelodi').stalls[0].url).toBe(origin + '/stall/a');
    expect(stallLdTag(list[0], origin)).toContain('"priceCurrency":"ZAR"');
    expect(robotsTxt(origin)).toContain('Sitemap: ' + origin + '/sitemap.xml');
  });
  it('shows a special only inside its window', async () => {
    const { s, db, stall, item } = setup();
    stall('a', '+27811111111', 'Mama Fish', 'Mamelodi'); item('a1', 'a', {});
    const set = (sp: object) => s.prepare("UPDATE stalls SET settings=json_patch(settings,?) WHERE id='a'").run(JSON.stringify({ special: sp }));
    set({ text: 'Friday kota R25', from: NOW - 1000, to: NOW + 1000 });
    expect((await listedStalls(db, NOW))[0].special?.text).toBe('Friday kota R25');
    expect(directoryHtml(await listedStalls(db, NOW), 'https://m')).toContain('Friday kota R25');
    expect((await listedStalls(db, NOW + 2000))[0].special).toBeNull();
    set({ text: 'Later', from: NOW + 5000, to: NOW + 9000 });
    expect((await listedStalls(db, NOW))[0].special).toBeNull();
  });
  it('escapes vendor text', async () => {
    const { db, stall, item } = setup();
    stall('x', '+27877777777', '<script>alert(1)</script>', 'Town'); item('x1', 'x', {});
    const list = await listedStalls(db, NOW);
    expect(directoryHtml(list, 'https://m')).not.toContain('<script>alert');
    expect(stallLdTag(list[0], 'https://m').slice(40, -9)).not.toContain('<');
  });
});
