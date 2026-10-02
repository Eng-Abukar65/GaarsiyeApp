const db = require('./config/db');

async function updateDb() {
  try {
    console.log("Creating vendor_delivery_zones table in database...");

    await db.query(`
      CREATE TABLE IF NOT EXISTS vendor_delivery_zones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        zone_name VARCHAR(100) NOT NULL,
        delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        estimated_time VARCHAR(50) NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_vendor_zone (vendor_id, zone_name),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log("Database updated successfully with vendor_delivery_zones table!");
  } catch (e) {
    console.error("Error creating vendor_delivery_zones table:", e);
  }
  process.exit(0);
}

updateDb();
