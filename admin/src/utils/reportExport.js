const fmtCell = (value, type) => {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'money') return Number(value).toFixed(2);
  if (type === 'number') return String(Number(value));
  if (type === 'date') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  return String(value);
};

const buildMatrix = (report) => {
  const headers = report.columns.map((c) => c.label);
  const body = report.rows.map((row) => report.columns.map((c) => fmtCell(row[c.key], c.type)));
  const hasTotals = Object.keys(report.totals || {}).length > 0;
  const totalsRow = hasTotals
    ? report.columns.map((c, i) => {
        if (i === 0) return 'TOTAL';
        const t = report.totals[c.key];
        return t === undefined ? '' : fmtCell(t, c.type);
      })
    : null;
  return { headers, body, totalsRow };
};

const fileBase = (report) =>
  `${report.meta.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${report.meta.from}-to-${report.meta.to}`;

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ── CSV ──────────────────────────────────────────────────────────────────────
const escapeCsv = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportCsv = (report) => {
  const { headers, body, totalsRow } = buildMatrix(report);
  const lines = [
    [report.meta.title],
    [`Period: ${report.meta.from} to ${report.meta.to}`],
    [`Module: ${report.meta.module}`],
    [`Generated: ${new Date(report.meta.generated_at).toLocaleString()}`],
    [],
    headers,
    ...body,
    ...(totalsRow ? [totalsRow] : []),
  ];
  const csv = lines.map((r) => (Array.isArray(r) ? r.map(escapeCsv).join(',') : escapeCsv(r))).join('\r\n');
  triggerDownload(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), `${fileBase(report)}.csv`);
};

// ── Excel (real .xlsx via SheetJS) ───────────────────────────────────────────
export const exportExcel = async (report) => {
  const XLSX = await import('xlsx');
  const { headers, body, totalsRow } = buildMatrix(report);

  const summaryRows = Object.entries(report.summary || {}).map(([k, v]) => [
    k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    v,
  ]);

  const aoa = [
    [report.meta.title],
    [`Period: ${report.meta.from} to ${report.meta.to}`],
    [`Module: ${report.meta.module}`],
    [`Generated: ${new Date(report.meta.generated_at).toLocaleString()}`],
    [],
    ['SUMMARY'],
    ...summaryRows,
    [],
    headers,
    ...body,
    ...(totalsRow ? [totalsRow] : []),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${fileBase(report)}.xlsx`);
};

// ── PDF ──────────────────────────────────────────────────────────────────────
export const exportPdf = async (report, { companyName = 'FuelDirect Platform', vendorInfo = '', generatedBy = '' } = {}) => {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { headers, body, totalsRow } = buildMatrix(report);

  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(report.meta.title, 14, 15);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Period: ${report.meta.from} to ${report.meta.to}  |  Module: ${report.meta.module}  |  Company: ${companyName}`, 14, 21);

  let currentY = 26;

  if (report.summary && Object.keys(report.summary).length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Summary Metrics:', 14, currentY);
    currentY += 4;

    const summaryItems = Object.entries(report.summary).map(([k, v]) => {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
      const val = k.includes('revenue') || k.includes('sales') || k.includes('spent') || k.includes('fees') || k.includes('payments')
        ? `$${Number(v).toFixed(2)}`
        : String(v);
      return `${label}: ${val}`;
    });

    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(summaryItems.join('   |   '), 14, currentY);
    currentY += 8;
  }

  const tableBody = totalsRow ? [...body, totalsRow] : body;

  doc.autoTable({
    startY: currentY,
    head: [headers],
    body: tableBody,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { top: 15, left: 14, right: 14, bottom: 15 },
  });

  doc.save(`${fileBase(report)}.pdf`);
};
