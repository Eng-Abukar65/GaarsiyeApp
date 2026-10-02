const AdminModel = require('../models/adminModel');
const NotificationModel = require('../models/notificationModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const crypto = require('crypto');
const { assertEmailConfigured, sendInitialPassword, sendPasswordReset } = require('../utils/emailService');
const jwtSecret = require('../config/jwt');
const { isEmail, isPhone, isNonEmpty, isName, lenBetween, collect } = require('../utils/validators');
const { ensureVendorSchema } = require('../utils/vendorSchema');
const { decryptCredential, encryptCredential, isEncryptedCredential } = require('../utils/credentialVault');
const { getWaafiApiUrl, getWaafiTimeoutMs } = require('../config/waafi');
const { refreshCommissionRate, sanitizePercent: sanitizeCommissionPercent, getCommissionPercent } = require('../config/commission');
const { normalizeStatus, isKnownStatus, canTransition, allowedNext } = require('../config/orderStatus');

// Returns true if the email is already taken by an active user or an existing vendor.
async function emailInUse(email) {
  const value = String(email).trim();
  const [users] = await db.query(
    "SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND (status IS NULL OR status <> 'deleted') LIMIT 1",
    [value]
  );
  if (users.length > 0) return true;
  const [vendors] = await db.query(
    'SELECT id FROM vendors WHERE LOWER(email) = LOWER(?) LIMIT 1',
    [value]
  );
  return vendors.length > 0;
}

// Excludes the user being edited and a vendor profile linked to that user.
// Deleted users remain part of this check because the database email key is unique.
async function emailInUseByAnotherAccount(email, userId) {
  const value = String(email).trim();
  const [users] = await db.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1',
    [value, userId]
  );
  if (users.length > 0) return true;

  const [vendors] = await db.query(
    `SELECT id FROM vendors
     WHERE LOWER(email) = LOWER(?)
       AND (user_id IS NULL OR user_id <> ?)
     LIMIT 1`,
    [value, userId]
  );
  return vendors.length > 0;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function resetVendorPasswordInDatabase(vendorId, passwordHash) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [vendors] = await connection.query(
      `SELECT id, user_id, email, business_name, name, verification_status
       FROM vendors
       WHERE id = ?
       FOR UPDATE`,
      [vendorId]
    );
    if (vendors.length === 0) {
      throw httpError(404, 'Vendor not found.');
    }

    const vendor = vendors[0];
    let vendorUser = null;

    if (vendor.user_id) {
      const [linkedUsers] = await connection.query(
        `SELECT u.id, u.email
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = ? AND r.name = 'vendor'
         FOR UPDATE`,
        [vendor.user_id]
      );
      vendorUser = linkedUsers[0] || null;
    }

    if (!vendorUser && vendor.email) {
      const [matchingUsers] = await connection.query(
        `SELECT u.id, u.email
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE LOWER(u.email) = LOWER(?)
           AND r.name = 'vendor'
           AND NOT EXISTS (
             SELECT 1 FROM vendors other
             WHERE other.user_id = u.id AND other.id <> ?
           )
         ORDER BY u.id
         LIMIT 1
         FOR UPDATE`,
        [vendor.email, vendorId]
      );
      vendorUser = matchingUsers[0] || null;
    }

    const effectiveEmail = String(vendor.email || vendorUser?.email || '').trim();
    if (!effectiveEmail) {
      throw httpError(400, 'Vendor does not have an email address.');
    }

    await connection.query('UPDATE vendors SET password = ? WHERE id = ?', [passwordHash, vendorId]);

    if (vendorUser) {
      const [userUpdate] = await connection.query(
        `UPDATE users u
         JOIN roles r ON r.id = u.role_id
         SET u.password_hash = ?, u.must_change_password = 1, u.password_changed_at = NULL
         WHERE u.id = ? AND r.name = 'vendor'`,
        [passwordHash, vendorUser.id]
      );
      if (userUpdate.affectedRows !== 1) {
        throw new Error('Vendor user password synchronization failed.');
      }
      if (Number(vendor.user_id) !== Number(vendorUser.id)) {
        await connection.query('UPDATE vendors SET user_id = ? WHERE id = ?', [vendorUser.id, vendorId]);
      }
    }

    await connection.commit();
    const verificationStatus = String(vendor.verification_status || 'pending').trim().toLowerCase();
    return {
      email: effectiveEmail,
      name: vendor.business_name || vendor.name || 'Vendor',
      verificationStatus,
      loginAllowed: verificationStatus === 'verified',
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Allowed status values — backend is the final source of truth for valid transitions.
const VENDOR_STATUSES = ['pending', 'verified', 'rejected', 'suspended'];
const USER_STATUSES = ['active', 'inactive', 'suspended'];
const WAAFI_API_KEY_MASK = '********';

function waafiSettingsResponse(vendor) {
  const storedApiKey = String(vendor.waafi_api_key || '').trim();
  const apiKeySet = Boolean(storedApiKey);
  const apiKeyEncrypted = apiKeySet && isEncryptedCredential(storedApiKey);
  let apiKeyUsable = false;
  if (apiKeySet) {
    try {
      apiKeyUsable = Boolean(decryptCredential(storedApiKey));
    } catch (_) {
      apiKeyUsable = false;
    }
  }
  const merchantUid = String(vendor.waafi_merchant_uid || '').trim();
  const apiUserId = String(vendor.waafi_api_user_id || '').trim();

  return {
    vendor_id: Number(vendor.id),
    vendor_name: vendor.business_name || vendor.name || `Vendor ${vendor.id}`,
    waafi_merchant_uid: merchantUid,
    waafi_api_user_id: apiUserId,
    // Never return the stored plaintext or ciphertext to the browser.
    waafi_api_key: apiKeySet ? WAAFI_API_KEY_MASK : '',
    waafi_api_key_set: apiKeySet,
    waafi_api_key_encrypted: apiKeyEncrypted,
    waafi_api_key_usable: apiKeyUsable,
    waafi_enabled: Boolean(vendor.waafi_enabled),
    configured: Boolean(merchantUid && apiUserId && apiKeyUsable),
    api_url: getWaafiApiUrl(),
    timeout_ms: getWaafiTimeoutMs(),
  };
}

function parseApiBoolean(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

class AdminController {
  static async login(req, res) {
    const { email, password } = req.body;

    try {
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
      }

      const user = await AdminModel.findByEmail(email);
      if (!user) {
        return res.status(401).json({ message: 'Invalid admin credentials.' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid admin credentials.' });
      }

      const token = jwt.sign(
        { id: user.id, role: user.role, email: user.email },
        jwtSecret,
        { expiresIn: '1d' }
      );

      // Set user online
      await AdminModel.updateUserOnlineStatus(user.id, true);

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login Error:', error);
      res.status(500).json({ message: 'An error occurred during login.' });
    }
  }

  static async logout(req, res) {
    try {
      const adminId = req.user.id;
      await AdminModel.updateUserOnlineStatus(adminId, false);
      res.json({ message: 'Logout successful' });
    } catch (error) {
      console.error('Logout Error:', error);
      res.status(500).json({ message: 'An error occurred during logout.' });
    }
  }

  static async getDashboard(req, res) {
    try {
      const { period } = req.query;
      const stats = await AdminModel.getDashboardStats(period || 'month');
      res.json(stats);
    } catch (error) {
      console.error('Dashboard Stats Error:', error);
      res.status(500).json({ message: 'Failed to fetch dashboard statistics.' });
    }
  }

  static async getUsers(req, res) {
    try {
      const { role } = req.query;
      const users = await AdminModel.getAllUsers(role);
      res.json(users);
    } catch (error) {
      console.error('Get Users Error:', error);
      res.status(500).json({ message: 'Failed to fetch users.' });
    }
  }

  static async updateUser(req, res) {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: 'Invalid user id.' });
      }

      const currentUser = await AdminModel.getUserById(userId);
      if (!currentUser) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body
        : {};
      const acceptedFields = new Set(['username', 'email', 'phone', 'role']);
      const unsupportedFields = Object.keys(body).filter((field) => !acceptedFields.has(field));
      if (unsupportedFields.length > 0) {
        const fieldErrors = Object.fromEntries(
          unsupportedFields.map((field) => [field, 'This field cannot be edited here.'])
        );
        return res.status(400).json({
          message: 'Only username, email, and phone can be updated.',
          errors: fieldErrors,
        });
      }

      const has = (field) => Object.prototype.hasOwnProperty.call(body, field);
      if (!has('username') && !has('email') && !has('phone') && !has('role')) {
        return res.status(400).json({ message: 'No editable user fields were provided.' });
      }

      if (has('role')) {
        const requestedRole = String(body.role || '').trim().toLowerCase();
        const currentRole = String(currentUser.role || '').trim().toLowerCase();
        if (requestedRole !== currentRole) {
          return res.status(400).json({
            message: 'User roles cannot be changed from this endpoint.',
            errors: { role: 'Role is immutable after account creation.' },
          });
        }
      }

      const username = has('username') ? String(body.username ?? '').trim() : undefined;
      const email = has('email') ? String(body.email ?? '').trim().toLowerCase() : undefined;
      const phoneText = has('phone') ? String(body.phone ?? '').trim() : undefined;
      const errors = collect({
        username: has('username') && !isName(username) ? 'Username must be 2-80 valid characters.' : null,
        email: has('email') && !isEmail(email) ? 'Enter a valid email address.' : null,
        phone: has('phone') && phoneText !== '' && !isPhone(phoneText) ? 'Enter a valid phone number.' : null,
      });
      if (errors) {
        return res.status(400).json({ message: 'Validation failed.', errors });
      }

      if (has('email') && await emailInUseByAnotherAccount(email, userId)) {
        return res.status(409).json({
          message: 'This email is already registered.',
          errors: { email: 'Email already in use.' },
        });
      }

      const updates = {};
      if (has('username')) updates.username = username;
      if (has('email')) updates.email = email;
      if (has('phone')) updates.phone = phoneText || null;

      const updatedUser = await AdminModel.updateUser(userId, updates);
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found.' });
      }

      return res.json({ message: 'User updated successfully.', user: updatedUser });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        const duplicateField = /email/i.test(error.sqlMessage || '')
          ? 'email'
          : (/phone/i.test(error.sqlMessage || '') ? 'phone' : 'username');
        return res.status(409).json({
          message: `This ${duplicateField} is already registered.`,
          errors: {
            [duplicateField]: `${duplicateField[0].toUpperCase()}${duplicateField.slice(1)} already in use.`,
          },
        });
      }
      console.error('Update User Error:', error);
      return res.status(500).json({ message: 'Failed to update user.' });
    }
  }

  static async getVendors(req, res) {
    try {
      const vendors = await AdminModel.getAllVendors();
      res.json(vendors);
    } catch (error) {
      console.error('Get Vendors Error:', error);
      res.status(500).json({ message: 'Failed to fetch vendors.' });
    }
  }

  static async createVendor(req, res) {
    try {
      const {
        business_name,
        contact_name,
        email,
        phone,
        username,
        password,
        auto_password,
        address,
        city,
        district,
        latitude,
        longitude,
        business_types,
        identity_document_type,
        verification_status,
        admin_notes,
      } = req.body;

      const files = req.files || {};
      const niraDocument = files.nira_id_document?.[0];
      const patentDocument = files.government_patent_document?.[0];
      const passportDocument = files.passport_document?.[0];
      const logoDocument = files.logo_document?.[0];

      const getDocPath = (file) => (file?.filename ? `uploads/vendor-documents/${file.filename}` : null);

      const normalizedIdentityType = String(identity_document_type || '').trim().toLowerCase();
      const nira_id = normalizedIdentityType === 'nira' ? getDocPath(niraDocument) : null;
      const passport_number = normalizedIdentityType === 'passport' ? getDocPath(passportDocument) : null;
      const government_patent = getDocPath(patentDocument);
      const logo_url = getDocPath(logoDocument);

      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedPhone = String(phone || '').trim();
      const normalizedUsername = String(username || normalizedEmail.split('@')[0] || '').trim();

      const validationErrors = collect({
        business_name: !isName(business_name) ? 'Business name is required (2–80 characters).' : null,
        contact_name: !isName(contact_name) ? 'Owner name is required (2–80 characters).' : null,
        email: !isEmail(normalizedEmail) ? 'A valid email address is required.' : null,
        phone: normalizedPhone && !isPhone(normalizedPhone) ? 'Enter a valid phone number.' : null,
        address: !lenBetween(address, 5, 255) ? 'Location must be 5–255 characters.' : null,
      });

      if (validationErrors) {
        return res.status(400).json({ message: 'Validation failed.', errors: validationErrors });
      }

      if (await emailInUse(normalizedEmail)) {
        return res.status(409).json({ message: 'This email is already registered.', errors: { email: 'Email address already in use.' } });
      }

      let rawPassword = String(password || '').trim();
      if (!rawPassword || auto_password === 'true' || auto_password === true) {
        rawPassword = crypto.randomBytes(6).toString('hex') + 'A1!';
      }

      let parsedBusinessTypes = business_types;
      if (typeof business_types === 'string') {
        try {
          parsedBusinessTypes = JSON.parse(business_types);
        } catch {
          parsedBusinessTypes = business_types.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }

      const vendorId = await AdminModel.createVendor({
        business_name: String(business_name || '').trim(),
        contact_name: String(contact_name || '').trim(),
        email: normalizedEmail,
        phone: normalizedPhone || null,
        username: normalizedUsername,
        password: rawPassword,
        address: String(address || '').trim(),
        city: String(city || '').trim(),
        district: String(district || '').trim(),
        latitude: latitude || null,
        longitude: longitude || null,
        business_types: Array.isArray(parsedBusinessTypes) ? parsedBusinessTypes : [],
        verification_status: verification_status || 'pending',
        admin_notes: String(admin_notes || '').trim() || null,
        nira_id,
        government_patent,
        passport_number,
        logo_url,
      });

      let emailSent = false;
      try {
        assertEmailConfigured();
        await sendInitialPassword({ email: normalizedEmail, name: business_name, password: rawPassword });
        emailSent = true;
      } catch (emailErr) {
        console.warn(`[VENDOR EMAIL] Initial-password delivery omitted for vendor ${vendorId}.`);
      }

      return res.status(201).json({
        message: 'Vendor registered successfully by Admin.',
        vendorId,
        initialPassword: rawPassword,
        emailSent,
      });
    } catch (error) {
      console.error('Create Vendor Error:', error);
      return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Failed to create vendor.' });
    }
  }

  static async getVendorById(req, res) {
    try {
      const vendor = await AdminModel.getVendorById(req.params.id);
      if (!vendor) {
        return res.status(404).json({ message: 'Vendor not found' });
      }
      res.json(vendor);
    } catch (error) {
      console.error('Get Vendor By Id Error:', error);
      res.status(500).json({ message: 'Failed to fetch vendor.' });
    }
  }

  static async getVendorWaafiSettings(req, res) {
    try {
      const vendorId = Number(req.params.id);
      if (!Number.isInteger(vendorId) || vendorId <= 0) {
        return res.status(400).json({ message: 'Invalid vendor id.' });
      }

      await ensureVendorSchema();
      const [vendors] = await db.query(
        `SELECT id, name, business_name, waafi_merchant_uid, waafi_api_user_id,
                waafi_api_key, waafi_enabled
         FROM vendors
         WHERE id = ?
         LIMIT 1`,
        [vendorId]
      );
      if (vendors.length === 0) {
        return res.status(404).json({ message: 'Vendor not found.' });
      }

      return res.json({ settings: waafiSettingsResponse(vendors[0]) });
    } catch (error) {
      console.error('[ADMIN WAAFI] Fetch settings failed:', error.message);
      return res.status(500).json({ message: 'Failed to fetch vendor WAAFI settings.' });
    }
  }

  static async updateVendorWaafiSettings(req, res) {
    let connection;
    try {
      const vendorId = Number(req.params.id);
      if (!Number.isInteger(vendorId) || vendorId <= 0) {
        return res.status(400).json({ message: 'Invalid vendor id.' });
      }

      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body
        : {};
      const acceptedFields = new Set([
        'waafi_merchant_uid',
        'waafi_api_user_id',
        'waafi_api_key',
        'waafi_enabled',
        'clear_api_key',
      ]);
      const unsupportedFields = Object.keys(body).filter((field) => !acceptedFields.has(field));
      if (unsupportedFields.length > 0) {
        const errors = Object.fromEntries(unsupportedFields.map((field) => [
          field,
          field === 'api_url' || field === 'timeout_ms'
            ? 'This value is read-only and must be configured on the server.'
            : 'Unsupported field.',
        ]));
        return res.status(400).json({
          message: 'Only vendor WAAFI credential fields can be updated.',
          errors,
        });
      }
      if (Object.keys(body).length === 0) {
        return res.status(400).json({ message: 'No WAAFI settings were provided.' });
      }

      const has = (field) => Object.prototype.hasOwnProperty.call(body, field);
      const merchantUid = has('waafi_merchant_uid')
        ? String(body.waafi_merchant_uid ?? '').trim()
        : undefined;
      const apiUserId = has('waafi_api_user_id')
        ? String(body.waafi_api_user_id ?? '').trim()
        : undefined;
      const apiKey = has('waafi_api_key')
        ? String(body.waafi_api_key ?? '').trim()
        : undefined;
      const enabled = has('waafi_enabled') ? parseApiBoolean(body.waafi_enabled) : undefined;
      const clearApiKey = has('clear_api_key') ? parseApiBoolean(body.clear_api_key) : false;

      const errors = collect({
        waafi_merchant_uid: merchantUid !== undefined && merchantUid.length > 120
          ? 'Merchant UID must be 120 characters or fewer.'
          : (merchantUid !== undefined && /[\r\n]/.test(merchantUid) ? 'Merchant UID contains invalid characters.' : null),
        waafi_api_user_id: apiUserId !== undefined && apiUserId.length > 120
          ? 'API User ID must be 120 characters or fewer.'
          : (apiUserId !== undefined && /[\r\n]/.test(apiUserId) ? 'API User ID contains invalid characters.' : null),
        waafi_api_key: apiKey !== undefined && apiKey.length > 1024
          ? 'API key must be 1024 characters or fewer.'
          : (apiKey !== undefined && /[\r\n]/.test(apiKey) ? 'API key contains invalid characters.' : null),
        waafi_enabled: has('waafi_enabled') && enabled === null ? 'Use true or false.' : null,
        clear_api_key: has('clear_api_key') && clearApiKey === null ? 'Use true or false.' : null,
      });
      if (errors) {
        return res.status(400).json({ message: 'Validation failed.', errors });
      }
      if (clearApiKey && apiKey) {
        return res.status(400).json({
          message: 'Choose either a new API key or clear the existing key.',
          errors: { waafi_api_key: 'Cannot set and clear the API key at the same time.' },
        });
      }

      await ensureVendorSchema();
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [vendors] = await connection.query(
        `SELECT id, name, business_name, waafi_merchant_uid, waafi_api_user_id,
                waafi_api_key, waafi_enabled
         FROM vendors
         WHERE id = ?
         FOR UPDATE`,
        [vendorId]
      );
      if (vendors.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Vendor not found.' });
      }

      const current = vendors[0];
      const nextMerchantUid = merchantUid === undefined
        ? String(current.waafi_merchant_uid || '').trim()
        : merchantUid;
      const nextApiUserId = apiUserId === undefined
        ? String(current.waafi_api_user_id || '').trim()
        : apiUserId;
      let nextApiKey = current.waafi_api_key || null;

      // Transparently upgrade legacy plaintext credentials while preserving the
      // logical key value when the admin leaves the masked field blank.
      if (nextApiKey && !isEncryptedCredential(String(nextApiKey))) {
        nextApiKey = encryptCredential(nextApiKey);
      }

      // A blank key intentionally preserves the current secret. Clearing is an
      // explicit action so a masked/empty form can never erase it accidentally.
      if (clearApiKey) {
        nextApiKey = null;
      } else if (apiKey && apiKey !== WAAFI_API_KEY_MASK) {
        nextApiKey = encryptCredential(apiKey);
      }

      const nextEnabled = enabled === undefined
        ? (clearApiKey ? false : Boolean(current.waafi_enabled))
        : enabled;
      let nextApiKeyUsable = false;
      if (nextApiKey) {
        try {
          nextApiKeyUsable = Boolean(decryptCredential(nextApiKey));
        } catch (_) {
          nextApiKeyUsable = false;
        }
      }
      if (nextEnabled && (!nextMerchantUid || !nextApiUserId || !nextApiKeyUsable)) {
        const completenessErrors = collect({
          waafi_merchant_uid: !nextMerchantUid ? 'Merchant UID is required before enabling WAAFI.' : null,
          waafi_api_user_id: !nextApiUserId ? 'API User ID is required before enabling WAAFI.' : null,
          waafi_api_key: !nextApiKeyUsable ? 'Enter a valid API key before enabling WAAFI.' : null,
        });
        await connection.rollback();
        return res.status(400).json({
          message: 'Complete all WAAFI credentials before enabling payments.',
          errors: completenessErrors,
        });
      }

      await connection.query(
        `UPDATE vendors
         SET waafi_merchant_uid = ?, waafi_api_user_id = ?, waafi_api_key = ?, waafi_enabled = ?
         WHERE id = ?`,
        [nextMerchantUid || null, nextApiUserId || null, nextApiKey, nextEnabled ? 1 : 0, vendorId]
      );
      await connection.commit();

      return res.json({
        message: 'Vendor WAAFI settings updated successfully.',
        settings: waafiSettingsResponse({
          ...current,
          waafi_merchant_uid: nextMerchantUid,
          waafi_api_user_id: nextApiUserId,
          waafi_api_key: nextApiKey,
          waafi_enabled: nextEnabled,
        }),
      });
    } catch (error) {
      if (connection) {
        try { await connection.rollback(); } catch (_) { /* transaction may already be closed */ }
      }
      const configurationError = error.code === 'CREDENTIAL_VAULT_KEY_MISSING';
      console.error('[ADMIN WAAFI] Update settings failed:', error.message);
      return res.status(configurationError ? 503 : 500).json({
        message: configurationError
          ? 'Credential encryption is not configured on the server.'
          : 'Failed to update vendor WAAFI settings.',
      });
    } finally {
      if (connection) connection.release();
    }
  }

  static async updateVendor(req, res) {
    try {
      const { business_name, email, phone } = req.body;
      const errors = collect({
        business_name: business_name !== undefined && !isName(business_name) ? 'Business name must be 2–80 characters.' : null,
        email: email !== undefined && email !== '' && !isEmail(email) ? 'Enter a valid email address.' : null,
        phone: phone !== undefined && phone !== '' && !isPhone(phone) ? 'Enter a valid phone number.' : null,
      });
      if (errors) return res.status(400).json({ message: 'Validation failed.', errors });

      const success = await AdminModel.updateVendor(req.params.id, req.body);
      if (success) {
        res.json({ message: 'Vendor updated successfully.' });
      } else {
        res.status(404).json({ message: 'Vendor not found.' });
      }
    } catch (error) {
      console.error('Update Vendor Error:', error);
      res.status(500).json({ message: 'Failed to update vendor.' });
    }
  }

  static async deleteVendor(req, res) {
    try {
      const deleted = await AdminModel.deleteVendor(req.params.id);
      if (!deleted) return res.status(404).json({ message: 'Vendor not found.' });
      res.json({ message: 'Vendor safely deactivated.' });
    } catch (error) {
      console.error('Delete Vendor Error:', error);
      res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Failed to delete vendor.' });
    }
  }

  static async resetVendorPassword(req, res) {
    try {
      const vendorId = Number(req.params.id);
      if (!Number.isInteger(vendorId) || vendorId <= 0) {
        return res.status(400).json({ message: 'Invalid vendor id.' });
      }

      await ensureVendorSchema();
      const temporaryPassword = crypto.randomBytes(9).toString('base64url');
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      const resetResult = await resetVendorPasswordInDatabase(vendorId, passwordHash);

      let emailSent = false;
      try {
        await sendPasswordReset({
          email: resetResult.email,
          name: resetResult.name,
          password: temporaryPassword,
        });
        emailSent = true;
      } catch (emailError) {
        console.warn('[ADMIN VENDOR RESET] Email delivery failed:', emailError.message);
      }

      res.json({
        message: emailSent
          ? 'Vendor password reset successfully. Temporary password is shown for admin handover.'
          : 'Vendor password reset. Email is not configured, share the temporary password manually.',
        emailSent,
        temporaryPassword,
        verificationStatus: resetResult.verificationStatus,
        loginAllowed: resetResult.loginAllowed,
      });
    } catch (error) {
      console.error('Reset Vendor Password Error:', error);
      res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : 'Failed to reset vendor password.',
      });
    }
  }

  static async getDrivers(req, res) {
    try {
      const drivers = await AdminModel.getAllDrivers();
      res.json(drivers);
    } catch (error) {
      console.error('Get Drivers Error:', error);
      res.status(500).json({ message: 'Failed to fetch drivers.' });
    }
  }

  static async getDriverById(req, res) {
    try {
      const driver = await AdminModel.getDriverById(req.params.id);
      if (!driver) {
        return res.status(404).json({ message: 'Driver not found' });
      }
      res.json(driver);
    } catch (error) {
      console.error('Get Driver By Id Error:', error);
      res.status(500).json({ message: 'Failed to fetch driver.' });
    }
  }

  static async createDriver(req, res) {
    try {
      const { full_name, email, phone } = req.body;
      const errors = collect({
        full_name: !isName(full_name) ? 'Full name is required (2–80 characters).' : null,
        email: !isEmail(email) ? 'A valid email address is required.' : null,
        phone: phone && !isPhone(phone) ? 'Enter a valid phone number.' : null,
      });
      if (errors) return res.status(400).json({ message: 'Validation failed.', errors });

      const initialPassword = crypto.randomBytes(18).toString('base64url');
      const driverId = await AdminModel.createDriver({ ...req.body, password: initialPassword });
      let emailSent = false;
      try {
        await sendInitialPassword({ email: req.body.email, name: req.body.full_name, password: initialPassword });
        emailSent = true;
      } catch (emailErr) {
        console.warn('[WARN] SMTP not configured — initial password logged below:');
        console.warn(`[DRIVER EMAIL] Initial-password delivery failed for driver ${driverId}.`);
      }
      res.status(201).json({
        message: emailSent
          ? 'Driver created successfully. Credentials sent via email.'
          : 'Driver created successfully. Email is not configured, share the temporary password manually.',
        driverId,
        initialPassword: emailSent ? undefined : initialPassword,
        emailSent
      });
    } catch (error) {
      console.error('Create Driver Error:', error);
      const duplicateEmail = error.code === 'ER_DUP_ENTRY' && String(error.message || '').includes('email');
      res.status(error.statusCode || (duplicateEmail ? 409 : 500)).json({
        message: duplicateEmail
          ? 'This email is already registered. Use a different email for this driver.'
          : (error.message || 'Failed to create driver.')
      });
    }
  }

  static async updateDriver(req, res) {
    try {
      const { full_name, email, phone } = req.body;
      const errors = collect({
        full_name: full_name !== undefined && !isName(full_name) ? 'Full name must be 2–80 characters.' : null,
        email: email !== undefined && email !== '' && !isEmail(email) ? 'Enter a valid email address.' : null,
        phone: phone !== undefined && phone !== '' && !isPhone(phone) ? 'Enter a valid phone number.' : null,
      });
      if (errors) return res.status(400).json({ message: 'Validation failed.', errors });

      const success = await AdminModel.updateDriver(req.params.id, req.body);
      if (success) {
        res.json({ message: 'Driver updated successfully.' });
      } else {
        res.status(404).json({ message: 'Driver not found.' });
      }
    } catch (error) {
      console.error('Update Driver Error:', error);
      res.status(500).json({ message: 'Failed to update driver.' });
    }
  }
  static async deleteDriver(req, res) {
    try {
      const success = await AdminModel.deleteDriver(req.params.id);
      if (!success) return res.status(404).json({ message: 'Driver not found.' });
      res.json({ message: 'Driver safely deactivated.' });
    } catch (error) {
      console.error('Delete Driver Error:', error);
      res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Failed to delete driver.' });
    }
  }
  static async getOrders(req, res) {
    try {
      const orders = await AdminModel.getAllOrders();
      res.json(orders);
    } catch (error) {
      console.error('Get Orders Error:', error);
      res.status(500).json({ message: 'Failed to fetch orders.' });
    }
  }

  static async getProducts(req, res) {
    try {
      const products = await AdminModel.getAllProducts();
      res.json(products);
    } catch (error) {
      console.error('Get Products Error:', error);
      res.status(500).json({ message: 'Failed to fetch products.' });
    }
  }

  static async updateProduct(req, res) {
    return res.status(403).json({
      success: false,
      message: 'Admin product editing is disabled. Vendors must update their own products.'
    });
  }

  static async getInventory(req, res) {
    try {
      const inventory = await AdminModel.getInventory();
      res.json(inventory);
    } catch (error) {
      console.error('Get Inventory Error:', error);
      res.status(500).json({ message: 'Failed to fetch inventory.' });
    }
  }

  static async getPayments(req, res) {
    try {
      const payments = await AdminModel.getAllPayments();
      res.json(payments);
    } catch (error) {
      console.error('Get Payments Error:', error);
      res.status(500).json({ message: 'Failed to fetch payments.' });
    }
  }

  static async updateUserStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;
    try {
      const normalized = String(status || '').trim().toLowerCase();
      if (!USER_STATUSES.includes(normalized)) {
        return res.status(400).json({ message: `Invalid user status. Allowed: ${USER_STATUSES.join(', ')}.` });
      }
      const success = await AdminModel.updateUserStatus(id, normalized);
      if (success) {
        res.json({ message: 'User status updated successfully.' });
      } else {
        res.status(404).json({ message: 'User not found.' });
      }
    } catch (error) {
      console.error('Update User Status Error:', error);
      res.status(500).json({ message: 'Failed to update user status.' });
    }
  }

  static async deleteUser(req, res) {
    const { id } = req.params;
    const adminId = req.user.id; // From auth middleware


    try {
      if (parseInt(id) === parseInt(adminId)) {
        return res.status(400).json({ message: 'You cannot delete your own admin account.' });
      }

      const result = await AdminModel.deleteUser(id);
      

      if (result.success) {
        res.json({ 
          message: `User ${result.type === 'soft' ? 'soft-deleted' : 'permanently deleted'} successfully.`,
          type: result.type 
        });
      } else {
        res.status(404).json({ message: 'User not found or already deleted.' });
      }
    } catch (error) {
      console.error('DELETE USER ERROR:', error);
      res.status(500).json({ message: 'Internal server error during delete.' });
    }
  }

  static async verifyVendor(req, res) {
    const { id } = req.params;
    const status = req.body.status || req.body.verification_status;
    try {
      const normalized = String(status || '').trim().toLowerCase();
      if (!VENDOR_STATUSES.includes(normalized)) {
        return res.status(400).json({ message: `Invalid vendor status. Allowed: ${VENDOR_STATUSES.join(', ')}.` });
      }
      const success = await AdminModel.verifyVendor(id, normalized);
      if (success) {
        res.json({ message: 'Vendor verification updated.', status: normalized, verification_status: normalized });
      } else {
        res.status(404).json({ message: 'Vendor not found.' });
      }
    } catch (error) {
      console.error('Verify Vendor Error:', error);
      res.status(500).json({ message: 'Failed to update vendor verification.' });
    }
  }

  static async updateOrderStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;
    try {
      const target = normalizeStatus(status);
      if (!isKnownStatus(target)) {
        return res.status(400).json({ message: 'Invalid order status.' });
      }

      // Fetch current status to enforce the legal transition graph.
      const [rows] = await db.query('SELECT status FROM orders WHERE id = ?', [id]);
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Order not found.' });
      }
      const current = normalizeStatus(rows[0].status);
      if (!canTransition(current, target)) {
        return res.status(409).json({
          message: `Illegal status change: "${current}" cannot move to "${target}".`,
          currentStatus: current,
          allowedNext: allowedNext(current),
        });
      }

      const success = await AdminModel.updateOrderStatus(id, target);
      if (success) {
        res.json({ message: 'Order status updated.', status: target });
      } else {
        res.status(404).json({ message: 'Order not found.' });
      }
    } catch (error) {
      console.error('Update Order Status Error:', error);
      res.status(500).json({ message: 'Failed to update order status.' });
    }
  }

  static async assignOrderDriver(req, res) {
    const { id } = req.params;
    const { driverId } = req.body;
    try {
      const success = await AdminModel.assignOrderDriver(id, driverId);
      if (success) {
        res.json({ message: 'Driver assigned to order.' });
      } else {
        res.status(404).json({ message: 'Order not found.' });
      }
    } catch (error) {
      console.error('Assign Driver Error:', error);
      res.status(500).json({ message: 'Failed to assign driver.' });
    }
  }

  static async createUser(req, res) {
    const { username, email, role, phone } = req.body;
    try {
      const allowedRoles = ['customer', 'driver', 'vendor', 'admin'];
      const errors = collect({
        username: !isName(username) ? 'Username is required (2–80 characters).' : null,
        email: !isEmail(email) ? 'A valid email address is required.' : null,
        phone: phone && !isPhone(phone) ? 'Enter a valid phone number.' : null,
        role: role && !allowedRoles.includes(String(role).toLowerCase()) ? `Role must be one of: ${allowedRoles.join(', ')}.` : null,
      });
      if (errors) return res.status(400).json({ message: 'Validation failed.', errors });
      if (await emailInUse(email)) {
        return res.status(409).json({ message: 'This email is already registered.', errors: { email: 'Email already in use.' } });
      }

      // Email delivery is best-effort — account creation must not fail if SMTP is unconfigured.
      const initialPassword = crypto.randomBytes(18).toString('base64url');
      const password_hash = await bcrypt.hash(initialPassword, 12);
      const userId = await AdminModel.createUser({
        username,
        email,
        password_hash,
        role: role || 'customer',
        phone
      });
      let emailSent = false;
      try {
        assertEmailConfigured();
        await sendInitialPassword({ email, name: username, password: initialPassword });
        emailSent = true;
      } catch (emailErr) {
        console.warn('[WARN] SMTP not configured — initial password logged below:');
        console.warn(`[USER EMAIL] Initial-password delivery failed for user ${userId}.`);
      }
      res.status(201).json({
        message: 'User created successfully',
        userId,
        initialPassword: undefined,
        emailSent
      });
    } catch (error) {
      console.error('Create User Error:', error);
      res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Failed to create user.' });
    }
  }

  static async getSettings(req, res) {
    try {
      const settings = await AdminModel.getSettings();
      res.json(settings);
    } catch (error) {
      console.error('Get Settings Error:', error);
      res.status(500).json({ message: 'Failed to fetch settings.' });
    }
  }

  static async updateSettings(req, res) {
    const { settings } = req.body; // Expecting an object { key1: value1, key2: value2 }
    try {
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return res.status(400).json({ message: 'Settings payload must be an object of key/value pairs.' });
      }

      // Validate known typed settings before persisting anything.
      const errors = {};
      if (settings.commission_rate !== undefined && sanitizeCommissionPercent(settings.commission_rate) === null) {
        errors.commission_rate = 'Commission must be a number between 0 and 100 (percent).';
      }
      if (settings.app_name !== undefined && !lenBetween(settings.app_name, 1, 100)) {
        errors.app_name = 'App name must be 1–100 characters.';
      }
      if (Object.keys(errors).length) {
        return res.status(400).json({ message: 'Validation failed.', errors });
      }

      for (const [key, value] of Object.entries(settings)) {
        await AdminModel.updateSetting(key, value);
      }

      // Keep the centralized commission cache in sync if it changed.
      if (settings.commission_rate !== undefined) {
        await refreshCommissionRate(db);
      }

      res.json({ message: 'Settings updated successfully.' });
    } catch (error) {
      console.error('Update Settings Error:', error);
      res.status(500).json({ message: 'Failed to update settings.' });
    }
  }

  static async search(req, res) {
    const { q } = req.query;
    try {
      const results = await AdminModel.globalSearch(q);
      res.json(results);
    } catch (error) {
      console.error('Search Error:', error);
      res.status(500).json({ message: 'Search failed.' });
    }
  }

  static async getDriverLocations(req, res) {
    try {
      const locations = await AdminModel.getDriverLocations();
      res.json(locations);
    } catch (error) {
      console.error('Driver Locations Error:', error);
      res.status(500).json({ message: 'Failed to fetch driver locations.' });
    }
  }
  static async getCommissions(req, res) {
    try {
      const commissions = await AdminModel.getCommissions();
      res.json(commissions);
    } catch (error) {
      console.error('Get Commissions Error:', error);
      res.status(500).json({ message: 'Failed to fetch commissions.' });
    }
  }

  static async getCommissionsSummary(req, res) {
    try {
      const summary = await AdminModel.getCommissionsSummary();
      res.json(summary);
    } catch (error) {
      console.error('Get Commissions Summary Error:', error);
      res.status(500).json({ message: 'Failed to fetch commissions summary.' });
    }
  }

  static async getVendorCommissions(req, res) {
    const { vendorId } = req.params;
    try {
      const commissions = await AdminModel.getVendorCommissions(vendorId);
      res.json(commissions);
    } catch (error) {
      console.error('Get Vendor Commissions Error:', error);
      res.status(500).json({ message: 'Failed to fetch vendor commissions.' });
    }
  }

  static async reconcilePayments(req, res) {
    try {
      const result = await AdminModel.reconcilePayments();
      res.json({
        success: true,
        message: result.message,
        payments_updated: result.payments_updated,
        commissions_settled: result.commissions_settled
      });
    } catch (error) {
      console.error('Reconcile Payments Error:', error);
      res.status(500).json({ message: 'Failed to reconcile payments.' });
    }
  }

  static async getOrderRejections(req, res) {
    try {
      const DriverModel = require('../models/driverModel');
      const rejections = await DriverModel.getRejectionHistory(req.params.id);
      res.json({ success: true, orderId: Number(req.params.id), rejections });
    } catch (error) {
      console.error('Admin Get Order Rejections Error:', error);
      res.status(500).json({ message: 'Failed to fetch rejection history' });
    }
  }

  // --- Notifications ---
  static async getNotifications(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const category = req.query.category || 'all';
      const unread = req.query.unread;
      const result = await NotificationModel.getAdminNotifications({ limit, category, unread });
      res.json({
        success: true,
        data: result.notifications,
        notifications: result.notifications,
        unread_count: result.unread_count
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
  }

  static async markNotificationRead(req, res) {
    try {
      const { id } = req.params;
      const success = await NotificationModel.markAsRead(id);
      if (success) {
        res.json({ success: true, message: 'Notification marked as read' });
      } else {
        res.status(404).json({ message: 'Notification not found' });
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: 'Failed to update notification' });
    }
  }

  static async markAllNotificationsRead(req, res) {
    try {
      const count = await NotificationModel.markAllAsRead();
      res.json({ success: true, message: `${count} notifications marked as read`, count });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ message: 'Failed to update notifications' });
    }
  }

  static async getNotificationLogs(req, res) {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const logs = await NotificationModel.getNotificationLogs(limit);
      res.json({ success: true, logs });
    } catch (error) {
      console.error('Error fetching notification logs:', error);
      res.status(500).json({ message: 'Failed to fetch notification logs' });
    }
  }

  // ─── ADMIN SECURITY & PROFILE ───────────────────────────────────────────────

  static async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const [rows] = await db.query(
        `SELECT u.id, u.username, u.email, u.phone, u.status, u.last_login, u.created_at, r.name AS role_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = ?`,
        [userId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Admin profile not found.' });
      }
      const user = rows[0];
      res.json({
        success: true,
        profile: {
          id: user.id,
          fullName: user.username || 'System Admin',
          username: user.username || 'admin',
          email: user.email,
          role: user.role_name ? user.role_name.toUpperCase() : 'SUPER ADMIN',
          lastLogin: user.last_login || user.created_at,
          phone: user.phone || ''
        }
      });
    } catch (error) {
      console.error('Error fetching admin profile:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch admin profile.' });
    }
  }

  static async updateSecurityEmail(req, res) {
    try {
      const userId = req.user.id;
      const { newEmail, confirmNewEmail, currentPassword } = req.body;

      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to change email.' });
      }
      if (!newEmail || !confirmNewEmail) {
        return res.status(400).json({ success: false, message: 'New email and confirm email are required.' });
      }
      if (newEmail.trim().toLowerCase() !== confirmNewEmail.trim().toLowerCase()) {
        return res.status(400).json({ success: false, message: 'New email and confirmation email do not match.' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail.trim())) {
        return res.status(400).json({ success: false, message: 'Invalid email address format.' });
      }

      const [rows] = await db.query('SELECT password_hash, email FROM users WHERE id = ?', [userId]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      const user = rows[0];

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Incorrect current password.' });
      }

      const targetEmail = newEmail.trim().toLowerCase();

      const [existing] = await db.query('SELECT id FROM users WHERE email = ? AND id <> ?', [targetEmail, userId]);
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'This email address is already in use by another account.' });
      }

      await db.query('UPDATE users SET email = ? WHERE id = ?', [targetEmail, userId]);

      NotificationModel.createAdminNotification({
        title: 'Admin Email Changed',
        message: `Admin email updated to ${targetEmail}.`,
        category: 'security',
        severity: 'warning',
        type: 'email_changed',
        relatedId: userId,
        targetUrl: '/admin/settings'
      }).catch(() => {});

      res.json({ success: true, message: 'Email address updated successfully!', email: targetEmail });
    } catch (error) {
      console.error('Error updating admin email:', error);
      res.status(500).json({ success: false, message: 'Failed to update email address.' });
    }
  }

  static async updateSecurityPassword(req, res) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required.' });
      }
      if (!newPassword || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'New password and confirmation password are required.' });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'New password and confirm password do not match.' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
      }
      if (!/[A-Z]/.test(newPassword)) {
        return res.status(400).json({ success: false, message: 'Password must include at least one uppercase letter (A-Z).' });
      }
      if (!/[a-z]/.test(newPassword)) {
        return res.status(400).json({ success: false, message: 'Password must include at least one lowercase letter (a-z).' });
      }
      if (!/[0-9]/.test(newPassword)) {
        return res.status(400).json({ success: false, message: 'Password must include at least one number (0-9).' });
      }
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
        return res.status(400).json({ success: false, message: 'Password must include at least one special character (!@#$%^&* etc).' });
      }

      const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      const user = rows[0];

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Incorrect current password.' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await db.query(
        'UPDATE users SET password_hash = ?, password_changed_at = NOW(), must_change_password = 0 WHERE id = ?',
        [hashedPassword, userId]
      );

      NotificationModel.createAdminNotification({
        title: 'Admin Password Changed',
        message: 'Admin account password was updated. Re-authentication required.',
        category: 'security',
        severity: 'critical',
        type: 'password_changed',
        relatedId: userId,
        targetUrl: '/admin/settings'
      }).catch(() => {});

      res.json({
        success: true,
        message: 'Password updated successfully! For security reasons, you will now be logged out.',
        forceLogout: true
      });
    } catch (error) {
      console.error('Error updating admin password:', error);
      res.status(500).json({ success: false, message: 'Failed to update password.' });
    }
  }

  static async logoutOtherSessions(req, res) {
    try {
      const userId = req.user.id;
      await db.query('UPDATE users SET password_changed_at = NOW() WHERE id = ?', [userId]);

      NotificationModel.createAdminNotification({
        title: 'Sessions Terminated',
        message: 'All other active admin sessions were forcibly logged out.',
        category: 'security',
        severity: 'warning',
        type: 'sessions_invalidated',
        relatedId: userId,
        targetUrl: '/admin/settings'
      }).catch(() => {});

      res.json({ success: true, message: 'All other active sessions have been terminated successfully.' });
    } catch (error) {
      console.error('Error terminating sessions:', error);
      res.status(500).json({ success: false, message: 'Failed to terminate sessions.' });
    }
  }

  // ─── CATEGORY MANAGEMENT ───────────────────────────────────────────────────

  static async getCategories(req, res) {
    try {
      const categories = await AdminModel.getCategories();
      res.json(categories);
    } catch (error) {
      console.error('Get Categories Error:', error);
      res.status(500).json({ message: 'Failed to fetch categories.' });
    }
  }

  static async createCategory(req, res) {
    try {
      const { name, image_url, is_active } = req.body;
      const errors = collect({
        name: !lenBetween(name, 2, 80) ? 'Category name is required (2–80 characters).' : null,
      });
      if (errors) return res.status(400).json({ message: 'Validation failed.', errors });
      if (await AdminModel.categoryNameExists(name)) {
        return res.status(409).json({ message: 'A category with this name already exists.', errors: { name: 'Duplicate category name.' } });
      }
      const id = await AdminModel.createCategory({ name, image_url, is_active: is_active === undefined ? 1 : is_active });
      res.status(201).json({ message: 'Category created successfully.', id });
    } catch (error) {
      console.error('Create Category Error:', error);
      res.status(500).json({ message: 'Failed to create category.' });
    }
  }

  static async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const { name, image_url, is_active } = req.body;
      if (name !== undefined) {
        const errors = collect({ name: !lenBetween(name, 2, 80) ? 'Category name must be 2–80 characters.' : null });
        if (errors) return res.status(400).json({ message: 'Validation failed.', errors });
        if (await AdminModel.categoryNameExists(name, id)) {
          return res.status(409).json({ message: 'Another category already uses this name.', errors: { name: 'Duplicate category name.' } });
        }
      }
      const success = await AdminModel.updateCategory(id, { name, image_url, is_active });
      if (!success) return res.status(404).json({ message: 'Category not found or nothing to update.' });
      res.json({ message: 'Category updated successfully.' });
    } catch (error) {
      console.error('Update Category Error:', error);
      res.status(500).json({ message: 'Failed to update category.' });
    }
  }

  static async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      const productCount = await AdminModel.categoryProductCount(id);
      if (productCount > 0) {
        return res.status(409).json({
          message: `Cannot delete: ${productCount} product(s) are linked to this category. Deactivate it instead or reassign the products first.`,
        });
      }
      const deleted = await AdminModel.deleteCategory(id);
      if (!deleted) return res.status(404).json({ message: 'Category not found.' });
      res.json({ message: 'Category deleted successfully.' });
    } catch (error) {
      console.error('Delete Category Error:', error);
      res.status(500).json({ message: 'Failed to delete category.' });
    }
  }

  // ─── DELIVERY ZONES OVERSIGHT ──────────────────────────────────────────────

  static async getAllDeliveryZones(req, res) {
    try {
      const [zones] = await db.query(`
        SELECT z.*, v.business_name as vendor_name 
        FROM vendor_delivery_zones z
        JOIN vendors v ON z.vendor_id = v.id
        ORDER BY v.business_name ASC, z.zone_name ASC
      `);
      res.json(zones);
    } catch (error) {
      console.error('[ADMIN] Get All Delivery Zones Error:', error);
      res.status(500).json({ message: 'Failed to fetch all delivery zones' });
    }
  }

  static async updateDeliveryZone(req, res) {
    const zoneId = req.params.id;
    const { delivery_fee, estimated_time, is_active } = req.body;

    const fee = parseFloat(delivery_fee);
    if (isNaN(fee) || fee < 0) {
      return res.status(400).json({ message: 'Delivery fee must be a valid number greater than or equal to 0.' });
    }

    const estTime = String(estimated_time || '25 mins').trim().slice(0, 50);
    const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    try {
      const [result] = await db.query(
        'UPDATE vendor_delivery_zones SET delivery_fee = ?, estimated_time = ?, is_active = ? WHERE id = ?',
        [fee, estTime, active, zoneId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Delivery zone not found.' });
      }
      res.json({ message: 'Delivery zone updated successfully.' });
    } catch (error) {
      console.error('[ADMIN] Update Delivery Zone Error:', error);
      res.status(500).json({ message: 'Failed to update delivery zone' });
    }
  }

  static async deleteDeliveryZone(req, res) {
    const zoneId = req.params.id;
    try {
      const [result] = await db.query('DELETE FROM vendor_delivery_zones WHERE id = ?', [zoneId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Delivery zone not found.' });
      }
      res.json({ message: 'Delivery zone deleted successfully.' });
    } catch (error) {
      console.error('[ADMIN] Delete Delivery Zone Error:', error);
      res.status(500).json({ message: 'Failed to delete delivery zone' });
    }
  }
}

module.exports = AdminController;
