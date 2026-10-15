import { allowedRoute } from '../store/v3/access';
import { DemoLogin, FrozenOperations } from '../app/V3';
import { Empty } from './ui';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  UtensilsCrossed,
  ShoppingBag,
  CupSoda,
  ReceiptText,
  UserRound,
  ChefHat,
  LayoutDashboard,
  Ellipsis,
  Bike,
  Wallet,
  ArrowLeftRight,
  ArrowUpRight,
  MapPin,
} from 'lucide-react';
import { roles } from '../data/catalogue';
import { useStore, store } from '../store';
import type { Role } from '../types';
import { Navigation } from './Navigation';
const navs = {
  customer: [
    ['Home', '/', Home],
    ['Menu', '/menu', UtensilsCrossed],
    ['Spaza', '/spaza', ShoppingBag],
    ['Tavern', '/tavern', CupSoda],
    ['Orders', '/orders', ReceiptText],
    ['Account', '/account', UserRound],
  ],
  owner: [
    ['Orders', '/kitchen', ChefHat],
    ['Menu', '/owner/menu', UtensilsCrossed],
    ['Money', '/owner/dashboard', Wallet],
    ['More', '/owner/more', Ellipsis],
  ],
  spaza: [
    ['Packing', '/spaza-owner/packing', ShoppingBag],
    ['Catalogue', '/spaza-owner/catalogue', ReceiptText],
    ['Dashboard', '/spaza-owner/dashboard', LayoutDashboard],
    ['More', '/spaza-owner/more', Ellipsis],
  ],
  tavern: [
    ['Packing', '/tavern-owner/packing', CupSoda],
    ['Catalogue', '/tavern-owner/catalogue', ReceiptText],
    ['Dashboard', '/tavern-owner/dashboard', LayoutDashboard],
    ['More', '/tavern-owner/more', Ellipsis],
  ],
  rider: [
    ['Deliveries', '/rider', Bike],
    ['Earnings', '/rider/earnings', Wallet],
    ['Profile', '/rider/profile', UserRound],
  ],
} as const;
export function routeRole(path: string): Role {
  return path.startsWith('/spaza-owner')
    ? 'spaza'
    : path.startsWith('/tavern-owner')
      ? 'tavern'
      : path.startsWith('/owner') || path.startsWith('/kitchen')
        ? 'owner'
        : path.startsWith('/rider')
          ? 'rider'
          : 'customer';
}
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="KASI KOTA home">
      <span className="brand-k">K</span>
      <span>
        <b>
          KASI KOTA<span className="brand-period">.</span>
        </b>
        <small>Kasi flavour. Kota power.</small>
      </span>
    </Link>
  );
}
export function Shell() {
  const state = useStore();
  const location = useLocation();
  const role = state.session.role;
  const permitted =
    location.pathname.startsWith('/stall/') || allowedRoute(state.session, location.pathname);
  const frozen =
    state.merchant?.subscriptionStatus === 'frozen' && !['/roles'].includes(location.pathname);
  const count = state.cart.reduce((n, l) => n + l.quantity, 0);
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <span className="role-label">
            {roles.find((r) => r.id === role)?.name} <span className="live-dot" />
          </span>
          <Link to="/roles" className="desktop-switch">
            <ArrowLeftRight size={16} /> Switch role
          </Link>
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <p className="eyebrow">YOUR NEIGHBOURHOOD</p>
          <nav aria-label="Desktop navigation">
            {navs[role].map(([label, to, Icon]) => (
              <NavLink key={to} to={to} end>
                <Icon size={20} />
                {label}
                <ArrowUpRight className="nav-arrow" size={15} />
              </NavLink>
            ))}
          </nav>
          <div className="street-note">
            <span className="live-dot" /> THE STREET IS OPEN
            <h3>
              One order.
              <br />
              Several tills.
              <br />
              <span className="green">One rider.</span>
            </h3>
            <p>Everybody on this order gets paid.</p>
          </div>
        </aside>
        <div className="content-wrap">
          <div className="location-bar">
            <MapPin size={14} />
            <span>{role === 'customer' ? state.address.street : state.stall.name}</span>
            <span className="open-label">
              {state.stall.isOpen === false ? 'CLOSED' : 'OPEN NOW'}
            </span>
          </div>
          {store.storageError() && (
            <div role="alert" className="warning">
              {store.storageError()}
            </div>
          )}
          <main>
            <Navigation />
            {!permitted ? (
              <Empty
                title="Access restricted"
                text="Sign in with the correct role and stall code."
                to="/roles"
                label="Demo sign in"
              />
            ) : frozen ? (
              <FrozenOperations />
            ) : (
              <Outlet />
            )}
          </main>
          <footer className="page-footer">
            {role === 'owner' ? (
              <details>
                <summary>About this version</summary>Working preview. Payments and payouts are
                simulated. Orders stay on this device.
              </details>
            ) : (
              'KASI KOTA · Demonstration. No real payments or deliveries. Orders stay on this device.'
            )}
          </footer>
        </div>
      </div>
      {role === 'customer' &&
        count > 0 &&
        !['/cart', '/checkout/delivery', '/checkout/payment'].includes(location.pathname) && (
          <Link to="/cart" className="cart-float">
            <ShoppingBag size={18} />
            <span>View your order</span>
            <b>{count}</b>
          </Link>
        )}
      <Link className="role-float" to="/roles">
        <ArrowLeftRight size={15} /> Switch role
      </Link>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navs[role].map(([label, to, Icon]) => (
          <NavLink key={to} to={to} end>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
export function Roles() {
  return <DemoLogin />;
}
