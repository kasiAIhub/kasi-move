import type { Database } from './database';
const encoder = new TextEncoder();
export const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), v => v.toString(16).padStart(2, '0')).join('');
async function key(secret: string) { return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']); }
const hex = (bytes: Uint8Array) => Array.from(bytes, v => v.toString(16).padStart(2, '0')).join('');
const bytes = (value: string) => Uint8Array.from(value.match(/../g)!, part => parseInt(part, 16));
export async function requestCode(db: Database, phone: string, now: number) {
  // Zero expiry denotes a waiting request, never a usable code.
  await db.prepare("INSERT INTO login_codes(phone,proof,cipher,expires_at) VALUES (?,'','',0) ON CONFLICT(phone) DO UPDATE SET proof='',cipher='',expires_at=0 WHERE login_codes.expires_at<=?").bind(phone, now).run();
}
export async function makeCode(db: Database, phone: string, secret: string, now: number) {
  // Rejection sampling avoids a modulo bias in the four-digit code.
  let value: number; do { value = crypto.getRandomValues(new Uint16Array(1))[0]; } while (value >= 60000);
  const code = String(value % 10000).padStart(4, '0');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), encoder.encode(code));
  await db.prepare('INSERT INTO login_codes(phone,proof,cipher,expires_at) VALUES (?,?,?,?) ON CONFLICT(phone) DO UPDATE SET proof=excluded.proof,cipher=excluded.cipher,expires_at=excluded.expires_at')
    .bind(phone, await digest(`${phone}:${code}:${secret}`), `${hex(iv)}:${hex(new Uint8Array(encrypted))}`, now + 600000).run();
}
export async function consumeCode(db: Database, phone: string, code: string, secret: string, now: number) {
  return Boolean(await db.prepare('DELETE FROM login_codes WHERE phone=? AND proof=? AND expires_at>? RETURNING phone').bind(phone, await digest(`${phone}:${code}:${secret}`), now).first());
}
export async function pendingCodes(db: Database, secret: string, now: number) {
  const rows = (await db.prepare('SELECT phone,cipher,expires_at FROM login_codes').all<{phone: string; cipher: string; expires_at: number}>()).results;
  return Promise.all(rows.map(async row => {
    if (row.expires_at <= now) return { phone: row.phone, expiresAt: row.expires_at, code: null };
    const [iv, cipher] = row.cipher.split(':');
    try { return { phone: row.phone, expiresAt: row.expires_at, code: new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, await key(secret), bytes(cipher))) }; }
    catch { return { phone: row.phone, expiresAt: row.expires_at, code: null }; }
  }));
}

export async function sealCode(code:string,secret:string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),encoder.encode(code));
  return hex(iv)+':'+hex(new Uint8Array(encrypted));
}
export async function openCode(cipher:string,secret:string) {
  const [iv,data]=cipher.split(':');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv)},await key(secret),bytes(data)));
}
