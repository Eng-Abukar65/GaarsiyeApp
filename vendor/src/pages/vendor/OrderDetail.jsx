import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import DeliveryProof from '../../components/vendor/DeliveryProof';
import DriverDeliveryOfferCard from '../../components/vendor/DriverDeliveryOfferCard';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v) => `$${Number(v || 0).toFixed(2)}`;

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const padId = (id) => `#ORD-${String(id || 0).padStart(4, '0')}`;

const STATUS_COLORS = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  confirmed: 'bg-amber-100 text-amber-700 border-amber-200',
  accepted: 'bg-blue-100 text-blue-700 border-blue-200',
  pending_driver_assignment: 'bg-amber-100 text-amber-700 border-amber-200',
  'driver assigned': 'bg-purple-100 text-purple-700 border-purple-200',
  'on the way': 'bg-sky-100 text-sky-700 border-sky-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const statusClass = (s) =>
  STATUS_COLORS[(s || '').toLowerCase()] || 'bg-slate-100 text-slate-600 border-slate-200';

const PAYMENT_COLORS = {
  paid: 'bg-green-100 text-green-700 border-green-200',
  unpaid: 'bg-amber-100 text-amber-700 border-amber-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
};

const payClass = (s) =>
  PAYMENT_COLORS[(s || '').toLowerCase()] || 'bg-slate-100 text-slate-600 border-slate-200';

const cleanPhone = (phone) => String(phone || '').replace(/[^0-9+]/g, '');

// ── Sub-components ────────────────────────────────────────────────────────────

const Card = ({ title, icon, children, action }) => (
  <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden flex flex-col justify-between">
    <div>
      <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">{icon}</span>
          <h3 className="font-bold text-on-surface text-xs uppercase tracking-widest">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const Field = ({ label, value, mono = false, highlight = false }) => (
  <div className="space-y-1">
    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{label}</p>
    <p className={`text-sm ${highlight ? 'font-bold text-primary' : 'font-semibold text-on-surface'} ${mono ? 'font-mono' : ''}`}>
      {value || '—'}
    </p>
  </div>
);

// ── Skeleton ──────────────────────────────────────────────────────────────────

const Skeleton = () => (
  <div className="max-w-6xl mx-auto py-6 space-y-6 animate-pulse">
    <div className="h-10 w-72 bg-surface-container-high rounded-xl" />
    <div className="grid md:grid-cols-2 gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-48 bg-surface-container-high rounded-2xl" />
      ))}
    </div>
  </div>
);

// ── Main Page ─────────────────────────────────────────────────────────────────

const OrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [user] = useState(() => JSON.parse(localStorage.getItem('vendor_user') || 'null'));

  const loadOrder = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/vendor/orders/${orderId}`);
      setOrder(res.data?.data || null);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        setError({ code: 404, message: 'Order not found or you do not have access to it.' });
      } else if (status === 403) {
        setError({ code: 403, message: 'You are not authorized to view this order.' });
      } else {
        setError({ code: status || 0, message: err.response?.data?.message || 'Failed to load order details.' });
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // Actions
  const handleAcceptOrder = async () => {
    try {
      setActionLoading(true);
      const response = await api.patch(`/vendor/orders/${orderId}/accept?vendorId=${user.id}`);
      if (response.data.success) {
        setMessage('✅ Order accepted successfully!');
        loadOrder();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.message || 'Failed to accept order.'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (nextStatus) => {
    try {
      setActionLoading(true);
      const response = await api.put(`/vendor/orders/${orderId}/status`, { status: nextStatus });
      if (response.data.success) {
        setMessage(`✅ Order status updated to ${nextStatus}!`);
        loadOrder();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.message || 'Failed to update order status.'}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="max-w-lg mx-auto my-16 p-10 bg-surface-container-lowest rounded-3xl border border-outline-variant/10 shadow-sm text-center space-y-4">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant">
          {error.code === 404 ? 'search_off' : 'lock'}
        </span>
        <h2 className="text-2xl font-bold text-on-surface font-headline">
          {error.code === 404 ? 'Order Not Found' : error.code === 403 ? 'Access Denied' : 'Error'}
        </h2>
        <p className="text-on-surface-variant text-sm">{error.message}</p>
        <button
          onClick={() => navigate('/vendor/orders_list')}
          className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary-dim transition-all shadow-md"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Orders
        </button>
      </div>
    );
  }

  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const destinations = Array.isArray(order.destinations) ? order.destinations : [];
  const phone = cleanPhone(order.customer_phone);

  const lat = order.delivery_latitude ?? order.latitude;
  const lng = order.delivery_longitude ?? order.longitude;
  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;

  const calculatedSubtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-6">

      {/* ── Top Bar / Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/vendor/orders_list')}
            className="p-2.5 hover:bg-surface-container-high rounded-xl transition-colors border border-outline-variant/10"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold font-headline text-on-surface">
                Order {padId(order.id)}
              </h2>
              <span className={`px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider ${statusClass(order.status)}`}>
                {order.status || 'Unknown'}
              </span>
              <span className={`px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider ${payClass(order.payment_status)}`}>
                {order.payment_status || 'Unpaid'}
              </span>
            </div>
            <p className="text-on-surface-variant text-xs mt-1">
              Placed on {fmtDate(order.created_at)}
            </p>
          </div>
        </div>

        {/* Action Buttons Header Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {(order.status === 'pending' || order.status === 'pending_payment') && (
            <button
              onClick={handleAcceptOrder}
              disabled={actionLoading}
              className="px-4 py-2.5 bg-primary text-on-primary rounded-xl text-xs font-bold hover:bg-primary-dim transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              Confirm Order
            </button>
          )}

          {['accepted', 'pending_driver_assignment', 'confirmed'].includes((order.status || '').toLowerCase()) && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">person_add</span>
              Assign Driver
            </button>
          )}

          {['accepted', 'confirmed', 'driver assigned'].includes((order.status || '').toLowerCase()) && (
            <button
              onClick={() => handleUpdateStatus('on the way')}
              disabled={actionLoading}
              className="px-4 py-2.5 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">local_shipping</span>
              Dispatch / In Transit
            </button>
          )}

          {['on the way'].includes((order.status || '').toLowerCase()) && (
            <button
              onClick={() => handleUpdateStatus('delivered')}
              disabled={actionLoading}
              className="px-4 py-2.5 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">done_all</span>
              Mark Delivered
            </button>
          )}

          {!['delivered', 'cancelled'].includes((order.status || '').toLowerCase()) && (
            <button
              onClick={() => handleUpdateStatus('cancelled')}
              disabled={actionLoading}
              className="px-3 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">cancel</span>
              Cancel
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-sm font-bold animate-fade-in ${message.includes('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message}
        </div>
      )}

      {/* ── Main Information Grid ── */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* 1. Customer Details */}
        <Card title="Customer Details" icon="person">
          <div className="space-y-4">
            <Field label="Full Name" value={order.customer_name} />
            <Field label="Phone Number" value={order.customer_phone} mono />
            {order.customer_email && <Field label="Email Address" value={order.customer_email} />}
            <Field label="Delivery Address" value={order.delivery_address} />
            {order.landmark && <Field label="Landmark / Directions" value={order.landmark} />}

            {/* Direct Contact Buttons */}
            {phone && (
              <div className="pt-2 flex items-center gap-2">
                <a
                  href={`tel:${phone}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-xl text-xs font-bold transition-colors border border-outline-variant/10"
                >
                  <span className="material-symbols-outlined text-base text-primary">call</span>
                  Call Customer
                </a>
                <a
                  href={`https://wa.me/${phone.replace('+', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl text-xs font-bold transition-colors border border-green-200"
                >
                  <span className="material-symbols-outlined text-base">chat</span>
                  WhatsApp
                </a>
              </div>
            )}

            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center justify-center gap-2 w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors border border-blue-200"
              >
                <span className="material-symbols-outlined text-base">map</span>
                Open Location on Map ({lat}, {lng})
              </a>
            )}
          </div>
        </Card>

        {/* 2. Delivery Details */}
        <Card title="Delivery Details" icon="local_shipping">
          <div className="space-y-4">
            <Field label="Delivery Type" value={destinations.length > 1 ? 'Multi-Stop Route' : 'Standard Delivery'} />
            <Field label="Delivery Status" value={order.delivery_status || order.status} highlight />
            {order.distance_km && <Field label="Estimated Distance" value={`${order.distance_km} km`} />}
            <Field label="Delivery Fee" value={fmt(order.delivery_fee)} />
            {order.delivery_otp && <Field label="Delivery Verification OTP" value={order.delivery_otp} mono highlight />}
            
            {/* Driver Information / Delivery Offer */}
            <div className="pt-2 border-t border-outline-variant/10">
              <DriverDeliveryOfferCard
                orderId={order.id}
                order={order}
                onOfferSent={(msg) => {
                  setMessage(`✅ ${msg}`);
                  loadOrder();
                  setTimeout(() => setMessage(''), 4000);
                }}
                onRefreshOrder={() => {
                  loadOrder();
                }}
              />
            </div>
          </div>
        </Card>

        {/* 3. Payment & Financial Summary */}
        <Card title="Payment Details" icon="payments">
          <div className="space-y-4">
            <Field label="Payment Method" value={order.payment_method} />
            <Field label="Payment Status" value={order.payment_status} highlight />
            <Field label="Subtotal" value={fmt(calculatedSubtotal || order.subtotal)} />
            <Field label="Delivery Fee" value={fmt(order.delivery_fee)} />
            {order.discount_amount > 0 && <Field label="Discount Amount" value={`-${fmt(order.discount_amount)}`} />}
            <div className="pt-2 border-t border-outline-variant/10">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Amount</p>
              <p className="text-xl font-headline font-bold text-primary mt-1">{fmt(order.total_amount)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Order Items Table ── */}
      <Card title="Delivery Proof" icon="photo_camera">
        <DeliveryProof
          orderId={order.id}
          refreshKey={`${order.status || ''}:${order.delivery_status || ''}:${order.updated_at || ''}`}
        />
      </Card>

      <Card title="Ordered Products & Services" icon="shopping_bag">
        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-low/50">
                  <th className="py-3 px-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Product / Service</th>
                  <th className="py-3 px-4 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Quantity</th>
                  <th className="py-3 px-4 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Unit Price</th>
                  <th className="py-3 px-4 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {items.map((item) => {
                  const qty = Number(item.quantity || 1);
                  const price = Number(item.price || 0);
                  return (
                    <tr key={item.id} className="hover:bg-surface-container-low/30">
                      <td className="py-3.5 px-4 font-bold text-on-surface">
                        {item.product_name || `Product #${item.product_id}`}
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold text-on-surface-variant">{qty}</td>
                      <td className="py-3.5 px-4 text-right font-semibold text-on-surface-variant">{fmt(price)}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-on-surface">{fmt(price * qty)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-outline-variant/10 bg-surface-container-low/20">
                  <td colSpan="3" className="py-3 px-4 text-right font-bold text-on-surface-variant text-xs uppercase tracking-wider">Subtotal</td>
                  <td className="py-3 px-4 text-right font-bold text-on-surface">{fmt(calculatedSubtotal)}</td>
                </tr>
                <tr>
                  <td colSpan="3" className="py-2 px-4 text-right font-bold text-on-surface-variant text-xs uppercase tracking-wider">Delivery Fee</td>
                  <td className="py-2 px-4 text-right font-bold text-on-surface-variant">{fmt(order.delivery_fee)}</td>
                </tr>
                {order.discount_amount > 0 && (
                  <tr>
                    <td colSpan="3" className="py-2 px-4 text-right font-bold text-green-700 text-xs uppercase tracking-wider">Discount</td>
                    <td className="py-2 px-4 text-right font-bold text-green-700">-{fmt(order.discount_amount)}</td>
                  </tr>
                )}
                <tr className="border-t border-outline-variant/10">
                  <td colSpan="3" className="py-3 px-4 text-right font-bold text-on-surface text-sm uppercase tracking-wider">Grand Total</td>
                  <td className="py-3 px-4 text-right font-bold text-primary text-base">{fmt(order.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant italic">No items recorded for this order.</p>
        )}
      </Card>

      {/* ── Multi-Stop Destinations ── */}
      {destinations.length > 0 && (
        <Card title="Multi-Stop Route Destinations" icon="alt_route">
          <ol className="space-y-3">
            {destinations.map((dest, idx) => (
              <li key={dest.id} className="flex gap-3 items-start p-3 bg-surface-container-low/40 rounded-xl border border-outline-variant/10">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-on-surface">{dest.address}</p>
                  {dest.phone && <p className="text-xs text-on-surface-variant font-mono mt-0.5">📞 Phone: {dest.phone}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* ── Customer Notes ── */}
      {order.notes && (
        <Card title="Customer Instructions / Notes" icon="notes">
          <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{order.notes}</p>
        </Card>
      )}

      {/* ── Assign Driver Modal / Offer Form ── */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="px-6 py-4 bg-purple-600 text-white flex justify-between items-center">
              <h3 className="text-lg font-headline font-bold">Driver Delivery Offer</h3>
              <button onClick={() => setShowAssignModal(false)} className="material-symbols-outlined hover:bg-white/20 p-1.5 rounded-full transition-colors">close</button>
            </div>
            <div className="p-6">
              <DriverDeliveryOfferCard
                orderId={order.id}
                order={order}
                onOfferSent={(msg) => {
                  setMessage(`✅ ${msg}`);
                  setShowAssignModal(false);
                  loadOrder();
                  setTimeout(() => setMessage(''), 4000);
                }}
                onCancel={() => setShowAssignModal(false)}
                onRefreshOrder={() => {
                  loadOrder();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetail;
