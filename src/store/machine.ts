import type { Address, Line, Order, OrderAction, OrderStatus, Till } from '../types';
export const lineTotal = (line: Line) =>
  ((Math.round(line.basePrice * 100) +
    line.extras.reduce((n, e) => n + Math.round(e.price * 100), 0)) *
    line.quantity) /
  100;
export const tillTotal = (lines: Line[], till: Till) =>
  lines.filter((l) => l.till === till).reduce((n, l) => n + Math.round(lineTotal(l) * 100), 0) /
  100;
export const deliveryFee = (_address: Address) => 0;
export const total = (lines: Line[], _address: Address) =>
  lines.reduce((n, l) => n + Math.round(lineTotal(l) * 100), 0) / 100;
export const riderEarnings = (order: Order) => (order.address.mode === 'collection' ? 0 : 10);
export const requiredTills = (order: Order): Till[] =>
  (['stall', 'spaza', 'tavern'] as Till[]).filter((t) => order.lines.some((l) => l.till === t));
export const allReady = (order: Order) =>
  order.kitchen === 'ready' && order.spaza !== 'packing' && order.tavern !== 'packing';
export function transition(order: Order, action: OrderAction): Order {
  if (['cancelled', 'delivered'].includes(order.status))
    throw new Error('This ticket is already closed.');
  const next = structuredClone(order);
  let status: OrderStatus;
  switch (action) {
    case 'start_kitchen':
      if (next.kitchen !== 'new') throw new Error('Kitchen has already started.');
      next.kitchen = 'preparing';
      status = 'kitchen_preparing';
      break;
    case 'ready_kitchen':
      if (next.kitchen !== 'preparing') throw new Error('Start the kitchen order first.');
      next.kitchen = 'ready';
      status = next.address.mode === 'delivery' ? 'rider_offered' : 'kitchen_ready';
      break;
    case 'pack_spaza':
    case 'pack_tavern': {
      const till = action === 'pack_spaza' ? 'spaza' : 'tavern';
      if (next[till] !== 'packing') throw new Error('There is nothing left to pack.');
      next[till] = 'ready';
      status = `${till}_ready`;
      break;
    }
    case 'accept':
      if (next.address.mode !== 'delivery' || next.kitchen !== 'ready' || next.rider !== 'offered')
        throw new Error('Kitchen must be ready before accepting.');
      next.rider = 'accepted';
      status = 'rider_accepted';
      break;
    case 'collect_stall':
    case 'collect_spaza':
    case 'collect_tavern': {
      const till = action.replace('collect_', '') as Till;
      if (next.rider === 'offered' || next.address.mode !== 'delivery')
        throw new Error('Accept this job first.');
      const pending = requiredTills(next).filter((t) => !next.collected.includes(t));
      if (pending[0] !== till) throw new Error('Collect the previous stop first.');
      if ((till === 'stall' ? next.kitchen : next[till]) !== 'ready')
        throw new Error('This stop is not ready yet.');
      if (pending.length === 1 && !allReady(next))
        throw new Error('Every till must be ready before departure.');
      next.collected.push(till);
      const following = pending[1];
      next.rider = following || 'gate';
      status = following ? `collecting_${following}` : 'out_for_delivery';
      break;
    }
    case 'deliver':
      if (
        next.status !== 'out_for_delivery' ||
        next.rider !== 'gate' ||
        !allReady(next) ||
        requiredTills(next).some((t) => !next.collected.includes(t))
      )
        throw new Error('Collect every stop before delivery.');
      next.rider = 'done';
      status = 'delivered';
      break;
    case 'collect_customer':
      if (next.address.mode !== 'collection' || !allReady(next))
        throw new Error('All collection items must be ready.');
      next.rider = 'done';
      next.collected = requiredTills(next);
      status = 'delivered';
      break;
    case 'cancel':
      if (next.kitchen !== 'new' || next.rider !== 'offered')
        throw new Error('Only unstarted tickets can be cancelled.');
      status = 'cancelled';
      break;
    default:
      throw new Error('Unknown order action.');
  }
  next.history.push({ status, at: new Date().toISOString() });
  if (action === 'ready_kitchen')
    next.history.push({ status: 'kitchen_ready', at: new Date().toISOString() });
  // Fulfilment happens in parallel. Packing never rolls the rider or kitchen back.
  if (['pack_spaza', 'pack_tavern'].includes(action) && next.rider !== 'offered')
    next.status = order.status;
  else if (
    ['pack_spaza', 'pack_tavern'].includes(action) &&
    next.kitchen === 'ready' &&
    next.address.mode === 'delivery'
  )
    next.status = 'rider_offered';
  else next.status = status;
  return next;
}
export function canTransition(order: Order, action: OrderAction) {
  try {
    transition(order, action);
    return true;
  } catch {
    return false;
  }
}
