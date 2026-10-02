const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gaarsisapp',
    port: process.env.DB_PORT || 3306,
  });

  console.log('Connected to MySQL database.');

  try {
    // 1. Create uploaded_files table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_hash VARCHAR(64) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INT NOT NULL,
        uploaded_by INT NULL,
        vendor_id INT NULL,
        document_type VARCHAR(100) DEFAULT 'general',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_file_hash (file_hash),
        INDEX idx_uploaded_by (uploaded_by),
        INDEX idx_vendor_id (vendor_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ Table uploaded_files verified/created.');

    // Add unique indexes safely if not exist
    const [indexes] = await connection.query(`SHOW INDEX FROM uploaded_files`);
    const indexNames = indexes.map(i => i.Key_name);

    if (!indexNames.includes('idx_hash_user')) {
      await connection.query(`
        ALTER TABLE uploaded_files 
        ADD UNIQUE INDEX idx_hash_user (file_hash, uploaded_by);
      `);
      console.log('✓ Added unique index idx_hash_user.');
    }

    if (!indexNames.includes('idx_vendor_doc_hash')) {
      await connection.query(`
        ALTER TABLE uploaded_files 
        ADD UNIQUE INDEX idx_vendor_doc_hash (vendor_id, document_type, file_hash);
      `);
      console.log('✓ Added unique index idx_vendor_doc_hash.');
    }

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await connection.end();
  }
}

migrate();
