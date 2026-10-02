const db = require('../config/db');

// ─── Async checkout sessions ──────────────────────────────────────────────────
// A mobile-money purchase cannot be answered inside one HTTP request: the
// provider pushes an approval prompt to the customer's phone and only replies
// once they tap Approve. The old flow blocked the request for up to 30s while
// the app gave up at 15s, so an approved payment arrived after the app had
// already stopped listening ("Payment still processing").
//
// Checkout is now a short-lived job: POST returns a reference immediately and
// the client polls for the real stage until a terminal status is reached.

let checkoutSchemaPromise = null;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS checkout_sessions (
     id INT AUTO_INCREMENT PRIMARY KEY,
     reference VARCHAR(120) NOT NULL,
     customer_id INT NOT NULL,
     vendor_id INT DEFAULT NULL,
     kind ENUM('order','car_wash') NOT NULL DEFAULT 'order',
     stage VARCHAR(32) NOT NULL DEFAULT 'sending',
     status ENUM('processing','completed','failed','cancelled') NOT NULL DEFAULT 'processing',
     order_id INT DEFAULT NULL,
     booking_id INT DEFAULT NULL,
     amount DECIMAL(10,2) DEFAULT NULL,
     payment_method VARCHAR(40) DEFAULT NULL,
     transaction_id VARCHAR(150) DEFAULT NULL,
     fail_code VARCHAR(60) DEFAULT NULL,
     fail_reason VARCHAR(500) DEFAULT NULL,
     result_json LONGTEXT DEFAULT NULL,
     started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
     finished_at TIMESTAMP NULL DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uq_checkout_reference (reference),
     INDEX idx_checkout_customer (customer_id, status),
     CONSTRAINT fk_checkout_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function ensureCheckoutSchema() {
  if (!checkoutSchemaPromise) {
    checkoutSchemaPromise = (async () => {
      for (const statement of STATEMENTS) await db.query(statement);
    })().catch((err) => {
      checkoutSchemaPromise = null;
      throw err;
    });
  }
  return checkoutSchemaPromise;
}

module.exports = { ensureCheckoutSchema };
