import type { Order, Role } from '../../types';
import type { Merchant, Session } from '../../types/v3';
export function merchantAccount(session: Session, merchants: Merchant[], id: string) {
  if (session.merchantId !== id) throw new Error('You may only access your own merchant account.');
  const merchant = merchants.find((m) => m.id === id && m.stallId === session.stallId);
  if (!merchant) throw new Error('Merchant not found.');
  return structuredClone(merchant);
}
export function visibleOrders(orders: Order[], session: Session): Order[] {
  return orders
    .filter(
      (o) =>
        o.stallId === session.stallId &&
        (session.role === 'customer'
          ? o.customerId === session.customerId
          : session.role === 'rider'
            ? o.riderId === session.riderId && o.address.mode === 'delivery'
            : o.lines.some((l) => l.merchantId === session.merchantId)),
    )
    .map((order) => {
      const o = structuredClone(order);
      if (session.role === 'customer') {
        delete o.settlement;
        return o;
      }
      if (session.role === 'owner')
        o.address = {
          ...o.address,
          name: o.address.name.split(' ')[0],
          phone: `•••• ${o.address.phone.replace(/\D/g, '').slice(-4)}`,
        };
      if (session.role === 'owner')
        o.lines = o.lines.filter((l) => l.merchantId === session.merchantId);
      if (session.role === 'spaza' || session.role === 'tavern') {
        o.acknowledgements = Object.fromEntries(
          Object.entries(o.acknowledgements || {}).filter(([id]) => id === session.merchantId),
        );
        o.lines = o.lines.filter((l) => l.merchantId === session.merchantId);
        o.address = {
          ...o.address,
          name: o.address.name.split(' ')[0],
          phone: '',
          street: '',
          suburb: '',
          postcode: '',
          note: '',
        };
      }
      if (session.role === 'rider')
        o.lines = o.lines.map((l) => ({
          ...l,
          basePrice: 0,
          extras: l.extras.map((e) => ({ ...e, price: 0 })),
        }));
      if (o.settlement) {
        o.settlement.merchantSettlements = o.settlement.merchantSettlements.filter(
          (m) => m.merchantId === session.merchantId,
        );
        o.settlement.customerItemTotal = 0;
        if (session.role !== 'rider')
          o.settlement.rider = {
            grossRiderAmount: 0,
            gatewayDeduction: 0,
            netRiderAmount: 0,
            paidStatus: 'none',
          };
        o.settlement.platform = {
          grossPlatformBucket: 0,
          gatewayFees: 0,
          payoutFees: 0,
          refundFees: 0,
          platformFloatUsed: 0,
          netPlatform: 0,
        };
      }
      return o;
    });
}
export const merchantRole = (type: Merchant['type']): Role => (type === 'stall' ? 'owner' : type);
