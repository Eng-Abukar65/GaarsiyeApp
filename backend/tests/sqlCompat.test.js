/**
 * Verifies the MariaDB -> portable-SQL rewrite in config/sqlCompat.js.
 *
 * Run with:  node tests/sqlCompat.test.js
 *
 * The DDL half runs against the database configured in .env, inside a scratch
 * table it creates and drops itself. It never touches application tables.
 */
'use strict';

const assert = require('assert');
const { needsRewrite, _internals } = require('../config/sqlCompat');
const db = require('../config/db');

const { splitTopLevel, parseAction, parseAlterTarget } = _internals;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

console.log('\nsqlCompat — detection');

check('detects ADD COLUMN IF NOT EXISTS', () => {
  assert.strictEqual(needsRewrite('ALTER TABLE t ADD COLUMN IF NOT EXISTS c INT'), true);
});
check('detects DROP COLUMN IF EXISTS', () => {
  assert.strictEqual(needsRewrite('ALTER TABLE t DROP COLUMN IF EXISTS c'), true);
});
check('detects CREATE INDEX IF NOT EXISTS', () => {
  assert.strictEqual(needsRewrite('CREATE INDEX IF NOT EXISTS i ON t (c)'), true);
});
check('leaves CREATE TABLE IF NOT EXISTS alone (portable already)', () => {
  assert.strictEqual(needsRewrite('CREATE TABLE IF NOT EXISTS t (id INT)'), false);
});
check('leaves ordinary SELECT alone', () => {
  assert.strictEqual(needsRewrite('SELECT * FROM orders WHERE id = ?'), false);
});
check('leaves plain ALTER alone', () => {
  assert.strictEqual(needsRewrite('ALTER TABLE t MODIFY c INT NULL'), false);
});

console.log('\nsqlCompat — action-list splitting');

check('does not split inside ENUM(...)', () => {
  const parts = splitTopLevel(
    "ADD COLUMN IF NOT EXISTS s ENUM('pending','verified','suspended') DEFAULT 'pending', ADD COLUMN IF NOT EXISTS x INT"
  );
  assert.strictEqual(parts.length, 2);
  assert.ok(parts[0].includes("'suspended'"));
});

check('does not split inside a quoted DEFAULT containing a comma', () => {
  const parts = splitTopLevel("ADD COLUMN IF NOT EXISTS a VARCHAR(20) DEFAULT 'x, y', ADD COLUMN IF NOT EXISTS b INT");
  assert.strictEqual(parts.length, 2);
  assert.strictEqual(parts[0], "ADD COLUMN IF NOT EXISTS a VARCHAR(20) DEFAULT 'x, y'");
});

check('handles an escaped quote inside a literal', () => {
  const parts = splitTopLevel("ADD COLUMN IF NOT EXISTS a VARCHAR(20) DEFAULT 'it''s', ADD COLUMN IF NOT EXISTS b INT");
  assert.strictEqual(parts.length, 2);
});

console.log('\nsqlCompat — action parsing');

check('parses ADD COLUMN IF NOT EXISTS with AFTER clause', () => {
  const action = parseAction('ADD COLUMN IF NOT EXISTS customer_id INT NULL AFTER id');
  assert.strictEqual(action.kind, 'add-column');
  assert.strictEqual(action.name, 'customer_id');
  assert.strictEqual(action.sql, 'ADD COLUMN `customer_id` INT NULL AFTER id');
});

check('parses ADD IF NOT EXISTS without the COLUMN keyword', () => {
  const action = parseAction('ADD IF NOT EXISTS c INT');
  assert.strictEqual(action.kind, 'add-column');
  assert.strictEqual(action.name, 'c');
});

check('parses DROP COLUMN IF EXISTS', () => {
  const action = parseAction('DROP COLUMN IF EXISTS reference_id');
  assert.strictEqual(action.kind, 'drop-column');
  assert.strictEqual(action.sql, 'DROP COLUMN `reference_id`');
});

check('parses ADD UNIQUE INDEX IF NOT EXISTS', () => {
  const action = parseAction('ADD UNIQUE INDEX IF NOT EXISTS idx_x (a, b)');
  assert.strictEqual(action.kind, 'add-index');
  assert.strictEqual(action.name, 'idx_x');
  assert.strictEqual(action.sql, 'ADD UNIQUE INDEX `idx_x` (a, b)');
});

check('passes an unconditional action through unchanged', () => {
  const action = parseAction('MODIFY COLUMN c INT NOT NULL');
  assert.strictEqual(action.kind, 'plain');
  assert.strictEqual(action.sql, 'MODIFY COLUMN c INT NOT NULL');
});

check('reads the table name off a backticked ALTER', () => {
  const target = parseAlterTarget('ALTER TABLE `my_table` ADD COLUMN IF NOT EXISTS c INT');
  assert.strictEqual(target.table, '`my_table`');
});

console.log('\nsqlCompat — live DDL against the configured database');

const TMP = 'sql_compat_scratch';

(async () => {
  await checkAsync('rewritten DDL runs, and is idempotent', async () => {
    await db.query(`DROP TABLE IF EXISTS ${TMP}`);
    await db.query(`CREATE TABLE ${TMP} (id INT AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB`);

    const columnsOf = async () => {
      const [rows] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [TMP]
      );
      return rows.map((r) => r.COLUMN_NAME.toLowerCase());
    };

    // Multi-action ALTER with a comma inside an ENUM.
    const alter = `ALTER TABLE ${TMP}
      ADD COLUMN IF NOT EXISTS state ENUM('pending','verified','suspended') NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS label VARCHAR(20) DEFAULT 'a, b',
      ADD COLUMN IF NOT EXISTS note TEXT NULL`;

    await db.query(alter);
    let columns = await columnsOf();
    assert.ok(columns.includes('state'), 'state column was not created');
    assert.ok(columns.includes('label'), 'label column was not created');
    assert.ok(columns.includes('note'), 'note column was not created');

    // Running it again must be a no-op, not a duplicate-column error.
    await db.query(alter);

    // A mixed statement: one column already exists, one does not.
    await db.query(
      `ALTER TABLE ${TMP} ADD COLUMN IF NOT EXISTS note TEXT NULL, ADD COLUMN IF NOT EXISTS extra INT NULL`
    );
    columns = await columnsOf();
    assert.ok(columns.includes('extra'), 'extra column was not created alongside an existing one');

    // Conditional index creation, twice.
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scratch_state ON ${TMP} (state)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scratch_state ON ${TMP} (state)`);

    const [indexes] = await db.query(
      `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [TMP]
    );
    assert.ok(
      indexes.some((i) => i.INDEX_NAME === 'idx_scratch_state'),
      'index was not created'
    );

    // Conditional drops, including one that is already gone.
    await db.query(`ALTER TABLE ${TMP} DROP COLUMN IF EXISTS extra`);
    await db.query(`ALTER TABLE ${TMP} DROP COLUMN IF EXISTS extra`);
    columns = await columnsOf();
    assert.ok(!columns.includes('extra'), 'extra column was not dropped');

    await db.query(`DROP TABLE IF EXISTS ${TMP}`);
  });

  await checkAsync('ordinary parameterised queries still work', async () => {
    const [rows] = await db.query('SELECT ? AS answer', [42]);
    assert.strictEqual(Number(rows[0].answer), 42);
  });

  await checkAsync('getConnection() still returns a usable connection', async () => {
    const connection = await db.getConnection();
    try {
      const [rows] = await connection.query('SELECT 1 AS one');
      assert.strictEqual(Number(rows[0].one), 1);
    } finally {
      connection.release();
    }
  });

  console.log(failures === 0 ? '\nAll sqlCompat checks passed.\n' : `\n${failures} check(s) failed.\n`);
  await db.end();
  process.exit(failures === 0 ? 0 : 1);
})();
