import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Brand } from '../components/Shell';
import { Navigation } from '../components/Navigation';
import {
  Cart,
  Catalogue,
  Customise,
  Delivery,
  Menu,
  Payment,
  Tracking,
} from '../app/customer/Customer';
import { Dashboard, Kitchen } from '../app/owner/Owner';
import { Deliveries } from '../app/rider/Rider';
import { store } from '../store';
import { extras, money, products } from '../data/catalogue';
const tourSum = () =>
  money(
    70 +
      products.find((p) => p.id === 'milk')!.price +
      products.find((p) => p.id === 'water')!.price,
  );
export const tourSteps = [
  {
    path: '/menu',
    title: 'Choose Your Kota',
    caption: 'Start with a Russian Special.',
    targets: ['russian'],
  },
  {
    path: '/menu/russian',
    title: 'Make it yours',
    caption: 'Extra egg. That’s your Kota sorted.',
    targets: ['egg', 'add-kota'],
  },
  {
    path: '/spaza',
    title: 'From the Spaza',
    caption: 'Milk from the spaza. Same ticket.',
    targets: ['milk'],
  },
  {
    path: '/tavern',
    title: 'From Sbu’s place',
    caption: 'Still water from Sbu’s place around the corner.',
    targets: ['water'],
  },
  {
    path: '/cart',
    title: 'One shared ticket',
    caption: `${tourSum()} across three local tills. Delivery is FREE.`,
    targets: ['tills'],
  },
  {
    path: '/checkout/delivery',
    title: 'Straight to your gate',
    caption: 'Gate 3. Just 1.8 km away.',
    targets: ['gate', 'distance'],
  },
  {
    path: '/checkout/payment',
    title: 'Everybody gets paid',
    caption: 'One payment. Three local tills.',
    targets: ['pay'],
  },
  {
    path: '/orders/1048/confirmed',
    title: 'Order Confirmed',
    caption: `Ticket #1048. ${tourSum()}. About 18 minutes.`,
    targets: ['confirmed', 'track'],
  },
  {
    path: '/kitchen',
    title: 'Into the kitchen',
    caption: 'Only the Kota and extra egg reach the kitchen.',
    targets: ['ready'],
  },
  {
    path: '/rider',
    title: 'One rider. Every stop.',
    caption: 'Stall, spaza, Sbu’s, then your gate.',
    targets: ['stops', 'accept'],
  },
  {
    path: '/owner/dashboard',
    title: 'Your street earns together',
    caption: 'Your food till. Your neighbours keep their own earnings.',
    targets: ['sales', 'top-russian'],
  },
];
export function Tour() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState({ x: 80, y: 160 });
  const [tapping, setTapping] = useState(false);
  const [scale, setScale] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const completed = useRef(new Set<string>());
  const current = tourSteps[step];
  useEffect(() => {
    store.beginTour();
    setReady(true);
    return () => store.endTour();
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (step === 8) {
      store.login('owner', 'A', '1111');
      const o = store.get().orders.find((o) => o.id === 1048);
      if (o?.kitchen === 'new') store.act(1048, 'start_kitchen');
    }
    if (step === 9) store.login('rider', 'A', '5555');
    if (step === 10) store.login('owner', 'A', '1111');
  }, [ready, step]);
  useEffect(() => {
    if (!ready) return;
    setScale(1);
    const timer = setTimeout(() => {
      if (stage.current)
        setScale(Math.min(1, (window.innerHeight - 190) / stage.current.scrollHeight));
    }, 100);
    return () => clearTimeout(timer);
  }, [ready, step]);
  useEffect(() => {
    if (!ready || !playing) return;
    const point = (target: string) => {
      const node = stage.current?.querySelector(`[data-tour="${target}"]`);
      if (node) {
        const r = node.getBoundingClientRect();
        setPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }
    };
    const perform = (key: string, fn: () => void) => {
      if (completed.current.has(key)) return;
      fn();
      completed.current.add(key);
      setTapping(true);
    };
    const timers = [
      setTimeout(() => point(current.targets[0]), 700),
      setTimeout(() => {
        setTapping(true);
        if (step === 1)
          perform('egg', () => {
            const checkbox =
              stage.current?.querySelector<HTMLInputElement>('[data-tour="egg"] input');
            if (checkbox && !checkbox.checked) checkbox.click();
          });
        if (step === 2) perform('milk', () => store.add('milk'));
        if (step === 3) perform('water', () => store.add('water'));
        if (step === 8)
          perform('ready', () => {
            store.act(1048, 'ready_kitchen');
            store.login('spaza', 'A', '3333');
            store.act(1048, 'pack_spaza');
            store.login('tavern', 'A', '4444');
            store.act(1048, 'pack_tavern');
            store.login('owner', 'A', '1111');
          });
      }, 2200),
      setTimeout(() => {
        setTapping(false);
        if (current.targets[1]) point(current.targets[1]);
      }, 3200),
      setTimeout(() => {
        if (step === 6) {
          const checkbox = stage.current?.querySelector<HTMLInputElement>('.adult-check input');
          if (checkbox && !checkbox.checked) checkbox.click();
        }
        if (step === 1) perform('kota', () => store.add('russian', [extras[0]]));
        if (step === 9)
          perform('accepted', () => {
            store.act(1048, 'accept');
          });
      }, 4400),
      setTimeout(() => {
        if (step === 6) perform('paid', () => store.pay('Card', true));
      }, 5950),
      setTimeout(() => {
        setTapping(false);
        if (step < 10) setStep((s) => s + 1);
        else setPlaying(false);
      }, 6000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [step, playing, ready, current]);
  const restart = () => {
    store.endTour();
    store.beginTour();
    completed.current.clear();
    setStep(0);
    setPlaying(true);
  };
  return (
    <div className="tour-root">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <span className="role-label">Demo Tour</span>
        </div>
      </header>
      <div className="tour-toolbar">
        <Navigation />
        <p>
          <strong data-testid="tour-step">{step + 1} / 11</strong> · {current.title}
        </p>
        <div className="tour-controls">
          <button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
          <button onClick={restart}>Restart</button>
          <Link to="/" className="small" style={{ padding: '7px' }}>
            Exit
          </Link>
        </div>
      </div>
      <div ref={stage} className="tour-stage" style={{ zoom: scale }} aria-label="Demo tour screen">
        {ready && (
          <Routes location={`/tour${current.path}`}>
            <Route path="/menu" element={<Menu />} />
            <Route path="/menu/:id" element={<Customise />} />
            <Route path="/spaza" element={<Catalogue till="spaza" tour />} />
            <Route path="/tavern" element={<Catalogue till="tavern" tour />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout/delivery" element={<Delivery />} />
            <Route path="/checkout/payment" element={<Payment />} />
            <Route path="/orders/:id/confirmed" element={<Tracking confirmed />} />
            <Route path="/kitchen" element={<Kitchen tour />} />
            <Route path="/rider" element={<Deliveries tour />} />
            <Route path="/owner/dashboard" element={<Dashboard till="stall" tour />} />
          </Routes>
        )}
      </div>
      <div
        className={`tour-pointer ${tapping ? 'tapping' : ''}`}
        data-testid="tour-pointer"
        style={{ left: position.x, top: position.y }}
      />
      <div className="tour-caption" aria-live="polite">
        {current.caption}
        {step === 10 && !playing && <span> · Tour complete</span>}
      </div>
    </div>
  );
}
