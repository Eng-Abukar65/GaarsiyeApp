import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  Download,
  CheckCircle2,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  DollarSign,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../utils/api';
import { hasBusinessType, resolveBusinessTypes } from '../../utils/businessType';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const fmt = (value, decimals = 0) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const fmtMoney = (value) => `$${fmt(value, 2)}`;

const toLocalISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayISO = () => toLocalISODate(new Date());

const getCurrentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const getMondayISO = () => {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return toLocalISODate(date);
};

const getPeriodLabel = (period, filters) => {
  if (period === 'daily') return new Date(`${filters.date}T00:00:00`).toLocaleDateString();
  if (period === 'weekly') {
    const start = new Date(`${filters.weekStart}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }
  if (period === 'monthly') {
    const [year, month] = filters.month.split('-');
    return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
  }
  return String(filters.year);
};

const getPeriodRange = (period, filters) => {
  if (period === 'daily') {
    return { start: filters.date, end: filters.date };
  }

  if (period === 'weekly') {
    const start = new Date(`${filters.weekStart}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      start: toLocalISODate(start),
      end: toLocalISODate(end),
    };
  }

  if (period === 'monthly') {
    const [year, month] = filters.month.split('-').map((item) => Number(item));
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return {
      start: toLocalISODate(start),
      end: toLocalISODate(end),
    };
  }

  const year = Number(filters.year);
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
};

const inRange = (dateLike, range) => {
  const day = String(dateLike || '').slice(0, 10);
  return day >= range.start && day <= range.end;
};

const downloadExcel = (filename, rows, sheetName = 'Report') => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const colWidths = rows.reduce((acc, row) => {
    row.forEach((cell, index) => {
      const length = String(cell ?? '').length;
      acc[index] = Math.max(acc[index] || 10, Math.min(length + 2, 48));
    });
    return acc;
  }, []);
  ws['!cols'] = colWidths.map((width) => ({ wch: width }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const normalizeSummary = (report, period) => {
  const source = period === 'daily'
    ? report?.summary
    : period === 'weekly'
      ? report?.this_week
      : period === 'monthly'
        ? report?.this_month
        : report?.this_year;

  return {
    total_orders: Number(source?.total_orders || 0),
    completed_orders: Number(source?.completed_deliveries ?? source?.completed_orders ?? 0),
    cancelled_orders: Number(source?.cancelled_orders || 0),
    customer_count: Number(source?.customer_count || 0),
    gross_sales: Number(source?.total_sales ?? source?.total_revenue ?? 0),
    net_sales: Number(source?.net_revenue ?? source?.total_revenue ?? 0),
    delivery_fees: Number(source?.total_delivery_fees ?? 0),
  };
};

const normalizeTimeline = (report, period) => {
  if (!report) return [];

  if (period === 'daily') {
    return (report.hourly_chart || []).map((row) => ({
      label: `${String(row.hour).padStart(2, '0')}:00`,
      orders: Number(row.orders || 0),
      revenue: Number(row.revenue || 0),
      sortKey: Number(row.hour || 0),
    }));
  }

  if (period === 'weekly') {
    return (report.daily_chart || []).map((row, index) => ({
      label: row.day_name ? row.day_name.slice(0, 3) : String(row.date || '').slice(5, 10),
      orders: Number(row.orders || 0),
      revenue: Number(row.revenue || 0),
      sortKey: index,
    }));
  }

  if (period === 'monthly') {
    return (report.daily_chart || []).map((row, index) => ({
      label: String(new Date(row.date).getDate()),
      orders: Number(row.orders || 0),
      revenue: Number(row.revenue || 0),
      sortKey: index,
    }));
  }

  return (report.monthly_chart || []).map((row) => ({
    label: row.month_name || MONTH_NAMES[Number(row.month_index || 1) - 1] || String(row.month_index),
    orders: Number(row.orders || 0),
    revenue: Number(row.revenue || 0),
    sortKey: Number(row.month_index || 0),
  }));
};

const groupPurchases = (rows, period) => {
  const buckets = new Map();

  rows.forEach((row) => {
    const sourceDate = row.created_at || row.purchase_date;
    const date = new Date(sourceDate);
    if (Number.isNaN(date.getTime())) return;

    let key = '';
    let label = '';
    let sortKey = 0;

    if (period === 'daily') {
      key = `${date.getHours()}`;
      label = `${String(date.getHours()).padStart(2, '0')}:00`;
      sortKey = date.getHours();
    } else if (period === 'weekly') {
      key = String(row.purchase_date || '').slice(0, 10);
      label = date.toLocaleDateString(undefined, { weekday: 'short' });
      sortKey = date.getTime();
    } else if (period === 'monthly') {
      key = String(row.purchase_date || '').slice(0, 10);
      label = String(date.getDate());
      sortKey = date.getDate();
    } else {
      key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      label = MONTH_NAMES[date.getMonth()];
      sortKey = date.getMonth();
    }

    const current = buckets.get(key) || {
      label,
      amount: 0,
      count: 0,
      units: 0,
      sortKey,
    };

    current.amount += Number(row.total_amount || 0);
    current.count += 1;
    current.units += Number(row.quantity || 0);
    buckets.set(key, current);
  });

  return [...buckets.values()].sort((a, b) => a.sortKey - b.sortKey);
};

const CustomTooltip = ({ active, payload, label, moneyKeys = ['revenue', 'amount'] }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-xl rounded-xl px-4 py-3 text-xs min-w-[120px]">
      <p className="font-bold text-gray-600 mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1 text-gray-500 capitalize">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-bold text-gray-800">
            {moneyKeys.includes(entry.dataKey) ? fmtMoney(entry.value) : fmt(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const SectionTitle = ({ title, subtitle, action }) => (
  <div className="flex items-start justify-between gap-4 mb-4">
    <div>
      <h3 className="text-base font-bold text-gray-800">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

const CardShell = ({ title, subtitle, children, action, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 ${className}`}>
    <SectionTitle title={title} subtitle={subtitle} action={action} />
    {children}
  </div>
);

const MetricCard = ({ label, value, sub, icon: Icon, accent = 'blue' }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ring-1 ring-gray-50">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
        {Icon && (
          <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${colors[accent] || colors.blue}`}>
            <Icon size={18} />
          </span>
        )}
      </div>
      <p className="text-3xl font-extrabold text-gray-900 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-2">{sub}</p>}
    </div>
  );
};

const TopProductsTable = ({ products }) => (
  <div className="overflow-hidden rounded-xl border border-gray-100">
    {products.length === 0 ? (
      <div className="p-8 text-center text-xs text-gray-300 font-bold uppercase tracking-widest">No product data</div>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            <th className="px-4 py-3 text-left">Product</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product, index) => (
            <tr key={index} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3 font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {index + 1}
                </span>
                {product.name}
              </td>
              <td className="px-4 py-3 text-right text-gray-600 font-medium">{fmt(product.total_qty)}</td>
              <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmtMoney(product.total_revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const PurchasesTable = ({ purchases }) => (
  <div className="overflow-hidden rounded-xl border border-gray-100">
    {purchases.length === 0 ? (
      <div className="p-8 text-center text-xs text-gray-300 font-bold uppercase tracking-widest">No purchases in range</div>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            <th className="px-4 py-3 text-left">Supplier</th>
            <th className="px-4 py-3 text-left">Product</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Spent</th>
          </tr>
        </thead>
        <tbody>
          {purchases.slice(0, 8).map((purchase) => (
            <tr key={purchase.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3 font-semibold text-gray-800">
                <div>{purchase.supplier_name || 'Supplier'}</div>
                <div className="text-[10px] text-gray-400 mt-1">{purchase.supplier_email || purchase.supplier_phone || ''}</div>
              </td>
              <td className="px-4 py-3 text-gray-600">{purchase.product_name || '-'}</td>
              <td className="px-4 py-3 text-right text-gray-600 font-medium">{fmt(purchase.quantity)}</td>
              <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmtMoney(purchase.total_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const InventoryTable = ({ rows }) => (
  <div className="overflow-hidden rounded-xl border border-gray-100">
    {rows.length === 0 ? (
      <div className="p-8 text-center text-xs text-gray-300 font-bold uppercase tracking-widest">No inventory alerts</div>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            <th className="px-4 py-3 text-left">Product</th>
            <th className="px-4 py-3 text-right">Stock</th>
            <th className="px-4 py-3 text-right">Reorder</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3 font-semibold text-gray-800">{row.name}</td>
              <td className="px-4 py-3 text-right text-gray-600 font-medium">{fmt(row.stock)}</td>
              <td className="px-4 py-3 text-right text-gray-600 font-medium">{fmt(row.reorder_level)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const Spinner = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-10 h-10 rounded-full border-4 border-blue-100 border-t-blue-500 animate-spin" />
  </div>
);

const ErrorState = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-24 gap-4">
    <p className="text-sm text-rose-600 font-semibold max-w-sm text-center">{message}</p>
    <button
      onClick={onRetry}
      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95"
    >
      Retry
    </button>
  </div>
);

const ReportsAnalytics = () => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  const businessTypes = resolveBusinessTypes(null, user);
  const isCarWashBusiness = hasBusinessType(businessTypes, 'Car Services') || hasBusinessType(businessTypes, 'Car Wash');
  const isCarWashOnly = isCarWashBusiness && !hasBusinessType(businessTypes, 'Petrol Station') && !hasBusinessType(businessTypes, 'Gas Depot') && !hasBusinessType(businessTypes, 'Spare Parts Shop');
  const [period, setPeriod] = useState('monthly');
  const [date, setDate] = useState(todayISO());
  const [weekStart, setWeekStart] = useState(getMondayISO());
  const [month, setMonth] = useState(getCurrentMonthValue());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [report, setReport] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [supportLoading, setSupportLoading] = useState(true);
  const [supportError, setSupportError] = useState('');
  const [error, setError] = useState('');

  const loadSupportData = useCallback(async () => {
    if (!user?.id) return;
    setSupportLoading(true);
    try {
      const [purchaseRes, inventoryRes] = await Promise.all([
        api.get(`/vendor/purchases?vendorId=${user.id}`),
        api.get(`/vendor/inventory?vendorId=${user.id}`),
      ]);
      setPurchases(purchaseRes.data || []);
      setInventory(inventoryRes.data || []);
      setSupportError('');
    } catch (err) {
      console.error('Failed to load support data', err);
      setPurchases([]);
      setInventory([]);
      setSupportError('Purchases or inventory data could not be loaded.');
    } finally {
      setSupportLoading(false);
    }
  }, [user?.id]);

  const loadReport = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    setError('');
    try {
      let url = '';
      if (period === 'daily') {
        url = `/vendor/reports/daily?date=${date}`;
      } else if (period === 'weekly') {
        url = `/vendor/reports/weekly?week_start=${weekStart}`;
      } else if (period === 'monthly') {
        const [y, m] = month.split('-');
        url = `/vendor/reports/monthly?year=${Number(y)}&month=${Number(m)}`;
      } else {
        url = `/vendor/reports/yearly?year=${Number(year)}`;
      }

      const response = await api.get(url);
      setReport(response.data || null);
    } catch (err) {
      console.error('Failed to load report', err);
      setReport(null);
      setError(err.response?.data?.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [date, month, period, weekStart, year, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    loadSupportData();
  }, [loadSupportData, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setSupportLoading(false);
      return;
    }

    loadReport();
  }, [loadReport, user?.id]);

  const range = useMemo(() => getPeriodRange(period, { date, weekStart, month, year }), [date, month, period, weekStart, year]);
  const periodLabel = useMemo(() => getPeriodLabel(period, { date, weekStart, month, year }), [date, month, period, weekStart, year]);

  const summary = useMemo(() => normalizeSummary(report, period), [period, report]);
  const orderTimeline = useMemo(() => normalizeTimeline(report, period), [period, report]);
  const topProducts = useMemo(() => (report?.top_products || []).slice(0, 8), [report]);

  const filteredPurchases = useMemo(() => {
    return purchases
      .filter((purchase) => inRange(purchase.purchase_date || purchase.created_at, range))
      .sort((a, b) => new Date(b.created_at || b.purchase_date) - new Date(a.created_at || a.purchase_date));
  }, [purchases, range]);

  const purchaseTimeline = useMemo(() => groupPurchases(filteredPurchases, period), [filteredPurchases, period]);

  const purchaseSummary = useMemo(() => {
    const totalSpent = filteredPurchases.reduce((sum, purchase) => sum + Number(purchase.total_amount || 0), 0);
    const totalUnits = filteredPurchases.reduce((sum, purchase) => sum + Number(purchase.quantity || 0), 0);
    const supplierCount = new Set(filteredPurchases.map((purchase) => purchase.supplier_id)).size;

    return {
      totalSpent,
      purchaseCount: filteredPurchases.length,
      averagePurchase: filteredPurchases.length > 0 ? totalSpent / filteredPurchases.length : 0,
      totalUnits,
      supplierCount,
    };
  }, [filteredPurchases]);

  const lowStockItems = useMemo(() => {
    return [...inventory]
      .map((item) => ({
        ...item,
        stock: Number(item.stock || 0),
        reorder_level: Number(item.reorder_level || 0),
      }))
      .filter((item) => item.stock <= item.reorder_level)
      .sort((a, b) => a.stock - b.stock);
  }, [inventory]);

  const inventorySummary = useMemo(() => {
    const currentStock = inventory.reduce((sum, item) => sum + Number(item.stock || 0), 0);
    const inventoryValue = inventory.reduce(
      (sum, item) => sum + (Number(item.stock || 0) * Number(item.cost_price || 0)),
      0
    );
    const receivedUnits = filteredPurchases.reduce((sum, purchase) => sum + Number(purchase.quantity || 0), 0);
    return {
      currentStock,
      inventoryValue,
      receivedUnits,
      lowStockCount: lowStockItems.length,
      outOfStockCount: inventory.filter((item) => Number(item.stock || 0) <= 0).length,
    };
  }, [filteredPurchases, inventory, lowStockItems.length]);

  const topProduct = topProducts[0] || null;
  const productTotalRevenue = summary.gross_sales;
  const completedOrders = summary.completed_orders;
  const avgOrderValue = summary.total_orders > 0 ? summary.gross_sales / summary.total_orders : 0;

  const spendingTrend = useMemo(() => purchaseTimeline.map((row) => ({
    label: row.label,
    amount: row.amount,
    count: row.count,
    units: row.units,
  })), [purchaseTimeline]);

  const lowStockChart = useMemo(() => lowStockItems.slice(0, 8).map((item) => ({
    label: item.name,
    stock: item.stock,
  })), [lowStockItems]);

  const handleExport = () => {
    if (!report) return;

    const rows = [
      ['VENDOR REPORT SUMMARY'],
      ['Period', periodLabel],
      ['Exported At', new Date().toLocaleString()],
      [],
      ['ORDERS'],
      ['Total Orders', summary.total_orders],
      ['Completed Orders', summary.completed_orders],
      ['Cancelled Orders', summary.cancelled_orders],
      ['Customers', summary.customer_count],
      ['Gross Sales', fmtMoney(summary.gross_sales)],
      ['Net Sales', fmtMoney(summary.net_sales)],
      ['Delivery Fees', fmtMoney(summary.delivery_fees)],
      [],
      ['PRODUCTS'],
      ['Product', 'Quantity', 'Revenue'],
      ...topProducts.map((product) => [product.name, product.total_qty || 0, fmtMoney(product.total_revenue)]),
      [],
      ['SPENDING'],
      ['Total Spent', fmtMoney(purchaseSummary.totalSpent)],
      ['Purchase Count', purchaseSummary.purchaseCount],
      ['Average Purchase', fmtMoney(purchaseSummary.averagePurchase)],
      ['Stock Received', purchaseSummary.totalUnits],
      [],
      ['RECENT PURCHASES'],
      ['Supplier', 'Product', 'Qty', 'Spent'],
      ...filteredPurchases.slice(0, 10).map((purchase) => [
        purchase.supplier_name || 'Supplier',
        purchase.product_name || '-',
        purchase.quantity || 0,
        fmtMoney(purchase.total_amount),
      ]),
      [],
      ['INVENTORY'],
      ['Current Stock', inventorySummary.currentStock],
      ['Inventory Value', fmtMoney(inventorySummary.inventoryValue)],
      ['Low Stock Items', inventorySummary.lowStockCount],
      ['Out of Stock', inventorySummary.outOfStockCount],
      [],
      ['ORDER TREND'],
      ['Label', 'Orders', 'Revenue'],
      ...orderTimeline.map((row) => [row.label, row.orders, fmtMoney(row.revenue)]),
    ];

    const safeLabel = periodLabel.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    downloadExcel(`vendor-report-${period}-${safeLabel}.xlsx`, rows, 'Vendor Report');
  };

  if (!user?.id) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-rose-50 border border-rose-200 rounded-3xl text-center shadow-lg">
        <h2 className="text-2xl font-bold text-rose-700 mb-4">Authentication Required</h2>
        <p className="text-gray-500 mb-6">No vendor session found. Please sign in to access reports.</p>
        <button
          onClick={() => window.location.href = '/login'}
          className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
        >
          Go to Login
        </button>
      </div>
    );
  }

  if (isCarWashOnly) {
    const carWashServicesCount = topProducts.length;
    const carWashBookings = Number(summary.total_orders || 0);
    const carWashRevenue = Number(summary.gross_sales || 0);
    const averageBookingValue = carWashBookings > 0 ? carWashRevenue / carWashBookings : 0;

    return (
      <div className="max-w-7xl mx-auto py-4 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Car Services Reports &amp; Analytics</h2>
            <p className="text-sm text-gray-400 mt-1">
              Booking performance, service revenue, and Car Services package insights by period.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={!report}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <Download size={14} />
              Export Excel
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 bg-gray-100/80 p-1 rounded-2xl w-fit">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              onClick={() => setPeriod(item.key)}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${
                period === item.key ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Range</label>
          <span className="ml-auto text-xs font-bold text-gray-400 uppercase tracking-widest">{periodLabel}</span>
        </div>

        {loading || supportLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={loadReport} />
        ) : (
          <>
            {supportError && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                {supportError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard
                label="Bookings"
                value={fmt(carWashBookings)}
                sub={topProducts[0] ? `Top: ${topProducts[0].name}` : 'Selected period'}
                icon={ClipboardList}
                accent="blue"
              />
              <MetricCard
                label="Revenue"
                value={fmtMoney(carWashRevenue)}
                sub={`${fmt(summary.completed_orders)} completed`}
                icon={DollarSign}
                accent="green"
              />
              <MetricCard
                label="Average Booking"
                value={fmtMoney(averageBookingValue)}
                sub="Revenue per booking"
                icon={TrendingUp}
                accent="amber"
              />
              <MetricCard
                label="Services"
                value={fmt(carWashServicesCount || topProducts.length)}
                sub="Active packages"
                icon={Package}
                accent="rose"
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <CardShell
                title="Booking Trend"
                subtitle="Bookings and revenue for the selected period"
                className="xl:col-span-2"
              >
                <div className="h-72">
                  {orderTimeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={orderTimeline}>
                        <defs>
                          <linearGradient id="carWashGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip moneyKeys={['revenue']} />} />
                        <Legend />
                        <Bar dataKey="orders" name="Bookings" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#carWashGrad)" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-300">
                      <p className="text-xs font-bold uppercase tracking-widest">No booking data</p>
                    </div>
                  )}
                </div>
              </CardShell>

              <CardShell title="Top Services" subtitle="Best performing Car Services packages">
                <TopProductsTable products={topProducts} />
              </CardShell>
            </div>

            <CardShell title="Quick Snapshot" subtitle="Car Services performance summary">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard label="Total Orders" value={fmt(summary.total_orders)} icon={ClipboardList} accent="blue" />
                <MetricCard label="Completed" value={fmt(summary.completed_orders)} icon={CheckCircle2} accent="green" />
                <MetricCard label="Cancelled" value={fmt(summary.cancelled_orders)} icon={AlertTriangle} accent="rose" />
                <MetricCard label="Customers" value={fmt(summary.customer_count)} icon={ShoppingCart} accent="amber" />
              </div>
            </CardShell>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Reports &amp; Analytics</h2>
          <p className="text-sm text-gray-400 mt-1">
            Product, spending, inventory, and orders with daily, weekly, monthly, and yearly views.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!report}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-gray-100/80 p-1 rounded-2xl w-fit">
        {PERIODS.map((item) => (
          <button
            key={item.key}
            onClick={() => setPeriod(item.key)}
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${
              period === item.key ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Range</label>
        {period === 'daily' && (
          <>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
            />
            <button
              onClick={() => setDate(todayISO())}
              className="px-4 py-2 text-xs font-bold bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
            >
              Today
            </button>
          </>
        )}
        {period === 'weekly' && (
          <>
            <input
              type="date"
              value={weekStart}
              max={todayISO()}
              onChange={(e) => setWeekStart(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
            />
            <button
              onClick={() => setWeekStart(getMondayISO())}
              className="px-4 py-2 text-xs font-bold bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
            >
              This Week
            </button>
          </>
        )}
        {period === 'monthly' && (
          <>
            <input
              type="month"
              value={month}
              max={getCurrentMonthValue()}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
            />
            <button
              onClick={() => setMonth(getCurrentMonthValue())}
              className="px-4 py-2 text-xs font-bold bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
            >
              This Month
            </button>
          </>
        )}
        {period === 'yearly' && (
          <>
            <input
              type="number"
              min="2020"
              max={new Date().getFullYear()}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30 w-28"
            />
            <button
              onClick={() => setYear(String(new Date().getFullYear()))}
              className="px-4 py-2 text-xs font-bold bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
            >
              This Year
            </button>
          </>
        )}
        <span className="ml-auto text-xs font-bold text-gray-400 uppercase tracking-widest">
          {periodLabel}
        </span>
      </div>

      {loading || supportLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={loadReport} />
      ) : (
        <>
          {supportError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              {supportError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard
              label="Product Sales"
              value={fmtMoney(productTotalRevenue)}
              sub={topProduct ? `Top: ${topProduct.name}` : 'Based on top products'}
              icon={Package}
              accent="blue"
            />
            <MetricCard
              label="Total Spent"
              value={fmtMoney(purchaseSummary.totalSpent)}
              sub={`${fmt(purchaseSummary.purchaseCount)} purchases`}
              icon={ShoppingCart}
              accent="green"
            />
            <MetricCard
              label="Inventory"
              value={fmt(inventorySummary.currentStock)}
              sub={`${fmt(inventorySummary.receivedUnits)} units received, ${fmt(inventorySummary.lowStockCount)} low stock`}
              icon={Boxes}
              accent="amber"
            />
            <MetricCard
              label="Orders"
              value={fmt(summary.total_orders)}
              sub={`${fmt(completedOrders)} completed, ${fmt(summary.cancelled_orders)} cancelled`}
              icon={ClipboardList}
              accent="rose"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <CardShell
              title="Order Trend"
              subtitle="Revenue and order counts for the selected period"
              className="xl:col-span-2"
              action={(
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Avg order {fmtMoney(avgOrderValue)}
                </span>
              )}
            >
              <div className="h-72">
                {orderTimeline.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={orderTimeline}>
                      <defs>
                        <linearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip moneyKeys={['revenue']} />} />
                      <Legend />
                      <Bar dataKey="orders" name="Orders" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#orderGrad)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-300">
                    <p className="text-xs font-bold uppercase tracking-widest">No order data</p>
                  </div>
                )}
              </div>
            </CardShell>

            <CardShell title="Product Performance" subtitle="Best selling products in the selected range">
              <TopProductsTable products={topProducts} />
            </CardShell>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <CardShell
              title="Total Spent"
              subtitle="Supplier purchases grouped by the selected period"
              action={(
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {fmt(purchaseSummary.supplierCount)} suppliers
                </span>
              )}
            >
              <div className="h-72">
                {spendingTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={spendingTrend}>
                      <defs>
                        <linearGradient id="spentGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip moneyKeys={['amount']} />} />
                      <Area type="monotone" dataKey="amount" name="Spent" stroke="#10b981" strokeWidth={2.5} fill="url(#spentGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-300">
                    <p className="text-xs font-bold uppercase tracking-widest">No purchase data</p>
                  </div>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MetricCard
                  label="Purchases"
                  value={fmt(purchaseSummary.purchaseCount)}
                  sub={`Avg ${fmtMoney(purchaseSummary.averagePurchase)}`}
                  icon={DollarSign}
                  accent="green"
                />
                <MetricCard
                  label="Stock Received"
                  value={fmt(purchaseSummary.totalUnits)}
                  sub="Units bought in period"
                  icon={TrendingUp}
                  accent="blue"
                />
              </div>
            </CardShell>

            <CardShell title="Recent Purchases" subtitle="Latest purchases in the selected range">
              <PurchasesTable purchases={filteredPurchases} />
            </CardShell>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <CardShell
              title="Inventory Health"
              subtitle="Current stock snapshot and low stock alerts"
              className="xl:col-span-2"
              action={(
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Value {fmtMoney(inventorySummary.inventoryValue)}
                </span>
              )}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <MetricCard label="Current Stock" value={fmt(inventorySummary.currentStock)} icon={Boxes} accent="amber" />
                <MetricCard label="Low Stock" value={fmt(inventorySummary.lowStockCount)} sub="Items below reorder level" icon={AlertTriangle} accent="rose" />
                <MetricCard label="Out of Stock" value={fmt(inventorySummary.outOfStockCount)} sub="Immediate restock needed" icon={ArrowUpRight} accent="blue" />
              </div>
              <div className="h-64 mb-5">
                {lowStockChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={lowStockChart} barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip moneyKeys={[]} />} />
                      <Bar dataKey="stock" name="Stock" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-300">
                    <p className="text-xs font-bold uppercase tracking-widest">No low stock items</p>
                  </div>
                )}
              </div>
              <InventoryTable rows={lowStockItems.slice(0, 10)} />
            </CardShell>

            <CardShell title="Report Snapshot" subtitle="Quick summary for this period">
              <div className="space-y-3">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Period</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{periodLabel}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Gross Sales</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{fmtMoney(summary.gross_sales)}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Net Sales</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{fmtMoney(summary.net_sales)}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Customers</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{fmt(summary.customer_count)}</p>
                </div>
              </div>
            </CardShell>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportsAnalytics;
