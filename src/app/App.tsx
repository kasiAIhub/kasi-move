import { OwnerStart, OwnerMoney } from './owner/OwnerSimple';
import { StallEntry } from './V3';
import { Component, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Shell, Roles } from '../components/Shell';
import { Empty, Feedback } from '../components/ui';
import {
  Account,
  Cart,
  Catalogue,
  Customise,
  Delivery,
  Home,
  Menu,
  Orders,
  Payment,
  Tracking,
} from './customer/Customer';
import {
  Dashboard,
  Kitchen,
  ManageCatalogue,
  More,
  OwnerDetail,
  OwnerOrders,
  Packing,
} from './owner/Owner';
import { Deliveries, Earnings, JobDetail, RiderProfile } from './rider/Rider';
import { Tour } from '../tour/Tour';
function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="card">
        <h1>Let’s try that again.</h1>
        <p>Your saved tickets stay in this browser.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Reload app
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Feedback>
          <ScrollTop />
          <Routes>
            <Route element={<Shell />}>
              <Route path="/" element={<Home />} />
              <Route path="/stall/:slug" element={<StallEntry />} />
              <Route path="/roles" element={<Roles />} />
              <Route path="/menu" element={<Menu />} />
              <Route path="/menu/:id" element={<Customise />} />
              <Route path="/spaza" element={<Catalogue till="spaza" />} />
              <Route path="/tavern" element={<Catalogue till="tavern" />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout/delivery" element={<Delivery />} />
              <Route path="/checkout/payment" element={<Payment />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id/confirmed" element={<Tracking confirmed />} />
              <Route path="/orders/:id/track" element={<Tracking />} />
              <Route path="/account" element={<Account />} />
              <Route path="/kitchen" element={<Kitchen />} />
              <Route path="/owner/start" element={<OwnerStart />} />
              <Route path="/owner/menu" element={<ManageCatalogue till="stall" />} />
              <Route path="/owner/dashboard" element={<OwnerMoney />} />
              <Route path="/owner/orders" element={<OwnerOrders />} />
              <Route path="/owner/orders/:id" element={<OwnerDetail />} />
              <Route path="/owner/more" element={<More />} />
              <Route path="/spaza-owner/packing" element={<Packing till="spaza" />} />
              <Route path="/spaza-owner/catalogue" element={<ManageCatalogue till="spaza" />} />
              <Route path="/spaza-owner/dashboard" element={<Dashboard till="spaza" />} />
              <Route path="/spaza-owner/more" element={<More />} />
              <Route path="/tavern-owner/packing" element={<Packing till="tavern" />} />
              <Route path="/tavern-owner/catalogue" element={<ManageCatalogue till="tavern" />} />
              <Route path="/tavern-owner/dashboard" element={<Dashboard till="tavern" />} />
              <Route path="/tavern-owner/more" element={<More />} />
              <Route path="/rider" element={<Deliveries />} />
              <Route path="/rider/jobs/:id" element={<JobDetail />} />
              <Route path="/rider/earnings" element={<Earnings />} />
              <Route path="/rider/profile" element={<RiderProfile />} />
              <Route
                path="*"
                element={
                  <Empty
                    title="This corner isn’t on the map."
                    text="Head home to find your street."
                    to="/"
                    label="Go home"
                  />
                }
              />
            </Route>
            <Route path="/tour" element={<Tour />} />
          </Routes>
        </Feedback>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
