import { researchedProducts } from './researched-products';
import type { Address, Extra, Product, Role, Till } from '../types';
export const money = (value: number) =>
  `R${value.toLocaleString('en-ZA', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
export const tillNames: Record<Till, string> = {
  stall: 'From the stall',
  spaza: 'From the spaza',
  tavern: 'From Sbu’s place',
};
export const roles: { id: Role; name: string; description: string; path: string }[] = [
  { id: 'customer', name: 'Customer', description: 'Order from your street', path: '/' },
  {
    id: 'owner',
    name: 'Kota owner',
    description: 'Your stall. Your kitchen. Your till.',
    path: '/kitchen',
  },
  {
    id: 'spaza',
    name: 'Spaza owner',
    description: 'Pack the everyday essentials',
    path: '/spaza-owner/packing',
  },
  {
    id: 'tavern',
    name: 'Tavern owner',
    description: 'Keep Sbu’s orders moving',
    path: '/tavern-owner/packing',
  },
  { id: 'rider', name: 'Rider', description: 'One route. The whole street.', path: '/rider' },
];
export const defaultAddress: Address = {
  name: 'Thabo Mokoena',
  phone: '071 123 4567',
  street: '1142 Mamelodi West',
  suburb: 'Pretoria',
  postcode: '0122',
  note: 'Gate 3. Call when you arrive.',
  distance: 1.8,
  mode: 'delivery',
};
export const sowetoAddress: Address = {
  ...defaultAddress,
  street: '123 Makgatho St',
  suburb: 'Meadowlands East',
  postcode: '1852',
  distance: 2.8,
};
export const extras: Extra[] = [
  ['egg', 'Extra egg', 10],
  ['bacon', 'Bacon', 12],
  ['polony', 'Polony', 8],
  ['cheese', 'Extra cheese', 8],
  ['atchar', 'Atchar', 5],
  ['salad', 'Salad', 6],
  ['vienna', 'Vienna', 10],
  ['chakalaka', 'Chakalaka', 7],
].map(([id, name, price]) => ({ id: String(id), name: String(name), price: Number(price) }));
const kota = [
  ['classic', 'Kasi Classic', 'Traditional Kota', 35],
  ['cheese-boy', 'Cheese Boy', 'Extra cheese bliss', 45],
  ['russian', 'Russian Special', 'Double Russians', 60],
  ['breakfast', 'Breakfast Kota', 'Morning fuel', 50],
  ['beast', 'The Beast', 'Ultimate challenge', 75],
  ['chicken', 'Chicken Kasi', 'Spicy grilled chicken', 55],
] as const;
const kotaImages: Record<string, string> = {
  classic: '/images/kota-approved-menu.png#classic',
  'cheese-boy': '/images/kota-approved-menu.png#cheese-boy',
  russian: '/images/kota-approved-menu.png#russian',
  breakfast: '/images/kota-approved-menu.png#breakfast',
  beast: '/images/kota-approved-menu.png#beast',
  chicken: '/images/kota-approved-menu.png#chicken',
};
export const products: Product[] = [
  ...kota.map(([id, name, description, price]) => ({
    id,
    name,
    description,
    price,
    till: 'stall' as const,
    image: kotaImages[id],
    photoNote: 'Approved menu artwork. Check the included ingredients and selected extras below.',
    included:
      id === 'russian'
        ? ['Chips', 'Russian', 'Cheese', 'Sauce']
        : id === 'cheese-boy'
          ? ['Chips', 'Polony', 'Cheese', 'Sauce']
          : id === 'breakfast'
            ? ['Chips', 'Polony', 'Egg', 'Sauce']
            : ['Chips', id === 'chicken' ? 'Grilled chicken' : 'Polony', 'Sauce'],
  })),
  ...researchedProducts,
];
export const stops = [
  { till: 'stall' as const, name: 'Kasi Kota stall', address: '1140 Mamelodi West, Pretoria' },
  {
    till: 'spaza' as const,
    name: 'Mamelodi Corner Spaza',
    address: '1141 Mamelodi West, Pretoria',
  },
  { till: 'tavern' as const, name: 'Sbu’s place', address: '1143 Mamelodi West, Pretoria' },
];
