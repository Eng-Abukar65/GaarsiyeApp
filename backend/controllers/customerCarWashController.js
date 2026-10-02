const db = require('../config/db');
const { validateScheduling } = require('../utils/serverTime');
const CustomerModel = require('../models/customerModel');
const NotificationModel = require('../models/notificationModel');
const CarWashModel = require('../models/carWashModel');
const WaafiService = require('../services/waafiService');
const PaymentProviders = require('../services/paymentProviders');
const { ensureCarWashSchema, nextBookingReference } = require('../utils/carWashSchema');
const {
  notifyCustomerBookingReceived,
  notifyCustomerStatus,
  notifyCustomerPaymentSuccess,
  notifyVendorOfBooking: sendVendorBookingNotification,
  notifyVendorOfCustomerCancellation,
} = require('../services/carWashNotificationService');

// ─── Customer-facing Car Wash module ──────────────────────────────────────────
// Customers may only browse APPROVED + ACTIVE car-wash vendors, and may only
// ever read or create bookings that belong to their own customer record.

const CAR_WASH_BUSINESS_TYPE = 'Car Services';

const toNum = (v) => Number.parseFloat(v || 0) || 0;

const fail = (res, err) => {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[CUSTOMER CAR WASH]', err.message);
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : 'Car wash request failed.',
  });
};

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

// Resolve the caller's customers.id from their user JWT.
const resolveCustomerId = async (req) => {
  const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
  if (!customer?.id) {
    throw Object.assign(new Error('Customer profile not found.'), { statusCode: 404 });
  }
  return customer.id;
};

const resolveCustomerDetails = async (req) => {
  const [rows] = await db.query(
    `SELECT c.id AS customer_id, c.first_name, c.last_name, u.username, u.phone
     FROM customers c
     JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?`,
    [req.user.id]
  );
  if (rows.length > 0) return rows[0];
  const customerId = await resolveCustomerId(req);
  return { customer_id: customerId, first_name: null, last_name: null, username: null, phone: null };
};

// Notify the vendor a paid booking is in their queue (DB + socket, best-effort).
const notifyVendorOfBooking = async (io, booking) => {
  try {
    await db.query(
      `INSERT INTO vendor_notifications (vendor_id, title, message, type)
       VALUES (?, 'New car wash booking', ?, 'car_wash_booking')`,
      [
        booking.vendor_id,
        `Booking ${booking.booking_code} for ${booking.service_name} on ${booking.scheduled_date} at ${booking.scheduled_time} — PAID.`,
      ]
    );
    if (io) {
      io.to(`vendor-${booking.vendor_id}`).emit('car-wash-booking-created', {
        vendor_id: Number(booking.vendor_id),
        booking_id: booking.id,
        booking_code: booking.booking_code,
      });
    }
  } catch (notifyErr) {
    console.error('[CUSTOMER CAR WASH] vendor notify failed:', notifyErr.message);
  }
};

// Charge the booking through the EXISTING Waafi integration (waafiService.purchase,
// idempotent per booking_code) and, on success, mark the booking paid + confirmed
// and hand it to the vendor. Never throws — returns a payment result object.
const attemptLegacyBookingPayment = async ({ booking, customerId, payerPhone, io }) => {
  try {
    const providerPayment = await WaafiService.purchase({
      customerId,
      vendorId: booking.vendor_id,
      payerAccount: payerPhone,
      amount: Number(booking.total_price),
      description: `Car wash: ${booking.service_name} (${booking.booking_code})`,
      idempotencyKey: booking.booking_code,
    });

    const transactionRef =
      providerPayment.transactionId || providerPayment.referenceId || null;

    // Paid → auto-confirm (only from pending; never resurrect a cancelled booking).
    await db.query(
      `UPDATE car_wash_bookings
       SET payment_status = 'paid', payment_ref = ?, paid_at = NOW(),
           status = IF(status = 'pending', 'confirmed', status)
       WHERE id = ? AND vendor_id = ?`,
      [transactionRef, booking.id, booking.vendor_id]
    );

    await notifyVendorOfBooking(io, booking);

    return { status: 'paid', transaction_ref: transactionRef };
  } catch (err) {
    // Declined / timeout / vendor not configured — booking stays unpaid; the
    // customer can retry from the booking details page.
    return {
      status: 'failed',
      message: err.message || 'Waafi payment failed. Please try again.',
    };
  }
};

const attemptBookingPayment = async ({ booking, customerId, payerPhone, io, providerId }) => {
  try {
    const publicReference = booking.booking_reference || booking.booking_code;
    // Resolve through the provider registry so an unconfigured vendor fails with
    // a clear 503 instead of a confusing decline at charge time.
    const provider = await PaymentProviders.resolveProvider(booking.vendor_id, providerId);
    const providerPayment = await provider.purchase({
      customerId,
      vendorId: booking.vendor_id,
      payerAccount: payerPhone,
      amount: Number(booking.total_price),
      description: `Car wash: ${booking.service_name} (${publicReference})`,
      idempotencyKey: publicReference,
    });
    const transactionRef = providerPayment.transactionId || providerPayment.referenceId || null;
    const result = await CarWashModel.recordPaymentResult(booking.id, booking.vendor_id, {
      success: true,
      transactionRef,
    });
    if (result.error) throw new Error(result.message || 'Could not record payment.');

    // Payment success does not confirm the workflow. The vendor must explicitly
    // move pending -> confirmed.
    await notifyCustomerPaymentSuccess(io, result.booking);
    return {
      payment: { status: 'paid', transaction_ref: transactionRef },
      booking: result.booking,
    };
  } catch (error) {
    let updatedBooking = booking;
    try {
      const result = await CarWashModel.recordPaymentResult(booking.id, booking.vendor_id, {
        success: false,
        reason: error.message || 'Waafi payment failed.',
      });
      if (result.booking) updatedBooking = result.booking;
      await notifyCustomerStatus(io, updatedBooking);
    } catch (recordError) {
      console.error('[CUSTOMER CAR WASH] payment failure recording failed:', recordError.message);
    }
    return {
      payment: {
        status: 'failed',
        message: error.message || 'Waafi payment failed. Please try again.',
      },
      booking: updatedBooking,
    };
  }
};

class CustomerCarWashController {
  // ── Nearby / available car wash vendors ────────────────────────────────────
  static async listVendors(req, res) {
    try {
      await ensureCarWashSchema();
      const [rows] = await db.query(
        `SELECT v.id, v.business_name, v.name, v.logo, v.city, v.district, v.address,
                v.latitude, v.longitude, v.is_open, v.opening_time, v.closing_time,
                COALESCE(AVG(r.rating), 0) AS rating,
                COUNT(DISTINCT r.id) AS review_count,
                COUNT(DISTINCT s.id) AS service_count,
                MIN(s.base_price) AS starting_price,
                MIN(s.estimated_minutes) AS min_duration
         FROM vendors v
         JOIN vendor_business_types vbt ON vbt.vendor_id = v.id
         JOIN business_types bt ON bt.id = vbt.business_type_id AND (bt.name = ? OR bt.name = 'Car Wash')
         LEFT JOIN car_wash_services s
              ON s.vendor_id = v.id AND s.status = 'active' AND s.is_available = 1
         LEFT JOIN vendor_reviews r ON r.vendor_id = v.id
         WHERE v.verification_status = 'verified' AND v.status = 'active'
         GROUP BY v.id
         ORDER BY v.is_open DESC, rating DESC`,
        [CAR_WASH_BUSINESS_TYPE]
      );

      const data = rows.map((v) => ({
        id: v.id,
        business_name: v.business_name || v.name,
        logo: v.logo,
        city: v.city,
        district: v.district,
        address: v.address,
        latitude: v.latitude != null ? toNum(v.latitude) : null,
        longitude: v.longitude != null ? toNum(v.longitude) : null,
        is_open: Boolean(v.is_open),
        opening_time: v.opening_time,
        closing_time: v.closing_time,
        rating: Number(toNum(v.rating).toFixed(2)),
        review_count: Number(v.review_count || 0),
        service_count: Number(v.service_count || 0),
        starting_price: toNum(v.starting_price),
        min_duration: Number(v.min_duration || 0),
      }));

      res.json({ success: true, data });
    } catch (err) { fail(res, err); }
  }

  // ── A vendor's bookable catalogue ──────────────────────────────────────────
  static async getVendorCatalog(req, res) {
    try {
      await ensureCarWashSchema();
      const vendorId = Number.parseInt(req.params.vendorId, 10);
      if (!Number.isInteger(vendorId)) throw badRequest('Invalid vendor.');

      // The vendor must be approved, active and actually a car wash business.
      const [[vendor]] = await db.query(
        `SELECT v.id, v.business_name, v.name, v.logo, v.city, v.address,
                v.is_open, v.opening_time, v.closing_time
         FROM vendors v
         JOIN vendor_business_types vbt ON vbt.vendor_id = v.id
         JOIN business_types bt ON bt.id = vbt.business_type_id AND (bt.name = ? OR bt.name = 'Car Wash')
         WHERE v.id = ? AND v.verification_status = 'verified' AND v.status = 'active'`,
        [CAR_WASH_BUSINESS_TYPE, vendorId]
      );
      if (!vendor) {
        throw Object.assign(new Error('Car wash vendor not available.'), { statusCode: 404 });
      }

      // Only active + available items are exposed to customers.
      const [services] = await db.query(
        `SELECT id, name, description, base_price, estimated_minutes, image
         FROM car_wash_services
         WHERE vendor_id = ? AND status = 'active' AND is_available = 1
         ORDER BY display_order ASC, id ASC`,
        [vendorId]
      );
      const [addons] = await db.query(
        `SELECT id, name, price, duration_minutes
         FROM car_wash_addons
         WHERE vendor_id = ? AND is_available = 1
         ORDER BY display_order ASC, id ASC`,
        [vendorId]
      );
      // Customers only ever see the vendor's ACTIVE vehicle types.
      const [vehicleTypes] = await db.query(
        `SELECT id, name, description, extra_price, extra_minutes FROM car_wash_vehicle_types
         WHERE vendor_id = ? AND status = 'active' ORDER BY display_order ASC, id ASC`,
        [vendorId]
      );

      res.json({
        success: true,
        data: {
          vendor: {
            id: vendor.id,
            business_name: vendor.business_name || vendor.name,
            logo: vendor.logo,
            city: vendor.city,
            address: vendor.address,
            is_open: Boolean(vendor.is_open),
            opening_time: vendor.opening_time,
            closing_time: vendor.closing_time,
          },
          services: services.map((s) => ({
            ...s,
            base_price: toNum(s.base_price),
            estimated_minutes: Number(s.estimated_minutes || 0),
          })),
          addons: addons.map((a) => ({
            ...a, price: toNum(a.price), duration_minutes: Number(a.duration_minutes || 0),
          })),
          vehicle_types: vehicleTypes.map((v) => ({
            ...v,
            extra_price: toNum(v.extra_price),
            extra_minutes: Number(v.extra_minutes || 0),
          })),
        },
      });
    } catch (err) { fail(res, err); }
  }

  // ── Create a booking (all pricing computed server-side) ────────────────────
  static async createBooking(req, res) {
    let conn;
    try {
      await ensureCarWashSchema();
      const {
        vendor_id, service_id, addon_ids = [], vehicle_type_id,
        vehicle_type_name, vehicle_brand, vehicle_model, vehicle_plate, vehicle_color,
        scheduled_date, scheduled_time, service_address, notes, payment_phone,
      } = req.body;

      const customerInfo = await resolveCustomerDetails(req);
      const customerId = customerInfo.customer_id;
      const fullName = [customerInfo.first_name, customerInfo.last_name].filter(Boolean).join(' ').trim();
      const customerName = fullName || customerInfo.username || 'Customer';
      const phoneDigits = String(payment_phone || '').replace(/\D/g, '');
      const customerPhone = customerInfo.phone || phoneDigits || null;
      const custAddress = String(service_address || '').trim() || null;

      // ── Validation ───────────────────────────────────────────────────────
      const errors = {};
      if (phoneDigits.length < 7 || phoneDigits.length > 15) {
        errors.payment_phone = 'Enter a valid Waafi/EVC Plus number.';
      }
      if (!Number.isInteger(Number(vendor_id))) errors.vendor_id = 'Select a car wash vendor.';
      if (!Number.isInteger(Number(service_id))) errors.service_id = 'Select a service.';
      if (!String(vehicle_plate || '').trim()) errors.vehicle_plate = 'Plate number is required.';
      else if (String(vehicle_plate).trim().length > 20) errors.vehicle_plate = 'Plate number is too long.';
      if (!String(vehicle_type_name || '').trim() && !vehicle_type_id) {
        errors.vehicle_type = 'Select a vehicle type.';
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(scheduled_date || ''))) {
        errors.scheduled_date = 'Select a valid booking date.';
      }
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(scheduled_time || ''))) {
        errors.scheduled_time = 'Select a valid time slot.';
      }
      if (Object.keys(errors).length === 0) {
        // Validate the requested slot against the SERVER clock in the business
        // timezone. Previously only the date was checked, so a slot earlier
        // today (e.g. 08:00 booked at 18:00) was accepted.
        const check = validateScheduling(scheduled_date, scheduled_time, {
          graceMinutes: 2,
          maxDaysAhead: 365,
        });
        if (!check.valid) errors[check.field] = check.error;
      }
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ success: false, message: 'Please correct the highlighted fields.', errors });
      }

      // ── Pre-transaction reads (no conn held so pool can't deadlock) ──────
      // 1. Verify vendor
      console.log('[DEBUG createBooking] 1. Querying vendor...');
      const [[vendor]] = await db.query(
        `SELECT v.id, v.business_name, v.name, v.is_open, v.user_id
         FROM vendors v
         JOIN vendor_business_types vbt ON vbt.vendor_id = v.id
         JOIN business_types bt ON bt.id = vbt.business_type_id AND bt.name = ?
         WHERE v.id = ? AND v.verification_status = 'verified' AND v.status = 'active'`,
        [CAR_WASH_BUSINESS_TYPE, vendor_id]
      );
      if (!vendor) return res.status(400).json({ success: false, message: 'This car wash vendor is not available.' });
      if (!vendor.is_open) return res.status(400).json({ success: false, message: 'This vendor is currently closed and cannot take bookings.' });

      // 2. Verify service
      console.log('[DEBUG createBooking] 2. Querying service...');
      const [[service]] = await db.query(
        `SELECT * FROM car_wash_services
         WHERE id = ? AND vendor_id = ? AND status = 'active' AND is_available = 1`,
        [service_id, vendor_id]
      );
      if (!service) return res.status(400).json({ success: false, message: 'That service is no longer available.' });

      // 3. Vehicle type (optional)
      let vehicle = null;
      if (vehicle_type_id) {
        const [[v]] = await db.query(
          "SELECT * FROM car_wash_vehicle_types WHERE id = ? AND vendor_id = ? AND status = 'active'",
          [vehicle_type_id, vendor_id]
        );
        if (!v) return res.status(400).json({ success: false, message: 'The selected vehicle type is no longer available.' });
        vehicle = v;
      }

      // 4. Add-ons
      const ids = Array.isArray(addon_ids) ? addon_ids.map(Number).filter(Number.isInteger) : [];
      let addonRows = [];
      if (ids.length > 0) {
        const [rows] = await db.query(
          `SELECT * FROM car_wash_addons
           WHERE vendor_id = ? AND is_available = 1 AND id IN (${ids.map(() => '?').join(',')})`,
          [vendor_id, ...ids]
        );
        addonRows = rows;
        if (addonRows.length !== ids.length) return res.status(400).json({ success: false, message: 'One or more add-ons are unavailable.' });
      }

      // 5. Check worker slot availability
      console.log('[DEBUG createBooking] 3. Checking worker slot availability...');
      const availability = await CarWashModel.checkWorkerSlotAvailability({
        vendor_id,
        service_id,
        scheduled_date,
        scheduled_time,
      });

      if (!availability.available) {
        console.warn('[DEBUG createBooking] No worker available before payment', {
          vendor_id,
          service_id,
          scheduled_date,
          scheduled_time,
          availability,
        });
        return res.status(400).json({
          success: false,
          code: 'NO_WORKER_AVAILABLE',
          message: 'No worker is available at this time. Please choose another time.',
          suggestedSlots: availability.suggestedSlots,
          debug: availability.debug || null,
          errors: { time: 'No worker available at this time.' },
        });
      }

      // ── Server-side pricing (client totals are never trusted) ────────────
      console.log('[DEBUG createBooking] 4. Calculating pricing...');
      const basePrice = toNum(service.base_price);
      const vehiclePrice = vehicle ? toNum(vehicle.extra_price) : 0;
      const addonsPrice = addonRows.reduce((s, a) => s + toNum(a.price), 0);
      const discount = 0;
      const total = Math.max(0, basePrice + vehiclePrice + addonsPrice - discount);
      const duration = Number(service.estimated_minutes || 0) +
        (vehicle ? Number(vehicle.extra_minutes || 0) : 0) +
        addonRows.reduce((s, a) => s + Number(a.duration_minutes || 0), 0);

      const vehicleLabel = vehicle?.name || String(vehicle_type_name || '').trim();
      const vehicleDetails = [vehicle_brand, vehicle_model, vehicle_color]
        .map((x) => String(x || '').trim()).filter(Boolean).join(' • ');
      const noteParts = [
        vehicleDetails ? `Vehicle: ${vehicleDetails}` : null,
        service_address ? `Location: ${String(service_address).trim()}` : null,
        String(notes || '').trim() || null,
      ].filter(Boolean);

      // 6. Process payment BEFORE creating a visible booking for vendor
      console.log('[DEBUG createBooking] 5. Processing payment...');
      const io = req.app.get('io');
      let paymentResult;
      try {
        const provider = await PaymentProviders.resolveProvider(vendor_id, req.body?.payment_provider);
        const providerPayment = await provider.purchase({
          customerId,
          vendorId: vendor_id,
          payerAccount: phoneDigits,
          amount: Number(total),
          description: `Car service: ${service.name}`,
          idempotencyKey: `carwash_${customerId}_${vendor_id}_${scheduled_date}_${scheduled_time}_${Date.now()}`.replace(/[^a-z0-9_]/gi, '_').slice(0, 120),
        });
        const transactionRef = providerPayment.transactionId || providerPayment.referenceId || null;
        paymentResult = { status: 'paid', transactionRef };
        console.log('[DEBUG createBooking] 5. Payment authorized:', paymentResult);
      } catch (payErr) {
        const msg = String(payErr.message || '').toLowerCase();
        if (msg.includes('cancel') || msg.includes('user_cancel') || msg.includes('user cancelled') || msg.includes('closed')) {
          return res.status(200).json({
            success: false,
            status: 'cancelled',
            message: 'Payment was cancelled. No booking was created.',
          });
        }
        return res.status(400).json({
          success: false,
          status: 'failed',
          message: payErr.message || 'Payment could not be completed. Please try again.',
        });
      }

      // ── Now acquire transaction connection for atomic insert ──────────────
      console.log('[DEBUG createBooking] 6. Acquiring transaction...');
      conn = await db.getConnection();
      await conn.beginTransaction();

      // Re-verify availability inside the transaction (race-condition protection)
      const finalAvailability = await CarWashModel.checkWorkerSlotAvailability({
        vendor_id,
        service_id,
        scheduled_date,
        scheduled_time,
      });

      if (!finalAvailability.available) {
        await conn.rollback();
        conn.release();
        // Note: payment already processed — in production, issue refund here
        return res.status(400).json({
          success: false,
          code: 'NO_WORKER_AVAILABLE',
          message: 'No worker is available at this time. Please choose another time.',
          suggestedSlots: finalAvailability.suggestedSlots,
          debug: finalAvailability.debug || null,
        });
      }

      const bookingCode = await nextBookingReference(conn);

      // Insert confirmed paid booking
      const [result] = await conn.query(
        `INSERT INTO car_wash_bookings
           (vendor_id, booking_code, booking_reference, customer_id, customer_name, customer_phone,
            service_id, service_name, vehicle_type_id, vehicle_type_name, vehicle_plate, service_address,
            scheduled_date, scheduled_time, status,
            base_price, vehicle_price, addons_price, discount, total_price, payment_status, payment_ref, paid_at, notes, duration)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, 'paid', ?, NOW(), ?, ?)`,
        [
          vendor_id, bookingCode, bookingCode, customerId,
          customerName, customerPhone,
          service.id, service.name, vehicle?.id || null, vehicleLabel,
          String(vehicle_plate).trim().toUpperCase(), custAddress,
          scheduled_date, scheduled_time,
          basePrice, vehiclePrice, addonsPrice, discount, total,
          paymentResult.transactionRef,
          noteParts.join('\n') || null,
          duration,
        ]
      );
      const bookingId = result.insertId;

      for (const a of addonRows) {
        await conn.query(
          'INSERT INTO car_wash_booking_addons (booking_id, addon_id, name, price) VALUES (?, ?, ?, ?)',
          [bookingId, a.id, a.name, toNum(a.price)]
        );
      }

      await conn.commit();

      const createdBooking = {
        id: bookingId,
        booking_code: bookingCode,
        booking_reference: bookingCode,
        vendor_id,
        service_name: service.name,
        scheduled_date,
        scheduled_time,
        total_price: total,
        status: 'confirmed',
        payment_status: 'paid',
      };

      // Notify vendor ONLY when payment is verified & booking confirmed
      await notifyVendorOfBooking(io, createdBooking);

      res.status(201).json({
        success: true,
        status: 'paid',
        message: 'Payment successful. Your booking has been confirmed.',
        data: {
          ...createdBooking,
          payment: paymentResult,
          estimated_minutes: duration,
          scheduled_date,
          scheduled_time,
          vendor_name: vendor.business_name || vendor.name,
          service_name: service.name,
        },
      });
    } catch (err) {
      if (conn) { try { await conn.rollback(); } catch (_) { /* already rolled back */ } }
      fail(res, err);
    } finally {
      if (conn) conn.release();
    }
  }

  // ── My bookings ────────────────────────────────────────────────────────────
  static async listBookings(req, res) {
    try {
      await ensureCarWashSchema();
      const customerId = await resolveCustomerId(req);
      const [rows] = await db.query(
        `SELECT b.id, b.booking_code, b.status, b.payment_status, b.total_price,
                b.scheduled_date, b.scheduled_time, b.created_at,
                b.service_name, b.vehicle_type_name, b.vehicle_plate,
                w.name AS worker_name,
                COALESCE(v.business_name, v.name) AS vendor_name, v.logo AS vendor_logo
         FROM car_wash_bookings b
         LEFT JOIN car_wash_workers w ON w.id = b.worker_id
         LEFT JOIN vendors v ON v.id = b.vendor_id
         WHERE b.customer_id = ?
         ORDER BY b.created_at DESC LIMIT 200`,
        [customerId]
      );
      res.json({
        success: true,
        data: rows.map((r) => ({ ...r, total_price: toNum(r.total_price), module: 'car_wash' })),
      });
    } catch (err) { fail(res, err); }
  }

  // ── Single booking (ownership enforced) ────────────────────────────────────
  static async getBooking(req, res) {
    try {
      await ensureCarWashSchema();
      const customerId = await resolveCustomerId(req);
      const bookingId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(bookingId)) throw badRequest('Invalid booking.');

      const [[booking]] = await db.query(
        `SELECT b.*, w.name AS worker_name, w.phone AS worker_phone,
                COALESCE(v.business_name, v.name) AS vendor_name,
                v.logo AS vendor_logo, v.address AS vendor_address, v.city AS vendor_city
         FROM car_wash_bookings b
         LEFT JOIN car_wash_workers w ON w.id = b.worker_id
         LEFT JOIN vendors v ON v.id = b.vendor_id
         WHERE b.id = ? AND b.customer_id = ?`,
        [bookingId, customerId]
      );
      if (!booking) {
        // Same response whether it doesn't exist or belongs to someone else.
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }

      const [addons] = await db.query(
        'SELECT name, price FROM car_wash_booking_addons WHERE booking_id = ?',
        [bookingId]
      );

      res.json({
        success: true,
        data: {
          ...booking,
          base_price: toNum(booking.base_price),
          vehicle_price: toNum(booking.vehicle_price),
          addons_price: toNum(booking.addons_price),
          discount: toNum(booking.discount),
          total_price: toNum(booking.total_price),
          addons: addons.map((a) => ({ name: a.name, price: toNum(a.price) })),
          module: 'car_wash',
        },
      });
    } catch (err) { fail(res, err); }
  }

  // ── Retry a Waafi payment on an unpaid booking ─────────────────────────────
  static async payBooking(req, res) {
    try {
      await ensureCarWashSchema();
      const customerId = await resolveCustomerId(req);
      const bookingId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(bookingId)) throw badRequest('Invalid booking.');

      const phoneDigits = String(req.body.payment_phone || '').replace(/\D/g, '');
      if (phoneDigits.length < 7 || phoneDigits.length > 15) {
        return res.status(400).json({
          success: false,
          message: 'Please correct the highlighted fields.',
          errors: { payment_phone: 'Enter a valid Waafi/EVC Plus number.' },
        });
      }

      const [[booking]] = await db.query(
        'SELECT * FROM car_wash_bookings WHERE id = ? AND customer_id = ?',
        [bookingId, customerId]
      );
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }
      // Double-payment guard (waafiService is also idempotent per booking_code).
      if (booking.payment_status === 'paid') {
        return res.status(400).json({ success: false, message: 'This booking is already paid.' });
      }
      if (!['pending', 'confirmed'].includes(booking.status)) {
        throw badRequest(`A "${booking.status}" booking can no longer be paid.`);
      }

      const payment = await attemptBookingPayment({
        booking: {
          id: booking.id,
          vendor_id: booking.vendor_id,
          booking_code: booking.booking_code,
          service_name: booking.service_name,
          scheduled_date: String(booking.scheduled_date).split('T')[0],
          scheduled_time: booking.scheduled_time,
          total_price: booking.total_price,
        },
        customerId,
        payerPhone: phoneDigits,
        io: req.app.get('io'),
        providerId: req.body?.payment_provider,
      });

      res.json({ success: true, data: { id: booking.id, payment } });
    } catch (err) { fail(res, err); }
  }

  // ── Customer cancellation (only while still cancellable) ───────────────────
  static async cancelBooking(req, res) {
    try {
      await ensureCarWashSchema();
      const customerId = await resolveCustomerId(req);
      const bookingId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(bookingId)) throw badRequest('Invalid booking.');

      const [[booking]] = await db.query(
        'SELECT id, status FROM car_wash_bookings WHERE id = ? AND customer_id = ?',
        [bookingId, customerId]
      );
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

      // Mirrors the model-side cancellable statuses: terminal states and active
      // washes can't be cancelled by the customer; worker_assigned can still be cancelled.
      if (!['pending', 'confirmed', 'worker_assigned', 'payment_failed'].includes(booking.status)) {
        throw badRequest(`A "${booking.status}" booking can no longer be cancelled.`);
      }

      const result = await CarWashModel.cancelCustomerBooking(customerId, bookingId, req.body.reason || 'Cancelled by customer');
      if (result.error) {
        return res.status(400).json({ success: false, message: result.message });
      }
      res.json({ success: true, data: result.booking });
    } catch (err) { fail(res, err); }
  }

  // ── Customer Rating & Review ───────────────────────────────────────────
  static async rateBooking(req, res) {
    try {
      await ensureCarWashSchema();
      const customerId = await resolveCustomerId(req);
      const bookingId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(bookingId)) throw badRequest('Invalid booking.');

      const { rating, comment } = req.body;
      const updatedBooking = await CarWashModel.rateBooking(bookingId, customerId, rating, comment);
      
      const io = req.app.get('io');
      if (io) {
        try {
          io.to(`vendor_${updatedBooking.vendor_id}`).emit('car_wash_booking_updated', updatedBooking);
        } catch (_) {}
      }

      res.json({ success: true, data: updatedBooking });
    } catch (err) { fail(res, err); }
  }

  // ── Worker Slot Availability Check ─────────────────────────────────────
  static async checkAvailability(req, res) {
    try {
      await ensureCarWashSchema();
      const { vendor_id, service_id, scheduled_date, scheduled_time } = req.query;
      if (!vendor_id || !scheduled_date || !scheduled_time) {
        throw badRequest('Vendor ID, date, and time are required.');
      }
      const availability = await CarWashModel.checkWorkerSlotAvailability({
        vendor_id: Number(vendor_id),
        service_id: service_id ? Number(service_id) : null,
        scheduled_date,
        scheduled_time,
      });
      res.json({ success: true, data: availability });
    } catch (err) { fail(res, err); }
  }
}

module.exports = CustomerCarWashController;
// Exposed for targeted tests of the payment-success path.
module.exports.attemptBookingPayment = attemptBookingPayment;
