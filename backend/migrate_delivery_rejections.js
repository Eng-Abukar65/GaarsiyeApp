const db = require('./config/db');

async function migrateRejections() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS delivery_rejections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        delivery_id INT NOT NULL,
        order_id INT NOT NULL,
        driver_id INT NOT NULL,
        rejection_reason VARCHAR(500) NOT NULL,
        rejected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_delivery_rejections_order (order_id),
        INDEX idx_delivery_rejections_driver (driver_id),
        CONSTRAINT fk_delivery_rejections_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_delivery_rejections_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('Created delivery_rejections table.');
  } finally {
    await db.end();
  }
}

migrateRejections().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
