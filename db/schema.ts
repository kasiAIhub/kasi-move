import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const stalls = sqliteTable('stalls', {
  id: text('id').primaryKey(), phone: text('phone').notNull().unique(),
  referralName: text('referral_name').notNull().default(''),
  name: text('name').notNull().default(''), town: text('town').notNull().default(''),
  hours: text('hours').notNull().default('08:00–21:00'),
  isOpen: integer('is_open').notNull().default(0), takesCard: integer('takes_card').notNull().default(0),
  riderPhone: text('rider_phone'), firstOrderAt: integer('first_order_at'), activatedAt: integer('activated_at'),
  settings: text('settings').notNull().default('{}'),
  paymentReportedAt: integer('payment_reported_at'),
  slug: text('slug').unique(),
});
export const menu = sqliteTable('menu', {
  id: text('id').primaryKey(), stallId: text('stall_id').notNull().references(() => stalls.id),
  body: text('body').notNull(),
});
export const sessions = sqliteTable('sessions', {
  hash: text('hash').primaryKey(), role: text('role').notNull(),
  stallId: text('stall_id').references(() => stalls.id), phone: text('phone'),
  expiresAt: integer('expires_at').notNull(),
});
export const orders = sqliteTable('gate_orders', {
  id: text('id').primaryKey(), stallId: text('stall_id').notNull().references(() => stalls.id),
  customerHash: text('customer_hash').notNull(), requestKey: text('request_key').notNull(),
  body: text('body').notNull(), version: integer('version').notNull().default(0),
}, table => [uniqueIndex('gate_orders_request').on(table.customerHash, table.requestKey)]);
export const invites = sqliteTable('rider_invites', {
  hash: text('hash').primaryKey(), stallId: text('stall_id').notNull().references(() => stalls.id),
  phone: text('phone').notNull(), expiresAt: integer('expires_at').notNull(), usedAt: integer('used_at'),
  feeCents: integer('fee_cents').notNull().default(1000), decision: text('decision'),
  name: text('name').notNull().default(''), role: text('role').notNull().default('rider'),
});
export const limits = sqliteTable('request_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), resetsAt: integer('resets_at').notNull(),
});
export const counters = sqliteTable('order_counters', {
  stallId: text('stall_id').primaryKey().references(() => stalls.id),
  next: integer('next').notNull().default(0),
});
export const loginCodes = sqliteTable('login_codes', {
  phone: text('phone').primaryKey(), proof: text('proof').notNull(), cipher: text('cipher').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const activationCheckouts = sqliteTable('activation_checkouts', {
  id: text('id').primaryKey(), stallId: text('stall_id').notNull().references(() => stalls.id), paidAt: integer('paid_at'),
});
export const shopOptouts = sqliteTable('shop_optouts', { phone: text('phone').primaryKey(), stoppedAt: integer('stopped_at').notNull() });

export const vendorPasswords = sqliteTable('vendor_passwords', {
  stallId: text('stall_id').primaryKey().references(() => stalls.id),
  passwordHash: text('password_hash').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const whatsappInbox = sqliteTable('whatsapp_inbox', {
  id: text('id').primaryKey(), phone: text('phone').notNull(), text: text('text').notNull(),
  sentAt: integer('sent_at').notNull(), receivedAt: integer('received_at').notNull(),
});
export const whatsappOutbox = sqliteTable('whatsapp_outbox', {
  id: text('id').primaryKey(), phone: text('phone').notNull(), kind: text('kind').notNull(),
  payload: text('payload'), reference: text('reference').notNull(), status: text('status').notNull(),
  attempts: integer('attempts').notNull().default(0), messageId: text('message_id'), error: text('error'),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [uniqueIndex('whatsapp_message_id').on(table.messageId)]);

export const customerProfiles=sqliteTable('customer_profiles',{
 id:text('id').primaryKey(), phone:text('phone').notNull(), name:text('name').notNull(), gateNote:text('gate_note').notNull(), orders:integer('orders').notNull().default(0), verifiedAt:integer('verified_at'),updatedAt:integer('updated_at').notNull(),
},table=>[index('customer_profile_phone').on(table.phone)]);
export const customerDevices=sqliteTable('customer_devices',{deviceHash:text('device_hash').primaryKey(),profileId:text('profile_id').notNull().references(()=>customerProfiles.id)});
export const customerChallenges=sqliteTable('customer_challenges',{id:text('id').primaryKey(),deviceHash:text('device_hash').notNull(),phone:text('phone').notNull(),proof:text('proof').notNull(),cipher:text('cipher').notNull(),expiresAt:integer('expires_at').notNull()});

export const teamMembers = sqliteTable('team_members', {
 id:text('id').primaryKey(), stallId:text('stall_id').notNull().references(()=>stalls.id), phone:text('phone').notNull(), name:text('name').notNull(), role:text('role').notNull(), active:integer('active').notNull().default(1), available:integer('available').notNull().default(1), feeCents:integer('fee_cents').notNull().default(0), joinedAt:integer('joined_at').notNull(),
},table=>[uniqueIndex('team_stall_phone_role').on(table.stallId,table.phone,table.role)]);

export const referralAwards=sqliteTable('referral_awards',{
 stallId:text('stall_id').primaryKey(),connectorKey:text('connector_key').notNull(),connectorName:text('connector_name').notNull(),vendorName:text('vendor_name').notNull(),vendorPhone:text('vendor_phone').notNull(),earnedAt:integer('earned_at').notNull(),amountCents:integer('amount_cents').notNull().default(7500),paidAt:integer('paid_at'),payoutReference:text('payout_reference'),
});

export const teamAccess=sqliteTable('team_access',{
 memberId:text('member_id').primaryKey().references(()=>teamMembers.id),stallId:text('stall_id').notNull().references(()=>stalls.id),hash:text('hash').notNull().unique(),cipher:text('cipher').notNull(),
});
export const connectorContacts=sqliteTable('connector_contacts',{
 key:text('key').primaryKey(),name:text('name').notNull(),phone:text('phone').notNull(),verifiedAt:integer('verified_at').notNull(),
});
export const photoEdits=sqliteTable('photo_edits',{
 id:text('id').primaryKey(),stallId:text('stall_id').notNull().references(()=>stalls.id),itemId:text('item_id').notNull(),original:text('original').notNull(),image:text('image').notNull(),settings:text('settings').notNull(),createdAt:integer('created_at').notNull(),
});
