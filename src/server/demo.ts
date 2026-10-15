/** The permanent demo stall. The number is reserved and fake; the code is a deployment secret, never in the repo. */
export const DEMO_PHONE = '+27820000000';
export const DEMO_YEARS_MS = 10 * 365 * 86400000;
export function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
