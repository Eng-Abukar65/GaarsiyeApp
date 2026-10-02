const DriverModel = require('../models/driverModel');
const NotificationModel = require('../models/notificationModel');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const jwtSecret = require('../config/jwt');

class DriverController {
  static async login(req, res) {
    const { email, password } = req.body;
    try {
      const driver = await DriverModel.findByEmail(email);
      if (!driver) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, driver.password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const accountEnabled = String(driver.user_status || '').toLowerCase() === 'active'
        && Number(driver.driver_is_active) === 1
        && String(driver.account_status || '').toLowerCase() === 'approved'
        && String(driver.verification_status || '').toLowerCase() === 'verified';
      if (!accountEnabled) {
        return res.status(403).json({
          success: false,
          code: 'DRIVER_ACCOUNT_INACTIVE',
          message: 'Your driver account is inactive. Please contact your vendor.',
        });
      }

      const token = jwt.sign(
        { id: driver.id, driver_id: driver.driver_id, role: 'driver' },
        jwtSecret,
        { expiresIn: '24h' }
      );

      await DriverModel.markOnline(driver.driver_id);
      console.log(`[DRIVER LOGIN] Driver #${driver.driver_id} marked online`);

      res.json({
        token,
        driver: {
          id: driver.driver_id,
          first_name: driver.first_name,
          last_name: driver.last_name,
          email: driver.email,
          vehicle_type: driver.vehicle_type,
          profile_image: driver.profile_image,
          must_change_password: Boolean(driver.must_change_password)
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getProfile(req, res) {
    try {
      const driverId = req.user.driver_id;
      const driver = await DriverModel.findById(driverId);
      if (!driver) {
        return res.status(404).json({ message: 'Driver not found' });
      }
      res.json(driver);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getDashboardStats(req, res) {
    try {
      const driverId = req.user.driver_id;
      const stats = await DriverModel.getDashboardStats(driverId);
      res.json(stats);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getDeliveries(req, res) {
    try {
      const driverId = req.user.driver_id;
      console.log(`[DEBUG] Fetching deliveries for driver_id: ${driverId} (user_id: ${req.user.id})`);
      
      const deliveries = await DriverModel.getDeliveries(driverId);
      console.log(`[DEBUG] Found ${deliveries.length} deliveries for driver_id: ${driverId}`);
      
      res.json(deliveries);
    } catch (error) {
      console.error('[ERROR] getDeliveries:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getDeliveryDetails(req, res) {
    try {
      const deliveryId = req.params.id;
      const delivery = await DriverModel.getDeliveryById(deliveryId);
      if (!delivery) {
        return res.status(404).json({ message: 'Delivery not found' });
      }
      res.json(delivery);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async updateDeliveryStatus(req, res) {
    try {
      const deliveryId = req.params.id;
      const { status, latitude, longitude, rejection_reason } = req.body;
      
      const allowedStatuses = ['accepted', 'picked_up', 'on_the_way', 'delivered', 'failed', 'rejected', 'heading_to_vendor', 'arrived'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      if (status === 'rejected' && (!rejection_reason || rejection_reason.trim().length < 3)) {
        return res.status(400).json({ message: 'A rejection reason is required.' });
      }

      const db = require('../config/db');
      await DriverController.ensureDeliveryStatusSchema(db);

      // Fetch delivery details including customer, vendor and driver coordinates
      const [deliveryRows] = await db.query(`
        SELECT d.status as current_status, d.driver_id, d.order_id, o.vendor_id, o.address_id,
               u_cust.id as customer_user_id,
               v.latitude as vendor_lat, v.longitude as vendor_lng,
               a.latitude as cust_lat, a.longitude as cust_lng,
               COALESCE(dr.current_latitude, dr.current_lat) as driver_lat,
               COALESCE(dr.current_longitude, dr.current_lng) as driver_lng
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        JOIN users u_cust ON c.user_id = u_cust.id
        JOIN addresses a ON o.address_id = a.id
        JOIN vendors v ON o.vendor_id = v.id
        LEFT JOIN drivers dr ON d.driver_id = dr.id
        WHERE d.id = ?
      `, [deliveryId]);

      if (deliveryRows.length === 0) {
        return res.status(404).json({ message: 'Delivery not found' });
      }

      const delivery = deliveryRows[0];
      if (req.user?.role !== 'driver') {
        return res.status(403).json({ message: 'Access denied. Drivers only.' });
      }
      const driverId = req.user.driver_id || req.user.id;
      if (Number(delivery.driver_id) !== Number(driverId)) {
        return res.status(403).json({ message: 'This delivery is not assigned to you.' });
      }

      const currentStatus = delivery.current_status || 'pending';
      const newStatus = status;

      // Geofence Distance calculation function
      function getDistance(lat1, lon1, lat2, lon2) {
        if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) {
          return Infinity;
        }
        const R = 6371e3; // metres
        const phi1 = lat1 * Math.PI/180;
        const phi2 = lat2 * Math.PI/180;
        const deltaPhi = (lat2-lat1) * Math.PI/180;
        const deltaLambda = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // in metres
      }

      // 1. Delivery State Machine check
      const stateMachine = {
        'pending': ['assigned'],
        'assigned': ['heading_to_vendor', 'accepted'],
        'accepted': ['heading_to_vendor'],
        'heading_to_vendor': ['picked_up'],
        'picked_up': ['on_the_way'],
        'on_the_way': ['arrived'],
        'arrived': ['delivered'],
        'delivered': [],
        'failed': [],
        'rejected': []
      };

      const allowedNext = stateMachine[currentStatus] || [];
      if (newStatus !== 'failed' && newStatus !== 'rejected' && !allowedNext.includes(newStatus)) {
        return res.status(400).json({ message: `Invalid delivery state transition from ${currentStatus} to ${newStatus}` });
      }

      // 2. Delivery Geofence Checks (100m)
      if (newStatus === 'picked_up') {
        const dLat = parseFloat(delivery.driver_lat);
        const dLng = parseFloat(delivery.driver_lng);
        const vLat = parseFloat(delivery.vendor_lat);
        const vLng = parseFloat(delivery.vendor_lng);

        const dist = getDistance(dLat, dLng, vLat, vLng);
        if (dist > 100) {
          return res.status(400).json({ message: `Cannot pickup order: You are not within 100m of the vendor station (current distance: ${dist.toFixed(1)}m).` });
        }
      }

      if (newStatus === 'delivered' || newStatus === 'arrived') {
        const requestLat = Number.parseFloat(latitude);
        const requestLng = Number.parseFloat(longitude);
        const dLat = Number.isFinite(requestLat) ? requestLat : Number.parseFloat(delivery.driver_lat);
        const dLng = Number.isFinite(requestLng) ? requestLng : Number.parseFloat(delivery.driver_lng);
        let cLat = Number.parseFloat(delivery.cust_lat);
        let cLng = Number.parseFloat(delivery.cust_lng);

        if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) {
          return res.status(400).json({ message: 'Driver location is required before arrival.' });
        }

        if ((!Number.isFinite(cLat) || !Number.isFinite(cLng)) && newStatus === 'arrived') {
          console.log(`[DELIVERY STATUS] Customer coordinates missing for address #${delivery.address_id}; using driver arrival coordinates.`);
          cLat = dLat;
          cLng = dLng;
          await db.query(
            'UPDATE addresses SET latitude = ?, longitude = ? WHERE id = ? AND (latitude IS NULL OR longitude IS NULL)',
            [cLat, cLng, delivery.address_id]
          );
        }

        if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) {
          return res.status(400).json({ message: 'Customer location is not configured for this order.' });
        }

        const dist = getDistance(dLat, dLng, cLat, cLng);
        if (dist > 100) {
          return res.status(400).json({ message: `Cannot complete delivery: You are not within 100m of the customer destination (current distance: ${dist.toFixed(1)}m).` });
        }

        await DriverModel.updateLocation(driverId, dLat, dLng);
      }

      await DriverModel.updateStatus(deliveryId, newStatus, rejection_reason?.trim() || null);

      // Emit status updates to rooms
      const io = req.app.get('io');
      if (io) {
        const payload = {
          delivery_id: parseInt(deliveryId),
          order_id: delivery.order_id,
          status: newStatus,
          driver_id: driverId,
          vendor_id: delivery.vendor_id
        };
        io.emit('delivery-status-updated', payload);
        io.to('admin-room').emit('delivery-status-updated', payload);
        if (delivery.vendor_id) {
          io.to(`vendor-${delivery.vendor_id}`).emit('delivery-status-updated', payload);
        }
        io.to(`driver-${driverId}`).emit('delivery-status-updated', payload);
        io.to(`delivery-${deliveryId}`).emit('delivery-status-updated', payload);

        try {
          if (newStatus === 'rejected' && delivery.vendor_id) {
            const message = `Driver #${driverId} rejected order #${delivery.order_id}. Please assign another driver.`;
            const [notification] = await db.query(
              `INSERT INTO vendor_notifications (vendor_id, order_id, title, message, type)
               VALUES (?, ?, 'Driver rejected order', ?, 'driver_rejected_order')`,
              [delivery.vendor_id, delivery.order_id, message]
            );
            io.to(`vendor-${delivery.vendor_id}`).emit('driver-rejected-order', {
              id: notification.insertId,
              delivery_id: parseInt(deliveryId, 10),
              order_id: delivery.order_id,
              vendor_id: delivery.vendor_id,
              message,
            });
          }

          let title = null;
          let message = null;
          let type = null;

          if (newStatus === 'picked_up') {
            title = 'Your order is on the move';
            message = `Your order #${delivery.order_id} has been picked up by the driver.`;
            type = 'order_picked_up';
          } else if (newStatus === 'on_the_way' || newStatus === 'on the way') {
            title = 'Driver is on the way';
            message = `Your driver is on the way with order #${delivery.order_id}.`;
            type = 'order_on_the_way';
          } else if (newStatus === 'delivered') {
            title = 'Order delivered';
            message = `Your order #${delivery.order_id} has been delivered.`;
            type = 'order_delivered';
          }

          if (title && type) {
            await NotificationModel.createAndSendUserNotification(
              delivery.customer_user_id,
              title,
              message,
              type,
              delivery.order_id,
              io,
              { vendorId: delivery.vendor_id, orderId: delivery.order_id }
            );
          }
        } catch (notificationError) {
          console.error('Driver delivery notification error:', notificationError);
        }
      }

      return res.json({
        success: true,
        message: `Delivery status updated to ${newStatus}`,
        delivery: {
          delivery_id: parseInt(deliveryId, 10),
          order_id: delivery.order_id,
          status: newStatus,
          driver_id: driverId,
          vendor_id: delivery.vendor_id
        }
      });
    } catch (error) {
      console.error('[DELIVERY STATUS] Error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async acceptDelivery(req, res) {
    req.body.status = 'accepted';
    return DriverController.updateDeliveryStatus(req, res);
  }

  static async rejectDelivery(req, res) {
    req.body.status = 'rejected';
    return DriverController.updateDeliveryStatus(req, res);
  }

  static async pickupDelivery(req, res) {
    const db = require('../config/db');
    const deliveryId = req.params.id;
    if (req.user?.role !== 'driver') {
      return res.status(403).json({ message: 'Access denied. Drivers only.' });
    }
    const driverId = req.user.driver_id || req.user.id;
    const { latitude, longitude } = req.body || {};

    console.log(`[PICKUP] Request received delivery_id=${deliveryId}, driver_id=${driverId}`);

    const distanceInMeters = (lat1, lon1, lat2, lon2) => {
      if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) {
        return Infinity;
      }
      const radius = 6371e3;
      const phi1 = lat1 * Math.PI / 180;
      const phi2 = lat2 * Math.PI / 180;
      const deltaPhi = (lat2 - lat1) * Math.PI / 180;
      const deltaLambda = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) *
        Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return radius * c;
    };

    try {
      await DriverController.ensureDeliveryStatusSchema(db);

      const [rows] = await db.query(`
        SELECT d.id, d.order_id, d.driver_id, d.status, d.picked_up_at,
               o.vendor_id, o.customer_id, u_cust.id AS customer_user_id,
               v.latitude AS vendor_latitude, v.longitude AS vendor_longitude,
               dr.current_lat AS driver_current_latitude, dr.current_lng AS driver_current_longitude
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        JOIN users u_cust ON c.user_id = u_cust.id
        JOIN vendors v ON o.vendor_id = v.id
        LEFT JOIN drivers dr ON d.driver_id = dr.id
        WHERE d.id = ?
        LIMIT 1
      `, [deliveryId]);

      if (rows.length === 0) {
        console.log(`[PICKUP] Delivery not found delivery_id=${deliveryId}`);
        return res.status(404).json({ success: false, message: 'Delivery not found' });
      }

      const delivery = rows[0];
      if (Number(delivery.driver_id) !== Number(driverId)) {
        console.log(`[PICKUP] Ownership failed delivery_driver=${delivery.driver_id}, token_driver=${driverId}`);
        return res.status(403).json({ success: false, message: 'This delivery is not assigned to you.' });
      }

      const currentStatus = delivery.status || 'pending';
      const pickupAllowedFrom = ['heading_to_vendor', 'accepted'];
      console.log(`[PICKUP] Validation status=${currentStatus}, picked_up_at=${delivery.picked_up_at || 'null'}`);

      if (currentStatus === 'picked_up') {
        return res.status(409).json({ success: false, message: 'This order is already picked up.' });
      }

      if (!pickupAllowedFrom.includes(currentStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid delivery state transition from ${currentStatus} to picked_up`
        });
      }

      let vendorLat = Number.parseFloat(delivery.vendor_latitude);
      let vendorLng = Number.parseFloat(delivery.vendor_longitude);
      const driverLat = Number.parseFloat(latitude ?? delivery.driver_current_latitude);
      const driverLng = Number.parseFloat(longitude ?? delivery.driver_current_longitude);
      if (!Number.isFinite(driverLat) || !Number.isFinite(driverLng)) {
        console.log(`[PICKUP] Driver coordinates missing driver_id=${driverId}`);
        return res.status(400).json({ success: false, message: 'Driver location is required before pickup.' });
      }

      const vendorLocationMissing =
        !Number.isFinite(vendorLat) ||
        !Number.isFinite(vendorLng) ||
        (Math.abs(vendorLat) < 0.000001 && Math.abs(vendorLng) < 0.000001);
      if (vendorLocationMissing) {
        console.log(`[PICKUP] Vendor coordinates missing vendor_id=${delivery.vendor_id}; using driver GPS as first vendor location.`);
        await db.query(
          `UPDATE vendors
           SET latitude = ?, longitude = ?
           WHERE id = ?
             AND (
               latitude IS NULL OR longitude IS NULL
               OR (ABS(latitude) < 0.000001 AND ABS(longitude) < 0.000001)
             )`,
          [driverLat, driverLng, delivery.vendor_id]
        );
        vendorLat = driverLat;
        vendorLng = driverLng;
      }

      const distance = distanceInMeters(driverLat, driverLng, vendorLat, vendorLng);
      console.log(`[PICKUP] Distance from vendor=${distance.toFixed(1)}m`);
      if (distance > 100) {
        console.warn(
          `[PICKUP] Distance check bypassed for delivery_id=${deliveryId}; allowing pickup at ${distance.toFixed(1)}m.`
        );
      }

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [updateResult] = await connection.query(`
          UPDATE deliveries
          SET status = 'picked_up', picked_up_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND driver_id = ? AND status IN ('heading_to_vendor', 'accepted')
        `, [deliveryId, driverId]);

        if (updateResult.affectedRows === 0) {
          await connection.rollback();
          console.log(`[PICKUP] Update skipped due to concurrent status change delivery_id=${deliveryId}`);
          return res.status(409).json({ success: false, message: 'Delivery status changed. Please refresh and try again.' });
        }

        await connection.query(
          'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['on the way', delivery.order_id]
        );
        await connection.query(
          `UPDATE drivers
           SET current_lat = ?, current_lng = ?,
               current_latitude = ?, current_longitude = ?,
               last_location_update = CURRENT_TIMESTAMP,
               last_seen = NOW(),
               is_online = 1
           WHERE id = ?`,
          [driverLat, driverLng, driverLat, driverLng, driverId]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      console.log(`[PICKUP] Status updated delivery_id=${deliveryId} -> picked_up`);

      const payload = {
        delivery_id: Number(deliveryId),
        order_id: delivery.order_id,
        customer_id: delivery.customer_id,
        vendor_id: delivery.vendor_id,
        driver_id: Number(driverId),
        status: 'picked_up',
        picked_up_at: new Date().toISOString(),
        distance_meters: Number(distance.toFixed(1))
      };

      const io = req.app.get('io');
      if (io) {
        io.emit('delivery-status-updated', payload);
        io.to('admin-room').emit('delivery-status-updated', payload);
        io.to(`vendor-${delivery.vendor_id}`).emit('delivery-status-updated', payload);
        io.to(`driver-${driverId}`).emit('delivery-status-updated', payload);
        io.to(`delivery-${deliveryId}`).emit('delivery-status-updated', payload);
        console.log(`[PICKUP] Socket emitted delivery-status-updated delivery_id=${deliveryId}`);
      } else {
        console.log('[PICKUP] Socket server not available; skipped emit');
      }

      try {
        await NotificationModel.createAndSendUserNotification(
          delivery.customer_user_id,
          'Your order is on the move',
          `Your order #${delivery.order_id} has been picked up by the driver.`,
          'order_picked_up',
          delivery.order_id,
          io,
          { vendorId: delivery.vendor_id, orderId: delivery.order_id }
        );
      } catch (notificationError) {
        console.error('Pickup notification error:', notificationError);
      }

      return res.json({
        success: true,
        message: 'Order picked up successfully.',
        delivery: payload
      });
    } catch (error) {
      console.error('[PICKUP] Error:', error);
      return res.status(500).json({ success: false, message: 'Server error while picking up delivery.' });
    }
  }

  static async ensureDeliveryStatusSchema(db) {
    if (DriverController._deliverySchemaReady) return;
    try {
      await db.query(`
        ALTER TABLE deliveries
        MODIFY status ENUM('pending','assigned','accepted','heading_to_vendor','picked_up','on_the_way','arrived','delivered','failed','rejected')
        DEFAULT 'pending'
      `);
      await db.query(`
        ALTER TABLE deliveries
        ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP NULL DEFAULT NULL
      `);
      // Delivery-proof columns. getDeliveryById SELECTs these, so a missing
      // column makes the whole "delivery details" fetch 500 ("Failed to load
      // delivery details"). Kept idempotent so a fresh DB never regresses.
      await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_proof_url VARCHAR(255) DEFAULT NULL`);
      await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_proof_uploaded_at TIMESTAMP NULL DEFAULT NULL`);
      await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_proof_uploaded_by INT DEFAULT NULL`);
      DriverController._deliverySchemaReady = true;
    } catch (error) {
      DriverController._deliverySchemaReady = true;
      console.warn('[DELIVERY SCHEMA] Could not auto-update status schema:', error.message);
    }
  }

  static parseOptionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  static distanceMeters(lat1, lon1, lat2, lon2) {
    if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) {
      return Infinity;
    }
    const radius = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radius * c;
  }

  static async ensureDriverLocationSchema(db) {
    if (DriverController._driverLocationSchemaReady) return;
    try {
      await db.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_latitude DECIMAL(10, 8) DEFAULT NULL');
      await db.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_longitude DECIMAL(11, 8) DEFAULT NULL');
      await db.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS heading DECIMAL(5, 2) DEFAULT NULL');
      await db.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS speed DECIMAL(5, 2) DEFAULT NULL');
      await db.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP NULL DEFAULT NULL');
      DriverController._driverLocationSchemaReady = true;
    } catch (error) {
      DriverController._driverLocationSchemaReady = true;
      console.warn('[DRIVER LOCATION SCHEMA] Could not ensure location columns:', error.message);
    }
  }

  static async persistLiveLocation(req, { deliveryId = null } = {}) {
    if (req.user?.role !== 'driver') {
      return { statusCode: 403, body: { message: 'Access denied. Drivers only.' } };
    }
    const driverId = req.user.driver_id || req.user.id;
    const latitude = Number.parseFloat(req.body.latitude);
    const longitude = Number.parseFloat(req.body.longitude);
    const speed = DriverController.parseOptionalNumber(req.body.speed);
    const heading = DriverController.parseOptionalNumber(req.body.heading);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return {
        statusCode: 400,
        body: { message: 'Latitude and longitude are required and must be valid numbers' }
      };
    }

    const db = require('../config/db');
    await DriverController.ensureDriverLocationSchema(db);

    await db.query(`
      CREATE TABLE IF NOT EXISTS driver_location_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id INT NOT NULL,
        delivery_id INT DEFAULT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        speed DECIMAL(5, 2) DEFAULT NULL,
        heading DECIMAL(5, 2) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS driver_locations (
        driver_id INT NOT NULL PRIMARY KEY,
        delivery_id INT DEFAULT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        speed DECIMAL(5, 2) DEFAULT NULL,
        heading DECIMAL(5, 2) DEFAULT NULL,
        status VARCHAR(40) DEFAULT 'online',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_driver_locations_delivery (delivery_id),
        INDEX idx_driver_locations_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    let deliveryRows;
    if (deliveryId) {
      [deliveryRows] = await db.query(`
        SELECT d.id as delivery_id, d.order_id, o.vendor_id, d.status
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        WHERE d.id = ? AND d.driver_id = ?
        LIMIT 1
      `, [deliveryId, driverId]);
    } else {
      [deliveryRows] = await db.query(`
        SELECT d.id as delivery_id, d.order_id, o.vendor_id, d.status
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        WHERE d.driver_id = ?
          AND d.status IN ('assigned', 'accepted', 'heading_to_vendor', 'picked_up', 'on_the_way', 'arrived')
        ORDER BY d.updated_at DESC
        LIMIT 1
      `, [driverId]);
    }

    const delivery = deliveryRows[0] || null;
    if (deliveryId && !delivery) {
      return {
        statusCode: 404,
        body: { success: false, message: 'Delivery not found or not assigned to you.' }
      };
    }

    const [driverRows] = await db.query(
      'SELECT COALESCE(current_latitude, current_lat) AS current_latitude, COALESCE(current_longitude, current_lng) AS current_longitude, speed, heading FROM drivers WHERE id = ?',
      [driverId]
    );
    const prevLat = DriverController.parseOptionalNumber(driverRows[0]?.current_latitude);
    const prevLng = DriverController.parseOptionalNumber(driverRows[0]?.current_longitude);
    const prevSpeed = DriverController.parseOptionalNumber(driverRows[0]?.speed);
    const prevHeading = DriverController.parseOptionalNumber(driverRows[0]?.heading);

    if (Number.isFinite(prevLat) && Number.isFinite(prevLng)) {
      const jumpDistance = DriverController.distanceMeters(latitude, longitude, prevLat, prevLng);
      if (Number.isFinite(jumpDistance) && jumpDistance > 2000) {
        console.warn(`[SOCKET] [GPS JUMP ALLOWED] Driver #${driverId} moved ${jumpDistance.toFixed(1)}m; keeping live tracking active.`);
      }
    }

    await db.query(`
      UPDATE drivers
      SET current_latitude = ?, current_longitude = ?,
          current_lat = ?, current_lng = ?,
          speed = ?, heading = ?,
          last_location_update = CURRENT_TIMESTAMP,
          last_seen = NOW(),
          is_online = 1,
          status = CASE WHEN status = 'offline' OR status IS NULL THEN 'available' ELSE status END
      WHERE id = ?
    `, [latitude, longitude, latitude, longitude, speed, heading, driverId]);

    await db.query(`
      INSERT INTO driver_location_history (driver_id, delivery_id, latitude, longitude, speed, heading)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [driverId, delivery?.delivery_id || null, latitude, longitude, speed, heading]);

    await db.query(`
      INSERT INTO driver_locations (driver_id, delivery_id, latitude, longitude, speed, heading, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        delivery_id = VALUES(delivery_id),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        speed = VALUES(speed),
        heading = VALUES(heading),
        status = VALUES(status),
        updated_at = CURRENT_TIMESTAMP
    `, [
      driverId,
      delivery?.delivery_id || null,
      latitude,
      longitude,
      speed,
      heading,
      delivery?.status || 'online',
    ]);

    let shouldEmit = true;
    if (Number.isFinite(prevLat) && Number.isFinite(prevLng)) {
      const movedDistance = DriverController.distanceMeters(latitude, longitude, prevLat, prevLng);
      const headingUnchanged = prevHeading !== null && heading !== null && Math.abs(heading - prevHeading) < 5;
      const speedUnchanged = prevSpeed !== null && speed !== null && Math.abs(speed - prevSpeed) < 2;
      if (movedDistance < 10 && headingUnchanged && speedUnchanged) {
        shouldEmit = false;
      }
    }

    if (shouldEmit) {
      const io = req.app.get('io');
      if (io) {
        const payload = {
          driver_id: Number(driverId),
          delivery_id: delivery?.delivery_id || null,
          order_id: delivery?.order_id || null,
          vendor_id: delivery?.vendor_id || null,
          latitude,
          longitude,
          heading: heading ?? 0,
          speed: speed ?? 0,
          status: delivery?.status || 'online',
          timestamp: new Date().toISOString()
        };

        for (const eventName of ['driver-location-updated', 'driver-location-update']) {
          io.to('admin-room').emit(eventName, payload);
          io.to(`driver-${driverId}`).emit(eventName, payload);
          if (delivery?.vendor_id) {
            io.to(`vendor-${delivery.vendor_id}`).emit(eventName, payload);
          }
          if (delivery?.delivery_id) {
            io.to(`delivery-${delivery.delivery_id}`).emit(eventName, payload);
          }
        }
      }
    }

    return {
      statusCode: 200,
      body: {
        success: true,
        acknowledged: true,
        delivery_id: delivery?.delivery_id || null,
        message: 'Location synchronized successfully'
      }
    };
  }

  static async onTheWayDelivery(req, res) {
    req.body.status = 'on_the_way';
    return DriverController.updateDeliveryStatus(req, res);
  }

  static async deliveredDelivery(req, res) {
    req.body.status = 'delivered';
    return DriverController.updateDeliveryStatus(req, res);
  }

  static async failedDelivery(req, res) {
    req.body.status = 'failed';
    return DriverController.updateDeliveryStatus(req, res);
  }

  static async toggleOnlineStatus(req, res) {
    try {
      if (req.user?.role !== 'driver') {
        return res.status(403).json({ message: 'Access denied. Drivers only.' });
      }
      const driverId = req.user.driver_id || req.user.id;
      const { is_online } = req.body;
      await DriverModel.updateOnlineStatus(driverId, is_online);
      res.json({ message: `Driver is now ${is_online ? 'online' : 'offline'}` });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async updateLiveLocation(req, res) {
    try {
      const result = await DriverController.persistLiveLocation(req, { deliveryId: req.params.id });
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error('[DELIVERY LOCATION UPDATE ERROR]', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async updateLiveLocationGlobal(req, res) {
    try {
      const result = await DriverController.persistLiveLocation(req, { deliveryId: req.body.delivery_id || null });
      return res.status(result.statusCode).json(result.body);

      // Always parse to float — body values arrive as strings
      // Haversine distance calculator
      function getDistance(lat1, lon1, lat2, lon2) {
        // Use Number.isFinite — do NOT use falsy checks (!val) as 0 is a valid coordinate
        if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return Infinity;
        const R = 6371e3; // metres
        const phi1 = lat1 * Math.PI/180;
        const phi2 = lat2 * Math.PI/180;
        const deltaPhi = (lat2-lat1) * Math.PI/180;
        const deltaLambda = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // in metres
      }

      // Get last coordinates to validate distance
      const [driverRows] = await db.query(
        'SELECT COALESCE(current_latitude, current_lat) AS current_latitude, COALESCE(current_longitude, current_lng) AS current_longitude, speed, heading FROM drivers WHERE id = ?',
        [driverId]
      );
      const prevLat = parseFloat(driverRows[0]?.current_latitude);
      const prevLng = parseFloat(driverRows[0]?.current_longitude);
      const prevSpeed = driverRows[0]?.speed !== null ? parseFloat(driverRows[0]?.speed) : null;
      const prevHeading = driverRows[0]?.heading !== null ? parseFloat(driverRows[0]?.heading) : null;

      // 1. Distance check for impossible jumps (e.g. > 2km)
      // Use Number.isFinite — prevLat/prevLng could be NaN if column was NULL
      if (Number.isFinite(prevLat) && Number.isFinite(prevLng)) {
        const jumpDist = getDistance(latitude, longitude, prevLat, prevLng);
        if (Number.isFinite(jumpDist) && jumpDist > 2000) {
          console.warn(`[SOCKET] [GPS JUMP BLOCKED] Driver #${driverId} attempted a ${jumpDist.toFixed(1)}m jump.`);
          return res.status(200).json({ success: false, message: 'GPS jump rejected' });
        }
      }

      // Update DB fields (both legacy and new)
      await db.query(`
        UPDATE drivers 
        SET current_latitude = ?, current_longitude = ?, 
            current_lat = ?, current_lng = ?,
            speed = ?, heading = ?, 
            last_location_update = CURRENT_TIMESTAMP, 
            last_seen = NOW(),
            is_online = 1,
            status = 'available'
        WHERE id = ?
      `, [latitude, longitude, latitude, longitude, speed || null, heading || null, driverId]);

      // Record history
      await db.query(`
        INSERT INTO driver_location_history (driver_id, delivery_id, latitude, longitude, speed, heading)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [driverId, deliveryId, latitude, longitude, speed || null, heading || null]);

      // 2. Throttling socket event emission (<10m and speed/heading unchanged)
      let shouldEmit = true;
      if (Number.isFinite(prevLat) && Number.isFinite(prevLng)) {
        const movedDist = getDistance(latitude, longitude, prevLat, prevLng);
        const incomingHeading = heading !== null && heading !== undefined ? parseFloat(heading) : null;
        const incomingSpeed  = speed  !== null && speed  !== undefined ? parseFloat(speed)  : null;
        const headingUnchanged = prevHeading !== null && incomingHeading !== null && Math.abs(incomingHeading - prevHeading) < 5;
        const speedUnchanged  = prevSpeed  !== null && incomingSpeed  !== null && Math.abs(incomingSpeed  - prevSpeed)  < 2;

        if (movedDist < 10 && headingUnchanged && speedUnchanged) {
          shouldEmit = false;
        }
      }

      if (shouldEmit) {
        const io = req.app.get('io');
        if (io) {
          // Use the parsed float values — heading/speed from req.body are strings
          const parsedHeading = heading !== null && heading !== undefined ? parseFloat(heading) : 0;
          const parsedSpeed   = speed  !== null && speed  !== undefined ? parseFloat(speed)  : 0;
          const payload = {
            driver_id: driverId,
            delivery_id: deliveryId,
            latitude: latitude,
            longitude: longitude,
            heading: Number.isFinite(parsedHeading) ? parsedHeading : 0,
            speed:   Number.isFinite(parsedSpeed)   ? parsedSpeed   : 0,
            status: status
          };

          io.to('admin-room').emit('driver-location-updated', payload);
          if (vendorId) {
            io.to(`vendor-${vendorId}`).emit('driver-location-updated', payload);
          }
          if (deliveryId) {
            io.to(`delivery-${deliveryId}`).emit('driver-location-updated', payload);
          }
        }
      }

      res.json({ success: true, acknowledged: true, message: 'Location synchronized successfully' });
    } catch (error) {
      console.error('[LOCATION UPDATE ERROR]', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async markArrived(req, res) {
    req.body.status = 'arrived';
    return DriverController.updateDeliveryStatus(req, res);
  }

  static async verifyCode(req, res) {
    try {
      const deliveryId = req.params.id;
      const { code } = req.body;
      const driverId = req.user.driver_id || req.user.id;

      if (!code) {
        return res.status(400).json({ success: false, message: 'Verification code is required' });
      }

      const isValid = await DriverModel.verifyOTP(deliveryId, code, driverId);

      if (isValid) {
        await DriverModel.markCodeVerified(deliveryId);
        await DriverModel.updateStatus(deliveryId, 'delivered');

        const [rows] = await db.query(
          `SELECT d.order_id, o.vendor_id, u_cust.id AS customer_user_id
           FROM deliveries d
           JOIN orders o ON d.order_id = o.id
           JOIN customers c ON o.customer_id = c.id
           JOIN users u_cust ON c.user_id = u_cust.id
           WHERE d.id = ?`,
          [deliveryId]
        );

        if (rows.length > 0) {
          const { order_id, vendor_id, customer_user_id } = rows[0];
          const io = req.app.get('io');
          if (io) {
            const payload = {
              delivery_id: parseInt(deliveryId),
              order_id: order_id,
              status: 'delivered',
              driver_id: parseInt(driverId),
              vendor_id: vendor_id
            };
            io.emit('delivery-status-updated', payload);
            io.to('admin-room').emit('delivery-status-updated', payload);
            if (vendor_id) {
              io.to(`vendor-${vendor_id}`).emit('delivery-status-updated', payload);
            }
            io.to(`driver-${driverId}`).emit('delivery-status-updated', payload);
            io.to(`delivery-${deliveryId}`).emit('delivery-status-updated', payload);
          }

          try {
            await NotificationModel.createAndSendUserNotification(
              customer_user_id,
              'Order delivered',
              `Your order #${order_id} has been delivered.`,
              'order_delivered',
              order_id,
              io,
              { vendorId: vendor_id, orderId: order_id }
            );
          } catch (notificationError) {
            console.error('Delivery OTP notification error:', notificationError);
          }
        }

        res.json({ success: true, message: 'Delivery code verified. Order delivered.' });
      } else {
        res.status(400).json({ success: false, message: 'Invalid delivery code' });
      }
    } catch (error) {
      console.error('[ERROR] verifyCode:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async uploadProof(req, res) {
    try {
      const deliveryId = req.params.id;
      const { image_url } = req.body;
      if (!image_url) {
        return res.status(400).json({ message: 'Image URL is required' });
      }

      const driverId = req.user.driver_id || req.user.id;

      const [rows] = await db.query(
        `SELECT d.driver_id, d.status, d.order_id, o.vendor_id, u_cust.id AS customer_user_id
         FROM deliveries d
         JOIN orders o ON d.order_id = o.id
         JOIN customers c ON o.customer_id = c.id
         JOIN users u_cust ON c.user_id = u_cust.id
         WHERE d.id = ?`,
        [deliveryId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Delivery not found' });
      }

      const delivery = rows[0];

      if (Number(delivery.driver_id) !== Number(driverId)) {
        return res.status(403).json({ message: 'This delivery is not assigned to you.' });
      }

      const terminalStatuses = ['delivered', 'failed', 'rejected'];
      if (terminalStatuses.includes(delivery.status)) {
        return res.status(400).json({ message: 'Delivery is already completed or in terminal state.' });
      }

      await DriverModel.saveProof(deliveryId, image_url);
      await DriverModel.updateStatus(deliveryId, 'delivered');

      const io = req.app.get('io');
      if (io) {
        const payload = {
          delivery_id: parseInt(deliveryId),
          order_id: delivery.order_id,
          status: 'delivered',
          driver_id: parseInt(driverId),
          vendor_id: delivery.vendor_id
        };
        io.emit('delivery-status-updated', payload);
        io.to('admin-room').emit('delivery-status-updated', payload);
        if (delivery.vendor_id) {
          io.to(`vendor-${delivery.vendor_id}`).emit('delivery-status-updated', payload);
        }
        io.to(`driver-${driverId}`).emit('delivery-status-updated', payload);
        io.to(`delivery-${deliveryId}`).emit('delivery-status-updated', payload);
      }

      try {
        await NotificationModel.createAndSendUserNotification(
          delivery.customer_user_id,
          'Order delivered',
          `Your order #${delivery.order_id} has been delivered.`,
          'order_delivered',
          delivery.order_id,
          io,
          { vendorId: delivery.vendor_id, orderId: delivery.order_id }
        );
      } catch (notificationError) {
        console.error('Delivery proof notification error:', notificationError);
      }

      res.json({ success: true, message: 'Proof uploaded. Delivery completed.' });
    } catch (error) {
      console.error('[ERROR] uploadProof:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getEarnings(req, res) {
    try {
      const driverId = req.user.driver_id || req.user.id;

      const [driverRows] = await db.query('SELECT wallet_balance FROM drivers WHERE id = ?', [driverId]);
      const balance = driverRows[0]?.wallet_balance || 0;

      const [statsRows] = await db.query(`
        SELECT 
          SUM(CASE WHEN DATE(created_at) = CURDATE() AND type = 'earning' THEN amount ELSE 0 END) as today_earnings,
          SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) AND type = 'earning' THEN amount ELSE 0 END) as weekly_earnings,
          SUM(CASE WHEN MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) AND type = 'earning' THEN amount ELSE 0 END) as monthly_earnings,
          SUM(CASE WHEN type = 'payout' AND status = 'pending' THEN amount ELSE 0 END) as pending_payouts,
          SUM(CASE WHEN type = 'payout' AND status = 'completed' THEN amount ELSE 0 END) as completed_payouts
        FROM driver_transactions 
        WHERE driver_id = ?
      `, [driverId]);

      const stats = statsRows[0] || {};

      res.json({
        wallet_balance: parseFloat(balance || 0),
        today_earnings: parseFloat(stats.today_earnings || 0),
        weekly_earnings: parseFloat(stats.weekly_earnings || 0),
        monthly_earnings: parseFloat(stats.monthly_earnings || 0),
        pending_payouts: parseFloat(stats.pending_payouts || 0),
        completed_payouts: parseFloat(stats.completed_payouts || 0)
      });
    } catch (error) {
      console.error('[ERROR] getEarnings:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getTransactions(req, res) {
    try {
      const driverId = req.user.driver_id;
      const db = require('../config/db');

      const [rows] = await db.query(`
        SELECT t.*, 
               COALESCE(CONCAT(c.first_name, ' ', c.last_name), u.username, 'Unknown Customer') as customer_name
        FROM driver_transactions t
        LEFT JOIN deliveries d ON t.delivery_id = d.id
        LEFT JOIN orders o ON d.order_id = o.id
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN users u ON c.user_id = u.id
        WHERE t.driver_id = ?
        ORDER BY t.created_at DESC
      `, [driverId]);

      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async uploadProfileImage(req, res) {
    try {
      const driverId = req.user.driver_id;
      if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded' });
      }

      const imageUrl = `/uploads/drivers/${req.file.filename}`;
      const db = require('../config/db');

      await db.query('UPDATE drivers SET profile_image = ? WHERE id = ?', [imageUrl, driverId]);

      res.json({ success: true, message: 'Profile image uploaded successfully', profile_image: imageUrl });
    } catch (error) {
      console.error('Error uploading profile image:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // ─── DELIVERY OFFER RESPONSES ─────────────────────────────────────────────────

  /**
   * PATCH /driver/offers/:offerId/respond
   * body: { action: 'accept' | 'decline' }
   */
  static async respondToOffer(req, res) {
    const driverId = req.user?.driver_id;
    if (!driverId) {
      return res.status(401).json({ success: false, message: 'Driver identity not found in token.' });
    }

    const { offerId } = req.params;
    const { action } = req.body;

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be "accept" or "decline".' });
    }

    try {
      const DriverModel = require('../models/driverModel');
      const db = require('../config/db');
      const io = req.app.get('io');

      if (action === 'accept') {
        const offer = await DriverModel.acceptOffer(Number(offerId), Number(driverId));
        const driverName = [req.user?.first_name, req.user?.last_name].filter(Boolean).join(' ') || `Driver #${driverId}`;

        // Look up driver info for the response
        const [driverInfo] = await db.query(
          'SELECT first_name, last_name, vehicle_type FROM drivers WHERE id = ?',
          [driverId]
        );
        const driverFullName = driverInfo[0]
          ? `${driverInfo[0].first_name} ${driverInfo[0].last_name}`.trim()
          : driverName;
        const vehicleType = driverInfo[0]?.vehicle_type || 'Vehicle';

        // Notify vendor via Socket.IO
        if (io) {
          io.to(`vendor-${offer.vendor_id}`).emit('offer-accepted', {
            offer_id: Number(offerId),
            order_id: offer.order_id,
            driver_id: Number(driverId),
            driver_name: driverFullName,
            vehicle_type: vehicleType,
            offered_amount: offer.offered_amount,
            message: `${driverFullName} accepted the delivery offer for $${parseFloat(offer.offered_amount).toFixed(2)}.`,
          });
          io.to(`vendor-${offer.vendor_id}`).emit('driver-availability-updated', {
            driver_id: Number(driverId),
            order_id: offer.order_id,
            is_online: true,
            availability_status: 'busy',
          });
          // Also notify admin room
          io.to('admin-room').emit('offer-accepted', {
            offer_id: Number(offerId),
            order_id: offer.order_id,
            driver_id: Number(driverId),
          });
        }

        // Notify customer that driver has been assigned
        try {
          const NotificationModel = require('../models/notificationModel');
          const [custRows] = await db.query(
            `SELECT c.id as customer_id, u.id as user_id
             FROM orders o
             JOIN customers c ON c.id = o.customer_id
             JOIN users u ON u.id = c.user_id
             WHERE o.id = ?`,
            [offer.order_id]
          );
          if (custRows.length > 0) {
            await NotificationModel.createAndSendCustomerNotification({
              customerId: custRows[0].customer_id,
              userId: custRows[0].user_id,
              vendorId: offer.vendor_id,
              orderId: offer.order_id,
              title: 'Driver assigned to your order',
              message: `${driverFullName} has been assigned to deliver your order #ORD-${String(offer.order_id).padStart(4, '0')}.`,
              type: 'driver_assigned',
              io,
            });
          }
        } catch (notifErr) {
          console.error('[OFFER] Customer notification failed:', notifErr.message);
        }

        return res.json({
          success: true,
          message: `You have accepted the delivery offer for Order #ORD-${String(offer.order_id).padStart(4, '0')}.`,
          order_id: offer.order_id,
          offered_amount: offer.offered_amount,
        });

      } else {
        // decline
        const offer = await DriverModel.declineOffer(Number(offerId), Number(driverId));

        const [driverInfo] = await db.query(
          'SELECT first_name, last_name FROM drivers WHERE id = ?',
          [driverId]
        );
        const driverFullName = driverInfo[0]
          ? `${driverInfo[0].first_name} ${driverInfo[0].last_name}`.trim()
          : `Driver #${driverId}`;

        // Notify vendor via Socket.IO
        if (io) {
          io.to(`vendor-${offer.vendor_id}`).emit('offer-declined', {
            offer_id: Number(offerId),
            order_id: offer.order_id,
            driver_id: Number(driverId),
            driver_name: driverFullName,
            message: `${driverFullName} declined the delivery offer.`,
          });
        }

        return res.json({
          success: true,
          message: `You have declined the delivery offer for Order #ORD-${String(offer.order_id).padStart(4, '0')}.`,
          order_id: offer.order_id,
        });
      }
    } catch (error) {
      console.error('[OFFER] respondToOffer error:', error);
      const status = error.statusCode || 500;
      return res.status(status).json({ success: false, message: error.message || 'Failed to respond to offer.' });
    }
  }

  /**
   * GET /driver/offers/pending
   * Returns all pending delivery offers sent to the authenticated driver.
   */
  static async getPendingOffers(req, res) {
    const driverId = req.user?.driver_id;
    if (!driverId) {
      return res.status(401).json({ success: false, message: 'Driver identity not found in token.' });
    }

    try {
      const DriverModel = require('../models/driverModel');
      const offers = await DriverModel.getPendingOffersForDriver(Number(driverId));
      return res.json({ success: true, offers });
    } catch (error) {
      console.error('[OFFER] getPendingOffers error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch pending offers.' });
    }
  }

  /**
   * POST /driver/heartbeat
   * Updates last_seen_at and ensures driver is marked online
   */
  static async heartbeat(req, res) {
    const driverId = req.user?.driver_id;
    if (!driverId) {
      return res.status(401).json({ success: false, message: 'Driver identity not found in token.' });
    }

    try {
      const DriverModel = require('../models/driverModel');
      await DriverModel.heartbeat(driverId);
      return res.json({
        success: true,
        message: 'Driver online status updated',
      });
    } catch (error) {
      console.error('[HEARTBEAT] error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update heartbeat.' });
    }
  }

  /**
   * POST /driver/logout
   * Marks driver offline
   */
  static async logout(req, res) {
    const driverId = req.user?.driver_id;
    if (driverId) {
      try {
        const DriverModel = require('../models/driverModel');
        await DriverModel.markOffline(driverId);
      } catch (err) {
        console.error('[LOGOUT] error:', err);
      }
    }
    return res.json({ success: true, message: 'Logged out successfully' });
  }
}

module.exports = DriverController;

