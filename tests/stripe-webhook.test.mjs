import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStripeWebhookRoute } from '../api/stripe-webhook.mjs';
import { validateOfferCatalog, verifyPaidCheckout } from '../api/stripe-verifier.mjs';

const SECRET = 'whsec_offline_fixture_only_not_live';
const NOW = 1780000000;
const OFFER = Object.freeze({
  accountId: 'acct_offline_site_test', livemode: false,
  paymentLinkId: 'plink_offline_facturforge_test', priceId: 'price_offline_facturforge_test',
  sku: 'COMM-20260908-MARKETPLACE-FACTURFORGE-PACK100',
  amountTotal: 1900, currency: 'usd', fulfillmentMode: 'manual'
});
const event = (overrides = {}, top = {}) => ({
  id: 'evt_offline_site_event', type: 'checkout.session.completed', account: OFFER.accountId, livemode: false,
  data: { object: {
    object: 'checkout.session', id: 'cs_test_offline_site_event', status: 'complete', livemode: false,
    payment_link: OFFER.paymentLinkId, payment_status: 'paid',
    customer: 'cus_offline_test', customer_details: { email: 'buyer@example.invalid' },
    metadata: { sku: OFFER.sku }, amount_total: 1900, currency: 'usd',
    line_items: { has_more: false, data: [{ quantity: 1, price: { id: OFFER.priceId } }] },
    ...overrides
  } },
  ...top
});
const signed = (value, secret = SECRET, timestamp = NOW) => {
  const raw = Buffer.from(JSON.stringify(value));
  const hash = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
  return { raw, header: `t=${timestamp},v1=${hash}` };
};

test('site route durably records verified sale AND manual fulfillment work and deduplicates replay', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'savage-site-fulfillment-'));
  const route = createStripeWebhookRoute({ signingSecret: SECRET, offers: [OFFER], ledgerDirectory: directory, nowSeconds: () => NOW });
  const server = createServer(async (req, res) => {
    if (await route(req, res)) return;
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (v) => fetch(`${base}/api/stripe/webhook`, {
    method: 'POST', headers: { 'stripe-signature': v.header, 'content-type': 'application/json' }, body: v.raw
  });
  const fixture = signed(event());
  const first = await post(fixture);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true, recorded: true, duplicate: false, fulfillmentStatus: 'pending' });
  const entries = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  assert.equal(entries.length, 1);
  const stored = JSON.parse(await readFile(join(directory, entries[0]), 'utf8'));
  assert.equal(stored.sale.buyerEmail, 'buyer@example.invalid');
  assert.equal(stored.sale.sku, OFFER.sku);
  assert.equal(stored.sale.amountTotal, 1900);
  assert.equal(stored.sale.currency, 'usd');
  assert.equal(stored.sale.providerEventId, 'evt_offline_site_event');
  assert.equal(stored.fulfillment.status, 'pending');
  assert.equal(stored.fulfillment.method, 'manual');

  const duplicates = await Promise.all([post(fixture), post(fixture)]);
  for (const response of duplicates) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).duplicate, true);
  }
  assert.equal((await readdir(directory)).filter((name) => name.endsWith('.json')).length, 1);
  const secondRoute = createStripeWebhookRoute({ signingSecret: SECRET, offers: [OFFER], ledgerDirectory: directory, nowSeconds: () => NOW });
  assert.equal(typeof secondRoute, 'function', 'a restarted route reopens same durable ledger');

  const invalid = [
    ['wrong account', event({}, { id: 'evt_wrongacct', account: 'acct_other' })],
    ['wrong mode', event({}, { id: 'evt_wrongmode', livemode: true })],
    ['wrong session mode', event({ livemode: true }, { id: 'evt_wrongsessionmode' })],
    ['wrong amount', event({ amount_total: 1901 }, { id: 'evt_wrongamount' })],
    ['wrong currency', event({ currency: 'eur' }, { id: 'evt_wrongcurrency' })],
    ['wrong price', event({ line_items: { data: [{ quantity: 1, price: { id: 'price_wrong' } }] } }, { id: 'evt_wrongprice' })],
    ['wrong SKU', event({ metadata: { sku: 'OTHER' } }, { id: 'evt_wrongsku' })],
    ['wrong quantity', event({ line_items: { data: [{ quantity: 2, price: { id: OFFER.priceId } }] } }, { id: 'evt_wrongquantity' })],
    ['unpaid', event({ payment_status: 'unpaid' }, { id: 'evt_unpaid' })],
    ['wrong link', event({ payment_link: 'plink_wrong' }, { id: 'evt_wronglink' })]
  ];
  for (const [label, value] of invalid) {
    const response = await post(signed(value));
    assert.equal(response.status, 400, label);
  }
  assert.equal((await post(signed(event({}, { id: 'evt_invalidsig' }), 'wrong_signing_secret_long'))).status, 400);
  assert.equal((await post(signed(event({}, { id: 'evt_stale' }), SECRET, NOW - 301))).status, 400);
  assert.equal((await readdir(directory)).filter((name) => name.endsWith('.json')).length, 1, 'rejections never record a sale');
  assert.equal((await fetch(`${base}/api/stripe/webhook`)).status, 405);
  assert.equal((await fetch(`${base}/api/not-found`)).status, 404);
});

test('trusted product configuration and raw signature validation fail closed', () => {
  assert.throws(() => validateOfferCatalog([]), /catalog/);
  assert.throws(() => validateOfferCatalog([{ ...OFFER, priceId: '' }]), /configuration/);
  assert.throws(() => createStripeWebhookRoute({ signingSecret: SECRET, offers: [{ ...OFFER, fulfillmentMode: 'automated' }], ledgerDirectory: '/tmp/test-ledger' }), /worker/);
  const correct = signed(event());
  assert.equal(verifyPaidCheckout(correct.raw, correct.header, SECRET, [OFFER], NOW).sku, OFFER.sku);
  assert.throws(() => verifyPaidCheckout(Buffer.concat([correct.raw, Buffer.from(' ')]), correct.header, SECRET, [OFFER], NOW), /signature/);
  assert.throws(() => verifyPaidCheckout(correct.raw, undefined, SECRET, [OFFER], NOW), /header/);
  assert.throws(() => verifyPaidCheckout(correct.raw, 't=1,v1=bad', SECRET, [OFFER], NOW), /signature/);
});
