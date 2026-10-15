import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { store, useStore } from '../store';
import { Heading, Empty, useAction } from '../components/ui';
import { money } from '../data/catalogue';
import { DEMO_PINS } from '../store/v3/access';
import type { Role } from '../types';
export const rand = (cents: number) => money(cents / 100);
export function DemoLogin() {
  const [code, setCode] = useState('A'),
    [pin, setPin] = useState('');
  const act = useAction(),
    navigate = useNavigate();
  const roles: { role: Role; name: string; path: string }[] = [
    { role: 'customer', name: 'Customer', path: '/' },
    { role: 'owner', name: 'Kota owner', path: '/kitchen' },
    { role: 'spaza', name: 'Spaza owner', path: '/spaza-owner/packing' },
    { role: 'tavern', name: 'Tavern owner', path: '/tavern-owner/packing' },
    { role: 'rider', name: 'Rider', path: '/rider' },
  ];
  return (
    <>
      <Heading title="Welcome to KASI KOTA" />
      <button
        className="button full owner-entry"
        onClick={() =>
          act(() => {
            const selected = store.get().stall;
            store.login('owner', selected.code, DEMO_PINS[selected.code].owner);
            navigate(store.get().stall.ownerSetupDone ? '/kitchen' : '/owner/start');
          })
        }
      >
        I sell kota
      </button>
      <button
        className="button secondary full"
        onClick={() =>
          act(() => {
            store.login('customer', store.get().stall.code, '');
            navigate('/menu');
          })
        }
      >
        I want to order
      </button>
      <p className="small muted">Try the working preview. Orders and money are simulated.</p>
      <details className="demo-access">
        <summary>Demo access · other roles</summary>
        <section className="card delivery-form">
          <label>
            Stall code
            <select
              aria-label="Stall code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setPin('');
              }}
            >
              <option value="A">A · Kasi Kota Mamelodi</option>
              <option value="B">B · Meadowlands Kota</option>
            </select>
          </label>
          <label>
            Demo PIN
            <input
              value={pin}
              type="password"
              inputMode="numeric"
              maxLength={4}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          <p className="small muted">
            Demo only: owner {DEMO_PINS[code].owner} · spaza {DEMO_PINS[code].spaza} · tavern{' '}
            {DEMO_PINS[code].tavern} · rider {DEMO_PINS[code].rider}. Customer needs no PIN.
          </p>
        </section>
        <div className="role-grid">
          {roles.map((r) => (
            <button
              className="card role-card"
              key={r.role}
              onClick={() =>
                act(() => {
                  store.login(r.role, code, pin);
                  navigate(r.path);
                })
              }
            >
              <strong>{r.name}</strong>
              <span className="muted">Open this stall’s {r.name.toLowerCase()} screen</span>
            </button>
          ))}
        </div>
        <p className="small muted">
          Demo PIN checks run in this browser. Production authentication and server permissions are
          still required.
        </p>
      </details>
    </>
  );
}
export function StallEntry() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      store.selectStall(slug || '');
      navigate('/menu', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stall not found.');
    }
  }, [slug, navigate]);
  return error ? <Empty title="Stall not found" text={error} /> : <p>Opening this stall’s menu…</p>;
}
export function AgeConfirmation() {
  const state = useStore();
  const act = useAction();
  return (
    <section className="card delivery-form">
      <h2>Alcohol · age confirmation</h2>
      <label className="adult-check">
        <input
          type="checkbox"
          checked={state.ageConfirmed}
          onChange={(e) => act(() => store.confirmAge(e.target.checked))}
        />
        I confirm that I am 18 years and older.
      </label>
    </section>
  );
}
export function SubscriptionPanel() {
  const { merchant } = useStore(),
    act = useAction();
  if (!merchant || merchant.type === 'stall') return null;
  return (
    <section className="card">
      <h2>Dashboard subscription</h2>
      <p className="tag">{merchant.subscriptionStatus === 'pending' ? 'SETUP PAYMENT DUE' : merchant.subscriptionStatus.toUpperCase()}</p>
      <p className="muted small">
        Launch price: R300 once-off setup - includes your first month. Then R150 per month.
      </p>
      <p className="small">
        {merchant.subAccount} · {merchant.subscriptionId}
      </p>
      {merchant.nextBillingAt && (
        <p>Next billing: {new Date(merchant.nextBillingAt).toLocaleDateString('en-ZA')}</p>
      )}
      {merchant.invoices.map((i) => (
        <div className="activity-row" key={i.id}>
          <span>
            {new Date(i.dueAt).toLocaleDateString('en-ZA')} · {rand(i.amount)}
            <small>
              {i.status} · {i.subAccount}
            </small>
          </span>
          {i.status === 'missed' && (
            <button
              className="button small-button"
              onClick={() =>
                act(() => store.subscriptionPayment(i.id), 'Demo subscription payment recorded.')
              }
            >
              Pay overdue · demo
            </button>
          )}
        </div>
      ))}
      <p className="small muted">
        Automatic billing is simulated when this app is open. No live debit occurs.
      </p>
    </section>
  );
}
export function FrozenOperations() {
  return (
    <>
      <Heading
        title="Merchant account overdue"
        text="Two missed payments. New operations and escrow are frozen."
      />
      <div className="warning" role="alert">
        Your overdue status stays visible until outstanding demo invoices are paid.
      </div>
      <SubscriptionPanel />
      <Link className="button" to="/roles">
        Switch role
      </Link>
    </>
  );
}
export function SettlementPanel() {
  const { orders, merchant, network } = useStore(),
    act = useAction();
  if (!merchant) return null;
  return (
    <section className="card">
      <h2>Your settlements</h2>
      <p className="small muted">
        Only your item revenue and deductions. Amounts awaiting final delivery remain reserved.
      </p>
      {orders
        .filter((o) => !o.legacy)
        .map((o) => {
          const s = o.settlement?.merchantSettlements.find((m) => m.merchantId === merchant.id);
          if (!s) return null;
          const withdrawn = network.withdrawals.some(
            (w) => w.ticketId === o.id && w.merchantId === merchant.id,
          );
          return (
            <section className="card" data-testid={`settlement-${o.id}`} key={o.id}>
              <h3>Order #{o.id}</h3>
              <p className="network-line">paid on shared order #{o.id}</p>
              <dl className="price-summary">
                <div>
                  <dt>Gross item sales</dt>
                  <dd>{rand(s.grossItems)}</dd>
                </div>
                <div>
                  <dt>
                    Street toll {o.settlement?.tollStatus === 'reserved' ? 'reserved' : 'deduction'}
                  </dt>
                  <dd>{rand(s.tollContribution)}</dd>
                </div>
                <div>
                  <dt>Gateway allocation</dt>
                  <dd>{rand(s.gatewayFeeAllocation)}</dd>
                </div>
                <div>
                  <dt>Payout fee allocation</dt>
                  <dd>{rand(s.payoutFeeAllocation)}</dd>
                </div>
                <div>
                  <dt>Escrow</dt>
                  <dd>{s.escrowStatus.toUpperCase()}</dd>
                </div>
                <div>
                  <dt>Net payout</dt>
                  <dd>{rand(s.netPayout)}</dd>
                </div>
              </dl>
              {s.releasedAt && (
                <p className="small muted">
                  Released {new Date(s.releasedAt).toLocaleString('en-ZA')}
                </p>
              )}
              <button
                className="button"
                disabled={
                  withdrawn ||
                  !['released', 'releasable'].includes(s.escrowStatus) ||
                  s.netPayout <= 0
                }
                onClick={() =>
                  act(() => store.withdraw(o.id), 'Your own settlement was withdrawn in the demo.')
                }
              >
                {withdrawn ? 'Withdrawn' : 'Withdraw own balance · demo'}
              </button>
            </section>
          );
        })}
    </section>
  );
}
export function MerchantSettings() {
  const state = useStore(),
    { merchant, stall, streetNodes } = state,
    act = useAction();
  const [name, setName] = useState(stall.name),
    [hours, setHours] = useState(stall.hours),
    [riderName, setRiderName] = useState(stall.riderName),
    [phone, setPhone] = useState(stall.riderPhone),
    [shopName, setShopName] = useState(''),
    [shopPhone, setShopPhone] = useState(''),
    [type, setType] = useState<'spaza' | 'tavern'>('spaza'),
    [qr, setQr] = useState('');
  const url = `${window.location.origin}/stall/${stall.slug}`;
  useEffect(() => {
    if (merchant?.type === 'stall')
      void QRCode.toDataURL(url, { width: 220, margin: 2 }).then(setQr);
  }, [url, merchant?.type]);
  if (!merchant) return null;
  if (merchant.type !== 'stall')
    return (
      <>
        {merchant.type === 'tavern' && (
          <section className="card">
            <h2>Licensed alcohol delivery</h2>
            <label className="extra-row">
              <span>Licensed delivery enabled</span>
              <input
                role="switch"
                type="checkbox"
                checked={merchant.licensedDeliveryEnabled}
                onChange={(e) => act(() => store.setLicensed(e.target.checked))}
              />
            </label>
            <p className="muted small">
              When enabled, customer 18+ confirmation is still required.
            </p>
          </section>
        )}
        <SubscriptionPanel />
        <SettlementPanel />
      </>
    );
  return (
    <>
      <section className="card delivery-form">
        <h2>Stall settings</h2>
        <label>
          Stall name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Operating hours
          <input value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <button
          className="button"
          onClick={() => act(() => store.updateStall(name, hours), 'Stall updated.')}
        >
          Save stall
        </button>
        <p>
          Setup: {rand(stall.setupFee)} once-off · {stall.setupStatus}
        </p>
        <p className="small muted">
          Menu load, QR creation, rider slot and first-week support. No recurring Kota app rental.
        </p>
        <p className="small">PayFast sub-account: {merchant.subAccount}</p>
        <h3>Your customer QR</h3>
        {qr && <img src={qr} width={220} height={220} alt={`QR for ${stall.name}`} />}
        <a className="text-link" href={url}>
          {url}
        </a>
      </section>
      <section className="card delivery-form">
        <h2>Your rider slot</h2>
        <p>
          {stall.riderName} · {stall.riderAccepted ? 'Accepted' : 'Invitation pending'}
        </p>
        <label>
          Rider name
          <input value={riderName} onChange={(e) => setRiderName(e.target.value)} />
        </label>
        <label>
          Rider WhatsApp
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <button
          className="button"
          onClick={() =>
            act(
              () => store.riderSlot(riderName, phone),
              'Rider slot updated; send the invitation when ready.',
            )
          }
        >
          Invite / replace rider
        </button>
        <a
          className="button secondary"
          target="_blank"
          rel="noreferrer"
          href={`https://wa.me/27${stall.riderPhone.slice(1)}?text=${encodeURIComponent(`Join ${stall.name}: ${window.location.origin}/roles. Demo stall ${stall.code}, rider PIN ${stall.riderPin}.`)}`}
        >
          Open WhatsApp invitation
        </a>
      </section>
      <section className="card delivery-form">
        <h2>Street View</h2>
        {streetNodes
          .filter((m) => m.type !== 'stall')
          .map((m) => (
            <p key={m.id}>
              {m.name} · {m.enabled ? 'Connected' : 'Not connected'}
            </p>
          ))}
        <h3>Add shop on my route</h3>
        <label>
          Shop type
          <select value={type} onChange={(e) => setType(e.target.value as 'spaza' | 'tavern')}>
            <option value="spaza">Spaza</option>
            <option value="tavern">Tavern</option>
          </select>
        </label>
        <label>
          Shop name
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} />
        </label>
        <label>
          Shop WhatsApp
          <input value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
        </label>
        <p className="small muted">
          Add your shop → attach to this rider → share its public catalogue. The shop keeps its own
          sub-account.
        </p>
        <button
          className="button"
          onClick={() =>
            act(
              () => store.connectShop(type, shopName, shopPhone),
              'Shop connected with its own catalogue.',
            )
          }
        >
          Connect shop and catalogue
        </button>
      </section>
    </>
  );
}
