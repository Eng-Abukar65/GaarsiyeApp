const db = require('./config/db');

const columnsToAdd = [
  'address VARCHAR(255) NULL',
  'dob DATE NULL',
  'emergency_contact VARCHAR(100) NULL',
  'guardian_contact VARCHAR(100) NULL',
  'guarantor_info VARCHAR(255) NULL'
];

async function migrate() {
  try {
    console.log('[MIGRATION] Checking missing driver profile columns...');
    const [columns] = await db.query('SHOW COLUMNS FROM drivers');
    const existingColumns = new Set(columns.map(col => col.Field));

    for (const def of columnsToAdd) {
      const colName = def.split(' ')[0];
      if (!existingColumns.has(colName)) {
        await db.query(`ALTER TABLE drivers ADD COLUMN ${def}`);
        console.log(`[MIGRATION] Added column drivers.${colName}`);
      } else {
        console.log(`[MIGRATION] Column drivers.${colName} already exists`);
      }
    }
    console.log('[MIGRATION] Driver profile expanded fields migration completed successfully.');
  } catch (err) {
    console.error('[MIGRATION] Error migrating driver profile columns:', err);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

migrate();
