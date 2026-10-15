import { test, expect, type BrowserContext } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

test.beforeEach(async ({page}) => { page.on('pageerror', error => console.error('Browser runtime error:', error.message)); });

function fixture(setup = false) {
  const db = new DatabaseSync(resolve('test-results/v21-browser-data/orders.sqlite'));
  const id = randomUUID(), now = Date.now(), vendor = randomBytes(32).toString('hex'), rider = randomBytes(32).toString('hex');
  const phone = `+27${String(Math.floor(Math.random() * 900000000 + 100000000))}`;
  db.prepare('INSERT INTO stalls(id,phone,name,town,hours,is_open,takes_card,rider_phone,settings) VALUES (?,?,?,?,?,?,?,?,?)').run(id, phone, setup ? '' : 'Kasi Kota Mamelodi', setup ? '' : 'Mamelodi', '08:00–21:00', setup ? 0 : 1, 1, '+27791234567', JSON.stringify({ overrideOpen: true, overrideUntil: now + 86400000, setupStep: setup ? 3 : 9, neighbours: [{ type: 'spaza', name: 'Corner Spaza', phone: '+27811111111', enabled: true }] }));
  if(!setup)db.prepare("UPDATE stalls SET activated_at=?,settings=json_set(settings,'$.billing',json(?)) WHERE id=?").run(now,JSON.stringify({paidThrough:now+31*86400000,payments:[]}),id);
  for (const [secret, role, number] of [[vendor, 'vendor', phone], [rider, 'rider', '+27791234567']]) db.prepare('INSERT INTO sessions(hash,role,stall_id,phone,expires_at) VALUES (?,?,?,?,?)').run(createHash('sha256').update(secret).digest('hex'), role, id, number, now + 86400000);
  const products = setup ? [
    ['classic', 'Kasi Classic'], ['cheese-boy', 'Cheese'], ['russian', 'Russian'], ['breakfast', 'Breakfast'], ['chicken', 'Chicken'], ['beast', 'The Beast'],
  ].map(([key, name]) => ({ id: `${id}-${key}`, name, priceCents: null, shop: 'stall', shopName: 'Stall', enabled: true, image: `/images/kota-approved-menu.png#${key}` })) : [
    { id: `${id}-russian`, name: 'Russian Special', priceCents: 6000, shop: 'stall', shopName: 'Kasi Kota Mamelodi', enabled: true, image: '/images/kota-approved-menu.png#russian', extras: [{ id: 'egg', name: 'Extra egg', priceCents: 1000 }] },
    { id: `${id}-milk`, name: 'milk 1L', priceCents: 2299, shop: 'spaza', shopName: 'Corner Spaza', enabled: true, alternative: { name: 'Parmalat 1L', priceCents: 2199 } },
    { id: `${id}-savanna`, name: 'still water', priceCents: 3000, shop: 'spaza', shopName: 'Corner Spaza', enabled: true, alcohol: false },
  ];
  for (const item of products) db.prepare('INSERT INTO menu(id,stall_id,body) VALUES (?,?,?)').run(item.id, id, JSON.stringify(item));
  db.close(); return { id, vendor, rider };
}
async function auth(context: BrowserContext, secret: string) { await context.addCookies([{ name: 'kk_session', value: secret, url: 'http://localhost:5181', httpOnly: true, sameSite: 'Strict' }]); }

import fs from 'node:fs';




const origin='http://localhost:5181';
const post=(context:BrowserContext,path:string,data:unknown)=>context.request.post(origin+'/api'+path,{headers:{Origin:origin},data});
const folder=resolve('.local/completion-screenshots');
test('two phones agree on cancellation, cooking wins forbid cancellation, and cancelled orders stay cancelled',async({browser})=>{
 fs.mkdirSync(folder,{recursive:true});const data=fixture();
 const owner=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});await auth(owner,data.vendor);const kitchen=await owner.newPage();
 const customer=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});await post(customer,'/auth/customer',{});const mine=await customer.newPage();
 const order=async()=>{const r=await post(customer,'/orders',{stallId:data.id,requestKey:randomUUID(),customerName:'Thabo',customerPhone:'0711234567',gateNote:'1142 Mamelodi West, Gate 3',fulfilment:'delivery',method:'cash',lines:[{itemId:data.id+'-russian',quantity:1,extras:[]}]});expect(r.status()).toBe(201);return (await r.json()).order;};
 const first=await order();await kitchen.goto('/kitchen');await mine.goto('/my-orders');await expect(mine.getByRole('button',{name:'Cancel order',exact:true})).toBeVisible();await mine.screenshot({path:folder+'/01-customer-received.png',fullPage:true});
 mine.once('dialog',d=>d.accept());await mine.getByRole('button',{name:'Cancel order',exact:true}).click();await expect(mine.getByText('Cancelled',{exact:true})).toBeVisible();await expect(kitchen.getByRole('heading',{name:'Cancelled orders'})).toBeVisible();await expect(kitchen.getByRole('button',{name:'Start cooking'})).toHaveCount(0);await kitchen.screenshot({path:folder+'/02-kitchen-cancelled.png',fullPage:true,style:'.v-nav{position:static!important;transform:none!important;left:auto!important;width:100%!important;}'});await mine.getByRole('link').filter({hasText:'Cancelled'}).click();await expect(mine.getByRole('heading',{name:'Order cancelled'})).toBeVisible();await mine.screenshot({path:folder+'/03-customer-cancelled.png',fullPage:true});
 const second=await order();await mine.goto('/my-orders');await expect(kitchen.getByRole('button',{name:'Start cooking'})).toBeVisible();await kitchen.getByRole('button',{name:'Start cooking'}).click();await expect(kitchen.getByText('Cooking',{exact:true})).toBeVisible();await expect(mine.getByRole('button',{name:'Cancel order'})).toHaveCount(0);await expect(mine.getByText('Cooking',{exact:true})).toBeVisible();await kitchen.screenshot({path:folder+'/04-kitchen-cooking.png',fullPage:true,style:'.v-nav{position:static!important;transform:none!important;left:auto!important;width:100%!important;}'});expect((await post(customer,'/orders/'+second.id+'/cancel',{})).status()).toBe(409);
 const third=await order();const race=await Promise.all([post(owner,'/orders/'+third.id+'/cook',{}),post(customer,'/orders/'+third.id+'/cancel',{})]);expect(race.map(r=>r.status()).sort()).toEqual([200,409]);
 await kitchen.reload();await mine.reload();const a=await (await owner.request.get(origin+'/api/orders/'+third.id)).json(),b=await (await customer.request.get(origin+'/api/orders/'+third.id)).json();expect(a.order.state).toBe(b.order.state);expect(['cooking','cancelled']).toContain(a.order.state);expect((await owner.request.get(origin+'/api/orders/'+first.id)).status()).toBe(200);
 expect(await mine.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await owner.close();await customer.close();
});
test('private admin confirms payment, groups referral fees and records Friday payout without a second charge',async({browser})=>{
 fs.mkdirSync(folder,{recursive:true});const first=fixture(),second=fixture();const db=new DatabaseSync(resolve('test-results/v21-browser-data/orders.sqlite'));for(const [data,name] of [[first,'Test Kitchen One'],[second,'Test Kitchen Two']] as const)db.prepare("UPDATE stalls SET name=?,activated_at=NULL,referral_name='Thembi',settings=json_remove(settings,'$.billing') WHERE id=?").run(name,data.id);db.close();
 const admin=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});expect((await post(admin,'/admin/login',{key:'browser-test-admin-key-never-used-in-production'})).status()).toBe(200);const page=await admin.newPage();await page.goto('/admin');await page.getByText(/All vendors and payments/).click();
 for(const name of ['Test Kitchen One','Test Kitchen Two']){const card=page.locator('.v-card').filter({has:page.getByRole('heading',{name,exact:true})});await card.getByLabel('Payment reference').fill('SETUP-'+name);page.once('dialog',d=>d.accept());await card.getByRole('button',{name:'Confirm R300 received',exact:true}).click();await expect(card.getByText(/Paid through/)).toBeVisible();}
 const section=page.getByRole('heading',{name:'Connectors',exact:true}).locator('..');await expect(section.getByText('2 paying vendors · Owed R150 · Paid R0')).toBeVisible();await section.screenshot({path:folder+'/05-connectors-owed.png'});
 const unpaid=section.locator('.v-card').filter({has:page.getByLabel('Payout reference')}).last();await unpaid.getByLabel('Payout reference').fill('FRIDAY-EFT-001');page.once('dialog',d=>d.accept());await unpaid.getByRole('button',{name:'Mark R75 payout as PAID'}).click();await expect(section.getByText('2 paying vendors · Owed R75 · Paid R75')).toBeVisible();await section.screenshot({path:folder+'/06-connectors-paid.png'});await page.getByText('Message log',{exact:true}).click();const notice=page.locator('.v-card').filter({has:page.getByRole('link',{name:'Send manually on WhatsApp'})}).last();await expect(notice.getByRole('link',{name:'Send manually on WhatsApp'})).toHaveAttribute('href',/wa.me/);await notice.screenshot({path:folder+'/07-whatsapp-recovery.png'});await page.reload();await expect(page.getByText('2 paying vendors · Owed R75 · Paid R75')).toBeVisible();await expect(page.getByText('PAID',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await admin.close();
});
