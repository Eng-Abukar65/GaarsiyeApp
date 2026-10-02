import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, ClipboardList } from 'lucide-react';
import api from '../../utils/api';
import { BlueHeader, Loader, EmptyState, ErrorState } from '../../components/worker/workerUi';
import JobCard from '../../components/worker/JobCard';
import { vehicleLabel } from './workerStatus';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

const WorkerJobs = () => {
  const [filter, setFilter] = useState('all');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async (f) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/worker/jobs', { params: { filter: f } });
      setJobs(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your jobs.');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.service_name, j.customer_name, j.vehicle_plate, vehicleLabel(j), j.booking_code, j.service_address]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [jobs, query]);

  return (
    <div>
      <BlueHeader>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">My Jobs</h1>
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
              placeholder="Search service, customer, plate…"
              className="w-full bg-transparent text-[14px] text-white placeholder:text-white/70 focus:outline-none"
            />
          </div>
        ) : null}

        {/* Filter chips */}
        <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition-colors ${
                filter === f.key ? 'bg-white text-blue-600' : 'bg-white/15 text-white active:bg-white/25'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </BlueHeader>

      <div className="px-5 pt-5">
        {loading ? (
          <Loader label="Loading jobs…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load(filter)} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={query ? 'No matching jobs' : 'No jobs here'}
            subtitle={query ? 'Try a different search term.' : `Nothing in "${FILTERS.find((f) => f.key === filter)?.label}" right now.`}
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

export default WorkerJobs;
