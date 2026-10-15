import { useEffect, useState } from 'react';
import { api, useTask } from './client';
import { ErrorText } from './common';

export function AdminCodeSettings({ isSet, reload }: { isSet: boolean; reload: () => Promise<unknown> }) {
  const [code, setCode] = useState(''), [again, setAgain] = useState(''), [current, setCurrent] = useState(''), [message, setMessage] = useState('');
  const task = useTask();
  return <details className="v-card"><summary>{isSet ? 'Change my admin code' : 'Set my own admin code'}</summary>
    <form className="v-stack" onSubmit={event => { event.preventDefault(); setMessage(''); if (code.trim() !== again.trim()) { setMessage('The two codes do not match.'); return; }
      void task.run(async () => { const body: Record<string, string> = { code }; if (isSet) { if (current.length >= 32) body.key = current; else body.current = current; } await api('/admin/code/set', 'POST', body); setCode(''); setAgain(''); setCurrent(''); setMessage('Saved. Use this code to sign in from now on.'); await reload(); }); }}>
      <p>Pick something you can type easily, at least 6 characters. A short code is easier to guess than the long key. Sign-in tries are limited, but choose something other people would not guess.</p>
      {isSet && <label>Current admin code (or the long admin key)<input type="password" required value={current} onChange={event => setCurrent(event.target.value)} /></label>}
      <label>New admin code<input type="password" autoComplete="new-password" minLength={6} maxLength={64} required value={code} onChange={event => setCode(event.target.value)} /></label>
      <label>Type it again<input type="password" autoComplete="new-password" minLength={6} maxLength={64} required value={again} onChange={event => setAgain(event.target.value)} /></label>
      <button className="v-button" disabled={task.busy}>{isSet ? 'Change my code' : 'Save my code'}</button>
      {message && <p role="status">{message}</p>}<ErrorText text={task.error} />
    </form></details>;
}

export function AddVendor({ reload }: { reload: () => Promise<unknown> }) {
  const [phone, setPhone] = useState(''), [name, setName] = useState(''), [town, setTown] = useState(''), [hours, setHours] = useState('08:00–21:00'), [done, setDone] = useState('');
  const task = useTask();
  return <details className="v-card"><summary>Add a vendor by hand</summary>
    <form className="v-stack" onSubmit={event => { event.preventDefault(); setDone(''); void task.run(async () => { await api('/admin/vendor', 'POST', { phone, name, town, hours }); setDone('Added ' + name + '. They sign in with their WhatsApp number and a code, and finish the menu themselves.'); setPhone(''); setName(''); setTown(''); await reload(); }); }}>
      <label>WhatsApp number<input type="tel" required value={phone} onChange={event => setPhone(event.target.value)} placeholder="081 234 5678" /></label>
      <label>Stall name<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Town<input required maxLength={100} value={town} onChange={event => setTown(event.target.value)} /></label>
      <label>Hours<input required value={hours} onChange={event => setHours(event.target.value)} /></label>
      <button className="v-button" disabled={task.busy}>Add vendor</button>{done && <p role="status">{done}</p>}<ErrorText text={task.error} />
    </form></details>;
}

export function VendorTools({ stall, paid, reload }: { stall: { id: string; name: string; phone: string; town?: string; hours?: string }; paid: boolean; reload: () => Promise<unknown> }) {
  const [name, setName] = useState(stall.name || ''), [town, setTown] = useState(stall.town || ''), [hours, setHours] = useState(stall.hours || '08:00–21:00');
  const [confirm, setConfirm] = useState(''), [ack, setAck] = useState(false), [saved, setSaved] = useState('');
  const task = useTask();
  return <><details><summary>Edit name, town and hours</summary>
    <form className="v-stack" onSubmit={event => { event.preventDefault(); setSaved(''); void task.run(async () => { await api('/admin/vendor', 'PUT', { stallId: stall.id, name, town, hours }); setSaved('Saved.'); await reload(); }); }}>
      <label>Stall name<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Town<input required maxLength={100} value={town} onChange={event => setTown(event.target.value)} /></label>
      <label>Hours<input required value={hours} onChange={event => setHours(event.target.value)} /></label>
      <button className="v-button secondary" disabled={task.busy}>Save changes</button>{saved && <p role="status">{saved}</p>}
    </form></details>
    <details><summary>Remove this stall</summary>
      <div className="v-stack"><p>This deletes the stall, its menu, orders, team and sign-ins for good. It cannot be undone. Type the vendor number <strong>{stall.phone.replace(/^\+27/, '0')}</strong> to confirm.</p>
        <label>Vendor number<input type="tel" value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
        {paid && <label><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} /> This vendor has paid and I still want to remove them</label>}
        <button className="v-button secondary" disabled={task.busy || !confirm.trim() || (paid && !ack)} onClick={() => { void task.run(async () => { await api('/admin/stall/remove', 'POST', { phone: stall.phone, confirmPhone: confirm, paidAck: ack }); await reload(); }); }}>Remove stall for good</button>
        <ErrorText text={task.error} /></div></details></>;
}

export function AdminQr() {
  const [src, setSrc] = useState('');
  const link = window.location.origin + '/admin';
  useEffect(() => { let alive = true; void import('qrcode').then(QR => QR.toDataURL(link, { width: 600, margin: 4, errorCorrectionLevel: 'M' })).then(url => { if (alive) setSrc(url); }).catch(() => {}); return () => { alive = false; }; }, [link]);
  return <details className="v-card"><summary>QR code for this admin page</summary>
    <div className="v-stack"><p>Scan it from another device to open the sign-in page. It holds only {link}. It carries no key and no code.</p>
      {src ? <><img src={src} alt={'QR code for ' + link} style={{ width: 240, maxWidth: '100%', alignSelf: 'center' }} /><a className="v-button secondary" href={src} download="kasi-move-admin-qr.png">Download QR code</a></> : <p>Preparing the QR code…</p>}</div></details>;
}
