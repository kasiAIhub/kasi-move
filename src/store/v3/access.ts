import type { Product, Role, Order, OrderAction } from '../../types';
import type { Network, Session, Merchant } from '../../types/v3';
import { GATEWAY, MONEY } from './gateway';
export const DEMO_PINS: Record<string, Record<string, string>> = {
  A: { owner: '1111', spaza: '3333', tavern: '4444', rider: '5555' },
  B: { owner: '2222', spaza: '6333', tavern: '6444', rider: '6555' },
};
export function createNetwork(products: Product[], now = new Date()): Network {
  const stalls = ['A', 'B'].map((id, i) => ({
    id,
    slug: i ? 'meadowlands-kota' : 'mamelodi-kota',
    code: id,
    name: i ? 'Meadowlands Kota' : 'Kasi Kota Mamelodi',
    merchantId: `${id}-stall`,
    riderId: `${id}-rider`,
    riderName: i ? 'Lebo Molefe' : 'Themba Dlamini',
    riderPhone: i ? '0725550109' : '0725550108',
    riderAccepted: true,
    riderPin: i ? '6555' : '5555',
    hours: '08:00–22:00',
    setupFee: MONEY.setup,
    setupStatus: 'paid' as const,
  }));
  const merchants: Merchant[] = stalls.flatMap((s) =>
    (['stall', 'spaza', 'tavern'] as const).map((type) => ({
      id: `${s.id}-${type}`,
      stallId: s.id,
      type,
      name:
        type === 'stall'
          ? s.name
          : type === 'spaza'
            ? `${s.id === 'A' ? 'Mamelodi' : 'Meadowlands'} Corner Spaza`
            : s.id === 'A'
              ? 'Sbu’s place'
              : 'Lebo’s tavern',
      whatsapp: '0715550123',
      address: `${type === 'stall' ? '1140' : type === 'spaza' ? '1141' : '1143'} ${s.id === 'A' ? 'Mamelodi West, Pretoria' : 'Makgatho St, Meadowlands East'}`,
      subAccount: `PF-DEMO-${s.id}-${type.toUpperCase()}`,
      subscriptionId: `SUB-${s.id}-${type}`,
      joinedAt: now.toISOString(),
      subscriptionStatus: 'pending',
      invoices: [],
      mockPaymentSucceeds: true,
      licensedDeliveryEnabled: false,
      enabled: s.id === 'A' || type === 'stall',
    })),
  );
  const catalogues = Object.fromEntries(
    merchants.map((m) => [
      m.id,
      products.filter((p) => p.till === m.type).map((p) => ({ ...p, merchantId: m.id })),
    ]),
  );
  for (const m of merchants.filter((m) => m.type === 'tavern')) {
    const soft = products.filter((p) =>
      ['coke-2l', 'sprite-2l', 'fanta-2l', 'stoney-2l'].includes(p.id),
    );
    catalogues[m.id] = [
      ...soft.map((p) => ({
        ...p,
        id: `tavern-${p.id}`,
        till: 'tavern' as const,
        merchantId: m.id,
      })),
      ...catalogues[m.id],
    ];
  }
  return {
    schema: 3,
    stalls,
    merchants,
    catalogues,
    session: { role: 'customer', stallId: 'A', customerId: 'demo-customer' },
    activeStallId: 'A',
    gateway: { ...GATEWAY },
    withdrawals: [],
  };
}
export function login(network: Network, role: Role, code: string, pin: string): Session {
  const stall = network.stalls.find((s) => s.code === code.toUpperCase());
  if (
    !stall ||
    (role !== 'customer' &&
      (role === 'rider' ? stall.riderPin : DEMO_PINS[stall.code]?.[role]) !== pin)
  )
    throw new Error('Incorrect demo stall code or PIN.');
  return {
    role,
    stallId: stall.id,
    customerId: network.session.customerId,
    merchantId:
      role === 'owner'
        ? stall.merchantId
        : role === 'spaza' || role === 'tavern'
          ? `${stall.id}-${role}`
          : undefined,
    riderId: role === 'rider' ? stall.riderId : undefined,
  };
}
export function allowedRoute(session: Session, path: string) {
  if (path === '/roles' || path === '/tour') return true;
  const role = path.startsWith('/spaza-owner')
    ? 'spaza'
    : path.startsWith('/tavern-owner')
      ? 'tavern'
      : path.startsWith('/owner') || path === '/kitchen'
        ? 'owner'
        : path.startsWith('/rider')
          ? 'rider'
          : 'customer';
  return role === session.role;
}
export function authoriseAction(
  session: Session,
  order: Order,
  action: OrderAction,
  merchants: Merchant[],
) {
  if (order.stallId !== session.stallId) throw new Error('This ticket belongs to another stall.');
  const needed =
    action === 'pack_spaza'
      ? 'spaza'
      : action === 'pack_tavern'
        ? 'tavern'
        : ['accept', 'collect_stall', 'collect_spaza', 'collect_tavern', 'deliver'].includes(action)
          ? 'rider'
          : 'owner';
  if (session.role !== needed) throw new Error('Your role cannot perform this operation.');
  if (needed === 'rider' && order.riderId !== session.riderId)
    throw new Error('This rider is not assigned to the ticket.');
  if (
    action.startsWith('pack_') &&
    order.acknowledgements?.[session.merchantId || ''] === 'unavailable'
  )
    throw new Error('Resolve the missing items before packing.');
  if (session.merchantId) {
    const merchant = merchants.find((m) => m.id === session.merchantId);
    if (
      !merchant ||
      merchant.subscriptionStatus === 'frozen' ||
      !order.lines.some((l) => l.merchantId === merchant.id)
    )
      throw new Error('Merchant operations are frozen or outside your account.');
  }
}
export function ageConfirmed(adult: boolean) {
  return adult === true;
}
export function alcoholAllowed(product: Product, merchant: Merchant, confirmation: boolean) {
  if (product.alcohol && (!merchant.licensedDeliveryEnabled || !confirmation))
    throw new Error('Alcohol requires licensed delivery and customer 18+ confirmation.');
}
