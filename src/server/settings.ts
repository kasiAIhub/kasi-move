import type { GateItem } from './contracts';
export interface ShopSetting { type: 'spaza' | 'tavern'; name: string; phone: string; enabled: boolean }
export interface StallSettings {
  kotaExtras?: GateItem['extras'];
  deliveryEnabled?: boolean;
  createdAt?: number;
  overrideOpen?: boolean;
  overrideUntil?: number;
  setupStep?: number;
  photosSkipped?: boolean;
  hoursPreset?: string;
  riderName?: string;
  riderFeeCents?: number;
  billing?: { paidThrough: number; payments: { at: number; amountCents: number; reference: string }[] };
  neighbours?: ShopSetting[];
  done?: string[];
  special?: { text: string; from: number; to: number };
}
