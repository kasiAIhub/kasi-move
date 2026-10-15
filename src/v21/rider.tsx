import { useEffect, useState } from 'react';
import {MemberInvite} from './team-access';
import type { GateOrder, OrderLine } from '../server/contracts';
import { orderMoney } from '../server/contracts';
import { api, day, rand, useResource, useTask, wa } from './client';
import { RouteStops } from './route-stops';
import { ErrorText, Frame, Loading } from './common';
export function RiderInvite(){return <MemberInvite role="rider"/>;}
export function Rider() {
  const team=useResource<{members:import('./team').TeamMember[]}>('/team',true);
  const stall = useResource<{ name: string; phone: string; open: boolean }>('/rider/stall', true), resource = useResource<{ orders: GateOrder[] }>('/orders', true), task = useTask();
  const [opened,setOpened]=useState(()=>new URLSearchParams(location.search).get('order')||new URLSearchParams(location.hash.slice(1)).get('order')||'');
  useEffect(()=>{if(opened&&resource.data?.orders.some(o=>o.id===opened&&!o.driverViewedAt&&o.state!=='delivered'))void task.run(async()=>{await api('/orders/'+opened+'/viewed','POST',{});await resource.reload();});},[opened,Boolean(resource.data?.orders.some(o=>o.id===opened)),resource.data?.orders.find(o=>o.id===opened)?.driverViewedAt]);
  if (!stall.data || !resource.data) return <Loading error={stall.error || resource.error} />;
  const data = stall.data, orders = resource.data.orders, runs = orders.filter(order => order.state !== 'delivered'), completed = orders.filter(order => order.state === 'delivered' && day(order.deliveredAt!) === day(Date.now()));
  async function collect(order: GateOrder, lines: OrderLine[], outcome: OrderLine['outcome']) {
    for (const line of lines) await api(`/orders/${order.id}/collect`, 'POST', { itemId: line.itemId, lineId: line.lineId, outcome });

    await resource.reload();
  }
  return <Frame name={data.name} open={data.open} back={false}><div className="v-row"><h1>My deliveries</h1><span>{completed.length} runs · {rand(completed.reduce((sum,order)=>sum+orderMoney(order).riderCents,0))}</span></div><ErrorText text={task.error || resource.error || team.error} />{team.data?.members.filter(m=>m.role==='rider').map(m=><label className="v-choice" key={m.id}><input type="checkbox" checked={Boolean(m.available)} disabled={task.busy} onChange={e=>void task.run(async()=>{await api('/team/member','POST',{id:m.id,available:e.target.checked});await team.reload();})}/>Available for new deliveries</label>)}{team.data?.members.map(m=><section className="v-card v-stack" key={m.id}><h2>{m.name}</h2><p>{rand(m.fee_cents)} per delivery</p><button className="v-link" onClick={()=>void task.run(async()=>{const result=await api('/team/link','POST',{id:m.id});window.location.assign('/team/access'+new URL(result.personalLink).hash);})}>My personal link — save on my phone</button></section>)}{!runs.length && <h2 className="v-card">Nothing yet</h2>}
    {runs.map(order => {
      const money = orderMoney(order), groups = (['stall', 'spaza', 'tavern'] as const).map(shop => ({ shop, lines: order.lines.filter(line => line.shop === shop) })).filter(group => group.lines.length);
      const current = groups.findIndex(group => group.lines.some(line => line.outcome === 'pending'));
      if(opened!==order.id)return <section className="v-card v-stack" key={order.id}><h2>Order #{order.number} · {order.customerName}</h2><p>{order.state==='ready'?'Ready for delivery':order.state==='on_the_way'?'On the way':'Kitchen preparing'} · {rand(order.riderFeeCents??0)} for you</p><button className="v-button" onClick={()=>setOpened(order.id)}>Open order #{order.number}</button></section>;
      return <section className="v-card v-stack" key={order.id}><h2>RUN #{order.number} · {rand(order.riderFeeCents ?? 1000)} for you</h2><p>{order.state==='ready'?'Ready for delivery':order.state==='on_the_way'?'On the way':'Wait for the kitchen to mark this order ready.'}</p>{!order.driverAcceptedAt&&<button className="v-button" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/orders/'+order.id+'/accept','POST',{});await resource.reload();})}>Accept delivery</button>}<RouteStops order={order} stallName={data.name} />{groups.map((group, index) => <div className={`v-stop ${index === current ? 'active' : ''}`} key={group.shop}><h3>{index + 1} · {group.shop === 'stall' ? data.name : group.lines[0].shopName}</h3>
        {group.lines.map(line => <div className="v-stack" key={line.lineId || line.itemId}><p>{group.shop === 'stall' ? 'Collect' : 'Buy'}: {line.quantity} × {line.name}{line.extras?.length ? ` + ${line.extras.map(extra => extra.name).join(', ')}` : ''}{group.shop !== 'stall' && ` · ${rand(line.priceCents * line.quantity)} cash`}{line.alcohol && ' · 18+'}</p>
          {line.outcome !== 'pending' ? <p className="v-open">{line.outcome === 'omitted' ? 'Left out' : line.outcome === 'alternative' ? `Got ${line.alternative!.name}` : 'Got it'}</p> : <>
            {line.alternative && <p className="muted">not there? → {line.alternative.name} {rand(line.alternative.priceCents * line.quantity)}</p>}
            <div className="v-actions"><button className="v-button" disabled={task.busy || current !== index || order.state!=='ready' || !order.driverAcceptedAt} onClick={() => task.run(() => collect(order, [line], 'original'))}>Got it</button>{group.shop !== 'stall' && <>{line.alternative && <button className="v-button secondary" disabled={task.busy || current !== index || order.state!=='ready' || !order.driverAcceptedAt} onClick={() => task.run(() => collect(order, [line], 'alternative'))}>Got {line.alternative.name}</button>}<button className="v-link" disabled={task.busy || current !== index || order.state!=='ready' || !order.driverAcceptedAt} onClick={() => task.run(() => collect(order, [line], 'omitted'))}>{line.alternative ? 'Neither — leave out' : 'Not there — leave out'}</button></>}</div>
          </>}
        </div>)}
      </div>)}<div className={`v-stop ${current === -1 ? 'active' : ''}`}><h3>{groups.length + 1} · {order.customerName}'s gate</h3><p>{order.gateNote}</p><strong>{order.method === 'cash' ? `Collect ${rand(money.totalCents)} · CASH` : `Collect ${rand(money.totalCents)} · CARD PAYMENTS · bring ${data.name}'s machine`}</strong>
        {order.state==='ready'&&current===-1&&<button className="v-button" disabled={task.busy||!order.driverAcceptedAt} onClick={()=>void task.run(async()=>{await api('/orders/'+order.id+'/depart','POST',{});await resource.reload();})}>On the way</button>}{order.state==='on_the_way'&&<button className="v-button" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/orders/'+order.id+'/deliver','POST',{});await resource.reload();})}>Delivered</button>}</div>
      <div className="v-actions"><a className="v-button secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(current === -1 ? order.gateNote : groups[current].shop === 'stall' ? data.name : groups[current].lines[0].shopName)}`} target="_blank" rel="noreferrer">Navigate</a><a className="v-button secondary" href={wa(order.customerPhone, `Hi ${order.customerName}, I'm bringing order #${order.number}.`)} target="_blank" rel="noreferrer">WhatsApp {order.customerName}</a></div>
      </section>;
    })}
    {completed.map(order => { const money = orderMoney(order); return <div className="v-card" key={order.id}><strong>#{order.number} · {rand(order.riderFeeCents ?? 1000)} for you</strong><p>{order.method === 'cash' ? `you spent ${rand(money.shopSpendCents)} at shops · give ${data.name} ${rand(money.kotaCents)}` : `${data.name} owes you ${rand(money.shopSpendCents + money.riderCents)}`}</p></div>; })}
    <p className="muted">{completed.length} runs · {rand(completed.reduce((sum,order)=>sum+orderMoney(order).riderCents,0))} · shops {rand(completed.reduce((sum, order) => sum + orderMoney(order).shopSpendCents, 0))} · settle with {data.name}</p>
  </Frame>;
}


