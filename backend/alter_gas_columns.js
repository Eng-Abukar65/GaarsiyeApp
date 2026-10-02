const db = require('./config/db');

async function migrate() {
  try {
    console.log('[MIGRATION] Starting database column updates for gas products/offers...');

    // 1. Add columns to products table
    await db.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS price_per_kg DECIMAL(10, 2) NULL,
      ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS offer_price_per_kg DECIMAL(10, 2) NULL
    `);
    console.log('[MIGRATION] Added price_per_kg, discount_percentage, and offer_price_per_kg to products table.');

    // 2. Add columns to offers table
    await db.query(`
      ALTER TABLE offers
      ADD COLUMN IF NOT EXISTS price_per_kg DECIMAL(10, 2) NULL,
      ADD COLUMN IF NOT EXISTS offer_price_per_kg DECIMAL(10, 2) NULL
    `);
    console.log('[MIGRATION] Added price_per_kg and offer_price_per_kg to offers table.');

    // 3. Update existing category 2 products
    // Change unit to lowercase 'kg', and set price_per_kg = selling_price
    const [res] = await db.query(`
      UPDATE products 
      SET unit = 'kg', price_per_kg = selling_price 
      WHERE category_id = 2 OR unit = 'KG' OR unit = 'kg'
    `);
    console.log(`[MIGRATION] Updated ${res.affectedRows} gas products to unit='kg' and initialized price_per_kg.`);

    // 4. Update products that have active offers
    // Fetch all active offers to sync discount_percentage and calculate offer_price_per_kg
    const [offers] = await db.query(`
      SELECT * FROM offers WHERE is_active = 1 AND product_id IS NOT NULL
    `);
    
    for (const offer of offers) {
      const discount = parseFloat(offer.discount_percentage || offer.discount_value || 0);
      if (discount > 0) {
        const [prodRows] = await db.query('SELECT * FROM products WHERE id = ?', [offer.product_id]);
        if (prodRows.length > 0) {
          const product = prodRows[0];
          const price = parseFloat(product.price_per_kg || product.selling_price || 0);
          const offerPrice = price - (price * discount / 100);
          
          await db.query(`
            UPDATE products 
            SET discount_percentage = ?, offer_price_per_kg = ?
            WHERE id = ?
          `, [discount, offerPrice, product.id]);

          await db.query(`
            UPDATE offers
            SET price_per_kg = ?, offer_price_per_kg = ?
            WHERE id = ?
          `, [price, offerPrice, offer.id]);

          console.log(`[MIGRATION] Synced active offer for product id=${product.id}: discount=${discount}%, original=${price}, offerPrice=${offerPrice}`);
        }
      }
    }

    console.log('[MIGRATION] Database migration completed successfully!');
  } catch (err) {
    console.error('[MIGRATION] Error migrating database:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
