import {describe,it,expect} from 'vitest';import {invitationPhone,deliveryRate} from '../src/server/invite-input';
describe('invitation inputs',()=>{
 it('normalises local, international and pasted contact formats',()=>{for(const value of ['0791234567','079 123-4567','+27 79 123 4567','27791234567','0027791234567','+27 (0)79 1234567','\u200e+27 79 123 4567\u200f'])expect(invitationPhone(value)).toBe('+27791234567');});
 it('rejects incomplete or malformed numbers without inventing digits',()=>{for(const value of ['079','abc0791234567','+447912345678','','079123456789'])expect(()=>invitationPhone(value)).toThrow();});
 it('accepts Rand amounts with a decimal comma and rejects invalid rates',()=>{expect(deliveryRate('15')).toBe(1500);expect(deliveryRate('R15,50')).toBe(1550);expect(deliveryRate('15.50')).toBe(1550);for(const value of ['','0','-1','15.555','abc','Infinity'])expect(()=>deliveryRate(value)).toThrow();});
});