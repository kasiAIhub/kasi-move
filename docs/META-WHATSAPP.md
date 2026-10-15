# Direct Meta WhatsApp integration

Kasi Move uses React/Vite and a Cloudflare Worker with D1, not Supabase. No Twilio or 360dialog is used by the active backend. Existing manual vendor-code creation remains in private admin; Meta transports newly created codes. The customer's order commits before any outbound network request.

## Server configuration

Set META_WHATSAPP_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_WABA_ID, META_WEBHOOK_VERIFY_TOKEN and META_APP_SECRET as server environment values. Never use VITE_ prefixes. Keep tokens, app secret and verify token secret. WHATSAPP_MODE defaults to test; META_TEST_RECIPIENT is the only allowed recipient in test mode. Missing credentials keep manual sending available. Temporary tokens expire; check the actual expiry through Meta's token debugger rather than assuming a new 24-hour period.

Once the dedicated number is registered, its WABA has approved templates, and the production phone ID/WABA ID/permanent token are installed, the final switch is:

`WHATSAPP_MODE=live`

Apply the updated runtime environment through hosting. No source rebuild is required; changing the flag alone cannot register a SIM or replace test credentials.

## Templates and current account restrictions

POST https://graph.facebook.com/v21.0/{META_WHATSAPP_WABA_ID}/message_templates using the server token. The attempted kasi_welcome authentication template was rejected by the test account (10 / 2388185: no permission). This is an account restriction, not an approved template. kasi_order_alert was submitted as UTILITY, English en_US; its approval must be checked before claiming delivery.

Login codes must use AUTHENTICATION with Meta's prescribed body, security recommendation, ten-minute expiry and Copy code OTP button. The promotional welcome in the original brief was not submitted as utility: it inaccurately claimed an unpaid stall was open and that a single-use code was reusable.

Dashboard fallback after the API rejection: WhatsApp Manager → Message templates → Create template. Name: kasi_welcome; category: Authentication; language: English (US); select Copy code, security recommendation, and expiration of 10 minutes. Meta supplies the body. If creation is disabled, the account must gain authentication-template eligibility; manual admin sending continues meanwhile. Do not disguise a login code as utility or marketing.

Order-alert body:

New order! {{1}} ordered: {{2}}. Total: R{{3}}. Delivery: {{4}}. Open the app to confirm: {{5}}. The customer pays you directly - cash or your speed point machine. Nothing is paid inside the app.

Examples: Thabo; 1 x Russian Special; 60.00; Collection from stall; https://move.kasiaihub.com/kitchen.

## Webhook

Callback: https://move.kasiaihub.com/api/whatsapp/webhook

In Meta app → WhatsApp → Configuration → Webhook → Edit, paste the callback and the exact META_WEBHOOK_VERIFY_TOKEN from the private environment file; choose Verify and save, then subscribe to messages. Subscribe this app to the WABA. GET checks the token and echoes hub.challenge. POST verifies X-Hub-Signature-256 using META_APP_SECRET, filters the phone-number ID, deduplicates messages and records text/timestamps. Invalid signatures are acknowledged but discarded. No outbound API calls delay acknowledgement; a short database write precedes 200. Database failures are logged and still acknowledged per the requested always-200 contract, so monitoring those errors matters.

## Storage and privacy

Schema SQL: drizzle/0006_dazzling_moonstone.sql and drizzle/0007_friendly_psylocke.sql. WhatsApp inbox/outbox are readable only through authenticated private admin. Outbox stores references, outcomes and sanitized errors, never plaintext login codes or tokens. Accepted means Meta accepted a request, not delivery. Signed delivery/read receipts update the log. Explicit retry is available; uncertain timeouts can have delivered and should be checked in Meta before retrying.

Returning customers have one server profile linked to their authenticated browser session. Details work across stalls. A different device must verify its phone via an optional, device-bound, single-use six-digit code before any saved name/address is revealed. Recovery is optional and depends on authentication-template availability; new customers can always enter details normally. Orders retain historical snapshots and a regular marker. Anonymous phone lookup never returns personal details.

## Verification

npm run build
npm test -- --testTimeout=30000

The tests cover signature verification, deduplication, test-recipient isolation, order persistence after Meta rejection, and private single-use profile recovery. Real sends require a current token, verified test recipient, and approved matching template. Screenshots use isolated example data; no real delivery is implied by a preview.
