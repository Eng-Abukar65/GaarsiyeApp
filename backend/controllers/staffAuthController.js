const db = require('../config/db');
const AdminModel = require('../models/adminModel');
const VendorModel = require('../models/vendorModel');
const CarWashModel = require('../models/carWashModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const jwtSecret = require('../config/jwt');

const normalizeRole = (role) => String(role || '').trim().toLowerCase();
const passwordsMatch = async (password, hash) => {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
};

const buildAdminResponse = async (user) => {
  const token = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    jwtSecret,
    { expiresIn: '1d' }
  );

  await AdminModel.updateUserOnlineStatus(user.id, true);

  return {
    success: true,
    role: 'admin',
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    }
  };
};

const buildVendorResponse = async (vendor) => {
  const token = jwt.sign(
    { id: vendor.id, vendor_id: vendor.id, role: 'vendor', email: vendor.email },
    jwtSecret,
    { expiresIn: '24h' }
  );

  await db.query(
    'UPDATE vendors SET is_online = 1, last_seen = NOW(), last_login = NOW() WHERE id = ?',
    [vendor.id]
  );

  let effectiveUserId = null;

  if (vendor.user_id) {
    const [linkedUsers] = await db.query(
      `SELECT u.id FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ? AND r.name = 'vendor'
       LIMIT 1`,
      [vendor.user_id]
    );
    effectiveUserId = linkedUsers[0]?.id || null;
  }

  if (!effectiveUserId && vendor.email) {
    const [matchingUsers] = await db.query(
      `SELECT u.id FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE LOWER(u.email) = LOWER(?) AND r.name = 'vendor'
       LIMIT 1`,
      [vendor.email]
    );
    if (matchingUsers.length > 0) {
      effectiveUserId = matchingUsers[0].id;
      await db.query('UPDATE vendors SET user_id = ? WHERE id = ?', [effectiveUserId, vendor.id]);
    }
  }

  if (effectiveUserId) {
    await db.query(
      `UPDATE users u JOIN roles r ON u.role_id = r.id
          SET u.is_online = 1, u.last_seen = NOW(), u.last_login = NOW() WHERE u.id = ? AND r.name = 'vendor'`,
      [effectiveUserId]
    );
  }

  // Online status updated silently

  const profile = await VendorModel.getProfile(vendor.id);

  let mustChangePassword = false;
  try {
    const [userRows] = effectiveUserId
      ? await db.query(
          `SELECT u.must_change_password FROM users u
           JOIN roles r ON u.role_id = r.id
           WHERE u.id = ? AND r.name = 'vendor'`,
          [effectiveUserId]
        )
      : [[]];
    if (userRows.length > 0) {
      mustChangePassword = Boolean(userRows[0].must_change_password);
    }
  } catch (dbErr) {
    console.error('Failed to query must_change_password status', dbErr);
  }

  return {
    success: true,
    role: 'vendor',
    token,
    must_change_password: mustChangePassword,
    vendor: profile || {
      id: vendor.id,
      name: vendor.name || vendor.business_name,
      business_name: vendor.business_name || vendor.name,
      email: vendor.email,
      logo: vendor.logo || vendor.logo_url || '',
      logo_url: vendor.logo || vendor.logo_url || ''
    }
  };
};

// Car Wash Workers authenticate through this same endpoint using their email OR
// username. They get a `car_wash_worker` token that only unlocks the /worker app.
const buildWorkerResponse = async (worker) => {
  const token = jwt.sign(
    {
      id: worker.id,
      worker_id: worker.id,
      vendor_id: worker.vendor_id,
      role: 'car_wash_worker'
    },
    jwtSecret,
    { expiresIn: '24h' }
  );

  await CarWashModel.recordWorkerLogin(worker.id);

  return {
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
      vendor_business_name: worker.vendor_business_name || worker.vendor_name || ''
    }
  };
};

class StaffAuthController {
  static async login(req, res) {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const role = normalizeRole(req.body?.role);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    if (role && role !== 'admin' && role !== 'vendor' && role !== 'car_wash_worker') {
      return res.status(400).json({
        success: false,
        message: 'Role must be admin, vendor, or car_wash_worker.'
      });
    }

    try {
      const shouldCheckAdmin = !role || role === 'admin';
      const shouldCheckVendor = !role || role === 'vendor';

      const [adminUser, vendor] = await Promise.all([
        shouldCheckAdmin ? AdminModel.findByEmail(email) : null,
        shouldCheckVendor ? VendorModel.findByEmail(email) : null
      ]);

      const [adminPasswordValid, vendorPasswordValid] = await Promise.all([
        passwordsMatch(password, adminUser?.password_hash),
        passwordsMatch(password, vendor?.password)
      ]);

      if (!role && adminPasswordValid && vendorPasswordValid) {
        return res.status(409).json({
          success: false,
          code: 'AMBIGUOUS_STAFF_ACCOUNT',
          message: 'These credentials match both an admin and vendor account. Please use separate account emails.'
        });
      }

      if (adminPasswordValid) {
        return res.json(await buildAdminResponse(adminUser));
      }

      if (vendorPasswordValid) {
        const verificationStatus = String(vendor.verification_status || 'pending').toLowerCase();
        if (verificationStatus !== 'verified') {
          const statusMessages = {
            pending: 'Your vendor account is still pending admin approval. Please wait until an admin activates it.',
            rejected: 'Your vendor account was rejected by admin. Please contact support.',
            suspended: 'Your vendor account is suspended. Please contact support.'
          };

          return res.status(403).json({
            success: false,
            code: 'PENDING_VENDOR_VERIFICATION',
            message: statusMessages[verificationStatus] || 'Your vendor account is not approved yet.'
          });
        }

        return res.json(await buildVendorResponse(vendor));
      }

      // Car Wash Worker login (email OR username). Only checked when the request
      // isn't explicitly scoped to admin/vendor and no staff match was found.
      if (!role || role === 'car_wash_worker') {
        const worker = await CarWashModel.findWorkerForLogin(email);
        if (worker && await passwordsMatch(password, worker.password_hash)) {
          const isActive = Number(worker.is_active) === 1 &&
            String(worker.worker_status || 'active') === 'active';
          if (!isActive) {
            return res.status(403).json({
              success: false,
              code: 'WORKER_INACTIVE',
              message: 'Your worker account is inactive. Please contact your vendor.'
            });
          }
          if (Number(worker.login_enabled) === 0) {
            return res.status(403).json({
              success: false,
              code: 'WORKER_LOGIN_DISABLED',
              message: 'Login access for this account has been disabled. Please contact your vendor.'
            });
          }
          return res.json(await buildWorkerResponse(worker));
        }
      }

      const invalidMessage = role === 'admin'
        ? 'Invalid admin credentials.'
        : role === 'vendor'
          ? 'Invalid vendor credentials.'
          : 'Invalid email or password.';

      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: invalidMessage
      });
    } catch (error) {
      console.error('Staff Login Error:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred during staff login.',
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = StaffAuthController;
