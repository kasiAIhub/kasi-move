import {OrderPhoto} from './photos';
import {DriverProgress} from './driver-progress';
import {TeamManager,DeliveryAssignment} from './team';
import { ExtrasPicker } from './extras';
import { ReferralShare } from './referral';
import { StallShare } from './stall-share';
import { hasFoodPhotos, PHOTO_GATE_MESSAGE, PAYMENT_PROMPT } from '../server/plan';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ProductImage } from '../components/ProductImage';
import type { GateItem, GateOrder } from '../server/contracts';
import { orderMoney } from '../server/contracts';
import { stallPlan, LAUNCH_PRICE, MONTHLY_PRICE, } from '../server/plan';
import { api, openWhatsAppAction, day, elapsed, rand, settingsOf, useIdentity, useResource, useTask, wa, type OwnerData } from './client';
import { ErrorText, Frame, Loading, Photo } from './common';

const hoursOptions = [['Day', '08:00–17:00'], ['Day and night', '08:00–21:00'], ['Late', '08:00–23:00'], ['My own', '']];
const todayOrders = (orders: GateOrder[]) => orders.filter(order => day(order.createdAt) === day(Date.now()));
export async function saveItem(item: GateItem, change: Partial<GateItem> & { soldOutToday?: boolean } = {}) {
  return api('/vendor/menu', 'PUT', { ...item, soldOutToday: item.soldOutDate === day(Date.now()), ...change });
}
function Share({data,onDone}:{data:OwnerData;onDone?:()=>void}) {
  return <StallShare stall={{id:data.stall.id,name:data.stall.name,hours:data.stall.hours,takesCard:Boolean(data.stall.takes_card),delivery:Boolean(data.stall.rider_phone)&&settingsOf(data.stall).deliveryEnabled!==false,deliveryName:data.team?.find(m=>m.role==='rider'&&m.phone===data.stall.rider_phone)?.name||settingsOf(data.stall).riderName}} onDone={onDone} blocked={hasFoodPhotos(data.menu)?undefined:PHOTO_GATE_MESSAGE}/>;
}
function Login({existing=false}:{existing?:boolean}) {
  const requestedNumber=new URLSearchParams(window.location.search).get('phone')||'';
  const [referralName,setReferralName]=useState(()=>new URLSearchParams(window.location.search).get('ref')??sessionStorage.getItem('kasi-referral-name')??'');
  useEffect(()=>{sessionStorage.setItem('kasi-referral-name',referralName);},[referralName]);
  const fromCodeLink=/^\+27\d{9}$/.test(requestedNumber);
  const contact=useResource<{supportPhone:string}>('/config');
  const [number,setNumber]=useState(fromCodeLink?requestedNumber:sessionStorage.getItem('kasi-login-number')||''),[code,setCode]=useState('');
  const [demo,setDemo]=useState(()=>/^(\+27|0)820000000$/.test(number.replace(/[\s()-]/g,'')));
  const [sent,setSent]=useState(fromCodeLink||sessionStorage.getItem('kasi-login-waiting')==='yes');
  const [requestedAt,setRequestedAt]=useState(Number(sessionStorage.getItem('kasi-login-requested-at'))||0);
  const [requestLink,setRequestLink]=useState(sessionStorage.getItem('kasi-login-link')||'');
  const task=useTask(),identity=useIdentity(),navigate=useNavigate();
  useEffect(()=>{sessionStorage.setItem('kasi-login-number',number);sessionStorage.setItem('kasi-login-waiting',sent?'yes':'no');sessionStorage.setItem('kasi-login-link',requestLink);sessionStorage.setItem('kasi-login-requested-at',String(requestedAt));},[number,sent,requestLink,requestedAt]);
  async function requestCode() {
    const reply=await openWhatsAppAction(async()=>{const result=await api('/auth/code','POST',{phone:number});return {...result,link:result.requestLink};});
    setDemo(Boolean(reply.demo));setRequestedAt(reply.requestedAt||0);setRequestLink(reply.requestLink||'');setSent(true);
    if(reply.popupBlocked&&reply.requestLink) window.location.assign(reply.requestLink);
  }
  return <><h1>{demo?'Demo stall':sent?'Your WhatsApp code':'Your number'}</h1><p>{demo?'Enter the demo code you were given. Nothing is sent on WhatsApp.':sent?'Your login code arrives on WhatsApp. Thandi will reply to the number below. Open WhatsApp, tap Send on the message, then type the code here.':'Your login code arrives on WhatsApp, not by SMS. Enter the WhatsApp number you will use to manage your stall.'}</p>
    <form className="v-stack" onSubmit={event=>{event.preventDefault();void task.run(async()=>{
      if(!sent) return requestCode();
      const result=await api('/auth/verify','POST',{phone:number,code,referral_name:referralName,existing});
      identity.acceptVendor(result.owner);sessionStorage.removeItem('kasi-login-waiting');sessionStorage.removeItem('kasi-referral-name');
      const step=sessionStorage.getItem('kasi-setup-replay')==='1'?3:settingsOf(result.stall).setupStep??3;
      navigate(step>=9?'/kitchen':'/setup/'+step);
    });}}>
      <label>WhatsApp number<input required type="tel" autoComplete="tel" value={number} disabled={sent||task.busy} onChange={event=>{setNumber(event.target.value);task.clearError();}}/></label>
      <label>Who sent you? (referral name)<input maxLength={100} value={referralName} onChange={event=>setReferralName(event.target.value)}/></label>
      {sent&&!demo&&<section className="v-card" role="status"><strong>{requestedAt?'Request sent to Thandi’s admin inbox at '+new Date(requestedAt).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Johannesburg'})+'.':'Your code request is waiting.'}</strong><p>Tap Send in WhatsApp so Thandi receives your request. Your request is also saved in admin. Thandi replies with your code, valid for 10 minutes from when she creates it.</p></section>}
      {sent&&<label>{demo?'Demo code':'Four-digit code'}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,8}" maxLength={8} value={code} disabled={task.busy} onChange={event=>{setCode(event.target.value);task.clearError();}}/></label>}
      <ErrorText text={task.error}/>
      {task.error&&/no stall under this number/i.test(task.error)&&<Link className="v-button secondary" to="/setup/1?fresh=1">Open a new stall</Link>}
      {task.error&&!sent&&<p>Your request could not be confirmed. Check your connection and retry below.</p>}
      {task.busy&&<p role="status">{sent?'Checking your code and opening your stall…':'Sending your request to Thandi’s admin inbox…'}</p>}
      <button className="v-button" disabled={task.busy}>{task.busy?(sent?'Opening your stall…':'Sending request…'):sent?'Continue':task.error?'Retry request':'Get my code on WhatsApp'}</button>
      {sent&&<>{!demo&&<button type="button" className="v-link" disabled={task.busy} onClick={()=>{void task.run(requestCode);}}>Request code again</button>}
        <button type="button" className="v-link" disabled={task.busy} onClick={()=>{setSent(false);setCode('');setRequestedAt(0);task.clearError();}}>Use another number</button></>}
      {sent&&!demo&&(requestLink||contact.data?.supportPhone)&&<a className="v-link" href={requestLink||wa(contact.data?.supportPhone||'','Hi Thandi, I need my Kasi Move login code for '+number+'. Please check my request.')} target="_blank" rel="noreferrer">Open WhatsApp again</a>}
      {sent&&!demo&&<p className="muted">If WhatsApp did not open, tap Open WhatsApp again, then press Send in WhatsApp. Saving the request in admin does not send a WhatsApp message.</p>}
    </form></>;
}
export function VendorLogin() { return <Frame><Login existing /></Frame>; }
export function VendorVerify() { return <Frame><Login existing /></Frame>; }
export function Setup() {
  const step = Number(useParams().step || 1), identity = useIdentity();
  useEffect(() => { if(step===1&&new URLSearchParams(window.location.search).get('fresh')==='1'){for(const key of ['kasi-login-number','kasi-login-waiting','kasi-login-link','kasi-login-requested-at','kasi-login-message','kasi-setup-replay','kasi-order-draft','kasi-referral-name','kasi-invite-result-rider','kasi-invite-result-assistant'])sessionStorage.removeItem(key);}
    if (step === 1 && new URLSearchParams(window.location.search).get('restart') === '1') sessionStorage.setItem('kasi-setup-replay', '1'); if (step === 9) { sessionStorage.removeItem('kasi-setup-replay'); void identity.refresh(); } }, [step]);
  if (identity.loading) return <Loading />;
  if (step > 2 && identity.session?.role !== 'vendor') return <Navigate to="/setup/2" replace />;
  return <Frame><div className="v-dots" aria-label={`Step ${step} of 9`}>{Array.from({ length: 9 }, (_, i) => <span key={i} className={i < step ? 'filled' : ''} />)}</div>
    {step === 1 ? <section className="v-hello"><div className="v-logo"><b>K</b><strong>Kasi<br />Move</strong></div><h1>Let's open your stall.</h1><p>{LAUNCH_PRICE}<br/>{MONTHLY_PRICE}</p><h3>What you get</h3><ul><li>Your digital food menu, ready to share by WhatsApp link or QR code.</li><li>Easy photo upload for your own food photos.</li><li>Online orders for collection, plus delivery with your own delivery person once they accept.</li><li>Your operating hours, menu prices and agreed delivery fees. You run your stall your way.</li><li>Zero commission on your food sales. Your orders and sales records in one place.</li></ul><p className="muted">Customers pay you on collection or delivery. You arrange your delivery person and card machine; payment providers may charge their own fees.</p><Link className="v-button" to={'/setup/2'+window.location.search}>Start</Link></section> : step === 2 ? <Login /> : <SetupSigned step={step} />}
  </Frame>;
}
function SetupSigned({ step }: { step: number }) {
  const { data, error, reload, setData } = useResource<OwnerData>('/vendor/stall',step===9), task = useTask(), navigate = useNavigate();
  const [name, setName] = useState(''), [town, setTown] = useState(''), [hours, setHours] = useState('08:00–21:00'), [preset, setPreset] = useState('Day and night');
  const [riderFee, setRiderFee] = useState(''), [firstRiderName,setFirstRiderName]=useState('');
  const [rider, setRider] = useState(''), [deliver, setDeliver] = useState<boolean|null>(null), [inviteLink, setInviteLink] = useState('');
  const [allExtras,setAllExtras]=useState<NonNullable<GateItem['extras']>>([]);
  const [menu, setMenu] = useState<GateItem[]>([]), ready = useRef(false);
  useEffect(() => { if (data && !ready.current) { ready.current = true; setFirstRiderName(data.riderOffer?.name||settingsOf(data.stall).riderName||''); setName(data.stall.name); setTown(data.stall.town); setHours(data.stall.hours); setRider(data.stall.rider_phone||data.riderOffer?.phone||''); setRiderFee(String((data.riderOffer?.fee_cents??settingsOf(data.stall).riderFeeCents??0)/100||'')); setDeliver(settingsOf(data.stall).deliveryEnabled??(data.stall.rider_phone?true:null)); setMenu(data.menu); setAllExtras(settingsOf(data.stall).kotaExtras??data.menu.find(item=>item.shop==='stall')?.extras??[]); setPreset(settingsOf(data.stall).hoursPreset ?? 'Day and night'); } }, [data]);
  if (!data) return <section className="v-card v-stack" aria-live="polite"><h1>Opening your stall</h1><p>{error?'We could not load your saved stall.':'Getting your saved details ready…'}</p><ErrorText text={error}/>{error&&<button className="v-button secondary" onClick={()=>{void reload();}}>Try loading again</button>}</section>;

  async function next(skip = false, takesCard?: boolean) {
    if (!data) return;
    if(step===8 && deliver && !skip && !data.stall.rider_phone){
      if(!firstRiderName.trim())throw Error('Enter your delivery person’s name.');
      const result=await openWhatsAppAction(()=>api<{link?:string}>('/vendor/rider','POST',{phone:rider,riderName:firstRiderName,feeCents:Math.round(Number(riderFee)*100)}));
      setInviteLink(result.popupBlocked?result.link||'':'');
    }
    const saved=await api<OwnerData>('/vendor/setup','PUT',{step,name,town,hours,hoursPreset:preset,items:menu.filter(item=>item.shop==='stall'),extras:allExtras,skip,takesCard,delivery:skip?false:deliver});
    setData(saved);
    navigate('/setup/'+(step+1));
  }
  return <div className="v-stack"><ErrorText text={task.error} />
    {step === 3 && <><h1>Your stall</h1><label>Stall name<input value={name} onChange={event => setName(event.target.value)} /></label><label>Town<input placeholder="Type your town or area" autoComplete="off" value={town} onChange={event => setTown(event.target.value)} /></label></>}
    {step === 4 && <><h1>Your food menu</h1>{menu.some(item => item.shop === 'stall' && item.priceCents === null) && <p className="v-error">Add a price for every item before you continue.</p>}<div className="v-stack">{menu.filter(item => item.shop === 'stall').map(item => <SetupItem key={item.id} item={item} change={change => setMenu(menu.map(row => row.id === item.id ? { ...row, ...change } : row))} remove={() => task.run(async () => { await api(`/vendor/menu/${item.id}`, 'DELETE'); setMenu(menu.filter(row => row.id !== item.id)); })} />)}</div><button className="v-link" onClick={() => setMenu([...menu, { id: crypto.randomUUID(), name: '', priceCents: null, enabled: true, shop: 'stall', shopName: data.stall.name }])}>+ Add food</button><ExtrasPicker value={allExtras} onChange={setAllExtras}/></>}
    {step === 5 && <><h1>Photos</h1><section className="v-card v-stack"><h2>Show your own food</h2><p>Add a photo of every item on your menu. Customers order what they can see, so use photos of the real food you make. Tap an image to use your camera or gallery.</p></section><div className="v-photo-grid">{data.menu.filter(item => item.shop === 'stall').map(item => <Photo key={item.id} src={item.image} name={item.name} onChange={async image => { await saveItem(item, { image }); await reload(); }} />)}</div></>}
    {step === 6 && <><h1>Operating hours</h1><p className="muted">Orders after six are where the extra money is.</p>{hoursOptions.map(([label, value]) => <label className="v-choice" key={label}><input type="radio" name="hours" checked={preset === label} onChange={() => { setPreset(label); setHours(value); }} />{label}{value && <span className="muted">{value}</span>}</label>)}{preset === 'My own' && <label>Your operating hours<input value={hours} onChange={event => setHours(event.target.value)} placeholder="08:00–21:00" /></label>}</>}
    {step === 7 && <><h1>Do you accept card payments?</h1>{[true, false].map(value => <button className="v-button" key={String(value)} disabled={task.busy} onClick={() => task.run(async () => { await next(false,value); })}>{value ? 'Yes' : 'No'}</button>)}</>}
    {step === 8 && <><h1>Collection and delivery</h1><p>Choose what customers can select at checkout.</p><section className="v-card v-stack"><h2>A trusted delivery person can help your stall grow</h2><p>A delivery person can deliver while you keep cooking, making it easier to serve customers later if you choose to stay open. A friendly, reliable delivery person can help with customer questions and become a familiar, trusted face for your stall.</p><p>Agree a fee that works for both of you. You can factor that cost into your advertised food prices if you choose. You set the prices; Kasi Move does not add a delivery charge to the customer’s order. You pay your delivery person the agreed fee.</p><p className="muted">Delivery is optional. You can start with collection and invite one later.</p></section><label className="v-choice"><input type="radio" name="rider" checked={deliver===false} onChange={() => setDeliver(false)} />Collection only</label><label className="v-choice"><input type="radio" name="rider" checked={deliver===true} onChange={() => setDeliver(true)} />Collection and delivery</label>{deliver && <label>Delivery person’s name<input required value={firstRiderName} onChange={event=>setFirstRiderName(event.target.value)}/></label>}{deliver && <label>Delivery person’s WhatsApp<input type="tel" value={rider} onChange={event => setRider(event.target.value)} /></label>}{deliver && <label>Your offer per completed run (R)<input required type="number" min="0.01" step="0.01" value={riderFee} onChange={event=>setRiderFee(event.target.value)}/></label>}<p className="muted">Delivery becomes available to customers after your delivery person accepts the invitation. Until then, customers can collect.</p><p className="muted">Choose a fee that works for your sales and order volume. Your delivery person can accept or decline. You pay the agreed fee directly.</p></>}
    {step === 9 && <><h1>{hasFoodPhotos(data.menu)?data.stall.name+' is live.':data.stall.name+' is not live yet.'}</h1>{hasFoodPhotos(data.menu)?(!stallPlan(data.stall,Date.now()).active&&<p role="status">{PAYMENT_PROMPT}</p>):<><p className="v-error">{PHOTO_GATE_MESSAGE}</p><Link className="v-button" to="/setup/5">Add my food photos</Link></>}{inviteLink && <a className="v-button" href={inviteLink} target="_blank" rel="noreferrer">Send your delivery person his link on WhatsApp</a>}<p>{LAUNCH_PRICE}<br/>{MONTHLY_PRICE}</p><h3>What you get</h3><ul><li>Your digital food menu, ready to share by WhatsApp link or QR code.</li><li>Easy photo upload for your own food photos.</li><li>Online orders for collection, plus delivery with your own delivery person once they accept.</li><li>Your operating hours, menu prices and agreed delivery fees. You run your stall your way.</li><li>Zero commission on your food sales. Your orders and sales records in one place.</li></ul><p className="muted">Customers pay you on collection or delivery. You arrange your delivery person and card machine; payment providers may charge their own fees.</p><Link className="v-button" to="/owner/keep">Payment instructions</Link><Share data={data} /><ReferralShare name={data.stall.name}/><Link className="v-button secondary" to="/kitchen">Open my stall</Link></>}
    {step !== 7 && step !== 9 && <button className="v-button" disabled={task.busy || (step === 3 && (!name.trim() || !town.trim())) || (step === 4 && menu.filter(item => item.shop === 'stall').some(item => !item.name.trim() || item.priceCents === null)) || (step===8 && deliver===null)} onClick={() => task.run(() => next())}>{task.busy ? 'Saving…' : 'Continue'}</button>}
    {(step === 5 || step === 8) && <button className="v-link" disabled={task.busy} onClick={() => task.run(() => next(true))}>Do this later</button>}
  </div>;
}
function SetupItem({ item, change, remove }: { item: GateItem; change: (change: Partial<GateItem>) => void; remove: () => void }) {
  const start = useRef(0);
  return <div className="v-setup-item" onTouchStart={event => { start.current = event.touches[0].clientX; }} onTouchEnd={event => { if (start.current - event.changedTouches[0].clientX > 100) remove(); }}>
    <input aria-label="Food name" value={item.name} onChange={event => change({ name: event.target.value })} />
    <label className="v-price-input">R<input aria-label={`Price for ${item.name}`} type="number" step="0.01" min="0" value={item.priceCents === null ? '' : item.priceCents / 100} onChange={event => change({ priceCents: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) })} /></label>
    <button className="v-link" aria-label={`Remove ${item.name}`} onClick={remove}>×</button>
  </div>;
}
export function Till() {
  const owner = useResource<OwnerData>('/vendor/stall', true), orders = useResource<{ orders: GateOrder[] }>('/orders', true), task = useTask();
  if (!owner.data || !orders.data) return <Loading error={owner.error || orders.error} />;
  const data = owner.data, settings = settingsOf(data.stall), list = orders.data.orders, today = todayOrders(list), completed = today.filter(order => order.state === 'delivered');
  const openToday = today.filter(order => !['delivered','cancelled'].includes(order.state)), openMoney = openToday.reduce((sum, order) => sum + orderMoney(order).kotaCents, 0), totals = totalsFor(completed), done = settings.done ?? [], cook = list.filter(order => !['delivered','cancelled'].includes(order.state));
  const plan = stallPlan(data.stall, Date.now());
  const count = list.length;
  const nudge = !plan.active ? ['keep-paid', 'Open my stall · '+LAUNCH_PRICE+' '+MONTHLY_PRICE, '/owner/keep']
    : count >= 20 && data.stall.rider_phone && !settings.neighbours?.some(shop => shop.enabled) ? ['next-door', "Put your local spaza’s essentials on your menu. One delivery person, one trip.", '/owner/next-door']
    : count >= 10 && !data.stall.rider_phone ? ['rider', 'Set up delivery and agree a fee per run.', '/owner/more#rider']
    : count >= 3 && settings.hoursPreset === 'Day' ? ['evening', "Open till 21:00? Evening orders are the ones you're missing.", '/owner/more#hours']
    : count >= 1 && settings.photosSkipped ? ['photo', `Take a photo of that ${list[list.length - 1].lines.find(line => line.shop === 'stall')?.name || 'food'} before it goes.`, '/owner/menu'] : null;
  const refresh = async () => { await owner.reload(); await orders.reload(); };
  return <Frame vendor name={data.stall.name} back={false}><section className="v-card v-stack"><div className="v-row"><h1>{data.stall.name}</h1><button className="v-status" disabled={task.busy} onClick={() => task.run(async () => { await api('/vendor/open', 'POST', { open: !data.stall.is_open }); await owner.reload(); })}>{data.stall.is_open ? 'Close for today' : 'Open now'}</button></div>
    <p role="status">{!hasFoodPhotos(data.menu) ? "Not live. Your food photos are still outstanding." : !plan.active ? PAYMENT_PROMPT : data.stall.is_open ? "Open — customers can place orders." : "Closed — customers can browse your menu."}</p>{!plan.active && <Link className="v-link" to="/owner/keep">View payment status</Link>}<div><p>You keep today</p><strong className="v-money">{rand(totals.mine)}</strong><p className="muted">cash in hand {rand(totals.cash)} · card payments {rand(totals.card)}</p>{openToday.length>0&&<p className="muted">Sales made: {rand(openMoney)} - on its way to you.</p>}</div><p>Orders today <strong>{today.length}</strong></p><Share data={data} onDone={() => void owner.reload()} /></section>
    <ErrorText text={task.error || owner.error || orders.error} />
    {nudge && !done.includes(nudge[0]) && <div className="v-nudge"><Link to={nudge[2]}>{nudge[1]}</Link><button aria-label="Dismiss" onClick={() => task.run(async () => { await api('/vendor/settings', 'PUT', { done: [nudge[0]] }); await owner.reload(); })}>×</button></div>}
    {!list.length && <div className="v-card v-stack">{!done.includes('share') && <Share data={data} onDone={() => void owner.reload()} />}{!data.stall.rider_phone && <Link to="/owner/more#rider">Set up delivery</Link>}</div>}
    <h2 className="v-section-title">TO COOK</h2>{!cook.length && list.length > 0 && <p className="muted">All done.</p>}
    {cook.map(order => <div className="v-card v-stack" key={order.id}><div className="v-row"><strong>#{order.number} · {order.customerName}{order.regular ? ' · Regular' : ''} · {elapsed(order)} min ago</strong><span className="v-pill">{order.state === 'new' ? 'Received' : order.state==='cooking'?'Cooking': order.state === 'ready' ? (order.fulfilment === 'collection' ? 'Ready for collection' : 'Ready for delivery') : 'Delivery on the way'}</span></div>
      {order.lines.filter(line => line.shop === 'stall').map(line => <p key={line.lineId || line.itemId}>{line.quantity} × {line.name}{line.extras?.length ? ` + ${line.extras.map(extra => extra.name).join(', ')}` : ''} · {rand(line.priceCents * line.quantity)}</p>)}
      {order.lines.some(line => line.shop !== 'stall') && <p className="muted">Also on this order: {order.lines.filter(line => line.shop !== 'stall').map(line => `${line.name} (${line.shopName})`).join(', ')} — delivery person collects</p>}
      <p>{order.fulfilment === 'collection' ? `collecting ${order.collectionTime}` : `Customer pays ${rand(orderMoney(order).totalCents)} at the gate · ${order.method}`}</p><p>Yours {rand(orderMoney(order).kotaCents)}{order.fulfilment === 'delivery' && (order.riderPhone?' · delivery '+rand(order.riderFeeCents ?? 1000):' · assign delivery to confirm the run fee')}</p>
      <OrderPhoto order={order} stallName={data.stall.name} reload={refresh}/><DeliveryAssignment order={order} members={data.team??[]} onSaved={refresh}/>
      {order.state==='new'&&<button className="v-button" disabled={task.busy} onClick={()=>task.run(async()=>{try{await api('/orders/'+order.id+'/cook','POST',{});}finally{await refresh();}})}>Start cooking</button>}
      {order.state === 'cooking' && <button className="v-button" disabled={task.busy} onClick={() => task.run(async () => { await api(`/orders/${order.id}/ready`, 'POST', {}); await refresh(); })}>{order.fulfilment === 'collection' ? 'Ready for collection' : 'Ready for delivery'}</button>}
      {order.fulfilment === 'collection' && order.state === 'ready' && <button className="v-button" disabled={task.busy} onClick={() => task.run(async () => { await api(`/orders/${order.id}/deliver`, 'POST', {}); await refresh(); })}>Collected · {order.method === 'cash' ? 'cash in hand' : 'card payments'}</button>}
      {order.fulfilment === 'delivery' && ['ready','on_the_way'].includes(order.state) && <button className="v-button secondary" disabled={task.busy} onClick={() => { if (!window.confirm('Mark order #'+order.number+' as delivered? Do this only if the food has reached the customer.')) return; void task.run(async () => { try { await api(`/orders/${order.id}/deliver`, 'POST', {}); } finally { await refresh(); } }); }}>Mark delivered myself</button>}
    </div>)}
    {completed.length>0&&<section className="v-stack"><h2 className="v-section-title">DONE TODAY</h2>{[...completed].sort((x,y)=>(y.deliveredAt??0)-(x.deliveredAt??0)).map(order=><div className="v-card v-stack" key={order.id}><div className="v-row"><strong>#{order.number} · {order.customerName}</strong><span className="v-pill">{order.fulfilment==='collection'?'Collected':'Delivered'}{order.deliveredAt?' · '+new Date(order.deliveredAt).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Johannesburg'}):''}</span></div>
      {order.lines.filter(line=>line.shop==='stall').map(line=><p key={line.lineId||line.itemId}>{line.quantity} × {line.name}{line.extras?.length?` + ${line.extras.map(extra=>extra.name).join(', ')}`:''} · {rand(line.priceCents*line.quantity)}</p>)}
      <p>Yours {rand(orderMoney(order).kotaCents)} · {order.method==='cash'?'cash':'card'}{order.fulfilment==='delivery'&&order.riderPhone?' · delivery '+rand(order.riderFeeCents??1000):''}</p></div>)}</section>}
    {list.some(order=>order.state==='delivered'&&order.riderPhone)&&<section className="v-stack"><h2>Completed deliveries</h2>{list.filter(order=>order.state==='delivered'&&order.riderPhone).slice(0,10).map(order=><div className="v-card v-stack" key={order.id}><strong>#{order.number} · {order.riderName||order.riderPhone}</strong><DriverProgress order={order} reload={refresh}/></div>)}</section>}
    {list.some(order=>order.state==='cancelled')&&<section className="v-stack"><h2>Cancelled orders</h2>{list.filter(order=>order.state==='cancelled').map(order=><div className="v-card" key={order.id}><strong>#{order.number} · {order.customerName} · Cancelled</strong><p>Customer cancelled before cooking. Do not prepare.</p></div>)}</section>}
  </Frame>;
}
function totalsFor(orders: GateOrder[]) {
  const sold = orders.reduce((sum, order) => sum + orderMoney(order).kotaCents, 0), rider = orders.reduce((sum, order) => sum + orderMoney(order).riderCents, 0);
  const card = orders.filter(order => order.method === 'card').reduce((sum, order) => sum + orderMoney(order).kotaCents, 0);
  return { sold, rider, mine: sold - rider, card, cash: sold - card - rider };
}
export function Money() {
  const owner = useResource<OwnerData>('/vendor/stall'), resource = useResource<{ orders: GateOrder[] }>('/orders', true);
  if (!owner.data || !resource.data) return <Loading error={owner.error || resource.error} />;
  const orders = todayOrders(resource.data.orders).filter(order => order.state === 'delivered'), totals = totalsFor(orders), runs = orders.filter(order => order.fulfilment === 'delivery').length;
  return <Frame vendor name={owner.data.stall.name} open={Boolean(owner.data.stall.is_open)}><h1>Today</h1><div className="v-card v-stack"><div className="v-row"><span>Sold</span><strong>{rand(totals.sold)}</strong></div><div className="v-row"><span>Delivery</span><strong>{rand(totals.rider)} ({runs} runs)</strong></div><div className="v-row"><span>Mine</span><strong className="v-money">{rand(totals.mine)}</strong></div><p className="muted">cash {rand(totals.cash)} · card payments {rand(totals.card)}</p></div><h2>Orders today</h2>{!orders.length && <p className="muted">No delivered orders yet.</p>}{orders.map(order => <p className="v-card" key={order.id}>#{order.number} {order.customerName} {rand(orderMoney(order).kotaCents)} {order.method}</p>)}</Frame>;
}
function ItemForm({ item, close, saved, nextDoor = false }: { item: GateItem; close: () => void; saved: () => Promise<unknown>; nextDoor?: boolean }) {
  const [name, setName] = useState(item.name), [price, setPrice] = useState(item.priceCents === null ? '' : String(item.priceCents / 100));
  const [out, setOut] = useState(item.soldOutDate === day(Date.now())), [image, setImage] = useState(item.image), [alcohol, setAlcohol] = useState(item.alcohol ?? false);
  const [extras] = useState((item.extras || []).map(extra => ({ ...extra, price: String(extra.priceCents / 100) })));
  const task = useTask();
  return <form className="v-card v-stack" onSubmit={event => { event.preventDefault(); void task.run(async () => {
    await saveItem(item, { name, image, extras: extras.map(extra => ({ id: extra.id, name: extra.name, priceCents: Math.round(Number(extra.price) * 100) })), priceCents: price === '' ? null : Math.round(Number(price) * 100), soldOutToday: out, alcohol,
      alternative: undefined }); await saved(); close();
  }); }}><label>Name<input required readOnly={nextDoor} value={name} onChange={event => setName(event.target.value)} /></label><label>Price · R<input type="number" min="0" step=".01" value={price} onChange={event => setPrice(event.target.value)} /></label>
    {!nextDoor && <label className="v-choice"><input type="checkbox" checked={out} onChange={event => setOut(event.target.checked)} />Sold out today</label>}
    {nextDoor && <>{item.shop === 'tavern' && <label className="v-choice"><input type="checkbox" checked={alcohol} onChange={event => setAlcohol(event.target.checked)} />18+</label>}</>}
    <Photo name={name || 'food'} src={image} onChange={async value => setImage(value)} /><ErrorText text={task.error} /><button className="v-button" disabled={task.busy}>Save</button><button type="button" className="v-link" onClick={close}>Cancel</button>
  </form>;
}
function StallExtras({data,saved}:{data:OwnerData;saved:()=>Promise<unknown>}) {
  const [value,setValue]=useState(settingsOf(data.stall).kotaExtras??data.menu.find(item=>item.shop==='stall')?.extras??[]),task=useTask();
  return <form onSubmit={event=>{event.preventDefault();void task.run(async()=>{await api('/vendor/extras','PUT',{extras:value});await saved();});}}><ExtrasPicker value={value} onChange={setValue}/><ErrorText text={task.error}/><button className="v-button" disabled={task.busy}>{task.busy?'Saving…':'Save extras for all food'}</button></form>;
}
export function MenuManager() {
  const resource = useResource<OwnerData>('/vendor/stall'), [selected, setSelected] = useState<GateItem | null>(null);
  if (!resource.data) return <Loading error={resource.error} />;
  const data = resource.data;
  return <Frame vendor name={data.stall.name} open={Boolean(data.stall.is_open)}><h1>My food menu</h1>{selected ? <ItemForm key={selected.id} item={selected} close={() => setSelected(null)} saved={resource.reload} /> : <><div className="v-menu-list">{data.menu.filter(item => item.shop === 'stall').map(item => <button className="v-menu-row" key={item.id} onClick={() => setSelected(item)}>{item.image ? <ProductImage src={item.image} alt={item.name} /> : <span className="v-camera-placeholder">Add photo</span>}<span><strong>{item.name}</strong><small>{item.priceCents === null ? 'Add a price' : rand(item.priceCents)}{item.soldOutDate === day(Date.now()) && ' · Sold out today'}</small></span></button>)}</div><button className="v-button" onClick={() => setSelected({ id: crypto.randomUUID(), name: '', priceCents: null, enabled: true, shop: 'stall', shopName: data.stall.name })}>+ Add food</button><StallExtras data={data} saved={resource.reload}/></>}</Frame>;
}
export function More() {
  const [offerDelivery,setOfferDelivery]=useState(false);
  const resource = useResource<OwnerData>('/vendor/stall'), task = useTask(), config = useResource<{supportPhone: string}>('/config');
  const [name, setName] = useState(''), [hours, setHours] = useState(''), [message, setMessage] = useState(''), [takesCard, setTakesCard] = useState(false), [inviteLink] = useState('');
  useEffect(() => { if (resource.data) { setOfferDelivery(settingsOf(resource.data.stall).deliveryEnabled??Boolean(resource.data.stall.rider_phone)); setName(resource.data.stall.name); setTakesCard(Boolean(resource.data.stall.takes_card)); setHours(resource.data.stall.hours);  } }, [resource.data]);
  if (!resource.data) return <Loading error={resource.error} />;
  const data = resource.data;
  return <Frame vendor name={data.stall.name} open={Boolean(data.stall.is_open)}><h1>More</h1><ErrorText text={task.error} />{message && <p role="status">{message}</p>}{inviteLink && <a className="v-button" href={inviteLink} target="_blank" rel="noreferrer">Send delivery invitation on WhatsApp</a>}
    <details className="v-card" id="hours" open={window.location.hash === '#hours'}><summary>My stall</summary><form className="v-stack" onSubmit={event => { event.preventDefault(); void task.run(async () => { await api('/vendor/stall', 'PUT', { name, town: data.stall.town, hours, open: Boolean(data.stall.is_open), takesCard }); await resource.reload(); }); }}><label>Stall name<input required value={name} onChange={event => setName(event.target.value)} /></label><label>Operating hours<input required value={hours} onChange={event => setHours(event.target.value)} /></label><label className="v-choice"><input type="checkbox" checked={takesCard} onChange={event => setTakesCard(event.target.checked)} />I accept card payments at the gate</label><button className="v-button" disabled={task.busy}>Save</button></form></details>
    <details className="v-card" id="special" open={window.location.hash === '#special'}><summary>Today’s special{settingsOf(data.stall).special&&settingsOf(data.stall).special!.to>Date.now()?' · on':''}</summary><SpecialForm data={data} reload={resource.reload}/></details>
    <details className="v-card" id="rider" open={window.location.hash === '#rider'}><summary>Delivery team</summary><form className="v-stack" onSubmit={event=>{event.preventDefault();void task.run(async()=>{await api('/vendor/settings','PUT',{deliveryEnabled:offerDelivery});await resource.reload();setMessage('Customer delivery options saved.');});}}><label className="v-choice"><input type="checkbox" checked={offerDelivery} onChange={event=>setOfferDelivery(event.target.checked)}/>Offer collection and delivery</label><p>{offerDelivery?(data.stall.rider_phone?'Customers can choose collection or delivery.':'Invite your first driver below. Delivery opens after they accept; customers can collect in the meantime.'):'Customers can collect from your stall.'}</p><button className="v-button secondary" disabled={task.busy}>Save delivery options</button></form><TeamManager role="rider" embedded/></details>
    <Link className="v-card v-block" to="/owner/assistants">Shop assistants</Link>
    <Link className="v-card v-block" to="/owner/next-door">Next door</Link><Link className="v-card v-block" to="/owner/keep">Keep my stall</Link>
    <details className="v-card"><summary>Help — WhatsApp Thandi</summary>{config.data?.supportPhone && <a className="v-button" href={wa(config.data?.supportPhone || '', 'Hi Thandi, I’m contacting you from Kasi Move.')} target="_blank" rel="noreferrer">WhatsApp Thandi</a>}<p>Your number: {data.stall.phone}</p><p>{data.stall.name} · Kasi Move since {new Date(settingsOf(data.stall).createdAt || data.stall.first_order_at || Date.now()).toLocaleDateString("en-ZA")} · Plan details in Keep my stall</p><h3>How it works</h3><p>Customers order from your link and pay at the gate.</p><p>You and your delivery person agree the fee per run.</p><p>Next-door shops get cash from the delivery person.</p></details>
  </Frame>;
}
export function KeepStall() {
  const resource=useResource<{photosReady?:boolean;stallName:string;hours?:string;takesCard:boolean;delivery:boolean;deliveryName?:string;stallId:string;plan:ReturnType<typeof stallPlan>;reported:boolean;instructions:string|null}>('/vendor/activation',true),task=useTask();
  const config=useResource<{supportPhone:string;cashSendNumber:string;bankDetails:string}>('/config');
  const orders=useResource<{orders:GateOrder[]}>('/orders');
  if(!resource.data||!config.data) return <Loading error={resource.error||config.error}/>;
  const data=resource.data,plan=data.plan,contact=config.data;
  const completed=orders.data?.orders.filter(order=>order.state==='delivered')??[];
  return <Frame vendor><h1>Keep my stall</h1><p>Your plan, saved activity and sharing links.</p>
    <section className="v-card v-stack"><h2>{plan.active?'Your subscription is active':data.plan.paidThrough?'Monthly payment due':'Open my stall'}</h2>
      <strong>R300 once. R150 a month. No commission.</strong>
      <p>{LAUNCH_PRICE}<br/>{MONTHLY_PRICE}</p><h3>What you get</h3><ul><li>Your digital food menu, ready to share by WhatsApp link or QR code.</li><li>Easy photo upload for your own food photos.</li><li>Online orders for collection, plus delivery with your own delivery person once they accept.</li><li>Your operating hours, menu prices and agreed delivery fees. You run your stall your way.</li><li>Zero commission on your food sales. Your orders and sales records in one place.</li></ul><p className="muted">Customers pay you on collection or delivery. You arrange your delivery person and card machine; payment providers may charge their own fees.</p>
      {plan.paidThrough&&<p>Paid through {new Date(plan.paidThrough).toLocaleDateString('en-ZA')}.</p>}
      <p>Pay by EFT or cash and send your receipt to Thandi. Your stall opens after she confirms payment.</p>{contact.bankDetails&&<p>{contact.bankDetails}</p>}{contact.cashSendNumber&&<p>Cash payment contact: {contact.cashSendNumber}</p>}
      {plan.amountDueCents>0&&<><strong>Payment to continue: {rand(plan.amountDueCents)}</strong>
        <p>After payment, send Thandi your receipt for confirmation.</p>
        {contact.supportPhone&&<a className="v-button secondary" href={wa(contact.supportPhone,'Hi Thandi, I have paid '+rand(plan.amountDueCents)+' for '+data.stallName+' on Kasi Move. Please confirm.')} target="_blank" rel="noreferrer" onClick={()=>{void task.run(async()=>{await api('/vendor/activation','POST',{});await resource.reload();});}}>I've paid</a>}
      </>}
      {data.reported&&<p>Thandi will confirm after checking your payment.</p>}<ErrorText text={task.error}/>
      {plan.payments.length>0&&<><h3>Payment history</h3>{plan.payments.map(payment=><p key={payment.reference}>{new Date(payment.at).toLocaleDateString('en-ZA')} · Payment received · {payment.reference}</p>)}</>}
    </section>
    <section className="v-card v-stack"><h2>Your business record</h2><p>{completed.length} completed orders · {rand(completed.reduce((sum,order)=>sum+orderMoney(order).kotaCents,0))} in food sales</p><ErrorText text={orders.error}/>
      <p>Your orders, menu, prices, photos and agreed delivery fees are saved in the database. We do not sell your activity data.</p>
      <Link className="v-button secondary" to="/owner/dashboard">See my money</Link><Link className="v-button secondary" to="/owner/menu">Manage my menu</Link>
    </section>
    <ReferralShare name={data.stallName}/><section className="v-card v-stack"><h2>Kasi Move app QR</h2><p>Scan to open Kasi Move and start a stall. Use this app QR code in your videos.</p>
      <img src="/images/kasi-move-qr.svg" alt="QR code for https://move.kasiaihub.com" style={{width:240,maxWidth:'100%',alignSelf:'center'}}/>
      <a className="v-button" href="/images/kasi-move-qr.png" download="kasi-move-qr.png">Download app QR code</a><p>move.kasiaihub.com</p>
      <p>For customers ordering from your own stall:</p><StallShare stall={{id:data.stallId,name:data.stallName,hours:data.hours,takesCard:data.takesCard,delivery:data.delivery,deliveryName:data.deliveryName}} blocked={data.photosReady===false?PHOTO_GATE_MESSAGE:undefined}/>
    </section>
  </Frame>;
}

const localInput=(time:number)=>{const d=new Date(time-new Date(time).getTimezoneOffset()*60000);return d.toISOString().slice(0,16);};
function SpecialForm({data,reload}:{data:OwnerData;reload:()=>Promise<unknown>|void}){
  const current=settingsOf(data.stall).special,live=current&&current.to>Date.now()?current:undefined,task=useTask();
  const [text,setText]=useState(live?.text??''),[from,setFrom]=useState(localInput(live?.from??Date.now())),[to,setTo]=useState(localInput(live?.to??Date.now()+5*3600000)),[note,setNote]=useState('');
  return <form className="v-stack" onSubmit={event=>{event.preventDefault();void task.run(async()=>{await api('/vendor/settings','PUT',{special:{text,from:new Date(from).getTime(),to:new Date(to).getTime()}});await reload();setNote('Special saved. It shows on your menu between these times and switches off by itself.');});}}>
    <ErrorText text={task.error}/>{note&&<p role="status">{note}</p>}
    <label className="v-stack">One line for customers<input maxLength={80} required value={text} placeholder="Friday kota special: R25" onChange={event=>setText(event.target.value)}/></label>
    <label className="v-stack">From<input type="datetime-local" required value={from} onChange={event=>setFrom(event.target.value)}/></label>
    <label className="v-stack">Until<input type="datetime-local" required value={to} onChange={event=>setTo(event.target.value)}/></label>
    <p>It shows at the top of your menu and in the directory only between these times, then it goes away by itself.</p>
    <button className="v-button" disabled={task.busy}>Save special</button>
    {live&&<button type="button" className="v-button secondary" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/vendor/settings','PUT',{special:null});setText('');await reload();setNote('Special removed.');})}>Remove special now</button>}
  </form>;
}
