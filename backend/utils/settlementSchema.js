const db = require('../config/db');

// ─── Vendor ↔ Admin settlement schema ─────────────────────────────────────────
// The `commissions` table is the per-order ledger: for every completed order it
// records total_amount, commission_amount (owed to the platform) and
// vendor_net_amount (the vendor keeps this), with status pending|paid.
//
// Settlements group pending commission rows into an auditable payment:
//   order completed -> commission row (pending) -> vendor balance grows
//   -> vendor submits a settlement request -> admin confirms
//   -> the covered commission rows flip to paid.
//
// Nothing is ever deleted; a rejected or cancelled settlement keeps its history.

let settlementSchemaPromise = null;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS vendor_settlements (
     id INT AUTO_INCREMENT PRIMARY KEY,
     settlement_reference VARCHAR(30) NOT NULL,
     vendor_id INT NOT NULL,
     amount DECIMAL(12,2) NOT NULL,
     payment_method ENUM('cash','bank_transfer','waafi','other') NOT NULL DEFAULT 'cash',
     external_reference VARCHAR(120) DEFAULT NULL,
     notes TEXT DEFAULT NULL,
     status ENUM('requested','confirmed','rejected','cancelled') NOT NULL DEFAULT 'requested',
     settlement_date DATE DEFAULT NULL,
     vendor_submitted_at TIMESTAMP NULL DEFAULT NULL,
     admin_confirmed_at TIMESTAMP NULL DEFAULT NULL,
     confirmed_by_user_id INT DEFAULT NULL,
     confirmed_by_name VARCHAR(150) DEFAULT NULL,
     admin_notes TEXT DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uq_settlement_reference (settlement_reference),
     INDEX idx_settlement_vendor (vendor_id, status),
     CONSTRAINT fk_settlement_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Which commission rows a settlement covers.
  //
  // NOTE: commission_id is deliberately NOT unique. A rejected or cancelled
  // settlement keeps its item rows for audit, and its commissions return to
  // 'pending' so they can be settled again — a unique key would permanently
  // lock those earnings and make the returned balance unsettleable.
  // Double-settlement is prevented properly in the model instead: candidate
  // rows are selected `WHERE status='pending' ... FOR UPDATE` and flipped to
  // 'processing' inside the same transaction.
  `CREATE TABLE IF NOT EXISTS vendor_settlement_items (
     id INT AUTO_INCREMENT PRIMARY KEY,
     settlement_id INT NOT NULL,
     commission_id INT NOT NULL,
     order_id INT DEFAULT NULL,
     commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
     vendor_net_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_si_commission (commission_id),
     INDEX idx_settlement_items (settlement_id),
     CONSTRAINT fk_si_settlement FOREIGN KEY (settlement_id) REFERENCES vendor_settlements(id) ON DELETE CASCADE,
     CONSTRAINT fk_si_commission FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Immutable audit trail of every state change.
  `CREATE TABLE IF NOT EXISTS vendor_settlement_history (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     settlement_id INT NOT NULL,
     from_status VARCHAR(20) DEFAULT NULL,
     status VARCHAR(20) NOT NULL,
     actor_type ENUM('vendor','admin','system') NOT NULL DEFAULT 'system',
     actor_id INT DEFAULT NULL,
     actor_name VARCHAR(150) DEFAULT NULL,
     note VARCHAR(500) DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_sh_settlement (settlement_id, created_at),
     CONSTRAINT fk_sh_settlement FOREIGN KEY (settlement_id) REFERENCES vendor_settlements(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Sequence for human-readable settlement references.
  `CREATE TABLE IF NOT EXISTS settlement_sequences (
     sequence_name VARCHAR(50) PRIMARY KEY,
     next_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // The legacy enum only had pending|paid; settlements need an in-flight state
  // so a commission cannot be double-committed while awaiting confirmation.
  `ALTER TABLE commissions MODIFY COLUMN status ENUM('pending','processing','paid') DEFAULT 'pending'`,
];

async function nextSettlementReference(connection = db) {
  await connection.query(
    `INSERT IGNORE INTO settlement_sequences (sequence_name, next_value) VALUES ('settlement', 0)`
  );
  await connection.query(
    `UPDATE settlement_sequences SET next_value = LAST_INSERT_ID(next_value + 1)
     WHERE sequence_name = 'settlement'`
  );
  const [[row]] = await connection.query('SELECT LAST_INSERT_ID() AS v');
  const value = Number(row.v);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Could not allocate a settlement reference.');
  }
  return `STL-${String(value).padStart(6, '0')}`;
}

// Drops the original UNIQUE(commission_id) if an earlier build created it. That
// key made a rejected settlement's commissions permanently unsettleable.
async function dropLegacyUniqueItemKey() {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'vendor_settlement_items'
       AND INDEX_NAME = 'uq_settlement_commission'
     LIMIT 1`
  );
  if (rows.length > 0) {
    // The FK on commission_id is satisfied by this index, so the replacement
    // must exist BEFORE the unique one is dropped or MySQL refuses (ER_DROP_INDEX_FK).
    const [replacement] = await db.query(
      `SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor_settlement_items'
         AND INDEX_NAME = 'idx_si_commission' LIMIT 1`
    );
    if (replacement.length === 0) {
      await db.query('ALTER TABLE vendor_settlement_items ADD INDEX idx_si_commission (commission_id)');
    }
    await db.query('ALTER TABLE vendor_settlement_items DROP INDEX uq_settlement_commission');
    console.log('[SETTLEMENT] Dropped legacy UNIQUE(commission_id); rejected settlements can now be re-settled.');
  }
}

async function ensureSettlementSchema() {
  if (!settlementSchemaPromise) {
    settlementSchemaPromise = (async () => {
      for (const statement of STATEMENTS) {
        await db.query(statement);
      }
      await dropLegacyUniqueItemKey();
    })().catch((err) => {
      settlementSchemaPromise = null;
      throw err;
    });
  }
  return settlementSchemaPromise;
}

module.exports = { ensureSettlementSchema, nextSettlementReference };
