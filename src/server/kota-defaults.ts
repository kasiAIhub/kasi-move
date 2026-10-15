import type { GateItem } from './contracts';
export const originalKotas = [['classic', 'Kasi Classic'], ['cheese-boy', 'Cheese Boy'], ['russian', 'Russian Special'], ['breakfast', 'Breakfast Kota'], ['beast', 'The Beast'], ['chicken', 'Chicken Kasi']] as const;
const aliases: Record<string, string> = { Russian: 'russian', Cheese: 'cheese-boy', Breakfast: 'breakfast', Chicken: 'chicken', ...Object.fromEntries(originalKotas.map(([key, name]) => [name, key])) };
export function kotaImage(item: GateItem) { const key = aliases[item.name] || originalKotas.find(([key]) => item.id.endsWith('-' + key))?.[0]; return item.image || (item.shop === 'stall' && key ? '/images/kota-approved-menu.png#' + key : undefined); }
