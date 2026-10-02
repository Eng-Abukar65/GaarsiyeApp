'use strict';

/**
 * MariaDB (what XAMPP ships locally) accepts these extensions:
 *
 *   ALTER TABLE t ADD COLUMN IF NOT EXISTS c INT
 *   ALTER TABLE t DROP COLUMN IF EXISTS c
 *   ALTER TABLE t ADD INDEX IF NOT EXISTS i (c)
 *   CREATE INDEX IF NOT EXISTS i ON t (c)
 *
 * MySQL 8 — which is what Railway provisions — accepts none of them; each one is
 * a hard syntax error (ER_PARSE_ERROR 1064). The schema bootstrappers that run on
 * every boot (NotificationModel.ensureSchema, CustomerModel.ensureOrderSchema,
 * ensureDriverLocationSchema, carWashSchema, …) are built out of them, so the
 * server cannot start against MySQL until they are translated.
 *
 * There are ~150 such statements across ~30 files. Instead of hand-editing every
 * call site — and silently regressing the moment someone adds another one — the
 * pool rewrites the four statement shapes above into portable SQL that behaves
 * identically on MariaDB and MySQL: look the object up in information_schema
 * first, then run a plain ALTER/CREATE with only the parts that are still needed.
 *
 * Statements that do not use these extensions are passed through untouched, so
 * this costs one cheap regex test per query and nothing else.
 */

const ALTER_TABLE_RE = /^\s*ALTER\s+(?:ONLINE\s+|IGNORE\s+)*TABLE\s+/i;
const CREATE_INDEX_RE =
  /^\s*CREATE\s+(UNIQUE\s+|FULLTEXT\s+|SPATIAL\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+(`[^`]+`|[A-Za-z0-9_$]+)\s+ON\s+(`[^`]+`|[A-Za-z0-9_$.]+)\s*([\s\S]+)$/i;
const CONDITIONAL_RE = /\bIF\s+(?:NOT\s+)?EXISTS\b/i;

/** An empty mysql2-shaped result, returned when a statement becomes a no-op. */
const NOOP_RESULT = [{ affectedRows: 0, warningStatus: 0, compat: 'skipped' }, []];

/**
 * True when `sql` uses one of the MariaDB-only shapes above and therefore has to
 * be rewritten. `CREATE TABLE IF NOT EXISTS` is standard on both engines and is
 * deliberately not matched here.
 */
function needsRewrite(sql) {
  if (typeof sql !== 'string') return false;
  if (!CONDITIONAL_RE.test(sql)) return false;
  return ALTER_TABLE_RE.test(sql) || CREATE_INDEX_RE.test(sql);
}

/** Strips backticks/quotes so a name can be compared against information_schema. */
function bare(identifier) {
  return String(identifier || '').trim().replace(/^[`"'\[]|[`"'\]]$/g, '');
}

/** Re-quotes an identifier for safe interpolation into DDL. */
function quote(identifier) {
  return '`' + bare(identifier).replace(/`/g, '``') + '`';
}

/**
 * Splits an ALTER action list on commas that sit at nesting depth zero, so that
 * `ENUM('a','b')` and `DEFAULT 'x, y'` survive intact.
 */
function splitTopLevel(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quoteChar = null;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoteChar) {
      current += char;
      if (char === '\\') {
        // Copy the escaped character verbatim; it can never close the literal.
        if (i + 1 < text.length) {
          current += text[i + 1];
          i += 1;
        }
      } else if (char === quoteChar) {
        // '' inside a '…' literal is an escaped quote, not a terminator.
        if (text[i + 1] === quoteChar) {
          current += text[i + 1];
          i += 1;
        } else {
          quoteChar = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quoteChar = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;

    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Pulls the table name off the front of an ALTER TABLE statement. */
function parseAlterTarget(sql) {
  const withoutPrefix = sql.replace(ALTER_TABLE_RE, '');
  const match = withoutPrefix.match(/^(`[^`]+`|[A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)?)\s+([\s\S]+)$/);
  if (!match) return null;
  return { table: match[1], actionList: match[2] };
}

const ADD_COLUMN_RE =
  /^ADD\s+(?:COLUMN\s+)?IF\s+NOT\s+EXISTS\s+(`[^`]+`|[A-Za-z0-9_$]+)\s+([\s\S]+)$/i;
const DROP_COLUMN_RE =
  /^DROP\s+(?:COLUMN\s+)?IF\s+EXISTS\s+(`[^`]+`|[A-Za-z0-9_$]+)\s*$/i;
const ADD_INDEX_RE =
  /^ADD\s+(UNIQUE\s+|FULLTEXT\s+|SPATIAL\s+)?(?:INDEX|KEY)\s+IF\s+NOT\s+EXISTS\s+(`[^`]+`|[A-Za-z0-9_$]+)\s*([\s\S]+)$/i;
const DROP_INDEX_RE =
  /^DROP\s+(?:INDEX|KEY)\s+IF\s+EXISTS\s+(`[^`]+`|[A-Za-z0-9_$]+)\s*$/i;

/**
 * Classifies one ALTER action. `kind: 'plain'` means the action is already
 * portable and is emitted unchanged.
 */
function parseAction(action) {
  let match = action.match(ADD_COLUMN_RE);
  if (match) {
    return {
      kind: 'add-column',
      name: bare(match[1]),
      sql: `ADD COLUMN ${quote(match[1])} ${match[2]}`,
    };
  }

  match = action.match(DROP_COLUMN_RE);
  if (match) {
    return { kind: 'drop-column', name: bare(match[1]), sql: `DROP COLUMN ${quote(match[1])}` };
  }

  match = action.match(ADD_INDEX_RE);
  if (match) {
    const unique = (match[1] || '').trim();
    return {
      kind: 'add-index',
      name: bare(match[2]),
      sql: `ADD ${unique ? `${unique.toUpperCase()} ` : ''}INDEX ${quote(match[2])} ${match[3]}`,
    };
  }

  match = action.match(DROP_INDEX_RE);
  if (match) {
    return { kind: 'drop-index', name: bare(match[1]), sql: `DROP INDEX ${quote(match[1])}` };
  }

  return { kind: 'plain', sql: action };
}

/**
 * Loads the current column and index names for a table. `runner` is the raw
 * query function of the pool or connection the statement is executing on, so the
 * lookup always sees the same session (and transaction) as the ALTER itself.
 */
async function describeTable(runner, table) {
  const tableName = bare(table).split('.').pop();

  const [columns] = await runner(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  const [indexes] = await runner(
    `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );

  const lower = (rows, key) => new Set(rows.map((row) => String(row[key]).toLowerCase()));
  return { columns: lower(columns, 'COLUMN_NAME'), indexes: lower(indexes, 'INDEX_NAME') };
}

/**
 * Executes a rewritten statement. `runner(sql, params)` must resolve to a
 * mysql2 `[rows, fields]` tuple.
 */
async function runRewritten(runner, sql) {
  const createIndex = sql.match(CREATE_INDEX_RE);
  if (createIndex) {
    const [, modifier, indexName, table, columns] = createIndex;
    const { indexes } = await describeTable(runner, table);
    if (indexes.has(bare(indexName).toLowerCase())) return NOOP_RESULT;
    const prefix = modifier ? `${modifier.trim().toUpperCase()} ` : '';
    return runner(`CREATE ${prefix}INDEX ${quote(indexName)} ON ${quote(table)} ${columns}`);
  }

  const target = parseAlterTarget(sql);
  if (!target) {
    // Unrecognised shape — better to let the server report it than to guess.
    return runner(sql);
  }

  const actions = splitTopLevel(target.actionList).map(parseAction);
  if (actions.every((action) => action.kind === 'plain')) return runner(sql);

  const { columns, indexes } = await describeTable(runner, target.table);
  const kept = actions.filter((action) => {
    switch (action.kind) {
      case 'add-column':
        return !columns.has(action.name.toLowerCase());
      case 'drop-column':
        return columns.has(action.name.toLowerCase());
      case 'add-index':
        return !indexes.has(action.name.toLowerCase());
      case 'drop-index':
        return indexes.has(action.name.toLowerCase());
      default:
        return true;
    }
  });

  if (kept.length === 0) return NOOP_RESULT;

  return runner(
    `ALTER TABLE ${quote(target.table)} ${kept.map((action) => action.sql).join(', ')}`
  );
}

module.exports = {
  needsRewrite,
  runRewritten,
  // Exported for the unit test in tests/sqlCompat.test.js.
  _internals: { splitTopLevel, parseAction, parseAlterTarget },
};
