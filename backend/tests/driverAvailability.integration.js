const assert = require('node:assert/strict');

const db = require('../config/db');
const DriverModel = require('../models/driverModel');

const DRIVER_FIELDS = [
  'is_active',
  'is_online',
  'status',
  'availability_status',
  'account_status',
  'verification_status',
  'current_order_id',
  'last_seen',
  'last_seen_at',
  'last_location_update',
];

async function restoreSnapshot(snapshot) {
  for (const row of snapshot) {
    await db.query(
      `UPDATE drivers SET is_active = ?, is_online = ?, status = ?,
        availability_status = ?, account_status = ?, verification_status = ?,
        current_order_id = ?, last_seen = ?, last_seen_at = ?,
        last_location_update = ? WHERE id = ?`,
      [...DRIVER_FIELDS.map((field) => row[field]), row.id],
    );
    await db.query(
      'UPDATE users SET status = ?, is_online = ?, last_seen = ? WHERE id = ?',
      [row.user_status, row.user_is_online, row.user_last_seen, row.user_id],
    );
  }
}

async function main() {
  await DriverModel.ensurePresenceSchema();
  const [candidates] = await db.query(`
    SELECT d.id, d.user_id, d.vendor_id, d.is_active, d.is_online, d.status,
           d.availability_status, d.account_status, d.verification_status,
           d.current_order_id, d.last_seen, d.last_seen_at, d.last_location_update,
           u.status AS user_status, u.is_online AS user_is_online, u.last_seen AS user_last_seen
    FROM drivers d JOIN users u ON u.id = d.user_id
    WHERE d.vendor_id IS NOT NULL AND d.verification_status = 'verified'
    ORDER BY d.id
  `);
  const primary = candidates.find((row) => row.user_status === 'active');
  const otherVendor = candidates.find(
    (row) => row.user_status === 'active' && row.vendor_id !== primary?.vendor_id,
  );
  if (!primary || !otherVendor) {
    throw new Error('Integration test needs active verified drivers for two different vendors.');
  }
  const snapshot = [primary, otherVendor];
  const ids = (rows) => rows.map((row) => Number(row.id));
  const dummyOrderId = 2147480000;

  try {
    await db.query(`UPDATE users SET status = 'active', is_online = 1 WHERE id IN (?, ?)`,
      [primary.user_id, otherVendor.user_id]);
    await db.query(`UPDATE drivers SET is_active = 1, is_online = 1,
      status = 'available', availability_status = 'available',
      account_status = 'approved', verification_status = 'verified',
      current_order_id = NULL, last_seen = NOW(), last_seen_at = NOW()
      WHERE id IN (?, ?)`, [primary.id, otherVendor.id]);

    let visible = await DriverModel.getAllAvailableDrivers(primary.vendor_id);
    assert.deepEqual(ids(visible), [Number(primary.id)], 'vendor isolation or online filter failed');

    await db.query(`UPDATE drivers SET is_online = 0, status = 'offline',
      availability_status = 'offline' WHERE id = ?`, [primary.id]);
    visible = await DriverModel.getAllAvailableDrivers(primary.vendor_id);
    assert.equal(ids(visible).includes(Number(primary.id)), false, 'offline driver was returned');

    await DriverModel.heartbeat(primary.id);
    visible = await DriverModel.getAllAvailableDrivers(primary.vendor_id);
    assert.equal(ids(visible).includes(Number(primary.id)), true, 'heartbeat did not restore visibility');

    await db.query(`UPDATE drivers SET current_order_id = ?, status = 'busy',
      availability_status = 'busy' WHERE id = ?`, [dummyOrderId, primary.id]);
    visible = await DriverModel.getAllAvailableDrivers(primary.vendor_id);
    assert.equal(ids(visible).includes(Number(primary.id)), false, 'busy driver was returned');

    await db.query(`UPDATE drivers SET current_order_id = NULL, status = 'available',
      availability_status = 'available', last_seen = DATE_SUB(NOW(), INTERVAL 3 MINUTE),
      last_seen_at = DATE_SUB(NOW(), INTERVAL 3 MINUTE), is_online = 1 WHERE id = ?`, [primary.id]);
    visible = await DriverModel.getAllAvailableDrivers(primary.vendor_id);
    assert.equal(ids(visible).includes(Number(primary.id)), false, 'stale driver was returned');

    await db.query(`UPDATE drivers SET is_online = 1, status = 'available',
      availability_status = 'available', account_status = 'pending',
      verification_status = 'pending', last_seen = NOW(), last_seen_at = NOW()
      WHERE id = ?`, [primary.id]);
    visible = await DriverModel.getAllAvailableDrivers(primary.vendor_id);
    assert.equal(ids(visible).includes(Number(primary.id)), false, 'unapproved driver was returned');

    await db.query(`UPDATE drivers SET account_status = 'approved',
      verification_status = 'verified', is_active = 0 WHERE id = ?`, [primary.id]);
    visible = await DriverModel.getAllAvailableDrivers(primary.vendor_id);
    assert.equal(ids(visible).includes(Number(primary.id)), false, 'inactive driver was returned');

    await db.query(`UPDATE drivers SET is_active = 1 WHERE id = ?`, [primary.id]);
    await db.query(`UPDATE users SET status = 'deleted' WHERE id = ?`, [primary.user_id]);
    visible = await DriverModel.getAllAvailableDrivers(primary.vendor_id);
    assert.equal(ids(visible).includes(Number(primary.id)), false, 'disabled user account was returned');

    await db.query(`UPDATE users SET status = 'active' WHERE id = ?`, [primary.user_id]);
    await db.query(`UPDATE drivers SET is_online = 1, status = 'busy',
      availability_status = 'busy', current_order_id = ?, last_seen = NOW(),
      last_seen_at = NOW() WHERE id = ?`, [dummyOrderId, primary.id]);
    await DriverModel.releaseDriverFromOrder(primary.id, dummyOrderId);
    const [[releasedOnline]] = await db.query(`SELECT is_online, status,
      availability_status, current_order_id FROM drivers WHERE id = ?`, [primary.id]);
    assert.equal(releasedOnline.current_order_id, null);
    assert.equal(releasedOnline.status, 'available');
    assert.equal(releasedOnline.availability_status, 'available');
    assert.equal(Number(releasedOnline.is_online), 1);

    await db.query(`UPDATE drivers SET is_online = 0, status = 'offline',
      availability_status = 'offline', current_order_id = ?, last_seen = NOW(),
      last_seen_at = NOW() WHERE id = ?`, [dummyOrderId, primary.id]);
    await DriverModel.releaseDriverFromOrder(primary.id, dummyOrderId);
    const [[releasedOffline]] = await db.query(`SELECT is_online, status,
      availability_status, current_order_id FROM drivers WHERE id = ?`, [primary.id]);
    assert.equal(releasedOffline.current_order_id, null);
    assert.equal(releasedOffline.status, 'offline');
    assert.equal(releasedOffline.availability_status, 'offline');
    assert.equal(Number(releasedOffline.is_online), 0);

    console.log('PASS driver availability: online, heartbeat, offline, stale, busy, approval, active-account, vendor isolation, release');
  } finally {
    await restoreSnapshot(snapshot);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await db.end(); } catch (_) {}
  process.exit(1);
});
