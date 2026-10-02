import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import { 
  DollarSign, 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  Eye, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ShieldAlert, 
  ArrowLeftRight, 
  FileSpreadsheet, 
  FileText, 
  X,
  CreditCard,
  Building,
  User,
  ShoppingBag,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useToast } from '../components/ui';

const FinancialTransactions = () => {
  const toast = useToast();
  
  // Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });

  // Filter States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [integrityFilter, setIntegrityFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // UI Modal States
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundForm, setRefundForm] = useState({ amount: '', reason: '', notes: '', action: 'request' });
  const [processingRefund, setProcessingRefund] = useState(false);

  // Fetch Data Function
  const fetchTransactions = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        search,
        status: statusFilter,
        type: typeFilter,
        paymentMethod: methodFilter,
        businessModule: moduleFilter,
        integrityStatus: integrityFilter,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount
      };

      const res = await api.get('/admin/financial-transactions', { params });
      if (res.data && res.data.transactions) {
        setTransactions(res.data.transactions);
        setSummary(res.data.summary);
        if (res.data.pagination) setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('[FINANCIAL_UI] Error fetching transactions:', err);
      toast.show('Failed to load financial transactions.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter, typeFilter, methodFilter, moduleFilter, integrityFilter, dateFrom, dateTo, minAmount, maxAmount, toast]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Periodic Auto Refresh (Real-time update every 10s)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTransactions(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  // Handle Export
  const handleExport = async (format = 'csv') => {
    try {
      const params = {
        format,
        search,
        status: statusFilter,
        type: typeFilter,
        paymentMethod: methodFilter,
        businessModule: moduleFilter,
        integrityStatus: integrityFilter,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount
      };

      if (format === 'csv') {
        const response = await api.get('/admin/financial-transactions/export', { params, responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `financial_transactions_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        const res = await api.get('/admin/financial-transactions/export', { params });
        if (res.data?.success) {
          const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `financial_report_${Date.now()}.json`);
          document.body.appendChild(link);
          link.click();
          link.remove();
        }
      }
      toast.show(`Financial transactions exported successfully (${format.toUpperCase()}).`, 'success');
    } catch (err) {
      console.error('Export failed:', err);
      toast.show('Failed to export transactions.', 'error');
    }
  };

  // Handle Submit Refund
  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTxn) return;
    setProcessingRefund(true);

    try {
      const res = await api.post(`/admin/financial-transactions/${selectedTxn.id}/refund`, refundForm);
      if (res.data?.success) {
        toast.show(res.data.message || 'Refund recorded successfully.', 'success');
        setShowRefundModal(false);
        fetchTransactions(true);
      }
    } catch (err) {
      toast.show(err.response?.data?.message || 'Failed to process refund.', 'error');
    } finally {
      setProcessingRefund(false);
    }
  };

  // Format Helpers
  const fmtMoney = (amount, currency = 'USD') => {
    const val = parseFloat(amount || 0);
    return `${currency} $${val.toFixed(2)}`;
  };

  const getStatusBadge = (status) => {
    const st = String(status || '').toLowerCase();
    let cls = 'bg-slate-100 text-slate-700 border-slate-300';
    let icon = <Clock size={12} />;

    if (st === 'paid' || st === 'successful' || st === 'approved' || st === 'completed') {
      cls = 'bg-emerald-50 text-emerald-700 border-emerald-300';
      icon = <CheckCircle2 size={12} />;
    } else if (st === 'failed' || st === 'rejected' || st === 'cancelled' || st === 'expired') {
      cls = 'bg-red-50 text-red-700 border-red-300';
      icon = <XCircle size={12} />;
    } else if (st === 'refunded' || st === 'partially refunded') {
      cls = 'bg-purple-50 text-purple-700 border-purple-300';
      icon = <ArrowLeftRight size={12} />;
    } else if (st === 'processing' || st === 'initiated' || st === 'awaiting customer approval') {
      cls = 'bg-amber-50 text-amber-700 border-amber-300';
      icon = <Clock size={12} />;
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cls}`}>
        {icon}
        {status}
      </span>
    );
  };

  const getIntegrityBadge = (status) => {
    if (status === 'Valid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 size={10} /> Valid
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
        <ShieldAlert size={10} className="text-amber-700" /> {status}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <DollarSign className="text-primary-600" size={28} />
            Financial Transactions Management
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Monitor, audit, and manage real-time enterprise money flow across customers, vendors, bookings, subscriptions, settlements, and refunds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchTransactions(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-primary-600/20 transition-all">
              <Download size={16} />
              Export
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 hidden group-hover:block z-30">
              <button
                onClick={() => handleExport('csv')}
                className="w-full text-left px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <FileSpreadsheet size={16} className="text-emerald-600" /> Export CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="w-full text-left px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <FileText size={16} className="text-blue-600" /> Export Report (JSON)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards Grid (11 Cards) */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Value</p>
            <h3 className="text-xl font-black text-slate-900 mt-1">{fmtMoney(summary.totalTransactionValue)}</h3>
            <p className="text-[11px] font-medium text-slate-500 mt-1">{summary.totalTransactionsCount} Total Records</p>
          </div>
          <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200 shadow-sm">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Successful Payments</p>
            <h3 className="text-xl font-black text-emerald-900 mt-1">{summary.totalSuccessfulPayments}</h3>
            <p className="text-[11px] font-medium text-emerald-600 mt-1">Paid / Completed</p>
          </div>
          <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200 shadow-sm">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Pending Payments</p>
            <h3 className="text-xl font-black text-amber-900 mt-1">{summary.totalPendingPayments}</h3>
            <p className="text-[11px] font-medium text-amber-600 mt-1">Processing / Awaiting</p>
          </div>
          <div className="bg-red-50/50 p-4 rounded-2xl border border-red-200 shadow-sm">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider">Failed Payments</p>
            <h3 className="text-xl font-black text-red-900 mt-1">{summary.totalFailedPayments}</h3>
            <p className="text-[11px] font-medium text-red-600 mt-1">Failed / Cancelled</p>
          </div>
          <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-200 shadow-sm">
            <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Refunded Value</p>
            <h3 className="text-xl font-black text-purple-900 mt-1">{fmtMoney(summary.totalRefundedPayments)}</h3>
            <p className="text-[11px] font-medium text-purple-600 mt-1">Reversals & Refunds</p>
          </div>
          <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-200 shadow-sm">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Customer Payments</p>
            <h3 className="text-xl font-black text-blue-900 mt-1">{fmtMoney(summary.totalCustomerPayments)}</h3>
            <p className="text-[11px] font-medium text-blue-600 mt-1">Orders & Bookings</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subscriptions</p>
            <h3 className="text-xl font-black text-slate-900 mt-1">{fmtMoney(summary.totalVendorSubscriptionPayments)}</h3>
            <p className="text-[11px] font-medium text-slate-500 mt-1">Vendor Plans</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Module Purchases</p>
            <h3 className="text-xl font-black text-slate-900 mt-1">{fmtMoney(summary.totalModulePurchasePayments)}</h3>
            <p className="text-[11px] font-medium text-slate-500 mt-1">Feature Upgrades</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vendor Settlements</p>
            <h3 className="text-xl font-black text-slate-900 mt-1">{fmtMoney(summary.totalVendorSettlements)}</h3>
            <p className="text-[11px] font-medium text-slate-500 mt-1">Platform Payouts</p>
          </div>
          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 shadow-sm">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Today's Value</p>
            <h3 className="text-xl font-black text-emerald-900 mt-1">{fmtMoney(summary.todayTransactionValue)}</h3>
            <p className="text-[11px] font-medium text-emerald-600 mt-1">Created Today</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 shadow-sm col-span-1 sm:col-span-2">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">This Month's Value</p>
            <h3 className="text-xl font-black text-blue-900 mt-1">{fmtMoney(summary.thisMonthTransactionValue)}</h3>
            <p className="text-[11px] font-medium text-blue-600 mt-1">Current Calendar Month</p>
          </div>
        </div>
      )}

      {/* Multi-faceted Search and Filter Bar */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-sm border-b border-slate-100 pb-3">
          <Filter size={16} className="text-primary-600" />
          Filter & Search Transactions
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Text Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search ID, Ref, Customer, Vendor, Phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all"
            />
          </div>

          {/* Payment Status */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Payment Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Initiated">Initiated</option>
              <option value="Processing">Processing</option>
              <option value="Awaiting Customer Approval">Awaiting Approval</option>
              <option value="Failed">Failed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Refunded">Refunded</option>
              <option value="Partially Refunded">Partially Refunded</option>
            </select>
          </div>

          {/* Transaction Type */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Transaction Types</option>
              <option value="Fuel Order Payment">Fuel Order Payment</option>
              <option value="Gas Cylinder Payment">Gas Cylinder Payment</option>
              <option value="Spare Parts Payment">Spare Parts Payment</option>
              <option value="Car Services Booking Payment">Car Services Booking Payment</option>
              <option value="Vendor Subscription Payment">Vendor Subscription Payment</option>
              <option value="Vendor Module Purchase Payment">Vendor Module Purchase Payment</option>
              <option value="Vendor Settlement">Vendor Settlement</option>
            </select>
          </div>

          {/* Business Module */}
          <div>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Business Modules</option>
              <option value="Petrol/Diesel">Petrol / Diesel</option>
              <option value="Gas Cylinder">Gas Cylinder</option>
              <option value="Spare Parts">Spare Parts</option>
              <option value="Car Services">Car Services</option>
            </select>
          </div>

          {/* Payment Method */}
          <div>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Payment Methods</option>
              <option value="waafi">WaafiPay</option>
              <option value="edahab">eDahab</option>
              <option value="zaad">ZAAD</option>
              <option value="bank_settlement">Bank Settlement</option>
            </select>
          </div>

          {/* Integrity Status */}
          <div>
            <select
              value={integrityFilter}
              onChange={(e) => setIntegrityFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Integrity Statuses</option>
              <option value="Valid">Valid Only</option>
              <option value="Amount Mismatch">Amount Mismatch</option>
              <option value="Missing Order">Missing Order</option>
              <option value="Missing Payment">Missing Payment</option>
              <option value="Requires Review">Requires Review</option>
            </select>
          </div>

          {/* Date From & To */}
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-1/2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-1/2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            />
          </div>

          {/* Min & Max Amount */}
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Min $"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="w-1/2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            />
            <input
              type="number"
              placeholder="Max $"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="w-1/2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-4">Transaction ID / Ref</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4">Vendor / Module</th>
                <th className="px-5 py-4">Order/Booking Ref</th>
                <th className="px-5 py-4">Method</th>
                <th className="px-5 py-4">Total Amount</th>
                <th className="px-5 py-4">Payment Status</th>
                <th className="px-5 py-4">Integrity</th>
                <th className="px-5 py-4">Date & Time</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="11" className="px-5 py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline-block mb-2 text-primary-600" size={24} />
                    <p className="font-semibold">Loading normalized financial records...</p>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-5 py-12 text-center text-slate-400">
                    <DollarSign className="inline-block mb-2 text-slate-300" size={32} />
                    <p className="font-semibold text-slate-600">No financial transactions found matching the selected filters.</p>
                  </td>
                </tr>
              ) : (
                transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{txn.id}</p>
                      <p className="text-[11px] text-slate-400 font-mono truncate max-w-[140px]">{txn.reference}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-slate-800">{txn.type}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{txn.customer.name}</p>
                      <p className="text-[11px] text-slate-400">{txn.customer.phoneMasked || txn.customer.phone}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{txn.vendor.businessName}</p>
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 mt-0.5">
                        {txn.vendor.businessModule}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono font-semibold text-slate-700">
                      {txn.orderReference || txn.bookingReference || 'N/A'}
                    </td>
                    <td className="px-5 py-4 capitalize font-semibold text-slate-600">
                      {txn.paymentMethod}
                    </td>
                    <td className="px-5 py-4 font-black text-slate-900">
                      {fmtMoney(txn.totalAmount, txn.currency)}
                    </td>
                    <td className="px-5 py-4">
                      {getStatusBadge(txn.status)}
                    </td>
                    <td className="px-5 py-4">
                      {getIntegrityBadge(txn.integrityStatus)}
                    </td>
                    <td className="px-5 py-4 text-slate-500 whitespace-nowrap">
                      {new Date(txn.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setSelectedTxn(txn); setShowDetailModal(true); }}
                          className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                          title="View Transaction Details"
                        >
                          <Eye size={16} />
                        </button>
                        {txn.status === 'Paid' && (
                          <button
                            onClick={() => {
                              setSelectedTxn(txn);
                              setRefundForm({ amount: txn.totalAmount, reason: '', notes: '', action: 'request' });
                              setShowRefundModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                            title="Process Refund"
                          >
                            <ArrowLeftRight size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 bg-slate-50/80 border-t border-slate-200 text-xs font-semibold text-slate-600">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={pagination.limit}
              onChange={(e) => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value, 10), page: 1 }))}
              className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span>entries per page (Total {pagination.total} records)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: Math.min(pagination.totalPages, prev.page + 1) }))}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Transaction Details Modal */}
      {showDetailModal && selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 animate-fade-in-up my-8">
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <CreditCard size={20} className="text-primary-400" />
                  Transaction Details: {selectedTxn.id}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Ref: {selectedTxn.reference}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Integrity Warning Banner */}
              {selectedTxn.integrityStatus !== 'Valid' && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-900 text-xs font-medium">
                  <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm text-amber-950">Integrity Alert: {selectedTxn.integrityStatus}</h4>
                    <p className="mt-0.5">This transaction record requires administrative audit because the transaction state flags a validation mismatch or status conflict.</p>
                  </div>
                </div>
              )}

              {/* Transaction & Provider Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                    <Clock size={14} className="text-primary-600" /> Transaction Information
                  </h4>
                  <p><span className="text-slate-500 font-semibold">Internal ID:</span> <span className="font-mono font-bold text-slate-800">{selectedTxn.id}</span></p>
                  <p><span className="text-slate-500 font-semibold">Reference:</span> <span className="font-mono text-slate-800">{selectedTxn.reference}</span></p>
                  <p><span className="text-slate-500 font-semibold">Type:</span> <span className="font-bold text-slate-900">{selectedTxn.type}</span></p>
                  <p><span className="text-slate-500 font-semibold">Payment Status:</span> {getStatusBadge(selectedTxn.status)}</p>
                  <p><span className="text-slate-500 font-semibold">Created Date:</span> {new Date(selectedTxn.createdAt).toLocaleString()}</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                    <CreditCard size={14} className="text-primary-600" /> Payment Provider Details
                  </h4>
                  <p><span className="text-slate-500 font-semibold">Method:</span> <span className="font-bold uppercase text-slate-800">{selectedTxn.paymentMethod}</span></p>
                  <p><span className="text-slate-500 font-semibold">Provider Name:</span> {selectedTxn.providerDetails.providerName}</p>
                  <p><span className="text-slate-500 font-semibold">Payer Account:</span> {selectedTxn.providerDetails.payerAccount}</p>
                  <p><span className="text-slate-500 font-semibold">Response Code:</span> <span className="font-mono">{selectedTxn.providerDetails.responseCode}</span></p>
                  <p><span className="text-slate-500 font-semibold">Response Message:</span> {selectedTxn.providerDetails.responseMessage}</p>
                </div>
              </div>

              {/* Customer & Vendor Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                    <User size={14} className="text-primary-600" /> Customer Information
                  </h4>
                  <p><span className="text-slate-500 font-semibold">Customer ID:</span> #{selectedTxn.customer.id}</p>
                  <p><span className="text-slate-500 font-semibold">Full Name:</span> <span className="font-bold text-slate-800">{selectedTxn.customer.name}</span></p>
                  <p><span className="text-slate-500 font-semibold">Phone:</span> {selectedTxn.customer.phone}</p>
                  <p><span className="text-slate-500 font-semibold">Email:</span> {selectedTxn.customer.email}</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                    <Building size={14} className="text-primary-600" /> Vendor Information
                  </h4>
                  <p><span className="text-slate-500 font-semibold">Vendor ID:</span> #{selectedTxn.vendor.id}</p>
                  <p><span className="text-slate-500 font-semibold">Business Name:</span> <span className="font-bold text-slate-800">{selectedTxn.vendor.businessName}</span></p>
                  <p><span className="text-slate-500 font-semibold">Owner Name:</span> {selectedTxn.vendor.ownerName}</p>
                  <p><span className="text-slate-500 font-semibold">Business Module:</span> <span className="font-semibold text-primary-700">{selectedTxn.vendor.businessModule}</span></p>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-3 text-xs">
                <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-3">
                  Financial Breakdown ({selectedTxn.currency})
                </h4>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Subtotal:</span>
                  <span className="font-semibold">{fmtMoney(selectedTxn.subtotal, selectedTxn.currency)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Delivery Fee:</span>
                  <span className="font-semibold">{fmtMoney(selectedTxn.deliveryFee, selectedTxn.currency)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Platform Fee (Commission):</span>
                  <span className="font-semibold text-emerald-400">{fmtMoney(selectedTxn.platformFee, selectedTxn.currency)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Vendor Payable Amount:</span>
                  <span className="font-semibold text-blue-400">{fmtMoney(selectedTxn.vendorPayable, selectedTxn.currency)}</span>
                </div>
                {selectedTxn.refundedAmount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-800 text-purple-400 font-bold">
                    <span>Refunded Amount:</span>
                    <span>{fmtMoney(selectedTxn.refundedAmount, selectedTxn.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-base font-black text-white">
                  <span>Total Amount Paid:</span>
                  <span className="text-primary-400">{fmtMoney(selectedTxn.totalAmount, selectedTxn.currency)}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Management Modal */}
      {showRefundModal && selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-fade-in-up">
            <div className="px-6 py-5 bg-purple-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <ArrowLeftRight size={18} />
                Process Refund: {selectedTxn.id}
              </h3>
              <button onClick={() => setShowRefundModal(false)} className="p-1.5 text-purple-300 hover:text-white rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRefundSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Transaction Reference</label>
                <input type="text" disabled value={selectedTxn.reference} className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl font-mono text-slate-600" />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Refund Amount ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedTxn.totalAmount}
                  value={refundForm.amount}
                  onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Maximum refundable: ${selectedTxn.totalAmount}</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Refund Action</label>
                <select
                  value={refundForm.action}
                  onChange={(e) => setRefundForm({ ...refundForm, action: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800"
                >
                  <option value="request">Submit Refund Request</option>
                  <option value="approve">Direct Admin Approval & Process</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason for Refund</label>
                <textarea
                  rows="2"
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                  placeholder="e.g. Customer cancellation, double payment, service issue..."
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="flex-1 py-2.5 border border-slate-300 font-bold text-slate-600 rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingRefund}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-600/20 disabled:opacity-50"
                >
                  {processingRefund ? 'Processing...' : 'Confirm Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialTransactions;
