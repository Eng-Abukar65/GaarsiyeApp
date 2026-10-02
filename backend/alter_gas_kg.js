const db = require('./config/db');

async function migrateGasToKg() {
  try {
    console.log('[alter_gas_kg] Starting gas unit migration...');

    // Ensure unit column exists on products
    await db.query(
      "ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'Units'"
    ).catch(() => {});
    console.log('[alter_gas_kg] Ensured unit column on products.');

    // Set unit = KG for all Gas Cylinder products (category_id = 2)
    const [res] = await db.query(
      "UPDATE products SET unit = 'KG' WHERE category_id = 2"
    );
    console.log(`[alter_gas_kg] Updated ${res.affectedRows} gas products to unit=KG.`);

    // Verify
    const [rows] = await db.query(
      "SELECT id, name, unit, selling_price FROM products WHERE category_id = 2"
    );
    console.log('[alter_gas_kg] Gas products after migration:');
    rows.forEach(r => console.log(`  id=${r.id} name=${r.name} unit=${r.unit} price=${r.selling_price}`));

    console.log('[alter_gas_kg] Migration complete!');
  } catch (err) {
    console.error('[alter_gas_kg] Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrateGasToKg();
