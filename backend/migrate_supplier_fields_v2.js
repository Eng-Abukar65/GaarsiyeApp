const db = require('./config/db');

async function migrateSupplierFieldsV2() {
  try {
    for (const column of ['business_name', 'contact_person', 'location']) {
      const [rows] = await db.query(
        `SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'suppliers'
           AND COLUMN_NAME = ?`,
        [column]
      );

      if (rows.length > 0) {
        await db.query(`ALTER TABLE suppliers DROP COLUMN \`${column}\``);
        console.log(`Removed suppliers.${column}`);
      }
    }

    console.log('Supplier fields v2 migration completed.');
  } finally {
    await db.end();
  }
}

migrateSupplierFieldsV2().catch((error) => {
  console.error('Supplier fields v2 migration failed:', error);
  process.exitCode = 1;
});
