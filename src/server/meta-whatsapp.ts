import {noticeTemplates,type Notice,type NoticeKind} from './notifications';
import { customerCode } from './customer-memory';
import type { Database } from './database';
import type { WhatsAppConfig } from './whatsapp';
import { pendingCodes } from './private-admin';
import { orderMoney, type GateOrder } from './contracts';

export function metaPhone(value: string): string {
  let number = value.replace(/[\s()+-]/g, '');
  if (/^0\d{9}$/.test(number)) number = '27' + number.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(number)) throw new Error('Invalid WhatsApp number.');
  return number;
}
export function metaFailure(code?: number): string {
  if (code === 132001) return "The template isn't approved yet, or its name/language does not match.";
  if (code === 132015 || code === 132016) return 'Meta has paused or disabled this template.';
  if (code === 190) return 'The Meta access token is invalid or expired.';
  if (code === 131030) return 'Add this recipient to the Meta test-number recipient list.';
  return code ? `Meta rejected the message (error ${code}).` : 'WhatsApp did not confirm the send. Check Meta before retrying to avoid a duplicate.';
}
type Delivery = { id: string; phone: string; kind: string; reference: string; status: string; payload: string|null };
export function metaWhatsApp(db: Database, config: WhatsAppConfig & { ACTIVATION_ADMIN_KEY?: string }, background: (job: Promise<unknown>) => void, now = Date.now, request = fetch) {
  const mode = config.WHATSAPP_MODE === 'live' ? 'live' : 'test';
  const configured = Boolean(config.META_WHATSAPP_TOKEN && /^\d+$/.test(config.META_WHATSAPP_PHONE_NUMBER_ID || ''));
  async function send(id: string) {
    const row = await db.prepare("UPDATE whatsapp_outbox SET status='sending',attempts=attempts+1,updated_at=? WHERE id=? AND status IN ('queued','failed','not_configured') RETURNING *").bind(now(), id).first<Delivery>();
    if (!row) return;
    if (!configured) {
      await db.prepare("UPDATE whatsapp_outbox SET status='not_configured',error='Meta WhatsApp is not connected yet.',updated_at=? WHERE id=?").bind(now(), id).run(); return;
    }
    if (mode === 'test' && (!config.META_TEST_RECIPIENT || row.phone !== metaPhone(config.META_TEST_RECIPIENT))) {
      await db.prepare("UPDATE whatsapp_outbox SET status='test_blocked',error='Test mode only sends to the verified test recipient.',updated_at=? WHERE id=?").bind(now(),id).run(); return;
    }
    try {
      let parameters: string[], name: string;
      if (row.kind in noticeTemplates) {
        const notice:Notice=JSON.parse(row.payload||'null');if(!notice?.parameters)throw Error('missing_notification');
        if(row.kind==='assignment'||row.kind==='ready'){
          const current=await db.prepare('SELECT body FROM gate_orders WHERE id=?').bind(notice.orderId).first<{body:string}>();
          const order:GateOrder|null=current?JSON.parse(current.body):null;
          if(!order||order.riderPhone!==notice.assignedPhone||['cancelled','delivered'].includes(order.state)||(order.driverAlertId&&order.driverAlertId!==row.reference)){
            await db.prepare("UPDATE whatsapp_outbox SET status='superseded',error='This delivery assignment is no longer active.',updated_at=? WHERE id=?").bind(now(),id).run();return;
          }
        }
        name=noticeTemplates[row.kind as NoticeKind].name;parameters=notice.parameters;
      } else if (row.kind === 'customer') {
        const code=await customerCode(db,row.reference,config.ACTIVATION_ADMIN_KEY||'',now());
        if(!code){await db.prepare("UPDATE whatsapp_outbox SET status='expired',error='Customer verification code expired or was used.',updated_at=? WHERE id=?").bind(now(),id).run();return;}
        name='kasi_welcome';parameters=[code];
      } else if (row.kind === 'login') {
        const current = (await pendingCodes(db, config.ACTIVATION_ADMIN_KEY || '', now())).find(code => metaPhone(code.phone) === row.phone && String(code.expiresAt) === row.reference);
        if (!current?.code || current.expiresAt <= now() + 15000) {
          await db.prepare("UPDATE whatsapp_outbox SET status='expired',error='This code expired or was already used. Request a new code.',updated_at=? WHERE id=?").bind(now(), id).run(); return;
        }
        name = 'kasi_welcome'; parameters = [current.code];
      } else {
        const record = await db.prepare('SELECT body FROM gate_orders WHERE id=?').bind(row.reference).first<{body: string}>();
        if (!record) throw new Error('missing_order');
        const order: GateOrder = JSON.parse(record.body);
        if(order.state==='cancelled'){await db.prepare("UPDATE whatsapp_outbox SET status='superseded',error='Order cancelled before this alert was sent.',updated_at=? WHERE id=?").bind(now(),id).run();return;}
        name = 'kasi_order_alert';
        const items = order.lines.map(line => `${line.quantity} x ${line.name}${line.extras?.length ? ' (' + line.extras.map(extra => extra.name).join(', ') + ')' : ''}`).join('; ');
        parameters = [order.customerName, items.length > 600 ? items.slice(0, 575) + '… Full order in app' : items, (orderMoney(order).totalCents / 100).toFixed(2), order.fulfilment === 'delivery' ? 'To customer gate' : 'Collection from stall', 'https://move.kasiaihub.com/kitchen'];
      }
      const components: unknown[] = [{type: 'body', parameters: parameters.map(text => ({type: 'text', text: text.replace(/\s+/g, ' ').trim()}))}];
      if (row.kind === 'login'||row.kind === 'customer') components.push({type: 'button', sub_type: 'url', index: '0', parameters: [{type: 'text', text: parameters[0]}]});
      const response = await request(`https://graph.facebook.com/v21.0/${config.META_WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST', headers: {Authorization: `Bearer ${config.META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({messaging_product: 'whatsapp', to: row.phone, type: 'template', template: {name, language: {code: 'en_US'}, components}}), signal: AbortSignal.timeout(12000),
      });
      const result = await response.json() as {messages?: {id: string}[]; error?: {code?: number}};
      if (!response.ok || !result.messages?.[0]?.id) {
        await db.prepare("UPDATE whatsapp_outbox SET status='failed',error=?,updated_at=? WHERE id=?").bind(metaFailure(result.error?.code), now(), id).run();
        console.warn('Meta WhatsApp send rejected', {event: id, code: result.error?.code}); return;
      }
      await db.prepare("UPDATE whatsapp_outbox SET status='accepted',message_id=?,error=NULL,updated_at=? WHERE id=?").bind(result.messages[0].id, now(), id).run();
    } catch {
      // Do not log request payloads, credentials or login codes.
      await db.prepare("UPDATE whatsapp_outbox SET status='failed',error=?,updated_at=? WHERE id=?").bind(metaFailure(), now(), id).run();
      console.warn('Meta WhatsApp send failed', {event: id});
    }
  }
  function schedule(id: string) { background(send(id).catch(() => console.error('WhatsApp delivery log could not be updated', {event: id}))); }
  async function queue(kind: 'login' | 'order' | 'customer' | NoticeKind, number: string, reference: string, payload?:Notice) {
    const phone = metaPhone(number), id = `${kind}:${phone}:${reference}`;
    const saved = await db.prepare("INSERT INTO whatsapp_outbox(id,phone,kind,reference,payload,status,attempts,created_at,updated_at) VALUES (?,?,?,?,?,'queued',0,?,?) ON CONFLICT(id) DO NOTHING").bind(id, phone, kind, reference, payload?JSON.stringify(payload):null, now(), now()).run();
    if (saved.meta.changes) schedule(id);
    return id;
  }
  async function webhook(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET') return config.META_WEBHOOK_VERIFY_TOKEN && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === config.META_WEBHOOK_VERIFY_TOKEN
      ? new Response(url.searchParams.get('hub.challenge') || '', {headers: {'Content-Type': 'text/plain'}})
      : new Response('Verification failed', {status: 403});
    if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
    try {
      const raw = await request.text();
      if (raw.length > 262144 || !config.META_APP_SECRET) return new Response('EVENT_RECEIVED');
      const signature = request.headers.get('x-hub-signature-256') || '';
      if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return new Response('EVENT_RECEIVED');
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.META_APP_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']);
      const bytes = Uint8Array.from(signature.slice(7).match(/../g)!, value => parseInt(value, 16));
      if (!await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(raw))) return new Response('EVENT_RECEIVED');
      const event = JSON.parse(raw);
      if (event.object !== 'whatsapp_business_account') return new Response('EVENT_RECEIVED');
      for (const entry of event.entry || []) for (const change of entry.changes || []) {
        const value = change.value;
        if (value?.metadata?.phone_number_id !== config.META_WHATSAPP_PHONE_NUMBER_ID) continue;
        for (const message of value.messages || []) {
          if (typeof message.id !== 'string' || !Number.isFinite(Number(message.timestamp))) continue;
          const number = metaPhone(message.from);
          const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || `[${message.type || 'unsupported'} message — media not downloaded]`;
          await db.prepare('INSERT INTO whatsapp_inbox(id,phone,text,sent_at,received_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(message.id, number, String(text).slice(0, 10000), Number(message.timestamp) * 1000, now()).run();
          if (String(text).trim().toUpperCase() === 'STOP') {
            await db.prepare('INSERT INTO shop_optouts(phone,stopped_at) VALUES (?,?) ON CONFLICT(phone) DO UPDATE SET stopped_at=excluded.stopped_at').bind('+' + number, now()).run();
            const stalls=(await db.prepare('SELECT id,settings FROM stalls').all<{id:string;settings:string}>()).results;
            for(const stall of stalls){const settings=JSON.parse(stall.settings);if(settings.neighbours?.some((shop:{phone:string})=>shop.phone==='+'+number)){const neighbours=settings.neighbours.map((shop:{phone:string;enabled:boolean})=>shop.phone==='+'+number?{...shop,enabled:false}:shop);await db.prepare("UPDATE stalls SET settings=json_set(settings,'$.neighbours',json(?)) WHERE id=?").bind(JSON.stringify(neighbours),stall.id).run();}}
          }
        }
        for (const status of value.statuses || []) {
          if (!['sent','delivered','read','failed'].includes(status.status)) continue;
          await db.prepare("UPDATE whatsapp_outbox SET status=?,error=?,updated_at=? WHERE message_id=? AND (status NOT IN ('read','delivered') OR (?='read' AND status='delivered'))").bind(status.status, status.status === 'failed' ? metaFailure(status.errors?.[0]?.code) : null, now(), status.id, status.status).run();
        }
      }
    } catch { console.error('Meta webhook could not be stored; check database health.'); }
    // No outbound API call blocks acknowledgement. Invalid signatures are discarded.
    return new Response('EVENT_RECEIVED');
  }
  return {configured, canSend(number:string) {return configured && (mode==='live'||Boolean(config.META_TEST_RECIPIENT && metaPhone(number)===metaPhone(config.META_TEST_RECIPIENT)));}, queue, webhook, async overview() {
    return {configured, mode, inbox: (await db.prepare('SELECT * FROM whatsapp_inbox ORDER BY received_at DESC LIMIT 100').all()).results, deliveries: (await db.prepare('SELECT id,phone,kind,status,attempts,error,created_at,updated_at,payload FROM whatsapp_outbox ORDER BY created_at DESC LIMIT 100').all<{id:string;phone:string;kind:string;payload:string|null}>()).results.map(({payload,...row})=>{
      let manualText:string|undefined;try{if(payload&&row.kind in noticeTemplates){const notice:Notice=JSON.parse(payload);manualText=noticeTemplates[row.kind as NoticeKind].body.replace(/\{\{(\d+)\}\}/g,(_match,n)=>notice.parameters[Number(n)-1]||'');}}catch{ /* Keep the private log readable even if an old payload is malformed. */ }
      return {...row,manualText};
    })};
  }, async retry(id: string) {
    await db.prepare("UPDATE whatsapp_outbox SET status='failed',error='Send was interrupted. Check Meta before retrying.' WHERE id=? AND status='sending' AND updated_at<?").bind(id, now() - 60000).run();
    schedule(id);
  }};
}
export type MetaMessaging = ReturnType<typeof metaWhatsApp>;
