const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const ReportController = require('../controllers/reportController');
const SettlementController = require('../controllers/settlementController');
const { authenticateToken, authorizeAdmin } = require('../middlewares/authMiddleware');

// Public Routes
router.post('/login', AdminController.login);

// Protected Admin Routes
router.use(authenticateToken);
router.use(authorizeAdmin);

const SubscriptionController = require('../controllers/subscriptionController');
const DocumentController = require('../controllers/documentController');
const AdminFinancialController = require('../controllers/adminFinancialController');

router.get('/documents/preview', DocumentController.previewDocument);
router.get('/documents/download', DocumentController.downloadDocument);

// ── Financial Transactions Management ─────────────────────────────────────
router.get('/financial-transactions', AdminFinancialController.getTransactions);
router.get('/financial-transactions/summary', AdminFinancialController.getSummary);
router.get('/financial-transactions/export', AdminFinancialController.exportTransactions);
router.get('/financial-transactions/:id', AdminFinancialController.getTransactionById);
router.post('/financial-transactions/:id/refund', AdminFinancialController.processRefund);
router.get('/customers/:customerId/transactions', AdminFinancialController.getCustomerTransactions);
router.get('/vendors/:vendorId/financial-history', AdminFinancialController.getVendorFinancialHistory);

// ── Report generator ─────────────────────────────────────────────────────────
// ReportController was imported here but never mounted, so the whole Admin →
// Reports page 404'd. Both routes sit behind the authenticateToken +
// authorizeAdmin middleware applied above.
router.get('/reports/types', ReportController.listTypes);
router.get('/reports/generate', ReportController.adminGenerate);

// ── Subscription & Settlement (admin side) ──────────────────────────────────
router.get('/subscriptions', SubscriptionController.adminList);
router.post('/subscriptions/:id/approve', SubscriptionController.adminApprove);
router.post('/subscriptions/:id/reject', SubscriptionController.adminReject);
router.get('/module-requests', SubscriptionController.adminListModuleRequests);
router.post('/module-requests/:id/approve', SubscriptionController.adminApproveModule);
router.post('/module-requests/:id/reject', SubscriptionController.adminRejectModule);
router.post('/module-requests/:id/approve-payment', SubscriptionController.adminApproveModulePayment);
router.post('/module-requests/:id/reject-payment', SubscriptionController.adminRejectModulePayment);

// ── Subscription Pricing Management (admin side) ─────────────────────────
router.get('/subscription-pricing', SubscriptionController.getPricing);
router.put('/subscription-pricing/:id', SubscriptionController.updatePricing);
router.get('/subscription-pricing/history', SubscriptionController.getPricingHistory);

router.get('/subscriptions/overview', SubscriptionController.adminOverview);
router.get('/settlements/overview', SubscriptionController.adminOverview);
router.get('/settlements', SubscriptionController.adminList);
router.get('/settlements/:id', SubscriptionController.adminList);
router.patch('/settlements/:id/confirm', SubscriptionController.adminApprove);
router.post('/settlements/:id/approve', SubscriptionController.adminApprove);
router.patch('/settlements/:id/reject', SubscriptionController.adminReject);
router.post('/settlements/:id/reject', SubscriptionController.adminReject);

router.get('/dashboard', AdminController.getDashboard);
router.get('/stats', AdminController.getDashboard);
router.get('/users', AdminController.getUsers);
router.put('/users/:id', AdminController.updateUser);
router.delete('/users/:id', AdminController.deleteUser);
router.post('/logout', AdminController.logout);
const { secureUpload } = require('../utils/uploadSecurity');
const uploadVendorDocuments = secureUpload({
  destination: 'uploads/vendor-documents/',
  prefix: 'document',
  allowed: ['pdf', 'jpg', 'png', 'jpeg', 'webp'],
  maxBytes: 10 * 1024 * 1024,
});

router.get('/vendors', AdminController.getVendors);
router.post(
  '/vendors',
  uploadVendorDocuments.fields([
    { name: 'nira_id_document', maxCount: 1 },
    { name: 'government_patent_document', maxCount: 1 },
    { name: 'passport_document', maxCount: 1 },
    { name: 'logo_document', maxCount: 1 },
  ]),
  AdminController.createVendor
);
router.get('/vendors/:id', AdminController.getVendorById);
router.get('/vendors/:id/waafi-settings', AdminController.getVendorWaafiSettings);
router.put('/vendors/:id/waafi-settings', AdminController.updateVendorWaafiSettings);
router.put('/vendors/:id', AdminController.updateVendor);
router.delete('/vendors/:id', AdminController.deleteVendor);
router.post('/vendors/:id/reset-password', AdminController.resetVendorPassword);

router.get('/drivers', AdminController.getDrivers);
router.post('/drivers', AdminController.createDriver);
router.get('/drivers/:id', AdminController.getDriverById);
router.put('/drivers/:id', AdminController.updateDriver);
router.delete('/drivers/:id', AdminController.deleteDriver);

router.get('/orders', AdminController.getOrders);
router.get('/products', AdminController.getProducts);
router.put('/products/:id', AdminController.updateProduct);
router.get('/inventory', AdminController.getInventory);
router.get('/payments', AdminController.getPayments);
router.post('/payments/reconcile', AdminController.reconcilePayments);
router.patch('/users/:id/status', AdminController.updateUserStatus);
router.patch('/vendors/:id/verify', AdminController.verifyVendor);
router.patch('/orders/:id/status', AdminController.updateOrderStatus);
router.patch('/orders/:id/assign', AdminController.assignOrderDriver);
router.get('/orders/:id/rejections', AdminController.getOrderRejections);
router.post('/users', AdminController.createUser);
router.get('/settings', AdminController.getSettings);
router.post('/settings', AdminController.updateSettings);

// Category management
router.get('/categories', AdminController.getCategories);
router.post('/categories', AdminController.createCategory);
router.put('/categories/:id', AdminController.updateCategory);
router.delete('/categories/:id', AdminController.deleteCategory);
router.get('/search', AdminController.search);
router.get('/driver-locations', AdminController.getDriverLocations);
router.get('/commissions', AdminController.getCommissions);
router.get('/commissions/summary', AdminController.getCommissionsSummary);
router.get('/vendors/:vendorId/commissions', AdminController.getVendorCommissions);

// Notifications
router.get('/notifications', AdminController.getNotifications);
router.get('/notification-logs', AdminController.getNotificationLogs);
router.patch('/notifications/:id/read', AdminController.markNotificationRead);
router.post('/notifications/mark-all-read', AdminController.markAllNotificationsRead);

// Delivery Zones Oversight
router.get('/delivery-zones', AdminController.getAllDeliveryZones);
router.put('/delivery-zones/:id', AdminController.updateDeliveryZone);
router.delete('/delivery-zones/:id', AdminController.deleteDeliveryZone);

// Profile & Security
router.get('/profile', AdminController.getProfile);
router.put('/security/email', AdminController.updateSecurityEmail);
router.put('/security/password', AdminController.updateSecurityPassword);
router.post('/security/logout-other-sessions', AdminController.logoutOtherSessions);

module.exports = router;
