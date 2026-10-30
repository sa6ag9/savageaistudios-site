# Phase 2 purchase webhook (branch-only, not deployed)

The existing site is static HTML, and **static hosts cannot execute Node webhook code**. This PR adds a Node 22+ webhook service entry point and a durable, fail-closed pending-fulfillment queue. No production endpoint exists until a separate deployment and routing change is authorized.

## Current behavior

`POST /api/stripe/webhook` checks the raw Stripe signature using the logic ported from `savage-marketplace/products/facturforge/src/stripe-webhook.ts`, plus trusted configuration for each offer: Stripe account, live/test mode, Payment Link ID, Price ID, exact amount (minor currency units), currency, SKU, single-item quantity, paid status and buyer. For a verified purchase it commits the **sale and pending manual-fulfillment row atomically** in a private directory; a replayed event ID does not duplicate the sale. Invalid/missing configuration prevents startup. Unknown offers and unsigned/mismatched events receive no ledger write.

This does **not** automatically send paid downloads or credentials. Every accepted purchase is durably queued as `pending` for manual fulfillment. A future automated delivery worker must be implemented and tested before any offer may declare `fulfillmentMode: "automated"`. There is no public read API for buyer records.

## Configure from trusted Stripe dashboard records, not the website URLs

Set these environment variables in a server-side runtime:

- `STRIPE_WEBHOOK_SECRET`: endpoint secret for the particular Stripe account/mode, never committed or exposed to the browser.
- `STRIPE_API_READ_KEY`: a server-only account-scoped Stripe read key (a restricted key with Checkout line-item read permissions where supported), paired to the same account/mode; the webhook now makes a GET request to Stripe for normal unexpanded events.
- `SAVAGE_PURCHASE_LEDGER_DIR`: absolute private persistent path with filesystem atomic hardlink and fsync support; **not ephemeral container storage**.
- `SAVAGE_STRIPE_PRODUCTS_JSON`: JSON array of offers, each with `accountId`, `livemode`, `paymentLinkId`, `priceId`, `sku`, `amountTotal`, `currency`, `fulfillmentMode: "manual"`.
- `PORT` and optional `HOST`: HTTPS reverse proxy must send unmodified raw body and `Stripe-Signature` to this service.

Every offer on this one endpoint must belong to the *same account and mode* as its signing secret. Different accounts need independently configured endpoints. Signed `metadata.sku` remains required. If signed `line_items` is absent (the normal webhook shape), the server now retrieves `/v1/checkout/sessions/{id}/line_items?limit=2` using its configured secret read key and confirms exactly one line item and the trusted Price ID/quantity. A missing key, failed lookup, ambiguous item count or extra pagination fails with HTTP 503 or rejection; **no sale is recorded**, so delivery is never triggered without price verification. Test-mode acceptance against Stripe and account-scoped read-key permissions remain required.

**Never guess `plink_` or `price_` IDs from `buy.stripe.com` URLs.** The audit reports 43 site buy links, but no verified mapping of all 43 to Stripe account, Price ID, expected SKU and fulfillment method is stored in this repository. Populate the catalog from real account records before considering this route production-ready. Unmapped purchases fail closed.

## Offline verification

From the repository root, with Node 22 or newer:

```sh
npm test
```

The `tests/stripe-webhook.test.mjs` test signs synthetic offline events, sends actual HTTP requests, verifies durable sale + work rows on disk, checks replay and mismatch rejections, and uses no Stripe network calls or money.

Production acceptance requires: CI green on the exact branch SHA; signed Stripe test-mode end-to-end checkout and receipt; all actual product IDs mapped; private persistent storage and backup/recovery proof; worker fulfillment and refunds/chargebacks; and separately authorized deployment. A green unit test does not waive these requirements.
