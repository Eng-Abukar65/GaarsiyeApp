const db = require('../config/db');
const DriverModel = require('./driverModel');
const { ensureVendorSchema } = require('../utils/vendorSchema');

class AdminModel {
  static async findByEmail(identifier) {
    const normalized = String(identifier || '').trim().toLowerCase();
    const [rows] = await db.query(`
      SELECT u.*, r.name as role 
      FROM users u 
      JOIN roles r ON u.role_id = r.id 
      WHERE (LOWER(u.email) = ? OR LOWER(u.username) = ? OR u.phone = ?) AND r.name = 'admin'
    `, [normalized, normalized, normalized]);
    return rows[0];
  }

  static async getDashboardStats(period = 'month') {
    let interval;
    switch (period) {
      case 'today': interval = '1 DAY'; break;
      case 'week':  interval = '7 DAY'; break;
      case 'year':  interval = '1 YEAR'; break;
      default:      interval = '1 MONTH';
    }
    const prevInterval = period === 'today' ? '2 DAY' : period === 'week' ? '14 DAY' : period === 'year' ? '2 YEAR' : '2 MONTH';

    const scalar = async (sql, field = 'c') => {
      const [rows] = await db.query(sql);
      return Number(rows[0]?.[field] ?? 0);
    };

    // Admin income = approved vendor subscription payments only
    const subscriptionRevenue = await scalar(
      `SELECT COALESCE(SUM(amount),0) AS c FROM vendor_subscription_payments WHERE status = 'approved' AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})`
    );
    const prevSubscriptionRevenue = await scalar(
      `SELECT COALESCE(SUM(amount),0) AS c FROM vendor_subscription_payments WHERE status = 'approved' AND created_at >= DATE_SUB(NOW(), INTERVAL ${prevInterval}) AND created_at < DATE_SUB(NOW(), INTERVAL ${interval})`
    );
    const pendingSubscriptions = await scalar(`SELECT COUNT(*) AS c FROM vendor_subscription_payments WHERE status = 'pending'`);
    const approvedSubscriptions = await scalar(`SELECT COUNT(*) AS c FROM vendor_subscription_payments WHERE status = 'approved'`);
    const totalSubscriptionRevenueAllTime = await scalar(`SELECT COALESCE(SUM(amount),0) AS c FROM vendor_subscription_payments WHERE status = 'approved'`);

    // Subscription revenue chart
    let revenueTrends = [];
    try {
      const groupExpr = period === 'year' ? "DATE_FORMAT(created_at, '%b')" : "DATE_FORMAT(created_at, '%b %d')";
      const orderExpr = period === 'year' ? 'MONTH(created_at)' : 'DATE(created_at)';
      const [trendRows] = await db.query(
        `SELECT ${groupExpr} AS name, COALESCE(SUM(amount),0) AS value FROM vendor_subscription_payments WHERE status = 'approved' AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval}) GROUP BY name, ${orderExpr} ORDER BY ${orderExpr}`
      );
      revenueTrends = trendRows;
    } catch { revenueTrends = []; }

    // Orders
    await DriverModel.ensurePresenceSchema();
    await db.query(`UPDATE drivers SET is_online = 0, status = 'offline' WHERE is_online = 1 AND (last_seen IS NULL OR last_seen < DATE_SUB(NOW(), INTERVAL 30 SECOND))`);
    const norm = "REPLACE(LOWER(status), ' ', '_')";
    const activeOrders    = await scalar(`SELECT COUNT(*) AS c FROM orders WHERE ${norm} NOT IN ('delivered','completed','cancelled','failed')`);
    const totalOrdersAll  = await scalar('SELECT COUNT(*) AS c FROM orders');
    const pendingOrders   = await scalar(`SELECT COUNT(*) AS c FROM orders WHERE ${norm} IN ('pending','processing','pending_driver_assignment')`);
    const activeDeliveries = await scalar(`SELECT COUNT(*) AS c FROM orders WHERE ${norm} IN ('accepted','preparing','driver_assigned','assigned','on_the_way','arrived')`);
    const completedOrders = await scalar(`SELECT COUNT(*) AS c FROM orders WHERE ${norm} IN ('delivered','completed')`);
    const cancelledOrders = await scalar(`SELECT COUNT(*) AS c FROM orders WHERE ${norm} IN ('cancelled','failed')`);

    // Drivers
    const onlineDrivers = await scalar('SELECT COUNT(*) AS c FROM drivers WHERE is_online = 1 AND last_seen >= DATE_SUB(NOW(), INTERVAL 30 SECOND)');
    const totalDrivers  = await scalar('SELECT COUNT(*) AS c FROM drivers');

    // Users & vendors
    const totalUsers   = await scalar("SELECT COUNT(*) AS c FROM users WHERE status IS NULL OR status <> 'deleted'");
    const totalVendors = await scalar('SELECT COUNT(*) AS c FROM vendors');
    const [vendorByStatus] = await db.query("SELECT verification_status AS s, COUNT(*) AS c FROM vendors GROUP BY verification_status");
    const vs = vendorByStatus.reduce((acc, r) => { acc[r.s] = Number(r.c); return acc; }, {});

    // Vendor business type distribution (real modules only, no "Other")
    let vendorsByType = [];
    try {
      const [bTypes] = await db.query('SELECT id, name FROM business_types');
      const [vendors] = await db.query('SELECT id, business_type FROM vendors');
      const [vbt] = await db.query('SELECT vendor_id, business_type_id FROM vendor_business_types');

      const moduleColors = {
        'Gas Depot': '#10B981',
        'Petrol/Diesel': '#3B82F6',
        'Car Services': '#8B5CF6',
        'Spare Parts': '#F59E0B',
      };

      const moduleDisplayNames = {
        'Gas Depot': 'Gas Depot',
        'Petrol Station': 'Petrol/Diesel',
        'Spare Parts Shop': 'Spare Parts',
        'Car Wash': 'Car Services',
      };

      const counts = {
        'Gas Depot': new Set(),
        'Petrol/Diesel': new Set(),
        'Car Services': new Set(),
        'Spare Parts': new Set(),
      };

      vbt.forEach(row => {
        const bt = bTypes.find(t => t.id === row.business_type_id);
        if (bt) {
          const displayName = moduleDisplayNames[bt.name] || bt.name;
          if (counts[displayName]) {
            counts[displayName].add(row.vendor_id);
          }
        }
      });

      vendors.forEach(v => {
        const str = (v.business_type || '').toLowerCase();
        if (str.includes('gas') || str.includes('cylinder') || str.includes('lpg')) {
          counts['Gas Depot'].add(v.id);
        }
        if (str.includes('petrol') || str.includes('fuel') || str.includes('diesel') || str.includes('station')) {
          counts['Petrol/Diesel'].add(v.id);
        }
        if (str.includes('spare') || str.includes('part')) {
          counts['Spare Parts'].add(v.id);
        }
        if (str.includes('car') || str.includes('wash') || str.includes('service')) {
          counts['Car Services'].add(v.id);
        }
      });

      vendorsByType = Object.entries(counts)
        .map(([name, set]) => ({
          name,
          value: set.size,
          color: moduleColors[name] || '#3B82F6',
        }))
        .filter(item => item.value >= 0)
        .sort((a, b) => b.value - a.value);
    } catch (typeErr) {
      console.error('[ADMIN DASHBOARD] vendorsByType calculation error:', typeErr);
      vendorsByType = [];
    }

    // Car Services overview
    let carServicesStats = { pending: 0, awaitingWorker: 0, inProgress: 0, completed: 0, cancelled: 0, totalBookings: 0 };
    let activeCarWorkers = 0;
    try {
      const [cwbRows] = await db.query(`SELECT LOWER(REPLACE(COALESCE(status,'pending'),' ','_')) AS s, COUNT(*) AS c FROM car_wash_bookings GROUP BY s`);
      cwbRows.forEach(r => {
        const s = r.s;
        if (s === 'pending' || s === 'confirmed') carServicesStats.pending += Number(r.c);
        else if (s === 'awaiting_worker' || s === 'worker_assigned') carServicesStats.awaitingWorker += Number(r.c);
        else if (s === 'in_progress' || s === 'started') carServicesStats.inProgress += Number(r.c);
        else if (s === 'completed') carServicesStats.completed += Number(r.c);
        else if (s === 'cancelled') carServicesStats.cancelled += Number(r.c);
        carServicesStats.totalBookings += Number(r.c);
      });
      activeCarWorkers = await scalar('SELECT COUNT(*) AS c FROM car_wash_workers WHERE is_active = 1');
    } catch { /* car_wash tables may not exist yet */ }

    // Recent subscription payments
    let recentSubscriptions = [];
    try {
      const [subRows] = await db.query(`
        SELECT sp.id, sp.plan_name, sp.amount, sp.payment_method, sp.status, sp.created_at,
               COALESCE(v.business_name, v.name, 'Unknown Vendor') AS vendor_name
        FROM vendor_subscription_payments sp
        LEFT JOIN vendors v ON sp.vendor_id = v.id
        ORDER BY sp.created_at DESC LIMIT 8
      `);
      recentSubscriptions = subRows;
    } catch { recentSubscriptions = []; }

    // Vendors awaiting approval
    let pendingVendorsList = [];
    try {
      const [pvRows] = await db.query(`
        SELECT id, COALESCE(business_name, name) AS business_name, email, created_at, business_type
        FROM vendors WHERE verification_status = 'pending'
        ORDER BY created_at DESC LIMIT 6
      `);
      pendingVendorsList = pvRows;
    } catch { pendingVendorsList = []; }

    // Recent orders
    let recentOrders = [];
    try {
      const [orderRows] = await db.query(`
        SELECT o.id, o.status, o.created_at,
               COALESCE(u.username,'Guest') AS customer_name,
               COALESCE(v.business_name, v.name,'') AS vendor_name
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN vendors v ON o.vendor_id = v.id
        ORDER BY o.created_at DESC LIMIT 8
      `);
      recentOrders = orderRows;
    } catch { recentOrders = []; }

    const trend = (curr, prev) => {
      if (!prev || prev === 0) return curr > 0 ? '+100%' : '0%';
      const d = ((curr - prev) / prev) * 100;
      return (d >= 0 ? '+' : '') + d.toFixed(1) + '%';
    };

    return {
      // Top cards
      subscriptionRevenue,
      subscriptionRevenueTrend: trend(subscriptionRevenue, prevSubscriptionRevenue),
      subscriptionRevenueTrendDir: subscriptionRevenue >= prevSubscriptionRevenue ? 'up' : 'down',
      pendingSubscriptions,
      approvedSubscriptions,
      totalSubscriptionRevenueAllTime,
      activeOrders,
      onlineDrivers,
      totalDrivers,
      // Platform overview
      totalUsers,
      totalVendors,
      approvedVendors:  vs.verified  || 0,
      pendingVendors:   vs.pending   || 0,
      rejectedVendors:  vs.rejected  || 0,
      suspendedVendors: vs.suspended || 0,
      totalOrders: totalOrdersAll,
      pendingOrders,
      activeDeliveries,
      completedOrders,
      cancelledOrders,
      carServicesBookings: carServicesStats.totalBookings,
      // Car services
      carServices: carServicesStats,
      activeCarWorkers,
      // Charts
      revenueTrends,
      vendorsByType,
      // Lists
      recentSubscriptions,
      pendingVendorsList,
      recentOrders,
    };
  }

  static async getAllUsers(role = null) {
    if (role) {
      role = role.toString().toLowerCase().trim().replace(/_/g, ' ');
      if (role === 'all users') role = 'all';
    } else {
      role = 'all';
    }

    // Auto-offline users who haven't been seen in 10 minutes
    await db.query(`UPDATE users SET is_online = 0 WHERE is_online = 1 AND last_seen < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`);
    await db.query(`UPDATE vendors SET is_online = 0 WHERE is_online = 1 AND last_seen < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`);
    await DriverModel.ensurePresenceSchema();
    await db.query(`UPDATE drivers SET is_online = 0, status = 'offline' WHERE is_online = 1 AND (last_seen IS NULL OR last_seen < DATE_SUB(NOW(), INTERVAL 30 SECOND))`);

    // Special branch: when role=vendor, join vendors table to return full vendor profile data
    if (role === 'vendor') {
      console.log('DEBUG getAllUsers: role=vendor, querying vendors + users join');
      const [rows] = await db.query(`
        SELECT 
          u.id,
          COALESCE(u.username, v.business_name, v.contact_name, 'Unknown Vendor') as username,
          COALESCE(NULLIF(v.business_name, ''), NULLIF(v.contact_name, ''), u.username, 'Unknown Vendor') as name,
          COALESCE(NULLIF(u.email, ''), 'N/A') as email,
          COALESCE(NULLIF(u.phone, ''), 'N/A') as phone,
          COALESCE(v.verification_status, u.status, 'active') as status,
          COALESCE(v.created_at, u.created_at) as created_at,
          IF(COALESCE(u.is_online, v.is_online) = 1 AND COALESCE(u.last_seen, v.last_seen) >= DATE_SUB(NOW(), INTERVAL 5 MINUTE), 1, 0) as is_online,
          COALESCE(u.last_seen, v.last_seen) as last_seen,
          COALESCE(u.last_login, v.last_login) as last_login,
          'vendor' as role,
          v.id as vendor_id,
          v.business_name,
          v.contact_name as owner_name,
          v.address,
          v.city,
          v.district,
          COALESCE(v.verification_status, 'pending') as vendor_status,
          v.rating
        FROM vendors v
        LEFT JOIN users u ON v.user_id = u.id
        WHERE u.id IS NULL OR u.status != 'deleted'
        ORDER BY COALESCE(v.created_at, u.created_at) DESC
      `);
      console.log(`DEBUG getAllUsers: vendor role returned ${rows.length} records`);
      if (rows.length > 0) console.log('DEBUG getAllUsers: first vendor record:', JSON.stringify(rows[0]));

      const [totalVendors] = await db.query('SELECT COUNT(*) as c FROM vendors');
      console.log(`DEBUG getAllUsers: total vendors in vendors table = ${totalVendors[0].c}`);
      console.log(`DEBUG getAllUsers: missing vendors count = ${totalVendors[0].c - rows.length}`);

      return rows;
    }

    let query = `
      SELECT 
        u.id, 
        COALESCE(u.username, v.business_name, v.contact_name, c.first_name, d.first_name, 'Unknown') as name, 
        COALESCE(u.username, v.business_name, c.first_name, d.first_name, 'Unknown') as username,
        COALESCE(NULLIF(u.email, ''), NULLIF(v.email, ''), 'N/A') as email, 
        COALESCE(NULLIF(u.phone, ''), NULLIF(v.phone, ''), 'N/A') as phone, 
        COALESCE(u.status, 'active') as status, 
        u.created_at, 
        COALESCE(r.name, 'customer') as role,
        IF(COALESCE(d.is_online, u.is_online, v.is_online) = 1 AND COALESCE(d.last_seen, u.last_seen, v.last_seen) >= DATE_SUB(NOW(), INTERVAL 30 SECOND), 1, 0) as is_online,
        COALESCE(d.last_seen, u.last_seen, v.last_seen) as last_seen,
        COALESCE(u.last_login, v.last_login) as last_login,
        d.profile_picture, 
        d.rating as driver_rating, 
        d.total_deliveries,
        v.id as vendor_id,
        v.business_name,
        v.contact_name as owner_name,
        v.address,
        v.city,
        v.district,
        v.verification_status as vendor_status,
        v.rating
      FROM users u 
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN drivers d ON u.id = d.user_id
      LEFT JOIN vendors v ON u.id = v.user_id
      LEFT JOIN customers c ON u.id = c.user_id
      WHERE u.status IS NULL OR u.status != 'deleted'
    `;
    const params = [];

    if (role && role !== 'all') {
      if (role === 'online') {
        query += ' AND u.is_online = 1';
      } else if (role === 'offline') {
        query += ' AND u.is_online = 0';
      } else {
        query += ' AND r.name = ?';
        params.push(role);
      }
    }

    if (!role || role === 'all') {
       query += `
         UNION ALL
         SELECT 
           NULL as id,
           COALESCE(NULLIF(v.business_name, ''), NULLIF(v.contact_name, ''), 'Unknown Vendor') as name,
           COALESCE(NULLIF(v.business_name, ''), NULLIF(v.contact_name, ''), 'Unknown Vendor') as username,
           COALESCE(NULLIF(v.email, ''), 'N/A') as email,
           COALESCE(NULLIF(v.phone, ''), 'N/A') as phone,
           COALESCE(v.verification_status, 'active') as status,
           v.created_at,
           'vendor' as role,
           IF(v.is_online = 1 AND v.last_seen >= DATE_SUB(NOW(), INTERVAL 5 MINUTE), 1, 0) as is_online,
           v.last_seen,
           v.last_login,
           NULL as profile_picture,
           NULL as driver_rating,
           NULL as total_deliveries,
           v.id as vendor_id,
           v.business_name,
           v.contact_name as owner_name,
           v.address,
           v.city,
           v.district,
           COALESCE(v.verification_status, 'pending') as vendor_status,
           v.rating
         FROM vendors v
         LEFT JOIN users u ON v.user_id = u.id
         WHERE u.id IS NULL OR u.status = 'deleted'
       `;
    }

    query = `SELECT * FROM (${query}) as combined ORDER BY created_at DESC`;
    
    const [rows] = await db.query(query, params);

    // DEBUG: Log "Has" or "asmoplus" specifically
    const targetUser = rows.find(r => 
      (r.name && (r.name.includes('Has') || r.name.includes('asmo'))) || 
      (r.business_name && (r.business_name.includes('Has') || r.business_name.includes('asmo')))
    );
    if (targetUser) {
      console.log('DEBUG getAllUsers: Target user status ->', JSON.stringify({
        id: targetUser.id || `v-${targetUser.vendor_id}`,
        name: targetUser.name,
        is_online: targetUser.is_online,
        last_seen: targetUser.last_seen,
        db_is_online: targetUser.db_is_online // Note: I might want to select the raw db value too
      }));
    }

    return rows;
  }

  // People are NEVER hard-deleted. Customers, drivers and vendors carry orders,
  // bookings, deliveries, payments, commissions and audit history; removing the
  // row would orphan or cascade-destroy that history. The previous behaviour
  // hard-deleted whenever the user had no rows in `orders` — which missed car
  // wash bookings, deliveries and payments entirely, so real people with real
  // history were being permanently erased. We now always archive.
  static async deleteUser(id) {
    const [result] = await db.query(
      'UPDATE users SET status = "deleted", deleted_at = NOW(), is_online = 0 WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return { success: false, type: 'soft' };
    }

    // Mirror the archive onto the role-specific profile rows so the person drops
    // out of active/assignment lists while every historical record stays joinable.
    await db.query(
      'UPDATE drivers SET status = "offline", is_online = 0 WHERE user_id = ?',
      [id]
    );
    await db.query(
      'UPDATE vendors SET status = "inactive", is_online = 0 WHERE user_id = ?',
      [id]
    );

    return { success: true, type: 'soft' };
  }

  static async updateUserOnlineStatus(userId, isOnline) {
    if (isOnline) {
      await db.query('UPDATE users SET is_online = 1, last_seen = NOW(), last_login = NOW() WHERE id = ?', [userId]);
      
      // Update online status in users table without firing noisy notifications
    } else {
      await db.query('UPDATE users SET is_online = 0, last_seen = NOW() WHERE id = ?', [userId]);
    }
  }

  static async updateLastSeen(userId) {
    await db.query('UPDATE users SET last_seen = NOW(), is_online = 1 WHERE id = ?', [userId]);
  }

  static async getAllVendors() {
    try {
      await ensureVendorSchema();
      console.log('DEBUG getAllVendors: Fetching all vendors from database');
      const [rows] = await db.query(`
        SELECT 
          v.id as vendor_id,
          v.id,
          v.user_id,
          COALESCE(NULLIF(v.business_name, ''), 'Unknown Vendor') as business_name,
          COALESCE(NULLIF(v.business_name, ''), 'Unknown Vendor') as display_name,
          COALESCE(NULLIF(v.contact_name, ''), u.username, 'Unknown') as owner_name,
          v.contact_name,
          u.username,
          COALESCE(NULLIF(v.email, ''), NULLIF(u.email, ''), 'N/A') as email,
          COALESCE(NULLIF(v.phone, ''), NULLIF(u.phone, ''), 'N/A') as phone,
          v.address,
          v.city,
          v.district,
          v.nira_id,
          v.government_patent,
          v.passport_number,
          v.latitude,
          v.longitude,
          COALESCE(v.verification_status, 'pending') as status,
          COALESCE(v.verification_status, 'pending') as verification_status,
          COALESCE(v.rating, 0) as rating,
          COALESCE(u.status, 'active') as user_status,
          u.is_online,
          v.logo_url,
          v.created_at,
          (SELECT COUNT(*) FROM orders o WHERE o.vendor_id = v.id) as total_orders,
          (SELECT GROUP_CONCAT(bt.name SEPARATOR ',') FROM vendor_business_types vbt JOIN business_types bt ON vbt.business_type_id = bt.id WHERE vbt.vendor_id = v.id) as business_types_raw
        FROM vendors v
        LEFT JOIN users u ON v.user_id = u.id
        ORDER BY v.created_at DESC
      `);
      console.log(`DEBUG getAllVendors: Fetched ${rows.length} vendors`);
      if (rows.length > 0) console.log('DEBUG getAllVendors: first vendor:', JSON.stringify(rows[0]));
      return rows.map(r => ({
        ...r,
        business_types: r.business_types_raw ? r.business_types_raw.split(',') : []
      }));
    } catch (err) {
      console.error('DEBUG getAllVendors: Database error:', err);
      throw err;
    }
  }

  static async getVendorById(id) {
    await ensureVendorSchema();
    const [rows] = await db.query(`
      SELECT 
        v.id,
        v.user_id,
        v.name,
        v.business_name,
        v.contact_name,
        v.email,
        v.phone,
        v.address,
        v.city,
        v.district,
        v.latitude,
        v.longitude,
        v.logo,
        v.logo_url,
        v.business_type,
        v.status,
        v.verification_status,
        v.nira_id,
        v.government_patent,
        v.passport_number,
        u.username,
        u.status as user_status,
      (SELECT GROUP_CONCAT(bt.name) FROM vendor_business_types vbt JOIN business_types bt ON vbt.business_type_id = bt.id WHERE vbt.vendor_id = v.id) as business_types
      FROM vendors v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.id = ?
    `, [id]);
    if (rows[0]) {
      rows[0].business_types = rows[0].business_types ? rows[0].business_types.split(',') : [];
    }
    return rows[0];
  }

  static async createVendor(vendorData) {
    const {
      business_name, contact_name, email, phone, username, password,
      address, city, district, latitude, longitude, business_types,
      verification_status, logo_url, nira_id, government_patent, passport_number, admin_notes
    } = vendorData;
    await ensureVendorSchema();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [roleRows] = await connection.query('SELECT id FROM roles WHERE name = "vendor"');
      const roleId = roleRows[0]?.id || 4;

      if (!password) throw new Error('A generated initial password is required.');
      const password_hash = await require('bcryptjs').hash(password, 12);

      const userStatus = verification_status === 'rejected' || verification_status === 'suspended'
        ? 'suspended'
        : 'active';

      const [userResult] = await connection.query(
        'INSERT INTO users (username, email, password_hash, role_id, phone, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [username || business_name, normalizedEmail, password_hash, roleId, phone || null, userStatus]
      );
      const userId = userResult.insertId;

      let primary_type = null;
      if (business_types && business_types.length > 0) {
        primary_type = business_types[0];
      }

      const [vendorResult] = await connection.query(
        `INSERT INTO vendors
        (user_id, business_name, name, contact_name, email, password, phone, business_type,
         address, city, district, latitude, longitude, verification_status, logo_url, nira_id, government_patent, passport_number, admin_notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, business_name, business_name, contact_name || business_name,
          normalizedEmail, password_hash, phone || null, primary_type,
          address, city, district, latitude || null, longitude || null,
          verification_status || 'pending', logo_url || null, nira_id || null, government_patent || null, passport_number || null,
          admin_notes || null, userStatus
        ]
      );
      const vendorId = vendorResult.insertId;

      if (business_types && Array.isArray(business_types)) {
        for (const type of business_types) {
          const [btRows] = await connection.query('SELECT id FROM business_types WHERE name = ?', [type]);
          if (btRows.length > 0) {
            await connection.query('INSERT IGNORE INTO vendor_business_types (vendor_id, business_type_id) VALUES (?, ?)', [vendorId, btRows[0].id]);
          }
        }
      }

      await connection.commit();
      return vendorId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateVendor(id, vendorData) {
    const { 
      business_name, contact_name, email, phone, address, city, district, 
      latitude, longitude, business_types, verification_status, logo_url, nira_id, government_patent, passport_number 
    } = vendorData;
    await ensureVendorSchema();

    let primary_type = undefined;
    if (business_types && business_types.length > 0) {
       primary_type = business_types[0];
    }

    // First update vendors table
    const [vendorResult] = await db.query(
      `UPDATE vendors SET 
        business_name = COALESCE(?, business_name), 
        name = COALESCE(?, name, business_name),
        contact_name = COALESCE(?, contact_name), 
        email = COALESCE(NULLIF(?, ''), email),
        phone = COALESCE(NULLIF(?, ''), phone),
        business_type = COALESCE(?, business_type), 
        address = COALESCE(?, address), 
        city = COALESCE(?, city), 
        district = COALESCE(?, district), 
        latitude = COALESCE(?, latitude), 
        longitude = COALESCE(?, longitude), 
        verification_status = COALESCE(?, verification_status), 
        logo_url = COALESCE(?, logo_url),
        nira_id = COALESCE(?, nira_id),
        government_patent = COALESCE(?, government_patent),
        passport_number = COALESCE(?, passport_number)
       WHERE id = ?`,
      [business_name, business_name, contact_name, email, phone, primary_type, address, city, district, latitude, longitude, verification_status, logo_url, nira_id, government_patent, passport_number, id]
    );

    if (business_types && Array.isArray(business_types)) {
      await db.query('DELETE FROM vendor_business_types WHERE vendor_id = ?', [id]);
      for (const type of business_types) {
        const [btRows] = await db.query('SELECT id FROM business_types WHERE name = ?', [type]);
        if (btRows.length > 0) {
          await db.query('INSERT IGNORE INTO vendor_business_types (vendor_id, business_type_id) VALUES (?, ?)', [id, btRows[0].id]);
        }
      }
    }

    // If there's user related info, update users table
    if (email || phone) {
      const [vendor] = await db.query('SELECT user_id FROM vendors WHERE id = ?', [id]);
      if (vendor.length > 0) {
        await db.query(
          `UPDATE users u JOIN roles r ON u.role_id = r.id
              SET u.email = COALESCE(?, u.email), u.phone = COALESCE(?, u.phone) WHERE u.id = ? AND r.name = 'vendor'`,
          [email, phone, vendor[0].user_id]
        );
      }
    }

    return vendorResult.affectedRows > 0;
  }

  static async deleteVendor(id) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [vendors] = await connection.query('SELECT user_id FROM vendors WHERE id = ? FOR UPDATE', [id]);
      if (vendors.length === 0) {
        await connection.rollback();
        return false;
      }
      const [activeOrders] = await connection.query(
        `SELECT id FROM orders WHERE vendor_id = ?
         AND LOWER(status) NOT IN ('delivered','cancelled','rejected') LIMIT 1`,
        [id]
      );
      if (activeOrders.length > 0) {
        const error = new Error('Vendor has active orders and cannot be deleted.');
        error.statusCode = 409;
        throw error;
      }
      await connection.query(
        `UPDATE vendors SET status = 'deleted', is_online = 0, verification_status = 'rejected' WHERE id = ?`,
        [id]
      );
      if (vendors[0].user_id) {
        await connection.query(
          `UPDATE users SET status = 'deleted', deleted_at = NOW(), is_online = 0 WHERE id = ?`,
          [vendors[0].user_id]
        );
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

  static async getAllDrivers() {
    await DriverModel.ensurePresenceSchema();
    await db.query(`UPDATE drivers SET is_online = 0, status = 'offline' WHERE is_online = 1 AND (last_seen IS NULL OR last_seen < DATE_SUB(NOW(), INTERVAL 30 SECOND))`);
    const [rows] = await db.query(`
      SELECT 
        d.*, 
        u.username, u.email, u.phone, u.status as user_status,
        IF(d.is_online = 1 AND d.last_seen >= DATE_SUB(NOW(), INTERVAL 30 SECOND), 1, 0) as is_online,
        d.last_seen,
        v.business_name as vendor_name
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vendors v ON d.vendor_id = v.id
      ORDER BY d.created_at DESC
    `);
    return rows;
  }

  static async getDriverById(id) {
    await DriverModel.ensurePresenceSchema();
    const [rows] = await db.query(`
      SELECT 
        d.*, 
        u.username, u.email, u.phone, u.status as user_status,
        IF(d.is_online = 1 AND d.last_seen >= DATE_SUB(NOW(), INTERVAL 30 SECOND), 1, 0) as is_online,
        d.last_seen,
        v.business_name as vendor_name
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN vendors v ON d.vendor_id = v.id
      WHERE d.id = ?
    `, [id]);
    return rows[0];
  }

  static async createDriver(driverData) {
    const { 
      full_name, username, email, phone, password, 
      vehicle_type, plate_number, license_number, address, dob,
      status, vendor_id, profile_picture, emergency_contact_name,
      emergency_contact_phone, guardian_name, guardian_phone,
      sponsor_name, sponsor_phone, sponsor_address
    } = driverData;
    
    // Split full_name
    const nameParts = (full_name || '').split(' ');
    const first_name = nameParts[0] || '';
    const last_name = nameParts.slice(1).join(' ') || '';

    // Find driver role
    const [roleRows] = await db.query('SELECT id FROM roles WHERE name = "driver"');
    const roleId = roleRows[0]?.id || 3;
    
    if (!password) throw new Error('A generated initial password is required.');
    const password_hash = await require('bcryptjs').hash(password, 12);
    
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [existingUsers] = await connection.query(
        `SELECT u.id, r.name AS role_name, d.id AS driver_id
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         LEFT JOIN drivers d ON d.user_id = u.id
         WHERE LOWER(u.email) = LOWER(?)
         LIMIT 1`,
        [email]
      );

      if (existingUsers.length > 0) {
        const existingUser = existingUsers[0];
        const err = new Error(
          existingUser.role_name === 'driver'
            ? 'This driver email is already onboarded.'
            : `Email ${email} is already registered as ${existingUser.role_name || 'another user type'}. Use a different email for this driver.`
        );
        err.statusCode = 409;
        throw err;
      }

      const [userResult] = await connection.query(
        'INSERT INTO users (username, email, password_hash, role_id, phone, status, must_change_password) VALUES (?, ?, ?, ?, ?, "active", 1)',
        [username || full_name, email, password_hash, roleId, phone || '']
      );
      const userId = userResult.insertId;

      const [driverResult] = await connection.query(
        `INSERT INTO drivers
        (user_id, first_name, last_name, vehicle_type, plate_number, license_number, address, dob, status, vendor_id, profile_picture,
         emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone, guarantor_name, guarantor_phone, guarantor_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, first_name, last_name, vehicle_type, plate_number, license_number,
          address, dob || null, status || 'offline', vendor_id || null, profile_picture || null,
          emergency_contact_name || null, emergency_contact_phone || null,
          guardian_name || null, guardian_phone || null,
          sponsor_name || null, sponsor_phone || null, sponsor_address || null
        ]
      );
      await connection.commit();
      return driverResult.insertId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateDriver(id, driverData) {
    const { 
      full_name, email, phone, vehicle_type, plate_number, license_number, 
      address, dob, status, vendor_id, profile_picture, emergency_contact_name,
      emergency_contact_phone, guardian_name, guardian_phone,
      sponsor_name, sponsor_phone, sponsor_address
    } = driverData;

    let first_name, last_name;
    if (full_name) {
      const nameParts = full_name.split(' ');
      first_name = nameParts[0] || '';
      last_name = nameParts.slice(1).join(' ') || '';
    }

    const [driverResult] = await db.query(
      `UPDATE drivers SET 
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        vehicle_type = COALESCE(?, vehicle_type),
        plate_number = COALESCE(?, plate_number),
        license_number = COALESCE(?, license_number),
        address = COALESCE(?, address),
        dob = COALESCE(?, dob),
        status = COALESCE(?, status),
        vendor_id = COALESCE(?, vendor_id),
        profile_picture = COALESCE(?, profile_picture)
        , emergency_contact_name = COALESCE(?, emergency_contact_name)
        , emergency_contact_phone = COALESCE(?, emergency_contact_phone)
        , guardian_name = COALESCE(?, guardian_name)
        , guardian_phone = COALESCE(?, guardian_phone)
        , guarantor_name = COALESCE(?, guarantor_name)
        , guarantor_phone = COALESCE(?, guarantor_phone)
        , guarantor_address = COALESCE(?, guarantor_address)
       WHERE id = ?`,
      [first_name, last_name, vehicle_type, plate_number, license_number, address, dob, status, vendor_id, profile_picture,
       emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone,
       sponsor_name, sponsor_phone, sponsor_address, id]
    );

    if (email || phone) {
      const [driver] = await db.query('SELECT user_id FROM drivers WHERE id = ?', [id]);
      if (driver.length > 0) {
        await db.query(
          'UPDATE users SET email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE id = ?',
          [email, phone, driver[0].user_id]
        );
      }
    }

    return driverResult.affectedRows > 0;
  }

  static async deleteDriver(id) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [drivers] = await connection.query('SELECT user_id FROM drivers WHERE id = ? FOR UPDATE', [id]);
      if (drivers.length === 0) return false;
      const [active] = await connection.query(
        `SELECT id FROM deliveries WHERE driver_id = ?
         AND status IN ('assigned','accepted','heading_to_vendor','picked_up','on_the_way','arrived') LIMIT 1`,
        [id]
      );
      if (active.length > 0) {
        const error = new Error('Driver has an active delivery and cannot be deleted.');
        error.statusCode = 409;
        throw error;
      }
      // Keep vendor_id: 'offline' + the archived user row already removes the
      // driver from assignment lists, while preserving the vendor association
      // that historical delivery and commission reports join on.
      await connection.query('UPDATE drivers SET is_online = 0, status = "offline" WHERE id = ?', [id]);
      await connection.query('UPDATE users SET status = "deleted", deleted_at = NOW(), is_online = 0 WHERE id = ?', [drivers[0].user_id]);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  static async getAllOrders() {
    const [rows] = await db.query(`
      SELECT o.*,
             u.username as customer_name,
             u.phone as customer_phone,
             u.email as customer_email,
             v.business_name as vendor_name,
             v.phone as vendor_phone,
             v.address as pickup_address,
             d.id as driver_id,
             -- The drivers table has no name/phone of its own: the person's
             -- name is split across first_name/last_name and the phone lives
             -- on the linked users row.
             TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))) as driver_name,
             du.phone as driver_phone,
             d.vehicle_type,
             d.plate_number,
             d.is_online as driver_is_online,
             d.current_lat as driver_lat,
             d.current_lng as driver_lng
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      JOIN vendors v ON o.vendor_id = v.id
      LEFT JOIN drivers d ON o.driver_id = d.id
      LEFT JOIN users du ON d.user_id = du.id
      WHERE o.status NOT IN ('completed', 'cancelled')
      ORDER BY o.created_at DESC
    `);
    return rows;
  }

  static async getAllProducts() {
    const [rows] = await db.query(`
      SELECT p.*, v.business_name as vendor_name, c.name as category_name
      FROM products p
      JOIN vendors v ON p.vendor_id = v.id
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.created_at DESC
    `);
    return rows;
  }

  static async getInventory() {
    const [rows] = await db.query(`
      SELECT p.id, p.name, p.stock_quantity as stock, p.unit, v.business_name as vendor_name, p.reorder_level
      FROM products p
      JOIN vendors v ON p.vendor_id = v.id
      ORDER BY p.stock_quantity ASC
    `);
    return rows;
  }

  static async getAllPayments() {
    const [rows] = await db.query(`
      SELECT 
        p.*, 
        o.total_amount, 
        COALESCE(a.address_line, o.delivery_address, 'N/A') as location,
        COALESCE(
          NULLIF(u.username, ''), 
          NULLIF(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')), ' '),
          NULLIF(u.email, ''),
          'Guest'
        ) as customer_name
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      LEFT JOIN addresses a ON o.address_id = a.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY p.created_at DESC
    `);
    return rows;
  }

  static async updateUserStatus(userId, status) {
    const [result] = await db.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
    return result.affectedRows > 0;
  }

  static async getUserById(userId) {
    const [rows] = await db.query(
      `SELECT u.id, u.username, u.email, u.phone, u.status, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?
         AND (u.status IS NULL OR u.status <> 'deleted')
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  static async updateUser(userId, userData = {}) {
    const columns = {
      username: 'username',
      email: 'email',
      phone: 'phone',
    };
    const sets = [];
    const params = [];

    for (const [field, column] of Object.entries(columns)) {
      if (Object.prototype.hasOwnProperty.call(userData, field)) {
        sets.push(`${column} = ?`);
        params.push(userData[field]);
      }
    }

    if (sets.length > 0) {
      params.push(userId);
      await db.query(
        `UPDATE users SET ${sets.join(', ')}
         WHERE id = ? AND (status IS NULL OR status <> 'deleted')`,
        params
      );
    }

    return AdminModel.getUserById(userId);
  }

  static async verifyVendor(vendorId, status) {
    await ensureVendorSchema();
    const [result] = await db.query('UPDATE vendors SET verification_status = ? WHERE id = ?', [status, vendorId]);
    return result.affectedRows > 0;
  }

  static async updateOrderStatus(orderId, status) {
    const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
    return result.affectedRows > 0;
  }

  static async assignOrderDriver(orderId, driverId) {
    const [orders] = await db.query('SELECT id FROM orders WHERE id = ?', [orderId]);
    if (orders.length === 0) return false;
    await DriverModel.assignDriverToOrder(orderId, driverId);
    return true;
  }

  static async createUser(userData) {
    const { username, email, password_hash, role, phone } = userData;
    const [roleRows] = await db.query('SELECT id FROM roles WHERE name = ?', [role]);
    const roleId = roleRows[0]?.id || 2; // Default to customer if role not found

    const [result] = await db.query(
      'INSERT INTO users (username, email, password_hash, role_id, phone, status, must_change_password) VALUES (?, ?, ?, ?, ?, "active", 1)',
      [username, email, password_hash, roleId, phone]
    );
    return result.insertId;
  }

  static async getSettings() {
    const [rows] = await db.query('SELECT * FROM settings');
    return rows;
  }

  static async updateSetting(key, value) {
    // Upsert so brand-new setting keys (e.g. commission_rate) can be created.
    const [result] = await db.query(
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, value]
    );
    return result.affectedRows > 0;
  }

  static async getDriverLocations() {
    await DriverModel.ensurePresenceSchema();
    await db.query(`UPDATE drivers SET is_online = 0, status = 'offline' WHERE is_online = 1 AND (last_seen IS NULL OR last_seen < DATE_SUB(NOW(), INTERVAL 30 SECOND))`);
    const [rows] = await db.query(`
      SELECT d.id, d.first_name, d.last_name, d.current_lat as lat, d.current_lng as lng,
             IF(d.is_online = 1 AND d.last_seen >= DATE_SUB(NOW(), INTERVAL 30 SECOND), 1, 0) as is_online,
             d.last_seen,
             u.username, u.email
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      WHERE d.current_lat IS NOT NULL AND d.current_lng IS NOT NULL
    `);
    return rows;
  }

  static async globalSearch(query) {
    const searchTerm = `%${query}%`;
    const [users] = await db.query(`
      SELECT u.id, u.username as title, "user" as type 
      FROM users u
      LEFT JOIN customers c ON u.id = c.user_id
      LEFT JOIN drivers d ON u.id = d.user_id
      WHERE u.username LIKE ? OR u.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?
      LIMIT 5
    `, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
    
    const [vendors] = await db.query(`
      SELECT id, business_name as title, "vendor" as type 
      FROM vendors 
      WHERE business_name LIKE ? OR contact_name LIKE ? 
      LIMIT 5
    `, [searchTerm, searchTerm]);
    
    const [orders] = await db.query('SELECT id, CONCAT("Order #", id) as title, "order" as type FROM orders WHERE id LIKE ? LIMIT 5', [searchTerm]);
    
    return [...users, ...vendors, ...orders];
  }
  static async getCommissions() {
    const [rows] = await db.query(`
      SELECT
        c.id,
        c.order_id,
        c.total_amount   AS gross_amount,
        c.commission_amount AS admin_commission,
        c.vendor_net_amount,
        c.status,
        c.paid_at,
        c.created_at,
        COALESCE(v.business_name, v.name) AS vendor_name,
        COALESCE(u.username, CONCAT(cust_u.username)) AS customer_name,
        c.vendor_id
      FROM commissions c
      JOIN vendors v ON c.vendor_id = v.id
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN customers cust ON o.customer_id = cust.id
      LEFT JOIN users cust_u ON cust.user_id = cust_u.id
      LEFT JOIN users u ON u.id = cust_u.id
      ORDER BY c.created_at DESC
    `);
    return rows;
  }

  static async getCommissionsSummary() {
    const [rows] = await db.query(`
      SELECT
        COUNT(*)                                            AS total_records,
        COALESCE(SUM(total_amount),    0)                  AS total_sales,
        COALESCE(SUM(commission_amount), 0)                AS total_admin_commission,
        COALESCE(SUM(vendor_net_amount), 0)                AS total_vendor_payout,
        COALESCE(SUM(CASE WHEN status = 'paid'    THEN commission_amount ELSE 0 END), 0) AS paid_commission,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) AS pending_commission,
        COUNT(CASE WHEN status = 'paid'    THEN 1 END)     AS paid_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END)     AS pending_count
      FROM commissions
    `);
    return rows[0];
  }

  static async getVendorCommissions(vendorId) {
    const [rows] = await db.query(`
      SELECT
        c.id,
        c.order_id,
        c.total_amount   AS gross_amount,
        c.commission_amount AS admin_commission,
        c.vendor_net_amount,
        c.status,
        c.paid_at,
        c.created_at
      FROM commissions c
      WHERE c.vendor_id = ?
      ORDER BY c.created_at DESC
    `, [vendorId]);
    return rows;
  }

  static async reconcilePayments() {
    // 1. Mark cash-on-delivery payments as paid for delivered orders
    const [paymentResult] = await db.query(`
      UPDATE payments p
      JOIN orders o ON p.order_id = o.id
      SET p.status = 'paid',
          p.vendor_id = o.vendor_id,
          p.vendor_amount = o.vendor_net_amount,
          p.admin_commission = o.admin_commission,
          p.settlement_status = 'settled',
          p.settled_at = NOW()
      WHERE p.status = 'pending' AND LOWER(o.status) = 'delivered'
    `);

    // 2. Mark commissions as paid for delivered orders
    const [commissionResult] = await db.query(`
      UPDATE commissions c
      JOIN orders o ON c.order_id = o.id
      SET c.status = 'paid',
          c.paid_at = NOW()
      WHERE c.status = 'pending' AND LOWER(o.status) = 'delivered'
    `);

    return {
      payments_updated: paymentResult.affectedRows,
      commissions_settled: commissionResult.affectedRows,
      message: `Reconciled ${paymentResult.affectedRows} payment(s) and ${commissionResult.affectedRows} commission(s).`
    };
  }

  static async getAllProducts() {
    const [rows] = await db.query(`
      SELECT 
        p.id,
        p.name,
        p.selling_price,
        p.cost_price,
        p.is_active,
        COALESCE(i.stock, p.stock_quantity) AS stock,
        p.unit,
        p.image_url,
        p.description,
        c.name AS category,
        p.category_id,
        v.business_name AS vendor_name,
        p.vendor_id
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN vendors v ON p.vendor_id = v.id
      LEFT JOIN inventory i ON p.id = i.product_id
      ORDER BY p.vendor_id ASC, p.name ASC
    `);
    return rows;
  }

  static async updateProduct(productId, data) {
    const { selling_price, is_active, name, description, stock_quantity } = data;

    const sellingPrice = parseFloat(selling_price);
    if (isNaN(sellingPrice) || sellingPrice <= 0) {
      throw new Error('Product price must be greater than zero.');
    }

    const activeVal = is_active !== undefined ? (is_active ? 1 : 0) : null;
    if (activeVal === 1 || activeVal === null) {
      const [rows] = await db.query(
        `SELECT p.is_active, COALESCE(i.stock, p.stock_quantity, 0) AS stock
         FROM products p
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.id = ?`,
        [productId]
      );
      if (rows.length > 0) {
        const isCurrentlyActive = rows[0].is_active;
        const currentStock = parseInt(rows[0].stock, 10);
        const willBeActive = activeVal === 1 || (activeVal === null && isCurrentlyActive);
        const finalStock = stock_quantity !== undefined ? (parseInt(stock_quantity, 10) || 0) : currentStock;
        
        if (willBeActive && finalStock < 0) {
          throw new Error('Cannot enable a product with invalid stock.');
        }
      }
    }

    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    fields.push('selling_price = ?'); values.push(sellingPrice);
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    
    if (stock_quantity !== undefined) {
      const parsedStock = parseInt(stock_quantity, 10) || 0;
      fields.push('stock_quantity = ?');
      values.push(parsedStock);
      // Keep inventory table in sync too
      await db.query(
        'INSERT INTO inventory (product_id, stock) VALUES (?, ?) ON DUPLICATE KEY UPDATE stock = ?',
        [productId, parsedStock, parsedStock]
      );
    }

    values.push(productId);

    const [result] = await db.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    return result.affectedRows > 0;
  }

  // ─── CATEGORY MANAGEMENT ──────────────────────────────────────────────────
  static async getCategories() {
    const [rows] = await db.query(`
      SELECT c.id, c.name, c.image_url, c.is_active, c.created_at,
             COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    return rows;
  }

  static async categoryNameExists(name, excludeId = null) {
    const params = [String(name).trim()];
    let sql = 'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)';
    if (excludeId) { sql += ' AND id <> ?'; params.push(excludeId); }
    const [rows] = await db.query(sql + ' LIMIT 1', params);
    return rows.length > 0;
  }

  static async createCategory({ name, image_url = null, is_active = 1 }) {
    const [result] = await db.query(
      'INSERT INTO categories (name, image_url, is_active) VALUES (?, ?, ?)',
      [String(name).trim(), image_url || null, is_active ? 1 : 0]
    );
    return result.insertId;
  }

  static async updateCategory(id, { name, image_url, is_active }) {
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(String(name).trim()); }
    if (image_url !== undefined) { fields.push('image_url = ?'); values.push(image_url || null); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (fields.length === 0) return false;
    values.push(id);
    const [result] = await db.query(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);
    return result.affectedRows > 0;
  }

  static async categoryProductCount(id) {
    const [rows] = await db.query('SELECT COUNT(*) AS count FROM products WHERE category_id = ?', [id]);
    return rows[0].count;
  }

  static async deleteCategory(id) {
    const [result] = await db.query('DELETE FROM categories WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = AdminModel;
