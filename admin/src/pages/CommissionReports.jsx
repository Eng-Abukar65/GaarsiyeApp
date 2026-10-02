import React from 'react';
import api from '../utils/api';
import {
  Download,
  DollarSign,
  TrendingUp,
  CheckCircle,
  Clock,
  Search,
  RefreshCw
} from 'lucide-react';
import { useToast, PageLoader, ErrorState, EmptyState } from '../components/ui';

const StatCard = ({ label, value, icon: Icon, colorClass, sub }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</h3>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-10 h-10 ${colorClass} rounded-lg flex items-center justify-center`}>
        <Icon size={20} className="text-white" />
      </div>
    </div>
  </div>
);

const CommissionReportsPage = () => {
  const toast = useToast();
  const [commissions, setCommissions] = React.useState([]);
  const [summary, setSummary] = React.useState(null);
  const [vendors, setVendors] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  // Filters
  const [filterVendor, setFilterVendor] = React.useState('all');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [filterFrom, setFilterFrom] = React.useState('');
  const [filterTo, setFilterTo] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [commRes, summaryRes, vendorRes] = await Promise.all([
        api.get('/admin/commissions'),
        api.get('/admin/commissions/summary'),
        api.get('/admin/vendors')
      ]);
      setCommissions(commRes.data || []);
      setSummary(summaryRes.data || {});
      setVendors(vendorRes.data || []);
    } catch (err) {
      console.error('Commission fetch error:', err);
      setError(err.response?.data?.message || 'Failed to load commission data.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  const filteredCommissions = React.useMemo(() => {
    return (commissions || []).filter(c => {
      if (filterVendor !== 'all' && String(c.vendor_id) !== filterVendor) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (filterFrom && new Date(c.created_at) < new Date(filterFrom)) return false;
      if (filterTo && new Date(c.created_at) > new Date(filterTo + 'T23:59:59')) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          String(c.order_id || '').includes(term) ||
          (c.vendor_name || '').toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [commissions, filterVendor, filterStatus, filterFrom, filterTo, searchTerm]);

  const handleExport = () => {
    if (filteredCommissions.length === 0) {
      toast.info('No data to export.');
      return;
    }
    const headers = ['Commission ID', 'Order ID', 'Vendor', 'Order Amount', 'Vendor Net Amount', 'Admin Commission', 'Status', 'Date'];
    const rows = filteredCommissions.map(c => [
      c.id,
      c.order_id,
      c.vendor_name || c.vendor_id,
      `$${Number(c.order_amount || 0).toFixed(2)}`,
      `$${Number(c.vendor_net_amount || 0).toFixed(2)}`,
      `$${Number(c.admin_commission || 0).toFixed(2)}`,
      c.status,
      c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commission_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'paid': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'pending': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20';
      case 'failed': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      default: return 'text-slate-500 bg-slate-50 dark:bg-slate-800';
    }
  };

  const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (loading) return <PageLoader label="Loading commissions..." />;

  if (error) {
    return <ErrorState title="Failed to load commissions" message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Commission Reports</h2>
          <p className="text-slate-500 text-sm">Track admin commissions, vendor payouts, and settlement status.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold hover:bg-primary-700 transition-colors"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Commissions"
          value={fmt(summary?.total_admin_commission)}
          sub={`${summary?.total_records || 0} records`}
          icon={DollarSign}
          colorClass="bg-indigo-600"
        />
        <StatCard
          label="Paid Out"
          value={fmt(summary?.paid_commission)}
          sub={`${summary?.paid_count || 0} transactions`}
          icon={CheckCircle}
          colorClass="bg-green-600"
        />
        <StatCard
          label="Pending"
          value={fmt(summary?.pending_commission)}
          sub={`${summary?.pending_count || 0} awaiting`}
          icon={Clock}
          colorClass="bg-amber-500"
        />
        <StatCard
          label="Vendor Payouts"
          value={fmt(summary?.total_vendor_payout)}
          sub="Net amount to vendors"
          icon={TrendingUp}
          colorClass="bg-blue-600"
        />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Filter Records</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search order / vendor..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 pl-9 pr-4 text-xs focus:outline-primary-600"
            />
          </div>
          <select
            value={filterVendor}
            onChange={e => setFilterVendor(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 px-3 text-xs font-medium focus:outline-primary-600"
          >
            <option value="all">All Vendors</option>
            {vendors.map(v => (
              <option key={v.id} value={String(v.id)}>
                {v.business_name || v.name || `Vendor #${v.id}`}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 px-3 text-xs font-medium focus:outline-primary-600"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 px-3 text-xs focus:outline-primary-600"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 px-3 text-xs focus:outline-primary-600"
            />
          </div>
        </div>
        {(filterVendor !== 'all' || filterStatus !== 'all' || filterFrom || filterTo || searchTerm) && (
          <div className="mt-3">
            <button
              onClick={() => { setFilterVendor('all'); setFilterStatus('all'); setFilterFrom(''); setFilterTo(''); setSearchTerm(''); }}
              className="text-xs text-primary-600 hover:underline font-bold"
            >
              Clear all filters
            </button>
            <span className="text-xs text-slate-400 ml-2">— {filteredCommissions.length} of {commissions.length} records</span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
            Showing {filteredCommissions.length} of {commissions.length} commissions
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Commission ID</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order Amount</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor Net</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Admin Commission</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {filteredCommissions.length > 0 ? (
                filteredCommissions.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">#{c.id}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                      <span className="text-primary-600">#{c.order_id}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
                      {c.vendor_name || `Vendor #${c.vendor_id}`}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300">
                      {fmt(c.order_amount)}
                    </td>
                    <td className="px-6 py-4 font-bold text-green-600">
                      {fmt(c.vendor_net_amount)}
                    </td>
                    <td className="px-6 py-4 font-bold text-indigo-600">
                      {fmt(c.admin_commission)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusStyle(c.status)}`}>
                        {c.status || 'pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8">
                    <EmptyState
                      icon={DollarSign}
                      title="No commission records found"
                      subtitle="Try adjusting your filters, or check back after orders are completed."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/20 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Total Admin Revenue from filtered records:{' '}
            <span className="font-bold text-indigo-600">
              {fmt(filteredCommissions.reduce((s, c) => s + Number(c.admin_commission || 0), 0))}
            </span>
          </p>
          <p className="text-xs text-slate-500">
            Total Vendor Payout:{' '}
            <span className="font-bold text-green-600">
              {fmt(filteredCommissions.reduce((s, c) => s + Number(c.vendor_net_amount || 0), 0))}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default CommissionReportsPage;
