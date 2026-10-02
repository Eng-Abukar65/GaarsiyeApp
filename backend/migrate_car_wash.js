require('dotenv').config();
const db = require('./config/db');

async function checkAndMigrate() {
  console.log('--- CHECKING CAR WASH DATA IN DB ---');
  await db.query(`UPDATE business_types SET name = 'Car Services' WHERE name = 'Car Wash'`);
  await db.query(`UPDATE module_upgrade_requests SET requested_module_name = 'Car Services' WHERE requested_module_name = 'Car Wash'`);

  const [vendors] = await db.query(`SELECT id, business_name, business_type FROM vendors WHERE business_type LIKE '%Car Wash%'`);
  for (const v of vendors) {
    let updatedBt = v.business_type;
    if (updatedBt.startsWith('[')) {
      try {
        let arr = JSON.parse(updatedBt);
        arr = arr.map(x => x === 'Car Wash' ? 'Car Services' : x);
        updatedBt = JSON.stringify(arr);
      } catch (e) {}
    } else {
      updatedBt = updatedBt.replace(/Car Wash/g, 'Car Services');
    }
    await db.query(`UPDATE vendors SET business_type = ? WHERE id = ?`, [updatedBt, v.id]);
    console.log(`Updated vendor #${v.id} business_type to: ${updatedBt}`);
  }

  console.log('DB migration completed successfully.');
  process.exit(0);
}

checkAndMigrate().catch(e => { console.error(e); process.exit(1); });
