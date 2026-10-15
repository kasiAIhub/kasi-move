import { describe, expect, it } from 'vitest';
import { addressIssue, cartIssue } from '../src/store/checkout';
import { defaultAddress } from '../src/data/catalogue';
import { demoLines, currentDemoLines, makeOrder, seedState } from '../src/data/seed';
import { transition } from '../src/store/machine';
import { customerStatus, progressStage } from '../src/app/customer/orderPresentation';
import { restore } from '../src/store/persistence';

describe('Customer checkout and tracking', () => {
  it('adds saved addresses to old sessions without losing active orders', () => {
    const { savedAddresses, ...legacy } = seedState();
    const restored = restore(JSON.stringify(legacy));
    expect(restored.orders).toEqual(legacy.orders);
    expect(restored.cart).toEqual(legacy.cart);
    expect(restored.savedAddresses).toEqual(savedAddresses);
  });
  it('accepts the locked address and +27 phone format, but rejects incomplete details', () => {
    expect(addressIssue(defaultAddress)).toBeNull();
    expect(addressIssue({ ...defaultAddress, phone: '+27 71 123 4567' })).toBeNull();
    expect(addressIssue({ ...defaultAddress, phone: '071' })).toContain('mobile number');
    expect(addressIssue({ ...defaultAddress, name: '   ' })).toContain('full name');
    expect(addressIssue({ ...defaultAddress, postcode: '12' })).toContain('four-digit');
    expect(addressIssue({ ...defaultAddress, distance: NaN })).toContain('distance');
  });
  it('flags removed Kota lines and stock changes before payment', () => {
    const state = seedState();
    expect(cartIssue(currentDemoLines(), state.availability)).toBeNull();
    expect(cartIssue(currentDemoLines().slice(1), state.availability)).toContain('Add a Kota');
    expect(cartIssue(currentDemoLines(), { ...state.availability, milk: false })).toContain(
      'Clover Full Cream Milk',
    );
  });
  it('keeps collection progress and copy consistent when every shop is ready', () => {
    let order = makeOrder(1048, demoLines(), { ...defaultAddress, mode: 'collection' });
    for (const action of ['start_kitchen', 'ready_kitchen', 'pack_spaza', 'pack_tavern'] as const)
      order = transition(order, action);
    expect(customerStatus(order)).toBe('Ready for collection');
    expect(progressStage(order)).toBe(2);
    order = transition(order, 'collect_customer');
    expect(customerStatus(order)).toBe('Collected');
    expect(progressStage(order)).toBe(3);
  });
  it('stops progress on cancellation and follows the rider’s actual stop', () => {
    let order = makeOrder(1048, demoLines());
    const cancelled = transition(order, 'cancel');
    expect(customerStatus(cancelled)).toBe('Order cancelled');
    expect(progressStage(cancelled)).toBe(-1);
    for (const action of ['start_kitchen', 'ready_kitchen', 'accept', 'collect_stall'] as const)
      order = transition(order, action);
    expect(customerStatus(order)).toBe('Collecting from the spaza');
    expect(progressStage(order)).toBe(1);
  });
});
