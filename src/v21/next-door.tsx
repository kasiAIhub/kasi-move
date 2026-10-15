import { useState } from 'react';
import type { GateItem } from '../server/contracts';
import { isAlcoholName, packagedProducts, productImage } from '../server/next-door';
import type { ShopSetting } from '../server/settings';
import { api, day, settingsOf, useResource, useTask, type OwnerData } from './client';
import { ProductImage } from '../components/ProductImage';
import { ErrorText, Frame, Loading, Photo } from './common';
export function NextDoor() {
  const resource = useResource<OwnerData>('/vendor/stall'), [editing, setEditing] = useState<'spaza' | 'tavern' | null>(null), [messageLink, setMessageLink] = useState('');
  if (!resource.data) return <Loading error={resource.error} />;
  const data = resource.data, shops = (settingsOf(data.stall).neighbours || []).filter(shop=>shop.type==='spaza');
  return <Frame vendor name={data.stall.name} open={Boolean(data.stall.is_open)}><h1>Next door</h1><p>Optional: add a nearby spaza. They do not need an account. Send the owner the WhatsApp introduction after saving; your delivery person buys the items there with cash.</p>
    {messageLink && <a className="v-button" href={messageLink} target="_blank" rel="noreferrer">Send the shop its WhatsApp message</a>}
    {editing ? <ShopForm key={editing} type={editing} shop={shops.find(shop => shop.type === editing)} menu={data.menu} cancel={() => setEditing(null)} saved={async link => { setMessageLink(link || ''); setEditing(null); await resource.reload(); }} /> : <>
      {shops.map(shop => <button className="v-card v-block" key={shop.type} onClick={() => setEditing(shop.type)}><strong>{shop.name}</strong><p>{shop.enabled ? 'On my menu' : 'Off my menu'} · {shop.phone}</p><span>Edit shop and items</span></button>)}
      {!shops.some(shop => shop.type === 'spaza') && <button className="v-button" onClick={() => setEditing('spaza')}>Add a spaza next door</button>}

    </>}
  </Frame>;
}
interface Entry { soldOutToday?: boolean; custom?: boolean; alcohol?: boolean; name: string; selected: boolean; price: string; image?: string }
function ShopForm({ type, shop, menu, saved, cancel }: { type: 'spaza' | 'tavern'; shop?: ShopSetting; menu: GateItem[]; saved: (link?: string) => Promise<void>; cancel: () => void }) {
  const config = useResource<{alcoholTesting: boolean}>('/config');
  const [name, setName] = useState(shop?.name || ''), [phone, setPhone] = useState(shop?.phone || ''), [enabled, setEnabled] = useState(shop?.enabled ?? true), task = useTask();
  const [rows, setRows] = useState<Entry[]>(() => [...packagedProducts.filter(item => item.shop === type).map(({ name, alcohol }) => {
    const existing = menu.find(item => item.shop === type && item.name === name);
    return { name, selected: Boolean(existing?.enabled), price: existing?.priceCents == null ? '' : String(existing.priceCents / 100), alcohol, soldOutToday: existing?.soldOutDate === day(Date.now()), image: productImage(name) || existing?.image };
  }), ...menu.filter(item => item.shop === type && !packagedProducts.some(product => product.shop === type && product.name === item.name)).map(item => ({ custom: true, name: item.name, selected: item.enabled, price: item.priceCents == null ? '' : String(item.priceCents / 100),  soldOutToday: item.soldOutDate === day(Date.now()), image: item.image, alcohol: item.alcohol }))]);
  const change = (index: number, value: Partial<Entry>) => setRows(rows => rows.map((row, i) => i === index ? { ...row, ...value } : row));
  return <form className="v-stack" onSubmit={event => { event.preventDefault(); void task.run(async () => {
    const result = await api('/vendor/shop', 'PUT', { type, name, phone, enabled, items: rows.filter(row => row.selected).map(row => ({ soldOutToday: row.soldOutToday, name: row.name, alcohol: row.alcohol === true, priceCents: Math.round(Number(row.price) * 100), image: row.image })) }); await saved(result.link);
  }); }}><h2>{shop ? 'Edit your shop next door' : `Add a ${type} next door`}</h2>
    <label>Shop name<input required value={name} onChange={event => setName(event.target.value)} /></label><label>Owner's WhatsApp<input required type="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label>
    {shop && <label className="v-choice"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />On my menu</label>}
    <h3>Choose items</h3>{type === 'tavern' && <p>{config.data?.alcoholTesting ? 'Alcohol is available for testing. Customers must confirm they are 18 or older.' : 'Alcohol is off until licensing is confirmed.'}</p>}
    {rows.map((row, index) => <section className="v-card v-stack" key={index}><label className="v-choice"><input type="checkbox" checked={row.selected} disabled={isAlcoholName(row.name) && !config.data?.alcoholTesting} onChange={event => change(index, { selected: event.target.checked })} />{row.name}</label>{row.selected && <>
      {row.custom && <label>Item name and pack size<input required maxLength={100} value={row.name} onChange={event => change(index, { name: event.target.value })} placeholder="e.g. Mama’s mango achaar 250g" /></label>}
      {row.custom && type === 'tavern' && <label className="v-choice"><input type="checkbox" checked={row.alcohol ?? true} onChange={event => change(index, { alcohol: event.target.checked })} />Contains alcohol (18+)</label>}
      <label>Price · R<input required type="number" min="0.01" step="0.01" value={row.price} onChange={event => change(index, { price: event.target.value })} /></label>
      <label className="v-choice"><input type="checkbox" checked={row.soldOutToday || false} onChange={event => change(index, { soldOutToday: event.target.checked })} />Sold out today</label><p>{row.soldOutToday ? 'Customers can choose something else. Available again tomorrow, or untick when restocked.' : 'Available'}</p>
      {productImage(row.name) ? <><ProductImage src={productImage(row.name)!} alt={row.name} /><p>Standard product picture included.</p></> : <Photo src={row.image} name={row.name} onChange={async image => change(index, { image })} />}
    </>}</section>)}<button type="button" className="v-button secondary" disabled={rows.length >= 60} onClick={() => setRows([...rows, { custom: true, selected: true, name: '', price: '', alcohol: type === 'tavern' }])}>+ Add your own item</button><ErrorText text={task.error} /><button className="v-button" disabled={task.busy}>Save shop</button><button type="button" className="v-link" onClick={cancel}>Cancel</button>
  </form>;
}
