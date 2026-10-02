const express = require('express');
const router = express.Router();
const CustomerController = require('../controllers/customerController');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');

router.use(authenticateToken);
router.use(authorizeRole('customer'));

router.get('/', CustomerController.getNotifications);
router.get('/unread-count', CustomerController.getUnreadNotificationsCount);
router.patch('/read-all', CustomerController.markAllNotificationsRead);
router.patch('/:id/read', CustomerController.markNotificationRead);
router.post('/token', CustomerController.registerNotificationToken);

module.exports = router;
