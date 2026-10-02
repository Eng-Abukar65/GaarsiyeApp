#!/usr/bin/env node
/**
 * Idempotent account seeder.
 *
 * Creates the one account of each role the system needs in order to be usable
 * on a fresh database (Railway, a colleague's laptop, a demo environment).
 *
 *   npm run seed
 *
 * Rules this script follows:
 *
 *  • Passwords are hashed with bcryptjs at the same cost the app's own
 *    registration paths use. No plaintext password is ever written to a column.
 *  • Existing accounts are LEFT ALONE. If an email already exists the script
 *    reports it and moves on; it never rewrites a live password by accident.
 *    Pass --reset-passwords to deliberately reset the seeded accounts only.
 *  • Passwords come from the environment. If a SEED_*_PASSWORD variable is
 *    absent a strong random one is generated and printed once, here, so it
 *    never has to live in a file.
 *
 * Environment variables (all optional):
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *   SEED_VENDOR_EMAIL / SEED_VENDOR_PASSWORD
 *   SEED_CUSTOMER_EMAIL / SEED_CUSTOMER_PASSWORD
 *   SEED_DRIVER_EMAIL / SEED_DRIVER_PASSWORD
 *   SEED_WORKER_EMAIL / SEED_WORKER_PASSWORD
 */
'use strict';

require('dotenv').config();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Matches the cost factor used by the app's own registration and
// password-reset paths, so a seeded account is indistinguishable from a real one.
const BCRYPT_ROUNDS = 12;

const RESET = process.argv.includes('--reset-passwords');

const generated = [];

/** Reads a password from the environment, or invents a strong one. */
function passwordFor(role) {
  const fromEnv = process.env[`SEED_${role.toUpperCase()}_PASSWORD`];
  if (fromEnv && fromEnv.length >= 8) return { value: fromEnv, generated: false };

  // 18 base64url characters: upper, lower and digits, comfortably above the
  // app's 8-character minimum.
  const value = `${crypto.randomBytes(12).toString('base64url')}A1!`;
  generated.push(role);
  return { value, generated: true };
}

function emailFor(role, fallback) {
  return String(process.env[`SEED_${role.toUpperCase()}_EMAIL`] || fallback).toLowerCase();
}

async function roleId(name) {
  const [rows] = await db.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [name]);
  if (rows.length > 0) return rows[0].id;
  const [result] = await db.query('INSERT INTO roles (name) VALUES (?)', [name]);
  console.log(`  + created role '${name}'`);
  return result.insertId;
}

/**
 * Creates a `users` row if the email is new. Returns { id, created }.
 * Never touches the password of an account it did not just create, unless
 * --reset-passwords was passed.
 */
async function upsertUser({ email, phone, username, roleName, passwordHash }) {
  const rid = await roleId(roleName);
  const [existing] = await db.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);

  if (existing.length > 0) {
    const id = existing[0].id;
    if (RESET) {
      await db.query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [
        passwordHash,
        id,
      ]);
    }
    return { id, created: false };
  }

  const [result] = await db.query(
    `INSERT INTO users (role_id, username, email, phone, password_hash, status, must_change_password)
     VALUES (?, ?, ?, ?, ?, 'active', 0)`,
    [rid, username, email, phone || null, passwordHash]
  );
  return { id: result.insertId, created: true };
}

async function seedAdmin() {
  const email = emailFor('admin', 'admin@deliveryapp.com');
  const password = passwordFor('admin');
  const hash = await bcrypt.hash(password.value, BCRYPT_ROUNDS);

  const user = await upsertUser({
    email,
    username: 'systemadmin',
    phone: null,
    roleName: 'admin',
    passwordHash: hash,
  });

  const [admin] = await db.query('SELECT id FROM admins WHERE user_id = ? LIMIT 1', [user.id]);
  if (admin.length === 0) {
    await db.query(
      'INSERT INTO admins (user_id, name, access_level) VALUES (?, ?, ?)',
      [user.id, 'System Admin', 'superadmin']
    );
  }

  return { role: 'Admin', email, password, created: user.created };
}

async function seedVendor() {
  const email = emailFor('vendor', 'vendor@deliveryapp.com');
  const password = passwordFor('vendor');
  const hash = await bcrypt.hash(password.value, BCRYPT_ROUNDS);

  const user = await upsertUser({
    email,
    username: 'demovendor',
    phone: '252610000001',
    roleName: 'vendor',
    passwordHash: hash,
  });

  const [existing] = await db.query('SELECT id FROM vendors WHERE LOWER(email) = ? LIMIT 1', [email]);

  let vendorId;
  let created = false;
  if (existing.length > 0) {
    vendorId = existing[0].id;
    if (RESET) {
      await db.query('UPDATE vendors SET password = ? WHERE id = ?', [hash, vendorId]);
    }
  } else {
    const [result] = await db.query(
      `INSERT INTO vendors
         (user_id, business_name, name, contact_name, business_type, email, password, phone,
          address, city, verification_status, status, is_open, is_online,
          subscription_plan, subscription_status)
       VALUES (?, ?, ?, ?, 'gas_depot', ?, ?, ?, ?, ?, 'verified', 'active', 1, 0, 'basic', 'active')`,
      [
        user.id,
        'Demo Gas Depot',
        'Demo Gas Depot',
        'Demo Vendor',
        email,
        hash,
        '252610000001',
        'Makka Al-Mukarama Road',
        'Mogadishu',
      ]
    );
    vendorId = result.insertId;
    created = true;
  }

  // Give the vendor both the Gas Depot and the Car Services module, so the
  // seeded environment can exercise deliveries AND car-wash bookings.
  const [types] = await db.query(
    "SELECT id, name FROM business_types WHERE name IN ('Gas Depot', 'Car Services')"
  );
  for (const type of types) {
    await db.query(
      `INSERT INTO vendor_business_types (vendor_id, business_type_id)
       SELECT ?, ? FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM vendor_business_types WHERE vendor_id = ? AND business_type_id = ?
       )`,
      [vendorId, type.id, vendorId, type.id]
    );
  }

  return { role: 'Vendor', email, password, created, vendorId };
}

async function seedCustomer() {
  const email = emailFor('customer', 'customer@deliveryapp.com');
  const password = passwordFor('customer');
  const hash = await bcrypt.hash(password.value, BCRYPT_ROUNDS);

  const user = await upsertUser({
    email,
    username: 'democustomer',
    phone: '252610000002',
    roleName: 'customer',
    passwordHash: hash,
  });

  const [existing] = await db.query('SELECT id FROM customers WHERE user_id = ? LIMIT 1', [user.id]);
  if (existing.length === 0) {
    await db.query(
      'INSERT INTO customers (user_id, first_name, last_name) VALUES (?, ?, ?)',
      [user.id, 'Demo', 'Customer']
    );
  }

  return { role: 'Customer', email, password, created: user.created };
}

async function seedDriver(vendorId) {
  const email = emailFor('driver', 'driver@deliveryapp.com');
  const password = passwordFor('driver');
  const hash = await bcrypt.hash(password.value, BCRYPT_ROUNDS);

  const user = await upsertUser({
    email,
    username: 'demodriver',
    phone: '252610000003',
    roleName: 'driver',
    passwordHash: hash,
  });

  const [existing] = await db.query('SELECT id FROM drivers WHERE user_id = ? LIMIT 1', [user.id]);
  if (existing.length === 0) {
    await db.query(
      `INSERT INTO drivers
         (user_id, vendor_id, first_name, last_name, vehicle_type, plate_number,
          license_number, verification_status, status, is_active, availability_status,
          account_status, personnel_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', 'offline', 1, 'available', 'approved', 'delivery_driver')`,
      [user.id, vendorId, 'Demo', 'Driver', 'Motorcycle', 'SOM-0001', 'DL-000001']
    );
  }

  return { role: 'Delivery Driver', email, password, created: user.created };
}

/**
 * Car wash workers are a separate identity from delivery drivers: they live in
 * their own table, authenticate against car_wash_workers.password_hash, and get
 * a `car_wash_worker` token that only unlocks the worker screens. A driver can
 * never be assigned a booking and a worker can never be assigned a delivery.
 */
async function seedWorker(vendorId) {
  const email = emailFor('worker', 'worker@deliveryapp.com');
  const password = passwordFor('worker');
  const hash = await bcrypt.hash(password.value, BCRYPT_ROUNDS);

  const [existing] = await db.query(
    'SELECT id FROM car_wash_workers WHERE LOWER(email) = ? LIMIT 1',
    [email]
  );

  if (existing.length > 0) {
    if (RESET) {
      await db.query('UPDATE car_wash_workers SET password_hash = ?, must_change_password = 0 WHERE id = ?', [
        hash,
        existing[0].id,
      ]);
    }
    return { role: 'Car Wash Worker', email, password, created: false };
  }

  await db.query(
    `INSERT INTO car_wash_workers
       (vendor_id, name, first_name, last_name, email, username, password_hash, phone,
        status, is_active, worker_status, availability_status, personnel_type,
        login_enabled, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', 1, 'active', 'available', 'car_wash_worker', 1, 0)`,
    [vendorId, 'Demo Worker', 'Demo', 'Worker', email, 'demoworker', hash, '252610000004']
  );

  return { role: 'Car Wash Worker', email, password, created: true };
}

(async () => {
  console.log(`\nSeeding accounts${RESET ? ' (passwords WILL be reset)' : ''}…\n`);

  const results = [];
  try {
    results.push(await seedAdmin());
    const vendor = await seedVendor();
    results.push(vendor);
    results.push(await seedCustomer());
    results.push(await seedDriver(vendor.vendorId));
    results.push(await seedWorker(vendor.vendorId));
  } catch (error) {
    console.error('\nSeeding failed:', error.message);
    await db.end();
    process.exit(1);
  }

  console.log('\n  Role                Email                            Status');
  console.log('  ' + '-'.repeat(78));
  for (const row of results) {
    const status = row.created ? 'created' : RESET ? 'existed (password reset)' : 'already existed (untouched)';
    console.log(`  ${row.role.padEnd(19)} ${row.email.padEnd(32)} ${status}`);
  }

  const printable = results.filter((row) => (row.created || RESET) && row.password.generated);
  if (printable.length > 0) {
    console.log('\n  Generated passwords — copy these now, they are not stored anywhere:\n');
    for (const row of printable) {
      console.log(`    ${row.role.padEnd(19)} ${row.password.value}`);
    }
    console.log('\n  Set SEED_<ROLE>_PASSWORD in the environment to choose them yourself instead.');
  }

  const untouched = results.filter((row) => !row.created && !RESET);
  if (untouched.length > 0) {
    console.log(
      '\n  Accounts that already existed were not modified. Run with --reset-passwords\n' +
      '  to overwrite the passwords of these seeded accounts specifically.'
    );
  }

  console.log('');
  await db.end();
  process.exit(0);
})();
