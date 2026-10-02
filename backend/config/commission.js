// ─── Centralized admin commission configuration ──────────────────────────────
// Single source of truth for the platform commission rate. Every place that
// computes admin commission / vendor net amount MUST use this module so the
// rate can never drift between order creation, delivery settlement, dashboards,
// and reports.
//
// Rate resolution order (highest priority first):
//   1. `settings.commission_rate` row in the DB (admin-editable, a PERCENT)
//   2. ADMIN_COMMISSION_RATE env var (a PERCENT)
//   3. default 2 (%)
//
// The active percent is cached so computeCommission() stays synchronous for hot
// paths (order creation, delivery settlement). Call refreshCommissionRate() at
// startup and after an admin updates the setting.
require('dotenv').config();

function sanitizePercent(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

const ENV_PERCENT = sanitizePercent(process.env.ADMIN_COMMISSION_RATE);
const DEFAULT_PERCENT = 2;

let activePercent = ENV_PERCENT != null ? ENV_PERCENT : DEFAULT_PERCENT;

// Reads settings.commission_rate from the DB and updates the cache. Falls back
// to env/default if the row is missing or invalid. Safe to call repeatedly.
async function refreshCommissionRate(db) {
  try {
    const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'commission_rate' LIMIT 1");
    const fromDb = rows.length ? sanitizePercent(rows[0].setting_value) : null;
    if (fromDb != null) {
      activePercent = fromDb;
    } else if (ENV_PERCENT != null) {
      activePercent = ENV_PERCENT;
    } else {
      activePercent = DEFAULT_PERCENT;
    }
  } catch {
    // Table may not exist yet during early boot — keep current cache.
  }
  return activePercent;
}

function getCommissionPercent() {
  return activePercent;
}

// Returns rounded currency values so DB rows stay consistent to 2 decimals.
function computeCommission(totalAmount) {
  const total = Number(totalAmount);
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const rate = activePercent / 100;
  const commission = Number((safeTotal * rate).toFixed(2));
  const netAmount = Number((safeTotal - commission).toFixed(2));
  return {
    total: safeTotal,
    commission,
    netAmount,
    rate,
    percent: activePercent,
  };
}

module.exports = {
  computeCommission,
  refreshCommissionRate,
  getCommissionPercent,
  sanitizePercent,
  // Backwards-compatible constant reflecting the initial (env/default) percent.
  get COMMISSION_PERCENT() { return activePercent; },
  get COMMISSION_RATE() { return activePercent / 100; },
};
