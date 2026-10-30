import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, link, readFile, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/**
 * Durable idempotent sale + fulfillment queue, committed in one atomic file
 * per Stripe event. The work is not considered delivered merely because a
 * checkout succeeded. No user PII is served through a public read endpoint.
 */
export class PurchaseLedger {
  constructor(directory) {
    if (!isAbsolute(directory)) throw new Error('A private absolute purchase ledger directory is required');
    this.directory = directory;
  }

  async record(purchase) {
    if (!/^evt_[A-Za-z0-9_]+$/.test(purchase?.eventId ?? '')) throw new Error('invalid event ID');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const key = createHash('sha256').update(purchase.eventId).digest('hex');
    const destination = join(this.directory, `${key}.json`);
    const binding = createHash('sha256').update(JSON.stringify(purchase)).digest('hex');
    const row = {
      schemaVersion: 1, eventId: purchase.eventId, purchaseBinding: binding,
      sale: {
        checkoutSessionId: purchase.sessionId,
        buyerEmail: purchase.customerEmail,
        sku: purchase.sku,
        amountTotal: purchase.amountTotal,
        currency: purchase.currency,
        accountId: purchase.accountId,
        livemode: purchase.livemode,
        providerEventId: purchase.eventId,
        purchasedAt: purchase.observedAt
      },
      fulfillment: {
        sku: purchase.sku,
        status: 'pending',
        method: purchase.fulfillmentMode,
        sourceEventId: purchase.eventId
      }
    };
    const temp = join(this.directory, `.${key}.${randomBytes(12).toString('hex')}.tmp`);
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(row) + '\n');
      await handle.sync();
    } finally { await handle.close(); }
    try {
      await link(temp, destination); // link is atomic/exclusive on the same filesystem
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let existing;
      try { existing = JSON.parse(await readFile(destination, 'utf8')); }
      catch { throw new Error('existing purchase ledger is unreadable; refusing webhook acknowledgment'); }
      if (existing.schemaVersion !== 1 || existing.eventId !== purchase.eventId
        || existing.purchaseBinding !== binding || !existing.sale || !existing.fulfillment)
        throw new Error('conflicting or corrupt replay for this Stripe event ID');
      return { recorded: false, duplicate: true, row: existing };
    } finally {
      await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
    if (process.platform !== 'win32') {
      const parent = await open(this.directory, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    }
    return { recorded: true, duplicate: false, row };
  }
}
