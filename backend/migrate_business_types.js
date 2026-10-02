const db = require('./config/db');

async function migrateBusinessTypes() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS vendor_business_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        business_type VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);

    // Migrate existing data from vendors.business_type
    const [vendors] = await db.query('SELECT id, business_type FROM vendors WHERE business_type IS NOT NULL');
    
    for (const v of vendors) {
      if (v.business_type) {
        // Check if already migrated
        const [existing] = await db.query('SELECT id FROM vendor_business_types WHERE vendor_id = ? AND business_type = ?', [v.id, v.business_type]);
        if (existing.length === 0) {
          await db.query('INSERT INTO vendor_business_types (vendor_id, business_type) VALUES (?, ?)', [v.id, v.business_type]);
        }
      }
    }
    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration error:", err);
  }
  process.exit(0);
}

migrateBusinessTypes();
