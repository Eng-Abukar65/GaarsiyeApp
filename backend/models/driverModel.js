const db = require('../config/db');
const { computeCommission } = require('../config/commission');

const { addColumn } = require('../utils/schemaHelper');

let presenceSchemaPromise = null;
let deliveryOfferSchemaPromise = null;
let deliveryProofSchemaPromise = null;

class DriverModel {
  static async ensurePresenceSchema() {
    if (presenceSchemaPromise) return presenceSchemaPromise;
    presenceSchemaPromise = (async () => {
      try {
        const [columns] = await db.query("SHOW COLUMNS FROM drivers LIKE 'last_seen'");
        if (columns.length === 0) {
          await db.query('ALTER TABLE drivers ADD COLUMN last_seen TIMESTAMP NULL DEFAULT NULL');
        }
        await addColumn('drivers', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
        await addColumn('drivers', 'availability_status', "VARCHAR(40) NOT NULL DEFAULT 'available'");
        await addColumn('drivers', 'account_status', "VARCHAR(40) NOT NULL DEFAULT 'approved'");
        await addColumn('drivers', 'current_order_id', 'INT NULL DEFAULT NULL');
        await addColumn('drivers', 'last_seen_at', 'TIMESTAMP NULL DEFAULT NULL');
        await db.query(`UPDATE drivers SET last_seen_at = last_seen
                        WHERE last_seen_at IS NULL AND last_seen IS NOT NULL`);
        await db.query(`UPDATE drivers
          SET availability_status = CASE
            WHEN status = 'busy' THEN 'busy'
            WHEN status = 'offline' THEN 'offline'
            ELSE 'available' END
          WHERE availability_status IS NULL OR availability_status = ''
             OR (availability_status = 'available' AND status IN ('busy', 'offline'))`);
        await db.query(`UPDATE drivers
          SET account_status = CASE
            WHEN verification_status = 'rejected' THEN 'rejected'
            WHEN verification_status = 'pending' THEN 'pending'
            ELSE 'approved' END
          WHERE account_status IS NULL OR account_status = ''
             OR (account_status = 'approved' AND verification_status IN ('pending', 'rejected'))`);
      } catch (error) {
        console.warn('[DRIVER PRESENCE] Could not ensure presence schema:', error.message);
        presenceSchemaPromise = null;
        throw error;
      }
    })();
    return presenceSchemaPromise;
  }

  static async ensureDeliveryOfferSchema() {
    if (deliveryOfferSchemaPromise) return deliveryOfferSchemaPromise;
    deliveryOfferSchemaPromise = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS delivery_offers (
        id INT NOT NULL AUTO_INCREMENT,
        order_id INT NOT NULL,
        driver_id INT NOT NULL,
        vendor_id INT NOT NULL,
        offered_amount DECIMAL(10,2) NOT NULL,
        status ENUM('pending','accepted','declined','expired','cancelled') NOT NULL DEFAULT 'pending',
        offered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_do_order (order_id),
        INDEX idx_do_driver (driver_id),
        INDEX idx_do_vendor (vendor_id),
        INDEX idx_do_status (status),
        INDEX idx_do_pending (order_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_earning DECIMAL(10,2) NULL`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_assignment_status VARCHAR(40) NULL`);
      await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_driver_id INT NULL`);
    })().catch((error) => {
      deliveryOfferSchemaPromise = null;
      throw error;
    });
    return deliveryOfferSchemaPromise;
  }

  static async ensureDeliveryProofSchema() {
    if (deliveryProofSchemaPromise) return deliveryProofSchemaPromise;
    deliveryProofSchemaPromise = (async () => {
      await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_proof_url VARCHAR(255) NULL`);
      await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_proof_uploaded_at TIMESTAMP NULL`);
      await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_proof_uploaded_by INT NULL`);
      await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_code_verified_at TIMESTAMP NULL`);
    })().catch((error) => {
      deliveryProofSchemaPromise = null;
      throw error;
    });
    return deliveryProofSchemaPromise;
  }

  static async markOnline(driverId) {
    await DriverModel.ensurePresenceSchema();
    await db.query(
      `UPDATE drivers
       SET is_online = 1,
           last_seen = NOW(),
           last_seen_at = NOW(),
           last_location_update = COALESCE(last_location_update, NOW()),
           status = CASE WHEN current_order_id IS NOT NULL THEN 'busy' ELSE 'available' END,
           availability_status = CASE WHEN current_order_id IS NOT NULL THEN 'busy' ELSE 'available' END
       WHERE id = ?`,
      [driverId]
    );
    await db.query(
      'UPDATE users SET is_online = 1, last_seen = NOW() WHERE id = (SELECT user_id FROM drivers WHERE id = ?)',
      [driverId]
    );
  }

  static async heartbeat(driverId) {
    await DriverModel.ensurePresenceSchema();
    await db.query(
      `UPDATE drivers
       SET is_online = 1,
           last_seen = NOW(),
           last_seen_at = NOW(),
           last_location_update = NOW(),
           status = CASE WHEN current_order_id IS NOT NULL THEN 'busy' ELSE 'available' END,
           availability_status = CASE WHEN current_order_id IS NOT NULL THEN 'busy' ELSE 'available' END
       WHERE id = ?`,
      [driverId]
    );
    await db.query(
      'UPDATE users SET is_online = 1, last_seen = NOW() WHERE id = (SELECT user_id FROM drivers WHERE id = ?)',
      [driverId]
    );
  }

  static async markOffline(driverId) {
    await DriverModel.ensurePresenceSchema();
    await db.query(
      `UPDATE drivers
       SET is_online = 0,
           status = 'offline',
           availability_status = 'offline',
           last_seen = NOW(),
           last_seen_at = NOW()
       WHERE id = ?`,
      [driverId]
    );
    await db.query(
      'UPDATE users SET is_online = 0, last_seen = NOW() WHERE id = (SELECT user_id FROM drivers WHERE id = ?)',
      [driverId]
    );
  }

  static async expireStaleDrivers() {
    await DriverModel.ensurePresenceSchema();
    const [candidates] = await db.query(`
      SELECT id, vendor_id
      FROM drivers
      WHERE is_online = 1
        AND (COALESCE(last_seen_at, last_seen) IS NULL
          OR COALESCE(last_seen_at, last_seen) < DATE_SUB(NOW(), INTERVAL 2 MINUTE))
    `);
    const expired = [];
    for (const driver of candidates) {
      const [result] = await db.query(`
        UPDATE drivers
        SET is_online = 0, status = 'offline', availability_status = 'offline'
        WHERE id = ? AND is_online = 1
          AND (COALESCE(last_seen_at, last_seen) IS NULL
            OR COALESCE(last_seen_at, last_seen) < DATE_SUB(NOW(), INTERVAL 2 MINUTE))
      `, [driver.id]);
      if (result.affectedRows > 0) {
        await db.query(`UPDATE users SET is_online = 0
                        WHERE id = (SELECT user_id FROM drivers WHERE id = ?)`, [driver.id]);
        expired.push(driver);
      }
    }
    return expired;
  }

  static async findByEmail(email) {
    const [rows] = await db.query(
      `SELECT u.*, u.password_hash as password, u.status AS user_status,
              d.id as driver_id, d.first_name, d.last_name, d.vehicle_type,
              d.is_online, d.vendor_id, d.profile_image,
              d.is_active AS driver_is_active, d.account_status, d.verification_status
       FROM users u 
       JOIN drivers d ON u.id = d.user_id 
       WHERE (u.email = ? OR u.username = ?) AND u.role_id = 3`,
      [email, email]
    );
    return rows[0];
  }

  static async createDriver(driverData) {
    const { 
      username, email, phone, password_hash, first_name, last_name, vehicle_type, plate_number, vendor_id,
      address, dob, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone,
      sponsor_name, sponsor_phone, sponsor_address
    } = driverData;
    
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [existingUsers] = await connection.query(
        `SELECT u.id, u.email, u.role_id, r.name AS role_name, d.id AS driver_id, d.vendor_id
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         LEFT JOIN drivers d ON d.user_id = u.id
         WHERE LOWER(u.email) = LOWER(?)
         LIMIT 1`,
        [email]
      );


      const normalizedPlate = String(plate_number || '').trim().toUpperCase();
      const [existingPlate] = await connection.query(
        'SELECT id FROM drivers WHERE UPPER(TRIM(COALESCE(plate_number, license_number, \'\'))) = ? LIMIT 1',
        [normalizedPlate]
      );
      if (existingPlate.length > 0) {
        const err = new Error('This plate number is already assigned to another driver.');
        err.statusCode = 409;
        throw err;
      }
      let userId;
      if (existingUsers.length > 0) {
        const existingUser = existingUsers[0];
        if (existingUser.role_name !== 'driver') {
          const err = new Error(`Email ${email} is already registered as ${existingUser.role_name || 'another user type'}. Use a different email for this driver.`);
          err.statusCode = 409;
          throw err;
        }
        if (existingUser.driver_id) {
          const err = new Error(
            Number(existingUser.vendor_id) === Number(vendor_id)
              ? `This driver is already onboarded for your vendor account.`
              : `This driver email already belongs to another vendor.`
          );
          err.statusCode = 409;
          throw err;
        }
        userId = existingUser.id;
        await connection.query(
          `UPDATE users
           SET username = ?, phone = ?, password_hash = ?, status = 'active', must_change_password = 1
           WHERE id = ?`,
          [username || email, phone, password_hash, userId]
        );
      } else {
        const [uResult] = await connection.query(
          'INSERT INTO users (username, email, phone, password_hash, role_id, status, must_change_password) VALUES (?, ?, ?, ?, 3, "active", 1)',
          [username || email, email, phone, password_hash]
        );
        userId = uResult.insertId;
      }

      // 2. Create Driver
      const [dResult] = await connection.query(
        `INSERT INTO drivers (
          user_id, first_name, last_name, vehicle_type, license_number, vendor_id, 
          verification_status, is_online, address, dob, emergency_contact_name, 
          emergency_contact_phone, guardian_name, guardian_phone, guarantor_name, 
          guarantor_phone, guarantor_address
        ) VALUES (?, ?, ?, ?, ?, ?, "verified", 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, first_name, last_name, vehicle_type, plate_number, vendor_id,
          address || null, dob || null, emergency_contact_name || null,
          emergency_contact_phone || null, guardian_name || null, guardian_phone || null,
          sponsor_name || null, sponsor_phone || null, sponsor_address || null
        ]
      );

      await connection.commit();
      return dResult.insertId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateDriver(driverId, vendorId, driverData) {
    const {
      username, email, phone, first_name, last_name, vehicle_type, plate_number,
      address, dob, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone,
      sponsor_name, sponsor_phone, sponsor_address, password_hash
    } = driverData;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [drivers] = await connection.query(
        `SELECT d.id, d.user_id, d.vendor_id
         FROM drivers d
         WHERE d.id = ? AND (d.vendor_id = ? OR d.vendor_id IS NULL)
         LIMIT 1`,
        [driverId, vendorId]
      );
      if (drivers.length === 0) {
        const err = new Error('Driver not found for this vendor.');
        err.statusCode = 404;
        throw err;
      }

      const driver = drivers[0];
      const normalizedPlate = String(plate_number || '').trim().toUpperCase();
      const [existingPlate] = await connection.query(
        'SELECT id FROM drivers WHERE UPPER(TRIM(COALESCE(plate_number, license_number, \'\'))) = ? AND id <> ? LIMIT 1',
        [normalizedPlate, driverId]
      );
      if (existingPlate.length > 0) {
        const err = new Error('This plate number is already assigned to another driver.');
        err.statusCode = 409;
        throw err;
      }
      if (email) {
        const [existingEmail] = await connection.query(
          'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1',
          [email, driver.user_id]
        );
        if (existingEmail.length > 0) {
          const err = new Error(`Email ${email} is already registered. Use a different email for this driver.`);
          err.statusCode = 409;
          throw err;
        }
      }

      await connection.query(
        `UPDATE users
         SET username = ?, email = ?, phone = ?, updated_at = NOW()
         WHERE id = ?`,
        [username || email, email, phone, driver.user_id]
      );

      if (password_hash) {
        await connection.query(
          `UPDATE users
           SET password_hash = ?, must_change_password = 1, updated_at = NOW()
           WHERE id = ?`,
          [password_hash, driver.user_id]
        );
      }

      await connection.query(
        `UPDATE drivers
         SET first_name = ?, last_name = ?, vehicle_type = ?, license_number = ?,
             plate_number = ?, vendor_id = ?, address = ?, dob = ?,
             emergency_contact_name = ?, emergency_contact_phone = ?,
             guardian_name = ?, guardian_phone = ?,
             guarantor_name = ?, guarantor_phone = ?, guarantor_address = ?
         WHERE id = ?`,
        [
          first_name, last_name, vehicle_type, plate_number,
          plate_number, vendorId, address || null, dob || null,
          emergency_contact_name || null, emergency_contact_phone || null,
          guardian_name || null, guardian_phone || null,
          sponsor_name || null, sponsor_phone || null, sponsor_address || null,
          driverId
        ]
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findById(id) {
    const [rows] = await db.query(
      `SELECT d.*, u.email, u.phone, u.username 
       FROM drivers d 
       JOIN users u ON d.user_id = u.id 
       WHERE d.id = ?`,
      [id]
    );
    return rows[0];
  }

  static async getDashboardStats(driverId) {
    const [rows] = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM deliveries WHERE driver_id = ?) as total_deliveries,
        (SELECT COUNT(*) FROM deliveries WHERE driver_id = ? AND status IN ('assigned', 'accepted', 'picked_up', 'on_the_way')) as active_deliveries,
        (SELECT COUNT(*) FROM deliveries WHERE driver_id = ? AND status = 'delivered') as completed_deliveries,
        (SELECT COUNT(*) FROM deliveries WHERE driver_id = ? AND status = 'failed') as failed_deliveries`,
      [driverId, driverId, driverId, driverId]
    );
    return rows[0];
  }

  static async getDeliveries(driverId) {
    const [rows] = await db.query(
      `SELECT d.*, o.total_amount, o.status as order_status, 
              COALESCE(CONCAT(c.first_name, ' ', c.last_name), u_cust.username, 'Unknown Customer') as customer_name,
              COALESCE(u_cust.phone, 'No phone') as customer_phone,
              COALESCE(v.business_name, v.name, 'Unknown Vendor') as vendor_name, 
              COALESCE(v.address, 'Main Station, Mogadishu') as vendor_address
       FROM deliveries d
       JOIN orders o ON d.order_id = o.id
       JOIN customers c ON o.customer_id = c.id
       JOIN users u_cust ON c.user_id = u_cust.id
       JOIN vendors v ON o.vendor_id = v.id
       WHERE d.driver_id = ?
       ORDER BY d.created_at DESC`,
      [driverId]
    );
    return rows;
  }

  static async getDeliveryById(deliveryId) {
    const [rows] = await db.query(
      `SELECT d.*, o.total_amount, o.status as order_status, o.payment_method, o.created_at as order_date,
              COALESCE(c.first_name, u.username, 'Unknown Customer') as customer_first_name, 
              COALESCE(c.last_name, '') as customer_last_name,
              COALESCE(a.phone, u.phone, 'No phone') as customer_phone, u.email as customer_email,
              COALESCE(a.address_line, od.address_line, o.delivery_address, cl.address, 'No address') as address_line,
              COALESCE(a.latitude, od.latitude, cl.latitude) as customer_latitude,
              COALESCE(a.longitude, od.longitude, cl.longitude) as customer_longitude,
              a.label as address_label, o.distance_km, o.delivery_fee,
              d.assigned_at, d.responded_at, d.rejection_reason,
              d.delivery_code_verified_at, d.proof_image_url, d.delivery_proof_url, d.delivery_proof_uploaded_at,
              COALESCE(v.business_name, v.name, 'Unknown Vendor') as vendor_name, 
              COALESCE(v.address, 'Main Station, Mogadishu') as vendor_address, 
              v.phone as vendor_phone, v.latitude as vendor_latitude, v.longitude as vendor_longitude,
              COALESCE(dl.latitude, dr.current_latitude, dr.current_lat) as driver_latitude,
              COALESCE(dl.longitude, dr.current_longitude, dr.current_lng) as driver_longitude,
              COALESCE(dl.heading, dr.heading) as driver_heading,
              COALESCE(dl.speed, dr.speed) as driver_speed,
              COALESCE(dl.updated_at, dr.last_location_update) as last_location_update
       FROM deliveries d
       JOIN orders o ON d.order_id = o.id
       JOIN customers c ON o.customer_id = c.id
       JOIN users u ON c.user_id = u.id
       LEFT JOIN addresses a ON o.address_id = a.id
       LEFT JOIN order_destinations od ON od.order_id = o.id AND od.sequence_no = 1
       LEFT JOIN customer_locations cl ON cl.customer_id = c.id AND cl.is_default = 1
       JOIN vendors v ON o.vendor_id = v.id
       LEFT JOIN drivers dr ON d.driver_id = dr.id
       LEFT JOIN driver_locations dl ON dl.driver_id = dr.id
       WHERE d.id = ?`,
      [deliveryId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];

    // Fetch order items
    const [items] = await db.query(
      `SELECT oi.*, p.name as product_name, p.unit 
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [row.order_id]
    );
    const [destinations] = await db.query(
      `SELECT id, address_line, phone, latitude, longitude, sequence_no, status
       FROM order_destinations WHERE order_id = ? ORDER BY sequence_no`,
      [row.order_id]
    );

    return {
      id: row.id,
      order_id: row.order_id,
      items: items,
      destinations,
      customer: {
        name: `${row.customer_first_name} ${row.customer_last_name}`.trim(),
        phone: row.customer_phone,
        address: row.address_line,
        latitude: row.customer_latitude,
        longitude: row.customer_longitude
      },
      vendor: {
        name: row.vendor_name,
        address: row.vendor_address,
        latitude: row.vendor_latitude,
        longitude: row.vendor_longitude
      },
      delivery: {
        status: row.status,
        assigned_at: row.assigned_at,
        responded_at: row.responded_at,
        rejection_reason: row.rejection_reason,
        delivery_code_verified_at: row.delivery_code_verified_at,
        delivery_code_verified: Boolean(row.delivery_code_verified_at),
        proof_image_url: row.delivery_proof_url || row.proof_image_url,
        delivery_proof_url: row.delivery_proof_url || row.proof_image_url,
        delivery_proof_uploaded_at: row.delivery_proof_uploaded_at,
        distance_km: row.distance_km,
        delivery_fee: row.delivery_fee,
        driver_latitude: row.driver_latitude,
        driver_longitude: row.driver_longitude,
        driver_heading: row.driver_heading,
        driver_speed: row.driver_speed,
        last_location_update: row.last_location_update
      }
    };
  }

  static async updateStatus(deliveryId, status, rejectionReason = null) {
    // Update delivery status
    let query = 'UPDATE deliveries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    if (status === 'picked_up') {
      query = 'UPDATE deliveries SET status = ?, picked_up_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    }
    if (status === 'arrived') {
      query = 'UPDATE deliveries SET status = ?, arrived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    }
    if (status === 'delivered') {
      query = 'UPDATE deliveries SET status = ?, delivered_at = CURRENT_TIMESTAMP, delivery_code_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    }
    if (status === 'accepted') {
      query = 'UPDATE deliveries SET status = ?, responded_at = CURRENT_TIMESTAMP, rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      await db.query(query, [status, deliveryId]);
    } else if (status === 'rejected') {
      query = 'UPDATE deliveries SET status = ?, responded_at = CURRENT_TIMESTAMP, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      await db.query(query, [status, rejectionReason, deliveryId]);

      // Save details to delivery_rejections table for auditing history
      try {
        const [deliveryRows] = await db.query('SELECT order_id, driver_id FROM deliveries WHERE id = ?', [deliveryId]);
        if (deliveryRows.length > 0) {
          const { order_id, driver_id } = deliveryRows[0];
          await db.query(
            'INSERT INTO delivery_rejections (delivery_id, order_id, driver_id, rejection_reason, rejected_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [deliveryId, order_id, driver_id, rejectionReason || 'No reason provided']
          );
        }
      } catch (err) {
        console.error('[DATABASE ERROR] Failed to log delivery rejection to history:', err);
      }
    } else {
      await db.query(query, [status, deliveryId]);
    }

    // Sync with order status
    let orderStatus = 'accepted';
    if (status === 'picked_up') orderStatus = 'on the way';
    if (status === 'on_the_way') orderStatus = 'on the way';
    if (status === 'arrived') orderStatus = 'on the way';
    if (status === 'delivered') orderStatus = 'delivered';
    if (status === 'failed') orderStatus = 'cancelled';
    if (status === 'rejected') orderStatus = 'pending_driver_assignment';
    
    const [delivery] = await db.query('SELECT order_id, driver_id, payout FROM deliveries WHERE id = ?', [deliveryId]);
    if (delivery[0]) {
      const orderId = delivery[0].order_id;
      
      if (orderStatus === 'delivered') {
        // Release the assignment without forcing an offline driver back online.
        await DriverModel.releaseDriverFromOrder(delivery[0].driver_id, orderId);

        // Calculate commission
        const [orderData] = await db.query('SELECT total_amount, vendor_id FROM orders WHERE id = ?', [orderId]);
        if (orderData[0]) {
          const totalAmount = parseFloat(orderData[0].total_amount);
          const vendorId = orderData[0].vendor_id;
          const { commission, netAmount, percent } = computeCommission(totalAmount);

          // Update Order
          await db.query(
            'UPDATE orders SET status = ?, admin_commission = ?, vendor_net_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [orderStatus, commission, netAmount, orderId]
          );

          // Insert into Commissions table
          const [commissionUpdate] = await db.query(
            `UPDATE commissions SET total_amount = ?, commission_rate = ?,
             commission_amount = ?, vendor_net_amount = ? WHERE order_id = ?`,
            [totalAmount, percent, commission, netAmount, orderId]
          );
          if (commissionUpdate.affectedRows === 0) {
            await db.query(
              `INSERT INTO commissions (order_id, vendor_id, total_amount, commission_rate, commission_amount, vendor_net_amount)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [orderId, vendorId, totalAmount, percent, commission, netAmount]
            );
          }
          
          // Driver Earnings
          const deliveryFee = parseFloat(delivery[0].payout) || 0;
          if (deliveryFee > 0) {
            await db.query(
              'INSERT INTO driver_transactions (driver_id, delivery_id, type, amount, description, status) VALUES (?, ?, "earning", ?, "Delivery fee earned", "completed")',
              [delivery[0].driver_id, deliveryId, deliveryFee]
            );
            await db.query(
              'UPDATE drivers SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?',
              [deliveryFee, delivery[0].driver_id]
            );
          }

          console.log(`[DELIVERY SUCCESS] Order #${orderId} delivered. Total: ${totalAmount}, Commission: ${commission}, Net: ${netAmount}, Driver Earning: ${deliveryFee}`);
        }
      } else {
        if (status === 'rejected') {
          await DriverModel.releaseDriverFromOrder(delivery[0].driver_id, orderId);
          await db.query(`UPDATE orders
                          SET driver_id = NULL, assigned_driver_id = NULL,
                              driver_assignment_status = NULL WHERE id = ?`, [orderId]);
        } else if (status === 'failed') {
          await DriverModel.releaseDriverFromOrder(delivery[0].driver_id, orderId);
        }
        await db.query(
          'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [orderStatus, orderId]
        );
      }
    }
  }

  static async updateOnlineStatus(driverId, isOnline) {
    if (isOnline) {
      await DriverModel.markOnline(driverId);
    } else {
      await DriverModel.markOffline(driverId);
    }
  }

  /**
   * Returns ALL drivers for fleet management (no status filtering).
   * Used by GET /vendor/drivers for the Delivery Personnel page.
   */
  static async getAllDrivers(vendorId = null) {
    await DriverModel.ensurePresenceSchema();

    await DriverModel.expireStaleDrivers();

    let query = `
      SELECT d.id,
             CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, '')) AS full_name,
             d.first_name, d.last_name, d.vehicle_type, d.plate_number, d.license_number, d.address,
             DATE_FORMAT(d.dob, '%Y-%m-%d') AS dob, DATE_FORMAT(d.dob, '%Y-%m-%d') AS date_of_birth,
             d.emergency_contact_name, d.emergency_contact_phone, d.guardian_name, d.guardian_phone,
             d.guarantor_name, d.guarantor_phone, d.guarantor_address,
             d.rating, d.total_deliveries, d.wallet_balance,
             d.is_online, d.status,
             COALESCE(d.availability_status, d.status) AS availability_status,
             COALESCE(d.account_status, IF(d.verification_status='verified','approved','pending')) AS account_status,
             d.verification_status, d.profile_picture, d.profile_image,
             d.current_order_id, d.vendor_id,
             COALESCE(d.last_seen_at, d.last_seen) AS last_seen_at,
             u.email, u.phone, u.username, u.status AS user_status
      FROM drivers d
      LEFT JOIN users u ON d.user_id = u.id
    `;
    const params = [];
    if (vendorId) {
      query += ' WHERE (d.vendor_id = ? OR d.vendor_id IS NULL)';
      params.push(vendorId);
    }
    query += ' ORDER BY d.is_online DESC, d.first_name ASC';
    const [rows] = await db.query(query, params);
    return rows;
  }

  static async getAllAvailableDrivers(vendorId = null) {
    await DriverModel.ensurePresenceSchema();

    await DriverModel.expireStaleDrivers();

    // Return only truly online, available, unassigned drivers with recent heartbeat
    let query = `
      SELECT d.id,
             CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, '')) AS full_name,
             d.first_name,
             d.last_name,
             d.vehicle_type,
             u.phone,
             u.email,
             d.is_online,
             COALESCE(d.availability_status, d.status) AS availability_status,
             d.account_status,
             COALESCE(d.last_seen_at, d.last_seen) AS last_seen_at,
             d.vendor_id
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      WHERE d.is_active = 1
        AND u.status = 'active'
        AND d.is_online = 1
        AND COALESCE(d.availability_status, d.status) = 'available'
        AND d.account_status = 'approved'
        AND d.verification_status = 'verified'
        AND d.current_order_id IS NULL
        AND (COALESCE(d.last_seen_at, d.last_seen) IS NOT NULL
             AND COALESCE(d.last_seen_at, d.last_seen) >= DATE_SUB(NOW(), INTERVAL 2 MINUTE))
    `;
    const params = [];
    if (vendorId) {
      query += ' AND d.vendor_id = ?';
      params.push(vendorId);
    }
    query += ' ORDER BY COALESCE(d.last_seen_at, d.last_seen) DESC, d.first_name ASC';
    const [rows] = await db.query(query, params);
    return rows;
  }
  
  static async assignDriverToOrder(orderId, driverId, vendorId) {
    await DriverModel.ensurePresenceSchema();
    await DriverModel.ensureDeliveryOfferSchema();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [orders] = await connection.query(
        'SELECT id FROM orders WHERE id = ? AND vendor_id = ? FOR UPDATE',
        [orderId, vendorId],
      );
      if (orders.length === 0) {
        throw Object.assign(new Error('Order not found for this vendor.'), { statusCode: 404 });
      }
      const [drivers] = await connection.query(`
        SELECT d.id FROM drivers d JOIN users u ON u.id = d.user_id
        WHERE d.id = ? AND d.vendor_id = ?
          AND d.is_active = 1 AND u.status = 'active'
          AND d.account_status = 'approved' AND d.verification_status = 'verified'
          AND d.is_online = 1 AND d.availability_status = 'available'
          AND d.current_order_id IS NULL
          AND COALESCE(d.last_seen_at, d.last_seen) >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
        FOR UPDATE
      `, [driverId, vendorId]);
      if (drivers.length === 0) {
        throw Object.assign(
          new Error('This driver is no longer online or available. Please select another driver.'),
          { statusCode: 409 },
        );
      }
      const [existing] = await connection.query('SELECT id FROM deliveries WHERE order_id = ?', [orderId]);
      if (existing.length > 0) {
        await connection.query(`UPDATE deliveries SET driver_id = ?, status = 'assigned',
          assigned_at = CURRENT_TIMESTAMP, responded_at = NULL, rejection_reason = NULL,
          response_reminder_sent_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
        [driverId, orderId]);
      } else {
        await connection.query(`INSERT INTO deliveries
          (order_id, driver_id, status, payout, assigned_at)
          VALUES (?, ?, 'assigned', 5.00, CURRENT_TIMESTAMP)`, [orderId, driverId]);
      }
      await connection.query(`UPDATE orders SET status = 'driver assigned',
        updated_at = CURRENT_TIMESTAMP, assigned_driver_id = ?,
        driver_assignment_status = 'driver_assigned',
        driver_id = (SELECT user_id FROM drivers WHERE id = ?) WHERE id = ?`,
      [driverId, driverId, orderId]);
      await connection.query(`UPDATE drivers SET status = 'busy',
        availability_status = 'busy', current_order_id = ? WHERE id = ?`, [orderId, driverId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateLocation(driverId, lat, lng) {
    await db.query(
      `UPDATE drivers
       SET current_lat = ?, current_lng = ?,
           current_latitude = ?, current_longitude = ?,
           last_location_update = CURRENT_TIMESTAMP,
           last_seen = NOW(),
           last_seen_at = NOW(),
           is_online = 1,
           status = CASE WHEN current_order_id IS NULL THEN 'available' ELSE 'busy' END,
           availability_status = CASE WHEN current_order_id IS NULL THEN 'available' ELSE 'busy' END
       WHERE id = ?`,
      [lat, lng, lat, lng, driverId]
    );
  }

  static async verifyOTP(deliveryId, otp, driverId) {
    console.log(`[VERIFY OTP] Checking OTP for deliveryId=${deliveryId}, input_otp=${otp}, input_driverId=${driverId}`);
    const [rows] = await db.query(
      `SELECT o.delivery_otp, d.driver_id, d.status
       FROM orders o 
       JOIN deliveries d ON d.order_id = o.id 
       WHERE d.id = ?`,
      [deliveryId]
    );
    if (rows.length === 0) {
      console.log(`[VERIFY OTP] Delivery not found for id=${deliveryId}`);
      return false;
    }
    
    const delivery = rows[0];
    console.log(`[VERIFY OTP] Database record: db_driver_id=${delivery.driver_id}, db_otp=${delivery.delivery_otp}, db_status=${delivery.status}`);
    
    if (Number(delivery.driver_id) !== Number(driverId)) {
      console.log(`[VERIFY OTP] Driver ID mismatch! db_driver_id=${delivery.driver_id} vs input_driverId=${driverId}`);
      return false;
    }
    
    const terminalStatuses = ['delivered', 'failed', 'rejected'];
    if (terminalStatuses.includes(delivery.status)) {
      console.log(`[VERIFY OTP] Delivery is in terminal status: ${delivery.status}`);
      return false; 
    }
    
    const matches = String(delivery.delivery_otp || '').trim() === String(otp || '').trim();
    console.log(`[VERIFY OTP] Comparison result: matches=${matches}`);
    return matches;
  }

  static async verifyDeliveryOtp(deliveryId, driverId, otp) {
    return DriverModel.verifyOTP(deliveryId, otp, driverId);
  }

  static async markCodeVerified(deliveryId) {
    await DriverModel.ensureDeliveryProofSchema();
    await db.query(
      'UPDATE deliveries SET delivery_code_verified_at = CURRENT_TIMESTAMP WHERE id = ?',
      [deliveryId]
    );
  }

  static async saveProof(deliveryId, imageUrl, driverId = null) {
    await DriverModel.ensureDeliveryProofSchema();
    await db.query(
      `UPDATE deliveries
       SET proof_image_url = ?,
           delivery_proof_url = ?,
           delivery_proof_uploaded_at = CURRENT_TIMESTAMP,
           delivery_proof_uploaded_by = COALESCE(?, driver_id)
       WHERE id = ?`,
      [imageUrl, imageUrl, driverId, deliveryId]
    );
  }

  static async markArrived(deliveryId) {
    await db.query(
      'UPDATE deliveries SET arrived_at = CURRENT_TIMESTAMP WHERE id = ?',
      [deliveryId]
    );
  }

  static async getRejectionHistory(orderId) {
    const [rows] = await db.query(
      `SELECT dr.*, d.first_name, d.last_name, d.vehicle_type
       FROM delivery_rejections dr
       JOIN drivers d ON dr.driver_id = d.id
       WHERE dr.order_id = ?
       ORDER BY dr.rejected_at DESC`,
      [orderId]
    );
    return rows;
  }

  // â”€â”€ DELIVERY OFFERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Cancel any pending offer for the given order (called before creating a new one).
   */
  static async cancelPendingOffers(orderId, connection = db) {
    await connection.query(
      `UPDATE delivery_offers
       SET status = 'cancelled', updated_at = NOW()
       WHERE order_id = ? AND status = 'pending'`,
      [orderId]
    );
  }

  static async createValidatedOffer({ orderId, driverId, vendorId, offeredAmount }) {
    await DriverModel.ensurePresenceSchema();
    await DriverModel.ensureDeliveryOfferSchema();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [orderRows] = await connection.query(`
        SELECT o.id, o.status, o.driver_assignment_status, o.delivery_address, o.distance_km,
               o.delivery_fee, o.distance_km AS estimated_distance,
               COALESCE(v.business_name, v.name, 'Vendor') AS vendor_name,
               v.address AS vendor_address,
               CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
               c.id AS customer_id
        FROM orders o
        JOIN vendors v ON v.id = o.vendor_id
        JOIN customers c ON c.id = o.customer_id
        WHERE o.id = ? AND o.vendor_id = ? FOR UPDATE
      `, [orderId, vendorId]);
      if (orderRows.length === 0) {
        throw Object.assign(new Error('Order not found for this vendor.'), { statusCode: 404 });
      }
      const order = orderRows[0];
      if (['delivered', 'cancelled'].includes(String(order.status || '').toLowerCase())) {
        throw Object.assign(new Error(`Cannot send offer: order is already ${order.status}.`), { statusCode: 409 });
      }
      if (order.driver_assignment_status === 'driver_assigned') {
        throw Object.assign(new Error('A driver is already assigned to this order.'), { statusCode: 409 });
      }

      const [driverRows] = await connection.query(`
        SELECT d.id, d.first_name, d.last_name, d.vehicle_type, d.is_online,
               d.vendor_id AS driver_vendor_id, u.id AS user_id
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        WHERE d.id = ? AND d.vendor_id = ?
          AND d.is_active = 1
          AND u.status = 'active'
          AND d.account_status = 'approved'
          AND d.verification_status = 'verified'
          AND d.is_online = 1
          AND d.availability_status = 'available'
          AND d.current_order_id IS NULL
          AND COALESCE(d.last_seen_at, d.last_seen) >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
        FOR UPDATE
      `, [driverId, vendorId]);
      if (driverRows.length === 0) {
        throw Object.assign(
          new Error('This driver is no longer online or available. Please select another driver.'),
          { statusCode: 409 },
        );
      }
      const driver = driverRows[0];

      const offerId = await DriverModel.createOffer(
        { orderId, driverId, vendorId, offeredAmount },
        connection,
      );
      await connection.commit();
      return { offerId, order, driver };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Create a new delivery offer.
   * Cancels any existing pending offer for the same order first.
   */
  static async createOffer({ orderId, driverId, vendorId, offeredAmount }, connection = db) {
    await DriverModel.ensureDeliveryOfferSchema();
    // Cancel any outstanding pending offer before creating a new one
    await DriverModel.cancelPendingOffers(orderId, connection);

    const [result] = await connection.query(
      `INSERT INTO delivery_offers
         (order_id, driver_id, vendor_id, offered_amount, status, offered_at)
       VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [orderId, driverId, vendorId, offeredAmount]
    );

    // Mark the order as offer_sent
    await connection.query(
      `UPDATE orders
       SET driver_assignment_status = 'offer_sent',
           driver_earning = ?,
           assigned_driver_id = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [offeredAmount, driverId, orderId]
    );

    return result.insertId;
  }

  /**
   * Fetch a single offer by id. Returns null if not found.
   */
  static async getOffer(offerId) {
    await DriverModel.ensureDeliveryOfferSchema();
    const [rows] = await db.query(
      `SELECT o.*, d.first_name, d.last_name, d.vehicle_type,
              u.id as user_id
       FROM delivery_offers o
       JOIN drivers d ON d.id = o.driver_id
       JOIN users u ON u.id = d.user_id
       WHERE o.id = ?`,
      [offerId]
    );
    return rows[0] || null;
  }

  /**
   * Get the current active (pending | accepted) offer for an order.
   */
  static async getOrderOffer(orderId) {
    await DriverModel.ensureDeliveryOfferSchema();
    const [rows] = await db.query(
      `SELECT o.*, d.first_name, d.last_name, d.vehicle_type,
              u.id as user_id
       FROM delivery_offers o
       JOIN drivers d ON d.id = o.driver_id
       JOIN users u ON u.id = d.user_id
       WHERE o.order_id = ?
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [orderId]
    );
    return rows[0] || null;
  }

  /**
   * Accept an offer.
   * Uses a DB transaction + SELECT FOR UPDATE to prevent race conditions.
   * Only the first driver to accept wins; subsequent calls get an error.
   */
  static async acceptOffer(offerId, driverId) {
    await DriverModel.ensurePresenceSchema();
    await DriverModel.ensureDeliveryOfferSchema();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Lock the offer row
      const [offerRows] = await connection.query(
        'SELECT * FROM delivery_offers WHERE id = ? FOR UPDATE',
        [offerId]
      );

      if (offerRows.length === 0) {
        throw Object.assign(new Error('Offer not found.'), { statusCode: 404 });
      }

      const offer = offerRows[0];

      if (Number(offer.driver_id) !== Number(driverId)) {
        throw Object.assign(new Error('This offer was not sent to you.'), { statusCode: 403 });
      }

      if (offer.status !== 'pending') {
        throw Object.assign(
          new Error(
            offer.status === 'accepted'
              ? 'This order has already been accepted.'
              : `Offer is no longer available (status: ${offer.status}).`
          ),
          { statusCode: 409 }
        );
      }

      // Verify the order is still assignable
      const [orderRows] = await connection.query(
        `SELECT id, status, driver_assignment_status
         FROM orders WHERE id = ? FOR UPDATE`,
        [offer.order_id]
      );

      if (orderRows.length === 0) {
        throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
      }

      const order = orderRows[0];
      if (['delivered', 'cancelled'].includes((order.status || '').toLowerCase())) {
        throw Object.assign(new Error('Order is no longer available.'), { statusCode: 409 });
      }
      if (order.driver_assignment_status === 'driver_assigned') {
        throw Object.assign(new Error('A driver has already been assigned to this order.'), { statusCode: 409 });
      }

      const [availableDriver] = await connection.query(`
        SELECT d.id FROM drivers d
        JOIN users u ON u.id = d.user_id
        WHERE d.id = ? AND d.vendor_id = ?
          AND d.is_active = 1 AND u.status = 'active'
          AND d.account_status = 'approved' AND d.verification_status = 'verified'
          AND d.is_online = 1 AND d.availability_status = 'available'
          AND d.current_order_id IS NULL
          AND COALESCE(d.last_seen_at, d.last_seen) >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
        FOR UPDATE
      `, [driverId, offer.vendor_id]);
      if (availableDriver.length === 0) {
        throw Object.assign(
          new Error('You are no longer online or available for this delivery.'),
          { statusCode: 409 },
        );
      }

      // Accept the offer
      await connection.query(
        `UPDATE delivery_offers
         SET status = 'accepted', responded_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [offerId]
      );

      // Update orders
      await connection.query(
        `UPDATE orders
         SET driver_assignment_status = 'driver_assigned',
             assigned_driver_id = ?,
             driver_earning = ?,
             status = 'driver assigned',
             driver_id = (SELECT user_id FROM drivers WHERE id = ? LIMIT 1),
             updated_at = NOW()
         WHERE id = ?`,
        [driverId, offer.offered_amount, driverId, offer.order_id]
      );

      // Create / update delivery row with payout = offered_amount
      const [existingDelivery] = await connection.query(
        'SELECT id FROM deliveries WHERE order_id = ?',
        [offer.order_id]
      );

      if (existingDelivery.length > 0) {
        await connection.query(
          `UPDATE deliveries
           SET driver_id = ?, payout = ?,
               status = 'assigned', assigned_at = NOW(),
               responded_at = NULL, rejection_reason = NULL,
               response_reminder_sent_at = NULL,
               updated_at = NOW()
           WHERE order_id = ?`,
          [driverId, offer.offered_amount, offer.order_id]
        );
      } else {
        await connection.query(
          `INSERT INTO deliveries (order_id, driver_id, status, payout, assigned_at)
           VALUES (?, ?, 'assigned', ?, NOW())`,
          [offer.order_id, driverId, offer.offered_amount]
        );
      }

      // Mark driver as busy and set current_order_id
      await connection.query(
        `UPDATE drivers
         SET status = 'busy',
             availability_status = 'busy',
             current_order_id = ?
         WHERE id = ?`,
        [offer.order_id, driverId]
      );

      await connection.commit();
      return offer;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Decline an offer.
   */
  static async declineOffer(offerId, driverId) {
    await DriverModel.ensureDeliveryOfferSchema();
    const [offerRows] = await db.query(
      'SELECT * FROM delivery_offers WHERE id = ? AND driver_id = ? AND status = ?',
      [offerId, driverId, 'pending']
    );

    if (offerRows.length === 0) {
      throw Object.assign(new Error('Offer not found or already responded.'), { statusCode: 404 });
    }

    const offer = offerRows[0];

    await db.query(
      `UPDATE delivery_offers
       SET status = 'declined', responded_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [offerId]
    );

    // Reset order assignment status so vendor can re-send
    await db.query(
      `UPDATE orders
       SET driver_assignment_status = NULL,
           assigned_driver_id = NULL,
           updated_at = NOW()
       WHERE id = ? AND driver_assignment_status = 'offer_sent'`,
      [offer.order_id]
    );

    return offer;
  }

  static async releaseDriverFromOrder(driverId, orderId, connection = db) {
    if (!driverId || !orderId) return 0;
    const [result] = await connection.query(`
      UPDATE drivers
      SET current_order_id = NULL,
          status = CASE
            WHEN is_online = 1 AND COALESCE(last_seen_at, last_seen) >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
              THEN 'available' ELSE 'offline' END,
          availability_status = CASE
            WHEN is_online = 1 AND COALESCE(last_seen_at, last_seen) >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
              THEN 'available' ELSE 'offline' END,
          is_online = CASE
            WHEN is_online = 1 AND COALESCE(last_seen_at, last_seen) >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
              THEN 1 ELSE 0 END
      WHERE id = ? AND current_order_id = ?
    `, [driverId, orderId]);
    return result.affectedRows;
  }

  static async releaseDriversForOrder(orderId) {
    await DriverModel.ensurePresenceSchema();
    await DriverModel.ensureDeliveryOfferSchema();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [drivers] = await connection.query(`
        SELECT id FROM drivers WHERE current_order_id = ? FOR UPDATE
      `, [orderId]);
      for (const driver of drivers) {
        await DriverModel.releaseDriverFromOrder(driver.id, orderId, connection);
      }
      await DriverModel.cancelPendingOffers(orderId, connection);
      await connection.query(`UPDATE orders
        SET driver_assignment_status = NULL, assigned_driver_id = NULL, driver_id = NULL
        WHERE id = ?`, [orderId]);
      await connection.commit();
      return drivers.map((driver) => driver.id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get all pending offers for a driver (for the driver app home screen).
   */
  static async getPendingOffersForDriver(driverId) {
    await DriverModel.ensureDeliveryOfferSchema();
    const [rows] = await db.query(
      `SELECT o.*, ord.id as order_id, ord.distance_km, ord.delivery_fee,
              ord.delivery_address as customer_destination,
              COALESCE(v.business_name, v.name, 'Vendor') as vendor_name,
              v.address as pickup_location,
              CONCAT(c.first_name, ' ', c.last_name) as customer_name,
              (SELECT GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ')
                 FROM order_items oi JOIN products p ON p.id = oi.product_id
                 WHERE oi.order_id = ord.id) as product_summary,
              (SELECT cat.name
                 FROM order_items oi JOIN products p ON p.id = oi.product_id
                 JOIN categories cat ON cat.id = p.category_id
                 WHERE oi.order_id = ord.id LIMIT 1) as order_type
       FROM delivery_offers o
       JOIN orders ord ON ord.id = o.order_id
       JOIN vendors v ON v.id = o.vendor_id
       JOIN customers c ON c.id = ord.customer_id
       WHERE o.driver_id = ? AND o.status = 'pending'
       ORDER BY o.offered_at DESC`,
      [driverId]
    );
    return rows;
  }
}

module.exports = DriverModel;
