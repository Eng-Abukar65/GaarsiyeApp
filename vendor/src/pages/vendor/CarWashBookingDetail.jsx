import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v) => `$${Number(v || 0).toFixed(2)}`;

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const titleCase = (v = '') =>
  String(v).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const cleanPhone = (phone) => String(phone || '').replace(/[^0-9+]/g, '');

const STATUS_META = {
  pending:         { color: '#F59E0B', soft: 'bg-amber-50  text-amber-700  border-amber-200',  label: 'Pending' },
  confirmed:       { color: '#2563EB', soft: 'bg-blue-50   text-blue-700   border-blue-200',   label: 'Confirmed' },
  worker_assigned: { color: '#7C3AED', soft: 'bg-violet-50 text-violet-700 border-violet-200', label: 'Worker Assigned' },
  washing:         { color: '#0891B2', soft: 'bg-cyan-50   text-cyan-700   border-cyan-200',   label: 'Washing' },
  ready:           { color: '#16A34A', soft: 'bg-green-50  text-green-700  border-green-200',  label: 'Vehicle Ready' },
  completed:       { color: '#166534', soft: 'bg-green-50  text-green-800  border-green-200',  label: 'Completed' },
  cancelled:       { color: '#DC2626', soft: 'bg-red-50    text-red-700    border-red-200',    label: 'Cancelled' },
  rejected:        { color: '#BE123C', soft: 'bg-rose-50   text-rose-700   border-rose-200',   label: 'Rejected' },
  payment_failed:  { color: '#EA580C', soft: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Payment Failed' },
};

const statusMeta = (s) => STATUS_META[s] || { color: '#64748B', soft: 'bg-slate-100 text-slate-600 border-slate-200', label: titleCase(s) };

const FLOW = [
  { status: 'pending',         label: 'Booking Submitted' },
  { status: 'confirmed',       label: 'Confirmed by Vendor' },
  { status: 'worker_assigned', label: 'Worker Assigned' },
  { status: 'washing',         label: 'Washing Started' },
  { status: 'ready',           label: 'Vehicle Ready' },
  { status: 'completed',       label: 'Completed' },
];

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

const Field = ({ label, value, highlight = false }) => (
  <div className="space-y-1">
    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{label}</p>
    <p className={`text-sm ${highlight ? 'font-bold text-primary' : 'font-semibold text-on-surface'}`}>{value || '—'}</p>
  </div>
);

const Skeleton = () => (
  <div className="max-w-6xl mx-auto py-6 space-y-6 animate-pulse">
    <div className="h-10 w-72 bg-surface-container-high rounded-xl" />
    <div className="grid md:grid-cols-2 gap-6">
      {[...Array(4)].map((_, i) => <div key={i} className="h-44 bg-surface-container-high rounded-2xl" />)}
    </div>
  </div>
);

// ── Progress Timeline ─────────────────────────────────────────────────────────

const Timeline = ({ booking }) => {
  const isInterrupted = ['cancelled', 'rejected', 'payment_failed'].includes(booking.status);
  const progressIndex = isInterrupted
    ? FLOW.findIndex((s) => s.status === booking.previous_status) ?? 0
    : Math.max(0, FLOW.findIndex((s) => s.status === booking.status));

  return (
    <div className="space-y-0">
      {FLOW.map((stage, idx) => {
        const reached = idx <= progressIndex;
        const isCurrent = !isInterrupted && idx === progressIndex;
        const history = Array.isArray(booking.status_history) ? booking.status_history : [];
        const histEntry = history.find((e) => e.status === stage.status);
        const ts = histEntry?.created_at || null;

        return (
          <div key={stage.status} className="relative flex gap-3 pb-5 last:pb-0">
            {idx < FLOW.length - 1 && (
              <span className={`absolute left-[17px] top-9 h-[calc(100%-18px)] w-0.5 ${idx < progressIndex ? 'bg-blue-500' : 'bg-slate-200'}`} />
            )}
            <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
              isCurrent
                ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : reached && !isInterrupted
                  ? 'border-green-500 bg-green-500 text-white'
                  : reached && isInterrupted
                    ? 'border-red-400 bg-red-400 text-white'
                    : 'border-slate-300 bg-white text-slate-300'
            }`}>
              <span className="material-symbols-outlined text-sm">
                {isCurrent ? 'radio_button_checked' : reached ? 'check' : 'radio_button_unchecked'}
              </span>
            </span>
            <div className="pt-1.5">
              <p className={`text-sm font-bold ${reached ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>{stage.label}</p>
              {ts && <p className="text-xs text-on-surface-variant mt-0.5">{fmtDate(ts)}</p>}
            </div>
          </div>
        );
      })}

      {isInterrupted && (
        <div className="relative flex gap-3">
          <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-red-500 text-white">
            <span className="material-symbols-outlined text-sm">cancel</span>
          </span>
          <div className="pt-1.5">
            <p className="text-sm font-bold text-red-600">{statusMeta(booking.status).label}</p>
            {booking.cancellation_reason && (
              <p className="text-xs text-on-surface-variant mt-0.5">Reason: {booking.cancellation_reason}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const CarWashBookingDetail = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadBooking = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/vendor/car-wash/bookings/${bookingId}`);
      setBooking(res.data?.data || null);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        setError({ code: 404, message: 'Booking not found or you do not have access to it.' });
      } else if (status === 403) {
        setError({ code: 403, message: 'You are not authorized to view this booking.' });
      } else {
        setError({ code: status || 0, message: err.response?.data?.message || 'Failed to load booking details.' });
      }
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => { loadBooking(); }, [loadBooking]);

  const handleUpdateStatus = async (nextStatus) => {
    try {
      setActionLoading(true);
      const res = await api.patch(`/vendor/car-wash/bookings/${bookingId}/status`, { status: nextStatus });
      if (res.data?.success) {
        setMessage(`✅ Booking status updated to ${titleCase(nextStatus)}!`);
        loadBooking();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.message || 'Failed to update booking status.'}`);
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
          {error.code === 404 ? 'Booking Not Found' : error.code === 403 ? 'Access Denied' : 'Error'}
        </h2>
        <p className="text-on-surface-variant text-sm">{error.message}</p>
        <button
          onClick={() => navigate('/vendor/car_wash_bookings')}
          className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary-dim transition-all shadow-md"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Bookings
        </button>
      </div>
    );
  }

  if (!booking) return null;

  const meta = statusMeta(booking.status);
  const addons = Array.isArray(booking.addons) ? booking.addons : [];
  const ref = booking.booking_reference || booking.booking_code || `#${booking.id}`;
  const phone = cleanPhone(booking.customer_phone);

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-6">

      {/* ── Top Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/vendor/car_wash_bookings')}
            className="p-2.5 hover:bg-surface-container-high rounded-xl transition-colors border border-outline-variant/10"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold font-headline text-on-surface">Booking {ref}</h2>
              <span
                className={`px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider ${meta.soft}`}
                style={{ borderColor: `${meta.color}40` }}
              >
                {meta.label}
              </span>
            </div>
            <p className="text-on-surface-variant text-xs mt-1">Booked on {fmtDate(booking.created_at)}</p>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {booking.status === 'pending' && (
            <button
              onClick={() => handleUpdateStatus('confirmed')}
              disabled={actionLoading}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              Confirm Booking
            </button>
          )}

          {booking.status === 'worker_assigned' && (
            <button
              onClick={() => handleUpdateStatus('washing')}
              disabled={actionLoading}
              className="px-4 py-2.5 bg-cyan-600 text-white rounded-xl text-xs font-bold hover:bg-cyan-700 transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">water_drop</span>
              Start Washing
            </button>
          )}

          {booking.status === 'washing' && (
            <button
              onClick={() => handleUpdateStatus('ready')}
              disabled={actionLoading}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">auto_awesome</span>
              Mark Vehicle Ready
            </button>
          )}

          {booking.status === 'ready' && (
            <button
              onClick={() => handleUpdateStatus('completed')}
              disabled={actionLoading}
              className="px-4 py-2.5 bg-green-700 text-white rounded-xl text-xs font-bold hover:bg-green-800 transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">done_all</span>
              Complete Booking
            </button>
          )}

          {!['completed', 'cancelled', 'rejected'].includes(booking.status) && (
            <button
              onClick={() => handleUpdateStatus('cancelled')}
              disabled={actionLoading}
              className="px-3 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">cancel</span>
              Cancel
            </button>
          )}

          <button
            onClick={loadBooking}
            className="p-2.5 border border-outline-variant/10 hover:bg-surface-container-high rounded-xl transition-colors"
            title="Refresh"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-lg">refresh</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-sm font-bold animate-fade-in ${message.includes('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message}
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Customer & Vehicle Details */}
        <Card title="Customer & Vehicle" icon="person">
          <div className="space-y-4">
            <Field label="Customer Name" value={booking.customer_name} />
            <Field label="Phone Number" value={booking.customer_phone} />
            {booking.customer_email && <Field label="Email Address" value={booking.customer_email} />}
            <Field label="Vehicle Plate Number" value={booking.vehicle_plate} highlight />
            {booking.vehicle_model && <Field label="Vehicle Model" value={booking.vehicle_model} />}

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
          </div>
        </Card>

        {/* Service & Schedule */}
        <Card title="Service & Schedule" icon="local_car_wash">
          <div className="space-y-4">
            <Field label="Service Name" value={booking.service_name} highlight />
            <Field label="Vehicle Type" value={booking.vehicle_type_name} />
            <Field label="Scheduled Date" value={booking.scheduled_date} />
            <Field label="Scheduled Time" value={booking.scheduled_time ? String(booking.scheduled_time).slice(0, 5) : null} />
            <Field label="Location / Address" value={booking.service_location || booking.address} />
          </div>
        </Card>

        {/* Payment & Financials */}
        <Card title="Payment Details" icon="payments">
          <div className="space-y-4">
            <Field label="Base Service Price" value={fmt(booking.base_price)} />
            {addons.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Selected Add-ons</p>
                <ul className="space-y-1">
                  {addons.map((a, i) => (
                    <li key={i} className="flex justify-between text-xs text-on-surface font-medium">
                      <span>{a.name}</span>
                      <span className="font-semibold">{fmt(a.price)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {booking.discount > 0 && <Field label="Discount" value={`-${fmt(booking.discount)}`} />}
            <div className="pt-2 border-t border-outline-variant/10">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Amount</p>
              <p className="text-xl font-headline font-bold text-primary mt-1">{fmt(booking.total_amount)}</p>
            </div>
            <Field label="Payment Method" value={booking.payment_method} />
            <Field label="Payment Status" value={booking.payment_status} highlight />
          </div>
        </Card>
      </div>

      {/* ── Assigned Worker ── */}
      <Card title="Assigned Wash Crew / Worker" icon="build">
        {booking.worker_name ? (
          <div className="space-y-2">
            <p className="text-base font-bold text-on-surface">{booking.worker_name}</p>
            {booking.worker_assigned_at && <p className="text-xs text-on-surface-variant">Assigned on: {fmtDate(booking.worker_assigned_at)}</p>}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant italic">No worker assigned yet.</p>
        )}
      </Card>

      {/* ── Progress Timeline ── */}
      <Card title="Booking Workflow Progress" icon="timeline">
        <Timeline booking={booking} />
      </Card>

      {/* ── Notes ── */}
      {booking.notes && (
        <Card title="Customer Notes & Instructions" icon="notes">
          <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{booking.notes}</p>
        </Card>
      )}
    </div>
  );
};

export default CarWashBookingDetail;
