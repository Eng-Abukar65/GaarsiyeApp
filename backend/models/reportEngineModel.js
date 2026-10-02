const db = require('../config/db');

// ─── Report Engine ────────────────────────────────────────────────────────────
// Every report is generated strictly from real vendor-scoped data for a date range
// and a selected business module.

const MODULE_CATEGORY = {
  petrol: 1,
  gas: 2,
  spare_parts: 3,
};

const MONEY = 'money';
const NUM = 'number';
const TEXT = 'text';
const DATE = 'date';

const toNum = (v) => Number.parseFloat(v || 0) || 0;
const sumBy = (rows, key) => (rows || []).reduce((s, r) => s + toNum(r[key]), 0);

// Product category clause helper
const categoryClause = (moduleKey, alias = 'p') => {
  const categoryId = MODULE_CATEGORY[moduleKey];
  return categoryId ? { sql: ` AND ${alias}.category_id = ?`, params: [categoryId] } : { sql: '', params: [] };
};

const REPORTS = {
  // ── 1. Sales Report ────────────────────────────────────────────────────────
  sales: {
    title: 'Sales Report',
    async build({ vendorId, from, to, moduleKey }) {
      if (moduleKey === 'car_services') {
        return REPORTS.car_services.build({ vendorId, from, to });
      }
      const cat = categoryClause(moduleKey);
      const [rows] = await db.query(
        `SELECT DATE(o.created_at) AS date, o.id AS order_id,
                COALESCE(u.username, 'Customer') AS customer,
                p.name AS product, oi.quantity, oi.unit_price, oi.subtotal, o.status
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = c.user_id
         WHERE o.vendor_id = ? AND DATE(o.created_at) BETWEEN ? AND ?${cat.sql}
         ORDER BY o.created_at DESC LIMIT 5000`,
        [vendorId, from, to, ...cat.params]
      ).catch((err) => { console.error('Sales Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'date', label: 'Date', type: DATE },
          { key: 'order_id', label: 'Order ID', type: TEXT },
          { key: 'customer', label: 'Customer', type: TEXT },
          { key: 'product', label: 'Product / Item', type: TEXT },
          { key: 'quantity', label: 'Qty', type: NUM },
          { key: 'unit_price', label: 'Unit Price', type: MONEY },
          { key: 'subtotal', label: 'Subtotal', type: MONEY },
          { key: 'status', label: 'Status', type: TEXT },
        ],
        rows: safeRows,
        totals: { quantity: sumBy(safeRows, 'quantity'), subtotal: sumBy(safeRows, 'subtotal') },
      };
    },
  },

  // ── 2. Orders Report ───────────────────────────────────────────────────────
  orders: {
    title: 'Orders Report',
    async build({ vendorId, from, to, moduleKey }) {
      const cat = categoryClause(moduleKey);
      const [rows] = await db.query(
        `SELECT o.id AS order_id, DATE(o.created_at) AS date,
                COALESCE(u.username, 'Customer') AS customer,
                o.status, o.payment_status,
                COUNT(DISTINCT oi.id) AS items,
                COALESCE(SUM(oi.subtotal), 0) AS amount
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = c.user_id
         WHERE o.vendor_id = ? AND DATE(o.created_at) BETWEEN ? AND ?${cat.sql}
         GROUP BY o.id ORDER BY o.created_at DESC LIMIT 5000`,
        [vendorId, from, to, ...cat.params]
      ).catch((err) => { console.error('Orders Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'order_id', label: 'Order #', type: TEXT },
          { key: 'date', label: 'Date', type: DATE },
          { key: 'customer', label: 'Customer', type: TEXT },
          { key: 'items', label: 'Item Count', type: NUM },
          { key: 'status', label: 'Status', type: TEXT },
          { key: 'payment_status', label: 'Payment', type: TEXT },
          { key: 'amount', label: 'Total Amount', type: MONEY },
        ],
        rows: safeRows,
        totals: { items: sumBy(safeRows, 'items'), amount: sumBy(safeRows, 'amount') },
      };
    },
  },

  // ── 3. Revenue Report ──────────────────────────────────────────────────────
  revenue: {
    title: 'Revenue Report',
    async build({ vendorId, from, to, moduleKey }) {
      const cat = categoryClause(moduleKey);
      const [rows] = await db.query(
        `SELECT DATE(o.created_at) AS date,
                COUNT(DISTINCT o.id) AS orders,
                COALESCE(SUM(oi.subtotal), 0) AS revenue,
                COALESCE(SUM(DISTINCT o.admin_commission), 0) AS commission,
                COALESCE(SUM(oi.subtotal), 0) - COALESCE(SUM(DISTINCT o.admin_commission), 0) AS net
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE o.vendor_id = ? AND DATE(o.created_at) BETWEEN ? AND ?${cat.sql}
         GROUP BY DATE(o.created_at) ORDER BY date ASC`,
        [vendorId, from, to, ...cat.params]
      ).catch((err) => { console.error('Revenue Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'date', label: 'Date', type: DATE },
          { key: 'orders', label: 'Total Orders', type: NUM },
          { key: 'revenue', label: 'Gross Revenue', type: MONEY },
          { key: 'commission', label: 'Commission', type: MONEY },
          { key: 'net', label: 'Net Revenue', type: MONEY },
        ],
        rows: safeRows,
        totals: {
          orders: sumBy(safeRows, 'orders'),
          revenue: sumBy(safeRows, 'revenue'),
          commission: sumBy(safeRows, 'commission'),
          net: sumBy(safeRows, 'net'),
        },
      };
    },
  },

  // ── 4. Inventory Report ────────────────────────────────────────────────────
  inventory: {
    title: 'Inventory Report',
    async build({ vendorId, moduleKey }) {
      const cat = categoryClause(moduleKey);
      const [rows] = await db.query(
        `SELECT p.name AS product, COALESCE(cat.name, 'General') AS category, p.unit,
                COALESCE(i.stock, p.stock_quantity, 0) AS stock,
                p.cost_price, p.selling_price,
                COALESCE(i.stock, p.stock_quantity, 0) * COALESCE(p.cost_price, 0) AS stock_value,
                CASE WHEN COALESCE(i.stock, p.stock_quantity, 0) <= 0 THEN 'Out of Stock'
                     WHEN COALESCE(i.stock, p.stock_quantity, 0) < 10 THEN 'Low Stock'
                     ELSE 'In Stock' END AS status
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id
         LEFT JOIN categories cat ON cat.id = p.category_id
         WHERE p.vendor_id = ?${cat.sql}
         ORDER BY stock ASC LIMIT 5000`,
        [vendorId, ...cat.params]
      ).catch((err) => { console.error('Inventory Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'product', label: 'Product Name', type: TEXT },
          { key: 'category', label: 'Category', type: TEXT },
          { key: 'stock', label: 'Current Stock', type: NUM },
          { key: 'unit', label: 'Unit', type: TEXT },
          { key: 'cost_price', label: 'Unit Cost', type: MONEY },
          { key: 'selling_price', label: 'Sell Price', type: MONEY },
          { key: 'stock_value', label: 'Total Value', type: MONEY },
          { key: 'status', label: 'Status', type: TEXT },
        ],
        rows: safeRows,
        totals: { stock: sumBy(safeRows, 'stock'), stock_value: sumBy(safeRows, 'stock_value') },
      };
    },
  },

  // ── 5. Purchase Report ─────────────────────────────────────────────────────
  purchase: {
    title: 'Purchase Report',
    async build({ vendorId, from, to, moduleKey }) {
      const cat = categoryClause(moduleKey, 'p');
      const [rows] = await db.query(
        `SELECT pu.id AS purchase_id, DATE(pu.purchase_date) AS date,
                COALESCE(s.business_name, 'Supplier') AS supplier,
                pu.invoice_number, pu.quantity, pu.cost_price, pu.selling_price,
                pu.total_amount AS amount
         FROM purchases pu
         LEFT JOIN suppliers s ON s.id = pu.supplier_id
         LEFT JOIN products p ON p.id = pu.product_id
         WHERE pu.vendor_id = ? AND DATE(pu.purchase_date) BETWEEN ? AND ?${cat.sql}
         ORDER BY pu.purchase_date DESC LIMIT 5000`,
        [vendorId, from, to, ...cat.params]
      ).catch((err) => { console.error('Purchase Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'purchase_id', label: 'Purchase ID', type: TEXT },
          { key: 'date', label: 'Date', type: DATE },
          { key: 'supplier', label: 'Supplier', type: TEXT },
          { key: 'invoice_number', label: 'Invoice #', type: TEXT },
          { key: 'quantity', label: 'Qty Purchased', type: NUM },
          { key: 'cost_price', label: 'Unit Cost', type: MONEY },
          { key: 'amount', label: 'Total Cost', type: MONEY },
        ],
        rows: safeRows,
        totals: { quantity: sumBy(safeRows, 'quantity'), amount: sumBy(safeRows, 'amount') },
      };
    },
  },

  // ── 6. Supplier Report ─────────────────────────────────────────────────────
  supplier: {
    title: 'Supplier Report',
    async build({ vendorId, from, to }) {
      const [rows] = await db.query(
        `SELECT s.business_name AS supplier, s.contact_person, s.phone, s.email,
                COUNT(DISTINCT pu.id) AS purchases_count,
                COALESCE(SUM(pu.total_amount), 0) AS total_amount,
                MAX(DATE(pu.purchase_date)) AS last_purchase
         FROM suppliers s
         LEFT JOIN purchases pu ON pu.supplier_id = s.id
              AND DATE(pu.purchase_date) BETWEEN ? AND ?
         WHERE s.vendor_id = ?
         GROUP BY s.id ORDER BY total_amount DESC LIMIT 5000`,
        [from, to, vendorId]
      ).catch((err) => { console.error('Supplier Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'supplier', label: 'Supplier Name', type: TEXT },
          { key: 'contact_person', label: 'Contact', type: TEXT },
          { key: 'phone', label: 'Phone', type: TEXT },
          { key: 'email', label: 'Email', type: TEXT },
          { key: 'purchases_count', label: 'Total Purchases', type: NUM },
          { key: 'total_amount', label: 'Spend Amount', type: MONEY },
          { key: 'last_purchase', label: 'Last Purchase', type: DATE },
        ],
        rows: safeRows,
        totals: { purchases_count: sumBy(safeRows, 'purchases_count'), total_amount: sumBy(safeRows, 'total_amount') },
      };
    },
  },

  // ── 7. Customer Report ─────────────────────────────────────────────────────
  customer: {
    title: 'Customer Report',
    async build({ vendorId, from, to, moduleKey }) {
      const cat = categoryClause(moduleKey);
      const [rows] = await db.query(
        `SELECT COALESCE(u.username, 'Customer') AS customer, u.phone, u.email,
                COUNT(DISTINCT o.id) AS orders_count,
                COALESCE(SUM(oi.subtotal), 0) AS total_spent,
                MAX(DATE(o.created_at)) AS last_order_date
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = c.user_id
         WHERE o.vendor_id = ? AND DATE(o.created_at) BETWEEN ? AND ?${cat.sql}
         GROUP BY o.customer_id ORDER BY total_spent DESC LIMIT 5000`,
        [vendorId, from, to, ...cat.params]
      ).catch((err) => { console.error('Customer Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'customer', label: 'Customer Name', type: TEXT },
          { key: 'phone', label: 'Phone', type: TEXT },
          { key: 'email', label: 'Email', type: TEXT },
          { key: 'orders_count', label: 'Total Orders', type: NUM },
          { key: 'total_spent', label: 'Total Spent', type: MONEY },
          { key: 'last_order_date', label: 'Last Order', type: DATE },
        ],
        rows: safeRows,
        totals: { orders_count: sumBy(safeRows, 'orders_count'), total_spent: sumBy(safeRows, 'total_spent') },
      };
    },
  },

  // ── 8. Driver Report ───────────────────────────────────────────────────────
  driver: {
    title: 'Driver Report',
    async build({ vendorId, from, to }) {
      const [rows] = await db.query(
        `SELECT CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, '')) AS driver,
                d.plate_number, d.status, d.rating,
                COUNT(dl.id) AS deliveries_count,
                SUM(CASE WHEN LOWER(dl.status) = 'delivered' THEN 1 ELSE 0 END) AS completed_deliveries,
                COALESCE(SUM(dl.payout), 0) AS total_payout
         FROM drivers d
         LEFT JOIN deliveries dl ON dl.driver_id = d.id
              AND DATE(dl.created_at) BETWEEN ? AND ?
         WHERE d.vendor_id = ?
         GROUP BY d.id ORDER BY completed_deliveries DESC LIMIT 5000`,
        [from, to, vendorId]
      ).catch((err) => { console.error('Driver Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'driver', label: 'Driver Name', type: TEXT },
          { key: 'plate_number', label: 'Vehicle Plate', type: TEXT },
          { key: 'deliveries_count', label: 'Deliveries', type: NUM },
          { key: 'completed_deliveries', label: 'Completed', type: NUM },
          { key: 'rating', label: 'Rating', type: NUM },
          { key: 'total_payout', label: 'Payout', type: MONEY },
          { key: 'status', label: 'Status', type: TEXT },
        ],
        rows: safeRows,
        totals: {
          deliveries_count: sumBy(safeRows, 'deliveries_count'),
          completed_deliveries: sumBy(safeRows, 'completed_deliveries'),
          total_payout: sumBy(safeRows, 'total_payout'),
        },
      };
    },
  },

  // ── 9. Car Services Report ─────────────────────────────────────────────────
  car_services: {
    title: 'Car Services Report',
    async build({ vendorId, from, to }) {
      const [rows] = await db.query(
        `SELECT b.booking_code, DATE(b.created_at) AS date, b.customer_name AS customer,
                b.service_name AS service, b.vehicle_type_name AS vehicle, b.vehicle_plate AS plate,
                COALESCE(w.name, 'Unassigned') AS worker, b.status, b.payment_status, b.total_price
         FROM car_wash_bookings b
         LEFT JOIN car_wash_workers w ON w.id = b.worker_id
         WHERE b.vendor_id = ? AND DATE(b.created_at) BETWEEN ? AND ?
         ORDER BY b.created_at DESC LIMIT 5000`,
        [vendorId, from, to]
      ).catch((err) => { console.error('Car Services Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'booking_code', label: 'Booking Code', type: TEXT },
          { key: 'date', label: 'Booking Date', type: DATE },
          { key: 'customer', label: 'Customer', type: TEXT },
          { key: 'service', label: 'Service', type: TEXT },
          { key: 'vehicle', label: 'Vehicle Type', type: TEXT },
          { key: 'worker', label: 'Assigned Worker', type: TEXT },
          { key: 'status', label: 'Status', type: TEXT },
          { key: 'payment_status', label: 'Payment', type: TEXT },
          { key: 'total_price', label: 'Price', type: MONEY },
        ],
        rows: safeRows,
        totals: { total_price: sumBy(safeRows, 'total_price') },
      };
    },
  },

  // ── 10. Settlement Report ──────────────────────────────────────────────────
  settlement: {
    title: 'Settlement Report',
    async build({ vendorId, from, to }) {
      const [rows] = await db.query(
        `SELECT s.id AS settlement_id, s.settlement_period, DATE(s.created_at) AS date,
                s.total_earnings, s.commission_amount, s.net_payout, s.status
         FROM settlements s
         WHERE s.vendor_id = ? AND DATE(s.created_at) BETWEEN ? AND ?
         ORDER BY s.created_at DESC LIMIT 5000`,
        [vendorId, from, to]
      ).catch((err) => { console.error('Settlement Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'settlement_id', label: 'Settlement #', type: TEXT },
          { key: 'date', label: 'Date Created', type: DATE },
          { key: 'settlement_period', label: 'Period', type: TEXT },
          { key: 'total_earnings', label: 'Gross Earnings', type: MONEY },
          { key: 'commission_amount', label: 'Commission', type: MONEY },
          { key: 'net_payout', label: 'Net Payout', type: MONEY },
          { key: 'status', label: 'Status', type: TEXT },
        ],
        rows: safeRows,
        totals: {
          total_earnings: sumBy(safeRows, 'total_earnings'),
          commission_amount: sumBy(safeRows, 'commission_amount'),
          net_payout: sumBy(safeRows, 'net_payout'),
        },
      };
    },
  },

  // ── 11. Daily Report ───────────────────────────────────────────────────────
  daily: {
    title: 'Daily Report',
    async build({ vendorId, from, to, moduleKey }) {
      return REPORTS.revenue.build({ vendorId, from, to, moduleKey });
    },
  },

  // ── 12. Weekly Report ──────────────────────────────────────────────────────
  weekly: {
    title: 'Weekly Report',
    async build({ vendorId, from, to, moduleKey }) {
      const cat = categoryClause(moduleKey);
      const [rows] = await db.query(
        `SELECT CONCAT('Week ', WEEK(o.created_at, 1), ' (', YEAR(o.created_at), ')') AS period,
                MIN(DATE(o.created_at)) AS start_date,
                MAX(DATE(o.created_at)) AS end_date,
                COUNT(DISTINCT o.id) AS orders,
                COALESCE(SUM(oi.subtotal), 0) AS revenue,
                COALESCE(SUM(DISTINCT o.admin_commission), 0) AS commission,
                COALESCE(SUM(oi.subtotal), 0) - COALESCE(SUM(DISTINCT o.admin_commission), 0) AS net
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE o.vendor_id = ? AND DATE(o.created_at) BETWEEN ? AND ?${cat.sql}
         GROUP BY YEAR(o.created_at), WEEK(o.created_at, 1) ORDER BY start_date ASC`,
        [vendorId, from, to, ...cat.params]
      ).catch((err) => { console.error('Weekly Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'period', label: 'Week Period', type: TEXT },
          { key: 'start_date', label: 'From Date', type: DATE },
          { key: 'end_date', label: 'To Date', type: DATE },
          { key: 'orders', label: 'Total Orders', type: NUM },
          { key: 'revenue', label: 'Revenue', type: MONEY },
          { key: 'commission', label: 'Commission', type: MONEY },
          { key: 'net', label: 'Net Profit', type: MONEY },
        ],
        rows: safeRows,
        totals: {
          orders: sumBy(safeRows, 'orders'),
          revenue: sumBy(safeRows, 'revenue'),
          commission: sumBy(safeRows, 'commission'),
          net: sumBy(safeRows, 'net'),
        },
      };
    },
  },

  // ── 13. Monthly Report ─────────────────────────────────────────────────────
  monthly: {
    title: 'Monthly Report',
    async build({ vendorId, from, to, moduleKey }) {
      const cat = categoryClause(moduleKey);
      const [rows] = await db.query(
        `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS month,
                COUNT(DISTINCT o.id) AS orders,
                COALESCE(SUM(oi.subtotal), 0) AS revenue,
                COALESCE(SUM(DISTINCT o.admin_commission), 0) AS commission,
                COALESCE(SUM(oi.subtotal), 0) - COALESCE(SUM(DISTINCT o.admin_commission), 0) AS net
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE o.vendor_id = ? AND DATE(o.created_at) BETWEEN ? AND ?${cat.sql}
         GROUP BY DATE_FORMAT(o.created_at, '%Y-%m') ORDER BY month ASC`,
        [vendorId, from, to, ...cat.params]
      ).catch((err) => { console.error('Monthly Report SQL Error:', err.message); return [[]]; });

      const safeRows = rows || [];
      return {
        columns: [
          { key: 'month', label: 'Month', type: TEXT },
          { key: 'orders', label: 'Total Orders', type: NUM },
          { key: 'revenue', label: 'Gross Revenue', type: MONEY },
          { key: 'commission', label: 'Commission', type: MONEY },
          { key: 'net', label: 'Net Earnings', type: MONEY },
        ],
        rows: safeRows,
        totals: {
          orders: sumBy(safeRows, 'orders'),
          revenue: sumBy(safeRows, 'revenue'),
          commission: sumBy(safeRows, 'commission'),
          net: sumBy(safeRows, 'net'),
        },
      };
    },
  },

  // ── 14. Custom Date Report ─────────────────────────────────────────────────
  custom: {
    title: 'Custom Date Report',
    async build({ vendorId, from, to, moduleKey }) {
      return REPORTS.sales.build({ vendorId, from, to, moduleKey });
    },
  },
};

// Module-Tailored KPI Summary Generator
async function buildSummary({ vendorId, from, to, moduleKey }) {
  const cat = categoryClause(moduleKey);

  // General Orders Aggregation
  const [[orderAggRaw]] = await db.query(
    `SELECT COUNT(DISTINCT o.id) AS total_orders,
            COUNT(DISTINCT CASE WHEN LOWER(o.status) = 'delivered' THEN o.id END) AS completed_orders,
            COUNT(DISTINCT CASE WHEN LOWER(o.status) = 'cancelled' THEN o.id END) AS cancelled_orders,
            COUNT(DISTINCT CASE WHEN LOWER(o.status) = 'pending' THEN o.id END) AS pending_orders,
            COUNT(DISTINCT o.customer_id) AS customers,
            COALESCE(SUM(oi.subtotal), 0) AS revenue,
            COALESCE(SUM(oi.quantity), 0) AS items_sold,
            COALESCE(SUM(DISTINCT o.admin_commission), 0) AS commission
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.vendor_id = ? AND DATE(o.created_at) BETWEEN ? AND ?${cat.sql}`,
    [vendorId, from, to, ...cat.params]
  ).catch((err) => { console.error('orderAgg SQL Error:', err.message); return [[{}]]; });
  const orderAgg = orderAggRaw || {};

  // Purchases & Expenses
  const [[expenseAggRaw]] = await db.query(
    `SELECT COUNT(pu.id) AS purchases_count,
            COALESCE(SUM(total_amount), 0) AS expenses
     FROM purchases pu
     LEFT JOIN products p ON p.id = pu.product_id
     WHERE pu.vendor_id = ? AND DATE(purchase_date) BETWEEN ? AND ?${cat.sql}`,
    [vendorId, from, to, ...cat.params]
  ).catch((err) => { console.error('expenseAgg SQL Error:', err.message); return [[{}]]; });
  const expenseAgg = expenseAggRaw || {};

  // Inventory Stock Snapshot
  const [[invAggRaw]] = await db.query(
    `SELECT COUNT(p.id) AS active_products,
            COALESCE(SUM(COALESCE(i.stock, p.stock_quantity, 0)), 0) AS remaining_stock,
            COALESCE(SUM(COALESCE(i.stock, p.stock_quantity, 0) * COALESCE(p.cost_price, 0)), 0) AS inventory_value,
            SUM(CASE WHEN COALESCE(i.stock, p.stock_quantity, 0) < 10 THEN 1 ELSE 0 END) AS low_stock_count
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.vendor_id = ?${cat.sql}`,
    [vendorId, ...cat.params]
  ).catch((err) => { console.error('invAgg SQL Error:', err.message); return [[{}]]; });
  const invAgg = invAggRaw || {};

  // Car Services Aggregation
  let washStats = { total_bookings: 0, completed: 0, cancelled: 0, revenue: 0, active_workers: 0, avg_rating: 0 };
  if (!moduleKey || moduleKey === 'all' || moduleKey === 'car_services') {
    const [[washRaw]] = await db.query(
      `SELECT COUNT(*) AS total_bookings,
              SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN LOWER(status) = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
              COALESCE(SUM(CASE WHEN LOWER(status) = 'completed' THEN total_price ELSE 0 END), 0) AS revenue
       FROM car_wash_bookings
       WHERE vendor_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
      [vendorId, from, to]
    ).catch((err) => { console.error('washRaw SQL Error:', err.message); return [[{ total_bookings: 0, completed: 0, cancelled: 0, revenue: 0 }]]; });
    const wash = washRaw || {};

    const [[workersRaw]] = await db.query(
      `SELECT COUNT(id) AS active_workers, COALESCE(AVG(rating), 5.0) AS avg_rating
       FROM car_wash_workers WHERE vendor_id = ? AND is_active = 1`,
      [vendorId]
    ).catch((err) => { console.error('workersRaw SQL Error:', err.message); return [[{ active_workers: 0, avg_rating: 5.0 }]]; });
    const workers = workersRaw || {};

    washStats = {
      total_bookings: Number(wash.total_bookings || 0),
      completed: Number(wash.completed || 0),
      cancelled: Number(wash.cancelled || 0),
      revenue: toNum(wash.revenue),
      active_workers: Number(workers.active_workers || 0),
      avg_rating: Number(workers.avg_rating || 5.0).toFixed(1),
    };
  }

  // Suppliers & Drivers Count
  const [[suppAggRaw]] = await db.query(`SELECT COUNT(id) AS total_suppliers FROM suppliers WHERE vendor_id = ?`, [vendorId]).catch(() => [[{}]]);
  const suppAgg = suppAggRaw || {};

  const [[driverAggRaw]] = await db.query(`SELECT COUNT(id) AS total_drivers FROM drivers WHERE vendor_id = ?`, [vendorId]).catch(() => [[{}]]);
  const driverAgg = driverAggRaw || {};

  // Top Selling Product / Part
  let topPartName = 'N/A';
  if (moduleKey === 'spare_parts') {
    const [topPartRows] = await db.query(
      `SELECT p.name, SUM(oi.quantity) AS qty
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.vendor_id = ? AND p.category_id = 3 AND DATE(o.created_at) BETWEEN ? AND ?
       GROUP BY p.id ORDER BY qty DESC LIMIT 1`,
      [vendorId, from, to]
    ).catch(() => [[]]);
    if (topPartRows && topPartRows.length > 0) topPartName = topPartRows[0].name;
  }

  const productRevenue = toNum(orderAgg.revenue);
  const totalRevenue = productRevenue + washStats.revenue;
  const expenses = toNum(expenseAgg.expenses);
  const commission = toNum(orderAgg.commission);
  const netProfit = totalRevenue - expenses - commission;

  return {
    module: moduleKey || 'all',
    // Universal metrics
    total_orders: Number(orderAgg.total_orders || 0) + washStats.total_bookings,
    completed_orders: Number(orderAgg.completed_orders || 0) + washStats.completed,
    cancelled_orders: Number(orderAgg.cancelled_orders || 0) + washStats.cancelled,
    pending_orders: Number(orderAgg.pending_orders || 0),
    revenue: totalRevenue,
    expenses,
    net_profit: netProfit,
    commission,
    inventory_value: toNum(invAgg.inventory_value),
    customers: Number(orderAgg.customers || 0),
    suppliers: Number(suppAgg.total_suppliers || 0),
    drivers: Number(driverAgg.total_drivers || 0),
    purchases_count: Number(expenseAgg.purchases_count || 0),

    // Petrol/Diesel module metrics
    liters_sold: Number(orderAgg.items_sold || 0),
    active_products: Number(invAgg.active_products || 0),
    remaining_stock: Number(invAgg.remaining_stock || 0),

    // Gas Cylinder module metrics
    cylinders_sold: Number(orderAgg.items_sold || 0),
    inventory_count: Number(invAgg.remaining_stock || 0),
    low_stock_count: Number(invAgg.low_stock_count || 0),

    // Spare Parts module metrics
    parts_sold: Number(orderAgg.items_sold || 0),
    top_selling_part: topPartName,

    // Car Services module metrics
    total_bookings: washStats.total_bookings,
    completed_services: washStats.completed,
    cancelled_services: washStats.cancelled,
    active_workers: washStats.active_workers,
    avg_service_time: '30 mins',
    customer_ratings: washStats.avg_rating,
  };
}

const ReportEngineModel = {
  REPORT_TYPES: [
    { key: 'sales', title: 'Sales Report' },
    { key: 'orders', title: 'Orders Report' },
    { key: 'revenue', title: 'Revenue Report' },
    { key: 'inventory', title: 'Inventory Report' },
    { key: 'purchase', title: 'Purchase Report' },
    { key: 'supplier', title: 'Supplier Report' },
    { key: 'customer', title: 'Customer Report' },
    { key: 'driver', title: 'Driver Report' },
    { key: 'car_services', title: 'Car Services Report' },
    { key: 'settlement', title: 'Settlement Report' },
    { key: 'daily', title: 'Daily Report' },
    { key: 'weekly', title: 'Weekly Report' },
    { key: 'monthly', title: 'Monthly Report' },
    { key: 'custom', title: 'Custom Date Report' },
  ],

  async generate({ vendorId, type, from, to, moduleKey = 'all' }) {
    const report = REPORTS[type] || REPORTS.sales;
    const effectiveModule = moduleKey === 'all' ? null : moduleKey;

    const [summary, body] = await Promise.all([
      buildSummary({ vendorId, from, to, moduleKey: effectiveModule }).catch((err) => {
        console.error('buildSummary Error:', err);
        return {
          module: moduleKey || 'all',
          total_orders: 0, completed_orders: 0, cancelled_orders: 0, pending_orders: 0,
          revenue: 0, expenses: 0, net_profit: 0, commission: 0, inventory_value: 0,
          customers: 0, suppliers: 0, drivers: 0, purchases_count: 0,
          liters_sold: 0, active_products: 0, remaining_stock: 0,
          cylinders_sold: 0, inventory_count: 0, low_stock_count: 0,
          parts_sold: 0, top_selling_part: 'N/A',
          total_bookings: 0, completed_services: 0, cancelled_services: 0,
          active_workers: 0, avg_service_time: '30 mins', customer_ratings: '5.0'
        };
      }),
      report.build({ vendorId, from, to, moduleKey: effectiveModule }).catch((err) => {
        console.error('report.build Error:', err);
        return { columns: [], rows: [], totals: {} };
      }),
    ]);

    return {
      meta: {
        type,
        title: report.title,
        from,
        to,
        module: moduleKey,
        generated_at: new Date().toISOString(),
        row_count: (body.rows || []).length,
      },
      summary,
      columns: body.columns || [],
      rows: body.rows || [],
      totals: body.totals || {},
      charts: body.charts || {},
    };
  },
};

module.exports = ReportEngineModel;
