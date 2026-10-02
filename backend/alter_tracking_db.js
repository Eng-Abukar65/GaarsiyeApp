const db = require('./config/db');

async function updateDb() {
  try {
    console.log("Altering DB for Real Live GPS Tracking...");

    // Add columns to drivers
    await db.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_latitude DECIMAL(10, 8) DEFAULT NULL`);
    await db.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_longitude DECIMAL(11, 8) DEFAULT NULL`);
    await db.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS heading DECIMAL(5, 2) DEFAULT NULL`);
    await db.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS speed DECIMAL(5, 2) DEFAULT NULL`);

    // Add columns to deliveries
    await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pickup_latitude DECIMAL(10, 8) DEFAULT NULL`);
    await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pickup_longitude DECIMAL(11, 8) DEFAULT NULL`);
    await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS customer_latitude DECIMAL(10, 8) DEFAULT NULL`);
    await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS customer_longitude DECIMAL(11, 8) DEFAULT NULL`);
    await db.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS live_tracking_enabled BOOLEAN DEFAULT TRUE`);

    console.log("DB altered successfully for live tracking!");
  } catch (e) {
    console.error("Error altering DB:", e);
  }
  process.exit(0);
}

updateDb();
