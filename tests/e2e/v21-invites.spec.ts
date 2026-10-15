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



test('send buttons hand off valid driver and assistant invitations, and accepted members alone appear',async({browser})=>{
 const data=fixture(),folder=resolve('.local/invite-screenshots');fs.mkdirSync(folder,{recursive:true});
 const db=new DatabaseSync(resolve('test-results/v21-browser-data/orders.sqlite'));const ownerPhone=(db.prepare('SELECT phone FROM stalls WHERE id=?').get(data.id) as {phone:string}).phone;db.close();
 const owner=await browser.newContext({baseURL:'http://localhost:5181',viewport:{width:390,height:844}});await auth(owner,data.vendor);const p=await owner.newPage();let latestWhatsApp='';
 await p.route('https://wa.me/**',async route=>{latestWhatsApp=route.request().url();await route.fulfill({contentType:'text/html',body:'<h1>WhatsApp handoff captured by test</h1>'});});
 await p.goto('/owner/more#rider');await expect(p.getByRole('button',{name:'Save delivery options'})).toHaveClass(/secondary/);await expect(p.getByRole('link',{name:'Manage delivery team'})).toHaveCount(0);
 await p.getByLabel('Driver name').fill('Themba');await p.getByLabel('WhatsApp number').fill(ownerPhone);await p.getByLabel('Delivery rate (R per delivery)').fill('15,50');
 await p.getByRole('button',{name:'Send invite',exact:true}).click();await expect(p.getByRole('alert')).toContainText('own WhatsApp number');expect(owner.pages()).toHaveLength(1);expect(latestWhatsApp).toBe('');
 await p.getByLabel('WhatsApp number').fill('27791234567');await expect(p.getByRole('alert')).toHaveCount(0);
 await p.screenshot({path:folder+'/01-send-driver-invite.png',fullPage:true});
 const saved=p.waitForResponse(r=>r.url().endsWith('/api/vendor/rider')&&r.request().method()==='POST');await p.getByRole('button',{name:'Send invite',exact:true}).click();expect((await saved).status()).toBe(200);await expect(p.getByRole('heading',{name:'WhatsApp handoff captured by test'})).toBeVisible();
 const wa=new URL(latestWhatsApp);expect(wa.pathname).toBe('/27791234567');const message=wa.searchParams.get('text')!;expect(message).toContain('R15.50');const link=message.match(/http:\/\/localhost:5181\/rider\/invite\?token=[a-f0-9]{64}/)![0];
 await p.goto('/owner/more#rider');await expect(p.getByRole('heading',{name:'Invitation ready for Themba'})).toBeVisible();await expect(p.getByLabel('Driver name')).toHaveCount(0);await expect(p.getByRole('heading',{name:'Themba',exact:true})).toHaveCount(0);await p.screenshot({path:folder+'/04-invitation-return.png',fullPage:true});
 const driver=await browser.newContext({baseURL:'http://localhost:5181',viewport:{width:390,height:844}}),d=await driver.newPage();await d.goto(link);await d.getByRole('button',{name:'Accept offer'}).click();await expect(d.getByRole('heading',{name:'You’re on the team!'})).toBeVisible();await d.screenshot({path:folder+'/02-driver-accepted.png',fullPage:true});
 await expect(p.getByRole('heading',{name:'Themba',exact:true})).toBeVisible();await expect(p.getByText('Active',{exact:true})).toBeVisible();await p.screenshot({path:folder+'/03-active-delivery-team.png',fullPage:true,style:'.v-nav{position:static!important;transform:none!important;left:auto!important;width:100%!important;}'});
 // A second unique invitation is declined and never enters the visible list.
 await p.goto('/owner/delivery-team');await p.getByRole('button',{name:'Done',exact:true}).click();await p.getByLabel('Driver name').fill('Declined Driver');await p.getByLabel('WhatsApp number').fill('0782222222');await p.getByLabel('Delivery rate (R per delivery)').fill('20');await p.getByRole('button',{name:'Send invite',exact:true}).click();await expect(p.getByRole('heading',{name:'WhatsApp handoff captured by test'})).toBeVisible();const declinedLink=new URL(latestWhatsApp).searchParams.get('text')!.match(/http:\/\/localhost:5181\/rider\/invite\?token=[a-f0-9]{64}/)![0];expect(declinedLink).not.toBe(link);await d.goto(declinedLink);await d.getByRole('button',{name:'Decline offer'}).click();await expect(d.getByText(/You declined this invitation/)).toBeVisible();await p.goto('/owner/more#rider');await expect(p.getByRole('heading',{name:'Declined Driver',exact:true})).toHaveCount(0);
 await p.goto('/owner/assistants');await expect(p.getByLabel('Delivery rate (R per delivery)')).toHaveCount(0);await p.screenshot({path:folder+'/05-assistant-form.png',fullPage:true});await p.getByLabel('Name',{exact:true}).fill('Lerato');await p.getByLabel('WhatsApp number').fill('\u200e+27 78 111 1111');await p.getByRole('button',{name:'Send invite',exact:true}).click();await expect(p.getByRole('heading',{name:'WhatsApp handoff captured by test'})).toBeVisible();const assistantText=new URL(latestWhatsApp).searchParams.get('text')!;expect(assistantText).not.toMatch(/R[0-9]|per delivery|per run/);const assistantLink=assistantText.match(/http:\/\/localhost:5181\/team\/invite\?token=[a-f0-9]{64}/)![0];
 const helper=await browser.newContext({baseURL:'http://localhost:5181',viewport:{width:390,height:844}}),a=await helper.newPage();await a.goto(assistantLink);await a.getByRole('button',{name:'Accept invitation'}).click();await a.getByRole('link',{name:'Open my kitchen'}).click();await expect(a.getByRole('heading',{name:'Kitchen',exact:true})).toBeVisible();await p.goto('/owner/assistants');await expect(p.getByRole('heading',{name:'Lerato',exact:true})).toBeVisible();
 await p.goto('/owner/more#rider');p.once('dialog',dialog=>dialog.accept());await p.getByRole('button',{name:'Remove Themba',exact:true}).click();await expect(p.getByRole('heading',{name:'Themba',exact:true})).toHaveCount(0);expect((await driver.request.get('/api/orders')).status()).toBe(401);
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await owner.close();await driver.close();await helper.close();
});

 test('food and next-door quantities update a live Rand cart bar',async({page})=>{
 const data=fixture();await page.goto('/stall/'+data.id);await page.getByRole('button',{name:'+ Add',exact:true}).click();await expect(page.getByRole('link',{name:'1 item - R60.00 - View order'})).toBeVisible();await page.getByRole('button',{name:'Add one Russian Special'}).click();await expect(page.getByRole('link',{name:'2 items - R120.00 - View order'})).toBeVisible();await page.getByRole('button',{name:'Remove one Russian Special'}).click();await page.screenshot({path:'.local/invite-screenshots/06-menu-cart.png',fullPage:true});
 await page.goto('/stall/'+data.id+'/next-door');await page.getByRole('button',{name:'+ Add',exact:true}).first().click();await expect(page.getByRole('link',{name:'2 items - R82.99 - View order'})).toBeVisible();await page.getByRole('button',{name:'Add one milk 1L'}).click();await expect(page.getByRole('link',{name:'3 items - R105.98 - View order'})).toBeVisible();await page.getByRole('button',{name:'Remove one milk 1L'}).click();await page.getByRole('button',{name:'Remove one milk 1L'}).click();await expect(page.getByRole('link',{name:'1 item - R60.00 - View order'})).toBeVisible();await page.getByRole('button',{name:'+ Add',exact:true}).first().click();await page.screenshot({path:'.local/invite-screenshots/07-spaza-cart.png',fullPage:true});await page.getByRole('link',{name:'2 items - R82.99 - View order'}).click();await expect(page).toHaveURL(new RegExp('/stall/'+data.id+'/order$'));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
