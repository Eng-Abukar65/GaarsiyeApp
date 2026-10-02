import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, Car, CheckCircle2, XCircle, Droplets } from 'lucide-react';
import api from '../../utils/api';
import { TopBar, Loader, EmptyState, ErrorState } from '../../components/worker/workerUi';
import { relativeTime } from './workerStatus';

const META = {
  worker_assigned: { title: 'New job assigned', icon: ClipboardList, tint: 'bg-blue-50 text-blue-500' },
  washing: { title: 'Washing started', icon: Droplets, tint: 'bg-sky-50 text-sky-500' },
  ready: { title: 'Vehicle marked ready', icon: Car, tint: 'bg-violet-50 text-violet-500' },
  completed: { title: 'Job completed', icon: CheckCircle2, tint: 'bg-green-50 text-green-500' },
  cancelled: { title: 'Booking cancelled', icon: XCircle, tint: 'bg-rose-50 text-rose-500' },
  confirmed: { title: 'Booking confirmed', icon: CheckCircle2, tint: 'bg-green-50 text-green-500' },
};

const WorkerNotifications = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/worker/notifications');
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <TopBar title="Notifications" onBack={() => navigate('/worker')} />
      <div className="px-5 pt-5">
        {loading ? (
          <Loader label="Loading notifications…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" subtitle="Updates about your jobs will show up here." />
        ) : (
          <div className="space-y-2.5 pb-4">
            {items.map((n) => {
              const meta = META[n.status] || { title: `Status: ${n.status}`, icon: Bell, tint: 'bg-slate-50 text-slate-400' };
              const Icon = meta.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => n.booking_id && navigate(`/worker/jobs/${n.booking_id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-sm shadow-slate-200/70 active:scale-[0.99]"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.tint}`}>
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-slate-800">{meta.title}</p>
                    <p className="truncate text-[12px] text-slate-400">
                      {n.service_name || 'Car Service'}{n.customer_name ? ` • ${n.customer_name}` : ''}
                      {n.booking_code ? ` • ${n.booking_code}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-slate-400">{relativeTime(n.created_at)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerNotifications;
