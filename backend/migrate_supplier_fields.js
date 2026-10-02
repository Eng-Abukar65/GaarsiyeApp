const db = require('./config/db');

async function migrateSupplierFields() {
  try {
    for (const column of ['category', 'email', 'status']) {
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

    console.log('Supplier fields migration completed.');
  } finally {
    await db.end();
  }
}

migrateSupplierFields().catch((error) => {
  console.error('Supplier fields migration failed:', error);
  process.exitCode = 1;
});
