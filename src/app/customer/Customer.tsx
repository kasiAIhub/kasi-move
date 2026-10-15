import { AgeConfirmation } from '../V3';
import { deliveryIssue } from '../../store/v3/settlement';
import { ProductImage } from '../../components/ProductImage';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  MapPin,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Star,
  Bike,
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  defaultAddress,
  extras,
  money,
  sowetoAddress,
  tillNames,
  stops,
} from '../../data/catalogue';
import { useStore, store } from '../../store';
import { api } from '../../data/api';
import { deliveryFee, requiredTills, tillTotal, total } from '../../store/machine';
import { addressIssue, cartIssue } from '../../store/checkout';
import { customerStatus } from './orderPresentation';
import {
  Empty,
  GroupedLines,
  Heading,
  PriceSummary,
  Progress,
  RouteMap,
  Stepper,
  StopList,
  Tag,
  useAction,
  useNotice,
} from '../../components/ui';
import type { Address, Extra, PaymentMethod, Till } from '../../types';
export function Home() {
  const { stall } = useStore();
  const { orders } = useStore();
  const active = orders.find((o) => !['delivered', 'cancelled'].includes(o.status) && o.id >= 1048);
  const lastTicket = orders.find((o) => o.id >= 1048);
  const act = useAction();
  const navigate = useNavigate();
  return (
    <>
      <div className="home-intro">
        <span className="eyebrow">LOCAL FLAVOUR. SHARED HUSTLE.</span>
        <span className="small muted">{stall.name} ↗</span>
      </div>
      <section className="hero">
        <ProductImage
          src="/images/kota-approved-menu.png#russian"
          alt="Russian Special from the approved KASI KOTA menu artwork"
        />
        <div className="hero-shade" />
        <div className="hero-copy">
          <Tag>
            <span className="live-dot" /> YOUR STREET. DELIVERED.
          </Tag>
          <h1>
            Real Kota.
            <br />
            <span>Real Good.</span>
          </h1>
          <p>
            Big flavour from the corner.
            <br />A little more for the whole street.
          </p>
          <Link className="button" to="/menu">
            Build your Kota <ArrowUpRight size={20} />
          </Link>
          <div className="hero-proof">
            <span>
              <Clock3 size={14} /> 20–30 min
            </span>
            <span>
              <Bike size={15} /> Free delivery
            </span>
          </div>
        </div>
      </section>
      <section className="street-banner">
        <div>
          <span className="eyebrow">ONE TICKET. SEVERAL TILLS. ONE RIDER.</span>
          <p>Kota, plus milk from the spaza, plus a drink from Sbu’s, one rider.</p>
        </div>
        <span className="street-icons">
          01 <span>→</span> 02 <span>→</span> 03
        </span>
      </section>
      <div className="section-title">
        <h2>Your corner, on a plate.</h2>
        <Link to="/menu">
          Full menu <ArrowRight size={16} />
        </Link>
      </div>
      <div className="home-grid">
        <Link className="stall-card card" to="/menu">
          <ProductImage src="/images/kota-approved-menu.png#russian" alt="Russian Special Kota" />
          <div>
            <div className="row-between">
              <Tag>NEARBY STALL</Tag>
              <span className="small">
                <Star size={13} className="inline-icon" /> 4.9
              </span>
            </div>
            <h2>{stall.name}</h2>
            <p className="muted small">Toasted fresh. Packed proper.</p>
            <div className="row-between">
              <span className="small muted">1.8 km · Open until 21:00</span>
              <ArrowUpRight size={20} />
            </div>
          </div>
        </Link>
        <div className="home-side">
          {active && (
            <Link to={`/orders/${active.id}/track`} className="card active-card">
              <span className="eyebrow">
                <span className="live-dot" /> YOUR TICKET IS MOVING
              </span>
              <h2>Ticket #{active.id}</h2>
              <p className="muted">{customerStatus(active)}</p>
              <span className="text-link">
                Track active order <ArrowRight size={18} />
              </span>
            </Link>
          )}
          {lastTicket && (
            <button
              className="card reorder-card"
              onClick={() =>
                act(() => {
                  store.reorder(lastTicket.id);
                  navigate('/cart');
                })
              }
            >
              <div>
                <span className="eyebrow">BACK FOR YOUR USUAL?</span>
                <h3>Same street. Same favourites.</h3>
                <span className="muted small">Reorder last ticket</span>
              </div>
              <ArrowUpRight size={23} />
            </button>
          )}
        </div>
      </div>
      <div className="neighbourhood-note">
        <ShieldCheck size={20} />
        <p>
          <strong>Everybody on this order gets paid.</strong>
          <br />
          <span className="muted small">
            Your stall. Your spaza. Sbu’s place. Your community rider.
          </span>
        </p>
      </div>
    </>
  );
}
export function Menu() {
  const products = useStore().catalogue;
  const { availability } = useStore();
  return (
    <>
      <Heading
        eyebrow="FRESH FROM THE STALL"
        title="Choose Your Kota"
        text="Toasted. Loaded. Made on your street."
      />
      <div className="menu-grid">
        {products
          .filter((p) => p.till === 'stall')
          .map((p, i) => (
            <article className="card product-card" key={p.id}>
              <Link to={`/menu/${p.id}`} tabIndex={-1}>
                <div className={`product-photo photo-${i}`}>
                  <ProductImage src={p.image} alt={`${p.name} — approved menu artwork`} />
                  {p.id === 'russian' && <Tag>STREET FAVOURITE</Tag>}
                </div>
              </Link>
              <div className="product-body">
                <h2>{p.name}</h2>
                <p className="muted small">{p.description}</p>
                <div className="row-between">
                  <strong className="price">{money(p.price)}</strong>
                  {availability[p.id] ? (
                    <Link
                      data-tour={p.id === 'russian' ? 'russian' : undefined}
                      aria-label={`Add ${p.name}`}
                      className="button small-button"
                      to={`/menu/${p.id}`}
                    >
                      <Plus size={15} /> Add
                    </Link>
                  ) : (
                    <Tag gold>Sold out</Tag>
                  )}
                </div>
              </div>
            </article>
          ))}
      </div>
      <p className="small muted footnote">
        Your six favourites, shown with the approved KASI KOTA menu artwork.
      </p>
    </>
  );
}
export function Customise() {
  const products = useStore().catalogue;
  const { id } = useParams();
  const p = products.find((p) => p.id === id && p.till === 'stall');
  const [selected, setSelected] = useState<Extra[]>([]);
  const [quantity, setQuantity] = useState(1);
  const navigate = useNavigate();
  const act = useAction();
  const { availability } = useStore();
  if (!p) return <Empty title="Kota not found" text="Choose something fresh from the menu." />;
  return (
    <>
      <Link className="back-link" to="/menu">
        <ArrowLeft size={16} /> Back to menu
      </Link>
      <div className="customise-grid">
        <div className="customise-photo">
          <ProductImage src={p.image} alt={p.name} />
          <Tag>MADE YOUR WAY</Tag>
        </div>
        <div>
          <Heading eyebrow="CUSTOMISE YOUR KOTA" title={p.name} text={p.description} />
          <p className="photo-reference">{p.photoNote}</p>
          <p className="included">Included: {p.included?.join(' · ')}</p>
          {!availability[p.id] && (
            <p className="warning" role="status">
              This Kota is out of stock. Choose another Kota from the menu.
            </p>
          )}
          <h2>Make it yours.</h2>
          <div className="extras">
            {extras.map((e) => (
              <label
                className="extra-row"
                key={e.id}
                data-tour={e.id === 'egg' ? 'egg' : undefined}
              >
                <span>{e.name}</span>
                <span className="muted">+{money(e.price)}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={selected.some((x) => x.id === e.id)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, e]
                        : selected.filter((x) => x.id !== e.id),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <div className="row-between quantity-row">
            <strong>Quantity</strong>
            <Stepper min={1} value={quantity} onChange={setQuantity} />
          </div>
          <button
            className="button full"
            data-tour="add-kota"
            disabled={!availability[p.id]}
            onClick={() =>
              act(() => {
                store.add(p.id, selected, quantity);
                navigate('/spaza');
              })
            }
          >
            <span>Add to Order</span>
            <strong>
              {money((p.price + selected.reduce((n, e) => n + e.price, 0)) * quantity)}
            </strong>
          </button>
        </div>
      </div>
    </>
  );
}
export function Catalogue({ till, tour = false }: { till: 'spaza' | 'tavern'; tour?: boolean }) {
  const products = useStore().catalogue;
  const { availability, cart } = useStore();
  const act = useAction();
  const [category, setCategory] = useState('All');
  const catalogue = products.filter(
    (p) =>
      p.till === till &&
      (!tour ||
        (till === 'spaza'
          ? ['bread', 'milk', 'milk-small']
          : ['savanna', 'hunters-dry', 'water']
        ).includes(p.id)),
  );
  const categories = ['All', ...new Set(catalogue.map((p) => p.category || 'Essentials'))];
  const selectedCategory = categories.includes(category) ? category : 'All';
  return (
    <>
      <Heading
        eyebrow="SAME TICKET. ANOTHER LOCAL TILL."
        title={till === 'spaza' ? 'From the Spaza' : 'From the Tavern'}
        text={
          till === 'spaza'
            ? 'Small packs. Familiar brands. Just what you need today.'
            : 'Sbu’s place around the corner'
        }
      />
      <div className="info-strip">
        <Bike size={20} />
        <p>
          {till === 'spaza'
            ? 'The rider collects the milk from the local spaza on the way.'
            : 'The rider collects the drink from Sbu’s, then delivers everything to you.'}
        </p>
      </div>
      <p className="catalogue-price-note">
        Reference prices checked 6 September 2026. Local till prices may differ.
      </p>
      {till === 'tavern' && products.some((p) => p.alcohol) && <AgeConfirmation />}
      <div className="catalogue-filters" aria-label="Product categories">
        {categories.map((item) => (
          <button
            key={item}
            aria-pressed={selectedCategory === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="catalogue-grid">
        {catalogue
          .filter((p) => selectedCategory === 'All' || p.category === selectedCategory)
          .map((p) => (
            <article key={p.id} className="card catalogue-row">
              <ProductImage
                src={p.image}
                alt={`${p.name} — product pack photograph`}
                loading="lazy"
              />
              <div className="grow">
                <span className="pack-category">{p.category}</span>
                <h3>{p.name}</h3>
                <span className="price">{money(p.price)}</span>
                {p.alcohol && <span className="small muted"> · 18+</span>}
                <details className="price-source">
                  <summary>Price reference</summary>
                  {p.sourceUrl ? (
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                      {p.sourceLabel} ↗
                    </a>
                  ) : (
                    <span>{p.sourceLabel}</span>
                  )}
                  <span> · checked {p.checkedAt}</span>
                </details>
                {cart.some((l) => l.productId === p.id) && (
                  <p className="small green">
                    {cart.filter((l) => l.productId === p.id).reduce((n, l) => n + l.quantity, 0)}{' '}
                    on your ticket
                  </p>
                )}
              </div>
              <button
                data-tour={p.id}
                aria-label={`Add ${p.name}`}
                className="button small-button"
                disabled={!availability[p.id]}
                onClick={() => act(() => store.add(p.id))}
              >
                {availability[p.id] ? (
                  <>
                    <Plus size={14} /> Add
                  </>
                ) : (
                  'Sold out'
                )}
              </button>
            </article>
          ))}
      </div>
      <div className="next-step">
        <Link className="button full" to={till === 'spaza' ? '/tavern' : '/cart'}>
          {till === 'spaza' ? 'Next: a drink from Sbu’s' : 'View your order'}
          <ArrowRight size={18} />
        </Link>
        <Link className="subtle-link" to="/cart">
          Go to cart
        </Link>
      </div>
    </>
  );
}
export function Cart() {
  const { cart, address, availability } = useStore();
  const issue = cartIssue(cart, availability);
  if (!cart.length)
    return (
      <Empty
        title="Start with a Kota."
        text="Then add the little things from your street. It all stays on one ticket."
      />
    );
  return (
    <>
      <Heading
        eyebrow="ONE TICKET. YOUR WHOLE STREET."
        title="Your ticket"
        text="A separate till for every neighbour. One total for you."
      />
      <GroupedLines lines={cart} editable={store.quantity} />
      <div className="card">
        <PriceSummary lines={cart} address={address} />
        <p className="small muted">
          {address.mode === 'collection'
            ? 'Collect your order from each participating shop.'
            : 'Your total contains item prices only.'}
        </p>
        {issue ? (
          <>
            <p className="warning" role="alert">
              {issue}
            </p>
            <Link className="button full" to="/menu">
              Choose your Kota <ArrowRight size={18} />
            </Link>
          </>
        ) : (
          <Link className="button full" to="/checkout/delivery">
            Checkout <ArrowRight size={18} />
          </Link>
        )}
      </div>
      <Link className="subtle-link" to="/menu">
        Add another Kota
      </Link>
    </>
  );
}
export function Delivery() {
  const { cart, address } = useStore();
  const [form, setForm] = useState<Address>({ ...address });
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  if (!cart.length)
    return <Empty title="Your ticket is empty" text="Add a Kota before checking out." />;
  const update = (next: Address) => {
    setForm(next);
    store.address(next);
    setError(null);
  };
  const field = (key: keyof Address, value: string | number) => update({ ...form, [key]: value });
  return (
    <>
      <Heading
        eyebrow="CHECKOUT · 1 OF 2"
        title="Where’s your gate?"
        text="A few details to get your street order to you."
      />
      <form
        className="card delivery-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const issue = addressIssue(form) || deliveryIssue(cart, form.mode);
          if (issue) {
            setError(issue);
            return;
          }
          store.saveAddress(form);
          navigate('/checkout/payment');
        }}
      >
        <div className="segmented">
          {(['delivery', 'collection'] as const).map((mode) => (
            <button
              className={form.mode === mode ? 'selected' : ''}
              type="button"
              key={mode}
              aria-pressed={form.mode === mode}
              disabled={mode === 'delivery' && !!deliveryIssue(cart, mode)}
              onClick={() => update({ ...form, mode })}
            >
              {mode === 'delivery' ? 'Delivery' : 'Collection'}
            </button>
          ))}
        </div>
        {deliveryIssue(cart, 'delivery') && (
          <p className="warning">Collect at the stall, or add more to reach R40.</p>
        )}
        <div className="address-presets">
          <button type="button" onClick={() => update({ ...defaultAddress, mode: form.mode })}>
            Mamelodi sample
          </button>
          <button type="button" onClick={() => update({ ...sowetoAddress, mode: form.mode })}>
            Soweto sample
          </button>
        </div>
        <div className="form-grid">
          {(
            [
              ['name', 'Full name'],
              ['phone', 'Mobile number'],
              ['street', 'Street address'],
              ['suburb', 'Suburb / city'],
              ['postcode', 'Postal code'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                type={key === 'phone' ? 'tel' : 'text'}
                autoComplete={
                  {
                    name: 'name',
                    phone: 'tel',
                    street: 'street-address',
                    suburb: 'address-level2',
                    postcode: 'postal-code',
                  }[key]
                }
                inputMode={key === 'postcode' ? 'numeric' : undefined}
                value={form[key]}
                onChange={(e) => field(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <label data-tour="gate">
          Gate note
          <textarea value={form.note} onChange={(e) => field('note', e.target.value)} />
        </label>
        <label>
          Distance from stall (demo)
          <input
            type="number"
            min="0"
            max="50"
            step="0.1"
            required
            value={form.distance}
            onChange={(e) => field('distance', Number(e.target.value))}
          />
        </label>
        <div className="info-strip" data-tour="distance">
          <MapPin size={20} />
          <span>
            {form.distance} km · {form.mode} · item prices only
          </span>
          <span className="muted">20–30 min</span>
        </div>
        {form.mode === 'collection' && (
          <p className="muted small">
            Collect from the stall, then any spaza and Sbu’s items yourself. No rider is assigned.
          </p>
        )}
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <button className="button full" type="submit">
          Continue to payment <ArrowRight size={18} />
        </button>
      </form>
    </>
  );
}
export function Payment() {
  const products = useStore().catalogue;
  const confirmed = useStore().ageConfirmed;
  const { cart, address, availability } = useStore();
  const ticketIssue = cartIssue(cart, availability);
  const detailsIssue = addressIssue(address) || deliveryIssue(cart, address.mode);
  const [method, setMethod] = useState<PaymentMethod>('Card');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const notify = useNotice();
  const alcohol = cart.some((l) => products.find((p) => p.id === l.productId)?.alcohol);
  if (!cart.length)
    return (
      <Empty
        title="No unpaid ticket"
        text="Your paid orders are available under Orders."
        to="/orders"
        label="View orders"
      />
    );
  return (
    <>
      <Heading
        eyebrow="CHECKOUT · 2 OF 2"
        title="One payment. All sorted."
        text="Everybody on this order gets paid."
      />
      <section className="card">
        <h2>Your neighbourhood tills</h2>
        {(['stall', 'spaza', 'tavern'] as Till[])
          .filter((t) => cart.some((l) => l.till === t))
          .map((t) => (
            <div className="till-split" key={t}>
              <span>{tillNames[t]}</span>
              <strong>{money(tillTotal(cart, t))}</strong>
            </div>
          ))}
        <PriceSummary lines={cart} address={address} />
        <div className="info-strip">
          <MapPin size={18} />
          <span>
            {address.street}
            <br />
            <small>{address.note}</small>
          </span>
        </div>
      </section>
      <section className="card">
        <h2>How are you paying?</h2>
        {ticketIssue && (
          <p className="warning" role="alert">
            {ticketIssue}{' '}
            <Link className="subtle-link" to="/cart">
              Update your ticket
            </Link>
          </p>
        )}
        {detailsIssue && (
          <p className="warning" role="alert">
            {detailsIssue}{' '}
            <Link className="subtle-link" to="/checkout/delivery">
              Edit delivery details
            </Link>
          </p>
        )}
        <div className="payment-methods">
          {(['Card', 'Instant EFT', 'Capitec Pay', 'Cash on delivery'] as PaymentMethod[]).map(
            (m) => (
              <label key={m}>
                <input
                  type="radio"
                  name="payment"
                  checked={method === m}
                  onChange={() => setMethod(m)}
                />
                <span>{m}</span>
                {method === m && <Check size={16} />}
              </label>
            ),
          )}
        </div>
        <p className="small muted">
          Demo payment. No money is charged and no card details are collected.
          {method === 'Cash on delivery' &&
            ' Cash is recorded as settled for this demo; real reconciliation comes later.'}
        </p>
        {alcohol && <AgeConfirmation />}
        <button
          className="button full"
          data-tour="pay"
          disabled={busy || !!ticketIssue || !!detailsIssue || (alcohol && !confirmed)}
          onClick={async () => {
            setBusy(true);
            try {
              const order = await api.pay(method);
              navigate(`/orders/${order.id}/confirmed`);
            } catch (e) {
              notify(e instanceof Error ? e.message : 'Payment failed. Try again.');
              setBusy(false);
            }
          }}
        >
          {busy ? 'Creating your ticket…' : `Pay ${money(total(cart, address))}`}
          <ArrowRight size={18} />
        </button>
      </section>
      <Link className="subtle-link" to="/checkout/delivery">
        Back to delivery details
      </Link>
    </>
  );
}
export function Tracking({ confirmed = false }: { confirmed?: boolean }) {
  const { streetNodes } = useStore();
  const { id } = useParams();
  const { orders } = useStore();
  const order = orders.find((o) => o.id === Number(id));
  const notify = useNotice();
  if (!order)
    return (
      <Empty
        title="Ticket not found"
        text="Find your saved tickets in Orders."
        to="/orders"
        label="View orders"
      />
    );
  const cancelled = order.status === 'cancelled';
  const collection = order.address.mode === 'collection';
  const status = customerStatus(order);
  return (
    <>
      {confirmed ? (
        <div className="confirmation">
          <span className="confirmation-check">
            {cancelled ? <X size={32} /> : <Check size={32} />}
          </span>
          <p className="eyebrow">
            {cancelled ? 'THIS TICKET IS CLOSED' : 'YOUR STREET HAS YOUR ORDER'}
          </p>
          <h1>{cancelled ? 'Order cancelled' : 'Order Confirmed'}</h1>
          <p data-tour="confirmed">
            Ticket #{order.id} · <strong>{money(total(order.lines, order.address))}</strong>
          </p>
          <Tag>
            {deliveryFee(order.address)
              ? `Delivery ${money(deliveryFee(order.address))}`
              : `${order.address.mode === 'collection' ? 'Collection' : 'Delivery'} FREE`}
          </Tag>
        </div>
      ) : (
        <Heading
          eyebrow={`TICKET #${order.id}`}
          title={
            cancelled
              ? 'Order cancelled'
              : order.status === 'delivered'
                ? `${collection ? 'Collected' : 'Delivered'}. Enjoy your Kota.`
                : 'Your street, live.'
          }
          text={
            cancelled
              ? 'This ticket is closed. No rider is being dispatched.'
              : collection
                ? 'Follow preparation, then collect from each shop.'
                : 'One rider brings it all to your gate.'
          }
        />
      )}
      <div className="card">
        <div className="row-between">
          <strong role="status">{status}</strong>
          <Tag gold={cancelled}>
            {cancelled ? 'Closed' : order.status === 'delivered' ? 'Complete' : '18 mins · demo'}
          </Tag>
        </div>
        <Progress order={order} />
        {!cancelled && !collection && (
          <>
            <RouteMap order={order} />
            <StopList order={order} />
          </>
        )}
        {!cancelled && collection && (
          <>
            <p className="muted small">
              Collect from each participating shop. No rider is assigned.
            </p>
            <ol className="stop-list">
              {stops
                .map((s) => {
                  const m = streetNodes.find(
                    (m) => m.id === order.lines.find((l) => l.till === s.till)?.merchantId,
                  );
                  return m ? { ...s, name: m.name, address: m.address } : s;
                })
                .filter((stop) => requiredTills(order).includes(stop.till))
                .map((stop) => (
                  <li key={stop.till}>
                    <div className="grow">
                      <strong>{stop.name}</strong>
                      <p className="small muted">{stop.address}</p>
                    </div>
                    <Tag>
                      {(stop.till === 'stall' ? order.kitchen : order[stop.till]) === 'ready'
                        ? 'Ready'
                        : 'Preparing'}
                    </Tag>
                  </li>
                ))}
            </ol>
          </>
        )}
      </div>
      <div className="action-pair">
        {confirmed && !cancelled && (
          <Link className="button" data-tour="track" to={`/orders/${order.id}/track`}>
            Track Live <ArrowRight size={18} />
          </Link>
        )}
        {!cancelled && !collection && (
          <button
            className="button secondary"
            onClick={() =>
              notify(
                order.rider === 'offered'
                  ? 'Your rider will be assigned when the kitchen is ready.'
                  : 'Demo rider: Themba · 072 555 0108. Calling is simulated.',
              )
            }
          >
            Contact Rider
          </button>
        )}
      </div>
      <GroupedLines lines={order.lines} />
    </>
  );
}
export function Orders() {
  const { orders } = useStore();
  return (
    <>
      <Heading
        eyebrow="YOUR SHARED TICKETS"
        title="Orders"
        text="Every stop, saved in one place."
      />
      <div className="ticket-grid">
        {orders
          .filter((o) => o.id >= 1048)
          .map((o) => (
            <Link className="card" key={o.id} to={`/orders/${o.id}/track`}>
              <div className="row-between">
                <h2>Ticket #{o.id}</h2>
                <Tag>{customerStatus(o)}</Tag>
              </div>
              <p className="muted">{o.lines.map((l) => l.name).join(' · ')}</p>
              <div className="row-between">
                <strong>{money(total(o.lines, o.address))}</strong>
                <span className="text-link">
                  View ticket <ArrowRight size={16} />
                </span>
              </div>
            </Link>
          ))}
      </div>
    </>
  );
}
export function Account() {
  const { orders, address, savedAddresses } = useStore();
  const act = useAction();
  const navigate = useNavigate();
  return (
    <>
      <Heading
        eyebrow="YOUR NEIGHBOURHOOD PROFILE"
        title="Hi, Thabo."
        text="Your addresses. Your favourites. Your street."
      />
      <section className="card">
        <h2>Thabo Mokoena</h2>
        <p className="muted">071 123 4567</p>
        <Tag>Demo customer</Tag>
      </section>
      <h2>Saved addresses</h2>
      <div className="ticket-grid">
        {savedAddresses.map((a) => (
          <button
            className="card address-card"
            key={a.street}
            onClick={() => act(() => store.address(a), 'Delivery address updated.')}
          >
            <MapPin size={22} />
            <strong>{a.street}</strong>
            <span className="muted">
              {a.suburb}, {a.postcode}
            </span>
            <span>{a.note}</span>
            {address.street === a.street && <Tag>Selected</Tag>}
          </button>
        ))}
      </div>
      <h2>Past & current orders</h2>
      {orders
        .filter((o) => o.id >= 1048)
        .map((o) => (
          <div className="card row-between" key={o.id}>
            <div>
              <Link to={`/orders/${o.id}/track`}>Ticket #{o.id}</Link>
              <p className="small muted">
                {money(total(o.lines, o.address))} · {customerStatus(o)}
              </p>
            </div>
            <button
              className="button small-button"
              onClick={() =>
                act(() => {
                  store.reorder(o.id);
                  navigate('/cart');
                })
              }
            >
              Reorder
            </button>
          </div>
        ))}
    </>
  );
}
