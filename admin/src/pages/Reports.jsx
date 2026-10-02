import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import {
  FileText, Download, Printer, Filter, Calendar, Loader2, RefreshCw,
  Search, CheckCircle2, DollarSign, ShoppingCart, Truck, Users, Store,
  Car, ShieldCheck, CreditCard, ChevronRight, BarChart3, AlertCircle,
  Wrench, Activity, MapPin, UserCheck, Clock
} from 'lucide-react';
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip
} from 'recharts';
import { useToast } from '../components/ui';
import { exportCsv, exportExcel, exportPdf } from '../utils/reportExport';

const money = (v) => `$${Number.parseFloat(v || 0).toFixed(2)}`;

const ADMIN_REPORT_TYPES = [
  { id: 'platform_summary', name: 'Platform Summary Report' },
  { id: 'vendors', name: 'Vendors Report' },
  { id: 'customers', name: 'Customers Report' },
  { id: 'drivers', name: 'Delivery Drivers Report' },
  { id: 'car_workers', name: 'Car Services Workers Report' },
  { id: 'orders', name: 'Orders Report' },
  { id: 'deliveries', name: 'Deliveries Report' },
  { id: 'car_services', name: 'Car Services Bookings Report' },
  { id: 'subscription_payments', name: 'Subscription Payments Report' },
  { id: 'system_activity', name: 'System Activity Report' },
];

const DATE_PRESETS = [
  { id: 'today', name: 'Today' },
  { id: 'yesterday', name: 'Yesterday' },
  { id: 'last_7_days', name: 'Last 7 Days' },
  { id: 'this_month', name: 'This Month' },
  { id: 'last_month', name: 'Last Month' },
  { id: 'this_year', name: 'This Year' },
  { id: 'custom', name: 'Custom Range' },
];

const getPresetDates = (preset) => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'today') {
    const s = fmt(now);
    return { from: s, to: s };
  }
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const s = fmt(y);
    return { from: s, to: s };
  }
  if (preset === 'last_7_days') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: fmt(d), to: fmt(now) };
  }
  if (preset === 'last_month') {
    const y = now.getFullYear();
    const m = now.getMonth();
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    return { from: fmt(first), to: fmt(last) };
  }
  if (preset === 'this_year') {
    const first = new Date(now.getFullYear(), 0, 1);
    return { from: fmt(first), to: fmt(now) };
  }
  // Default this_month
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmt(first), to: fmt(now) };
};

const AdminReports = () => {
  const toast = useToast();

  // Selection states
  const [reportType, setReportType] = useState('platform_summary');
  const [datePreset, setDatePreset] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Admin Filters
  const [vendorId, setVendorId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [orderStatus, setOrderStatus] = useState('all');
  const [bookingStatus, setBookingStatus] = useState('all');
  const [subscriptionStatus, setSubscriptionStatus] = useState('all');
  const [zone, setZone] = useState('');

  // Entities Lists for Filters
  const [vendorsList, setVendorsList] = useState([]);
  const [customersList, setCustomersList] = useState([]);
  const [driversList, setDriversList] = useState([]);
  const [workersList, setWorkersList] = useState([]);

  // Report Data
  const [reportData, setReportData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Fetch Entity Option Lists
  useEffect(() => {
    Promise.all([
      api.get('/admin/vendors').catch(() => ({ data: [] })),
      api.get('/admin/users?role=customer').catch(() => ({ data: [] })),
      api.get('/admin/users?role=driver').catch(() => ({ data: [] })),
      api.get('/admin/users?role=worker').catch(() => ({ data: [] })),
    ]).then(([vRes, cRes, dRes, wRes]) => {
      setVendorsList(vRes.data?.data || vRes.data || []);
      setCustomersList(cRes.data || []);
      setDriversList(dRes.data || []);
      setWorkersList(wRes.data || []);
    });
  }, []);

  const activeRange = useMemo(() => {
    if (datePreset === 'custom') {
      return { from: customFrom, to: customTo };
    }
    return getPresetDates(datePreset);
  }, [datePreset, customFrom, customTo]);

  const handleGenerateReport = async (e) => {
    if (e) e.preventDefault();
    const { from, to } = activeRange;

    if (!from || !to) {
      toast?.error?.('Please select a valid date range.');
      return;
    }
    if (from > to) {
      toast?.error?.('Start date cannot be after end date.');
      return;
    }

    setGenerating(true);
    try {
      const res = await api.get('/admin/reports/generate', {
        params: {
          type: reportType,
          from,
          to,
          vendorId: vendorId || undefined,
          customerId: customerId || undefined,
          driverId: driverId || undefined,
          workerId: workerId || undefined,
          orderStatus: orderStatus !== 'all' ? orderStatus : undefined,
          bookingStatus: bookingStatus !== 'all' ? bookingStatus : undefined,
          subscriptionStatus: subscriptionStatus !== 'all' ? subscriptionStatus : undefined,
          zone: zone.trim() || undefined,
        },
      });

      const data = res.data?.data;
      if (data) {
        setReportData({
          ...data,
          meta: {
            title: data.title || ADMIN_REPORT_TYPES.find((r) => r.id === reportType)?.name || 'Admin Report',
            from,
            to,
            generated_at: new Date().toISOString(),
            applied_filters: [
              vendorId ? `Vendor: ${vendorsList.find((v) => String(v.id) === String(vendorId))?.business_name || vendorId}` : null,
              customerId ? `Customer ID: ${customerId}` : null,
              driverId ? `Driver ID: ${driverId}` : null,
              workerId ? `Worker ID: ${workerId}` : null,
              orderStatus !== 'all' ? `Order Status: ${orderStatus}` : null,
              bookingStatus !== 'all' ? `Booking Status: ${bookingStatus}` : null,
              subscriptionStatus !== 'all' ? `Sub Status: ${subscriptionStatus}` : null,
              zone.trim() ? `Zone: ${zone.trim()}` : null,
            ].filter(Boolean),
          },
        });
        setHasGenerated(true);
        toast?.success?.('Platform Admin report generated.');
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
      toast?.error?.(err.response?.data?.message || 'Could not generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (format) => {
    if (!reportData) return;
    setExporting(true);
    try {
      if (format === 'csv') exportCsv(reportData);
      else if (format === 'excel') await exportExcel(reportData);
      else if (format === 'pdf') await exportPdf(reportData, { companyName: 'FuelDirect Platform Admin' });
      else if (format === 'print') window.print();
    } catch (err) {
      console.error('Export failed:', err);
      toast?.error?.('Failed to export report.');
    } finally {
      setExporting(false);
    }
  };

  const chartData = useMemo(() => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) return null;
    if (['platform_summary', 'revenue'].includes(reportType)) {
      return reportData.rows.slice(0, 15).reverse().map((r) => ({
        name: r.date || 'Day',
        Orders: r.total_orders || r.orders_count || 0,
        Revenue: r.daily_revenue || r.gross_order_volume || r.total_revenue || 0,
      }));
    }
    return null;
  }, [reportData, reportType]);

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Platform Report Generator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
          System-wide administrative reports based strictly on platform management database data.
        </p>
      </div>

      {/* ── Selection Parameters Card ── */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Filter size={18} className="text-primary-600" />
          <h3 className="font-bold text-base text-slate-900 dark:text-white">Admin Report Parameters</h3>
        </div>

        <form onSubmit={handleGenerateReport} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Report Type */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Report Type <span className="text-rose-500">*</span>
              </label>
              <select
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                {ADMIN_REPORT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Date Range Preset */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Date Range <span className="text-rose-500">*</span>
              </label>
              <select
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
              >
                {DATE_PRESETS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Date Range Pickers */}
          {datePreset === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">From Date</label>
                <input
                  type="date"
                  required
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">To Date</label>
                <input
                  type="date"
                  required
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Admin Optional Filters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            {/* Vendor Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Vendor</label>
              <select
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">All Vendors</option>
                {vendorsList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.business_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Customer</label>
              <select
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">All Customers</option>
                {customersList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.username}
                  </option>
                ))}
              </select>
            </div>

            {/* Driver Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Driver</label>
              <select
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">All Drivers</option>
                {driversList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || d.username}
                  </option>
                ))}
              </select>
            </div>

            {/* Worker Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Worker</label>
              <select
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
              >
                <option value="">All Workers</option>
                {workersList.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name || w.username}
                  </option>
                ))}
              </select>
            </div>

            {/* Order Status */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Order Status</label>
              <select
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value)}
              >
                <option value="all">All Orders</option>
                <option value="pending">Pending</option>
                <option value="accepted">Preparing</option>
                <option value="on_the_way">On The Way</option>
                <option value="delivered">Delivered</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Booking Status */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Booking Status</label>
              <select
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                value={bookingStatus}
                onChange={(e) => setBookingStatus(e.target.value)}
              >
                <option value="all">All Bookings</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Subscription Status */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Subscription Status</label>
              <select
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                value={subscriptionStatus}
                onChange={(e) => setSubscriptionStatus(e.target.value)}
              >
                <option value="all">All Subs</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* CTA Generate Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={generating}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
              Generate Report
            </button>
          </div>
        </form>
      </div>

      {/* ── Admin Report Preview Panel ── */}
      {hasGenerated && reportData ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-6">
          {/* Header & Export Actions Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{reportData.meta.title}</h2>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                Date Range: <strong>{reportData.meta.from}</strong> to <strong>{reportData.meta.to}</strong>
              </p>
              {reportData.meta.applied_filters.length > 0 && (
                <p className="text-[11px] text-primary-600 dark:text-primary-400 font-semibold mt-0.5">
                  Filters: {reportData.meta.applied_filters.join(' | ')}
                </p>
              )}
              <p className="text-[11px] text-slate-400 mt-0.5">
                Generated Date: {new Date(reportData.meta.generated_at).toLocaleString()} • Total Records: <strong>{reportData.rows?.length || 0}</strong>
              </p>
            </div>

            {/* Export Toolbar */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport('pdf')}
                disabled={exporting}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              >
                <FileText size={14} /> PDF
              </button>
              <button
                onClick={() => handleExport('excel')}
                disabled={exporting}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Download size={14} /> Excel
              </button>
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Download size={14} /> CSV
              </button>
              <button
                onClick={() => handleExport('print')}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Printer size={14} /> Print
              </button>
            </div>
          </div>

          {/* Admin Summary Metrics Grid */}
          {reportData.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(reportData.summary).map(([k, v]) => {
                const label = k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
                const isMoney = k.includes('revenue') || k.includes('sales') || k.includes('spent') || k.includes('fees') || k.includes('subscription');
                return (
                  <div key={k} className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                    <h4 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
                      {isMoney ? money(v) : v}
                    </h4>
                  </div>
                );
              })}
            </div>
          )}

          {/* Useful Chart (if summary or revenue report) */}
          {chartData && (
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Trend Chart</h4>
              <div style={{ height: '220px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }} />
                    <Bar dataKey="Orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Detailed Admin Table */}
          <div className="overflow-x-auto">
            {reportData.rows && reportData.rows.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {reportData.columns.map((c) => (
                      <th key={c.key} className="px-4 py-3">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                  {reportData.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      {reportData.columns.map((c) => {
                        const val = row[c.key];
                        if (c.type === 'money') {
                          return (
                            <td key={c.key} className="px-4 py-3 font-extrabold text-emerald-600 dark:text-emerald-400">
                              {money(val)}
                            </td>
                          );
                        }
                        return (
                          <td key={c.key} className="px-4 py-3">
                            {val ?? '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-xs font-bold text-slate-400">
                No matching system records found for this report configuration.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="py-16 text-center text-xs font-bold text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          Select Report Type, Date Range, apply optional filters, and click <strong>Generate Report</strong> to view the Admin report.
        </div>
      )}
    </div>
  );
};

export default AdminReports;
