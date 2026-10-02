const express = require('express');
const router = express.Router();
const db = require('../config/db');
const DriverController = require('../controllers/driverController');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { secureUpload } = require('../utils/uploadSecurity');

// Previously this uploader had NO type filter at all — any file of any type was
// written to disk under an attacker-chosen extension. Now content-verified.
const upload = secureUpload({
  destination: 'uploads/drivers/',
  prefix: 'driver',
  allowed: ['jpg', 'png', 'webp'],
  maxBytes: 5 * 1024 * 1024,
});

// Delivery-proof photos (content-verified image upload).
const proofUpload = secureUpload({
  destination: 'uploads/delivery-proofs/',
  prefix: 'proof',
  allowed: ['jpg', 'png', 'webp'],
  maxBytes: 8 * 1024 * 1024,
});

// The driver app addresses "verify delivery code" and "delivery photo" by ORDER
// id, but the underlying handlers work off the DELIVERY id. This resolves the
// driver's delivery for the given order and rewrites req.params.id so the same
// canonical handlers serve both URL shapes — fixing the app's
// "Route not found: POST /api/driver/orders/:id/..." errors without changing
// the mobile app.
async function resolveDeliveryFromOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const driverId = req.user.driver_id || req.user.id;
    const [rows] = await db.query(
      'SELECT id FROM deliveries WHERE order_id = ? AND driver_id = ? ORDER BY id DESC LIMIT 1',
      [orderId, driverId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'No delivery found for this order.' });
    }
    req.params.id = String(rows[0].id);
    next();
  } catch (error) {
    console.error('[DRIVER] resolveDeliveryFromOrder error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// uploadProof expects an `image_url` in the body; the app sends the file itself,
// so once it's safely stored we hand the handler the stored path.
function attachProofUrl(req, res, next) {
  if (req.file && req.file.filename) {
    req.body.image_url = `/uploads/delivery-proofs/${req.file.filename}`;
  } else if (req.files && typeof req.files === 'object') {
    const fileObj = req.files['delivery_photo']?.[0] || req.files['photo']?.[0];
    if (fileObj && fileObj.filename) {
      req.body.image_url = `/uploads/delivery-proofs/${fileObj.filename}`;
    }
  }
  next();
}

const proofUploadMiddleware = proofUpload.fields([
  { name: 'delivery_photo', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
]);

// Public routes
router.post('/login', DriverController.login);

// Protected routes — driver role only
router.use(authenticateToken);
router.use(authorizeRole('driver'));

router.post('/upload-profile-image', upload.single('image'), DriverController.uploadProfileImage);
router.get('/profile', DriverController.getProfile);
router.get('/stats', DriverController.getDashboardStats);
router.get('/deliveries', DriverController.getDeliveries);
router.get('/deliveries/:id', DriverController.getDeliveryDetails);
router.get('/earnings', DriverController.getEarnings);
router.get('/transactions', DriverController.getTransactions);
router.patch('/deliveries/:id/status', DriverController.updateDeliveryStatus);
router.patch('/deliveries/:id/accept', DriverController.acceptDelivery);
router.patch('/deliveries/:id/reject', DriverController.rejectDelivery);
router.patch('/deliveries/:id/pickup', DriverController.pickupDelivery);
router.patch('/delivery/:id/pickup', DriverController.pickupDelivery);
router.patch('/deliveries/:id/on-the-way', DriverController.onTheWayDelivery);
router.patch('/deliveries/:id/delivered', DriverController.deliveredDelivery);
router.patch('/deliveries/:id/failed', DriverController.failedDelivery);
router.patch('/deliveries/:id/location', DriverController.updateLiveLocation);
router.patch('/location', DriverController.updateLiveLocationGlobal);
router.put('/location', DriverController.updateLiveLocationGlobal);
router.patch('/deliveries/:id/arrived', DriverController.markArrived);
router.post('/deliveries/:id/verify-code', DriverController.verifyCode);
router.post('/deliveries/:id/upload-proof', proofUploadMiddleware, attachProofUrl, DriverController.uploadProof);
router.post('/deliveries/:id/delivery-proof', proofUploadMiddleware, attachProofUrl, DriverController.uploadProof);

// Order-id aliases the mobile app actually calls.
router.post('/orders/:orderId/verify-delivery-code', resolveDeliveryFromOrder, DriverController.verifyCode);
router.post(
  '/orders/:orderId/delivery-proof',
  resolveDeliveryFromOrder,
  proofUploadMiddleware,
  attachProofUrl,
  DriverController.uploadProof,
);
router.post(
  '/orders/:orderId/delivery-photo',
  resolveDeliveryFromOrder,
  proofUploadMiddleware,
  attachProofUrl,
  DriverController.uploadProof,
);

router.patch('/online-status', DriverController.toggleOnlineStatus);

// ─── Delivery Offer routes ──────────────────────────────────────────────────
router.get('/offers/pending', DriverController.getPendingOffers);
router.patch('/offers/:offerId/respond', DriverController.respondToOffer);

// ─── Presence & Heartbeat routes ────────────────────────────────────────────
router.post('/heartbeat', DriverController.heartbeat);
router.post('/logout', DriverController.logout);

module.exports = router;
