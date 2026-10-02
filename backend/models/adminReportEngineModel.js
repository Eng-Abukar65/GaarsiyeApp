const db = require('../config/db');

const MONEY = 'money';
const NUM = 'number';
const TEXT = 'text';
const DATE = 'date';

const toNum = (v) => Number.parseFloat(v || 0) || 0;
const sumBy = (rows, key) => (rows || []).reduce((s, r) => s + toNum(r[key]), 0);

class AdminReportEngineModel {
  static async generate({ type, from, to, vendorId, customerId, driverId, workerId, orderStatus, bookingStatus, subscriptionStatus, zone }) {
    const reportType = type || 'platform_summary';

    switch (reportType) {
      case 'vendors':
        return await this.buildVendorsReport({ from, to, zone, subscriptionStatus });
      case 'customers':
        return await this.buildCustomersReport({ from, to, customerId });
      case 'drivers':
        return await this.buildDriversReport({ driverId });
      case 'car_workers':
        return await this.buildCarWorkersReport({ workerId, vendorId });
      case 'orders':
        return await this.buildOrdersReport({ from, to, vendorId, customerId, driverId, orderStatus, zone });
      case 'deliveries':
        return await this.buildDeliveriesReport({ from, to, vendorId, driverId, orderStatus });
      case 'car_services':
        return await this.buildCarServicesReport({ from, to, vendorId, customerId, bookingStatus });
      case 'subscription_payments':
        return await this.buildSubscriptionPaymentsReport({ from, to, vendorId, subscriptionStatus });
      case 'delivery_zones':
        return await this.buildDeliveryZonesReport({ zone });
      case 'system_activity':
        return await this.buildSystemActivityReport({ from, to });
      case 'platform_summary':
      default:
        return await this.buildPlatformSummary({ from, to });
    }
  }

  // Helper to fetch universal platform-wide summary metrics for Admin
  static async getPlatformAdminMetrics(from, to) {
    const [[vStats]] = await db.query(
      `SELECT
         COUNT(id) AS total_vendors,
         COUNT(CASE WHEN verification_status = 'verified' OR status = 'active' THEN 1 END) AS approved_vendors,
         COUNT(CASE WHEN verification_status = 'pending' OR status = 'pending' THEN 1 END) AS pending_vendors,
         COUNT(CASE WHEN verification_status = 'rejected' OR status = 'suspended' THEN 1 END) AS suspended_vendors
       FROM vendors`
    ).catch(() => [[{ total_vendors: 0, approved_vendors: 0, pending_vendors: 0, suspended_vendors: 0 }]]);

    const [[custCount]] = await db.query(`SELECT COUNT(id) AS count FROM customers`);
    const [[dStats]] = await db.query(
      `SELECT COUNT(id) AS total_drivers, COUNT(CASE WHEN is_online = 1 THEN 1 END) AS online_drivers FROM drivers`
    ).catch(() => [[{ total_drivers: 0, online_drivers: 0 }]]);

    // The table is `car_wash_workers`; there is no `workers` table. The old name
    // failed every time and the .catch() turned it into a silent 0, so the admin
    // report always showed zero car-wash workers.
    const [[wCount]] = await db.query(`SELECT COUNT(id) AS count FROM car_wash_workers`)
      .catch(() => [[{ count: 0 }]]);

    const [[oStats]] = await db.query(
      `SELECT
         COUNT(id) AS total_orders,
         COUNT(CASE WHEN status IN ('on_the_way', 'driver_assigned', 'accepted', 'preparing', 'arrived') THEN 1 END) AS active_deliveries,
         COUNT(CASE WHEN status IN ('delivered', 'completed') THEN 1 END) AS completed_deliveries
       FROM orders
       WHERE DATE(created_at) BETWEEN ? AND ?`,
      [from, to]
    );

    const [[csStats]] = await db.query(
      `SELECT
         COUNT(id) AS total_bookings,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_bookings
       FROM car_wash_bookings
       WHERE DATE(created_at) BETWEEN ? AND ?`,
      [from, to]
    ).catch(() => [[{ total_bookings: 0, completed_bookings: 0 }]]);

    const [[subStats]] = await db.query(
      `SELECT
         COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_subs,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_subs,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS total_sub_revenue
       FROM vendor_subscription_payments
       WHERE DATE(created_at) BETWEEN ? AND ?`,
      [from, to]
    ).catch(() => [[{ pending_subs: 0, approved_subs: 0, total_sub_revenue: 0 }]]);

    return {
      total_vendors: Number(vStats?.total_vendors || 0),
      approved_vendors: Number(vStats?.approved_vendors || 0),
      pending_vendors: Number(vStats?.pending_vendors || 0),
      suspended_vendors: Number(vStats?.suspended_vendors || 0),
      total_customers: Number(custCount?.count || 0),
      total_drivers: Number(dStats?.total_drivers || 0),
      online_drivers: Number(dStats?.online_drivers || 0),
      total_car_workers: Number(wCount?.count || 0),
      total_orders: Number(oStats?.total_orders || 0),
      active_deliveries: Number(oStats?.active_deliveries || 0),
      completed_deliveries: Number(oStats?.completed_deliveries || 0),
      total_car_bookings: Number(csStats?.total_bookings || 0),
      completed_car_services: Number(csStats?.completed_bookings || 0),
      pending_subscriptions: Number(subStats?.pending_subs || 0),
      approved_subscriptions: Number(subStats?.approved_subs || 0),
      total_subscription_revenue: toNum(subStats?.total_sub_revenue),
    };
  }

  // â”€â”€ 1. Platform Summary Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildPlatformSummary({ from, to }) {
    const summary = await this.getPlatformAdminMetrics(from, to);

    const [dailyRows] = await db.query(
      `SELECT DATE(created_at) AS date,
              COUNT(id) AS total_orders,
              COUNT(CASE WHEN status IN ('delivered', 'completed') THEN 1 END) AS completed_orders,
              COALESCE(SUM(total_amount), 0) AS gross_order_volume
       FROM orders
       WHERE DATE(created_at) BETWEEN ? AND ?
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC`,
      [from, to]
    );

    return {
      title: 'Platform Overview & Summary Report',
      summary,
      columns: [
        { key: 'date', label: 'Date', type: DATE },
        { key: 'total_orders', label: 'Total Orders', type: NUM },
        { key: 'completed_orders', label: 'Completed Deliveries', type: NUM },
        { key: 'gross_order_volume', label: 'Gross Volume ($)', type: MONEY },
      ],
      rows: dailyRows || [],
    };
  }

  // â”€â”€ 2. Vendors Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildVendorsReport({ from, to, zone, subscriptionStatus }) {
    let sql = `
      SELECT v.id AS vendor_id, v.business_name, v.contact_name, v.phone,
             COALESCE(v.district, 'N/A') AS district,
             COALESCE(v.subscription_plan, 'Standard') AS plan,
             COALESCE(v.subscription_status, 'active') AS subscription_status,
             COALESCE(v.verification_status, 'verified') AS verification_status,
             COUNT(DISTINCT o.id) AS total_orders
      FROM vendors v
      LEFT JOIN orders o ON o.vendor_id = v.id AND DATE(o.created_at) BETWEEN ? AND ?
      WHERE 1=1
    `;
    const params = [from, to];

    if (zone && zone !== 'all') {
      sql += ` AND (v.district LIKE ? OR v.address LIKE ?)`;
      params.push(`%${zone}%`, `%${zone}%`);
    }
    if (subscriptionStatus && subscriptionStatus !== 'all') {
      sql += ` AND v.subscription_status = ?`;
      params.push(subscriptionStatus);
    }

    sql += ` GROUP BY v.id ORDER BY v.created_at DESC`;

    const [rows] = await db.query(sql, params);
    const safeRows = rows || [];
    const summary = await this.getPlatformAdminMetrics(from, to);

    return {
      title: 'Vendors Platform Management Report',
      summary,
      columns: [
        { key: 'vendor_id', label: 'Vendor ID', type: TEXT },
        { key: 'business_name', label: 'Business Name', type: TEXT },
        { key: 'contact_name', label: 'Contact', type: TEXT },
        { key: 'phone', label: 'Phone', type: TEXT },
        { key: 'district', label: 'District / Zone', type: TEXT },
        { key: 'plan', label: 'Subscription Plan', type: TEXT },
        { key: 'subscription_status', label: 'Sub Status', type: TEXT },
        { key: 'verification_status', label: 'Status', type: TEXT },
        { key: 'total_orders', label: 'Total Orders', type: NUM },
      ],
      rows: safeRows,
    };
  }

  // â”€â”€ 3. Customers Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildCustomersReport({ from, to, customerId }) {
    let sql = `
      SELECT c.id AS customer_id, COALESCE(u.username, 'Customer') AS name, u.email, u.phone,
             DATE(c.created_at) AS joined_date,
             COUNT(DISTINCT o.id) AS orders_placed
      FROM customers c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN orders o ON o.customer_id = c.id
      WHERE DATE(c.created_at) BETWEEN ? AND ?
    `;
    const params = [from, to];

    if (customerId) {
      sql += ` AND c.id = ?`;
      params.push(customerId);
    }

    sql += ` GROUP BY c.id ORDER BY c.created_at DESC`;

    const [rows] = await db.query(sql, params);
    const safeRows = rows || [];
    const summary = await this.getPlatformAdminMetrics(from, to);

    return {
      title: 'Registered Platform Customers Report',
      summary,
      columns: [
        { key: 'customer_id', label: 'Customer ID', type: TEXT },
        { key: 'name', label: 'Customer Name', type: TEXT },
        { key: 'phone', label: 'Phone', type: TEXT },
        { key: 'email', label: 'Email', type: TEXT },
        { key: 'joined_date', label: 'Joined Date', type: DATE },
        { key: 'orders_placed', label: 'Orders Placed', type: NUM },
      ],
      rows: safeRows,
    };
  }

  // â”€â”€ 4. Delivery Drivers Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildDriversReport({ driverId }) {
    // `drivers` stores the name as first_name/last_name, keeps the phone on the
    // linked users row, and calls the rating column `rating` â€” not `name`,
    // `phone` and `driver_rating`.
    let sql = `
      SELECT d.id AS driver_id,
             TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))) AS name,
             COALESCE(du.phone, 'N/A') AS phone,
             COALESCE(d.vehicle_type, 'Truck') AS vehicle_type,
             COALESCE(d.plate_number, 'N/A') AS plate_number,
             CASE WHEN d.is_online = 1 THEN 'ONLINE' ELSE 'OFFLINE' END AS online_status,
             COUNT(DISTINCT o.id) AS deliveries_completed,
             COALESCE(d.rating, 5.0) AS rating
      FROM drivers d
      LEFT JOIN users du ON du.id = d.user_id
      LEFT JOIN orders o ON o.driver_id = d.id AND o.status IN ('delivered', 'completed')
      WHERE 1=1
    `;
    const params = [];

    if (driverId) {
      sql += ` AND d.id = ?`;
      params.push(driverId);
    }

    // Every non-aggregated column is listed explicitly: MySQL 8 enables
    // ONLY_FULL_GROUP_BY by default, where `GROUP BY d.id` alone is rejected.
    sql += `
      GROUP BY d.id, d.first_name, d.last_name, du.phone, d.vehicle_type,
               d.plate_number, d.is_online, d.rating
      ORDER BY deliveries_completed DESC`;

    const [rows] = await db.query(sql, params);
    const safeRows = rows || [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const summary = await this.getPlatformAdminMetrics(todayStr, todayStr);

    return {
      title: 'Delivery Drivers Fleet Report',
      summary,
      columns: [
        { key: 'driver_id', label: 'Driver ID', type: TEXT },
        { key: 'name', label: 'Driver Name', type: TEXT },
        { key: 'phone', label: 'Phone', type: TEXT },
        { key: 'vehicle_type', label: 'Vehicle', type: TEXT },
        { key: 'plate_number', label: 'Plate #', type: TEXT },
        { key: 'online_status', label: 'Status', type: TEXT },
        { key: 'deliveries_completed', label: 'Completed Deliveries', type: NUM },
        { key: 'rating', label: 'Rating', type: NUM },
      ],
      rows: safeRows,
    };
  }

  // â”€â”€ 5. Car Services Workers Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildCarWorkersReport({ workerId, vendorId }) {
    let sql = `
      SELECT w.id AS worker_id, w.name, w.phone, w.email,
             v.business_name AS station,
             COALESCE(w.role, 'Technician') AS role,
             COALESCE(w.status, 'active') AS status
      FROM workers w
      LEFT JOIN vendors v ON v.id = w.vendor_id
      WHERE 1=1
    `;
    const params = [];

    if (workerId) {
      sql += ` AND w.id = ?`;
      params.push(workerId);
    }
    if (vendorId) {
      sql += ` AND w.vendor_id = ?`;
      params.push(vendorId);
    }

    sql += ` ORDER BY w.created_at DESC`;

    const [rows] = await db.query(sql, params).catch(() => [[]]);
    const safeRows = rows || [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const summary = await this.getPlatformAdminMetrics(todayStr, todayStr);

    return {
      title: 'Car Services Workers & Technicians Report',
      summary,
      columns: [
        { key: 'worker_id', label: 'Worker ID', type: TEXT },
        { key: 'name', label: 'Worker Name', type: TEXT },
        { key: 'phone', label: 'Phone', type: TEXT },
        { key: 'email', label: 'Email', type: TEXT },
        { key: 'station', label: 'Service Station', type: TEXT },
        { key: 'role', label: 'Role', type: TEXT },
        { key: 'status', label: 'Status', type: TEXT },
      ],
      rows: safeRows,
    };
  }

  // â”€â”€ 6. Orders Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildOrdersReport({ from, to, vendorId, customerId, driverId, orderStatus }) {
    let sql = `
      SELECT o.id AS order_id, DATE(o.created_at) AS date,
             COALESCE(u.username, 'Customer') AS customer,
             v.business_name AS vendor,
             COALESCE(NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), ''), 'Unassigned') AS driver,
             o.status AS order_status,
             o.payment_status,
             COALESCE(o.delivery_address, 'N/A') AS delivery_address
      FROM orders o
      JOIN vendors v ON v.id = o.vendor_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN drivers d ON d.id = o.driver_id
      WHERE DATE(o.created_at) BETWEEN ? AND ?
    `;
    const params = [from, to];

    if (vendorId) {
      sql += ` AND o.vendor_id = ?`;
      params.push(vendorId);
    }
    if (customerId) {
      sql += ` AND o.customer_id = ?`;
      params.push(customerId);
    }
    if (driverId) {
      sql += ` AND o.driver_id = ?`;
      params.push(driverId);
    }
    if (orderStatus && orderStatus !== 'all') {
      sql += ` AND o.status = ?`;
      params.push(orderStatus);
    }

    sql += ` ORDER BY o.created_at DESC LIMIT 5000`;

    const [rows] = await db.query(sql, params);
    const safeRows = rows || [];
    const summary = await this.getPlatformAdminMetrics(from, to);

    return {
      title: 'Platform Orders Monitoring Report',
      summary,
      columns: [
        { key: 'order_id', label: 'Order #', type: TEXT },
        { key: 'date', label: 'Date', type: DATE },
        { key: 'customer', label: 'Customer', type: TEXT },
        { key: 'vendor', label: 'Vendor Station', type: TEXT },
        { key: 'driver', label: 'Assigned Driver', type: TEXT },
        { key: 'order_status', label: 'Order Status', type: TEXT },
        { key: 'payment_status', label: 'Payment Status', type: TEXT },
        { key: 'delivery_address', label: 'Delivery Address', type: TEXT },
      ],
      rows: safeRows,
    };
  }

  // â”€â”€ 7. Deliveries Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildDeliveriesReport({ from, to, vendorId, driverId, orderStatus }) {
    let sql = `
      SELECT o.id AS order_id, DATE(o.created_at) AS date,
             COALESCE(u.username, 'Customer') AS customer,
             v.business_name AS vendor,
             COALESCE(NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), ''), 'Unassigned') AS driver,
             COALESCE(v.address, 'Vendor Station') AS pickup_location,
             COALESCE(o.delivery_address, 'Customer Location') AS delivery_location,
             o.status AS delivery_status
      FROM orders o
      JOIN vendors v ON v.id = o.vendor_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN drivers d ON d.id = o.driver_id
      WHERE DATE(o.created_at) BETWEEN ? AND ?
    `;
    const params = [from, to];

    if (vendorId) {
      sql += ` AND o.vendor_id = ?`;
      params.push(vendorId);
    }
    if (driverId) {
      sql += ` AND o.driver_id = ?`;
      params.push(driverId);
    }
    if (orderStatus && orderStatus !== 'all') {
      sql += ` AND o.status = ?`;
      params.push(orderStatus);
    }

    sql += ` ORDER BY o.created_at DESC LIMIT 5000`;

    const [rows] = await db.query(sql, params);
    const safeRows = rows || [];
    const summary = await this.getPlatformAdminMetrics(from, to);

    return {
      title: 'Platform Deliveries & Logistics Report',
      summary,
      columns: [
        { key: 'order_id', label: 'Order #', type: TEXT },
        { key: 'date', label: 'Date', type: DATE },
        { key: 'customer', label: 'Customer', type: TEXT },
        { key: 'vendor', label: 'Vendor Station', type: TEXT },
        { key: 'driver', label: 'Assigned Driver', type: TEXT },
        { key: 'pickup_location', label: 'Pickup Address', type: TEXT },
        { key: 'delivery_location', label: 'Delivery Address', type: TEXT },
        { key: 'delivery_status', label: 'Status', type: TEXT },
      ],
      rows: safeRows,
    };
  }

  // â”€â”€ 8. Car Services Bookings Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildCarServicesReport({ from, to, vendorId, customerId, bookingStatus }) {
    let sql = `
      SELECT b.id AS booking_id, DATE(b.created_at) AS date,
             COALESCE(u.username, 'Customer') AS customer,
             v.business_name AS station,
             COALESCE(s.name, 'Car Wash Service') AS service,
             COALESCE(b.vehicle_type, 'Sedan') AS vehicle_type,
             b.status AS booking_status
      FROM car_wash_bookings b
      JOIN vendors v ON v.id = b.vendor_id
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN car_wash_services s ON s.id = b.service_id
      WHERE DATE(b.created_at) BETWEEN ? AND ?
    `;
    const params = [from, to];

    if (vendorId) {
      sql += ` AND b.vendor_id = ?`;
      params.push(vendorId);
    }
    if (customerId) {
      sql += ` AND b.customer_id = ?`;
      params.push(customerId);
    }
    if (bookingStatus && bookingStatus !== 'all') {
      sql += ` AND b.status = ?`;
      params.push(bookingStatus);
    }

    sql += ` ORDER BY b.created_at DESC LIMIT 5000`;

    const [rows] = await db.query(sql, params).catch(() => [[]]);
    const safeRows = rows || [];
    const summary = await this.getPlatformAdminMetrics(from, to);

    return {
      title: 'Car Services Bookings Report',
      summary,
      columns: [
        { key: 'booking_id', label: 'Booking #', type: TEXT },
        { key: 'date', label: 'Date', type: DATE },
        { key: 'customer', label: 'Customer', type: TEXT },
        { key: 'station', label: 'Service Station', type: TEXT },
        { key: 'service', label: 'Service Name', type: TEXT },
        { key: 'vehicle_type', label: 'Vehicle Type', type: TEXT },
        { key: 'booking_status', label: 'Status', type: TEXT },
      ],
      rows: safeRows,
    };
  }

  // â”€â”€ 9. Subscription Payments Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildSubscriptionPaymentsReport({ from, to, vendorId, subscriptionStatus }) {
    let sql = `
      SELECT p.id, p.reference_number, DATE(p.created_at) AS date,
             v.business_name AS vendor,
             p.plan_name AS plan,
             p.payment_method,
             p.amount,
             p.status AS subscription_status,
             COALESCE(p.admin_notes, 'â€”') AS admin_notes
      FROM vendor_subscription_payments p
      JOIN vendors v ON v.id = p.vendor_id
      WHERE DATE(p.created_at) BETWEEN ? AND ?
    `;
    const params = [from, to];

    if (vendorId) {
      sql += ` AND p.vendor_id = ?`;
      params.push(vendorId);
    }
    if (subscriptionStatus && subscriptionStatus !== 'all') {
      sql += ` AND p.status = ?`;
      params.push(subscriptionStatus);
    }

    sql += ` ORDER BY p.created_at DESC LIMIT 5000`;

    const [rows] = await db.query(sql, params);
    const safeRows = rows || [];
    const summary = await this.getPlatformAdminMetrics(from, to);

    return {
      title: 'Vendor Subscription Payments Report',
      summary,
      columns: [
        { key: 'reference_number', label: 'Reference #', type: TEXT },
        { key: 'date', label: 'Date', type: DATE },
        { key: 'vendor', label: 'Vendor Name', type: TEXT },
        { key: 'plan', label: 'Subscription Plan', type: TEXT },
        { key: 'payment_method', label: 'Method', type: TEXT },
        { key: 'amount', label: 'Amount ($)', type: MONEY },
        { key: 'subscription_status', label: 'Payment Status', type: TEXT },
        { key: 'admin_notes', label: 'Admin Note', type: TEXT },
      ],
      rows: safeRows,
    };
  }

  // â”€â”€ 10. Delivery Zones Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildDeliveryZonesReport({ zone }) {
    let sql = `
      SELECT v.district AS zone_name,
             COUNT(DISTINCT v.id) AS active_vendors,
             COUNT(DISTINCT o.id) AS total_orders_in_zone
      FROM vendors v
      LEFT JOIN orders o ON o.vendor_id = v.id
      WHERE v.district IS NOT NULL AND v.district != ''
    `;
    const params = [];

    if (zone && zone !== 'all') {
      sql += ` AND v.district LIKE ?`;
      params.push(`%${zone}%`);
    }

    sql += ` GROUP BY v.district ORDER BY total_orders_in_zone DESC`;

    const [rows] = await db.query(sql, params);
    const safeRows = rows || [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const summary = await this.getPlatformAdminMetrics(todayStr, todayStr);

    return {
      title: 'Platform Delivery Zones & Coverage Report',
      summary,
      columns: [
        { key: 'zone_name', label: 'District / Zone Name', type: TEXT },
        { key: 'active_vendors', label: 'Active Station Vendors', type: NUM },
        { key: 'total_orders_in_zone', label: 'Total Orders Handled', type: NUM },
      ],
      rows: safeRows,
    };
  }

  // â”€â”€ 11. System Activity Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async buildSystemActivityReport({ from, to }) {
    const [rows] = await db.query(
      `SELECT 'Order Placed' AS activity_type, id AS reference_id, DATE(created_at) AS date, CONCAT('Status: ', status) AS details
       FROM orders WHERE DATE(created_at) BETWEEN ? AND ?
       UNION ALL
       SELECT 'Subscription Paid' AS activity_type, id AS reference_id, DATE(created_at) AS date, CONCAT('Plan: ', plan_name, ' (', status, ')') AS details
       FROM vendor_subscription_payments WHERE DATE(created_at) BETWEEN ? AND ?
       UNION ALL
       SELECT 'New Vendor Registered' AS activity_type, id AS reference_id, DATE(created_at) AS date, business_name AS details
       FROM vendors WHERE DATE(created_at) BETWEEN ? AND ?
       ORDER BY date DESC LIMIT 5000`,
      [from, to, from, to, from, to]
    );

    const safeRows = rows || [];
    const summary = await this.getPlatformAdminMetrics(from, to);

    return {
      title: 'Platform Audit & System Activity Report',
      summary,
      columns: [
        { key: 'activity_type', label: 'Event / Action', type: TEXT },
        { key: 'reference_id', label: 'Ref ID', type: TEXT },
        { key: 'date', label: 'Date', type: DATE },
        { key: 'details', label: 'Details', type: TEXT },
      ],
      rows: safeRows,
    };
  }
}

module.exports = AdminReportEngineModel;
