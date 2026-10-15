import type { Address, Line } from '../types';

export function cartIssue(lines: Line[], availability: Record<string, boolean>): string | null {
  if (!lines.some((line) => line.till === 'stall'))
    return 'Add a Kota to start your street ticket.';
  const unavailable = lines.filter((line) => !availability[line.productId]);
  if (unavailable.length)
    return `${unavailable.map((line) => line.name).join(', ')} is now out of stock. Remove it from your ticket or choose another item.`;
  return null;
}

// The form and mock payment boundary use the same checks. Draft details can still be saved.
export function addressIssue(address: Address): string | null {
  if (!address.name.trim()) return 'Enter your full name.';
  if (!/^(?:0\d{9}|\+27\d{9})$/.test(address.phone.replace(/\s/g, '')))
    return 'Enter a valid South African mobile number, for example 071 123 4567.';
  if (!address.street.trim()) return 'Enter your street address.';
  if (!address.suburb.trim()) return 'Enter your suburb or city.';
  if (!/^\d{4}$/.test(address.postcode.trim())) return 'Enter a four-digit postal code.';
  if (!Number.isFinite(address.distance) || address.distance < 0 || address.distance > 50)
    return 'Enter a demo distance between 0 and 50 km.';
  return null;
}
