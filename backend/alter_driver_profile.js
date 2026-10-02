const db = require('./config/db');

async function run() {
  try {
    console.log('Adding profile_image to drivers table...');
    const [columns] = await db.query("SHOW COLUMNS FROM drivers LIKE 'profile_image'");
    if (columns.length === 0) {
      await db.query("ALTER TABLE drivers ADD COLUMN profile_image VARCHAR(255) DEFAULT NULL AFTER user_id");
      console.log('Added profile_image column.');
    } else {
      console.log('profile_image already exists.');
    }
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run();
