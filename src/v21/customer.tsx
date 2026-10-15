import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProductImage } from '../components/ProductImage';
import type { GateItem, GateOrder } from '../server/contracts';
import { lineTotal, orderMoney } from '../server/contracts';
import { api, draftKey, draftTotal, rand, useDraft, useIdentity, useResource, useTask, wa, type PublicStall } from './client';
import { RouteStops } from './route-stops';
import { ViewSwitcher, Back, ErrorText, Frame, Loading, OrderLink } from './common';

import { kotaImage as foodImage } from '../server/kota-defaults';
interface SavedCustomer {name:string;phone:string;gateNote:string}
function CustomerWelcome() {
 const identity=useIdentity(),[name,setName]=useState('');
 useEffect(()=>{let active=true;if(!identity.loading&&identity.session)void api<{profile:SavedCustomer|null}>('/customer/profile').then(({profile})=>{if(active)setName(profile?.name||'');}).catch(()=>{});return()=>{active=false;};},[identity.loading,identity.session?.role]);
 return name?<p className="muted">Welcome back, {name}.</p>:null;
}
function CustomerNav({ id }: { id: string }) {
  const identity = useIdentity(), task = useTask(), navigate = useNavigate();
  return <><nav className="v-customer-nav"><Link to={`/stall/${id}`}>Menu</Link><button className="v-link" disabled={task.busy} onClick={() => task.run(async () => { await api('/auth/customer', 'POST', {}); await identity.refresh(); navigate('/my-orders'); })}>My orders</button></nav><ErrorText text={task.error} /></>;
}
function FoodQuantity({item,stallId}:{item:GateItem;stallId:string}) {
 const {draft,update}=useDraft();const lines=draft.stallId===stallId?draft.lines:[];
 const matching=lines.filter(line=>line.item.id===item.id),quantity=matching.reduce((n,line)=>n+line.quantity,0);
 function change(delta:number){const next=lines.map(line=>({...line}));let index=-1;next.forEach((line,i)=>{if(line.item.id===item.id)index=i;});
 if(index>=0)next[index].quantity=Math.max(0,Math.min(20,next[index].quantity+delta));else if(delta>0)next.push({item,quantity:1,extras:[],ifMissing:'omit'});
 update({stallId,lines:next.filter(line=>line.quantity>0),requestKey:crypto.randomUUID()});}
 return quantity?<div className="v-item-quantity"><button aria-label={'Remove one '+item.name} onClick={()=>change(-1)}>−</button><strong aria-live="polite">{quantity}</strong><button aria-label={'Add one '+item.name} disabled={matching[matching.length-1]?.quantity>=20} onClick={()=>change(1)}>+</button></div>:<button className="v-add" onClick={()=>change(1)}>+ Add</button>;
}
export function StallMenu() {
  const { stallId = '' } = useParams(), resource = useResource<PublicStall>(`/stalls/${stallId}`, true), { draft } = useDraft();
  if (!resource.data) return <Loading error={resource.error} />;
  const stall = resource.data;
  return <div className="v-app v-premium"><main className="v-main v-customer"><ViewSwitcher /><small className="v-brand">Kasi Move</small><div className="v-stall-heading"><h1>{stall.name}</h1><div className="v-row"><span className={stall.open ? 'v-open' : 'muted'}>{stall.open ? 'OPEN' : 'CLOSED'}</span>{stall.open && <span className="muted">20–30 min</span>}</div></div>
    {!stall.open && <div className="v-card v-stack"><h2>{stall.name} is taking a break — WhatsApp her</h2><a className="v-button" href={wa(stall.phone)} target="_blank" rel="noreferrer">WhatsApp {stall.name}</a></div>}<>
      <CustomerWelcome /><section className="v-menu-intro"><span className="v-eyebrow">MADE IN YOUR NEIGHBOURHOOD</span><h2>Choose your food.</h2><p>Your favourite food. Your choice of extras.</p></section><div className="v-products">{(stall.kotaDisplay || stall.menu.filter(item => item.shop === 'stall')).map(item => {
        const available = stall.open && stall.menu.some(row => row.id === item.id);
        const contents = <>{foodImage(item) ? <ProductImage src={foodImage(item)} alt={item.name} /> : <div className="v-food-placeholder">Made your way</div>}<div className="v-product-info"><h2>{item.name}</h2><div className="v-row"><strong>{item.priceCents === null ? 'Price coming soon' : rand(item.priceCents)}</strong><span className="v-add">{available ? 'Choose extras' : !stall.open ? 'Closed' : item.priceCents === null ? 'Coming soon' : 'Sold out'}</span></div></div></>;
        return available ? <article className="v-product" key={item.id}><Link to={`/stall/${stall.id}/kota/${item.id}`}>{contents}</Link><div className="v-product-info"><FoodQuantity item={item} stallId={stall.id}/></div></article> : <article className="v-product" key={item.id}>{contents}</article>;
      })}</div>
      {!stall.menu.some(item => item.shop === 'stall') && <p className="v-card">The menu is being updated. Check back soon.</p>}
    </>
    <p className="v-art-note">Menu artwork is illustrative where a stall photo has not been added.</p><ErrorText text={resource.error} /><CustomerNav id={stall.id} /></main><OrderLink total={draft.stallId===stall.id?draftTotal(draft.lines):0} count={draft.stallId === stall.id ? draft.lines.reduce((sum, line) => sum + line.quantity, 0) : 0} path={`/stall/${stall.id}/order`} /></div>;
}
export function Kota() {
  const { stallId = '', itemId = '' } = useParams(), resource = useResource<PublicStall>(`/stalls/${stallId}`);
  const { draft, update } = useDraft(), [extras, setExtras] = useState<string[]>([]), [quantity, setQuantity] = useState(1), navigate = useNavigate();
  if (!resource.data) return <Loading error={resource.error} />;
  const stall = resource.data, item = stall.menu.find(item => item.id === itemId && item.shop === 'stall');
  if (!item) return <Frame name={stall.name}><p>This food item is not available.</p><Link className="v-button" to={`/stall/${stallId}`}>Choose something else</Link></Frame>;
  const total = quantity * (item.priceCents! + (item.extras ?? []).filter(extra => extras.includes(extra.id)).reduce((sum, extra) => sum + extra.priceCents, 0));
  return <Frame name={stall.name} open={stall.open}>{foodImage(item) && <ProductImage className="v-kota-hero" src={foodImage(item)} alt={item.name} />}<h1>{item.name}</h1>
    {!!item.extras?.length && <div><h2>Make it yours</h2><p className="muted">Optional extras · choose what you love</p></div>}<div className="v-extras">{(item.extras ?? []).map(extra => <label className="v-choice" key={extra.id}><input type="checkbox" checked={extras.includes(extra.id)} onChange={event => setExtras(event.target.checked ? [...extras, extra.id] : extras.filter(id => id !== extra.id))} />{extra.name}<strong>+{rand(extra.priceCents)}</strong></label>)}</div>
    <div className="v-row v-quantity"><button aria-label="One less" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}>−</button><strong>{quantity}</strong><button aria-label="One more" disabled={quantity >= 20} onClick={() => setQuantity(quantity + 1)}>+</button><strong>{rand(total)}</strong></div>
    <button className="v-button" disabled={!stall.open} onClick={() => {
      const lines = draft.stallId === stallId ? [...draft.lines] : [];
      const existing = lines.find(line => line.item.id === item.id && [...line.extras].sort().join(',') === [...extras].sort().join(','));
      if (existing) { existing.quantity = Math.min(20, existing.quantity + quantity); existing.extras = extras; existing.item = item; }
      else lines.push({ item, quantity, extras, ifMissing: 'omit' });
      update({ stallId, lines, requestKey: crypto.randomUUID() });
      navigate(`/stall/${stallId}/${stall.delivery && stall.menu.some(item => item.shop !== 'stall') ? 'next-door' : 'order'}`);
    }}>Add to order · {rand(total)}</button>
  </Frame>;
}
export function NextDoorCustomer() {
  const { stallId = '' } = useParams(), resource = useResource<PublicStall>(`/stalls/${stallId}`), { draft, update } = useDraft();
  if (!resource.data) return <Loading error={resource.error} />;
  const stall = resource.data;
  function change(item:GateItem,delta:number) {
    const lines=draft.stallId===stallId?draft.lines.map(line=>({...line})):[];
    const existing=lines.find(line=>line.item.id===item.id);
    if(existing)existing.quantity=Math.max(0,Math.min(20,existing.quantity+delta));
    else if(delta>0)lines.push({item,quantity:1,extras:[],ifMissing:'omit'});
    update({stallId,lines:lines.filter(line=>line.quantity>0),requestKey:crypto.randomUUID()});
  }
  return <Frame name={stall.name} open={stall.open}><h1>FROM NEXT DOOR</h1><p>Choose from the available items. Missing items are left out and removed from your total.</p>{stall.delivery ? (stall.nextDoorDisplay || stall.menu.filter(item => item.shop !== 'stall')).map(item => {
    const quantity=draft.stallId===stallId?draft.lines.find(line=>line.item.id===item.id)?.quantity||0:0;
    return <div className="v-card v-stack" key={item.id}><div className="v-next-door-row">{item.image && <ProductImage src={item.image} alt={item.name} />}<div className="grow"><h2>{item.name}</h2><p className="muted">{item.shopName}</p><strong>{rand(item.priceCents!)}</strong></div>{quantity>0?<div className="v-item-quantity" aria-label={item.name+' quantity'}><button aria-label={'Remove one '+item.name} onClick={()=>change(item,-1)}>−</button><strong aria-live="polite">{quantity}</strong><button aria-label={'Add one '+item.name} disabled={quantity>=20||!stall.open||!stall.menu.some(row=>row.id===item.id)} onClick={()=>change(item,1)}>+</button></div>:<button className="v-add" disabled={!stall.open||!stall.menu.some(row=>row.id===item.id)} onClick={()=>change(item,1)}>{stall.menu.some(row=>row.id===item.id)?'+ Add':'Sold out today'}</button>}</div>
    </div>;
  }) : <p>Next-door items need delivery.</p>}<Link className="v-button" to={`/stall/${stallId}/order`}>View your order</Link><Link className="v-link" to={`/stall/${stallId}`}>Back to food menu</Link><OrderLink count={draft.stallId===stallId?draft.lines.reduce((sum,line)=>sum+line.quantity,0):0} total={draft.stallId===stallId?draftTotal(draft.lines):0} path={`/stall/${stallId}/order`}/></Frame>;
}
export function Order() {
  const { stallId = '' } = useParams(), resource = useResource<PublicStall>(`/stalls/${stallId}`, true), { draft, update, clear } = useDraft(), identity = useIdentity();
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [gate, setGate] = useState(''), [method, setMethod] = useState('cash'), [fulfilment, setFulfilment] = useState('delivery'), [collectionTime, setCollectionTime] = useState(''), [over18, setOver18] = useState(false);
  const task = useTask(), navigate = useNavigate();
  const edited=useRef(false),[remembered,setRemembered]=useState(false);
  const [challenge,setChallenge]=useState(''),[recoveryCode,setRecoveryCode]=useState(''),[savedCustomer,setSavedCustomer]=useState<SavedCustomer|null>(null),[recoveryNote,setRecoveryNote]=useState('');
  const recover=useTask();
  const ensureCustomer=async()=>{if(identity.session?.role!=='customer'){await api('/auth/customer','POST',{});await identity.refresh();}};
  useEffect(()=>{let active=true;if(!identity.loading&&identity.session)void api<{profile:{name:string;phone:string;gateNote:string}|null}>('/customer/profile').then(({profile})=>{if(active&&profile&&!edited.current){setName(profile.name);setPhone(profile.phone);setGate(profile.gateNote);setRemembered(true);}}).catch(()=>{});return()=>{active=false;};},[identity.loading,identity.session?.role]);
  useEffect(() => { if (resource.data && !resource.data.delivery) setFulfilment('collection'); }, [resource.data?.delivery]);
  if (!resource.data) return <Loading error={resource.error} />;
  const stall = resource.data, lines = draft.stallId === stallId ? draft.lines : [], alcohol = lines.some(line => line.item.alcohol);
  if (!lines.length) return <Frame name={stall.name}><h1>Your order</h1><p>Choose your food first.</p><Link className="v-button" to={`/stall/${stallId}`}>Choose your food</Link></Frame>;
  return <Frame name={stall.name} open={stall.open}><h1>Your order</h1><form className="v-stack" onSubmit={event => { event.preventDefault(); void task.run(async () => {
    if (identity.session?.role !== 'customer') { await api('/auth/customer', 'POST', {}); await identity.refresh(); }
    const result = await api('/orders', 'POST', { stallId, requestKey: draft.requestKey, customerName: name, customerPhone: phone, gateNote: gate,
      collectionTime, method, fulfilment, over18, lines: lines.map(line => ({ itemId: line.item.id, quantity: line.quantity, extras: line.extras, ifMissing: 'omit' })) });
    clear(); navigate(`/order/${result.order.id}`, { replace: true });
  }); }}>
    {(['stall', 'spaza', 'tavern'] as const).filter(shop => lines.some(line => line.item.shop === shop)).map(shop => <section className="v-card v-stack" key={shop}><h2>{shop === 'stall' ? stall.name : lines.find(line => line.item.shop === shop)!.item.shopName}</h2>{lines.filter(line => line.item.shop === shop).map(line => <div key={draftKey(line)} className="v-stack"><div className="v-row"><span>{line.quantity} × {line.item.name}</span><strong>{rand(draftTotal([line]))}</strong></div>{line.extras.length > 0 && <p className="muted">{line.item.extras?.filter(extra => line.extras.includes(extra.id)).map(extra => extra.name).join(', ')}</p>}{shop !== 'stall' && <p className="muted">If not there: leave it out</p>}<div className="v-row"><label>Quantity<input className="v-small-input" type="number" min="1" max="20" required value={line.quantity} onChange={event => update({ ...draft, requestKey: crypto.randomUUID(), lines: draft.lines.map(row => draftKey(row) === draftKey(line) ? { ...row, quantity: Number(event.target.value) } : row) })} /></label><button type="button" className="v-link" onClick={() => update({ ...draft, requestKey: crypto.randomUUID(), lines: draft.lines.filter(row => draftKey(row) !== draftKey(line)) })}>Remove</button></div></div>)}</section>)}
    <div className="v-row"><h2>Total</h2><strong className="v-money">{rand(draftTotal(lines))}</strong></div>
    <div className="v-row">{stall.delivery && <label className="v-choice"><input type="radio" name="fulfilment" checked={fulfilment === 'delivery'} onChange={() => setFulfilment('delivery')} />Delivery</label>}<label className="v-choice"><input type="radio" name="fulfilment" checked={fulfilment === 'collection'} onChange={() => setFulfilment('collection')} />Collection</label></div>
    <h2>{fulfilment === 'collection' ? 'You pay when you collect' : 'You pay at the gate'}</h2><label className="v-choice"><input type="radio" name="method" checked={method === 'cash'} onChange={() => setMethod('cash')} />Cash</label>{stall.takesCard && <label className="v-choice"><input type="radio" name="method" checked={method === 'card'} onChange={() => setMethod('card')} />Card payments</label>}
    {remembered&&<p className="muted">Welcome back, {name}. Same details as last time? You can edit them below.</p>}<label>Name<input required autoComplete="name" value={name} onChange={event => {edited.current=true;setName(event.target.value);}} /></label><label>Phone<input required type="tel" autoComplete="tel" value={phone} onChange={event => {edited.current=true;setPhone(event.target.value);}} /></label>
    {!remembered && /^0\d{9}$|^\+27\d{9}$/.test(phone.replace(/[\s()-]/g,'')) && <div className="v-card v-stack"><p>Ordered before on another device? Verify your number to recover your saved details, or keep filling in this form.</p><button type="button" className="v-button secondary" disabled={recover.busy} onClick={()=>void recover.run(async()=>{await ensureCustomer();const result=await api('/customer/recover','POST',{phone});setChallenge(result.challengeId);setRecoveryNote('Verification requested. If it arrives on WhatsApp, enter the six-digit code below. You can continue ordering without it.');})}>Find my saved details</button>{recoveryNote && <p role="status">{recoveryNote}</p>}{challenge && <><label>WhatsApp verification code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={recoveryCode} onChange={event=>setRecoveryCode(event.target.value.replace(/\D/g,''))}/></label><button type="button" className="v-button secondary" disabled={recover.busy||recoveryCode.length!==6} onClick={()=>void recover.run(async()=>{const result=await api('/customer/recover/verify','POST',{challengeId:challenge,code:recoveryCode});setSavedCustomer(result.profile);setChallenge('');setRecoveryCode('');setRecoveryNote(result.profile?'':'No saved details found. Fill in the form to place your first order.');})}>Verify number</button></>}{savedCustomer && <><p>Welcome back, {savedCustomer.name}. Same details as last time?</p><button type="button" className="v-button secondary" onClick={()=>{setName(savedCustomer.name);setPhone(savedCustomer.phone);setGate(savedCustomer.gateNote);setRemembered(true);setSavedCustomer(null);}}>Use saved details</button></>}<ErrorText text={recover.error}/></div>}
    {fulfilment === 'delivery' ? <label>Address and gate note<textarea required value={gate} onChange={event => {edited.current=true;setGate(event.target.value);}} placeholder="Street, house number, gate and how to find you" /></label> : <label>Collection time<input required type="time" value={collectionTime} onChange={event => setCollectionTime(event.target.value)} /></label>}
    {alcohol && <label className="v-choice"><input type="checkbox" required checked={over18} onChange={event => setOver18(event.target.checked)} />I confirm that I am 18 years and older</label>}
    <ErrorText text={task.error || resource.error} /><button className="v-button" disabled={task.busy || !stall.open}>{task.busy ? 'Sending…' : 'Send order'}</button><Link className="v-link" to={`/stall/${stallId}`}>Add more food</Link>
  </form></Frame>;
}
async function reorder(order: GateOrder, update: ReturnType<typeof useDraft>['update'], navigate: ReturnType<typeof useNavigate>) {
  const stall = await api<PublicStall>(`/stalls/${order.stallId}`);
  const lines = order.lines.map(line => {
    const item = stall.menu.find(item => item.id === line.itemId);
    if (!item) throw new Error(`${line.name} is not available today. Choose from the menu.`);
    const extras = (line.extras ?? []).map(extra => extra.id);
    if (extras.some(id => !item.extras?.some(extra => extra.id === id))) throw new Error('An extra has changed. Choose from the menu.');
    return { item, quantity: line.quantity, extras, ifMissing: 'omit' as const };
  });
  const samePrices = lines.every((line, index) => (line.item.priceCents ?? 0) + (line.item.extras ?? []).filter(extra => line.extras.includes(extra.id)).reduce((sum, extra) => sum + extra.priceCents, 0) === order.lines[index].priceCents);
  if (samePrices && order.fulfilment === 'delivery') {
    const result = await api('/orders', 'POST', { stallId: stall.id, requestKey: crypto.randomUUID(), customerName: order.customerName, customerPhone: order.customerPhone, gateNote: order.gateNote, fulfilment: order.fulfilment, method: order.method,
      lines: lines.map(line => ({ itemId: line.item.id, quantity: line.quantity, extras: line.extras, ifMissing: line.ifMissing })) });
    navigate(`/order/${result.order.id}`);
  } else { update({ stallId: stall.id, lines, requestKey: crypto.randomUUID() }); navigate(`/stall/${stall.id}/order`); }
}
function CancelOrder({order,reload}:{order:GateOrder;reload:()=>Promise<unknown>}){
 const task=useTask();return order.state==='new'?<><button className="v-button secondary" disabled={task.busy} onClick={()=>{if(window.confirm('Cancel order #'+order.number+'? The stall will be told not to prepare it.'))void task.run(async()=>{try{await api('/orders/'+order.id+'/cancel','POST',{});}finally{await reload();}});}}>Cancel order</button><ErrorText text={task.error}/></>:null;
}
export function Track() {
  const { orderId = '' } = useParams(), resource = useResource<{ order: GateOrder; stallName: string; stallPhone: string; riderPhone: string | null }>(`/orders/${orderId}`, true), { update } = useDraft(), task = useTask(), navigate = useNavigate();
  if (!resource.data) return <Loading error={resource.error} />;
  const { order, stallName, riderPhone, stallPhone } = resource.data, delivered = order.state === 'delivered';
  if(order.state==='cancelled')return <Frame name={stallName}><h1>Order cancelled</h1><p>Order #{order.number} was cancelled before cooking. Your stall’s kitchen has been updated.</p><Link className="v-button" to={'/stall/'+order.stallId}>Back to menu</Link><CustomerNav id={order.stallId}/></Frame>;
  const progress = order.state === 'new' ? 0 : order.state==='cooking'?1:order.state === 'ready' ? 2 : order.state === 'on_the_way' ? 3 : 4;
  return <Frame name={stallName}><div className="v-confirm">✓</div><h1>{delivered ? 'Enjoy.' : `${stallName} has your order.`}</h1>{!delivered && <p>{order.fulfilment === 'collection' ? `Collecting ${order.collectionTime}. Pay ${rand(orderMoney(order).totalCents)} when you collect.` : `About 25 min. Pay ${rand(orderMoney(order).totalCents)} at the gate.`}</p>}<p className="muted">Order #{order.number}</p>
    <ol className="v-progress">{(order.fulfilment === 'collection' ? ['Received', 'Cooking', 'Ready to collect', 'Collected'] : ['Received', 'Cooking', order.lines.some(line => line.shop !== 'stall') ? 'Delivery person collecting your items' : 'Ready for delivery', 'Delivery on the way', 'At your gate']).map((label, i) => <li key={label} className={i <= (order.fulfilment === 'collection' && delivered ? 3 : progress) ? 'current' : ''}>{label}</li>)}</ol>
    {order.fulfilment==='delivery'&&<p>{order.riderName?'Your delivery person is '+order.riderName+'.':'Your stall will confirm who is delivering.'}</p>}<RouteStops order={order} stallName={stallName} /><section className="v-card v-stack">{order.lines.map(line => <div className="v-row" key={line.lineId || line.itemId}><span>{line.quantity} × {line.outcome === 'alternative' ? line.alternative!.name : line.name}{line.outcome === 'omitted' && ' · left out'}</span><strong>{rand(lineTotal(line))}</strong></div>)}<div className="v-row"><strong>Total</strong><strong>{rand(orderMoney(order).totalCents)}</strong></div></section>
    <CancelOrder order={order} reload={resource.reload}/>{!delivered && <a className="v-button" href={wa(riderPhone || stallPhone, `Hi, I'm checking on order #${order.number}.`)} target="_blank" rel="noreferrer">{riderPhone ? 'WhatsApp delivery' : `WhatsApp ${stallName}`}</a>}
    {delivered && <button className="v-button" disabled={task.busy} onClick={() => task.run(() => reorder(order, update, navigate))}>Order again</button>}<ErrorText text={task.error || resource.error} /><CustomerNav id={order.stallId} />
  </Frame>;
}
export function MyOrders() {
  const identity = useIdentity(), resource = useResource<{ orders: GateOrder[] }>('/orders', true), { update, draft } = useDraft(), task = useTask(), navigate = useNavigate();
  if (identity.session?.role !== 'customer') return <Frame><h1>My orders</h1><p>No orders yet.</p>{draft.stallId && <Link className="v-button" to={`/stall/${draft.stallId}`}>Choose your food</Link>}</Frame>;
  if (!resource.data) return <Loading error={resource.error} />;
  return <Frame><h1>My orders</h1>{!resource.data.orders.length && <p>No orders yet.</p>}{resource.data.orders.map(order => <section className="v-card v-stack" key={order.id}><Link to={`/order/${order.id}`}><strong>#{order.number} · {rand(orderMoney(order).totalCents)}</strong><p>{order.state === 'cancelled'?'Cancelled':order.state === 'delivered' ? 'Delivered' : order.state === 'on_the_way' ? 'Delivery on the way' : order.state === 'ready' ? 'Ready' : order.state==='cooking'?'Cooking':'Received'}</p></Link><CancelOrder order={order} reload={resource.reload}/>{order.state === 'delivered' && <button className="v-button secondary" disabled={task.busy} onClick={() => task.run(() => reorder(order, update, navigate))}>Order again</button>}</section>)}<ErrorText text={task.error} /></Frame>;
}

