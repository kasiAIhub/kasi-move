import { metaWhatsApp } from '../src/server/meta-whatsapp';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi } from '../src/server/api';
import type { Database, Statement } from '../src/server/database';
import type { WhatsApp } from '../src/server/whatsapp';
import { whatsapp } from '../src/server/whatsapp';
import { packagedProducts } from '../src/server/next-door';
import type { GateOrder } from '../src/server/contracts';

// Real SQLite file, same generated migration and prepared SQL as the D1 implementation.
class SqliteDatabase implements Database {
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string): Statement {
    const make = (args: unknown[]): Statement => ({
      bind: (...values) => make(values),
      first: async <T>() => (this.sqlite.prepare(sql).get(...args as never[]) as T) ?? null,
      all: async <T>() => ({ results: this.sqlite.prepare(sql).all(...args as never[]) as T[] }),
      run: async () => ({ meta: { changes: Number(this.sqlite.prepare(sql).run(...args as never[]).changes) } }),
    });
    return make([]);
  }
  async batch(statements: Statement[]) {
    this.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
describe('v2.1 shared server foundation', () => {
  let folder: string, sqlite: DatabaseSync, db: SqliteDatabase;
  let api: ReturnType<typeof createApi>, time: number;
  let inviteToken: string, rejectCode: boolean;
  const provider: WhatsApp = {
    async sendCode() {},
    async checkCode(_phone, code) { return !rejectCode && code === '8492'; },
    async sendRiderInvite(_phone, _stall, value) { inviteToken = value; },
  };
  beforeEach(() => {
    time = Date.parse('2026-09-08T10:00:00Z'); rejectCode = false; inviteToken = '';
    folder = mkdtempSync(join(tmpdir(), 'kasi-server-'));
    sqlite = new DatabaseSync(join(folder, 'orders.sqlite'));
    sqlite.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) sqlite.exec(readFileSync(join('drizzle', file), 'utf8'));
    db = new SqliteDatabase(sqlite); api = createApi(db, provider, () => time,{activationKey:'test-team-key-not-used-in-production-1234'});
  });
  afterEach(() => { sqlite.close(); rmSync(folder, { recursive: true, force: true }); });
  async function call(path: string, method = 'GET', data?: unknown, cookie = '') {
    const response = await api(new Request(`https://kasi.test/api${path}`, {
      method, headers: { Origin: 'https://kasi.test', Cookie: cookie },
      body: data === undefined ? undefined : JSON.stringify(data),
    }));
    const result=await response.json(); if(path==='/vendor/rider'&&result.link){const message=new URL(result.link).searchParams.get('text')||'';inviteToken=message.match(/token=([a-f0-9]{64})/)?.[1]||'';}
    return { status: response.status, body: result, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
  }
  async function vendor(number = '0812345678') {
    const login = await call('/auth/verify', 'POST', { phone: number, code: '8492' });
    expect(login.status).toBe(200);
    return { cookie: login.cookie, id: login.body.stall.id as string };
  }
  async function setup() {
    const owner = await vendor();
    sqlite.prepare("UPDATE stalls SET activated_at=?,settings=json_set(settings,'$.billing',json(?)) WHERE id=?").run(time,JSON.stringify({paidThrough:time+31*86400000,payments:[]}),owner.id);
    await call('/vendor/stall', 'PUT', { name: 'Mamelodi Kota', town: 'Mamelodi', hours: '08:00–21:00', open: true, takesCard: true }, owner.cookie);
    await call('/vendor/settings', 'PUT', { neighbours: [{ type: 'spaza', name: 'Corner Spaza', phone: '0811111111', enabled: true }] }, owner.cookie);
    for (const item of [
      { id: 'kota', name: 'Russian Special + egg', priceCents: 7000, shop: 'stall', shopName: 'Mamelodi Kota' },
      { id: 'milk', name: 'milk 1L', priceCents: 2299, shop: 'spaza', shopName: 'Corner Spaza', alternative: { name: 'Parmalat 1L', priceCents: 2199 } },
      { id: 'drink', name: 'still water', priceCents: 3000, shop: 'spaza', shopName: 'Corner Spaza', alcohol: false },
    ]) expect((await call('/vendor/menu', 'PUT', { ...item, enabled: true }, owner.cookie)).status).toBe(200);
    expect((await call('/vendor/rider', 'POST', { phone: '0791234567', feeCents: 1000 }, owner.cookie)).status).toBe(200);
    const rider = await call('/auth/rider', 'POST', { token: inviteToken, decision: 'accept' });
    const customer = await call('/auth/customer', 'POST');
    return { owner, rider: rider.cookie, customer: customer.cookie };
  }
  const orderInput = (stallId: string, extra = {}) => ({
    stallId, requestKey: 'first-order', customerName: 'Thabo', customerPhone: '0711234567',
    gateNote: '1142 Mamelodi West · Gate 3', method: 'cash', fulfilment: 'delivery', over18: true,
    lines: [{ itemId: 'kota', quantity: 1 }, { itemId: 'milk', quantity: 1, ifMissing: 'alternative' }, { itemId: 'drink', quantity: 1, ifMissing: 'omit' }], ...extra,
  });

  it('requires a positive fee and explicit rider consent, preserves old order fees, and records declines', async()=>{
    const {owner,customer}=await setup();
    const first=(await call('/orders','POST',orderInput(owner.id),customer)).body.order;
    expect(first.riderFeeCents).toBe(1000);
    expect((await call('/vendor/rider','POST',{phone:'0791234567',feeCents:0},owner.cookie)).status).toBe(400);
    await call('/vendor/rider','POST',{phone:'0791234567',feeCents:1750},owner.cookie);
    const offerToken=inviteToken;
    const preview=await call('/auth/rider-offer','POST',{token:offerToken});
    expect(preview.body.feeCents).toBe(1750);expect(preview.cookie).toBe('');
    expect((await call('/auth/rider','POST',{token:offerToken})).status).toBe(400);
    expect((await call('/auth/rider','POST',{token:offerToken,decision:'reject'})).body.accepted).toBe(false);
    expect((await call('/auth/rider','POST',{token:offerToken,decision:'accept'})).status).toBe(401);
    await call('/vendor/rider','POST',{phone:'0791234567',feeCents:1750},owner.cookie);
    expect((await call('/auth/rider','POST',{token:inviteToken,decision:'accept'})).status).toBe(200);
    const second=(await call('/orders','POST',orderInput(owner.id,{requestKey:'new-fee'}),customer)).body.order;
    expect(second.riderFeeCents).toBe(1750);
    expect((await call('/orders/'+first.id,'GET',undefined,owner.cookie)).body.order.riderFeeCents).toBe(1000);
    const {orderMoney}=await import('../src/server/contracts');
    expect(orderMoney({...second,state:'delivered',riderPhone:'+27811111111'}).riderCents).toBe(1750);
    expect(orderMoney({...first,state:'delivered',riderPhone:'+27811111111'}).riderCents).toBe(1000);expect(orderMoney({...first,state:'delivered',riderPhone:null}).riderCents).toBe(0);
  });
  it('keeps a new rider inactive until accepted and rejects expired offers',async()=>{
    const owner=await vendor();
    await call('/vendor/rider','POST',{phone:'0791234567',feeCents:1200},owner.cookie);
    expect((await call('/vendor/stall','GET',undefined,owner.cookie)).body.stall.rider_phone).toBeNull();
    time+=86400001;
    expect((await call('/auth/rider','POST',{token:inviteToken,decision:'accept'})).status).toBe(401);
  });
  it('saves a setup menu and progress atomically and isolates other stalls',async()=>{
    const owner=await vendor(),other=await vendor('0821234567');
    expect((await call('/vendor/stall','GET',undefined,owner.cookie)).body.menu).toHaveLength(0);
    expect((await call('/vendor/setup','PUT',{step:4,items:[]},owner.cookie)).status).toBe(400);
    const items=['a','b','c','d','e','f'].map(k=>({id:owner.id+'-'+k,name:'Kota '+k,priceCents:null,shop:'stall',shopName:'Stall',enabled:true}));
    const saved=await call('/vendor/setup','PUT',{step:4,items:items.map((item:any)=>({...item,priceCents:4500}))},owner.cookie);
    expect(saved.status).toBe(200);expect(saved.body.menu.every((item:any)=>item.priceCents===4500)).toBe(true);
    expect(JSON.parse(saved.body.stall.settings).setupStep).toBe(5);
    const foreign={id:other.id+'-x',name:'Theirs',priceCents:100,shop:'stall',shopName:'S',enabled:true};
    await call('/vendor/setup','PUT',{step:4,items:[foreign]},other.cookie);
    expect((await call('/vendor/setup','PUT',{step:4,items:[{...items[0],priceCents:9900},foreign]},owner.cookie)).status).toBe(403);
    expect((await call('/vendor/stall','GET',undefined,owner.cookie)).body.menu[0].priceCents).toBe(4500);
  });
  it('charges R300 including the first month then R150 renewals without unpaid access or duplicate credit',async()=>{
    const {owner}=await setup(),key='private-admin-key-for-billing-32-characters';
    api=createApi(db,provider,()=>time,{activationKey:key});
    sqlite.prepare("UPDATE stalls SET activated_at=NULL,settings=json_remove(settings,'$.billing') WHERE id=?").run(owner.id);
    expect((await call('/stalls/'+owner.id)).body.open).toBe(false);
    const blocked=await call('/vendor/open','POST',{open:true},owner.cookie);
    expect(blocked.status).toBe(409);
    expect(JSON.stringify(blocked.body)).toContain('plan payment is confirmed');
    const admin=await call('/admin/login','POST',{key});
    expect((await call('/admin/paid','POST',{stallId:owner.id,amountCents:15000,reference:'bad'},admin.cookie)).status).toBe(409);
    expect((await call('/admin/paid','POST',{stallId:owner.id,amountCents:30000,reference:'initial'},admin.cookie)).status).toBe(200);
    expect((await call('/admin/paid','POST',{stallId:owner.id,amountCents:30000,reference:'initial'},admin.cookie)).status).toBe(409);
    expect((await call('/stalls/'+owner.id)).body.open).toBe(true);
    const row=await db.prepare('SELECT * FROM stalls WHERE id=?').bind(owner.id).first<any>();
    time=JSON.parse(row.settings).billing.paidThrough;
    expect((await call('/stalls/'+owner.id)).body.open).toBe(false);
    const admin2=await call('/admin/login','POST',{key});
    expect((await call('/admin/paid','POST',{stallId:owner.id,amountCents:15000,reference:'month-2'},admin2.cookie)).status).toBe(200);
    expect((await call('/stalls/'+owner.id)).body.open).toBe(true);
  });
  it('shares an order between independent customer, owner and rider sessions, including after reopening the database', async () => {
    const { owner, rider, customer } = await setup();
    const submitted = await call('/orders', 'POST', orderInput(owner.id), customer);
    expect(submitted.status).toBe(201);
    const id = submitted.body.order.id;
    expect((await call('/orders', 'GET', undefined, owner.cookie)).body.orders[0].id).toBe(id);
    expect((await call('/orders', 'GET', undefined, rider)).body.orders).toEqual([]);
    const assignedMember=(await call('/team','GET',undefined,owner.cookie)).body.members.find((m:any)=>m.role==='rider');
    expect((await call(`/orders/${id}/assign`,'POST',{memberId:assignedMember.id,expectedPhone:null},owner.cookie)).status).toBe(200);
    await call(`/orders/${id}/ready`, 'POST', {}, owner.cookie);
    expect((await call('/orders', 'GET', undefined, rider)).body.orders[0].id).toBe(id);
    sqlite.close(); sqlite = new DatabaseSync(join(folder, 'orders.sqlite'));
    api = createApi(new SqliteDatabase(sqlite), provider, () => time,{activationKey:'test-team-key-not-used-in-production-1234'});
    const newPhone = await vendor('+27812345678');
    expect(newPhone.id).toBe(owner.id);
    expect((await call('/orders', 'GET', undefined, newPhone.cookie)).body.orders[0].id).toBe(id);
    expect((await call(`/orders/${id}`, 'GET', undefined, customer)).body.money.totalCents).toBe(12299);
  });
  it('isolates vendors, customers and riders and ignores role labels sent by clients', async () => {
    const { owner, customer } = await setup();
    const id = (await call('/orders', 'POST', orderInput(owner.id), customer)).body.order.id;
    const other = await vendor('0821234567');
    const stranger = await call('/auth/customer', 'POST');
    expect((await call(`/orders/${id}`, 'GET', undefined, other.cookie)).status).toBe(404);
    expect((await call(`/orders/${id}`, 'GET', undefined, stranger.cookie)).status).toBe(404);
    expect((await call(`/orders/${id}/ready`, 'POST', { role: 'vendor' }, customer)).status).toBe(403);
    expect((await call('/vendor/menu', 'PUT', { id: 'kota', role: 'vendor' }, other.cookie)).status).toBe(403);
  });
  it('uses server prices, enforces age/alternatives, and makes repeated sends idempotent', async () => {
    const { owner, customer } = await setup();
    expect((await call('/orders', 'POST', orderInput(owner.id, { lines: [{ itemId: 'milk', quantity: 1, ifMissing: 'invent' }] }), customer)).status).toBe(400);
    const input = orderInput(owner.id, { totalCents: 1 });
    const first = await call('/orders', 'POST', input, customer);
    const again = await call('/orders', 'POST', input, customer);
    expect(first.body.order.id).toBe(again.body.order.id);
    expect((await call(`/orders/${first.body.order.id}`, 'GET', undefined, customer)).body.money.totalCents).toBe(12299);
    expect((await call('/orders', 'GET', undefined, owner.cookie)).body.orders).toHaveLength(1);
  });
  it('keeps exactly the ten requested spaza suggestions', () => {
    const names = packagedProducts.filter(item => item.shop === 'spaza').map(item => item.name);
    expect(names).toHaveLength(10);
    expect(names.join(' ')).not.toMatch(/coffee|Grand-Pa|nappies|maize/i);
    expect(names).toContain('Disprin Extra Strength Tablets 2-pack');
    expect(names).toContain('Compral Tablets 2-pack');
  });
  it('blocks tavern and alcohol even with the old testing flag and hides legacy items',async()=>{
    const {owner,customer}=await setup();api=createApi(db,provider,()=>time,{alcoholTesting:true});
    expect((await call('/vendor/shop','PUT',{type:'tavern',name:'Old shop',phone:'0831234567',items:[]},owner.cookie)).status).toBe(400);
    expect((await call('/vendor/menu','PUT',{id:'alcohol',name:'Savanna Dry',priceCents:3000,shop:'spaza',shopName:'Spaza',enabled:true},owner.cookie)).status).toBe(400);
    sqlite.prepare('INSERT INTO menu(id,stall_id,body) VALUES (?,?,?)').run('legacy-drink',owner.id,JSON.stringify({id:'legacy-drink',name:'Still water',priceCents:1500,enabled:true,shop:'tavern',shopName:'Old shop'}));
    const visible=(await call('/stalls/'+owner.id)).body;expect(visible.menu.some((x:any)=>x.shop==='tavern')).toBe(false);expect(visible.nextDoorDisplay.some((x:any)=>x.shop==='tavern')).toBe(false);
    expect((await call('/orders','POST',orderInput(owner.id,{lines:[{itemId:'kota',quantity:1},{itemId:'legacy-drink',quantity:1}]}),customer)).status).not.toBe(201);
  });
  it('saves optional referral only for first verified signup and returns it in private admin',async()=>{
    rejectCode=true;expect((await call('/auth/verify','POST',{phone:'0815550188',code:'8492',referral_name:'thembi'})).status).toBe(401);
    expect(sqlite.prepare('SELECT count(*) AS n FROM stalls').get()?.n).toBe(0);rejectCode=false;
    const first=await call('/auth/verify','POST',{phone:'0815550188',code:'8492',referral_name:' Thembi '});expect(first.body.stall.referral_name).toBe('Thembi');
    const again=await call('/auth/verify','POST',{phone:'0815550188',code:'8492',referral_name:'Another'});expect(again.body.stall.referral_name).toBe('Thembi');
    const blank=await call('/auth/verify','POST',{phone:'0815550189',code:'8492'});expect(blank.body.stall.referral_name).toBe('');
    const key='test-referral-admin-key-at-least-32-characters';api=createApi(db,provider,()=>time,{activationKey:key});const admin=await call('/admin/login','POST',{key});expect((await call('/admin','GET',undefined,admin.cookie)).body.stalls.find((x:any)=>x.id===first.body.stall.id).referral_name).toBe('Thembi');
  });
  it('resets only the exact authorised vendor and makes their next login a new blank stall', async () => {
    const {owner, customer} = await setup(), other = await vendor('0822345678');
    await call('/orders','POST',orderInput(owner.id),customer);
    const removed: string[] = [], key = 'test-private-admin-key-longer-than-32-characters';
    api = createApi(db,provider,()=>time,{activationKey:key,deletePhotos:async id=>{removed.push(id);}});
    expect((await call('/admin/reset-stall','POST',{phone:'0812345678'},owner.cookie)).status).toBe(401);
    const admin = await call('/admin/login','POST',{key});
    expect((await call('/admin/reset-stall','POST',{phone:'0812345678'},admin.cookie)).body.cleared).toBe(true);
    expect(removed).toEqual([owner.id]);
    expect((await call('/vendor/stall','GET',undefined,owner.cookie)).status).toBe(401);
    expect((await call(`/stalls/${owner.id}`)).status).toBe(404);
    expect((await call('/vendor/stall','GET',undefined,other.cookie)).status).toBe(200);
    const fresh = await vendor();
    expect(fresh.id).not.toBe(owner.id);
    const data = (await call('/vendor/stall','GET',undefined,fresh.cookie)).body;
    expect(data.stall.name).toBe(''); expect(data.menu).toHaveLength(0);
    expect((await call('/orders','GET',undefined,fresh.cookie)).body.orders).toHaveLength(0);
  });
  it('enforces stop order and customer choices, and updates the customer gate total', async () => {
    const { owner, customer, rider } = await setup();
    const id = (await call('/orders', 'POST', orderInput(owner.id), customer)).body.order.id;
    expect((await call(`/orders/${id}/depart`, 'POST', {}, rider)).status).toBe(404);
    const assignedMember=(await call('/team','GET',undefined,owner.cookie)).body.members.find((m:any)=>m.role==='rider');
    expect((await call(`/orders/${id}/assign`,'POST',{memberId:assignedMember.id,expectedPhone:null},owner.cookie)).status).toBe(200);
    await call(`/orders/${id}/ready`, 'POST', {}, owner.cookie);
    expect((await call(`/orders/${id}/collect`, 'POST', { itemId: 'milk', outcome: 'original' }, rider)).status).toBe(409);
    expect((await call(`/orders/${id}/deliver`, 'POST', {}, rider)).status).toBe(409);
    expect((await call(`/orders/${id}/accept`, 'POST', {}, rider)).status).toBe(200);
    await call(`/orders/${id}/collect`, 'POST', { itemId: 'kota', outcome: 'original' }, rider);
    expect((await call(`/orders/${id}/collect`, 'POST', { itemId: 'milk', outcome: 'alternative' }, rider)).status).toBe(409);
    await call(`/orders/${id}/collect`, 'POST', { itemId: 'milk', outcome: 'omitted' }, rider);
    expect((await call(`/orders/${id}/collect`, 'POST', { itemId: 'drink', outcome: 'alternative' }, rider)).status).toBe(409);
    await call(`/orders/${id}/collect`, 'POST', { itemId: 'drink', outcome: 'omitted' }, rider);
    await call(`/orders/${id}/depart`, 'POST', {}, rider);
    const result = await call(`/orders/${id}/deliver`, 'POST', {}, rider);
    expect(result.body.money).toEqual({ totalCents: 7000, shopSpendCents: 0, kotaCents: 7000, riderCents: 1000, mineCents: 6000 });
    expect((await call(`/orders/${id}`, 'GET', undefined, customer)).body.order.state).toBe('delivered');
    expect((await call(`/orders/${id}/deliver`, 'POST', {}, rider)).status).toBe(409);
  });
  it('starts the seven days only with the first order and refuses new orders on day eight', async () => {
    const { owner, customer } = await setup();
    time += 30 * 86400000 - 1000;
    expect((await call(`/stalls/${owner.id}`)).body.open).toBe(true);
    await call('/orders', 'POST', orderInput(owner.id), customer);
    time += 30 * 86400000;
    expect((await call(`/stalls/${owner.id}`)).body.open).toBe(false);
    const freshCustomer = (await call('/auth/customer', 'POST')).cookie;
    expect((await call('/orders', 'POST', orderInput(owner.id, { requestKey: 'late' }), freshCustomer)).status).toBe(409);
  });
  it('fails closed without real WhatsApp configuration; codes and invite links cannot be reused indefinitely', async () => {
    api = createApi(db, whatsapp({}), () => time);
    expect((await call('/auth/code', 'POST', { phone: '0812345678' })).status).toBe(503);
    expect((await call('/auth/verify', 'POST', { phone: '0812345678', code: '8492' })).status).toBe(503);
    expect(sqlite.prepare('SELECT count(*) AS count FROM sessions').get()!.count).toBe(0);
    api = createApi(db, provider, () => time,{activationKey:'test-team-key-not-used-in-production-1234'});
    await setup();
    expect((await call('/auth/rider', 'POST', { token: inviteToken, decision: 'accept' })).status).toBe(401);
    rejectCode = true;
    expect((await call('/auth/verify', 'POST', { phone: '0821234567', code: '8492' })).status).toBe(401);
  });
  it('hides unpriced/sold-out menu items and restores daily availability at South African midnight', async () => {
    const { owner } = await setup();
    await call('/vendor/menu', 'PUT', { id: 'blank', name: 'Chicken', priceCents: null, shop: 'stall', shopName: 'Mamelodi', enabled: true }, owner.cookie);
    await call('/vendor/menu', 'PUT', { id: 'kota', name: 'Russian', priceCents: 7000, shop: 'stall', shopName: 'Mamelodi', enabled: true, soldOutToday: true }, owner.cookie);
    expect((await call(`/stalls/${owner.id}`)).body.menu.map((item: { id: string }) => item.id)).toEqual(['milk', 'drink']);
    time = Date.parse('2026-09-08T22:00:00Z');
    expect((await call(`/stalls/${owner.id}`)).body.menu.map((item: { id: string }) => item.id)).toContain('kota');
  });
  it('collection has no rider wage and requires vendor handover', async () => {
    const { owner, customer, rider } = await setup();
    const created = await call('/orders', 'POST', orderInput(owner.id, { fulfilment: 'collection', collectionTime: '17:30', lines: [{ itemId: 'kota', quantity: 1 }] }), customer);
    const id = created.body.order.id;
    const assignedMember=(await call('/team','GET',undefined,owner.cookie)).body.members.find((m:any)=>m.role==='rider');
    expect((await call(`/orders/${id}/assign`,'POST',{memberId:assignedMember.id,expectedPhone:null},owner.cookie)).status).toBe(409);
    await call(`/orders/${id}/ready`, 'POST', {}, owner.cookie);
    expect((await call(`/orders/${id}/deliver`, 'POST', {}, rider)).status).toBe(404);
    const completed = await call(`/orders/${id}/deliver`, 'POST', {}, owner.cookie);
    expect(completed.body.money.riderCents).toBe(0);
    expect((completed.body.order as GateOrder).state).toBe('delivered');
  });
  it('applies shared extras only to this stall, including future kotas, without changing old orders',async()=>{
    const {owner,customer}=await setup(), other=await vendor('0822345678');
    const order=await call('/orders','POST',orderInput(owner.id),customer);
    expect(order.status).toBe(201);
    const extras=[{id:'bacon',name:'Bacon',priceCents:1200},{id:'egg',name:'Extra egg',priceCents:1000}];
    expect((await call('/vendor/extras','PUT',{extras},owner.cookie)).status).toBe(200);
    const items=(await call('/vendor/stall','GET',undefined,owner.cookie)).body.menu;
    expect(items.filter((i:any)=>i.shop==='stall').every((i:any)=>JSON.stringify(i.extras)===JSON.stringify(extras))).toBe(true);
    expect(items.find((i:any)=>i.id==='milk').extras).toBeUndefined();
    const foreign=(await call('/vendor/stall','GET',undefined,other.cookie)).body.menu;
    expect(foreign).toHaveLength(0);
    const added=await call('/vendor/menu','PUT',{id:'new-kota',name:'New Kota',priceCents:5000,shop:'stall',shopName:'Mamelodi Kota',enabled:true},owner.cookie);
    expect(added.body.item.extras).toEqual(extras);
    expect((await call('/orders','GET',undefined,owner.cookie)).body.orders[0].lines).toEqual(order.body.order.lines);
    expect((await call('/vendor/extras','PUT',{extras:[extras[0],extras[0]]},owner.cookie)).status).toBe(400);
    expect((await call('/vendor/extras','PUT',{extras},customer)).status).toBe(403);
    expect((await call('/vendor/extras','PUT',{extras:[]},owner.cookie)).status).toBe(200);
    expect((await call('/vendor/stall','GET',undefined,owner.cookie)).body.menu.filter((i:any)=>i.shop==='stall').every((i:any)=>i.extras.length===0)).toBe(true);
  });
  it('restores customer details from the database without sharing another customer profile',async()=>{
    const {owner,customer}=await setup();
    await call('/orders','POST',orderInput(owner.id),customer);
    expect((await call('/customer/profile','GET',undefined,customer)).body.profile).toEqual({name:'Thabo',phone:'+27711234567',gateNote:'1142 Mamelodi West · Gate 3'});
    const other=await call('/auth/customer','POST');
    expect((await call('/customer/profile','GET',undefined,other.cookie)).body.profile).toBeNull();
    expect((await call('/customer/profile','GET',undefined,owner.cookie)).body.profile).toBeNull();
    expect((await call('/customer/profile')).status).toBe(401);
  });
  it('requires a setup delivery choice and honours collection-only without deleting the delivery person',async()=>{
    const {owner,customer}=await setup();
    expect((await call('/vendor/setup','PUT',{step:8},owner.cookie)).status).toBe(400);
    expect((await call('/vendor/setup','PUT',{step:8,delivery:false},owner.cookie)).status).toBe(200);
    expect((await call('/stalls/'+owner.id)).body.delivery).toBe(false);
    expect((await call('/orders','POST',orderInput(owner.id),customer)).status).toBe(409);
    expect((await call('/vendor/settings','PUT',{deliveryEnabled:true},owner.cookie)).status).toBe(200);
    expect((await call('/stalls/'+owner.id)).body.delivery).toBe(true);
    expect((await call('/orders','POST',orderInput(owner.id),customer)).status).toBe(201);
  });
  it('keeps real manual codes private, encrypted, expiring and single-use', async () => {
    const secret = 'a-private-admin-secret-that-is-longer-than-32-characters';
    api = createApi(db, whatsapp({}), () => time, { manualCodes: true, activationKey: secret });
    const sent = await call('/auth/code', 'POST', { phone: '0812345678' });
    expect(sent.body.sent).toBe(false); expect(sent.body.code).toBeUndefined();
    expect((await call('/admin')).status).toBe(401);
    const admin = await call('/admin/login', 'POST', { key: secret });
    expect((await call('/admin', 'GET', undefined, admin.cookie)).body.codes[0].code).toBeNull();
    time += 1200000;
    expect((await call('/admin/code', 'POST', {phone:'0812345678'})).status).toBe(401);
    const code = (await call('/admin/code', 'POST', {phone:'0812345678'}, admin.cookie)).body.code;
    expect(code).toMatch(/^\d{4}$/);
    expect((await call('/admin/code','POST',{phone:'0812345678'},admin.cookie)).body.code).toBe(code);
    expect((await call('/auth/verify','POST',{phone:'0822345678',code})).status).toBe(401);
    expect(sqlite.prepare('SELECT cipher FROM login_codes').get()!.cipher).not.toBe(code);
    expect((await call('/auth/verify', 'POST', { phone: '0812345678', code })).status).toBe(200);
    expect((await call('/auth/verify', 'POST', { phone: '0812345678', code })).status).toBe(401);
    await call('/auth/code', 'POST', { phone: '0822345678' });
    const expired = (await call('/admin/code', 'POST', {phone:'0822345678'}, admin.cookie)).body.code;
    time += 600001;
    expect((await call('/auth/verify', 'POST', { phone: '0822345678', code: expired })).status).toBe(401);
  });
  it('remembers admin only on explicit request and revokes the session on sign-out', async () => {
    const secret='a-private-admin-secret-that-is-longer-than-32-characters';
    api=createApi(db,whatsapp({}),()=>time,{manualCodes:true,activationKey:secret});
    expect((await call('/admin/remember','POST',{})).status).toBe(401);
    const admin=await call('/admin/login','POST',{key:secret});
    expect((await call('/admin/remember','POST',{},admin.cookie)).status).toBe(200);
    time+=2*86400000;
    expect((await call('/admin','GET',undefined,admin.cookie)).status).toBe(200);
    expect((await call('/admin/logout','POST',{},admin.cookie)).status).toBe(200);
    expect((await call('/admin','GET',undefined,admin.cookie)).status).toBe(401);
    const short=await call('/admin/login','POST',{key:secret});
    time+=3600001;
    expect((await call('/admin','GET',undefined,short.cookie)).status).toBe(401);
  });
  it('uses scheduled hours, resets overrides, and does not override unpaid day eight', async () => {
    const { owner, customer } = await setup();
    await call('/orders', 'POST', orderInput(owner.id), customer);
    await call('/vendor/open', 'POST', { open: false }, owner.cookie);
    expect((await call(`/stalls/${owner.id}`)).body.open).toBe(false);
    time = Date.parse('2026-09-09T06:00:00Z');
    expect((await call(`/stalls/${owner.id}`)).body.open).toBe(true);
    time = Date.parse('2026-09-09T19:00:00Z');
    expect((await call(`/stalls/${owner.id}`)).body.open).toBe(false);
    await call('/vendor/open', 'POST', { open: true }, owner.cookie);
    expect((await call(`/stalls/${owner.id}`)).body.open).toBe(true);
    time += 30 * 86400000;
    await call('/vendor/open', 'POST', { open: true }, owner.cookie);
    expect((await call(`/stalls/${owner.id}`)).body.open).toBe(false);
  });
  it('blocks alcohol even when a client unsets the alcohol flag or confirms age', async () => {
    const { owner, customer } = await setup();
    await call('/vendor/menu', 'PUT', { id: 'alcohol', name: 'Savanna Dry', priceCents: 3000, shop: 'tavern', shopName: 'Local tavern', enabled: true, alcohol: false }, owner.cookie);
    expect((await call(`/stalls/${owner.id}`)).body.menu.some((item: {id: string}) => item.id === 'alcohol')).toBe(false);
    expect((await call('/orders', 'POST', orderInput(owner.id, { lines: [{ itemId: 'kota', quantity: 1 }, {itemId: 'alcohol', quantity: 1, ifMissing: 'omit'}] }), customer)).status).toBe(409);
  });
  it('records payment reports without activation and restricts marking paid to private admin', async () => {
    const { owner } = await setup(), secret = 'private-admin-secret-at-least-32-characters';
    sqlite.prepare("UPDATE stalls SET activated_at=NULL,settings=json_remove(settings,'$.billing') WHERE id=?").run(owner.id);
    api = createApi(db, provider, () => time, { activationKey: secret });
    await call('/vendor/activation', 'POST', {}, owner.cookie);
    expect((await call('/vendor/activation', 'GET', undefined, owner.cookie)).body.activated).toBe(false);
    expect((await call('/admin/paid', 'POST', { stallId: owner.id }, owner.cookie)).status).toBe(401);
    const admin = await call('/admin/login', 'POST', { key: secret });
    await call('/admin/paid', 'POST', { stallId: owner.id, amountCents: 30000, reference: 'EFT-1' }, admin.cookie);
    expect((await call('/vendor/activation', 'GET', undefined, owner.cookie)).body.activated).toBe(true);
  });
  it('authenticates STOP and prevents re-enabling an opted-out shop', async () => {
    const { owner } = await setup();
    const invalid = await api(new Request('https://kasi.test/api/whatsapp/incoming', { method: 'POST', body: 'From=whatsapp%3A%2B27811111111&Body=STOP' }));
    expect(invalid.status).toBe(403);
    const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:'1234'},messages:[{id:'stop-message',from:'27811111111',timestamp:String(Math.floor(time/1000)),type:'text',text:{body:'STOP'}}]}}]}]});
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))).toString('hex');
    api=createApi(db,provider,()=>time,{meta:metaWhatsApp(db,{META_APP_SECRET:'test-secret',META_WHATSAPP_PHONE_NUMBER_ID:'1234'},()=>{},()=>time)});
    const valid=await api(new Request('https://kasi.test/api/whatsapp/webhook',{method:'POST',headers:{'x-hub-signature-256':'sha256='+signature},body:raw}));
    expect(valid.status).toBe(200);
    expect((await call(`/stalls/${owner.id}`)).body.menu.some((item: {shop: string}) => item.shop === 'spaza')).toBe(false);
    expect((await call('/vendor/settings', 'PUT', {neighbours: [{type:'spaza',name:'Corner Spaza',phone:'0811111111',enabled:true}]}, owner.cookie)).status).toBe(409);
  });
  it('shows sold-out packaged products without allowing orders and restores them tomorrow', async () => {
    const { owner, customer } = await setup();
    const input = { type: 'spaza', name: 'Corner Spaza', phone: '0831234567', items: [{ name: 'Sprite 2L', priceCents: 2500, soldOutToday: true }] };
    expect((await call('/vendor/shop', 'PUT', input, owner.cookie)).status).toBe(200);
    const first = (await call(`/stalls/${owner.id}`)).body;
    const sprite = first.nextDoorDisplay.find((item: any) => item.name === 'Sprite 2L');
    expect(sprite.image).toBe('/images/products/29905.jpg');
    expect(first.menu.some((item: any) => item.id === sprite.id)).toBe(false);
    const order = orderInput(owner.id);
    expect((await call('/orders', 'POST', { ...order, lines: [order.lines[0], { itemId: sprite.id, quantity: 1, extras: [], ifMissing: 'omit' }] }, customer)).status).toBe(409);
    time += 86400000;
    expect((await call(`/stalls/${owner.id}`)).body.menu.some((item: any) => item.id === sprite.id)).toBe(true);
  });
  it('saves a complete shop atomically, notifies once, and rejects partial invalid updates', async () => {
    const { owner } = await setup(); let notifications = 0;
    api = createApi(db, { ...provider, notifyShop: async (_phone, _stall, items) => { notifications++; expect(items).toBe('Coke 2L, bread'); } }, () => time);
    const input = { type: 'spaza', name: 'My corner shop', phone: '0831234567', items: [{name:'Coke 2L',priceCents:2500,alternative:{name:'Sprite 2L',priceCents:2400}},{name:'bread',priceCents:1800}] };
    expect((await call('/vendor/shop', 'PUT', input, owner.cookie)).status).toBe(200);
    expect(notifications).toBe(1);
    expect((await call(`/stalls/${owner.id}`)).body.menu.filter((item: {shop: string}) => item.shop === 'spaza').map((item: {name: string}) => item.name)).toEqual(['Coke 2L', 'bread']);
    expect((await call('/vendor/shop', 'PUT', {...input,items:[...input.items,{name:'bread',priceCents:10}]}, owner.cookie)).status).toBe(400);
    expect(notifications).toBe(1);
    expect((await call(`/stalls/${owner.id}`)).body.menu.filter((item: {shop: string}) => item.shop === 'spaza')).toHaveLength(2);
  });
  it('accepts local shop products and keeps prices and alternatives scoped to their owner', async () => {
    const { owner } = await setup();
    const input = { type: 'spaza', name: 'Local spaza', phone: '0831234567', items: [{ name: 'Mama mango achaar 250g', priceCents: 1800, alternative: { name: 'Hot achaar 200g', priceCents: 1500 } }] };
    expect((await call('/vendor/shop', 'PUT', input, owner.cookie)).status).toBe(200);
    const local = (await call('/vendor/stall', 'GET', undefined, owner.cookie)).body.menu.find((item: any) => item.name === input.items[0].name);
    expect(local.priceCents).toBe(1800); expect(local.alternative).toBeUndefined();
    expect((await call('/vendor/shop', 'PUT', { ...input, type: 'tavern', items: [{name:'Local lager 500ml',priceCents:2200,alcohol:true}] }, owner.cookie)).status).toBe(400);
    expect((await call('/vendor/shop', 'PUT', { ...input, type: 'spaza', items: [{name:'Sparkling water 750ml',priceCents:2000,alcohol:false}] }, owner.cookie)).status).toBe(200);
  });

  it('starts every new stall with an empty menu so the vendor adds their own food', async () => {
    const owner=await vendor();
    expect((await call('/vendor/stall','GET',undefined,owner.cookie)).body.menu).toHaveLength(0);
    const publicData=(await call('/stalls/'+owner.id)).body;
    expect(publicData.menu).toHaveLength(0);
    const own={id:'own-1',name:'My kota',priceCents:null,shop:'stall',shopName:'S',enabled:true};
    expect((await call('/vendor/setup','PUT',{step:4,items:[own]},owner.cookie)).status).toBe(200);
    const unpriced=await call('/vendor/stall','GET',undefined,owner.cookie);
    expect(unpriced.body.menu).toHaveLength(1);
  });

  it('supports assistants and multiple delivery people with isolated, revocable access',async()=>{
    const {owner,customer,rider}=await setup();
    const invited=await call('/vendor/assistant','POST',{name:'Lerato',phone:'0781111111'},owner.cookie);
    const message=new URL(invited.body.link).searchParams.get('text')!;
    expect(message.replace(/https:\/\/\S+/g,'')).not.toMatch(/\bfee\b|\bpaid\b|R[0-9]/);
    const token=message.match(/token=([a-f0-9]{64})/)![1];
    expect((await call('/auth/team-offer','POST',{token})).cookie).toBe('');
    const assistant=await call('/auth/team','POST',{token,decision:'accept'});
    expect(assistant.status).toBe(200);
    expect((await call('/auth/team','POST',{token,decision:'accept'})).status).toBe(401);
    for(const route of ['/vendor/stall','/vendor/activation'])expect((await call(route,'GET',undefined,assistant.cookie)).status).toBe(403);
    expect((await call('/vendor/rider','POST',{phone:'0782222222',feeCents:1500},assistant.cookie)).status).toBe(403);
    expect((await call('/admin','GET',undefined,assistant.cookie)).status).toBe(401);
    const other=await vendor('0822222222');
    await call('/vendor/rider','POST',{phone:'0782222222',riderName:'Themba',feeCents:1500},owner.cookie);
    const second=await call('/auth/rider','POST',{token:inviteToken,decision:'accept'});
    expect(second.status).toBe(200);
    const team=(await call('/team','GET',undefined,owner.cookie)).body.members;
    const first=team.find((m:any)=>m.phone==='+27791234567'),next=team.find((m:any)=>m.name==='Themba'),helper=team.find((m:any)=>m.role==='assistant');
    const order=(await call('/orders','POST',orderInput(owner.id),customer)).body.order;
    expect(order.riderPhone).toBeNull();
    expect((await call('/orders/'+order.id,'GET',undefined,other.cookie)).status).toBe(404);
    expect((await call('/orders/'+order.id+'/assign','POST',{memberId:next.id,expectedPhone:null},assistant.cookie)).status).toBe(200);
    expect((await call('/orders/'+order.id+'/assign','POST',{memberId:first.id,expectedPhone:null},owner.cookie)).status).toBe(409);
    expect((await call('/orders/'+order.id+'/ready','POST',{},assistant.cookie)).status).toBe(200);
    expect((await call('/orders','GET',undefined,rider)).body.orders).toHaveLength(0);
    expect((await call('/orders','GET',undefined,second.cookie)).body.orders).toHaveLength(1);
    const visible=(await call('/orders/'+order.id,'GET',undefined,customer)).body;
    expect(visible.order).toMatchObject({riderName:'Themba',riderFeeCents:1500});expect(visible.riderPhone).toBe('+27782222222');
    expect((await call('/orders/'+order.id+'/accept','POST',{},second.cookie)).status).toBe(200);
    expect((await call('/orders/'+order.id+'/collect','POST',{itemId:'kota',outcome:'original'},second.cookie)).status).toBe(200);
    expect((await call('/orders/'+order.id+'/assign','POST',{memberId:first.id,expectedPhone:next.phone},owner.cookie)).status).toBe(409);
    expect((await call('/team/member','POST',{id:next.id,remove:true},owner.cookie)).status).toBe(409);
    expect((await call('/team/member','POST',{id:helper.id,remove:true},owner.cookie)).status).toBe(200);
    expect((await call('/orders','GET',undefined,assistant.cookie)).status).toBe(401);
  });
  it('honours delivery availability and scoped member removal without changing completed history',async()=>{
    const {owner,rider,customer}=await setup();const member=(await call('/team','GET',undefined,owner.cookie)).body.members[0];
    expect((await call('/team/member','POST',{id:member.id,available:false},rider)).status).toBe(200);
    const order=(await call('/orders','POST',orderInput(owner.id),customer)).body.order;
    expect((await call('/orders/'+order.id+'/assign','POST',{memberId:member.id,expectedPhone:null},owner.cookie)).status).toBe(409);
    expect((await call('/team/member','POST',{id:member.id,available:true},rider)).status).toBe(200);
    expect((await call('/orders/'+order.id+'/assign','POST',{memberId:member.id,expectedPhone:null},owner.cookie)).status).toBe(200);
    await call('/orders/'+order.id+'/ready','POST',{},owner.cookie);
    await call('/orders/'+order.id+'/accept','POST',{},rider);
    for(const line of order.lines)expect((await call('/orders/'+order.id+'/collect','POST',{itemId:line.itemId,outcome:'original'},rider)).status).toBe(200);
    await call('/orders/'+order.id+'/depart','POST',{},rider);await call('/orders/'+order.id+'/deliver','POST',{},rider);
    expect((await call('/team/member','POST',{id:member.id,remove:true},owner.cookie)).status).toBe(200);
    expect((await call('/orders','GET',undefined,rider)).status).toBe(401);
    expect((await call('/orders/'+order.id,'GET',undefined,owner.cookie)).body.order).toMatchObject({state:'delivered',riderFeeCents:1000});
    expect((await call('/stalls/'+owner.id)).body.delivery).toBe(false);
  });

  it('only lets the owning customer cancel received orders, keeps both phones consistent and queues one alert',async()=>{
    const {owner,customer,rider}=await setup();const jobs:Promise<unknown>[]=[];
    const meta=metaWhatsApp(db,{},job=>jobs.push(job),()=>time);api=createApi(db,provider,()=>time,{meta,activationKey:'test-team-key-not-used-in-production-1234'});
    const order=(await call('/orders','POST',orderInput(owner.id),customer)).body.order;
    const stranger=await call('/auth/customer','POST');
    expect((await call('/orders/'+order.id+'/cancel','POST',{},stranger.cookie)).status).toBe(404);
    expect((await call('/orders/'+order.id+'/cancel','POST',{},owner.cookie)).status).toBe(403);
    const member=(await call('/team','GET',undefined,owner.cookie)).body.members[0];
    await call('/orders/'+order.id+'/assign','POST',{memberId:member.id,expectedPhone:null},owner.cookie);
    expect((await call('/orders/'+order.id+'/cancel','POST',{},customer)).body.order.state).toBe('cancelled');
    expect((await call('/orders/'+order.id,'GET',undefined,owner.cookie)).body.order.state).toBe('cancelled');
    for(const action of ['cook','ready','assign'])expect((await call('/orders/'+order.id+'/'+action,'POST',{},owner.cookie)).status).toBe(409);
    expect((await call('/orders/'+order.id+'/cancel','POST',{},customer)).status).toBe(409);
    expect((await call('/orders','GET',undefined,rider)).body.orders).toHaveLength(0);
    expect((await call('/team/member','POST',{id:member.id,remove:true},owner.cookie)).status).toBe(200);
    await Promise.all(jobs);const notices=sqlite.prepare("SELECT * FROM whatsapp_outbox WHERE kind='cancellation'").all();expect(notices).toHaveLength(1);expect(notices[0]).toMatchObject({phone:'27812345678',status:'not_configured'});
  });
  it('resolves simultaneous cooking and cancellation with one winner and never resurrects cancelled orders',async()=>{
    const {owner,customer}=await setup();const order=(await call('/orders','POST',orderInput(owner.id),customer)).body.order;
    const results=await Promise.all([call('/orders/'+order.id+'/cook','POST',{},owner.cookie),call('/orders/'+order.id+'/cancel','POST',{},customer)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    const final=(await call('/orders/'+order.id,'GET',undefined,customer)).body.order;
    expect(['cooking','cancelled']).toContain(final.state);
    const second=(await call('/orders','POST',orderInput(owner.id,{requestKey:'cook-second'}),customer)).body.order;
    expect((await call('/orders/'+second.id+'/cook','POST',{},owner.cookie)).status).toBe(200);
    expect((await call('/orders/'+second.id+'/cancel','POST',{},customer)).status).toBe(409);
    expect((await call('/orders/'+second.id+'/ready','POST',{},owner.cookie)).status).toBe(200);
  });
  it('accrues R75 once after confirmed payment, groups connectors, and records private non-repeatable payouts',async()=>{
    const key='referral-payout-test-key-at-least-32-characters',jobs:Promise<unknown>[]=[];
    const meta=metaWhatsApp(db,{},job=>jobs.push(job),()=>time);api=createApi(db,provider,()=>time,{activationKey:key,meta});
    const owner=await vendor(),other=await vendor('0822222222'),unpaid=await vendor('0833333333');
    for(const [id,name] of [[owner.id,'Thembi'],[other.id,' thembi '],[unpaid.id,'Thembi']])sqlite.prepare('UPDATE stalls SET referral_name=? WHERE id=?').run(name,id);
    const admin=await call('/admin/login','POST',{key});
    expect((await call('/admin/referrals/paid','POST',{stallId:owner.id,reference:'no'},owner.cookie)).status).toBe(401);
    expect((await call('/admin/referrals/paid','POST',{stallId:unpaid.id,reference:'no'},admin.cookie)).status).toBe(409);
    for(const id of [owner.id,other.id])expect((await call('/admin/paid','POST',{stallId:id,amountCents:30000,reference:'setup-'+id},admin.cookie)).status).toBe(200);
    expect((await call('/admin/paid','POST',{stallId:owner.id,amountCents:30000,reference:'setup-'+owner.id},admin.cookie)).status).toBe(409);
    let report=(await call('/admin','GET',undefined,admin.cookie)).body.referrals;expect(report.awards).toHaveLength(2);expect(report.connectors).toHaveLength(1);expect(report.connectors[0]).toMatchObject({payingVendors:2,owedCents:15000,paidCents:0});
    const payouts=await Promise.all([call('/admin/referrals/paid','POST',{stallId:owner.id,reference:'EFT-Friday-1'},admin.cookie),call('/admin/referrals/paid','POST',{stallId:owner.id,reference:'duplicate'},admin.cookie)]);expect(payouts.map(r=>r.status).sort()).toEqual([200,409]);
    report=(await call('/admin','GET',undefined,admin.cookie)).body.referrals;expect(report.connectors[0]).toMatchObject({owedCents:7500,paidCents:7500});
    time+=32*86400000;const renewedAdmin=await call('/admin/login','POST',{key});expect((await call('/admin/paid','POST',{stallId:owner.id,amountCents:15000,reference:'renewal'},renewedAdmin.cookie)).status).toBe(200);expect(sqlite.prepare('SELECT * FROM referral_awards').all()).toHaveLength(2);
    await Promise.all(jobs);expect(sqlite.prepare("SELECT * FROM whatsapp_outbox WHERE kind='activation'").all()).toHaveLength(3);
  });

  it('reopens private driver and assistant links on a fresh phone and revokes them on removal',async()=>{
    const {owner,rider}=await setup();
    const invited=await call('/vendor/assistant','POST',{name:'Lerato',phone:'0781111111'},owner.cookie),token=new URL(invited.body.link).searchParams.get('text')!.match(/token=([a-f0-9]{64})/)![1];
    const helper=await call('/auth/team','POST',{token,decision:'accept'});expect(helper.status).toBe(200);
    expect((await call('/auth/team-offer','POST',{token},helper.cookie)).body.alreadyAccepted).toBe(true);
    expect((await call('/auth/team-offer','POST',{token})).status).toBe(401);
    const members=(await call('/team','GET',undefined,owner.cookie)).body.members;
    expect((await call('/team/link','POST',{id:members.find((m:any)=>m.role==='assistant').id},rider)).status).toBe(404);
    for(const member of members){
      const result=await call('/team/link','POST',{id:member.id},owner.cookie);expect(result.status).toBe(200);
      const accessToken=new URLSearchParams(new URL(result.body.personalLink).hash.slice(1)).get('token');
      const fresh=await call('/auth/team-access','POST',{token:accessToken});expect(fresh.body.role).toBe(member.role);
      expect((await call('/vendor/stall','GET',undefined,fresh.cookie)).status).toBe(403);
      expect((await call('/auth/team-access','POST',{token:accessToken})).status).toBe(200);
      expect((await call('/team/member','POST',{id:member.id,remove:true},owner.cookie)).status).toBe(200);
      expect((await call('/auth/team-access','POST',{token:accessToken})).status).toBe(403);
      expect((await call('/orders','GET',undefined,fresh.cookie)).status).toBe(401);
    }
  });
  it('tracks actual viewing and acceptance, alerts on assignment and ready, and throttles unseen resends',async()=>{
    const {owner,rider,customer}=await setup(),jobs:Promise<unknown>[]=[];
    const meta=metaWhatsApp(db,{},job=>jobs.push(job),()=>time);api=createApi(db,provider,()=>time,{activationKey:'test-team-key-not-used-in-production-1234',meta});
    const member=(await call('/team','GET',undefined,owner.cookie)).body.members[0],order=(await call('/orders','POST',orderInput(owner.id),customer)).body.order;
    const path='/orders/'+order.id;
    expect((await call(path+'/assign','POST',{memberId:member.id,expectedPhone:null},owner.cookie)).status).toBe(200);
    expect((await call('/orders','GET',undefined,rider)).body.orders[0].state).toBe('new');
    expect((await call(path+'/resend','POST',{},owner.cookie)).status).toBe(409);
    time+=180001;expect((await call(path+'/resend','POST',{},owner.cookie)).status).toBe(200);
    expect((await call(path+'/resend','POST',{},owner.cookie)).status).toBe(409);
    expect((await call(path+'/viewed','POST',{},owner.cookie)).status).toBe(403);
    expect((await call(path+'/viewed','POST',{},rider)).status).toBe(200);
    expect((await call(path,'GET',undefined,owner.cookie)).body.order.driverViewedAt).toBe(time);
    time+=180001;expect((await call(path+'/resend','POST',{},owner.cookie)).status).toBe(409);
    expect((await call(path+'/collect','POST',{itemId:'kota',outcome:'original'},rider)).status).toBe(409);
    await call(path+'/ready','POST',{},owner.cookie);
    expect((await call(path+'/collect','POST',{itemId:'kota',outcome:'original'},rider)).status).toBe(409);
    await call(path+'/accept','POST',{},rider);
    expect((await call(path,'GET',undefined,owner.cookie)).body.order.driverAcceptedAt).toBe(time);
    for(const line of order.lines)expect((await call(path+'/collect','POST',{itemId:line.itemId,outcome:'original'},rider)).status).toBe(200);
    expect((await call(path,'GET',undefined,owner.cookie)).body.order.state).toBe('ready');
    expect((await call(path+'/depart','POST',{},rider)).body.order.state).toBe('on_the_way');
    expect((await call(path+'/deliver','POST',{},rider)).body.order.state).toBe('delivered');
    await Promise.all(jobs);const notices=sqlite.prepare("SELECT * FROM whatsapp_outbox WHERE kind IN ('assignment','ready')").all() as {kind:string;payload:string}[];
    expect(notices.map(n=>n.kind).sort()).toEqual(['assignment','assignment','ready']);
    for(const notice of notices){const payload=JSON.parse(notice.payload);expect(payload.parameters[9]).toContain('/team/access#token=');expect(payload.parameters[9]).toContain('&order='+order.id);expect(payload.parameters[5]).toContain('Mamelodi');}
  });
  it('stores Connector numbers privately and notifies only once per first paid referred vendor',async()=>{
    const key='connector-key-not-used-in-production-12345',jobs:Promise<unknown>[]=[];
    api=createApi(db,provider,()=>time,{activationKey:key,meta:metaWhatsApp(db,{},job=>jobs.push(job),()=>time)});
    const owner=await vendor();sqlite.prepare("UPDATE stalls SET name='Thandi Corner',referral_name='Thembi' WHERE id=?").run(owner.id);
    const admin=await call('/admin/login','POST',{key});
    expect((await call('/admin/connectors/contact','POST',{name:'Thembi',phone:'0792222222',verified:true},owner.cookie)).status).toBe(401);
    expect((await call('/admin/connectors/contact','POST',{name:'Thembi',phone:'0792222222'},admin.cookie)).status).toBe(400);
    expect((await call('/admin/connectors/contact','POST',{name:'Thembi',phone:'0792222222',verified:true},admin.cookie)).status).toBe(200);
    await call('/admin/paid','POST',{stallId:owner.id,amountCents:30000,reference:'setup'},admin.cookie);
    await call('/admin/connectors/notify','POST',{stallId:owner.id},admin.cookie);await Promise.all(jobs);
    const notices=sqlite.prepare("SELECT * FROM whatsapp_outbox WHERE kind='connector'").all() as {phone:string;payload:string}[];
    expect(notices).toHaveLength(1);expect(notices[0].phone).toBe('27792222222');expect(JSON.parse(notices[0].payload).parameters).toEqual(['Thandi Corner','75.00']);
    time+=32*86400000;const again=await call('/admin/login','POST',{key});await call('/admin/paid','POST',{stallId:owner.id,amountCents:15000,reference:'renewal'},again.cookie);await Promise.all(jobs);
    expect(sqlite.prepare("SELECT * FROM whatsapp_outbox WHERE kind='connector'").all()).toHaveLength(1);
  });
  it('preserves originals, rejects stale admin photo edits and saves ready order photos without customer text',async()=>{
    const {owner,customer,rider}=await setup(),uploads=new Map<string,ArrayBuffer>(),key='photo-test-admin-key-not-used-in-production';
    api=createApi(db,provider,()=>time,{activationKey:key,upload:async(k,b)=>{uploads.set(k,b);}});
    const admin=await call('/admin/login','POST',{key});
    const image='/photos/'+owner.id+'/original.jpg';await call('/vendor/menu','PUT',{id:'kota',name:'Russian Special',priceCents:7000,shop:'stall',shopName:'Kitchen',enabled:true,image},owner.cookie);
    const raw=async(path:string,cookie:string)=>api(new Request('https://kasi.test/api'+path,{method:'POST',headers:{Origin:'https://kasi.test',Cookie:cookie,'Content-Type':'image/jpeg'},body:new Uint8Array([255,216,255,217])}));
    const path='/admin/photos/kota/polish?stallId='+owner.id+'&expected='+encodeURIComponent(image);
    expect((await raw(path,owner.cookie)).status).toBe(401);
    const saved=await raw(path,admin.cookie);expect(saved.status).toBe(200);const edited=(await saved.json()).image;
    expect((await raw(path,admin.cookie)).status).toBe(409);
    expect(sqlite.prepare('SELECT original FROM photo_edits').get()).toEqual({original:image});expect(uploads.size).toBe(1);
    expect((await call('/admin/photos/kota/restore?stallId='+owner.id+'&expected='+encodeURIComponent(edited),'POST',{},admin.cookie)).status).toBe(200);
    expect((await call('/vendor/stall','GET',undefined,owner.cookie)).body.menu.find((i:any)=>i.id==='kota').image).toBe(image);
    const order=(await call('/orders','POST',orderInput(owner.id),customer)).body.order;
    expect((await raw('/orders/'+order.id+'/photo',owner.cookie)).status).toBe(403);
    await call('/orders/'+order.id+'/ready','POST',{},owner.cookie);
    expect((await raw('/orders/'+order.id+'/photo',rider)).status).toBe(404);
    expect((await raw('/orders/'+order.id+'/photo',customer)).status).toBe(403);
    expect((await raw('/orders/'+order.id+'/photo',owner.cookie)).status).toBe(200);
    const photo=(await call('/orders/'+order.id,'GET',undefined,owner.cookie)).body.order.photo;expect(photo).toContain('/photos/'+owner.id+'/orders/'+order.id+'/');expect(photo).not.toContain('Thabo');
  });
  it('backfills historical confirmed referrals once and excludes unpaid vendors',async()=>{
    const {owner}=await setup(),unpaid=await vendor('0844444444');
    sqlite.prepare("UPDATE stalls SET referral_name='Thembi' WHERE id IN (?,?)").run(owner.id,unpaid.id);
    const migration=readFileSync('drizzle/0009_real_mandrill.sql','utf8'),backfill=migration.slice(migration.indexOf('INSERT INTO referral_awards'));
    sqlite.exec(backfill);sqlite.exec(backfill);expect(sqlite.prepare('SELECT * FROM referral_awards').all()).toHaveLength(1);expect(sqlite.prepare('SELECT * FROM referral_awards WHERE stall_id=?').get(owner.id)).toMatchObject({amount_cents:7500,paid_at:null,connector_key:'thembi'});
  });

  it('runs a permanent demo stall without weakening real codes or touching WhatsApp, payments or admin totals',async()=>{
    const key='demo-test-admin-key-not-used-in-production',demoCode='73915264';
    api=createApi(db,provider,()=>time,{activationKey:key,demoCode});
    const demoPhone='0820000000';
    expect((await call('/auth/code','POST',{phone:demoPhone})).body).toMatchObject({demo:true,sent:false});
    expect((await call('/auth/verify','POST',{phone:demoPhone,code:'8492'})).status).toBe(401);
    expect((await call('/auth/verify','POST',{phone:'0815550101',code:'73915264'})).status).toBe(400);
    const first=await call('/auth/verify','POST',{phone:demoPhone,code:demoCode,referral_name:'Thembi'});
    expect(first.status).toBe(200);expect(first.body.stall.referral_name).toBe('');
    const owner=first.body.stall,cookie=first.cookie;
    expect(first.body.owner.stall.is_open).toBe(1);
    expect(first.body.owner.menu.every((item:any)=>item.priceCents===null)).toBe(true);expect(first.body.owner.stall.name).toBe("");
    expect((await call('/session','GET',undefined,cookie)).body.demo).toBe(true);
    expect((await call('/vendor/activation','POST',{},cookie)).status).toBe(200);
    const admin=await call('/admin/login','POST',{key});
    expect((await call('/admin/paid','POST',{stallId:owner.id,amountCents:0,reference:'x'},admin.cookie)).status).toBe(409);
    expect((await call('/admin','GET',undefined,admin.cookie)).body.stalls.some((row:any)=>row.phone==='+27820000000')).toBe(false);
    // The code is reusable, and every sign-in starts from a clean demo stall.
    await call('/vendor/stall','PUT',{name:'Changed',town:'X',hours:'08:00–21:00',open:true,takesCard:false},cookie);
    const second=await call('/auth/verify','POST',{phone:demoPhone,code:demoCode});
    expect(second.status).toBe(200);expect(second.body.stall.name).toBe('');expect(second.body.stall.id).not.toBe(owner.id);
    expect(sqlite.prepare("SELECT count(*) AS n FROM whatsapp_outbox").get()).toEqual({n:0});
    // Unconfigured deployments keep the number closed.
    api=createApi(db,provider,()=>time,{activationKey:key});
    expect((await call('/auth/code','POST',{phone:demoPhone})).status).toBe(403);
    expect((await call('/auth/verify','POST',{phone:demoPhone,code:demoCode})).status).toBe(401);
  });
  it('does not create a blank stall when an existing-vendor sign-in uses a number with no stall',async()=>{
    const stalls=()=>(sqlite.prepare('SELECT count(*) AS n FROM stalls').get() as {n:number}).n;
    const before=stalls();
    const miss=await call('/auth/verify','POST',{phone:'0815550177',code:'8492',existing:true});
    expect(miss.status).toBe(404);expect(miss.body.error||miss.body.message).toMatch(/no stall under this number/i);expect(stalls()).toBe(before);
    expect((await call('/auth/verify','POST',{phone:'0815550177',code:'8492'})).status).toBe(200);expect(stalls()).toBe(before+1);
    expect((await call('/auth/verify','POST',{phone:'0815550177',code:'8492',existing:true})).status).toBe(200);
  });
  it('lets admin dismiss one login request or clear every waiting and expired one, never a live code',async()=>{
    const key='clear-test-admin-key-not-used-in-production-1';
    api=createApi(db,provider,()=>time,{activationKey:key,manualCodes:true});
    for(const n of ['0815550201','0815550202','0815550203'])await call('/auth/code','POST',{phone:n});
    const admin=await call('/admin/login','POST',{key});
    await call('/admin/code','POST',{phone:'0815550203'},admin.cookie);
    const count=async()=>(await call('/admin','GET',undefined,admin.cookie)).body.codes.length;
    expect(await count()).toBe(3);
    expect((await call('/admin/codes/clear','POST',{phone:'0815550201'},admin.cookie)).body.cleared).toBe(1);
    expect(await count()).toBe(2);
    expect((await call('/admin/codes/clear','POST',{all:'stale'},admin.cookie)).body.cleared).toBe(1);
    const left=(await call('/admin','GET',undefined,admin.cookie)).body.codes;
    expect(left).toHaveLength(1);expect(left[0].phone).toBe('+27815550203');expect(left[0].code).toBeTruthy();
    expect((await call('/admin/codes/clear','POST',{all:'stale'},'')).status).toBe(401);
  });
  it('lets the owner complete a delivery herself, but not before it is ready, and never a customer or other stall',async()=>{
    const {owner,customer}=await setup();
    const order=(await call('/orders','POST',orderInput(owner.id),customer)).body.order;
    expect((await call('/orders/'+order.id+'/deliver','POST',{},owner.cookie)).status).toBe(409);
    await call('/orders/'+order.id+'/ready','POST',{},owner.cookie);
    expect((await call('/orders/'+order.id+'/deliver','POST',{},customer)).status).toBeGreaterThanOrEqual(403);
    expect((await call('/orders/'+order.id+'/deliver','POST',{},owner.cookie)).status).toBe(200);
    const done=(await call('/orders/'+order.id,'GET',undefined,owner.cookie)).body.order;
    expect(done.state).toBe('delivered');expect(done.riderPhone ?? null).toBe(null);expect(done.lines.every((line:any)=>line.outcome!=='pending')).toBe(true);
    expect((await call('/orders/'+order.id+'/deliver','POST',{},owner.cookie)).status).toBe(409);
  });
  it('lets admin set a simple code, sign in with it for 30 days, add and edit vendors, and remove stalls only with the guards',async()=>{
    const key='admincode-test-key-not-used-in-production-12';
    api=createApi(db,provider,()=>time,{activationKey:key,manualCodes:true});
    expect((await call('/admin/login','POST',{code:'summer2026'})).status).toBe(403);
    const first=await call('/admin/login','POST',{key});expect(first.status).toBe(200);
    expect((await call('/admin','GET',undefined,first.cookie)).body.adminCodeSet).toBe(false);
    expect((await call('/admin/code/set','POST',{code:'abc'},first.cookie)).status).toBe(400);
    expect((await call('/admin/code/set','POST',{code:'summer2026'},first.cookie)).status).toBe(200);
    expect((await call('/admin','GET',undefined,first.cookie)).body.adminCodeSet).toBe(true);
    expect((await call('/admin/code/set','POST',{code:'winter2026'},first.cookie)).status).toBe(403);
    expect((await call('/admin/code/set','POST',{code:'winter2026',current:'summer2026'},first.cookie)).status).toBe(200);
    expect((await call('/admin/login','POST',{code:'summer2026'})).status).toBe(403);
    const viaCode=await call('/admin/login','POST',{code:'winter2026',remember:true});expect(viaCode.status).toBe(200);
    const raw=await api(new Request('https://kasi.test/api/admin/login',{method:'POST',headers:{Origin:'https://kasi.test'},body:JSON.stringify({code:'winter2026',remember:true})}));
    expect(raw.headers.get('set-cookie')).toContain('Max-Age=2592000');
    time+=20*86400000;expect((await call('/admin','GET',undefined,viaCode.cookie)).status).toBe(200);
    time+=11*86400000;expect((await call('/admin','GET',undefined,viaCode.cookie)).status).toBe(401);
    const admin=await call('/admin/login','POST',{key});
    expect((await call('/admin/vendor','POST',{phone:'0815550301',name:'Mam Joy',town:'Soweto',hours:'08:00–21:00'},'')).status).toBe(401);
    const added=await call('/admin/vendor','POST',{phone:'0815550301',name:'Mam Joy',town:'Soweto',hours:'08:00–21:00'},admin.cookie);
    expect(added.status).toBe(200);
    expect((await call('/admin/vendor','POST',{phone:'0815550301',name:'Dup',town:'X',hours:'08:00–21:00'},admin.cookie)).status).toBe(409);
    expect((await call('/admin/vendor','POST',{phone:'0820000000',name:'Demo',town:'X',hours:'08:00–21:00'},admin.cookie)).status).toBe(409);
    expect((await call('/admin/vendor','POST',{phone:'0815550302',name:'Bad',town:'X',hours:'whenever'},admin.cookie)).status).toBe(400);
    expect((await call('/admin/vendor','PUT',{stallId:added.body.stallId,name:'Mam Joy Kotas',town:'Orlando',hours:'09:00–20:00'},admin.cookie)).status).toBe(200);
    const row=(await call('/admin','GET',undefined,admin.cookie)).body.stalls.find((r:any)=>r.id===added.body.stallId);
    expect(row).toMatchObject({name:'Mam Joy Kotas',town:'Orlando',hours:'09:00–20:00'});
    await call('/auth/code','POST',{phone:'0815550301'});const issued=await call('/admin/code','POST',{phone:'0815550301'},admin.cookie);
    const login=await call('/auth/verify','POST',{phone:'0815550301',code:issued.body.code,existing:true});expect(login.status).toBe(200);expect(login.body.stall.id).toBe(added.body.stallId);
    expect((await call('/admin/stall/remove','POST',{phone:'0815550301',confirmPhone:'0815550999'},admin.cookie)).status).toBe(400);
    await call('/admin/paid','POST',{stallId:added.body.stallId,amountCents:30000,reference:'ref1'},admin.cookie);
    expect((await call('/admin/stall/remove','POST',{phone:'0815550301',confirmPhone:'081 555 0301'},admin.cookie)).status).toBe(409);
    expect((await call('/admin/stall/remove','POST',{phone:'0815550301',confirmPhone:'081 555 0301',paidAck:true},admin.cookie)).status).toBe(200);
    expect((sqlite.prepare('SELECT count(*) AS n FROM stalls WHERE phone=?').get('+27815550301') as {n:number}).n).toBe(0);
    expect((await call('/admin/stall/remove','POST',{phone:'0820000000',confirmPhone:'0820000000'},admin.cookie)).status).toBe(409);
  });
});
