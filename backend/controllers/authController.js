const db = require('../config/db');
const AdminModel = require('../models/adminModel'); // Reusing the update status method
const DriverModel = require('../models/driverModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const jwtSecret = require('../config/jwt');

const googleOAuthClient = new OAuth2Client();

const getGoogleClientIds = () => {
  const configuredIds = process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '';
  return configuredIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};

const splitDisplayName = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ')
  };
};

class AuthController {
  static googleConfig(req, res) {
    const [clientId] = getGoogleClientIds();
    res.json({
      success: true,
      configured: Boolean(clientId),
      clientId: clientId || null
    });
  }

  static async buildLoginResponse(user, profileData = {}) {
    const tokenPayload = {
      id: user.id,
      role: user.role_name,
      email: user.email
    };

    if (user.role_name === 'customer') tokenPayload.customer_id = profileData.id;
    if (user.role_name === 'driver') tokenPayload.driver_id = profileData.id;

    const token = jwt.sign(
      tokenPayload,
      jwtSecret,
      { expiresIn: '24h' }
    );

    await AdminModel.updateUserOnlineStatus(user.id, true);
    if (user.role_name === 'driver' && profileData.id) {
      await DriverModel.markOnline(profileData.id);
      console.log(`[AUTH LOGIN] Driver #${profileData.id} marked online`);
    }

    return {
      success: true,
      token,
      user: {
        id: user.id,
        profile_id: profileData.id,
        name: `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || user.username || user.email,
        email: user.email,
        phone: user.phone,
        role: user.role_name,
        profile: profileData,
        must_change_password: Boolean(user.must_change_password)
      }
    };
  }

  static async login(req, res) {
    const { email, password } = req.body;
    // 'email' field in request can be email, username, or phone

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Identifier and password are required' });
    }

    try {
      // ─── Step 1: check users table (customer / driver) ────────────────────
      const [users] = await db.query(
        'SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = ? OR u.phone = ? OR u.username = ?',
        [email, email, email]
      );

      const user = users[0];

      if (user && (user.role_name === 'customer' || user.role_name === 'driver')) {
        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Fetch profile data based on role
        let profileData = {};
        if (user.role_name === 'customer') {
          const [customers] = await db.query('SELECT * FROM customers WHERE user_id = ?', [user.id]);
          profileData = customers[0] || {};
        } else if (user.role_name === 'driver') {
          const [drivers] = await db.query('SELECT * FROM drivers WHERE user_id = ?', [user.id]);
          profileData = drivers[0] || {};

          const accountEnabled = String(user.status || '').toLowerCase() === 'active'
            && Number(profileData.is_active) === 1
            && String(profileData.account_status || '').toLowerCase() === 'approved'
            && String(profileData.verification_status || '').toLowerCase() === 'verified';
          if (!accountEnabled) {
            return res.status(403).json({
              success: false,
              code: 'DRIVER_ACCOUNT_INACTIVE',
              message: 'Your driver account is inactive. Please contact your vendor.',
            });
          }
        }

        const loginResponse = await AuthController.buildLoginResponse(user, profileData);
        console.log(`DEBUG LOGIN: auth login user id = ${user.id}, role = ${user.role_name}`);
        return res.json(loginResponse);
      }

      // ─── Step 2: check car_wash_workers table (email OR username) ────────
      const CarWashModel = require('../models/carWashModel');
      const worker = await CarWashModel.findWorkerForLogin(email);

      if (worker) {
        const workerPasswordOk = worker.password_hash
          ? await bcrypt.compare(password, worker.password_hash)
          : false;

        if (!workerPasswordOk) {
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isActive = Number(worker.is_active) === 1 &&
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

        const jwt_module = require('jsonwebtoken');
        const token = jwt_module.sign(
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
          token,
          role: 'car_wash_worker',
          must_change_password: Boolean(worker.must_change_password),
          user: {
            id: worker.id,
            profile_id: worker.id,
            name: `${worker.first_name || ''} ${worker.last_name || ''}`.trim() || worker.name || 'Worker',
            email: worker.email,
            phone: worker.phone,
            role: 'car_wash_worker',
            vendor_id: worker.vendor_id,
            vendor_business_name: worker.vendor_business_name || worker.vendor_name || '',
            profile_image: worker.profile_image,
            username: worker.username,
            profile: {
              id: worker.id,
              first_name: worker.first_name,
              last_name: worker.last_name,
              name: worker.name,
              phone: worker.phone,
              email: worker.email,
              username: worker.username,
              availability_status: worker.availability_status,
              worker_status: worker.worker_status,
              skills: worker.skills,
              profile_image: worker.profile_image,
              vendor_id: worker.vendor_id,
              vendor_business_name: worker.vendor_business_name || worker.vendor_name || '',
            },
          },
        });
      }

      // ─── No match found ────────────────────────────────────────────────────
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    } catch (error) {
      console.error('Unified Login Error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }


  static async googleLogin(req, res) {
    const { id_token } = req.body;
    const googleClientIds = getGoogleClientIds();

    if (!id_token) {
      return res.status(400).json({ success: false, message: 'Google ID token is required' });
    }

    if (googleClientIds.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID in the backend .env file.'
      });
    }

    try {
      const ticket = await googleOAuthClient.verifyIdToken({
        idToken: id_token,
        audience: googleClientIds
      });
      const payload = ticket.getPayload();

      if (!payload?.email || payload.email_verified !== true) {
        return res.status(401).json({ success: false, message: 'Google account email is not verified.' });
      }

      const email = payload.email.toLowerCase();
      let [users] = await db.query(
        'SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE LOWER(u.email) = ? LIMIT 1',
        [email]
      );

      if (users.length === 0) {
        const [roles] = await db.query('SELECT id FROM roles WHERE name = "customer" LIMIT 1');
        if (roles.length === 0) {
          return res.status(500).json({ success: false, message: 'Customer role is not configured.' });
        }

        const displayName = payload.name || email.split('@')[0];
        const { firstName, lastName } = splitDisplayName(displayName);
        const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const usernameBase = email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '') || 'google_user';
        let username = usernameBase;
        let suffix = 1;

        while (true) {
          const [existingUsernames] = await db.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
          if (existingUsernames.length === 0) break;
          suffix += 1;
          username = `${usernameBase}${suffix}`;
        }

        const connection = await db.getConnection();
        try {
          await connection.beginTransaction();
          const [userResult] = await connection.query(
            'INSERT INTO users (username, email, password_hash, role_id, phone, status) VALUES (?, ?, ?, ?, NULL, "active")',
            [username, email, passwordHash, roles[0].id]
          );
          await connection.query(
            'INSERT INTO customers (user_id, first_name, last_name, profile_picture) VALUES (?, ?, ?, ?)',
            [userResult.insertId, firstName, lastName, payload.picture || null]
          );
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }

        [users] = await db.query(
          'SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE LOWER(u.email) = ? LIMIT 1',
          [email]
        );
      }

      const user = users[0];
      if (user.role_name !== 'customer' && user.role_name !== 'driver') {
        return res.status(403).json({ success: false, message: 'Access denied. Please use the appropriate portal.' });
      }

      let profileData = {};
      if (user.role_name === 'customer') {
        const [customers] = await db.query('SELECT * FROM customers WHERE user_id = ?', [user.id]);
        profileData = customers[0] || {};
      } else if (user.role_name === 'driver') {
        const [drivers] = await db.query('SELECT * FROM drivers WHERE user_id = ?', [user.id]);
        profileData = drivers[0] || {};
      }

      const loginResponse = await AuthController.buildLoginResponse(user, profileData);
      res.json(loginResponse);
    } catch (error) {
      console.error('Google Login Error:', error);
      res.status(401).json({ success: false, message: 'Google sign-in failed. Please try again.' });
    }
  }

  static async logout(req, res) {
    try {
      if (req.user && req.user.id) {
        if (req.user.role === 'driver') {
          const driverId = req.user.driver_id || req.user.id;
          await DriverModel.markOffline(driverId);
          console.log(`[AUTH LOGOUT] Driver #${driverId} marked offline`);
        } else if (req.user.role === 'vendor') {
          // Update vendors table
          await db.query('UPDATE vendors SET is_online = 0 WHERE id = ?', [req.user.id]);
          
          // Also update linked user if exists
          const [vendors] = await db.query('SELECT user_id FROM vendors WHERE id = ?', [req.user.id]);
          if (vendors.length > 0 && vendors[0].user_id) {
            await db.query('UPDATE users SET is_online = 0 WHERE id = ?', [vendors[0].user_id]);
          }
        } else {
          // Standard users table update
          await db.query('UPDATE users SET is_online = 0 WHERE id = ?', [req.user.id]);
        }
      }
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout Error:', error);
      res.status(500).json({ success: false, message: 'Internal server error during logout' });
    }
  }

  static async heartbeat(req, res) {
    try {
      if (req.user && req.user.id) {
        let userId = req.user.id;
        
        // If the token is from a vendor, req.user.id is actually vendors.id
        if (req.user.role === 'driver') {
          const driverId = req.user.driver_id || req.user.id;
          await DriverModel.heartbeat(driverId);
          console.log(`[AUTH] Driver heartbeat registered driver_id=${driverId}`);
        } else if (req.user.role === 'vendor') {
          // Always update the vendors table
          await db.query('UPDATE vendors SET is_online = 1, last_seen = NOW() WHERE id = ?', [req.user.id]);
          
          const [vendors] = await db.query('SELECT user_id FROM vendors WHERE id = ?', [req.user.id]);
          if (vendors.length > 0 && vendors[0].user_id) {
            userId = vendors[0].user_id;
            await db.query('UPDATE users SET is_online = 1, last_seen = NOW() WHERE id = ?', [userId]);
          }
        } else {
          // Admin, Driver, or Customer with direct user_id
          await db.query('UPDATE users SET is_online = 1, last_seen = NOW() WHERE id = ?', [userId]);
        }
        
        console.log(`[AUTH] Heartbeat registered for ${req.user.role} (vendor_id or user_id): ${req.user.id}`);
      }
      res.json({ success: true, message: 'Heartbeat registered' });
    } catch (error) {
      console.error('Heartbeat Error:', error);
      res.status(500).json({ success: false, message: 'Internal server error during heartbeat' });
    }
  }

  static async changePassword(req, res) {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password || String(new_password).length < 10) {
      return res.status(400).json({ success: false, message: 'Current password and a new password of at least 10 characters are required.' });
    }
    try {
      const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ? AND status <> "deleted"', [req.user.id]);
      if (rows.length === 0 || !(await bcrypt.compare(current_password, rows[0].password_hash))) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }
      const passwordHash = await bcrypt.hash(new_password, 12);
      await db.query(
        'UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = NOW() WHERE id = ?',
        [passwordHash, req.user.id]
      );
      res.json({ success: true, message: 'Password changed successfully.' });
    } catch (error) {
      console.error('Change Password Error:', error);
      res.status(500).json({ success: false, message: 'Failed to change password.' });
    }
  }
}

module.exports = AuthController;
