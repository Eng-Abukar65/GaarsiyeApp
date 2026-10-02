const db = require('../config/db');

/**
 * Safely add a column to a table if it doesn't already exist.
 * Avoids syntax issues with `ADD COLUMN IF NOT EXISTS` on older MySQL versions.
 */
async function addColumn(tableName, columnName, columnDefinition) {
  try {
    const [columns] = await db.query(
      `SELECT COLUMN_NAME 
       FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = ? 
         AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );

    if (columns.length === 0) {
      await db.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition}`);
    }
  } catch (error) {
    // If it's a duplicate column error (errno 1060), we can safely ignore it.
    if (error.errno === 1060 || error.code === 'ER_DUP_FIELDNAME') {
      return;
    }
    throw error;
  }
}

/**
 * Safely modify a column in a table.
 */
async function modifyColumn(tableName, columnName, columnDefinition) {
  await db.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${columnDefinition}`);
}

module.exports = {
  addColumn,
  modifyColumn
};
