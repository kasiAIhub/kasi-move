import type { GateItem } from './contracts';
export const originalKotas = [['classic', 'Kasi Classic'], ['cheese-boy', 'Cheese Boy'], ['russian', 'Russian Special'], ['breakfast', 'Breakfast Kota'], ['beast', 'The Beast'], ['chicken', 'Chicken Kasi']] as const;
const aliases: Record<string, string> = { Russian: 'russian', Cheese: 'cheese-boy', Breakfast: 'breakfast', Chicken: 'chicken', ...Object.fromEntries(originalKotas.map(([key, name]) => [name, key])) };
// Vendors add their own food photos only: no pre-made image is ever supplied.
export function kotaImage(item: GateItem) { return item.image || undefined; }
