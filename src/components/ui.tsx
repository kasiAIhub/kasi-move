import { useStore } from '../store';
import { ProductImage } from './ProductImage';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, MapPin, Minus, Plus, X, Bike, Store, ShoppingBag, CupSoda } from 'lucide-react';
import type { Line, Order, Till } from '../types';
import { money, stops, tillNames, products } from '../data/catalogue';
import { progressStage } from '../app/customer/orderPresentation';
import {
  allReady,
  deliveryFee,
  lineTotal,
  requiredTills,
  tillTotal,
  total,
} from '../store/machine';
const Notice = createContext<(message: string) => void>(() => {});
export function Feedback({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  return (
    <Notice.Provider value={setMessage}>
      {children}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label="Dismiss message" onClick={() => setMessage('')}>
            <X size={18} />
          </button>
        </div>
      )}
    </Notice.Provider>
  );
}
export function useAction() {
  const notify = useContext(Notice);
  return (fn: () => unknown, success?: string) => {
    try {
      fn();
      if (success) notify(success);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Please try again.');
    }
  };
}
export const useNotice = () => useContext(Notice);
export function Heading({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {text && <p className="muted">{text}</p>}
      </div>
      {children}
    </div>
  );
}
export function Tag({ children, gold = false }: { children: ReactNode; gold?: boolean }) {
  return <span className={`tag ${gold ? 'gold' : ''}`}>{children}</span>;
}
export function Empty({
  title,
  text,
  to = '/menu',
  label = 'Choose your Kota',
}: {
  title: string;
  text: string;
  to?: string;
  label?: string;
}) {
  return (
    <section className="empty card">
      <ShoppingBag size={36} />
      <h1 className="text-xl">{title}</h1>
      <p className="muted">{text}</p>
      <Link className="button" to={to}>
        {label}
      </Link>
    </section>
  );
}
export function Stepper({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="stepper">
      <button
        aria-label="Decrease quantity"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={16} />
      </button>
      <span>{value}</span>
      <button
        aria-label="Increase quantity"
        disabled={value >= 20}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
export function GroupedLines({
  lines,
  only,
  editable,
  hideMoney = false,
}: {
  lines: Line[];
  only?: Till;
  editable?: (key: string, quantity: number) => void;
  hideMoney?: boolean;
}) {
  return (
    <div className="groups" data-tour="tills">
      {(['stall', 'spaza', 'tavern'] as Till[])
        .filter((t) => (!only || only === t) && lines.some((l) => l.till === t))
        .map((t) => (
          <section className="card line-group" key={t}>
            <h3>
              {tillNames[t]}{' '}
              {!hideMoney && <span className="muted">{money(tillTotal(lines, t))}</span>}
            </h3>
            {lines
              .filter((l) => l.till === t)
              .map((l) => (
                <div className="order-line" key={l.key}>
                  {l.till === 'stall' ||
                  l.image.startsWith('/images/products/') ||
                  l.image.startsWith('/images/kota-approved-menu.png') ? (
                    <ProductImage
                      src={
                        l.till === 'stall'
                          ? products.find((p) => p.id === l.productId)?.image || l.image
                          : l.image
                      }
                      alt=""
                    />
                  ) : (
                    <ShoppingBag size={32} aria-label="Historical item" />
                  )}
                  <div className="grow">
                    <strong>
                      {l.quantity} × {l.name}
                    </strong>
                    {l.extras.length > 0 && (
                      <p className="muted small">{l.extras.map((e) => e.name).join(' · ')}</p>
                    )}
                    {editable && (
                      <Stepper value={l.quantity} onChange={(q) => editable(l.key, q)} />
                    )}
                  </div>
                  {!hideMoney && <strong>{money(lineTotal(l))}</strong>}
                </div>
              ))}
          </section>
        ))}
    </div>
  );
}
export function PriceSummary({ lines, address }: { lines: Line[]; address: Order['address'] }) {
  return (
    <div className="price-summary">
      <div>
        <span>
          {address.mode === 'collection' ? 'Collection' : `Delivery · ${address.distance} km`}
        </span>
        <strong className="green">
          {deliveryFee(address) ? money(deliveryFee(address)) : 'FREE'}
        </strong>
      </div>
      <div className="grand-total">
        <span>Total</span>
        <strong>{money(total(lines, address))}</strong>
      </div>
    </div>
  );
}
export function Progress({ order }: { order: Order }) {
  const stage = progressStage(order);
  if (stage < 0)
    return (
      <p role="status" className="muted">
        This ticket has been cancelled.
      </p>
    );
  return (
    <ol className="progress">
      {[
        'Order Received',
        'Kitchen Preparing',
        order.address.mode === 'collection' ? 'Ready to collect' : 'Out for Delivery',
        order.address.mode === 'collection' ? 'Collected' : 'Delivered',
      ].map((name, i) => (
        <li
          className={
            i <= stage || (i === 2 && order.address.mode === 'collection' && allReady(order))
              ? 'done'
              : ''
          }
          key={name}
          aria-current={i === stage ? 'step' : undefined}
        >
          <span>{i <= stage ? <Check size={14} /> : i + 1}</span>
          <small>{name}</small>
        </li>
      ))}
    </ol>
  );
}
export function RouteMap({ order }: { order?: Order }) {
  const current =
    order?.rider === 'gate' || order?.status === 'delivered'
      ? 3
      : order?.rider === 'tavern'
        ? 2
        : order?.rider === 'spaza'
          ? 1
          : 0;
  return (
    <div className={`route-map point-${current}`} aria-label="Illustrative neighbourhood route map">
      <div className="map-street street-a" />
      <div className="map-street street-b" />
      <div className="map-street street-c" />
      <span className="map-label north">
        {order?.address.suburb === 'Meadowlands East'
          ? 'MEADOWLANDS EAST · SOWETO'
          : 'MAMELODI WEST'}
      </span>
      <span className="map-label south">TSAMAYA AVENUE</span>
      <div className="map-path" />
      {[Store, ShoppingBag, CupSoda, MapPin].map((Icon, i) => (
        <span key={i} className={`map-pin pin-${i} ${i === current ? 'current' : ''}`}>
          <Icon size={17} />
        </span>
      ))}
      <span className={`rider-dot rider-${current}`}>
        <Bike size={21} />
      </span>
      <span className="map-disclaimer">Illustrative map · demo location</span>
    </div>
  );
}
export function StopList({ order }: { order: Order }) {
  const { streetNodes } = useStore();
  const route = stops.map((stop) => {
    const node = streetNodes.find(
      (m) => m.id === order.lines.find((l) => l.till === stop.till)?.merchantId,
    );
    return node ? { ...stop, name: node.name, address: node.address } : stop;
  });
  const required = requiredTills(order);
  const current = required.find((t) => !order.collected.includes(t));
  return (
    <ol className="stop-list" data-tour="stops">
      {route
        .filter((s) => required.includes(s.till))
        .map((s, i) => (
          <li
            className={current === s.till ? 'current' : ''}
            aria-current={current === s.till && order.status !== 'cancelled' ? 'step' : undefined}
            key={s.till}
          >
            <span className="stop-number">
              {order.collected.includes(s.till) ? <Check size={15} /> : i + 1}
            </span>
            <div className="grow">
              <strong>{s.name}</strong>
              <p className="small muted">{s.address}</p>
            </div>
            <Tag>
              {order.collected.includes(s.till)
                ? 'Collected'
                : current !== s.till
                  ? 'Locked'
                  : (s.till === 'stall' ? order.kitchen : order[s.till]) === 'ready'
                    ? 'Packed'
                    : 'Preparing'}
            </Tag>
          </li>
        ))}
      <li
        className={order.rider === 'gate' ? 'current' : ''}
        aria-current={order.rider === 'gate' ? 'step' : undefined}
      >
        <span className="stop-number">
          <MapPin size={15} />
        </span>
        <div>
          <strong>Your gate</strong>
          <p className="small muted">
            {order.address.street} · {order.address.note}
          </p>
        </div>
        {order.status === 'delivered' && <Check size={18} />}
      </li>
    </ol>
  );
}
