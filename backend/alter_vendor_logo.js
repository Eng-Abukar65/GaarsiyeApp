const db = require('./config/db');

async function updateDb() {
  try {
    // Check if the logo column already exists
    const [columns] = await db.query("SHOW COLUMNS FROM vendors LIKE 'logo'");
    if (columns.length === 0) {
      await db.query("ALTER TABLE vendors ADD COLUMN logo VARCHAR(255) DEFAULT NULL");
      console.log("SUCCESS: 'logo' column successfully added to 'vendors' table.");
    } else {
      console.log("INFO: 'logo' column already exists in 'vendors' table.");
    }
  } catch (e) {
    console.error("ERROR: Failed to alter table:", e);
  }
  process.exit(0);
}

updateDb();
