import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock, ClipboardList, Clock3, CheckCircle2, XCircle, Loader2, Users,
  UserCheck, Banknote, Droplets
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import api from '../../utils/api';
import {
  StatCard, ChartCard, TableCard, DashboardLoading, DashboardError,
  ModuleHeader, money, num, dayLabel, BLUE, GREEN,
} from './dashboardUi';

const STATUS_COLORS = {
  pending: '#F59E0B', confirmed: '#2563EB', worker_assigned: '#6366F1',
  washing: '#0EA5E9', ready: '#14B8A6', completed: '#166534', cancelled: '#EF4444',
  rejected: '#BE123C', payment_failed: '#EA580C',
};

const STATUS_LABELS = {
  pending: 'Pending', confirmed: 'Confirmed', worker_assigned: 'Worker Assigned',
  washing: 'Washing', ready: 'Vehicle Ready', completed: 'Completed', cancelled: 'Cancelled',
  rejected: 'Rejected', payment_failed: 'Payment Failed',
};

const bookingReference = (booking) =>
  booking?.booking_reference || booking?.booking_code || 'Reference pending';

const paymentLabel = (value) => String(value || 'unpaid')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const StatusBadge = ({ status }) => (
  <span
    className="px-2.5 py-1 font-semibold text-[10px] rounded-full uppercase tracking-wide"
    style={{ backgroundColor: `${STATUS_COLORS[status] || '#64748B'}1a`, color: STATUS_COLORS[status] || '#64748B' }}
  >
    {STATUS_LABELS[status] || status}
  </span>
);

const CarWashDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/vendor/car-wash/dashboard');
      if (res.data?.success) setData(res.data.data);
      else setError('Failed to load Car Services dashboard.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load Car Services dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    const interval = window.setInterval(refreshWhenVisible, 30000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load]);

  if (loading) return <DashboardLoading label="Loading Car Services dashboard…" />;
  if (error) return <DashboardError message={error} onRetry={load} />;

  const stats = data?.stats || {};
  const charts = data?.charts || {};
  const daily = Array.isArray(charts.daily) ? charts.daily : [];
  const servicePopularity = Array.isArray(charts.service_popularity) ? charts.service_popularity : [];
  const statusDistribution = Array.isArray(charts.status_distribution) ? charts.status_distribution : [];
  const workerPerformance = Array.isArray(charts.worker_performance) ? charts.worker_performance : [];
  const recent = Array.isArray(data?.recent_bookings) ? data.recent_bookings : [];

  return (
    <section className="space-y-6">
      <ModuleHeader
        icon={Droplets}
        title="Car Services Dashboard"
        subtitle="Bookings, workers, and revenue for your Car Services business."
        onRefresh={load}
        accent="bg-blue-600 shadow-blue-600/20"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard icon={ClipboardList} tone="slate" label="Total Bookings" value={num(stats.total_bookings)} />
        <StatCard icon={CalendarClock} tone="blue" label="Today" value={num(stats.today_bookings)} sub="Created today" />
        <StatCard icon={Clock3} tone="amber" label="Pending" value={num(stats.pending_bookings)} />
        <StatCard icon={CheckCircle2} tone="blue" label="Confirmed" value={num(stats.confirmed_bookings)} />
        <StatCard icon={Loader2} tone="sky" label="In Progress" value={num(stats.in_progress_jobs)} sub="Assigned / washing" />
        <StatCard icon={CheckCircle2} tone="green" label="Completed" value={num(stats.completed_jobs)} />
        <StatCard icon={XCircle} tone="red" label="Cancelled" value={num(stats.cancelled_jobs)} />
        <StatCard icon={Users} tone="indigo" label="Active Workers" value={num(stats.active_workers)} />
        <StatCard icon={UserCheck} tone="green" label="Available" value={num(stats.available_workers)} />
        <StatCard icon={Loader2} tone="amber" label="Busy" value={num(stats.busy_workers)} />
        <StatCard
          icon={Banknote}
          tone="green"
          label="Revenue Today"
          value={money(stats.revenue_today)}
          className="col-span-2"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Daily Bookings (last 7 days)" empty={!daily.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip labelFormatter={dayLabel} />
              <Bar dataKey="bookings" fill={BLUE} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weekly Revenue (completed)" empty={!daily.length}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip labelFormatter={dayLabel} formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="revenue" stroke={GREEN} strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Service Popularity" empty={!servicePopularity.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={servicePopularity} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="count" fill={BLUE} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Booking Status Distribution" empty={!statusDistribution.length}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusDistribution}
                dataKey="count"
                nameKey="status"
                cx="50%" cy="50%" outerRadius={80}
                label={(e) => STATUS_LABELS[e.status] || e.status}
              >
                {statusDistribution.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#64748B'} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [v, STATUS_LABELS[n] || n]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Worker Performance (completed jobs)" empty={!workerPerformance.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workerPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="completed" fill={GREEN} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TableCard
          title="Recent Bookings"
          headers={['Booking', 'Customer', 'Service', 'Worker', 'Total', 'Status']}
          emptyLabel="No bookings yet"
          rows={recent.map((b) => (
            <tr key={b.id} className="hover:bg-surface-container-low/30 transition-colors">
              <td className="py-3 px-5 font-bold text-blue-700">
                <Link to="/vendor/car_wash_bookings" className="hover:underline underline-offset-2">
                  {bookingReference(b)}
                </Link>
              </td>
              <td className="py-3 px-5">{b.customer_name}</td>
              <td className="py-3 px-5">{b.service_name || '—'}</td>
              <td className="py-3 px-5">{b.worker_name || <span className="text-on-surface-variant/50">Unassigned</span>}</td>
              <td className="py-3 px-5 font-bold">{money(b.total_price)}</td>
              <td className="py-3 px-5"><StatusBadge status={b.status} /></td>
            </tr>
          ))}
        />

        <TableCard
          title="Recent Payments"
          headers={['Booking', 'Customer', 'Amount', 'Payment']}
          emptyLabel="No payments yet"
          rows={recent.map((b) => (
            <tr key={`pay-${b.id}`} className="hover:bg-surface-container-low/30 transition-colors">
              <td className="py-3 px-5 font-bold text-blue-700">{bookingReference(b)}</td>
              <td className="py-3 px-5">{b.customer_name}</td>
              <td className="py-3 px-5 font-bold">{money(b.total_price)}</td>
              <td className="py-3 px-5">
                <span className={`px-2.5 py-1 font-semibold text-[10px] rounded-full uppercase tracking-wide ${
                  b.payment_status === 'paid' ? 'bg-green-100 text-green-700'
                    : b.payment_status === 'refunded' ? 'bg-slate-100 text-slate-600'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {paymentLabel(b.payment_status)}
                </span>
              </td>
            </tr>
          ))}
        />
      </div>
    </section>
  );
};

export default CarWashDashboard;
