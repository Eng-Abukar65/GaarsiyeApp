const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');
const PaymentProviders = require('../services/paymentProviders');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');

// GET /api/payment/providers?vendor_id=N — the payment methods a customer can
// actually use with this vendor. Only providers with a real integration AND
// valid configured credentials are returned, so the app never offers a method
// that would fail at charge time.
router.get('/providers', authenticateToken, async (req, res) => {
  const vendorId = Number.parseInt(req.query.vendor_id, 10);
  if (!Number.isInteger(vendorId) || vendorId <= 0) {
    return res.status(400).json({ success: false, message: 'vendor_id is required.' });
  }
  try {
    const providers = await PaymentProviders.listForVendor(vendorId);
    res.json({ success: true, data: providers });
  } catch (error) {
    console.error('[PAYMENTS] listForVendor failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not load payment methods.' });
  }
});

// POST /api/payment/hurmood/create - requires customer to be authenticated
router.post('/hurmood/create', authenticateToken, authorizeRole('customer'), PaymentController.createPaymentRequest);

// POST /api/payment/hurmood/callback - public payment provider webhook (no auth)
router.post('/hurmood/callback', PaymentController.handlePaymentCallback);

// GET /api/payment/status/:transactionId - requires authentication to check status
router.get('/status/:transactionId', authenticateToken, authorizeRole('customer'), PaymentController.getPaymentStatus);

module.exports = router;
