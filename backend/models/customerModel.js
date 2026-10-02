const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { computeCommission } = require('../config/commission');

function attachVendorStatus(vendor) {
  const now = new Date();
  const currentTime = now.toTimeString().split(' ')[0];
  
  const openingTime = vendor.opening_time || '06:00:00';
  const closingTime = vendor.closing_time || '23:00:00';
  const isOnline = Boolean(vendor.is_online);
  const isManualOpen = vendor.is_open !== 0 && vendor.is_open !== false;
  const isActive = vendor.status === 'active';

  let withinHours = false;
  if (openingTime <= closingTime) {
    withinHours = currentTime >= openingTime && currentTime <= closingTime;
  } else {
    withinHours = currentTime >= openingTime || currentTime <= closingTime;
  }

  const isOpenCalc = isOnline && isManualOpen && isActive && withinHours;
  const statusLabel = isOpenCalc ? 'OPEN' : 'CLOSED';

  console.log(`[DEBUG VENDOR STATUS] Vendor: ${vendor.business_name || vendor.name || 'Unknown'}, Current Time: ${currentTime}, Opening: ${openingTime}, Closing: ${closingTime}, is_online: ${isOnline}, manual_is_open: ${isManualOpen}, is_active: ${isActive}, Calculated is_open: ${isOpenCalc}, status_label: ${statusLabel}`);

  return { ...vendor, is_online: isOnline, is_open: isOpenCalc, status_label: statusLabel };
}

class CustomerModel {
  // ─── Schema Migration ─────────────────────────────────────────────────────
  static async ensureProfileSchema() {
    if (this._profileSchemaReady) return;
    // Add photo_url to customers if missing
    await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) DEFAULT NULL').catch(() => {});
    // Add city + area to addresses if missing
    await db.query('ALTER TABLE addresses ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT NULL').catch(() => {});
    await db.query('ALTER TABLE addresses ADD COLUMN IF NOT EXISTS area VARCHAR(100) DEFAULT NULL').catch(() => {});
    // Add gender to users if missing
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS gender ENUM('male', 'female') DEFAULT NULL").catch(() => {});

    // Create customer_locations table
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        latitude DECIMAL(10, 8) NULL,
        longitude DECIMAL(11, 8) NULL,
        city VARCHAR(100) NULL,
        area VARCHAR(100) NULL,
        address TEXT NULL,
        is_default TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_customer_locations_customer (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((err) => {
      console.error('Error creating customer_locations table:', err);
    });

    this._profileSchemaReady = true;
  }

  static async ensureOrderSchema() {
    if (this._orderSchemaReady) return;

    const columns = await this.getTableColumns('orders').catch(() => new Set());
    if (!columns.has('delivery_address')) {
      await db.query('ALTER TABLE orders ADD COLUMN delivery_address TEXT NULL').catch((error) => {
        if (!String(error?.message || '').toLowerCase().includes('duplicate column')) {
          throw error;
        }
      });
    }

    const [addressColumnRows] = await db.query(`
      SELECT IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'orders'
        AND COLUMN_NAME = 'address_id'
      LIMIT 1
    `).catch(() => [[]]);
    const addressColumn = addressColumnRows?.[0];
    if (addressColumn && String(addressColumn.IS_NULLABLE).toUpperCase() === 'NO') {
      await db.query('ALTER TABLE orders MODIFY COLUMN address_id INT NULL').catch((error) => {
        if (!String(error?.message || '').toLowerCase().includes('duplicate')) {
          throw error;
        }
      });
    }

    const [fkRows] = await db.query(`
      SELECT rc.CONSTRAINT_NAME, rc.DELETE_RULE
      FROM information_schema.REFERENTIAL_CONSTRAINTS rc
      JOIN information_schema.KEY_COLUMN_USAGE kcu
        ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
       AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       AND rc.TABLE_NAME = kcu.TABLE_NAME
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
        AND rc.TABLE_NAME = 'orders'
        AND kcu.COLUMN_NAME = 'address_id'
        AND kcu.REFERENCED_TABLE_NAME = 'addresses'
      LIMIT 1
    `).catch(() => [[]]);
    const foreignKey = fkRows?.[0];
    const fkDeleteRule = String(foreignKey?.DELETE_RULE || '').toUpperCase();
    if (!foreignKey || fkDeleteRule !== 'SET NULL') {
      if (foreignKey?.CONSTRAINT_NAME) {
        await db.query(
          `ALTER TABLE orders DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``,
        ).catch((error) => {
          if (!String(error?.message || '').toLowerCase().includes('foreign key')) {
            throw error;
          }
        });
      }

      await db.query(`
        ALTER TABLE orders
        ADD CONSTRAINT fk_orders_address_id
        FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL
      `).catch((error) => {
        const message = String(error?.message || '').toLowerCase();
        if (
          !message.includes('duplicate key') &&
          !message.includes('duplicate foreign key') &&
          !message.includes('already exists')
        ) {
          throw error;
        }
      });
    }

    this._orderSchemaReady = true;
  }

  static async findByEmailOrPhone(identifier) {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE (email = ? OR phone = ?) AND role_id = (SELECT id FROM roles WHERE name = "customer")', 
      [identifier, identifier]
    );
    return rows[0];
  }

  static async register(userData) {
    await this.ensureProfileSchema();
    const { name, email, password, phone, gender, latitude, longitude, city, area, address } = userData;
    // Get customer role ID
    const [roleRows] = await db.query('SELECT id FROM roles WHERE name = "customer"');
    const roleId = roleRows[0].id;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const [result] = await db.query(
      'INSERT INTO users (username, email, password_hash, role_id, phone, status, gender) VALUES (?, ?, ?, ?, ?, "active", ?)',
      [name, email, passwordHash, roleId, phone, gender]
    );
    const userId = result.insertId;
    
    // Split full name into first and last name
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create entry in customers table
    const [customerResult] = await db.query(
      'INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)',
      [userId, firstName, lastName]
    );
    const customerId = customerResult.insertId;

    // Save location to customer_locations table
    await db.query(
      'INSERT INTO customer_locations (customer_id, latitude, longitude, city, area, address, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [customerId, latitude || null, longitude || null, city || null, area || null, address || null]
    );

    // Automatically save location as default delivery address in addresses table
    await db.query(
      'INSERT INTO addresses (customer_id, label, address_line, city, area, latitude, longitude, is_default) VALUES (?, "Default", ?, ?, ?, ?, ?, 1)',
      [customerId, address || '', city || '', area || '', latitude || null, longitude || null]
    );

    return userId;
  }
  static async getCustomerIdByUserId(userId) {
    const [rows] = await db.query('SELECT id FROM customers WHERE user_id = ?', [userId]);
    return rows[0];
  }

  static async getProfile(userId) {
    await this.ensureProfileSchema();
    const [rows] = await db.query(
      'SELECT c.id, c.first_name, c.last_name, c.photo_url, u.id AS user_id, u.username, u.email, u.phone, u.gender FROM customers c JOIN users u ON c.user_id = u.id WHERE u.id = ?',
      [userId]
    );
    if (rows[0]) {
      if (!rows[0].first_name && rows[0].username) {
        const parts = rows[0].username.trim().split(/\s+/);
        rows[0].first_name = parts[0] || '';
        if (!rows[0].last_name) {
          rows[0].last_name = parts.slice(1).join(' ') || '';
        }
      }
    }
    return rows[0];
  }

  static async getProfileStats(userId) {
    const [customerRows] = await db.query(
      `SELECT c.id, u.status
       FROM customers c
       JOIN users u ON c.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );

    if (customerRows.length === 0) {
      return null;
    }

    const customer = customerRows[0];
    const fuelItemFilter = `
      LOWER(COALESCE(p.unit, '')) IN ('l', 'liter', 'liters', 'litre', 'litres')
      AND (
        LOWER(COALESCE(ca.name, '')) LIKE '%petrol%'
        OR LOWER(COALESCE(ca.name, '')) LIKE '%diesel%'
        OR LOWER(COALESCE(ca.name, '')) LIKE '%fuel%'
        OR LOWER(COALESCE(p.name, '')) LIKE '%petrol%'
        OR LOWER(COALESCE(p.name, '')) LIKE '%diesel%'
        OR LOWER(COALESCE(p.name, '')) LIKE '%fuel%'
      )
    `;

    const [statRows] = await db.query(
      `
        SELECT
          COUNT(DISTINCT CASE
            WHEN LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'failed')
            THEN o.id
          END) AS totalRefills,
          COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'rejected', 'failed')
              AND ${fuelItemFilter}
            THEN oi.quantity
            ELSE 0
          END), 0) AS fuelDelivered
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN categories ca ON p.category_id = ca.id
        WHERE o.customer_id = ?
      `,
      [customer.id]
    );

    const stats = statRows[0] || {};
    const status = (customer.status || '').toString().toLowerCase();

    return {
      totalRefills: Number(stats.totalRefills || 0),
      fuelDelivered: Number(stats.fuelDelivered || 0),
      memberStatus: status === 'active' ? 'Active' : 'Inactive'
    };
  }

  static async updateProfile(userId, profileData) {
    await this.ensureProfileSchema();
    const { first_name, last_name, phone, photo_url, gender } = profileData;
    if (phone !== undefined) {
      await db.query('UPDATE users SET phone = ? WHERE id = ?', [phone, userId]);
    }
    if (gender !== undefined) {
      await db.query('UPDATE users SET gender = ? WHERE id = ?', [gender, userId]);
    }
    const customerUpdates = [];
    const customerValues = [];
    if (first_name !== undefined) { customerUpdates.push('first_name = ?'); customerValues.push(first_name); }
    if (last_name !== undefined) { customerUpdates.push('last_name = ?'); customerValues.push(last_name); }
    if (photo_url !== undefined) { customerUpdates.push('photo_url = ?'); customerValues.push(photo_url); }
    if (customerUpdates.length > 0) {
      customerValues.push(userId);
      await db.query(`UPDATE customers SET ${customerUpdates.join(', ')} WHERE user_id = ?`, customerValues);
    }

    // Sync users.username with first_name & last_name
    if (first_name !== undefined || last_name !== undefined) {
      const [rows] = await db.query('SELECT first_name, last_name FROM customers WHERE user_id = ?', [userId]);
      if (rows.length > 0) {
        const fName = rows[0].first_name || '';
        const lName = rows[0].last_name || '';
        const newUsername = `${fName} ${lName}`.trim();
        if (newUsername) {
          await db.query('UPDATE users SET username = ? WHERE id = ?', [newUsername, userId]);
        }
      }
    }
    return true;
  }

  static async getAddresses(userId) {
    await this.ensureProfileSchema();
    const customer = await this.getCustomerIdByUserId(userId);
    const [rows] = await db.query(
      'SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC',
      [customer.id]
    );
    return rows;
  }

  static async createAddress(userId, addressData) {
    await this.ensureProfileSchema();
    const { label, address_line, city, area, phone, latitude, longitude, is_default } = addressData;
    const customer = await this.getCustomerIdByUserId(userId);
    // If new address is default, unset others first
    if (is_default) {
      await db.query('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', [customer.id]);
    }
    const [result] = await db.query(
      'INSERT INTO addresses (customer_id, label, address_line, city, area, phone, latitude, longitude, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [customer.id, label, address_line || '', city || '', area || '', phone || '', latitude || null, longitude || null, is_default ? 1 : 0]
    );
    return result.insertId;
  }

  static async updateAddress(addressId, userId, addressData) {
    const { label, address_line, city, area, phone, latitude, longitude, is_default } = addressData;
    const customer = await this.getCustomerIdByUserId(userId);
    if (is_default) {
      await db.query('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', [customer.id]);
    }
    await db.query(
      'UPDATE addresses SET label = ?, address_line = ?, city = ?, area = ?, phone = ?, latitude = ?, longitude = ?, is_default = ? WHERE id = ? AND customer_id = ?',
      [label, address_line || '', city || '', area || '', phone || '', latitude || null, longitude || null, is_default ? 1 : 0, addressId, customer.id]
    );
    return true;
  }

  static async setDefaultAddress(addressId, userId) {
    const customer = await this.getCustomerIdByUserId(userId);
    await db.query('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', [customer.id]);
    await db.query('UPDATE addresses SET is_default = 1 WHERE id = ? AND customer_id = ?', [addressId, customer.id]);
    return true;
  }

  static async deleteAddress(addressId, userId) {
    await this.ensureOrderSchema();
    const customer = await this.getCustomerIdByUserId(userId);
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT id, is_default, address_line, area, city FROM addresses WHERE id = ? AND customer_id = ? LIMIT 1',
        [addressId, customer.id]
      );
      if (rows.length === 0) {
        await connection.rollback();
        return false;
      }

      const address = rows[0];
      const archivedAddress = [address.address_line, address.area, address.city]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(', ');

      await connection.query(
        `UPDATE orders
         SET delivery_address = COALESCE(NULLIF(TRIM(delivery_address), ''), ?),
             address_id = NULL
         WHERE address_id = ? AND customer_id = ?`,
        [archivedAddress || address.address_line || '', addressId, customer.id]
      );
      await connection.query(
        'UPDATE order_destinations SET address_id = NULL WHERE address_id = ?',
        [addressId]
      );

      const [result] = await connection.query(
        'DELETE FROM addresses WHERE id = ? AND customer_id = ?',
        [addressId, customer.id]
      );

      if (address.is_default) {
        const [replacementRows] = await connection.query(
          'SELECT id FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC LIMIT 1',
          [customer.id]
        );
        if (replacementRows.length > 0) {
          await connection.query(
            'UPDATE addresses SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE customer_id = ?',
            [replacementRows[0].id, customer.id]
          );
        }
      }

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ─── Customer Location (user_locations / customer_locations) ──────────────
  static async saveLocation(userId, locationData) {
    await this.ensureProfileSchema();
    const customer = await this.getCustomerIdByUserId(userId);
    if (!customer) throw new Error('Customer profile not found');

    const { latitude, longitude, city, area, address } = locationData;

    // Upsert: delete existing default then insert new
    await db.query('DELETE FROM customer_locations WHERE customer_id = ?', [customer.id]);
    await db.query(
      'INSERT INTO customer_locations (customer_id, latitude, longitude, city, area, address, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [customer.id, latitude || null, longitude || null, city || null, area || null, address || null]
    );

    // Also keep the addresses table in sync (update or insert default)
    const [existing] = await db.query(
      'SELECT id FROM addresses WHERE customer_id = ? AND is_default = 1 LIMIT 1',
      [customer.id]
    );
    if (existing.length > 0) {
      await db.query(
        'UPDATE addresses SET city = ?, area = ?, address_line = ?, latitude = ?, longitude = ? WHERE id = ? AND customer_id = ?',
        [city || '', area || '', address || '', latitude || null, longitude || null, existing[0].id, customer.id]
      );
    } else {
      await db.query(
        'INSERT INTO addresses (customer_id, label, address_line, city, area, latitude, longitude, is_default) VALUES (?, "Default", ?, ?, ?, ?, ?, 1)',
        [customer.id, address || '', city || '', area || '', latitude || null, longitude || null]
      );
    }
    return true;
  }

  static async getLocation(userId) {
    await this.ensureProfileSchema();
    const customer = await this.getCustomerIdByUserId(userId);
    if (!customer) return null;

    const [rows] = await db.query(
      'SELECT * FROM customer_locations WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC LIMIT 1',
      [customer.id]
    );
    return rows[0] || null;
  }

  static async getVendors() {
    const [rows] = await db.query('SELECT * FROM vendors');
    return rows.map(attachVendorStatus);
  }

  static async getCategories() {
    // Only active categories are shown to customers — a retired category must
    // not keep rendering an empty card on the home screen.
    const [rows] = await db.query('SELECT * FROM categories WHERE is_active = 1 ORDER BY id ASC');
    return rows;
  }

  static async tableExists(tableName) {
    const [rows] = await db.query('SHOW TABLES LIKE ?', [tableName]);
    return rows.length > 0;
  }

  static async getTableColumns(tableName) {
    const [rows] = await db.query(`SHOW COLUMNS FROM \`${tableName}\``);
    return new Set(rows.map((row) => row.Field));
  }

  static async ensureReviewSchema() {
    if (this._reviewSchemaReady) return;

    await db.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        customer_id INT NOT NULL,
        driver_id INT NULL,
        vendor_id INT NULL,
        rating INT NOT NULL,
        comment TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_reviews_vendor (vendor_id),
        INDEX idx_reviews_customer (customer_id),
        INDEX idx_reviews_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP').catch(() => {});
    await db.query('ALTER TABLE reviews ADD UNIQUE KEY uniq_reviews_order_customer (order_id, customer_id)').catch(() => {});
    this._reviewSchemaReady = true;
  }

  static async ensureOfferSupportSchema() {
    if (this._offerSupportReady) return;

    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_vendor_favorites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        vendor_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_customer_vendor_favorite (customer_id, vendor_id),
        INDEX idx_customer_vendor_favorites_customer (customer_id),
        INDEX idx_customer_vendor_favorites_vendor (vendor_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS offer_analytics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        offer_id INT NOT NULL,
        offer_source VARCHAR(50) NOT NULL DEFAULT 'offers',
        vendor_id INT NOT NULL,
        customer_id INT NULL,
        order_id INT NULL,
        event_type VARCHAR(30) NOT NULL,
        revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_offer_analytics_offer (offer_source, offer_id),
        INDEX idx_offer_analytics_vendor (vendor_id),
        INDEX idx_offer_analytics_customer (customer_id),
        INDEX idx_offer_analytics_event_created (event_type, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await db.query('ALTER TABLE offer_analytics ADD COLUMN IF NOT EXISTS offer_source VARCHAR(50) NOT NULL DEFAULT "offers" AFTER offer_id').catch(() => {});
    await db.query('ALTER TABLE offer_analytics ADD COLUMN IF NOT EXISTS revenue DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER event_type').catch(() => {});

    // Create the offer_products join table
    await db.query(`
      CREATE TABLE IF NOT EXISTS offer_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        offer_id INT NOT NULL,
        product_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_offer_product (offer_id, product_id),
        FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `).catch((err) => {
      console.error('Error creating offer_products table:', err);
    });

    // Assert columns exist in order_items
    await db.query('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2) NULL').catch(() => {});
    await db.query('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) NULL').catch(() => {});
    await db.query('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(10, 4) NULL').catch(() => {});
    await db.query('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS final_price DECIMAL(10, 2) NULL').catch(() => {});

    this._offerSupportReady = true;
  }

  static async expireOffers() {
    if (await this.tableExists('offers')) {
      await db.query(`
        UPDATE offers
        SET is_active = 0
        WHERE is_active = 1
          AND end_date IS NOT NULL
          AND end_date < NOW()
      `);
    }
  }

  static haversineDistanceKm(lat1, lng1, lat2, lng2) {
    const aLat = Number(lat1);
    const aLng = Number(lng1);
    const bLat = Number(lat2);
    const bLng = Number(lng2);

    if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return null;

    const toRadians = (value) => value * Math.PI / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(bLat - aLat);
    const dLng = toRadians(bLng - aLng);
    const startLat = toRadians(aLat);
    const endLat = toRadians(bLat);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  static async getVendorIdsMatchingCustomerZones(customerId) {
    if (!await this.tableExists('vendor_delivery_zones')) return new Set();

    const [rows] = await db.query(
      `SELECT DISTINCT z.vendor_id
       FROM vendor_delivery_zones z
       JOIN addresses a ON a.customer_id = ?
       WHERE z.is_active = 1
         AND z.zone_name IS NOT NULL
         AND z.zone_name <> ''
         AND (
           LOWER(COALESCE(a.label, '')) LIKE CONCAT('%', LOWER(z.zone_name), '%')
           OR LOWER(COALESCE(a.address_line, '')) LIKE CONCAT('%', LOWER(z.zone_name), '%')
         )`,
      [customerId]
    );

    return new Set(rows.map((row) => Number(row.vendor_id)));
  }

  static async getRecentActiveCustomerClause() {
    return `
      COALESCE(u.status, 'active') = 'active'
      AND (
        u.last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        OR u.last_seen >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        OR u.updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        OR u.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      )
    `;
  }

  static async getOfferNotificationTargets(vendorId) {
    await this.ensureOfferSupportSchema();

    const id = Number(vendorId);
    if (!Number.isInteger(id) || id <= 0) return [];

    const activeClause = await this.getRecentActiveCustomerClause();
    const targetMap = new Map();
    const addTarget = (row, reason) => {
      const customerId = Number(row.customer_id);
      if (!Number.isInteger(customerId)) return;
      const existing = targetMap.get(customerId) || {
        customer_id: customerId,
        user_id: row.user_id,
        reasons: new Set(),
      };
      existing.user_id = existing.user_id || row.user_id;
      existing.reasons.add(reason);
      targetMap.set(customerId, existing);
    };

    const [orderRows] = await db.query(
      `SELECT DISTINCT c.id AS customer_id, u.id AS user_id
       FROM customers c
       JOIN users u ON c.user_id = u.id
       JOIN orders o ON o.customer_id = c.id
       WHERE o.vendor_id = ?
         AND ${activeClause}`,
      [id]
    );
    orderRows.forEach((row) => addTarget(row, 'previous_order'));

    const [favoriteRows] = await db.query(
      `SELECT DISTINCT c.id AS customer_id, u.id AS user_id
       FROM customers c
       JOIN users u ON c.user_id = u.id
       JOIN customer_vendor_favorites f ON f.customer_id = c.id
       WHERE f.vendor_id = ?
         AND ${activeClause}`,
      [id]
    );
    favoriteRows.forEach((row) => addTarget(row, 'favorite'));

    if (await this.tableExists('vendor_delivery_zones')) {
      const [zoneRows] = await db.query(
        `SELECT DISTINCT c.id AS customer_id, u.id AS user_id
         FROM customers c
         JOIN users u ON c.user_id = u.id
         JOIN addresses a ON a.customer_id = c.id
         JOIN vendor_delivery_zones z ON z.vendor_id = ? AND z.is_active = 1
         WHERE ${activeClause}
           AND z.zone_name IS NOT NULL
           AND z.zone_name <> ''
           AND (
             LOWER(COALESCE(a.label, '')) LIKE CONCAT('%', LOWER(z.zone_name), '%')
             OR LOWER(COALESCE(a.address_line, '')) LIKE CONCAT('%', LOWER(z.zone_name), '%')
           )`,
        [id]
      );
      zoneRows.forEach((row) => addTarget(row, 'delivery_zone'));
    }

    const [nearbyRows] = await db.query(
      `SELECT DISTINCT c.id AS customer_id, u.id AS user_id
       FROM customers c
       JOIN users u ON c.user_id = u.id
       JOIN addresses a ON a.customer_id = c.id
       JOIN vendors v ON v.id = ?
       WHERE ${activeClause}
         AND a.latitude IS NOT NULL
         AND a.longitude IS NOT NULL
         AND v.latitude IS NOT NULL
         AND v.longitude IS NOT NULL
         AND (
           6371 * 2 * ASIN(SQRT(
             POWER(SIN(RADIANS(a.latitude - v.latitude) / 2), 2) +
             COS(RADIANS(v.latitude)) * COS(RADIANS(a.latitude)) *
             POWER(SIN(RADIANS(a.longitude - v.longitude) / 2), 2)
           ))
         ) <= 20`,
      [id]
    );
    nearbyRows.forEach((row) => addTarget(row, 'nearby'));

    return Array.from(targetMap.values()).map((target) => ({
      customer_id: target.customer_id,
      user_id: target.user_id,
      reasons: Array.from(target.reasons),
    }));
  }

  static async enrichProductsWithOffers(products, vendorId = null) {
    if (!products || products.length === 0) return products;

    const hasOffers = await this.tableExists('offers');
    if (!hasOffers) {
      return products.map(p => ({
        ...p,
        has_offer: 0,
        offer_title: null,
        offer_description: null,
        discount_percentage: 0,
        original_price: Number(p.selling_price || p.price || 0),
        discounted_price: Number(p.selling_price || p.price || 0),
        offer_badge: null,
        savings_amount: 0,
        offer_expiry: null
      }));
    }

    // Fetch all active offers for the vendor or all vendors if vendorId is null
    const query = `
      SELECT o.*, op.product_id AS linked_product_id
      FROM offers o
      LEFT JOIN offer_products op ON o.id = op.offer_id
      WHERE o.is_active = 1
        AND (o.start_date IS NULL OR o.start_date <= NOW())
        AND (o.end_date IS NULL OR o.end_date >= NOW())
        ${vendorId !== null ? 'AND o.vendor_id = ?' : ''}
    `;
    const [offers] = await db.query(query, vendorId !== null ? [vendorId] : []);

    return products.map((p) => {
      const prodId = p.product_id || p.id;
      const vId = p.vendor_id || vendorId;
      const origPrice = Number(p.selling_price !== undefined ? p.selling_price : (p.price || 0));

      // Match only product-specific offers. A missing product_id must not become
      // a store-wide discount.
      const matchingOffers = offers.filter((o) => {
        const offerProductId = o.product_id ?? o.linked_product_id;
        return Number(o.vendor_id) === Number(vId) &&
          offerProductId != null &&
          Number(offerProductId) === Number(prodId);
      });

      // Prioritize product-specific/linked offers first, then sort by highest discount
      matchingOffers.sort((a, b) => {
        const aSpecific = Number(a.product_id ?? a.linked_product_id) === Number(prodId);
        const bSpecific = Number(b.product_id ?? b.linked_product_id) === Number(prodId);
        if (aSpecific !== bSpecific) return aSpecific ? -1 : 1;
        return Number(b.discount_value) - Number(a.discount_value);
      });

      const offer = matchingOffers[0];
      if (offer) {
        const offerType = offer.offer_type || 'percentage';
        const discountVal = Number(offer.discount_value || 0);

        let savings = 0;
        let discountPct = 0;

        if (offerType === 'fixed_amount') {
          savings = Math.min(discountVal, origPrice);
          discountPct = origPrice > 0 ? Number(((savings / origPrice) * 100).toFixed(2)) : 0;
        } else if (offerType === 'product_specific' || offerType === 'percentage') {
          discountPct = discountVal;
          savings = Number((origPrice * (discountPct / 100)).toFixed(2));
        }
        // free_delivery: no price discount

        const discountedPrice = Number((origPrice - savings).toFixed(2));
        const badge = offerType === 'fixed_amount'
          ? `$${savings.toFixed(2)} OFF`
          : offerType === 'free_delivery'
            ? 'FREE DELIVERY'
            : `${discountPct}% OFF`;

        return {
          ...p,
          price: discountedPrice,         // override
          selling_price: discountedPrice, // override
          has_offer: 1,
          offer_id: offer.id,
          offer_type: offerType,
          offer_title: offer.title,
          offer_description: offer.description,
          discount_percentage: discountPct,
          original_price: origPrice,
          discounted_price: discountedPrice,
          offer_badge: badge,
          savings_amount: savings,
          offer_expiry: offer.end_date
        };
      }

      return {
        ...p,
        has_offer: 0,
        offer_title: null,
        offer_description: null,
        discount_percentage: 0,
        original_price: origPrice,
        discounted_price: origPrice,
        offer_badge: null,
        savings_amount: 0,
        offer_expiry: null
      };
    });
  }

  static async getProductsByVendor(vendorId, categoryName) {
    let query = `
      SELECT 
        p.id as product_id, 
        p.name as product_name, 
        p.selling_price, 
        p.selling_price as price, 
        p.stock_quantity as stock, 
        p.unit, 
        p.vendor_id, 
        v.business_name as vendor_name,
        c.name as category
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN vendors v ON p.vendor_id = v.id
      WHERE p.vendor_id = ? AND p.is_active = 1
    `;
    const params = [vendorId];

    if (categoryName) {
      // Normalize categoryName
      const cat = categoryName.toLowerCase();
      let matchTerm = '';
      let excludeTerm = '';
      let handledCategory = false;

      // Specific flow detection
      if (cat === 'petrol' || (cat.includes('petrol') && !cat.includes('diesel'))) {
        matchTerm = 'Petrol';
        excludeTerm = 'Diesel';
      } else if (cat === 'diesel' || (cat.includes('diesel') && !cat.includes('petrol'))) {
        matchTerm = 'Diesel';
        excludeTerm = 'Petrol';
      } else if (cat.includes('petrol') || cat.includes('diesel') || cat.includes('fuel')) {
        query += `
          AND (
            LOWER(p.name) REGEXP 'petrol|diesel|fuel'
            OR LOWER(c.name) REGEXP 'petrol|diesel|fuel'
          )
          AND LOWER(CONCAT_WS(' ', p.name, COALESCE(c.name, ''), COALESCE(p.description, ''), COALESCE(p.unit, '')))
            NOT REGEXP 'gas|gass|lpg|cylinder|spare|part|parts|machine|engine|battery|brake|tyre|tire|spark'
        `;
        handledCategory = true;
      } else if (cat.includes('gas')) {
        query += `
          AND LOWER(CONCAT_WS(' ', p.name, COALESCE(c.name, ''), COALESCE(p.description, ''), COALESCE(p.unit, '')))
            REGEXP 'gas|gass|lpg|cylinder'
          AND LOWER(CONCAT_WS(' ', p.name, COALESCE(c.name, ''), COALESCE(p.description, ''), COALESCE(p.unit, '')))
            NOT REGEXP 'petrol|diesel|fuel|spare|part|parts|machine|engine|battery|brake|tyre|tire|spark'
        `;
        handledCategory = true;
      } else if (cat.includes('spare')) {
        query += `
          AND LOWER(CONCAT_WS(' ', p.name, COALESCE(c.name, ''), COALESCE(p.description, ''), COALESCE(p.unit, '')))
            REGEXP 'spare|part|parts|machine|engine|battery|brake|tyre|tire|spark'
          AND LOWER(CONCAT_WS(' ', p.name, COALESCE(c.name, ''), COALESCE(p.description, ''), COALESCE(p.unit, '')))
            NOT REGEXP 'petrol|diesel|fuel|gas|gass|lpg|cylinder'
        `;
        handledCategory = true;
      }

      if (!handledCategory && !matchTerm) {
        matchTerm = categoryName;
      }

      if (matchTerm) {
        if (excludeTerm) {
          // For specific flows in shared categories:
          // 1. Product name matches matchTerm
          // 2. OR (Category matches matchTerm AND Product name doesn't contain excludeTerm)
          query += ` AND (p.name LIKE ? OR (c.name LIKE ? AND p.name NOT LIKE ?))`;
          params.push(`%${matchTerm}%`, `%${matchTerm}%`, `%${excludeTerm}%`);
        } else {
          query += ` AND (c.name LIKE ? OR p.name LIKE ?)`;
          params.push(`%${matchTerm}%`, `%${matchTerm}%`);
        }
      }
    }

    console.log('[DEBUG] getProductsByVendor Final Query:', query);
    console.log('[DEBUG] getProductsByVendor Params:', params);

    const [rows] = await db.query(query, params);
    return this.enrichProductsWithOffers(rows, vendorId);
  }

  static async getActiveOffers(vendorId = null) {
    await this.expireOffers();

    const queries = [];
    const params = [];

    if (vendorId !== null) {
      params.push(vendorId);
    }

    if (await this.tableExists('offers')) {
      const columns = await this.getTableColumns('offers');
      const hasOfferProducts = await this.tableExists('offer_products');
      const offerTypeSelect = columns.has('offer_type')
        ? 'o.offer_type'
        : "'percentage' AS offer_type";
      const discountValueSelect = columns.has('discount_value')
        ? 'o.discount_value'
        : 'o.discount_percentage AS discount_value';
      const productIdExpression = columns.has('product_id')
        ? (hasOfferProducts ? 'COALESCE(o.product_id, op.product_id)' : 'o.product_id')
        : (hasOfferProducts ? 'op.product_id' : 'NULL');
      const productIdSelect = `${productIdExpression} AS product_id`;
      const createdAtSelect = columns.has('created_at')
        ? 'o.created_at'
        : 'NULL AS created_at';
      const offerProductsJoin = hasOfferProducts
        ? 'LEFT JOIN offer_products op ON o.id = op.offer_id'
        : '';
      const productSpecificFilter = hasOfferProducts
        ? (columns.has('product_id') ? 'AND (o.product_id IS NOT NULL OR op.product_id IS NOT NULL)' : 'AND op.product_id IS NOT NULL')
        : (columns.has('product_id') ? 'AND o.product_id IS NOT NULL' : '');

      const [rows] = await db.query(
        `SELECT
          o.id,
          o.vendor_id,
          o.title AS name,
          o.description,
          ${offerTypeSelect},
          ${discountValueSelect},
          ${productIdSelect},
          o.start_date,
          o.end_date,
          o.is_active,
          ${createdAtSelect},
          COALESCE(v.business_name, v.name, 'Vendor') AS vendor_name,
          v.business_type AS vendor_business_type,
          v.latitude AS vendor_latitude,
          v.longitude AS vendor_longitude,
          v.logo AS vendor_logo,
          COALESCE(offer_inventory.stock, offer_product.stock_quantity, 0) AS stock,
          offer_product.is_active AS product_is_active,
          'offers' AS source
        FROM offers o
        ${offerProductsJoin}
        INNER JOIN products offer_product
          ON offer_product.id = ${productIdExpression}
         AND offer_product.vendor_id = o.vendor_id
         AND offer_product.is_active = 1
        LEFT JOIN inventory offer_inventory ON offer_inventory.product_id = offer_product.id
        LEFT JOIN vendors v ON v.id = o.vendor_id
        WHERE o.is_active = 1
          AND (o.start_date IS NULL OR o.start_date <= NOW())
          AND (o.end_date IS NULL OR o.end_date >= NOW())
          AND COALESCE(offer_inventory.stock, offer_product.stock_quantity, 0) > 0
          ${productSpecificFilter}
          ${vendorId !== null ? 'AND o.vendor_id = ?' : ''}`,
        vendorId !== null ? [vendorId] : []
      );
      queries.push(rows);
    }

    if (await this.tableExists('vendor_offers')) {
      const columns = await this.getTableColumns('vendor_offers');
      const createdAtSelect = columns.has('created_at')
        ? 'vo.created_at'
        : 'NULL AS created_at';

      const [rows] = await db.query(
        `SELECT
          vo.id,
          vo.vendor_id,
          vo.name,
          NULL AS description,
          'percentage' AS offer_type,
          vo.discount_percentage AS discount_value,
          NULL AS product_id,
          NULL AS start_date,
          NULL AS end_date,
          CASE WHEN vo.status = 'Active' THEN 1 ELSE 0 END AS is_active,
          ${createdAtSelect},
          COALESCE(v.business_name, v.name, 'Vendor') AS vendor_name,
          v.business_type AS vendor_business_type,
          v.latitude AS vendor_latitude,
          v.longitude AS vendor_longitude,
          v.logo AS vendor_logo,
          'vendor_offers' AS source
        FROM vendor_offers vo
        LEFT JOIN vendors v ON v.id = vo.vendor_id
        WHERE vo.status = 'Active'
          ${vendorId !== null ? 'AND vo.vendor_id = ?' : ''}`,
        vendorId !== null ? [vendorId] : []
      );
      queries.push(rows);
    }

    if (queries.length === 0) {
      return { offers: [] };
    }

    const offers = queries
      .flat()
      .map((offer) => ({
        id: offer.id,
        vendor_id: offer.vendor_id,
        name: offer.name,
        description: offer.description || null,
        offer_type: offer.offer_type || 'percentage',
        discount_value: Number(offer.discount_value || 0),
        product_id: offer.product_id || null,
        start_date: offer.start_date,
        end_date: offer.end_date,
        is_active: Boolean(offer.is_active),
        created_at: offer.created_at || null,
        vendor_name: offer.vendor_name || 'Vendor',
        business_name: offer.vendor_name || 'Vendor',
        vendor_business_type: offer.vendor_business_type || null,
        vendor_logo: offer.vendor_logo || null,
        stock: Number(offer.stock || 0),
        product_is_active: Boolean(offer.product_is_active),
        vendor_latitude: offer.vendor_latitude != null ? Number(offer.vendor_latitude) : null,
        vendor_longitude: offer.vendor_longitude != null ? Number(offer.vendor_longitude) : null,
        source: offer.source || null,
      }))
      .filter((offer) => offer.offer_type === 'free_delivery' || offer.product_id != null)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return { offers };
  }

  static async getActiveOfferById(offerId, vendorId = null) {
    const id = Number(offerId);
    if (!Number.isInteger(id) || id <= 0) return null;

    const data = await this.getActiveOffers();
    return data.offers.find((offer) => {
      if (Number(offer.id) !== id) return false;
      return vendorId === null || Number(offer.vendor_id) === Number(vendorId);
    }) || null;
  }

  static async getOfferFeed(userId) {
    await this.ensureOfferSupportSchema();

    const customer = await this.getCustomerIdByUserId(userId);
    if (!customer) return { offers: [], nearby_offers: [], discounted_products: [], limited_time_deals: [] };

    const [addresses] = await db.query(
      `SELECT latitude, longitude, label, address_line
       FROM addresses
       WHERE customer_id = ?
       ORDER BY is_default DESC, created_at DESC`,
      [customer.id]
    );
    const [orderRows] = await db.query(
      'SELECT DISTINCT vendor_id FROM orders WHERE customer_id = ?',
      [customer.id]
    );
    const [favoriteRows] = await db.query(
      'SELECT DISTINCT vendor_id FROM customer_vendor_favorites WHERE customer_id = ?',
      [customer.id]
    );

    const orderedVendorIds = new Set(orderRows.map((row) => Number(row.vendor_id)));
    const favoriteVendorIds = new Set(favoriteRows.map((row) => Number(row.vendor_id)));
    const zoneVendorIds = await this.getVendorIdsMatchingCustomerZones(customer.id);
    const { offers } = await this.getActiveOffers();

    const enrichedOffers = offers.map((offer) => {
      let closestDistanceKm = null;
      for (const address of addresses) {
        const distance = this.haversineDistanceKm(
          address.latitude,
          address.longitude,
          offer.vendor_latitude,
          offer.vendor_longitude
        );
        if (distance === null) continue;
        if (closestDistanceKm === null || distance < closestDistanceKm) {
          closestDistanceKm = distance;
        }
      }

      const vendorId = Number(offer.vendor_id);
      const reasons = [];
      const isNearby = closestDistanceKm !== null && closestDistanceKm <= 20;

      if (isNearby) reasons.push('nearby');
      if (zoneVendorIds.has(vendorId)) reasons.push('delivery_zone');
      if (orderedVendorIds.has(vendorId)) reasons.push('previous_order');
      if (favoriteVendorIds.has(vendorId)) reasons.push('favorite');

      return {
        ...offer,
        distance_km: closestDistanceKm === null ? null : Number(closestDistanceKm.toFixed(2)),
        is_nearby: isNearby || zoneVendorIds.has(vendorId),
        audience_reasons: reasons,
      };
    });

    const relevantOffers = enrichedOffers.filter((offer) => offer.audience_reasons.length > 0);
    const nearbyOffers = enrichedOffers.filter((offer) => offer.is_nearby);

    // Fetch all active products to check for discounts
    const [allProducts] = await db.query(`
      SELECT 
        p.id as product_id, 
        p.name as product_name, 
        p.selling_price, 
        p.selling_price as price, 
        COALESCE(i.stock, p.stock_quantity, 0) as stock,
        p.unit, 
        p.vendor_id, 
        v.business_name as vendor_name,
        c.name as category,
        p.image_url
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN vendors v ON p.vendor_id = v.id
      WHERE p.is_active = 1
        AND COALESCE(i.stock, p.stock_quantity, 0) > 0
    `);

    const enrichedProducts = await this.enrichProductsWithOffers(allProducts);
    const discountedProducts = enrichedProducts.filter(
      (p) => p.has_offer === 1 && Number(p.stock || 0) > 0
    );
    const limitedTimeDeals = discountedProducts.filter((p) => {
      if (p.offer_expiry === null) return false;
      const expiry = new Date(p.offer_expiry);
      return !Number.isNaN(expiry.getTime()) && expiry.getTime() >= Date.now();
    });

    return {
      offers: relevantOffers.length > 0 ? relevantOffers : enrichedOffers,
      nearby_offers: nearbyOffers,
      discounted_products: discountedProducts,
      limited_time_deals: limitedTimeDeals
    };
  }

  static async trackOfferEvent({ offer, offerId, vendorId, customerId = null, orderId = null, eventType, revenue = 0 }) {
    await this.ensureOfferSupportSchema();

    const normalizedEventType = String(eventType || '').trim().toLowerCase();
    if (!['view', 'click', 'order'].includes(normalizedEventType)) {
      throw new Error('Invalid offer analytics event type.');
    }

    const resolvedOffer = offer || await this.getActiveOfferById(offerId, vendorId);
    if (!resolvedOffer) return false;

    await db.query(
      `INSERT INTO offer_analytics
        (offer_id, offer_source, vendor_id, customer_id, order_id, event_type, revenue)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedOffer.id,
        resolvedOffer.source || 'offers',
        resolvedOffer.vendor_id,
        customerId || null,
        orderId || null,
        normalizedEventType,
        Number(revenue) || 0,
      ]
    );
    return true;
  }

  static async favoriteVendor(userId, vendorId) {
    await this.ensureOfferSupportSchema();
    const customer = await this.getCustomerIdByUserId(userId);
    const id = Number(vendorId);
    if (!customer || !Number.isInteger(id) || id <= 0) return false;

    await db.query(
      'INSERT IGNORE INTO customer_vendor_favorites (customer_id, vendor_id) VALUES (?, ?)',
      [customer.id, id]
    );
    return true;
  }

  static async unfavoriteVendor(userId, vendorId) {
    await this.ensureOfferSupportSchema();
    const customer = await this.getCustomerIdByUserId(userId);
    const id = Number(vendorId);
    if (!customer || !Number.isInteger(id) || id <= 0) return false;

    const [result] = await db.query(
      'DELETE FROM customer_vendor_favorites WHERE customer_id = ? AND vendor_id = ?',
      [customer.id, id]
    );
    return result.affectedRows > 0;
  }

  static async recordOfferRedemption(offer) {
    if (!offer || !offer.id || !offer.source) return false;

    if (offer.source === 'vendor_offers' && await this.tableExists('vendor_offers')) {
      const [columnRows] = await db.query('SHOW COLUMNS FROM vendor_offers');
      const columns = new Set(columnRows.map((column) => column.Field));
      if (!columns.has('total_redeemed')) return false;
      await db.query(
        'UPDATE vendor_offers SET total_redeemed = COALESCE(total_redeemed, 0) + 1 WHERE id = ?',
        [offer.id]
      );
      return true;
    }

    if (offer.source === 'offers' && await this.tableExists('offers')) {
      const [columnRows] = await db.query('SHOW COLUMNS FROM offers');
      const columns = new Set(columnRows.map((column) => column.Field));
      if (columns.has('total_redeemed')) {
        await db.query(
          'UPDATE offers SET total_redeemed = COALESCE(total_redeemed, 0) + 1 WHERE id = ?',
          [offer.id]
        );
        return true;
      }
    }

    return false;
  }

  static calculateOfferDiscount(offers, items, deliveryFee) {
    const activeOffers = Array.isArray(offers) ? offers : [];

    let bestGenericDiscount = 0;
    let offerDescription = null;
    let freeDelivery = false;

    // Build item-specific discount from product-specific offers.
    const productDiscounts = new Map();
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    for (const offer of activeOffers) {
      if (offer.offer_type === 'free_delivery') {
        freeDelivery = true;
        if (!offerDescription) offerDescription = 'Free delivery';
        continue;
      }

      const scopedProductId = offer.product_id != null ? Number(offer.product_id) : null;
      if (Number.isInteger(scopedProductId) && scopedProductId > 0) {
        const item = items.find((i) => Number(i.product_id) === Number(offer.product_id));
        if (!item) continue;
        let discount = 0;

        if (offer.offer_type === 'fixed_amount') {
          discount = Math.min(Number(offer.discount_value || 0), item.price * item.quantity);
        } else if (Number(offer.discount_value) > 0) {
          discount = (item.price * item.quantity) * (Number(offer.discount_value) / 100);
        }

        const existing = productDiscounts.get(item.product_id) || 0;
        if (discount > existing) {
          productDiscounts.set(item.product_id, discount);
          offerDescription = 'Product-specific offer applied';
        }
        continue;
      }

      if (offer.offer_type === 'product_specific') {
        continue;
      }

      if (offer.offer_type === 'percentage') {
        const discount = subtotal * (Number(offer.discount_value) / 100);
        if (discount > bestGenericDiscount) {
          bestGenericDiscount = discount;
          offerDescription = `${Number(offer.discount_value).toFixed(0)}% off`;
        }
      } else if (offer.offer_type === 'fixed_amount') {
        const discount = Math.min(Number(offer.discount_value), subtotal);
        if (discount > bestGenericDiscount) {
          bestGenericDiscount = discount;
          offerDescription = `$${discount.toFixed(2)} off`;
        }
      }
    }

    const productSpecificDiscount = Array.from(productDiscounts.values()).reduce((sum, value) => sum + value, 0);
    const discountAmount = Math.min(subtotal, Math.max(bestGenericDiscount, productSpecificDiscount));

    if (productSpecificDiscount > bestGenericDiscount) {
      offerDescription = 'Product-specific offer applied';
    }

    const effectiveDeliveryFee = freeDelivery ? 0 : Number(deliveryFee || 0);

    if (freeDelivery && discountAmount > 0) {
      offerDescription = 'Free delivery + ' + offerDescription;
    }

    return {
      discountAmount: Number(discountAmount.toFixed(2)),
      effectiveDeliveryFee,
      offerDescription: offerDescription ?? (freeDelivery ? 'Free delivery applied' : null),
    };
  }
  static async getOrders(customerId) {
    await this.ensureReviewSchema();
    const [rows] = await db.query(`
      SELECT o.*, v.business_name as vendor_name,
             (
               SELECT GROUP_CONCAT(DISTINCT cat.name ORDER BY cat.name SEPARATOR ', ')
               FROM order_items oi
               JOIN products p ON p.id = oi.product_id
               LEFT JOIN categories cat ON cat.id = p.category_id
               WHERE oi.order_id = o.id
             ) AS order_type,
             r.id as review_id,
             CASE WHEN r.id IS NULL THEN 0 ELSE 1 END as has_review
      FROM orders o
      JOIN vendors v ON o.vendor_id = v.id
      LEFT JOIN reviews r ON r.order_id = o.id AND r.customer_id = o.customer_id
      WHERE o.customer_id = ?
      ORDER BY o.created_at DESC
    `, [customerId]);
    return rows;
  }

  static async updateVendorRatingFromReviews(vendorId) {
    if (!vendorId) return;
    const vendorColumns = await this.getTableColumns('vendors').catch(() => new Set());
    if (!vendorColumns.has('rating')) return;

    const [rows] = await db.query(
      'SELECT AVG(rating) AS average_rating FROM reviews WHERE vendor_id = ?',
      [vendorId]
    );
    const averageRating = Number(rows[0]?.average_rating || 0);
    await db.query(
      'UPDATE vendors SET rating = ? WHERE id = ?',
      [Number(averageRating.toFixed(2)), vendorId]
    );
  }

  static async createOrderReview(userId, orderId, reviewData) {
    await this.ensureReviewSchema();

    const id = Number.parseInt(orderId, 10);
    const rating = Number.parseInt(reviewData.rating, 10);
    const comment = (reviewData.comment || '').toString().trim() || null;

    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid order id.');
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5.');
    }

    const customer = await this.getCustomerIdByUserId(userId);
    if (!customer) {
      throw new Error('Customer profile not found.');
    }

    const [orders] = await db.query(
      `SELECT o.id, o.customer_id, o.vendor_id, o.status AS order_status,
              d.status AS delivery_status, d.driver_id
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       LEFT JOIN deliveries d ON d.order_id = o.id
       WHERE o.id = ? AND c.user_id = ?
       LIMIT 1`,
      [id, userId]
    );

    if (orders.length === 0) {
      throw new Error('Order not found.');
    }

    const order = orders[0];
    const status = (order.delivery_status || order.order_status || '').toString().toLowerCase().trim();
    if (status !== 'delivered') {
      throw new Error('You can review this order after it has been delivered.');
    }

    const columns = await this.getTableColumns('reviews');
    const [existing] = await db.query(
      'SELECT id FROM reviews WHERE order_id = ? AND customer_id = ? LIMIT 1',
      [id, customer.id]
    );

    let reviewId;
    let updated = false;
    if (existing.length > 0) {
      reviewId = existing[0].id;
      const updates = ['rating = ?', 'comment = ?'];
      const params = [rating, comment];
      if (columns.has('driver_id')) {
        updates.push('driver_id = ?');
        params.push(order.driver_id || null);
      }
      if (columns.has('vendor_id')) {
        updates.push('vendor_id = ?');
        params.push(order.vendor_id || null);
      }
      if (columns.has('updated_at')) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
      }
      params.push(reviewId);
      await db.query(`UPDATE reviews SET ${updates.join(', ')} WHERE id = ?`, params);
      updated = true;
    } else {
      const fields = ['order_id', 'customer_id', 'rating', 'comment'];
      const values = [id, customer.id, rating, comment];
      if (columns.has('driver_id')) {
        fields.push('driver_id');
        values.push(order.driver_id || null);
      }
      if (columns.has('vendor_id')) {
        fields.push('vendor_id');
        values.push(order.vendor_id || null);
      }
      const placeholders = fields.map(() => '?').join(', ');
      const [result] = await db.query(
        `INSERT INTO reviews (${fields.join(', ')}) VALUES (${placeholders})`,
        values
      );
      reviewId = result.insertId;
    }

    await this.updateVendorRatingFromReviews(order.vendor_id);
    return {
      review_id: reviewId,
      order_id: id,
      vendor_id: order.vendor_id,
      rating,
      comment,
      updated,
    };
  }

  static async createOrder(orderData) {
    await this.ensureOrderSchema();
    await this.ensureOfferSupportSchema();

    const {
      customer_id,
      vendor_id,
      total_amount,
      delivery_address,
      delivery_latitude,
      delivery_longitude,
      payment_method,
      payment_status,
      delivery_fee,
      distance_km,
      destinations,
      provider_payment,
      items
    } = orderData;
    
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Get/Create address ID
      //
      // Normalise the destination list up front. The customer app posts a single
      // `delivery_address` for an ordinary one-stop delivery and omits
      // `destinations` entirely; the old code then fell back to `[{}]`, so the
      // NOT NULL order_destinations.address_line insert threw and rolled the
      // whole transaction back — AFTER the customer had already been charged.
      // Every destination is now backed by the top-level delivery address.
      const normalizedDestinations = (Array.isArray(destinations) && destinations.length > 0
        ? destinations
        : [{}]
      ).map((d, index) => ({
        ...d,
        address_line: d?.address_line || (index === 0 ? delivery_address : null),
        phone: d?.phone || '',
        latitude: d?.latitude ?? (index === 0 ? delivery_latitude : null) ?? null,
        longitude: d?.longitude ?? (index === 0 ? delivery_longitude : null) ?? null,
      }));

      // A delivery with nowhere to go is not a valid order.
      const missing = normalizedDestinations.findIndex((d) => !String(d.address_line || '').trim());
      if (missing !== -1) {
        throw Object.assign(
          new Error('A delivery address is required for every destination.'),
          { statusCode: 400, code: 'MISSING_DELIVERY_ADDRESS' }
        );
      }

      const primaryDestination = normalizedDestinations[0];
      const [addrResult] = await connection.query(
        'INSERT INTO addresses (customer_id, address_line, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
        [customer_id, primaryDestination.address_line || delivery_address, primaryDestination.phone || '', delivery_latitude || primaryDestination.latitude || null, delivery_longitude || primaryDestination.longitude || null]
      );
      const addressId = addrResult.insertId;

      // 2. Create order with 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      // COD orders start as 'pending_payment'; online methods start as 'pending'
      const normalizedMethod = String(payment_method).trim().toLowerCase();
      const initialStatus = (normalizedMethod === 'cod' || normalizedMethod === 'cash_on_delivery' || normalizedMethod === 'cash on delivery')
        ? 'pending_payment'
        : 'pending';
      const [orderResult] = await connection.query(
        // payment_status was previously hard-coded to "pending" here, so an order
        // paid online was written as unpaid. The vendor's order list only shows
        // COD or payment_status='paid', so every successfully paid online order
        // was invisible to the vendor it belonged to. It is now taken from the
        // caller, which sets 'paid' once the provider confirms the charge.
        `INSERT INTO orders
           (customer_id, vendor_id, address_id, delivery_address, total_amount, status,
            delivery_otp, payment_method, payment_status, distance_km, delivery_fee,
            payment_recipient, vendor_assigned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "vendor", NOW())`,
        [
          customer_id,
          vendor_id,
          addressId,
          primaryDestination.address_line || delivery_address || null,
          total_amount,
          initialStatus,
          otp,
          payment_method,
          ['paid', 'pending', 'failed', 'refunded'].includes(String(payment_status))
            ? String(payment_status)
            : 'pending',
          Number(distance_km || 0).toFixed(2),
          delivery_fee || 0,
        ]
      );
      const orderId = orderResult.insertId;
      const { commission: commissionAmount, netAmount: vendorAmount, percent: commissionRate } = computeCommission(total_amount);
      const isCashPayment = ['cod', 'cash_on_delivery', 'cash on delivery'].includes(normalizedMethod);
      await connection.query(
        `INSERT INTO payments
          (order_id, vendor_id, method, amount, status, vendor_amount, admin_commission, settlement_status, settled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, vendor_id, payment_method, total_amount, isCashPayment ? 'pending' : 'paid',
         vendorAmount, commissionAmount, isCashPayment ? 'pending' : 'settled', isCashPayment ? null : new Date()]
      );
      if (provider_payment) {
        await connection.query(
          'UPDATE payments SET transaction_id = ? WHERE order_id = ?',
          [provider_payment.transactionId || provider_payment.referenceId, orderId]
        );
      }
      await connection.query(
        `INSERT INTO commissions
          (order_id, vendor_id, total_amount, commission_rate, commission_amount, vendor_net_amount, status, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, vendor_id, total_amount, commissionRate, commissionAmount, vendorAmount,
         provider_payment?.commissionSettled ? 'paid' : 'pending', provider_payment?.commissionSettled ? new Date() : null]
      );

      for (const [index, destination] of normalizedDestinations.entries()) {
        let destinationAddressId = addressId;
        if (index > 0) {
          const [destinationAddress] = await connection.query(
            'INSERT INTO addresses (customer_id, address_line, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
            [customer_id, destination.address_line, destination.phone, destination.latitude || null, destination.longitude || null]
          );
          destinationAddressId = destinationAddress.insertId;
        }
        await connection.query(
          `INSERT INTO order_destinations (order_id, address_id, address_line, phone, latitude, longitude, sequence_no)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [orderId, destinationAddressId, destination.address_line, destination.phone,
           destination.latitude || null, destination.longitude || null, index + 1]
        );
      }

      // 3. Create order items and update stock
      for (const item of items) {
        // Use pre-computed discount data from the controller (authoritative server-side calculation).
        // The controller already re-fetched DB prices and applied offer logic per item.
        const originalPrice  = Number(item.original_price || item.price);
        const discountAmount = Number(item.discount_amount || 0);
        const discountPct    = Number(item.discount_percent || 0);
        const finalPrice     = Number(item.final_price     || item.price);

        console.log(
          `[MODEL createOrder] product_id=${item.product_id} orig=${originalPrice}` +
          ` discount=${discountAmount} (${discountPct}%) final=${finalPrice}`
        );

        await connection.query(
          `INSERT INTO order_items
            (order_id, product_id, quantity, unit_price, subtotal, original_price, discount_amount, discount_percent, final_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.product_id,
            item.quantity,
            finalPrice,
            Number((finalPrice * item.quantity).toFixed(2)),
            originalPrice,
            discountAmount,
            discountPct,
            finalPrice
          ]
        );

        // Deduct stock — floored at 0 so inventory can never go negative
        // (defense-in-depth against races/overselling; earlier validation checks availability).
        await connection.query(
          'UPDATE products SET stock_quantity = GREATEST(IFNULL(stock_quantity, 0) - ?, 0) WHERE id = ?',
          [item.quantity, item.product_id]
        );

        await connection.query(
          'UPDATE inventory SET stock = GREATEST(stock - ?, 0) WHERE product_id = ?',
          [item.quantity, item.product_id]
        );
      }

      await connection.commit();
      return orderId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getVendorsByProduct(productQuery) {
    // Search by category name or product name
    const [rows] = await db.query(`
      SELECT DISTINCT v.* 
      FROM vendors v
      JOIN products p ON v.id = p.vendor_id
      JOIN categories c ON p.category_id = c.id
      WHERE (c.name LIKE ? OR p.name LIKE ?) AND p.is_active = 1
    `, [`%${productQuery}%`, `%${productQuery}%`]);
    return rows.map(attachVendorStatus);
  }

  static async getOrderTracking(orderId, userId = null) {
    await this.ensureOrderSchema();
    await this.ensureReviewSchema();
    const params = [orderId];
    let ownershipClause = '';
    if (userId) {
      ownershipClause = ' AND c.user_id = ?';
      params.push(userId);
    }

    const [rows] = await db.query(`
      SELECT o.id as order_id, d.id as delivery_id, d.driver_id,
             COALESCE(d.status, o.status) as status, o.status as order_status,
             o.delivery_otp, o.created_at,
             d.status as delivery_status, d.arrived_at, d.delivered_at,
             NULLIF(TRIM(CONCAT(COALESCE(dr.first_name, ''), ' ', COALESCE(dr.last_name, ''))), '') as driver_name,
             NULLIF(TRIM(du.phone), '') as driver_phone,
             COALESCE(dl.latitude, dr.current_latitude, dr.current_lat) as driver_lat,
             COALESCE(dl.longitude, dr.current_longitude, dr.current_lng) as driver_lng,
             COALESCE(dl.heading, dr.heading) as driver_heading,
             COALESCE(dl.speed, dr.speed) as driver_speed,
             COALESCE(dl.updated_at, dr.last_location_update) as last_location_update,
             COALESCE(d.customer_latitude, a.latitude, od.latitude, cl.latitude) as dest_lat,
             COALESCE(d.customer_longitude, a.longitude, od.longitude, cl.longitude) as dest_lng,
             COALESCE(a.address_line, od.address_line, o.delivery_address, cl.address) as address_line,
             v.business_name as vendor_name, NULLIF(TRIM(v.phone), '') as vendor_phone,
             v.latitude as vendor_lat, v.longitude as vendor_lng, v.logo as vendor_logo,
             (
               SELECT GROUP_CONCAT(DISTINCT cat.name ORDER BY cat.name SEPARATOR ', ')
               FROM order_items oi
               JOIN products p ON p.id = oi.product_id
               LEFT JOIN categories cat ON cat.id = p.category_id
               WHERE oi.order_id = o.id
             ) AS order_type,
             d.live_tracking_enabled,
             r.id as review_id,
             CASE WHEN r.id IS NULL THEN 0 ELSE 1 END as has_review
      FROM orders o
      LEFT JOIN deliveries d ON o.id = d.order_id
      LEFT JOIN drivers dr ON d.driver_id = dr.id
      LEFT JOIN users du ON dr.user_id = du.id
      LEFT JOIN driver_locations dl ON dl.driver_id = dr.id
      LEFT JOIN addresses a ON o.address_id = a.id
      LEFT JOIN order_destinations od ON od.order_id = o.id AND od.sequence_no = 1
      JOIN vendors v ON o.vendor_id = v.id
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN customer_locations cl ON cl.customer_id = c.id AND cl.is_default = 1
      LEFT JOIN reviews r ON r.order_id = o.id AND r.customer_id = o.customer_id
      WHERE o.id = ?${ownershipClause}
    `, params);
    return rows[0];
  }

  static async getDeliveryTracking(deliveryId, userId = null) {
    await this.ensureOrderSchema();
    await this.ensureReviewSchema();
    const params = [deliveryId];
    let ownershipClause = '';
    if (userId) {
      ownershipClause = ' AND c.user_id = ?';
      params.push(userId);
    }

    const [rows] = await db.query(`
      SELECT o.id as order_id, d.id as delivery_id, d.driver_id,
             COALESCE(d.status, o.status) as status, o.status as order_status,
             o.delivery_otp, o.created_at,
             d.status as delivery_status, d.arrived_at, d.delivered_at,
             NULLIF(TRIM(CONCAT(COALESCE(dr.first_name, ''), ' ', COALESCE(dr.last_name, ''))), '') as driver_name,
             NULLIF(TRIM(du.phone), '') as driver_phone,
             COALESCE(dl.latitude, dr.current_latitude, dr.current_lat) as driver_lat,
             COALESCE(dl.longitude, dr.current_longitude, dr.current_lng) as driver_lng,
             COALESCE(dl.heading, dr.heading) as driver_heading,
             COALESCE(dl.speed, dr.speed) as driver_speed,
             COALESCE(dl.updated_at, dr.last_location_update) as last_location_update,
             COALESCE(d.customer_latitude, a.latitude, od.latitude, cl.latitude) as dest_lat,
             COALESCE(d.customer_longitude, a.longitude, od.longitude, cl.longitude) as dest_lng,
             COALESCE(a.address_line, od.address_line, o.delivery_address, cl.address) as address_line,
             v.business_name as vendor_name, NULLIF(TRIM(v.phone), '') as vendor_phone,
             v.latitude as vendor_lat, v.longitude as vendor_lng, v.logo as vendor_logo,
             (
               SELECT GROUP_CONCAT(DISTINCT cat.name ORDER BY cat.name SEPARATOR ', ')
               FROM order_items oi
               JOIN products p ON p.id = oi.product_id
               LEFT JOIN categories cat ON cat.id = p.category_id
               WHERE oi.order_id = o.id
             ) AS order_type,
             d.live_tracking_enabled,
             r.id as review_id,
             CASE WHEN r.id IS NULL THEN 0 ELSE 1 END as has_review
      FROM deliveries d
      JOIN orders o ON d.order_id = o.id
      LEFT JOIN drivers dr ON d.driver_id = dr.id
      LEFT JOIN users du ON dr.user_id = du.id
      LEFT JOIN driver_locations dl ON dl.driver_id = dr.id
      LEFT JOIN addresses a ON o.address_id = a.id
      LEFT JOIN order_destinations od ON od.order_id = o.id AND od.sequence_no = 1
      JOIN vendors v ON o.vendor_id = v.id
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN customer_locations cl ON cl.customer_id = c.id AND cl.is_default = 1
      LEFT JOIN reviews r ON r.order_id = o.id AND r.customer_id = o.customer_id
      WHERE d.id = ?${ownershipClause}
    `, params);
    return rows[0];
  }

  static async getSparePartsVendorsProducts() {
    const query = `
      SELECT 
        v.id AS vendor_id,
        v.business_name AS vendor_name,
        v.address AS location,
        v.is_online,
        v.is_open,
        v.opening_time,
        v.closing_time,
        v.status,
        v.logo,
        p.id AS product_id,
        p.name AS product_name,
        c.name AS category,
        CAST(p.selling_price AS FLOAT) AS selling_price,
        CAST(IFNULL(i.stock, p.stock_quantity) AS FLOAT) AS stock,
        p.unit,
        p.image_url
      FROM vendors v
      JOIN products p ON v.id = p.vendor_id
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.is_active = 1
        AND LOWER(CONCAT_WS(' ', p.name, COALESCE(c.name, ''), COALESCE(p.description, ''), COALESCE(p.unit, '')))
          REGEXP 'spare|part|parts|machine|engine|battery|brake|tyre|tire|spark'
        AND LOWER(CONCAT_WS(' ', p.name, COALESCE(c.name, ''), COALESCE(p.description, ''), COALESCE(p.unit, '')))
          NOT REGEXP 'petrol|diesel|fuel|gas|gass|lpg|cylinder'
      ORDER BY v.business_name ASC, p.name ASC
    `;
    const [rows] = await db.query(query);
    const enrichedRows = await this.enrichProductsWithOffers(rows);

    // Group by vendor
    const vendorMap = new Map();
    for (const row of enrichedRows) {
      if (!vendorMap.has(row.vendor_id)) {
        const vStatus = attachVendorStatus({
          id: row.vendor_id,
          business_name: row.vendor_name,
          is_online: row.is_online,
          is_open: row.is_open,
          opening_time: row.opening_time,
          closing_time: row.closing_time,
          status: row.status
        });

        vendorMap.set(row.vendor_id, {
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name || 'Unknown Vendor',
          location: row.location || 'Mogadishu', // fallback if address is empty
          is_online: vStatus.is_online,
          is_open: vStatus.is_open,
          status_label: vStatus.status_label,
          logo: row.logo,
          products: []
        });
      }
      vendorMap.get(row.vendor_id).products.push({
        product_id: row.product_id,
        product_name: row.product_name,
        category: row.category,
        selling_price: row.selling_price || 0,
        price: row.price || row.selling_price || 0,
        stock: row.stock || 0,
        unit: row.unit || 'Piece',
        image_url: row.image_url || '/uploads/products/default.png',
        has_offer: row.has_offer,
        offer_id: row.offer_id,
        offer_title: row.offer_title,
        offer_description: row.offer_description,
        discount_percentage: row.discount_percentage,
        original_price: row.original_price,
        discounted_price: row.discounted_price,
        offer_badge: row.offer_badge,
        savings_amount: row.savings_amount,
        offer_expiry: row.offer_expiry
      });
    }

    return Array.from(vendorMap.values());
  }

  static async getVendorsProductsByKeyword(keyword) {
    const search = String(keyword || '').trim();
    if (!search) return [];

    const like = `%${search}%`;
    const [rows] = await db.query(
      `
      SELECT 
        v.id AS vendor_id,
        v.business_name AS vendor_name,
        v.address AS location,
        v.is_online,
        v.is_open,
        v.opening_time,
        v.closing_time,
        v.status,
        v.logo,
        p.id AS product_id,
        p.name AS product_name,
        c.name AS category,
        CAST(p.selling_price AS FLOAT) AS selling_price,
        CAST(IFNULL(i.stock, p.stock_quantity) AS FLOAT) AS stock,
        p.unit,
        p.image_url,
        p.description
      FROM vendors v
      JOIN products p ON v.id = p.vendor_id
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.is_active = 1
        AND (
          LOWER(c.name) = LOWER(?)
          OR LOWER(p.name) LIKE LOWER(?)
          OR LOWER(COALESCE(p.description, '')) LIKE LOWER(?)
        )
      ORDER BY v.business_name ASC, p.name ASC
      `,
      [search, like, like]
    );

    const enrichedRows = await this.enrichProductsWithOffers(rows);
    const vendorMap = new Map();

    for (const row of enrichedRows) {
      if (!vendorMap.has(row.vendor_id)) {
        const vStatus = attachVendorStatus({
          id: row.vendor_id,
          business_name: row.vendor_name,
          is_online: row.is_online,
          is_open: row.is_open,
          opening_time: row.opening_time,
          closing_time: row.closing_time,
          status: row.status
        });

        vendorMap.set(row.vendor_id, {
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name || 'Unknown Vendor',
          location: row.location || 'Mogadishu',
          is_online: vStatus.is_online,
          is_open: vStatus.is_open,
          status_label: vStatus.status_label,
          logo: row.logo,
          products: []
        });
      }

      vendorMap.get(row.vendor_id).products.push({
        product_id: row.product_id,
        product_name: row.product_name,
        category: row.category,
        selling_price: row.selling_price || 0,
        price: row.price || row.selling_price || 0,
        stock: row.stock || 0,
        unit: row.unit || 'Piece',
        image_url: row.image_url || '/uploads/products/default.png',
        description: row.description || '',
        has_offer: row.has_offer,
        offer_id: row.offer_id,
        offer_title: row.offer_title,
        offer_description: row.offer_description,
        discount_percentage: row.discount_percentage,
        original_price: row.original_price,
        discounted_price: row.discounted_price,
        offer_badge: row.offer_badge,
        savings_amount: row.savings_amount,
        offer_expiry: row.offer_expiry
      });
    }

    return Array.from(vendorMap.values());
  }
}

module.exports = CustomerModel;
