import { compare, hash } from 'bcryptjs';
const dummyHash = '$2b$12$ELwBmdp1wG5bds7XSusH6OFxkwLISo1Nyx.JSS9G2bGT4MC99L/LO';
export function validPassword(value: unknown): value is string {
  return typeof value==='string' && value.length>=15 && new TextEncoder().encode(value).length<=72;
}
export const passwordHash = (value: string) => hash(value, 12);
export async function passwordMatches(value: unknown, saved?: string) {
  if(typeof value!=='string'||new TextEncoder().encode(value).length>72)return false;
  const matches=await compare(value,saved||dummyHash);
  return Boolean(saved && matches);
}
