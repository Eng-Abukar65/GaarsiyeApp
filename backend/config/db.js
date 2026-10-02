const mysql = require('mysql2/promise');
require('dotenv').config();

const { needsRewrite, runRewritten } = require('./sqlCompat');

// The business timezone is pinned explicitly rather than inherited from the host
// OS locale, so timestamps mean the same thing on every machine the app runs on.
//
// Existing rows were written while both Node and MySQL sat at UTC+03:00 (the
// host locale), so '+03:00' is the value that PRESERVES their meaning. Changing
// it would silently reinterpret every historical timestamp — this is not a
// cosmetic setting.
const DB_TIMEZONE = process.env.DB_TIMEZONE || '+03:00';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Resolves connection settings from, in order of precedence:
 *
 *   1. DATABASE_URL / MYSQL_URL — Railway's MySQL plugin injects MYSQL_URL into
 *      services linked to the database, and MYSQL_PUBLIC_URL for external access.
 *   2. Railway's discrete MYSQLHOST / MYSQLUSER / … variables.
 *   3. The DB_* variables used for local XAMPP development.
 *
 * Nothing here carries a credential default in production: if the variables are
 * missing the process refuses to start rather than silently trying `root` with
 * an empty password against localhost.
 */
function resolveConnectionConfig() {
  if (process.env.MYSQLHOST && process.env.MYSQLHOST !== '127.0.0.1' && process.env.MYSQLHOST !== 'localhost') {
    return {
      source: 'railway-variables',
      host: process.env.MYSQLHOST,
      port: Number(process.env.MYSQLPORT || 3306),
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
    };
  }

  const url =
    process.env.DATABASE_URL ||
    process.env.MYSQL_URL ||
    process.env.MYSQL_PUBLIC_URL ||
    '';

  if (url) {
    const parsed = new URL(url);
    return {
      source: 'connection-url',
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    };
  }

  if (process.env.MYSQLHOST) {
    return {
      source: 'railway-variables',
      host: process.env.MYSQLHOST,
      port: Number(process.env.MYSQLPORT || 3306),
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
    };
  }

  return {
    source: 'db-variables',
    host: process.env.DB_HOST || (IS_PRODUCTION ? undefined : 'localhost'),
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || (IS_PRODUCTION ? undefined : 'root'),
    password: process.env.DB_PASSWORD ?? (IS_PRODUCTION ? undefined : ''),
    database: process.env.DB_NAME || (IS_PRODUCTION ? undefined : 'deliveryapp'),
  };
}

const connection = resolveConnectionConfig();

const missing = ['host', 'user', 'database'].filter((key) => !connection[key]);
if (missing.length > 0) {
  throw new Error(
    `[DB] Missing database configuration: ${missing.join(', ')}. ` +
      'Set DATABASE_URL/MYSQL_URL, or the MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE ' +
      'variables Railway provides, or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME for local development.'
  );
}

// Railway's MySQL proxy terminates TLS with a certificate that does not chain to
// a public root, so verification is opt-in via DB_SSL. Default off (Railway's
// private network is already isolated); set DB_SSL=true to negotiate TLS and
// DB_SSL_CA to supply the certificate authority when one is available.
const ssl = (() => {
  if (String(process.env.DB_SSL || '').toLowerCase() !== 'true') return undefined;
  if (process.env.DB_SSL_CA) {
    return { ca: process.env.DB_SSL_CA, rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
})();

const pool = mysql.createPool({
  host: connection.host,
  user: connection.user,
  password: connection.password,
  database: connection.database,
  port: connection.port,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  ...(ssl ? { ssl } : {}),
  // Pins how mysql2 converts DATETIME <-> JS Date in both directions.
  timezone: DB_TIMEZONE,
});

console.log(
  `[DB] Connecting to ${connection.host}:${connection.port}/${connection.database} ` +
    `as ${connection.user} (config source: ${connection.source}${ssl ? ', TLS' : ''})`
);

// The app was written and tested against MariaDB 10.4's default sql_mode:
//
//   NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION
//
// MySQL 8 — Railway's engine — additionally enables ONLY_FULL_GROUP_BY,
// STRICT_TRANS_TABLES and ERROR_FOR_DIVISION_BY_ZERO by default. Under those,
// aggregate queries that run fine locally raise ER_WRONG_FIELD_WITH_GROUP, and
// inserts that silently coerced a value now abort the request. Pinning the
// session mode makes production behave the way the code was verified to behave,
// rather than discovering the differences one 500 at a time.
//
// Tighten this deliberately (set DB_SQL_MODE) once the aggregate queries have
// been audited — do not tighten it as part of an unrelated change.
const DB_SQL_MODE = process.env.DB_SQL_MODE ?? 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION';

// Pin the MySQL session timezone too, so NOW()/CURRENT_TIMESTAMP evaluated on
// the server agree with the driver's conversion regardless of MySQL's global tz.
pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${DB_TIMEZONE}'`, (err) => {
    if (err) console.error('[DB] Could not pin session time_zone:', err.message);
  });
  if (DB_SQL_MODE) {
    conn.query('SET SESSION sql_mode = ?', [DB_SQL_MODE], (err) => {
      if (err) console.error('[DB] Could not pin session sql_mode:', err.message);
    });
  }
});

/**
 * Wraps a pool/connection so MariaDB-only conditional DDL keeps working against
 * MySQL 8. See config/sqlCompat.js for why this lives at the driver boundary
 * instead of at the ~150 individual call sites.
 */
function withSqlCompat(target) {
  const rawQuery = target.query.bind(target);

  const query = (sql, params) => {
    const text = typeof sql === 'string' ? sql : sql?.sql;
    if (needsRewrite(text)) {
      return runRewritten(rawQuery, text);
    }
    return rawQuery(sql, params);
  };

  return new Proxy(target, {
    get(object, property, receiver) {
      if (property === 'query') return query;
      if (property === 'getConnection') {
        return async (...args) => withSqlCompat(await object.getConnection(...args));
      }
      const value = Reflect.get(object, property, receiver);
      return typeof value === 'function' ? value.bind(object) : value;
    },
  });
}

module.exports = withSqlCompat(pool);
