const express = require('express');
const router = express.Router();
const VendorController = require('../controllers/vendorController');
const CarWashController = require('../controllers/carWashController');
const SettlementController = require('../controllers/settlementController');
const ReportController = require('../controllers/reportController');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const fs = require('fs');
const { secureUpload } = require('../utils/uploadSecurity');

fs.mkdirSync('uploads/vendor-logos/', { recursive: true });
fs.mkdirSync('uploads/vendor-documents/', { recursive: true });

// Every uploader below verifies the file's actual CONTENT (magic bytes), not the
// client's Content-Type header or filename, and writes it under a random name
// with an extension derived from the detected type. See utils/uploadSecurity.js.
const upload = secureUpload({
  destination: 'uploads/products/',
  prefix: 'product',
  allowed: ['jpg', 'png', 'webp'],
  maxBytes: 5 * 1024 * 1024,
});

const uploadLogo = secureUpload({
  destination: 'uploads/vendor-logos/',
  prefix: 'logo',
  allowed: ['jpg', 'png', 'webp'],
  maxBytes: 5 * 1024 * 1024,
});

// Government patent / NIRA ID / licence documents: PDF or photo only.
const uploadDocuments = secureUpload({
  destination: 'uploads/vendor-documents/',
  prefix: 'document',
  allowed: ['pdf', 'jpg', 'png'],
  maxBytes: 10 * 1024 * 1024,
});

const passwordResetAttempts = new Map();
const passwordResetRateLimiter = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const email = String(req.body?.email || '').toLowerCase();
  const key = `${ip}:${email}`;
  const now = Date.now();
  const attempts = (passwordResetAttempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (attempts.length >= 5) {
    return res.status(429).json({ success: false, message: 'Too many password reset requests. Please try again in 15 minutes.' });
  }
  attempts.push(now);
  passwordResetAttempts.set(key, attempts);
  next();
};

// Public routes
router.get('/categories', VendorController.getCategories);
router.post('/login', VendorController.login);
router.post('/forgot-password', passwordResetRateLimiter, VendorController.forgotPassword);
router.get('/verify-reset-token', VendorController.verifyResetToken);
router.get('/reset-password/verify', VendorController.verifyResetToken);
router.post('/reset-password', passwordResetRateLimiter, VendorController.resetPassword);
router.post(
  '/register',
  uploadDocuments.fields([
    { name: 'nira_id_document', maxCount: 1 },
    { name: 'government_patent_document', maxCount: 1 },
    { name: 'passport_document', maxCount: 1 },
  ]),
  VendorController.register
);

// Protected routes — vendor role only
router.use(authenticateToken);
router.use(authorizeRole('vendor'));

router.get('/products', VendorController.getProducts);
router.post('/products', upload.single('image'), VendorController.createProduct);
router.put('/products/:id', upload.single('image'), VendorController.updateProduct);
router.delete('/products/:id', VendorController.deleteProduct);
router.get('/orders', VendorController.getOrders);
router.get('/orders/:orderId/delivery-proof', VendorController.getDeliveryProof);
router.get('/orders/:id', VendorController.getOrderDetail);
router.get('/stats', VendorController.getDashboardStats);
router.get('/notifications', VendorController.getNotifications);
router.patch('/notifications/:id/read', VendorController.markNotificationRead);
router.patch('/orders/:id/accept', VendorController.acceptOrder);
router.put('/orders/:id/status', VendorController.updateOrderStatus);
router.get('/suppliers', VendorController.getSuppliers);
router.post('/suppliers', VendorController.createSupplier);
router.put('/suppliers/:id', VendorController.updateSupplier);
router.delete('/suppliers/:id', VendorController.deleteSupplier);
router.get('/purchases', VendorController.getPurchases);
router.get('/inventory', VendorController.getInventory);
router.get('/deliveries/tracking', VendorController.getDeliveriesTracking);
router.get('/deliveries', VendorController.getDeliveries);
// Report generator (must be declared before the fixed-period report routes)
router.get('/reports/types', ReportController.listTypes);
router.get('/reports/generate', ReportController.vendorGenerate);

router.get('/reports/daily', VendorController.getDailyReport);
router.get('/reports/weekly', VendorController.getWeeklyReport);
router.get('/reports/monthly', VendorController.getMonthlyReport);
router.get('/reports/yearly', VendorController.getYearlyReport);
router.get('/reports', VendorController.getReports);
router.get('/reviews', VendorController.getReviews);
router.get('/offers', VendorController.getOffers);
router.post('/offers', VendorController.createOffer);
router.put('/offers/:id', VendorController.updateOffer);
router.delete('/offers/:id', VendorController.deleteOffer);
router.post('/purchase', VendorController.createPurchase);
router.get('/profile', VendorController.getProfile);
// The Settings page saves to /profile with no id — the vendor comes from the
// token. /profile/:vendorId stays for older clients that still send it.
router.put('/profile', VendorController.updateProfile);
router.put('/profile/:vendorId', VendorController.updateProfile);
router.get('/settings', VendorController.getSettings);
router.put('/settings', VendorController.updateSettings);
router.put('/security/password', VendorController.updatePassword);

router.post('/upload-logo', uploadLogo.single('logo'), VendorController.uploadLogo);

// Driver management
router.get('/drivers', VendorController.getDrivers);
router.get('/drivers/available', VendorController.getAvailableDrivers);
router.post('/drivers', VendorController.createDriver);
router.put('/drivers/:id', VendorController.updateDriver);
router.post('/orders/:orderId/assign-driver', VendorController.assignDriver);
router.get('/orders/:orderId/rejections', VendorController.getOrderRejections);

// ─── Delivery Offer routes ──────────────────────────────────────────────────
router.post('/orders/:orderId/send-offer', VendorController.sendDeliveryOffer);
router.get('/orders/:orderId/offer', VendorController.getDeliveryOffer);

router.get('/sales/summary', VendorController.getSalesSummary);
router.get('/commissions', VendorController.getCommissions);
router.get('/lpg-monitoring', VendorController.getLpgMonitoring);
router.put('/lpg-monitoring/customers/:customerId', VendorController.updateCustomerLpgLevel);

// Delivery Zones
router.post('/delivery-zones', VendorController.createDeliveryZone);
router.get('/delivery-zones', VendorController.getDeliveryZones);
router.put('/delivery-zones/:id', VendorController.updateDeliveryZone);
router.delete('/delivery-zones/:id', VendorController.deleteDeliveryZone);

// ─── Per-business-module dashboard stats (gas / petrol / spare_parts) ─────────
router.get('/module-stats', CarWashController.getModuleStats);

// ─── Car Wash module (separate booking system for Car Wash vendors) ───────────
const SubscriptionController = require('../controllers/subscriptionController');
const { uploadErrorHandler } = require('../utils/uploadSecurity');

// ── Settlement & Monthly Subscriptions (vendor side) ───────────────────────
router.get('/modules', SubscriptionController.getVendorModules);
router.post('/modules/upgrade', SubscriptionController.uploadMiddleware, uploadErrorHandler, SubscriptionController.requestUpgrade);
router.post('/modules/request', SubscriptionController.submitModuleRequest);
router.get('/modules/requests', SubscriptionController.listVendorRequests);
router.post('/modules/request/:id/pay', SubscriptionController.uploadMiddleware, uploadErrorHandler, SubscriptionController.submitModulePayment);
router.get('/subscriptions/status', SubscriptionController.getStatus);
router.post('/subscriptions/pay', SubscriptionController.uploadMiddleware, uploadErrorHandler, SubscriptionController.submitPayment);
router.get('/subscriptions/history', SubscriptionController.getHistory);

router.get('/settlements/balance', SubscriptionController.getStatus);
router.get('/settlements', SubscriptionController.getHistory);
router.post('/settlements', SubscriptionController.uploadMiddleware, uploadErrorHandler, SubscriptionController.submitPayment);
router.get('/settlements/:id', SubscriptionController.getHistory);
router.patch('/settlements/:id/cancel', (req, res) => res.json({ success: true, message: 'Settlement cancelled.' }));

router.get('/car-wash/dashboard', CarWashController.getDashboard);

router.get('/car-wash/services', CarWashController.listServices);
router.post('/car-wash/services', CarWashController.createService);
router.put('/car-wash/services/:id', CarWashController.updateService);
router.delete('/car-wash/services/:id', CarWashController.deleteService);

router.get('/car-wash/addons', CarWashController.listAddons);
router.post('/car-wash/addons', CarWashController.createAddon);
router.put('/car-wash/addons/:id', CarWashController.updateAddon);
router.delete('/car-wash/addons/:id', CarWashController.deleteAddon);

router.get('/car-wash/vehicle-types', CarWashController.listVehicleTypes);
router.post('/car-wash/vehicle-types', CarWashController.createVehicleType);
router.put('/car-wash/vehicle-types/:id', CarWashController.updateVehicleType);
router.delete('/car-wash/vehicle-types/:id', CarWashController.deleteVehicleType);

router.get('/car-wash/workers', CarWashController.listWorkers);
router.post('/car-wash/workers/upload-photo', uploadLogo.single('photo'), CarWashController.uploadWorkerPhoto);
router.post('/car-wash/workers', CarWashController.createWorker);
router.put('/car-wash/workers/:id', CarWashController.updateWorker);
router.post('/car-wash/workers/:id/reset-password', CarWashController.resetWorkerPassword);
router.patch('/car-wash/workers/:id/login-access', CarWashController.setWorkerLoginAccess);
router.delete('/car-wash/workers/:id', CarWashController.deleteWorker);

router.get('/car-wash/bookings', CarWashController.listBookings);
router.get('/car-wash/bookings/:id', CarWashController.getBookingDetail);
router.post('/car-wash/bookings', CarWashController.createBooking);
router.patch('/car-wash/bookings/:id/status', CarWashController.updateBookingStatus);

module.exports = router;
