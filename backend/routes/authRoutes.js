const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const StaffAuthController = require('../controllers/staffAuthController');
const { authenticateToken } = require('../middlewares/authMiddleware');

const VendorController = require('../controllers/vendorController');

const passwordResetAttempts = new Map();
const vendorPasswordResetRateLimiter = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const email = String(req.body?.email || '').trim().toLowerCase();
  const key = `${ip}:${email}`;
  const now = Date.now();
  const attempts = (passwordResetAttempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (attempts.length >= 5) {
    return res.status(429).json({
      success: false,
      message: 'Too many password reset requests. Please try again in 15 minutes.',
    });
  }
  attempts.push(now);
  passwordResetAttempts.set(key, attempts);
  next();
};

router.post('/login', AuthController.login);
router.post('/staff/login', StaffAuthController.login);
router.get('/google/config', AuthController.googleConfig);
router.post('/google', AuthController.googleLogin);
router.post('/logout', authenticateToken, AuthController.logout);
router.patch('/heartbeat', authenticateToken, AuthController.heartbeat);
router.put('/change-password', authenticateToken, AuthController.changePassword);

// Vendor Password Reset Endpoints
router.post('/vendor/forgot-password', vendorPasswordResetRateLimiter, VendorController.forgotPassword);
router.get('/vendor/reset-password/verify', VendorController.verifyResetToken);
router.post('/vendor/reset-password', vendorPasswordResetRateLimiter, VendorController.resetPassword);

module.exports = router;
