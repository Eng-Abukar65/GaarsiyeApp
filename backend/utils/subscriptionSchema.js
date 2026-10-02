const db = require('../config/db');

let subscriptionSchemaPromise = null;

const STATEMENTS = [
  // Ensure vendors table has subscription management columns
  `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) NOT NULL DEFAULT 'Standard'`,
  `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS subscription_status ENUM('active','inactive','pending','expired') NOT NULL DEFAULT 'active'`,
  `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS subscription_expires_at DATE DEFAULT NULL`,

  `CREATE TABLE IF NOT EXISTS vendor_subscription_payments (
     id INT AUTO_INCREMENT PRIMARY KEY,
     vendor_id INT NOT NULL,
     plan_name VARCHAR(50) NOT NULL DEFAULT 'Standard',
     amount DECIMAL(10,2) NOT NULL DEFAULT 50.00,
     payment_method VARCHAR(50) NOT NULL,
     reference_number VARCHAR(120) NOT NULL,
     receipt_url VARCHAR(255) NOT NULL,
     notes TEXT DEFAULT NULL,
     status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
     admin_notes TEXT DEFAULT NULL,
     reviewed_by INT DEFAULT NULL,
     reviewed_at TIMESTAMP NULL DEFAULT NULL,
     billing_period VARCHAR(7) DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_sp_vendor (vendor_id, status),
     INDEX idx_sp_status (status),
     CONSTRAINT fk_sp_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Subscription pricing table (Admin customizable monthly fees per module configuration)
  `CREATE TABLE IF NOT EXISTS subscription_pricing (
     id INT AUTO_INCREMENT PRIMARY KEY,
     plan_code VARCHAR(50) NOT NULL UNIQUE,
     plan_name VARCHAR(100) NOT NULL,
     module_count INT NOT NULL UNIQUE,
     module_description VARCHAR(255) NOT NULL,
     price DECIMAL(10,2) NOT NULL DEFAULT 20.00,
     status ENUM('active','inactive') NOT NULL DEFAULT 'active',
     updated_by_user_id INT DEFAULT NULL,
     updated_by_name VARCHAR(100) DEFAULT 'System Admin',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Seed default pricing rows if not existing
  `INSERT IGNORE INTO subscription_pricing
     (id, plan_code, plan_name, module_count, module_description, price, status, updated_by_name)
   VALUES
     (1, 'basic_1_module', 'Basic Plan', 1, 'Gas Only (1 Module)', 20.00, 'active', 'System Admin'),
     (2, 'standard_2_modules', 'Standard Plan', 2, 'Gas + Petrol/Diesel (2 Modules)', 35.00, 'active', 'System Admin'),
     (3, 'premium_3_modules', 'Premium Plan', 3, 'Gas + Petrol/Diesel + Car Services (3+ Modules)', 50.00, 'active', 'System Admin')`,

  // Subscription pricing change audit history log
  `CREATE TABLE IF NOT EXISTS subscription_pricing_history (
     id INT AUTO_INCREMENT PRIMARY KEY,
     plan_id INT NOT NULL,
     plan_code VARCHAR(50) NOT NULL,
     plan_name VARCHAR(100) NOT NULL,
     old_price DECIMAL(10,2) NOT NULL,
     new_price DECIMAL(10,2) NOT NULL,
     old_status VARCHAR(20) NOT NULL,
     new_status VARCHAR(20) NOT NULL,
     changed_by_user_id INT DEFAULT NULL,
     changed_by_name VARCHAR(100) DEFAULT 'System Admin',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_sph_plan (plan_id),
     CONSTRAINT fk_sph_plan FOREIGN KEY (plan_id) REFERENCES subscription_pricing(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Module upgrade requests table (Vendor requesting addition of a new business module)
  `CREATE TABLE IF NOT EXISTS module_upgrade_requests (
     id INT AUTO_INCREMENT PRIMARY KEY,
     vendor_id INT NOT NULL,
     requested_business_type_id INT NOT NULL,
     requested_module_name VARCHAR(100) NOT NULL,
     old_plan_name VARCHAR(50) NOT NULL,
     new_plan_name VARCHAR(50) NOT NULL,
     old_module_count INT NOT NULL,
     new_module_count INT NOT NULL,
     old_monthly_fee DECIMAL(10,2) NOT NULL,
     new_monthly_fee DECIMAL(10,2) NOT NULL,
     upgrade_amount_due DECIMAL(10,2) NOT NULL,
     payment_method VARCHAR(50) DEFAULT NULL,
     evc_phone VARCHAR(20) DEFAULT NULL,
     reference_number VARCHAR(120) DEFAULT NULL,
     receipt_url VARCHAR(255) DEFAULT NULL,
     notes TEXT DEFAULT NULL,
     status ENUM('pending', 'approved_payment_required', 'payment_pending', 'active', 'rejected') NOT NULL DEFAULT 'pending',
     admin_notes TEXT DEFAULT NULL,
     reviewed_by INT DEFAULT NULL,
     reviewed_at TIMESTAMP NULL DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_mur_vendor (vendor_id, status),
     INDEX idx_mur_status (status),
     CONSTRAINT fk_mur_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function ensureSubscriptionSchema() {
  if (!subscriptionSchemaPromise) {
    subscriptionSchemaPromise = (async () => {
      for (const statement of STATEMENTS) {
        await db.query(statement).catch((err) => {
          if (!err.message.includes('Duplicate column') && !err.message.includes('already exists')) {
            console.error('[SUBSCRIPTION SCHEMA] Error executing statement:', err.message);
          }
        });
      }

      // Drop unique index module_count if it exists
      await db.query(`ALTER TABLE subscription_pricing DROP INDEX module_count`).catch(() => {});
      // Modify module_count column to be nullable
      await db.query(`ALTER TABLE subscription_pricing MODIFY COLUMN module_count INT NULL`).catch(() => {});

      // Add billing_period column if not exists
      await db.query(`ALTER TABLE vendor_subscription_payments ADD COLUMN IF NOT EXISTS billing_period VARCHAR(7) DEFAULT NULL`).catch(() => {});
      // Backfill billing_period values for existing payments
      await db.query(`UPDATE vendor_subscription_payments SET billing_period = DATE_FORMAT(created_at, '%Y-%m') WHERE billing_period IS NULL`).catch(() => {});

      // Modify module_upgrade_requests status column to include new workflow statuses
      await db.query(`ALTER TABLE module_upgrade_requests MODIFY COLUMN status ENUM('pending', 'approved_payment_required', 'payment_pending', 'active', 'rejected') NOT NULL DEFAULT 'pending'`).catch(() => {});

      // Add evc_phone column to module_upgrade_requests
      await db.query(`ALTER TABLE module_upgrade_requests ADD COLUMN IF NOT EXISTS evc_phone VARCHAR(20) DEFAULT NULL`).catch(() => {});
      
      // Delete old package plans
      await db.query(`DELETE FROM subscription_pricing WHERE plan_code IN ('basic_1_module', 'standard_2_modules', 'premium_3_modules')`).catch(() => {});
      
      // Seed new module pricing
      await db.query(`
        INSERT INTO subscription_pricing (id, plan_code, plan_name, module_count, module_description, price, status, updated_by_name)
        VALUES
          (1, 'petrol_diesel', 'Petrol/Diesel', NULL, 'Petrol & Diesel Station Module', 15.00, 'active', 'System Admin'),
          (2, 'gas_cylinder', 'Gas Cylinder', NULL, 'Gas Cylinder Delivery Module', 10.00, 'active', 'System Admin'),
          (3, 'spare_parts', 'Spare Parts', NULL, 'Spare Parts Shop Module', 12.00, 'active', 'System Admin'),
          (4, 'car_services', 'Car Services', NULL, 'Car Services Module', 18.00, 'active', 'System Admin')
        ON DUPLICATE KEY UPDATE
          plan_name = VALUES(plan_name),
          module_description = VALUES(module_description)
      `).catch((err) => {
        console.error('[SUBSCRIPTION SCHEMA] Seeding module pricing error:', err.message);
      });
    })().catch((err) => {
      subscriptionSchemaPromise = null;
      throw err;
    });
  }
  return subscriptionSchemaPromise;
}

module.exports = {
  ensureSubscriptionSchema,
};
