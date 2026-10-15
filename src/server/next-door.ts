import { researchedProducts } from '../data/researched-products';
export const nextDoorProducts = [
  ['spaza', 'Coke 2L', 'Sprite 2L'], ['spaza', 'Sprite 2L', 'Fanta Orange 2L'],
  ['spaza', 'Fanta Orange 2L', 'Coke 2L'], ['spaza', 'Stoney 2L', 'Coke 2L'],
  ['spaza', 'Grand-Pa', 'Disprin'], ['spaza', 'Disprin', 'Grand-Pa'],
  ['spaza', 'bread', ''], ['spaza', 'milk 1L', ''],
  ['tavern', 'still water', ''], ['tavern', 'Savanna Dry', "Hunter's Dry"],
  ['tavern', "Hunter's Dry", 'Savanna Dry'], ['tavern', 'Castle Lager', 'Black Label'],
  ['tavern', 'Black Label', 'Castle Lager'], ['tavern', 'Castle Lite', 'Castle Lager'],
  ['tavern', 'Heineken', 'Castle Lite'],
] as const;
const launchSpaza = new Set(['coke-2l', 'sprite-2l', 'fanta-2l', 'stoney-2l', 'milk', 'bread', 'eggs-six', 'sugar', 'disprin', 'compral']);
export const packagedProducts = researchedProducts.filter(item => item.till === 'tavern' || launchSpaza.has(item.id)).map(({name, image, till, alcohol}) => ({name, image, shop: till, alcohol}));
export const productImage = (name: string) => researchedProducts.find(item => item.name === name)?.image;
export const isAlcoholName = (name: string) => packagedProducts.some(item => item.name === name && item.alcohol) || nextDoorProducts.some(([shop, product]) => shop === 'tavern' && product !== 'still water' && product === name);
