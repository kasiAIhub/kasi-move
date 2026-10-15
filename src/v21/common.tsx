import { isShortStallPath } from '../server/slug';
import { useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Camera } from 'lucide-react';
import { ProductImage } from '../components/ProductImage';
import { api, useTask, useIdentity } from './client';
export const ErrorText = ({ text }: { text?: string }) => text ? <p className="v-error" role="alert">{text}</p> : null;
export function Back({ fallback = '/' }: { fallback?: string }) { const navigate = useNavigate(), location = useLocation(); const home = location.pathname.match(/^\/stall\/[^/]+/)?.[0] || (location.pathname.startsWith('/order/') ? '/my-orders' : fallback); return <button className="v-back" aria-label="Back" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate(home)}><ArrowLeft size={18} />Back</button>; }
export function ViewSwitcher() {
  const identity = useIdentity(), task = useTask(), navigate = useNavigate(), location = useLocation();
  const customer = /^\/(stall|order|my-orders)(\/|$)/.test(location.pathname) || isShortStallPath(location.pathname);
  if (!identity.session?.ownerSetupComplete || location.pathname.startsWith('/setup')) return null;
  return <div className="v-view-switch"><nav aria-label="App view"><button aria-pressed={!customer} disabled={task.busy} onClick={() => task.run(async () => { await api('/auth/owner', 'POST', {}); await identity.refresh(); navigate('/kitchen'); })}>Owner view</button><button aria-pressed={customer} disabled={task.busy} onClick={() => task.run(async () => { const id = identity.session?.ownerStallId; await api('/auth/customer', 'POST', {}); navigate('/stall/' + id); await identity.refresh(); })}>Customer view</button></nav><ErrorText text={task.error} /></div>;
}
export function Frame({ children, name, open, vendor = false, back = true }: { children: ReactNode; name?: string; open?: boolean; vendor?: boolean; back?: boolean }) {
  const customerPath = useLocation().pathname, customer = /^\/(stall|order|my-orders)(\/|$)/.test(customerPath) || isShortStallPath(customerPath);
  const { session } = useIdentity(), demo = vendor && Boolean(session?.demo);
  return <div className={customer ? 'v-app v-premium' : 'v-app'}>{demo && <div className="v-card" role="status" style={{background:'#fff3cd',textAlign:'center',padding:'6px'}}><strong>Demo stall</strong> - practice only. No messages are sent and no payments are taken. It resets each time you sign in.</div>}<header className="v-header">{(vendor || customer) && <ViewSwitcher />}<small className="v-brand">Kasi Move</small>{back && <Back fallback={vendor ? '/kitchen' : '/'} />}{name && <div className="v-header-name"><strong>{name}</strong>{open !== undefined && <span className={open ? 'v-open' : 'muted'}>{open ? 'OPEN' : 'CLOSED'}</span>}</div>}</header><main className="v-main">{children}</main>{vendor && <nav className="v-nav" aria-label="Owner navigation">{[['/kitchen', 'Orders'], ['/owner/menu', 'Menu'], ['/owner/dashboard', 'Money'], ['/owner/more', 'More']].map(([path, label]) => <NavLink key={path} to={path}>{label}</NavLink>)}</nav>}</div>;
}
export function Loading({ error }: { error?: string }) { return <Frame><section className="v-card v-stack" aria-live="polite"><h1>Opening Kasi Move</h1><p>{error ? "We could not load this page." : "Getting your saved details ready…"}</p><ErrorText text={error}/>{error&&<button className="v-button secondary" onClick={()=>window.location.reload()}>Try loading again</button>}</section></Frame>; }
export function Photo({ src, name, onChange }: { src?: string; name: string; onChange: (image: string) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null), [choosing, setChoosing] = useState(false), task = useTask();
  async function upload(file: File) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 900;
    const context = canvas.getContext('2d')!;
    const size = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 900, 900); bitmap.close();
    const image = context.getImageData(0, 0, 900, 900); let light = 0;
    for (let i = 0; i < image.data.length; i += 4) light += (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
    const gain = Math.min(1.2, Math.max(1, 110 / (light / (900 * 900) || 1)));
    for (let i = 0; i < image.data.length; i += 4) for (let channel = 0; channel < 3; channel++) image.data[i + channel] = Math.min(255, image.data[i + channel] * gain * [1.025, 1, .975][channel]);
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare this photo.')), 'image/jpeg', .88));
    const result = await api('/vendor/photo', 'POST', blob); await onChange(result.image);
  }
  return <div><button type="button" className="v-photo" disabled={task.busy} onClick={() => setChoosing(!choosing)} aria-label={`Add photo of ${name}`}>
    {src ? <ProductImage src={src} alt={name} /> : <Camera size={30} />}{(!src||task.busy)&&<span>{task.busy ? 'Saving…' : name}</span>}</button>
    {choosing && <div className="v-row"><button type="button" className="v-link" onClick={() => input.current?.click()}>Camera</button><button type="button" className="v-link" onClick={() => gallery.current?.click()}>Gallery</button></div>}
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { const file = event.target.files?.[0]; if (file) void task.run(() => upload(file)); }} />
    <input ref={gallery} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void task.run(() => upload(file)); }} /><ErrorText text={task.error} /></div>;
}
export function OrderLink({ count, path, total }: { count: number; path: string; total?:number }) { return count > 0 ? <Link className="v-order-link" to={path}>{total===undefined?<>View your order <strong>{count}</strong></>:<>{count} {count===1?'item':'items'} - R{(total/100).toFixed(2)} - View order</>}</Link> : null; }
