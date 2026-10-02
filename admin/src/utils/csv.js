const escapeCsv = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const triggerDownload = (csvContent, filename) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToCsv = (filename, columns, rows) => {
  if (!Array.isArray(columns) || !Array.isArray(rows)) return 0;

  const headerRow = columns.map((col) => col.label || col.key || '');
  const dataRows = rows.map((row) =>
    columns.map((col) => {
      const value = typeof col.format === 'function' ? col.format(row) : row?.[col.key];
      return escapeCsv(value);
    }).join(',')
  );

  const csv = [headerRow.join(','), ...dataRows].join('\r\n');
  triggerDownload('\uFEFF' + csv, `${filename}.csv`);

  return rows.length;
};
