# Kasi Move

An ordering platform for food vendors in South African communities. A vendor sets up a stall, shares one link, and customers order without creating an account. The vendor sees orders in a live kitchen view, and a rider delivers them.

Built by Tsholo Monyausi ([kasiAIhub](https://github.com/kasiAIhub)) with OpenAI Codex. There is no AI inside the product: it is a conventional web app, and this repo is a clean portfolio copy with all credentials and personal data removed.

## What it does

- **Vendors** verify their WhatsApp number, build a menu, upload their own photos, set opening hours (South African time, including overnight ranges) and share a stall link.
- **Customers** open the link, pick items, customise them (included ingredients and extras), see a live total and place an order. Orders belong to a secure device session, so no account is needed. Customers pay the vendor at handover.
- **Riders** join through a one-use, 24-hour invitation link, see assigned deliveries and can buy "next door" items with cash float for the customer.
- **Owner and admin screens** cover orders, delivery and shop-assistant teams, a private admin area and a referral reward flow.
- **WhatsApp notifications** use the Meta WhatsApp Cloud API: order alerts, delivery assigned, payment confirmed. Webhook signatures are verified, replies are de-duplicated, and a provider failure never blocks an order.
- **Payments** for the vendor's own subscription use Yoco checkout with signature, amount and checkout-identity checks before a stall is activated.

## How it is built

| Area | Choice |
| --- | --- |
| Front end | React 19, React Router, Tailwind CSS 4, Vite |
| Server | TypeScript, runs as a Workers-style fetch handler (`src/server`) |
| Data | SQLite / Cloudflare D1 through Drizzle ORM, versioned migrations in `drizzle/` |
| Order logic | Explicit order state machine with optimistic concurrency, so cancelled orders cannot be prepared or delivered |
| Money | Integer-cent totals; no platform money transfers |
| Tests | Vitest server tests (51 passing) and Playwright end-to-end journeys |

Where to look: `src/server` for authorization, the order state machine, hours, payments and WhatsApp adapters; `src/v21` and `src/app` for screens; `db/schema.ts` for the data model; `tests/` for behaviour.

## Run it

Requires Node 24 (the local API uses Node's built-in SQLite).

```bash
npm install
cp .env.example .env.local   # then set your own ACTIVATION_ADMIN_KEY
npm run dev                  # http://localhost:5173
npm test                     # server tests
npm run build
npm run test:e2e             # browser tests, isolated test database
```

`.env.example` lists the variable names only. Every key (Yoco, Meta WhatsApp, admin key) must be supplied by you; none are included.

## Status and honesty notes

- Pilot built for a community in Mamelodi, Pretoria; live payments and automated WhatsApp delivery depend on provider accounts that are not configured in this copy.
- Product photos and the builder card image are not included, so some screens show placeholders. Sample names, phone numbers and orders in the tests and seed data are fictional.
- `docs/` holds three short design notes (customer journey, stall teams, WhatsApp integration).
- Deploying needs a server, database and object storage (it is not a static site).
