import { useSyncExternalStore } from 'react';
import type {
  Address,
  AppState,
  Extra,
  OrderAction,
  PaymentMethod,
  Product,
  Role,
  Till,
} from '../types';
import type { Network } from '../types/v3';
import { makeLine, makeOrder, seedState } from '../data/seed';
import { extras, products, defaultAddress } from '../data/catalogue';
import { transition } from './machine';
import { restore, STORAGE_KEY } from './persistence';
import { addressIssue } from './checkout';
import { createNetwork, login, authoriseAction, alcoholAllowed, ageConfirmed } from './v3/access';
import { visibleOrders, merchantAccount } from './v3/projections';
import { settle, deliveryIssue, assertBalanced } from './v3/settlement';
import { billSubscription } from './v3/subscriptions';
import { prepareTrialState } from './v3/trial-reset';

export function createStreetStore(
  initial: AppState,
  save: (state: AppState) => void = () => {},
  clock = () => new Date(),
) {
  let raw = structuredClone(initial),
    tourBackup: AppState | null = null,
    error = '';
  let ageProof = false;
  const listeners = new Set<() => void>();
  const n = () => raw.network!;
  function migrate() {
    const isLegacy = !raw.network;
    raw.network ||= createNetwork(products, clock());
    raw.version = 3;
    for (const stall of n().stalls) stall.riderPin ||= stall.id === 'B' ? '6555' : '5555';
    raw.role = n().session.role;
    raw.orders = raw.orders.map((o) => {
      const stallId = o.stallId || 'A';
      const order = {
        ...o,
        stallId,
        customerId: o.customerId || 'demo-customer',
        riderId: o.riderId || `${stallId}-rider`,
        legacy: o.legacy || (isLegacy && o.status === 'delivered'),
        merchantCount: new Set(o.lines.map((l) => l.till)).size,
        lines: o.lines.map((l) => ({ ...l, merchantId: l.merchantId || `${stallId}-${l.till}` })),
      };
      order.settlement = settle(order, n().merchants, n().gateway, order.settlement);
      return order;
    });
    raw.cart = raw.cart.map((l) => ({
      ...l,
      merchantId: l.merchantId || `${n().activeStallId}-${l.till}`,
    }));
    for (const [merchantId, menu] of Object.entries(n().catalogues))
      for (const p of menu) {
        const key = `${merchantId}:${p.id}`;
        raw.availability[key] ??= raw.availability[p.id] ?? true;
      }
  }
  migrate();
  function project() {
    const session = n().session,
      stall = n().stalls.find((s) => s.id === session.stallId)!;
    const nodes = n().merchants.filter((m) => m.stallId === session.stallId);
    const own = nodes.find((m) => m.id === session.merchantId);
    const customer = session.role === 'customer';
    const permitted = customer
      ? nodes.filter((m) => m.enabled && m.subscriptionStatus !== 'frozen')
      : own
        ? [own]
        : [];
    const catalogue = permitted.flatMap((m) =>
      (n().catalogues[m.id] || []).filter(
        (p) => !customer || (!p.hidden && (!p.alcohol || m.licensedDeliveryEnabled)),
      ),
    );
    const safeNodes = nodes.map((m) =>
      m.id === session.merchantId
        ? m
        : {
            ...m,
            subAccount: '',
            subscriptionId: '',
            invoices: [],
            nextBillingAt: undefined,
            mockPaymentSucceeds: true,
          },
    );
    const publicStall = session.role === 'owner' ? stall : { ...stall, setupFee: 0, riderPin: '' };
    const safeNetwork: Network = {
      ...n(),
      stalls: [publicStall],
      merchants: safeNodes,
      catalogues: Object.fromEntries(
        permitted.map((m) => [m.id, catalogue.filter((p) => p.merchantId === m.id)]),
      ),
      withdrawals: n().withdrawals.filter((w) => w.merchantId === session.merchantId),
      gateway: {
        cardBasisPoints: 0,
        cardFixed: 0,
        eftBasisPoints: 0,
        eftMinimum: 0,
        refund: 0,
        payout: 0,
      },
    };
    return structuredClone({
      ...raw,
      role: session.role,
      orders: visibleOrders(raw.orders, session),
      cart: customer ? raw.cart : [],
      address: customer ? raw.address : { ...defaultAddress, name: '', phone: '', note: '' },
      savedAddresses: customer ? raw.savedAddresses : [],
      availability: Object.fromEntries(
        catalogue.map((p) => [p.id, !!raw.availability[`${p.merchantId}:${p.id}`]]),
      ),
      network: safeNetwork,
      catalogue,
      session,
      stall: publicStall,
      merchant: own,
      streetNodes: safeNodes,
      ageConfirmed: ageProof,
    });
  }
  let view = project();
  function publish(persist = true) {
    view = project();
    if (persist && !tourBackup)
      try {
        save(raw);
        error = '';
      } catch {
        error = 'Your browser could not save this update. Keep this tab open.';
      }
    listeners.forEach((fn) => fn());
  }
  function requireCustomer() {
    if (n().session.role !== 'customer') throw new Error('Only a customer can change this ticket.');
  }
  function ownedMerchant() {
    const id = n().session.merchantId;
    if (!id) throw new Error('Sign in to your merchant account.');
    const merchant = merchantAccount(n().session, n().merchants, id);
    if (merchant.subscriptionStatus === 'frozen')
      throw new Error('Overdue subscription: merchant operations and escrow are frozen.');
    return merchant;
  }
  function currentProduct(id: string, merchantId?: string) {
    const session = n().session;
    const matches = n()
      .merchants.filter(
        (m) =>
          m.stallId === session.stallId &&
          (session.role === 'customer'
            ? m.enabled && m.subscriptionStatus !== 'frozen'
            : m.id === session.merchantId),
      )
      .flatMap((m) => n().catalogues[m.id] || [])
      .filter(
        (p) =>
          p.id === id &&
          (!merchantId || p.merchantId === merchantId) &&
          (session.role !== 'customer' || !p.hidden),
      );
    if (matches.length !== 1) throw new Error('This item is not available on your stall route.');
    return matches[0];
  }
  function validateProduct(p: Product) {
    if (n().stalls.find((s) => s.id === n().session.stallId)?.isOpen === false)
      throw new Error('This stall is closed. Please order when it opens.');
    const merchant = n().merchants.find((m) => m.id === p.merchantId);
    if (
      !merchant ||
      merchant.stallId !== n().session.stallId ||
      !merchant.enabled ||
      merchant.subscriptionStatus === 'frozen' ||
      !raw.availability[`${merchant.id}:${p.id}`]
    )
      throw new Error('This item is currently unavailable.');
    alcoholAllowed(p, merchant, ageProof);
  }
  const api = {
    get: () => view,
    storageError: () => error,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    login(role: Role, code: string, pin: string) {
      const session = login(n(), role, code, pin);
      if (session.stallId !== n().activeStallId) raw.cart = [];
      n().session = session;
      n().activeStallId = session.stallId;
      raw.role = role;
      ageProof = false;
      publish();
    },
    role(role: Role) {
      if (role !== 'customer') throw new Error('Use your stall code and demo PIN.');
      api.login('customer', n().activeStallId, '');
    },
    selectStall(slug: string) {
      const stall = n().stalls.find((s) => s.slug === slug);
      if (!stall) throw new Error('Stall not found.');
      api.login('customer', stall.code, '');
    },
    confirmAge(adult: boolean) {
      requireCustomer();
      ageProof = ageConfirmed(adult);
      publish();
    },
    address(address: Address) {
      requireCustomer();
      raw.address = { ...address };
      publish();
    },
    saveAddress(address: Address) {
      requireCustomer();
      const issue = addressIssue(address);
      if (issue) throw new Error(issue);
      const index = raw.savedAddresses.findIndex(
        (a) => a.street === address.street && a.suburb === address.suburb,
      );
      if (index < 0) raw.savedAddresses.push({ ...address });
      else raw.savedAddresses[index] = { ...address };
      raw.address = { ...address };
      publish();
    },
    add(id: string, selected: Extra[] = [], quantity = 1) {
      requireCustomer();
      const p = currentProduct(id);
      validateProduct(p);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20)
        throw new Error('Choose a quantity from 1 to 20.');
      const canonical =
        p.till === 'stall' ? extras.filter((e) => selected.some((x) => x.id === e.id)) : [];
      const line = { ...makeLine(p, canonical, quantity), merchantId: p.merchantId };
      line.key = `${p.merchantId}:${line.key}`;
      const existing = raw.cart.find((l) => l.key === line.key);
      if ((existing?.quantity || 0) + quantity > 20)
        throw new Error('Maximum 20 of the same item per ticket.');
      if (existing) existing.quantity += quantity;
      else raw.cart.push(line);
      publish();
    },
    quantity(key: string, quantity: number) {
      requireCustomer();
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) return;
      raw.cart = raw.cart
        .filter((l) => l.key !== key || quantity > 0)
        .map((l) => (l.key === key ? { ...l, quantity } : l));
      publish();
    },
    available(id: string) {
      const merchant = ownedMerchant();
      const p = currentProduct(id, merchant.id);
      const key = `${p.merchantId}:${p.id}`;
      raw.availability[key] = !raw.availability[key];
      publish();
    },
    editProduct(id: string, patch: { name: string; price: number; description: string }) {
      const m = ownedMerchant();
      if (m.type !== 'stall') throw new Error('Only the Kota owner edits a Kota menu.');
      if (!patch.name.trim() || !Number.isFinite(patch.price) || patch.price <= 0)
        throw new Error('Enter a name and positive Rand price.');
      const menu = n().catalogues[m.id];
      const p = menu.find((p) => p.id === id);
      if (!p) throw new Error('Menu item not found.');
      Object.assign(p, {
        name: patch.name.trim(),
        description: patch.description.trim(),
        price: Math.round(patch.price * 100) / 100,
      });
      publish();
    },
    hideProduct(id: string) {
      const m = ownedMerchant();
      if (m.type !== 'stall') throw new Error('Only your Kota menu can be edited.');
      const p = n().catalogues[m.id].find((p) => p.id === id);
      if (!p) throw new Error('Item not found.');
      p.hidden = !p.hidden;
      publish();
    },
    addProduct(name: string, price: number) {
      const m = ownedMerchant();
      if (m.type !== 'stall' || !name.trim() || !Number.isFinite(price) || price <= 0)
        throw new Error('Enter a Kota name and positive price.');
      const id = `custom-${clock().getTime()}`;
      n().catalogues[m.id].push({
        id,
        merchantId: m.id,
        name,
        price: Math.round(price * 100) / 100,
        till: 'stall',
        description: 'Made at this stall',
        included: ['Chips', 'Sauce'],
        image: '/images/kota-approved-menu.png#classic',
        photoNote: 'Approved menu artwork; see included ingredients.',
      });
      raw.availability[`${m.id}:${id}`] = true;
      publish();
    },
    pay(payment: PaymentMethod, _adult?: boolean) {
      requireCustomer();
      if (!raw.cart.some((l) => l.till === 'stall'))
        throw new Error('Add a Kota to start your street ticket.');
      for (const line of raw.cart) {
        const p = currentProduct(line.productId, line.merchantId);
        validateProduct(p);
        if (
          p.price !== line.basePrice ||
          p.till !== line.till ||
          line.extras.some((e) => !extras.some((x) => x.id === e.id && x.price === e.price))
        )
          throw new Error('Your menu has changed. Remove the item and add it again.');
      }
      const issue = addressIssue(raw.address) || deliveryIssue(raw.cart, raw.address.mode);
      if (issue) throw new Error(issue);
      const session = n().session;
      const order = {
        ...makeOrder(raw.nextId, raw.cart, raw.address),
        merchantCount: new Set(raw.cart.map((l) => l.merchantId)).size,
        payment,
        stallId: session.stallId,
        customerId: session.customerId,
        riderId: n().stalls.find((s) => s.id === session.stallId)!.riderId,
      };
      order.settlement = settle(order, n().merchants, n().gateway);
      assertBalanced(order.settlement);
      raw.orders.unshift(order);
      raw.nextId++;
      raw.cart = [];
      publish();
      return visibleOrders([order], session)[0];
    },
    act(id: number, action: OrderAction) {
      const order = raw.orders.find((o) => o.id === id);
      if (!order) throw new Error('Ticket not found.');
      authoriseAction(n().session, order, action, n().merchants);
      const updated = transition(order, action);
      updated.settlement = settle(updated, n().merchants, n().gateway, order.settlement);
      assertBalanced(updated.settlement);
      raw.orders = raw.orders.map((o) => (o.id === id ? updated : o));
      api.tick();
      publish();
    },
    reorder(id: number) {
      requireCustomer();
      const order = raw.orders.find(
        (o) =>
          o.id === id &&
          o.stallId === n().session.stallId &&
          o.customerId === n().session.customerId,
      );
      if (!order) throw new Error('Ticket not found.');
      const next = order.lines.map((l) => {
        const p = currentProduct(l.productId, l.merchantId);
        validateProduct(p);
        return {
          ...makeLine(
            p,
            extras.filter((e) => l.extras.some((x) => x.id === e.id)),
            l.quantity,
          ),
          merchantId: p.merchantId,
          key: l.key,
        };
      });
      raw.cart = next;
      publish();
    },
    merchant(id: string) {
      return merchantAccount(n().session, n().merchants, id);
    },
    withdraw(ticketId: number) {
      const m = ownedMerchant(),
        order = raw.orders.find((o) => o.id === ticketId && o.stallId === m.stallId);
      const settlement = order?.settlement?.merchantSettlements.find((s) => s.merchantId === m.id);
      if (
        !settlement ||
        !['released', 'releasable'].includes(settlement.escrowStatus) ||
        settlement.netPayout <= 0 ||
        order?.legacy
      )
        throw new Error('This balance is not withdrawable.');
      if (n().withdrawals.some((w) => w.merchantId === m.id && w.ticketId === ticketId))
        throw new Error('This settlement was already withdrawn.');
      n().withdrawals.push({
        id: `${m.id}:${ticketId}`,
        merchantId: m.id,
        ticketId,
        amount: settlement.netPayout,
        at: clock().toISOString(),
      });
      publish();
    },
    setLicensed(enabled: boolean) {
      const m = ownedMerchant();
      if (m.type !== 'tavern')
        throw new Error('Only this tavern may change its licensed-delivery setting.');
      n().merchants.find((x) => x.id === m.id)!.licensedDeliveryEnabled = enabled;
      publish();
    },
    acknowledge(id: number, available: boolean) {
      const m = ownedMerchant();
      if (m.type === 'stall') throw new Error('Use the kitchen queue.');
      const order = raw.orders.find((o) => o.id === id);
      if (!order || order.stallId !== m.stallId || !order.lines.some((l) => l.merchantId === m.id))
        throw new Error('Ticket not found.');
      if (['delivered', 'cancelled'].includes(order.status) || order.collected.includes(m.type))
        throw new Error('Collected or closed ticket items cannot be changed.');
      order.acknowledgements = {
        ...order.acknowledgements,
        [m.id]: available ? 'got_it' : 'unavailable',
      };
      if (!available) {
        order[m.type] = 'packing';
        for (const l of order.lines.filter((l) => l.merchantId === m.id))
          raw.availability[`${m.id}:${l.productId}`] = false;
      }
      publish();
    },
    setStallOpen(open: boolean) {
      const m = ownedMerchant();
      if (m.type !== 'stall') throw new Error('Only the Kota owner can open this stall.');
      n().stalls.find((s) => s.id === m.stallId)!.isOpen = open;
      publish();
    },
    completeOwnerSetup(name: string, hours: string) {
      api.updateStall(name, hours);
      const m = ownedMerchant();
      const stall = n().stalls.find((s) => s.id === m.stallId)!;
      if (!stall.ownerSetupDone && !raw.orders.some((o) => o.stallId === m.stallId)) {
        n()
          .merchants.filter((x) => x.stallId === m.stallId && x.type !== 'stall')
          .forEach((x) => {
            x.enabled = false;
          });
      }
      stall.ownerSetupDone = true;
      stall.isOpen = true;
      publish();
    },
    setNeighbour(id: string, enabled: boolean) {
      const owner = ownedMerchant();
      const shop = n().merchants.find(
        (m) => m.id === id && m.stallId === owner.stallId && m.type !== 'stall',
      );
      if (owner.type !== 'stall' || !shop) throw new Error('Choose a shop on your route.');
      if (
        !enabled &&
        raw.orders.some(
          (o) =>
            !['delivered', 'cancelled'].includes(o.status) &&
            o.lines.some((l) => l.merchantId === id),
        )
      )
        throw new Error('Finish this shop’s active orders before disconnecting it.');
      shop.enabled = enabled;
      publish();
    },
    updateStall(name: string, hours: string) {
      const m = ownedMerchant();
      if (m.type !== 'stall') throw new Error('Only the Kota owner changes this stall.');
      const s = n().stalls.find((s) => s.id === m.stallId)!;
      if (!name.trim()) throw new Error('Enter a stall name.');
      s.name = name;
      s.hours = hours;
      n().merchants.find((x) => x.id === m.id)!.name = name;
      publish();
    },
    riderSlot(name: string, phone: string) {
      const m = ownedMerchant();
      if (m.type !== 'stall' || !name.trim() || !/^0\d{9}$/.test(phone))
        throw new Error('Enter a rider name and ten-digit mobile number.');
      const s = n().stalls.find((s) => s.id === m.stallId)!;
      s.riderId = `${s.id}-rider-${clock().getTime()}`;
      s.riderName = name;
      s.riderPhone = phone;
      s.riderAccepted = false;
      s.riderPin = String((Number(s.riderPin || 5555) + 1) % 10000).padStart(4, '0');
      raw.orders = raw.orders.map((o) =>
        o.stallId === s.id && !['delivered', 'cancelled'].includes(o.status)
          ? { ...o, riderId: s.riderId }
          : o,
      );
      publish();
    },
    acceptRiderInvite() {
      const s = n().stalls.find((s) => s.id === n().session.stallId)!;
      if (n().session.role !== 'rider' || n().session.riderId !== s.riderId)
        throw new Error('This rider slot is not assigned to you.');
      s.riderAccepted = true;
      publish();
    },
    connectShop(type: 'spaza' | 'tavern', name: string, phone: string) {
      const owner = ownedMerchant();
      if (owner.type !== 'stall' || !name.trim() || !/^0\d{9}$/.test(phone))
        throw new Error('Enter a shop name and ten-digit WhatsApp number.');
      const m = n().merchants.find((m) => m.stallId === owner.stallId && m.type === type)!;
      if (m.enabled) throw new Error('This shop is already connected to your route.');
      m.enabled = true;
      m.name = name;
      m.whatsapp = phone;
      m.joinedAt = clock().toISOString();
      publish();
    },
    tick() {
      let changed = false;
      n().merchants = n().merchants.map((m) => {
        const next = billSubscription(m, raw.orders, clock());
        if (JSON.stringify(next) !== JSON.stringify(m)) changed = true;
        return next;
      });
      if (changed) {
        raw.orders = raw.orders.map((o) => ({
          ...o,
          settlement: settle(o, n().merchants, n().gateway, o.settlement),
        }));
        publish();
      }
    },
    subscriptionPayment(invoiceId: string) {
      const merchant = merchantAccount(n().session, n().merchants, n().session.merchantId || '');
      const m = n().merchants.find((m) => m.id === merchant.id)!;
      const invoice = m.invoices.find((i) => i.id === invoiceId);
      if (!invoice) throw new Error('Invoice not found.');
      invoice.status = 'paid';
      const count = m.invoices.filter((i) => i.status === 'missed').length;
      m.subscriptionStatus = count >= 2 ? 'frozen' : count ? 'overdue' : 'active';
      raw.orders = raw.orders.map((o) => ({
        ...o,
        settlement: settle(o, n().merchants, n().gateway, o.settlement),
      }));
      publish();
    },
    beginTour() {
      if (tourBackup) return;
      tourBackup = structuredClone(raw);
      raw = seedState();
      migrate();
      raw.orders = raw.orders.filter((o) => o.id !== 1048);
      raw.nextId = 1048;
      ageProof = false;
      publish();
    },
    endTour() {
      if (!tourBackup) return;
      raw = tourBackup;
      tourBackup = null;
      ageProof = false;
      publish();
    },
    replaceFromStorage(next: AppState) {
      if (tourBackup) return;
      const previousSession = n().session;
      raw = prepareTrialState(next);
      migrate();
      n().session = previousSession;
      n().activeStallId = previousSession.stallId;
      publish(false);
    },
  };
  api.tick();
  return api;
}
const inBrowser = typeof window !== 'undefined';
let initial: AppState;
try {
  initial = prepareTrialState(restore(inBrowser ? localStorage.getItem(STORAGE_KEY) : null));
} catch {
  initial = prepareTrialState(seedState());
}
export const store = createStreetStore(initial, (state) => {
  if (inBrowser) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
});
if (inBrowser) {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) store.replaceFromStorage(restore(event.newValue));
  });
  setInterval(() => store.tick(), 60000);
}
export function useStore() {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
