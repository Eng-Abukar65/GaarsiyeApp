const db = require('../config/db');

// ─── Per-business-module vendor stats ─────────────────────────────────────────
// Each business module maps to a product category, so a module's cards/charts/
// tables only ever include that module's products and orders. Modules never mix.
//   petrol       → categories.id 1 (Petrol/Diesel)
//   gas          → categories.id 2 (Gas Cylinder)
//   spare_parts  → categories.id 3 (Spare Parts)
const MODULE_CATEGORY = { petrol: 1, gas: 2, spare_parts: 3 };

// `inventory` has no reorder_level column, so low stock uses a fixed threshold
// (matches the default the vendor dashboard already used).
const LOW_STOCK_THRESHOLD = 10;

const STOCK_EXPR = 'COALESCE(i.stock, p.stock_quantity, 0)';
const toNum = (v) => Number.parseFloat(v || 0) || 0;

const VendorModuleStatsModel = {
  MODULE_CATEGORY,

  async getModuleStats(vendorId, moduleKey) {
    const categoryId = MODULE_CATEGORY[moduleKey];
    if (!categoryId) {
      const err = new Error('Unknown business module.');
      err.statusCode = 400;
      throw err;
    }

    // ── Inventory / stock summary ────────────────────────────────────────────
    const [[stock]] = await db.query(
      `SELECT
         COUNT(*) AS product_count,
         COUNT(DISTINCT p.name) AS distinct_products,
         COALESCE(SUM(${STOCK_EXPR}), 0) AS total_stock,
         COALESCE(SUM(${STOCK_EXPR} * COALESCE(p.cost_price, 0)), 0) AS inventory_value,
         SUM(CASE WHEN ${STOCK_EXPR} <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
         SUM(CASE WHEN ${STOCK_EXPR} > 0 AND ${STOCK_EXPR} < ? THEN 1 ELSE 0 END) AS low_stock
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id
       WHERE p.vendor_id = ? AND p.category_id = ?`,
      [LOW_STOCK_THRESHOLD, vendorId, categoryId]
    );

    // ── Order summary (only orders containing this module's products) ────────
    const [[orders]] = await db.query(
      `SELECT
         COUNT(DISTINCT o.id) AS total_orders,
         COUNT(DISTINCT CASE WHEN LOWER(o.status) = 'pending' THEN o.id END) AS pending_orders,
         COUNT(DISTINCT CASE WHEN LOWER(o.status) = 'delivered' THEN o.id END) AS completed_orders,
         COALESCE(SUM(CASE WHEN LOWER(o.status) = 'delivered' THEN oi.subtotal ELSE 0 END), 0) AS total_revenue,
         COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN oi.subtotal ELSE 0 END), 0) AS today_sales
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.vendor_id = ? AND p.category_id = ?`,
      [vendorId, categoryId]
    );

    // ── Active deliveries for this module's orders ───────────────────────────
    const [[deliveries]] = await db.query(
      `SELECT COUNT(DISTINCT d.id) AS active_deliveries
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.vendor_id = ? AND p.category_id = ?
         AND d.status NOT IN ('delivered', 'failed', 'rejected')`,
      [vendorId, categoryId]
    );

    // ── Daily sales / revenue (last 7 days) ──────────────────────────────────
    const [daily] = await db.query(
      `SELECT DATE(o.created_at) AS day,
              COALESCE(SUM(oi.quantity), 0) AS quantity,
              COALESCE(SUM(oi.subtotal), 0) AS revenue
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.vendor_id = ? AND p.category_id = ?
         AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(o.created_at) ORDER BY day ASC`,
      [vendorId, categoryId]
    );

    // ── Top selling products ─────────────────────────────────────────────────
    const [topProducts] = await db.query(
      `SELECT p.name,
              COALESCE(SUM(oi.quantity), 0) AS quantity,
              COALESCE(SUM(oi.subtotal), 0) AS revenue
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.vendor_id = ? AND p.category_id = ?
       GROUP BY p.id ORDER BY quantity DESC LIMIT 8`,
      [vendorId, categoryId]
    );

    // ── Current inventory rows (for the stock/inventory chart + tables) ──────
    const [inventoryRows] = await db.query(
      `SELECT p.id, p.name, p.unit, p.selling_price,
              ${STOCK_EXPR} AS stock
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id
       WHERE p.vendor_id = ? AND p.category_id = ?
       ORDER BY stock ASC`,
      [vendorId, categoryId]
    );

    // ── Deliveries per day (last 7 days) for this module ─────────────────────
    const [dailyDeliveries] = await db.query(
      `SELECT DATE(d.created_at) AS day, COUNT(DISTINCT d.id) AS deliveries
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.vendor_id = ? AND p.category_id = ?
         AND d.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(d.created_at) ORDER BY day ASC`,
      [vendorId, categoryId]
    );

    // ── Recent orders for this module ────────────────────────────────────────
    const [recentOrders] = await db.query(
      `SELECT o.id, o.status, o.created_at, o.payment_status,
              COALESCE(u.username, 'Customer') AS customer_name,
              COALESCE(SUM(oi.subtotal), 0) AS module_amount,
              COALESCE(SUM(oi.quantity), 0) AS module_quantity
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = c.user_id
       WHERE o.vendor_id = ? AND p.category_id = ?
       GROUP BY o.id ORDER BY o.created_at DESC LIMIT 8`,
      [vendorId, categoryId]
    );

    const result = {
      cards: {
        product_count: Number(stock.product_count || 0),
        distinct_products: Number(stock.distinct_products || 0),
        total_stock: Math.round(toNum(stock.total_stock)),
        inventory_value: toNum(stock.inventory_value),
        out_of_stock: Number(stock.out_of_stock || 0),
        low_stock: Number(stock.low_stock || 0),
        total_orders: Number(orders.total_orders || 0),
        pending_orders: Number(orders.pending_orders || 0),
        completed_orders: Number(orders.completed_orders || 0),
        total_revenue: toNum(orders.total_revenue),
        today_sales: toNum(orders.today_sales),
        active_deliveries: Number(deliveries.active_deliveries || 0),
      },
      charts: {
        daily: daily.map((d) => ({ day: d.day, quantity: toNum(d.quantity), revenue: toNum(d.revenue) })),
        top_products: topProducts.map((p) => ({ name: p.name, quantity: toNum(p.quantity), revenue: toNum(p.revenue) })),
        inventory: inventoryRows.map((r) => ({ name: r.name, stock: toNum(r.stock) })),
        daily_deliveries: dailyDeliveries.map((d) => ({ day: d.day, deliveries: Number(d.deliveries || 0) })),
      },
      tables: {
        recent_orders: recentOrders.map((o) => ({
          id: o.id, status: o.status, created_at: o.created_at,
          payment_status: o.payment_status, customer_name: o.customer_name,
          amount: toNum(o.module_amount), quantity: toNum(o.module_quantity),
        })),
        // Full inventory for this module only (never another module's products).
        inventory: inventoryRows.map((r) => ({
          id: r.id,
          name: r.name,
          stock: toNum(r.stock),
          unit: r.unit,
          selling_price: toNum(r.selling_price),
          stock_value: toNum(r.stock) * toNum(r.selling_price),
          status: toNum(r.stock) <= 0
            ? 'out_of_stock'
            : (toNum(r.stock) < LOW_STOCK_THRESHOLD ? 'low' : 'in_stock'),
        })),
        low_stock_products: inventoryRows
          .filter((r) => toNum(r.stock) < LOW_STOCK_THRESHOLD)
          .slice(0, 10)
          .map((r) => ({ name: r.name, stock: toNum(r.stock), unit: r.unit })),
      },
      meta: { module: moduleKey, category_id: categoryId, low_stock_threshold: LOW_STOCK_THRESHOLD },
    };

    // ── Module-specific extras ───────────────────────────────────────────────
    if (moduleKey === 'petrol') {
      // Petrol vs Diesel are separate products inside the Petrol/Diesel category.
      const [[split]] = await db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN LOWER(p.name) LIKE '%diesel%' THEN ${STOCK_EXPR} ELSE 0 END), 0) AS diesel_stock,
           COALESCE(SUM(CASE WHEN LOWER(p.name) NOT LIKE '%diesel%' THEN ${STOCK_EXPR} ELSE 0 END), 0) AS petrol_stock
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id
         WHERE p.vendor_id = ? AND p.category_id = ?`,
        [vendorId, categoryId]
      );
      result.cards.petrol_stock = Math.round(toNum(split.petrol_stock));
      result.cards.diesel_stock = Math.round(toNum(split.diesel_stock));

      const [fuelSplitDaily] = await db.query(
        `SELECT DATE(o.created_at) AS day,
                COALESCE(SUM(CASE WHEN LOWER(p.name) LIKE '%diesel%' THEN oi.quantity ELSE 0 END), 0) AS diesel,
                COALESCE(SUM(CASE WHEN LOWER(p.name) NOT LIKE '%diesel%' THEN oi.quantity ELSE 0 END), 0) AS petrol
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE o.vendor_id = ? AND p.category_id = ?
           AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(o.created_at) ORDER BY day ASC`,
        [vendorId, categoryId]
      );
      result.charts.fuel_split = fuelSplitDaily.map((d) => ({
        day: d.day, petrol: toNum(d.petrol), diesel: toNum(d.diesel),
      }));
    }

    if (moduleKey === 'gas') {
      // "Filled" cylinders = units currently in stock. Empty-cylinder returns are
      // not tracked in the schema, so that figure is reported as 0 rather than guessed.
      result.cards.cylinder_types = Number(stock.distinct_products || 0);
      result.cards.filled_cylinders = Math.round(toNum(stock.total_stock));
      result.cards.empty_cylinders = 0;
    }

    if (moduleKey === 'spare_parts') {
      const [[cats]] = await db.query(
        `SELECT COUNT(DISTINCT p.name) AS categories_count
         FROM products p WHERE p.vendor_id = ? AND p.category_id = ?`,
        [vendorId, categoryId]
      );
      result.cards.categories_count = Number(cats.categories_count || 0);
    }

    return result;
  },
};

module.exports = VendorModuleStatsModel;
