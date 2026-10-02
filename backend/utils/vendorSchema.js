const db = require('../config/db');
const { addColumn, modifyColumn } = require('./schemaHelper');

let vendorSchemaPromise = null;

async function ensureVendorSchema() {
  if (!vendorSchemaPromise) {
    vendorSchemaPromise = (async () => {
      await addColumn('vendors', 'city', 'VARCHAR(100) DEFAULT NULL');
      await addColumn('vendors', 'district', 'VARCHAR(100) DEFAULT NULL');
      await addColumn('vendors', 'verification_status', "ENUM('pending','verified','rejected','suspended') DEFAULT 'pending'");
      await addColumn('vendors', 'is_open', 'BOOLEAN DEFAULT true');
      await addColumn('vendors', 'opening_time', "TIME DEFAULT '06:00:00'");
      await addColumn('vendors', 'closing_time', "TIME DEFAULT '23:00:00'");
      await addColumn('vendors', 'is_online', 'BOOLEAN DEFAULT true');
      await addColumn('vendors', 'status', "VARCHAR(50) DEFAULT 'active'");
      await addColumn('vendors', 'nira_id', 'VARCHAR(100) DEFAULT NULL');
      await addColumn('vendors', 'government_patent', 'VARCHAR(255) DEFAULT NULL');
      await addColumn('vendors', 'passport_number', 'VARCHAR(255) DEFAULT NULL');
      await addColumn('vendors', 'waafi_merchant_uid', 'VARCHAR(120) DEFAULT NULL');
      await addColumn('vendors', 'waafi_api_user_id', 'VARCHAR(120) DEFAULT NULL');
      await addColumn('vendors', 'waafi_api_key', 'TEXT DEFAULT NULL');
      await addColumn('vendors', 'waafi_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
      // AES-GCM ciphertext is longer than the original API key, so legacy
      // VARCHAR(255) installations must be widened before encrypted writes.
      await modifyColumn('vendors', 'waafi_api_key', 'TEXT DEFAULT NULL');
      await ensurePasswordResetTokensTable();
    })();
  }

  const activePromise = vendorSchemaPromise;

  try {
    return await activePromise;
  } catch (error) {
    // Do not permanently cache a transient MySQL/DDL failure. Without this,
    // every later vendor login in the same backend process reuses the same
    // rejected promise while admin login continues to work normally.
    if (vendorSchemaPromise === activePromise) {
      vendorSchemaPromise = null;
    }
    throw error;
  }
}

async function ensurePasswordResetTokensTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_reset_token_hash (token_hash),
      INDEX idx_password_reset_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await addColumn('password_reset_tokens', 'user_id', 'INT NOT NULL AFTER id');
}

module.exports = {
  ensureVendorSchema,
  ensurePasswordResetTokensTable,
};
