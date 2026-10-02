const db = require('../config/db');
const { ensureCarWashSchema, nextBookingReference } = require('../utils/carWashSchema');
const { validateScheduling } = require('../utils/serverTime');

// Legal booking status transitions. A booking may only move along these edges.
const STATUS_TRANSITIONS = {
  pending: ['confirmed', 'rejected', 'payment_failed'],
  confirmed: ['worker_assigned', 'cancelled'],
  worker_assigned: ['worker_accepted', 'worker_declined', 'washing', 'cancelled', 'confirmed'],
  worker_accepted: ['washing', 'cancelled', 'worker_declined'],
  worker_declined: ['confirmed'],
  washing: ['ready', 'completed'],
  ready: ['completed'],
  completed: ['customer_rated'],
  customer_rated: [],
  cancelled: [],
  rejected: [],
  payment_failed: ['pending', 'cancelled'],
};

const ACTIVE_STATUSES = ['pending', 'confirmed', 'worker_assigned', 'worker_accepted', 'washing', 'ready'];
const CUSTOMER_CANCELLABLE_STATUSES = ['pending', 'confirmed', 'worker_assigned', 'payment_failed'];
const STATUS_TIMESTAMP_COLUMNS = {
  pending: 'submitted_at',
  confirmed: 'confirmed_at',
  worker_assigned: 'worker_assigned_at',
  worker_accepted: 'worker_accepted_at',
  worker_declined: 'worker_declined_at',
  washing: 'started_at',
  ready: 'ready_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at',
  rejected: 'rejected_at',
  payment_failed: 'payment_failed_at',
};

// A worker is "occupied" while attached to any of these booking statuses.
const OCCUPYING_STATUSES = ['worker_assigned', 'worker_accepted', 'washing', 'ready'];

const toNum = (v) => Number.parseFloat(v || 0) || 0;
const modelError = (code, message, extra = {}) => ({ error: code, message, ...extra });

// Thrown for field-level validation; the controller turns it into 400 + { errors }.
const validationError = (fieldErrors) =>
  Object.assign(new Error('Please correct the highlighted fields.'), {
    statusCode: 400,
    fieldErrors,
  });

const validateServiceInput = (data, { partial = false } = {}) => {
  const errors = {};
  const given = (k) => data[k] !== undefined && data[k] !== null;

  if (!partial || given('name')) {
    const name = String(data.name || '').trim();
    if (!name) errors.name = 'Service name is required.';
    else if (name.length > 120) errors.name = 'Service name is too long.';
  }
  if (!partial || given('description')) {
    if (!String(data.description || '').trim()) {
      errors.description = 'Description is required.';
    }
  }
  if (!partial || given('base_price')) {
    const price = Number.parseFloat(data.base_price);
    if (!Number.isFinite(price) || price <= 0) {
      errors.base_price = 'Price must be greater than zero.';
    }
  }
  if (!partial || given('estimated_minutes')) {
    const mins = Number.parseInt(data.estimated_minutes, 10);
    if (!Number.isInteger(mins) || mins <= 0) {
      errors.estimated_minutes = 'Duration must be greater than zero.';
    }
  }
  if (given('status') && !['active', 'inactive'].includes(String(data.status))) {
    errors.status = 'Status must be active or inactive.';
  }
  return errors;
};

const validateVehicleTypeInput = (data, { partial = false } = {}) => {
  const errors = {};
  const given = (k) => data[k] !== undefined && data[k] !== null;

  if (!partial || given('name')) {
    const name = String(data.name || '').trim();
    if (!name) errors.name = 'Vehicle type name is required.';
    else if (name.length > 80) errors.name = 'Vehicle type name is too long.';
  }
  if (given('extra_price')) {
    // A surcharge may be negative (e.g. motorcycles cheaper), but must be numeric.
    if (!Number.isFinite(Number.parseFloat(data.extra_price))) {
      errors.extra_price = 'Enter a valid price adjustment.';
    }
  }
  if (given('extra_minutes')) {
    const mins = Number.parseInt(data.extra_minutes, 10);
    if (!Number.isInteger(mins) || mins < 0) {
      errors.extra_minutes = 'Duration adjustment must be zero or more.';
    }
  }
  if (given('status') && !['active', 'inactive'].includes(String(data.status))) {
    errors.status = 'Status must be active or inactive.';
  }
  return errors;
};

const validateWorkerInput = (data, { partial = false } = {}) => {
  const errors = {};
  const given = (k) => data[k] !== undefined && data[k] !== null;

  if (!partial || given('first_name')) {
    const fName = String(data.first_name || '').trim();
    if (!fName) errors.first_name = 'First name is required.';
    else if (/^\d+$/.test(fName)) errors.first_name = 'First name must contain letters and cannot contain only numbers.';
    else if (fName.length > 100) errors.first_name = 'First name is too long.';
  }

  if (!partial || given('last_name')) {
    const lName = String(data.last_name || '').trim();
    if (!lName) errors.last_name = 'Last name is required.';
    else if (/^\d+$/.test(lName)) errors.last_name = 'Last name must contain letters and cannot contain only numbers.';
    else if (lName.length > 100) errors.last_name = 'Last name is too long.';
  }

  if (!partial || given('phone')) {
    const digits = String(data.phone || '').replace(/\D/g, '');
    if (!digits) errors.phone = 'Phone number is required.';
    else if (digits.length < 7 || digits.length > 15) {
      errors.phone = 'Enter a valid phone number.';
    }
  }

  if (!partial || given('email')) {
    const mail = String(data.email || '').trim();
    if (!mail) errors.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      errors.email = 'Enter a valid email address.';
    }
  }

  if (!partial || given('username')) {
    const uname = String(data.username || '').trim();
    if (!uname) errors.username = 'Username is required.';
    else if (uname.length < 3) errors.username = 'Username must be at least 3 characters.';
  }

  if (!partial) {
    const pwd = String(data.password || '').trim();
    if (!pwd) errors.password = 'Password is required.';
    else if (pwd.length < 6) errors.password = 'Password must be at least 6 characters long.';
  } else if (given('password') && String(data.password || '').trim()) {
    if (String(data.password).trim().length < 6) {
      errors.password = 'Password must be at least 6 characters long.';
    }
  }

  if (!partial || given('date_of_birth')) {
    if (!data.date_of_birth) errors.date_of_birth = 'Date of birth is required.';
    else {
      const dob = new Date(data.date_of_birth);
      if (Number.isNaN(dob.getTime())) errors.date_of_birth = 'Enter a valid date of birth.';
    }
  }

  if (!partial || given('address')) {
    const addr = String(data.address || '').trim();
    if (!addr) errors.address = 'Address is required.';
  }

  if (!partial || given('skills')) {
    let skillArr = [];
    if (Array.isArray(data.skills)) skillArr = data.skills;
    else if (typeof data.skills === 'string' && data.skills.trim()) {
      try { skillArr = JSON.parse(data.skills); } catch { skillArr = []; }
    }
    if (!Array.isArray(skillArr) || skillArr.length === 0) {
      errors.skills = 'At least one Car service/skill must be selected.';
    }
  }

  if (!partial || given('worker_status')) {
    if (!['active', 'inactive'].includes(String(data.worker_status || ''))) {
      errors.worker_status = 'Worker status is required (active or inactive).';
    }
  }

  if (!partial || given('availability_status')) {
    if (!['available', 'busy', 'offline'].includes(String(data.availability_status || ''))) {
      errors.availability_status = 'Availability status is required (available, busy, or offline).';
    }
  }

  if (!partial || given('guarantor_name') || given('sponsor_name')) {
    const sName = String(data.guarantor_name || data.sponsor_name || '').trim();
    if (!sName) errors.guarantor_name = 'Sponsor name is required.';
    else if (/\d/.test(sName)) errors.guarantor_name = 'Sponsor name cannot include numbers.';
  }

  if (!partial || given('guarantor_phone') || given('sponsor_phone')) {
    const sPhone = String(data.guarantor_phone || data.sponsor_phone || '').trim();
    const digits = sPhone.replace(/\D/g, '');
    if (!digits) errors.guarantor_phone = 'Sponsor phone is required.';
    else if (digits.length < 7 || digits.length > 15) errors.guarantor_phone = 'Enter a valid sponsor phone number.';
  }

  if (!partial || given('guarantor_address') || given('sponsor_address')) {
    const sAddr = String(data.guarantor_address || data.sponsor_address || '').trim();
    if (!sAddr) errors.guarantor_address = 'Sponsor address is required.';
  }

  return errors;
};

const CarWashModel = {
  STATUS_TRANSITIONS,
  ACTIVE_STATUSES,
  CUSTOMER_CANCELLABLE_STATUSES,

  canTransition(from, to) {
    return (STATUS_TRANSITIONS[from] || []).includes(to);
  },

  // â”€â”€â”€ Services â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async listServices(vendorId) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      'SELECT * FROM car_wash_services WHERE vendor_id = ? ORDER BY display_order ASC, id ASC',
      [vendorId]
    );
    return rows;
  },

  async createService(vendorId, data) {
    await ensureCarWashSchema();
    const errors = validateServiceInput(data);
    if (Object.keys(errors).length) throw validationError(errors);

    // One service name per vendor â€” prevents duplicate catalogue entries.
    const [[dupe]] = await db.query(
      'SELECT id FROM car_wash_services WHERE vendor_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
      [vendorId, data.name]
    );
    if (dupe) throw validationError({ name: 'You already have a service with this name.' });

    const [res] = await db.query(
      `INSERT INTO car_wash_services
         (vendor_id, name, description, base_price, estimated_minutes, image, is_available, status, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vendorId,
        String(data.name).trim(),
        data.description || null,
        toNum(data.base_price),
        parseInt(data.estimated_minutes, 10) || 30,
        data.image || null,
        data.is_available === false || data.is_available === 0 ? 0 : 1,
        data.status === 'inactive' ? 'inactive' : 'active',
        parseInt(data.display_order, 10) || 0,
      ]
    );
    return this.getService(vendorId, res.insertId);
  },

  async getService(vendorId, id) {
    const [rows] = await db.query(
      'SELECT * FROM car_wash_services WHERE id = ? AND vendor_id = ?',
      [id, vendorId]
    );
    return rows[0] || null;
  },

  async updateService(vendorId, id, data) {
    await ensureCarWashSchema();
    // Ownership: a service that isn't this vendor's simply doesn't exist here.
    const existing = await this.getService(vendorId, id);
    if (!existing) return null;

    const errors = validateServiceInput(data, { partial: true });
    if (Object.keys(errors).length) throw validationError(errors);

    if (data.name !== undefined) {
      const [[dupe]] = await db.query(
        `SELECT id FROM car_wash_services
         WHERE vendor_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1`,
        [vendorId, data.name, id]
      );
      if (dupe) throw validationError({ name: 'You already have a service with this name.' });
    }

    await db.query(
      `UPDATE car_wash_services SET
         name = ?, description = ?, base_price = ?, estimated_minutes = ?, image = ?,
         is_available = ?, status = ?, display_order = ?
       WHERE id = ? AND vendor_id = ?`,
      [
        data.name ?? existing.name,
        data.description ?? existing.description,
        data.base_price != null ? toNum(data.base_price) : existing.base_price,
        data.estimated_minutes != null ? parseInt(data.estimated_minutes, 10) : existing.estimated_minutes,
        data.image ?? existing.image,
        data.is_available != null ? (data.is_available ? 1 : 0) : existing.is_available,
        data.status ?? existing.status,
        data.display_order != null ? parseInt(data.display_order, 10) : existing.display_order,
        id, vendorId,
      ]
    );
    return this.getService(vendorId, id);
  },

  // Safe delete: refuse while active bookings depend on the service. If it has
  // only historical bookings we deactivate instead of deleting, so past records
  // keep their service link. Otherwise it's removed outright.
  async deleteService(vendorId, id) {
    await ensureCarWashSchema();
    const existing = await this.getService(vendorId, id);
    if (!existing) return { error: 'not_found' };

    const [[active]] = await db.query(
      `SELECT COUNT(*) AS n FROM car_wash_bookings
       WHERE service_id = ? AND vendor_id = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`,
      [id, vendorId, ...ACTIVE_STATUSES]
    );
    if (Number(active.n) > 0) {
      return {
        error: 'in_use',
        message: `This service has ${active.n} active booking(s). Complete or cancel them first, or deactivate the service instead.`,
      };
    }

    const [[historical]] = await db.query(
      'SELECT COUNT(*) AS n FROM car_wash_bookings WHERE service_id = ? AND vendor_id = ?',
      [id, vendorId]
    );
    if (Number(historical.n) > 0) {
      await db.query(
        `UPDATE car_wash_services SET status = 'inactive', is_available = 0
         WHERE id = ? AND vendor_id = ?`,
        [id, vendorId]
      );
      return { deactivated: true, reason: 'Kept for booking history and deactivated instead of deleted.' };
    }

    await db.query('DELETE FROM car_wash_services WHERE id = ? AND vendor_id = ?', [id, vendorId]);
    return { deleted: true };
  },

  // â”€â”€â”€ Add-ons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async listAddons(vendorId) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      'SELECT * FROM car_wash_addons WHERE vendor_id = ? ORDER BY display_order ASC, id ASC',
      [vendorId]
    );
    return rows;
  },

  async createAddon(vendorId, data) {
    await ensureCarWashSchema();
    const [res] = await db.query(
      `INSERT INTO car_wash_addons (vendor_id, name, price, duration_minutes, is_available, display_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        vendorId, data.name, toNum(data.price),
        parseInt(data.duration_minutes, 10) || 0,
        data.is_available === false || data.is_available === 0 ? 0 : 1,
        parseInt(data.display_order, 10) || 0,
      ]
    );
    const [rows] = await db.query('SELECT * FROM car_wash_addons WHERE id = ?', [res.insertId]);
    return rows[0];
  },

  async updateAddon(vendorId, id, data) {
    await ensureCarWashSchema();
    const [existingRows] = await db.query(
      'SELECT * FROM car_wash_addons WHERE id = ? AND vendor_id = ?', [id, vendorId]);
    const existing = existingRows[0];
    if (!existing) return null;
    await db.query(
      `UPDATE car_wash_addons SET name = ?, price = ?, duration_minutes = ?, is_available = ?, display_order = ?
       WHERE id = ? AND vendor_id = ?`,
      [
        data.name ?? existing.name,
        data.price != null ? toNum(data.price) : existing.price,
        data.duration_minutes != null ? parseInt(data.duration_minutes, 10) : existing.duration_minutes,
        data.is_available != null ? (data.is_available ? 1 : 0) : existing.is_available,
        data.display_order != null ? parseInt(data.display_order, 10) : existing.display_order,
        id, vendorId,
      ]
    );
    const [rows] = await db.query('SELECT * FROM car_wash_addons WHERE id = ?', [id]);
    return rows[0];
  },

  async deleteAddon(vendorId, id) {
    const [res] = await db.query('DELETE FROM car_wash_addons WHERE id = ? AND vendor_id = ?', [id, vendorId]);
    return res.affectedRows > 0;
  },

  // â”€â”€â”€ Vehicle types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async listVehicleTypes(vendorId) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      'SELECT * FROM car_wash_vehicle_types WHERE vendor_id = ? ORDER BY display_order ASC, id ASC',
      [vendorId]
    );
    return rows;
  },

  async createVehicleType(vendorId, data) {
    await ensureCarWashSchema();
    const errors = validateVehicleTypeInput(data);
    if (Object.keys(errors).length) throw validationError(errors);

    // One vehicle-type name per vendor.
    const [[dupe]] = await db.query(
      'SELECT id FROM car_wash_vehicle_types WHERE vendor_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
      [vendorId, data.name]
    );
    if (dupe) throw validationError({ name: 'You already have a vehicle type with this name.' });

    const [res] = await db.query(
      `INSERT INTO car_wash_vehicle_types
         (vendor_id, name, description, extra_price, extra_minutes, status, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        vendorId,
        String(data.name).trim(),
        String(data.description || '').trim() || null,
        toNum(data.extra_price),
        parseInt(data.extra_minutes, 10) || 0,
        data.status === 'inactive' ? 'inactive' : 'active',
        parseInt(data.display_order, 10) || 0,
      ]
    );
    const [rows] = await db.query('SELECT * FROM car_wash_vehicle_types WHERE id = ?', [res.insertId]);
    return rows[0];
  },

  async updateVehicleType(vendorId, id, data) {
    await ensureCarWashSchema();
    const [existingRows] = await db.query(
      'SELECT * FROM car_wash_vehicle_types WHERE id = ? AND vendor_id = ?', [id, vendorId]);
    const existing = existingRows[0];
    if (!existing) return null;

    const errors = validateVehicleTypeInput(data, { partial: true });
    if (Object.keys(errors).length) throw validationError(errors);

    if (data.name !== undefined) {
      const [[dupe]] = await db.query(
        `SELECT id FROM car_wash_vehicle_types
         WHERE vendor_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1`,
        [vendorId, data.name, id]
      );
      if (dupe) throw validationError({ name: 'You already have a vehicle type with this name.' });
    }

    await db.query(
      `UPDATE car_wash_vehicle_types SET
         name = ?, description = ?, extra_price = ?, extra_minutes = ?, status = ?, display_order = ?
       WHERE id = ? AND vendor_id = ?`,
      [
        data.name !== undefined ? String(data.name).trim() : existing.name,
        data.description !== undefined ? (String(data.description).trim() || null) : existing.description,
        data.extra_price != null ? toNum(data.extra_price) : existing.extra_price,
        data.extra_minutes != null ? parseInt(data.extra_minutes, 10) : existing.extra_minutes,
        data.status ?? existing.status,
        data.display_order != null ? parseInt(data.display_order, 10) : existing.display_order,
        id, vendorId,
      ]
    );
    const [rows] = await db.query('SELECT * FROM car_wash_vehicle_types WHERE id = ?', [id]);
    return rows[0];
  },

  // Safe delete: block while active bookings reference the type; archive
  // (deactivate) if only historical bookings use it; otherwise delete outright.
  async deleteVehicleType(vendorId, id) {
    await ensureCarWashSchema();
    const [[existing]] = await db.query(
      'SELECT id FROM car_wash_vehicle_types WHERE id = ? AND vendor_id = ?', [id, vendorId]);
    if (!existing) return { error: 'not_found' };

    const [[active]] = await db.query(
      `SELECT COUNT(*) AS n FROM car_wash_bookings
       WHERE vehicle_type_id = ? AND vendor_id = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`,
      [id, vendorId, ...ACTIVE_STATUSES]
    );
    if (Number(active.n) > 0) {
      return {
        error: 'in_use',
        message: `This vehicle type is used by ${active.n} active booking(s). Complete or cancel them first, or archive it instead.`,
      };
    }

    const [[historical]] = await db.query(
      'SELECT COUNT(*) AS n FROM car_wash_bookings WHERE vehicle_type_id = ? AND vendor_id = ?',
      [id, vendorId]
    );
    if (Number(historical.n) > 0) {
      await db.query(
        "UPDATE car_wash_vehicle_types SET status = 'inactive' WHERE id = ? AND vendor_id = ?",
        [id, vendorId]
      );
      return { deactivated: true, reason: 'Archived (kept for booking history) instead of deleted.' };
    }

    await db.query('DELETE FROM car_wash_vehicle_types WHERE id = ? AND vendor_id = ?', [id, vendorId]);
    return { deleted: true };
  },

  // â”€â”€â”€ Workers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // includeInactive lets the management page show deactivated workers; the
  // booking-assignment picker uses the default (active only).
  async listWorkers(vendorId, { includeInactive = false } = {}) {
    await ensureCarWashSchema();
    const clauses = ['w.vendor_id = ?', 'w.is_active = 1'];
    const params = [vendorId];
    if (!includeInactive) {
      clauses.push("w.worker_status = 'active'");
    }
    const [rows] = await db.query(
      `SELECT w.*,
        (SELECT COUNT(*) FROM car_wash_bookings b
           WHERE b.worker_id = w.id AND b.status IN ('worker_assigned','washing','ready')) AS assigned_jobs,
        (SELECT COUNT(*) FROM car_wash_bookings b
           WHERE b.worker_id = w.id AND b.status = 'completed') AS completed_jobs,
        (SELECT b.booking_code FROM car_wash_bookings b
           WHERE b.worker_id = w.id AND b.status IN ('worker_assigned','washing','ready')
           ORDER BY b.id DESC LIMIT 1) AS current_booking_code,
        (SELECT b.id FROM car_wash_bookings b
           WHERE b.worker_id = w.id AND b.status IN ('worker_assigned','washing','ready')
           ORDER BY b.id DESC LIMIT 1) AS current_booking_id
       FROM car_wash_workers w
       WHERE ${clauses.join(' AND ')}
       ORDER BY COALESCE(w.first_name, w.name) ASC, w.last_name ASC`,
      params
    );
    return rows;
  },

  // Rejects a duplicate phone/email/username within the same vendor (other vendors may
  // legitimately employ someone with the same number/credentials).
  async assertWorkerContactUnique(vendorId, { phone, email, username }, excludeId = null) {
    const errors = {};
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits) {
      const [[dupe]] = await db.query(
        `SELECT id FROM car_wash_workers
         WHERE vendor_id = ? AND REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+','') = ?
           ${excludeId ? 'AND id <> ?' : ''} LIMIT 1`,
        excludeId ? [vendorId, digits, excludeId] : [vendorId, digits]
      );
      if (dupe) errors.phone = 'Another worker already uses this phone number.';
    }
    const mail = String(email || '').trim();
    if (mail) {
      const [[dupe]] = await db.query(
        `SELECT id FROM car_wash_workers
         WHERE vendor_id = ? AND LOWER(TRIM(email)) = LOWER(TRIM(?))
           ${excludeId ? 'AND id <> ?' : ''} LIMIT 1`,
        excludeId ? [vendorId, mail, excludeId] : [vendorId, mail]
      );
      if (dupe) errors.email = 'Another worker already uses this email.';
    }
    const uname = String(username || '').trim();
    if (uname) {
      const [[dupe]] = await db.query(
        `SELECT id FROM car_wash_workers
         WHERE vendor_id = ? AND LOWER(TRIM(username)) = LOWER(TRIM(?))
           ${excludeId ? 'AND id <> ?' : ''} LIMIT 1`,
        excludeId ? [vendorId, uname, excludeId] : [vendorId, uname]
      );
      if (dupe) errors.username = 'Another worker already uses this username.';
    }
    if (Object.keys(errors).length) throw validationError(errors);
  },

  async createWorker(vendorId, data) {
    await ensureCarWashSchema();
    const errors = validateWorkerInput(data);
    if (Object.keys(errors).length) throw validationError(errors);
    await this.assertWorkerContactUnique(vendorId, data);

    let password_hash = null;
    let initialPassword = null;
    if (String(data.username || '').trim()) {
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const rawPassword = String(data.password || '').trim();
      initialPassword = rawPassword || crypto.randomBytes(9).toString('base64url'); // ~12 characters
      password_hash = await bcrypt.hash(initialPassword, 12);
    }

    const first_name = String(data.first_name || '').trim();
    const last_name = String(data.last_name || '').trim();
    const name = `${first_name} ${last_name}`.trim();
    const phone = String(data.phone || '').replace(/\D/g, '');
    const email = String(data.email || '').trim() || null;
    const username = String(data.username || '').trim() || null;
    const dob = data.date_of_birth || null;
    const address = data.address || null;
    const profile_image = data.profile_image || null;
    const worker_status = data.worker_status === 'inactive' ? 'inactive' : 'active';
    const is_active = worker_status === 'inactive' ? 0 : 1;
    const availability_status = ['available', 'busy', 'offline'].includes(data.availability_status) ? data.availability_status : 'offline';
    const is_online = availability_status === 'available' ? 1 : 0;
    const skills = Array.isArray(data.skills) ? JSON.stringify(data.skills) : (data.skills || null);
    const notes = data.notes || null;
    const guarantor_name = String(data.guarantor_name || '').trim() || null;
    const guarantor_phone = String(data.guarantor_phone || '').trim() || null;
    const guarantor_address = String(data.guarantor_address || '').trim() || null;

    const [res] = await db.query(
      `INSERT INTO car_wash_workers (
        vendor_id, personnel_type, name, first_name, last_name, phone, email, username, password_hash,
        date_of_birth, address, profile_image, photo, worker_status, is_active, availability_status, status, is_online,
        skills, notes, guarantor_name, guarantor_phone, guarantor_address
      ) VALUES (?, 'car_wash_worker', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vendorId, name, first_name, last_name, phone, email, username, password_hash,
        dob, address, profile_image, profile_image, worker_status, is_active, availability_status, availability_status, is_online,
        skills, notes, guarantor_name, guarantor_phone, guarantor_address
      ]
    );
    const [rows] = await db.query('SELECT * FROM car_wash_workers WHERE id = ?', [res.insertId]);
    const worker = rows[0];
    if (initialPassword) {
      worker.initialPassword = initialPassword;
    }
    return worker;
  },

  async updateWorker(vendorId, id, data) {
    await ensureCarWashSchema();
    const [existingRows] = await db.query(
      'SELECT * FROM car_wash_workers WHERE id = ? AND vendor_id = ?', [id, vendorId]);
    const existing = existingRows[0];
    if (!existing) return null;

    const errors = validateWorkerInput(data, { partial: true });
    if (Object.keys(errors).length) throw validationError(errors);
    await this.assertWorkerContactUnique(
      vendorId,
      {
        phone: data.phone ?? existing.phone,
        email: data.email ?? existing.email,
        username: data.username ?? existing.username
      },
      id
    );

    // Don't let a worker be flipped away from busy while a job is on them.
    const newAvailStatus = data.availability_status ?? existing.availability_status;
    const newWorkerStatus = data.worker_status ?? existing.worker_status;
    if ((newAvailStatus && newAvailStatus !== 'busy' && existing.availability_status === 'busy') || newWorkerStatus === 'inactive') {
      const [[busyOn]] = await db.query(
        `SELECT COUNT(*) AS n FROM car_wash_bookings
         WHERE worker_id = ? AND vendor_id = ? AND status IN (${OCCUPYING_STATUSES.map(() => '?').join(',')})`,
        [id, vendorId, ...OCCUPYING_STATUSES]
      );
      if (Number(busyOn.n) > 0) {
        throw validationError({
          availability_status: 'This worker is on an active booking. Finish or cancel it first.',
        });
      }
    }

    let password_hash = existing.password_hash;
    if (data.username !== undefined && String(data.username || '').trim()) {
      if (data.password !== undefined && String(data.password || '').trim()) {
        const bcrypt = require('bcryptjs');
        password_hash = await bcrypt.hash(String(data.password).trim(), 12);
      }
    } else if (data.username === null || data.username === '') {
      password_hash = null;
    }

    const first_name = data.first_name !== undefined ? String(data.first_name).trim() : existing.first_name;
    const last_name = data.last_name !== undefined ? String(data.last_name).trim() : existing.last_name;
    const name = `${first_name} ${last_name}`.trim();
    const phone = data.phone !== undefined ? String(data.phone).replace(/\D/g, '') : existing.phone;
    const email = data.email !== undefined ? (String(data.email).trim() || null) : existing.email;
    const username = data.username !== undefined ? (String(data.username).trim() || null) : existing.username;
    const dob = data.date_of_birth !== undefined ? data.date_of_birth : existing.date_of_birth;
    const address = data.address !== undefined ? data.address : existing.address;
    const profile_image = data.profile_image !== undefined ? data.profile_image : existing.profile_image;
    const worker_status = data.worker_status !== undefined ? data.worker_status : existing.worker_status;
    const is_active = worker_status === 'inactive' ? 0 : 1;
    const availability_status = data.availability_status !== undefined ? data.availability_status : existing.availability_status;
    const status = availability_status;
    const skills = data.skills !== undefined ? (Array.isArray(data.skills) ? JSON.stringify(data.skills) : data.skills) : existing.skills;
    const notes = data.notes !== undefined ? data.notes : existing.notes;
    const guarantor_name = data.guarantor_name !== undefined ? String(data.guarantor_name || '').trim() || null : existing.guarantor_name;
    const guarantor_phone = data.guarantor_phone !== undefined ? String(data.guarantor_phone || '').trim() || null : existing.guarantor_phone;
    const guarantor_address = data.guarantor_address !== undefined ? String(data.guarantor_address || '').trim() || null : existing.guarantor_address;

    await db.query(
      `UPDATE car_wash_workers
       SET name = ?, first_name = ?, last_name = ?, phone = ?, email = ?, username = ?, password_hash = ?,
           date_of_birth = ?, address = ?, profile_image = ?, photo = ?, worker_status = ?, is_active = ?,
           availability_status = ?, status = ?, skills = ?, notes = ?, guarantor_name = ?, guarantor_phone = ?, guarantor_address = ?
       WHERE id = ? AND vendor_id = ?`,
      [
        name, first_name, last_name, phone, email, username, password_hash,
        dob, address, profile_image, profile_image, worker_status, is_active,
        availability_status, status, skills, notes, guarantor_name, guarantor_phone, guarantor_address,
        id, vendorId
      ]
    );

    const [rows] = await db.query('SELECT * FROM car_wash_workers WHERE id = ?', [id]);
    return rows[0];
  },

  // Safe delete: never remove a worker mid-job. Soft-delete preserves history.
  async deleteWorker(vendorId, id) {
    await ensureCarWashSchema();
    const [[existing]] = await db.query(
      'SELECT id FROM car_wash_workers WHERE id = ? AND vendor_id = ?', [id, vendorId]);
    if (!existing) return { error: 'not_found' };

    const [[active]] = await db.query(
      `SELECT COUNT(*) AS n FROM car_wash_bookings
       WHERE worker_id = ? AND vendor_id = ? AND status IN (${OCCUPYING_STATUSES.map(() => '?').join(',')})`,
      [id, vendorId, ...OCCUPYING_STATUSES]
    );
    if (Number(active.n) > 0) {
      return {
        error: 'in_use',
        message: `This worker is assigned to ${active.n} active booking(s). Reassign or finish them first.`,
      };
    }

    await db.query(
      "UPDATE car_wash_workers SET is_active = 0, status = 'offline' WHERE id = ? AND vendor_id = ?",
      [id, vendorId]
    );
    return { deactivated: true };
  },

  // â”€â”€â”€ Worker login accounts (Car Wash Worker app) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Find a worker by email OR username for login. Joins the vendor so the worker
  // app can show which business they belong to.
  async findWorkerForLogin(identifier) {
    await ensureCarWashSchema();
    const id = String(identifier || '').trim();
    if (!id) return null;
    const [rows] = await db.query(
      `SELECT w.*, v.business_name AS vendor_business_name, v.name AS vendor_name
       FROM car_wash_workers w
       JOIN vendors v ON v.id = w.vendor_id
       WHERE LOWER(TRIM(w.email)) = LOWER(?) OR LOWER(TRIM(w.username)) = LOWER(?)
       ORDER BY w.id ASC LIMIT 1`,
      [id, id]
    );
    return rows[0] || null;
  },

  async recordWorkerLogin(workerId) {
    await db.query(
      'UPDATE car_wash_workers SET last_login = NOW(), is_online = 1 WHERE id = ?',
      [workerId]
    );
  },

  async getWorkerProfile(workerId) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      `SELECT w.id, w.vendor_id, w.first_name, w.last_name, w.name, w.email, w.username,
              w.phone, w.profile_image, w.worker_status, w.availability_status, w.is_online,
              w.skills, w.rating, w.last_login, w.must_change_password, w.login_enabled,
              (SELECT COUNT(*) FROM car_wash_bookings b WHERE b.worker_id = w.id AND b.status = 'completed') AS completed_jobs_count,
              v.business_name AS vendor_business_name, v.name AS vendor_name
       FROM car_wash_workers w
       JOIN vendors v ON v.id = w.vendor_id
       WHERE w.id = ?`,
      [workerId]
    );
    return rows[0] || null;
  },

  async updateWorkerAvailability(workerId, availabilityStatus) {
    await ensureCarWashSchema();
    const status = ['available', 'offline'].includes(availabilityStatus) ? availabilityStatus : 'available';
    
    if (status === 'offline') {
      const [[busyOn]] = await db.query(
        `SELECT COUNT(*) AS n FROM car_wash_bookings
         WHERE worker_id = ? AND status IN (${OCCUPYING_STATUSES.map(() => '?').join(',')})`,
        [workerId, ...OCCUPYING_STATUSES]
      );
      if (Number(busyOn.n) > 0) {
        return modelError('busy_job', 'Cannot go offline while you have an active job in progress.');
      }
    }

    const isOnline = status === 'available' ? 1 : 0;
    await db.query(
      'UPDATE car_wash_workers SET availability_status = ?, status = ?, is_online = ? WHERE id = ?',
      [status, status, isOnline, workerId]
    );
    return { success: true, availability_status: status, is_online: isOnline };
  },

  async updateWorkerSelfProfile(workerId, data) {
    await ensureCarWashSchema();
    const [existingRows] = await db.query('SELECT * FROM car_wash_workers WHERE id = ?', [workerId]);
    const existing = existingRows[0];
    if (!existing) return modelError('not_found', 'Worker not found.');

    const first_name = data.first_name !== undefined ? String(data.first_name).trim() : existing.first_name;
    const last_name = data.last_name !== undefined ? String(data.last_name).trim() : existing.last_name;
    const name = `${first_name} ${last_name}`.trim();
    const phone = data.phone !== undefined ? String(data.phone).replace(/\D/g, '') : existing.phone;
    const email = data.email !== undefined ? (String(data.email).trim() || null) : existing.email;

    await db.query(
      `UPDATE car_wash_workers SET name = ?, first_name = ?, last_name = ?, phone = ?, email = ?
       WHERE id = ?`,
      [name, first_name, last_name, phone, email, workerId]
    );

    return this.getWorkerProfile(workerId);
  },

  // Sets the worker's own profile photo (path already vetted by the upload layer).
  async setWorkerPhoto(workerId, imagePath) {
    await ensureCarWashSchema();
    const [result] = await db.query(
      'UPDATE car_wash_workers SET profile_image = ?, photo = ? WHERE id = ?',
      [imagePath, imagePath, workerId]
    );
    if (result.affectedRows !== 1) return modelError('not_found', 'Worker not found.');
    return { success: true, profile_image: imagePath };
  },

  async getWorkerNotifications(workerId) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      `SELECT h.id, h.booking_id, h.from_status, h.status, h.actor_type, h.created_at,
              b.booking_code, b.service_name, b.customer_name
       FROM car_wash_booking_status_history h
       JOIN car_wash_bookings b ON b.id = h.booking_id
       WHERE b.worker_id = ?
       ORDER BY h.created_at DESC
       LIMIT 30`,
      [workerId]
    );
    return rows;
  },



  // Attaches the chosen add-ons to a set of booking rows (in place).
  async _attachBookingAddons(bookings) {
    const list = Array.isArray(bookings) ? bookings : [bookings];
    if (!list.length) return list;
    const ids = list.map((b) => b.id);
    const [addonRows] = await db.query(
      `SELECT booking_id, name, price FROM car_wash_booking_addons
       WHERE booking_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const byBooking = {};
    for (const a of addonRows) {
      (byBooking[a.booking_id] = byBooking[a.booking_id] || []).push({
        name: a.name,
        price: Number(a.price),
      });
    }
    for (const b of list) b.addons = byBooking[b.id] || [];
    return list;
  },

  // Jobs assigned to a specific worker. `filter` narrows to the requested list.
  async workerJobs(workerId, { filter = 'assigned' } = {}) {
    await ensureCarWashSchema();
    const clauses = ['b.worker_id = ?'];
    const params = [workerId];
    switch (filter) {
      case 'today':
        clauses.push('b.scheduled_date = CURDATE()');
        clauses.push("b.status IN ('worker_assigned','washing','ready')");
        break;
      case 'pending':
        clauses.push("b.status = 'worker_assigned'");
        break;
      case 'active':
        clauses.push("b.status IN ('washing','ready')");
        break;
      case 'completed':
        clauses.push("b.status = 'completed'");
        break;
      case 'all':
        break;
      case 'assigned':
      default:
        clauses.push("b.status IN ('worker_assigned','washing','ready')");
        break;
    }
    const [rows] = await db.query(
      `SELECT b.*,
              CASE
                WHEN b.customer_name IS NOT NULL AND LOWER(TRIM(b.customer_name)) != 'customer' AND TRIM(b.customer_name) != '' THEN b.customer_name
                WHEN c.first_name IS NOT NULL OR c.last_name IS NOT NULL THEN TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')))
                WHEN u.username IS NOT NULL THEN u.username
                ELSE 'Customer'
              END AS customer_name,
              COALESCE(NULLIF(TRIM(b.customer_phone), ''), u.phone) AS customer_phone,
              COALESCE(NULLIF(TRIM(b.service_address), ''), 'Mogadishu') AS service_address
       FROM car_wash_bookings b
       LEFT JOIN customers c ON b.customer_id = c.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY b.scheduled_date ASC, b.scheduled_time ASC, b.id DESC`,
      params
    );
    await this._attachBookingAddons(rows);
    return rows;
  },

  async workerJobDetail(workerId, bookingId) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      `SELECT b.*,
              CASE
                WHEN b.customer_name IS NOT NULL AND LOWER(TRIM(b.customer_name)) != 'customer' AND TRIM(b.customer_name) != '' THEN b.customer_name
                WHEN c.first_name IS NOT NULL OR c.last_name IS NOT NULL THEN TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')))
                WHEN u.username IS NOT NULL THEN u.username
                ELSE 'Customer'
              END AS customer_name,
              COALESCE(NULLIF(TRIM(b.customer_phone), ''), u.phone) AS customer_phone,
              COALESCE(NULLIF(TRIM(b.service_address), ''), 'Mogadishu') AS service_address
       FROM car_wash_bookings b
       LEFT JOIN customers c ON b.customer_id = c.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE b.id = ? AND b.worker_id = ?`,
      [bookingId, workerId]
    );
    const booking = rows[0];
    if (!booking) return null;
    await this._attachBookingAddons(booking);
    booking.status_history = await this.getStatusHistory(bookingId);
    return booking;
  },

  async workerStats(workerId) {
    await ensureCarWashSchema();
    const [[stats]] = await db.query(
      `SELECT
        SUM(status IN ('worker_assigned','washing','ready')) AS assigned,
        SUM(scheduled_date = CURDATE() AND status IN ('worker_assigned','washing','ready')) AS today,
        SUM(status = 'worker_assigned') AS pending,
        SUM(status IN ('washing','ready')) AS active,
        SUM(status = 'completed') AS completed
       FROM car_wash_bookings WHERE worker_id = ?`,
      [workerId]
    );
    return {
      assigned: Number(stats.assigned || 0),
      today: Number(stats.today || 0),
      pending: Number(stats.pending || 0),
      active: Number(stats.active || 0),
      completed: Number(stats.completed || 0),
    };
  },

  // Worker-driven status changes. Ownership is enforced (booking must belong to
  // this worker AND vendor). Workers can only advance a job along the wash
  // pipeline â€” never confirm, assign, reprice, or cancel.
  async workerTransition(workerId, vendorId, bookingId, action) {
    await ensureCarWashSchema();
    const WORKER_ACTIONS = ['accept', 'start', 'ready', 'complete'];
    if (!WORKER_ACTIONS.includes(action)) {
      return modelError('invalid_action', 'Unknown job action.');
    }
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT * FROM car_wash_bookings
         WHERE id = ? AND worker_id = ? AND vendor_id = ? FOR UPDATE`,
        [bookingId, workerId, vendorId]
      );
      const booking = rows[0];
      if (!booking) {
        await conn.rollback();
        return modelError('not_found', 'Job not found or not assigned to you.');
      }

      let nextStatus = booking.status;
      const fields = [];
      const params = [];

      if (action === 'accept') {
        if (!['worker_assigned', 'confirmed'].includes(booking.status)) {
          await conn.rollback();
          return modelError('illegal_transition', 'This job can no longer be accepted.');
        }
        nextStatus = 'worker_accepted';
        fields.push('status = ?', 'worker_accepted_at = NOW()');
        params.push('worker_accepted');
      } else if (action === 'decline') {
        if (!['worker_assigned', 'worker_accepted'].includes(booking.status)) {
          await conn.rollback();
          return modelError('illegal_transition', 'This job cannot be declined.');
        }
        nextStatus = 'confirmed';
        fields.push('status = ?', 'worker_id = NULL', 'worker_declined_at = NOW()');
        params.push('confirmed');

        // Free the worker back to available
        await conn.query(
          `UPDATE car_wash_workers SET status = 'available', availability_status = 'available'
           WHERE id = ? AND vendor_id = ?`,
          [workerId, vendorId]
        );
      } else if (action === 'start') {
        if (!['worker_assigned', 'worker_accepted'].includes(booking.status)) {
          await conn.rollback();
          return modelError('illegal_transition', 'Only an assigned or accepted job can be started.');
        }
        nextStatus = 'washing';
        fields.push('status = ?', 'started_at = NOW()');
        params.push('washing');
      } else if (action === 'ready') {
        if (booking.status !== 'washing') {
          await conn.rollback();
          return modelError('illegal_transition', 'Only a washing job can be marked ready.');
        }
        nextStatus = 'ready';
        fields.push('status = ?', 'ready_at = NOW()');
        params.push('ready');
      } else if (action === 'complete') {
        if (!['washing', 'ready'].includes(booking.status)) {
          await conn.rollback();
          return modelError('illegal_transition', 'Only a job in progress or ready can be completed.');
        }
        nextStatus = 'completed';
        fields.push('status = ?', 'completed_at = NOW()');
        params.push('completed');
      }

      params.push(bookingId, workerId, booking.status);
      const [result] = await conn.query(
        `UPDATE car_wash_bookings SET ${fields.join(', ')}
         WHERE id = ? AND worker_id = ? AND status = ?`,
        params
      );
      if (result.affectedRows !== 1) {
        throw new Error('Job changed concurrently. Please retry.');
      }

      // Free the worker once the job is done & update completed_jobs count
      if (nextStatus === 'completed') {
        await conn.query(
          `UPDATE car_wash_workers SET status = 'available', availability_status = 'available'
           WHERE id = ? AND vendor_id = ?`,
          [workerId, vendorId]
        );
      }

      if (nextStatus !== booking.status) {
        await conn.query(
          `INSERT INTO car_wash_booking_status_history
             (booking_id, from_status, status, actor_type, actor_id)
           VALUES (?, ?, ?, 'worker', ?)`,
          [bookingId, booking.status, nextStatus, workerId]
        );
      }
      await conn.commit();

      const [updated] = await db.query('SELECT * FROM car_wash_bookings WHERE id = ?', [bookingId]);
      await this._attachBookingAddons(updated[0]);
      return { booking: updated[0] };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async changeWorkerPassword(workerId, currentPassword, newPassword) {
    await ensureCarWashSchema();
    const bcrypt = require('bcryptjs');
    const [rows] = await db.query('SELECT * FROM car_wash_workers WHERE id = ?', [workerId]);
    const worker = rows[0];
    if (!worker) return modelError('not_found', 'Worker not found.');
    const next = String(newPassword || '');
    if (next.length < 6) {
      return modelError('weak_password', 'New password must be at least 6 characters.');
    }
    const ok = worker.password_hash &&
      (await bcrypt.compare(String(currentPassword || ''), worker.password_hash));
    if (!ok) return modelError('bad_current', 'Your current password is incorrect.');
    const hash = await bcrypt.hash(next, 12);
    await db.query(
      `UPDATE car_wash_workers
       SET password_hash = ?, must_change_password = 0, password_changed_at = NOW()
       WHERE id = ?`,
      [hash, workerId]
    );
    return { success: true };
  },

  // Vendor generates a fresh temporary password for a worker (forces a change on
  // next login). Returns the plaintext once so the vendor can hand it over.
  async resetWorkerPassword(vendorId, id) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      'SELECT id, username, email FROM car_wash_workers WHERE id = ? AND vendor_id = ?',
      [id, vendorId]
    );
    const worker = rows[0];
    if (!worker) return { error: 'not_found' };
    if (!worker.username && !worker.email) {
      return { error: 'no_login', message: 'This worker has no login account. Add a username first.' };
    }
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const hash = await bcrypt.hash(tempPassword, 12);
    await db.query(
      `UPDATE car_wash_workers
       SET password_hash = ?, must_change_password = 1, login_enabled = 1
       WHERE id = ? AND vendor_id = ?`,
      [hash, id, vendorId]
    );
    return { tempPassword };
  },

  async setWorkerLoginAccess(vendorId, id, enabled) {
    await ensureCarWashSchema();
    const [result] = await db.query(
      'UPDATE car_wash_workers SET login_enabled = ? WHERE id = ? AND vendor_id = ?',
      [enabled ? 1 : 0, id, vendorId]
    );
    if (result.affectedRows !== 1) return { error: 'not_found' };
    return { login_enabled: enabled ? 1 : 0 };
  },

  async checkWorkerSlotAvailability({ vendor_id, service_id, scheduled_date, scheduled_time, excludeBookingId = null }) {
    await ensureCarWashSchema();

    // 1. Get vendor's active & online/available workers
    const [workers] = await db.query(
      `SELECT id, name, skills, is_active, is_online, availability_status
       FROM car_wash_workers
       WHERE vendor_id = ? AND is_active = 1 AND (is_online = 1 OR availability_status <> 'offline')`,
      [vendor_id]
    );

    // Resolve service name if service_id provided to check skill match
    let serviceName = null;
    if (service_id) {
      const [[svc]] = await db.query('SELECT name FROM car_wash_services WHERE id = ?', [service_id]);
      if (svc) serviceName = svc.name;
    }

    const workerDebug = {
      totalFetched: workers.length,
      serviceName: null,
      skillMatched: 0,
      onlineEligible: workers.length,
      unavailableWorkerIds: [],
      sampleWorkers: [],
    };

    const skilledWorkers = workers.filter(w => {
      if (!serviceName || !w.skills) return true;
      try {
        const parsed = typeof w.skills === 'string' ? JSON.parse(w.skills) : w.skills;
        if (!Array.isArray(parsed) || parsed.length === 0) return true;
        const matched = parsed.some(s => String(s).toLowerCase().includes(serviceName.toLowerCase()) || serviceName.toLowerCase().includes(String(s).toLowerCase()));
        return matched;
      } catch (_) {
        return true;
      }
    });
    workerDebug.serviceName = serviceName;
    workerDebug.skillMatched = skilledWorkers.length;
    workerDebug.sampleWorkers = workers.slice(0, 5).map((w) => ({
      id: w.id,
      name: w.name,
      is_active: Number(w.is_active) === 1,
      is_online: Number(w.is_online) === 1,
      availability_status: w.availability_status,
      skills: w.skills,
    }));

    const totalWorkers = skilledWorkers.length;

    // 2. Count active paid/confirmed bookings for this vendor at the scheduled date & time
    const params = [vendor_id, scheduled_date, scheduled_time];
    let excludeSql = '';
    if (excludeBookingId) {
      excludeSql = ' AND id <> ?';
      params.push(excludeBookingId);
    }

    const [[existingCountRow]] = await db.query(
      `SELECT COUNT(*) AS count FROM car_wash_bookings
       WHERE vendor_id = ? AND scheduled_date = ? AND scheduled_time = ?
         AND status IN ('confirmed', 'worker_assigned', 'worker_accepted', 'washing', 'ready', 'completed')
         AND payment_status = 'paid'` + excludeSql,
      params
    );

    const activeBookingsCount = Number(existingCountRow.count || 0);
    const availableSlots = Math.max(0, totalWorkers - activeBookingsCount);
    const isAvailable = availableSlots > 0 && totalWorkers > 0;

    let suggestedSlots = [];
    if (!isAvailable) {
      const timeCandidates = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
      const currentHr = parseInt(String(scheduled_time).split(':')[0], 10) || 0;

      for (const t of timeCandidates) {
        const hr = parseInt(t.split(':')[0], 10);
        if (hr === currentHr) continue;

        const [[sCount]] = await db.query(
          `SELECT COUNT(*) AS count FROM car_wash_bookings
           WHERE vendor_id = ? AND scheduled_date = ? AND scheduled_time = ?
             AND status IN ('confirmed', 'worker_assigned', 'worker_accepted', 'washing', 'ready', 'completed')
             AND payment_status = 'paid'`,
          [vendor_id, scheduled_date, t]
        );
        if (Number(sCount.count || 0) < totalWorkers) {
          const ampm = hr >= 12 ? 'PM' : 'AM';
          const hr12 = hr % 12 || 12;
          suggestedSlots.push(`${hr12}:00 ${ampm}`);
          if (suggestedSlots.length >= 3) break;
        }
      }
    }

    return {
      available: isAvailable,
      availableSlots,
      totalWorkers,
      activeBookingsCount,
      suggestedSlots,
      debug: workerDebug,
    };
  },

  // â”€â”€â”€ Bookings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async listBookings(vendorId, { status, date, search } = {}) {
    await ensureCarWashSchema();
    const clauses = ['b.vendor_id = ?'];
    const params = [vendorId];

    if (status && status !== 'all') {
      if (status === 'pending') {
        clauses.push("b.status IN ('pending', 'payment_failed')");
      } else {
        clauses.push('b.status = ?');
        params.push(status);
      }
    }
    if (date) { clauses.push('b.scheduled_date = ?'); params.push(date); }
    if (search) {
      clauses.push('(b.customer_name LIKE ? OR b.vehicle_plate LIKE ? OR b.booking_reference LIKE ? OR b.booking_code LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    const [rows] = await db.query(
      `SELECT b.*, w.name AS worker_name
       FROM car_wash_bookings b
       LEFT JOIN car_wash_workers w ON w.id = b.worker_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY b.created_at DESC
       LIMIT 500`,
      params
    );
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const [addons, history] = await Promise.all([
      db.query(
        `SELECT booking_id, name, price FROM car_wash_booking_addons WHERE booking_id IN (${ids.map(() => '?').join(',')})`,
        ids
      ).then(([result]) => result),
      db.query(
        `SELECT booking_id, status, from_status, actor_type, reason, created_at
         FROM car_wash_booking_status_history
         WHERE booking_id IN (${ids.map(() => '?').join(',')})
         ORDER BY created_at ASC, id ASC`,
        ids
      ).then(([result]) => result),
    ]);
    const byBooking = new Map();
    addons.forEach((a) => {
      if (!byBooking.has(a.booking_id)) byBooking.set(a.booking_id, []);
      byBooking.get(a.booking_id).push({ name: a.name, price: toNum(a.price) });
    });
    const historyByBooking = new Map();
    history.forEach((event) => {
      if (!historyByBooking.has(event.booking_id)) historyByBooking.set(event.booking_id, []);
      historyByBooking.get(event.booking_id).push({
        status: event.status,
        from_status: event.from_status,
        actor_type: event.actor_type,
        reason: event.reason,
        created_at: event.created_at,
      });
    });
    return rows.map((r) => ({
      ...r,
      addons: byBooking.get(r.id) || [],
      status_history: historyByBooking.get(r.id) || [],
    }));
  },

  async createLegacyBooking(vendorId, data) {
    await ensureCarWashSchema();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Re-price from DB â€” never trust client-supplied totals.
      let service = null;
      if (data.service_id) {
        const [s] = await conn.query(
          'SELECT * FROM car_wash_services WHERE id = ? AND vendor_id = ?', [data.service_id, vendorId]);
        service = s[0] || null;
      }
      let vehicle = null;
      if (data.vehicle_type_id) {
        const [v] = await conn.query(
          'SELECT * FROM car_wash_vehicle_types WHERE id = ? AND vendor_id = ?', [data.vehicle_type_id, vendorId]);
        vehicle = v[0] || null;
      }
      const basePrice = service ? toNum(service.base_price) : toNum(data.base_price);
      const vehiclePrice = vehicle ? toNum(vehicle.extra_price) : 0;

      const addonIds = Array.isArray(data.addon_ids) ? data.addon_ids.filter(Boolean) : [];
      let addonRows = [];
      if (addonIds.length > 0) {
        const [a] = await conn.query(
          `SELECT * FROM car_wash_addons WHERE vendor_id = ? AND id IN (${addonIds.map(() => '?').join(',')})`,
          [vendorId, ...addonIds]
        );
        addonRows = a;
      }
      const addonsPrice = addonRows.reduce((sum, a) => sum + toNum(a.price), 0);
      const discount = toNum(data.discount);
      const total = Math.max(0, basePrice + vehiclePrice + addonsPrice - discount);
      const duration = (service ? Number(service.estimated_minutes || 0) : 0) +
        addonRows.reduce((sum, a) => sum + Number(a.duration_minutes || 0), 0);

      const bookingCode = `CW-${vendorId}-${Date.now().toString(36).toUpperCase()}`;

      const [res] = await conn.query(
        `INSERT INTO car_wash_bookings
           (vendor_id, booking_code, customer_id, customer_name, customer_phone,
            service_id, service_name, vehicle_type_id, vehicle_type_name, vehicle_plate,
            worker_id, scheduled_date, scheduled_time, status,
            base_price, vehicle_price, addons_price, discount, total_price, payment_status, notes, duration)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vendorId, bookingCode, data.customer_id || null,
          data.customer_name || 'Walk-in customer', data.customer_phone || null,
          service?.id || null, service?.name || data.service_name || null,
          vehicle?.id || null, vehicle?.name || data.vehicle_type_name || null,
          data.vehicle_plate || null,
          data.worker_id || null, data.scheduled_date || null, data.scheduled_time || null,
          data.worker_id ? 'worker_assigned' : 'pending',
          basePrice, vehiclePrice, addonsPrice, discount, total,
          ['unpaid', 'paid', 'refunded'].includes(data.payment_status) ? data.payment_status : 'unpaid',
          data.notes || null,
          duration,
        ]
      );
      const bookingId = res.insertId;

      for (const a of addonRows) {
        await conn.query(
          'INSERT INTO car_wash_booking_addons (booking_id, addon_id, name, price) VALUES (?, ?, ?, ?)',
          [bookingId, a.id, a.name, toNum(a.price)]
        );
      }
      if (data.worker_id) {
        await conn.query(
          'UPDATE car_wash_workers SET status = ?, availability_status = ? WHERE id = ? AND vendor_id = ?', ['busy', 'busy', data.worker_id, vendorId]);
      }

      await conn.commit();
      const [rows] = await db.query('SELECT * FROM car_wash_bookings WHERE id = ?', [bookingId]);
      return rows[0];
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async transitionLegacyBooking(vendorId, id, nextStatus, { workerId } = {}) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      'SELECT * FROM car_wash_bookings WHERE id = ? AND vendor_id = ?', [id, vendorId]);
    const booking = rows[0];
    if (!booking) return { error: 'not_found' };
    if (!this.canTransition(booking.status, nextStatus)) {
      return { error: 'illegal_transition', from: booking.status, to: nextStatus };
    }

    const fields = ['status = ?'];
    const params = [nextStatus];

    // Assigning a worker as part of confirmâ†’worker_assigned
    if (nextStatus === 'worker_assigned' && workerId) {
      fields.push('worker_id = ?');
      params.push(workerId);
      await db.query('UPDATE car_wash_workers SET status = ?, availability_status = ? WHERE id = ? AND vendor_id = ?',
        ['busy', 'busy', workerId, vendorId]);
    }
    if (nextStatus === 'washing') { fields.push('started_at = NOW()'); }
    if (nextStatus === 'completed') {
      fields.push('completed_at = NOW()');
      if (booking.worker_id) {
        await db.query('UPDATE car_wash_workers SET status = ?, availability_status = ? WHERE id = ? AND vendor_id = ?',
          ['available', 'available', booking.worker_id, vendorId]);
      }
    }
    if (nextStatus === 'cancelled' && booking.worker_id) {
      await db.query('UPDATE car_wash_workers SET status = ?, availability_status = ? WHERE id = ? AND vendor_id = ?',
        ['available', 'available', booking.worker_id, vendorId]);
    }

    params.push(id, vendorId);
    await db.query(`UPDATE car_wash_bookings SET ${fields.join(', ')} WHERE id = ? AND vendor_id = ?`, params);
    const [updated] = await db.query('SELECT * FROM car_wash_bookings WHERE id = ?', [id]);
    return { booking: updated[0] };
  },

  // â”€â”€â”€ Dashboard stats + charts (all from real booking data) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async createBooking(vendorId, data) {
    await ensureCarWashSchema();

    // The requested slot is client-supplied, so it is validated against the
    // SERVER clock here â€” in the model, so every path (customer app, vendor
    // walk-in booking, API) is covered. A tampered device clock cannot book a
    // slot in the past. A small grace window absorbs request latency.
    if (data.scheduled_date) {
      const check = validateScheduling(data.scheduled_date, data.scheduled_time, {
        graceMinutes: 2,
        maxDaysAhead: 365,
      });
      if (!check.valid) {
        throw validationError({ [check.field]: check.error });
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [serviceRows] = await conn.query(
        `SELECT * FROM car_wash_services
         WHERE id = ? AND vendor_id = ? AND status = 'active' AND is_available = 1`,
        [data.service_id, vendorId]
      );
      const service = serviceRows[0] || null;
      if (!service) {
        const error = new Error('Select an active and available car service.');
        error.statusCode = 400;
        throw error;
      }

      let vehicle = null;
      if (data.vehicle_type_id) {
        const [vehicleRows] = await conn.query(
          'SELECT * FROM car_wash_vehicle_types WHERE id = ? AND vendor_id = ?',
          [data.vehicle_type_id, vendorId]
        );
        vehicle = vehicleRows[0] || null;
        if (!vehicle) {
          const error = new Error('The selected vehicle type does not belong to this vendor.');
          error.statusCode = 400;
          throw error;
        }
      }

      const addonIds = Array.isArray(data.addon_ids)
        ? [...new Set(data.addon_ids.map(Number).filter(Number.isInteger))]
        : [];
      let addonRows = [];
      if (addonIds.length > 0) {
        const [rows] = await conn.query(
          `SELECT * FROM car_wash_addons
           WHERE vendor_id = ? AND is_available = 1
             AND id IN (${addonIds.map(() => '?').join(',')})`,
          [vendorId, ...addonIds]
        );
        addonRows = rows;
        if (addonRows.length !== addonIds.length) {
          const error = new Error('One or more selected add-ons are unavailable.');
          error.statusCode = 400;
          throw error;
        }
      }

      const basePrice = toNum(service.base_price);
      const vehiclePrice = vehicle ? toNum(vehicle.extra_price) : 0;
      const addonsPrice = addonRows.reduce((sum, addon) => sum + toNum(addon.price), 0);
      const discount = toNum(data.discount);
      const total = Math.max(0, basePrice + vehiclePrice + addonsPrice - discount);
      const duration = Number(service.estimated_minutes || 0) +
        addonRows.reduce((sum, addon) => sum + Number(addon.duration_minutes || 0), 0);
      const bookingReference = await nextBookingReference(conn);

      const [result] = await conn.query(
        `INSERT INTO car_wash_bookings
           (vendor_id, booking_code, booking_reference, customer_id, customer_name, customer_phone,
            service_id, service_name, vehicle_type_id, vehicle_type_name,
            vehicle_brand, vehicle_model, vehicle_color, vehicle_plate, service_address,
            scheduled_date, scheduled_time, status, submitted_at,
            base_price, vehicle_price, addons_price, discount, total_price, payment_status, notes, duration)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vendorId,
          bookingReference,
          bookingReference,
          data.customer_id || null,
          String(data.customer_name || 'Walk-in customer').trim(),
          data.customer_phone || null,
          service.id,
          service.name,
          vehicle?.id || null,
          vehicle?.name || String(data.vehicle_type_name || '').trim() || null,
          String(data.vehicle_brand || '').trim() || null,
          String(data.vehicle_model || '').trim() || null,
          String(data.vehicle_color || '').trim() || null,
          String(data.vehicle_plate || '').trim().toUpperCase() || null,
          String(data.service_address || '').trim() || null,
          data.scheduled_date || null,
          data.scheduled_time || null,
          basePrice,
          vehiclePrice,
          addonsPrice,
          discount,
          total,
          ['unpaid', 'paid', 'refunded'].includes(data.payment_status) ? data.payment_status : 'unpaid',
          String(data.notes || '').trim() || null,
          duration,
        ]
      );
      const bookingId = result.insertId;

      for (const addon of addonRows) {
        await conn.query(
          'INSERT INTO car_wash_booking_addons (booking_id, addon_id, name, price) VALUES (?, ?, ?, ?)',
          [bookingId, addon.id, addon.name, toNum(addon.price)]
        );
      }
      await conn.query(
        `INSERT INTO car_wash_booking_status_history
           (booking_id, from_status, status, actor_type, actor_id)
         VALUES (?, NULL, 'pending', 'vendor', ?)`,
        [bookingId, vendorId]
      );
      await conn.commit();

      const [rows] = await db.query(
        `SELECT b.*, w.name AS worker_name
         FROM car_wash_bookings b
         LEFT JOIN car_wash_workers w ON w.id = b.worker_id
         WHERE b.id = ? AND b.vendor_id = ?`,
        [bookingId, vendorId]
      );
      return rows[0];
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async transitionBooking(vendorId, id, nextStatus, { workerId, reason, actorId } = {}) {
    await ensureCarWashSchema();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        'SELECT * FROM car_wash_bookings WHERE id = ? AND vendor_id = ? FOR UPDATE',
        [id, vendorId]
      );
      const booking = rows[0];
      if (!booking) {
        await conn.rollback();
        return modelError('not_found', 'Booking not found.');
      }
      if (!this.canTransition(booking.status, nextStatus)) {
        await conn.rollback();
        return modelError('illegal_transition', 'Illegal booking status transition.', {
          from: booking.status,
          to: nextStatus,
        });
      }
      if (nextStatus === 'confirmed' && booking.payment_status !== 'paid') {
        await conn.rollback();
        return modelError('payment_required', 'The booking must be paid before it can be confirmed.');
      }
      if (nextStatus === 'washing' && !booking.worker_id) {
        await conn.rollback();
        return modelError('worker_required', 'Assign a worker before starting the wash.');
      }
      if (nextStatus === 'completed' && booking.payment_status !== 'paid') {
        await conn.rollback();
        return modelError('payment_required', 'An unpaid booking cannot be completed.');
      }

      const safeReason = String(reason || '').trim().slice(0, 500) || null;
      const fields = ['status = ?', 'status_reason = ?'];
      const params = [nextStatus, ['cancelled', 'rejected'].includes(nextStatus) ? safeReason : null];
      let assignedWorkerId = booking.worker_id;

      if (nextStatus === 'worker_assigned') {
        const parsedWorkerId = Number.parseInt(workerId, 10);
        if (!Number.isInteger(parsedWorkerId)) {
          await conn.rollback();
          return modelError('worker_required', 'Choose an available worker.');
        }
        const [workerRows] = await conn.query(
          `SELECT id, status FROM car_wash_workers
           WHERE id = ? AND vendor_id = ? AND is_active = 1 FOR UPDATE`,
          [parsedWorkerId, vendorId]
        );
        const worker = workerRows[0];
        if (!worker) {
          await conn.rollback();
          return modelError('worker_not_found', 'Worker not found for this vendor.');
        }
        if (worker.status !== 'available') {
          await conn.rollback();
          return modelError('worker_unavailable', 'That worker is not currently available.');
        }
        // Defence in depth: even if the status flag drifted, never double-book a
        // worker who is still attached to another live job.
        const [[conflict]] = await conn.query(
          `SELECT COUNT(*) AS n FROM car_wash_bookings
           WHERE worker_id = ? AND vendor_id = ? AND id <> ?
             AND status IN (${OCCUPYING_STATUSES.map(() => '?').join(',')})`,
          [parsedWorkerId, vendorId, id, ...OCCUPYING_STATUSES]
        );
        if (Number(conflict.n) > 0) {
          await conn.rollback();
          return modelError(
            'worker_unavailable',
            'That worker is already assigned to another active booking.'
          );
        }
        assignedWorkerId = parsedWorkerId;
        fields.push('worker_id = ?');
        params.push(parsedWorkerId);
      }

      const timestampColumn = STATUS_TIMESTAMP_COLUMNS[nextStatus];
      if (timestampColumn) fields.push(`${timestampColumn} = NOW()`);
      params.push(id, vendorId, booking.status);
      const [updateResult] = await conn.query(
        `UPDATE car_wash_bookings SET ${fields.join(', ')}
         WHERE id = ? AND vendor_id = ? AND status = ?`,
        params
      );
      if (updateResult.affectedRows !== 1) {
        throw new Error('Booking status changed concurrently. Please retry.');
      }

      if (nextStatus === 'worker_assigned') {
        await conn.query(
          `UPDATE car_wash_workers SET status = 'busy', availability_status = 'busy'
           WHERE id = ? AND vendor_id = ?`,
          [assignedWorkerId, vendorId]
        );
      }
      if (['completed', 'cancelled', 'rejected'].includes(nextStatus) && booking.worker_id) {
        await conn.query(
          `UPDATE car_wash_workers SET status = 'available', availability_status = 'available'
           WHERE id = ? AND vendor_id = ?`,
          [booking.worker_id, vendorId]
        );
      }

      await conn.query(
        `INSERT INTO car_wash_booking_status_history
           (booking_id, from_status, status, actor_type, actor_id, reason)
         VALUES (?, ?, ?, 'vendor', ?, ?)`,
        [booking.id, booking.status, nextStatus, actorId || vendorId, safeReason]
      );
      await conn.commit();

      const [updated] = await db.query(
        `SELECT b.*, w.name AS worker_name, w.phone AS worker_phone
         FROM car_wash_bookings b
         LEFT JOIN car_wash_workers w ON w.id = b.worker_id
         WHERE b.id = ? AND b.vendor_id = ?`,
        [id, vendorId]
      );
      return { booking: updated[0] };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async recordPaymentResult(bookingId, vendorId, { success, transactionRef = null, reason = null } = {}) {
    await ensureCarWashSchema();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        'SELECT * FROM car_wash_bookings WHERE id = ? AND vendor_id = ? FOR UPDATE',
        [bookingId, vendorId]
      );
      const booking = rows[0];
      if (!booking) {
        await conn.rollback();
        return modelError('not_found', 'Booking not found.');
      }

      if (success) {
        if (['cancelled', 'rejected', 'completed'].includes(booking.status)) {
          await conn.rollback();
          return modelError('illegal_transition', `A ${booking.status} booking cannot be paid.`);
        }
        const nextStatus = booking.status === 'payment_failed' ? 'pending' : booking.status;
        await conn.query(
          `UPDATE car_wash_bookings
           SET payment_status = 'paid', payment_ref = ?, paid_at = COALESCE(paid_at, NOW()),
               status = ?, payment_failed_at = NULL, status_reason = NULL
           WHERE id = ? AND vendor_id = ?`,
          [transactionRef, nextStatus, bookingId, vendorId]
        );
        if (nextStatus !== booking.status) {
          await conn.query(
            `INSERT INTO car_wash_booking_status_history
               (booking_id, from_status, status, actor_type, reason)
             VALUES (?, ?, ?, 'system', 'Payment completed; awaiting vendor confirmation')`,
            [bookingId, booking.status, nextStatus]
          );
        }
      } else if (booking.payment_status !== 'paid' && ['pending', 'payment_failed'].includes(booking.status)) {
        const safeReason = String(reason || 'Payment failed').slice(0, 500);
        await conn.query(
          `UPDATE car_wash_bookings
           SET payment_status = 'unpaid', status = 'payment_failed', payment_failed_at = NOW(), status_reason = ?
           WHERE id = ? AND vendor_id = ?`,
          [safeReason, bookingId, vendorId]
        );
        if (booking.status !== 'payment_failed') {
          await conn.query(
            `INSERT INTO car_wash_booking_status_history
               (booking_id, from_status, status, actor_type, reason)
             VALUES (?, ?, 'payment_failed', 'system', ?)`,
            [bookingId, booking.status, safeReason]
          );
        }
      }

      await conn.commit();
      const [updated] = await db.query(
        `SELECT b.*, w.name AS worker_name
         FROM car_wash_bookings b
         LEFT JOIN car_wash_workers w ON w.id = b.worker_id
         WHERE b.id = ? AND b.vendor_id = ?`,
        [bookingId, vendorId]
      );
      return { booking: updated[0] };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async cancelCustomerBooking(customerId, bookingIdentifier, reason = null) {
    await ensureCarWashSchema();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const numericId = /^\d+$/.test(String(bookingIdentifier)) ? Number(bookingIdentifier) : -1;
      const [rows] = await conn.query(
        `SELECT * FROM car_wash_bookings
         WHERE customer_id = ? AND (id = ? OR booking_reference = ?) FOR UPDATE`,
        [customerId, numericId, String(bookingIdentifier)]
      );
      const booking = rows[0];
      if (!booking) {
        await conn.rollback();
        return modelError('not_found', 'Booking not found.');
      }
      if (!CUSTOMER_CANCELLABLE_STATUSES.includes(booking.status)) {
        await conn.rollback();
        return modelError('illegal_transition', `A "${booking.status}" booking can no longer be cancelled.`, {
          from: booking.status,
          to: 'cancelled',
        });
      }
      const safeReason = String(reason || '').trim().slice(0, 500) || null;
      await conn.query(
        `UPDATE car_wash_bookings
         SET status = 'cancelled', cancelled_at = NOW(), status_reason = ?
         WHERE id = ? AND customer_id = ? AND status = ?`,
        [safeReason, booking.id, customerId, booking.status]
      );
      if (booking.worker_id) {
        await conn.query(
          `UPDATE car_wash_workers SET status = 'available', availability_status = 'available'
           WHERE id = ? AND vendor_id = ?`,
          [booking.worker_id, booking.vendor_id]
        );
      }
      await conn.query(
        `INSERT INTO car_wash_booking_status_history
           (booking_id, from_status, status, actor_type, actor_id, reason)
         VALUES (?, ?, 'cancelled', 'customer', ?, ?)`,
        [booking.id, booking.status, customerId, safeReason]
      );
      await conn.commit();

      const [updated] = await db.query(
        `SELECT b.*, w.name AS worker_name
         FROM car_wash_bookings b
         LEFT JOIN car_wash_workers w ON w.id = b.worker_id
         WHERE b.id = ? AND b.customer_id = ?`,
        [booking.id, customerId]
      );
      return { booking: updated[0] };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async getStatusHistory(bookingId) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      `SELECT status, from_status, actor_type, reason, created_at
       FROM car_wash_booking_status_history
       WHERE booking_id = ? ORDER BY created_at ASC, id ASC`,
      [bookingId]
    );
    return rows;
  },

  async getDashboardStats(vendorId) {
    await ensureCarWashSchema();

    const [[counts]] = await db.query(
      `SELECT
         COUNT(*) AS total_bookings,
         SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_bookings,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_bookings,
         SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_bookings,
         SUM(CASE WHEN status IN ('worker_assigned','washing') THEN 1 ELSE 0 END) AS in_progress_jobs,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_jobs,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_jobs,
         SUM(CASE WHEN status = 'payment_failed' THEN 1 ELSE 0 END) AS payment_failed_jobs,
         COALESCE(AVG(CASE WHEN status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
                      THEN TIMESTAMPDIFF(MINUTE, started_at, completed_at) END), 0) AS avg_service_minutes,
         COALESCE(AVG(CASE WHEN rating IS NOT NULL THEN rating END), 0) AS satisfaction_rating
       FROM car_wash_bookings WHERE vendor_id = ?`,
      [vendorId]
    );

    const [[revenue]] = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(completed_at) = CURDATE() THEN total_price ELSE 0 END), 0) AS revenue_today,
         COALESCE(SUM(CASE WHEN completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN total_price ELSE 0 END), 0) AS revenue_week,
         COALESCE(SUM(CASE WHEN completed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN total_price ELSE 0 END), 0) AS revenue_month,
         COALESCE(SUM(total_price), 0) AS revenue_total
       FROM car_wash_bookings
       WHERE vendor_id = ? AND status = 'completed' AND payment_status = 'paid'`,
      [vendorId]
    );

    const [[workers]] = await db.query(
      `SELECT
         COUNT(*) AS active_workers,
         SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_workers,
         SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) AS busy_workers
       FROM car_wash_workers WHERE vendor_id = ? AND is_active = 1`,
      [vendorId]
    );

    const [[services]] = await db.query(
      'SELECT COUNT(*) AS total_services FROM car_wash_services WHERE vendor_id = ?', [vendorId]);

    return {
      total_bookings: Number(counts.total_bookings || 0),
      today_bookings: Number(counts.today_bookings || 0),
      pending_bookings: Number(counts.pending_bookings || 0),
      confirmed_bookings: Number(counts.confirmed_bookings || 0),
      in_progress_jobs: Number(counts.in_progress_jobs || 0),
      completed_jobs: Number(counts.completed_jobs || 0),
      cancelled_jobs: Number(counts.cancelled_jobs || 0),
      rejected_jobs: Number(counts.rejected_jobs || 0),
      payment_failed_jobs: Number(counts.payment_failed_jobs || 0),
      avg_service_minutes: Math.round(Number(counts.avg_service_minutes || 0)),
      satisfaction_rating: Number(Number(counts.satisfaction_rating || 0).toFixed(2)),
      revenue_today: toNum(revenue.revenue_today),
      revenue_week: toNum(revenue.revenue_week),
      revenue_month: toNum(revenue.revenue_month),
      revenue_total: toNum(revenue.revenue_total),
      active_workers: Number(workers.active_workers || 0),
      available_workers: Number(workers.available_workers || 0),
      busy_workers: Number(workers.busy_workers || 0),
      total_services: Number(services.total_services || 0),
    };
  },

  async getCharts(vendorId) {
    await ensureCarWashSchema();

    // Daily bookings + revenue (last 7 days)
    const [daily] = await db.query(
      `SELECT DATE(created_at) AS day,
              COUNT(*) AS bookings,
              COALESCE(SUM(CASE WHEN status = 'completed' AND payment_status = 'paid' THEN total_price ELSE 0 END), 0) AS revenue
       FROM car_wash_bookings
       WHERE vendor_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(created_at) ORDER BY day ASC`,
      [vendorId]
    );

    // Service popularity
    const [servicePopularity] = await db.query(
      `SELECT COALESCE(service_name, 'Unspecified') AS name, COUNT(*) AS count
       FROM car_wash_bookings WHERE vendor_id = ?
       GROUP BY service_name ORDER BY count DESC LIMIT 8`,
      [vendorId]
    );

    // Worker performance (completed jobs)
    const [workerPerformance] = await db.query(
      `SELECT w.name, COUNT(b.id) AS completed
       FROM car_wash_workers w
       LEFT JOIN car_wash_bookings b ON b.worker_id = w.id AND b.status = 'completed'
       WHERE w.vendor_id = ? AND w.is_active = 1
       GROUP BY w.id ORDER BY completed DESC LIMIT 8`,
      [vendorId]
    );

    // Status distribution
    const [statusDistribution] = await db.query(
      `SELECT status, COUNT(*) AS count FROM car_wash_bookings WHERE vendor_id = ? GROUP BY status`,
      [vendorId]
    );

    return {
      daily: daily.map((d) => ({ day: d.day, bookings: Number(d.bookings), revenue: toNum(d.revenue) })),
      service_popularity: servicePopularity.map((s) => ({ name: s.name, count: Number(s.count) })),
      worker_performance: workerPerformance.map((w) => ({ name: w.name, completed: Number(w.completed) })),
      status_distribution: statusDistribution.map((s) => ({ status: s.status, count: Number(s.count) })),
    };
  },

  async recentBookings(vendorId, limit = 8) {
    await ensureCarWashSchema();
    const [rows] = await db.query(
      `SELECT b.id, b.booking_reference, b.booking_code, b.customer_name, b.service_name, b.vehicle_plate,
              b.status, b.total_price, b.payment_status, b.created_at, w.name AS worker_name
       FROM car_wash_bookings b
       LEFT JOIN car_wash_workers w ON w.id = b.worker_id
       WHERE b.vendor_id = ?
       ORDER BY b.created_at DESC LIMIT ?`,
      [vendorId, limit]
    );
    return rows;
  },

  async rateBooking(bookingId, customerId, rating, comment) {
    await ensureCarWashSchema();
    const parsedRating = parseInt(rating, 10);
    if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
      throw validationError({ rating: 'Rating must be between 1 and 5 stars.' });
    }

    const [rows] = await db.query(
      'SELECT * FROM car_wash_bookings WHERE id = ? AND customer_id = ?',
      [bookingId, customerId]
    );
    const booking = rows[0];
    if (!booking) throw modelError('not_found', 'Booking not found or does not belong to you.');
    if (booking.status !== 'completed') {
      throw modelError('invalid_status', 'Only completed bookings can be rated.');
    }

    // Insert or update review
    await db.query(
      `INSERT INTO car_wash_reviews (booking_id, vendor_id, customer_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), updated_at = NOW()`,
      [bookingId, booking.vendor_id, customerId, parsedRating, comment || null]
    );

    // Update booking rating
    await db.query('UPDATE car_wash_bookings SET rating = ? WHERE id = ?', [parsedRating, bookingId]);

    // Recalculate worker rating if assigned
    if (booking.worker_id) {
      const [[wStats]] = await db.query(
        `SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM car_wash_reviews
         WHERE booking_id IN (SELECT id FROM car_wash_bookings WHERE worker_id = ?)`,
        [booking.worker_id]
      );
      const avgRating = Number(wStats.avg_rating || 0).toFixed(2);
      const totalRatings = parseInt(wStats.count || 0, 10);
      await db.query(
        'UPDATE car_wash_workers SET rating = ?, total_ratings = ? WHERE id = ?',
        [avgRating, totalRatings, booking.worker_id]
      );
    }

    const [updated] = await db.query('SELECT * FROM car_wash_bookings WHERE id = ?', [bookingId]);
    return updated[0];
  },
};

module.exports = CarWashModel;
