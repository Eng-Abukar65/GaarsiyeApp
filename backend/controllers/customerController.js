const CustomerModel = require('../models/customerModel');
const NotificationModel = require('../models/notificationModel');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const jwtSecret = require('../config/jwt');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { secureUpload } = require('../utils/uploadSecurity');

// ─── Customer photo upload ───────────────────────────────────────────────────
// The previous filter trusted the client's mimetype, and explicitly accepted
// application/octet-stream whenever the *filename* ended in an image extension
// (a Flutter workaround) — so any file renamed to .png was written to disk.
// Content verification removes the need for that workaround entirely: the real
// bytes decide, so octet-stream uploads from Flutter still work when they are
// genuinely images, and are rejected when they are not.
const uploadCustomerPhoto = secureUpload({
  destination: path.join(__dirname, '..', 'uploads', 'customer-photos'),
  prefix: 'photo',
  allowed: ['jpg', 'png', 'webp'],
  maxBytes: 5 * 1024 * 1024,
});



class CustomerController {
  static async register(req, res) {
    console.log('[Customer Register] Request received. Body:', JSON.stringify(req.body));
    const { name, email, password, phone, gender, latitude, longitude, city, area, address } = req.body;

    // 1. Full Name Validation
    if (!name || name.trim().length < 3 || !/^[a-zA-Z\s]+$/.test(name)) {
      return res.status(400).json({ message: 'Please enter a valid full name' });
    }

    // 2. Email Validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    // 3. Phone Number Validation
    if (!phone) {
      return res.status(400).json({ message: 'Please enter a valid phone number' });
    }
    const cleanPhone = phone.toString().replace(/\D/g, '');
    let finalPhone = cleanPhone;
    if (cleanPhone.length === 9 && cleanPhone.startsWith('61')) {
      finalPhone = '252' + cleanPhone;
    }

    if (finalPhone.length !== 12 || !finalPhone.startsWith('25261')) {
      return res.status(400).json({ message: 'Please enter a valid phone number' });
    }

    // 4. Password Strength Validation
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!password || password.length < 8 || !hasUppercase || !hasLowercase || !hasNumber) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and contain uppercase, lowercase, and a number' });
    }

    // 5. Gender Validation
    if (!gender || (gender !== 'male' && gender !== 'female')) {
      return res.status(400).json({ message: 'Please select your gender' });
    }

    // 6. Location Validation
    if (!city || !city.trim() || !area || !area.trim() || !address || !address.trim()) {
      return res.status(400).json({ message: 'Please select your delivery location' });
    }

    // 7. Duplicate Check
    try {
      // Check duplicate email
      const [existingEmail] = await db.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
      if (existingEmail.length > 0) {
        return res.status(409).json({ message: 'Email already registered. Please login.' });
      }

      // Check duplicate phone
      const [existingPhone] = await db.query('SELECT id FROM users WHERE phone = ?', [finalPhone]);
      if (existingPhone.length > 0) {
        return res.status(409).json({ message: 'Phone number already registered. Please use another number.' });
      }
    } catch (dbError) {
      console.error('[Customer Register] DB Query Error:', dbError.message);
      return res.status(500).json({ message: 'Validation duplicate check failed' });
    }

    try {
      const userId = await CustomerModel.register({ 
        name: name.trim(), 
        email: email.trim(), 
        password, 
        phone: finalPhone, 
        gender, 
        latitude, 
        longitude, 
        city: city.trim(), 
        area: area.trim(), 
        address: address.trim() 
      });
      console.log('[Customer Register] Success. userId:', userId);
      res.status(201).json({ message: 'Customer registered successfully', userId });
    } catch (error) {
      console.error('[Customer Register] DB Error:', error.message);
      if (error.code === 'ER_DUP_ENTRY') {
        if (error.message.includes('email')) {
          return res.status(409).json({ message: 'Email already registered. Please login.' });
        } else if (error.message.includes('phone')) {
          return res.status(409).json({ message: 'Phone number already registered. Please use another number.' });
        }
        return res.status(409).json({ message: 'Email or phone already registered.' });
      }
      res.status(500).json({ message: 'Registration failed' });
    }
  }

  static async login(req, res) {
    console.log('[Customer Login] Request received. Body:', JSON.stringify({ email: req.body.email }));
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required.' });
    }

    try {
      const user = await CustomerModel.findByEmailOrPhone(email);
      if (!user) {
        console.log('[Customer Login] No user found for:', email);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        console.log('[Customer Login] Password mismatch for:', email);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: user.id, role: 'customer' }, jwtSecret, { expiresIn: '24h' });
      console.log('[Customer Login] Success. userId:', user.id);
      res.json({ token, user: { id: user.id, name: user.username, email: user.email } });
    } catch (error) {
      console.error('[Customer Login] DB Error:', error.message);
      res.status(500).json({ message: 'Login failed' });
    }
  }

  static async getProfile(req, res) {
    try {
      const profile = await CustomerModel.getProfile(req.user.id);
      res.json(profile);
    } catch (error) {
      console.error('Customer Get Profile Error:', error);
      res.status(500).json({ message: 'Failed to fetch profile' });
    }
  }

  static async getProfileStats(req, res) {
    try {
      const stats = await CustomerModel.getProfileStats(req.user.id);
      if (!stats) {
        return res.status(404).json({ message: 'Customer profile not found' });
      }
      res.json(stats);
    } catch (error) {
      console.error('Customer Profile Stats Error:', error);
      res.status(500).json({ message: 'Failed to fetch profile statistics' });
    }
  }

  static async getNotifications(req, res) {
    try {
      const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
      if (!customer) {
        return res.status(404).json({ message: 'Customer profile not found' });
      }

      const notifications = await NotificationModel.getCustomerNotifications(customer.id, 100);
      res.json({ notifications });
    } catch (error) {
      console.error('Customer Get Notifications Error:', error);
      res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  }

  static async getUnreadNotificationsCount(req, res) {
    try {
      const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
      if (!customer) {
        return res.status(404).json({ message: 'Customer profile not found' });
      }

      const count = await NotificationModel.getUnreadCount(customer.id);
      res.json({ unread_count: count });
    } catch (error) {
      console.error('Customer Get Unread Notifications Count Error:', error);
      res.status(500).json({ message: 'Failed to fetch unread notifications count' });
    }
  }

  static async markNotificationRead(req, res) {
    try {
      const { id } = req.params;
      const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
      if (!customer) {
        return res.status(404).json({ message: 'Customer profile not found' });
      }

      const success = await NotificationModel.markCustomerNotificationRead(id, customer.id);
      if (success) {
        res.json({ success: true, message: 'Notification marked as read' });
      } else {
        res.status(404).json({ message: 'Notification not found' });
      }
    } catch (error) {
      console.error('Customer Mark Notification Read Error:', error);
      res.status(500).json({ message: 'Failed to mark notification as read' });
    }
  }

  static async markAllNotificationsRead(req, res) {
    try {
      const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
      if (!customer) {
        return res.status(404).json({ message: 'Customer profile not found' });
      }

      const count = await NotificationModel.markAllCustomerNotificationsRead(customer.id);
      res.json({ success: true, message: `${count} notifications marked as read`, count });
    } catch (error) {
      console.error('Customer Mark All Notifications Read Error:', error);
      res.status(500).json({ message: 'Failed to mark notifications as read' });
    }
  }

  static async registerNotificationToken(req, res) {
    try {
      const { fcm_token } = req.body;
      if (!fcm_token || String(fcm_token).trim() === '') {
        return res.status(400).json({ message: 'FCM token is required' });
      }
      await NotificationModel.updateUserFcmToken(req.user.id, fcm_token);
      res.json({ success: true, message: 'Notification token registered' });
    } catch (error) {
      console.error('Customer Register Notification Token Error:', error);
      res.status(500).json({ message: 'Failed to register notification token' });
    }
  }

  static async updateProfile(req, res) {
    try {
      const { gender } = req.body;
      if (gender !== undefined && gender !== 'male' && gender !== 'female') {
        return res.status(400).json({ message: 'Please select your gender' });
      }
      await CustomerModel.updateProfile(req.user.id, req.body);
      res.json({ message: 'Profile updated' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update profile' });
    }
  }

  static async uploadProfilePhoto(req, res) {
    try {
      if (!req.file) {
        console.error('[Photo Upload] No file in request. Multer fields:', req.files, 'Body:', req.body);
        return res.status(400).json({ message: 'No photo file uploaded' });
      }
      console.log('[Photo Upload] File received:', req.file.originalname, req.file.mimetype, req.file.size);
      const photoUrl = `/uploads/customer-photos/${req.file.filename}`;
      await CustomerModel.updateProfile(req.user.id, { photo_url: photoUrl });
      res.json({ message: 'Photo uploaded successfully', photo_url: photoUrl });
    } catch (error) {
      console.error('Customer Upload Photo Error:', error);
      res.status(500).json({ message: 'Failed to upload photo', detail: error.message });
    }
  }

  static async getAddresses(req, res) {
    try {
      const addresses = await CustomerModel.getAddresses(req.user.id);
      res.json(addresses);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch addresses' });
    }
  }

  static async createAddress(req, res) {
    try {
      const addressId = await CustomerModel.createAddress(req.user.id, req.body);
      res.status(201).json({ message: 'Address added', addressId });
    } catch (error) {
      res.status(500).json({ message: 'Failed to add address' });
    }
  }

  static async updateAddress(req, res) {
    try {
      await CustomerModel.updateAddress(req.params.id, req.user.id, req.body);
      res.json({ message: 'Address updated' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update address' });
    }
  }

  static async setDefaultAddress(req, res) {
    try {
      await CustomerModel.setDefaultAddress(req.params.id, req.user.id);
      res.json({ message: 'Default address updated' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to set default address' });
    }
  }

  static async deleteAddress(req, res) {
    try {
      const deleted = await CustomerModel.deleteAddress(req.params.id, req.user.id);
      if (!deleted) return res.status(404).json({ message: 'Address not found' });
      res.json({ message: 'Address deleted' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ message: error.message || 'Failed to delete address' });
    }
  }

  static async getVendors(req, res) {
    try {
      const vendors = await CustomerModel.getVendors();
      res.json(vendors);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch vendors' });
    }
  }

  static async getCategories(req, res) {
    try {
      const categories = await CustomerModel.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch categories' });
    }
  }

  static async getOffers(req, res) {
    try {
      const vendorId = req.query.vendor_id ? parseInt(req.query.vendor_id, 10) : null;
      const data = await CustomerModel.getActiveOffers(vendorId);
      res.json({ success: true, ...data });
    } catch (error) {
      console.error('Customer Get Offers Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch offers.' });
    }
  }

  static async getOfferFeed(req, res) {
    try {
      const data = await CustomerModel.getOfferFeed(req.user.id);
      res.json({ success: true, ...data });
    } catch (error) {
      console.error('Customer Get Offer Feed Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch offer feed.' });
    }
  }

  static async getOfferById(req, res) {
    try {
      const vendorId = req.query.vendor_id ? parseInt(req.query.vendor_id, 10) : null;
      const offer = await CustomerModel.getActiveOfferById(req.params.id, vendorId);
      if (!offer) {
        return res.status(404).json({ success: false, message: 'Offer not found' });
      }
      res.json({ success: true, offer });
    } catch (error) {
      console.error('Customer Get Offer By Id Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch offer.' });
    }
  }

  static async trackOfferAnalytics(req, res) {
    try {
      const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer profile not found' });
      }

      const offer = await CustomerModel.getActiveOfferById(req.params.id);
      if (!offer) {
        return res.status(404).json({ success: false, message: 'Offer not found' });
      }

      await CustomerModel.trackOfferEvent({
        offer,
        customerId: customer.id,
        eventType: req.body.event_type,
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Customer Track Offer Analytics Error:', error);
      res.status(400).json({ success: false, message: error.message || 'Failed to track offer event.' });
    }
  }

  static async favoriteVendor(req, res) {
    try {
      const success = await CustomerModel.favoriteVendor(req.user.id, req.params.vendorId);
      if (!success) {
        return res.status(400).json({ success: false, message: 'Unable to favorite vendor.' });
      }
      res.json({ success: true, message: 'Vendor favorited' });
    } catch (error) {
      console.error('Customer Favorite Vendor Error:', error);
      res.status(500).json({ success: false, message: 'Failed to favorite vendor.' });
    }
  }

  static async unfavoriteVendor(req, res) {
    try {
      await CustomerModel.unfavoriteVendor(req.user.id, req.params.vendorId);
      res.json({ success: true, message: 'Vendor removed from favorites' });
    } catch (error) {
      console.error('Customer Unfavorite Vendor Error:', error);
      res.status(500).json({ success: false, message: 'Failed to remove favorite vendor.' });
    }
  }

  static async getProductsByVendor(req, res) {
    const { vendorId } = req.params;
    const { category } = req.query;
    console.log(`[DEBUG] GET /api/customer/vendors/${vendorId}/products?category=${category}`);

    try {
      const products = await CustomerModel.getProductsByVendor(vendorId, category);
      console.log(`[DEBUG] Found ${products.length} products for vendor ${vendorId}`);

      res.json({
        success: true,
        data: products
      });
    } catch (error) {
      console.error('[DEBUG] Error in getProductsByVendor:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch products' 
      });
    }
  }

  static async getOrders(req, res) {
    try {
      const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
      const orders = await CustomerModel.getOrders(customer.id);
      res.json(orders);
    } catch (error) {
      console.error('Customer Get Orders Error:', error);
      res.status(500).json({ message: 'Failed to fetch orders' });
    }
  }

  static async createOrder(req, res) {
    const {
      vendor_id,
      delivery_address,
      payment_method,
      items,
      delivery_fee = 0,
      offer_id = null,
      delivery_latitude,
      delivery_longitude,
      latitude,
      longitude,
      delivery_phone,
      delivery_addresses,
      payment_phone
      , checkout_request_id
      , external_merchant_payment = false
      , effective_delivery_fee
    } = req.body;

    // --- INPUT GUARDS ---
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order must contain at least one item.' });
    }

    if (!payment_method || String(payment_method).trim() === '') {
      console.warn('[ORDER VALIDATION] payment_method is missing or empty');
      return res.status(400).json({ success: false, message: 'Please select a payment method.' });
    }

    try {
      await CustomerModel.ensureOfferSupportSchema();
      const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
      const io = req.app.get('io');

      const destinations = Array.isArray(delivery_addresses) && delivery_addresses.length > 0
        ? delivery_addresses
        : [{
            address_line: delivery_address,
            phone: delivery_phone,
            latitude: delivery_latitude ?? latitude,
            longitude: delivery_longitude ?? longitude
          }];
      const [customerUsers] = await db.query(
        'SELECT u.phone FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?',
        [customer.id]
      );
      const fallbackPhone = customerUsers[0]?.phone || '';
      if (destinations.some((destination) => !String(destination.address_line || '').trim())) {
        return res.status(400).json({ success: false, message: 'Every delivery point requires an address.' });
      }
      destinations.forEach((destination) => {
        destination.phone = String(destination.phone || fallbackPhone).trim();
      });
      if (destinations.some((destination) => !destination.phone)) {
        return res.status(400).json({ success: false, message: 'Every delivery point requires a phone number.' });
      }

      let resolvedVendorId = Number.parseInt(vendor_id, 10);
      const productIdsForVendorLookup = items
        .map((item) => Number.parseInt(item.product_id, 10))
        .filter((id) => Number.isInteger(id) && id > 0);

      let [vendorRows] = await db.query('SELECT latitude, longitude FROM vendors WHERE id = ?', [resolvedVendorId]);
      if (vendorRows.length === 0) {
        const [productVendorRows] = productIdsForVendorLookup.length > 0
          ? await db.query(
              `SELECT DISTINCT vendor_id
               FROM products
               WHERE id IN (${productIdsForVendorLookup.map(() => '?').join(',')})`,
              productIdsForVendorLookup
            )
          : [[]];

        if (productVendorRows.length === 1) {
          resolvedVendorId = Number(productVendorRows[0].vendor_id);
          [vendorRows] = await db.query('SELECT latitude, longitude FROM vendors WHERE id = ?', [resolvedVendorId]);
        }
      }

      if (vendorRows.length === 0) {
        console.warn(`[ORDER VALIDATION] Vendor id=${vendor_id} not found; product_ids=${productIdsForVendorLookup.join(',')}`);
        return res.status(409).json({
          success: false,
          code: 'STALE_ORDER_DATA',
          message: 'This product or vendor is no longer available. Please clear your cart and choose Has again.',
        });
      }
      const vendorLat = Number(vendorRows[0].latitude);
      const vendorLng = Number(vendorRows[0].longitude);
      let routeDistanceKm = 0;
      let previousLat = vendorLat;
      let previousLng = vendorLng;
      let hasCompleteRouteCoordinates = Number.isFinite(vendorLat) && Number.isFinite(vendorLng);
      for (const destination of destinations) {
        const nextLat = Number(destination.latitude);
        const nextLng = Number(destination.longitude);
        if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
          hasCompleteRouteCoordinates = false;
          continue;
        }
        const leg = CustomerModel.haversineDistanceKm(previousLat, previousLng, nextLat, nextLng);
        if (leg !== null) routeDistanceKm += leg;
        previousLat = nextLat;
        previousLng = nextLng;
      }
      const baseFee = Number(process.env.DELIVERY_BASE_FEE || 2);
      const perKmFee = Number(process.env.DELIVERY_PER_KM_FEE || 0.5);
      const automaticDeliveryFee = Number((baseFee + routeDistanceKm * perKmFee).toFixed(2));
      const requestedDeliveryFee = Number(delivery_fee);
      const hasClientDeliveryFee = delivery_fee !== undefined &&
        delivery_fee !== null &&
        delivery_fee !== '' &&
        Number.isFinite(requestedDeliveryFee) &&
        requestedDeliveryFee >= 0;
      const clientDeliveryFee = hasClientDeliveryFee
        ? Number(requestedDeliveryFee.toFixed(2))
        : null;
      const requestedEffectiveDeliveryFee = Number(effective_delivery_fee);
      const hasClientEffectiveDeliveryFee = effective_delivery_fee !== undefined &&
        effective_delivery_fee !== null &&
        effective_delivery_fee !== '' &&
        Number.isFinite(requestedEffectiveDeliveryFee) &&
        requestedEffectiveDeliveryFee >= 0;
      const clientEffectiveDeliveryFee = hasClientEffectiveDeliveryFee
        ? Number(requestedEffectiveDeliveryFee.toFixed(2))
        : null;

      if (req.body.payment_failed === true || String(req.body.payment_status || '').toLowerCase() === 'failed') {
        try {
          await NotificationModel.createAndSendUserNotification(
            req.user.id,
            'Payment failed',
            'Your payment could not be completed. Please try another method.',
            'payment_failed',
            null,
            io,
            { vendorId: resolvedVendorId }
          );
        } catch (notificationError) {
          console.error('Failed to send payment failure notification:', notificationError);
        }
        return res.status(402).json({ success: false, message: 'Payment failed. Please try another method.' });
      }

      // --- RE-FETCH EVERY PRODUCT FROM DB; NEVER TRUST FRONTEND PRICES ---
      // Validate item shapes first, then load all products in one batched query
      // (avoids one DB round-trip per line item).
      const validatedItems = [];
      const normalizedItems = [];
      for (const item of items) {
        const productId = item.product_id;
        const requestedQty = parseInt(item.quantity, 10);

        if (!productId || isNaN(requestedQty) || requestedQty <= 0) {
          return res.status(400).json({ success: false, message: 'Invalid order item: missing product_id or non-positive quantity.' });
        }
        normalizedItems.push({ productId, requestedQty });
      }

      const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
      const [productRows] = await db.query(
        `SELECT p.id, p.name, p.selling_price, p.is_active,
                COALESCE(i.stock, p.stock_quantity) AS available_stock
         FROM products p
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.id IN (${productIds.map(() => '?').join(',')})`,
        productIds
      );
      const productById = new Map(productRows.map((row) => [Number(row.id), row]));

      for (const { productId, requestedQty } of normalizedItems) {
        const product = productById.get(Number(productId));

        if (!product) {
          console.warn(`[ORDER VALIDATION] Product id=${productId} not found`);
          return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
        }

        // Validate active status
        if (!product.is_active) {
          console.warn(`[ORDER VALIDATION] Product id=${productId} is inactive`);
          return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
        }

        // Validate price
        const dbPrice = parseFloat(product.selling_price);
        if (isNaN(dbPrice) || dbPrice <= 0) {
          console.warn(`[ORDER VALIDATION] Product id=${productId} has invalid price: ${product.selling_price}`);
          return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
        }

        // Validate stock
        const dbStock = parseInt(product.available_stock, 10) || 0;
        if (dbStock <= 0) {
          console.warn(`[ORDER VALIDATION] Product id=${productId} is out of stock (stock=${dbStock})`);
          return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
        }

        if (requestedQty > dbStock) {
          console.warn(`[ORDER VALIDATION] Product id=${productId} requested qty ${requestedQty} exceeds stock ${dbStock}`);
          return res.status(400).json({ success: false, message: 'Insufficient stock for one or more items.' });
        }

        validatedItems.push({
          product_id: productId,
          quantity: requestedQty,
          // Always use DB price (original), never frontend price
          price: dbPrice,
          original_price: dbPrice
        });
      }

      // --- CALCULATE TOTALS SERVER-SIDE ---
      const subtotal = validatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const fee = clientEffectiveDeliveryFee !== null
        ? clientEffectiveDeliveryFee
        : (clientDeliveryFee !== null
            ? clientDeliveryFee
            : (hasCompleteRouteCoordinates ? automaticDeliveryFee : 0));

      if (subtotal <= 0) {
        console.warn(`[ORDER VALIDATION] Subtotal is zero or negative: ${subtotal}`);
        return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
      }

      const selectedOfferId = Number.parseInt(offer_id, 10);
      let selectedOffer = null;
      let applicableOffers = [];

      if (Number.isInteger(selectedOfferId) && selectedOfferId > 0) {
        selectedOffer = await CustomerModel.getActiveOfferById(selectedOfferId, resolvedVendorId);
        if (!selectedOffer) {
          return res.status(400).json({ success: false, message: 'Offer is no longer available.' });
        }
        if (Number(selectedOffer.vendor_id) !== Number(resolvedVendorId)) {
          return res.status(400).json({ success: false, message: 'Selected offer does not belong to this vendor.' });
        }
        applicableOffers = [selectedOffer];
      } else {
        const activeOffersData = await CustomerModel.getActiveOffers(resolvedVendorId);
        applicableOffers = activeOffersData.offers;
      }

      const { discountAmount, effectiveDeliveryFee, offerDescription } = CustomerModel.calculateOfferDiscount(applicableOffers, validatedItems, fee);

      // --- APPLY PER-ITEM DISCOUNTS AUTHORITATIVELY (SERVER-SIDE ONLY) ---
      // calculateOfferDiscount works on the subtotal level; we need to distribute
      // discounts per item so the model can persist them correctly in order_items.
      const enrichedItems = validatedItems.map((item) => {
        const origPrice = item.original_price;
        let itemDiscount = 0;
        let finalPrice = origPrice;

        // Check if any active offer applies to this specific item.
        for (const offer of applicableOffers) {
          if (offer.offer_type === 'free_delivery') continue;

          const scopedProductId = offer.product_id != null ? Number(offer.product_id) : null;
          if (Number.isInteger(scopedProductId) && scopedProductId > 0 && scopedProductId !== Number(item.product_id)) {
            continue;
          }

          if (offer.offer_type === 'product_specific' && !scopedProductId) {
            continue;
          }

          if (offer.offer_type === 'percentage' || offer.offer_type === 'product_specific') {
            const candidateDiscount = Number((origPrice * (Number(offer.discount_value) / 100)).toFixed(2));
            if (candidateDiscount > itemDiscount) {
              itemDiscount = candidateDiscount;
              finalPrice = Number((origPrice - itemDiscount).toFixed(2));
            }
          } else if (offer.offer_type === 'fixed_amount') {
            const lineSubtotal = origPrice * item.quantity;
            const itemRatio = scopedProductId ? 1 : lineSubtotal / subtotal;
            const lineDiscount = Math.min(Number(offer.discount_value) * itemRatio, lineSubtotal);
            const candidateDiscount = Number((lineDiscount / item.quantity).toFixed(2));
            if (candidateDiscount > itemDiscount) {
              itemDiscount = candidateDiscount;
              finalPrice = Number(Math.max(0, origPrice - itemDiscount).toFixed(2));
            }
          }
        }

        const discountPct = origPrice > 0 ? Number(((itemDiscount / origPrice) * 100).toFixed(4)) : 0;
        console.log(`[ORDER ITEM] product_id=${item.product_id} orig=${origPrice} discount=${itemDiscount} final=${finalPrice} pct=${discountPct}%`);

        return {
          ...item,
          price: finalPrice,         // effective unit price
          original_price: origPrice,
          discount_amount: itemDiscount,
          discount_percent: discountPct,
          final_price: finalPrice
        };
      });

      const discountedSubtotal = enrichedItems.reduce((sum, item) => sum + (item.final_price * item.quantity), 0);
      const grandTotal = Math.max(0, discountedSubtotal + effectiveDeliveryFee);

      if (grandTotal <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
      }

      console.log(`[ORDER] subtotal=${subtotal} discountedSubtotal=${discountedSubtotal} discountAmount=${discountAmount} fee=${effectiveDeliveryFee} grandTotal=${grandTotal}`);

      // Everything the order needs must be valid BEFORE any money moves. The
      // customer was previously charged first and the order built afterwards, so
      // a validation failure at insert time (e.g. a missing delivery address)
      // rolled the order back while the provider charge stayed committed —
      // money taken, no order, nothing in the vendor's queue.
      const primaryAddressLine = String(
        destinations?.[0]?.address_line || delivery_address || ''
      ).trim();
      if (!primaryAddressLine) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_DELIVERY_ADDRESS',
          message: 'A delivery address is required before payment.',
        });
      }
      if (Array.isArray(destinations)) {
        const badStop = destinations.findIndex(
          (d, i) => i > 0 && !String(d?.address_line || '').trim()
        );
        if (badStop !== -1) {
          return res.status(400).json({
            success: false,
            code: 'MISSING_DELIVERY_ADDRESS',
            message: `Destination ${badStop + 1} is missing an address.`,
          });
        }
      }

      const normalizedPaymentMethod = String(payment_method).trim().toLowerCase();
      const isCashPayment = ['cod', 'cash_on_delivery', 'cash on delivery'].includes(normalizedPaymentMethod);
      const isWaafiPayment = ['wallet', 'waafi', 'waafiy', 'evc plus', 'evc_plus'].includes(normalizedPaymentMethod);
      const isExternalMerchantPayment = external_merchant_payment === true &&
        ['evc plus', 'evc_plus', 'zaad', 'sahal'].includes(normalizedPaymentMethod);
      let providerPayment = null;
      let paymentStatus = 'pending'; // Default for online payments
      
      if (!isCashPayment && !isExternalMerchantPayment) {
        if (!isWaafiPayment) {
          return res.status(400).json({ success: false, message: 'This online payment method is not configured.' });
        }
        const WaafiService = require('../services/waafiService');
        providerPayment = await WaafiService.purchase({
          customerId: customer.id,
          vendorId: resolvedVendorId,
          payerAccount: payment_phone,
          amount: grandTotal,
          description: `LPG delivery for customer ${customer.id}`,
          idempotencyKey: checkout_request_id,
        });
        if (providerPayment?.existingOrderId) {
          return res.status(200).json({
            message: 'This checkout was already completed.',
            orderId: Number(providerPayment.existingOrderId),
            total_amount: grandTotal,
            discount_amount: discountAmount,
            delivery_fee: effectiveDeliveryFee,
            offer_description: offerDescription,
            offer_id: selectedOffer?.id || null,
            payment_status: 'paid',
            payment_transaction_id: providerPayment.transactionId || null,
            payment_reference_id: providerPayment.referenceId || null,
            payment_attempt_id: providerPayment.attemptId || null,
            idempotent_replay: true,
          });
        }
        // Keep payment_status as 'pending' for WAAFI (will be updated by callback)
        if (providerPayment?.status === 'successful') {
          paymentStatus = 'paid';
        }
      } else if (isCashPayment) {
        paymentStatus = 'pending'; // Cash on delivery - no payment yet
      }

      // Last line of defence: if the order still cannot be created after a
      // successful charge, surface it loudly and leave the paid attempt on
      // record (order_id NULL) so it can be reconciled or refunded. Never let a
      // paid customer receive a generic error with no trace.
      let orderId;
      try {
        orderId = await CustomerModel.createOrder({
        customer_id: customer.id,
        vendor_id: resolvedVendorId,
        total_amount: grandTotal,
        delivery_address,
        delivery_latitude: delivery_latitude ?? latitude,
        delivery_longitude: delivery_longitude ?? longitude,
        payment_method,
        payment_status: paymentStatus,
        delivery_fee: effectiveDeliveryFee,
        distance_km: routeDistanceKm,
        destinations,
        provider_payment: providerPayment,
        items: enrichedItems   // items now carry per-item discount data
        });
      } catch (orderError) {
        if (providerPayment?.status === 'successful') {
          console.error(
            '[ORDER][PAID-NO-ORDER] A successful payment could not be turned into an order. ' +
            `attemptId=${providerPayment.attemptId} txn=${providerPayment.transactionId || 'n/a'} ` +
            `customer=${customer.id} vendor=${resolvedVendorId} amount=${grandTotal} ` +
            `reason=${orderError.message}`
          );
          return res.status(500).json({
            success: false,
            code: 'PAID_BUT_ORDER_FAILED',
            message: 'Your payment went through but the order could not be created. '
              + 'Our team has been notified — please contact support with this reference.',
            payment_reference_id: providerPayment.referenceId || null,
            payment_transaction_id: providerPayment.transactionId || null,
          });
        }
        throw orderError;
      }

      if (providerPayment?.attemptId) {
        const WaafiService = require('../services/waafiService');
        await WaafiService.attachOrder(providerPayment.attemptId, orderId);
      }

      await db.query(
        `INSERT INTO vendor_notifications (vendor_id, order_id, title, message, type)
         VALUES (?, ?, 'New order assignment', ?, 'order_assigned')`,
        [resolvedVendorId, orderId, `Order #${orderId} has been assigned to your business.`]
      );
      if (io) {
        io.to(`vendor-${resolvedVendorId}`).emit('order-assignment-created', {
          order_id: orderId,
          vendor_id: Number(resolvedVendorId),
          assigned_at: new Date().toISOString(),
        });
      }

      if (io) {
        io.emit('inventory-updated', {
          vendor_id: Number(resolvedVendorId),
          product_ids: enrichedItems.map((item) => Number(item.product_id)),
        });
      }

      if (selectedOffer && (discountAmount > 0 || effectiveDeliveryFee < fee)) {
        CustomerModel.recordOfferRedemption(selectedOffer).catch((redemptionError) => {
          console.error('Failed to record offer redemption:', redemptionError);
        });
        CustomerModel.trackOfferEvent({
          offer: selectedOffer,
          customerId: customer.id,
          orderId,
          eventType: 'order',
          revenue: grandTotal,
        }).catch((analyticsError) => {
          console.error('Failed to record offer order analytics:', analyticsError);
        });
      }

      try {
        await NotificationModel.createAndSendUserNotification(
          req.user.id,
          'Order placed successfully',
          `Your order #${orderId} has been placed and is waiting for vendor confirmation.`,
          'order_created',
          orderId,
          io,
          { vendorId: resolvedVendorId, orderId }
        );
      } catch (notificationError) {
        console.error('Failed to send order notification:', notificationError);
      }

      if (!isCashPayment) {
        if (paymentStatus === 'paid') {
          // Immediate payment (e.g., successful WAAFI response)
          try {
            await NotificationModel.createAndSendUserNotification(
              req.user.id,
              'Payment successful',
              `Payment for order #${orderId} was successful.`,
              'payment_success',
              orderId,
              io,
              { vendorId: resolvedVendorId, orderId }
            );
          } catch (notificationError) {
            console.error('Failed to send payment success notification:', notificationError);
          }
        } else if (isWaafiPayment) {
          // Pending WAAFI payment
          try {
            await NotificationModel.createAndSendUserNotification(
              req.user.id,
              'Payment pending',
              `Please approve the EVC/WAAFI prompt on your phone for order #${orderId}.`,
              'payment_pending',
              orderId,
              io,
              { vendorId: resolvedVendorId, orderId }
            );
          } catch (notificationError) {
            console.error('Failed to send payment pending notification:', notificationError);
          }
        }
      }

      console.log(`[ORDER] Order ${orderId} placed for customer ${customer.id}, total=${grandTotal}, discount=${discountAmount}, fee=${effectiveDeliveryFee}, paymentStatus=${paymentStatus}`);
      res.status(201).json({
        message: 'Order placed successfully',
        orderId,
        total_amount: grandTotal,
        discount_amount: discountAmount,
        delivery_fee: effectiveDeliveryFee,
        offer_description: offerDescription,
        offer_id: selectedOffer?.id || null,
        payment_status: paymentStatus,
        payment_message: isWaafiPayment && paymentStatus === 'pending' ? 'Please approve the EVC/WAAFI prompt on your phone.' : undefined,
        payment_transaction_id: providerPayment?.transactionId || null,
        payment_reference_id: providerPayment?.referenceId || null,
        payment_attempt_id: providerPayment?.attemptId || null
      });
    } catch (error) {
      console.error('Customer Create Order Error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Failed to place order',
        response_code: error.responseCode || null,
      });
    }
  }

  static async getVendorsByProduct(req, res) {
    const { product } = req.query;
    try {
      const vendors = await CustomerModel.getVendorsByProduct(product);
      res.json(vendors);
    } catch (error) {
      console.error('Get Vendors By Product Error:', error);
      res.status(500).json({ message: 'Failed to fetch vendors for this product' });
    }
  }

  static async getOrderTracking(req, res) {
    const { id } = req.params;
    try {
      const tracking = await CustomerModel.getOrderTracking(id, req.user.id);
      if (!tracking) {
        return res.status(404).json({ message: 'Tracking info not found' });
      }
      res.json(tracking);
    } catch (error) {
      console.error('Get Order Tracking Error:', error);
      res.status(500).json({ message: 'Failed to fetch tracking information' });
    }
  }

  static async getDeliveryTracking(req, res) {
    const { id } = req.params;
    try {
      const tracking = await CustomerModel.getDeliveryTracking(id, req.user.id);
      if (!tracking) {
        return res.status(404).json({ message: 'Tracking info not found' });
      }
      res.json(tracking);
    } catch (error) {
      console.error('Get Delivery Tracking Error:', error);
      res.status(500).json({ message: 'Failed to fetch tracking information' });
    }
  }

  static async createOrderReview(req, res) {
    const { id } = req.params;
    try {
      const review = await CustomerModel.createOrderReview(req.user.id, id, req.body);
      res.status(review.updated ? 200 : 201).json({
        success: true,
        message: review.updated ? 'Review updated successfully.' : 'Review submitted successfully.',
        review,
      });
    } catch (error) {
      const message = error.message || 'Failed to submit review.';
      const status = [
        'invalid',
        'between',
        'not found',
        'after it has been delivered',
        'profile not found',
      ].some((part) => message.toLowerCase().includes(part)) ? 400 : 500;
      if (status === 400) {
        console.log('[Customer Review Validation]', message);
      } else {
        console.error('Create Order Review Error:', error);
      }
      res.status(status).json({ success: false, message });
    }
  }

  // ─── Customer Location Endpoints ──────────────────────────────────────────
  static async createOrUpdateLocation(req, res) {
    try {
      const { latitude, longitude, city, area, address } = req.body;
      if (!city || !city.trim() || !area || !area.trim() || !address || !address.trim()) {
        return res.status(400).json({ message: 'Please provide city, area, and address' });
      }
      await CustomerModel.saveLocation(req.user.id, {
        latitude: latitude || null,
        longitude: longitude || null,
        city: city.trim(),
        area: area.trim(),
        address: address.trim(),
      });
      res.json({ success: true, message: 'Location saved successfully' });
    } catch (error) {
      console.error('Customer Save Location Error:', error);
      res.status(500).json({ message: 'Failed to save location' });
    }
  }

  static async getCustomerLocation(req, res) {
    try {
      const location = await CustomerModel.getLocation(req.user.id);
      if (!location) {
        return res.status(404).json({ message: 'No location saved yet' });
      }
      res.json(location);
    } catch (error) {
      console.error('Customer Get Location Error:', error);
      res.status(500).json({ message: 'Failed to fetch location' });
    }
  }

  static async getSparePartsVendorsProducts(req, res) {
    console.log(`[DEBUG] GET /api/customer/spare-parts/vendors-products`);
    try {
      const data = await CustomerModel.getSparePartsVendorsProducts();
      console.log(`[DEBUG] Vendors count: ${data.length}`);
      data.forEach(v => {
        console.log(`[DEBUG] Vendor ${v.vendor_name} (ID: ${v.vendor_id}) has ${v.products.length} spare parts.`);
      });
      const responseBody = {
        success: true,
        data: data
      };
      console.log(`[DEBUG] Response body:`, JSON.stringify(responseBody, null, 2));
      res.json(responseBody);
    } catch (error) {
      console.error('[DEBUG] Error in getSparePartsVendorsProducts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch spare parts vendors and products'
      });
    }
  }

  static async getVendorsProductsByKeyword(req, res) {
    const keyword = String(req.query.product || req.query.category || '').trim();
    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'Product keyword is required',
      });
    }

    try {
      const data = await CustomerModel.getVendorsProductsByKeyword(keyword);
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('[DEBUG] Error in getVendorsProductsByKeyword:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vendor products',
      });
    }
  }

  static async handleWaafiPaymentCallback(req, res) {
    try {
      const { responseCode, transactionId, referenceId, invoiceId, responseMsg } = req.body;
      
      console.log(`[WAAFI CALLBACK] Received: code=${responseCode}, transactionId=${transactionId}, referenceId=${referenceId}, message=${responseMsg}`);

      if (!referenceId) {
        console.warn('[WAAFI CALLBACK] Missing referenceId in callback');
        return res.status(400).json({ success: false, message: 'Missing referenceId' });
      }

      // Find the payment attempt
      const [attempts] = await db.query(
        'SELECT * FROM payment_attempts WHERE reference_id = ?',
        [referenceId]
      );

      if (!attempts || attempts.length === 0) {
        console.warn(`[WAAFI CALLBACK] No payment attempt found for referenceId=${referenceId}`);
        return res.status(404).json({ success: false, message: 'Payment attempt not found' });
      }

      const attempt = attempts[0];
      const SUCCESS_CODE = '2001';
      const isSuccessful = responseCode === SUCCESS_CODE;
      const newStatus = isSuccessful ? 'successful' : (responseCode === '5310' ? 'cancelled' : 'failed');

      console.log(`[WAAFI CALLBACK] Updating payment attempt ID=${attempt.id}: status=${newStatus}, code=${responseCode}`);

      // Update payment attempt
      await db.query(
        `UPDATE payment_attempts 
         SET status = ?, response_code = ?, provider_transaction_id = ?, response_message = ?, raw_response = ?
         WHERE id = ?`,
        [newStatus, responseCode, transactionId || null, responseMsg || null, JSON.stringify(req.body), attempt.id]
      );

      // If order exists, update order payment status
      if (attempt.order_id) {
        const orderPaymentStatus = isSuccessful ? 'paid' : (newStatus === 'cancelled' ? 'pending' : 'failed');
        await db.query(
          'UPDATE orders SET payment_status = ? WHERE id = ?',
          [orderPaymentStatus, attempt.order_id]
        );

        console.log(`[WAAFI CALLBACK] Updated order ${attempt.order_id}: payment_status=${orderPaymentStatus}`);

        // Send notification to customer
        try {
          const notificationTitle = isSuccessful ? 'Payment confirmed' : (newStatus === 'cancelled' ? 'Payment cancelled' : 'Payment failed');
          const notificationMessage = isSuccessful 
            ? `Payment for order #${attempt.order_id} was confirmed.`
            : (newStatus === 'cancelled'
              ? `Payment for order #${attempt.order_id} was cancelled. Please try again or use another payment method.`
              : `Payment for order #${attempt.order_id} failed. Please try again.`);

          await NotificationModel.createAndSendUserNotification(
            attempt.customer_id,
            notificationTitle,
            notificationMessage,
            isSuccessful ? 'payment_success' : 'payment_failed',
            attempt.order_id,
            null,
            { orderId: attempt.order_id }
          );
        } catch (notificationError) {
          console.error('[WAAFI CALLBACK] Failed to send notification:', notificationError);
        }
      }

      res.json({ success: true, message: 'Payment callback processed' });
    } catch (error) {
      console.error('[WAAFI CALLBACK] Error:', error);
      res.status(500).json({ success: false, message: 'Failed to process payment callback' });
    }
  }
}

CustomerController.uploadCustomerPhotoMiddleware = uploadCustomerPhoto.single('photo');
module.exports = CustomerController;
