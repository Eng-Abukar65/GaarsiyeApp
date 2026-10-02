const db = require('../config/db');
const CalculationHelper = require('../utils/calculations');
const bcrypt = require('bcryptjs');
const { ensureVendorSchema } = require('../utils/vendorSchema');
const { encryptCredential } = require('../utils/credentialVault');
const { computeCommission } = require('../config/commission');
const { addColumn } = require('../utils/schemaHelper');

async function passwordMatches(password, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password || '', hash);
  } catch {
    return false;
  }
}

class VendorModel {
  static async migrateCarServiceProducts() {
    try {
      const [cats] = await db.query(
        `SELECT id, name FROM categories WHERE LOWER(TRIM(name)) IN ('car wash', 'car service', 'car services')`
      );
      if (!cats || cats.length === 0) return;
      const catIds = cats.map(c => c.id);

      const [serviceProducts] = await db.query(
        `SELECT * FROM products WHERE category_id IN (?)`,
        [catIds]
      );

      for (const prod of serviceProducts) {
        const [existing] = await db.query(
          `SELECT id FROM car_wash_services WHERE vendor_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
          [prod.vendor_id, prod.name]
        );

        if (existing.length === 0) {
          await db.query(
            `INSERT INTO car_wash_services (vendor_id, name, description, base_price, estimated_minutes, is_available, status)
             VALUES (?, ?, ?, ?, 30, ?, ?)`,
            [
              prod.vendor_id,
              prod.name,
              prod.description || `${prod.name} service`,
              prod.selling_price || 0,
              prod.is_active ? 1 : 0,
              prod.is_active ? 'active' : 'inactive'
            ]
          );
        }

        try {
          await db.query(`DELETE FROM inventory WHERE product_id = ?`, [prod.id]);
          await db.query(`DELETE FROM products WHERE id = ?`, [prod.id]);
        } catch (delErr) {
          await db.query(`UPDATE products SET is_active = 0 WHERE id = ?`, [prod.id]);
        }
      }
    } catch (err) {
      console.error('[MIGRATION] Error migrating car service products:', err);
    }
  }

  static async getProducts(vendorId) {
    await VendorModel.migrateCarServiceProducts();
    const [rows] = await db.query(
      `SELECT p.* FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.vendor_id = ? AND p.is_active = 1
       AND (c.name IS NULL OR LOWER(TRIM(c.name)) NOT IN ('car wash', 'car service', 'car services'))`,
      [vendorId]
    );
    return rows;
  }

  static async createProduct(productData) {
    const { vendor_id, name, description, cost_price, selling_price, unit, category_id, stock_quantity, image_url, is_active, max_stock_level } = productData;
    // Real maximum capacity (e.g. tank size). NULL means "not configured" and the
    // UI then shows no fill percentage rather than inventing one.
    const capacity = Number.parseFloat(max_stock_level);
    const capacityVal = Number.isFinite(capacity) && capacity > 0 ? capacity : null;
    const isActiveVal = is_active !== undefined ? (is_active ? 1 : 0) : 1;
    const resolvedUnit = category_id.toString() === '2' ? 'kg' : unit;
    const pricePerKg = category_id.toString() === '2' ? selling_price : null;
    const [result] = await db.query(
      'INSERT INTO products (vendor_id, name, description, cost_price, selling_price, unit, stock_quantity, category_id, image_url, is_active, price_per_kg, max_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [vendor_id, name, description, cost_price || 0, selling_price || 0, resolvedUnit, stock_quantity || 0, category_id, image_url || null, isActiveVal, pricePerKg, capacityVal]
    );
    const productId = result.insertId;
    // Auto-create inventory row synced to initial stock_quantity
    await db.query(
      'INSERT IGNORE INTO inventory (product_id, stock) VALUES (?, ?)',
      [productId, stock_quantity || 0]
    );
    return productId;
  }

  static async updateProduct(id, vendorId, productData) {
    const { name, description, cost_price, selling_price, unit, category_id, image_url, is_active } = productData;
    const stockValue = productData.stock_quantity ?? productData.stock;
    const isGasCategory = category_id !== undefined && category_id !== null && String(category_id) === '2';

    // Only update the fields that were actually provided — supports partial updates
    // (e.g. an is_active toggle) without nulling out untouched columns, and never
    // dereferences an undefined category_id.
    const sets = [];
    const params = [];
    const setField = (col, value) => { sets.push(`${col} = ?`); params.push(value); };

    if (productData.max_stock_level !== undefined) {
      const cap = Number.parseFloat(productData.max_stock_level);
      setField('max_stock_level', Number.isFinite(cap) && cap > 0 ? cap : null);
    }
    if (name !== undefined) setField('name', name);
    if (description !== undefined) setField('description', description);
    if (cost_price !== undefined) setField('cost_price', cost_price || 0);
    if (selling_price !== undefined) setField('selling_price', selling_price || 0);
    if (category_id !== undefined) {
      setField('category_id', category_id);
      setField('unit', isGasCategory ? 'kg' : (unit ?? null));
      setField('price_per_kg', isGasCategory ? (selling_price ?? null) : null);
    } else if (unit !== undefined) {
      setField('unit', unit);
    }

    if (isGasCategory && selling_price !== undefined) {
      try {
        const [rows] = await db.query('SELECT discount_percentage FROM products WHERE id = ?', [id]);
        if (rows.length > 0) {
          const discount = parseFloat(rows[0].discount_percentage || 0);
          if (discount > 0) {
            setField('offer_price_per_kg', selling_price - (selling_price * discount / 100));
          }
        }
      } catch (err) {
        console.error('Error checking discount for product update:', err);
      }
    }

    if (image_url) setField('image_url', image_url);
    if (is_active !== undefined) setField('is_active', is_active ? 1 : 0);

    if (stockValue !== undefined) {
      const normalizedStock = Number(stockValue);
      if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
        throw new Error('Stock must be zero or greater.');
      }
      setField('stock_quantity', normalizedStock);
    }

    if (sets.length === 0) return false; // nothing to update

    params.push(id, vendorId);
    const [result] = await db.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = ? AND vendor_id = ?`,
      params
    );
    if (result.affectedRows > 0 && stockValue !== undefined) {
      await db.query(
        `INSERT INTO inventory (product_id, stock)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE stock = VALUES(stock)`,
        [id, Number(stockValue)]
      );
    }
    return result.affectedRows > 0;
  }

  static async deleteProduct(id, vendorId) {
    // Step 1: verify the product exists and belongs to this vendor
    const [rows] = await db.query(
      'SELECT id FROM products WHERE id = ? AND vendor_id = ?',
      [id, vendorId]
    );
    if (rows.length === 0) return { status: 'not_found' };

    // Step 2: attempt hard delete (cascades to inventory via FK ON DELETE CASCADE)
    try {
      await db.query('DELETE FROM products WHERE id = ? AND vendor_id = ?', [id, vendorId]);
      return { status: 'deleted' };
    } catch (err) {
      // Foreign key constraint — product is referenced by purchases or orders
      if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
        await db.query('UPDATE products SET is_active = 0 WHERE id = ? AND vendor_id = ?', [id, vendorId]);
        return { status: 'archived' };
      }
      throw err; // re-throw unexpected errors
    }
  }

  static async getOrders(vendorId) {
    // Return ALL orders for this vendor — the payment-method filter previously
    // made online-paid orders invisible. The frontend renders all statuses and
    // lets the vendor filter if needed.
    const [rows] = await db.query(`
      SELECT
        o.id,
        o.customer_id,
        o.vendor_id,
        o.delivery_address,
        o.total_amount,
        o.status,
        o.payment_method,
        o.payment_status,
        o.delivery_fee,
        o.distance_km,
        o.delivery_otp,
        o.created_at,
        o.vendor_assigned_at,
        o.vendor_responded_at,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))), ''), u.username, u.phone, 'Guest') AS customer_name,
        u.phone                   AS customer_phone,
        u.email                   AS customer_email
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN users     u ON u.id = c.user_id
      WHERE o.vendor_id = ?
      ORDER BY o.created_at DESC
    `, [vendorId]);
    return rows;
  }

  static async getInventory(vendorId) {
    await VendorModel.migrateCarServiceProducts();
    const hasOffers = await VendorModel.tableExists('offers');

    // Expire any offers whose end_date has passed
    if (hasOffers) {
      await db.query(
        `UPDATE offers SET is_active = 0
         WHERE vendor_id = ? AND is_active = 1 AND end_date IS NOT NULL AND end_date < NOW()`,
        [vendorId]
      );
    }

    // Detect which discount column name the offers table actually has
    let discountCol = 'o.discount_value';
    let hasProductOffer = false;
    if (hasOffers) {
      const [colRows] = await db.query('SHOW COLUMNS FROM offers');
      const cols = new Set(colRows.map(c => c.Field));
      hasProductOffer = cols.has('product_id');
      if (cols.has('discount_percentage')) {
        discountCol = cols.has('discount_value')
          ? 'COALESCE(o.discount_percentage, o.discount_value)'
          : 'o.discount_percentage';
      }
    }

    // Build the JOIN: product-level if product_id column exists, otherwise vendor-level
    const offerJoin = hasOffers
      ? hasProductOffer
        ? `LEFT JOIN offers o ON o.product_id = p.id
               AND o.vendor_id = p.vendor_id
               AND o.is_active = 1
               AND (o.start_date IS NULL OR o.start_date <= NOW())
               AND (o.end_date   IS NULL OR o.end_date   >= NOW())`
        : `LEFT JOIN (
               SELECT id, vendor_id, title, description, discount_percentage,
                      start_date, end_date
               FROM offers
               WHERE vendor_id = ? AND is_active = 1
                 AND (start_date IS NULL OR start_date <= NOW())
                 AND (end_date   IS NULL OR end_date   >= NOW())
               ORDER BY id DESC LIMIT 1
             ) o ON o.vendor_id = p.vendor_id`
      : '';

    const offerCols = hasOffers
      ? `,
        o.id                                 AS offer_id,
        o.title                              AS offer_title,
        o.description                        AS offer_description,
        ${discountCol}                       AS discount_percent,
        CAST(p.selling_price AS FLOAT)       AS original_price,
        CASE
          WHEN o.id IS NOT NULL
          THEN ROUND(p.selling_price * (1 - IFNULL(${discountCol}, 0) / 100), 2)
          ELSE CAST(p.selling_price AS FLOAT)
        END                                  AS discounted_price,
        o.start_date                         AS offer_start_date,
        o.end_date                           AS offer_end_date,
        CASE
          WHEN o.id IS NULL                                        THEN 'none'
          WHEN o.end_date IS NULL                                  THEN 'Active'
          WHEN o.end_date < NOW()                                  THEN 'Expired'
          WHEN o.start_date IS NOT NULL AND o.start_date > NOW()   THEN 'Scheduled'
          ELSE 'Active'
        END                                  AS offer_status`
      : `,
        NULL   AS offer_id,
        NULL   AS offer_title,
        NULL   AS offer_description,
        0      AS discount_percent,
        CAST(p.selling_price AS FLOAT) AS original_price,
        CAST(p.selling_price AS FLOAT) AS discounted_price,
        NULL   AS offer_start_date,
        NULL   AS offer_end_date,
        'none' AS offer_status`;

    // When using vendor-level offer join (no product_id col), the subquery needs its own vendorId param
    const queryParams = (hasOffers && !hasProductOffer) ? [vendorId, vendorId] : [vendorId];

    const [rows] = await db.query(`
      SELECT
        p.id, p.name,
        CAST(IFNULL(i.stock, 0) AS FLOAT)        AS stock,
        p.unit,
        CAST(p.cost_price    AS FLOAT)            AS cost_price,
        CAST(p.selling_price AS FLOAT)            AS selling_price,
        CAST(IFNULL(p.reorder_level, 10) AS FLOAT) AS reorder_level,
        CAST(p.max_stock_level AS FLOAT)          AS max_stock_level,
        p.category_id,
        v.business_name                           AS company_name
        ${offerCols}
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN vendors v ON p.vendor_id = v.id
      ${offerJoin}
      WHERE p.vendor_id = ? AND p.is_active = 1
        AND (c.name IS NULL OR LOWER(TRIM(c.name)) NOT IN ('car wash', 'car service', 'car services'))
      ORDER BY p.name ASC
    `, queryParams);
    return rows;
  }

  static async createPurchase(vendorId, purchaseData) {
    const { product_id, quantity, supplier_id, cost_price, selling_price, notes, purchase_date } = purchaseData;
    const invoiceNumber = String(purchaseData.invoice_number || purchaseData.reference_number || '').trim() || null;
    const notesContent = notes ? String(notes).trim() : null;
    const pDate = purchase_date ? String(purchase_date).trim() : null;
    
    // Server-side recalculation for integrity
    const calcs = CalculationHelper.calculateProfit(quantity, cost_price, selling_price);
    
    const connection = await db.getConnection();
    try {
      await connection.query('ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100) NULL AFTER purchase_date');
      await connection.query('ALTER TABLE purchases ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER invoice_number');

      // Pre-check: Verify product belongs to vendor
      const [products] = await connection.query('SELECT id FROM products WHERE id = ? AND vendor_id = ?', [product_id, vendorId]);
      if (products.length === 0) {
        throw new Error('Product not found or does not belong to your account');
      }

      await connection.beginTransaction();

      // 1. Create Purchase Record
      const [pResult] = await connection.query(
        'INSERT INTO purchases (vendor_id, supplier_id, purchase_date, invoice_number, notes, total_amount, expected_revenue, expected_profit, payment_status) VALUES (?, ?, COALESCE(?, CURDATE()), ?, ?, ?, ?, ?, "paid")',
        [vendorId, supplier_id, pDate, invoiceNumber, notesContent, calcs.total_cost, calcs.expected_revenue, calcs.expected_profit]
      );
      const purchaseId = pResult.insertId;

      // 2. Create Purchase Item
      await connection.query(
        'INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, selling_price, subtotal, expected_revenue, expected_profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [purchaseId, product_id, quantity, calcs.cost_price, calcs.selling_price, calcs.total_cost, calcs.expected_revenue, calcs.expected_profit]
      );

      // 3. Update Inventory (Insert if new, update if exists)
      await connection.query(
        'INSERT INTO inventory (product_id, stock) VALUES (?, ?) ON DUPLICATE KEY UPDATE stock = stock + ?',
        [product_id, quantity, quantity]
      );

      // 4. Update Product prices in products table (keep stock_quantity in sync if still used)
      await connection.query(
        'UPDATE products SET cost_price = ?, selling_price = ?, stock_quantity = IFNULL(stock_quantity, 0) + ? WHERE id = ?',
        [calcs.cost_price, calcs.selling_price, quantity, product_id]
      );

      await connection.commit();
      
      // Get updated stock for response
      const [inv] = await connection.query('SELECT stock FROM inventory WHERE product_id = ?', [product_id]);
      calcs.updated_stock = inv[0] ? inv[0].stock : quantity;

      return calcs;
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('DB Transaction Error:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  static async acceptOrder(orderId, vendorId) {
    const [result] = await db.query(
      'UPDATE orders SET status = "accepted", vendor_responded_at = NOW() WHERE id = ? AND vendor_id = ? AND status IN ("pending", "pending_payment")',
      [orderId, vendorId]
    );
    return result.affectedRows > 0;
  }

  static async getVendorNotifications(vendorId) {
    const [rows] = await db.query(
      'SELECT * FROM vendor_notifications WHERE vendor_id = ? ORDER BY created_at DESC LIMIT 100',
      [vendorId]
    );
    return rows;
  }

  static async markVendorNotificationRead(vendorId, notificationId) {
    const [result] = await db.query(
      'UPDATE vendor_notifications SET is_read = 1 WHERE id = ? AND vendor_id = ?',
      [notificationId, vendorId]
    );
    return result.affectedRows > 0;
  }

  static async findByEmail(email) {
    await ensureVendorSchema();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const [rows] = await db.query(
      `SELECT v.*, u.email AS linked_user_email,
              u.password_hash AS linked_user_password, r.name AS linked_user_role
         FROM vendors v
         LEFT JOIN users u ON v.user_id = u.id
         LEFT JOIN roles r ON u.role_id = r.id
        WHERE LOWER(v.email) = ?
           OR (r.name = 'vendor' AND LOWER(u.email) = ?)
        ORDER BY CASE WHEN LOWER(v.email) = ? THEN 0 ELSE 1 END
        LIMIT 1`,
      [normalizedEmail, normalizedEmail, normalizedEmail]
    );

    const vendor = rows[0];
    if (!vendor) return undefined;

    if (!vendor.email && vendor.linked_user_role === 'vendor') {
      vendor.email = vendor.linked_user_email;
    }
    if (!vendor.password && vendor.linked_user_role === 'vendor') {
      vendor.password = vendor.linked_user_password;
    }
    delete vendor.linked_user_email;
    delete vendor.linked_user_password;
    delete vendor.linked_user_role;
    return vendor;
  }

  static async getProfile(vendorId) {
    await ensureVendorSchema();
    const [rows] = await db.query(
      `SELECT id, name, business_name, email, phone, contact_name, address,
              city, district, latitude, longitude, logo, logo_url, is_open,
              opening_time, closing_time, business_type, status, verification_status
              , nira_id, government_patent, passport_number,
              waafi_merchant_uid, waafi_api_user_id, waafi_enabled,
              CASE WHEN waafi_api_key IS NOT NULL AND waafi_api_key <> '' THEN 1 ELSE 0 END AS waafi_api_key_set,
              (SELECT GROUP_CONCAT(bt.name)
               FROM vendor_business_types vbt
               JOIN business_types bt ON vbt.business_type_id = bt.id
               WHERE vbt.vendor_id = vendors.id) AS business_types_raw
       FROM vendors
       WHERE id = ?`,
      [vendorId]
    );

    const vendor = rows[0];
    if (!vendor) return null;
    const logo = vendor.logo || vendor.logo_url || '';

    return {
      id: vendor.id,
      name: vendor.name || vendor.business_name || '',
      business_name: vendor.business_name || vendor.name || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      contact_name: vendor.contact_name || '',
      address: vendor.address || '',
      city: vendor.city || '',
      district: vendor.district || '',
      latitude: vendor.latitude || '',
      longitude: vendor.longitude || '',
      logo,
      logo_url: logo,
      is_open: Boolean(vendor.is_open),
      opening_time: vendor.opening_time || '06:00',
      closing_time: vendor.closing_time || '23:00',
      business_type: vendor.business_type || '',
      status: vendor.status || 'active',
      verification_status: vendor.verification_status || 'pending',
      nira_id: vendor.nira_id || '',
      government_patent: vendor.government_patent || '',
      passport_number: vendor.passport_number || '',
      waafi_merchant_uid: vendor.waafi_merchant_uid || '',
      waafi_api_user_id: vendor.waafi_api_user_id || '',
      waafi_api_key_set: Boolean(vendor.waafi_api_key_set),
      waafi_enabled: Boolean(vendor.waafi_enabled),
      business_types: vendor.business_types_raw ? vendor.business_types_raw.split(',') : (vendor.business_type ? [vendor.business_type] : []),
    };
  }

  static async ensureSettingsSchema() {
    if (VendorModel._settingsSchemaReady) return;

    await db.query(`
      CREATE TABLE IF NOT EXISTS vendor_settings (
        vendor_id INT NOT NULL PRIMARY KEY,
        email_notifications TINYINT(1) NOT NULL DEFAULT 1,
        order_alerts TINYINT(1) NOT NULL DEFAULT 1,
        delivery_alerts TINYINT(1) NOT NULL DEFAULT 1,
        inventory_alerts TINYINT(1) NOT NULL DEFAULT 1,
        promotion_alerts TINYINT(1) NOT NULL DEFAULT 1,
        security_alerts TINYINT(1) NOT NULL DEFAULT 1,
        two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    VendorModel._settingsSchemaReady = true;
  }

  static normalizeSettings(row = {}) {
    return {
      email_notifications: row.email_notifications !== 0,
      order_alerts: row.order_alerts !== 0,
      delivery_alerts: row.delivery_alerts !== 0,
      inventory_alerts: row.inventory_alerts !== 0,
      promotion_alerts: row.promotion_alerts !== 0,
      security_alerts: row.security_alerts !== 0,
      two_factor_enabled: row.two_factor_enabled === 1,
    };
  }

  static async getSettings(vendorId) {
    await VendorModel.ensureSettingsSchema();
    await db.query('INSERT IGNORE INTO vendor_settings (vendor_id) VALUES (?)', [vendorId]);
    const [rows] = await db.query('SELECT * FROM vendor_settings WHERE vendor_id = ?', [vendorId]);
    return VendorModel.normalizeSettings(rows[0] || {});
  }

  static async updateSettings(vendorId, settings = {}) {
    await VendorModel.ensureSettingsSchema();
    const current = await VendorModel.getSettings(vendorId);
    const merged = { ...current };
    const allowed = Object.keys(current);

    for (const key of allowed) {
      if (settings[key] !== undefined) {
        merged[key] = settings[key] === true || settings[key] === 1 || settings[key] === '1' || settings[key] === 'true';
      }
    }

    await db.query(
      `INSERT INTO vendor_settings
        (vendor_id, email_notifications, order_alerts, delivery_alerts, inventory_alerts,
         promotion_alerts, security_alerts, two_factor_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        email_notifications = VALUES(email_notifications),
        order_alerts = VALUES(order_alerts),
        delivery_alerts = VALUES(delivery_alerts),
        inventory_alerts = VALUES(inventory_alerts),
        promotion_alerts = VALUES(promotion_alerts),
        security_alerts = VALUES(security_alerts),
        two_factor_enabled = VALUES(two_factor_enabled)`,
      [
        vendorId,
        merged.email_notifications ? 1 : 0,
        merged.order_alerts ? 1 : 0,
        merged.delivery_alerts ? 1 : 0,
        merged.inventory_alerts ? 1 : 0,
        merged.promotion_alerts ? 1 : 0,
        merged.security_alerts ? 1 : 0,
        merged.two_factor_enabled ? 1 : 0,
      ]
    );

    return merged;
  }

  static async updatePassword(vendorId, currentPassword, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        'SELECT id, user_id, email, password FROM vendors WHERE id = ? FOR UPDATE',
        [vendorId]
      );
      const vendor = rows[0];
      if (!vendor) throw new Error('Vendor not found.');

      let vendorUser = null;
      if (vendor.user_id) {
        const [linkedUsers] = await connection.query(
          `SELECT u.id, u.email, u.password_hash
           FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE u.id = ? AND r.name = 'vendor'
           FOR UPDATE`,
          [vendor.user_id]
        );
        vendorUser = linkedUsers[0] || null;
      }

      if (!vendorUser && vendor.email) {
        const [matchingUsers] = await connection.query(
          `SELECT u.id, u.email, u.password_hash
           FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE LOWER(u.email) = LOWER(?)
             AND r.name = 'vendor'
             AND NOT EXISTS (
               SELECT 1 FROM vendors other
               WHERE other.user_id = u.id AND other.id <> ?
             )
           ORDER BY u.id
           LIMIT 1
           FOR UPDATE`,
          [vendor.email, vendorId]
        );
        vendorUser = matchingUsers[0] || null;
      }

      const matchesVendorPassword = await passwordMatches(currentPassword, vendor.password);
      const matchesVendorUser = matchesVendorPassword
        ? false
        : await passwordMatches(currentPassword, vendorUser?.password_hash);
      if (!matchesVendorPassword && !matchesVendorUser) {
        throw new Error('Current password is incorrect.');
      }

      await connection.query(
        'UPDATE vendors SET password = ? WHERE id = ?',
        [passwordHash, vendorId]
      );

      if (vendorUser) {
        const [userUpdate] = await connection.query(
          `UPDATE users u
           JOIN roles r ON r.id = u.role_id
           SET u.password_hash = ?, u.must_change_password = 0, u.password_changed_at = NOW()
           WHERE u.id = ? AND r.name = 'vendor'`,
          [passwordHash, vendorUser.id]
        );
        if (userUpdate.affectedRows !== 1) {
          throw new Error('Vendor user password synchronization failed.');
        }
        if (Number(vendor.user_id) !== Number(vendorUser.id)) {
          await connection.query(
            'UPDATE vendors SET user_id = ? WHERE id = ?',
            [vendorUser.id, vendorId]
          );
        }
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async registerVendor(vendorData) {
    await ensureVendorSchema();
    const {
      name,
      email,
      password,
      phone,
      contact_name,
      address,
      business_types,
      nira_id,
      government_patent,
      passport_number,
      waafi_merchant_uid,
      waafi_api_user_id,
      waafi_api_key,
      waafi_enabled,
      verification_status,
    } = vendorData;
    let primary_type = null;
    if (business_types && business_types.length > 0) {
      primary_type = business_types[0];
    }
    
    const [result] = await db.query(
      `INSERT INTO vendors
        (name, business_name, email, password, phone, contact_name, address, business_type,
         nira_id, government_patent, passport_number,
         waafi_merchant_uid, waafi_api_user_id, waafi_api_key, waafi_enabled,
         verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        name,
        email,
        password,
        phone,
        contact_name,
        address,
        primary_type,
        nira_id || null,
        government_patent || null,
        passport_number || null,
        String(waafi_merchant_uid || '').trim() || null,
        String(waafi_api_user_id || '').trim() || null,
        encryptCredential(waafi_api_key),
        waafi_enabled ? 1 : 0,
        verification_status || 'pending',
      ]
    );
    const vendorId = result.insertId;

    if (business_types && Array.isArray(business_types)) {
      for (const type of business_types) {
        const [btRows] = await db.query('SELECT id FROM business_types WHERE name = ?', [type]);
        if (btRows.length > 0) {
          await db.query('INSERT IGNORE INTO vendor_business_types (vendor_id, business_type_id) VALUES (?, ?)', [vendorId, btRows[0].id]);
        }
      }
    }
    
    return vendorId;
  }

  static async updateProfile(vendorId, profileData) {
    const {
      business_name,
      contact_name,
      address,
      city,
      district,
      phone,
      business_type,
      latitude,
      longitude,
      logo_url,
      logo,
      is_open,
      opening_time,
      closing_time,
      waafi_merchant_uid,
      waafi_api_user_id,
      waafi_api_key,
      waafi_enabled,
    } = profileData;
    
    let query = 'UPDATE vendors SET contact_name = ?, address = ?, latitude = ?, longitude = ?';
    let params = [
      contact_name ?? null,
      address ?? null,
      latitude === '' || latitude === undefined ? null : latitude,
      longitude === '' || longitude === undefined ? null : longitude
    ];

    if (business_name !== undefined) {
      query += ', business_name = ?, name = ?';
      params.push(business_name, business_name);
    }
    if (phone !== undefined) {
      query += ', phone = ?';
      params.push(phone);
    }
    if (business_type !== undefined) {
      query += ', business_type = ?';
      params.push(business_type);
    }
    if (city !== undefined) {
      query += ', city = ?';
      params.push(city);
    }
    if (district !== undefined) {
      query += ', district = ?';
      params.push(district);
    }
    if (logo_url !== undefined || logo !== undefined) {
      const effectiveLogo = logo_url || logo || '';
      query += ', logo_url = ?, logo = ?';
      params.push(effectiveLogo, effectiveLogo);
    }
    if (is_open !== undefined) {
      query += ', is_open = ?';
      params.push(is_open === 'false' || is_open === false || is_open === 0 ? 0 : 1);
    }
    if (opening_time !== undefined) {
      query += ', opening_time = ?';
      params.push(opening_time);
    }
    if (closing_time !== undefined) {
      query += ', closing_time = ?';
      params.push(closing_time);
    }
    if (waafi_merchant_uid !== undefined && String(waafi_merchant_uid).trim() !== '') {
      query += ', waafi_merchant_uid = ?';
      params.push(String(waafi_merchant_uid).trim());
    }
    if (waafi_api_user_id !== undefined && String(waafi_api_user_id).trim() !== '') {
      query += ', waafi_api_user_id = ?';
      params.push(String(waafi_api_user_id).trim());
    }
    if (waafi_api_key !== undefined && String(waafi_api_key).trim() !== '') {
      query += ', waafi_api_key = ?';
      params.push(encryptCredential(waafi_api_key));
    }
    if (waafi_enabled !== undefined) {
      const enabled = waafi_enabled === true || waafi_enabled === 1 || waafi_enabled === '1' || waafi_enabled === 'true';
      query += ', waafi_enabled = ?';
      params.push(enabled ? 1 : 0);
    }

    query += ' WHERE id = ?';
    params.push(vendorId);

    const [result] = await db.query(query, params);
    return result.affectedRows > 0;
  }

  static async getCategories() {
    await VendorModel.migrateCarServiceProducts();
    const [rows] = await db.query('SELECT * FROM categories');
    const unique = [];
    const seen = new Set();
    for (const cat of rows) {
      const norm = String(cat.name || '').trim().toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        unique.push(cat);
      }
    }
    return unique;
  }

  static async updateOrderStatus(orderId, vendorId, status) {
    if (status.toLowerCase() === 'delivered') {
      const [orderData] = await db.query('SELECT total_amount FROM orders WHERE id = ? AND vendor_id = ?', [orderId, vendorId]);
      if (orderData[0]) {
        const totalAmount = parseFloat(orderData[0].total_amount);
        const { commission, netAmount } = computeCommission(totalAmount);

        const [result] = await db.query(
          'UPDATE orders SET status = ?, admin_commission = ?, vendor_net_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND vendor_id = ?',
          [status, commission, netAmount, orderId, vendorId]
        );
        console.log(`[COMMISSION] Order #${orderId} marked as delivered by vendor. Total: ${totalAmount}, Commission: ${commission}, Net: ${netAmount}`);
        return result.affectedRows > 0;
      }
    }
    
    const [result] = await db.query(
      'UPDATE orders SET status = ? WHERE id = ? AND vendor_id = ?',
      [status, orderId, vendorId]
    );
    return result.affectedRows > 0;
  }

  static async ensureSupplierEmailSchema() {
    if (VendorModel._supplierEmailSchemaReady) return;

    try {
      const [columns] = await db.query("SHOW COLUMNS FROM suppliers LIKE 'email'");
      if (columns.length === 0) {
        await db.query('ALTER TABLE suppliers ADD COLUMN email VARCHAR(255) DEFAULT NULL AFTER business_name');
      }
    } catch (error) {
      console.warn('[SUPPLIERS] Could not ensure email column:', error.message);
    }

    VendorModel._supplierEmailSchemaReady = true;
  }

  static async ensureSupplierTypesSchema() {
    await VendorModel.ensureSupplierEmailSchema();
    if (VendorModel._supplierTypesSchemaReady) return;
    try {
      await db.query('ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_types TEXT DEFAULT NULL AFTER location');
    } catch (error) {
      console.warn('[SUPPLIERS] Could not add supplier_types column:', error.message);
    }
    VendorModel._supplierTypesSchemaReady = true;
  }

  static async ensureCategoryExists(categoryName) {
    const name = String(categoryName || '').trim();
    if (!name) return;

    const [existing] = await db.query(
      'SELECT id FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1',
      [name]
    );
    if (existing.length > 0) return;

    try {
      await db.query('INSERT INTO categories (name) VALUES (?)', [name]);
    } catch (error) {
      if (!String(error?.message || '').toLowerCase().includes('duplicate')) {
        throw error;
      }
    }
  }

  static async getSuppliers(vendorId) {
    await VendorModel.ensureSupplierTypesSchema();
    const [rows] = await db.query(
      `SELECT id, vendor_id, business_name, email, contact_person, location, phone, supplier_types, created_at
       FROM suppliers
       WHERE vendor_id = ?
       ORDER BY created_at DESC`,
      [vendorId]
    );
    return rows.map(r => {
      let types = [];
      if (r.supplier_types) {
        try {
          types = JSON.parse(r.supplier_types);
        } catch {
          types = String(r.supplier_types).split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      return { ...r, supplier_types: Array.isArray(types) ? types : [] };
    });
  }

  static async createSupplier(vendorId, supplierData) {
    await VendorModel.ensureSupplierTypesSchema();

    const {
      business_name,
      email,
      contact_person,
      location,
      phone,
      supplier_types
    } = supplierData;

    const supplierEmail = String(email || contact_person || '').trim();
    const typesArr = Array.isArray(supplier_types) ? supplier_types : [];

    if (![business_name, supplierEmail, location, phone].every((value) => String(value || '').trim())) {
      const error = new Error('Business name, supplier email, location, and phone number are required.');
      error.statusCode = 400;
      throw error;
    }

    if (typesArr.length === 0) {
      const error = new Error('Select at least one Supplier Type.');
      error.statusCode = 400;
      throw error;
    }

    const typesJson = JSON.stringify(typesArr);

    const [result] = await db.query(
      `INSERT INTO suppliers (vendor_id, business_name, email, contact_person, location, phone, supplier_types)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [vendorId, business_name.trim(), supplierEmail, supplierEmail, location.trim(), phone.trim(), typesJson]
    );
    return result.insertId;
  }

  static async updateSupplier(vendorId, supplierId, supplierData) {
    await VendorModel.ensureSupplierTypesSchema();

    const {
      business_name,
      email,
      contact_person,
      location,
      phone,
      supplier_types
    } = supplierData;

    const supplierEmail = String(email || contact_person || '').trim();
    const typesArr = Array.isArray(supplier_types) ? supplier_types : [];

    if (typesArr.length === 0) {
      const error = new Error('Select at least one Supplier Type.');
      error.statusCode = 400;
      throw error;
    }

    const typesJson = JSON.stringify(typesArr);

    const [result] = await db.query(
      `UPDATE suppliers
       SET business_name = ?, email = ?, contact_person = ?, location = ?, phone = ?, supplier_types = ?
       WHERE id = ? AND vendor_id = ?`,
      [business_name.trim(), supplierEmail, supplierEmail, location.trim(), phone.trim(), typesJson, supplierId, vendorId]
    );
    return result.affectedRows > 0;
  }

  static async deleteSupplier(vendorId, supplierId) {
    const [used] = await db.query(
      'SELECT id FROM purchases WHERE supplier_id = ? AND vendor_id = ? LIMIT 1',
      [supplierId, vendorId]
    );
    if (used.length > 0) {
      const error = new Error('Supplier has purchase history and cannot be deleted.');
      error.statusCode = 409;
      throw error;
    }
    const [result] = await db.query('DELETE FROM suppliers WHERE id = ? AND vendor_id = ?', [supplierId, vendorId]);
    return result.affectedRows > 0;
  }

  static async getPurchases(vendorId) {
    await VendorModel.ensureSupplierEmailSchema();
    await addColumn('purchases', 'invoice_number', 'VARCHAR(100) NULL AFTER purchase_date');
    const [rows] = await db.query(`
      SELECT
        p.*,
        prod.name as product_name,
        COALESCE(NULLIF(s.business_name, ''), NULLIF(s.email, ''), NULLIF(s.contact_person, ''), s.phone, CONCAT('Supplier #', s.id)) as supplier_name,
        COALESCE(NULLIF(s.email, ''), NULLIF(s.contact_person, ''), '') as supplier_email,
        s.phone as supplier_phone,
        pi.quantity as quantity,
        pi.unit_price as item_unit_price,
        pi.subtotal as item_subtotal
      FROM purchases p
      JOIN purchase_items pi ON p.id = pi.purchase_id
      JOIN products prod ON pi.product_id = prod.id
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.vendor_id = ?
      ORDER BY p.created_at DESC
    `, [vendorId]);
    return rows;
  }

  static async getStats(vendorId) {
    await VendorModel.ensureCategoryExists('Car Services');
    // 1. Total Sales (Sum of total_amount for delivered orders)
    // We use LOWER(status) to be case-insensitive just in case
    const [salesRow] = await db.query(
      'SELECT SUM(total_amount) as total_sales, SUM(admin_commission) as total_commission, SUM(vendor_net_amount) as total_net FROM orders WHERE vendor_id = ? AND LOWER(status) = "delivered"',
      [vendorId]
    );

    // 2. Stock metrics by category
    const [stockRows] = await db.query(`
      SELECT 
        p.category_id,
        SUM(i.stock) as total_stock
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.vendor_id = ? AND p.is_active = 1
      GROUP BY p.category_id
    `, [vendorId]);

    // 3. Order counts
    const [orderCounts] = await db.query(`
      SELECT 
        COUNT(CASE WHEN LOWER(status) = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN LOWER(status) IN ('assigned', 'accepted', 'picked_up', 'on_the_way', 'processing', 'in transit') THEN 1 END) as active_deliveries
      FROM orders
      WHERE vendor_id = ?
    `, [vendorId]);

    const [carWashRows] = await db.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN DATE(o.created_at) = CURDATE() THEN o.id END) AS car_wash_today_bookings,
        COUNT(DISTINCT CASE WHEN LOWER(o.status) IN ('pending', 'accepted', 'pending_driver_assignment', 'confirmed', 'assigned', 'on_the_way', 'on the way', 'processing', 'in transit', 'driver assigned') THEN o.id END) AS car_wash_active_bookings,
        COUNT(DISTINCT CASE WHEN LOWER(o.status) = 'delivered' THEN o.id END) AS car_wash_completed_bookings,
        COALESCE(SUM(CASE WHEN LOWER(o.status) = 'delivered' THEN o.total_amount ELSE 0 END), 0) AS car_wash_revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE o.vendor_id = ? AND LOWER(c.name) IN ('car wash', 'car services', 'car service')
    `, [vendorId]);

    const [carWashServicesRow] = await db.query(`
      SELECT COUNT(*) AS car_wash_services
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.vendor_id = ? AND p.is_active = 1 AND LOWER(c.name) IN ('car wash', 'car services', 'car service')
    `, [vendorId]);

    const fuel_stock = stockRows.find(r => Number(r.category_id) === 1)?.total_stock || 0;
    const gas_stock = stockRows.find(r => Number(r.category_id) === 2)?.total_stock || 0;
    const spare_parts_stock = stockRows.find(r => Number(r.category_id) === 3)?.total_stock || 0;
    const total_inventory = stockRows.reduce((sum, r) => sum + Number(r.total_stock || 0), 0);
    const car_wash_today_bookings = Number(carWashRows[0]?.car_wash_today_bookings || 0);
    const car_wash_active_bookings = Number(carWashRows[0]?.car_wash_active_bookings || 0);
    const car_wash_completed_bookings = Number(carWashRows[0]?.car_wash_completed_bookings || 0);
    const car_wash_revenue = parseFloat(carWashRows[0]?.car_wash_revenue || 0);
    const car_wash_services = Number(carWashServicesRow[0]?.car_wash_services || 0);

    const stats = {
      total_sales: parseFloat(salesRow[0].total_sales || 0),
      total_commission: parseFloat(salesRow[0].total_commission || 0),
      net_sales: parseFloat(salesRow[0].total_net || 0),
      fuel_stock: Math.round(fuel_stock),
      gas_stock: Math.round(gas_stock),
      spare_parts_stock: Math.round(spare_parts_stock),
      total_inventory: Math.round(total_inventory),
      pending_orders: orderCounts[0].pending_orders,
      active_deliveries: orderCounts[0].active_deliveries,
      car_wash_services: Math.round(car_wash_services),
      car_wash_today_bookings,
      car_wash_active_bookings,
      car_wash_completed_bookings,
      car_wash_revenue: Number(car_wash_revenue.toFixed(2))
    };

    return stats;
  }
  static async getSalesSummary(vendorId) {
    const [rows] = await db.query(`
      SELECT 
        SUM(total_amount) as gross_sales,
        SUM(admin_commission) as total_commission,
        SUM(vendor_net_amount) as net_sales,
        COUNT(*) as total_completed_orders
      FROM orders
      WHERE vendor_id = ? AND LOWER(status) = 'delivered'
    `, [vendorId]);
    return rows[0];
  }

  static async getCommissions(vendorId) {
    const [rows] = await db.query(`
      SELECT c.id, c.order_id, c.total_amount AS gross_amount,
             c.commission_amount AS admin_commission, c.vendor_net_amount,
             c.status, c.paid_at, c.created_at
      FROM commissions c
      WHERE c.vendor_id = ?
      ORDER BY c.created_at DESC
    `, [vendorId]);
    const summary = rows.reduce((result, row) => {
      const amount = Number(row.admin_commission || 0);
      result.total_commission_generated += amount;
      if (row.status === 'paid') result.commission_paid += amount;
      else result.commission_pending += amount;
      return result;
    }, { commission_paid: 0, commission_pending: 0, total_commission_generated: 0 });
    for (const key of Object.keys(summary)) summary[key] = Number(summary[key].toFixed(2));
    return { summary, commissions: rows };
  }

  static async getLpgMonitoring(vendorId) {
    const [rows] = await db.query(`
      SELECT p.id AS product_id, p.name, COALESCE(i.stock, p.stock_quantity, 0) AS liters_remaining,
             p.max_stock_level AS capacity_liters,
             COALESCE(p.reorder_level, 10) AS low_level_threshold,
             CASE WHEN COALESCE(i.stock, p.stock_quantity, 0) <= COALESCE(p.reorder_level, 10)
                  THEN 1 ELSE 0 END AS low_level_alarm
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.vendor_id = ?
        AND (LOWER(COALESCE(c.name, '')) LIKE '%gas%' OR LOWER(p.name) LIKE '%lpg%' OR LOWER(p.unit) IN ('liter', 'liters', 'l'))
      ORDER BY liters_remaining ASC
    `, [vendorId]);
    const [orders] = await db.query(`
      SELECT o.id AS order_id, o.customer_id, COALESCE(u.username, CONCAT(c.first_name, ' ', c.last_name), 'Customer') AS customer_name,
             o.status, SUM(oi.quantity) AS liters_ordered
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN users u ON u.id = c.user_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE o.vendor_id = ? AND LOWER(o.status) NOT IN ('delivered', 'cancelled')
        AND (LOWER(COALESCE(cat.name, '')) LIKE '%gas%' OR LOWER(p.name) LIKE '%lpg%' OR LOWER(p.unit) IN ('liter', 'liters', 'l'))
      GROUP BY o.id, o.customer_id, customer_name, o.status
      ORDER BY o.created_at DESC
    `, [vendorId]);
    const [customerLevels] = await db.query(`
      SELECT l.id, l.customer_id, l.product_id, l.remaining_liters, l.capacity_liters,
             l.low_level_threshold, l.source, l.recorded_at,
             CASE WHEN l.remaining_liters <= l.low_level_threshold THEN 1 ELSE 0 END AS low_level_alarm,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), u.username, 'Customer') AS customer_name,
             (
               SELECT o.status FROM orders o
               WHERE o.vendor_id = l.vendor_id AND o.customer_id = l.customer_id
                 AND LOWER(o.status) NOT IN ('delivered','cancelled')
               ORDER BY o.created_at DESC LIMIT 1
             ) AS order_status
      FROM customer_lpg_levels l
      JOIN customers c ON c.id = l.customer_id
      JOIN users u ON u.id = c.user_id
      WHERE l.vendor_id = ?
      ORDER BY l.remaining_liters ASC, l.recorded_at DESC
    `, [vendorId]);
    const [eligibleCustomers] = await db.query(`
      SELECT DISTINCT o.customer_id,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), u.username, 'Customer') AS customer_name
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN users u ON u.id = c.user_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE o.vendor_id = ?
        AND (LOWER(COALESCE(cat.name, '')) LIKE '%gas%' OR LOWER(p.name) LIKE '%lpg%' OR LOWER(p.unit) IN ('liter', 'liters', 'l'))
      ORDER BY customer_name
    `, [vendorId]);
    return { tanks: rows, orders, customer_levels: customerLevels, eligible_customers: eligibleCustomers };
  }

  static async updateCustomerLpgLevel(vendorId, customerId, data) {
    const remainingLiters = Number(data.remaining_liters);
    const capacityLiters = Number(data.capacity_liters || 50);
    const threshold = Number(data.low_level_threshold || 8);
    if (![remainingLiters, capacityLiters, threshold].every(Number.isFinite) || remainingLiters < 0 || capacityLiters <= 0 || remainingLiters > capacityLiters) {
      const error = new Error('LPG reading values are invalid.');
      error.statusCode = 400;
      throw error;
    }
    const [relationships] = await db.query(
      'SELECT id FROM orders WHERE vendor_id = ? AND customer_id = ? LIMIT 1',
      [vendorId, customerId]
    );
    if (relationships.length === 0) {
      const error = new Error('Customer has no order relationship with this vendor.');
      error.statusCode = 403;
      throw error;
    }
    const productId = data.product_id ? Number(data.product_id) : null;
    if (productId) {
      const [products] = await db.query('SELECT id FROM products WHERE id = ? AND vendor_id = ?', [productId, vendorId]);
      if (products.length === 0) {
        const error = new Error('LPG product does not belong to this vendor.');
        error.statusCode = 403;
        throw error;
      }
    }
    await db.query(
      `INSERT INTO customer_lpg_levels
        (vendor_id, customer_id, product_id, remaining_liters, capacity_liters, low_level_threshold, source, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE product_id = VALUES(product_id), remaining_liters = VALUES(remaining_liters),
         capacity_liters = VALUES(capacity_liters), low_level_threshold = VALUES(low_level_threshold),
         source = VALUES(source), recorded_at = NOW()`,
      [vendorId, customerId, productId, remainingLiters, capacityLiters, threshold, data.source || 'manual']
    );
    const [levels] = await db.query(
      `SELECT *, CASE WHEN remaining_liters <= low_level_threshold THEN 1 ELSE 0 END AS low_level_alarm
       FROM customer_lpg_levels WHERE vendor_id = ? AND customer_id = ?`,
      [vendorId, customerId]
    );
    return levels[0];
  }

  static async tableExists(tableName) {
    const [rows] = await db.query('SHOW TABLES LIKE ?', [tableName]);
    return rows.length > 0;
  }

  static buildReviewSummary(reviews) {
    const total = reviews.length;
    const distribution = [5, 4, 3, 2, 1].map((rating) => {
      const count = reviews.filter((review) => Number(review.rating) === rating).length;
      return {
        rating,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0
      };
    });

    const ratingTotal = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);

    return {
      average_rating: total > 0 ? Number((ratingTotal / total).toFixed(1)) : 0,
      total_reviews: total,
      distribution,
      positive_reviews: reviews.filter((review) => Number(review.rating) >= 4).length
    };
  }

  static async getReviews(vendorId) {
    const queries = [];

    if (await VendorModel.tableExists('reviews')) {
      queries.push(db.query(`
        SELECT
          r.id,
          r.order_id,
          r.customer_id,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
            u.username,
            'Customer'
          ) AS customer_name,
          r.rating,
          r.comment,
          r.created_at,
          'reviews' AS source
        FROM reviews r
        LEFT JOIN orders o ON r.order_id = o.id
        LEFT JOIN customers c ON r.customer_id = c.id
        LEFT JOIN users u ON c.user_id = u.id
        WHERE r.vendor_id = ? OR o.vendor_id = ?
      `, [vendorId, vendorId]));
    }

    if (await VendorModel.tableExists('vendor_reviews')) {
      queries.push(db.query(`
        SELECT
          id,
          order_id,
          NULL AS customer_id,
          customer_name,
          rating,
          comment,
          created_at,
          'vendor_reviews' AS source
        FROM vendor_reviews
        WHERE vendor_id = ?
      `, [vendorId]));
    }

    if (queries.length === 0) {
      return { summary: VendorModel.buildReviewSummary([]), reviews: [] };
    }

    const results = await Promise.all(queries);
    const reviews = results
      .flatMap(([rows]) => rows)
      .map((review) => ({
        ...review,
        rating: Number(review.rating || 0)
      }))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return {
      summary: VendorModel.buildReviewSummary(reviews),
      reviews
    };
  }

  static buildOfferSummary(offers) {
    const activeOffers = offers.filter((offer) => offer.status === 'Active');
    const totalDiscount = offers.reduce((sum, offer) => sum + Number(offer.discount_percentage || 0), 0);
    const totalRedeemed = offers.reduce((sum, offer) => sum + Number(offer.total_redeemed || 0), 0);

    return {
      total_offers: offers.length,
      active_offers: activeOffers.length,
      total_redeemed: totalRedeemed,
      average_discount: offers.length > 0 ? Number((totalDiscount / offers.length).toFixed(1)) : 0
    };
  }

  static async getOffers(vendorId) {
    const queries = [];

    if (await VendorModel.tableExists('offers')) {
      await db.query(`
        UPDATE offers
        SET is_active = 0
        WHERE vendor_id = ?
          AND is_active = 1
          AND end_date IS NOT NULL
          AND end_date < NOW()
      `, [vendorId]);
    }

    if (await VendorModel.tableExists('offers')) {
      const [columnRows] = await db.query('SHOW COLUMNS FROM offers');
      const columns = new Set(columnRows.map((column) => column.Field));
      const offerTypeSelect = columns.has('offer_type')
        ? 'offer_type'
        : "'percentage' AS offer_type";
      const discountValueSelect = columns.has('discount_value')
        ? 'discount_value'
        : 'discount_percentage AS discount_value';
      const discountPercentageSelect = columns.has('discount_percentage')
        ? 'discount_percentage'
        : 'discount_value AS discount_percentage';
      const productIdSelect = columns.has('product_id')
        ? 'product_id'
        : 'NULL AS product_id';

      queries.push(db.query(`
        SELECT
          id,
          title AS name,
          description,
          ${offerTypeSelect},
          ${discountValueSelect},
          ${discountPercentageSelect},
          ${productIdSelect},
          start_date,
          end_date,
          CASE
            WHEN is_active = 0 THEN 'Inactive'
            WHEN end_date IS NOT NULL AND end_date < NOW() THEN 'Expired'
            WHEN start_date IS NOT NULL AND start_date > NOW() THEN 'Scheduled'
            ELSE 'Active'
          END AS status,
          0 AS total_redeemed,
          created_at,
          'offers' AS source
        FROM offers
        WHERE vendor_id = ?
      `, [vendorId]));
    }

    if (await VendorModel.tableExists('vendor_offers')) {
      queries.push(db.query(`
        SELECT
          id,
          name,
          NULL AS description,
          discount_percentage,
          NULL AS start_date,
          NULL AS end_date,
          status,
          total_redeemed,
          created_at,
          'vendor_offers' AS source
        FROM vendor_offers
        WHERE vendor_id = ?
      `, [vendorId]));
    }

    if (queries.length === 0) {
      return { summary: VendorModel.buildOfferSummary([]), offers: [] };
    }

    const results = await Promise.all(queries);
    const offers = results
      .flatMap(([rows]) => rows)
      .map((offer) => ({
        ...offer,
        offer_type: offer.offer_type || 'percentage',
        discount_value: Number((offer.discount_value ?? offer.discount_percentage) || 0),
        discount_percentage: Number(offer.discount_percentage || (offer.offer_type === 'percentage' ? offer.discount_value || 0 : 0)),
        product_id: offer.product_id || null,
        total_redeemed: Number(offer.total_redeemed || 0)
      }))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    if (await VendorModel.tableExists('offer_analytics')) {
      const [analyticsRows] = await db.query(
        `SELECT
           offer_source,
           offer_id,
           SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
           SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks,
           SUM(CASE WHEN event_type = 'order' THEN 1 ELSE 0 END) AS orders_generated,
           COALESCE(SUM(CASE WHEN event_type = 'order' THEN revenue ELSE 0 END), 0) AS revenue_generated
         FROM offer_analytics
         WHERE vendor_id = ?
         GROUP BY offer_source, offer_id`,
        [vendorId]
      );
      const analyticsByOffer = new Map(
        analyticsRows.map((row) => [
          `${row.offer_source}:${row.offer_id}`,
          {
            views: Number(row.views || 0),
            clicks: Number(row.clicks || 0),
            orders_generated: Number(row.orders_generated || 0),
            revenue_generated: Number(row.revenue_generated || 0),
          },
        ])
      );

      for (const offer of offers) {
        const analytics = analyticsByOffer.get(`${offer.source}:${offer.id}`) || {};
        offer.views = analytics.views || 0;
        offer.clicks = analytics.clicks || 0;
        offer.orders_generated = analytics.orders_generated || 0;
        offer.revenue_generated = analytics.revenue_generated || 0;
      }
    }

    return {
      summary: VendorModel.buildOfferSummary(offers),
      offers
    };
  }

  static parseOfferProductId(offerData = {}) {
    const candidates = [
      offerData.product_id,
      offerData.productId,
      offerData.apply_to_product_id,
      Array.isArray(offerData.product_ids) ? offerData.product_ids[0] : null,
    ];

    for (const candidate of candidates) {
      const productId = Number(candidate);
      if (Number.isInteger(productId) && productId > 0) {
        return productId;
      }
    }

    return null;
  }

  static async requireVendorProduct(vendorId, productId) {
    if (!productId) {
      throw new Error('Please select one product for this offer.');
    }

    const [products] = await db.query(
      'SELECT id FROM products WHERE id = ? AND vendor_id = ? AND is_active = 1',
      [productId, vendorId]
    );

    if (products.length === 0) {
      throw new Error('Selected product does not belong to this vendor.');
    }
  }

  static async createOffer(vendorId, offerData) {
    const name = (offerData.name || offerData.title || '').trim();
    const description = (offerData.description || '').trim() || null;
    const discount = Number(offerData.discount_percentage);
    const startDate = offerData.start_date || null;
    const endDate = offerData.end_date || null;

    if (!name) {
      throw new Error('Offer name is required.');
    }

    if (!Number.isFinite(discount) || discount <= 0 || discount > 100) {
      throw new Error('Discount must be between 1 and 100 percent.');
    }

    const offerType = (offerData.offer_type || 'percentage').toString().trim();
    const discountValue = offerType === 'percentage' ? discount : Number(offerData.discount_value || discount);
    const productId = VendorModel.parseOfferProductId(offerData);
    await VendorModel.requireVendorProduct(vendorId, productId);

    if (await VendorModel.tableExists('offers')) {
      const [columnRows] = await db.query('SHOW COLUMNS FROM offers');
      const columns = new Set(columnRows.map((column) => column.Field));

      const hasOfferProducts = await VendorModel.tableExists('offer_products');
      if (!columns.has('product_id') && !hasOfferProducts) {
        throw new Error('Offers table cannot store product-specific offers.');
      }

      if (!columns.has('discount_percentage') && !columns.has('discount_value')) {
        throw new Error('Offers table is missing a discount column.');
      }

      const fields = ['vendor_id', 'title', 'description'];
      const values = [vendorId, name, description];

      if (columns.has('offer_type')) {
        fields.push('offer_type');
        values.push(offerType);
      }
      if (columns.has('discount_value')) {
        fields.push('discount_value');
        values.push(discountValue);
      }
      if (columns.has('discount_percentage')) {
        fields.push('discount_percentage');
        values.push(discount);
      }
      if (columns.has('product_id')) {
        fields.push('product_id');
        values.push(productId);
      }
      if (columns.has('start_date')) {
        fields.push('start_date');
        values.push(startDate);
      }
      if (columns.has('end_date')) {
        fields.push('end_date');
        values.push(endDate);
      }
      if (columns.has('is_active')) {
        fields.push('is_active');
        values.push(1);
      }

      const placeholders = fields.map(() => '?').join(', ');
      const [result] = await db.query(
        `INSERT INTO offers (${fields.join(', ')}) VALUES (${placeholders})`,
        values
      );

      const offerId = result.insertId;
      if (hasOfferProducts) {
        await db.query('INSERT IGNORE INTO offer_products (offer_id, product_id) VALUES (?, ?)', [offerId, productId]);
      }
      return offerId;
    }

    throw new Error('Product-specific offers table is not configured.');
  }

  static async updateOffer(vendorId, offerId, offerData) {
    const name        = (offerData.name || offerData.title || '').trim();
    const description = (offerData.description || '').trim() || null;
    const discount    = Number(offerData.discount_percentage);
    const startDate   = offerData.start_date || null;
    const endDate     = offerData.end_date   || null;
    const productId   = VendorModel.parseOfferProductId(offerData);
    const offerType   = (offerData.offer_type || 'percentage').toString().trim();
    const discountValue = offerType === 'percentage' ? discount : Number(offerData.discount_value || discount);
    const isActive    = offerData.is_active !== undefined ? (offerData.is_active ? 1 : 0) : 1;

    if (!name) throw new Error('Offer name is required.');
    if (!Number.isFinite(discount) || discount <= 0 || discount > 100)
      throw new Error('Discount must be between 1 and 100 percent.');
    await VendorModel.requireVendorProduct(vendorId, productId);

    if (await VendorModel.tableExists('offers')) {
      const [columnRows] = await db.query('SHOW COLUMNS FROM offers');
      const cols = new Set(columnRows.map(c => c.Field));

      let query, params;
      if (cols.has('offer_type') && cols.has('discount_value')) {
        const updates = ['title=?', 'description=?', 'offer_type=?', 'discount_value=?'];
        params = [name, description, offerType, discountValue];

        if (cols.has('discount_percentage')) {
          updates.push('discount_percentage=?');
          params.push(discount);
        }
        if (cols.has('product_id')) {
          updates.push('product_id=?');
          params.push(productId);
        }
        if (cols.has('start_date')) {
          updates.push('start_date=?');
          params.push(startDate);
        }
        if (cols.has('end_date')) {
          updates.push('end_date=?');
          params.push(endDate);
        }
        if (cols.has('is_active')) {
          updates.push('is_active=?');
          params.push(isActive);
        }

        query = `UPDATE offers SET ${updates.join(', ')} WHERE id=? AND vendor_id=?`;
        params.push(offerId, vendorId);
      } else {
        const updates = ['title=?', 'description=?', 'discount_percentage=?'];
        params = [name, description, discount];

        if (cols.has('product_id')) {
          updates.push('product_id=?');
          params.push(productId);
        }
        if (cols.has('start_date')) {
          updates.push('start_date=?');
          params.push(startDate);
        }
        if (cols.has('end_date')) {
          updates.push('end_date=?');
          params.push(endDate);
        }
        if (cols.has('is_active')) {
          updates.push('is_active=?');
          params.push(isActive);
        }

        query = `UPDATE offers SET ${updates.join(', ')} WHERE id=? AND vendor_id=?`;
        params.push(offerId, vendorId);
      }
      const [result] = await db.query(query, params);

      if (await VendorModel.tableExists('offer_products')) {
        await db.query('DELETE FROM offer_products WHERE offer_id = ?', [offerId]);
        await db.query('INSERT IGNORE INTO offer_products (offer_id, product_id) VALUES (?, ?)', [offerId, productId]);
      }
      return result.affectedRows > 0;
    }
    throw new Error('Offers table is not configured.');
  }

  static async deleteOffer(vendorId, offerId) {
    if (await VendorModel.tableExists('offers')) {
      const [existing] = await db.query(
        'SELECT id FROM offers WHERE id = ? AND vendor_id = ?', [offerId, vendorId]
      );
      if (existing.length === 0) return false;
      await db.query('DELETE FROM offers WHERE id = ? AND vendor_id = ?', [offerId, vendorId]);
      return true;
    }
    throw new Error('Offers table is not configured.');
  }
}

module.exports = VendorModel;
