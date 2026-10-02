import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api, { getUploadUrl } from '../utils/api';
import {
  CreditCard, CheckCircle, XCircle, Clock, Search, Eye, Filter,
  Calendar, Check, X, FileText, Loader2, AlertTriangle, ShieldCheck, DollarSign, Users, Building
} from 'lucide-react';
import { useToast } from '../components/ui';

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

const STATUS_CONFIG = {
  pending: { label: 'Pending Review', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', Icon: CheckCircle },
  rejected: { label: 'Rejected', cls: 'bg-rose-500/10 text-rose-500 border-rose-500/20', Icon: XCircle },
};

const SubscriptionPayments = () => {
  const toast = useToast();
  const [payments, setPayments] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [viewReceiptUrl, setViewReceiptUrl] = useState(null);

  // Approval modal state
  const [approveModalItem, setApproveModalItem] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [approving, setApproving] = useState(false);

  // Rejection modal state
  const [rejectModalItem, setRejectModalItem] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, ovRes] = await Promise.all([
        api.get('/admin/subscriptions', { params: { status: statusFilter } }).catch(() => api.get('/admin/settlements')),
        api.get('/admin/subscriptions/overview').catch(() => api.get('/admin/settlements/overview')),
      ]);

      setPayments(listRes.data?.data || []);
      setOverview(ovRes.data?.data || null);
    } catch (err) {
      console.error('Failed to load subscription payments:', err);
      toast?.error?.('Failed to load vendor subscription payments.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!approveModalItem) return;
    setApproving(true);

    try {
      await api.post(`/admin/subscriptions/${approveModalItem.id}/approve`, {
        admin_notes: adminNotes.trim() || undefined,
      }).catch(() => api.post(`/admin/settlements/${approveModalItem.id}/approve`, { admin_notes: adminNotes.trim() }));

      toast?.success?.('Subscription payment approved and vendor notified.');
      setApproveModalItem(null);
      setAdminNotes('');
      await fetchPayments();
    } catch (err) {
      console.error('Approval failed:', err);
      toast?.error?.(err.response?.data?.message || 'Failed to approve payment.');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    if (!rejectionReason.trim()) {
      toast?.error?.('Please enter a reason for rejecting this payment.');
      return;
    }
    setRejecting(true);

    try {
      await api.post(`/admin/subscriptions/${rejectModalItem.id}/reject`, {
        reason: rejectionReason.trim(),
      }).catch(() => api.post(`/admin/settlements/${rejectModalItem.id}/reject`, { reason: rejectionReason.trim() }));

      toast?.success?.('Subscription payment rejected and vendor notified.');
      setRejectModalItem(null);
      setRejectionReason('');
      await fetchPayments();
    } catch (err) {
      console.error('Rejection failed:', err);
      toast?.error?.(err.response?.data?.message || 'Failed to reject payment.');
    } finally {
      setRejecting(false);
    }
  };

  const filteredPayments = useMemo(() => {
    let list = payments || [];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          (p.business_name || '').toLowerCase().includes(q) ||
          (p.contact_name || '').toLowerCase().includes(q) ||
          (p.reference_number || p.settlement_reference || '').toLowerCase().includes(q) ||
          (p.payment_method || '').toLowerCase().includes(q) ||
          (p.plan_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [payments, searchTerm]);

  // Summary counts
  const pendingCount = overview?.pending_requests ?? payments.filter((p) => p.status === 'pending').length;
  const approvedCount = overview?.approved_requests ?? payments.filter((p) => p.status === 'approved').length;
  const rejectedCount = overview?.rejected_requests ?? payments.filter((p) => p.status === 'rejected').length;
  const monthlyRev = overview?.total_monthly_revenue ?? 0;
  const vendorsPaid = overview?.total_vendors_paid ?? 0;
  const vendorsAwaiting = overview?.vendors_awaiting_payment ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Vendor Settlements & Subscriptions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Review live vendor monthly subscription payments, verify uploaded receipts, and issue approvals.
          </p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pending Requests</p>
          <h3 className="text-xl font-extrabold text-amber-500 mt-1">{pendingCount}</h3>
          <p className="text-[10px] text-amber-600 font-semibold mt-1">Awaiting Review</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Approved Requests</p>
          <h3 className="text-xl font-extrabold text-emerald-500 mt-1">{approvedCount}</h3>
          <p className="text-[10px] text-emerald-600 font-semibold mt-1">Confirmed</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Rejected Requests</p>
          <h3 className="text-xl font-extrabold text-rose-500 mt-1">{rejectedCount}</h3>
          <p className="text-[10px] text-rose-500 font-semibold mt-1">Declined</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Monthly Revenue</p>
          <h3 className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{money(monthlyRev)}</h3>
          <p className="text-[10px] text-slate-400 font-semibold mt-1">This Month</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Vendors Paid</p>
          <h3 className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">{vendorsPaid}</h3>
          <p className="text-[10px] text-slate-400 font-semibold mt-1">Active Subscriptions</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Awaiting Payment</p>
          <h3 className="text-xl font-extrabold text-slate-700 dark:text-slate-300 mt-1">{vendorsAwaiting}</h3>
          <p className="text-[10px] text-slate-400 font-semibold mt-1">Due / Expired</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
          {['all', 'pending', 'approved', 'rejected'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-4 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {st === 'pending' ? 'Pending Review' : st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor, reference..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={18} /> Loading settlements database...
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">
            No settlement requests found for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-6 py-4">Vendor & Business</th>
                  <th className="px-6 py-4">Subscription Period</th>
                  <th className="px-6 py-4">Amount & Plan</th>
                  <th className="px-6 py-4">Payment Method</th>
                  <th className="px-6 py-4">Reference #</th>
                  <th className="px-6 py-4">Receipt</th>
                  <th className="px-6 py-4">Notes</th>
                  <th className="px-6 py-4">Submitted Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                {filteredPayments.map((item) => {
                  const badge = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                  const Icon = badge.Icon;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      {/* Vendor Name & Business */}
                      <td className="px-6 py-4">
                        <p className="font-extrabold text-slate-900 dark:text-white">{item.business_name || 'Vendor'}</p>
                        {item.contact_name && <p className="text-[11px] text-slate-400 font-normal">{item.contact_name}</p>}
                      </td>

                      {/* Subscription Period (Month) */}
                      <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                        {item.period_month || new Date(item.created_at || item.settlement_date).toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-extrabold text-emerald-600 dark:text-emerald-400">{money(item.amount)}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">{item.plan_label || `${item.plan_name || 'Basic'} Plan`}</p>
                      </td>

                      {/* Payment Method */}
                      <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                        {item.payment_method}
                      </td>

                      {/* Transaction Reference # */}
                      <td className="px-6 py-4 font-extrabold text-slate-900 dark:text-white">
                        {item.reference_number || item.settlement_reference || '—'}
                      </td>

                      {/* Uploaded Receipt */}
                      <td className="px-6 py-4">
                        {item.receipt_url ? (
                          <button
                            onClick={() => setViewReceiptUrl(getUploadUrl(item.receipt_url))}
                            className="inline-flex items-center gap-1 font-bold text-primary hover:underline text-xs"
                          >
                            <Eye size={14} /> View Receipt
                          </button>
                        ) : (
                          <span className="text-slate-400 font-normal">No receipt</span>
                        )}
                      </td>

                      {/* Vendor Notes */}
                      <td className="px-6 py-4 text-slate-500 font-normal max-w-xs" title={item.notes || 'No notes'}>
                        {item.notes?.includes('Module Upgrade Request') ? (
                          <div>
                            <span className="inline-block px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-extrabold text-[10px] rounded-md border border-blue-500/20 mb-1">
                              Module Upgrade Request
                            </span>
                            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{item.notes}</p>
                          </div>
                        ) : (
                          <span className="truncate block">{item.notes || '—'}</span>
                        )}
                      </td>

                      {/* Submitted Date */}
                      <td className="px-6 py-4 font-medium text-slate-500">
                        {new Date(item.created_at || item.settlement_date).toLocaleDateString()}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${badge.cls}`}>
                          <Icon size={12} /> {badge.label}
                        </span>
                        {item.admin_notes && (
                          <p className="text-[10px] text-slate-400 font-normal mt-1 max-w-xs truncate" title={item.admin_notes}>
                            Admin Note: {item.admin_notes}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        {item.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setApproveModalItem(item)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              onClick={() => setRejectModalItem(item)}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
                            >
                              <X size={14} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-bold capitalize">Processed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: View Receipt File */}
      {viewReceiptUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-3xl w-full rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <FileText size={18} className="text-primary" /> Uploaded Payment Receipt
              </h3>
              <button
                onClick={() => setViewReceiptUrl(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-sm font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex justify-center p-2 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden max-h-[60vh]">
              {viewReceiptUrl.toLowerCase().endsWith('.pdf') ? (
                <iframe src={viewReceiptUrl} title="Receipt PDF" className="w-full h-96 rounded-lg" />
              ) : (
                <img src={viewReceiptUrl} alt="Receipt" className="max-h-[55vh] object-contain rounded-lg" />
              )}
            </div>

            <div className="flex justify-end">
              <a
                href={viewReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-primary text-white font-bold text-xs rounded-xl shadow-sm hover:opacity-90 transition-opacity"
              >
                Open Full File in New Tab
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Approve Payment */}
      {approveModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle size={18} className="text-emerald-500" /> Approve Subscription Settlement
              </h3>
              <button onClick={() => setApproveModalItem(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Approve settlement of <strong>{money(approveModalItem.amount)}</strong> for <strong>{approveModalItem.business_name}</strong> ({approveModalItem.plan_name || 'Standard'} Plan)?
              This will automatically extend their subscription active date by <strong>+30 days</strong> and send an instant approval notification to the vendor.
            </p>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Add Admin Note <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={2}
                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none text-slate-900 dark:text-white"
                placeholder="Verified payment via reference."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApproveModalItem(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={handleApproveSubmit}
                className="px-5 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-md hover:bg-emerald-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {approving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject Payment */}
      {rejectModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <XCircle size={18} className="text-rose-500" /> Reject Subscription Settlement
              </h3>
              <button onClick={() => setRejectModalItem(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Reject settlement request for <strong>{rejectModalItem.business_name}</strong> (Ref: {rejectModalItem.reference_number})?
            </p>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Rejection Reason / Admin Note <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none text-slate-900 dark:text-white"
                placeholder="Reference number does not match receipt."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalItem(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejecting}
                onClick={handleRejectSubmit}
                className="px-5 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl shadow-md hover:bg-rose-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {rejecting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionPayments;
