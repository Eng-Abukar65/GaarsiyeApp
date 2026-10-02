/**
 * OrderDetailsModal — Product-order detail overlay.
 *
 * Opens as an in-page modal on the Orders List page.
 * Handles ONLY product orders: Petrol, Diesel, Gas Cylinder, Spare Parts.
 * Never used for Car Wash bookings — use CarWashBookingDetailsModal for those.
 *
 * Props:
 *   isOpen       {boolean}         – controls visibility
 *   orderId      {number|null}     – the orders.id to fetch
 *   onClose      {() => void}      – called when the modal should close
 *   onRefreshList{() => void}      – called after a status action to refresh the list
 */
import React, { useEffect, useState, useCallback } from 'react';
import api from '../../utils/api';
import DeliveryProof from './DeliveryProof';
import DriverDeliveryOfferCard from './DriverDeliveryOfferCard';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v) => `$${Number(v || 0).toFixed(2)}`;

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const padId = (id) => `#ORD-${String(id || 0).padStart(4, '0')}`;
const titleCase = (v = '') =>
  String(v).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const cleanPhone = (phone) => String(phone || '').replace(/[^0-9+]/g, '');

const STATUS_COLORS = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  pending_payment: 'bg-orange-100 text-orange-700 border-orange-200',
  accepted: 'bg-blue-100 text-blue-700 border-blue-200',
  confirmed: 'bg-amber-100 text-amber-700 border-amber-200',
  pending_driver_assignment: 'bg-amber-100 text-amber-700 border-amber-200',
  'driver assigned': 'bg-purple-100 text-purple-700 border-purple-200',
  'on the way': 'bg-sky-100 text-sky-700 border-sky-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};
const statusClass = (s) =>
  STATUS_COLORS[(s || '').toLowerCase()] || 'bg-slate-100 text-slate-600 border-slate-200';

const PAY_COLORS = {
  paid: 'bg-green-100 text-green-700 border-green-200',
  unpaid: 'bg-amber-100 text-amber-700 border-amber-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
};
const payClass = (s) =>
  PAY_COLORS[(s || '').toLowerCase()] || 'bg-slate-100 text-slate-600 border-slate-200';

// ── Layout atoms ──────────────────────────────────────────────────────────────

const Field = ({ label, value, mono = false, highlight = false }) => (
  <div className="space-y-1">
    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{label}</p>
    <p className={`text-sm break-words ${highlight ? 'font-bold text-primary' : 'font-semibold text-on-surface'} ${mono ? 'font-mono' : ''}`}>
      {value || '—'}
    </p>
  </div>
);

const Section = ({ title, icon, children }) => (
  <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low/40 p-5 space-y-4">
    <div className="flex items-center gap-2 border-b border-outline-variant/10 pb-3">
      <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
      <h4 className="font-bold text-on-surface text-xs uppercase tracking-widest">{title}</h4>
    </div>
    {children}
  </div>
);

// ── Status Progress Bar ───────────────────────────────────────────────────────

const ORDER_STEPS = [
  { key: 'pending',                  label: 'Order Placed' },
  { key: 'accepted',                 label: 'Accepted' },
  { key: 'pending_driver_assignment',label: 'Preparing' },
  { key: 'driver assigned',          label: 'Driver Assigned' },
  { key: 'on the way',               label: 'On the Way' },
  { key: 'delivered',                label: 'Delivered' },
];

const StatusProgress = ({ status }) => {
  const normalized = (status || '').toLowerCase();
  const isCancelled = normalized === 'cancelled';
  const currentIdx = ORDER_STEPS.findIndex((s) => s.key === normalized);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1">
        {ORDER_STEPS.map((step, idx) => {
          const done = !isCancelled && idx <= currentIdx;
          const active = !isCancelled && idx === currentIdx;
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full h-1.5 rounded-full transition-colors ${done ? 'bg-primary' : 'bg-slate-200'}`} />
              <span className={`text-[9px] font-bold text-center leading-tight ${active ? 'text-primary' : done ? 'text-on-surface-variant' : 'text-slate-300'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      {isCancelled && (
        <p className="text-xs font-bold text-red-600 text-center mt-1">⚠️ Order Cancelled</p>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const OrderDetailsModal = ({ isOpen, orderId, onClose, onRefreshList }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showAssignBox, setShowAssignBox] = useState(false);

  const [user] = useState(() =>
    JSON.parse(localStorage.getItem('vendor_user') || 'null')
  );

  // ── Fetch order detail ────────────────────────────────────────────────────

  const fetchOrder = useCallback(async () => {
    // Guard: missing or invalid internal ID -> do not call API
    const numId = Number(orderId);
    if (!orderId || isNaN(numId) || numId <= 0 || !isOpen) return;

    try {
      setLoading(true);
      setError(null);
      setMessage('');
      setShowAssignBox(false);

      const res = await api.get(`/vendor/orders/${numId}`);
      setData(res.data?.data ?? null);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        setError({ code: 404, msg: `Order ${padId(orderId)} was not found.` });
      } else if (status === 403) {
        setError({ code: 403, msg: `Order ${padId(orderId)} belongs to another vendor account.` });
      } else if (status === 400) {
        setError({ code: 400, msg: `Invalid order ID format (#${orderId}).` });
      } else {
        setError({ code: status || 0, msg: err.response?.data?.message || 'Failed to load order details. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  }, [orderId, isOpen]);

  useEffect(() => {
    if (isOpen && orderId) {
      fetchOrder();
    } else if (!isOpen) {
      // Reset all state when closed
      setData(null);
      setError(null);
      setMessage('');
      setShowAssignBox(false);
    }
  }, [isOpen, orderId, fetchOrder]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const notify = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  const handleAccept = async () => {
    try {
      setActionLoading(true);
      await api.patch(`/vendor/orders/${orderId}/accept?vendorId=${user?.id}`);
      notify('✅ Order accepted successfully!');
      fetchOrder();
      onRefreshList?.();
    } catch (err) {
      notify(`❌ ${err.response?.data?.message || 'Failed to accept order.'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (nextStatus) => {
    try {
      setActionLoading(true);
      await api.put(`/vendor/orders/${orderId}/status`, { status: nextStatus });
      notify(`✅ Status updated to "${titleCase(nextStatus)}"`);
      fetchOrder();
      onRefreshList?.();
    } catch (err) {
      notify(`❌ ${err.response?.data?.message || 'Failed to update status.'}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  // ── Derived values ────────────────────────────────────────────────────────

  const items = Array.isArray(data?.items) ? data.items : [];
  const destinations = Array.isArray(data?.destinations) ? data.destinations : [];
  const driverName = data
    ? [data.driver_first_name, data.driver_last_name].filter(Boolean).join(' ')
    : '';
  const phone = cleanPhone(data?.customer_phone);
  const lat = data?.delivery_latitude ?? data?.latitude;
  const lng = data?.delivery_longitude ?? data?.longitude;
  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  const subtotal = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0);
  const status = (data?.status || '').toLowerCase();
  const isTerminal = ['delivered', 'cancelled'].includes(status);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Order Details"
    >
      <div className="bg-surface-container-lowest w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col border border-outline-variant/15 overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/10 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined text-primary text-2xl flex-shrink-0">receipt_long</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-headline font-bold text-lg text-on-surface">
                  Order {padId(data?.id || orderId)}
                </h3>
                {data && (
                  <>
                    <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusClass(data.status)}`}>
                      {titleCase(data.status)}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${payClass(data.payment_status)}`}>
                      {titleCase(data.payment_status || 'unpaid')}
                    </span>
                  </>
                )}
              </div>
              {data?.created_at && (
                <p className="text-xs text-on-surface-variant mt-0.5">Placed on {fmtDate(data.created_at)}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={fetchOrder} className="p-2 hover:bg-surface-container-high rounded-full transition-colors" title="Refresh">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">refresh</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-full transition-colors" aria-label="Close">
              <span className="material-symbols-outlined text-on-surface-variant text-xl">close</span>
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* Alert bar */}
          {message && (
            <div className={`p-3.5 rounded-2xl text-sm font-bold ${message.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {message}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="py-20 flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
              <p className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">Loading order details…</p>
            </div>
          )}

          {/* Error / Not Found / Unauthorized */}
          {error && !loading && (
            <div className="py-12 flex flex-col items-center gap-4 text-center bg-red-50 rounded-3xl border border-red-200 p-8">
              <span className="material-symbols-outlined text-5xl text-red-400">
                {error.code === 404 ? 'search_off' : 'lock'}
              </span>
              <h4 className="text-lg font-bold text-red-700 font-headline">
                {error.code === 404 ? 'Order Not Found' : error.code === 403 ? 'Access Denied' : 'Error Loading Order'}
              </h4>
              <p className="text-sm text-on-surface-variant max-w-sm">{error.msg}</p>
            </div>
          )}

          {/* Content */}
          {data && !loading && !error && (
            <>
              {/* Order progress */}
              <div className="p-4 bg-surface-container-low/40 rounded-2xl border border-outline-variant/10">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">Order Progress</p>
                <StatusProgress status={data.status} />
              </div>

              {/* Actions */}
              {!isTerminal && (
                <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/10 space-y-3">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Actions</p>
                  <div className="flex flex-wrap gap-2">
                    {(status === 'pending' || status === 'pending_payment') && (
                      <button
                        onClick={handleAccept}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-bold hover:bg-primary-dim transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        Accept Order
                      </button>
                    )}

                    {['accepted', 'confirmed', 'pending_driver_assignment'].includes(status) && !showAssignBox && data.driver_assignment_status !== 'offer_sent' && data.driver_assignment_status !== 'driver_assigned' && (
                      <button
                        onClick={() => setShowAssignBox(true)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-base">person_add</span>
                        Assign Driver / Delivery Offer
                      </button>
                    )}

                    {['accepted', 'confirmed', 'driver assigned'].includes(status) && (
                      <button
                        onClick={() => handleUpdateStatus('on the way')}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-base">local_shipping</span>
                        Dispatch / In Transit
                      </button>
                    )}

                    {status === 'on the way' && (
                      <button
                        onClick={() => handleUpdateStatus('delivered')}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-green-700 text-white rounded-xl text-xs font-bold hover:bg-green-800 transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-base">done_all</span>
                        Mark Delivered
                      </button>
                    )}

                    <button
                      onClick={() => handleUpdateStatus('cancelled')}
                      disabled={actionLoading}
                      className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-all active:scale-95 flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-base">cancel</span>
                      Cancel Order
                    </button>

                    {/* Contact Buttons */}
                    {phone && (
                      <div className="ml-auto flex items-center gap-2">
                        <a href={`tel:${phone}`}
                          className="px-3 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-xl text-xs font-bold flex items-center gap-1 border border-outline-variant/10">
                          <span className="material-symbols-outlined text-base text-primary">call</span> Call
                        </a>
                        <a href={`https://wa.me/${phone.replace('+', '')}`} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl text-xs font-bold flex items-center gap-1 border border-green-200">
                          <span className="material-symbols-outlined text-base">chat</span> WhatsApp
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Driver Delivery Offer Card */}
                  {(showAssignBox || data.driver_assignment_status === 'offer_sent' || data.driver_assignment_status === 'driver_assigned' || ['accepted', 'confirmed', 'pending_driver_assignment'].includes(status)) && (
                    <DriverDeliveryOfferCard
                      orderId={data.id}
                      order={data}
                      onOfferSent={(msg) => {
                        notify(`✅ ${msg}`);
                        fetchOrder();
                        onRefreshList?.();
                      }}
                      onCancel={() => setShowAssignBox(false)}
                      onRefreshOrder={() => {
                        fetchOrder();
                        onRefreshList?.();
                      }}
                    />
                  )}
                </div>
              )}

              {/* Info Grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">

                {/* Customer Details */}
                <Section title="Customer Details" icon="person">
                  <Field label="Full Name" value={data.customer_name} />
                  <Field label="Phone Number" value={data.customer_phone} mono />
                  {data.customer_email && <Field label="Email Address" value={data.customer_email} />}
                  <Field label="Delivery Address" value={data.delivery_address} />
                  {data.landmark && <Field label="Landmark" value={data.landmark} />}
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline mt-1">
                      <span className="material-symbols-outlined text-sm">map</span>
                      View on Google Maps
                    </a>
                  )}
                </Section>

                {/* Delivery Info */}
                <Section title="Delivery Details" icon="local_shipping">
                  <Field label="Delivery Type" value={destinations.length > 1 ? 'Multi-Stop Route' : 'Standard Delivery'} />
                  <Field label="Delivery Status" value={titleCase(data.delivery_status || data.status)} highlight />
                  {data.distance_km && <Field label="Estimated Distance" value={`${Number(data.distance_km).toFixed(1)} km`} />}
                  <Field label="Delivery Fee" value={fmt(data.delivery_fee)} />
                  {data.delivery_otp && (
                    <Field label="Delivery OTP / Verification Code" value={data.delivery_otp} mono highlight />
                  )}
                  {/* Driver */}
                  <div className="border-t border-outline-variant/10 pt-3">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Assigned Driver</p>
                    {driverName ? (
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-on-surface">{driverName}</p>
                        {data.driver_phone && (
                          <a href={`tel:${cleanPhone(data.driver_phone)}`}
                            className="text-xs text-primary font-mono hover:underline block">
                            📞 {data.driver_phone}
                          </a>
                        )}
                        {data.driver_vehicle && <p className="text-xs text-on-surface-variant">Vehicle: {data.driver_vehicle}</p>}
                        {data.delivery_assigned_at && <p className="text-xs text-on-surface-variant">Assigned: {fmtDate(data.delivery_assigned_at)}</p>}
                      </div>
                    ) : (
                      <p className="text-xs text-on-surface-variant italic">No driver assigned yet</p>
                    )}
                  </div>
                </Section>

                {/* Payment */}
                <Section title="Payment Details" icon="payments">
                  <Field label="Payment Method" value={titleCase(data.payment_method)} />
                  <Field label="Payment Status" value={titleCase(data.payment_status || 'unpaid')} highlight />
                  <Field label="Delivery Fee" value={fmt(data.delivery_fee)} />
                  {Number(data.discount_amount || 0) > 0 && (
                    <Field label="Discount" value={`-${fmt(data.discount_amount)}`} />
                  )}
                  <div className="border-t border-outline-variant/10 pt-3">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Grand Total</p>
                    <p className="text-xl font-headline font-extrabold text-primary mt-1">{fmt(data.total_amount)}</p>
                  </div>
                </Section>
              </div>

              <Section title="Delivery Proof" icon="photo_camera">
                <DeliveryProof
                  orderId={data.id}
                  refreshKey={`${data.status || ''}:${data.delivery_status || ''}:${data.updated_at || ''}`}
                />
              </Section>

              {/* Items Table */}
              <Section title="Ordered Products & Items" icon="shopping_bag">
                {items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-outline-variant/10 text-on-surface-variant text-[10px] font-bold uppercase">
                          <th className="py-2 pr-3">Product / Item</th>
                          <th className="py-2 px-2 text-center">Qty</th>
                          <th className="py-2 px-2 text-right">Unit Price</th>
                          <th className="py-2 pl-2 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/5">
                        {items.map((it) => {
                          const qty = Number(it.quantity || 1);
                          const price = Number(it.price || 0);
                          return (
                            <tr key={it.id} className="hover:bg-surface-container-low/30">
                              <td className="py-2.5 pr-3 font-bold text-on-surface">
                                {it.product_name || `Product #${it.product_id}`}
                              </td>
                              <td className="py-2.5 px-2 text-center text-on-surface-variant font-semibold">{qty}</td>
                              <td className="py-2.5 px-2 text-right text-on-surface-variant font-semibold">{fmt(price)}</td>
                              <td className="py-2.5 pl-2 text-right font-bold text-on-surface">{fmt(price * qty)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t-2 border-outline-variant/10 text-xs">
                        <tr>
                          <td colSpan="3" className="py-2 pr-2 text-right text-on-surface-variant font-bold">Subtotal</td>
                          <td className="py-2 pl-2 text-right font-bold text-on-surface">{fmt(subtotal)}</td>
                        </tr>
                        <tr>
                          <td colSpan="3" className="py-1 pr-2 text-right text-on-surface-variant font-semibold">+ Delivery</td>
                          <td className="py-1 pl-2 text-right font-semibold text-on-surface-variant">{fmt(data.delivery_fee)}</td>
                        </tr>
                        {Number(data.discount_amount || 0) > 0 && (
                          <tr>
                            <td colSpan="3" className="py-1 pr-2 text-right text-green-700 font-bold">- Discount</td>
                            <td className="py-1 pl-2 text-right font-bold text-green-700">-{fmt(data.discount_amount)}</td>
                          </tr>
                        )}
                        <tr className="border-t border-outline-variant/10">
                          <td colSpan="3" className="py-2 pr-2 text-right font-bold text-on-surface text-sm">Grand Total</td>
                          <td className="py-2 pl-2 text-right font-extrabold text-primary text-base">{fmt(data.total_amount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant italic">No item records found for this order.</p>
                )}
              </Section>

              {/* Multi-stop destinations */}
              {destinations.length > 0 && (
                <Section title="Delivery Stops / Multi-Stop Route" icon="alt_route">
                  <ol className="space-y-2">
                    {destinations.map((dest, idx) => (
                      <li key={dest.id} className="flex gap-3 items-start p-3 bg-surface-container-low/30 rounded-xl border border-outline-variant/10">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                        <div>
                          <p className="text-sm font-bold text-on-surface">{dest.address}</p>
                          {dest.phone && <p className="text-xs text-on-surface-variant font-mono mt-0.5">📞 {dest.phone}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* Customer Notes */}
              {data.notes && (
                <Section title="Customer Instructions / Delivery Notes" icon="notes">
                  <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{data.notes}</p>
                </Section>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-outline-variant/10 bg-surface-container-low flex items-center justify-between gap-3 flex-shrink-0">
          <p className="text-xs text-on-surface-variant">
            {data ? `Order ${padId(data.id)} · ${fmtDate(data.created_at)}` : ''}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-xl text-sm font-bold transition-all border border-outline-variant/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsModal;
