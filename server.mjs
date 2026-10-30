import { createServer } from 'node:http';
import { createStripeWebhookRoute } from './api/stripe-webhook.mjs';

const offers = JSON.parse(process.env.SAVAGE_STRIPE_PRODUCTS_JSON ?? 'null');
const route = createStripeWebhookRoute({
  signingSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripeApiKey: process.env.STRIPE_API_READ_KEY,
  offers,
  ledgerDirectory: process.env.SAVAGE_PURCHASE_LEDGER_DIR
});
const port = Number(process.env.PORT ?? '8080');
const host = process.env.HOST ?? '127.0.0.1';
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createServer(async (request, response) => {
  try {
    if (await route(request, response)) return;
    response.writeHead(404).end();
  } catch { response.writeHead(500).end(); }
});
server.listen(port, host, () => console.log(`Stripe webhook listening on ${host}:${port}`));
