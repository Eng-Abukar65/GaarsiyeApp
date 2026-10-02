// ─── Shared CSV export helper ─────────────────────────────────────────────────
// One implementation for every admin export so headers/quoting/filenames stay
// consistent. Exports respect whatever filtered array the caller passes in.

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Quote if the cell contains a comma, quote, or newline; double up quotes.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Trigger a client-side CSV download.
 * @param {string} filenameBase - name without extension; date is appended.
 * @param {Array<{key:string,label:string,format?:(row)=>any}>} columns
 * @param {Array<object>} rows - the (already filtered) data rows.
 * @returns {number} number of data rows exported.
 */
export function exportToCsv(filenameBase, columns, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = safeRows.map((row) =>
    columns.map((c) => escapeCell(c.format ? c.format(row) : row[c.key])).join(',')
  );
  const csv = [header, ...body].join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return safeRows.length;
}
