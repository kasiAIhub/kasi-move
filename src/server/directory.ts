import type { Database, StallRow } from './database';
import type { GateItem } from './contracts';
import type { StallSettings } from './settings';
import { DEMO_PHONE } from './demo';
import { isAlcoholName } from './next-door';
import { stallPlan } from './plan';

/** Public directory: read-only view over stalls and menu. Lists only stalls that are actually trading. */
export interface DirectoryItem { name: string; priceCents: number }
export interface DirectoryStall { id: string; name: string; town: string; hours: string; takesCard: boolean; delivery: boolean; items: DirectoryItem[]; special: { text: string; to: number } | null }

export async function listedStalls(db: Database, now: number): Promise<DirectoryStall[]> {
  const rows = (await db.prepare("SELECT * FROM stalls WHERE phone<>? AND activated_at IS NOT NULL AND name<>'' AND town<>'' ORDER BY town COLLATE NOCASE, name COLLATE NOCASE").bind(DEMO_PHONE).all<StallRow>()).results;
  const out: DirectoryStall[] = [];
  for (const row of rows) {
    let settings: StallSettings;
    try { settings = JSON.parse(row.settings); } catch { continue; }
    if (!((settings.setupStep ?? 0) >= 9) || !stallPlan(row, now).active) continue;
    const items = await stallItems(db, row.id);
    if (!items.length) continue;
    out.push({ id: row.id, name: row.name, town: row.town, hours: row.hours, takesCard: Boolean(row.takes_card), delivery: Boolean(row.rider_phone) && settings.deliveryEnabled !== false, items, special: settings.special && settings.special.from <= now && now < settings.special.to ? { text: settings.special.text, to: settings.special.to } : null });
  }
  return out;
}
export async function listedStall(db: Database, id: string, now: number) {
  return (await listedStalls(db, now)).find(stall => stall.id === id) ?? null;
}
async function stallItems(db: Database, stallId: string): Promise<DirectoryItem[]> {
  const rows = (await db.prepare('SELECT body FROM menu WHERE stall_id=? ORDER BY rowid').bind(stallId).all<{ body: string }>()).results;
  const items: DirectoryItem[] = [];
  for (const row of rows) {
    let item: GateItem; try { item = JSON.parse(row.body); } catch { continue; }
    if (item.shop !== 'stall' || !item.enabled || item.alcohol || isAlcoholName(item.name) || item.priceCents === null || !Number.isFinite(item.priceCents)) continue;
    items.push({ name: item.name, priceCents: item.priceCents });
  }
  return items;
}

const untilText = (t: number) => new Date(t).toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
const rand = (cents: number) => 'R' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ldText = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export function stallLd(stall: DirectoryStall, origin: string) {
  const [open, close] = stall.hours.split(/\s*[–-]\s*/);
  return {
    '@context': 'https://schema.org', '@type': 'Restaurant', '@id': `${origin}/stall/${stall.id}`, url: `${origin}/stall/${stall.id}`,
    name: stall.name, address: { '@type': 'PostalAddress', addressLocality: stall.town, addressCountry: 'ZA' }, priceRange: stall.items.length ? `${rand(Math.min(...stall.items.map(i => i.priceCents)))}-${rand(Math.max(...stall.items.map(i => i.priceCents)))}` : undefined,
    paymentAccepted: stall.takesCard ? 'Cash, Card' : 'Cash', ...(open && close ? { openingHours: `${open}-${close}` } : {}),
    hasMenu: { '@type': 'Menu', hasMenuSection: [{ '@type': 'MenuSection', name: 'Menu', hasMenuItem: stall.items.map(item => ({ '@type': 'MenuItem', name: item.name, offers: { '@type': 'Offer', price: (item.priceCents / 100).toFixed(2), priceCurrency: 'ZAR' } })) }] },
  };
}
export const stallLdTag = (stall: DirectoryStall, origin: string) => `<script type="application/ld+json">${ldText(stallLd(stall, origin))}</script>`;

export function directoryJson(stalls: DirectoryStall[], origin: string, town?: string) {
  const wanted = town?.trim().toLowerCase();
  return { stalls: stalls.filter(s => !wanted || s.town.toLowerCase() === wanted).map(s => ({ id: s.id, name: s.name, town: s.town, hours: s.hours, takesCard: s.takesCard, delivery: s.delivery, special: s.special ? { text: s.special.text, until: new Date(s.special.to).toISOString() } : null, url: `${origin}/stall/${s.id}`, currency: 'ZAR', items: s.items.map(i => ({ name: i.name, priceCents: i.priceCents })) })) };
}

export function directoryHtml(stalls: DirectoryStall[], origin: string) {
  const towns = [...new Set(stalls.map(s => s.town))];
  const body = towns.length ? towns.map(town => `<section><h2>${esc(town)}</h2>${stalls.filter(s => s.town === town).map(s => `<article><h3><a href="/stall/${esc(s.id)}">${esc(s.name)}</a></h3><p class="m">${esc(s.hours)} · ${s.takesCard ? 'Cash or card' : 'Cash'}${s.delivery ? ' · Delivery' : ''}</p>${s.special ? `<p class="sp"><b>Special:</b> ${esc(s.special.text)} <span class="m">until ${untilText(s.special.to)}</span></p>` : ''}<ul>${s.items.slice(0, 4).map(i => `<li>${esc(i.name)} <b>${rand(i.priceCents)}</b></li>`).join('')}</ul><p><a class="b" href="/stall/${esc(s.id)}">See menu and order</a></p></article>`).join('')}</section>`).join('') : '<p>No stalls are trading yet. Check back soon.</p>';
  const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Kasi Move stalls', itemListElement: stalls.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${origin}/stall/${s.id}`, name: s.name })) };
  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kasi Move · Food stalls near you</title><meta name="description" content="Food stalls trading on Kasi Move, with menus and prices. Order from your phone."><link rel="canonical" href="${esc(origin)}/directory"><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#07120d;color:#f3f7f4}main{max-width:720px;margin:auto;padding:20px}h1{font-size:28px}h2{margin-top:32px;border-bottom:1px solid #2c4a3b}article{background:#10231a;border-radius:12px;padding:12px 16px;margin:12px 0}h3{margin:0}a{color:#7fe3a8}.m{color:#a9c4b4;margin:2px 0}ul{padding-left:18px}.b{font-weight:600}.sp{background:#1d4a31;border-radius:8px;padding:6px 10px;margin:8px 0}</style><script type="application/ld+json">${ldText(ld)}</script></head><body><main><h1>Kasi Move food stalls</h1><p>Stalls that are trading now, with their menus and prices.</p>${body}</main></body></html>`;
}

export const sitemapXml = (stalls: DirectoryStall[], origin: string) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(origin)}/directory</loc></url>${stalls.map(s => `<url><loc>${esc(origin)}/stall/${esc(s.id)}</loc></url>`).join('')}</urlset>`;
export const robotsTxt = (origin: string) => `User-agent: *\nAllow: /directory\nAllow: /stall/\nAllow: /api/directory\nDisallow: /owner/\nDisallow: /admin\nDisallow: /kitchen\nDisallow: /rider\nSitemap: ${origin}/sitemap.xml\n`;
export const llmsTxt = (origin: string) => `# Kasi Move\nOrdering platform for food vendors in South African communities.\nTrading stalls with menus and prices (ZAR cents): ${origin}/api/directory (optional ?town=Mamelodi)\nHuman page: ${origin}/directory\nEach stall has a page at ${origin}/stall/<id>. Data is read-only; ordering happens on the stall page.\n`;
