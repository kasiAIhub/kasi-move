import type { Order, Till } from '../../types';
import { tillTotal } from '../../store/machine';

export function newestFirst(orders: Order[]) {
  return [...orders].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id,
  );
}
export const foodTickets = (orders: Order[]) =>
  newestFirst(
    orders.filter(
      (order) => order.status !== 'draft' && order.lines.some((line) => line.till === 'stall'),
    ),
  );
export function kitchenLabel(order: Order) {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.status === 'delivered')
    return order.address.mode === 'collection' ? 'Collected' : 'Delivered';
  return { new: 'New', preparing: 'Preparing', ready: 'Ready' }[order.kitchen];
}
export function riderLabel(order: Order) {
  if (order.status === 'cancelled') return 'Not dispatched · ticket cancelled';
  if (order.address.mode === 'collection')
    return order.status === 'delivered'
      ? 'Collected by customer'
      : 'Customer collection · no rider';
  if (order.status === 'delivered') return 'Delivered to the customer';
  if (order.rider === 'offered')
    return order.kitchen === 'ready' ? 'Waiting for acceptance' : 'Waiting for kitchen readiness';
  return {
    accepted: 'Heading to the stall',
    stall: 'Collecting from the stall',
    spaza: 'Collecting from the spaza',
    tavern: 'Collecting from Sbu’s place',
    gate: 'On the way to the customer',
    done: 'Delivered to the customer',
  }[order.rider];
}
const businessDate = (date: Date) =>
  new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
export function dashboardTotals(orders: Order[], till: Till, now = new Date()) {
  const day = businessDate(now);
  const paid = newestFirst(
    orders.filter(
      (order) =>
        !['draft', 'cancelled'].includes(order.status) &&
        order.lines.some((line) => line.till === till) &&
        businessDate(new Date(order.createdAt)) === day,
    ),
  );
  const sales = paid
    .filter((o) => !o.legacy)
    .reduce((sum, order) => sum + tillTotal(order.lines, till), 0);
  const count = paid.filter((o) => !o.legacy).length;
  return {
    paid,
    sales,
    count,
    shared: paid.filter(
      (order) => (order.merchantCount || new Set(order.lines.map((line) => line.till)).size) > 1,
    ),
  };
}
