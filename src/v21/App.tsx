import {TeamManager,TeamInvite,AssistantKitchen} from './team';
import {TeamAccess} from './team-access';
import type { ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DraftProvider, IdentityProvider, settingsOf, useIdentity, useResource, type OwnerData } from './client';
import { Frame, Loading } from './common';
import { KeepStall, MenuManager, Money, More, Setup, Till, VendorLogin, VendorVerify } from './owner';
import { Kota, MyOrders, NextDoorCustomer, Order, StallMenu, Track } from './customer';
import { Rider, RiderInvite } from './rider';
import './styles.css';
import { NextDoor } from './next-door';
import { Admin } from './admin';
function Private({ role, children }: { role: 'vendor' | 'rider' | 'assistant'; children: ReactNode }) {
  const identity = useIdentity();
  if (identity.loading) return <Loading />;
  if (identity.session?.role !== role) return role === 'vendor' ? <Navigate to="/login" replace /> : <Frame><h1>Your runs</h1><p>Open the delivery link your vendor sent you on WhatsApp.</p></Frame>;
  return <>{children}</>;
}
function VendorEntry() {
  const resource = useResource<OwnerData>('/vendor/stall');
  if (!resource.data) return <Loading error={resource.error} />;
  const step = settingsOf(resource.data.stall).setupStep ?? 3;
  return <Navigate to={step >= 9 ? '/kitchen' : `/setup/${step}`} replace />;
}
function Entry() {
  const location=useLocation();
  const identity = useIdentity();
  if (identity.loading) return <Loading />;
  if (identity.session?.role === 'vendor') return <VendorEntry />;
  if (identity.session?.role === 'assistant') return <Navigate to="/assistant" replace />;
  if (identity.session?.role === 'rider') return <Navigate to="/rider" replace />;
  return <Navigate to={'/setup/1'+location.search} replace />;
}
export default function App() {
  return <BrowserRouter><IdentityProvider><DraftProvider><Routes>
    <Route path="/admin" element={<Admin />} />
    <Route path="/team/access" element={<TeamAccess/>}/>
    <Route path="/login" element={<VendorLogin />} /><Route path="/verify" element={<VendorVerify />} />
    <Route path="/" element={<Entry />} /><Route path="/setup/:step" element={<Setup />} />
    <Route path="/stall/:stallId" element={<StallMenu />} /><Route path="/stall/:stallId/kota/:itemId" element={<Kota />} />
    <Route path="/stall/:stallId/next-door" element={<NextDoorCustomer />} /><Route path="/stall/:stallId/order" element={<Order />} />
    <Route path="/order/:orderId" element={<Track />} /><Route path="/my-orders" element={<MyOrders />} />
    <Route path="/kitchen" element={<Private role="vendor"><Till /></Private>} /><Route path="/owner/menu" element={<Private role="vendor"><MenuManager /></Private>} />
    <Route path="/owner/dashboard" element={<Private role="vendor"><Money /></Private>} /><Route path="/owner/more" element={<Private role="vendor"><More /></Private>} />
    <Route path="/owner/next-door" element={<Private role="vendor"><NextDoor /></Private>} /><Route path="/owner/keep" element={<Private role="vendor"><KeepStall /></Private>} />
    <Route path="/owner/delivery-team" element={<Private role="vendor"><TeamManager role="rider"/></Private>}/><Route path="/owner/assistants" element={<Private role="vendor"><TeamManager role="assistant"/></Private>}/><Route path="/team/invite" element={<TeamInvite/>}/><Route path="/assistant" element={<Private role="assistant"><AssistantKitchen/></Private>}/>
    <Route path="/rider/invite" element={<RiderInvite />} /><Route path="/rider" element={<Private role="rider"><Rider /></Private>} />
    <Route path="/roles" element={<Navigate to="/" replace />} /><Route path="/owner/start" element={<Navigate to="/" replace />} />
    <Route path="/:stallId" element={<StallMenu />} />
    <Route path="*" element={<Frame><h1>This page has moved.</h1><Link className="v-button" to="/">Open Kasi Move</Link></Frame>} />
  </Routes></DraftProvider></IdentityProvider></BrowserRouter>;
}
