import {AdminPhotos} from './photos';
import {Connectors,type Referrals} from './connectors';
import { useEffect, useState } from 'react';
import { api, useResource, useTask, wa, rand } from './client';
import { stallPlan, LAUNCH_PRICE, MONTHLY_PRICE } from '../server/plan';
import type { StallRow } from '../server/database';
import { ErrorText, Frame } from './common';
interface AdminData {
  referrals:Referrals;
  whatsapp?: { configured: boolean; mode: string; inbox: {id:string;phone:string;text:string;sent_at:number}[]; deliveries: {id:string;phone:string;kind:string;manualText?:string;status:string;error:string|null;created_at:number}[] };

  codes: { phone: string; code: string | null; expiresAt: number }[];
  stalls: { id: string; name: string; referral_name?: string; phone: string; first_order_at: number | null; activated_at: number | null; payment_reported_at: number | null }[];
}
const localPhone = (phone: string) => phone.replace(/^\+27/, '0');
export function Admin() {
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const key = new URLSearchParams(window.location.hash.slice(1)).get('access');
    window.history.replaceState(null, '', '/admin' + window.location.search);
    void (key ? api('/admin/login', 'POST', { key }) : Promise.resolve()).then(() => setReady(true)).catch(error => { setError(error.message); setReady(true); });
  }, []);
  return ready ? <AdminSigned initialError={error} /> : <Frame><h1>Opening admin…</h1></Frame>;
}
function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [key, setKey] = useState(''), [remember, setRemember] = useState(false);
  const task = useTask();
  return <Frame><h1>Admin sign-in</h1><p>This is where Thandi sends vendor login codes.</p>
    <p>Sign in using your private admin key or private admin link. Bookmark <strong>move.kasiaihub.com/admin</strong>.</p>
    <form className="v-stack" onSubmit={event => { event.preventDefault(); void task.run(async () => {
      let access = key.trim();
      if (access.includes('#access=')) access = new URLSearchParams(access.split('#')[1]).get('access') || '';
      await api('/admin/login','POST',{key:access});
      if (remember) await api('/admin/remember','POST',{});
      setKey(''); onSignedIn();
    }); }}>
      <label>Private admin key or link<input type="password" autoComplete="current-password" required value={key} onChange={event=>setKey(event.target.value)} /></label>
      <label><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)} /> Keep me signed in for 30 days on my own device</label>
      <button className="v-button" disabled={task.busy}>Open login requests</button><ErrorText text={task.error}/>
    </form><p>Your private key is different from a vendor's four-digit code. Keep it private.</p>
  </Frame>;
}
function AdminSigned({ initialError }: { initialError: string }) {
  const [reference,setReference]=useState<Record<string,string>>({});
  const [search,setSearch]=useState(new URLSearchParams(window.location.search).get('phone') || '');
  const [remembered,setRemembered]=useState(false), [fallback,setFallback]=useState<Record<string,string>>({});
  const [signedOut,setSignedOut]=useState(false);
  const resource = useResource<AdminData>('/admin', true), task = useTask();
  if (signedOut || resource.error === 'Sign in to open your login requests.') return <AdminLogin onSignedIn={()=>{setSignedOut(false); void resource.reload();}}/>;
  const digits = search.replace(/\D/g,'').replace(/^27/,'0');
  const rows = resource.data?.codes.filter(row=>localPhone(row.phone).includes(digits)) || [];
  return <Frame><h1>Login requests</h1><p>Bookmark <strong>move.kasiaihub.com/admin</strong>. Requests refresh while this page is open.</p>
    <ErrorText text={resource.error || task.error || initialError} />
    {resource.data && <><button className="v-button secondary" disabled={task.busy || remembered} onClick={()=>{void task.run(async()=>{await api('/admin/remember','POST',{});setRemembered(true);});}}>{remembered?'Signed in for 30 days on this device':'Keep admin signed in on my device'}</button>
      <button className="v-link" onClick={()=>{void task.run(async()=>{await api('/admin/logout','POST',{});setSignedOut(true);resource.setData(null);});}}>Sign out of admin</button>
      <p>{resource.data.whatsapp?.configured ? 'Create a code to request WhatsApp delivery through Meta. Check the message log below for its result. Manual sending remains available.' : 'Find the number from the WhatsApp request, tap Send code on WhatsApp, then tap Send in WhatsApp.'}</p>
      <label>Find a WhatsApp number<input type="tel" value={search} onChange={event=>setSearch(event.target.value)} placeholder="081 234 5678" /></label>
      <button className="v-link" onClick={()=>{setSearch(''); window.history.replaceState(null,'','/admin');}}>Show all requests ({resource.data.codes.length})</button>
      <button className="v-link" onClick={()=>{void resource.reload();}}>Refresh requests</button>
      {resource.data.codes.some(row=>!row.code)&&<button className="v-link" disabled={task.busy} onClick={()=>{void task.run(async()=>{await api('/admin/codes/clear','POST',{all:'stale'});await resource.reload();});}}>Clear all waiting and expired requests ({resource.data.codes.filter(row=>!row.code).length})</button>}
      {!rows.length && <p>{search?'No waiting request for this number. Ask them to open move.kasiaihub.com/login and tap Get my code on WhatsApp.':'No login requests waiting. New requests will appear here.'}</p>}
      {rows.map(row => <div className="v-card v-stack" key={row.phone}>
        <h2>{localPhone(row.phone)}</h2><small>{row.phone}</small>
        <p>{resource.data?.stalls.find(stall=>stall.phone===row.phone)?.name || 'New stall / setup in progress'}</p>
        {row.code ? <><span>Current login code</span><b className="v-login-code">{row.code}</b><p>Valid until {new Date(row.expiresAt).toLocaleTimeString('en-ZA',{timeZone:'Africa/Johannesburg'})} SAST. Sending again keeps this same code and expiry.</p></> : <p>{row.expiresAt?'Previous code expired. Send a new code below.':'Waiting for you. The 10-minute timer has not started.'}</p>}
        <button className="v-button" disabled={task.busy} onClick={()=>{
          const popup=resource.data?.whatsapp?.configured ? null : window.open('','_blank'); if(popup) popup.opener=null;
          void task.run(async()=>{try {
            const fresh=await api('/admin/code','POST',{phone:row.phone});
            const link=wa(row.phone,codeMessage(fresh.code,fresh.expiresAt,row.phone));
            if(popup) popup.location.href=link; else setFallback({...fallback,[row.phone]:link});
            await resource.reload();
          } catch(error){popup?.close();throw error;}});
        }}>{resource.data?.whatsapp?.configured ? (row.code ? 'Use current code' : 'Create code and send') : 'Send code on WhatsApp'}</button>
        <button className="v-link" disabled={task.busy} onClick={()=>{void task.run(async()=>{await api('/admin/codes/clear','POST',{phone:row.phone});await resource.reload();});}}>Dismiss this request</button>
        {fallback[row.phone]&&<a className="v-button secondary" href={fallback[row.phone]} target="_blank" rel="noreferrer">Send manually in WhatsApp</a>}
      </div>)}
      {resource.data.whatsapp && <section className="v-card v-stack"><h2>WhatsApp · {resource.data.whatsapp.mode === 'live' ? 'Live' : 'Test mode'}</h2><p>{resource.data.whatsapp.configured ? (resource.data.whatsapp.mode === 'live' ? 'Meta is configured. Delivery depends on approved templates and a valid token.' : 'Only the verified test recipient receives automated messages.') : 'Meta is not connected. Keep using manual sending.'}</p><details><summary>Message log</summary><p>Accepted means Meta accepted the request; delivered confirms delivery. Before retrying an interrupted send, check Meta to avoid duplicates.</p>{!resource.data.whatsapp.deliveries.length && <p>No messages yet.</p>}{resource.data.whatsapp.deliveries.map(message=><div className="v-card v-stack" key={message.id}><strong>+{message.phone} · {message.kind === 'login' ? 'Login code' : message.kind === 'customer' ? 'Customer verification' : message.kind==='activation'?'Payment confirmation':message.kind==='assignment'?'Delivery assignment':message.kind==='cancellation'?'Order cancelled':'Order alert'}</strong><span>{message.status.replaceAll('_',' ')}</span>{message.error && <p role="status">{message.error}</p>}{message.manualText&&!['delivered','read','superseded'].includes(message.status)&&<a className="v-button secondary" href={wa(message.phone,message.manualText)} target="_blank" rel="noreferrer">Send manually on WhatsApp</a>}{['failed','queued','not_configured','sending'].includes(message.status) && <button className="v-button secondary" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/admin/whatsapp/retry','POST',{id:message.id});await resource.reload();})}>Retry message</button>}</div>)}</details><details><summary>Incoming WhatsApp replies</summary>{!resource.data.whatsapp.inbox.length && <p>No replies received yet.</p>}{resource.data.whatsapp.inbox.map(message=><div className="v-card v-stack" key={message.id}><strong>+{message.phone}</strong><small>{new Date(message.sent_at).toLocaleString('en-ZA')}</small><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{message.text}</p></div>)}</details></section>}
      <Connectors report={resource.data.referrals} reload={resource.reload}/><details><summary>All vendors and payments ({resource.data.stalls.length})</summary>
      <h2>All vendors</h2><p>{LAUNCH_PRICE}<br/>{MONTHLY_PRICE}</p><p>Every registered stall appears here, including owners still setting up. Open a menu to review its food photos.</p>{!resource.data.stalls.length && <p>No vendors registered yet.</p>}{resource.data.stalls.map(stall => { const plan=stallPlan(stall as StallRow,Date.now()); return <div className="v-card v-stack" key={stall.id}><h3>{stall.name || 'Setting up'}</h3><AdminPhotos stallId={stall.id}/><a className="v-button secondary" href={'/stall/'+stall.id} target="_blank" rel="noreferrer">View menu and photos</a><a href={wa(stall.phone)}>{stall.phone}</a><div className="v-row"><span>Referral name</span><strong>{stall.referral_name || '—'}</strong></div><div className="v-row"><span>Referral fee owed</span><strong>{rand(resource.data!.referrals.awards.find(a=>a.stall_id===stall.id&&a.paid_at===null)?.amount_cents||0)}</strong></div>{resource.data!.referrals.awards.some(a=>a.stall_id===stall.id&&a.paid_at!==null)&&<p>Referral payout PAID</p>}<p>First order: {stall.first_order_at ? new Date(stall.first_order_at).toLocaleDateString('en-ZA') : 'None yet'}</p><p>{plan.paidThrough?'Paid through '+new Date(plan.paidThrough).toLocaleDateString('en-ZA'):'Setup payment due'}</p>{stall.payment_reported_at&&<p>Vendor says they have paid.</p>}
        {plan.amountDueCents>0&&<><label>Payment reference<input value={reference[stall.id]||''} onChange={event=>setReference({...reference,[stall.id]:event.target.value})}/></label><button className="v-button" disabled={task.busy||!reference[stall.id]?.trim()} onClick={()=>{if(window.confirm('Confirm receipt of '+rand(plan.amountDueCents)+' for '+(stall.name||stall.phone)+'?')) void task.run(async()=>{await api('/admin/paid','POST',{stallId:stall.id,amountCents:plan.amountDueCents,reference:reference[stall.id]});await resource.reload();});}}>Confirm {rand(plan.amountDueCents)} received</button></>}
      </div>; })}
      </details>
    </>}
  </Frame>;
}

function codeMessage(code: string, expiry: number, phone: string) { return 'Your Kasi Move login code is '+code+'. Enter it at https://move.kasiaihub.com/verify?phone='+encodeURIComponent(phone)+'. Valid until '+new Date(expiry).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg' })+' SAST (10 minutes from creation). Do not share it.'; }
