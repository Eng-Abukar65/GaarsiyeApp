import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, History as HistoryIcon } from 'lucide-react';
import api from '../../utils/api';
import { BlueHeader, Loader, EmptyState, ErrorState } from '../../components/worker/workerUi';
import JobCard from '../../components/worker/JobCard';
import { vehicleLabel } from './workerStatus';

// Date windows for filtering completed jobs by completion date.
const DATE_FILTERS = [
  { key: 'all', label: 'All time' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
];

const withinDays = (dateStr, days) => {
  if (days === 'all') return true;
  if (!dateStr) return false;
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return false;
  return Date.now() - d <= Number(days) * 86400000;
};

const WorkerHistory = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [service, setService] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/worker/jobs', { params: { filter: 'completed' } });
      setJobs(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your history.');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Service options are derived from the real data, never hard-coded.
  const services = useMemo(() => {
    const set = new Set(jobs.map((j) => j.service_name).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [jobs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (!withinDays(j.completed_at || j.scheduled_date, dateFilter)) return false;
      if (service !== 'all' && j.service_name !== service) return false;
      if (!q) return true;
      return [j.service_name, j.customer_name, j.vehicle_plate, vehicleLabel(j), j.booking_code]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [jobs, query, dateFilter, service]);

  return (
    <div>
      <BlueHeader>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">History</h1>
          <button
            onClick={() => { setShowSearch((s) => !s); setQuery(''); }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 active:bg-white/25"
            aria-label="Search"
          >
            {showSearch ? <X size={18} /> : <Search size={18} />}
          </button>
        </div>
        {showSearch ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2">
            <Search size={16} className="text-white/80" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search completed jobs…"
              className="w-full bg-transparent text-[14px] text-white placeholder:text-white/70 focus:outline-none"
            />
          </div>
        ) : null}
        <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 no-scrollbar">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold ${
                dateFilter === f.key ? 'bg-white text-blue-600' : 'bg-white/15 text-white'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </BlueHeader>

      {/* Service filter (from real services) */}
      {services.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-5 pt-4 no-scrollbar">
          {services.map((s) => (
            <button
              key={s}
              onClick={() => setService(s)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
                service === s ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'}`}
            >
              {s === 'all' ? 'All services' : s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="px-5 pt-4">
        {loading ? (
          <Loader label="Loading history…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="No completed jobs"
            subtitle="Jobs you finish will be listed here."
          />
        ) : (
          <div className="space-y-3 pb-4">
            {visible.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerHistory;
