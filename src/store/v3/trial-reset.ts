import type { AppState } from '../../types';
import { products } from '../../data/catalogue';
import { createNetwork } from './access';

// User-requested clean start. A revision marker prevents clearing subsequent orders.
export const TRIAL_REVISION = 20260907;
export function prepareTrialState(initial: AppState, now = new Date()): AppState {
  const state = structuredClone(initial);
  applyCataloguePatch(state);
  if ((state.trialRevision || 0) >= TRIAL_REVISION) return state;
  state.network ||= createNetwork(products, now);
  state.orders = [];
  state.cart = [];
  state.nextId = 1;
  state.network.withdrawals = [];
  for (const merchant of state.network.merchants) {
    merchant.invoices = [];
    merchant.nextBillingAt = undefined;
    merchant.joinedAt = now.toISOString();
    merchant.subscriptionStatus = 'pending';
    if (merchant.type === 'tavern') merchant.licensedDeliveryEnabled = true;
    const menu = (state.network.catalogues[merchant.id] ||= []);
    for (const product of products.filter(
      (p) => ['eggs-six', 'maize-meal'].includes(p.id) && p.till === merchant.type,
    )) {
      if (!menu.some((p) => p.id === product.id))
        menu.push({ ...product, merchantId: merchant.id });
    }
  }
  state.trialRevision = TRIAL_REVISION;
  return state;
}

export const CATALOGUE_REVISION = 20260908;
function applyCataloguePatch(state: AppState) {
  if ((state.catalogueRevision || 0) >= CATALOGUE_REVISION) return;
  const changed = new Set([
    'savanna',
    'hunters-dry',
    'castle',
    'heineken',
    'castle-lite',
    'stella',
    'black-label',
    'flying-fish',
  ]);
  for (const [merchantId, menu] of Object.entries(state.network?.catalogues || {})) {
    state.network!.catalogues[merchantId] = menu
      .filter((p) => p.id !== 'grandpa')
      .map((p) => {
        const current = products.find((x) => x.id === p.id);
        return changed.has(p.id) && current ? { ...current, merchantId } : p;
      });
  }
  state.cart = state.cart
    .filter((l) => l.productId !== 'grandpa')
    .map((l) => {
      const current = products.find((p) => p.id === l.productId);
      return changed.has(l.productId) && current
        ? { ...l, name: current.name, basePrice: current.price, image: current.image }
        : l;
    });
  state.catalogueRevision = CATALOGUE_REVISION;
}
