import type { Line, Order } from '../../types';
import type { Merchant, Settlement, GatewayConfig } from '../../types/v3';
import { GATEWAY, gatewayFee, MONEY } from './gateway';
export function lineCents(line: Line) {
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20)
    throw new Error('Invalid quantity.');
  const cents =
    Math.round(line.basePrice * 100) +
    line.extras.reduce((sum, e) => sum + Math.round(e.price * 100), 0);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid item price.');
  return cents * line.quantity;
}
export const itemTotalCents = (lines: Line[]) => lines.reduce((sum, l) => sum + lineCents(l), 0);
export const kotaCents = (lines: Line[]) => itemTotalCents(lines.filter((l) => l.till === 'stall'));
export const deliveryIssue = (lines: Line[], mode: string) =>
  mode === 'delivery' && kotaCents(lines) < MONEY.minimumKota
    ? 'Collect at the stall, or add more to reach R40.'
    : null;
export function settle(
  order: Order,
  merchants: Merchant[],
  config: GatewayConfig = GATEWAY,
  previous?: Settlement,
): Settlement {
  const customerItemTotal = itemTotalCents(order.lines);
  const participants = merchants.filter((m) => order.lines.some((l) => l.merchantId === m.id));
  if (
    !participants.length ||
    order.lines.some((l) => !participants.some((m) => m.id === l.merchantId))
  )
    throw new Error('Unknown merchant on ticket.');
  const cancelled = order.status === 'cancelled';
  const delivery = order.address.mode === 'delivery' && !cancelled;
  const complete = order.status === 'delivered';
  const toll = delivery ? MONEY.toll : 0;
  const share = toll / participants.length;
  if (!Number.isInteger(share)) throw new Error('Unsupported merchant split.');
  const merchantSettlements = participants.map((m) => {
    const grossItems = itemTotalCents(order.lines.filter((l) => l.merchantId === m.id));
    const eligible =
      m.type === 'stall'
        ? order.collected.includes('stall') || complete
        : complete && (order.address.mode === 'collection' || order.collected.includes(m.type));
    const escrowStatus = cancelled
      ? 'refunded'
      : m.subscriptionStatus === 'frozen'
        ? 'frozen'
        : eligible
          ? m.type === 'stall' && !complete
            ? 'releasable'
            : 'released'
          : 'held';
    const old = previous?.merchantSettlements.find((s) => s.merchantId === m.id);
    return {
      merchantId: m.id,
      merchantType: m.type,
      grossItems,
      tollContribution: share,
      gatewayFeeAllocation: 0,
      payoutFeeAllocation: 0,
      escrowStatus,
      netPayout: cancelled ? 0 : grossItems - share,
      releasedAt:
        eligible && escrowStatus !== 'frozen'
          ? old?.releasedAt || order.history.at(-1)?.at || order.createdAt
          : undefined,
    } as Settlement['merchantSettlements'][number];
  });
  const grossPlatformBucket = delivery ? MONEY.platform : 0;
  const gatewayFees = gatewayFee(customerItemTotal, order.payment, config);
  // Model one standard disbursement per merchant and one for the rider at completion.
  // All costs belong to the platform, so no rider or merchant item-leg deduction is hidden.
  const payoutFees = complete ? (participants.length + (delivery ? 1 : 0)) * config.payout : 0;
  const refundFees = cancelled ? config.refund : 0;
  const platformFloatUsed = Math.max(
    0,
    gatewayFees + payoutFees + refundFees - grossPlatformBucket,
  );
  return {
    ticketId: order.id,
    currency: 'ZAR',
    unit: 'cents',
    modelVersion: 3,
    customerItemTotal,
    tollStatus: cancelled ? 'reversed' : !delivery ? 'none' : complete ? 'final' : 'reserved',
    merchantSettlements,
    rider: {
      grossRiderAmount: delivery ? MONEY.rider : 0,
      gatewayDeduction: 0,
      netRiderAmount: delivery ? MONEY.rider : 0,
      paidStatus: !delivery ? 'none' : complete ? 'paid' : 'pending',
    },
    platform: {
      grossPlatformBucket,
      gatewayFees,
      payoutFees,
      refundFees,
      platformFloatUsed,
      netPlatform: grossPlatformBucket - gatewayFees - payoutFees - refundFees + platformFloatUsed,
    },
  };
}
export function assertBalanced(settlement: Settlement) {
  const s = settlement;
  const expenses = s.platform.gatewayFees + s.platform.payoutFees + s.platform.refundFees;
  const merchants = s.merchantSettlements.reduce((n, m) => n + m.netPayout, 0);
  const refund = s.tollStatus === 'reversed' ? s.customerItemTotal : 0;
  if (
    s.customerItemTotal + s.platform.platformFloatUsed !==
    merchants + s.rider.netRiderAmount + s.platform.netPlatform + expenses + refund
  )
    throw new Error('Unbalanced settlement.');
  if (s.rider.grossRiderAmount && s.rider.netRiderAmount !== 1000)
    throw new Error('Rider wage was reduced.');
}
