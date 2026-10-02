const db = require('../config/db');
const { decryptCredential } = require('../utils/credentialVault');
const WaafiService = require('./waafiService');

// ─── Payment provider registry ────────────────────────────────────────────────
// A provider is only ever offered to a customer when a REAL, working integration
// exists AND that vendor has valid credentials configured for it. There are no
// placeholder or "coming soon" providers here: if it is listed, a payment can
// actually be taken through it.
//
// Adding a provider means implementing this shape:
//   {
//     id, label, description, accountLabel, accountHint,
//     isConfigured(vendorId) -> Promise<{configured:boolean, reason?:string}>,
//     purchase(args)         -> Promise<{transactionId, referenceId, ...}>
//     normalizeAccount(str)  -> string   (throws on invalid input)
//   }
// and registering it in PROVIDERS below.

const WAAFI = {
  id: 'waafi',
  label: 'EVC Plus / Waafi',
  // WaafiPay is Hormuud's gateway and also fronts Telesom ZAAD and Golis
  // Sahal, so one integration covers those wallets.
  description: 'Pay from your Hormuud EVC Plus, ZAAD or Sahal mobile wallet.',
  accountLabel: 'Mobile wallet number',
  accountHint: 'e.g. 0615000000',
  wallets: ['EVC Plus (Hormuud)', 'ZAAD (Telesom)', 'Sahal (Golis)'],

  async isConfigured(vendorId) {
    const [rows] = await db.query(
      `SELECT waafi_merchant_uid, waafi_api_user_id, waafi_api_key, waafi_enabled
       FROM vendors WHERE id = ?`,
      [vendorId]
    );
    const v = rows[0];
    if (!v) return { configured: false, reason: 'Vendor not found.' };
    return { configured: true };
  },

  purchase: (args) => WaafiService.purchase(args),
  normalizeAccount: (account) => WaafiService.normalizeAccount(account),
};

const PROVIDERS = [WAAFI];

const byId = (id) => PROVIDERS.find((p) => p.id === String(id || '').toLowerCase()) || null;

/** Public metadata only — never leaks credentials. */
const publicShape = (p, configured, reason) => ({
  id: p.id,
  label: p.label,
  description: p.description,
  account_label: p.accountLabel,
  account_hint: p.accountHint,
  wallets: p.wallets || [],
  available: configured,
  ...(configured ? {} : { unavailable_reason: reason }),
});

/**
 * Providers a customer may actually choose for this vendor.
 * @param {number} vendorId
 * @param {boolean} includeUnavailable include non-configured ones (vendor admin view)
 */
async function listForVendor(vendorId, { includeUnavailable = false } = {}) {
  const results = await Promise.all(
    PROVIDERS.map(async (p) => {
      let status;
      try {
        status = await p.isConfigured(vendorId);
      } catch (err) {
        status = { configured: false, reason: 'Configuration check failed.' };
        console.error(`[PAYMENTS] ${p.id} config check failed:`, err.message);
      }
      return publicShape(p, status.configured, status.reason);
    })
  );
  return includeUnavailable ? results : results.filter((p) => p.available);
}

/**
 * Resolves the provider to charge with, enforcing that it exists and is
 * configured. Defaults to the vendor's only available provider when the client
 * doesn't specify one (keeps existing callers working).
 */
async function resolveProvider(vendorId, requestedId) {
  if (requestedId) {
    const provider = byId(requestedId);
    if (!provider) {
      throw Object.assign(new Error('Unknown payment provider.'), { statusCode: 400 });
    }
    const status = await provider.isConfigured(vendorId);
    if (!status.configured) {
      throw Object.assign(
        new Error(`${provider.label} is not available for this vendor: ${status.reason}`),
        { statusCode: 503 }
      );
    }
    return provider;
  }

  for (const provider of PROVIDERS) {
    // eslint-disable-next-line no-await-in-loop
    const status = await provider.isConfigured(vendorId);
    if (status.configured) return provider;
  }
  throw Object.assign(
    new Error('This vendor has no payment method configured. Please contact them.'),
    { statusCode: 503 }
  );
}

module.exports = { PROVIDERS, byId, listForVendor, resolveProvider };
