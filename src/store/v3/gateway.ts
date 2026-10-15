import type { GatewayConfig } from '../../types/v3';
// V3 modelling rates supplied by the product owner, ex VAT. Mock only.
export const GATEWAY: GatewayConfig = {
  cardBasisPoints: 320,
  cardFixed: 200,
  eftBasisPoints: 200,
  eftMinimum: 200,
  refund: 200,
  payout: 870,
};
export const MONEY = {
  toll: 1500,
  rider: 1000,
  platform: 500,
  minimumKota: 4000,
  setup: 30000,
  subscription: 15000,
};
export function gatewayFee(amount: number, method: string, config = GATEWAY) {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error('Money must be non-negative integer cents.');
  if (method === 'Card')
    return Math.round((amount * config.cardBasisPoints) / 10000) + config.cardFixed;
  if (method === 'Instant EFT' || method === 'Capitec Pay')
    return Math.max(config.eftMinimum, Math.round((amount * config.eftBasisPoints) / 10000));
  if (method === 'Cash on delivery') return 0;
  throw new Error('Unsupported payment method.');
}
export function pricingReviewRecommended(months: { month: string; processed: number }[]) {
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month)).slice(-3);
  if (sorted.length !== 3 || sorted.some((m) => m.processed <= 5000000)) return false;
  const numbers = sorted.map((m) => {
    const [y, month] = m.month.split('-').map(Number);
    return y * 12 + month;
  });
  return numbers[1] === numbers[0] + 1 && numbers[2] === numbers[1] + 1;
}
