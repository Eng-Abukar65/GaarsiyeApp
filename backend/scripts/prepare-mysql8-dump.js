#!/usr/bin/env node
/**
 * Converts a MariaDB mysqldump into a dump MySQL 8 (Railway) accepts.
 *
 *   node scripts/prepare-mysql8-dump.js schema/railway_import.sql
 *
 * Writes <input>.mysql8.sql next to the input and prints what it changed.
 *
 * The local database is MariaDB 10.4 (XAMPP); Railway provisions MySQL 8.
 * mysqldump output from one is *mostly* portable to the other, but not
 * entirely. Each substitution below is a construct MySQL 8 either rejects
 * outright or silently reinterprets.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const input = process.argv[2] || path.join(__dirname, '..', 'schema', 'railway_import.sql');
if (!fs.existsSync(input)) {
  console.error(`Input dump not found: ${input}`);
  process.exit(1);
}

let sql = fs.readFileSync(input, 'utf8');
const changes = [];

function apply(label, pattern, replacement) {
  const before = sql;
  sql = sql.replace(pattern, replacement);
  const count = (before.match(pattern) || []).length;
  if (count > 0) changes.push(`${label}: ${count}`);
}

// MariaDB emits `/*M!999999\- enable the sandbox mode */` and other /*M!…*/
// blocks. MySQL does not understand the M-prefixed conditional-comment syntax
// and aborts on the very first line of the file.
apply('removed MariaDB /*M!…*/ conditional comments', /\/\*M!.*?\*\/;?\s*/gs, '');

// MariaDB writes `ENGINE=Aria` for some system-ish tables. MySQL has no Aria.
apply('ENGINE=Aria -> ENGINE=InnoDB', /ENGINE=Aria/gi, 'ENGINE=InnoDB');
apply('removed Aria PAGE_CHECKSUM option', /\s*PAGE_CHECKSUM=\d+/gi, '');
apply('removed Aria TRANSACTIONAL option', /\s*TRANSACTIONAL=\d+/gi, '');

// utf8mb3 is a deprecated alias; spell it explicitly to avoid surprises.
apply('utf8mb3 -> utf8mb4 (charset)', /CHARSET=utf8mb3/gi, 'CHARSET=utf8mb4');
apply('utf8mb3 -> utf8mb4 (collation)', /utf8mb3_general_ci/gi, 'utf8mb4_general_ci');

// MySQL 8 accepts `current_timestamp()` but normalising it avoids depending on
// that, and keeps DEFAULT/ON UPDATE clauses in the canonical spelling.
apply('current_timestamp() -> CURRENT_TIMESTAMP', /current_timestamp\(\)/gi, 'CURRENT_TIMESTAMP');

// Integer display widths are deprecated in MySQL 8.0.17+ and dropped from
// SHOW CREATE TABLE output. Harmless but noisy; normalise the common ones.
apply('removed int display widths', /\b(tinyint|smallint|mediumint|int|bigint)\(\d+\)/gi, '$1');

// A DEFINER clause names a user that will not exist on Railway, which makes
// every view/trigger/procedure fail to create.
apply('removed DEFINER clauses', /DEFINER=`[^`]*`@`[^`]*`\s*/g, '');
apply('SQL SECURITY DEFINER -> INVOKER', /SQL SECURITY DEFINER/gi, 'SQL SECURITY INVOKER');

// Never carry a database name into the target: Railway's database is called
// `railway`, and the import must land in whatever schema the client selected.
apply('removed CREATE DATABASE', /^CREATE DATABASE[^;]*;\s*/gim, '');
apply('removed USE statements', /^USE `[^`]*`;\s*/gim, '');

const output = input.replace(/\.sql$/i, '') + '.mysql8.sql';
fs.writeFileSync(output, sql, 'utf8');

console.log(`\nInput : ${input}`);
console.log(`Output: ${output}\n`);
if (changes.length === 0) {
  console.log('  No MariaDB-specific constructs found — the dump was already portable.');
} else {
  for (const change of changes) console.log(`  ${change}`);
}
console.log(`\n  Tables: ${(sql.match(/CREATE TABLE/g) || []).length}`);
console.log('\nImport with:');
console.log('  mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p<MYSQLPASSWORD> <MYSQLDATABASE> < ' + path.basename(output) + '\n');
