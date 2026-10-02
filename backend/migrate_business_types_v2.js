const db = require('./config/db');

async function migrate() {
  try {
    // 1. Create business_types table
    await db.query(`
      CREATE TABLE IF NOT EXISTS business_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        status ENUM('active','inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // 2. Insert default types
    await db.query(`
      INSERT IGNORE INTO business_types (name)
      VALUES
      ('Petrol Station'),
      ('Gas Depot'),
      ('Spare Parts Shop'),
      ('Car Wash');
    `);

    // 3. Drop old vendor_business_types to re-create it cleanly as requested
    await db.query(`DROP TABLE IF EXISTS vendor_business_types;`);

    // 4. Create new vendor_business_types pivot table
    await db.query(`
      CREATE TABLE IF NOT EXISTS vendor_business_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        business_type_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_vendor_business_type (vendor_id, business_type_id),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (business_type_id) REFERENCES business_types(id) ON DELETE CASCADE
      );
    `);

    console.log("Database schema updated successfully.");
  } catch (err) {
    console.error("Migration error:", err);
  }
  process.exit(0);
}

migrate();
