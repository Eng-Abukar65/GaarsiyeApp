const express = require('express');
const router = express.Router();
const CustomerController = require('../controllers/customerController');
const CheckoutController = require('../controllers/checkoutController');
const CustomerCarWashController = require('../controllers/customerCarWashController');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');

router.post('/register', CustomerController.register);
router.post('/login', CustomerController.login);
// WAAFI payment callback - no authentication required
router.post('/payment/waafi/callback', CustomerController.handleWaafiPaymentCallback);
router.get('/vendors-search', CustomerController.getVendorsByProduct);
router.get('/spare-parts/vendors-products', CustomerController.getSparePartsVendorsProducts);
router.get('/car-wash/vendors-products', CustomerController.getVendorsProductsByKeyword);

router.use(authenticateToken);
router.use(authorizeRole('customer'));

router.get('/profile', CustomerController.getProfile);
router.get('/profile/stats', CustomerController.getProfileStats);
router.put('/profile', CustomerController.updateProfile);
router.patch('/profile', CustomerController.updateProfile);
router.post('/profile/photo', (req, res, next) => {
  CustomerController.uploadCustomerPhotoMiddleware(req, res, (err) => {
    if (err) {
      console.error('[Photo Route] Multer error:', err.message);
      return res.status(400).json({ message: err.message || 'File upload error' });
    }
    next();
  });
}, CustomerController.uploadProfilePhoto);
router.get('/addresses', CustomerController.getAddresses);
router.post('/addresses', CustomerController.createAddress);
router.put('/addresses/:id', CustomerController.updateAddress);
router.patch('/addresses/:id/default', CustomerController.setDefaultAddress);
router.delete('/addresses/:id', CustomerController.deleteAddress);
router.get('/location', CustomerController.getCustomerLocation);
router.post('/location', CustomerController.createOrUpdateLocation);
router.put('/location', CustomerController.createOrUpdateLocation);
router.get('/vendors', CustomerController.getVendors);
router.get('/categories', CustomerController.getCategories);
router.get('/offers/feed', CustomerController.getOfferFeed);
router.get('/offers', CustomerController.getOffers);
router.post('/offers/:id/analytics', CustomerController.trackOfferAnalytics);
router.get('/offers/:id', CustomerController.getOfferById);
router.post('/vendors/:vendorId/favorite', CustomerController.favoriteVendor);
router.delete('/vendors/:vendorId/favorite', CustomerController.unfavoriteVendor);
router.get('/vendors/:vendorId/products', CustomerController.getProductsByVendor);
router.get('/orders', CustomerController.getOrders);
router.post('/orders', CustomerController.createOrder);

// Async checkout: start returns immediately, the app polls for the real result.
router.post('/checkout', CheckoutController.start);
router.get('/checkout/:reference', CheckoutController.status);
router.patch('/checkout/:reference/cancel', CheckoutController.cancel);
router.post('/orders/:id/review', CustomerController.createOrderReview);
router.get('/deliveries/:id/tracking', CustomerController.getDeliveryTracking);
router.get('/orders/:id/tracking', CustomerController.getOrderTracking);

// ─── Car Wash (customer) ─────────────────────────────────────────────────────
router.get('/car-wash/vendors', CustomerCarWashController.listVendors);
router.get('/car-wash/vendors/:vendorId/catalog', CustomerCarWashController.getVendorCatalog);
router.get('/car-wash/check-availability', CustomerCarWashController.checkAvailability);
router.post('/car-wash/bookings', CustomerCarWashController.createBooking);
router.get('/car-wash/bookings', CustomerCarWashController.listBookings);
router.get('/car-wash/bookings/:id', CustomerCarWashController.getBooking);
router.post('/car-wash/bookings/:id/pay', CustomerCarWashController.payBooking);
router.patch('/car-wash/bookings/:id/cancel', CustomerCarWashController.cancelBooking);
router.post('/car-wash/bookings/:id/rate', CustomerCarWashController.rateBooking);

router.get('/notifications', CustomerController.getNotifications);
router.get('/notifications/unread-count', CustomerController.getUnreadNotificationsCount);
router.patch('/notifications/:id/read', CustomerController.markNotificationRead);
router.patch('/notifications/read-all', CustomerController.markAllNotificationsRead);
router.post('/notifications/token', CustomerController.registerNotificationToken);

module.exports = router;
