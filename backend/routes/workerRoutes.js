const express = require('express');
const router = express.Router();
const WorkerController = require('../controllers/workerController');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { secureUpload } = require('../utils/uploadSecurity');

// Worker profile photos: content-verified (real JPG/PNG/WEBP only), random name.
const uploadWorkerPhoto = secureUpload({
  destination: 'uploads/worker-photos/',
  prefix: 'worker',
  allowed: ['jpg', 'png', 'webp'],
  maxBytes: 5 * 1024 * 1024,
});

// ─── Public: Worker login (no auth required) ──────────────────────────────────
// Accepts email OR username + password. Returns car_wash_worker JWT.
router.post('/login', WorkerController.login);

// Every route below requires a valid Car Wash Worker token. Delivery drivers,
// vendors and admins are rejected with 403 by authorizeRole.
router.use(authenticateToken);
router.use(authorizeRole('car_wash_worker'));

router.get('/profile', WorkerController.getProfile);
router.put('/profile', WorkerController.updateProfile);
router.post('/upload-profile-image', uploadWorkerPhoto.single('image'), WorkerController.uploadProfileImage);
router.patch('/availability', WorkerController.toggleAvailability);
router.get('/notifications', WorkerController.getNotifications);
router.get('/stats', WorkerController.getStats);
router.get('/jobs', WorkerController.getJobs);
router.get('/jobs/:id', WorkerController.getJob);



// Status workflow — the only mutations a worker is allowed to make.
router.patch('/jobs/:id/accept', WorkerController.acceptJob);
router.patch('/jobs/:id/decline', WorkerController.declineJob);
router.patch('/jobs/:id/start', WorkerController.startJob);
router.patch('/jobs/:id/ready', WorkerController.readyJob);
router.patch('/jobs/:id/complete', WorkerController.completeJob);

router.put('/change-password', WorkerController.changePassword);

module.exports = router;
