/**
 * migrate_delivery_offers.js
 *
 * Creates the delivery_offers table and adds three columns to the orders table
 * required by the Driver Delivery Offer feature.
 *
 * Run once:  node migrate_delivery_offers.js
 */

require('dotenv').config();
const db = require('./config/db');

async function run() {
  console.log('[MIGRATE] Starting delivery_offers migration…');

  // ── 1. Create delivery_offers table ─────────────────────────────────────────
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_offers (
      id              INT          NOT NULL AUTO_INCREMENT,
      order_id        INT          NOT NULL,
      driver_id       INT          NOT NULL,
      vendor_id       INT          NOT NULL,
      offered_amount  DECIMAL(10,2) NOT NULL,
      status          ENUM('pending','accepted','declined','expired','cancelled')
                      NOT NULL DEFAULT 'pending',
      offered_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at    TIMESTAMP    NULL,
      expires_at      TIMESTAMP    NULL,
      created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_do_order   (order_id),
      INDEX idx_do_driver  (driver_id),
      INDEX idx_do_vendor  (vendor_id),
      INDEX idx_do_status  (status),
      INDEX idx_do_pending (order_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[MIGRATE] ✅ delivery_offers table ready');

  // ── 2. Add columns to orders ─────────────────────────────────────────────────
  const ordersColumns = [
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_earning DECIMAL(10,2) NULL`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_assignment_status VARCHAR(40) NULL COMMENT 'null | offer_sent | driver_assigned'`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_driver_id INT NULL`,
  ];

  for (const sql of ordersColumns) {
    try {
      await db.query(sql);
    } catch (err) {
      // MySQL < 8 doesn't support IF NOT EXISTS for ALTER COLUMN — ignore dup-column errors
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }
  console.log('[MIGRATE] ✅ orders columns ready (driver_earning, driver_assignment_status, assigned_driver_id)');

  // ── 3. Add unique guard on driver_transactions to prevent double wallet credit ─
  try {
    await db.query(`
      ALTER TABLE driver_transactions
      ADD UNIQUE INDEX IF NOT EXISTS uq_dt_order_earning (driver_id, order_id, type)
    `);
    console.log('[MIGRATE] ✅ driver_transactions unique guard ready');
  } catch (err) {
    // Older MySQL or index already exists — not fatal
    console.warn('[MIGRATE] ⚠️  driver_transactions unique index skipped:', err.message);
  }

  console.log('[MIGRATE] ✅ Migration complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[MIGRATE] ❌ Migration failed:', err);
  process.exit(1);
});
