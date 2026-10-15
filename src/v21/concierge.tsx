import { useRef, useState } from 'react';
import { api, useResource, useTask } from './client';
import { ErrorText } from './common';
import { preparePhoto } from './photos';
import type { GateItem } from '../server/contracts';

interface Row { id: string; name: string; price: string }
interface Summary { id: string; name: string; town: string; phone: string; items: number; photos: number; ready: boolean }

export function Concierge() {
  const list = useResource<{ stalls: Summary[] }>('/admin/concierge', true), [open, setOpen] = useState<string | null>(null);
  const [phone, setPhone] = useState(''), [name, setName] = useState(''), [town, setTown] = useState(''), [hours, setHours] = useState('08:00–21:00'), [card, setCard] = useState(false);
  const task = useTask();
  return <section className="v-card v-stack"><h2>Set up a stall for a vendor</h2>
    <p>Build the stall from what the vendor sent you on WhatsApp: name, town, menu, prices and photos. When it is ready, send them one link and their stall opens.</p>
    {list.data?.stalls.map(s => <div key={s.id} className="v-stack">
      <button className="v-button secondary" onClick={() => setOpen(open === s.id ? null : s.id)}>{s.name} · {s.town} · {s.photos}/{s.items} photos · {s.ready ? 'ready' : 'in progress'}</button>
      {open === s.id && <StallBuilder id={s.id} reload={list.reload} />}</div>)}
    <details><summary>Start a new stall</summary>
      <form className="v-stack" onSubmit={event => { event.preventDefault(); void task.run(async () => { const result = await api('/admin/concierge/stall', 'POST', { phone, name, town, hours, takesCard: card }); setPhone(''); setName(''); setTown(''); await list.reload(); setOpen(result.stallId); }); }}>
        <label>Vendor WhatsApp number<input type="tel" required value={phone} onChange={event => setPhone(event.target.value)} placeholder="081 234 5678" /></label>
        <label>Stall name<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Town<input required maxLength={100} value={town} onChange={event => setTown(event.target.value)} /></label>
        <label>Hours<input required value={hours} onChange={event => setHours(event.target.value)} /></label>
        <label><input type="checkbox" checked={card} onChange={event => setCard(event.target.checked)} /> Takes card payments</label>
        <button className="v-button" disabled={task.busy}>Create the stall</button><ErrorText text={task.error} />
      </form></details>
    <ErrorText text={list.error} /></section>;
}

function StallBuilder({ id, reload }: { id: string; reload: () => Promise<unknown> }) {
  const res = useResource<{ stall: { name: string; phone: string }; menu: GateItem[]; ready: boolean }>('/admin/concierge/stall/' + id, true), task = useTask();
  const [row, setRow] = useState<Row>({ id: '', name: '', price: '' }), [claim, setClaim] = useState<{ link: string; whatsapp: string; expiresAt: number } | null>(null), [copied, setCopied] = useState(false);
  const fileFor = useRef<string>('');
  const input = useRef<HTMLInputElement>(null);
  const base = '/admin/concierge/stall/' + id;
  const refresh = async () => { await res.reload(); await reload(); };
  if (!res.data) return <p>Loading…</p>;
  const items = res.data.menu.filter(item => item.shop === 'stall');
  return <div className="v-stack">
    <input ref={input} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0], itemId = fileFor.current; event.target.value = ''; if (file && itemId) void task.run(async () => { await api(base + '/photo/' + itemId, 'POST', await preparePhoto(file)); await refresh(); }); }} />
    <h3>Menu</h3>
    {items.map(item => <div key={item.id} className="v-row">
      {item.image ? <img src={item.image} alt={item.name} style={{ width: 56, height: 56, maxWidth: 56, borderRadius: 8, objectFit: 'cover', flex: 'none' }} /> : <span aria-hidden>📷</span>}
      <span style={{ flex: 1 }}>{item.name} · {item.priceCents === null ? 'no price' : 'R' + (item.priceCents / 100).toFixed(2)}</span>
      <button className="v-button secondary" onClick={() => { fileFor.current = item.id; input.current?.click(); }}>{item.image ? 'Change photo' : 'Add photo'}</button>
      <button className="v-button secondary" onClick={() => void task.run(async () => { await api(base + '/menu/' + item.id, 'DELETE'); await refresh(); })}>Remove</button></div>)}
    <form className="v-stack" onSubmit={event => { event.preventDefault(); void task.run(async () => { const rand = Number(row.price.replace(',', '.')); await api(base + '/menu', 'PUT', { name: row.name, priceCents: Math.round(rand * 100) }); setRow({ id: '', name: '', price: '' }); await refresh(); }); }}>
      <label>Food name<input required maxLength={100} value={row.name} onChange={event => setRow({ ...row, name: event.target.value })} /></label>
      <label>Price in rand<input required inputMode="decimal" value={row.price} onChange={event => setRow({ ...row, price: event.target.value })} placeholder="35" /></label>
      <button className="v-button secondary" disabled={task.busy}>Add to menu</button></form>
    <button className="v-button" disabled={task.busy} onClick={() => void task.run(async () => { await api(base + '/ready', 'POST', {}); await refresh(); })}>{res.data.ready ? 'Stall is ready' : 'Mark the stall ready'}</button>
    {res.data.ready && <><button className="v-button" disabled={task.busy} onClick={() => void task.run(async () => { setClaim(await api(base + '/claim', 'POST', {})); })}>{claim ? 'Make a new link' : 'Make the vendor link'}</button>
      <p>A new link replaces the old one. It stays valid for 14 days, until you make a new one. The vendor can always sign in later with {res.data.stall.phone.replace(/^\+27/, '0')}.</p></>}
    {claim && <div className="v-stack"><p>Link for {res.data.stall.name}:</p><code style={{ wordBreak: 'break-all' }}>{claim.link}</code>
      <button className="v-button secondary" onClick={() => void navigator.clipboard.writeText(claim.link).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy the link'}</button>
      <a className="v-button" href={claim.whatsapp} target="_blank" rel="noreferrer">Send on WhatsApp</a></div>}
    <ErrorText text={task.error || res.error} /></div>;
}
