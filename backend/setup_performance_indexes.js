const db = require('./config/db');

async function applyPerformanceOptimizations() {
  try {
    console.log("Applying Database Performance Optimizations...");

    // 1. Add columns to orders if they don't exist
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_otp VARCHAR(6) DEFAULT NULL`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_commission DECIMAL(10,2) NOT NULL DEFAULT 0.00`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00`);
    console.log("Verified orders schema columns.");

    // 2. Add performance indexes
    console.log("Adding performance indexes...");

    // Check if index already exists to prevent duplicate index issues
    const checkIndex = async (tableName, indexName) => {
      const [rows] = await db.query(`SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`, [indexName]);
      return rows.length > 0;
    };

    if (!(await checkIndex('orders', 'idx_vendor_status'))) {
      await db.query(`ALTER TABLE orders ADD INDEX idx_vendor_status (vendor_id, status)`);
      console.log("Added index idx_vendor_status to orders.");
    }

    if (!(await checkIndex('orders', 'idx_customer_id'))) {
      await db.query(`ALTER TABLE orders ADD INDEX idx_customer_id (customer_id)`);
      console.log("Added index idx_customer_id to orders.");
    }

    if (!(await checkIndex('deliveries', 'idx_driver_status'))) {
      await db.query(`ALTER TABLE deliveries ADD INDEX idx_driver_status (driver_id, status)`);
      console.log("Added index idx_driver_status to deliveries.");
    }

    if (!(await checkIndex('driver_tracking', 'idx_delivery_id'))) {
      await db.query(`ALTER TABLE driver_tracking ADD INDEX idx_delivery_id (delivery_id)`);
      console.log("Added index idx_delivery_id to driver_tracking.");
    }

    // Create a delivery_audit_logs table for audit compliance
    await db.query(`
      CREATE TABLE IF NOT EXISTS delivery_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        delivery_id INT NOT NULL,
        status VARCHAR(50) NOT NULL,
        changed_by VARCHAR(50) DEFAULT 'system',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log("Ensured delivery_audit_logs table exists.");

    console.log("✅ All Database optimizations completed successfully!");
  } catch (error) {
    console.error("❌ Optimization failed:", error);
  } finally {
    process.exit(0);
  }
}

applyPerformanceOptimizations();
