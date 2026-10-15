import type { Order, Product, Role, Till } from './index';
export type SubscriptionStatus = 'pending' | 'active' | 'overdue' | 'frozen';
export type EscrowStatus = 'held' | 'releasable' | 'released' | 'frozen' | 'refunded';
export interface SubscriptionInvoice {
  id: string;
  dueAt: string;
  amount: number;
  subAccount: string;
  status: 'paid' | 'missed';
}
export interface Merchant {
  id: string;
  stallId: string;
  type: Till;
  name: string;
  whatsapp: string;
  address: string;
  subAccount: string;
  subscriptionId: string;
  joinedAt: string;
  subscriptionStatus: SubscriptionStatus;
  invoices: SubscriptionInvoice[];
  nextBillingAt?: string;
  mockPaymentSucceeds: boolean;
  licensedDeliveryEnabled: boolean;
  enabled: boolean;
}
export interface KotaStall {
  isOpen?: boolean;
  ownerSetupDone?: boolean;
  id: string;
  slug: string;
  code: string;
  name: string;
  merchantId: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  riderAccepted: boolean;
  riderPin: string;
  hours: string;
  setupFee: number;
  setupStatus: 'paid';
}
export interface Session {
  role: Role;
  stallId: string;
  merchantId?: string;
  riderId?: string;
  customerId: string;
}
export interface Network {
  schema: 3;
  stalls: KotaStall[];
  merchants: Merchant[];
  catalogues: Record<string, Product[]>;
  session: Session;
  activeStallId: string;
  gateway: GatewayConfig;
  withdrawals: { id: string; merchantId: string; ticketId: number; amount: number; at: string }[];
}
export interface GatewayConfig {
  cardBasisPoints: number;
  cardFixed: number;
  eftBasisPoints: number;
  eftMinimum: number;
  refund: number;
  payout: number;
}
export interface MerchantSettlement {
  merchantId: string;
  merchantType: Till;
  grossItems: number;
  tollContribution: number;
  gatewayFeeAllocation: number;
  payoutFeeAllocation: number;
  escrowStatus: EscrowStatus;
  netPayout: number;
  releasedAt?: string;
}
export interface Settlement {
  ticketId: number;
  currency: 'ZAR';
  unit: 'cents';
  modelVersion: 3;
  customerItemTotal: number;
  tollStatus: 'reserved' | 'final' | 'none' | 'reversed';
  merchantSettlements: MerchantSettlement[];
  rider: {
    grossRiderAmount: number;
    gatewayDeduction: 0;
    netRiderAmount: number;
    paidStatus: 'pending' | 'paid' | 'none';
  };
  platform: {
    grossPlatformBucket: number;
    gatewayFees: number;
    payoutFees: number;
    refundFees: number;
    platformFloatUsed: number;
    netPlatform: number;
  };
}
export interface Ticket extends Order {
  stallId: string;
  customerId: string;
  riderId: string;
  settlement: Settlement;
}
export interface Stop {
  till: Till | 'customer';
  name: string;
  address: string;
  status: 'locked' | 'arrived_ready' | 'waiting' | 'collected' | 'out_for_delivery' | 'delivered';
}
export type StreetNode = Merchant;
