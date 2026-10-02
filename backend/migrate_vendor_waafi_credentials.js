const db = require('./config/db');
const { decryptCredential, encryptCredential, isEncryptedCredential } = require('./utils/credentialVault');

async function ensureColumn(table, column, definition) {
  const [columns] = await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  if (columns.length === 0) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Added ${table}.${column}`);
  } else {
    console.log(`Verified ${table}.${column}`);
  }
}

async function migrate() {
  await ensureColumn('vendors', 'waafi_merchant_uid', 'VARCHAR(120) NULL');
  await ensureColumn('vendors', 'waafi_api_user_id', 'VARCHAR(120) NULL');
  await ensureColumn('vendors', 'waafi_api_key', 'TEXT NULL');
  await ensureColumn('vendors', 'waafi_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
  await db.query('ALTER TABLE vendors MODIFY COLUMN waafi_api_key TEXT NULL');

  const [storedCredentials] = await db.query(
    "SELECT id, waafi_api_key FROM vendors WHERE waafi_api_key IS NOT NULL AND waafi_api_key <> ''"
  );
  const rotateToDedicatedKey = Boolean(String(process.env.SETTINGS_ENCRYPTION_KEY || '').trim());
  let encryptedCount = 0;
  for (const vendor of storedCredentials) {
    const storedValue = String(vendor.waafi_api_key);
    if (!isEncryptedCredential(storedValue) || rotateToDedicatedKey) {
      const plaintext = decryptCredential(storedValue);
      await db.query(
        'UPDATE vendors SET waafi_api_key = ? WHERE id = ?',
        [encryptCredential(plaintext), vendor.id]
      );
      encryptedCount += 1;
    }
  }
  console.log(`Encrypted or rotated ${encryptedCount} stored WAAFI API key(s).`);

  const defaultVendorId = Number(process.env.HURMOOD_VENDOR_ID || 0);
  if (
    defaultVendorId &&
    process.env.HURMOOD_MERCHANT_UID &&
    process.env.HURMOOD_API_USER_ID &&
    process.env.HURMOOD_API_KEY
  ) {
    const [result] = await db.query(
      `UPDATE vendors
       SET waafi_merchant_uid = COALESCE(NULLIF(waafi_merchant_uid, ''), ?),
           waafi_api_user_id = COALESCE(NULLIF(waafi_api_user_id, ''), ?),
           waafi_api_key = COALESCE(NULLIF(waafi_api_key, ''), ?),
           waafi_enabled = 1
       WHERE id = ?
         AND (waafi_merchant_uid IS NULL OR waafi_merchant_uid = ''
           OR waafi_api_user_id IS NULL OR waafi_api_user_id = ''
           OR waafi_api_key IS NULL OR waafi_api_key = '')`,
      [
        process.env.HURMOOD_MERCHANT_UID,
        process.env.HURMOOD_API_USER_ID,
        encryptCredential(process.env.HURMOOD_API_KEY),
        defaultVendorId
      ]
    );
    console.log(`Seeded default WAAFI merchant for vendor ${defaultVendorId}; rows changed: ${result.affectedRows}`);
  }

  console.log('Vendor WAAFI credential migration completed.');
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Vendor WAAFI credential migration failed:', error);
    process.exit(1);
  });
