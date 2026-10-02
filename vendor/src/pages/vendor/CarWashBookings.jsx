import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Droplets,
  FileText,
  Flag,
  Inbox,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Star,
  User,
  UserCheck,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import api, { SOCKET_URL } from '../../utils/api';
import { getToken, getUser } from '../../utils/auth';

const STATUS_META = {
  pending: { label: 'Pending', color: '#F59E0B', soft: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { label: 'Confirmed', color: '#2563EB', soft: 'bg-blue-50 text-blue-700 border-blue-200' },
  worker_assigned: { label: 'Awaiting Worker Response', color: '#7C3AED', soft: 'bg-violet-50 text-violet-700 border-violet-200' },
  worker_accepted: { label: 'Worker Accepted', color: '#4F46E5', soft: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  washing: { label: 'In Progress', color: '#0891B2', soft: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  ready: { label: 'Vehicle Ready', color: '#16A34A', soft: 'bg-green-50 text-green-700 border-green-200' },
  completed: { label: 'Completed', color: '#166534', soft: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelled', color: '#DC2626', soft: 'bg-red-50 text-red-700 border-red-200' },
  rejected: { label: 'Rejected', color: '#BE123C', soft: 'bg-rose-50 text-rose-700 border-rose-200' },
  payment_failed: { label: 'Payment Failed', color: '#EA580C', soft: 'bg-orange-50 text-orange-700 border-orange-200' },
};

const FLOW = [
  { status: 'pending', label: 'Submitted', icon: Send, timestampKeys: ['submitted_at', 'created_at'] },
  { status: 'confirmed', label: 'Confirmed', icon: BadgeCheck, timestampKeys: ['confirmed_at'] },
  { status: 'worker_assigned', label: 'Assigned', icon: UserCheck, timestampKeys: ['worker_assigned_at'] },
  { status: 'worker_accepted', label: 'Accepted', icon: CheckCircle2, timestampKeys: ['worker_accepted_at'] },
  { status: 'washing', label: 'In Progress', icon: Droplets, timestampKeys: ['started_at'] },
  { status: 'completed', label: 'Completed', icon: Check, timestampKeys: ['completed_at'] },
];

const NEXT_ACTIONS = {
  pending: [
    { to: 'confirmed', label: 'Confirm booking', shortLabel: 'Confirm', icon: CheckCircle2, tone: 'bg-blue-600 hover:bg-blue-700' },
    { to: 'rejected', label: 'Reject booking', shortLabel: 'Reject', icon: XCircle, tone: 'bg-rose-600 hover:bg-rose-700', destructive: true },
  ],
  confirmed: [
    { to: 'worker_assigned', label: 'Assign Worker', shortLabel: 'Assign Worker', icon: UserPlus, tone: 'bg-violet-600 hover:bg-violet-700', needsWorker: true },
    { to: 'cancelled', label: 'Cancel booking', shortLabel: 'Cancel', icon: XCircle, tone: 'bg-red-600 hover:bg-red-700', destructive: true },
  ],
  worker_assigned: [
    { to: 'worker_assigned', label: 'Reassign Worker', shortLabel: 'Reassign', icon: UserPlus, tone: 'bg-violet-600 hover:bg-violet-700', needsWorker: true },
    { to: 'washing', label: 'Start Washing', shortLabel: 'Start Washing', icon: Play, tone: 'bg-cyan-600 hover:bg-cyan-700' },
    { to: 'cancelled', label: 'Cancel', shortLabel: 'Cancel', icon: XCircle, tone: 'bg-red-600 hover:bg-red-700', destructive: true },
  ],
  worker_accepted: [
    { to: 'washing', label: 'Start Washing', shortLabel: 'Start Washing', icon: Play, tone: 'bg-cyan-600 hover:bg-cyan-700' },
  ],
  washing: [
    { to: 'completed', label: 'Complete Booking', shortLabel: 'Complete', icon: Check, tone: 'bg-emerald-600 hover:bg-emerald-700' },
  ],
  ready: [
    { to: 'completed', label: 'Complete Booking', shortLabel: 'Complete', icon: Check, tone: 'bg-emerald-600 hover:bg-emerald-700' },
  ],
};

const FILTERS = [
  { key: 'all', label: 'All Bookings', matches: () => true },
  { key: 'pending', label: 'Pending', matches: (s) => ['pending', 'payment_failed'].includes(s) },
  { key: 'assigned', label: 'Awaiting Worker', matches: (s) => ['confirmed', 'worker_assigned'].includes(s) },
  { key: 'in_progress', label: 'In Progress', matches: (s) => ['worker_accepted', 'washing', 'ready'].includes(s) },
  { key: 'completed', label: 'Completed', matches: (s) => s === 'completed' },
  { key: 'closed', label: 'Cancelled / Rejected', matches: (s) => ['cancelled', 'rejected'].includes(s) },
];

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

const titleCase = (v, fallback = 'N/A') => {
  if (!v) return fallback;
  return String(v).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) { return dateStr; }
};

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  try {
    const [h, m] = timeStr.split(':');
    const hr = parseInt(h, 10);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const formattedHr = hr % 12 || 12;
    return `${formattedHr}:${m} ${ampm}`;
  } catch (_) { return timeStr; }
};

export default function CarWashBookings() {
  const user = getUser();
  const token = getToken();

  const [bookings, setBookings] = useState([]);
  const [availableWorkers, setAvailableWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  // Modals & Active Selections
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [assigningBooking, setAssigningBooking] = useState(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [pendingCancelTo, setPendingCancelTo] = useState('cancelled');

  // Load Bookings
  const loadBookings = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/vendor/car-wash/bookings');
      setBookings(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Available Online Workers
  const loadAvailableWorkers = useCallback(async () => {
    setWorkersLoading(true);
    try {
      const res = await api.get('/vendor/car-wash/workers?includeInactive=false');
      const all = res.data?.data || res.data || [];
      // Vendor assigns ONLY available, active, online workers
      const availableOnly = all.filter(w => 
        Number(w.is_active) === 1 && 
        (String(w.availability_status).toLowerCase() === 'available' || String(w.status).toLowerCase() === 'available')
      );
      setAvailableWorkers(availableOnly);
    } catch (err) {
      console.warn('Failed to load workers:', err);
      setAvailableWorkers([]);
    } finally {
      setWorkersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
    loadAvailableWorkers();
  }, [loadBookings, loadAvailableWorkers]);

  // Real-time Socket Updates
  useEffect(() => {
    if (!user?.id) return;
    const socket = io(SOCKET_URL, { auth: { token } });
    const channel = `vendor_${user.id}`;

    socket.on('connect', () => socket.emit('join', channel));
    socket.on('car_wash_booking_updated', () => {
      loadBookings();
      loadAvailableWorkers();
    });
    socket.on('car_wash_worker_update', () => {
      loadBookings();
      loadAvailableWorkers();
    });

    return () => socket.disconnect();
  }, [user?.id, token, loadBookings, loadAvailableWorkers]);

  // Filtered Bookings
  const filteredBookings = useMemo(() => {
    const filterObj = FILTERS.find(f => f.key === activeFilter) || FILTERS[0];
    const q = search.toLowerCase().trim();

    return bookings.filter(b => {
      const statusMatch = filterObj.matches(b.status);
      if (!statusMatch) return false;
      if (!q) return true;

      const ref = (b.booking_reference || b.booking_code || '').toLowerCase();
      const cName = (b.customer_name || '').toLowerCase();
      const cPhone = (b.customer_phone || '').toLowerCase();
      const plate = (b.vehicle_plate || '').toLowerCase();
      const worker = (b.worker_name || '').toLowerCase();
      const service = (b.service_name || '').toLowerCase();

      return ref.includes(q) || cName.includes(q) || cPhone.includes(q) || plate.includes(q) || worker.includes(q) || service.includes(q);
    });
  }, [bookings, activeFilter, search]);

  // Summary Counters
  const counts = useMemo(() => {
    return {
      all: bookings.length,
      pending: bookings.filter(b => ['pending', 'payment_failed'].includes(b.status)).length,
      assigned: bookings.filter(b => ['confirmed', 'worker_assigned'].includes(b.status)).length,
      in_progress: bookings.filter(b => ['worker_accepted', 'washing', 'ready'].includes(b.status)).length,
      completed: bookings.filter(b => b.status === 'completed').length,
      closed: bookings.filter(b => ['cancelled', 'rejected'].includes(b.status)).length,
    };
  }, [bookings]);

  // Status transition execution
  const executeStatusChange = async (bookingId, toStatus, extraData = {}) => {
    setUpdating(true);
    setActionError('');
    try {
      const payload = { status: toStatus, ...extraData };
      const res = await api.patch(`/vendor/car-wash/bookings/${bookingId}/status`, payload);
      const updated = res.data?.data;

      setBookings(prev => prev.map(b => (b.id === bookingId ? { ...b, ...updated } : b)));
      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(prev => ({ ...prev, ...updated }));
      }
      setAssigningBooking(null);
      setSelectedWorkerId('');
      setShowCancelDialog(false);
      setCancelReason('');
      loadAvailableWorkers();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setUpdating(false);
    }
  };

  const handleActionClick = (booking, action) => {
    if (action.needsWorker) {
      setAssigningBooking(booking);
      setSelectedWorkerId(booking.worker_id ? String(booking.worker_id) : '');
      setActionError('');
      loadAvailableWorkers();
      return;
    }
    if (action.destructive) {
      setAssigningBooking(booking);
      setPendingCancelTo(action.to);
      setShowCancelDialog(true);
      setActionError('');
      return;
    }
    executeStatusChange(booking.id, action.to);
  };

  const handleConfirmAssignment = (e) => {
    e.preventDefault();
    if (!selectedWorkerId) {
      setActionError('Please select an available worker.');
      return;
    }
    executeStatusChange(assigningBooking.id, 'worker_assigned', { worker_id: parseInt(selectedWorkerId, 10) });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-surface-container-lowest via-surface-container-low to-surface-container-lowest p-6 border border-outline-variant/10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 animate-pulse" />
            <h1 className="text-xl font-black text-on-surface tracking-tight">Car Services Bookings</h1>
          </div>
          <p className="text-xs text-on-surface-variant">
            Manage live customer bookings, assign available workers, track real-time progress, and view ratings.
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); loadBookings(); loadAvailableWorkers(); }}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container text-xs font-bold text-on-surface transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Sync Queue
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', count: counts.all, filter: 'all', color: 'bg-slate-50 border-slate-200 text-slate-700' },
          { label: 'Pending', count: counts.pending, filter: 'pending', color: 'bg-amber-50 border-amber-200 text-amber-700' },
          { label: 'Awaiting Worker', count: counts.assigned, filter: 'assigned', color: 'bg-violet-50 border-violet-200 text-violet-700' },
          { label: 'In Progress', count: counts.in_progress, filter: 'in_progress', color: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
          { label: 'Completed', count: counts.completed, filter: 'completed', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'Cancelled', count: counts.closed, filter: 'closed', color: 'bg-rose-50 border-rose-200 text-rose-700' },
        ].map((st) => (
          <button
            key={st.filter}
            onClick={() => setActiveFilter(st.filter)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              activeFilter === st.filter ? `${st.color} shadow-sm ring-2 ring-primary/20` : 'bg-surface-container-lowest border-outline-variant/10 hover:border-outline-variant/30'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">{st.label}</p>
            <p className="text-2xl font-black text-on-surface">{st.count}</p>
          </button>
        ))}
      </div>

      {/* Main Panel */}
      <div className="rounded-3xl bg-surface-container-lowest border border-outline-variant/10 shadow-sm overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 border-b border-outline-variant/10 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-surface-container-low/30">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  activeFilter === f.key
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative min-w-[240px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ref, customer, plate, worker…"
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-container-high border-none outline-none text-xs text-on-surface focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-6 text-center text-red-500 font-medium text-sm flex items-center justify-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Bookings List */}
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-xs text-on-surface-variant font-medium">Loading bookings queue…</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center px-4">
            <div className="h-14 w-14 rounded-full bg-surface-container-high flex items-center justify-center mb-3 text-on-surface-variant">
              <Inbox size={28} />
            </div>
            <p className="font-bold text-on-surface text-sm">No bookings found</p>
            <p className="text-xs text-on-surface-variant mt-1">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/5">
            {filteredBookings.map((b) => {
              const meta = STATUS_META[b.status] || { label: titleCase(b.status), soft: 'bg-slate-100 text-slate-700' };
              const actions = NEXT_ACTIONS[b.status] || [];

              return (
                <div key={b.id} className="p-5 hover:bg-surface-container-low/20 transition-colors flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                  {/* Left Info */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-black text-sm text-on-surface">{b.booking_reference || b.booking_code}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.soft}`}>
                        {meta.label}
                      </span>
                      {b.payment_status === 'paid' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <Check size={10} /> Paid ({money(b.total_price)})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {titleCase(b.payment_status)} ({money(b.total_price)})
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                      <div className="flex items-center gap-1.5 text-on-surface">
                        <User size={13} className="text-on-surface-variant shrink-0" />
                        <span className="font-semibold truncate">{b.customer_name}</span>
                        {b.customer_phone && <span className="text-on-surface-variant font-mono">({b.customer_phone})</span>}
                      </div>

                      <div className="flex items-center gap-1.5 text-on-surface">
                        <CarFront size={13} className="text-on-surface-variant shrink-0" />
                        <span className="font-semibold truncate">{b.service_name || 'Car Service'}</span>
                        <span className="text-on-surface-variant font-mono uppercase font-bold">[{b.vehicle_plate || b.vehicle_type_name || 'Vehicle'}]</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-on-surface-variant">
                        <CalendarDays size={13} className="shrink-0" />
                        <span>{formatDate(b.scheduled_date)} {formatTime(b.scheduled_time)}</span>
                      </div>
                    </div>

                    {/* Assigned Worker Badge */}
                    <div className="flex items-center gap-2 text-xs">
                      <UserCheck size={13} className={b.worker_name ? 'text-violet-600' : 'text-slate-400'} />
                      <span className="text-on-surface-variant font-medium">Assigned Worker:</span>
                      {b.worker_name ? (
                        <span className="font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-100">
                          {b.worker_name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                      {b.rating && (
                        <div className="flex items-center gap-1 text-amber-500 font-bold ml-2">
                          <Star size={12} className="fill-amber-400" />
                          <span>{b.rating} / 5</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                    {actions.map((act) => {
                      const Icon = act.icon;
                      return (
                        <button
                          key={act.to + act.label}
                          onClick={() => handleActionClick(b, act)}
                          disabled={updating}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow-sm ${act.tone} disabled:opacity-50`}
                        >
                          <Icon size={14} />
                          <span>{act.shortLabel}</span>
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setSelectedBooking(b)}
                      className="px-3 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container text-xs font-bold text-on-surface transition-colors flex items-center gap-1"
                    >
                      <span>Details</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Assign / Reassign Worker Modal ────────────────────────────────────── */}
      {assigningBooking && !showCancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-6 shadow-2xl border border-outline-variant/10 space-y-5">
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-4">
              <div>
                <h3 className="font-bold text-base text-on-surface">Assign Car Services Worker</h3>
                <p className="text-xs text-on-surface-variant font-mono">{assigningBooking.booking_reference || assigningBooking.booking_code}</p>
              </div>
              <button onClick={() => setAssigningBooking(null)} className="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant">
                <X size={18} />
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-semibold flex items-center gap-2 border border-red-200">
                <AlertTriangle size={14} /> {actionError}
              </div>
            )}

            <form onSubmit={handleConfirmAssignment} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Select Available Worker *</label>
                {workersLoading ? (
                  <div className="py-4 text-center text-xs text-on-surface-variant flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin text-primary" /> Loading available workers…
                  </div>
                ) : availableWorkers.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
                    No available online workers found right now. Make sure a worker is online and active in Personnel Management.
                  </div>
                ) : (
                  <select
                    value={selectedWorkerId}
                    onChange={e => setSelectedWorkerId(e.target.value)}
                    className="w-full p-3 rounded-xl bg-surface-container-high border-none text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">-- Choose Worker --</option>
                    {availableWorkers.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.first_name || w.name} {w.last_name || ''} (Rating: {w.rating || 'N/A'}★)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setAssigningBooking(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container-high"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating || !selectedWorkerId}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-dim disabled:opacity-50 flex items-center gap-2"
                >
                  {updating ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Cancel / Reject Dialog ───────────────────────────────────────────── */}
      {showCancelDialog && assigningBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-6 shadow-2xl border border-outline-variant/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-on-surface">Confirm {pendingCancelTo === 'rejected' ? 'Rejection' : 'Cancellation'}</h3>
              <button onClick={() => setShowCancelDialog(false)} className="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-on-surface-variant">
              Are you sure you want to {pendingCancelTo === 'rejected' ? 'reject' : 'cancel'} booking <strong className="text-on-surface font-mono">{assigningBooking.booking_reference}</strong>?
            </p>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Reason (Optional)</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation/rejection…"
                rows={2}
                className="w-full p-3 rounded-xl bg-surface-container-high border-none text-xs text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setShowCancelDialog(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container-high">
                Keep Booking
              </button>
              <button
                onClick={() => executeStatusChange(assigningBooking.id, pendingCancelTo, { reason: cancelReason })}
                disabled={updating}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {updating ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── View Booking Details Modal ────────────────────────────────────────── */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-surface-container-lowest rounded-3xl p-6 shadow-2xl border border-outline-variant/10 max-h-[90vh] overflow-y-auto space-y-6 scrollbar-none">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Booking Details</span>
                <h2 className="text-lg font-black text-on-surface font-mono">{selectedBooking.booking_reference || selectedBooking.booking_code}</h2>
              </div>
              <button onClick={() => setSelectedBooking(null)} className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant">
                <X size={18} />
              </button>
            </div>

            {/* Customer & Vehicle Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-surface-container-low/40 border border-outline-variant/10 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Customer Details</p>
                <p className="font-bold text-sm text-on-surface">{selectedBooking.customer_name}</p>
                <div className="flex items-center gap-1.5 text-xs text-on-surface-variant"><Phone size={12} /> {selectedBooking.customer_phone || 'Phone not provided'}</div>
                {selectedBooking.service_address && (
                  <div className="flex items-start gap-1.5 text-xs text-on-surface-variant"><MapPin size={12} className="mt-0.5 shrink-0" /> {selectedBooking.service_address}</div>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-surface-container-low/40 border border-outline-variant/10 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Vehicle Info</p>
                <p className="font-bold text-sm text-on-surface uppercase font-mono">{selectedBooking.vehicle_plate || 'No plate'}</p>
                <p className="text-xs text-on-surface-variant">{selectedBooking.vehicle_type_name} {selectedBooking.vehicle_brand} {selectedBooking.vehicle_model} ({selectedBooking.vehicle_color})</p>
              </div>
            </div>

            {/* Service & Add-ons Breakdown */}
            <div className="p-4 rounded-2xl bg-surface-container-low/40 border border-outline-variant/10 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Service &amp; Pricing Breakdown</p>
              <div className="flex items-center justify-between text-xs font-semibold text-on-surface">
                <span>{selectedBooking.service_name} (Base Price)</span>
                <span>{money(selectedBooking.base_price)}</span>
              </div>
              {Number(selectedBooking.vehicle_price) > 0 && (
                <div className="flex items-center justify-between text-xs text-on-surface-variant">
                  <span>Vehicle Type Surcharge ({selectedBooking.vehicle_type_name})</span>
                  <span>+{money(selectedBooking.vehicle_price)}</span>
                </div>
              )}
              {Array.isArray(selectedBooking.addons) && selectedBooking.addons.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-outline-variant/10">
                  <p className="text-[10px] font-bold uppercase text-on-surface-variant">Selected Add-ons</p>
                  {selectedBooking.addons.map((add, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs text-on-surface-variant">
                      <span>• {add.name}</span>
                      <span>+{money(add.price)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-2 border-t border-outline-variant/10 flex items-center justify-between text-sm font-black text-on-surface">
                <span>Total Amount ({selectedBooking.payment_status?.toUpperCase()})</span>
                <span className="text-primary">{money(selectedBooking.total_price)}</span>
              </div>
            </div>

            {/* Assigned Worker Section */}
            <div className="p-4 rounded-2xl bg-violet-50/50 border border-violet-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Assigned Car Services Worker</p>
                <p className="font-bold text-sm text-violet-900 mt-0.5">{selectedBooking.worker_name || 'No worker assigned yet'}</p>
              </div>
              {['confirmed', 'worker_assigned', 'worker_declined'].includes(selectedBooking.status) && (
                <button
                  onClick={() => {
                    const b = selectedBooking;
                    setSelectedBooking(null);
                    setAssigningBooking(b);
                    setSelectedWorkerId(b.worker_id ? String(b.worker_id) : '');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Pencil size={12} /> {selectedBooking.worker_name ? 'Reassign' : 'Assign'}
                </button>
              )}
            </div>

            {/* Workflow Timeline */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Workflow Timeline</p>
              <div className="space-y-3 pl-2 border-l-2 border-outline-variant/20">
                {FLOW.map((step) => {
                  const isCurrent = selectedBooking.status === step.status;
                  const Icon = step.icon;
                  let timestamp = null;
                  for (const key of step.timestampKeys) {
                    if (selectedBooking[key]) {
                      timestamp = selectedBooking[key];
                      break;
                    }
                  }

                  return (
                    <div key={step.status} className="flex items-start gap-3 relative pl-2">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                        timestamp ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container-high text-on-surface-variant'
                      }`}>
                        <Icon size={12} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-bold ${isCurrent ? 'text-primary' : 'text-on-surface'}`}>{step.label}</p>
                        {timestamp && <p className="text-[10px] text-on-surface-variant font-mono">{formatDate(timestamp)} {formatTime(timestamp)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Customer Rating & Review Card */}
            {selectedBooking.rating && (
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                    <Star size={12} className="fill-amber-400 text-amber-500" /> Customer Rating &amp; Review
                  </p>
                  <div className="flex items-center gap-1 text-amber-600 font-black text-sm">
                    <span>{selectedBooking.rating}</span>
                    <span className="text-xs text-amber-500">/ 5 Stars</span>
                  </div>
                </div>
                {selectedBooking.notes && (
                  <p className="text-xs text-amber-900 italic bg-white/60 p-2.5 rounded-xl border border-amber-100">
                    "{selectedBooking.notes}"
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
