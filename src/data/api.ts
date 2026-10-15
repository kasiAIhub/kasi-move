import { store } from '../store';
import type { OrderAction, PaymentMethod } from '../types';
// A replaceable async boundary: no credentials, external services or real charges.
let paymentPending = false;
export const api = {
  async pay(method: PaymentMethod, adultConfirmed = false) {
    if (paymentPending) throw new Error('Payment is already being processed.');
    paymentPending = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return store.pay(method, adultConfirmed);
    } finally {
      paymentPending = false;
    }
  },
  async transition(id: number, action: OrderAction) {
    store.act(id, action);
  },
};
