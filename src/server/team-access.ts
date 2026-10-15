import type {Database} from './database';
import {digest,sealCode,openCode} from './private-admin';
export interface Member {id:string;stall_id:string;phone:string;name:string;role:'rider'|'assistant';fee_cents:number}
/** Private bearer links are separate from one-use invitations and revoked on removal. */
export function teamAccess(db:Database,secret:string){
 return {
  async link(member:Member,orderId?:string){
   if(!secret)throw Error('Team access signing is not configured.');
   const value=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
   await db.prepare('INSERT INTO team_access(member_id,stall_id,hash,cipher) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM team_members WHERE id=? AND active=1) ON CONFLICT(member_id) DO NOTHING').bind(member.id,member.stall_id,await digest(value),await sealCode(value,secret),member.id).run();
   const row=await db.prepare('SELECT cipher FROM team_access WHERE member_id=?').bind(member.id).first<{cipher:string}>();
   if(!row)throw Error('Team access is no longer active.');
   return 'https://move.kasiaihub.com/team/access#token='+await openCode(row.cipher,secret)+(orderId?'&order='+encodeURIComponent(orderId):'');
  },
  async resolve(value:string){return db.prepare('SELECT m.* FROM team_access a JOIN team_members m ON m.id=a.member_id WHERE a.hash=? AND m.active=1').bind(await digest(value)).first<Member>();}
 };
}
