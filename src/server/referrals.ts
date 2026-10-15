import type {Database} from './database';
export interface ReferralAward {stall_id:string;connector_key:string;connector_name:string;vendor_name:string;vendor_phone:string;earned_at:number;amount_cents:number;paid_at:number|null;payout_reference:string|null}
export async function referralReport(db:Database){
 const awards=(await db.prepare('SELECT * FROM referral_awards ORDER BY earned_at,stall_id').all<ReferralAward>()).results;
 const groups=new Map<string,{key:string;name:string;payingVendors:number;owedCents:number;paidCents:number;awards:ReferralAward[]}>();
 for(const award of awards){let group=groups.get(award.connector_key);if(!group){group={key:award.connector_key,name:award.connector_name,payingVendors:0,owedCents:0,paidCents:0,awards:[]};groups.set(award.connector_key,group);}group.payingVendors++;group[award.paid_at===null?'owedCents':'paidCents']+=award.amount_cents;group.awards.push(award);}
 const contacts=(await db.prepare('SELECT * FROM connector_contacts ORDER BY name').all<{key:string;name:string;phone:string;verified_at:number}>()).results;
 for(const contact of contacts)if(!groups.has(contact.key))groups.set(contact.key,{key:contact.key,name:contact.name,payingVendors:0,owedCents:0,paidCents:0,awards:[]});
 return {awards,contacts,connectors:[...groups.values()]};
}
