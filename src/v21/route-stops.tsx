import { Home, Store, ShoppingBag, Wine, type LucideIcon } from 'lucide-react';
import type { GateOrder } from '../server/contracts';

export function RouteStops({ order, stallName }: { order: GateOrder; stallName: string }) {
  const delivered = order.state === 'delivered';
  const stops: { key: string; name: string; done: boolean; note: string; Icon: LucideIcon }[] = (['stall', 'spaza', 'tavern'] as const).flatMap(shop => {
    const lines = order.lines.filter(line => line.shop === shop);
    if (!lines.length) return [];
    return [{ key: shop, name: shop === 'stall' ? stallName : lines[0].shopName,
      done: delivered || lines.every(line => line.outcome !== 'pending'),
      note: shop === 'stall' ? (order.state === 'new' ? 'Order received' : order.state==='cooking'?'Cooking your food' : 'Collect the food') : 'Collect your next-door items',
      Icon: shop === 'stall' ? Store : shop === 'spaza' ? ShoppingBag : Wine }];
  });
  if (order.fulfilment === 'delivery') stops.push({ key: 'gate', name: `${order.customerName}’s gate`, done: delivered, note: delivered ? 'Delivered' : 'Everything on one delivery', Icon: Home });
  const current = stops.findIndex(stop => !stop.done);
  return <section className="v-route" aria-label="Order route"><div className="v-row"><h2>{order.fulfilment === 'collection' ? 'Your collection' : 'Your delivery route'}</h2><span className="v-pill">{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</span></div>
    <ol>{stops.map((stop, index) => <li key={stop.key} className={stop.done ? 'done' : index === current ? 'active' : ''}><span className="v-route-dot"><stop.Icon size={19} /></span><div><strong>{stop.name}</strong><p>{stop.done ? (stop.key === 'stall' && order.fulfilment === 'collection' ? 'Collected' : 'Complete') : stop.note}</p></div><span className="v-route-number">{stop.done ? '✓' : index + 1}</span></li>)}</ol>
  </section>;
}
