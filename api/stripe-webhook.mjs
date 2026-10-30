import { verifyPaidCheckout, validateOfferCatalog } from './stripe-verifier.mjs';
import { PurchaseLedger } from './purchase-ledger.mjs';

async function readRaw(req, max = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error('request too large'), { code: 'BODY_TOO_LARGE' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function respond(res, status, result) {
  const body = JSON.stringify(result);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body), 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' });
  res.end(body);
}

/** HTTP handler; caller must connect it to a server-side host, NOT static hosting. */
export function createStripeWebhookRoute({ signingSecret, offers, ledgerDirectory, nowSeconds } = {}) {
  if (typeof signingSecret !== 'string' || signingSecret.length < 16) throw new Error('Stripe webhook signing secret required');
  const catalog = validateOfferCatalog(offers);
  if (new Set(catalog.map((offer) => `${offer.accountId}/${offer.livemode}`)).size !== 1)
    throw new Error('All offers for one signing secret must bind one Stripe account and mode');
  if (catalog.some((offer) => offer.fulfillmentMode !== 'manual'))
    throw new Error('Automatic fulfillment requires an implemented, durable delivery worker; not configured here');
  const ledger = new PurchaseLedger(ledgerDirectory);
  return async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname !== '/api/stripe/webhook') return false;
    if (req.method !== 'POST') { respond(res, 405, { error: 'METHOD_NOT_ALLOWED' }); return true; }
    let raw;
    try { raw = await readRaw(req); }
    catch (error) { respond(res, error.code === 'BODY_TOO_LARGE' ? 413 : 500, { error: error.code ?? 'BODY_READ_FAILED' }); return true; }
    let purchase;
    try {
      purchase = verifyPaidCheckout(raw, req.headers['stripe-signature'], signingSecret, catalog, nowSeconds?.());
    } catch (error) {
      respond(res, 400, { received: false, error: 'CHECKOUT_REJECTED', reason: error.message });
      return true;
    }
    try {
      const outcome = await ledger.record(purchase);
      // A paid order always creates a durable human-fulfillment work item.
      // No delivery is claimed before a separate fulfillment worker acts.
      respond(res, 200, { received: true, recorded: outcome.recorded, duplicate: outcome.duplicate, fulfillmentStatus: 'pending' });
    } catch {
      // Do not acknowledge an order that could not be durably committed.
      respond(res, 503, { received: false, error: 'PURCHASE_LEDGER_UNAVAILABLE' });
    }
    return true;
  };
}
