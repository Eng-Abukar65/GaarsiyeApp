import React from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { 
  CreditCard, 
  Clock, 
  ShoppingBag, 
  Truck, 
  Users, 
  Store, 
  Wrench, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight,
  ShieldAlert,
  Car,
  FileText
} from 'lucide-react';
import { filterMockData } from '../utils/filterMockData';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const TopStatCard = ({ title, value, subtitle, icon: Icon, trend, trendValue, colorClass }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
    <div className="flex justify-between items-start mb-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</span>
        <h3 className="text-2xl font-black text-slate-900 dark:text-white">{value}</h3>
      </div>
      <div className={`w-10 h-10 ${colorClass} rounded-lg flex items-center justify-center shadow-sm`}>
        <Icon size={20} className="text-white" />
      </div>
    </div>
    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60">
      {trendValue && trendValue !== '-' ? (
        <div className={`inline-flex items-center gap-1 text-[11px] font-bold ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-400'}`}>
          {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{trendValue}</span>
          <span className="text-[10px] text-slate-400 font-normal ml-0.5">vs prev period</span>
        </div>
      ) : (
        <span className="text-[10px] text-slate-400 font-medium">{subtitle || 'Live system data'}</span>
      )}
      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">Live</span>
    </div>
  </div>
);

const AdminDashboard = () => {
  const navigate = useNavigate();

  const [stats, setStats] = React.useState({
    subscriptionRevenue: 0,
    subscriptionRevenueTrend: '0%',
    subscriptionRevenueTrendDir: 'up',
    pendingSubscriptions: 0,
    approvedSubscriptions: 0,
    totalSubscriptionRevenueAllTime: 0,
    activeOrders: 0,
    onlineDrivers: 0,
    totalDrivers: 0,
    totalUsers: 0,
    totalVendors: 0,
    approvedVendors: 0,
    pendingVendors: 0,
    rejectedVendors: 0,
    suspendedVendors: 0,
    totalOrders: 0,
    pendingOrders: 0,
    activeDeliveries: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    carServicesBookings: 0,
    carServices: { pending: 0, awaitingWorker: 0, inProgress: 0, completed: 0, cancelled: 0, totalBookings: 0 },
    activeCarWorkers: 0,
    revenueTrends: [],
    vendorsByType: [],
    recentSubscriptions: [],
    pendingVendorsList: [],
    recentOrders: []
  });

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [activePeriod, setActivePeriod] = React.useState('month');
  const [isDark, setIsDark] = React.useState(document.documentElement.classList.contains('dark'));

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const fetchStats = React.useCallback(async (period = activePeriod, showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await api.get(`/admin/stats?period=${period}`);
      const data = response.data || {};
      setStats(prev => ({
        ...prev,
        ...data,
        revenueTrends: Array.isArray(data.revenueTrends) ? data.revenueTrends : [],
        vendorsByType: Array.isArray(data.vendorsByType) ? data.vendorsByType : [],
        recentSubscriptions: filterMockData(data.recentSubscriptions || []),
        pendingVendorsList: filterMockData(data.pendingVendorsList || []),
        recentOrders: filterMockData(data.recentOrders || [])
      }));
      setError(null);
    } catch (err) {
      console.error('Failed to fetch stats', err);
      setError(err.response?.data?.message || 'Connection to backend failed');
    } finally {
      setLoading(false);
    }
  }, [activePeriod]);

  React.useEffect(() => {
    fetchStats(activePeriod, true);
    const interval = setInterval(() => {
      fetchStats(activePeriod, false);
    }, 30000);
    return () => clearInterval(interval);
  }, [activePeriod, fetchStats]);

  if (loading && !(stats.revenueTrends || []).length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Loading Admin Dashboard...</p>
      </div>
    );
  }

  if (error && !(stats.revenueTrends || []).length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 text-center">
        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center shadow-lg">
          <AlertTriangle size={32} />
        </div>
        <div className="space-y-2">
          <h4 className="text-xl font-bold text-slate-900 dark:text-white">Data Sync Failed</h4>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">{error}</p>
        </div>
        <button
          onClick={() => fetchStats(activePeriod, true)}
          className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-sm"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const chartColors = {
    stroke: '#3B82F6',
    grid: isDark ? '#1E293B' : '#E2E8F0',
    tick: isDark ? '#64748B' : '#64748B',
    tooltipBg: isDark ? '#0F172A' : '#FFFFFF',
    tooltipBorder: isDark ? '#334155' : '#E2E8F0',
    tooltipText: isDark ? '#F8FAFC' : '#0F172A'
  };

  const getSubStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'approved') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (s === 'rejected') return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  };

  const getOrderStatusBadge = (status) => {
    const s = String(status || '').toLowerCase().replace(/ /g, '_');
    if (['delivered', 'completed'].includes(s)) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (['cancelled', 'failed'].includes(s)) return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    if (['pending', 'processing'].includes(s)) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <TopStatCard
          title="Total Subscription Revenue"
          value={`$${Number(stats.subscriptionRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={CreditCard}
          trend={stats.subscriptionRevenueTrendDir}
          trendValue={stats.subscriptionRevenueTrend}
          colorClass="bg-blue-600"
        />
        <TopStatCard
          title="Pending Subscription Payments"
          value={String(stats.pendingSubscriptions ?? 0)}
          subtitle="Awaiting review in Settlements"
          icon={Clock}
          trend={null}
          trendValue="-"
          colorClass="bg-amber-500"
        />
        <TopStatCard
          title="Active Orders"
          value={String(stats.activeOrders ?? 0)}
          subtitle="Orders in progress"
          icon={ShoppingBag}
          trend={null}
          trendValue="-"
          colorClass="bg-indigo-600"
        />
        <TopStatCard
          title="Online Drivers"
          value={`${stats.onlineDrivers ?? 0} / ${stats.totalDrivers ?? 0}`}
          subtitle="Live on duty"
          icon={Truck}
          trend={null}
          trendValue="-"
          colorClass="bg-emerald-600"
        />
      </div>

      {/* 2. PLATFORM OVERVIEW */}
      <div>
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">Platform Overview</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Users', value: stats.totalUsers ?? 0, icon: Users },
            { label: 'Total Vendors', value: stats.totalVendors ?? 0, icon: Store },
            { label: 'Approved Vendors', value: stats.approvedVendors ?? 0, tone: 'text-emerald-500' },
            { label: 'Pending Vendors', value: stats.pendingVendors ?? 0, tone: 'text-amber-500' },
            { label: 'Rejected Vendors', value: stats.rejectedVendors ?? 0, tone: 'text-rose-500' },
            { label: 'Suspended Vendors', value: stats.suspendedVendors ?? 0, tone: 'text-slate-400' },
            { label: 'Total Orders', value: stats.totalOrders ?? 0 },
            { label: 'Pending Orders', value: stats.pendingOrders ?? 0, tone: 'text-amber-500' },
            { label: 'Active Deliveries', value: stats.activeDeliveries ?? 0, tone: 'text-blue-500' },
            { label: 'Completed Orders', value: stats.completedOrders ?? 0, tone: 'text-emerald-500' },
            { label: 'Cancelled Orders', value: stats.cancelledOrders ?? 0, tone: 'text-rose-500' },
            { label: 'Car Services Bookings', value: stats.carServicesBookings ?? 0, tone: 'text-purple-500' },
          ].map((m) => (
            <div key={m.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{m.label}</p>
              <p className={`text-xl font-black mt-2 ${m.tone || 'text-slate-900 dark:text-white'}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>



      {/* 4. CHARTS ROW */}
      <div className="grid grid-cols-12 gap-6 items-stretch">
        {/* Revenue Trends (Vendor Monthly Subscriptions Only) */}
        <div className="col-span-12 lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col shadow-sm">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Admin Subscription Revenue</h4>
              <p className="text-xs text-slate-500 mt-0.5">Approved vendor monthly subscription income for selected range</p>
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200 dark:border-slate-700/50">
              {[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'year', label: 'This Year' },
              ].map(p => (
                <button 
                  key={p.id}
                  onClick={() => setActivePeriod(p.id)}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${activePeriod === p.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.revenueTrends || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSubRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: chartColors.tick, fontSize: 10}} dy={10} />
                <YAxis hide />
                <Tooltip 
                  formatter={(val) => [`$${Number(val).toFixed(2)}`, 'Subscription Income']}
                  contentStyle={{ backgroundColor: chartColors.tooltipBg, borderRadius: '8px', border: `1px solid ${chartColors.tooltipBorder}`, color: chartColors.tooltipText, fontSize: '11px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="value" stroke={chartColors.stroke} strokeWidth={3} fillOpacity={1} fill="url(#colorSubRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Vendors by Business Type */}
        <div className="col-span-12 lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-white">Vendors by Business Type</h4>
            <p className="text-xs text-slate-500 mt-0.5">Distribution across key service modules</p>
          </div>
          
          <div className="my-4 relative min-h-[200px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={stats?.vendorsByType || []} cx="50%" cy="50%" innerRadius={55} outerRadius={78} paddingAngle={4} dataKey="value" stroke="none">
                  {(stats?.vendorsByType || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val) => [`${val} Vendors`, 'Count']}
                  contentStyle={{ backgroundColor: chartColors.tooltipBg, borderRadius: '8px', border: `1px solid ${chartColors.tooltipBorder}`, color: chartColors.tooltipText, fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats?.totalVendors ?? 0}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendors</span>
            </div>
          </div>
          
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-4">
            {(stats?.vendorsByType || []).map((type) => (
              <div key={type.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: type.color }} />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{type.name}</span>
                </div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">{type.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. RECENT SUBSCRIPTION PAYMENTS & PENDING VENDORS */}
      <div className="grid grid-cols-12 gap-6">
        {/* Recent Subscription Payments */}
        <div className="col-span-12 lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">Recent Subscription Payments</h4>
              <p className="text-xs text-slate-500">Latest vendor subscription submissions</p>
            </div>
            <button 
              onClick={() => navigate('/admin/settlements')}
              className="text-xs font-bold text-blue-500 hover:text-blue-600 inline-flex items-center gap-1"
            >
              View All <ArrowRight size={14} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Plan</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Method</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {stats?.recentSubscriptions?.length > 0 ? (
                  stats.recentSubscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">{sub.vendor_name}</td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-semibold">{sub.plan_name}</td>
                      <td className="px-5 py-3.5 font-black text-slate-900 dark:text-white">${Number(sub.amount).toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-slate-500 font-medium">{sub.payment_method}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getSubStatusBadge(sub.status)}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-xs text-slate-500 font-medium">
                      No subscription payments submitted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vendors Awaiting Approval */}
        <div className="col-span-12 lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Vendors Awaiting Approval</h4>
                <p className="text-xs text-slate-500">{stats.pendingVendors ?? 0} pending applications</p>
              </div>
              <button 
                onClick={() => navigate('/admin/vendors')}
                className="text-xs font-bold text-blue-500 hover:text-blue-600"
              >
                Manage
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {stats?.pendingVendorsList?.length > 0 ? (
                stats.pendingVendorsList.map((pv) => (
                  <div key={pv.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <div>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white">{pv.business_name}</h5>
                      <p className="text-[11px] text-slate-500">{pv.email}</p>
                    </div>
                    <button
                      onClick={() => navigate('/admin/vendors')}
                      className="px-3 py-1 bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white rounded-lg text-[10px] font-bold transition-all"
                    >
                      Review
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-500 font-medium">
                  All vendor accounts are verified. No pending approvals.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 6. LIVE ORDERS & DELIVERIES ACTIVITY */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">Live Platform Orders</h4>
            <p className="text-xs text-slate-500">Monitoring customer orders across vendors</p>
          </div>
          <button 
            onClick={() => navigate('/admin/operations')}
            className="text-xs font-bold text-blue-500 hover:text-blue-600 inline-flex items-center gap-1"
          >
            Dispatch Monitor <ArrowRight size={14} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {stats?.recentOrders?.length > 0 ? (
                stats.recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">#{String(order.id ?? '').padStart(5, '0')}</td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">{order.customer_name}</td>
                    <td className="px-6 py-4 text-slate-500 font-medium">{order.vendor_name || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getOrderStatusBadge(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-xs text-slate-500 font-medium">
                    No orders registered yet. New customer orders will appear here automatically.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
