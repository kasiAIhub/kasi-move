/** Accept contact-book formatting without guessing incomplete numbers. */
export function invitationPhone(value:unknown):string {
 const raw=String(value??'').trim().replace(/[\s()\-\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
 if(!/^\+?\d+$/.test(raw))throw Error('Enter a valid WhatsApp number, for example 079 123 4567 or +27 79 123 4567.');
 let digits=raw.replace(/^\+/,'').replace(/^0027/,'27');
 if(/^0\d{9}$/.test(digits))digits='27'+digits.slice(1);
 if(/^270\d{9}$/.test(digits))digits='27'+digits.slice(3);
 if(!/^27[1-9]\d{8}$/.test(digits))throw Error('Enter all 10 digits of the South African WhatsApp number, or use +27 followed by 9 digits.');
 return '+'+digits;
}
export function deliveryRate(value:string):number {
 const raw=value.trim().replace(/^R\s*/i,'').replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Enter the delivery rate in Rand, for example 15 or 15,50.');
 const cents=Math.round(Number(raw)*100);
 if(!Number.isSafeInteger(cents)||cents<=0||cents>1000000)throw Error('Enter a delivery rate greater than R0 and no more than R10 000.');
 return cents;
}
