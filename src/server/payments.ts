import { ONBOARDING_CENTS } from './plan';
export async function verifyYoco(request: Request, body: string, secret: string, now: number): Promise<boolean> {
  const id = request.headers.get('webhook-id'), timestamp = request.headers.get('webhook-timestamp');
  if (!id || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 180 || !secret.startsWith('whsec_')) return false;
  try {
    const bytes = Uint8Array.from(atob(secret.slice(6)), character => character.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const content = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
    for (const entry of (request.headers.get('webhook-signature') ?? '').split(' ')) {
      if (!entry.startsWith('v1,')) continue;
      const signature = Uint8Array.from(atob(entry.slice(3)), character => character.charCodeAt(0));
      if (await crypto.subtle.verify('HMAC', key, signature, content)) return true;
    }
  } catch { /* Malformed signatures are not trusted. */ }
  return false;
}
export async function createCheckout(secret: string, stallId: string, origin: string) {
  const response = await fetch('https://payments.yoco.com/api/checkouts', {
    method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: ONBOARDING_CENTS, currency: 'ZAR', metadata: { stallId }, successUrl: `${origin}/owner/keep`, cancelUrl: `${origin}/owner/keep`, failureUrl: `${origin}/owner/keep` }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Could not open payment. Please try again.');
  const result = await response.json() as { id: string; redirectUrl: string; amount: number; currency: string; processingMode: string };
  if (!result.id || !/^https:\/\/[^/]+\.yoco\.com\//.test(result.redirectUrl) || result.amount !== ONBOARDING_CENTS || result.currency !== 'ZAR' || result.processingMode !== 'live') throw new Error('Live payments are not connected yet.');
  return result;
}
