import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Store, ChevronDown, Briefcase, Car, CheckCircle2, CalendarDays,
  Play, Loader2, ClipboardList,
} from 'lucide-react';
import api from '../../utils/api';
import { Avatar, StatusPill, Loader, ErrorState } from '../../components/worker/workerUi';
import {
  nextAction, fmtShortDate, fmtTime, vehicleLabel, relativeTime,
} from './workerStatus';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning,';
  if (h < 18) return 'Good Afternoon,';
  return 'Good Evening,';
};

const StatTile = ({ icon: Icon, value, label, tint, iconBg }) => (
  <div className="rounded-2xl bg-white p-3.5 shadow-sm shadow-slate-200/70">
    <div className="flex items-start justify-between">
      <span className={`text-[26px] font-extrabold leading-none ${tint}`}>{value}</span>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
        {React.createElement(Icon, { size: 16 })}
      </span>
    </div>
    <p className="mt-2 text-[12px] font-semibold text-slate-500">{label}</p>
  </div>
);

const WorkerHome = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingAvail, setTogglingAvail] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, s, j, n] = await Promise.all([
        api.get('/worker/profile'),
        api.get('/worker/stats'),
        api.get('/worker/jobs', { params: { filter: 'assigned' } }),
        api.get('/worker/notifications').catch(() => ({ data: { data: [] } })),
      ]);
      setProfile(p.data?.data || null);
      setStats(s.data?.data || null);
      setJobs(Array.isArray(j.data?.data) ? j.data.data : []);
      setActivity(Array.isArray(n.data?.data) ? n.data.data.slice(0, 4) : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentJob =
    jobs.find((j) => j.status === 'washing' || j.status === 'ready') ||
    jobs.find((j) => j.status === 'worker_assigned') ||
    null;

  const isAvailable = profile?.availability_status === 'available';

  const toggleAvailability = async () => {
    if (togglingAvail) return;
    setTogglingAvail(true);
    try {
      const next = isAvailable ? 'offline' : 'available';
      const { data } = await api.patch('/worker/availability', { availability_status: next });
      setProfile((p) => ({ ...p, availability_status: data?.data?.availability_status || next }));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change availability.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setTogglingAvail(false);
    }
  };

  const runCurrentAction = async () => {
    const action = nextAction(currentJob);
    if (!action || acting) return;
    setActing(true);
    try {
      await api.patch(`/worker/jobs/${currentJob.id}/${action.endpoint}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'That action is not allowed right now.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="bg-slate-50"><Loader label="Loading dashboard…" /></div>;
  if (error && !profile) return <ErrorState message={error} onRetry={load} />;

  const name = profile?.name ||
    `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Worker';
  const action = nextAction(currentJob);

  return (
    <div>
      {/* ── Header ── */}
      <div className="bg-gradient-to-b from-blue-600 to-blue-500 px-5 pt-5 pb-10 text-white shadow-lg shadow-blue-600/20 rounded-b-[28px]">
        <div className="flex items-center gap-3">
          <Avatar name={name} src={profile?.profile_image} size={48} ring />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-white/85">{greeting()}</p>
            <p className="truncate text-[17px] font-bold leading-tight">{name}</p>
            <p className="text-[12px] text-white/80">Car Services Worker</p>
          </div>
          <button
            onClick={() => navigate('/worker/notifications')}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/15 active:bg-white/25"
            aria-label="Notifications"
          >
            <Bell size={19} />
            {activity.length > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold">
                {activity.length}
              </span>
            ) : null}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[13px] text-white/90">
          <Store size={14} />
          <span className="truncate">{profile?.vendor_business_name || profile?.vendor_name || 'Car Services'}</span>
        </div>
      </div>

      {/* ── Availability toggle (overlaps header) ── */}
      <div className="-mt-6 px-5">
        <button
          onClick={toggleAvailability}
          disabled={togglingAvail}
          className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-md shadow-slate-200/80 disabled:opacity-70"
        >
          <span className="flex items-center gap-2 text-[14px] font-bold text-slate-800">
            <span className={`h-2.5 w-2.5 rounded-full ${isAvailable ? 'bg-green-500' : 'bg-slate-400'}`} />
            {isAvailable ? 'Available' : 'Offline'}
          </span>
          {togglingAvail ? (
            <Loader2 size={16} className="animate-spin text-slate-400" />
          ) : (
            <ChevronDown size={18} className="text-slate-400" />
          )}
        </button>
      </div>

      {error ? (
        <div className="mt-3 px-5">
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-[13px] font-semibold text-rose-600">{error}</p>
        </div>
      ) : null}

      {/* ── Today's Overview ── */}
      <div className="px-5 pt-5">
        <h2 className="mb-3 text-[15px] font-bold text-slate-900">Today's Overview</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon={Briefcase} value={stats?.pending ?? 0} label="Pending Jobs"
            tint="text-blue-600" iconBg="bg-blue-50 text-blue-500" />
          <StatTile icon={Car} value={stats?.active ?? 0} label="Active Job"
            tint="text-green-600" iconBg="bg-green-50 text-green-500" />
          <StatTile icon={CheckCircle2} value={stats?.completed ?? 0} label="Completed"
            tint="text-violet-600" iconBg="bg-violet-50 text-violet-500" />
          <StatTile icon={CalendarDays} value={stats?.today ?? 0} label="Today's Jobs"
            tint="text-amber-600" iconBg="bg-amber-50 text-amber-500" />
        </div>
      </div>

      {/* ── Current Job ── */}
      <div className="px-5 pt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-slate-900">Current Job</h2>
          <button onClick={() => navigate('/worker/jobs')} className="text-[13px] font-bold text-blue-600">
            View All
          </button>
        </div>

        {currentJob ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70">
            <button
              onClick={() => navigate(`/worker/jobs/${currentJob.id}`)}
              className="w-full rounded-xl bg-blue-50/50 p-3 text-left"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-500 shadow-sm">
                  <Car size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-slate-900">{currentJob.service_name || 'Car Service'}</p>
                  <p className="truncate text-[12.5px] font-semibold text-slate-600">{currentJob.customer_name}</p>
                  <p className="truncate text-[12px] text-slate-400">
                    {vehicleLabel(currentJob)}
                    {currentJob.vehicle_plate ? ` • ${String(currentJob.vehicle_plate).toUpperCase()}` : ''}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-slate-500">
                    <span>{fmtShortDate(currentJob.scheduled_date)} • {fmtTime(currentJob.scheduled_time)}</span>
                  </div>
                  <div className="mt-2"><StatusPill status={currentJob.status} /></div>
                </div>
              </div>
            </button>

            {action ? (
              <button
                onClick={runCurrentAction}
                disabled={acting}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-[14px] font-bold text-white active:bg-blue-700 disabled:opacity-60"
              >
                {acting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {action.label}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl bg-white px-4 py-8 text-center shadow-sm shadow-slate-200/70">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-400">
              <ClipboardList size={22} />
            </div>
            <p className="text-[14px] font-bold text-slate-700">No active job right now</p>
            <p className="text-[12.5px] text-slate-400">New jobs assigned to you will appear here.</p>
          </div>
        )}
      </div>

      {/* ── Recent Activity ── */}
      <div className="px-5 pb-8 pt-6">
        <h2 className="mb-3 text-[15px] font-bold text-slate-900">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-[13px] text-slate-400 shadow-sm shadow-slate-200/70">
            No recent activity yet.
          </p>
        ) : (
          <div className="space-y-2.5">
            {activity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm shadow-slate-200/70">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                  <ClipboardList size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-slate-800">
                    {activityTitle(a)}
                  </p>
                  <p className="truncate text-[12px] text-slate-400">
                    {a.service_name || 'Car Service'}{a.booking_code ? ` • ${a.booking_code}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-slate-400">{relativeTime(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const activityTitle = (a) => {
  const map = {
    worker_assigned: 'New job assigned',
    washing: 'Washing started',
    ready: 'Vehicle marked ready',
    completed: 'Job completed',
    cancelled: 'Booking cancelled',
    confirmed: 'Booking confirmed',
  };
  return map[a.status] || `Status: ${a.status}`;
};

export default WorkerHome;
