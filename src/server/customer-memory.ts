import type { Database } from './database';
import { digest, sealCode, openCode } from './private-admin';
import type { MetaMessaging } from './meta-whatsapp';
export interface CustomerProfile { id:string; phone:string; name:string; gate_note:string; orders:number; verified_at:number|null }
export function customerMemory(db:Database, secret:string, meta:MetaMessaging|undefined, now=Date.now) {
  async function profile(device:string) {
    return db.prepare('SELECT p.* FROM customer_profiles p JOIN customer_devices d ON d.profile_id=p.id WHERE d.device_hash=?').bind(device).first<CustomerProfile>();
  }
  return { profile, async remember(device:string, name:string, phone:string, gate:string) {
    const old=await profile(device), id=old?.id||crypto.randomUUID();
    await db.batch([
      db.prepare('INSERT INTO customer_profiles(id,phone,name,gate_note,orders,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,name=excluded.name,gate_note=CASE WHEN excluded.gate_note=\'\' AND customer_profiles.phone=excluded.phone THEN customer_profiles.gate_note ELSE excluded.gate_note END,orders=customer_profiles.orders+1,verified_at=CASE WHEN customer_profiles.phone=excluded.phone THEN customer_profiles.verified_at ELSE NULL END,updated_at=excluded.updated_at').bind(id,phone,name,gate,now()),
      db.prepare('INSERT INTO customer_devices(device_hash,profile_id) VALUES (?,?) ON CONFLICT(device_hash) DO UPDATE SET profile_id=excluded.profile_id').bind(device,id),
    ]);
  }, async request(device:string, phone:string) {
    if(!secret||!meta?.canSend(phone))throw new Error('Saved-detail verification is unavailable for this number right now. You can still enter your details and order.');
    let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294000000);
    const code=String(n%1000000).padStart(6,'0'), id=crypto.randomUUID();
    await db.prepare('DELETE FROM customer_challenges WHERE device_hash=? OR expires_at<=?').bind(device,now()).run();
    await db.prepare('INSERT INTO customer_challenges(id,device_hash,phone,proof,cipher,expires_at) VALUES (?,?,?,?,?,?)').bind(id,device,phone,await digest(id+':'+code+':'+secret),await sealCode(code,secret),now()+600000).run();
    await meta.queue('customer',phone,id);
    return {challengeId:id,queued:true};
  }, async verify(device:string,id:string,code:string) {
    const challenge=await db.prepare('DELETE FROM customer_challenges WHERE id=? AND device_hash=? AND proof=? AND expires_at>? RETURNING phone').bind(id,device,await digest(id+':'+code+':'+secret),now()).first<{phone:string}>();
    if(!challenge)throw new Error('That code is incorrect or has expired.');
    const found=await db.prepare('SELECT * FROM customer_profiles WHERE phone=? ORDER BY verified_at IS NOT NULL DESC,updated_at DESC LIMIT 1').bind(challenge.phone).first<CustomerProfile>();
    if(!found)return null;
    await db.batch([db.prepare('UPDATE customer_profiles SET verified_at=? WHERE id=?').bind(now(),found.id),db.prepare('INSERT INTO customer_devices(device_hash,profile_id) VALUES (?,?) ON CONFLICT(device_hash) DO UPDATE SET profile_id=excluded.profile_id').bind(device,found.id)]);
    return found;
  }};
}
export async function customerCode(db:Database,id:string,secret:string,now:number) {
  const row=await db.prepare('SELECT cipher FROM customer_challenges WHERE id=? AND expires_at>?').bind(id,now+15000).first<{cipher:string}>();
  return row?openCode(row.cipher,secret):null;
}
