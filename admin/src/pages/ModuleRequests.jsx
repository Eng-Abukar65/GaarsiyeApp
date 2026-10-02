import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../utils/api';
import {
  Layers, CheckCircle, XCircle, Clock, Search, Eye, Filter,
  Calendar, Check, X, FileText, Loader2, AlertTriangle, User, Phone, Mail
} from 'lucide-react';
import { useToast } from '../components/ui';

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

const STATUS_CONFIG = {
  pending: { label: 'Pending Review', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', Icon: CheckCircle },
  rejected: { label: 'Rejected', cls: 'bg-rose-500/10 text-rose-500 border-rose-500/20', Icon: XCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-500/10 text-slate-500 border-slate-500/20', Icon: XCircle },
};

const ModuleRequests = () => {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [selectedItem, setSelectedItem] = useState(null);

  // Approval state
  const [approveModalItem, setApproveModalItem] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [approving, setApproving] = useState(false);

  // Rejection state
  const [rejectModalItem, setRejectModalItem] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/module-requests');
      setRequests(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load module requests:', err);
      toast?.error?.('Failed to load business module requests.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!approveModalItem) return;
    setApproving(true);

    try {
      await api.post(`/admin/module-requests/${approveModalItem.id}/approve`, {
        admin_notes: adminNotes.trim() || undefined,
      });

      toast?.success?.('Module request approved successfully.');
      setApproveModalItem(null);
      setAdminNotes('');
      await fetchRequests();
    } catch (err) {
      console.error('Approval failed:', err);
      toast?.error?.(err.response?.data?.message || 'Failed to approve request.');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    if (!rejectionReason.trim()) {
      toast?.error?.('Please enter a reason for rejection.');
      return;
    }
    setRejecting(true);

    try {
      await api.post(`/admin/module-requests/${rejectModalItem.id}/reject`, {
        reason: rejectionReason.trim(),
      });

      toast?.success?.('Module request rejected.');
      setRejectModalItem(null);
      setRejectionReason('');
      await fetchRequests();
    } catch (err) {
      console.error('Rejection failed:', err);
      toast?.error?.(err.response?.data?.message || 'Failed to reject request.');
    } finally {
      setRejecting(false);
    }
  };

  const filteredRequests = useMemo(() => {
    let list = requests || [];
    if (statusFilter !== 'all') {
      list = list.filter(r => r.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          (r.business_name || '').toLowerCase().includes(q) ||
          (r.contact_name || '').toLowerCase().includes(q) ||
          (r.requested_module_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, statusFilter, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="text-blue-600" size={24} />
            Business Module Requests
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Review and approve vendor business module expansion requests.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
          {['all', 'pending', 'approved', 'rejected', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-4 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor, module..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={18} /> Loading module requests...
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">
            No module requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-6 py-4">Vendor & Details</th>
                  <th className="px-6 py-4">Current Modules</th>
                  <th className="px-6 py-4">Requested Module</th>
                  <th className="px-6 py-4">Pricing</th>
                  <th className="px-6 py-4">Request Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                {filteredRequests.map((item) => {
                  const badge = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                  const Icon = badge.Icon;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      {/* Vendor & Details */}
                      <td className="px-6 py-4">
                        <p className="font-extrabold text-slate-900 dark:text-white">{item.business_name || 'Vendor'}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.contact_name} • {item.phone}</p>
                      </td>

                      {/* Current Modules */}
                      <td className="px-6 py-4">
                        <span className="text-[11px] text-slate-600 dark:text-slate-400">
                          {item.current_business_types || 'None'}
                        </span>
                      </td>

                      {/* Requested Module */}
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 rounded-lg text-xs font-bold">
                          {item.requested_module_name}
                        </span>
                      </td>

                      {/* Pricing */}
                      <td className="px-6 py-4">
                        <p className="text-slate-500">Current: <span className="text-slate-800 dark:text-white">{money(item.old_monthly_fee)}</span></p>
                        <p className="text-emerald-600 mt-0.5">New Total: <span>{money(item.new_monthly_fee)}</span></p>
                      </td>

                      {/* Request Date */}
                      <td className="px-6 py-4 text-slate-400">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${badge.cls}`}>
                          <Icon size={12} /> {badge.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-xl transition-all"
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                        {item.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setApproveModalItem(item)}
                              className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-xl transition-all"
                              title="Approve"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setRejectModalItem(item)}
                              className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-xl transition-all"
                              title="Reject"
                            >
                              <X size={14} />
                            </button>
                          </>
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

      {/* Modal: View Details */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">Module Request Details</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Reference ID: #{selectedItem.id}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 rounded-xl space-y-2 col-span-2">
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 uppercase font-bold">Vendor Profile</p>
                  <p className="text-sm font-extrabold text-slate-800 dark:text-white flex items-center gap-1.5"><User size={14}/> {selectedItem.business_name}</p>
                  <p className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><Phone size={14}/> {selectedItem.phone}</p>
                  <p className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><Mail size={14}/> {selectedItem.email}</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 rounded-xl space-y-1 col-span-2">
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 uppercase font-bold">Current Business Modules</p>
                  <p className="text-slate-800 dark:text-slate-200 font-extrabold">{selectedItem.current_business_types || 'None'}</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 rounded-xl space-y-1">
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 uppercase font-bold">Requested Expansion</p>
                  <p className="text-sm font-extrabold text-blue-600 dark:text-blue-400">{selectedItem.requested_module_name}</p>
                  <p className="text-slate-600 dark:text-slate-300">{money(selectedItem.upgrade_amount_due)} (Due Now)</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 rounded-xl space-y-1">
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 uppercase font-bold">New Subscription Rate</p>
                  <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{money(selectedItem.new_monthly_fee)}/mo</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-1">Starting from next invoice.</p>
                </div>

                {selectedItem.notes && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 rounded-xl col-span-2 space-y-1">
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 uppercase font-bold">Vendor Notes</p>
                    <p className="text-slate-700 dark:text-slate-200">{selectedItem.notes}</p>
                  </div>
                )}

                {selectedItem.admin_notes && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50 p-4 rounded-xl col-span-2 space-y-1">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 uppercase font-bold">Admin Comments / Rejection Reason</p>
                    <p className="text-amber-900 dark:text-amber-200">{selectedItem.admin_notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              {selectedItem.status === 'pending' ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const item = selectedItem;
                      setSelectedItem(null);
                      setApproveModalItem(item);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const item = selectedItem;
                      setSelectedItem(null);
                      setRejectModalItem(item);
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              ) : <div />}
              <button onClick={() => setSelectedItem(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Approve Request */}
      {approveModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleApproveSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">Approve Module Activation</h3>
                <p className="text-xs text-slate-500 mt-0.5">Activating {approveModalItem.requested_module_name} for {approveModalItem.business_name}</p>
              </div>
              <button type="button" onClick={() => setApproveModalItem(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 rounded-xl">
                <p className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold leading-relaxed">
                  Approving this request will immediately activate the business module. The adjusted monthly rate of <strong>{money(approveModalItem.new_monthly_fee)}</strong> will automatically apply starting from their next invoice.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Approval Notes / Comment (Optional)
                </label>
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="e.g. Approved. Module activated."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setApproveModalItem(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all">
                Cancel
              </button>
              <button type="submit" disabled={approving} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md">
                {approving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Confirm Activation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Reject Request */}
      {rejectModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleRejectSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-extrabold text-lg text-slate-900 dark:text-white text-rose-600">Reject Module Request</h3>
                <p className="text-xs text-slate-500 mt-0.5">Rejecting request from {rejectModalItem.business_name}</p>
              </div>
              <button type="button" onClick={() => setRejectModalItem(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Rejection Reason / Notes <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide details on why this module request is rejected."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setRejectModalItem(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all">
                Cancel
              </button>
              <button type="submit" disabled={rejecting} className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md">
                {rejecting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ModuleRequests;
