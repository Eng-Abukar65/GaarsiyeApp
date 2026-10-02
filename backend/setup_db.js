const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setup() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  await connection.query('CREATE DATABASE IF NOT EXISTS delivery_app');
  await connection.query('USE delivery_app');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'customer', 'driver') NOT NULL DEFAULT 'customer',
        status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS vendors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        status ENUM('pending', 'verified', 'suspended') NOT NULL DEFAULT 'pending',
        verification_status ENUM('pending', 'verified', 'suspended') NOT NULL DEFAULT 'pending',
        address TEXT,
        city VARCHAR(100) DEFAULT NULL,
        district VARCHAR(100) DEFAULT NULL,
        phone VARCHAR(20),
        nira_id VARCHAR(100) DEFAULT NULL,
        government_patent VARCHAR(255) DEFAULT NULL,
        passport_number VARCHAR(255) DEFAULT NULL,
        image_url VARCHAR(255),
        is_open BOOLEAN DEFAULT true,
        opening_time TIME DEFAULT '06:00:00',
        closing_time TIME DEFAULT '23:00:00',
        is_online BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        fuel_type ENUM('Diesel', 'Unleaded', 'Premium') NOT NULL,
        stock INT DEFAULT 0,
        image_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS offers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        offer_type ENUM('percentage', 'fixed_amount', 'free_delivery', 'product_specific') NOT NULL DEFAULT 'percentage',
        discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        product_id INT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT,
        vendor_id INT,
        driver_id INT,
        total_amount DECIMAL(10, 2) NOT NULL,
        status ENUM('Pending', 'Processing', 'In Transit', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Pending',
        payment_status ENUM('Unpaid', 'Paid') NOT NULL DEFAULT 'Unpaid',
        delivery_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id),
        FOREIGN KEY (driver_id) REFERENCES users(id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT,
        product_id INT,
        quantity INT NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Check if admin exists
  const [rows] = await connection.query('SELECT * FROM users WHERE email = ?', ['admin@fueldirect.com']);
  if (rows.length === 0) {
    const hashedPassword = await bcrypt.hash('password123', 10);
    await connection.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
      'Admin',
      'admin@fueldirect.com',
      hashedPassword,
      'admin'
    ]);
    console.log('Admin user created');
  } else {
    console.log('Admin user already exists');
  }

  // Add some mock data for Admin Step
  // Customers
  const mockPassword = await bcrypt.hash('password123', 10);
  await connection.query('INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Faisa Hassan', 'faisa@example.com', mockPassword, 'customer']);
  await connection.query('INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Ahmed Ali', 'ahmed@example.com', mockPassword, 'customer']);
  
  // Drivers
  await connection.query('INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Mohamed Abdi', 'mohamed@driver.com', mockPassword, 'driver']);
  
  // Vendors
  await connection.query('INSERT IGNORE INTO vendors (name, email, password, status) VALUES (?, ?, ?, ?)', ['Global Fuels', 'contact@globalfuels.com', mockPassword, 'verified']);
  await connection.query('INSERT IGNORE INTO vendors (name, email, password, status) VALUES (?, ?, ?, ?)', ['Metro Station', 'info@metrostation.com', mockPassword, 'pending']);

  console.log('Database setup complete');
  process.exit();
}

setup().catch(err => {
  console.error('Error setting up database:', err);
  process.exit(1);
});
