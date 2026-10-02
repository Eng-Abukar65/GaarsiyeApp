const VendorModel = require('../models/vendorModel');
const NotificationModel = require('../models/notificationModel');
const CustomerModel = require('../models/customerModel');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const jwtSecret = require('../config/jwt');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { ensureVendorSchema } = require('../utils/vendorSchema');
const { normalizeStatus, isKnownStatus, canTransition, allowedNext } = require('../config/orderStatus');
const { isEmail, isPhone, isName, isNonEmpty, lenBetween, isPositiveNumber, isNonNegativeNumber, collect } = require('../utils/validators');

const parseBusinessTypes = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      // fall back to comma-separated values
    }
    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const getUploadedDocumentPath = (file) => {
  if (!file) return '';
  return `/uploads/vendor-documents/${file.filename}`;
};

const ALLOWED_VENDOR_BUSINESS_TYPES = new Set([
  'Petrol Station',
  'Gas Depot',
  'Spare Parts Shop',
  'Car Services',
  'Car Wash',
]);

class VendorController {

  /**
   * Resolves the correct vendors.id from the JWT.
   * Vendor tokens carry vendors.id. Never reinterpret the same numeric claim as
   * users.id because the two tables can contain identical IDs for different people.
   */
  static async resolveVendorId(req) {
    if (req.user?.role !== 'vendor') {
      const err = new Error('Unauthorized: Vendor access required.');
      err.statusCode = 403;
      throw err;
    }

    const tokenId = req.user?.vendor_id || req.user?.id;

    // The vendor JWT is signed with vendor.id directly, so tokenId IS the vendor_id.
    // Verify it exists in vendors table to be safe.
    if (tokenId) {
      const [direct] = await db.query('SELECT id FROM vendors WHERE id = ?', [tokenId]);
      if (direct.length > 0) {
        return tokenId;
      }
    }

    if (req.user?.id) {
      const [byUser] = await db.query('SELECT id FROM vendors WHERE user_id = ?', [req.user.id]);
      if (byUser.length > 0) return byUser[0].id;
    }

    if (req.user?.email) {
      const [byEmail] = await db.query('SELECT id FROM vendors WHERE email = ?', [req.user.email]);
      if (byEmail.length > 0) return byEmail[0].id;
    }

    console.warn('[VENDOR] Could not resolve vendor_id');
    const err = new Error('Unauthorized: Vendor ID could not be resolved.');
    err.statusCode = 401;
    throw err;
  }

  // â”€â”€â”€ PRODUCTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getProducts(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const products = await VendorModel.getProducts(vendorId);
      res.json(products);
    } catch (error) {
      console.error('Vendor Get Products Error:', error);
      res.status(500).json({ message: 'Failed to fetch products' });
    }
  }

  static async createProduct(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const productData = { ...req.body, vendor_id: vendorId };
      if (req.file) {
        productData.image_url = `/uploads/products/${req.file.filename}`;
      }

      // Check category - block Car Services from being added as physical products
      if (productData.category_id) {
        const [catRows] = await db.query('SELECT name FROM categories WHERE id = ?', [productData.category_id]);
        if (catRows.length > 0) {
          const catName = String(catRows[0].name || '').trim().toLowerCase();
          if (['car wash', 'car service', 'car services'].includes(catName)) {
            return res.status(400).json({
              success: false,
              message: 'Car Services cannot be added as physical products. Please manage services on the Car Services page.'
            });
          }
        }
      }

      // Field validation
      const errors = collect({
        name: !lenBetween(productData.name, 2, 120) ? 'Product name is required (2â€“120 characters).' : null,
        selling_price: !isPositiveNumber(productData.selling_price) ? 'Selling price must be greater than 0.' : null,
        cost_price: productData.cost_price !== undefined && productData.cost_price !== '' && !isNonNegativeNumber(productData.cost_price)
          ? 'Cost price must be 0 or more.' : null,
      });
      if (errors) return res.status(400).json({ success: false, message: 'Validation failed.', errors });

      // Validate is_active vs stock (stock must be a valid non-negative number)
      const is_active = req.body.is_active === 'true' || req.body.is_active === '1' || req.body.is_active === 1 || req.body.is_active === true || req.body.is_active === undefined;
      const stock_quantity = parseInt(req.body.stock_quantity ?? req.body.stock ?? 0, 10);
      if (!Number.isFinite(stock_quantity) || stock_quantity < 0) {
        return res.status(400).json({ success: false, message: 'Stock must be a whole number of 0 or more.', errors: { stock_quantity: 'Stock must be 0 or more.' } });
      }

      productData.is_active = is_active;
      productData.stock_quantity = stock_quantity;

      const productId = await VendorModel.createProduct(productData);
      res.status(201).json({ success: true, message: 'Product created successfully', productId });
    } catch (error) {
      console.error('Vendor Create Product Error:', error);
      res.status(500).json({ success: false, message: 'Failed to create product' });
    }
  }

  static async updateProduct(req, res) {
    const { id } = req.params;
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const productData = { ...req.body };
      if (req.file) {
        productData.image_url = `/uploads/products/${req.file.filename}`;
      }

      // Check category - block Car Services from being updated as physical products
      if (productData.category_id) {
        const [catRows] = await db.query('SELECT name FROM categories WHERE id = ?', [productData.category_id]);
        if (catRows.length > 0) {
          const catName = String(catRows[0].name || '').trim().toLowerCase();
          if (['car wash', 'car service', 'car services'].includes(catName)) {
            return res.status(400).json({
              success: false,
              message: 'Car Services cannot be saved as physical products. Please manage services on the Car Services page.'
            });
          }
        }
      }

      // Validate selling_price > 0 if provided
      if (productData.selling_price !== undefined) {
        const sellingPrice = parseFloat(productData.selling_price);
        if (isNaN(sellingPrice) || sellingPrice <= 0) {
          return res.status(400).json({ success: false, message: 'Product price must be greater than zero.' });
        }
      }

      // Validate is_active vs stock
      if (productData.is_active !== undefined) {
        const is_active = productData.is_active === 'true' || productData.is_active === '1' || productData.is_active === 1 || productData.is_active === true;
        productData.is_active = is_active;
        if (is_active) {
          // Fetch current stock from database
          const [rows] = await db.query(
            `SELECT COALESCE(i.stock, p.stock_quantity, 0) AS stock
             FROM products p
             LEFT JOIN inventory i ON p.id = i.product_id
             WHERE p.id = ? AND p.vendor_id = ?`,
            [id, vendorId]
          );
          if (rows.length > 0) {
            const currentStock = parseInt(rows[0].stock, 10);
            if (currentStock < 0) {
              return res.status(400).json({ success: false, message: 'Cannot enable a product with invalid stock.' });
            }
          }
        }
      }

      const success = await VendorModel.updateProduct(id, vendorId, productData);
      if (success) {
        const io = req.app.get('io');
        if (io) io.emit('inventory-updated', { vendor_id: vendorId, product_id: Number(id) });
        res.json({ success: true, message: 'Product updated successfully' });
      } else {
        res.status(404).json({ success: false, message: 'Product not found' });
      }
    } catch (error) {
      console.error('Vendor Update Product Error:', error);
      res.status(500).json({ success: false, message: 'Failed to update product' });
    }
  }

  static async deleteProduct(req, res) {
    const { id } = req.params;
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const result = await VendorModel.deleteProduct(id, vendorId);
      if (result.status === 'not_found') {
        return res.status(404).json({ success: false, message: 'Product not found or not yours' });
      }
      res.json({ success: true, archived: result.status === 'archived', message: `Product ${result.status}` });
    } catch (error) {
      console.error('Vendor Delete Product Error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
  }

  static async getCategories(req, res) {
    try {
      const categories = await VendorModel.getCategories();
      res.json(categories);
    } catch (error) {
      console.error('Vendor Get Categories Error:', error);
      res.status(500).json({ message: 'Failed to fetch categories' });
    }
  }

  // â”€â”€â”€ ORDERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getOrders(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const orders = await VendorModel.getOrders(vendorId);
      res.json(orders);
    } catch (error) {
      console.error('Vendor Get Orders Error:', error);
      res.status(500).json({ message: 'Failed to fetch orders' });
    }
  }

  // â”€â”€â”€ Delivery proof for one of the vendor's own orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The driver uploads a proof photo (and/or verifies the delivery code); the
  // vendor views it here. Strictly scoped: the order must belong to this vendor.
  static async getDeliveryProof(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const orderId = Number.parseInt(req.params.orderId, 10);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ success: false, message: 'A valid order id is required.' });
      }

      const db = require('../config/db');
      const [rows] = await db.query(
        `SELECT d.proof_image_url, d.delivery_proof_url, d.status AS delivery_status, d.delivered_at,
                d.delivery_proof_uploaded_at, d.delivery_code_verified_at,
                TRIM(CONCAT(COALESCE(dr.first_name, ''), ' ', COALESCE(dr.last_name, ''))) AS driver_name
         FROM orders o
         JOIN deliveries d ON d.order_id = o.id
         LEFT JOIN drivers dr ON dr.id = d.driver_id
         WHERE o.id = ? AND o.vendor_id = ?
         ORDER BY d.id DESC
         LIMIT 1`,
        [orderId, vendorId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No delivery found for this order.' });
      }

      const row = rows[0];
      return res.json({
        success: true,
        data: {
          photoUrl: row.delivery_proof_url || row.proof_image_url || null,
          deliveryStatus: row.delivery_status || null,
          uploadedAt: row.delivery_proof_uploaded_at || row.delivered_at || null,
          driverName: (row.driver_name || '').trim() || null,
          codeVerified: Boolean(row.delivery_code_verified_at),
        },
      });
    } catch (error) {
      console.error('Vendor Get Delivery Proof Error:', error);
      res.status(500).json({ success: false, message: 'Failed to load the delivery proof.' });
    }
  }

  // â”€â”€â”€ Single order detail (vendor-scoped) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async getOrderDetail(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const rawId = req.params.id;

      if (!rawId) {
        return res.status(400).json({ success: false, message: 'Order ID is required.' });
      }

      // Support numeric ID (15) or reference format ("ORD-0015", "ORD-15")
      const cleanDigits = String(rawId).replace(/\D/g, '');
      const orderId = Number.parseInt(cleanDigits, 10);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid order ID format.' });
      }

      // Step 1: Check if the order exists in the database
      const [existing] = await db.query(
        'SELECT id, vendor_id FROM orders WHERE id = ?',
        [orderId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: `Order #${String(orderId).padStart(4, '0')} was not found.` });
      }

      const orderRecord = existing[0];

      // Step 2: Check vendor ownership strictly
      if (String(orderRecord.vendor_id) !== String(vendorId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Order belongs to another vendor.' });
      }

      // Step 3: Fetch full base order with customer, delivery, and driver info
      const [orders] = await db.query(
        `SELECT o.*,
                CONCAT('ORD-', LPAD(o.id, 4, '0')) AS order_reference,
                COALESCE(
                  NULLIF(TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))), ''),
                  u.username,
                  u.phone,
                  'Guest'
                ) AS customer_name,
                u.phone AS customer_phone,
                u.email AS customer_email,
                addr.area AS landmark,
                COALESCE(o.delivery_address, addr.address_line) AS resolved_delivery_address,
                del.id  AS delivery_id,
                del.status AS delivery_status,
                del.created_at AS delivery_assigned_at,
                d.id         AS driver_id,
                d.first_name AS driver_first_name,
                d.last_name  AS driver_last_name,
                COALESCE(du.phone, d.emergency_contact_phone) AS driver_phone,
                d.vehicle_type AS driver_vehicle
         FROM orders o
         LEFT JOIN customers c    ON c.id  = o.customer_id
         LEFT JOIN users     u    ON u.id  = c.user_id
         LEFT JOIN addresses addr ON addr.id = o.address_id
         LEFT JOIN deliveries del ON del.order_id = o.id
         LEFT JOIN drivers    d   ON d.id  = del.driver_id
         LEFT JOIN users     du   ON du.id = d.user_id
         WHERE o.id = ? AND o.vendor_id = ?`,
        [orderId, vendorId]
      );

      if (orders.length === 0) {
        return res.status(404).json({ success: false, message: 'Order details not found.' });
      }

      const order = orders[0];

      if (!order.delivery_address && order.resolved_delivery_address) {
        order.delivery_address = order.resolved_delivery_address;
      }

      // Fetch order items with product names.
      const [items] = await db.query(
        `SELECT oi.id,
                oi.product_id,
                p.name AS product_name,
                oi.quantity,
                COALESCE(oi.unit_price, 0) AS price,
                oi.original_price,
                oi.discount_amount,
                oi.subtotal
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?`,
        [orderId]
      );

      // Fetch multi-stop destinations if present.
      const [destinations] = await db.query(
        `SELECT id, address_line AS address, phone, latitude, longitude, sequence
         FROM order_destinations
         WHERE order_id = ?
         ORDER BY sequence ASC`,
        [orderId]
      ).catch(() => [[]]);

      res.json({
        success: true,
        data: {
          ...order,
          items,
          destinations,
        },
      });
    } catch (error) {
      console.error('[VENDOR] getOrderDetail error:', error);
      const status = error.statusCode || 500;
      res.status(status).json({ success: false, message: status < 500 ? error.message : 'Failed to fetch order detail.' });
    }
  }

  static async acceptOrder(req, res) {
    const { id } = req.params;
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const success = await VendorModel.acceptOrder(id, vendorId);
      if (success) {
        const [rows] = await db.query(
          `SELECT c.id as customer_id, u.id as user_id, o.id as order_id, o.vendor_id
           FROM orders o
           JOIN customers c ON o.customer_id = c.id
           JOIN users u ON c.user_id = u.id
           WHERE o.id = ? AND o.vendor_id = ?`,
          [id, vendorId]
        );
        if (rows.length > 0) {
          const io = req.app.get('io');
          await NotificationModel.createAndSendCustomerNotification({
            customerId: rows[0].customer_id,
            userId: rows[0].user_id,
            vendorId: rows[0].vendor_id,
            orderId: rows[0].order_id,
            title: 'Order accepted',
            message: `Your order #${rows[0].order_id} has been accepted by the vendor.`,
            type: 'order_accepted',
            io,
          });
        }
        res.json({ success: true, message: 'Order accepted successfully' });
      } else {
        res.status(400).json({ success: false, message: 'Order not found or not pending' });
      }
    } catch (error) {
      console.error('Vendor Accept Order Error:', error);
      res.status(500).json({ success: false, message: 'Failed to accept order' });
    }
  }

  static async updateOrderStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const target = normalizeStatus(status);
      if (!isKnownStatus(target)) {
        return res.status(400).json({ success: false, message: 'Invalid order status.' });
      }

      // Ownership + legal-transition enforcement: only this vendor's order,
      // and only along the allowed status graph.
      const [rows] = await db.query('SELECT status FROM orders WHERE id = ? AND vendor_id = ?', [id, vendorId]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      const current = normalizeStatus(rows[0].status);
      if (!canTransition(current, target)) {
        return res.status(409).json({
          success: false,
          message: `Illegal status change: "${current}" cannot move to "${target}".`,
          currentStatus: current,
          allowedNext: allowedNext(current),
        });
      }

      const success = await VendorModel.updateOrderStatus(id, vendorId, target);
      if (success) {
        if (target === 'cancelled') {
          const DriverModel = require('../models/driverModel');
          const releasedDriverIds = await DriverModel.releaseDriversForOrder(Number(id));
          const io = req.app.get('io');
          for (const driverId of releasedDriverIds) {
            io?.to(`vendor-${vendorId}`).emit('driver-availability-updated', {
              driver_id: driverId,
              order_id: Number(id),
              availability_status: 'released',
            });
          }
        }
        res.json({ success: true, message: `Order status updated to ${target}`, status: target });
      } else {
        res.status(404).json({ success: false, message: 'Order not found' });
      }
    } catch (error) {
      console.error('Vendor Update Order Status Error:', error);
      res.status(500).json({ message: 'Failed to update order status' });
    }
  }

  // â”€â”€â”€ INVENTORY & PURCHASES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getInventory(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const inventory = await VendorModel.getInventory(vendorId);
      res.json(inventory);
    } catch (error) {
      console.error('Vendor Get Inventory Error:', error);
      res.status(500).json({ message: 'Failed to fetch inventory' });
    }
  }

  static async getPurchases(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const purchases = await VendorModel.getPurchases(vendorId);
      res.json(purchases);
    } catch (error) {
      console.error('Vendor Get Purchases Error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch purchases',
        error: error.message,
        stack: error.stack
      });
    }
  }

  static async createPurchase(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const { product_id, quantity, supplier_id, cost_price, selling_price, invoice_number, reference_number, notes, purchase_date } = req.body;

    if (!product_id || !supplier_id) {
      return res.status(400).json({ success: false, message: 'Product and supplier are required.' });
    }

    // Numeric validation â€” prevents negative/zero stock movements and bad pricing.
    const errors = {};
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) errors.quantity = 'Quantity must be greater than 0.';
    if (cost_price !== undefined && cost_price !== '' && (!Number.isFinite(Number(cost_price)) || Number(cost_price) < 0)) {
      errors.cost_price = 'Cost price must be 0 or more.';
    }
    if (selling_price !== undefined && selling_price !== '' && (!Number.isFinite(Number(selling_price)) || Number(selling_price) <= 0)) {
      errors.selling_price = 'Selling price must be greater than 0.';
    }
    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, message: 'Validation failed.', errors });
    }

    try {
      const calcs = await VendorModel.createPurchase(vendorId, {
        product_id, quantity, supplier_id, cost_price, selling_price,
        invoice_number: invoice_number || reference_number,
        reference_number: reference_number || invoice_number,
        notes, purchase_date
      });
      const io = req.app.get('io');
      if (io) io.emit('inventory-updated', { vendor_id: vendorId, product_id: Number(product_id) });
      res.status(201).json({
        success: true,
        message: 'Purchase logged and stock updated successfully.',
        data: calcs
      });
    } catch (error) {
      console.error('Vendor Create Purchase Error:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to create purchase' });
    }
  }

  // â”€â”€â”€ SUPPLIERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getSuppliers(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const suppliers = await VendorModel.getSuppliers(vendorId);
      res.json(suppliers);
    } catch (error) {
      console.error('Vendor Get Suppliers Error:', error);
      res.status(500).json({ message: 'Failed to fetch suppliers' });
    }
  }

  static async createSupplier(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const { business_name, name, email, phone, location, supplier_types } = req.body;
    const supplierName = business_name || name;
    const errors = collect({
      business_name: !lenBetween(supplierName, 2, 100) ? 'Supplier name is required (2â€“100 characters).' : null,
      location: !isNonEmpty(location) ? 'Location is required.' : null,
      email: email && !isEmail(email) ? 'Enter a valid email address.' : null,
      phone: phone && !isPhone(phone) ? 'Enter a valid phone number.' : null,
      supplier_types: (!Array.isArray(supplier_types) || supplier_types.length === 0) ? 'Select at least one Supplier Type.' : null,
    });
    if (errors) return res.status(400).json({ success: false, message: 'Validation failed.', errors });
    try {
      const supplierId = await VendorModel.createSupplier(vendorId, req.body);
      res.status(201).json({ success: true, message: 'Supplier created successfully', supplierId });
    } catch (error) {
      console.error('Vendor Create Supplier Error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Failed to create supplier'
      });
    }
  }

  static async updateSupplier(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const supplierId = req.params.id;
    const { business_name, name, email, phone, location, supplier_types } = req.body;
    const supplierName = business_name || name;
    const errors = collect({
      business_name: !lenBetween(supplierName, 2, 100) ? 'Supplier name is required (2â€“100 characters).' : null,
      location: !isNonEmpty(location) ? 'Location is required.' : null,
      email: email && !isEmail(email) ? 'Enter a valid email address.' : null,
      phone: phone && !isPhone(phone) ? 'Enter a valid phone number.' : null,
      supplier_types: (!Array.isArray(supplier_types) || supplier_types.length === 0) ? 'Select at least one Supplier Type.' : null,
    });
    if (errors) return res.status(400).json({ success: false, message: 'Validation failed.', errors });
    try {
      const updated = await VendorModel.updateSupplier(vendorId, supplierId, req.body);
      if (!updated) return res.status(404).json({ success: false, message: 'Supplier not found.' });
      res.json({ success: true, message: 'Supplier updated successfully' });
    } catch (error) {
      console.error('Vendor Update Supplier Error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Failed to update supplier'
      });
    }
  }

  static async deleteSupplier(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const deleted = await VendorModel.deleteSupplier(vendorId, req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Supplier not found.' });
      res.json({ success: true, message: 'Supplier deleted safely.' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to delete supplier.' });
    }
  }

  // â”€â”€â”€ DELIVERIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getDeliveriesTracking(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const DriverModel = require('../models/driverModel');
      await DriverModel.ensurePresenceSchema();
      const [rows] = await db.query(`
        SELECT d.id as delivery_id, o.id as order_id, d.status,
               CONCAT(dr.first_name, ' ', dr.last_name) as driver_name, u_dr.phone as driver_phone,
               dr.current_lat as driver_latitude, dr.current_lng as driver_longitude,
               IF(dr.is_online = 1 AND COALESCE(dr.last_seen_at, dr.last_seen) >= DATE_SUB(NOW(), INTERVAL 2 MINUTE), 1, 0) as driver_is_online,
               dr.last_seen as driver_last_seen,
               COALESCE(c.first_name, u_cust.username, 'Customer') as customer_name,
               COALESCE(u_cust.phone, 'No phone') as customer_phone,
               COALESCE(a.address_line, od.address_line, o.delivery_address, 'No address') as customer_address,
               COALESCE(a.latitude, od.latitude) as customer_latitude,
               COALESCE(a.longitude, od.longitude) as customer_longitude,
               v.latitude as vendor_latitude, v.longitude as vendor_longitude
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        JOIN users u_cust ON c.user_id = u_cust.id
        JOIN vendors v ON o.vendor_id = v.id
        LEFT JOIN drivers dr ON d.driver_id = dr.id
        LEFT JOIN users u_dr ON dr.user_id = u_dr.id
        LEFT JOIN addresses a ON o.address_id = a.id
        LEFT JOIN order_destinations od ON od.order_id = o.id AND od.sequence_no = 1
        WHERE o.vendor_id = ? AND d.status IN ('assigned', 'accepted', 'picked_up', 'on_the_way', 'driver assigned', 'on the way')
      `, [vendorId]);


      const trackingData = rows.map(r => ({
        delivery_id: r.delivery_id,
        order_id: r.order_id,
        driver_name: r.driver_name || 'Unassigned Driver',
        driver_phone: r.driver_phone || 'No phone',
        driver_is_online: Boolean(r.driver_is_online),
        driver_last_seen: r.driver_last_seen,
        driver_latitude: r.driver_latitude ? parseFloat(r.driver_latitude) : 2.0469,
        driver_longitude: r.driver_longitude ? parseFloat(r.driver_longitude) : 45.3182,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        customer_address: r.customer_address,
        customer_latitude: r.customer_latitude ? parseFloat(r.customer_latitude) : 2.0480,
        customer_longitude: r.customer_longitude ? parseFloat(r.customer_longitude) : 45.3200,
        vendor_latitude: r.vendor_latitude ? parseFloat(r.vendor_latitude) : 2.0450,
        vendor_longitude: r.vendor_longitude ? parseFloat(r.vendor_longitude) : 45.3150,
        status: r.status === 'driver assigned' ? 'assigned' : (r.status === 'on the way' ? 'on_the_way' : r.status)
      }));

      res.json(trackingData);
    } catch (error) {
      console.error('Vendor Get Deliveries Tracking Error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch deliveries tracking',
        error: error.message,
        stack: error.stack
      });
    }
  }

  static async getDeliveries(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const [rows] = await db.query(`
        SELECT d.*, o.total_amount, o.status as order_status, o.distance_km, o.delivery_fee,
               o.payment_method, o.created_at as order_created_at,
               COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), u.username, 'Customer') as customer_name,
               u.phone as customer_phone,
               COALESCE(a.address_line, od.address_line, o.delivery_address, 'No address') as customer_address,
               dr.first_name as driver_first_name, dr.last_name as driver_last_name,
               u_dr.phone as driver_phone,
               dr.vehicle_type, dr.plate_number as license_plate, dr.is_online, dr.last_seen
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        JOIN users u ON c.user_id = u.id
        LEFT JOIN drivers dr ON d.driver_id = dr.id
        LEFT JOIN users u_dr ON dr.user_id = u_dr.id
        LEFT JOIN addresses a ON o.address_id = a.id
        LEFT JOIN order_destinations od ON od.order_id = o.id AND od.sequence_no = 1
        WHERE o.vendor_id = ?
        ORDER BY d.created_at DESC
      `, [vendorId]);
      res.json(rows);
    } catch (error) {
      console.error('Vendor Get Deliveries Error:', error);
      // Try simpler query if joins fail (no deliveries table data yet)
      res.json([]);
    }
  }

  // â”€â”€â”€ DRIVERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getDrivers(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const DriverModel = require('../models/driverModel');
      // getAllDrivers returns ALL drivers for fleet management (unfiltered by online status)
      const drivers = await DriverModel.getAllDrivers(vendorId);
      res.json(drivers);
    } catch (error) {
      console.error('Vendor Get Drivers Error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch drivers',
        error: error.message,
        stack: error.stack
      });
    }
  }

  static async getAvailableDrivers(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const DriverModel = require('../models/driverModel');
      const drivers = await DriverModel.getAllAvailableDrivers(vendorId);
      res.json({ success: true, drivers });
    } catch (error) {
      console.error('Vendor Get Available Drivers Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch available drivers' });
    }
  }

  static async createDriver(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const { 
      username, email, phone, first_name, last_name, vehicle_type, plate_number,
      address, dob, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone,
      sponsor_name, sponsor_phone, sponsor_address, password
    } = req.body;

    const driverName = [first_name, last_name].filter(Boolean).join(' ').trim() || username;
    const errors = collect({
      first_name: !isNonEmpty(first_name) ? 'First name is required.' : (/\d/.test(String(first_name)) ? 'First name cannot include numbers.' : null),
      last_name: !isNonEmpty(last_name) ? 'Last name is required.' : (/\d/.test(String(last_name)) ? 'Last name cannot include numbers.' : null),
      sponsor_name: !isNonEmpty(sponsor_name) ? 'Sponsor name is required.' : (/\d/.test(String(sponsor_name)) ? 'Sponsor name cannot include numbers.' : null),
      email: !isEmail(email) ? 'A valid email address is required.' : null,
      phone: phone && !isPhone(phone) ? 'Enter a valid phone number.' : null,
    });
    if (errors) return res.status(400).json({ success: false, message: 'Validation failed.', errors });

    try {
      const crypto = require('crypto');
      const { sendInitialPassword } = require('../utils/emailService');
      const DriverModel = require('../models/driverModel');
      const manualPassword = String(password || '').trim();
      if (manualPassword && manualPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Delivery password must be at least 6 characters.' });
      }
      const initialPassword = manualPassword || crypto.randomBytes(18).toString('base64url');
      const password_hash = await bcrypt.hash(initialPassword, 12);
      const driverId = await DriverModel.createDriver({
        username, email, phone, password_hash,
        first_name, last_name, vehicle_type, plate_number,
        vendor_id: vendorId,
        address, dob, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone,
        sponsor_name, sponsor_phone, sponsor_address
      });

      let emailSent = false;
      if (!manualPassword) {
        try {
          await sendInitialPassword({ email, name: `${first_name || ''} ${last_name || ''}`.trim(), password: initialPassword });
          emailSent = true;
        } catch (emailErr) {
          console.warn('[WARN] SMTP not configured - initial driver password logged below:');
          console.warn(`[DRIVER EMAIL] Initial-password delivery failed for driver ${driverId}.`);
        }
      }

      res.status(201).json({ 
        success: true, 
        message: manualPassword
          ? 'Driver created successfully. Delivery password was set manually.'
          : emailSent
          ? 'Driver created successfully. Credentials sent via email.'
          : 'Driver created successfully. Email is not configured, share the temporary password manually.',
        driverId,
        initialPassword: (manualPassword || emailSent) ? undefined : initialPassword,
        emailSent
      });
    } catch (error) {
      console.error('Vendor Create Driver Error:', error);
      const duplicateEmail = error.code === 'ER_DUP_ENTRY' && String(error.message || '').includes('email');
      res.status(error.statusCode || (duplicateEmail ? 409 : 500)).json({
        success: false,
        message: duplicateEmail
          ? 'This email is already registered. Use a different email for this driver.'
          : (error.message || 'Failed to create driver')
      });
    }
  }

  static async updateDriver(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const driverId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(driverId) || driverId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid driver id.' });
    }

    try {
      const DriverModel = require('../models/driverModel');
      const payload = { ...(req.body || {}) };
      const nameErrors = collect({
        first_name: payload.first_name !== undefined && /\d/.test(String(payload.first_name)) ? 'First name cannot include numbers.' : null,
        last_name: payload.last_name !== undefined && /\d/.test(String(payload.last_name)) ? 'Last name cannot include numbers.' : null,
        sponsor_name: payload.sponsor_name !== undefined && /\d/.test(String(payload.sponsor_name)) ? 'Sponsor name cannot include numbers.' : null,
      });
      if (nameErrors) return res.status(400).json({ success: false, message: 'Validation failed.', errors: nameErrors });
      const newPassword = String(payload.password || '').trim();
      if (!newPassword) {
        return res.status(400).json({ success: false, message: 'Password is required.', errors: { password: 'Password is required.' } });
      }
      if (newPassword) {
        if (newPassword.length < 6) {
          return res.status(400).json({ success: false, message: 'Delivery password must be at least 6 characters.' });
        }
        payload.password_hash = await bcrypt.hash(newPassword, 12);
      }
      delete payload.password;
      await DriverModel.updateDriver(driverId, vendorId, payload);
      res.json({ success: true, message: 'Driver updated successfully.' });
    } catch (error) {
      console.error('Vendor Update Driver Error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to update driver.'
      });
    }
  }

  static async assignDriver(req, res) {
    const { orderId } = req.params;
    const { driverId } = req.body;
    const vendorId = await VendorController.resolveVendorId(req);

    try {
      const [order] = await db.query('SELECT id FROM orders WHERE id = ? AND vendor_id = ?', [orderId, vendorId]);
      if (order.length === 0) {
        return res.status(404).json({ success: false, message: 'Order not found for this vendor' });
      }
      const DriverModel = require('../models/driverModel');
      await DriverModel.assignDriverToOrder(orderId, driverId, vendorId);
      const [rows] = await db.query(
        `SELECT c.id as customer_id, u.id as user_id, o.id as order_id, o.vendor_id,
                COALESCE(CONCAT(dr.first_name, ' ', dr.last_name), dr.first_name, 'your driver') as driver_name
         FROM orders o
         JOIN customers c ON o.customer_id = c.id
         JOIN users u ON c.user_id = u.id
         LEFT JOIN drivers dr ON dr.id = ?
         WHERE o.id = ?`,
        [driverId, orderId]
      );
      if (rows.length > 0) {
        const driverName = rows[0].driver_name || 'Your driver';
        const io = req.app.get('io');
        await NotificationModel.createAndSendCustomerNotification({
          customerId: rows[0].customer_id,
          userId: rows[0].user_id,
          vendorId: rows[0].vendor_id,
          orderId: rows[0].order_id,
          title: 'Driver assigned to your order',
          message: `${driverName} has been assigned to your order #${rows[0].order_id}.`,
          type: 'driver_assigned',
          io,
        });
      }
      res.json({ success: true, message: 'Driver assigned successfully' });
    } catch (error) {
      console.error('Vendor Assign Driver Error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to assign driver',
      });
    }
  }

  // â”€â”€â”€ DELIVERY OFFERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async sendDeliveryOffer(req, res) {
    const { orderId } = req.params;
    const { driverId, offeredAmount } = req.body;
    const vendorId = await VendorController.resolveVendorId(req);

    // Validate input
    const amount = parseFloat(offeredAmount);
    if (!driverId) {
      return res.status(400).json({ success: false, message: 'Driver is required.' });
    }
    if (!offeredAmount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Driver earning must be a positive number.' });
    }
    // Max 2 decimal places
    if (!/^\d+(\.\d{1,2})?$/.test(String(offeredAmount).trim())) {
      return res.status(400).json({ success: false, message: 'Amount may have at most 2 decimal places.' });
    }

    try {
      const DriverModel = require('../models/driverModel');
      const { offerId, order, driver } = await DriverModel.createValidatedOffer({
        orderId: Number(orderId),
        driverId: Number(driverId),
        vendorId: Number(vendorId),
        offeredAmount: amount,
      });

      // Build notification message
      const orderLabel = `#ORD-${String(orderId).padStart(4, '0')}`;
      const driverName = `${driver.first_name} ${driver.last_name}`.trim();
      const notificationTitle = 'ðŸšš NEW DELIVERY OFFER';
      const notificationBody =
        `Order ${orderLabel}\n` +
        `Pickup: ${order.vendor_address || 'Vendor location'}\n` +
        `Drop-off: ${order.delivery_address || 'Customer location'}\n` +
        (order.estimated_distance ? `Distance: ${order.estimated_distance} km\n` : '') +
        `You will earn: $${amount.toFixed(2)}\n\n` +
        `Would you like to accept this delivery?`;

      // Real-time Socket.IO notification to driver
      const io = req.app.get('io');
      if (io) {
        io.to(`driver-${driverId}`).emit('delivery-offer', {
          offer_id: offerId,
          order_id: Number(orderId),
          order_label: orderLabel,
          vendor_name: order.vendor_name,
          pickup_location: order.vendor_address,
          customer_destination: order.delivery_address,
          estimated_distance: order.estimated_distance,
          offered_amount: amount,
          title: notificationTitle,
          message: notificationBody,
          type: 'delivery_offer',
        });
        console.log(`[OFFER] Socket.IO event sent to driver-${driverId} for offer #${offerId}`);
      }

      // FCM push notification to driver
      const NotificationModel = require('../models/notificationModel');
      NotificationModel.sendDriverPushNotification(
        Number(driverId),
        notificationTitle,
        `Order ${orderLabel} â€” You will earn: $${amount.toFixed(2)}`,
        {
          type: 'delivery_offer',
          offer_id: String(offerId),
          order_id: String(orderId),
          offered_amount: String(amount.toFixed(2)),
        }
      ).catch((err) => console.error('[OFFER] FCM push failed:', err.message));

      const driverFullName = `${driver.first_name} ${driver.last_name}`.trim();
      return res.json({
        success: true,
        message: `Delivery offer sent successfully to ${driverFullName} for $${amount.toFixed(2)}.`,
        offer_id: offerId,
        driver_name: driverFullName,
        offered_amount: amount,
      });
    } catch (error) {
      console.error('[OFFER] sendDeliveryOffer error:', error);
      const status = error.statusCode || 500;
      return res.status(status).json({ success: false, message: error.message || 'Failed to send delivery offer.' });
    }
  }

  static async getDeliveryOffer(req, res) {
    const { orderId } = req.params;
    const vendorId = await VendorController.resolveVendorId(req);

    try {
      // Verify order belongs to vendor
      const [orderCheck] = await db.query(
        'SELECT id FROM orders WHERE id = ? AND vendor_id = ?',
        [orderId, vendorId]
      );
      if (orderCheck.length === 0) {
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }

      const DriverModel = require('../models/driverModel');
      const offer = await DriverModel.getOrderOffer(orderId);
      return res.json({ success: true, offer: offer || null });
    } catch (error) {
      console.error('[OFFER] getDeliveryOffer error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch offer.' });
    }
  }

  static async getOrderRejections(req, res) {
    const { orderId } = req.params;
    try {
      const DriverModel = require('../models/driverModel');
      const rejections = await DriverModel.getRejectionHistory(orderId);
      res.json({ success: true, orderId: Number(orderId), rejections });
    } catch (error) {
      console.error('Get Order Rejections Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch rejection history' });
    }
  }

  // â”€â”€â”€ DASHBOARD & REPORTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getDashboardStats(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);

    try {
      const stats = await VendorModel.getStats(vendorId);
      const orders = await VendorModel.getOrders(vendorId);

      const dashboardData = {
        ...stats,
        recent_orders: orders.slice(0, 5)
      };

      res.json({ success: true, data: dashboardData });
    } catch (error) {
      console.error('Vendor Get Stats Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch dashboard statistics' });
    }
  }

  static async getNotifications(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      res.json(await VendorModel.getVendorNotifications(vendorId));
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch vendor notifications.' });
    }
  }

  static async markNotificationRead(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const updated = await VendorModel.markVendorNotificationRead(vendorId, req.params.id);
      if (!updated) return res.status(404).json({ message: 'Notification not found.' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update notification.' });
    }
  }

  static async getReports(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const stats = await VendorModel.getStats(vendorId);
      const [sales] = await db.query(`
        SELECT DATE(created_at) as date, SUM(total_amount) as amount
        FROM orders
        WHERE vendor_id = ? AND LOWER(status) = 'delivered'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, [vendorId]);

      res.json({ summary: stats, sales_chart: sales });
    } catch (error) {
      console.error('Vendor Get Reports Error:', error);
      res.status(500).json({ message: 'Failed to fetch reports' });
    }
  }

  static async getSalesSummary(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const summary = await VendorModel.getSalesSummary(vendorId);
      res.json(summary);
    } catch (error) {
      console.error('Get Sales Summary Error:', error);
      res.status(500).json({ message: 'Failed to fetch sales summary.' });
    }
  }

  static async getCommissions(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const commissions = await VendorModel.getCommissions(vendorId);
      res.json(commissions);
    } catch (error) {
      console.error('Get Vendor Commissions Error:', error);
      res.status(500).json({ message: 'Failed to fetch commissions.' });
    }
  }

  static async getLpgMonitoring(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      res.json(await VendorModel.getLpgMonitoring(vendorId));
    } catch (error) {
      console.error('Get LPG Monitoring Error:', error);
      res.status(500).json({ message: 'Failed to fetch LPG monitoring.' });
    }
  }

  static async updateCustomerLpgLevel(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const level = await VendorModel.updateCustomerLpgLevel(vendorId, req.params.customerId, req.body);
      const io = req.app.get('io');
      if (io) {
        io.to(`vendor-${vendorId}`).emit('lpg-level-updated', level);
        io.to(`customer-${req.params.customerId}`).emit('lpg-level-updated', level);
      }
      res.json({ success: true, level });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to update LPG level.' });
    }
  }

  // â”€â”€â”€ PROFILE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getProfile(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const vendor = await VendorModel.getProfile(vendorId);
      if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
      res.json({ success: true, vendor });
    } catch (error) {
      console.error('Vendor Get Profile Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }
  }

  static async getSettings(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const settings = await VendorModel.getSettings(vendorId);
      res.json({ success: true, settings });
    } catch (error) {
      console.error('Vendor Get Settings Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
  }

  static async updateSettings(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const settings = await VendorModel.updateSettings(vendorId, req.body || {});
      res.json({ success: true, message: 'Settings saved successfully', settings });
    } catch (error) {
      console.error('Vendor Update Settings Error:', error);
      res.status(500).json({ success: false, message: 'Failed to save settings' });
    }
  }

  static async updatePassword(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const { current_password, new_password } = req.body || {};

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    }

    if (String(new_password).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    try {
      await VendorModel.updatePassword(vendorId, current_password, new_password);
      res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error) {
      const message = error.message || 'Failed to update password.';
      const status = message.toLowerCase().includes('incorrect') || message.toLowerCase().includes('not found') ? 400 : 500;
      if (status === 400) {
      } else {
        console.error('Vendor Password Update Error:', error);
      }
      res.status(status).json({ success: false, message });
    }
  }

  static async getReviews(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const data = await VendorModel.getReviews(vendorId);
      res.json({ success: true, ...data });
    } catch (error) {
      console.error('Vendor Get Reviews Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch reviews.' });
    }
  }

  static async updateProfile(req, res) {
    try {
      // The vendor is always taken from the token, never from the URL. The
      // :vendorId segment is optional and kept only for older clients that
      // still send it; when present it must agree with the token.
      const vendorId = await VendorController.resolveVendorId(req);

      if (req.params.vendorId !== undefined) {
        const requestedVendorId = Number(req.params.vendorId);
        if (!Number.isInteger(requestedVendorId) || requestedVendorId <= 0) {
          return res.status(400).json({ success: false, message: 'Invalid vendor id.' });
        }
        if (Number(vendorId) !== requestedVendorId) {
          return res.status(403).json({
            success: false,
            message: 'You can only update your own vendor profile.',
          });
        }
      }

      const success = await VendorModel.updateProfile(vendorId, req.body);
      if (success) {
        const vendor = await VendorModel.getProfile(vendorId);
        res.json({ success: true, message: 'Profile updated successfully', vendor });
      } else {
        res.status(404).json({ success: false, message: 'Vendor not found' });
      }
    } catch (error) {
      console.error('Vendor Update Profile Error:', error.message);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Failed to update profile',
      });
    }
  }

  static async uploadLogo(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }
      const logoPath = `/uploads/vendor-logos/${req.file.filename}`;
      await db.query('UPDATE vendors SET logo = ?, logo_url = ? WHERE id = ?', [logoPath, logoPath, vendorId]);
      const vendor = await VendorModel.getProfile(vendorId);
      res.json({ success: true, logo: logoPath, logo_url: logoPath, vendor });
    } catch (error) {
      console.error('Vendor Upload Logo Error:', error);
      res.status(500).json({ success: false, message: 'Failed to upload logo' });
    }
  }

  // â”€â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    try {
      await ensureVendorSchema();
      const vendor = await VendorModel.findByEmail(email);
      if (!vendor) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, vendor.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const verificationStatus = String(vendor.verification_status || 'pending').toLowerCase();
      if (verificationStatus !== 'verified') {
        const statusMessages = {
          pending: 'Vendor account is pending admin verification. Please wait for approval.',
          rejected: 'Vendor account was rejected by admin. Please contact support.',
          suspended: 'Vendor account is suspended. Please contact support.'
        };

        return res.status(403).json({
          message: statusMessages[verificationStatus] || 'Vendor account is not approved yet.'
        });
      }

      // Token stores vendor.id (NOT users.id) so resolveVendorId works correctly
      const token = jwt.sign(
        { id: vendor.id, vendor_id: vendor.id, role: 'vendor', email: vendor.email },
        jwtSecret,
        { expiresIn: '24h' }
      );

      // Update online status for vendor specifically in vendors table (in case user_id is null)
      await db.query('UPDATE vendors SET is_online = 1, last_seen = NOW(), last_login = NOW() WHERE id = ?', [vendor.id]);
      
      let effectiveUserId = vendor.user_id;
      
      // Auto-link if user_id is null but matching user email exists
      if (!effectiveUserId) {
        const [matchingUsers] = await db.query('SELECT id FROM users WHERE email = ?', [vendor.email]);
        if (matchingUsers.length > 0) {
          effectiveUserId = matchingUsers[0].id;
          await db.query('UPDATE vendors SET user_id = ? WHERE id = ?', [effectiveUserId, vendor.id]);
        }
      }

      // Update online status for vendor's user if linked
      if (effectiveUserId) {
        await db.query('UPDATE users SET is_online = 1, last_seen = NOW(), last_login = NOW() WHERE id = ?', [effectiveUserId]);
      }

      const profile = await VendorModel.getProfile(vendor.id);

      let mustChangePassword = false;
      try {
        const [userRows] = await db.query(
          'SELECT must_change_password FROM users WHERE id = ? OR email = ?',
          [vendor.user_id || 0, vendor.email]
        );
        if (userRows.length > 0) {
          mustChangePassword = Boolean(userRows[0].must_change_password);
        }
      } catch (dbErr) {
        console.error('Failed to query must_change_password status', dbErr);
      }

      res.json({
        token,
        must_change_password: mustChangePassword,
        vendor: profile || {
          id: vendor.id,
          name: vendor.name || vendor.business_name,
          business_name: vendor.business_name || vendor.name,
          email: vendor.email,
          logo: vendor.logo || vendor.logo_url || '',
          logo_url: vendor.logo || vendor.logo_url || ''
        }
      });
    } catch (error) {
      console.error('Vendor Login Error:', error);
      res.status(500).json({ message: 'Login failed' });
    }
  }

  static async forgotPassword(req, res) {
    const { email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email format.' });
    }

    const genericResponse = {
      success: true,
      message: 'If an account exists for this email, password reset instructions have been sent.',
    };

    try {
      const { ensurePasswordResetTokensTable } = require('../utils/vendorSchema');
      await ensurePasswordResetTokensTable();

      // Account lookup in central users table + vendor relationship
      const [userRows] = await db.query(
        `SELECT u.id AS user_id, u.email, u.status AS user_status,
                v.id AS vendor_id, v.business_name, v.name AS vendor_name
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         LEFT JOIN vendors v ON (v.user_id = u.id OR LOWER(v.email) = LOWER(u.email))
         WHERE LOWER(u.email) = ?
           AND r.name = 'vendor'
           AND (u.status IS NULL OR u.status = 'active')
         LIMIT 1`,
        [normalizedEmail]
      );

      let targetUser = userRows[0] || null;

      if (!targetUser) {
        const [vendorRows] = await db.query(
          `SELECT v.id AS vendor_id, v.user_id, v.email, v.business_name, v.name AS vendor_name
           FROM vendors v
           WHERE LOWER(v.email) = ?
             AND (v.status IS NULL OR v.status <> 'deleted')
           LIMIT 1`,
          [normalizedEmail]
        );
        if (vendorRows.length > 0) {
          const vRow = vendorRows[0];
          const [uRows] = await db.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [normalizedEmail]);
          if (uRows.length > 0) {
            targetUser = {
              user_id: uRows[0].id,
              email: normalizedEmail,
              vendor_id: vRow.vendor_id,
              business_name: vRow.business_name || vRow.vendor_name,
            };
          }
        }
      }

      // Vendor records created before login accounts may not have a linked user.
      // Notify the admin so the request can still be handled manually.
      if (!targetUser) {
        const [legacyVendorRows] = await db.query(
          'SELECT id, email, business_name, name FROM vendors WHERE LOWER(email) = ? LIMIT 1',
          [normalizedEmail]
        );
        if (legacyVendorRows.length > 0) {
          const legacyVendor = legacyVendorRows[0];
          try {
            const NotificationModel = require('../models/notificationModel');
            await NotificationModel.createAdminNotification({
              title: 'Vendor Forgot Password',
              message: `Vendor ${legacyVendor.email || normalizedEmail} has forgotten their password and requested help.`,
              category: 'security',
              severity: 'info',
              type: 'vendor_password_reset',
              relatedId: `vendor-${legacyVendor.id}`,
              targetUrl: '/admin/vendors?vendorId=' + legacyVendor.id + '&action=reset-password',
              io: req.app.get('io'),
            });
          } catch (_) {}
        }
        return res.json(genericResponse);
      }

      // Generate secure 32-byte raw token and SHA-256 hash
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // Expires in 15 minutes
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // Invalidate existing unused tokens for this user
      await db.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
        [targetUser.user_id]
      ).catch(() => {});

      await db.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [targetUser.user_id, tokenHash, expiresAt]
      );

      const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
      const frontendUrl = process.env.VENDOR_FRONTEND_URL || process.env.VENDOR_APP_URL || process.env.FRONTEND_URL || origin || 'http://localhost:5173';
      const resetUrl = `${frontendUrl.replace(/\/$/, '')}/vendor/reset-password?token=${rawToken}`;

      // Log Admin Security Notification
      try {
        const NotificationModel = require('../models/notificationModel');
        await NotificationModel.createAdminNotification({
          title: 'Vendor Forgot Password',
          message: `Vendor ${targetUser.email || normalizedEmail} has forgotten their password and requested a reset.`,
          category: 'security',
          severity: 'info',
          type: 'vendor_password_reset',
          relatedId: targetUser.user_id,
          targetUrl: targetUser.vendor_id ? '/admin/vendors?vendorId=' + targetUser.vendor_id + '&action=reset-password' : '/admin/vendors',
          io: req.app.get('io'),
        });
      } catch (_) {}

      console.log(`[VENDOR FORGOT PASSWORD] Generated reset link for ${normalizedEmail}: ${resetUrl}`);

      // Send email via Nodemailer SMTP with graceful fallback
      let emailSent = false;
      try {
        const { isEmailConfigured, sendVendorPasswordResetToken } = require('../utils/emailService');
        if (isEmailConfigured()) {
          await sendVendorPasswordResetToken({
            email: normalizedEmail,
            name: targetUser.business_name || targetUser.name || 'Vendor',
            resetUrl,
            expirationMinutes: 15,
          });
          emailSent = true;
          console.log(`[VENDOR FORGOT PASSWORD SMTP SUCCESS] Email sent to ${normalizedEmail}`);
        } else {
          console.warn(`[VENDOR FORGOT PASSWORD SMTP NOTICE] SMTP is not configured in .env. Reset link for ${normalizedEmail}: ${resetUrl}`);
        }
      } catch (emailError) {
        console.error('[VENDOR FORGOT PASSWORD SMTP ERROR]', emailError.message);
        console.warn(`[VENDOR FORGOT PASSWORD FALLBACK RESET LINK] ${resetUrl}`);
      }

      return res.json({
        ...genericResponse,
        emailSent,
        devResetUrl: (process.env.NODE_ENV !== 'production' || !emailSent) ? resetUrl : undefined,
      });
    } catch (error) {
      console.error('Vendor Forgot Password Exception:', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred. Please try again later.',
      });
    }
  }

  static async verifyResetToken(req, res) {
    const token = String(req.query.token || '').trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'This password reset link is invalid or has expired.',
      });
    }

    try {
      const { ensurePasswordResetTokensTable } = require('../utils/vendorSchema');
      await ensurePasswordResetTokensTable();

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const [rows] = await db.query(
        `SELECT t.id, t.user_id, t.expires_at, t.used_at, u.email, u.role, r.name AS role_name
         FROM password_reset_tokens t
         JOIN users u ON t.user_id = u.id
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE t.token_hash = ?
         ORDER BY t.id DESC
         LIMIT 1`,
        [tokenHash]
      );

      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'This password reset link is invalid or has expired.',
        });
      }

      const resetRecord = rows[0];

      if (resetRecord.used_at) {
        return res.status(400).json({
          success: false,
          message: 'This password reset link is invalid or has expired.',
        });
      }

      if (new Date(resetRecord.expires_at) < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'This password reset link is invalid or has expired.',
        });
      }

      const roleName = String(resetRecord.role_name || resetRecord.role || '').toLowerCase();
      if (roleName !== 'vendor') {
        return res.status(400).json({
          success: false,
          message: 'This password reset link is invalid or has expired.',
        });
      }

      return res.json({
        success: true,
        message: 'Reset token is valid.',
      });
    } catch (error) {
      console.error('Verify Reset Token Error:', error);
      return res.status(500).json({
        success: false,
        message: 'This password reset link is invalid or has expired.',
      });
    }
  }

  static async resetPassword(req, res) {
    const { token, newPassword, confirmPassword } = req.body || {};
    const rawToken = String(token || '').trim();
    const pwd = String(newPassword || '');
    const confirmPwd = String(confirmPassword || '');

    if (!rawToken) {
      return res.status(400).json({ success: false, message: 'This password reset link is invalid or has expired.' });
    }

    if (!pwd || !confirmPwd) {
      return res.status(400).json({ success: false, message: 'New password and confirm password are required.' });
    }

    if (pwd !== confirmPwd) {
      return res.status(400).json({ success: false, message: 'New Password and Confirm Password must match.' });
    }

    if (pwd.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }
    if (!/[A-Z]/.test(pwd)) {
      return res.status(400).json({ success: false, message: 'Password must contain at least one uppercase letter.' });
    }
    if (!/[a-z]/.test(pwd)) {
      return res.status(400).json({ success: false, message: 'Password must contain at least one lowercase letter.' });
    }
    if (!/[0-9]/.test(pwd)) {
      return res.status(400).json({ success: false, message: 'Password must contain at least one number.' });
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) {
      return res.status(400).json({ success: false, message: 'Password must contain at least one special character.' });
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const { ensurePasswordResetTokensTable } = require('../utils/vendorSchema');
      await ensurePasswordResetTokensTable();

      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const [rows] = await connection.query(
        `SELECT t.id, t.user_id, t.expires_at, t.used_at, u.email, u.role, r.name AS role_name
         FROM password_reset_tokens t
         JOIN users u ON t.user_id = u.id
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE t.token_hash = ?
         ORDER BY t.id DESC
         FOR UPDATE`,
        [tokenHash]
      );

      if (rows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'This password reset link is invalid or has expired.' });
      }

      const resetRecord = rows[0];

      if (resetRecord.used_at || new Date(resetRecord.expires_at) < new Date()) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'This password reset link is invalid or has expired.' });
      }

      const roleName = String(resetRecord.role_name || resetRecord.role || '').toLowerCase();
      if (roleName !== 'vendor') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'This password reset link is invalid or has expired.' });
      }

      const bcryptHash = await bcrypt.hash(pwd, 12);

      await connection.query(
        `UPDATE users
         SET password = ?, password_hash = ?, password_changed_at = NOW(), must_change_password = 0
         WHERE id = ?`,
        [bcryptHash, bcryptHash, resetRecord.user_id]
      );

      await connection.query(
        `UPDATE vendors
         SET password = ?
         WHERE user_id = ? OR LOWER(email) = LOWER(?)`,
        [bcryptHash, resetRecord.user_id, resetRecord.email]
      );

      await connection.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [resetRecord.id]);
      await connection.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
        [resetRecord.user_id]
      );

      await connection.commit();

      try {
        const NotificationModel = require('../models/notificationModel');
        await NotificationModel.createAdminNotification({
          title: 'Vendor Password Successfully Reset',
          message: `Vendor account (${resetRecord.email}) successfully reset password. Active sessions invalidated.`,
          category: 'security',
          severity: 'info',
          type: 'vendor_password_changed',
          relatedId: resetRecord.user_id,
          targetUrl: targetUser.vendor_id ? '/admin/vendors?vendorId=' + targetUser.vendor_id : '/admin/vendors',
          io: req.app.get('io'),
        });
      } catch (_) {}

      return res.json({
        success: true,
        message: 'Password reset successfully. Your password has been changed. You can now sign in using your new password.',
      });
    } catch (error) {
      await connection.rollback();
      console.error('[RESET PASSWORD TRANSACTION ERROR]', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to reset password. Please try again.',
      });
    } finally {
      connection.release();
    }
  }

  // â”€â”€â”€ DELIVERY ZONES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getDeliveryZones(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const [zones] = await db.query(
        'SELECT * FROM vendor_delivery_zones WHERE vendor_id = ? ORDER BY zone_name ASC',
        [vendorId]
      );
      res.json(zones);
    } catch (error) {
      console.error('[VENDOR] Get Delivery Zones Error:', error);
      res.status(500).json({ message: 'Failed to fetch delivery zones' });
    }
  }

  static async createDeliveryZone(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const { zone_name, delivery_fee, estimated_time, is_active } = req.body;

    if (!zone_name || zone_name.trim() === '') {
      return res.status(400).json({ message: 'Zone name is required.' });
    }

    const fee = parseFloat(delivery_fee);
    if (isNaN(fee) || fee < 0) {
      return res.status(400).json({ message: 'Delivery fee must be a valid number greater than or equal to 0.' });
    }

    const estTime = estimated_time || '25 mins';
    const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    try {
      const [result] = await db.query(
        'INSERT INTO vendor_delivery_zones (vendor_id, zone_name, delivery_fee, estimated_time, is_active) VALUES (?, ?, ?, ?, ?)',
        [vendorId, zone_name.trim(), fee, estTime, active]
      );
      res.status(201).json({
        message: 'Delivery zone created successfully.',
        zoneId: result.insertId
      });
    } catch (error) {
      console.error('[VENDOR] Create Delivery Zone Error:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'This delivery zone is already defined for your station.' });
      }
      res.status(500).json({ message: 'Failed to create delivery zone' });
    }
  }

  static async updateDeliveryZone(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const zoneId = req.params.id;
    const { zone_name, delivery_fee, estimated_time, is_active } = req.body;

    if (!zone_name || zone_name.trim() === '') {
      return res.status(400).json({ message: 'Zone name is required.' });
    }

    const fee = parseFloat(delivery_fee);
    if (isNaN(fee) || fee < 0) {
      return res.status(400).json({ message: 'Delivery fee must be a valid number greater than or equal to 0.' });
    }

    const estTime = estimated_time || '25 mins';
    const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    try {
      // First verify the zone belongs to this vendor
      const [existing] = await db.query(
        'SELECT id FROM vendor_delivery_zones WHERE id = ? AND vendor_id = ?',
        [zoneId, vendorId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ message: 'Delivery zone not found or unauthorized.' });
      }

      await db.query(
        'UPDATE vendor_delivery_zones SET zone_name = ?, delivery_fee = ?, estimated_time = ?, is_active = ? WHERE id = ?',
        [zone_name.trim(), fee, estTime, active, zoneId]
      );

      res.json({ message: 'Delivery zone updated successfully.' });
    } catch (error) {
      console.error('[VENDOR] Update Delivery Zone Error:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'A delivery zone with this name already exists for your station.' });
      }
      res.status(500).json({ message: 'Failed to update delivery zone' });
    }
  }

  static async deleteDeliveryZone(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const zoneId = req.params.id;

    try {
      // Verify ownership
      const [existing] = await db.query(
        'SELECT id FROM vendor_delivery_zones WHERE id = ? AND vendor_id = ?',
        [zoneId, vendorId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ message: 'Delivery zone not found or unauthorized.' });
      }

      await db.query('DELETE FROM vendor_delivery_zones WHERE id = ?', [zoneId]);
      res.json({ message: 'Delivery zone deleted successfully.' });
    } catch (error) {
      console.error('[VENDOR] Delete Delivery Zone Error:', error);
      res.status(500).json({ message: 'Failed to delete delivery zone' });
    }
  }

  // â”€â”€â”€ OFFERS / PROMOTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getOffers(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const data = await VendorModel.getOffers(vendorId);
      res.json(data);
    } catch (error) {
      console.error('[VENDOR] Get Offers Error:', error);
      res.status(500).json({ message: 'Failed to fetch offers' });
    }
  }

  static validateOfferInput(body) {
    const name = (body.name || body.title || '').toString().trim();
    const discount = Number(body.discount_percentage ?? body.discount_value);
    const start = body.start_date ? new Date(body.start_date) : null;
    const end = body.end_date ? new Date(body.end_date) : null;
    const productId = body.product_id ?? body.productId;

    return collect({
      name: !normalizedName ? 'Vendor name is required.' : (!/^[\p{L} .,'&-]{2,80}$/u.test(normalizedName) ? 'Vendor name must contain 2-80 letters and cannot include numbers.' : null),
      discount_percentage: !Number.isFinite(discount) || discount <= 0 || discount > 100
        ? 'Discount must be between 1 and 100 percent.' : null,
      product_id: !isNonEmpty(productId) ? 'Select a product for this offer.' : null,
      start_date: start && Number.isNaN(start.getTime()) ? 'Enter a valid start date.' : null,
      end_date: end && Number.isNaN(end.getTime())
        ? 'Enter a valid end date.'
        : (start && end && end < start ? 'End date must be on or after the start date.' : null),
    });
  }

  static async createOffer(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const errors = VendorController.validateOfferInput(req.body);
    if (errors) return res.status(400).json({ success: false, message: 'Validation failed.', errors });
    try {
      const offerId = await VendorModel.createOffer(vendorId, req.body);
      const io = req.app.get('io');
      const [vendorRows] = await db.query(
        'SELECT COALESCE(business_name, name, "your station") AS vendor_name FROM vendors WHERE id = ?',
        [vendorId]
      );
      const vendorName = vendorRows[0]?.vendor_name || 'your station';
      const discountValue = Number(req.body.discount_percentage ?? req.body.discount_value ?? 0);
      const rawOfferTitle = (req.body.name || req.body.title || req.body.product_name || 'a new offer').toString().trim();
      const discountLabel = Number.isFinite(discountValue) && discountValue > 0
        ? `${Number.isInteger(discountValue) ? discountValue : discountValue.toFixed(1).replace(/\.0$/, '')}% OFF`
        : null;
      const offerTitle = rawOfferTitle || 'a new offer';
      const offerDisplayName = discountLabel && !offerTitle.toLowerCase().includes('off')
        ? `${discountLabel} ${offerTitle}`
        : offerTitle;
      const notificationTitle = 'New Vendor Offer';
      const notificationMessage = `${vendorName} is offering ${offerDisplayName}.`;
      const pushBody = `Get ${offerDisplayName} at ${vendorName}.`;

      try {
        const targets = await CustomerModel.getOfferNotificationTargets(vendorId);
        await NotificationModel.notifyOfferTargets(
          targets,
          notificationTitle,
          notificationMessage,
          'offer_created',
          {
            vendorId,
            offerId,
            io,
            pushTitle: notificationTitle,
            pushBody,
            vendorName,
          }
        );
      } catch (notificationError) {
        console.error('[VENDOR] Failed to notify customers about offer:', notificationError);
      }

      res.status(201).json({ success: true, message: 'Offer created successfully', offerId });
    } catch (error) {
      const message = error.message || 'Failed to create offer';
      const isValidationError = ['required', 'between', 'select one product', 'does not belong'].some((part) =>
        message.toLowerCase().includes(part)
      );
      if (isValidationError) {
      } else {
        console.error('[VENDOR] Create Offer Error:', error);
      }
      const status = isValidationError ? 400 : 500;
      res.status(status).json({ success: false, message });
    }
  }

  static async updateOffer(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    const errors = VendorController.validateOfferInput(req.body);
    if (errors) return res.status(400).json({ success: false, message: 'Validation failed.', errors });
    try {
      const offerId  = req.params.id;
      const updated  = await VendorModel.updateOffer(vendorId, offerId, req.body);

      if (!updated) return res.status(404).json({ message: 'Offer not found or unauthorized' });

      const io = req.app.get('io');
      if (io) io.emit('offer-updated', { vendor_id: vendorId, offer_id: offerId });

      res.json({ success: true, message: 'Offer updated successfully' });
    } catch (error) {
      const message = error.message || 'Failed to update offer';
      const isValidationError = ['required', 'between', 'select one product', 'does not belong'].some((part) =>
        message.toLowerCase().includes(part)
      );
      if (isValidationError) {
      } else {
        console.error('[VENDOR] Update Offer Error:', error);
      }
      const status = isValidationError ? 400 : 500;
      res.status(status).json({ success: false, message });
    }
  }

  static async deleteOffer(req, res) {
    const vendorId = await VendorController.resolveVendorId(req);
    try {
      const offerId  = req.params.id;
      const deleted  = await VendorModel.deleteOffer(vendorId, offerId);

      if (!deleted) return res.status(404).json({ message: 'Offer not found or unauthorized' });

      const io = req.app.get('io');
      if (io) io.emit('offer-deleted', { vendor_id: vendorId, offer_id: offerId });

      res.json({ message: 'Offer deleted successfully' });
    } catch (error) {
      console.error('[VENDOR] Delete Offer Error:', error);
      res.status(500).json({ message: 'Failed to delete offer' });
    }
  }

  // â”€â”€â”€ REPORTS / ANALYTICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getReports(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);

      // Summary: overall stats.
      // Money figures (sales/net/commission) count DELIVERED orders only, matching the
      // vendor dashboard (getStats). Counts cover all statuses. No JOIN to deliveries here
      // to avoid fan-out double-counting for multi-destination orders â€” delivery fees are
      // summed in a separate query.
      const [[summary]] = await db.query(
        `SELECT
           COUNT(o.id)                                                                 AS total_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN 1 END), 0)          AS completed_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status) IN ('cancelled','failed') THEN 1 END), 0) AS cancelled_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.total_amount ELSE 0 END), 0)      AS total_sales,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.vendor_net_amount ELSE 0 END), 0) AS net_sales,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.admin_commission ELSE 0 END), 0)  AS total_commission,
           COUNT(DISTINCT o.customer_id)                                               AS unique_customers
         FROM orders o
         WHERE o.vendor_id = ?`,
        [vendorId]
      );
      const [[{ total_delivery_fees }]] = await db.query(
        `SELECT COALESCE(SUM(d.payout), 0) AS total_delivery_fees
         FROM deliveries d JOIN orders o ON o.id = d.order_id
         WHERE o.vendor_id = ? AND LOWER(o.status) = 'delivered'`,
        [vendorId]
      );
      summary.total_delivery_fees = total_delivery_fees;

      // Sales chart (last 30 days)
      const [salesChart] = await db.query(
        `SELECT DATE(o.created_at) AS date, COALESCE(SUM(o.total_amount), 0) AS amount
         FROM orders o
         WHERE o.vendor_id = ? AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY DATE(o.created_at)
         ORDER BY date ASC`,
        [vendorId]
      );

      // Top selling products
      const [topProducts] = await db.query(
        `SELECT p.name, SUM(oi.quantity) AS total_qty, SUM(oi.subtotal) AS total_revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         WHERE o.vendor_id = ?
         GROUP BY oi.product_id, p.name
         ORDER BY total_qty DESC
         LIMIT 5`,
        [vendorId]
      );

      res.json({ summary, sales_chart: salesChart, top_products: topProducts });
    } catch (error) {
      console.error('[VENDOR] getReports Error:', error);
      res.status(500).json({ message: 'Failed to fetch reports' });
    }
  }

  static async getDailyReport(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const date = req.query.date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      const [[summary]] = await db.query(
        `SELECT
           COUNT(o.id)                                                          AS total_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN 1 END), 0)  AS completed_deliveries,
           COALESCE(SUM(CASE WHEN LOWER(o.status) IN ('cancelled','failed') THEN 1 END), 0) AS cancelled_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.total_amount ELSE 0 END), 0)      AS total_sales,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.vendor_net_amount ELSE 0 END), 0) AS total_revenue,
           COUNT(DISTINCT o.customer_id)                                        AS customer_count
         FROM orders o
         WHERE o.vendor_id = ? AND DATE(o.created_at) = ?`,
        [vendorId, date]
      );
      const [[{ total_delivery_fees }]] = await db.query(
        `SELECT COALESCE(SUM(d.payout), 0) AS total_delivery_fees
         FROM deliveries d JOIN orders o ON o.id = d.order_id
         WHERE o.vendor_id = ? AND LOWER(o.status)='delivered' AND DATE(o.created_at) = ?`,
        [vendorId, date]
      );
      summary.total_delivery_fees = total_delivery_fees;

      // Hourly breakdown
      const [hourlyChart] = await db.query(
        `SELECT HOUR(o.created_at) AS hour,
                COUNT(o.id) AS orders,
                COALESCE(SUM(o.total_amount), 0) AS revenue
         FROM orders o
         WHERE o.vendor_id = ? AND DATE(o.created_at) = ?
         GROUP BY HOUR(o.created_at)
         ORDER BY hour ASC`,
        [vendorId, date]
      );

      // Top products today
      const [topProducts] = await db.query(
        `SELECT p.name, SUM(oi.quantity) AS total_qty, SUM(oi.subtotal) AS total_revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         WHERE o.vendor_id = ? AND DATE(o.created_at) = ?
         GROUP BY oi.product_id, p.name
         ORDER BY total_qty DESC
         LIMIT 5`,
        [vendorId, date]
      );

      // Discount usage (if offers applied via orders)
      const [[discountData]] = await db.query(
        `SELECT COUNT(DISTINCT o.id) AS orders_with_discount,
                COALESCE(SUM(o.total_amount * 0), 0) AS total_discounts
         FROM orders o
         WHERE o.vendor_id = ? AND DATE(o.created_at) = ?`,
        [vendorId, date]
      );

      res.json({ date, summary, hourly_chart: hourlyChart, top_products: topProducts, discount_data: discountData });
    } catch (error) {
      console.error('[VENDOR] getDailyReport Error:', error);
      res.status(500).json({ message: 'Failed to fetch daily report' });
    }
  }

  static async getWeeklyReport(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      // Start of this week (Monday)
      const weekStart = req.query.week_start || (() => {
        const d = new Date();
        const day = d.getDay(); // 0 = Sunday
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        return d.toISOString().slice(0, 10);
      })();

      // This week stats â€” money is delivered-only (matches dashboard), no delivery fan-out.
      const [[thisWeek]] = await db.query(
        `SELECT
           COUNT(o.id)                                                         AS total_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.total_amount ELSE 0 END), 0) AS total_revenue,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN 1 END), 0) AS completed_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status) IN ('cancelled','failed') THEN 1 END), 0) AS cancelled_orders,
           COUNT(DISTINCT o.customer_id)                                       AS customer_count
         FROM orders o
         WHERE o.vendor_id = ? AND DATE(o.created_at) >= ? AND DATE(o.created_at) < DATE_ADD(?, INTERVAL 7 DAY)`,
        [vendorId, weekStart, weekStart]
      );
      const [[{ total_delivery_fees: weekFees }]] = await db.query(
        `SELECT COALESCE(SUM(d.payout), 0) AS total_delivery_fees
         FROM deliveries d JOIN orders o ON o.id = d.order_id
         WHERE o.vendor_id = ? AND LOWER(o.status)='delivered' AND DATE(o.created_at) >= ? AND DATE(o.created_at) < DATE_ADD(?, INTERVAL 7 DAY)`,
        [vendorId, weekStart, weekStart]
      );
      thisWeek.total_delivery_fees = weekFees;

      // Previous week stats (delivered-only revenue for a like-for-like growth comparison)
      const [[prevWeek]] = await db.query(
        `SELECT
           COUNT(o.id)             AS total_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.total_amount ELSE 0 END), 0) AS total_revenue
         FROM orders o
         WHERE o.vendor_id = ? AND DATE(o.created_at) >= DATE_SUB(?, INTERVAL 7 DAY) AND DATE(o.created_at) < ?`,
        [vendorId, weekStart, weekStart]
      );

      // Daily breakdown for this week
      const [dailyChart] = await db.query(
        `SELECT DAYNAME(o.created_at) AS day_name, DATE(o.created_at) AS date,
                COUNT(o.id) AS orders, COALESCE(SUM(o.total_amount), 0) AS revenue
         FROM orders o
         WHERE o.vendor_id = ? AND DATE(o.created_at) >= ? AND DATE(o.created_at) < DATE_ADD(?, INTERVAL 7 DAY)
         GROUP BY DATE(o.created_at), DAYNAME(o.created_at)
         ORDER BY date ASC`,
        [vendorId, weekStart, weekStart]
      );

      // Best selling day
      const [[bestDay]] = await db.query(
        `SELECT DAYNAME(o.created_at) AS day_name, COUNT(o.id) AS orders, SUM(o.total_amount) AS revenue
         FROM orders o
         WHERE o.vendor_id = ? AND DATE(o.created_at) >= ? AND DATE(o.created_at) < DATE_ADD(?, INTERVAL 7 DAY)
         GROUP BY DAYNAME(o.created_at)
         ORDER BY revenue DESC
         LIMIT 1`,
        [vendorId, weekStart, weekStart]
      );

      // Revenue growth %
      const revenueGrowth = prevWeek.total_revenue > 0
        ? (((thisWeek.total_revenue - prevWeek.total_revenue) / prevWeek.total_revenue) * 100).toFixed(1)
        : null;

      res.json({
        week_start: weekStart,
        this_week: thisWeek,
        prev_week: prevWeek,
        revenue_growth: revenueGrowth,
        best_day: bestDay || null,
        daily_chart: dailyChart,
      });
    } catch (error) {
      console.error('[VENDOR] getWeeklyReport Error:', error);
      res.status(500).json({ message: 'Failed to fetch weekly report' });
    }
  }

  static async getMonthlyReport(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const now = new Date();
      const year = parseInt(req.query.year) || now.getFullYear();
      const month = parseInt(req.query.month) || (now.getMonth() + 1);

      // This month stats â€” money delivered-only (matches dashboard), no delivery fan-out.
      const [[thisMonth]] = await db.query(
        `SELECT
           COUNT(o.id)                                                         AS total_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.total_amount ELSE 0 END), 0)      AS total_revenue,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.vendor_net_amount ELSE 0 END), 0) AS net_revenue,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN 1 END), 0)  AS completed_deliveries,
           COALESCE(SUM(CASE WHEN LOWER(o.status) IN ('cancelled','failed') THEN 1 END), 0) AS cancelled_orders,
           COUNT(DISTINCT o.customer_id)                                       AS customer_count
         FROM orders o
         WHERE o.vendor_id = ? AND YEAR(o.created_at) = ? AND MONTH(o.created_at) = ?`,
        [vendorId, year, month]
      );
      const [[{ total_delivery_fees: monthFees }]] = await db.query(
        `SELECT COALESCE(SUM(d.payout), 0) AS total_delivery_fees
         FROM deliveries d JOIN orders o ON o.id = d.order_id
         WHERE o.vendor_id = ? AND LOWER(o.status)='delivered' AND YEAR(o.created_at) = ? AND MONTH(o.created_at) = ?`,
        [vendorId, year, month]
      );
      thisMonth.total_delivery_fees = monthFees;

      // Previous month for comparison (delivered-only revenue)
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const [[prevMonthData]] = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.total_amount ELSE 0 END), 0) AS total_revenue, COUNT(o.id) AS total_orders
         FROM orders o
         WHERE o.vendor_id = ? AND YEAR(o.created_at) = ? AND MONTH(o.created_at) = ?`,
        [vendorId, prevYear, prevMonth]
      );

      // Daily breakdown for the month
      const [dailyChart] = await db.query(
        `SELECT DATE(o.created_at) AS date, COUNT(o.id) AS orders, COALESCE(SUM(o.total_amount), 0) AS revenue
         FROM orders o
         WHERE o.vendor_id = ? AND YEAR(o.created_at) = ? AND MONTH(o.created_at) = ?
         GROUP BY DATE(o.created_at)
         ORDER BY date ASC`,
        [vendorId, year, month]
      );

      // Top products this month
      const [topProducts] = await db.query(
        `SELECT p.name, SUM(oi.quantity) AS total_qty, SUM(oi.subtotal) AS total_revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         WHERE o.vendor_id = ? AND YEAR(o.created_at) = ? AND MONTH(o.created_at) = ?
         GROUP BY oi.product_id, p.name
         ORDER BY total_revenue DESC
         LIMIT 8`,
        [vendorId, year, month]
      );

      // Revenue growth %
      const revenueGrowth = prevMonthData.total_revenue > 0
        ? (((thisMonth.total_revenue - prevMonthData.total_revenue) / prevMonthData.total_revenue) * 100).toFixed(1)
        : null;

      // Orders growth %
      const ordersGrowth = prevMonthData.total_orders > 0
        ? (((thisMonth.total_orders - prevMonthData.total_orders) / prevMonthData.total_orders) * 100).toFixed(1)
        : null;

      res.json({
        year, month,
        this_month: thisMonth,
        prev_month: prevMonthData,
        revenue_growth: revenueGrowth,
        orders_growth: ordersGrowth,
        daily_chart: dailyChart,
        top_products: topProducts,
      });
    } catch (error) {
      console.error('[VENDOR] getMonthlyReport Error:', error);
      res.status(500).json({ message: 'Failed to fetch monthly report' });
    }
  }

  // â”€â”€â”€ AUTH / REGISTRATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static async getYearlyReport(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const now = new Date();
      const year = parseInt(req.query.year) || now.getFullYear();

      const [[thisYear]] = await db.query(
        `SELECT
           COUNT(o.id)                                                         AS total_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.total_amount ELSE 0 END), 0)      AS total_revenue,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.vendor_net_amount ELSE 0 END), 0) AS net_revenue,
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN 1 END), 0)  AS completed_orders,
           COALESCE(SUM(CASE WHEN LOWER(o.status) IN ('cancelled','failed') THEN 1 END), 0) AS cancelled_orders,
           COUNT(DISTINCT o.customer_id)                                       AS customer_count
         FROM orders o
         WHERE o.vendor_id = ? AND YEAR(o.created_at) = ?`,
        [vendorId, year]
      );
      const [[{ total_delivery_fees: yearFees }]] = await db.query(
        `SELECT COALESCE(SUM(d.payout), 0) AS total_delivery_fees
         FROM deliveries d JOIN orders o ON o.id = d.order_id
         WHERE o.vendor_id = ? AND LOWER(o.status)='delivered' AND YEAR(o.created_at) = ?`,
        [vendorId, year]
      );
      thisYear.total_delivery_fees = yearFees;

      const prevYear = year - 1;
      const [[prevYearData]] = await db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN LOWER(o.status)='delivered' THEN o.total_amount ELSE 0 END), 0) AS total_revenue,
           COUNT(o.id)                      AS total_orders
         FROM orders o
         WHERE o.vendor_id = ? AND YEAR(o.created_at) = ?`,
        [vendorId, prevYear]
      );

      const [monthlyChart] = await db.query(
        `SELECT MONTH(o.created_at) AS month_index,
                DATE_FORMAT(o.created_at, '%b') AS month_name,
                COUNT(o.id) AS orders,
                COALESCE(SUM(o.total_amount), 0) AS revenue
         FROM orders o
         WHERE o.vendor_id = ? AND YEAR(o.created_at) = ?
         GROUP BY MONTH(o.created_at), DATE_FORMAT(o.created_at, '%b')
         ORDER BY month_index ASC`,
        [vendorId, year]
      );

      const [topProducts] = await db.query(
        `SELECT p.name, SUM(oi.quantity) AS total_qty, SUM(oi.subtotal) AS total_revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         WHERE o.vendor_id = ? AND YEAR(o.created_at) = ?
         GROUP BY oi.product_id, p.name
         ORDER BY total_qty DESC
         LIMIT 10`,
        [vendorId, year]
      );

      const revenueGrowth = prevYearData.total_revenue > 0
        ? (((thisYear.total_revenue - prevYearData.total_revenue) / prevYearData.total_revenue) * 100).toFixed(1)
        : null;

      const ordersGrowth = prevYearData.total_orders > 0
        ? (((thisYear.total_orders - prevYearData.total_orders) / prevYearData.total_orders) * 100).toFixed(1)
        : null;

      res.json({
        year,
        this_year: thisYear,
        prev_year: prevYearData,
        revenue_growth: revenueGrowth,
        orders_growth: ordersGrowth,
        monthly_chart: monthlyChart,
        top_products: topProducts,
      });
    } catch (error) {
      console.error('[VENDOR] getYearlyReport Error:', error);
      res.status(500).json({ message: 'Failed to fetch yearly report' });
    }
  }

  static async register(req, res) {
    const {
      name,
      email,
      password,
      phone,
      contact_name,
      address,
      business_types,
      identity_document_type,
      waafi_merchant_uid,
      waafi_api_user_id,
      waafi_api_key,
    } = req.body;

    const files = req.files || {};
    const niraDocument = files.nira_id_document?.[0];
    const patentDocument = files.government_patent_document?.[0];
    const passportDocument = files.passport_document?.[0];
    const selectedBusinessTypes = parseBusinessTypes(business_types);
    const normalizedIdentityDocumentType = String(identity_document_type || '').trim().toLowerCase();
    const hasValidIdentityDocumentType = ['nira', 'passport'].includes(normalizedIdentityDocumentType);
    const nira_id = normalizedIdentityDocumentType === 'nira'
      ? getUploadedDocumentPath(niraDocument)
      : null;
    const government_patent = getUploadedDocumentPath(patentDocument);
    const passport_number = normalizedIdentityDocumentType === 'passport'
      ? getUploadedDocumentPath(passportDocument)
      : null;
    const normalizedMerchantUid = String(waafi_merchant_uid || '').trim();
    const normalizedApiUserId = String(waafi_api_user_id || '').trim();
    const normalizedApiKey = String(waafi_api_key || '').trim();
    const normalizedName = String(name || '').trim();
    const normalizedOwnerName = String(contact_name || '').trim();
    const normalizedAddress = String(address || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();
    const rawPassword = String(password || '');
    const hasAnyWaafiField = Boolean(normalizedMerchantUid || normalizedApiUserId || normalizedApiKey);
    const hasAllWaafiFields = Boolean(normalizedMerchantUid && normalizedApiUserId && normalizedApiKey);
    const isWaafiEnabled = hasAllWaafiFields;
    const hasValidBusinessTypes = selectedBusinessTypes.length > 0
      && selectedBusinessTypes.length <= ALLOWED_VENDOR_BUSINESS_TYPES.size
      && selectedBusinessTypes.every((type) => ALLOWED_VENDOR_BUSINESS_TYPES.has(type));
    const hasValidPassword = rawPassword.length >= 10
      && rawPassword.length <= 72
      && /[A-Za-z]/.test(rawPassword)
      && /\d/.test(rawPassword);
    const hasSafeMerchantUid = !normalizedMerchantUid.includes('\n') && normalizedMerchantUid.length <= 120;
    const hasSafeApiUserId = !normalizedApiUserId.includes('\n') && normalizedApiUserId.length <= 120;
    const hasSafeApiKey = !normalizedApiKey.includes('\n') && normalizedApiKey.length <= 1024;
    const identityDocument = normalizedIdentityDocumentType === 'nira' ? niraDocument : passportDocument;
    const hasDuplicateDocumentName = Boolean(
      identityDocument?.originalname && patentDocument?.originalname
      && identityDocument.originalname.trim().toLowerCase() === patentDocument.originalname.trim().toLowerCase()
    );

    const validationErrors = collect({
      name: !normalizedName ? 'Vendor name is required.' : (!/^[\p{L} .,'&-]{2,80}$/u.test(normalizedName) ? 'Vendor name must contain 2-80 letters and cannot include numbers.' : null),
      contact_name: !normalizedOwnerName ? 'Owner name is required.' : (!/^[\p{L} .,'&-]{2,80}$/u.test(normalizedOwnerName) ? 'Owner name must contain 2-80 letters and cannot include numbers.' : null),
      address: !normalizedAddress ? 'Location is required.' : (!/^[\p{L}0-9 .,'#&/()\-]{5,255}$/u.test(normalizedAddress) ? 'Location must be 5-255 characters and may include numbers.' : null),
      email: !isEmail(normalizedEmail) ? 'Enter a valid email address.' : null,
      phone: !isPhone(normalizedPhone) ? 'Enter a valid phone number.' : null,
      password: !hasValidPassword ? 'Password must be 10-72 characters and include a letter and a number.' : null,
      identity_document_type: !hasValidIdentityDocumentType ? 'Choose NIRA ID or Owner Passport.' : null,
      nira_id_document: normalizedIdentityDocumentType === 'nira' && !niraDocument
        ? 'NIRA ID Document is required.'
        : null,
      passport_document: normalizedIdentityDocumentType === 'passport' && !passportDocument
        ? 'Owner Passport Document is required.'
        : null,
      government_patent_document: !patentDocument
        ? 'Government Patent Document is required.'
        : (hasDuplicateDocumentName ? 'Upload a different file for the Government Patent Document.' : null),
      business_types: !hasValidBusinessTypes ? 'Select at least one valid business type.' : null,
      waafi_merchant_uid: !normalizedMerchantUid
        ? 'Merchant UID is required.'
        : (!hasSafeMerchantUid ? 'Merchant UID must be 120 characters or fewer and use one line.' : null),
      waafi_api_user_id: !normalizedApiUserId
        ? 'API User ID is required.'
        : (!hasSafeApiUserId ? 'API User ID must be 120 characters or fewer and use one line.' : null),
      waafi_api_key: !normalizedApiKey
        ? 'API Key is required.'
        : (!hasSafeApiKey ? 'API Key must be 1024 characters or fewer and use one line.' : null),
    });

    if (validationErrors) {
      return res.status(400).json({
        message: 'Please correct the highlighted registration fields.',
        errors: validationErrors,
      });
    }
    try {
      await ensureVendorSchema();
      const existingVendor = await VendorModel.findByEmail(normalizedEmail);
      if (existingVendor) {
        return res.status(409).json({
          message: 'This email is already registered.',
          errors: { email: 'Email address is already in use.' },
        });
      }
      const hashedPassword = await bcrypt.hash(rawPassword, 10);
      const vendorId = await VendorModel.registerVendor({
        name: normalizedName,
        email: normalizedEmail,
        password: hashedPassword,
        phone: normalizedPhone,
        contact_name: normalizedOwnerName,
        address: normalizedAddress,
        business_types: selectedBusinessTypes,
        nira_id,
        government_patent,
        passport_number,
        waafi_merchant_uid: normalizedMerchantUid || null,
        waafi_api_user_id: normalizedApiUserId || null,
        waafi_api_key: normalizedApiKey || null,
        waafi_enabled: isWaafiEnabled,
        verification_status: 'pending'
      });
      const NotificationModel = require('../models/notificationModel');
      NotificationModel.createAdminNotification({
        title: 'New Vendor Registration',
        message: `Vendor ${normalizedName} submitted registration and verification documents for review.`,
        category: 'vendors',
        severity: 'info',
        type: 'vendor_registered',
        relatedId: vendorId,
        targetUrl: '/admin/vendors'
      }).catch(() => {});

      res.status(201).json({
        message: 'Vendor registered successfully. Your account is now pending admin verification.',
        vendorId
      });
    } catch (error) {
      console.error('Vendor Register Error:', error);
      res.status(500).json({ message: 'Registration failed' });
    }
  }

}

module.exports = VendorController;
