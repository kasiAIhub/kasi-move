import type { AppState } from '../types';
import { seedState } from '../data/seed';
import { defaultAddress, sowetoAddress, products } from '../data/catalogue';
export const STORAGE_KEY = 'kasi-kota:v1';
export function restore(raw: string | null): AppState {
  if (!raw) return seedState();
  try {
    const state = JSON.parse(raw) as AppState;
    if (
      ![1, 3].includes(state.version) ||
      !Array.isArray(state.orders) ||
      !Array.isArray(state.cart) ||
      !state.address ||
      !state.availability ||
      !Number.isInteger(state.nextId)
    )
      return seedState();
    if (
      state.orders.some(
        (o) =>
          !Array.isArray(o.lines) ||
          !o.address ||
          !Array.isArray(o.history) ||
          !Array.isArray(o.collected),
      )
    )
      return seedState();
    // Merge new product availability without reviving retired items or changing paid tickets.
    // Add saved addresses to existing v1 sessions without resetting tickets or cart contents.
    return {
      ...state,
      availability: state.network
        ? state.availability
        : Object.fromEntries(products.map((p) => [p.id, state.availability[p.id] ?? true])),
      savedAddresses: Array.isArray(state.savedAddresses)
        ? state.savedAddresses
        : [{ ...defaultAddress }, { ...sowetoAddress }],
    };
  } catch {
    return seedState();
  }
}
