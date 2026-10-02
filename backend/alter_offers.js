const db = require('./config/db');

async function updateDb() {
  try {
    console.log('Creating offers table in database...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        offer_type ENUM('percentage', 'fixed_amount', 'free_delivery', 'product_specific') NOT NULL DEFAULT 'percentage',
        discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        product_id INT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('Database updated successfully with offers table!');
  } catch (e) {
    console.error('Error creating offers table:', e);
  } finally {
    process.exit(0);
  }
}

updateDb();
