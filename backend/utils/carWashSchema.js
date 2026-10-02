const db = require('../config/db');

// ─── Car Wash module schema ───────────────────────────────────────────────────
// A self-contained booking system for Car Wash vendors, fully separate from the
// fuel/gas/spare-parts products+orders tables. Everything is scoped by vendor_id
// so one vendor can never see or touch another vendor's car-wash data.

let carWashSchemaPromise = null;

const STATEMENTS = [
  // Services offered (Exterior Wash, Full Wash, Detailing, VIP Wash, …)
  `CREATE TABLE IF NOT EXISTS car_wash_services (
     id INT AUTO_INCREMENT PRIMARY KEY,
     vendor_id INT NOT NULL,
     name VARCHAR(120) NOT NULL,
     description TEXT DEFAULT NULL,
     base_price DECIMAL(10,2) NOT NULL DEFAULT 0,
     estimated_minutes INT NOT NULL DEFAULT 30,
     image VARCHAR(255) DEFAULT NULL,
     is_available TINYINT(1) NOT NULL DEFAULT 1,
     status ENUM('active','inactive') NOT NULL DEFAULT 'active',
     display_order INT NOT NULL DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_cws_vendor (vendor_id),
     CONSTRAINT fk_cws_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Optional add-ons (Wax Polish, Tire Shine, Vacuum, Ceramic Coating, …)
  `CREATE TABLE IF NOT EXISTS car_wash_addons (
     id INT AUTO_INCREMENT PRIMARY KEY,
     vendor_id INT NOT NULL,
     name VARCHAR(120) NOT NULL,
     price DECIMAL(10,2) NOT NULL DEFAULT 0,
     duration_minutes INT NOT NULL DEFAULT 0,
     is_available TINYINT(1) NOT NULL DEFAULT 1,
     display_order INT NOT NULL DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_cwa_vendor (vendor_id),
     CONSTRAINT fk_cwa_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Vehicle types with a per-type price surcharge (Sedan, SUV, Pickup, Truck, …)
  `CREATE TABLE IF NOT EXISTS car_wash_vehicle_types (
     id INT AUTO_INCREMENT PRIMARY KEY,
     vendor_id INT NOT NULL,
     name VARCHAR(80) NOT NULL,
     extra_price DECIMAL(10,2) NOT NULL DEFAULT 0,
     display_order INT NOT NULL DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_cwvt_vendor (vendor_id),
     CONSTRAINT fk_cwvt_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Workers who perform washes
  `CREATE TABLE IF NOT EXISTS car_wash_workers (
     id INT AUTO_INCREMENT PRIMARY KEY,
     vendor_id INT NOT NULL,
     name VARCHAR(120) NOT NULL,
     phone VARCHAR(40) DEFAULT NULL,
     photo VARCHAR(255) DEFAULT NULL,
     status ENUM('available','busy','offline') NOT NULL DEFAULT 'available',
     rating DECIMAL(3,2) NOT NULL DEFAULT 0,
     is_active TINYINT(1) NOT NULL DEFAULT 1,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_cww_vendor (vendor_id),
     CONSTRAINT fk_cww_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Bookings — the core of the module
  `CREATE TABLE IF NOT EXISTS car_wash_bookings (
     id INT AUTO_INCREMENT PRIMARY KEY,
     vendor_id INT NOT NULL,
     booking_code VARCHAR(30) NOT NULL,
     booking_reference VARCHAR(30) NOT NULL,
     customer_id INT DEFAULT NULL,
     customer_name VARCHAR(150) NOT NULL,
     customer_phone VARCHAR(40) DEFAULT NULL,
     service_id INT DEFAULT NULL,
     service_name VARCHAR(120) DEFAULT NULL,
     vehicle_type_id INT DEFAULT NULL,
     vehicle_type_name VARCHAR(80) DEFAULT NULL,
     vehicle_brand VARCHAR(80) DEFAULT NULL,
     vehicle_model VARCHAR(80) DEFAULT NULL,
     vehicle_color VARCHAR(50) DEFAULT NULL,
     vehicle_plate VARCHAR(40) DEFAULT NULL,
     service_address VARCHAR(255) DEFAULT NULL,
     worker_id INT DEFAULT NULL,
     scheduled_date DATE DEFAULT NULL,
     scheduled_time TIME DEFAULT NULL,
     status ENUM('pending','confirmed','worker_assigned','washing','ready','completed','cancelled','rejected','payment_failed')
       NOT NULL DEFAULT 'pending',
     base_price DECIMAL(10,2) NOT NULL DEFAULT 0,
     vehicle_price DECIMAL(10,2) NOT NULL DEFAULT 0,
     addons_price DECIMAL(10,2) NOT NULL DEFAULT 0,
     discount DECIMAL(10,2) NOT NULL DEFAULT 0,
     total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
     payment_status ENUM('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
     rating DECIMAL(3,2) DEFAULT NULL,
     notes TEXT DEFAULT NULL,
     status_reason VARCHAR(500) DEFAULT NULL,
     submitted_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
     confirmed_at TIMESTAMP NULL DEFAULT NULL,
     worker_assigned_at TIMESTAMP NULL DEFAULT NULL,
     started_at TIMESTAMP NULL DEFAULT NULL,
     ready_at TIMESTAMP NULL DEFAULT NULL,
     completed_at TIMESTAMP NULL DEFAULT NULL,
     cancelled_at TIMESTAMP NULL DEFAULT NULL,
     rejected_at TIMESTAMP NULL DEFAULT NULL,
     payment_failed_at TIMESTAMP NULL DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uq_cwb_code (booking_code),
     UNIQUE KEY uq_cwb_reference (booking_reference),
     INDEX idx_cwb_vendor (vendor_id),
     INDEX idx_cwb_status (vendor_id, status),
     INDEX idx_cwb_date (vendor_id, scheduled_date),
     CONSTRAINT fk_cwb_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
     CONSTRAINT fk_cwb_worker FOREIGN KEY (worker_id) REFERENCES car_wash_workers(id) ON DELETE SET NULL,
     CONSTRAINT fk_cwb_service FOREIGN KEY (service_id) REFERENCES car_wash_services(id) ON DELETE SET NULL
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Optional worker email (used for duplicate-prevention alongside phone).
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS email VARCHAR(150) DEFAULT NULL`,

  // Full vehicle-type management: description, duration adjustment, and an
  // active/inactive status so a type can be disabled or archived without loss.
  `ALTER TABLE car_wash_vehicle_types ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL`,
  `ALTER TABLE car_wash_vehicle_types ADD COLUMN IF NOT EXISTS extra_minutes INT NOT NULL DEFAULT 0`,
  `ALTER TABLE car_wash_vehicle_types ADD COLUMN IF NOT EXISTS status ENUM('active','inactive') NOT NULL DEFAULT 'active'`,

  // Waafi payment tracking on bookings
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40) NOT NULL DEFAULT 'waafi'`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(120) DEFAULT NULL`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL DEFAULT NULL`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS booking_reference VARCHAR(30) NULL AFTER booking_code`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS vehicle_brand VARCHAR(80) DEFAULT NULL AFTER vehicle_type_name`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS vehicle_model VARCHAR(80) DEFAULT NULL AFTER vehicle_brand`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS vehicle_color VARCHAR(50) DEFAULT NULL AFTER vehicle_model`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS service_address VARCHAR(255) DEFAULT NULL AFTER vehicle_plate`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS status_reason VARCHAR(500) DEFAULT NULL AFTER notes`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP NULL DEFAULT NULL AFTER status_reason`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP NULL DEFAULT NULL AFTER submitted_at`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS worker_assigned_at TIMESTAMP NULL DEFAULT NULL AFTER confirmed_at`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP NULL DEFAULT NULL AFTER started_at`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL DEFAULT NULL AFTER completed_at`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL DEFAULT NULL AFTER cancelled_at`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMP NULL DEFAULT NULL AFTER rejected_at`,
  `ALTER TABLE car_wash_bookings MODIFY COLUMN status ENUM('pending','confirmed','worker_assigned','washing','ready','completed','cancelled','rejected','payment_failed') NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS duration INT NOT NULL DEFAULT 0`,

  // A single locked row is used to allocate customer-facing references.
  `CREATE TABLE IF NOT EXISTS car_wash_sequences (
     sequence_name VARCHAR(50) PRIMARY KEY,
     next_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Immutable audit trail used by both customer and vendor status timelines.
  `CREATE TABLE IF NOT EXISTS car_wash_booking_status_history (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     booking_id INT NOT NULL,
     from_status VARCHAR(32) DEFAULT NULL,
     status VARCHAR(32) NOT NULL,
     actor_type ENUM('customer','vendor','system') NOT NULL DEFAULT 'system',
     actor_id INT DEFAULT NULL,
     reason VARCHAR(500) DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_cwbsh_booking_created (booking_id, created_at),
     CONSTRAINT fk_cwbsh_booking FOREIGN KEY (booking_id) REFERENCES car_wash_bookings(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // One review per completed booking.
  `CREATE TABLE IF NOT EXISTS car_wash_reviews (
     id INT AUTO_INCREMENT PRIMARY KEY,
     booking_id INT NOT NULL,
     vendor_id INT NOT NULL,
     customer_id INT NOT NULL,
     rating TINYINT UNSIGNED NOT NULL,
     comment TEXT DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uq_cwr_booking (booking_id),
     INDEX idx_cwr_vendor (vendor_id),
     INDEX idx_cwr_customer (customer_id),
     CONSTRAINT fk_cwr_booking FOREIGN KEY (booking_id) REFERENCES car_wash_bookings(id) ON DELETE CASCADE,
     CONSTRAINT fk_cwr_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
     CONSTRAINT fk_cwr_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Add-ons chosen on a booking (price/name snapshotted so later edits don't rewrite history)
  `CREATE TABLE IF NOT EXISTS car_wash_booking_addons (
     id INT AUTO_INCREMENT PRIMARY KEY,
     booking_id INT NOT NULL,
     addon_id INT DEFAULT NULL,
     name VARCHAR(120) NOT NULL,
     price DECIMAL(10,2) NOT NULL DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_cwba_booking (booking_id),
     CONSTRAINT fk_cwba_booking FOREIGN KEY (booking_id) REFERENCES car_wash_bookings(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Personnel Management merge ────────────────────────────────────────────────
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS personnel_type VARCHAR(50) DEFAULT 'delivery_driver'`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS personnel_type VARCHAR(50) DEFAULT 'car_wash_worker'`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS username VARCHAR(100) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS date_of_birth DATE DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS address VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS worker_status ENUM('active','inactive') DEFAULT 'active'`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS availability_status ENUM('available','busy','offline') DEFAULT 'available'`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS skills TEXT DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL`,
  // Vehicle & emergency contact fields (mirrors delivery drivers form)
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(100) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS plate_number VARCHAR(50) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS license_number VARCHAR(100) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(120) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(120) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(50) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS guarantor_name VARCHAR(120) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS guarantor_phone VARCHAR(50) DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS guarantor_address VARCHAR(255) DEFAULT NULL`,

  // ── Worker login access ───────────────────────────────────────────────────────
  // Car Wash Workers authenticate through the shared login system (bcrypt + JWT)
  // and reach a dedicated /worker app. These columns govern their login account.
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS login_enabled TINYINT(1) NOT NULL DEFAULT 1`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP NULL DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS last_login DATETIME DEFAULT NULL`,
  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS is_online TINYINT(1) NOT NULL DEFAULT 0`,

  `ALTER TABLE car_wash_workers ADD COLUMN IF NOT EXISTS total_ratings INT NOT NULL DEFAULT 0 AFTER rating`,
  `ALTER TABLE car_wash_bookings ADD COLUMN IF NOT EXISTS worker_declined_at TIMESTAMP NULL DEFAULT NULL AFTER worker_accepted_at`,
  `ALTER TABLE car_wash_bookings MODIFY COLUMN status ENUM('pending','confirmed','worker_assigned','worker_accepted','worker_declined','washing','ready','completed','cancelled','rejected','payment_failed') NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE car_wash_booking_status_history MODIFY COLUMN actor_type ENUM('customer','vendor','system','worker') NOT NULL DEFAULT 'system'`,
];

async function hasIndex(tableName, indexName) {
  const [rows] = await db.query(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function migrateExistingBookings() {
  // Backfill booking_reference from id for existing rows that don't have one yet.
  await db.query(
    `UPDATE car_wash_bookings
     SET booking_reference = CONCAT(
       'CW-',
       CASE WHEN id < 1000000 THEN LPAD(id, 6, '0') ELSE CAST(id AS CHAR) END
     )
     WHERE booking_reference IS NULL OR booking_reference = ''`
  );

  // Seed the sequence counter so the next allocated reference is above the
  // highest id already used. LAST_INSERT_ID() is used as a portable atomic read
  // after the UPDATE, so we INSERT a seed row first if one doesn't exist yet.
  await db.query(
    `INSERT IGNORE INTO car_wash_sequences (sequence_name, next_value)
     VALUES ('booking_reference', 0)`
  );
  await db.query(
    `UPDATE car_wash_sequences
     SET next_value = GREATEST(
       next_value,
       (SELECT COALESCE(MAX(id), 0) FROM car_wash_bookings)
     )
     WHERE sequence_name = 'booking_reference'`
  );

  // Delete legacy unpaid draft bookings so they don't pollute vendor dashboard
  await db.query(
    `DELETE FROM car_wash_bookings
     WHERE payment_status = 'unpaid' AND status IN ('pending', 'payment_failed')`
  ).catch(() => {});

  // Backfill status-history for bookings that have a terminal/non-pending status
  // but no history row yet (happens for bookings created before the audit table).
  await db.query(
    `INSERT INTO car_wash_booking_status_history
       (booking_id, from_status, status, actor_type, created_at)
     SELECT b.id, 'pending', b.status, 'system',
            COALESCE(
              CASE b.status
                WHEN 'confirmed' THEN b.confirmed_at
                WHEN 'worker_assigned' THEN b.worker_assigned_at
                WHEN 'washing' THEN b.started_at
                WHEN 'ready' THEN b.ready_at
                WHEN 'completed' THEN b.completed_at
                WHEN 'cancelled' THEN b.cancelled_at
                WHEN 'rejected' THEN b.rejected_at
                WHEN 'payment_failed' THEN b.payment_failed_at
              END,
              b.updated_at
            )
     FROM car_wash_bookings b
     WHERE b.status <> 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM car_wash_booking_status_history h
         WHERE h.booking_id = b.id AND h.status = b.status
       )`
  );
}

async function nextBookingReference(connection = db) {
  await connection.query(
    `UPDATE car_wash_sequences
     SET next_value = LAST_INSERT_ID(next_value + 1)
     WHERE sequence_name = 'booking_reference'`
  );
  const [[row]] = await connection.query('SELECT LAST_INSERT_ID() AS sequence_value');
  const value = Number(row.sequence_value);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Could not allocate a car wash booking reference.');
  }
  return `CW-${String(value).padStart(6, '0')}`;
}

async function migratePersonnelData() {
  // Backfill personnel_type
  await db.query(`UPDATE drivers SET personnel_type = 'delivery_driver' WHERE personnel_type IS NULL`);
  await db.query(`UPDATE car_wash_workers SET personnel_type = 'car_wash_worker' WHERE personnel_type IS NULL`);

  // Migrate first_name, last_name from legacy name column
  await db.query(`
    UPDATE car_wash_workers
    SET first_name = IF(LOCATE(' ', name) > 0, SUBSTRING_INDEX(name, ' ', 1), name),
        last_name = IF(LOCATE(' ', name) > 0, SUBSTRING_INDEX(name, ' ', -1), '')
    WHERE first_name IS NULL OR first_name = ''
  `);

  // Map photo -> profile_image
  await db.query(`UPDATE car_wash_workers SET profile_image = photo WHERE profile_image IS NULL AND photo IS NOT NULL`);

  // Map is_active -> worker_status
  await db.query(`UPDATE car_wash_workers SET worker_status = IF(is_active = 1, 'active', 'inactive') WHERE worker_status IS NULL`);

  // Map status -> availability_status
  await db.query(`UPDATE car_wash_workers SET availability_status = status WHERE availability_status IS NULL`);
}

async function ensureCarWashSchema() {
  if (!carWashSchemaPromise) {
    carWashSchemaPromise = (async () => {
      for (const statement of STATEMENTS) {
        await db.query(statement);
      }
      await migrateExistingBookings();
      await migratePersonnelData();
    })().catch((err) => {
      // reset so a later call can retry after a transient failure
      carWashSchemaPromise = null;
      throw err;
    });
  }
  return carWashSchemaPromise;
}

module.exports = { ensureCarWashSchema, nextBookingReference };
