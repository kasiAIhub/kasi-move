import {referralReport} from './referrals';
import {DEMO_PHONE,DEMO_YEARS_MS,sameSecret} from './demo';
import {teamAccess,type Member} from './team-access';
import {orderNotice} from './notifications';
import {invitationPhone} from './invite-input';
import { customerMemory } from './customer-memory';
import type { MetaMessaging } from './meta-whatsapp';
import { originalKotas, kotaImage } from './kota-defaults';
import type { Database, StallRow } from './database';
import type { GateItem, GateOrder, OrderLine } from './contracts';
import { orderMoney } from './contracts';
import type { WhatsApp } from './whatsapp';
import type { StallSettings } from './settings';
import { hoursRange, nextOpen, scheduleOpen } from './hours';
import { requestCode, makeCode, consumeCode, pendingCodes, digest } from './private-admin';
import { isAlcoholName, productImage } from './next-door';
import { verifyYoco } from './payments';
import { stallPlan, nextMonth, ONBOARDING_CENTS } from './plan';

interface Session { hash: string; role: 'vendor' | 'customer' | 'rider' | 'assistant'; stall_id: string | null; phone: string | null }
interface OrderRow { id: string; stall_id: string; customer_hash: string; body: string; version: number }
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, message: string): never { throw new ApiError(status, message); }
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
});
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
async function codeHash(code: string, salt: string) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, material, 256);
  return Array.from(new Uint8Array(bits), v => v.toString(16).padStart(2, '0')).join('');
}
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), value => value.toString(16).padStart(2, '0')).join('');
const dateZA = (time: number) => new Date(time + 7200000).toISOString().slice(0, 10);
function phone(value: unknown): string {
  const raw = String(value ?? '').replace(/[\s()-]/g, '');
  const canonical = /^0\d{9}$/.test(raw) ? `+27${raw.slice(1)}` : raw;
  if (!/^\+27\d{9}$/.test(canonical)) fail(400, 'Enter a South African WhatsApp number.');
  return canonical;
}
function text(value: unknown, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, 'Check the required fields.');
  return value.trim();
}
function cents(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1000000) fail(400, 'Enter a valid price.');
  return value as number;
}
function checkedExtras(value: unknown): NonNullable<GateItem['extras']> {
  if(!Array.isArray(value)||value.length>15) fail(400,'Choose up to 15 extras.');
  const ids=new Set<string>();
  return value.map(row=>{if(!row||typeof row!=='object')fail(400,'Check your extras.');const id=text(row.id);if(ids.has(id))fail(400,'Choose each extra once.');ids.add(id);return {id,name:text(row.name),priceCents:cents(row.priceCents)};});
}
function editableSettings(settings: StallSettings) { const patch={...settings}; delete patch.billing; delete patch.riderFeeCents; return JSON.stringify(patch); }
function activeSpecial(settings: StallSettings, now: number) { const s = settings.special; return s && s.from <= now && now < s.to ? { text: s.text, from: s.from, to: s.to } : null; }
function accepting(stall: StallRow, now: number) {
  const settings: StallSettings = JSON.parse(stall.settings);
  const open = settings.overrideUntil && now < settings.overrideUntil ? settings.overrideOpen : scheduleOpen(stall.hours, now);
  return Boolean(stall.is_open && open && stallPlan(stall, now).active);
}

/** All product reads and writes are scoped on the server. No client-selected role is trusted. */
export interface ApiOptions {
  meta?: MetaMessaging;
  yocoKey?: string;
  yocoWebhookSecret?: string;
  supportPhone?: string;
  cashSendNumber?: string;
  bankDetails?: string;
  manualCodes?: boolean;
  paymentUrl?: string;
  paymentInstructions?: string;
  activationKey?: string;
  demoCode?: string;
  alcoholTesting?: boolean;
  deletePhotos?: (stallId: string) => Promise<void>;
  upload?: (key: string, bytes: ArrayBuffer, contentType: string) => Promise<void>;
}
export function createApi(db: Database, messaging: WhatsApp, now: () => number = Date.now, options: ApiOptions = {}) {
  // Links in messages point at the address the app is being used on (the test address now, move.kasiaihub.com after cutover).
  let appOrigin='https://move.kasiaihub.com';
  const access=teamAccess(db,options.activationKey||'',()=>appOrigin);
  const demoStall=async(stallId:string)=>Boolean(await db.prepare('SELECT id FROM stalls WHERE id=? AND phone=?').bind(stallId,DEMO_PHONE).first());
  async function driverNotice(order:GateOrder,kind:'assignment'|'ready') {
    const member=await db.prepare("SELECT * FROM team_members WHERE stall_id=? AND phone=? AND role='rider' AND active=1").bind(order.stallId,order.riderPhone).first<Member>();
    if(!member||await demoStall(order.stallId))return;
    const notice=orderNotice('assignment',order,(await stall(order.stallId)).name);
    notice.parameters[9]=await access.link(member,order.id);
    await options.meta?.queue(kind,member.phone,order.driverAlertId!,notice);
  }
  // Every new stall starts with the six standard kota names, unpriced and without pictures: the vendor prices, renames or removes them and adds their own.
  const starterMenu=(ownerId:string,shopName:string)=>originalKotas.map(([key, name]) => db.prepare('INSERT INTO menu(id,stall_id,body) VALUES (?,?,?)')
    .bind(`${ownerId}-${key}`, ownerId, JSON.stringify({ id: `${ownerId}-${key}`, name, priceCents: null, shop: 'stall', shopName, enabled: true, extras: [{ id: 'egg', name: 'Extra egg', priceCents: 1000 }, { id: 'cheese', name: 'Extra cheese', priceCents: 800 }, { id: 'atchar', name: 'Atchar', priceCents: 500 }] })));
  async function resetDemoStall(){
    const target=await db.prepare('SELECT id FROM stalls WHERE phone=?').bind(DEMO_PHONE).first<{id:string}>();
    if(!target)return;
    await options.deletePhotos?.(target.id);
    await db.batch([
      db.prepare("DELETE FROM whatsapp_outbox WHERE json_extract(payload,'$.orderId') IN (SELECT id FROM gate_orders WHERE stall_id=?)").bind(target.id),
      ...['team_access','photo_edits','referral_awards','vendor_passwords','gate_orders','menu','order_counters','rider_invites','team_members','activation_checkouts','sessions'].map(table=>db.prepare('DELETE FROM '+table+' WHERE stall_id=?').bind(target.id)),
      db.prepare('DELETE FROM login_codes WHERE phone=?').bind(DEMO_PHONE),
      db.prepare('DELETE FROM stalls WHERE id=? AND phone=?').bind(target.id,DEMO_PHONE),
    ]);
  }
  async function seedDemoStall(id:string){
    // The demo opens like a brand-new stall: no name, no prices, setup from step 3. Only the billing/open overrides are set so the finished demo can take orders.
    const at=now(),settings={createdAt:at,setupStep:3,hoursPreset:'Day and night',overrideOpen:true,overrideUntil:at+DEMO_YEARS_MS,billing:{paidThrough:at+DEMO_YEARS_MS,payments:[]}};
    await db.prepare("UPDATE stalls SET activated_at=?,is_open=1,settings=json_patch(settings,?) WHERE id=?").bind(at,JSON.stringify(settings),id).run();
  }
  async function decorate(order:GateOrder){
    if(order.driverAlertId){const row=await db.prepare("SELECT status FROM whatsapp_outbox WHERE reference=? AND kind IN ('assignment','ready') ORDER BY created_at DESC LIMIT 1").bind(order.driverAlertId).first<{status:string}>();order.driverAlertStatus=row?.status||'not_configured';}
    return order;
  }
  async function connectorNotice(stallId:string){
    if(await db.prepare("SELECT id FROM whatsapp_outbox WHERE kind='connector' AND reference=?").bind(stallId).first())return;
    const award=await db.prepare('SELECT a.*,c.phone FROM referral_awards a JOIN connector_contacts c ON c.key=a.connector_key WHERE a.stall_id=?').bind(stallId).first<{connector_key:string;vendor_name:string;phone:string}>();
    if(!award||await demoStall(stallId))return;
    const total=await db.prepare('SELECT sum(amount_cents) AS total FROM referral_awards WHERE connector_key=?').bind(award.connector_key).first<{total:number}>();
    await options.meta?.queue('connector',award.phone,stallId,{parameters:[award.vendor_name||'Your referred stall',((total?.total||7500)/100).toFixed(2)]});
  }
  const memory=customerMemory(db,options.activationKey||'',options.meta,now);
  function available(item: GateItem, record: StallRow) {
    const settings: StallSettings = JSON.parse(record.settings);
    return (item.shop !== 'tavern' && !item.alcohol && !isAlcoholName(item.name)) && item.enabled && item.priceCents !== null && item.soldOutDate !== dateZA(now()) &&
      (item.shop === 'stall' || settings.neighbours?.some(shop => shop.type === item.shop && shop.enabled));
  }
  async function limit(key: string, maximum: number, duration: number) {
    const result = await db.prepare(`INSERT INTO request_limits(key,count,resets_at) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN resets_at<=? THEN 1 ELSE count+1 END,
      resets_at=CASE WHEN resets_at<=? THEN excluded.resets_at ELSE resets_at END RETURNING count`)
      .bind(key, now() + duration, now(), now()).first<{ count: number }>();
    if (!result || result.count > maximum) fail(429, 'Please wait before trying again.');
  }
  async function newSession(role: Session['role'], stallId: string | null = null, number: string | null = null) {
    const secret = token();
    await db.prepare('INSERT INTO sessions(hash,role,stall_id,phone,expires_at) VALUES (?,?,?,?,?)')
      .bind(await hash(secret), role, stallId, number, now() + 30 * 86400000).run();
    return `kk_session=${secret}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`;
  }
  async function readSession(request: Request, cookieName = 'kk_session'): Promise<Session> {
    const secret = request.headers.get('cookie')?.match(new RegExp('(?:^|;\\s*)' + cookieName + '=([a-f0-9]{64})(?:;|$)'))?.[1];
    if (!secret) return fail(401, 'Please sign in.');
    const session = await db.prepare('SELECT hash,role,stall_id,phone FROM sessions WHERE hash=? AND expires_at>?')
      .bind(await hash(secret), now()).first<Session>();
    if (!session) return fail(401, 'Please sign in again.');
    if (session.role === 'rider' || session.role === 'assistant') {
      const member = await db.prepare('SELECT active FROM team_members WHERE stall_id=? AND phone=? AND role=?').bind(session.stall_id,session.phone,session.role).first<{active:number}>();
      const legacy = !member && session.role === 'rider' && await db.prepare('SELECT id FROM stalls WHERE id=? AND rider_phone=?').bind(session.stall_id,session.phone).first();
      if (!member?.active && !legacy) fail(403,'Your team access is no longer active. Ask the owner for a new invitation.');
    }
    return session;
  }
  async function stall(id: string): Promise<StallRow> {
    return await db.prepare('SELECT * FROM stalls WHERE id=?').bind(id).first<StallRow>() ?? fail(404, 'Stall not found.');
  }
  async function menu(stallId: string): Promise<GateItem[]> {
    return (await db.prepare('SELECT body FROM menu WHERE stall_id=? ORDER BY rowid').bind(stallId).all<{ body: string }>()).results.map(row => { const item: GateItem = JSON.parse(row.body); return { ...item, alcohol: item.alcohol || isAlcoholName(item.name), alternative: undefined, image: item.shop === 'stall' ? kotaImage(item) : productImage(item.name) || item.image }; });
  }
  async function body(request: Request): Promise<Record<string, unknown>> {
    const raw = await request.text();
    if (raw.length > 32768) fail(413, 'That request is too large.');
    try { const result = JSON.parse(raw); if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); return result; }
    catch { return fail(400, 'Check the submitted details.'); }
  }
  return async function fetchApi(request: Request): Promise<Response> {
    try { const origin = new URL(request.url).origin; if (/^https:\/\//.test(origin)) appOrigin = origin; } catch { /* keep default */ }
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/payments/yoco' && request.method === 'POST') {
        const raw = await request.text(); if (raw.length > 32768) fail(413, 'Request too large.');
        if (!options.yocoWebhookSecret || !await verifyYoco(request, raw, options.yocoWebhookSecret, now())) fail(403, 'Access denied.');
        const event = JSON.parse(raw), payment = event.payload;
        if (event.type !== 'payment.succeeded') return json({ received: true });
        if (payment?.mode !== 'live' || payment.status !== 'succeeded' || payment.amount !== ONBOARDING_CENTS || payment.currency !== 'ZAR') fail(400, 'Payment did not match.');
        const checkout = await db.prepare('SELECT stall_id FROM activation_checkouts WHERE id=?').bind(payment.metadata?.checkoutId ?? '').first<{stall_id: string}>();
        if (!checkout) fail(404, 'Payment reference not found.');
        if (await demoStall(checkout.stall_id)) return json({ received: true });
        await db.batch([
          db.prepare('UPDATE activation_checkouts SET paid_at=COALESCE(paid_at,?) WHERE id=?').bind(now(), payment.metadata.checkoutId),
          db.prepare('UPDATE stalls SET activated_at=COALESCE(activated_at,?) WHERE id=?').bind(now(), checkout.stall_id),
        ]);
        return json({ received: true });
      }
      if (path === '/whatsapp/webhook' && options.meta) return options.meta.webhook(request);
      if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) fail(403, 'Open this page from the stall link.');
      if (path === '/health' && request.method === 'GET') {
        await db.prepare('SELECT count(*) AS count FROM stalls').first();
        return json({ database: 'ready' });
      }
      if (path === '/config' && request.method === 'GET') return json({ alcoholTesting: false, supportPhone: options.supportPhone || '', cashSendNumber: options.cashSendNumber || '', bankDetails: options.bankDetails || '' });
      if (path === '/admin/login' && request.method === 'POST') {
        await limit(`admin:${request.headers.get('CF-Connecting-IP') ?? 'local'}`, 5, 600000);
        const input = await body(request);
        const keyOk = Boolean(options.activationKey) && options.activationKey!.length >= 32 && typeof input.key === 'string' && await digest(input.key) === await digest(options.activationKey!);
        let codeOk = false;
        if (!keyOk && typeof input.code === 'string' && options.activationKey) {
          await limit('admin-code-all', 30, 3600000);
          const saved = await db.prepare("SELECT salt,hash FROM admin_code WHERE id='admin'").first<{ salt: string; hash: string }>();
          codeOk = Boolean(saved) && sameSecret(await codeHash(input.code, saved!.salt), saved!.hash);
        }
        if (!keyOk && !codeOk) fail(403, 'Access denied.');
        const remember = input.remember === true, secret = token();
        await db.prepare('INSERT INTO sessions(hash,role,expires_at) VALUES (?,?,?)').bind(await hash(secret), 'admin', now() + (remember ? 30 * 86400000 : 3600000)).run();
        return json({ signedIn: true }, 200, { 'Set-Cookie': `kk_admin=${secret}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${remember ? 2592000 : 3600}` });
      }
      if (path.startsWith('/admin')) {
        const secret = request.headers.get('cookie')?.match(/(?:^|;\s*)kk_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
        if (!options.activationKey || !secret || !await db.prepare("SELECT hash FROM sessions WHERE hash=? AND role='admin' AND expires_at>?").bind(await hash(secret), now()).first()) fail(401, 'Sign in to open your login requests.');
        if (path === '/admin/remember' && request.method === 'POST') {
          await db.prepare("UPDATE sessions SET expires_at=? WHERE hash=? AND role='admin'").bind(now() + 30 * 86400000, await hash(secret)).run();
          return json({ remembered: true }, 200, { 'Set-Cookie': `kk_admin=${secret}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=2592000` });
        }
        if (path === '/admin/logout' && request.method === 'POST') {
          await db.prepare("DELETE FROM sessions WHERE hash=? AND role='admin'").bind(await hash(secret)).run();
          return json({ signedOut: true }, 200, { 'Set-Cookie': 'kk_admin=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0' });
        }
        if (path === '/admin/code/set' && request.method === 'POST') {
          await limit('admin-code-set', 10, 3600000);
          const input = await body(request), next = typeof input.code === 'string' ? input.code.trim() : '';
          if (next.length < 6 || next.length > 64) fail(400, 'Use at least 6 characters for your admin code.');
          const saved = await db.prepare("SELECT salt,hash FROM admin_code WHERE id='admin'").first<{ salt: string; hash: string }>();
          if (saved) {
            const currentOk = typeof input.current === 'string' && sameSecret(await codeHash(input.current, saved.salt), saved.hash);
            const keyOk = Boolean(options.activationKey) && typeof input.key === 'string' && await digest(input.key) === await digest(options.activationKey!);
            if (!currentOk && !keyOk) fail(403, 'Enter your current admin code, or the long admin key, to change it.');
          }
          const salt = token();
          await db.prepare("INSERT INTO admin_code(id,salt,hash,updated_at) VALUES ('admin',?,?,?) ON CONFLICT(id) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,updated_at=excluded.updated_at").bind(salt, await codeHash(next, salt), now()).run();
          return json({ saved: true });
        }
        if (path === '/admin/vendor' && (request.method === 'POST' || request.method === 'PUT')) {
          const input = await body(request), name = text(input.name), town = text(input.town), hours = text(input.hours);
          if (!name || !town) fail(400, 'Add a stall name and town.');
          if (!hoursRange(hours)) fail(400, 'Use hours like 08:00–21:00.');
          if (request.method === 'POST') {
            const number = phone(input.phone);
            if (number === DEMO_PHONE) fail(409, 'That number is reserved for the demo stall.');
            if (await db.prepare('SELECT id FROM stalls WHERE phone=?').bind(number).first()) fail(409, 'A stall already uses this number.');
            const id = crypto.randomUUID();
            await db.prepare('INSERT INTO stalls(id,phone,name,town,hours,referral_name) VALUES (?,?,?,?,?,?)').bind(id, number, name, town, hours, '').run();
            await db.prepare('UPDATE stalls SET settings=json_patch(settings,?) WHERE id=?').bind(JSON.stringify({ createdAt: now() }), id).run();
            await db.batch(starterMenu(id, name));
            return json({ created: true, stallId: id });
          }
          const target = await stall(text(input.stallId));
          if (target.phone === DEMO_PHONE) fail(409, 'The demo stall resets on every sign-in.');
          await db.prepare('UPDATE stalls SET name=?,town=?,hours=? WHERE id=?').bind(name, town, hours, target.id).run();
          return json({ saved: true });
        }
        if (path === '/admin' && request.method === 'GET') return json({ adminCodeSet: Boolean(await db.prepare("SELECT id FROM admin_code WHERE id='admin'").first()), referrals:await referralReport(db), whatsapp: options.meta ? await options.meta.overview() : null, stalls: (await db.prepare('SELECT id,phone,name,town,hours,referral_name,first_order_at,activated_at,payment_reported_at,settings FROM stalls WHERE phone<>?').bind(DEMO_PHONE).all()).results, codes: await pendingCodes(db, options.activationKey, now()) });
        if(path==='/admin/connectors/contact'&&request.method==='POST'){
          const input=await body(request),name=text(input.name),key=name.toLowerCase().replace(/[ \t]/g,''),number=invitationPhone(text(input.phone));
          if(input.verified!==true)fail(400,'Confirm this is the Connector’s WhatsApp number and they agreed to receive earnings updates.');
          await db.prepare('INSERT INTO connector_contacts(key,name,phone,verified_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name,phone=excluded.phone,verified_at=excluded.verified_at').bind(key,name,number,now()).run();
          return json({saved:true});
        }
        if(path==='/admin/connectors/notify'&&request.method==='POST'){
          const input=await body(request);await connectorNotice(text(input.stallId));return json({queued:true});
        }
        if(path==='/admin/photos'&&request.method==='GET'){
          const owner=await stall(text(url.searchParams.get('stallId')));
          return json({stallName:owner.name,menu:(await menu(owner.id)).filter(item=>item.shop==='stall'),edits:(await db.prepare('SELECT * FROM photo_edits WHERE stall_id=? ORDER BY created_at DESC,rowid DESC').bind(owner.id).all()).results});
        }
        const photoAction=path.match(/^\/admin\/photos\/([^/]+)\/(polish|restore)$/);
        if(photoAction&&request.method==='POST'){
          const stallId=text(url.searchParams.get('stallId')),row=await db.prepare('SELECT body FROM menu WHERE id=? AND stall_id=?').bind(photoAction[1],stallId).first<{body:string}>();
          if(!row)fail(404,'Menu item not found.');const item:GateItem=JSON.parse(row.body);
          if(item.image!==url.searchParams.get('expected'))fail(409,'The vendor changed this photo. Refresh before editing.');
          const first=await db.prepare('SELECT original FROM photo_edits WHERE item_id=? AND stall_id=? AND image=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(item.id,stallId,item.image).first<{original:string}>();
          if(photoAction[2]==='restore'){
            if(!first)fail(400,'No original photo to restore.');item.image=first.original;
          }else{
            if(!options.upload||!item.image?.startsWith('/photos/'+stallId+'/'))fail(400,'Polish vendor-uploaded food photos only. The original artwork stays unchanged.');
            const type=request.headers.get('content-type')||'',bytes=await request.arrayBuffer();
            if(!['image/jpeg','image/png','image/webp'].includes(type)||!bytes.byteLength||bytes.byteLength>5*1024*1024)fail(400,'Choose a photo smaller than 5 MB.');
            const original=item.image,key=stallId+'/polished/'+crypto.randomUUID();await options.upload(key,bytes,type);item.image='/photos/'+key;
            const saved=await db.batch([
              db.prepare('INSERT INTO photo_edits(id,stall_id,item_id,original,image,settings,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM menu WHERE id=? AND body=?)').bind(crypto.randomUUID(),stallId,item.id,first?.original||original,item.image,JSON.stringify({method:'basic-v1',brightness:1.04,contrast:1.04,sharpen:.12,crop:'square-centre',aiConsent:false}),now(),item.id,row.body),
              db.prepare('UPDATE menu SET body=? WHERE id=? AND stall_id=? AND body=?').bind(JSON.stringify(item),item.id,stallId,row.body),
            ]);if(!(saved[1] as {meta:{changes:number}}).meta.changes)fail(409,'The vendor changed this photo. Refresh first.');
            return json({saved:true,image:item.image});
          }
          const saved=await db.prepare('UPDATE menu SET body=? WHERE id=? AND stall_id=? AND body=?').bind(JSON.stringify(item),item.id,stallId,row.body).run();if(!saved.meta.changes)fail(409,'The menu changed. Refresh first.');return json({saved:true,image:item.image});
        }
        if(path==='/admin/referrals/paid'&&request.method==='POST'){
          const input=await body(request),stallId=text(input.stallId),reference=text(input.reference,100);
          const saved=await db.prepare('UPDATE referral_awards SET paid_at=?,payout_reference=? WHERE stall_id=? AND paid_at IS NULL').bind(now(),reference,stallId).run();
          if(!saved.meta.changes)fail(409,'This referral payout was already recorded or is not eligible. Refresh the list.');
          return json({paid:true});
        }
        if (path === '/admin/whatsapp/retry' && request.method === 'POST') {
          const input = await body(request);
          await limit('meta-retry:' + String(input.id), 3, 600000);
          await options.meta?.retry(text(input.id, 250));
          return json({ queued: true });
        }
        if ((path === '/admin/reset-stall' || path === '/admin/stall/remove') && request.method === 'POST') {
          const input = await body(request), number = phone(input.phone);
          if (path === '/admin/stall/remove') {
            if (number === DEMO_PHONE) fail(409, 'The demo stall cannot be removed.');
            if (phone(input.confirmPhone) !== number) fail(400, 'Type the vendor number exactly to remove this stall.');
            const record = await db.prepare('SELECT activated_at,settings FROM stalls WHERE phone=?').bind(number).first<{ activated_at: number | null; settings: string }>();
            const paid = Boolean(record && (record.activated_at !== null || (JSON.parse(record.settings).billing?.payments?.length ?? 0) > 0));
            if (paid && input.paidAck !== true) fail(409, 'This vendor has paid. Tick the box to confirm you want to remove a paying vendor.');
          }
          await db.batch([
            db.prepare('DELETE FROM customer_devices WHERE profile_id IN (SELECT id FROM customer_profiles WHERE phone=?)').bind(number),
            db.prepare('DELETE FROM customer_profiles WHERE phone=?').bind(number),
            db.prepare('DELETE FROM customer_challenges WHERE phone=?').bind(number),
          ]);
          if (options.meta) await db.batch([
            db.prepare('DELETE FROM whatsapp_inbox WHERE phone=?').bind(number.slice(1)),
            db.prepare('DELETE FROM whatsapp_outbox WHERE phone=?').bind(number.slice(1)),
          ]);
          const target = await db.prepare('SELECT id FROM stalls WHERE phone=?').bind(number).first<{id: string}>();
          if (!target) {
            await db.batch([
              db.prepare('DELETE FROM login_codes WHERE phone=?').bind(number),
              db.prepare("DELETE FROM sessions WHERE phone=? AND role='vendor'").bind(number),
              db.prepare('DELETE FROM request_limits WHERE key IN (?,?,?)').bind('send:'+number,'verify:'+number,'password:'+number),
            ]);
            return json({cleared:true,phone:number});
          }
          await options.deletePhotos?.(target.id);
          await db.batch([
            db.prepare("DELETE FROM whatsapp_outbox WHERE json_extract(payload,'$.orderId') IN (SELECT id FROM gate_orders WHERE stall_id=?)").bind(target.id),
            ...['team_access','photo_edits','referral_awards','vendor_passwords', 'gate_orders', 'menu', 'order_counters', 'rider_invites', 'team_members', 'activation_checkouts', 'sessions'].map(table => db.prepare('DELETE FROM ' + table + ' WHERE stall_id=?').bind(target.id)),
            db.prepare('DELETE FROM sessions WHERE phone=?').bind(number),
            db.prepare('DELETE FROM login_codes WHERE phone=?').bind(number),
            db.prepare('DELETE FROM request_limits WHERE key IN (?,?,?)').bind('send:' + number, 'verify:' + number, 'password:' + number),
            db.prepare('DELETE FROM stalls WHERE id=? AND phone=?').bind(target.id, number),
          ]);
          return json({ cleared: true, phone: number });
        }
        if (path === '/admin/codes/clear' && request.method === 'POST') {
          const input = await body(request);
          if (input.all === 'stale') return json({ cleared: (await db.prepare('DELETE FROM login_codes WHERE expires_at<=?').bind(now()).run()).meta.changes });
          const number = phone(input.phone);
          return json({ cleared: (await db.prepare('DELETE FROM login_codes WHERE phone=?').bind(number).run()).meta.changes });
        }
        if (path === '/admin/code' && request.method === 'POST') {
          const input = await body(request), number = phone(input.phone);
          if (number===DEMO_PHONE) fail(409,'The demo stall uses its fixed demo code.');
          if (!await db.prepare('SELECT phone FROM login_codes WHERE phone=?').bind(number).first()) fail(404, 'Ask the vendor to request a code first.');
          const current = (await pendingCodes(db, options.activationKey, now())).find(row => row.phone === number);
          if (!current?.code) await makeCode(db, number, options.activationKey, now());
          const fresh = (await pendingCodes(db, options.activationKey, now())).find(row => row.phone === number)!;
          if (!current?.code && options.meta) {
            try { await options.meta.queue('login', number, String(fresh.expiresAt)); }
            catch { console.error('Login code saved, but WhatsApp queue failed. Use manual send.'); }
          }
          return json(fresh);
        }
        if (path === '/admin/paid' && request.method === 'POST') {
          const input = await body(request), owner = await stall(text(input.stallId)), plan = stallPlan(owner,now());
          if(owner.phone===DEMO_PHONE) fail(409,'The demo stall takes no payments.');
          const reference=text(input.reference,100);
          if(input.amountCents!==plan.amountDueCents || !plan.amountDueCents) fail(409,'Check the amount due before confirming payment.');
          const settings:StallSettings=JSON.parse(owner.settings);
          if(settings.billing?.payments.some(payment=>payment.reference===reference)) fail(409,'This payment was already recorded.');
          settings.billing={paidThrough:nextMonth(Math.max(now(),plan.paidThrough??0)),payments:[...(settings.billing?.payments??[]),{at:now(),amountCents:plan.amountDueCents,reference}]};
          const results=await db.batch([
            db.prepare('UPDATE stalls SET activated_at=COALESCE(activated_at,?),settings=?,payment_reported_at=NULL WHERE id=? AND settings=?').bind(now(),JSON.stringify(settings),owner.id,owner.settings),
            db.prepare("INSERT INTO referral_awards(stall_id,connector_key,connector_name,vendor_name,vendor_phone,earned_at,amount_cents) SELECT id,lower(replace(replace(trim(referral_name),' ',''),char(9),'')),trim(referral_name),name,phone,activated_at,7500 FROM stalls WHERE id=? AND activated_at IS NOT NULL AND length(trim(referral_name))>0 ON CONFLICT(stall_id) DO NOTHING").bind(owner.id)
          ]);
          const saved=results[0] as {meta:{changes:number}};
          if(!saved.meta.changes) fail(409,'The account changed. Refresh before confirming.');
          try {await options.meta?.queue('activation',owner.phone,owner.id+':'+settings.billing.paidThrough,{parameters:[owner.name||'your stall',appOrigin+'/kitchen']});}catch{console.error('Payment saved; WhatsApp activation could not be queued.');}
          if((results[1] as {meta:{changes:number}}).meta.changes)try{await connectorNotice(owner.id);}catch{console.error('Referral saved; Connector WhatsApp could not be queued.');}
          return json({ activated: true });
        }
        fail(404, 'Page not found.');
      }
      if ((path === '/auth/customer' || path === '/auth/owner') && request.method === 'POST') {
        const role = path === '/auth/owner' ? 'vendor' : 'customer';
        let current: Session | null = null, saved: Session | null = null;
        try { current = await readSession(request); } catch { /* no active identity */ }
        if (current?.role === role) return json({ role });
        try { saved = await readSession(request, `kk_${role}`); } catch { /* no saved identity */ }
        if (role === 'vendor' && saved?.role !== 'vendor') fail(401, 'Sign in with your owner WhatsApp number to open your kitchen.');
        const cookie = (name: string) => request.headers.get('cookie')?.match(new RegExp('(?:^|;\\s*)' + name + '=([a-f0-9]{64})(?:;|$)'))?.[1];
        const attributes = '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000';
        const response = json({ role }, 200, { 'Set-Cookie': saved?.role === role ? `kk_session=${cookie(`kk_${role}`)}${attributes}` : await newSession('customer') });
        if (current && (current.role === 'vendor' || current.role === 'customer')) response.headers.append('Set-Cookie', `kk_${current.role}=${cookie('kk_session')}${attributes}`);
        return response;
      }
      if (path === '/auth/code' && request.method === 'POST') {
        const input = await body(request), number = phone(input.phone);
        if (number === DEMO_PHONE) { if (!options.demoCode) fail(403, 'This number is reserved.'); return json({ sent: false, queued: false, demo: true, requestedAt: now() }); }
        await limit(`send:${number}`, 3, 600000);
        await limit(`ip:${request.headers.get('CF-Connecting-IP') ?? 'local'}`, 15, 600000);
        if (options.manualCodes && options.activationKey && options.activationKey.length >= 32) {
          await requestCode(db, number, now());
          return json({ sent: false, queued: true, requestedAt: now(), requestLink: options.supportPhone ? 'https://wa.me/' + options.supportPhone.replace(/\D/g, '') + '?text=' + encodeURIComponent('Hi Thandi, let’s open my stall! My Kasi Move login number is ' + number + '. Please send my code to this number.\nOpen this request: '+appOrigin+'/admin?phone=' + encodeURIComponent(number)) : null, message: 'Your request is in Thandi’s admin inbox. She will create your code and arrange WhatsApp delivery. The code expires 10 minutes after she creates it.' });
        }
        await messaging.sendCode(number);
        return json({ sent: true });
      }
      if (path === '/auth/verify' && request.method === 'POST') {
        const input = await body(request), number = phone(input.phone);
        const referralName = typeof input.referral_name === 'string' ? input.referral_name.trim().slice(0,100) : '';
        const demo = number === DEMO_PHONE;
        if (typeof input.code !== 'string' || !(demo ? /^\d{4,8}$/ : /^\d{4}$/).test(input.code)) fail(400, 'Enter the four-digit code.');
        await limit(`verify:${number}`, 5, 600000);
        const verified = demo ? Boolean(options.demoCode) && sameSecret(input.code, options.demoCode!) : options.manualCodes && options.activationKey ? await consumeCode(db, number, input.code, options.activationKey, now()) : await messaging.checkCode(number, input.code);
        if (!verified) fail(401, 'That code is incorrect or has expired.');
        if (input.existing === true && !demo && !await db.prepare('SELECT id FROM stalls WHERE phone=?').bind(number).first()) fail(404, 'There is no stall under this number. Check the number, or open a new stall.');
        if (demo) {
          // Demo sign-in: one database round trip for the whole reset and fresh stall (each trip is slow from South Africa).
          const oldDemo = await db.prepare('SELECT id FROM stalls WHERE phone=?').bind(DEMO_PHONE).first<{id:string}>();
          if (oldDemo) await options.deletePhotos?.(oldDemo.id);
          const id = crypto.randomUUID(), at = now();
          const settings = { createdAt: at, setupStep: 3, hoursPreset: 'Day and night', overrideOpen: true, overrideUntil: at + DEMO_YEARS_MS, billing: { paidThrough: at + DEMO_YEARS_MS, payments: [] } };
          const mine = '(SELECT id FROM stalls WHERE phone=?)';
          await db.batch([
            db.prepare("DELETE FROM whatsapp_outbox WHERE json_extract(payload,'$.orderId') IN (SELECT id FROM gate_orders WHERE stall_id IN "+mine+")").bind(DEMO_PHONE),
            ...['team_access','photo_edits','referral_awards','vendor_passwords','gate_orders','menu','order_counters','rider_invites','team_members','activation_checkouts','sessions'].map(table=>db.prepare('DELETE FROM '+table+' WHERE stall_id IN '+mine).bind(DEMO_PHONE)),
            db.prepare('DELETE FROM login_codes WHERE phone=?').bind(DEMO_PHONE),
            db.prepare('DELETE FROM stalls WHERE phone=?').bind(DEMO_PHONE),
            db.prepare("INSERT INTO stalls(id,phone,referral_name,activated_at,is_open,settings) VALUES (?,?,'',?,1,json_patch('{}',?))").bind(id, DEMO_PHONE, at, JSON.stringify(settings)),
            ...starterMenu(id,'Stall')
          ]);
        }
        const inserted = await db.prepare('INSERT INTO stalls(id,phone,referral_name) VALUES (?,?,?) ON CONFLICT(phone) DO NOTHING').bind(crypto.randomUUID(), number, demo ? '' : referralName).run();
        const owner = (await db.prepare('SELECT * FROM stalls WHERE phone=?').bind(number).first<StallRow>())!;
        if (inserted.meta.changes) {
          await db.prepare('UPDATE stalls SET settings=json_patch(settings,?) WHERE id=?').bind(JSON.stringify({ createdAt: now() }), owner.id).run();
          await db.batch(starterMenu(owner.id, 'Stall'));
        }
        if (demo && inserted.meta.changes) await seedDemoStall(owner.id);
        const [savedOwner, savedMenu, cookie] = await Promise.all([stall(owner.id), menu(owner.id), newSession('vendor', owner.id, number)]);
        return json({ role: 'vendor', stall: savedOwner, owner: { stall: { ...savedOwner, is_open: Number(accepting(savedOwner, now())) }, menu: savedMenu } }, 200, { 'Set-Cookie': cookie });
      }

      if(path==='/auth/team-access'&&request.method==='POST'){
        const input=await body(request),value=text(input.token,64);
        if(!/^[a-f0-9]{64}$/.test(value))fail(401,'Open your private team link.');
        const member=await access.resolve(value);if(!member)fail(403,'This team link is no longer active. Ask the vendor to resend your access.');
        return json({role:member.role,name:member.name},200,{'Set-Cookie':await newSession(member.role,member.stall_id,member.phone)});
      }
      if ((['/auth/rider','/auth/rider-offer','/auth/team','/auth/team-offer'].includes(path)) && request.method === 'POST') {
        const input = await body(request);
        if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) fail(401, 'Ask the vendor for a new delivery link.');
        const inviteHash = await hash(input.token);
        const invite = await db.prepare('SELECT * FROM rider_invites WHERE hash=? AND used_at IS NULL AND expires_at>?').bind(inviteHash, now()).first<{stall_id:string;phone:string;fee_cents:number;name:string;role:'rider'|'assistant'}>();
        if (!invite) {
          // A used invitation never authenticates again. An existing member session may recover its own link.
          let current:Session|null=null;try{current=await readSession(request);}catch{/* no member session */}
          const prior=await db.prepare("SELECT * FROM rider_invites WHERE hash=? AND decision='accepted'").bind(inviteHash).first<{stall_id:string;phone:string;role:string}>();
          if(prior&&current?.stall_id===prior.stall_id&&current.phone===prior.phone&&current.role===prior.role){
            const member=await db.prepare('SELECT * FROM team_members WHERE stall_id=? AND phone=? AND role=? AND active=1').bind(prior.stall_id,prior.phone,prior.role).first<Member>();
            if(member)return json({alreadyAccepted:true,personalLink:await access.link(member),role:member.role});
          }
          fail(401, 'Use your saved personal team link. If you have lost it, ask the vendor to resend it from their team list.');
        }
        const owner = await stall(invite.stall_id);
        if ((path.includes('/auth/rider') ? 'rider' : 'assistant') !== invite.role) fail(403,'Open the invitation link sent to you.');
        if (path.endsWith('-offer')) return json({ stallName: owner.name, feeCents: invite.fee_cents, name:invite.name, role:invite.role });
        if (!['accept','reject'].includes(String(input.decision))) fail(400, 'Accept or decline the offer.');
        if (input.decision === 'reject') {
          const result = await db.prepare("UPDATE rider_invites SET used_at=?,decision='rejected' WHERE hash=? AND used_at IS NULL").bind(now(),inviteHash).run();
          if (!result.meta.changes) fail(409,'This offer was already answered.');
          return json({ accepted:false });
        }
        if(!options.activationKey)fail(503,'Team access is not configured. Please contact the owner.');
        const accepted = await db.batch([
          db.prepare("INSERT INTO team_members(id,stall_id,phone,name,role,active,available,fee_cents,joined_at) SELECT ?,?,?,?,?,1,1,?,? WHERE EXISTS(SELECT 1 FROM rider_invites WHERE hash=? AND used_at IS NULL) ON CONFLICT(stall_id,phone,role) DO UPDATE SET name=excluded.name,active=1,fee_cents=excluded.fee_cents")
            .bind(crypto.randomUUID(),owner.id,invite.phone,invite.name,invite.role,invite.fee_cents,now(),inviteHash),
          db.prepare("UPDATE stalls SET rider_phone=?,settings=json_set(settings,'$.riderFeeCents',?,'$.riderName',?) WHERE id=? AND (rider_phone IS NULL OR rider_phone=?) AND ?='rider' AND EXISTS(SELECT 1 FROM rider_invites WHERE hash=? AND used_at IS NULL)")
            .bind(invite.phone,invite.fee_cents,invite.name,owner.id,invite.phone,invite.role,inviteHash),
          db.prepare("UPDATE rider_invites SET used_at=?,decision='accepted' WHERE hash=? AND used_at IS NULL").bind(now(),inviteHash),
        ]);
        if (!(accepted[2] as {meta:{changes:number}}).meta.changes) fail(409,'This offer was already answered.');
        const member=await db.prepare('SELECT * FROM team_members WHERE stall_id=? AND phone=? AND role=? AND active=1').bind(owner.id,invite.phone,invite.role).first<Member>();
        return json({ role:invite.role, accepted:true, stallId:owner.id,personalLink:await access.link(member!) },200,{'Set-Cookie':await newSession(invite.role,owner.id,invite.phone)});
      }
      const publicMatch = path.match(/^\/stalls\/([^/]+)$/);
      if (publicMatch && request.method === 'GET') {
        const record = await stall(publicMatch[1]);
        const items = await menu(record.id);
        return json({ id: record.id, name: record.name, phone: record.phone, hours: record.hours, alcoholTesting: false,
          open: accepting(record, now()), special: activeSpecial(JSON.parse(record.settings), now()), takesCard: Boolean(record.takes_card), delivery: Boolean(record.rider_phone) && JSON.parse(record.settings).deliveryEnabled!==false,
          menu: items.filter(item => available(item, record)),
          nextDoorDisplay: items.filter(item => item.shop !== 'stall' && available({ ...item, soldOutDate: undefined }, record)),
          kotaDisplay: items.filter(item => item.shop === 'stall' && item.enabled),
        });
      }
      if (path === '/activation/confirm' && request.method === 'POST') fail(410, 'Confirm the current plan payment in private admin.');
      const session = await readSession(request);
      if(path==='/team/link'&&request.method==='POST'){
        const input=await body(request);
        if(!['vendor','rider','assistant'].includes(session.role))fail(403,'Open your team account.');
        const member=await db.prepare('SELECT * FROM team_members WHERE id=? AND stall_id=? AND active=1').bind(text(input.id),session.stall_id).first<Member>();
        if(!member||(session.role!=='vendor'&&(member.role!==session.role||member.phone!==session.phone)))fail(404,'Team member not found.');
        const personalLink=await access.link(member);
        return json({personalLink,link:'https://wa.me/'+member.phone.replace(/\D/g,'')+'?text='+encodeURIComponent('Hi '+member.name+', here is your private Kasi Move '+(member.role==='rider'?'delivery':'shop assistant')+' link. Save it to reopen your screen any time. Do not forward it.\n'+personalLink)});
      }
      if (path === '/events' && request.method === 'GET') {
        let timer: ReturnType<typeof setTimeout> | undefined, ended = false;
        const stream = new ReadableStream({
          start(controller) {
            let previous = '', lastPresence = 0;
            const send = async () => {
              if (ended) return;
              try {
                await readSession(request);
                if (['vendor','assistant'].includes(session.role) && now() - lastPresence > 15000) {
                  await db.prepare('INSERT INTO request_limits(key,count,resets_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET resets_at=excluded.resets_at').bind(`presence:${session.stall_id}`, now() + 30000).run();
                  lastPresence = now();
                }
                const query = session.role === 'customer' ? 'SELECT id,version FROM gate_orders WHERE customer_hash=? ORDER BY id' : 'SELECT id,version FROM gate_orders WHERE stall_id=? ORDER BY id';
                const rows = await db.prepare(query).bind(session.role === 'customer' ? session.hash : session.stall_id).all();
                const current = JSON.stringify(rows.results);
                if (ended) return;
                if (current !== previous) { controller.enqueue(new TextEncoder().encode('event: change\ndata: {}\n\n')); previous = current; }
                else controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
                timer = setTimeout(send, 2500);
              } catch { if (!ended) { ended = true; controller.close(); } }
            };
            void send();
            request.signal.addEventListener('abort', () => { if (!ended) { ended = true; clearTimeout(timer); controller.close(); } }, { once: true });
          },
          cancel() { ended = true; clearTimeout(timer); },
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
      }
      if (path === '/session' && request.method === 'GET') {
        let ownerSession = session.role === 'vendor' ? session : null;
        try { if (!ownerSession) { const saved = await readSession(request, 'kk_vendor'); if (saved.role === 'vendor') ownerSession = saved; } } catch { /* no saved owner */ }
        const owner = ownerSession?.stall_id ? await stall(ownerSession.stall_id) : null;
        return json({ role: session.role, stallId: session.stall_id, ownerAvailable: Boolean(owner), ownerStallId: owner?.id ?? null, ownerSetupComplete: Boolean(owner && JSON.parse(owner.settings).setupStep >= 9), demo: owner?.phone === DEMO_PHONE });
      }
      if(path==='/customer/recover' && request.method==='POST') {
        if(session.role!=='customer')fail(403,'Open customer checkout first.');
        const input=await body(request),number=phone(input.phone);
        await limit('customer-send:'+number,3,600000);
        await limit('customer-send-ip:'+(request.headers.get('CF-Connecting-IP')||'local'),10,600000);
        try{return json(await memory.request(session.hash,number));}catch(error){fail(400,error instanceof Error?error.message:'Verification is unavailable. Enter your details to order.');}
      }
      if(path==='/customer/recover/verify' && request.method==='POST') {
        if(session.role!=='customer')fail(403,'Open customer checkout first.');
        const input=await body(request);
        await limit('customer-check:'+session.hash,5,600000);
        const code=text(input.code,6);if(!/^\d{6}$/.test(code))fail(400,'Enter the six-digit code.');
        try{const saved=await memory.verify(session.hash,text(input.challengeId,100),code);return json({profile:saved?{name:saved.name,phone:saved.phone,gateNote:saved.gate_note}:null});}catch(error){fail(400,error instanceof Error?error.message:'Verification failed.');}
      }
      if(path==='/customer/profile' && request.method==='GET') {
        let customer=session;
        if(customer.role!=='customer'){try{customer=await readSession(request,'kk_customer');}catch{return json({profile:null});}}
        if(customer.role!=='customer')return json({profile:null});
        const saved=await memory.profile(customer.hash);
        if(saved)return json({profile:{name:saved.name,phone:saved.phone,gateNote:saved.gate_note}});
        const rows=(await db.prepare('SELECT body FROM gate_orders WHERE customer_hash=? ORDER BY rowid DESC LIMIT 20').bind(customer.hash).all<{body:string}>()).results;
        const orders:GateOrder[]=rows.map(row=>JSON.parse(row.body)),latest=orders[0];
        return json({profile:latest?{name:latest.customerName,phone:latest.customerPhone,gateNote:orders.find(order=>order.gateNote)?.gateNote??''}:null});
      }
      if (path === '/rider/stall' && request.method === 'GET') {
        if (session.role !== 'rider' || !session.stall_id) fail(403, 'Open your delivery link.');
        const record = await stall(session.stall_id);
        return json({ id: record.id, name: record.name, phone: record.phone, open: accepting(record, now()) });
      }
      if (path === '/auth/logout' && request.method === 'POST') {
        await db.prepare('DELETE FROM sessions WHERE hash=?').bind(session.hash).run();
        for (const name of ['kk_vendor', 'kk_customer']) {
          try { const saved = await readSession(request, name); await db.prepare('DELETE FROM sessions WHERE hash=?').bind(saved.hash).run(); } catch { /* already signed out */ }
        }
        return json({ signedOut: true }, 200, { 'Set-Cookie': 'kk_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
      }
      if (path === '/team' && request.method === 'GET') {
        if (!['vendor','assistant','rider'].includes(session.role) || !session.stall_id) fail(403,'Open your team link.');
        const owner=await stall(session.stall_id);
        const members=(await db.prepare('SELECT id,phone,name,role,available,fee_cents FROM team_members WHERE stall_id=? AND active=1 ORDER BY joined_at,rowid').bind(owner.id).all()).results;
        return json({stallName:owner.name,open:accepting(owner,now()),selfId:(members as Member[]).find(m=>m.phone===session.phone&&m.role===session.role)?.id,members:session.role==='rider'?members.filter((m:any)=>m.phone===session.phone&&m.role==='rider'):members,
          invites:session.role==='vendor'?(await db.prepare('SELECT phone,name,role,fee_cents,decision,expires_at FROM rider_invites WHERE stall_id=? ORDER BY rowid DESC').bind(owner.id).all()).results:[]});
      }
      if(path==='/team/member' && request.method==='POST') {
        if(!['vendor','rider'].includes(session.role)||!session.stall_id)fail(403,'Only the owner can manage the team.');
        const input=await body(request),member=await db.prepare('SELECT * FROM team_members WHERE id=? AND stall_id=? AND active=1').bind(text(input.id),session.stall_id).first<{id:string;phone:string;role:string}>();
        if(!member || (session.role==='rider'&&(member.phone!==session.phone||member.role!=='rider')))fail(404,'Team member not found.');
        if(input.remove===true){
          if(session.role!=='vendor')fail(403,'Only the owner can remove access.');
          const active=(await db.prepare('SELECT body FROM gate_orders WHERE stall_id=?').bind(session.stall_id).all<{body:string}>()).results.some(row=>{const o:GateOrder=JSON.parse(row.body);return o.riderPhone===member.phone&&!['delivered','cancelled'].includes(o.state);});
          if(member.role==='rider'&&active)fail(409,'Reassign uncollected orders or finish current deliveries before removing this person.');
          const removed=await db.batch([db.prepare("UPDATE team_members SET active=0 WHERE id=? AND (role='assistant' OR NOT EXISTS(SELECT 1 FROM gate_orders WHERE stall_id=? AND json_extract(body,'$.riderPhone')=? AND json_extract(body,'$.state') NOT IN ('delivered','cancelled')))").bind(member.id,session.stall_id,member.phone),db.prepare('DELETE FROM sessions WHERE stall_id=? AND phone=? AND role=? AND EXISTS(SELECT 1 FROM team_members WHERE id=? AND active=0)').bind(session.stall_id,member.phone,member.role,member.id),db.prepare('DELETE FROM rider_invites WHERE stall_id=? AND phone=? AND role=?').bind(session.stall_id,member.phone,member.role)]);
          if(!(removed[0] as {meta:{changes:number}}).meta.changes)fail(409,'A delivery was just assigned. Reassign it before removing this person.');
          await db.prepare('DELETE FROM team_access WHERE member_id=?').bind(member.id).run();
          if(member.role==='rider')await db.prepare("UPDATE stalls SET rider_phone=(SELECT phone FROM team_members WHERE stall_id=? AND role='rider' AND active=1 ORDER BY joined_at LIMIT 1) WHERE id=? AND rider_phone=?").bind(session.stall_id,session.stall_id,member.phone).run();
        }else{
          if(member.role!=='rider'||typeof input.available!=='boolean')fail(400,'Choose delivery availability.');
          await db.prepare('UPDATE team_members SET available=? WHERE id=?').bind(Number(input.available),member.id).run();
        }
        return json({saved:true});
      }
      if (path.startsWith('/vendor')) {
        if (session.role !== 'vendor' || !session.stall_id) fail(403, 'Only the stall owner can do that.');
        const owner = await stall(session.stall_id);

        if(path==='/vendor/extras' && request.method==='PUT') {
          const input=await body(request), extras=checkedExtras(input.extras), items=await menu(owner.id);
          await db.batch([
            db.prepare('UPDATE stalls SET settings=json_patch(settings,?) WHERE id=?').bind(JSON.stringify({kotaExtras:extras}),owner.id),
            ...items.filter(item=>item.shop==='stall').map(item=>db.prepare('UPDATE menu SET body=? WHERE id=? AND stall_id=?').bind(JSON.stringify({...item,extras}),item.id,owner.id)),
          ]);
          return json({saved:true});
        }
        if (path === '/vendor/setup' && request.method === 'PUT') {
          const input=await body(request), step=Number(input.step);
          if(!Number.isInteger(step)||step<3||step>8) fail(400,'Check the setup step.');
          const settings:StallSettings=JSON.parse(owner.settings), items=await menu(owner.id);
          let name=owner.name,town=owner.town,hours=owner.hours,takesCard=owner.takes_card;
          const writes=[];
          if(step===3){name=text(input.name);town=text(input.town);}
          if(step===4){
            if(input.extras!==undefined) settings.kotaExtras=checkedExtras(input.extras);
            if(!Array.isArray(input.items)||input.items.length>30) fail(400,'Add up to 30 food items.');
            const seen=new Set<string>();
            for(const row of input.items){
              const id=text(row.id),existing=items.find(item=>item.id===id);
              if(seen.has(id)||existing&&existing.shop!=='stall') fail(400,'Check the menu items.');
              seen.add(id);
              const owned=existing?null:await db.prepare('SELECT stall_id FROM menu WHERE id=?').bind(id).first<{stall_id:string}>();
              if(owned&&owned.stall_id!==owner.id) fail(403,'This item belongs to another stall.');
              const item:GateItem={...existing,id,name:text(row.name),priceCents:row.priceCents===null?null:cents(row.priceCents),shop:'stall',shopName:owner.name,enabled:row.enabled===true,extras:settings.kotaExtras??existing?.extras};
              writes.push(db.prepare('INSERT INTO menu(id,stall_id,body) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE menu.stall_id=excluded.stall_id').bind(id,owner.id,JSON.stringify(item)));
            }
          }
          if(step===5) settings.photosSkipped=input.skip===true;
          if(step===6){hours=text(input.hours);if(!hoursRange(hours))fail(400,'Use hours like 08:00–21:00.');settings.hoursPreset=text(input.hoursPreset);}
          if(step===8){if(!input.skip && typeof input.delivery!=='boolean')fail(400,'Choose collection only or collection and delivery.');settings.deliveryEnabled=input.skip?false:input.delivery===true;}
          if(step===7){if(typeof input.takesCard!=='boolean')fail(400,'Choose cash or card.');takesCard=+input.takesCard;}
          settings.setupStep=step+1;
          writes.push(db.prepare('UPDATE stalls SET name=?,town=?,hours=?,takes_card=?,settings=json_patch(settings,?),is_open=? WHERE id=?').bind(name,town,hours,takesCard,editableSettings(settings),step===8?1:owner.is_open,owner.id));
          await db.batch(writes);
          return json({stall:await stall(owner.id),menu:await menu(owner.id)});
        }
        if (path === '/vendor/shop' && request.method === 'PUT') {
          const input = await body(request), kind = String(input.type), name = text(input.name), number = phone(input.phone);
          if (kind !== 'spaza' || !Array.isArray(input.items) || input.items.length > 60) fail(400, 'Add up to 60 shop items.');
          if (await db.prepare('SELECT phone FROM shop_optouts WHERE phone=?').bind(number).first()) fail(409, 'This shop asked to stay off the menu.');
          const old = (await menu(owner.id)).filter(item => item.shop === kind), seen = new Set<string>();
          const items: GateItem[] = input.items.map(row => {
            row.name = text(row.name);
            if (seen.has(row.name.toLowerCase()) || (isAlcoholName(row.name) || row.alcohol === true)) fail(400, 'Use a unique item name. Alcohol is not available.');
            seen.add(row.name.toLowerCase());
            const existing = old.find(item => item.name === row.name);
            const item: GateItem = { id: existing?.id || crypto.randomUUID(), name: row.name, shop: kind as 'spaza' | 'tavern', shopName: name, enabled: true, priceCents: cents(row.priceCents), alcohol: row.alcohol === true || isAlcoholName(row.name) };
            item.soldOutDate = row.soldOutToday === true ? dateZA(now()) : undefined;

            if (productImage(item.name)) item.image = productImage(item.name);
            else if (typeof row.image === 'string' && row.image.startsWith(`/photos/${owner.id}/`)) item.image = row.image;
            else if (existing?.image) item.image = existing.image;
            return item;
          });
          const settings: StallSettings = JSON.parse(owner.settings);
          settings.neighbours = [...(settings.neighbours || []).filter(shop => shop.type !== kind), { type: kind as 'spaza' | 'tavern', name, phone: number, enabled: input.enabled !== false }];
          await db.batch([
            db.prepare('UPDATE stalls SET settings=json_patch(settings,?) WHERE id=?').bind(editableSettings(settings), owner.id),
            db.prepare('DELETE FROM menu WHERE stall_id=? AND json_extract(body,\'$.shop\')=?').bind(owner.id, kind),
            ...items.map(item => db.prepare('INSERT INTO menu(id,stall_id,body) VALUES (?,?,?)').bind(item.id, owner.id, JSON.stringify(item))),
          ]);
          const names = items.map(item => item.name).join(', ');
          if (!names || input.enabled === false) return json({ saved: true });
          const message = `${owner.name} put your ${names} on her menu. Her delivery guy buys from you with cash, like any customer. Reply STOP if you'd rather not.`;
          if (owner.phone === DEMO_PHONE) return json({ saved: true, sent: false });
          try { if (!messaging.notifyShop) throw new Error(); await messaging.notifyShop(number, owner.name, names); return json({ saved: true, sent: true }); }
          catch { return json({ saved: true, sent: false, link: `https://wa.me/${number.slice(1)}?text=${encodeURIComponent(message)}` }); }
        }
        if (path === '/vendor/stall' && request.method === 'GET') return json({ stall: { ...owner, is_open: Number(accepting(owner, now())) }, menu: await menu(owner.id),
          team: (await db.prepare('SELECT id,name,phone,role,available,fee_cents FROM team_members WHERE stall_id=? AND active=1 ORDER BY joined_at,rowid').bind(owner.id).all()).results,
          riderOffer: await db.prepare("SELECT phone,name,fee_cents,decision,expires_at FROM rider_invites WHERE stall_id=? AND role='rider' ORDER BY rowid DESC LIMIT 1").bind(owner.id).first() });
        if (path === '/vendor/settings' && request.method === 'PUT') {
          const input = await body(request), settings = JSON.parse(owner.settings) as StallSettings;
          if (input.setupStep !== undefined) {
            if (!Number.isInteger(input.setupStep) || Number(input.setupStep) < 1 || Number(input.setupStep) > 9) fail(400, 'Check setup progress.');
            settings.setupStep = Number(input.setupStep);
          }
          if(typeof input.deliveryEnabled==='boolean')settings.deliveryEnabled=input.deliveryEnabled;
          if(input.special===null)delete settings.special;
          else if(input.special!==undefined){
            const special=input.special as {text?:unknown;from?:unknown;to?:unknown};
            if(!special||typeof special.text!=='string'||!special.text.trim()||special.text.trim().length>80)fail(400,'Write the special in one short line.');
            if(!Number.isSafeInteger(special.from)||!Number.isSafeInteger(special.to)||(special.to as number)<=(special.from as number))fail(400,'The end time must be after the start time.');
            if((special.to as number)<=now())fail(400,'The end time has already passed.');
            if((special.to as number)-(special.from as number)>31*86400000)fail(400,'A special can run for up to 31 days.');
            settings.special={text:special.text.trim(),from:special.from as number,to:special.to as number};
          }
          if (typeof input.photosSkipped === 'boolean') settings.photosSkipped = input.photosSkipped;
          if (typeof input.hoursPreset === 'string') settings.hoursPreset = text(input.hoursPreset);
          if (typeof input.riderName === 'string') settings.riderName = input.riderName.slice(0, 100).trim();
          if (Array.isArray(input.done)) settings.done = [...new Set([...(settings.done ?? []), ...input.done.filter((x): x is string => typeof x === 'string' && x.length < 100)])].slice(0, 100);
          if (Array.isArray(input.neighbours)) {
            if (input.neighbours.length > 1) fail(400, 'Add one spaza.');
            const types = new Set();
            settings.neighbours = input.neighbours.map(shop => {
              if (!shop || shop.type !== 'spaza' || types.has(shop.type)) fail(400, 'Check the shop type.');
              types.add(shop.type);
              return { type: shop.type, name: text(shop.name), phone: phone(shop.phone), enabled: shop.enabled === true };
            });
            for (const shop of settings.neighbours) if (shop.enabled && await db.prepare('SELECT phone FROM shop_optouts WHERE phone=?').bind(shop.phone).first()) fail(409, 'This shop asked to stay off the menu.');
          }
          await db.prepare('UPDATE stalls SET settings=json_patch(settings,?) WHERE id=?').bind(editableSettings(settings), owner.id).run();
          return json({ settings });
        }
        if (path === '/vendor/activation' && request.method === 'GET') return json({
          online: false, takesCard: Boolean(owner.takes_card), delivery: Boolean(owner.rider_phone) && JSON.parse(owner.settings).deliveryEnabled!==false, stallName: owner.name, deliveryName:(await db.prepare("SELECT name FROM team_members WHERE stall_id=? AND phone=? AND role='rider' AND active=1").bind(owner.id,owner.rider_phone).first<{name:string}>())?.name, plan: stallPlan(owner,now()), stallId: owner.id,
          paymentUrl: null,
          instructions: options.paymentInstructions ?? null, activated: owner.activated_at !== null, reported: owner.payment_reported_at !== null,
        });
        if (path === '/vendor/pay' && request.method === 'POST') fail(503, 'Arrange payment with Thandi. Automatic subscriptions are not connected.');
        if (path === '/vendor/activation' && request.method === 'POST') {
          if (owner.phone === DEMO_PHONE) return json({ message: 'The demo stall takes no payments.' });
          await db.prepare('UPDATE stalls SET payment_reported_at=? WHERE id=?').bind(now(), owner.id).run();
          return json({ message: 'Thandi will confirm when your payment arrives.' });
        }
        if (path === '/vendor/photo' && request.method === 'POST') {
          if (!options.upload) fail(503, 'Photo uploads are not connected yet.');
          const type = request.headers.get('content-type') ?? '';
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) fail(400, 'Choose a JPG, PNG or WebP photo.');
          const bytes = await request.arrayBuffer();
          if (bytes.byteLength > 5 * 1024 * 1024 || !bytes.byteLength) fail(413, 'Choose a photo smaller than 5 MB.');
          const key = `${owner.id}/${crypto.randomUUID()}`;
          await options.upload(key, bytes, type);
          return json({ image: `/photos/${key}` }, 201);
        }
        if (path.startsWith('/vendor/menu/') && request.method === 'DELETE') {
          await db.prepare('DELETE FROM menu WHERE id=? AND stall_id=?').bind(path.split('/').pop(), owner.id).run();
          return json({ removed: true });
        }
        if (path === '/vendor/stall' && request.method === 'PUT') {
          const input = await body(request);
          const name = text(input.name), town = text(input.town), hours = text(input.hours);
          if (!hoursRange(hours)) fail(400, 'Use hours like 08:00–21:00.');
          if (typeof input.open !== 'boolean' || typeof input.takesCard !== 'boolean') fail(400, 'Check stall settings.');
          await db.prepare('UPDATE stalls SET name=?,town=?,hours=?,is_open=?,takes_card=? WHERE id=?')
            .bind(name, town, hours, Number(Boolean(owner.is_open || input.open)), +input.takesCard, owner.id).run();
          return json({ saved: true });
        }
        if (path === '/vendor/open' && request.method === 'POST') {
          const input = await body(request);
          if (typeof input.open !== 'boolean') fail(400, 'Choose open or closed.');
          if (input.open && !stallPlan(owner,now()).active) fail(409, 'Your menu is saved, but customers cannot order until your plan payment is confirmed. Open Keep my stall to view your payment status.');
          const settings: StallSettings = JSON.parse(owner.settings);
          settings.overrideOpen = input.open; settings.overrideUntil = nextOpen(owner.hours, now());
          await db.prepare('UPDATE stalls SET settings=json_patch(settings,?),is_open=1 WHERE id=?').bind(editableSettings(settings), owner.id).run();
          return json({ saved: true });
        }
        if (path === '/vendor/menu' && request.method === 'PUT') {
          const input = await body(request);
          const id = typeof input.id === 'string' ? text(input.id) : crypto.randomUUID();
          const existing = await db.prepare('SELECT stall_id FROM menu WHERE id=?').bind(id).first<{ stall_id: string }>();
          if (existing && existing.stall_id !== owner.id) fail(403, 'This item belongs to another stall.');
          if (input.alcohol === true || isAlcoholName(String(input.name))) fail(400, 'Alcohol is not available.');
          if (!['stall', 'spaza'].includes(String(input.shop))) fail(400, 'Choose a shop.');

          const item: GateItem = { id, name: text(input.name), priceCents: input.priceCents === null ? null : cents(input.priceCents),
            shop: input.shop as GateItem['shop'], shopName: text(input.shopName), enabled: input.enabled === true,
            alcohol: input.alcohol === true, soldOutDate: input.soldOutToday === true ? dateZA(now()) : undefined,
            alternative: undefined,
          };
          if (typeof input.image === 'string' && (/^\/images\/[a-zA-Z0-9_./#-]+$/.test(input.image) || input.image.startsWith(`/photos/${owner.id}/`))) item.image = input.image;
          if (Array.isArray(input.extras)) item.extras = input.extras.slice(0, 15).map(extra => ({ id: text(extra.id), name: text(extra.name), priceCents: cents(extra.priceCents) }));
          if(item.shop==='stall' && JSON.parse(owner.settings).kotaExtras!==undefined) item.extras=JSON.parse(owner.settings).kotaExtras;
          await db.prepare('INSERT INTO menu(id,stall_id,body) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE menu.stall_id=excluded.stall_id')
            .bind(id, owner.id, JSON.stringify(item)).run();
          return json({ item });
        }

        if ((path === '/vendor/rider' || path === '/vendor/assistant') && request.method === 'POST') {
          const input=await body(request);
          let number:string;try{number=invitationPhone(input.phone);}catch(error){fail(400,(error as Error).message);}
          const role=path.endsWith('assistant')?'assistant':'rider',fee=role==='rider'?cents(input.feeCents):0,secret=token();
          const name=typeof input.riderName==='string'?input.riderName.trim().slice(0,100):typeof input.name==='string'?text(input.name):'';
          if(role==='assistant'&&!name)fail(400,'Enter the assistant’s name.');
          if(role==='rider'&&fee<=0)fail(400,'Enter the amount you offer per run.');
          if(number===owner.phone)fail(400,'Invite your team member using their own WhatsApp number.');
          await limit('invite:'+owner.id,20,3600000);
          await db.batch([
            db.prepare('DELETE FROM rider_invites WHERE stall_id=? AND phone=? AND role=?').bind(owner.id,number,role),
            db.prepare('INSERT INTO rider_invites(hash,stall_id,phone,expires_at,fee_cents,name,role) VALUES (?,?,?,?,?,?,?)').bind(await hash(secret),owner.id,number,now()+86400000,fee,name,role),
          ]);
          const link=url.origin+(role==='rider'?'/rider/invite':'/team/invite')+'?token='+secret;
          const message=role==='rider'?owner.name+' invites '+(name||'you')+' to the delivery team at R'+(fee/100).toFixed(2)+' per completed run, paid by the vendor. Open to accept or decline: '+link:owner.name+' invites '+name+' to help manage kitchen orders on Kasi Move. Open to accept or decline: '+link;
          return json({sent:false,link:'https://wa.me/'+number.slice(1)+'?text='+encodeURIComponent(message)});
        }

      }
      if (path === '/orders' && request.method === 'POST') {
        if (session.role !== 'customer') fail(403, 'Open the stall as a customer to order.');
        const input = await body(request), requestKey = text(input.requestKey);
        const repeated = await db.prepare('SELECT body FROM gate_orders WHERE customer_hash=? AND request_key=?').bind(session.hash, requestKey).first<{ body: string }>();
        if (repeated) return json({ order: JSON.parse(repeated.body) });
        const record = await stall(text(input.stallId));
        if (!accepting(record, now())) fail(409, 'This stall is taking a break.');
        if (!['cash', 'card'].includes(String(input.method)) || (input.method === 'card' && !record.takes_card)) fail(400, 'Choose a payment method the stall accepts.');
        if (!['delivery', 'collection'].includes(String(input.fulfilment))) fail(400, 'Choose delivery or collection.');
        if (input.fulfilment === 'delivery' && (!record.rider_phone || JSON.parse(record.settings).deliveryEnabled===false)) fail(409, 'This stall is collection only.');
        if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 30) fail(400, 'Choose your order items.');
        const currentMenu = await menu(record.id), seen = new Set<string>();
        const lines: OrderLine[] = input.lines.map((choice: Record<string, unknown>) => {
          const item = currentMenu.find(item => item.id === choice.itemId);
          if (!item || !available(item, record) || item.priceCents === null) return fail(409, 'An item is no longer available.');
          if (!Number.isInteger(choice.quantity) || Number(choice.quantity) < 1 || Number(choice.quantity) > 20) fail(400, 'Check the quantity.');
          if (item.alcohol && input.over18 !== true) fail(400, 'Confirm that you are 18 years and older.');
          if (item.shop !== 'stall' && !['alternative', 'omit'].includes(String(choice.ifMissing))) fail(400, 'Choose what happens if a next-door item is not there.');

          const selected = Array.isArray(choice.extras) ? [...new Set(choice.extras)] : [];
          const signature = `${item.id}|${selected.map(String).sort().join(',')}`;
          if (seen.has(signature)) fail(400, 'Combine repeated items with the same extras into one quantity.');
          seen.add(signature);
          const extras = selected.map(id => item.extras?.find(extra => extra.id === id) ?? fail(400, 'That extra is not available.'));
          return { lineId: crypto.randomUUID(), itemId: item.id, name: item.name, quantity: Number(choice.quantity), priceCents: item.priceCents + extras.reduce((sum, extra) => sum + extra.priceCents, 0), extras, alcohol: item.alcohol,
            shop: item.shop, shopName: item.shopName, alternative: null, outcome: 'pending' };
        });
        if (!lines.some(line => line.shop === 'stall')) fail(400, 'Choose your food first.');
        if (input.fulfilment === 'collection' && lines.some(line => line.shop !== 'stall')) fail(400, 'Next-door items need a delivery guy.');
        const customerProfile=await memory.profile(session.hash);
        const order: GateOrder = { id: crypto.randomUUID(), stallId: record.id, customerName: text(input.customerName),
          customerPhone: phone(input.customerPhone), gateNote: input.fulfilment === 'delivery' ? text(input.gateNote, 500) : '',
          collectionTime: input.fulfilment === 'collection' ? text(input.collectionTime, 40) : '',
          fulfilment: input.fulfilment as GateOrder['fulfilment'], method: input.method as GateOrder['method'],
          regular: Boolean(customerProfile?.orders), state: 'new', lines, createdAt: now(), deliveredAt: null, riderFeeCents: input.fulfilment === 'delivery' ? (JSON.parse(record.settings).riderFeeCents ?? 1000) : 0, riderPhone: null, riderName: null };
        const counter = await db.prepare('INSERT INTO order_counters(stall_id,next) VALUES (?,1) ON CONFLICT(stall_id) DO UPDATE SET next=next+1 RETURNING next').bind(record.id).first<{ next: number }>();
        order.number = counter!.next;
        await db.batch([
          db.prepare('INSERT INTO gate_orders(id,stall_id,customer_hash,request_key,body) VALUES (?,?,?,?,?) ON CONFLICT(customer_hash,request_key) DO NOTHING')
            .bind(order.id, record.id, session.hash, requestKey, JSON.stringify(order)),
          db.prepare('UPDATE stalls SET first_order_at=COALESCE(first_order_at,?) WHERE id=?').bind(now(), record.id),
        ]);
        const saved = (await db.prepare('SELECT body FROM gate_orders WHERE customer_hash=? AND request_key=?').bind(session.hash, requestKey).first<{ body: string }>())!;
        if (JSON.parse(saved.body).id === order.id) {
          try{await memory.remember(session.hash,order.customerName,order.customerPhone,order.gateNote);}catch{console.warn('Order saved; customer details could not be remembered.');}
          try {
            if (record.phone === DEMO_PHONE) { /* demo stall: no WhatsApp */ }
            else if (options.meta) await options.meta.queue('order', record.phone, order.id);
            else await messaging.notifyOrder?.(record.phone, order.customerName.split(' ')[0]);
          } catch { console.warn('Order saved; WhatsApp alert could not be queued.'); }
        }
        return json({ order: JSON.parse(saved.body) }, 201);
      }
      if (path === '/orders' && request.method === 'GET') {
        const query = session.role === 'customer' ? 'SELECT body FROM gate_orders WHERE customer_hash=? ORDER BY rowid DESC'
          : 'SELECT body FROM gate_orders WHERE stall_id=? ORDER BY rowid DESC';
        const rows = (await db.prepare(query).bind(session.role === 'customer' ? session.hash : session.stall_id).all<{ body: string }>()).results;
        const orders: GateOrder[] = rows.map(row => {const order:GateOrder=JSON.parse(row.body);if(!['vendor','assistant'].includes(session.role))delete order.lastAction;return order;});
        return json({ orders: await Promise.all((session.role === 'rider' ? orders.filter(order => order.fulfilment === 'delivery' && order.state!=='cancelled' && order.riderPhone === session.phone) : orders).map(decorate)) });
      }
      const match = path.match(/^\/orders\/([^/]+)(?:\/(cook|cancel|ready|collect|depart|deliver|assign|viewed|accept|resend|photo))?$/);
      if (match) {
        const row = await db.prepare('SELECT * FROM gate_orders WHERE id=?').bind(match[1]).first<OrderRow>();
        if (!row || (session.role === 'customer' ? row.customer_hash !== session.hash : row.stall_id !== session.stall_id)) fail(404, 'Order not found.');
        const order: GateOrder = JSON.parse(row.body);
        if (session.role === 'rider' && (order.state==='cancelled' || order.fulfilment !== 'delivery' || order.riderPhone !== session.phone)) fail(404, 'Order not found.');
        if (request.method === 'GET' && !match[2]) {
          const record = await stall(order.stallId);
          await decorate(order);
          return json({ order:['vendor','assistant'].includes(session.role)?order:{...order,lastAction:undefined}, money: orderMoney(order), stallName: record.name, stallPhone: record.phone, riderPhone: order.riderPhone ?? null });
        }
        if (request.method === 'POST') {
          const action = match[2];
          if (session.role === 'customer'&&action!=='cancel') fail(403, 'Only the vendor or assigned delivery guy can update this order.');
          if(action==='photo'){
            if(!['vendor','assistant'].includes(session.role)||order.state!=='ready')fail(403,'Take an order photo when the kitchen marks it ready.');
            if(!options.upload)fail(503,'Photo storage is unavailable.');
            const type=request.headers.get('content-type')||'';if(!['image/jpeg','image/png','image/webp'].includes(type))fail(400,'Choose a food photo.');
            const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>5*1024*1024)fail(413,'Choose a photo smaller than 5 MB.');
            const key=order.stallId+'/orders/'+order.id+'/'+crypto.randomUUID();await options.upload(key,bytes,type);order.photo='/photos/'+key;
          }else if(action==='viewed'||action==='accept'){
            if(session.role!=='rider'||['cancelled','delivered'].includes(order.state))fail(403,'Only the assigned driver can do that.');
            if(action==='viewed'&&order.driverViewedAt||action==='accept'&&order.driverAcceptedAt)return json({order});
            order.driverViewedAt??=now();if(action==='accept')order.driverAcceptedAt=now();
          }else if(action==='resend'){
            if(!['vendor','assistant'].includes(session.role)||!order.riderPhone||order.driverViewedAt||!['new','cooking','ready'].includes(order.state)||(order.driverAlertAt??now())>now()-180000)fail(409,'Resend is available after three minutes without the driver viewing this order.');
            order.driverAlertAt=now();order.driverAlertId=order.id+':'+(row.version+1);
          }else if(action==='cancel'){
            if(session.role!=='customer')fail(403,'Only the customer can cancel their received order.');
            if(order.state!=='new')fail(409,'Cooking has already started or this order is no longer cancellable.');
            order.state='cancelled';order.cancelledAt=now();
          }else if(action==='cook'){
            if(!['vendor','assistant'].includes(session.role)||order.state!=='new')fail(409,'This order changed. Refresh before starting cooking.');
            order.state='cooking';
          }else if(action==='assign') {
            if(!['vendor','assistant'].includes(session.role)||order.fulfilment!=='delivery'||!['new','cooking','ready'].includes(order.state)||order.lines.some(line=>line.outcome!=='pending'))fail(409,'Assign delivery before collection starts.');
            const input=await body(request);
            if(input.expectedPhone!==(order.riderPhone??null))fail(409,'The delivery assignment changed. Refresh and try again.');
            const member=await db.prepare("SELECT phone,name,fee_cents FROM team_members WHERE id=? AND stall_id=? AND role='rider' AND active=1 AND available=1").bind(text(input.memberId),order.stallId).first<{phone:string;name:string;fee_cents:number}>();
            if(!member)fail(409,'Choose an available delivery person.');
            order.riderPhone=member.phone;order.riderName=member.name;order.riderFeeCents=member.fee_cents;
            order.driverAssignedAt=now();delete order.driverViewedAt;delete order.driverAcceptedAt;
            order.driverAlertAt=now();order.driverAlertId=order.id+':'+(row.version+1);
          } else if (action === 'ready') {
            if (!['vendor','assistant'].includes(session.role) || !['new','cooking'].includes(order.state)) fail(409, 'This order cannot be marked ready.');
            order.state = 'ready';
            if(order.riderPhone){order.driverAlertAt=now();order.driverAlertId=order.id+':'+(row.version+1);}
          } else if (action === 'collect') {
            if (session.role !== 'rider' || order.state !== 'ready' || (order.driverAssignedAt&&!order.driverAcceptedAt)) fail(409, 'Accept the delivery and wait for the kitchen to mark it ready.');
            const input = await body(request);
            const next = [...order.lines].sort((a, b) => ['stall', 'spaza', 'tavern'].indexOf(a.shop) - ['stall', 'spaza', 'tavern'].indexOf(b.shop)).find(line => line.outcome === 'pending');
            if (!next || next.itemId !== input.itemId || (input.lineId !== undefined && next.lineId !== input.lineId)) fail(409, 'Collect from the current stop first.');
            if (!['original', 'alternative', 'omitted'].includes(String(input.outcome))) fail(400, 'Choose what you collected.');
            if (next.shop === 'stall' && input.outcome !== 'original') fail(409, 'Collect the food from the stall.');
            if (input.outcome === 'alternative' && !next.alternative) fail(409, 'The customer did not choose this alternative.');
            next.outcome = input.outcome as OrderLine['outcome'];
          } else if (action === 'depart') {
            if (session.role !== 'rider' || order.state !== 'ready' || order.lines.some(line => line.outcome === 'pending')) fail(409, 'Finish each stop first.');
            order.state = 'on_the_way';
          } else if (action === 'deliver') {
            const collection = order.fulfilment === 'collection';
            const ownerComplete = !collection && session.role === 'vendor' && ['ready','on_the_way'].includes(order.state);
            if (collection ? !['vendor','assistant'].includes(session.role) || order.state !== 'ready' : !ownerComplete && (session.role !== 'rider' || order.state !== 'on_the_way')) fail(409, 'This order cannot be completed yet.');
            if (collection) order.lines.forEach(line => { line.outcome = 'original'; });
            else if (ownerComplete) order.lines.forEach(line => { if (line.outcome === 'pending') line.outcome = 'original'; });
            order.state = 'delivered'; order.deliveredAt = now();
          } else return fail(404, 'Page not found.');
          order.lastAction = { role:session.role, phone:session.phone, action:action!, at:now() };
          const saved = action==='assign'
            ? await db.prepare("UPDATE gate_orders SET body=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM team_members WHERE stall_id=? AND phone=? AND role='rider' AND active=1 AND available=1)").bind(JSON.stringify(order),order.id,row.version,order.stallId,order.riderPhone).run()
            : await db.prepare('UPDATE gate_orders SET body=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(order), order.id, row.version).run();
          if (!saved.meta.changes) fail(409, 'This order changed. Refresh and try again.');
          if(action==='cancel'){
            try {const owner=await stall(order.stallId);if(owner.phone!==DEMO_PHONE)await options.meta?.queue('cancellation',owner.phone,order.id+':'+(row.version+1),orderNotice('cancellation',order,owner.name,appOrigin));}catch{console.error('Order updated; WhatsApp notification could not be queued.');}
          }
          if(order.riderPhone&&['assign','ready','resend'].includes(action||''))try{await driverNotice(order,order.state==='ready'?'ready':'assignment');}catch{console.error('Order saved; delivery alert could not be queued.');}
          return json({ order, money: orderMoney(order) });
        }
      }
      return fail(404, 'Page not found.');
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      // Provider/configuration failures are not authentication success; database errors never leak records.
      const known = error instanceof Error && /^(WhatsApp|Rider invitations)/.test(error.message);
      return json({ error: known ? (error as Error).message : 'Something went wrong. Please try again.' }, 503);
    }
  };
}
