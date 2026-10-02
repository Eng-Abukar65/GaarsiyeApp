const db = require('./config/db');

const additions = {
  suppliers: [
    'business_name VARCHAR(255) NULL',
    'contact_person VARCHAR(120) NULL',
    'location VARCHAR(255) NULL'
  ],
  users: [
    'must_change_password TINYINT(1) NOT NULL DEFAULT 0',
    'password_changed_at TIMESTAMP NULL DEFAULT NULL'
  ],
  drivers: [
    'emergency_contact_name VARCHAR(120) NULL',
    'emergency_contact_phone VARCHAR(50) NULL',
    'guardian_name VARCHAR(120) NULL',
    'guardian_phone VARCHAR(50) NULL',
    'sponsor_name VARCHAR(120) NULL',
    'sponsor_phone VARCHAR(50) NULL',
    'sponsor_address VARCHAR(255) NULL'
  ],
  addresses: ['phone VARCHAR(50) NULL'],
  deliveries: [
    'assigned_at TIMESTAMP NULL DEFAULT NULL',
    'responded_at TIMESTAMP NULL DEFAULT NULL',
    'rejection_reason VARCHAR(500) NULL',
    'response_reminder_sent_at TIMESTAMP NULL DEFAULT NULL'
  ],
  orders: [
    'distance_km DECIMAL(8,2) NULL',
    'delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0',
    "payment_recipient ENUM('vendor','admin') NOT NULL DEFAULT 'vendor'",
    'vendor_assigned_at TIMESTAMP NULL DEFAULT NULL',
    'vendor_responded_at TIMESTAMP NULL DEFAULT NULL',
    'vendor_response_reminder_sent_at TIMESTAMP NULL DEFAULT NULL'
  ],
  payments: [
    'vendor_id INT NULL',
    'vendor_amount DECIMAL(10,2) NOT NULL DEFAULT 0',
    'admin_commission DECIMAL(10,2) NOT NULL DEFAULT 0',
    "settlement_status ENUM('pending','settled','failed') NOT NULL DEFAULT 'pending'",
    'settled_at TIMESTAMP NULL DEFAULT NULL'
  ],
  commissions: ['paid_at TIMESTAMP NULL DEFAULT NULL']
};

async function addMissingColumns(table, definitions) {
  const [columns] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
  const existing = new Set(columns.map((column) => column.Field));
  for (const definition of definitions) {
    const name = definition.split(' ')[0].replaceAll('`', '');
    if (!existing.has(name)) {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
      console.log(`Added ${table}.${name}`);
    }
  }
}

async function migrate() {
  try {
    for (const [table, definitions] of Object.entries(additions)) {
      await addMissingColumns(table, definitions);
    }
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_destinations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        address_id INT NULL,
        address_line VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        latitude DECIMAL(10,8) NULL,
        longitude DECIMAL(11,8) NULL,
        sequence_no INT NOT NULL DEFAULT 1,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        delivered_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_destinations_order (order_id, sequence_no),
        CONSTRAINT fk_order_destinations_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_order_destinations_address FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS payment_attempts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        vendor_id INT NOT NULL,
        provider VARCHAR(30) NOT NULL,
        idempotency_key VARCHAR(120) NULL,
        request_id VARCHAR(80) NOT NULL,
        reference_id VARCHAR(100) NOT NULL,
        invoice_id VARCHAR(100) NOT NULL,
        payer_account VARCHAR(50) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        response_code VARCHAR(30) NULL,
        response_message VARCHAR(255) NULL,
        provider_transaction_id VARCHAR(150) NULL,
        status ENUM('initiated','successful','failed','unknown') NOT NULL DEFAULT 'initiated',
        order_id INT NULL,
        raw_response JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_payment_attempt_request (request_id),
        UNIQUE KEY uq_payment_attempt_reference (reference_id),
        UNIQUE KEY uq_payment_attempt_idempotency (idempotency_key),
        INDEX idx_payment_attempt_order (order_id),
        INDEX idx_payment_attempt_customer (customer_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_lpg_levels (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        customer_id INT NOT NULL,
        product_id INT NULL,
        remaining_liters DECIMAL(10,2) NOT NULL,
        capacity_liters DECIMAL(10,2) NOT NULL DEFAULT 50,
        low_level_threshold DECIMAL(10,2) NOT NULL DEFAULT 8,
        source VARCHAR(50) NOT NULL DEFAULT 'manual',
        recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_customer_lpg_vendor_customer (vendor_id, customer_id),
        INDEX idx_customer_lpg_alarm (vendor_id, remaining_liters, low_level_threshold),
        INDEX idx_customer_lpg_recorded (recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS vendor_notifications (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        order_id INT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(60) NOT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_vendor_notifications (vendor_id, is_read, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query('UPDATE orders SET vendor_assigned_at = COALESCE(vendor_assigned_at, created_at) WHERE vendor_id IS NOT NULL');
    await db.query(`
      UPDATE suppliers
      SET business_name = COALESCE(NULLIF(TRIM(business_name), ''), CONCAT('Supplier ', id)),
          contact_person = COALESCE(NULLIF(TRIM(contact_person), ''), 'Not provided'),
          location = COALESCE(NULLIF(TRIM(location), ''), 'Not provided')
    `);
    const [attemptColumns] = await db.query("SHOW COLUMNS FROM payment_attempts LIKE 'idempotency_key'");
    if (attemptColumns.length === 0) {
      await db.query('ALTER TABLE payment_attempts ADD COLUMN idempotency_key VARCHAR(120) NULL AFTER provider');
    }
    const [idempotencyIndex] = await db.query("SHOW INDEX FROM payment_attempts WHERE Key_name = 'uq_payment_attempt_idempotency'");
    if (idempotencyIndex.length === 0) {
      await db.query('ALTER TABLE payment_attempts ADD UNIQUE KEY uq_payment_attempt_idempotency (idempotency_key)');
    }
    await db.query("UPDATE deliveries SET assigned_at = COALESCE(assigned_at, created_at) WHERE status = 'assigned'");
    await db.query('UPDATE payments p JOIN orders o ON o.id = p.order_id SET p.vendor_id = o.vendor_id WHERE p.vendor_id IS NULL');
    console.log('Change-request migration completed.');
  } finally {
    await db.end();
  }
}

migrate().catch((error) => {
  console.error('Change-request migration failed:', error);
  process.exitCode = 1;
});
