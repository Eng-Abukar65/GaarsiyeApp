const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixVendorAddress() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'deliveryapp'
  });

  console.log('\n========== FIXING VENDOR ADDRESSES ==========\n');

  const [result] = await db.query(
    `UPDATE vendors SET address = 'Main Station, Mogadishu' WHERE address IS NULL OR address = '' OR address = 'Address not provided'`
  );

  console.log(`✅ Updated ${result.affectedRows} vendors with default address 'Main Station, Mogadishu'.`);

  await db.end();
  console.log('\n========== DONE ==========\n');
}

fixVendorAddress().catch(console.error);
