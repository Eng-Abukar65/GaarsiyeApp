import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getUploadUrl } from '../../utils/api';
import {
  CreditCard, Send, Loader2, CheckCircle2, XCircle, Clock, FileText,
  Upload, AlertCircle, ShieldCheck, FileSpreadsheet, Eye, Calendar, Sparkles, AlertTriangle
} from 'lucide-react';

const PLAN_PRICES = {
  Basic: 20.00,
  Standard: 35.00,
  Premium: 50.00,
};

const PAYMENT_METHODS = [
  'EVC Plus',
  'Zaad',
  'Sahal',
  'eDahab',
  'Bank Transfer',
  'Cash',
];

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

const STATUS_BADGES = {
  pending: { label: 'Pending Review', cls: 'bg-amber-100 text-amber-800 border-amber-200', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-800 border-rose-200', Icon: XCircle },
};

const VendorSettlements = () => {
  const [searchParams] = useSearchParams();
  const upgradeModuleId = searchParams.get('upgrade_module_id');
  const upgradeModuleName = searchParams.get('upgrade_module_name');
  const upgradeAmount = searchParams.get('upgrade_amount');

  const [statusInfo, setStatusInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Form fields
  const [paymentMethod, setPaymentMethod] = useState('EVC Plus');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [st, h] = await Promise.all([
        api.get('/vendor/subscriptions/status').catch(() => api.get('/vendor/settlements/balance')),
        api.get('/vendor/subscriptions/history').catch(() => api.get('/vendor/settlements')),
      ]);
      setStatusInfo(st.data?.data || null);
      setHistory(h.data?.data || []);
    } catch (e) {
      console.error('Failed to load subscription position:', e);
      setErr(e.response?.data?.message || 'Could not load your subscription payment position.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
      setErr('Invalid file type. Please upload a JPG, JPEG, PNG, or PDF file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErr('File is too large. Maximum file size is 10MB.');
      return;
    }

    setErr('');
    setReceiptFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setFilePreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!referenceNumber.trim()) {
      setErr('Please enter the transaction reference number.');
      return;
    }
    if (!receiptFile) {
      setErr('Please upload a payment receipt.');
      return;
    }

    setSubmitting(true);
    setErr('');
    setMsg('');

    try {
      const formData = new FormData();
      if (upgradeModuleId) {
        formData.append('business_type_id', upgradeModuleId);
        formData.append('payment_method', paymentMethod);
        formData.append('reference_number', referenceNumber.trim());
        formData.append('receipt', receiptFile);
        if (notes.trim()) formData.append('notes', notes.trim());

        const response = await api.post('/vendor/modules/upgrade', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setMsg(response.data?.message || 'Business module upgrade request submitted. Awaiting admin review.');
      } else {
        formData.append('plan_name', statusInfo?.plan_name || 'Standard');
        formData.append('amount', statusInfo?.amount_due || 50.00);
        formData.append('payment_method', paymentMethod);
        formData.append('reference_number', referenceNumber.trim());
        formData.append('receipt', receiptFile);
        if (notes.trim()) formData.append('notes', notes.trim());

        const response = await api.post('/vendor/subscriptions/pay', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }).catch((err) => {
          if (err.response?.data?.message) {
            throw new Error(err.response.data.message);
          }
          return api.post('/vendor/settlements', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        });

        setMsg(response.data?.message || 'Payment submitted successfully. Awaiting admin review.');
      }

      setReferenceNumber('');
      setReceiptFile(null);
      setFilePreview(null);
      setNotes('');
      await loadData();
    } catch (e) {
      console.error('Submit payment error:', e);
      setErr(e.message || e.response?.data?.message || 'Could not submit payment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 font-bold gap-2">
        <Loader2 className="animate-spin" size={20} /> Loading monthly subscription status…
      </div>
    );
  }

  const currentPlan = statusInfo?.plan_name || 'Basic';
  const amountDue = statusInfo?.amount_due ?? (PLAN_PRICES[currentPlan] || 20.00);
  const planLabel = statusInfo?.plan_label || (currentPlan === 'Basic' ? '1 Module (Gas Only)' : currentPlan === 'Standard' ? '2 Modules (Gas & Petrol)' : '3+ Modules (Gas, Petrol & Car Services)');
  const activeUntil = statusInfo?.subscription_expires_at;
  const pendingPayment = statusInfo?.pending_payment;
  const lastRejected = statusInfo?.last_rejected_payment;

  const pendingCount = statusInfo?.pending_count ?? history.filter((p) => p.status === 'pending').length;
  const approvedCount = statusInfo?.approved_count ?? history.filter((p) => p.status === 'approved').length;
  const rejectedCount = statusInfo?.rejected_count ?? history.filter((p) => p.status === 'rejected').length;

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="font-headline text-3xl font-extrabold tracking-tight text-slate-900">
          Vendor Settlement & Monthly Subscriptions
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          All order earnings go 100% directly to your account. Settle your fixed monthly platform subscription below.
        </p>
      </div>

      {err && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 flex items-center gap-2">
          <AlertTriangle size={18} />
          <span>{err}</span>
        </div>
      )}

      {msg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 flex items-center gap-2">
          <CheckCircle2 size={18} />
          <span>{msg}</span>
        </div>
      )}

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Status</p>
          <h3 className={`text-xl font-extrabold mt-1 capitalize ${activeUntil ? 'text-emerald-600' : 'text-slate-800'}`}>
            {activeUntil ? 'Approved / Active' : (statusInfo?.subscription_status || 'Active')}
          </h3>
          <p className="text-[10px] font-semibold text-slate-500 mt-1">
            {activeUntil ? `Expires: ${new Date(activeUntil).toLocaleDateString()}` : 'Plan Subscription'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount Due</p>
          <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{money(amountDue)}</h3>
          <p className="text-[10px] font-semibold text-slate-500 mt-1">{currentPlan} Plan Fee</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Review</p>
          <h3 className="text-2xl font-extrabold text-amber-500 mt-1">{pendingCount}</h3>
          <p className="text-[10px] font-semibold text-amber-600 mt-1">Awaiting Admin</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Approved Payments</p>
          <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{approvedCount}</h3>
          <p className="text-[10px] font-semibold text-slate-500 mt-1">Total Verified</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rejected Payments</p>
          <h3 className="text-2xl font-extrabold text-rose-600 mt-1">{rejectedCount}</h3>
          <p className="text-[10px] font-semibold text-rose-500 mt-1">Resubmission Needed</p>
        </div>
      </div>

      {/* Current Subscription Status Card */}
      <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Plan</span>
            <div className="flex items-center gap-2 mt-0.5">
              <h3 className="text-2xl font-extrabold text-slate-900">{currentPlan} Plan</h3>
              <span className="px-2.5 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-full">
                {money(amountDue)} / month
              </span>
            </div>
          </div>

          {/* Active Expiration Date / Status */}
          <div className="flex items-center gap-3">
            {activeUntil ? (
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-right">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Status: Approved</p>
                <p className="text-sm font-black text-emerald-900 flex items-center gap-1.5 mt-0.5 justify-end">
                  <Calendar size={14} /> Subscription Active Until: {new Date(activeUntil).toLocaleDateString()}
                </p>
              </div>
            ) : (
              <div className="bg-slate-100 p-3 rounded-2xl text-right">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Subscription Status</p>
                <p className="text-sm font-black text-slate-700 capitalize">{statusInfo?.subscription_status || 'Active'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Pending Review Alert Banner */}
        {pendingPayment && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3">
            <Clock className="text-amber-600 shrink-0" size={20} />
            <div>
              <p className="text-xs font-extrabold text-amber-900 uppercase tracking-wider">
                Status: Pending Review
              </p>
              <p className="text-xs font-semibold text-amber-800 mt-0.5">
                Your payment submission of <strong>{money(pendingPayment.amount)}</strong> via {pendingPayment.payment_method} (Ref: {pendingPayment.reference_number}) is currently awaiting Admin review.
              </p>
            </div>
          </div>
        )}

        {/* Rejection Reason Alert Banner */}
        {!pendingPayment && lastRejected && (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-start gap-3">
            <XCircle className="text-rose-600 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-xs font-extrabold text-rose-900 uppercase tracking-wider">
                Status: Rejected
              </p>
              <p className="text-xs font-semibold text-rose-800 mt-0.5">
                <strong>Reason / Admin Note:</strong> {lastRejected.admin_notes || 'Invalid reference or receipt image. Please resubmit below.'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Monthly Subscription Payment Submission Form */}
      <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <CreditCard className="text-primary" size={20} />
          <h3 className="font-headline text-lg font-bold text-slate-900">Submit Monthly Subscription Payment</h3>
        </div>

        {statusInfo?.is_paid ? (
          <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-base">
              <CheckCircle2 className="text-emerald-600 animate-pulse" size={22} />
              <span>Subscription Paid</span>
            </div>
            <p className="text-sm font-semibold text-emerald-700">
              Your subscription has already been paid. There are no outstanding payments due at this time.
            </p>
            <div className="text-xs text-slate-500 font-bold bg-white/60 dark:bg-slate-900/60 p-3 rounded-xl inline-block">
              <p>No payment is currently required.</p>
              {statusInfo?.subscription_expires_at && (
                <p className="mt-1 text-slate-700">
                  Next payment due: <strong>{new Date(statusInfo.subscription_expires_at).toLocaleDateString()}</strong>
                </p>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitPayment} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 1. Subscription Plan (Read-only) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Subscription Plan <span className="text-slate-400 font-normal">(Read-only)</span>
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl font-extrabold text-sm text-slate-700 cursor-not-allowed"
                  value={`${currentPlan} Plan - ${planLabel}`}
                />
              </div>

              {/* 2. Amount Due (Read-only) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Amount Due <span className="text-slate-400 font-normal">(Read-only)</span>
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl font-extrabold text-sm text-emerald-700 cursor-not-allowed"
                  value={money(amountDue)}
                />
              </div>

              {/* 3. Payment Method Dropdown */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <select
                  disabled={statusInfo?.has_pending}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Transaction / Reference Number */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Transaction / Reference Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={statusInfo?.has_pending}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  placeholder="Enter transaction reference number"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              </div>
            </div>

            {/* 5. Upload Payment Receipt (Required) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Upload Payment Receipt <span className="text-red-500">*</span> <span className="text-slate-400 font-normal">(JPG, JPEG, PNG, PDF)</span>
              </label>
              <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-6 text-center space-y-3 hover:border-primary/50 transition-colors">
                {filePreview ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={filePreview} alt="Receipt preview" className="max-h-40 rounded-xl object-cover border border-slate-200 shadow-sm" />
                    <p className="text-xs font-bold text-slate-700">{receiptFile?.name}</p>
                  </div>
                ) : receiptFile ? (
                  <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold text-xs">
                    <FileText size={24} />
                    <span>{receiptFile.name}</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload size={32} className="mx-auto text-slate-400" />
                    <p className="text-xs font-bold text-slate-700">Click to choose receipt file</p>
                    <p className="text-[11px] font-medium text-slate-400">Accepts .jpg, .jpeg, .png, .pdf (Max 10MB)</p>
                  </div>
                )}

                <input
                  type="file"
                  disabled={statusInfo?.has_pending}
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="receipt-file-input"
                />
                <label
                  htmlFor={statusInfo?.has_pending ? undefined : "receipt-file-input"}
                  className={`inline-block px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-sm transition-colors ${statusInfo?.has_pending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}
                >
                  {receiptFile ? 'Change File' : 'Select File'}
                </label>
              </div>
            </div>

            {/* 6. Notes (Optional) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Notes <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={2}
                disabled={statusInfo?.has_pending}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                placeholder="Paid for August subscription."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* 7. Submit Button */}
            <button
              type="submit"
              disabled={submitting || statusInfo?.has_pending}
              className="w-full sm:w-auto px-8 py-3.5 bg-primary text-on-primary font-bold text-sm rounded-xl shadow-md hover:bg-primary-dim transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span>{statusInfo?.has_pending ? 'Payment Pending Review' : 'Submit Payment'}</span>
            </button>
          </form>
        )}
      </section>

      {/* Payment History Table */}
      <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <FileText size={18} className="text-primary" />
          <h3 className="font-headline text-lg font-bold text-slate-900">Subscription Payment History</h3>
        </div>

        {history.length === 0 ? (
          <p className="py-8 text-center text-xs font-bold text-slate-400">No subscription payments submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Reference #</th>
                  <th className="px-4 py-3">Subscription Period</th>
                  <th className="px-4 py-3">Date Submitted</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Admin Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {history.map((item) => {
                  const badge = STATUS_BADGES[item.status] || STATUS_BADGES.pending;
                  const Icon = badge.Icon;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900">{item.reference_number || item.settlement_reference || '—'}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">
                        {item.period_month || new Date(item.created_at || item.settlement_date).toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">{new Date(item.created_at || item.settlement_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{item.plan_name || 'Standard'}</td>
                      <td className="px-4 py-3">{item.payment_method}</td>
                      <td className="px-4 py-3 font-extrabold text-slate-900">{money(item.amount)}</td>
                      <td className="px-4 py-3">
                        {item.receipt_url ? (
                          <a
                            href={getUploadUrl(item.receipt_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                          >
                            <Eye size={12} /> View Receipt
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${badge.cls}`}>
                          <Icon size={12} /> {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{item.admin_notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default VendorSettlements;
