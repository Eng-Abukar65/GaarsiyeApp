import React, { useState, useMemo, useCallback } from 'react';
import {
  FileBarChart, Calendar, Layers, Download, Printer, FileSpreadsheet, FileText,
  Loader2, Search, ArrowUpDown, Building2, PlayCircle, ShieldCheck, CheckCircle2,
  TrendingUp, Package, Users, Truck, ShoppingCart, DollarSign, Wrench, AlertTriangle, Star
} from 'lucide-react';
import api from '../../utils/api';
import { useVendorProfile } from '../../hooks/useVendorProfile';
import { getVendorDisplayName, getVendorLogoUrl } from '../../utils/vendorIdentity';
import { exportCsv, exportExcel, exportPdf, printReport } from '../../utils/reportExport';

// Business Modules
const BUSINESS_MODULES = [
  { key: 'petrol', label: 'Petrol/Diesel' },
  { key: 'gas', label: 'Gas Cylinder' },
  { key: 'spare_parts', label: 'Spare Parts' },
  { key: 'car_services', label: 'Car Services' },
  { key: 'all', label: 'All Modules' },
];

// Report Types
const REPORT_TYPES = [
  { key: 'sales', label: 'Sales Report' },
  { key: 'orders', label: 'Orders Report' },
  { key: 'revenue', label: 'Revenue Report' },
  { key: 'inventory', label: 'Inventory Report' },
  { key: 'purchase', label: 'Purchase Report' },
  { key: 'supplier', label: 'Supplier Report' },
  { key: 'customer', label: 'Customer Report' },
  { key: 'driver', label: 'Driver Report' },
  { key: 'car_services', label: 'Car Services Report' },
  { key: 'settlement', label: 'Settlement Report' },
  { key: 'daily', label: 'Daily Report' },
  { key: 'weekly', label: 'Weekly Report' },
  { key: 'monthly', label: 'Monthly Report' },
  { key: 'custom', label: 'Custom Date Report' },
];

// Date Filters
const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7_days', label: 'Last 7 Days' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom Date Range' },
];

const EXPORT_FORMATS = [
  { key: 'pdf', label: 'PDF', icon: FileText },
  { key: 'excel', label: 'Excel', icon: FileSpreadsheet },
  { key: 'csv', label: 'CSV', icon: Download },
  { key: 'print', label: 'Print', icon: Printer },
];

const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const getPresetDates = (preset) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const todayStr = isoDate(now);

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'yesterday': {
      const yest = new Date(y, m, d - 1);
      return { from: isoDate(yest), to: isoDate(yest) };
    }
    case 'last_7_days': {
      const past = new Date(y, m, d - 6);
      return { from: isoDate(past), to: todayStr };
    }
    case 'this_week': {
      const dayOfWeek = now.getDay();
      const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(y, m, d + diffToMon);
      return { from: isoDate(monday), to: todayStr };
    }
    case 'this_month': {
      const firstDay = new Date(y, m, 1);
      return { from: isoDate(firstDay), to: todayStr };
    }
    case 'last_month': {
      const firstDay = new Date(y, m - 1, 1);
      const lastDay = new Date(y, m, 0);
      return { from: isoDate(firstDay), to: isoDate(lastDay) };
    }
    case 'this_year': {
      const firstDay = new Date(y, 0, 1);
      return { from: isoDate(firstDay), to: todayStr };
    }
    default:
      return null;
  }
};

const formatCurrency = (val) => `$${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtCellValue = (value, type) => {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return formatCurrency(value);
  if (type === 'number') return Number(value).toLocaleString();
  if (type === 'date') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  return String(value);
};

const PAGE_SIZE = 15;

const ReportGenerator = () => {
  const { vendor } = useVendorProfile();

  // Control State
  const [reportType, setReportType] = useState('');
  const [moduleKey, setModuleKey] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exportFormat, setExportFormat] = useState('pdf');

  // Report Data State
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Table Interaction State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  // Compute Active Date Range
  const activeRange = useMemo(() => {
    if (!datePreset) return null;
    if (datePreset === 'custom') {
      return customFrom && customTo && customFrom <= customTo ? { from: customFrom, to: customTo } : null;
    }
    return getPresetDates(datePreset);
  }, [datePreset, customFrom, customTo]);

  // Validation: Report Type, Business Module, Date Range MUST all be selected
  const canGenerate = Boolean(reportType && moduleKey && activeRange) && !generating;

  const handleGenerateReport = useCallback(async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError('');
    setReport(null);
    setPage(1);
    setSearchTerm('');

    try {
      const response = await api.get('/vendor/reports/generate', {
        params: {
          type: reportType,
          module: moduleKey,
          from: activeRange.from,
          to: activeRange.to,
        },
      });

      if (response.data?.success) {
        setReport(response.data.data);
      } else {
        setError(response.data?.message || 'Failed to generate report.');
      }
    } catch (err) {
      console.error('Report Generation Error:', err);
      setError(err.response?.data?.message || 'Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [canGenerate, reportType, moduleKey, activeRange]);

  const handleExport = useCallback(() => {
    if (!report) return;
    switch (exportFormat) {
      case 'excel': exportExcel(report); break;
      case 'csv': exportCsv(report); break;
      case 'print': printReport(report); break;
      case 'pdf': default: exportPdf(report); break;
    }
  }, [report, exportFormat]);

  // Data Table Filtering & Sorting
  const filteredRows = useMemo(() => {
    if (!report?.rows) return [];
    let rows = [...report.rows];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((val) => String(val || '').toLowerCase().includes(q))
      );
    }

    if (sortCol) {
      rows.sort((a, b) => {
        const valA = a[sortCol];
        const valB = b[sortCol];
        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }, [report, searchTerm, sortCol, sortDir]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const toggleSort = (key) => {
    if (sortCol === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir('asc');
    }
  };

  // Render Module-Tailored KPI Cards
  const renderModuleKPIs = (summary) => {
    if (!summary) return null;
    const currentModule = summary.module || moduleKey;

    switch (currentModule) {
      case 'petrol':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Liters Sold</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.liters_sold.toLocaleString()} L</h3>
              <p className="text-[10px] font-semibold text-emerald-600 mt-1">Petrol / Diesel</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Revenue</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{formatCurrency(summary.revenue)}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Gross Earnings</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Orders</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.total_orders.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Total Placed</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Products</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.active_products}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Fuel Grades</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Remaining Stock</p>
              <h3 className="text-2xl font-extrabold text-blue-600 mt-1">{summary.remaining_stock.toLocaleString()} L</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Tank Capacity</p>
            </div>
          </div>
        );

      case 'gas':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cylinders Sold</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.cylinders_sold.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-orange-600 mt-1">Gas Cylinders</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Revenue</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{formatCurrency(summary.revenue)}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Gross Earnings</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Orders</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.total_orders.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Total Deliveries</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inventory</p>
              <h3 className="text-2xl font-extrabold text-blue-600 mt-1">{summary.inventory_count.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Stocked Units</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Low Stock</p>
              <h3 className="text-2xl font-extrabold text-rose-600 mt-1">{summary.low_stock_count}</h3>
              <p className="text-[10px] font-semibold text-rose-500 mt-1">Alert Threshold</p>
            </div>
          </div>
        );

      case 'spare_parts':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Parts Sold</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.parts_sold.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-blue-600 mt-1">Auto Parts</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Revenue</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{formatCurrency(summary.revenue)}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Parts Sales</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inventory</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.inventory_count.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">In-Stock Items</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Purchases</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.purchases_count}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Restock Invoices</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Top Selling Part</p>
              <h3 className="text-lg font-extrabold text-slate-800 mt-1 truncate">{summary.top_selling_part}</h3>
              <p className="text-[10px] font-semibold text-emerald-600 mt-1">Best Seller</p>
            </div>
          </div>
        );

      case 'car_services':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Bookings</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.total_bookings.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Service Requests</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Completed Services</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{summary.completed_services.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-emerald-600 mt-1">Finished Jobs</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cancelled Services</p>
              <h3 className="text-2xl font-extrabold text-rose-600 mt-1">{summary.cancelled_services.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-rose-500 mt-1">Cancelled</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Workers</p>
              <h3 className="text-2xl font-extrabold text-blue-600 mt-1">{summary.active_workers}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Service Crew</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Service Time</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.avg_service_time}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Turnaround</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer Ratings</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">
                {summary.customer_ratings}
              </h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Avg Score</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm md:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Service Revenue</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{formatCurrency(summary.revenue)}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Gross Earnings from Services</p>
            </div>
          </div>
        );

      case 'all':
      default:
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Revenue</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{formatCurrency(summary.revenue)}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">All Business Modules</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Orders</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.total_orders.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Orders & Bookings</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Customers</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.customers.toLocaleString()}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Active Accounts</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Drivers</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.drivers}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Delivery Network</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Suppliers</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.suppliers}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Restock Suppliers</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Inventory Value</p>
              <h3 className="text-2xl font-extrabold text-blue-600 mt-1">{formatCurrency(summary.inventory_value)}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Current Stock Value</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Purchases</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{summary.purchases_count}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Supplier Invoices</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Profit</p>
              <h3 className={`text-2xl font-extrabold mt-1 ${summary.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatCurrency(summary.net_profit)}
              </h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">Revenue - Costs - Commission</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-8">
      {/* Page Header */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-on-surface">Vendor Report Generator</h2>
          <p className="text-on-surface-variant mt-1 font-medium text-sm">
            Generate analytical reports directly from your live delivery & sales database.
          </p>
        </div>
      </section>

      {/* Control Panel Filter Board */}
      <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* 1. Report Type */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Report Type <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full p-3.5 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="">Select Report Type...</option>
              {REPORT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Business Module */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Business Module <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full p-3.5 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
              value={moduleKey}
              onChange={(e) => setModuleKey(e.target.value)}
            >
              <option value="">Select Business Module...</option>
              {BUSINESS_MODULES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Date Range */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Date Filter <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full p-3.5 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
            >
              <option value="">Select Date Range...</option>
              {DATE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Date Pickers */}
        {datePreset === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                From Date
              </label>
              <input
                type="date"
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm text-slate-800 outline-none"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                To Date
              </label>
              <input
                type="date"
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm text-slate-800 outline-none"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Action Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Format Selector */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {EXPORT_FORMATS.map((fmt) => {
                const Icon = fmt.icon;
                const active = exportFormat === fmt.key;
                return (
                  <button
                    key={fmt.key}
                    type="button"
                    onClick={() => setExportFormat(fmt.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{fmt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              disabled={!canGenerate}
              onClick={handleGenerateReport}
              className={`px-8 py-3.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 flex items-center gap-2 ${
                canGenerate
                  ? 'bg-primary text-on-primary hover:bg-primary-dim cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
              <span>{generating ? 'Generating...' : 'Generate Report'}</span>
            </button>
          </div>
        </div>

        {!canGenerate && (
          <p className="text-[11px] font-bold text-slate-400 text-center pt-1">
            * Please select a Report Type, Business Module, and Date Filter to generate.
          </p>
        )}
      </section>

      {/* Error View */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 font-bold text-sm flex items-center gap-2">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Report Display Area */}
      {report && (
        <div className="space-y-8 animate-fade-in">
          {/* Header Banner */}
          <div className="bg-primary text-on-primary p-6 rounded-3xl shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <img
                src={getVendorLogoUrl(vendor)}
                alt="Logo"
                className="w-14 h-14 rounded-2xl object-cover border-2 border-white/20 shadow-inner"
              />
              <div>
                <h3 className="text-xl font-extrabold font-headline">{report.meta.title}</h3>
                <p className="text-xs text-on-primary/80 font-semibold mt-0.5">
                  Business: {getVendorDisplayName(vendor)} • Module: {BUSINESS_MODULES.find(m => m.key === report.meta.module)?.label || report.meta.module}
                </p>
                <p className="text-[10px] text-on-primary/70 font-semibold mt-1">
                  Period: {report.meta.from} to {report.meta.to} • Generated: {new Date(report.meta.generated_at).toLocaleString()}
                </p>
              </div>
            </div>

            <button
              onClick={handleExport}
              className="px-6 py-2.5 bg-white text-primary font-bold text-xs rounded-xl shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
            >
              <Download size={14} />
              <span>Export as {exportFormat.toUpperCase()}</span>
            </button>
          </div>

          {/* Module-Tailored KPI Bento Cards */}
          {renderModuleKPIs(report.summary)}

          {/* Report Data Table */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
            <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold font-headline text-slate-900">Detailed Report Records</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Showing {filteredRows.length} matching rows for {report.meta.title}
                </p>
              </div>

              {/* Table Search */}
              <div className="relative w-full md:w-64">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search report records..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {report.columns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>{col.label}</span>
                          <ArrowUpDown size={12} className="opacity-40" />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {paginatedRows.length > 0 ? (
                    paginatedRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        {report.columns.map((col) => (
                          <td key={col.key} className="px-6 py-4">
                            {fmtCellValue(row[col.key], col.type)}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={report.columns.length} className="py-12 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                        No records found for this date range and business module.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Table Totals Row */}
                {report.totals && Object.keys(report.totals).length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100/80 font-extrabold text-slate-900 border-t-2 border-slate-200">
                      {report.columns.map((col, idx) => (
                        <td key={col.key} className="px-6 py-4 text-xs">
                          {idx === 0
                            ? 'TOTAL'
                            : report.totals[col.key] !== undefined
                            ? fmtCellValue(report.totals[col.key], col.type)
                            : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-40 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ReportGenerator;
