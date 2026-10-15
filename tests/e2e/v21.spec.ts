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

test('manual onboarding confirms its saved request and allows retry after failure', async ({page,context})=>{
  await context.route('https://wa.me/**',route=>route.fulfill({body:'WhatsApp request handoff'}));
  await page.goto('/verify');await page.getByLabel('WhatsApp number').fill('0795550123');
  await context.route('**/api/auth/code',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Connection interrupted. Please retry.'})}));
  await page.getByRole('button',{name:'Get my code',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry request'})).toBeVisible();
  await expect(page.getByText(/Request sent to Thandi/)).toHaveCount(0);
  await context.unroute('**/api/auth/code');
  await page.getByRole('button',{name:'Retry request'}).click();
  await expect(page.getByRole('status')).toContainText('Request sent to Thandi’s admin inbox at');
  const requestPopup=context.pages().find(p=>p!==page)!;await requestPopup.waitForURL('https://wa.me/**');expect(new URL(requestPopup.url()).searchParams.get('text')).toContain('+27795550123');await requestPopup.close();await page.bringToFront();
  const link=await page.getByRole('link',{name:'Send request on WhatsApp'}).getAttribute('href');
  expect(new URL(link!).searchParams.get('text')).toContain('+27795550123');
  await page.reload();await expect(page.getByLabel('Four-digit code')).toBeVisible();
});

test('shop editor uses shared images and marks packaged stock sold out for customers', async ({ page, context }) => {
  const data = fixture(); await auth(context, data.vendor);
  await page.goto('/owner/next-door');
  await page.getByRole('button', { name: /Corner Spaza/ }).click();
  await page.getByLabel('Sprite 2L', { exact: true }).check();
  const product = page.locator('section.v-card').filter({ has: page.getByLabel('Sprite 2L', { exact: true }) });
  await product.getByLabel('Price · R', { exact: true }).fill('25');
  await product.getByLabel('Sold out today').check();
  await expect(product.getByAltText('Sprite 2L')).toBeVisible();
  await expect(product.getByLabel('Optional replacement')).toHaveCount(0);
  await expect(page.getByLabel('Alternative price · R')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save shop', exact: true }).click();
  await expect(page.getByRole('button', { name: /Corner Spaza/ })).toBeVisible();
  await page.goto(`/stall/${data.id}/next-door`);
  await expect(page.getByRole('button', { name: 'Sold out today' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/next-door-stock-mobile.png', fullPage: true });
});

test('three separate browsers complete one mixed order with omission and refreshed server state', async ({ browser }) => {
  test.setTimeout(300000);
  const data = fixture(), customerContext = await browser.newContext({ baseURL: 'http://localhost:5181', viewport: { width: 390, height: 844 } }), ownerContext = await browser.newContext({ baseURL: 'http://localhost:5181', viewport: { width: 390, height: 844 } }), riderContext = await browser.newContext({ baseURL: 'http://localhost:5181', viewport: { width: 390, height: 844 } });
  await auth(ownerContext, data.vendor); await auth(riderContext, data.rider);
  const customer = await customerContext.newPage(), owner = await ownerContext.newPage(), rider = await riderContext.newPage();
  const errors: string[] = []; for (const page of [customer, owner, rider]) page.on('pageerror', error => errors.push(error.message));
  await customer.goto(`/stall/${data.id}`); await customer.getByRole('link', { name: /Russian Special/ }).click(); await customer.getByLabel('Extra egg').check(); await customer.getByRole('button', { name: 'Add to order · R70' }).click();
  await customer.locator('.v-card').filter({ has: customer.getByRole('heading', { name: 'milk 1L' }) }).getByRole('button', { name: '+ Add' }).click();
  await expect(customer.locator('.v-alternative')).toHaveCount(0);
  await customer.locator('.v-card').filter({ has: customer.getByRole('heading', { name: 'still water' }) }).getByRole('button', { name: '+ Add' }).click();
  await customer.getByRole('link', { name: 'View your order', exact: true }).click();
  await expect(customer.getByText('R122,99', { exact: true })).toBeVisible();
  await customer.getByLabel('Name', { exact: true }).fill('Thabo'); await customer.getByLabel('Phone', { exact: true }).fill('0711234567'); await customer.getByLabel('Address and gate note').fill('1142 Mamelodi West · Gate 3 · call first');
  await customer.getByRole('button', { name: 'Send order' }).click(); await expect(customer.getByRole('heading', { name: 'Kasi Kota Mamelodi has your order.' })).toBeVisible();
  await customer.reload(); await expect(customer.getByText('Order #1', { exact: true })).toBeVisible();
  await owner.goto('/kitchen'); await expect(owner.getByText(/Customer pays R122,99 at the gate/)).toBeVisible();
  await rider.goto('/rider'); await expect(rider.getByRole('heading', { name: 'Nothing yet' })).toBeVisible();
  await owner.getByRole('button', { name: 'Ready for delivery', exact: true }).click();
  await expect(rider.getByRole('heading', { name: 'RUN #1 · R10 for you' })).toBeVisible();
  await expect(rider.getByRole('button', { name: 'Delivered', exact: true })).toBeDisabled();
  await rider.getByRole('button', { name: 'Got it', exact: true }).first().click();
  await rider.getByRole('button', { name: 'Got it', exact: true }).first().click();
  await expect(rider.locator('.v-stop.active')).toContainText('still water');
  await rider.locator('.v-stop.active').getByRole('button', { name: 'Not there — leave out', exact: true }).last().click();
  await expect(rider.getByText('Left out',{exact:true})).toBeVisible();
  await expect(rider.getByRole('button',{name:'Delivered',exact:true})).toBeEnabled();
  await customer.bringToFront(); await customer.reload(); await expect(customer.getByText('R92,99', { exact: true })).toBeVisible();
  await rider.bringToFront(); await rider.getByRole('button', { name: 'Delivered', exact: true }).click(); await customer.bringToFront(); await expect(customer.getByRole('heading', { name: 'Enjoy.' })).toBeVisible();
  await owner.getByRole('link', { name: 'Money', exact: true }).click(); await expect(owner.getByText('R60', { exact: true })).toBeVisible();
  await expect(rider.getByText(/you spent R22,99 at shops · give Kasi Kota Mamelodi R70/)).toBeVisible();
  for (const page of [customer, owner, rider]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await owner.screenshot({ path: 'test-results/v21-money-mobile.png', fullPage: true }); await rider.screenshot({ path: 'test-results/v21-rider-mobile.png', fullPage: true });
  expect(errors).toEqual([]); await Promise.all([customerContext.close(), ownerContext.close(), riderContext.close()]);
});

test('first-time setup retains blank prices, optional steps, and exact share text', async ({ page, context }) => {
  const data = fixture(true); await auth(context, data.vendor); await page.goto('/setup/3');
  await expect(page.getByLabel('Stall name')).toHaveValue(''); await page.getByLabel('Stall name').fill('Tumi’s Kotas'); await page.getByLabel('Town', { exact: true }).fill('Soweto'); await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your food menu' })).toBeVisible(); await expect(page.getByLabel('Price for Kasi Classic')).toHaveValue(''); await page.getByLabel('Price for Kasi Classic').fill('40'); await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Do this later' }).click(); await expect(page.getByLabel('Day and night08:00–21:00')).toBeChecked(); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.getByRole('button', { name: 'No', exact: true }).click(); await page.getByRole('button', { name: 'Do this later' }).click();
  await expect(page.getByRole('heading', { name: 'Tumi’s Kotas is live.' })).toBeVisible();
  const share = await page.getByRole('link', { name: 'Share my stall on WhatsApp' }).getAttribute('href');
  const message=new URL(share!).searchParams.get('text')!;
  expect(message).toContain('*Tumi’s Kotas*');expect(message).toContain('official digital menu');expect(message).toContain('https://move.kasiaihub.com/stall/'+data.id);expect(message).not.toContain('cash or card');
  await page.getByText('My stall QR for WhatsApp Status',{exact:true}).click();
  await expect(page.getByAltText('Menu QR for Tumi’s Kotas')).toBeVisible();
  await expect(page.getByRole('link',{name:'Save stall QR picture'})).toHaveAttribute('download','my-stall-menu-qr.png');
  const html=await (await page.request.get('/stall/'+data.id)).text();expect(html).toContain('Tumi’s Kotas · Order from our digital menu');
  await page.goto(`/stall/${data.id}`); await expect(page.getByRole('heading', { name: 'Kasi Classic', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Russian', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: /Russian/ })).toHaveCount(0); await expect(page.locator('.v-products .product-artwork')).toHaveCount(6); await page.screenshot({path:'test-results/six-default-kotas.png',fullPage:true});
});

test('phone, tablet and desktop menu and owner More keep usable layout and current vocabulary', async ({ browser }) => {
  test.setTimeout(240000);
  const data = fixture();
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ baseURL: 'http://localhost:5181', viewport: { width, height: 960 } }); await auth(context, data.vendor); const page = await context.newPage();
    for (const route of [`/stall/${data.id}`, '/owner/menu', '/owner/more', '/owner/next-door', '/owner/keep']) {
      await page.goto(route); await expect(page.locator('h1')).toBeVisible();
      const text = await page.locator('body').innerText(); expect(text).not.toMatch(/\b(ticket|escrow|gateway|sub-account|catalogue|demo|PIN|settlement|payout)\b/i);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.goto(`/stall/${data.id}`); await page.screenshot({ path: `test-results/v21-menu-${width}.png`, fullPage: true }); await context.close();
  }
});

test('real manual code is private, logs in once, and restores the same vendor on another phone', async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.context().route('https://wa.me/**', route => route.fulfill({ body: 'Test handoff' }));
  const phone = '08' + String(Math.floor(Math.random() * 90000000 + 10000000));
  await page.context().route('https://wa.me/**',route=>route.fulfill({body:'WhatsApp request handoff'}));
  await page.goto('/setup/1'); await page.getByRole('link', { name: 'Start', exact: true }).click(); await page.getByLabel('WhatsApp number').fill(phone); await page.getByRole('button', { name: 'Get my code' }).click();
  await expect(page.getByRole('status')).toContainText('Request sent to Thandi’s admin inbox at');
  await expect(page.getByLabel('Four-digit code')).toBeVisible();
  const adminContext = await browser.newContext({baseURL:'http://localhost:5181'}), admin = await adminContext.newPage();
  await adminContext.route('https://wa.me/**', route => route.fulfill({ body: 'Test handoff' }));
  await admin.goto('/admin?phone='+encodeURIComponent(phone)+'#access=browser-test-admin-key-never-used-in-production');
  await admin.getByRole('button',{name:'Keep admin signed in on my device',exact:true}).click();
  await expect(admin.getByRole('button',{name:'Signed in for 30 days on this device'})).toBeVisible();
  const card = admin.locator('.v-card').filter({hasText:'+27'+phone.slice(1)}).filter({has:admin.getByRole('button',{name:'Send code on WhatsApp'})});
  const sendPopup=adminContext.waitForEvent('page');
  await card.getByRole('button', { name: 'Send code on WhatsApp' }).click();
  await (await sendPopup).waitForURL('https://wa.me/**'); await admin.bringToFront();
  const generated = admin.locator('.v-card').filter({hasText:'+27'+phone.slice(1)}).filter({has:admin.getByRole('button',{name:'Send code on WhatsApp'})});
  await expect(generated.locator('b')).toHaveText(/^[0-9]{4}$/);
  const code = await generated.locator('b').innerText();
  await page.bringToFront(); await page.reload(); await expect(page.getByLabel('WhatsApp number')).toHaveValue(phone);
  await expect(page.getByLabel('Four-digit code')).toBeVisible();
  await page.getByLabel('Four-digit code').fill(code==='0000'?'1111':'0000');
  await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByRole('alert')).toContainText('incorrect');
  await page.getByLabel('Four-digit code').fill(code);await expect(page.getByRole('alert')).toHaveCount(0);
  let redundant=0;page.on('request',request=>{if(['/api/session','/api/vendor/stall'].includes(new URL(request.url()).pathname))redundant++;});
  await page.getByRole('button',{name:'Continue',exact:true}).click(); await expect(page).toHaveURL(new RegExp("setup/3$"));
  await expect(page.getByLabel('Stall name')).toHaveValue('');expect(redundant).toBe(0);
  const sessionCookie=(await page.context().cookies()).find(cookie=>cookie.name==='kk_session')!;
  expect(sessionCookie.httpOnly).toBe(true);expect(sessionCookie.expires-Date.now()/1000).toBeGreaterThan(29*86400);
  await page.reload();await expect(page.getByLabel('Stall name')).toBeVisible();
  await admin.getByRole('button',{name:'Sign out of admin',exact:true}).click();
  await expect(admin.getByRole('heading',{name:'Admin sign-in'})).toBeVisible();
  await admin.getByLabel('Private admin key or link').fill('browser-test-admin-key-never-used-in-production');
  await admin.getByLabel('Keep me signed in for 30 days on my own device').check();
  await admin.getByRole('button',{name:'Open login requests',exact:true}).click();
  await expect(admin.getByRole('heading',{name:'Login requests',exact:true})).toBeVisible();
  await expect(admin.locator('.v-login-code')).toHaveCount(0);
  await adminContext.close();
});
test('owner orders as a customer, returns to kitchen, and retains both authenticated identities', async ({ page, context, browser }) => {
  const data = fixture(); await auth(context, data.vendor);
  await page.goto('/stall/' + data.id); await expect(page.getByRole('button', {name:'Owner view'})).toBeVisible();
  await page.getByRole('link', {name:/Russian Special/}).click(); await page.getByLabel('Extra egg').check();
  await page.getByRole('button',{name:'Add to order · R70'}).click();
  await page.getByRole('link',{name:'View your order',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Owner test'); await page.getByLabel('Phone',{exact:true}).fill('0711234567');
  await page.getByLabel('Address and gate note').fill('Gate 1 Mamelodi'); await page.getByRole('button',{name:'Send order'}).click();
  await expect(page.getByRole('heading',{name:'Kasi Kota Mamelodi has your order.'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Order route'}).locator('li')).toHaveCount(2);
  await expect(page.getByRole('region',{name:'Order route'})).not.toContainText('Corner Spaza');
  await page.reload(); await page.getByRole('button',{name:'Owner view'}).click();
  await expect(page).toHaveURL(/\/kitchen$/); await expect(page.getByText(/Customer pays R70 at the gate/)).toBeVisible();
  await page.reload(); await expect(page.getByText(/Customer pays R70 at the gate/)).toBeVisible();
  await page.goto('/stall/' + data.id); await page.getByRole('button',{name:'My orders',exact:true}).click();
  await expect(page).toHaveURL(/\/my-orders$/); await expect(page.getByRole('link',{name:/#1 · R70/})).toBeVisible();
  await page.getByRole('button',{name:'Owner view'}).click(); await expect(page).toHaveURL(/\/kitchen$/);
  const stranger = await browser.newContext(); expect((await stranger.request.post('http://localhost:5181/api/auth/owner',{data:{},headers:{Origin:'http://localhost:5181'}})).status()).toBe(401); await stranger.close();
});

test('owner can add a local shop item and edit Kota extras', async ({page,context}) => {
  const data = fixture(); await auth(context,data.vendor);
  await page.goto('/owner/next-door'); await page.getByRole('button',{name:/Corner Spaza/}).click();
  await page.getByRole('button',{name:'+ Add your own item'}).click(); await page.getByLabel('Item name and pack size').last().fill('Mama mango achaar 250g');
  await page.getByLabel('Price · R',{exact:true}).last().fill('18'); await page.getByRole('button',{name:'Save shop'}).click();
  await expect(page.getByRole('button',{name:/Corner Spaza/})).toBeVisible(); await page.reload();
  await page.getByRole('button',{name:/Corner Spaza/}).click(); await expect(page.getByLabel('Item name and pack size').last()).toHaveValue('Mama mango achaar 250g');
  await page.goto('/owner/menu');
  await page.getByRole('checkbox',{name:'Chakalaka',exact:true}).check();
  await page.getByLabel('Price for Chakalaka · R',{exact:true}).fill('7');
  await page.getByRole('button',{name:'Save extras for all food',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save extras for all food',exact:true})).toBeEnabled();
  await page.goto('/stall/' + data.id + '/kota/' + data.id + '-russian'); await expect(page.getByLabel('Chakalaka')).toBeVisible();
  await page.getByLabel('Chakalaka').check(); await expect(page.getByRole('button',{name:'Add to order · R67'})).toBeVisible();
  await page.screenshot({path:'test-results/customer-extras.png',fullPage:true});
});


test('top view switch works both ways and onboarding shows six replaceable default images', async ({page,context}) => {
  const data=fixture(); await auth(context,data.vendor);
  await page.goto('/owner/more'); await expect(page.getByText('See my stall as a customer',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Owner view',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Customer view',exact:true}).click(); await expect(page).toHaveURL('/stall/'+data.id);
  await expect(page.getByRole('button',{name:'Customer view',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload(); await page.getByRole('button',{name:'Owner view',exact:true}).click(); await expect(page).toHaveURL(/\/kitchen$/);
  const fresh=fixture(true); await auth(context,fresh.vendor); await page.goto('/setup/5');
  await expect(page.locator('.v-photo-grid .product-artwork')).toHaveCount(6);
  await page.getByRole('button',{name:'Add photo of Kasi Classic',exact:true}).click(); await expect(page.getByRole('button',{name:'Gallery',exact:true})).toBeVisible();
  await page.goto('/setup/1?restart=1'); await expect(page.getByRole('heading',{name:"Let's open your stall."})).toBeVisible();
  await page.getByRole('link',{name:'Start',exact:true}).click(); await expect(page.getByLabel('WhatsApp number')).toBeVisible();
  await expect(page.getByRole('navigation',{name:'App view'})).toHaveCount(0);
});

test('single-tap rider invite and ten-item fresh spaza setup', async ({page,context}) => {
  test.setTimeout(180000);
  const data=fixture(true); await auth(context,data.vendor);
  await context.route('https://wa.me/**',route=>route.fulfill({body:'WhatsApp test handoff'}));
  await page.goto('/owner/more#rider');
  await page.getByLabel('Your offer per completed run (R)').fill('10');
  const popupPromise=context.waitForEvent('page');
  await page.getByRole('button',{name:'Re-send invite',exact:true}).click();
  const popup=await popupPromise; await popup.waitForURL('https://wa.me/**'); await page.bringToFront();
  expect(new URL(popup.url()).searchParams.get('text')).toContain('/rider/invite?token=');
  await expect(page.getByRole('link',{name:'Send delivery invitation on WhatsApp'})).toHaveCount(0);
  await page.goto('/owner/next-door'); await page.getByRole('button',{name:/Corner Spaza/}).click();
  await expect(page.locator('form section.v-card')).toHaveCount(10);
  await expect(page.getByLabel('Optional replacement')).toHaveCount(0);
  await expect(page.getByLabel('Huletts White Sugar 250g',{exact:true})).toBeVisible();
});

test('alcohol testing uses branded pictures and requires the customer age checkbox', async ({page,context}) => {
  test.setTimeout(180000);
  const data=fixture(); await auth(context,data.vendor);
  await page.goto('/owner/next-door'); await page.getByRole('button',{name:/Sbu's place/}).click();
  await page.getByLabel('Savanna Dry 500ml',{exact:true}).check();
  const drink=page.locator('section.v-card').filter({has:page.getByLabel('Savanna Dry 500ml',{exact:true})});
  await drink.getByLabel('Price · R',{exact:true}).fill('30');
  await page.getByRole('button',{name:'Save shop',exact:true}).click();
  await expect(page.getByRole('button',{name:/Sbu's place/})).toBeVisible();
  await page.goto('/stall/'+data.id+'/next-door');
  await expect(page.getByText('Alcohol selection is open for testing. 18+ only.')).toBeVisible();
  const card=page.locator('.v-card').filter({has:page.getByRole('heading',{name:'Savanna Dry 500ml',exact:true})});
  await expect(card.getByAltText('Savanna Dry 500ml')).toBeVisible(); await card.getByRole('button',{name:'+ Add',exact:true}).click();
  await page.getByRole('link',{name:'View your order',exact:true}).click();
  await expect(page.getByLabel('I confirm that I am 18 years and older')).not.toBeChecked();
  await expect(page.getByLabel('I confirm that I am 18 years and older')).toHaveAttribute('required','');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('updated plan, atomic setup and rider consent work on mobile', async ({page,context,browser})=>{
  test.setTimeout(240000);
  const data=fixture(true);await auth(context,data.vendor);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/setup/3',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Stall name',{exact:true}).fill('Fresh offer stall');
  await page.getByLabel('Town',{exact:true}).fill('Soweto');
  const saves:string[]=[];page.on('request',request=>{if(request.method()==='PUT')saves.push(new URL(request.url()).pathname);});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your food menu'})).toBeVisible();
  expect(saves).toEqual(['/api/vendor/setup']);
  saves.length=0;
  await page.getByLabel('Price for Kasi Classic',{exact:true}).fill('45');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Photos',exact:true})).toBeVisible();
  expect(saves).toEqual(['/api/vendor/setup']);
  await page.goto('/owner/keep',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Open my stall',exact:true})).toBeVisible();
  await expect(page.getByText(/Launch price: R300 once-off setup/)).toBeVisible();
  const qr=page.getByAltText('QR code for https://move.kasiaihub.com');
  await expect(qr).toBeVisible();
  await expect.poll(()=>qr.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  for(const width of [390,768,1280]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.screenshot({path:'test-results/keep-stall-plan.png',fullPage:true});
  const response=await context.request.post('/api/vendor/rider',{headers:{Origin:'http://localhost:5181'},data:{phone:'0791234567',feeCents:1750}});
  expect(response.ok()).toBe(true);
  const link=(await response.json()).link;
  const message=new URL(link).searchParams.get('text')!;
  const token=message.match(/token=([a-f0-9]{64})/)![1];
  const riderContext=await browser.newContext({baseURL:'http://localhost:5181',viewport:{width:390,height:844}});
  const rider=await riderContext.newPage();
  await rider.goto('/rider/invite?token='+token,{waitUntil:'domcontentloaded'});
  await expect(rider.getByText('R17,50 per run',{exact:true})).toBeVisible();
  await expect(rider.getByRole('button',{name:'Decline offer'})).toBeVisible();
  await rider.getByRole('button',{name:'Accept offer'}).click();
  await expect(rider.getByRole('heading',{name:'Today',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
  await riderContext.close();
});

test('normal loading has no retry error and a failed load can recover',async({page,context})=>{
  const data=fixture();await auth(context,data.vendor);
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await context.route('**/api/vendor/stall',async route=>{await gate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary connection problem.'})});});
  await page.goto('/owner/menu');await expect(page.getByRole('heading',{name:'Opening Kasi Move'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Try loading again'})).toHaveCount(0);
  release();await expect(page.getByRole('button',{name:'Try loading again'})).toBeVisible();
  await context.unroute('**/api/vendor/stall');await page.getByRole('button',{name:'Try loading again'}).click();
  await expect(page.getByRole('heading',{name:'My food menu'})).toBeVisible();
});
test('returning customer details and delivery choices survive a reload',async({page})=>{
  const data=fixture();
  await page.goto('/stall/'+data.id);
  await page.getByRole('link',{name:/Russian Special/}).click();await page.getByRole('button',{name:/Add to order/}).click();
  await page.getByRole('link',{name:'View your order',exact:true}).click();
  await expect(page.getByRole('radio',{name:'Delivery',exact:true})).toBeVisible();
  await expect(page.getByRole('radio',{name:'Collection',exact:true})).toBeVisible();
  await page.getByLabel('Name',{exact:true}).fill('Returning customer');await page.getByLabel('Phone',{exact:true}).fill('0715550123');await page.getByLabel('Address and gate note').fill('20 Test Street, blue gate');
  await page.getByRole('button',{name:'Send order',exact:true}).click();await expect(page).toHaveURL(/\/order\//);
  await page.goto('/stall/'+data.id);await page.getByRole('link',{name:/Russian Special/}).click();await page.getByRole('button',{name:/Add to order/}).click();await page.getByRole('link',{name:'View your order',exact:true}).click();await page.reload();
  await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Returning customer');await expect(page.getByLabel('Phone',{exact:true})).toHaveValue('+27715550123');await expect(page.getByLabel('Address and gate note')).toHaveValue('20 Test Street, blue gate');
});
test('fresh delivery setup requires an explicit choice and photo guidance follows photos',async({page,context})=>{
  const data=fixture(true);const db=new DatabaseSync(resolve('test-results/v21-browser-data/orders.sqlite'));db.prepare('UPDATE stalls SET rider_phone=NULL WHERE id=?').run(data.id);db.close();await auth(context,data.vendor);
  await page.goto('/setup/8');await expect(page.getByRole('radio',{name:'Collection only',exact:true})).not.toBeChecked();await expect(page.getByRole('radio',{name:'Collection and delivery',exact:true})).not.toBeChecked();await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  await page.getByRole('radio',{name:'Collection and delivery',exact:true}).check();await expect(page.getByLabel('Delivery person’s WhatsApp')).toBeVisible();
  await page.goto('/setup/5');await expect(page.getByRole('heading',{name:'Show your own food'})).toBeVisible();
  expect(await page.evaluate(()=>{const grid=document.querySelector('.v-photo-grid')!,note=Array.from(document.querySelectorAll('h2')).find(n=>n.textContent==='Show your own food')!;return Boolean(grid.compareDocumentPosition(note)&Node.DOCUMENT_POSITION_FOLLOWING);})).toBe(true);
});
test('launch pricing uses the exact Paystack link at mobile and desktop widths',async({page,context})=>{
  const data=fixture(true);await auth(context,data.vendor);
  await context.route('https://paystack.shop/pay/kasi-move-setup',route=>route.fulfill({body:'Payment link checked without making a payment'}));
  await page.goto('/owner/keep');
  for(const width of [390,768,1280]){
    await page.setViewportSize({width,height:844});
    await expect(page.getByText('Launch price: R300 once-off setup - includes your first month.',{exact:false})).toBeVisible();
    const button=page.getByRole('link',{name:'Pay R300 - Open my stall',exact:true});
    await expect(button).toHaveAttribute('href','https://paystack.shop/pay/kasi-move-setup');await expect(button).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/launch-pricing-mobile.png',fullPage:true});
  const opened=context.waitForEvent('page');await page.getByRole('link',{name:'Pay R300 - Open my stall',exact:true}).click();const checkout=await opened;await checkout.waitForURL('https://paystack.shop/pay/kasi-move-setup');await checkout.close();
  const response=await context.request.get('/api/vendor/activation');expect((await response.json()).activated).toBe(false);
  await expect(page.locator('body')).not.toContainText(/R499|R649|R500|free trial|trial days|November/i);
});

test('sharing reflects delivery and card settings and unpaid opening explains the payment requirement',async({page,context})=>{
  const data=fixture(true);await auth(context,data.vendor);
  await page.goto('/kitchen');
  await expect(page.getByText('Not accepting orders — your plan payment needs confirmation.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open now',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('plan payment is confirmed');
  const status=await context.request.get('/api/stalls/'+data.id);expect((await status.json()).open).toBe(false);
  const db=new DatabaseSync(resolve('test-results/v21-browser-data/orders.sqlite'));db.prepare("UPDATE stalls SET rider_phone=?,takes_card=1,settings=json_set(settings,'$.deliveryEnabled',json('true')) WHERE id=?").run('+27791234567',data.id);db.close();
  await page.reload();
  const shared=decodeURIComponent(await page.getByRole('link',{name:'Share my stall on WhatsApp',exact:true}).first().getAttribute('href')||'');
  expect(shared).toContain('official digital menu');expect(shared).toContain('delivery to your gate');expect(shared.split('\n')[0]).toContain('https://move.kasiaihub.com/stall/'+data.id);expect(shared.length).toBeLessThan(500);expect(shared).toContain('speed point');
  const saved=await context.request.put('/api/vendor/settings',{headers:{Origin:'http://localhost:5181'},data:{deliveryEnabled:false}});expect(saved.ok()).toBe(true);await page.reload();
  const collection=decodeURIComponent(await page.getByRole('link',{name:'Share my stall on WhatsApp',exact:true}).first().getAttribute('href')||'');
  expect(collection).toContain('collect from our stall');expect(collection).not.toContain('speed point');expect(collection).not.toContain('at your gate');
});

test('referral URL survives signup navigation, stays editable, and generates vendor sharing',async({page,context})=>{
 await page.goto('/?ref=thembi');await page.getByRole('link',{name:'Start',exact:true}).click();const field=page.getByLabel('Who sent you? (referral name)');await expect(field).toHaveValue('thembi');await field.fill('Nomsa');await page.reload();await expect(field).toHaveValue('thembi');
 await field.fill('Nomsa');await page.goto('/verify');await expect(page.getByLabel('Who sent you? (referral name)')).toHaveValue('Nomsa');
 const data=fixture();const db=new DatabaseSync(resolve('test-results/v21-browser-data/orders.sqlite'));db.prepare('UPDATE stalls SET name=?,referral_name=? WHERE id=?').run('Thandis Corner','Nomsa',data.id);db.close();await auth(context,data.vendor);await page.goto('/setup/9');const share=page.getByRole('link',{name:'Share Kasi Move on WhatsApp',exact:true});await expect(share).toBeVisible();const url=new URL((await share.getAttribute('href'))!);expect(url.searchParams.get('text')).toBe('Open your stall online with Kasi Move: move.kasiaihub.com/?ref=tsholoscorner');
 await page.goto('/owner/next-door');await expect(page.getByRole('button',{name:/tavern/i})).toHaveCount(0);await expect(page.locator('body')).not.toContainText(/Sbu/);
});

test('fixed next-door save includes a real gallery upload and one combined shop message', async ({page,context}) => {
  const data = fixture(); await auth(context,data.vendor); await page.goto('/owner/next-door');
  await page.getByRole('button',{name:/Corner Spaza/}).click();
  await page.getByLabel('Shop name').fill('Corner drinks');
  await expect(page.getByLabel('Savanna Dry 500ml',{exact:true})).toHaveCount(0);
  await page.getByLabel('still water',{exact:true}).check();
  await page.locator('section.v-card').filter({has:page.getByLabel('still water',{exact:true})}).getByLabel('Price · R',{exact:true}).fill('14');
  await page.getByRole('button',{name:'Add photo of still water'}).click();
  await page.locator('section.v-card').filter({has:page.getByLabel('still water',{exact:true})}).locator('input[type=file]:not([capture])').setInputFiles(resolve('public/images/products/valpre-water.jpg'));
  await expect(page.locator('section.v-card').filter({has:page.getByLabel('still water',{exact:true})}).locator('.v-photo img')).toHaveAttribute('src',new RegExp('/photos/'));
  await page.getByRole('button',{name:'Save shop',exact:true}).click();
  const message = page.getByRole('link',{name:'Send the shop its WhatsApp message'}); await expect(message).toBeVisible();
  expect(decodeURIComponent(await message.getAttribute('href') || '')).toContain('still water on her menu');
  const stall = await (await page.request.get(`/api/stalls/${data.id}`)).json();
  const water = stall.menu.find((item: {name:string}) => item.name === 'still water');
  expect(water.priceCents).toBe(1400); const image = await page.request.get(water.image); expect(image.ok()).toBe(true); expect(image.headers()['content-type']).toBe('image/jpeg');
  await page.goto(`/stall/${data.id}/next-door`); await expect(page.getByRole('img',{name:'still water'})).toBeVisible();
});
