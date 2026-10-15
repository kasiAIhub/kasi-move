import type { Network, Settlement } from './v3';
export type Role = 'customer' | 'owner' | 'spaza' | 'tavern' | 'rider';
export type Till = 'stall' | 'spaza' | 'tavern';
export type OrderStatus =
  | 'draft'
  | 'paid'
  | 'kitchen_new'
  | 'kitchen_preparing'
  | 'kitchen_ready'
  | 'spaza_packing'
  | 'spaza_ready'
  | 'tavern_packing'
  | 'tavern_ready'
  | 'rider_offered'
  | 'rider_accepted'
  | 'collecting_stall'
  | 'collecting_spaza'
  | 'collecting_tavern'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';
export interface Product {
  hidden?: boolean;
  merchantId?: string;
  id: string;
  name: string;
  description: string;
  price: number;
  till: Till;
  image: string;
  category?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  checkedAt?: string;
  imageSource?: string;
  photoNote?: string;
  included?: string[];
  alcohol?: boolean;
}
export interface Extra {
  id: string;
  name: string;
  price: number;
}
export interface Line {
  merchantId?: string;
  key: string;
  productId: string;
  name: string;
  till: Till;
  basePrice: number;
  extras: Extra[];
  quantity: number;
  image: string;
}
export interface Address {
  name: string;
  phone: string;
  street: string;
  suburb: string;
  postcode: string;
  note: string;
  distance: number;
  mode: 'delivery' | 'collection';
}
export type PaymentMethod = 'Card' | 'Instant EFT' | 'Capitec Pay' | 'Cash on delivery';
export interface Order {
  stallId?: string;
  customerId?: string;
  riderId?: string;
  settlement?: Settlement;
  legacy?: boolean;
  merchantCount?: number;
  acknowledgements?: Record<string, 'got_it' | 'unavailable'>;
  id: number;
  createdAt: string;
  lines: Line[];
  address: Address;
  payment: PaymentMethod;
  status: OrderStatus;
  kitchen: 'new' | 'preparing' | 'ready';
  spaza: 'none' | 'packing' | 'ready';
  tavern: 'none' | 'packing' | 'ready';
  rider: 'offered' | 'accepted' | 'stall' | 'spaza' | 'tavern' | 'gate' | 'done';
  collected: Till[];
  history: { status: OrderStatus; at: string }[];
}
export interface AppState {
  trialRevision?: number;
  catalogueRevision?: number;
  version: 1 | 3;
  network?: Network;
  role: Role;
  cart: Line[];
  address: Address;
  orders: Order[];
  savedAddresses: Address[];
  availability: Record<string, boolean>;
  nextId: number;
}
export type OrderAction =
  | 'start_kitchen'
  | 'ready_kitchen'
  | 'pack_spaza'
  | 'pack_tavern'
  | 'accept'
  | 'collect_stall'
  | 'collect_spaza'
  | 'collect_tavern'
  | 'deliver'
  | 'collect_customer'
  | 'cancel';
