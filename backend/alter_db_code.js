const mysql = require('mysql2/promise');
require('dotenv').config();

async function alterDB() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'deliveryapp'
  });

  try {
    await db.query(`ALTER TABLE deliveries ADD COLUMN delivery_code_verified_at TIMESTAMP NULL`);
    console.log("Added delivery_code_verified_at to deliveries table.");
  } catch(e) {
    console.log("delivery_code_verified_at probably exists:", e.message);
  }

  await db.end();
}

alterDB().catch(console.error);
