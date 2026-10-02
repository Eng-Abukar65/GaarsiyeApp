#!/usr/bin/env node

const db = require('./config/db');

async function migrate() {
  try {
    console.log('Starting payments table migration...');

    // 1. Create payments table
    console.log('Creating payments table if not exists...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id VARCHAR(255) NOT NULL,
        customer_id INT NOT NULL,
        vendor_id INT NOT NULL,
        order_id INT DEFAULT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        status ENUM('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
        order_data LONGTEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_transaction_id (transaction_id),
        KEY idx_customer_id (customer_id),
        KEY idx_vendor_id (vendor_id),
        KEY idx_order_id (order_id),
        KEY idx_status (status),
        KEY idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✓ payments table created/verified successfully');

    // 2. Also ensure payment_status in orders table is VARCHAR(20) DEFAULT 'pending'
    console.log('Checking orders.payment_status column...');
    const [columns] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_status'`
    );
    
    if (columns.length === 0) {
      console.log('Adding payment_status column to orders...');
      await db.query(
        `ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending'`
      );
      console.log('✓ Column added');
    } else {
      console.log('✓ Column already exists');
    }

    console.log('Database migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
