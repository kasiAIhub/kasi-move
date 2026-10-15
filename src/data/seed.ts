import type { AppState, Extra, Line, Order, Product } from '../types';
import { defaultAddress, sowetoAddress, extras, products } from './catalogue';
export function makeLine(product: Product, selected: Extra[] = [], quantity = 1): Line {
  return {
    key: `${product.id}:${selected
      .map((e) => e.id)
      .sort()
      .join(',')}`,
    productId: product.id,
    merchantId: product.merchantId,
    name: product.name,
    till: product.till,
    basePrice: product.price,
    extras: selected,
    quantity,
    image: product.image,
  };
}
export function makeOrder(id: number, lines: Line[], address = defaultAddress): Order {
  const createdAt = new Date().toISOString();
  return {
    id,
    createdAt,
    lines: structuredClone(lines),
    address: { ...address },
    payment: 'Card',
    status: 'kitchen_new',
    kitchen: 'new',
    spaza: lines.some((l) => l.till === 'spaza') ? 'packing' : 'none',
    tavern: lines.some((l) => l.till === 'tavern') ? 'packing' : 'none',
    rider: 'offered',
    collected: [],
    history: [
      { status: 'draft', at: createdAt },
      { status: 'paid', at: createdAt },
      { status: 'kitchen_new', at: createdAt },
    ],
  };
}
export const demoLines = () => [
  makeLine(
    products.find((p) => p.id === 'russian')!,
    [extras[0]],
  ),
  makeLine({
    ...products.find((p) => p.id === 'milk')!,
    name: 'Full cream milk 1L bottle',
    price: 22,
  }),
  makeLine({
    id: 'coke',
    name: 'Coca-Cola 500ml',
    price: 15,
    till: 'tavern',
    description: 'Historical ticket item',
    image: '/images/drinks.png',
  }),
];
export const currentDemoLines = () => [
  makeLine(
    products.find((p) => p.id === 'russian')!,
    [extras[0]],
  ),
  makeLine(products.find((p) => p.id === 'milk')!),
  makeLine(products.find((p) => p.id === 'water')!),
];
export function seedState(): AppState {
  const tickets = ['Sive', 'Luthando', 'Akhona'].map((name, i) => {
    const order = makeOrder(1045 + i, [makeLine(products[i])], { ...defaultAddress, name });
    order.createdAt = new Date(Date.now() - (10 - i * 2) * 60000).toISOString();
    if (i === 1) {
      order.kitchen = 'preparing';
      order.status = 'kitchen_preparing';
    }
    return order;
  });
  return {
    version: 1,
    role: 'customer',
    cart: [],
    address: { ...defaultAddress },
    savedAddresses: [{ ...defaultAddress }, { ...sowetoAddress }],
    orders: [makeOrder(1048, demoLines()), ...tickets.reverse()],
    availability: Object.fromEntries(products.map((p) => [p.id, true])),
    nextId: 1049,
  };
}
