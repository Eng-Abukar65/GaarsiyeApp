const db = require('./config/db');

const additions = {
  drivers: [
    'dob DATE NULL'
  ],
  orders: [
    'vendor_assigned_at TIMESTAMP NULL DEFAULT NULL',
    'vendor_responded_at TIMESTAMP NULL DEFAULT NULL',
    'vendor_response_time INT NULL'
  ]
};

async function addMissingColumns(table, definitions) {
  const [columns] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
  const existing = new Set(columns.map((c) => c.Field));
  for (const definition of definitions) {
    const name = definition.split(' ')[0].replaceAll('`', '');
    if (!existing.has(name)) {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
      console.log(`Added ${table}.${name}`);
    } else {
      console.log(`Skipped ${table}.${name} (already exists)`);
    }
  }
}

async function addOrderStatusEnum() {
  // Add 'waiting response' to the orders.status enum if not present
  const [rows] = await db.query(`SHOW COLUMNS FROM orders LIKE 'status'`);
  if (rows.length > 0) {
    const type = rows[0].Type;
    if (!type.includes('waiting response')) {
      // Build new enum including 'waiting response'
      // First parse existing values
      const match = type.match(/enum\((.+)\)/i);
      if (match) {
        const existing = match[1]; // e.g. 'pending','confirmed','assigned',...
        const newType = `enum(${existing},'waiting response')`;
        await db.query(`ALTER TABLE orders MODIFY COLUMN status ${newType} NOT NULL DEFAULT 'pending'`);
        console.log("Added 'waiting response' to orders.status enum");
      }
    } else {
      console.log("orders.status enum already has 'waiting response'");
    }
  }
}

async function migrate() {
  try {
    for (const [table, definitions] of Object.entries(additions)) {
      await addMissingColumns(table, definitions);
    }
    await addOrderStatusEnum();
    console.log('Phase 2 migration completed successfully.');
  } finally {
    await db.end();
  }
}

migrate().catch((err) => {
  console.error('Phase 2 migration failed:', err);
  process.exitCode = 1;
});
