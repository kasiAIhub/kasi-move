import { Link, useParams } from 'react-router-dom';
import { Bike, Check, Navigation, Phone } from 'lucide-react';
import { money, stops } from '../../data/catalogue';
import { useStore, store } from '../../store';
import { canTransition, deliveryFee, requiredTills, riderEarnings } from '../../store/machine';
import {
  Empty,
  GroupedLines,
  Heading,
  RouteMap,
  StopList,
  Tag,
  useAction,
} from '../../components/ui';
import type { Order, OrderAction } from '../../types';
export function RiderJob({ order }: { order: Order }) {
  const { streetNodes } = useStore();
  const act = useAction();
  const pending = requiredTills(order).find((t) => !order.collected.includes(t));
  const action: OrderAction =
    order.rider === 'offered'
      ? 'accept'
      : order.rider === 'gate'
        ? 'deliver'
        : `collect_${pending || 'stall'}`;
  const label =
    action === 'accept'
      ? 'Accept'
      : action === 'deliver'
        ? 'Mark delivered'
        : action === 'collect_stall'
          ? 'Collect from stall'
          : action === 'collect_spaza'
            ? 'Collect from spaza'
            : 'Collect from Sbu’s';
  const destination = pending
    ? streetNodes.find((s) => s.id === order.lines.find((l) => l.till === pending)?.merchantId)
        ?.address || stops.find((s) => s.till === pending)!.address
    : `${order.address.street}, ${order.address.suburb}`;
  return (
    <article className="card rider-card" data-testid={`rider-${order.id}`}>
      <div className="row-between job-header">
        <div>
          <p className="eyebrow">ONE TICKET. ONE RIDER.</p>
          <Link to={`/rider/jobs/${order.id}`}>
            <h2>Job #{order.id}</h2>
          </Link>
        </div>
        <Tag>
          {order.status === 'delivered'
            ? 'Delivered'
            : order.rider === 'offered'
              ? 'New offer'
              : 'Active job'}
        </Tag>
      </div>
      <RouteMap order={order} />
      <StopList order={order} />
      <div className="row-between" style={{ marginTop: 18 }}>
        <span className="small muted">Delivery earnings · net per ticket</span>
        <strong className="green">{money(riderEarnings(order))}</strong>
      </div>
      {order.status !== 'delivered' && (
        <>
          <div className="rider-actions">
            <a
              className="button secondary"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`}
            >
              <Navigation size={16} /> Navigate
            </a>
            <button
              data-tour="accept"
              className="button"
              disabled={!canTransition(order, action)}
              onClick={() => act(() => store.act(order.id, action))}
            >
              {label}
              {action === 'deliver' ? <Check size={16} /> : <Bike size={16} />}
            </button>
          </div>
          {!canTransition(order, action) && (
            <p className="small muted" style={{ marginTop: 12 }}>
              {order.kitchen !== 'ready'
                ? 'The kitchen must mark the Kota ready before you accept.'
                : 'Waiting for this shop to mark its items packed.'}
            </p>
          )}
        </>
      )}
      <div className="rider-actions">
        <a
          className="button secondary"
          target="_blank"
          rel="noreferrer"
          href={`https://wa.me/27${order.address.phone.replace(/\D/g, '').slice(-9)}?text=${encodeURIComponent('Help with ticket #' + order.id)}`}
        >
          WhatsApp customer
        </a>
        {pending && (
          <a
            className="button secondary"
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/27${(streetNodes.find((s) => s.id === order.lines.find((l) => l.till === pending)?.merchantId)?.whatsapp || '').slice(-9)}?text=${encodeURIComponent('Missing item on ticket #' + order.id)}`}
          >
            WhatsApp this stop
          </a>
        )}
      </div>
      <Link className="subtle-link" to={`/rider/jobs/${order.id}`}>
        Job details & customer
      </Link>
    </article>
  );
}
export function Deliveries({ tour = false }: { tour?: boolean }) {
  const { orders } = useStore();
  const active = orders.filter(
    (o) =>
      o.address.mode === 'delivery' &&
      !['delivered', 'cancelled'].includes(o.status) &&
      (!tour || o.id === 1048),
  );
  return (
    <>
      <Heading
        eyebrow="RIDER · YOUR STREET IS CALLING"
        title="One run. Every stop."
        text="Stall → spaza → Sbu’s place → customer gate."
      />
      {!active.length && (
        <Empty
          title="You’re all caught up"
          text="The next street ticket will appear here."
          to="/rider/earnings"
          label="View earnings"
        />
      )}
      {active.map((o) => (
        <RiderJob key={o.id} order={o} />
      ))}
    </>
  );
}
export function JobDetail() {
  const { id } = useParams();
  const { orders } = useStore();
  const order = orders.find((o) => o.id === Number(id));
  if (!order)
    return (
      <Empty
        title="Job not found"
        text="See your available delivery jobs."
        to="/rider"
        label="View deliveries"
      />
    );
  return (
    <>
      <Heading
        eyebrow="RIDER · JOB DETAIL"
        title={`Job #${order.id}`}
        text="Everything you need for one neighbourhood run."
      />
      <section className="card profile-details">
        <h2>{order.address.name}</h2>
        <a href={`tel:${order.address.phone.replaceAll(' ', '')}`}>
          <Phone size={15} className="inline-icon" /> {order.address.phone}
        </a>
        <p>
          {order.address.street}, {order.address.suburb}, {order.address.postcode}
        </p>
        <p>
          <strong>Gate note:</strong> {order.address.note}
        </p>
        <Tag>{money(riderEarnings(order))} net per completed ticket</Tag>
      </section>
      <GroupedLines lines={order.lines} hideMoney />
      <RiderJob order={order} />
    </>
  );
}
export function Earnings() {
  const { orders } = useStore();
  const day = (d: Date) => d.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' });
  const completed = orders.filter(
    (o) =>
      !o.legacy &&
      o.status === 'delivered' &&
      o.address.mode === 'delivery' &&
      day(new Date(o.history.at(-1)?.at || o.createdAt)) === day(new Date()),
  );
  const earned = completed.reduce((n, o) => n + riderEarnings(o), 0);
  return (
    <>
      <Heading
        eyebrow="RIDER · YOUR EARNINGS"
        title="Every run counts."
        text="The street looks after its rider."
      />
      <div className="stats-grid">
        <div className="card stat">
          <p>Today</p>
          <div className="value">{money(earned)}</div>
          <small>Completed tickets only</small>
        </div>
        <div className="card stat">
          <p>Deliveries</p>
          <div className="value">{completed.length}</div>
          <small>Completed deliveries</small>
        </div>
        <div className="card stat">
          <p>Net per ticket</p>
          <div className="value">{money(10)}</div>
          <small>Protected rider wage</small>
        </div>
      </div>
      <div className="info-strip">
        <Bike size={21} />
        <p>
          You earn R10 net for each completed delivered ticket, regardless of stop count or payment
          method.
        </p>
      </div>
      <section className="card">
        <h2>Completed jobs</h2>
        {completed.map((o) => (
          <Link className="activity-row" to={`/rider/jobs/${o.id}`} key={o.id}>
            <span>
              #{o.id} · {o.address.name}
              <small>Completed ticket</small>
            </span>
            <strong>{money(riderEarnings(o))}</strong>
          </Link>
        ))}
      </section>
    </>
  );
}
export function RiderProfile() {
  const { stall } = useStore();
  const act = useAction();
  return (
    <>
      <Heading
        eyebrow="RIDER PROFILE"
        title={`Sharp, ${stall.riderName.split(' ')[0]}.`}
        text="Your neighbourhood knows your wheels."
      />
      <section className="card profile-details">
        <Bike size={32} />
        <h2>{stall.riderName}</h2>
        <p>{stall.riderPhone}</p>
        {!stall.riderAccepted && (
          <button className="button" onClick={() => act(() => store.acceptRiderInvite())}>
            Accept rider invitation
          </button>
        )}
        <p className="muted">Mamelodi West · community rider</p>
        <Tag>Available for street runs</Tag>
        <p className="small muted">
          Demo profile. Location and rider contact actions are illustrative.
        </p>
      </section>
      <Link className="button" to="/rider">
        Find a delivery
      </Link>
    </>
  );
}
