/**
 * Login diagnostic — run with:  node diagnose.js
 * Checks MySQL, the admin account, and the backend server, then prints
 * exactly what is wrong and how to fix it.
 */
require('dotenv').config();
const http = require('http');
const bcrypt = require('bcryptjs');

const ok = (m) => console.log('  [OK]   ' + m);
const bad = (m) => console.log('  [FAIL] ' + m);
const info = (m) => console.log('         ' + m);

(async () => {
  console.log('\n=== FuelDirect Login Diagnostic ===\n');
  let dbAlive = false;

  // 1. Database connection
  console.log('1. MySQL connection (XAMPP)');
  let db;
  try {
    db = require('./config/db');
    await db.query('SELECT 1');
    dbAlive = true;
    ok(`Connected to database "${process.env.DB_NAME || 'deliveryapp'}"`);
  } catch (e) {
    bad('Cannot connect to MySQL: ' + e.message);
    info('>>> FIX: Open the XAMPP Control Panel and press Start next to MySQL.');
  }

  // 2. Admin account
  if (dbAlive) {
    console.log('\n2. Admin account');
    try {
      const [rows] = await db.query(
        `SELECT u.id, u.email, u.password_hash, u.status FROM users u
         JOIN roles r ON u.role_id = r.id WHERE r.name = 'admin'`
      );
      if (rows.length === 0) {
        bad('No admin user exists in the users table.');
        info('>>> FIX: run  node ../reset_admin_passwords.js  after creating an admin row,');
        info('    or re-import deliveryapp.sql which contains admin@fueldirect.com');
      } else {
        for (const a of rows) {
          ok(`Admin found: ${a.email} (status: ${a.status})`);
          const testPasswords = ['123456', 'password123', 'admin123', 'admin'];
          const match = testPasswords.find((p) => bcrypt.compareSync(p, a.password_hash || ''));
          if (match) {
            ok(`Password for ${a.email} is: ${match}`);
          } else {
            bad(`Password for ${a.email} is NOT one of the common defaults.`);
            info('>>> FIX: from the project root run  node reset_admin_passwords.js');
            info('    That resets ALL admin passwords to: password123');
          }
          if (a.status !== 'active') {
            bad(`Account status is "${a.status}" — must be "active" to log in.`);
          }
        }
      }
    } catch (e) {
      bad('Query failed: ' + e.message);
      info('>>> Your database schema may be missing tables. Re-import deliveryapp.sql in phpMyAdmin.');
    }

    // 3. Vendor accounts
    console.log('\n3. Vendor accounts');
    try {
      const [vendors] = await db.query(
        'SELECT id, email, business_name, verification_status FROM vendors'
      );
      if (vendors.length === 0) {
        bad('No vendors exist yet — vendor login is impossible until one is created.');
        info('>>> FIX: Register a vendor at the vendor portal (/register),');
        info('    then approve it from Admin > Vendors, OR create one via Admin > Add Vendor.');
      } else {
        for (const v of vendors) {
          const okToLogin = String(v.verification_status).toLowerCase() === 'verified';
          (okToLogin ? ok : bad)(
            `${v.email} (${v.business_name}) — status: ${v.verification_status}` +
            (okToLogin ? '' : '  << must be "verified" to log in')
          );
        }
      }
    } catch (e) {
      bad('Vendor query failed: ' + e.message);
    }
  }

  // 4. Backend server on :5001
  console.log('\n4. Backend server (port ' + (process.env.PORT || 5000) + ')');
  await new Promise((resolve) => {
    const req = http.get('http://localhost:' + (process.env.PORT || 5000) + '/health', (res) => {
      ok('Backend is running (HTTP ' + res.statusCode + ' from /health)');
      resolve();
    });
    req.on('error', () => {
      bad('Backend is NOT running on port ' + (process.env.PORT || 5000) + '.');
      info('>>> FIX: open a terminal, then:  cd C:\\xampp\\htdocs\\deliveryapp\\backend');
      info('    and run:  node index.js   (keep that window open)');
      resolve();
    });
    req.setTimeout(3000, () => { req.destroy(); resolve(); });
  });

  console.log('\n=== Done. Fix any [FAIL] lines above, then try logging in again. ===\n');
  process.exit(0);
})();
