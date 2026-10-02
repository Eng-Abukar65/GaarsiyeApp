const db = require('./config/db');

async function run() {
  try {
    console.log('Creating driver_transactions table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS driver_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id INT NOT NULL,
        delivery_id INT DEFAULT NULL,
        type ENUM('earning', 'payout', 'adjustment') NOT NULL DEFAULT 'earning',
        amount DECIMAL(10,2) NOT NULL,
        description VARCHAR(255) DEFAULT NULL,
        status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
        FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL
      )
    `);
    
    // Check if wallet_balance exists in drivers table
    const [columns] = await db.query("SHOW COLUMNS FROM drivers LIKE 'wallet_balance'");
    if (columns.length === 0) {
      console.log('Adding wallet_balance to drivers table...');
      await db.query("ALTER TABLE drivers ADD COLUMN wallet_balance DECIMAL(10,2) DEFAULT 0.00 AFTER current_longitude");
    } else {
      console.log('wallet_balance already exists in drivers table.');
    }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run();
