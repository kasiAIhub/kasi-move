export type GateMethod = 'cash' | 'card';
export type RunState = 'new' | 'cooking' | 'cancelled' | 'ready' | 'on_the_way' | 'delivered';
export interface GateItem {
  id: string;
  name: string;
  priceCents: number | null;
  shop: 'stall' | 'spaza' | 'tavern';
  shopName: string;
  enabled: boolean;
  image?: string;
  extras?: { id: string; name: string; priceCents: number }[];
  soldOutDate?: string;
  alcohol?: boolean;
  alternative?: { name: string; priceCents: number };
}
export interface OrderLine {
  lineId?: string;
  alcohol?: boolean;
  itemId: string;
  name: string;
  quantity: number;
  priceCents: number;
  shop: GateItem['shop'];
  shopName: string;
  alternative: GateItem['alternative'] | null;
  outcome: 'pending' | 'original' | 'alternative' | 'omitted';
  extras?: { id: string; name: string; priceCents: number }[];
}
export interface GateOrder {
  driverAssignedAt?: number;
  driverViewedAt?: number;
  driverAcceptedAt?: number;
  driverAlertAt?: number;
  driverAlertId?: string;
  driverAlertStatus?: string;
  photo?: string;
  cancelledAt?: number;
  riderName?: string | null;
  lastAction?: {role:string;phone:string|null;action:string;at:number};
  regular?: boolean;
  id: string;
  stallId: string;
  customerName: string;
  customerPhone: string;
  gateNote: string;
  collectionTime: string;
  fulfilment: 'delivery' | 'collection';
  method: GateMethod;
  state: RunState;
  lines: OrderLine[];
  createdAt: number;
  deliveredAt: number | null;
  number?: number;
  riderPhone?: string | null;
  riderFeeCents?: number;
}
export function lineTotal(line: OrderLine): number {
  if (line.outcome === 'omitted') return 0;
  return line.quantity * (line.outcome === 'alternative' ? line.alternative!.priceCents : line.priceCents);
}
export function orderMoney(order: GateOrder) {
  const totalCents = order.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const shopSpendCents = order.lines.filter(line => line.shop !== 'stall').reduce((sum, line) => sum + lineTotal(line), 0);
  const kotaCents = totalCents - shopSpendCents;
  const riderCents = order.fulfilment === 'delivery' && order.state === 'delivered' && Boolean(order.riderPhone) ? (order.riderFeeCents ?? 1000) : 0;
  // Recording an externally paid wage is distinct from moving money.
  return { totalCents, shopSpendCents, kotaCents, riderCents, mineCents: kotaCents - riderCents };
}
