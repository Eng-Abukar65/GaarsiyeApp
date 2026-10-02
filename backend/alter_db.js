const db = require('./config/db');

async function updateDb() {
  try {
    // Add columns to vendors if they don't exist
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT NULL`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS district VARCHAR(100) DEFAULT NULL`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS verification_status ENUM('pending','verified','suspended') DEFAULT 'pending'`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS opening_time TIME DEFAULT '06:00:00'`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS closing_time TIME DEFAULT '23:00:00'`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT true`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS nira_id VARCHAR(100) DEFAULT NULL`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS government_patent VARCHAR(255) DEFAULT NULL`);
    await db.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS passport_number VARCHAR(255) DEFAULT NULL`);
    
    // Add columns to drivers if they don't exist
    await db.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS plate_number VARCHAR(50) DEFAULT NULL`);
    await db.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address VARCHAR(255) DEFAULT NULL`);
    await db.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vendor_id INT DEFAULT NULL`);
    await db.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS status ENUM('available','busy','offline') DEFAULT 'offline'`);
    
    console.log("DB altered successfully");
  } catch (e) {
    console.error("Error altering DB:", e);
  }
  process.exit(0);
}

updateDb();
