import { SettlementPanel, SubscriptionPanel, MerchantSettings } from '../V3';
import { OwnerOverview, OwnerSettings } from './OwnerSimple';
import { ProductImage } from '../../components/ProductImage';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, PackageCheck } from 'lucide-react';
import { money } from '../../data/catalogue';
import { store, useStore } from '../../store';
import { allReady, canTransition, tillTotal } from '../../store/machine';
import { Empty, GroupedLines, Heading, Tag, useAction } from '../../components/ui';
import type { Till } from '../../types';
import { dashboardTotals, foodTickets, kitchenLabel, riderLabel } from './selectors';
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}
export function Kitchen({ tour = false }: { tour?: boolean }) {
  const { orders } = useStore();
  const act = useAction();
  const now = useNow();
  const active = foodTickets(orders).filter(
    (o) =>
      !['delivered', 'cancelled'].includes(o.status) &&
      o.lines.some((l) => l.till === 'stall') &&
      (!tour || o.id === 1048),
  );
  return (
    <>
      <OwnerOverview />
      <h2 className="owner-cook-title">
        {active.length ? `${active.length} to cook` : 'No orders yet. Share your stall link.'}
      </h2>
      <div className="ticket-grid">
        {active.map((order) => (
          <article
            data-testid={`kitchen-${order.id}`}
            className="card kitchen-ticket"
            key={order.id}
          >
            <div className="row-between">
              <Link to={`/owner/orders/${order.id}`}>
                <h2>#{order.id}</h2>
              </Link>
              <Tag gold={order.kitchen === 'new'}>{kitchenLabel(order)}</Tag>
            </div>
            <p className="small muted">Phone ending {order.address.phone.slice(-4)}</p>
            <p className="ticket-customer">
              {order.address.name.split(' ')[0]} ·{' '}
              {Math.max(0, Math.floor((now - Date.parse(order.createdAt)) / 60000))} min since paid
            </p>
            {order.lines
              .filter((l) => l.till === 'stall')
              .map((l) => (
                <div className="food-line" key={l.key}>
                  <strong>
                    {l.quantity} × {l.name}
                  </strong>
                  <small>
                    {l.extras.length
                      ? l.extras.map((e) => e.name).join(' · ')
                      : 'Standard · no extras'}
                  </small>
                </div>
              ))}
            {order.lines.some((l) => l.till !== 'stall') && (
              <details>
                <summary>Route context · read only</summary>
                {order.lines
                  .filter((l) => l.till !== 'stall')
                  .map((l) => (
                    <p className="small muted" key={l.key}>
                      {l.quantity} × {l.name} · {l.till}
                    </p>
                  ))}
              </details>
            )}
            {order.kitchen !== 'ready' ? (
              <button
                data-tour="ready"
                className="button full"
                onClick={() =>
                  act(() =>
                    store.act(
                      order.id,
                      order.kitchen === 'new' ? 'start_kitchen' : 'ready_kitchen',
                    ),
                  )
                }
              >
                {order.kitchen === 'new' ? 'Paid. Make it.' : 'Ready for rider'}{' '}
                <ArrowUpRight size={16} />
              </button>
            ) : order.address.mode === 'collection' ? (
              <button
                className="button full"
                disabled={!allReady(order)}
                onClick={() => act(() => store.act(order.id, 'collect_customer'))}
              >
                Handed to customer <Check size={16} />
              </button>
            ) : (
              <p className="green small" style={{ marginTop: 18 }}>
                <Check size={15} className="inline-icon" />{' '}
                {order.collected.includes('stall') ? 'Collected by rider' : 'Waiting for rider'}
              </p>
            )}
            <p className="network-line">paid on shared order #{order.id}</p>
          </article>
        ))}
      </div>
    </>
  );
}
export function ManageCatalogue({ till }: { till: Till }) {
  const { availability, catalogue: products, stall } = useStore();
  const act = useAction();
  const [newName, setNewName] = useState(''),
    [newPrice, setNewPrice] = useState(35);
  return (
    <>
      <Heading
        eyebrow={
          till === 'stall'
            ? 'KOTA OWNER'
            : till === 'spaza'
              ? 'MAMELODI CORNER SPAZA'
              : 'SBU’S PLACE'
        }
        title={till === 'stall' ? 'Your Kota menu' : 'Your catalogue'}
        text="Keep your stock current. Changes reach the customer menu immediately."
      />
      {till === 'stall' && (
        <Link className="button full" to={stall.ownerSetupDone ? '/kitchen' : '/owner/start'}>
          {stall.ownerSetupDone ? 'Back to orders' : 'Done · open my stall'}
        </Link>
      )}
      {till === 'stall' && (
        <section className="card delivery-form">
          <h2>Add Kota item</h2>
          <label>
            New item name
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <label>
            New item price
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={newPrice}
              onChange={(e) => setNewPrice(Number(e.target.value))}
            />
          </label>
          <button
            className="button"
            onClick={() =>
              act(() => {
                store.addProduct(newName, newPrice);
                setNewName('');
              }, 'Item added to your own menu.')
            }
          >
            Add item
          </button>
        </section>
      )}
      <div className="catalogue-grid">
        {products
          .filter((p) => p.till === till)
          .map((p) => (
            <section className="card catalogue-toggle" key={p.id}>
              <label className="extra-row">
                <ProductImage
                  className="owner-product-image"
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                />
                <div>
                  <h3>{p.name}</h3>
                  <p className="small muted">
                    {money(p.price)} · {availability[p.id] ? 'In stock' : 'Out of stock'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`${p.name} availability`}
                  checked={availability[p.id]}
                  onChange={() => act(() => store.available(p.id))}
                />
              </label>
              {till === 'stall' && (
                <form
                  className="delivery-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    act(
                      () =>
                        store.editProduct(p.id, {
                          name: String(data.get('name')),
                          description: String(data.get('description')),
                          price: Number(data.get('price')),
                        }),
                      'Your menu item was updated.',
                    );
                  }}
                >
                  <label>
                    Item name
                    <input name="name" defaultValue={p.name} />
                  </label>
                  <label>
                    Description
                    <input name="description" defaultValue={p.description} />
                  </label>
                  <label>
                    Price (R)
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      defaultValue={p.price}
                    />
                  </label>
                  <button className="button" type="submit">
                    Save item
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => act(() => store.hideProduct(p.id))}
                  >
                    {p.hidden ? 'Show item' : 'Hide item'}
                  </button>
                </form>
              )}
            </section>
          ))}
      </div>
    </>
  );
}
export function Packing({ till }: { till: 'spaza' | 'tavern' }) {
  const { orders, merchant } = useStore();
  const act = useAction();
  const queue = orders.filter(
    (o) => o[till] !== 'none' && !['delivered', 'cancelled'].includes(o.status),
  );
  return (
    <>
      <Heading
        eyebrow={till === 'spaza' ? 'SPAZA OWNER' : 'TAVERN OWNER'}
        title="Pack it. Keep it moving."
        text={
          till === 'spaza'
            ? 'Only your spaza lines. Every ticket already shared with the street.'
            : 'Sbu’s place around the corner'
        }
      />
      {queue.length === 0 && (
        <Empty
          title="All clear for now"
          text="Tickets with your items will appear here."
          to={till === 'spaza' ? '/spaza-owner/catalogue' : '/tavern-owner/catalogue'}
          label="View catalogue"
        />
      )}
      <div className="ticket-grid">
        {queue.map((o) => (
          <article className="card" data-testid={`${till}-${o.id}`} key={o.id}>
            <div className="row-between">
              <h2>Order #{o.id}</h2>
              <Tag>{o[till] === 'ready' ? 'Packed' : 'To pack'}</Tag>
            </div>
            {o.lines
              .filter((l) => l.till === till)
              .map((l) => (
                <div className="food-line" key={l.key}>
                  <strong>
                    {l.quantity} × {l.name}
                  </strong>
                  <small>{money(tillTotal([l], till))}</small>
                </div>
              ))}
            <button
              className="button full"
              disabled={
                o[till] === 'ready' || o.acknowledgements?.[merchant?.id || ''] === 'unavailable'
              }
              onClick={() =>
                act(
                  () => store.act(o.id, till === 'spaza' ? 'pack_spaza' : 'pack_tavern'),
                  'Packed. The rider’s job card is updated.',
                )
              }
            >
              <span>{o[till] === 'ready' ? 'Packed for collection' : 'Mark packed'}</span>
              <PackageCheck size={18} />
            </button>
            <div className="row-between">
              <button
                className="button secondary"
                onClick={() => act(() => store.acknowledge(o.id, true), 'Items acknowledged.')}
              >
                Got it
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  act(
                    () => store.acknowledge(o.id, false),
                    'Stock marked unavailable. Resolve with the stall before packing.',
                  )
                }
              >
                Don’t have it
              </button>
            </div>
            {o.acknowledgements?.[merchant?.id || ''] === 'unavailable' && (
              <p className="warning">Missing items — packing is paused.</p>
            )}
            <p className="network-line" style={{ marginTop: 16 }}>
              paid on shared order #{o.id}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
export function Dashboard({ till, tour = false }: { till: Till; tour?: boolean }) {
  const { orders } = useStore();
  const now = useNow();
  const { paid, sales, count, shared } = dashboardTotals(orders, till, new Date(now));
  const top = Object.entries(
    paid
      .flatMap((o) => o.lines.filter((l) => l.till === till))
      .reduce<Record<string, number>>(
        (acc, l) => ({ ...acc, [l.name]: (acc[l.name] || 0) + l.quantity }),
        {},
      ),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const units = paid
    .flatMap((o) => o.lines.filter((l) => l.till === till))
    .reduce((sum, l) => sum + l.quantity, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - 6 + i);
    return d;
  });
  const dailySales = days.map((d) => dashboardTotals(orders, till, d).sales);
  const chartMax = Math.max(1, ...dailySales);
  return (
    <>
      <Heading
        eyebrow={
          till === 'stall'
            ? 'KOTA OWNER · YOUR TILL'
            : till === 'spaza'
              ? 'SPAZA OWNER · YOUR TILL'
              : 'TAVERN OWNER · YOUR TILL'
        }
        title="Good business. Good neighbours."
        text={
          till === 'tavern'
            ? 'Sbu’s place around the corner'
            : 'A look at what your corner earned today.'
        }
      />
      <div className="stats-grid">
        <section className="card stat" data-tour="sales">
          <p>Sales today</p>
          <div className="value" data-testid="sales-total">
            {money(sales)}
          </div>
          <small>
            {till === 'stall'
              ? 'Kota & extras only'
              : `${till === 'spaza' ? 'Spaza' : 'Sbu’s'} items only`}
          </small>
        </section>
        <section className="card stat">
          <p>Orders today</p>
          <div className="value" data-testid="orders-count">
            {count}
          </div>
          <small>Your till’s tickets</small>
        </section>
        <section className="card stat">
          <p>Average order</p>
          <div className="value" data-testid="average-order">
            {money(Math.round(sales / (count || 1)))}
          </div>
          <small>Per shared order</small>
        </section>
      </div>
      {till === 'stall' && (
        <>
          <p className="small muted">
            Your own stall’s recorded item sales. Settlement deductions appear below.
          </p>
          <div className="warning">RUSSIAN STOCK LOW — 6 remaining</div>
        </>
      )}
      <div className="dashboard-grid">
        <section className="card">
          <div className="row-between">
            <h2>Last 7 days</h2>
            <span className="small muted">Your recorded sales</span>
          </div>
          <div
            className="chart"
            role="img"
            aria-label="Your recorded sales over the last seven days"
          >
            {dailySales.map((amount, i) => (
              <div key={i}>
                <span
                  className="bar"
                  style={{ height: `${(amount / chartMax) * 100}%`, minHeight: 0 }}
                />
                <small>{days[i].toLocaleDateString('en-ZA', { weekday: 'short' })}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>Top {till === 'stall' ? 'Kotas' : `${till} items`}</h2>
          {!top.length && <p className="small muted">No items sold yet.</p>}
          {top.map(([name, value]) => (
            <div
              className="top-item"
              key={name}
              data-tour={name === 'Russian Special' ? 'top-russian' : undefined}
            >
              <div className="row-between">
                <span>{name}</span>
                <span className="green">
                  {till === 'stall' ? Math.round((Number(value) / (units || 1)) * 100) : value}
                  {till === 'stall' ? '%' : ' sold'}
                </span>
              </div>
              <div className="bar-track">
                <span style={{ width: `${(Number(value) / (units || 1)) * 100}%` }} />
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="card">
        <div className="row-between">
          <h2>Shared orders today</h2>
          <Tag>{shared.length} tickets</Tag>
        </div>
        <p className="muted small" style={{ margin: '12px 0' }}>
          Your till is part of a bigger street. These amounts belong to your business.
        </p>
        {!shared.length && <p className="small muted">No shared orders for your till today.</p>}
        {shared.map((o) => (
          <div className="activity-row" data-testid={`till-${o.id}`} key={o.id}>
            <div>
              Order #{o.id}
              <small>paid on shared order #{o.id}</small>
            </div>
            <strong>{money(tillTotal(o.lines, till))}</strong>
          </div>
        ))}
      </section>
      {!tour && (
        <>
          <SettlementPanel />
          <SubscriptionPanel />
        </>
      )}
      <section className="card">
        <h2>Recent activity</h2>
        {paid.slice(0, 4).map((o) => (
          <div className="activity-row" key={o.id}>
            <span>
              #{o.id} · {o.address.name.split(' ')[0]}
              <small>{till === 'stall' ? kitchenLabel(o) : o.status.replaceAll('_', ' ')}</small>
            </span>
            <strong>{money(tillTotal(o.lines, till))}</strong>
          </div>
        ))}
      </section>
    </>
  );
}
export function OwnerOrders() {
  const { orders } = useStore();
  return (
    <>
      <Heading
        eyebrow="KOTA OWNER"
        title="Your food orders"
        text="Kota sales and extras, all in one place."
      />
      <div className="ticket-grid">
        {foodTickets(orders).map((o) => (
          <Link className="card" key={o.id} to={`/owner/orders/${o.id}`}>
            <div className="row-between">
              <h2>#{o.id}</h2>
              <strong>{money(tillTotal(o.lines, 'stall'))}</strong>
            </div>
            <p className="muted">
              {o.address.name} · {kitchenLabel(o)}
            </p>
            <span className="network-line">paid on shared order #{o.id}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
export function OwnerDetail() {
  const { id } = useParams();
  const { orders } = useStore();
  const order = foodTickets(orders).find((o) => o.id === Number(id));
  const act = useAction();
  if (!order)
    return (
      <Empty
        title="Ticket not found"
        text="Your kitchen has the active tickets."
        to="/kitchen"
        label="Back to kitchen"
      />
    );
  return (
    <>
      <Heading
        eyebrow="KOTA OWNER · FOOD DETAIL"
        title={`Order #${order.id}`}
        text={`paid on shared order #${order.id}`}
      />
      <GroupedLines lines={order.lines} only="stall" />
      {order.lines.some((l) => l.till !== 'stall') && (
        <section className="card">
          <h2>Read-only route context</h2>
          {order.lines
            .filter((l) => l.till !== 'stall')
            .map((l) => (
              <p key={l.key}>
                {l.quantity} × {l.name} · {l.till}
              </p>
            ))}
          <p className="small muted">
            These items belong to the connected shops. Their balances cannot be edited or withdrawn
            here.
          </p>
        </section>
      )}
      <section className="card profile-details">
        <Tag>{kitchenLabel(order)}</Tag>
        <h2>{order.address.name.split(' ')[0]}</h2>
        <p>Customer phone ending {order.address.phone.slice(-4)}</p>
        <p>
          {order.address.street}, {order.address.suburb}, {order.address.postcode}
        </p>
        <p>
          <strong>Gate note:</strong> {order.address.note}
        </p>
        <p role="status">Rider: {riderLabel(order)}</p>
        <strong>Your till: {money(tillTotal(order.lines, 'stall'))}</strong>
        {canTransition(order, 'cancel') && (
          <button
            className="button secondary"
            onClick={() =>
              act(() => store.act(order.id, 'cancel'), 'Ticket cancelled in the demo.')
            }
          >
            Cancel unstarted ticket
          </button>
        )}
      </section>
      <Link className="button" to="/kitchen">
        Back to kitchen
      </Link>
    </>
  );
}
export function More() {
  const { role } = useStore();
  if (role === 'owner') return <OwnerSettings />;
  return (
    <>
      <Heading title="Your shop" />
      <MerchantSettings />
      <Link className="button" to="/roles">
        Switch role
      </Link>
    </>
  );
}
