const db = require('../config/db');

async function ensureFinancialSchema() {
  try {
    // 1. Create refunds table
    await db.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id VARCHAR(255) DEFAULT NULL,
        order_id INT DEFAULT NULL,
        booking_id INT DEFAULT NULL,
        customer_id INT DEFAULT NULL,
        vendor_id INT DEFAULT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        reason TEXT DEFAULT NULL,
        status ENUM('requested', 'approved', 'rejected', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'requested',
        requested_by INT DEFAULT NULL,
        approved_by INT DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_transaction_id (transaction_id),
        KEY idx_order_id (order_id),
        KEY idx_booking_id (booking_id),
        KEY idx_customer_id (customer_id),
        KEY idx_vendor_id (vendor_id),
        KEY idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 2. Create financial_audit_logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS financial_audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT DEFAULT NULL,
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(100) DEFAULT NULL,
        details JSON DEFAULT NULL,
        ip_address VARCHAR(50) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_admin_id (admin_id),
        KEY idx_action (action),
        KEY idx_target (target_type, target_id),
        KEY idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 3. Ensure payments table exists
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

    return true;
  } catch (err) {
    console.error('[FINANCIAL_SCHEMA] Error ensuring schema:', err);
    throw err;
  }
}

module.exports = {
  ensureFinancialSchema
};
