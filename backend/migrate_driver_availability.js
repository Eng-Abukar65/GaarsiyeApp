/**
 * migrate_driver_availability.js
 *
 * Migration script to add availability, online, and activity columns to drivers table.
 */

require('dotenv').config();
const db = require('./config/db');

async function run() {
  console.log('[MIGRATE] Starting driver availability schema migration…');

  const queries = [
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS availability_status VARCHAR(40) NOT NULL DEFAULT 'available'`,
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS account_status VARCHAR(40) NOT NULL DEFAULT 'approved'`,
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_order_id INT NULL DEFAULT NULL`,
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP NULL DEFAULT NULL`,
  ];

  for (const q of queries) {
    try {
      await db.query(q);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') console.warn('[MIGRATE] Column add warning:', err.message);
    }
  }

  // Update last_seen_at from last_seen if last_seen_at is NULL
  await db.query(`UPDATE drivers SET last_seen_at = last_seen WHERE last_seen_at IS NULL AND last_seen IS NOT NULL`);

  // Sync availability_status from status if status is set
  await db.query(`
    UPDATE drivers
    SET availability_status = CASE
      WHEN status = 'busy' THEN 'busy'
      WHEN status = 'offline' THEN 'offline'
      ELSE 'available'
    END
    WHERE availability_status IS NULL OR availability_status = 'available'
  `);

  // Sync account_status from verification_status if pending or rejected
  await db.query(`
    UPDATE drivers
    SET account_status = CASE
      WHEN verification_status = 'rejected' THEN 'rejected'
      WHEN verification_status = 'pending' THEN 'pending'
      ELSE 'approved'
    END
    WHERE account_status IS NULL OR account_status = 'approved'
  `);

  console.log('[MIGRATE] ✅ Driver availability schema ready!');
  process.exit(0);
}

run().catch((err) => {
  console.error('[MIGRATE] ❌ Migration failed:', err);
  process.exit(1);
});
