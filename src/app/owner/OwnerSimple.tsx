import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { store, useStore } from '../../store';
import { money } from '../../data/catalogue';
import { Heading, useAction } from '../../components/ui';
import { BuilderCard } from '../../components/BuilderCard';
import { SettlementPanel } from '../V3';
import { Dashboard } from './Owner';

function useTill() {
  const state = useStore();
  const today = new Date().toLocaleDateString('en-ZA');
  const orders = state.orders.filter(
    (o) =>
      !['cancelled', 'draft'].includes(o.status) &&
      new Date(o.createdAt).toLocaleDateString('en-ZA') === today,
  );
  const own = (o: (typeof state.orders)[number]) =>
    o.settlement?.merchantSettlements.find((m) => m.merchantId === state.merchant?.id);
  const net = orders.reduce((sum, o) => sum + (own(o)?.netPayout || 0), 0);
  const sales = orders.reduce((sum, o) => sum + (own(o)?.grossItems || 0), 0);
  const toll = orders.reduce((sum, o) => sum + (own(o)?.tollContribution || 0), 0);
  const available = state.orders.reduce((sum, o) => {
    const m = own(o);
    const paid = state.network.withdrawals.some(
      (w) => w.ticketId === o.id && w.merchantId === state.merchant?.id,
    );
    return (
      sum +
      (!o.legacy && m && ['released', 'releasable'].includes(m.escrowStatus) && !paid
        ? m.netPayout
        : 0)
    );
  }, 0);
  return { ...state, count: orders.length, net, sales, toll, available };
}
const rand = (n: number) => money(n / 100);
export function ShareStall() {
  const { stall } = useStore();
  const link = `${window.location.origin}/stall/${stall.slug}`;
  return (
    <a
      className="button full"
      target="_blank"
      rel="noopener noreferrer"
      href={`https://wa.me/?text=${encodeURIComponent(`Order from ${stall.name}: ${link}`)}`}
    >
      Share my stall on WhatsApp
    </a>
  );
}
export function OwnerOverview() {
  const { stall, net, count, available } = useTill();
  const act = useAction();
  return (
    <section className="card owner-overview">
      <h1>{stall.name}</h1>
      <button
        className={`button full stall-open ${stall.isOpen === false ? 'secondary' : ''}`}
        role="switch"
        aria-checked={stall.isOpen !== false}
        onClick={() => act(() => store.setStallOpen(stall.isOpen === false))}
      >
        {stall.isOpen === false ? 'Closed · tap to open' : 'Open · tap to close'}
      </button>
      <div className="row-between">
        <div>
          <p>Today · mine</p>
          <strong className="owner-cash">{rand(net)}</strong>
        </div>
        <div>
          <p>Orders today</p>
          <strong className="owner-cash">{count}</strong>
        </div>
      </div>
      <p className="owner-payout">
        Next payout: not scheduled · {rand(available)} available.
        <br />
        <span className="muted">Bank transfers are not connected.</span>
      </p>
      <ShareStall />
    </section>
  );
}
export function OwnerStart() {
  const { stall } = useStore();
  const [name, setName] = useState(stall.name),
    [hours, setHours] = useState(stall.hours);
  const act = useAction(),
    navigate = useNavigate();
  return (
    <>
      <Heading title="Let’s open your stall" text="Your six Kotas are already on the menu." />
      <form
        className="card delivery-form"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => {
            store.completeOwnerSetup(name, hours);
            navigate('/kitchen');
          });
        }}
      >
        <label>
          Stall name
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Opening hours
          <input required value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <Link to="/owner/menu" className="button secondary">
          Check prices and hide items
        </Link>
        <p className="muted">Start with your Kotas. Add a neighbour later in More.</p>
        <button className="button" type="submit">
          Open my stall
        </button>
      </form>
    </>
  );
}
export function OwnerMoney() {
  const { sales, toll, available } = useTill();
  return (
    <>
      <Heading title="My money" />
      <section className="card delivery-form">
        <div className="row-between">
          <span>Kota sales today</span>
          <strong>{rand(sales)}</strong>
        </div>
        <div>
          <p>Rider gets R10 per delivered order.</p>
          <p className="muted">
            The shops share a R15 delivery deduction. Your share today: {rand(toll)} (including
            amounts held for orders still in progress). Customers pay item prices only.
          </p>
        </div>
        <div className="row-between">
          <span>What I can withdraw</span>
          <strong className="owner-cash">{rand(available)}</strong>
        </div>
        <p>When it lands: not scheduled. Bank transfers are not connected.</p>
        <p className="muted">
          Milk money belongs to the spaza. Drink money belongs to Sbu’s. Your till shows only your
          Kotas.
        </p>
      </section>
      <details className="card">
        <summary>Money by order</summary>
        <SettlementPanel />
      </details>
      <details className="card">
        <summary>Sales history</summary>
        <Dashboard till="stall" tour />
      </details>
    </>
  );
}
export function OwnerSettings() {
  const { stall, streetNodes } = useStore();
  const act = useAction();
  const [name, setName] = useState(stall.name),
    [hours, setHours] = useState(stall.hours);
  const [rider, setRider] = useState(stall.riderName),
    [phone, setPhone] = useState(stall.riderPhone),
    [qr, setQr] = useState('');
  const url = `${window.location.origin}/stall/${stall.slug}`;
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 220, margin: 2 }).then(setQr);
  }, [url]);
  return (
    <>
      <Heading title="My stall" />
      <details className="card">
        <summary>Stall name and hours</summary>
        <div className="delivery-form">
          <label>
            Stall name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Opening hours
            <input value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
          <button className="button" onClick={() => act(() => store.updateStall(name, hours))}>
            Save changes
          </button>
        </div>
      </details>
      <details className="card">
        <summary>My rider · {stall.riderName}</summary>
        <div className="delivery-form">
          <label>
            Rider name
            <input value={rider} onChange={(e) => setRider(e.target.value)} />
          </label>
          <label>
            Rider WhatsApp
            <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <button className="button" onClick={() => act(() => store.riderSlot(rider, phone))}>
            Save rider
          </button>
          <a
            className="button secondary"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://wa.me/27${stall.riderPhone.slice(1)}?text=${encodeURIComponent(`Join ${stall.name}: ${window.location.origin}/roles. Demo access: stall ${stall.code}, rider PIN ${stall.riderPin}.`)}`}
          >
            Invite rider on WhatsApp
          </a>
        </div>
      </details>
      <details className="card">
        <summary>My neighbours · optional</summary>
        <p>Want the rider to also fetch milk and a drink from next door?</p>
        <div className="delivery-form">
          {streetNodes
            .filter((m) => m.type !== 'stall')
            .map((shop) => (
              <label className="extra-row" key={shop.id}>
                <span>{shop.name}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={shop.enabled}
                  onChange={(e) => act(() => store.setNeighbour(shop.id, e.target.checked))}
                />
              </label>
            ))}
          <p className="muted">
            Each shop keeps its own orders and money. You can sell Kotas on their own.
          </p>
        </div>
      </details>
      <details className="card">
        <summary>My customer QR and stall link</summary>
        <p>Customers scan this to open your menu. Display it at your stall.</p>
        {qr && (
          <img
            className="owner-qr"
            src={qr}
            width="220"
            height="220"
            alt={`Customer QR for ${stall.name}`}
          />
        )}
        <ShareStall />
      </details>
      <details className="card">
        <summary>Help and account details</summary>
        <p>Working preview: orders stay on this device. Payments and transfers are simulated.</p>
        <p>Launch price: R300 once-off setup - includes your first month.<br/>Then R150 per month.</p>
        <Link to="/roles">Demo access and other roles</Link>
      </details>
      <BuilderCard />
      <section className="card">
        <h2>Your street. Delivered.</h2>
        <p className="muted">One order. Several tills. One rider.</p>
      </section>
    </>
  );
}
