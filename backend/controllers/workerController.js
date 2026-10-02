const CarWashModel = require('../models/carWashModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwtSecret = require('../config/jwt');
const {
  notifyCustomerStatus,
  notifyVendor,
} = require('../services/carWashNotificationService');

// The JWT carries both the worker's id and the vendor they belong to. Every
// query below is scoped by these two values, so a worker can only ever touch
// jobs that are (a) theirs and (b) their vendor's.
const getWorkerId = (req) => req.user.worker_id || req.user.id;
const getVendorId = (req) => req.user.vendor_id;

const fail = (res, error, message) => {
  const status = error === 'not_found'
    ? 404
    : error === 'invalid_action'
      ? 400
      : 409; // illegal_transition / not_accepted / already_accepted
  return res.status(status).json({ success: false, code: error, message });
};

class WorkerController {
  // ─── Public: Car Wash Worker login ─────────────────────────────────────────
  // Accepts email OR username. Only car_wash_worker accounts may authenticate
  // here — admin/vendor accounts are explicitly rejected.
  static async login(req, res) {
    const identifier = String(req.body?.email || req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email (or username) and password are required.',
      });
    }

    try {
      const worker = await CarWashModel.findWorkerForLogin(identifier);

      if (!worker) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email/username or password.',
        });
      }

      const passwordOk = worker.password_hash
        ? await bcrypt.compare(password, worker.password_hash)
        : false;

      if (!passwordOk) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email/username or password.',
        });
      }

      const isActive =
        Number(worker.is_active) === 1 &&
        String(worker.worker_status || 'active') === 'active';
      if (!isActive) {
        return res.status(403).json({
          success: false,
          code: 'WORKER_INACTIVE',
          message: 'Your worker account is inactive. Please contact your vendor.',
        });
      }

      if (Number(worker.login_enabled) === 0) {
        return res.status(403).json({
          success: false,
          code: 'WORKER_LOGIN_DISABLED',
          message: 'Login access for this account has been disabled. Please contact your vendor.',
        });
      }

      const token = jwt.sign(
        {
          id: worker.id,
          worker_id: worker.id,
          vendor_id: worker.vendor_id,
          role: 'car_wash_worker',
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      await CarWashModel.recordWorkerLogin(worker.id);

      return res.json({
        success: true,
        role: 'car_wash_worker',
        token,
        must_change_password: Boolean(worker.must_change_password),
        worker: {
          id: worker.id,
          vendor_id: worker.vendor_id,
          first_name: worker.first_name,
          last_name: worker.last_name,
          name: worker.name,
          email: worker.email,
          username: worker.username,
          phone: worker.phone,
          profile_image: worker.profile_image,
          vendor_business_name: worker.vendor_business_name || worker.vendor_name || '',
        },
      });
    } catch (error) {
      console.error('[WORKER] login', error);
      return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
    }
  }

  static async getProfile(req, res) {
    try {
      const profile = await CarWashModel.getWorkerProfile(getWorkerId(req));
      if (!profile) return res.status(404).json({ success: false, message: 'Worker not found.' });
      res.json({ success: true, data: profile });
    } catch (error) {
      console.error('[WORKER] getProfile', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  static async getStats(req, res) {
    try {
      const stats = await CarWashModel.workerStats(getWorkerId(req));
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('[WORKER] getStats', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  static async getJobs(req, res) {
    try {
      const filter = String(req.query.filter || 'assigned').toLowerCase();
      const data = await CarWashModel.workerJobs(getWorkerId(req), { filter });
      res.json({ success: true, data });
    } catch (error) {
      console.error('[WORKER] getJobs', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  static async getJob(req, res) {
    try {
      const job = await CarWashModel.workerJobDetail(getWorkerId(req), req.params.id);
      if (!job) return res.status(404).json({ success: false, message: 'Job not found or not assigned to you.' });
      res.json({ success: true, data: job });
    } catch (error) {
      console.error('[WORKER] getJob', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  static _transition(action) {
    return async (req, res) => {
      try {
        const result = await CarWashModel.workerTransition(
          getWorkerId(req),
          getVendorId(req),
          req.params.id,
          action
        );
        if (result.error) return fail(res, result.error, result.message);

        // Push the update out so the customer's tracking screen and the vendor's
        // queue both reflect the worker's action in real time. Best-effort — a
        // notification failure must never fail the status change itself.
        const io = req.app.get('io');
        try {
          await notifyCustomerStatus(io, result.booking);
          await notifyVendor(io, result.booking, {
            title: action === 'decline' ? 'Worker Declined Job' : 'Car wash job updated',
            message: action === 'decline'
              ? `Booking ${result.booking.booking_code} was declined by worker. Please reassign.`
              : `${result.booking.booking_code} is now "${result.booking.status}".`,
            type: 'car_wash_worker_update',
          });
        } catch (notifyError) {
          console.warn('[WORKER] notification failed:', notifyError.message);
        }
        res.json({ success: true, data: result.booking });
      } catch (error) {
        console.error(`[WORKER] transition(${action})`, error);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    };
  }

  static async changePassword(req, res) {
    try {
      const result = await CarWashModel.changeWorkerPassword(
        getWorkerId(req),
        req.body?.current_password,
        req.body?.new_password
      );
      if (result.error) {
        return res.status(400).json({ success: false, code: result.error, message: result.message });
      }
      res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error) {
      console.error('[WORKER] changePassword', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  static async toggleAvailability(req, res) {
    try {
      const status = String(req.body?.availability_status || req.body?.status || '').toLowerCase();
      const result = await CarWashModel.updateWorkerAvailability(getWorkerId(req), status);
      if (result.error) {
        return res.status(400).json({ success: false, code: result.error, message: result.message });
      }
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('[WORKER] toggleAvailability', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  static async updateProfile(req, res) {
    try {
      const updated = await CarWashModel.updateWorkerSelfProfile(getWorkerId(req), req.body);
      if (updated.error) {
        return res.status(400).json({ success: false, code: updated.error, message: updated.message });
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('[WORKER] updateProfile', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  static async uploadProfileImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image uploaded.' });
      }
      // The file was already content-verified (magic bytes) and written under a
      // random name by secureUpload — we only persist its public path.
      const imageUrl = `/uploads/worker-photos/${req.file.filename}`;
      const result = await CarWashModel.setWorkerPhoto(getWorkerId(req), imageUrl);
      if (result.error) {
        return res.status(404).json({ success: false, message: result.message });
      }
      res.json({ success: true, message: 'Profile photo updated.', profile_image: imageUrl });
    } catch (error) {
      console.error('[WORKER] uploadProfileImage', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  static async getNotifications(req, res) {
    try {
      const list = await CarWashModel.getWorkerNotifications(getWorkerId(req));
      res.json({ success: true, data: list });
    } catch (error) {
      console.error('[WORKER] getNotifications', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
}



// Bind the pipeline actions to concrete handlers.
WorkerController.acceptJob = WorkerController._transition('accept');
WorkerController.declineJob = WorkerController._transition('decline');
WorkerController.startJob = WorkerController._transition('start');
WorkerController.readyJob = WorkerController._transition('ready');
WorkerController.completeJob = WorkerController._transition('complete');

module.exports = WorkerController;
