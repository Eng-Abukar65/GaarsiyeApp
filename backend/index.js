const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const adminRoutes = require('./routes/adminRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const customerRoutes = require('./routes/customerRoutes');
const driverRoutes = require('./routes/driverRoutes');
const workerRoutes = require('./routes/workerRoutes');
const authRoutes = require('./routes/authRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const documentController = require('./controllers/documentController');
const db = require('./config/db');
const jwtSecret = require('./config/jwt');
const DriverModel = require('./models/driverModel');
const CustomerModel = require('./models/customerModel');
const NotificationModel = require('./models/notificationModel');
const DriverController = require('./controllers/driverController');
const { authenticateToken, authorizeRole } = require('./middlewares/authMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Railway terminates TLS at its edge and forwards over HTTP. Without this, every
// request looks like it came from the proxy: req.ip collapses to a single value
// and the login rate limiter below would throttle all users as one client.
app.set('trust proxy', 1);

// ─── CORS ────────────────────────────────────────────────────────────────────
// Browser clients are allow-listed by exact origin. Native mobile clients send
// no Origin header at all and are unaffected by CORS — the Flutter apps are
// authorised by their JWT, not by this list.
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',').map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean);

// Local development origins stay allowed off-production so `npm run dev` needs
// no extra configuration. In production only CORS_ORIGINS counts.
const DEV_ORIGINS = [
  'http://localhost:5173', 'http://localhost:5174',
  'http://127.0.0.1:5173', 'http://127.0.0.1:5174',
];

const isPrivateNetworkHostname = (hostname = '') => (
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
  || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
);

// Vercel gives every branch/preview build its own *.vercel.app hostname, so the
// production allow-list cannot enumerate them. Opt in with
// CORS_ALLOW_VERCEL_PREVIEWS=true only while previews are actually being tested.
const allowVercelPreviews = String(process.env.CORS_ALLOW_VERCEL_PREVIEWS || '').toLowerCase() === 'true';

const isAllowedOrigin = (origin) => {
  const normalized = String(origin).replace(/\/+$/, '');
  if (configuredOrigins.includes(normalized)) return true;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  if (allowVercelPreviews && parsed.protocol === 'https:' && /\.vercel\.app$/.test(parsed.hostname)) {
    return true;
  }

  if (IS_PRODUCTION) return false;

  return DEV_ORIGINS.includes(normalized)
    || parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || isPrivateNetworkHostname(parsed.hostname);
};

const corsOptions = {
  origin(origin, callback) {
    // Native mobile clients and server-to-server callers send no Origin header.
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    // A rejected origin is a client configuration problem, not a server fault.
    // Without an explicit status the global handler would report it as a 500 and
    // send whoever is debugging the deployment looking in the wrong place.
    const error = new Error(`Origin ${origin} is not allowed by CORS`);
    error.statusCode = 403;
    return callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true,
  maxAge: 86400,
};

if (IS_PRODUCTION && configuredOrigins.length === 0) {
  console.warn(
    '[CORS] CORS_ORIGINS is empty in production — every browser request will be ' +
    'rejected. Set it to your Vercel domain, e.g. https://your-app.vercel.app'
  );
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.disable('x-powered-by');
app.use(cors(corsOptions));
// Answer preflight for every route with the same policy.
app.options(/.*/, cors(corsOptions));

// ─── Rate Limiter Middleware ──────────────────────────────────────────────────
const rateLimits = new Map();
const lightweightRateLimiter = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const LIMIT_WINDOW = 60 * 1000;
  const MAX_REQS = 120; // 120 requests per minute
  
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, []);
  }
  let reqs = rateLimits.get(ip).filter(t => now - t < LIMIT_WINDOW);
  if (reqs.length >= MAX_REQS) {
    return res.status(429).json({ success: false, message: 'Too many requests from this IP. Please try again in a minute.' });
  }
  reqs.push(now);
  rateLimits.set(ip, reqs);
  next();
};
const loginAttempts = new Map();
const loginRateLimiter = (req, res, next) => {
  const key = `${req.ip}:${String(req.body?.email || '').toLowerCase()}`;
  const now = Date.now();
  const attempts = (loginAttempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (attempts.length >= 10) {
    return res.status(429).json({ success: false, message: 'Too many login attempts. Try again later.' });
  }
  attempts.push(now);
  loginAttempts.set(key, attempts);
  next();
};

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.get('/api/documents/preview', authenticateToken, documentController.previewDocument);
app.get('/api/documents/download', authenticateToken, documentController.downloadDocument);

// ─── Uploaded media ───────────────────────────────────────────────────────────
// Only the PUBLIC media folders are served statically. `uploads/vendor-documents`
// is deliberately NOT mounted here: identity and government-patent documents stay
// behind GET /api/documents/preview, which authenticates the caller and checks
// that a vendor may only read their own paperwork.
//
// Safe to serve because uploads are content-verified before they are written
// (utils/uploadSecurity.js): only real PDF/JPG/PNG/WEBP bytes are stored, under
// cryptographically random names, mode 0640 and never executable.
const uploadStaticOptions = {
  index: false,          // no directory listings
  dotfiles: 'deny',
  fallthrough: true,
  maxAge: '7d',
  setHeaders: (res) => {
    // Never let a browser sniff a stored image into something executable.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; sandbox");
  },
};
for (const folder of ['products', 'vendor-logos', 'drivers', 'customer-photos', 'worker-photos', 'delivery-proofs', 'receipts']) {
  app.use(
    `/uploads/${folder}`,
    express.static(path.join(__dirname, 'uploads', folder), uploadStaticOptions)
  );
}

app.use('/api/delivery-fee', lightweightRateLimiter);
app.use('/api/delivery-zones', lightweightRateLimiter);
app.use([
  '/api/auth/login',
  '/api/auth/staff/login',
  '/api/driver/login',
  '/api/vendor/login',
  '/api/admin/login',
  '/api/customer/login',
], loginRateLimiter);

// ─── Public Checkout Delivery Fee Route ──────────────────────────────────────
app.get('/api/delivery-fee', async (req, res) => {
  const { vendorId, zone } = req.query;

  if (!vendorId || !zone) {
    return res.status(400).json({ success: false, message: 'vendorId and zone query parameters are required.' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM vendor_delivery_zones WHERE vendor_id = ? AND zone_name = ?',
      [vendorId, zone.trim()]
    );

    if (rows.length > 0) {
      const row = rows[0];
      return res.json({
        success: true,
        zone: row.zone_name,
        delivery_fee: parseFloat(row.delivery_fee),
        estimated_time: row.estimated_time,
        is_active: Boolean(row.is_active)
      });
    } else {
      return res.json({
        success: false,
        zone: zone,
        delivery_fee: 0.00,
        estimated_time: 'N/A',
        is_active: false,
        message: 'This vendor does not deliver to this zone.'
      });
    }
  } catch (error) {
    console.error('Error fetching delivery fee:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Public: List all active zones for a vendor (customer checkout) ──────────
app.get('/api/delivery-zones', async (req, res) => {
  const { vendor_id } = req.query;
  if (!vendor_id) {
    return res.status(400).json({ success: false, message: 'vendor_id is required' });
  }
  try {
    const [rows] = await db.query(
      'SELECT id, zone_name, delivery_fee, estimated_time FROM vendor_delivery_zones WHERE vendor_id = ? AND is_active = 1 ORDER BY zone_name ASC',
      [vendor_id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Error fetching vendor zones:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/admin', adminRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payment', paymentRoutes);

// ─── Root / Health Checks ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend running',
    status: 'SwiftFuel Backend is running',
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.round(process.uptime()),
    port: PORT,
  });
});


// Tables the app cannot function without. Reported individually so a partial
// database import shows up here instead of as a 500 on the first login.
const REQUIRED_TABLES = [
  'users', 'roles', 'admins', 'vendors', 'customers', 'drivers',
  'car_wash_workers', 'products', 'orders', 'deliveries',
  'car_wash_services', 'car_wash_bookings', 'payments', 'notifications', 'settings',
];

app.get('/api/health/database', async (req, res) => {
  try {
    const [versionRows] = await db.query('SELECT VERSION() AS mysqlVersion, DATABASE() AS dbName');

    const [tableRows] = await db.query(`
      SELECT TABLE_NAME AS tableName
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `);

    const present = new Set(tableRows.map((row) => String(row.tableName).toLowerCase()));
    const missingTables = REQUIRED_TABLES.filter((table) => !present.has(table));

    res.status(missingTables.length ? 503 : 200).json({
      success: missingTables.length === 0,
      message: missingTables.length
        ? 'Connected, but the schema is incomplete — import the database dump.'
        : 'Backend is connected to MySQL and the schema is complete',
      database: versionRows[0].dbName,
      mysqlVersion: versionRows[0].mysqlVersion,
      tableCount: tableRows.length,
      missingTables,
    });
  } catch (error) {
    console.error('[DB health check]', error);

    res.status(500).json({
      success: false,
      message: 'Backend could not connect to MySQL',
      error: error.message,
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'SwiftFuel Backend is running', port: PORT });
});

app.get('/health', (req, res) => {
  res.json({ status: 'Backend is running', port: PORT });
});

// ─── Authoritative server time ────────────────────────────────────────────────
// Clients display and validate against THIS, never their own device clock.
const serverTime = require('./utils/serverTime');
app.get('/api/time', (req, res) => {
  const now = serverTime.nowUtc();
  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    utc: now.toISOString(),
    epoch_ms: now.getTime(),
    business_timezone: serverTime.BUSINESS_TIMEZONE,
    business_offset: serverTime.BUSINESS_UTC_OFFSET,
    business_date: serverTime.businessToday(now),
    business_time: serverTime.businessParts(now).time,
    display: serverTime.formatBusiness(now),
  });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
});

// ─── Upload errors ────────────────────────────────────────────────────────────
// Must run before the generic handler so a rejected file returns a clean 400
// with an explanation rather than a 500 with a stack trace.
const { uploadErrorHandler } = require('./utils/uploadSecurity');
app.use(uploadErrorHandler);

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack);
  const status = err.statusCode || 500;
  const message = status < 500 ? (err.message || 'Request failed') : 'Internal Server Error';
  res.status(status).json({ message });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on http://0.0.0.0:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Customer register: POST http://localhost:${PORT}/api/customer/register`);
});

NotificationModel.ensureSchema()
  .then(() => console.log('[NOTIFICATIONS] Schema ready'))
  .catch((err) => console.error('[NOTIFICATIONS] Schema setup failed:', err.message));

// Seed + load the centralized admin commission rate from the settings table.
const { refreshCommissionRate, getCommissionPercent } = require('./config/commission');
db.query(
  `INSERT INTO settings (setting_key, setting_value)
   VALUES ('commission_rate', ?)
   ON DUPLICATE KEY UPDATE setting_key = setting_key`,
  [String(getCommissionPercent())]
)
  .then(() => refreshCommissionRate(db))
  .then((pct) => console.log(`[COMMISSION] Active admin commission rate: ${pct}%`))
  .catch((err) => console.error('[COMMISSION] Rate init failed:', err.message));

CustomerModel.ensureOrderSchema()
  .then(() => console.log('[ORDERS] Schema ready'))
  .catch((err) => console.error('[ORDERS] Schema setup failed:', err.message));

// Ensure driver location columns exist on startup
DriverController.ensureDriverLocationSchema(db)
  .then(() => {
    console.log('[DRIVER LOCATION] Schema columns ready');
    // Create location history table proactively
    return db.query(`
      CREATE TABLE IF NOT EXISTS driver_location_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id INT NOT NULL,
        delivery_id INT DEFAULT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        speed DECIMAL(5, 2) DEFAULT NULL,
        heading DECIMAL(5, 2) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dlh_driver (driver_id),
        INDEX idx_dlh_delivery (delivery_id),
        INDEX idx_dlh_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  })
  .then(() => console.log('[DRIVER LOCATION] History table ready'))
  .then(() => db.query(`
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
  `))
  .then(() => console.log('[DRIVER LOCATION] Latest table ready'))
  .catch((err) => console.error('[DRIVER LOCATION] Schema setup failed:', err.message));

// ─── Socket.IO Integration ───────────────────────────────────────────────────
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const io = new Server(server, {
  cors: corsOptions
});
app.set('io', io);

// Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }
  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), jwtSecret);
    socket.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), jwtSecret, { ignoreExpiration: true });
        const driverId = decoded?.driver_id || (decoded?.role === 'driver' ? decoded?.id : null);
        if (driverId) {
          DriverModel.markOffline(driverId)
            .then(() => console.log(`[SOCKET AUTH] Expired driver token marked offline driver_id=${driverId}`))
            .catch(markErr => console.error('[SOCKET AUTH] Could not mark expired driver offline:', markErr));
        }
      } catch (markErr) {
        console.warn('[SOCKET AUTH] Expired token could not be verified for offline mark:', markErr.message);
      }
    }
    return next(new Error('Authentication error: Invalid token'));
  }
});

const activeSockets = new Map(); // driver_id -> Set<socket.id>

// Periodic cleanup of stale socket sessions to prevent memory leaks in the activeSockets map
setInterval(() => {
  if (io && io.sockets) {
    for (const [driverId, socketIds] of activeSockets.entries()) {
      for (const socketId of socketIds) {
        if (!io.sockets.sockets.has(socketId)) {
          console.log(`[SOCKET CLEANUP] Pruned stale socket session for driver #${driverId} (socket: ${socketId})`);
          socketIds.delete(socketId);
        }
      }
      if (socketIds.size === 0) {
        activeSockets.delete(driverId);
      }
    }
  }
}, 60000);

io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id} (user: ${socket.user?.id}, role: ${socket.user?.role})`);

  const userId = socket.user?.id;
  const role = socket.user?.role;

  if (role === 'driver') {
    const driverId = socket.user?.driver_id || userId;
    socket.driverId = driverId;

    const driverSockets = activeSockets.get(driverId) || new Set();
    driverSockets.add(socket.id);
    activeSockets.set(driverId, driverSockets);
    socket.join(`driver-${driverId}`);
    console.log(`[SOCKET] Driver #${driverId} joined room driver-${driverId}`);

    // Mark driver online
    DriverModel.markOnline(driverId)
      .catch(err => console.error('[SOCKET] Error marking driver online:', err));

    io.emit('driver-online-status', { driver_id: driverId, is_online: true });
  } else if (role === 'vendor') {
    socket.join(`vendor-${userId}`);
    console.log(`[SOCKET] Vendor #${userId} joined room vendor-${userId}`);
  } else if (role === 'customer') {
    socket.join(`customer-${userId}`);
    console.log(`[SOCKET] Customer #${userId} joined room customer-${userId}`);
    db.query('SELECT id FROM customers WHERE user_id = ? LIMIT 1', [userId])
      .then(([rows]) => {
        const customerId = rows?.[0]?.id;
        if (customerId && Number(customerId) !== Number(userId)) {
          socket.join(`customer-${customerId}`);
          console.log(`[SOCKET] Customer user #${userId} joined room customer-${customerId}`);
        }
      })
      .catch(err => console.error('[SOCKET] Error joining customer room:', err.message));
  } else if (role === 'admin' || role === 'superadmin') {
    socket.join('admin-room');
    console.log(`[SOCKET] Admin joined admin-room`);
  }

  // Allow clients to join specific delivery room
  socket.on('join-delivery-room', (deliveryId) => {
    socket.join(`delivery-${deliveryId}`);
    console.log(`[SOCKET] Client ${socket.id} joined delivery-${deliveryId}`);
  });

  // Heartbeat ping handler
  socket.on('heartbeat', () => {
    socket.lastHeartbeat = Date.now();
    if (socket.driverId) {
      DriverModel.heartbeat(socket.driverId)
        .catch(err => console.error('[SOCKET] Error updating driver heartbeat:', err));
    }
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    if (socket.driverId) {
      const driverSockets = activeSockets.get(socket.driverId);
      driverSockets?.delete(socket.id);
      if (driverSockets?.size === 0) {
        activeSockets.delete(socket.driverId);
      }
      // The stale-presence scanner marks the driver offline after two minutes.
    }
  });
});

// Scan every 15s, but expire only after two full minutes without a heartbeat.
setInterval(async () => {
  try {
    const offlineDrivers = await DriverModel.expireStaleDrivers();

    for (const driver of offlineDrivers) {
      console.log(`[HEARTBEAT SCAN] Driver #${driver.id} marked offline due to inactivity`);
      io.emit('driver-online-status', { driver_id: driver.id, is_online: false });
      if (driver.vendor_id) {
        io.to(`vendor-${driver.vendor_id}`).emit('driver-online-status', { driver_id: driver.id, is_online: false });
      }
    }
  } catch (err) {
    console.error('[HEARTBEAT SCAN ERROR]', err);
  }
}, 15000);

// Remind drivers and operations when an assignment has not been answered.
setInterval(async () => {
  try {
    const timeoutMinutes = Math.max(1, Number(process.env.ASSIGNMENT_RESPONSE_MINUTES || 5));
    const [staleAssignments] = await db.query(`
      SELECT d.id AS delivery_id, d.order_id, d.driver_id, o.vendor_id
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      WHERE d.status = 'assigned'
        AND d.responded_at IS NULL
        AND d.assigned_at <= DATE_SUB(NOW(), INTERVAL ${timeoutMinutes} MINUTE)
        AND d.response_reminder_sent_at IS NULL
    `);
    for (const assignment of staleAssignments) {
      await db.query(
        'UPDATE deliveries SET response_reminder_sent_at = NOW() WHERE id = ? AND response_reminder_sent_at IS NULL',
        [assignment.delivery_id]
      );
      const payload = {
        delivery_id: assignment.delivery_id,
        order_id: assignment.order_id,
        message: `Order #${assignment.order_id} is waiting for your response.`
      };
      io.to(`driver-${assignment.driver_id}`).emit('assignment-response-required', payload);
      io.to(`vendor-${assignment.vendor_id}`).emit('assignment-response-overdue', payload);
      io.to('admin-room').emit('assignment-response-overdue', payload);
      await NotificationModel.createAdminNotification(
        'Assignment response overdue',
        `Driver #${assignment.driver_id} has not responded to order #${assignment.order_id}.`,
        'warning'
      );
    }
  } catch (error) {
    console.error('[ASSIGNMENT REMINDER]', error.message);
  }
}, 60000);

// Remind vendors when a newly assigned order has not been accepted in time.
setInterval(async () => {
  try {
    const timeoutMinutes = Math.max(1, Number(process.env.VENDOR_RESPONSE_MINUTES || 5));
    const [orders] = await db.query(`
      SELECT id, vendor_id, vendor_assigned_at
      FROM orders
      WHERE status IN ('pending','pending_payment')
        AND vendor_responded_at IS NULL
        AND vendor_assigned_at <= DATE_SUB(NOW(), INTERVAL ${timeoutMinutes} MINUTE)
        AND vendor_response_reminder_sent_at IS NULL
    `);
    for (const order of orders) {
      await db.query('UPDATE orders SET vendor_response_reminder_sent_at = NOW() WHERE id = ?', [order.id]);
      const message = `Order #${order.id} is waiting for your response.`;
      const [notification] = await db.query(
        `INSERT INTO vendor_notifications (vendor_id, order_id, title, message, type)
         VALUES (?, ?, 'Order response overdue', ?, 'order_response_overdue')`,
        [order.vendor_id, order.id, message]
      );
      const payload = { id: notification.insertId, order_id: order.id, vendor_id: order.vendor_id, message };
      io.to(`vendor-${order.vendor_id}`).emit('order-assignment-overdue', payload);
      io.to('admin-room').emit('order-assignment-overdue', payload);
      await NotificationModel.createAdminNotification('Vendor response overdue', `Vendor #${order.vendor_id}: ${message}`, 'warning');
    }
  } catch (error) {
    console.error('[VENDOR ASSIGNMENT REMINDER]', error.message);
  }
}, 60000);

server.on('error', (err) => {
  console.error('[Server Fatal Error]', err);
});

// Robust keep-alive to prevent "clean exit"
const keepAlive = setInterval(() => {
  // Event loop anchor
}, 1000 * 60 * 60);

process.on('SIGINT', () => {
  clearInterval(keepAlive);
  server.close();
  process.exit(0);
});

// Centralized process exception guards to prevent unexpected crashes in background tasks/promises
process.on('uncaughtException', (err) => {
  console.error('🔥 [CRITICAL] Uncaught Exception:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 [CRITICAL] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

// nodemon restart trigger
