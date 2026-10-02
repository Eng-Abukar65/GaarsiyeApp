#!/usr/bin/env node

/**
 * Migration: Ensure payment_status column exists on orders table
 * for tracking WAAFI async payment flow
 */

const db = require('./config/db');

async function migrate() {
  try {
    console.log('Starting WAAFI payment flow migration...');

    // 1. Add payment_status column to orders if it doesn't exist
    console.log('1. Checking orders.payment_status column...');
    try {
      const [columns] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_status'`
      );
      
      if (columns.length === 0) {
        console.log('   Adding payment_status column to orders table...');
        await db.query(
          `ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending'`
        );
        console.log('   ✓ Column added');
      } else {
        console.log('   ✓ Column already exists');
      }
    } catch (err) {
      console.error('   Error checking/adding payment_status:', err.message);
    }

    // 2. Ensure payment_attempts table has correct schema
    console.log('\n2. Checking payment_attempts table schema...');
    try {
      const [existingTable] = await db.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_NAME = 'payment_attempts'`
      );
      
      if (existingTable.length === 0) {
        console.log('   Creating payment_attempts table...');
        await db.query(`
          CREATE TABLE payment_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            vendor_id INT,
            order_id INT,
            provider VARCHAR(50) NOT NULL DEFAULT 'waafi',
            idempotency_key VARCHAR(120),
            request_id VARCHAR(100),
            reference_id VARCHAR(100),
            invoice_id VARCHAR(100),
            payer_account VARCHAR(50),
            amount DECIMAL(10, 2),
            currency VARCHAR(10) DEFAULT 'USD',
            status VARCHAR(30) DEFAULT 'pending',
            response_code VARCHAR(10),
            response_message TEXT,
            provider_transaction_id VARCHAR(100),
            raw_response LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_idempotency (customer_id, idempotency_key),
            KEY idx_reference_id (reference_id),
            KEY idx_customer_id (customer_id),
            KEY idx_order_id (order_id),
            KEY idx_status (status),
            KEY idx_created_at (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('   ✓ Table created');
      } else {
        console.log('   ✓ Table already exists');
        
        // Check for status column
        const [statusCol] = await db.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_NAME = 'payment_attempts' AND COLUMN_NAME = 'status'`
        );
        if (statusCol.length === 0) {
          console.log('   Adding status column...');
          await db.query(
            `ALTER TABLE payment_attempts ADD COLUMN status VARCHAR(30) DEFAULT 'pending'`
          );
          console.log('   ✓ Column added');
        }
      }
    } catch (err) {
      console.error('   Error with payment_attempts table:', err.message);
    }

    console.log('\n✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
