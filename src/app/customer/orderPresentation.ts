import type { Order } from '../../types';
import { allReady } from '../../store/machine';

export function customerStatus(order: Order): string {
  if (order.status === 'cancelled') return 'Order cancelled';
  if (order.status === 'delivered')
    return order.address.mode === 'collection' ? 'Collected' : 'Delivered';
  if (order.address.mode === 'collection' && allReady(order)) return 'Ready for collection';
  if (order.rider === 'gate') return 'Out for Delivery';
  if (order.rider === 'spaza') return 'Collecting from the spaza';
  if (order.rider === 'tavern') return 'Collecting from Sbu’s place';
  if (order.rider === 'accepted' || order.rider === 'stall') return 'Collecting from the stall';
  if (order.kitchen === 'ready')
    return order.address.mode === 'collection'
      ? 'Waiting for the other shops'
      : 'Kota ready · waiting for rider';
  if (order.kitchen === 'preparing') return 'Kitchen Preparing';
  return 'Order Received';
}

export function progressStage(order: Order): number {
  if (order.status === 'cancelled') return -1;
  if (order.status === 'delivered') return 3;
  if (
    order.status === 'out_for_delivery' ||
    (order.address.mode === 'collection' && allReady(order))
  )
    return 2;
  return order.kitchen === 'new' ? 0 : 1;
}
