// Shared status metadata + formatting for the Car Services Worker app.

// Solid pill styles that match the blue / white / green theme in the design.
export const STATUS_META = {
  worker_assigned: { label: 'Assigned', pill: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  washing: { label: 'Washing', pill: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  ready: { label: 'Ready', pill: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  completed: { label: 'Completed', pill: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Cancelled', pill: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  rejected: { label: 'Rejected', pill: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  pending: { label: 'Pending', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
};

export const statusMeta = (status) =>
  STATUS_META[status] || { label: status || 'Unknown', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

// The single valid next action a worker may take, given the booking state.
// Returns null when there is nothing for the worker to do.
export const nextAction = (booking) => {
  if (!booking) return null;
  if (booking.status === 'worker_assigned') {
    return booking.worker_accepted_at
      ? { key: 'start', label: 'Start Washing', endpoint: 'start' }
      : { key: 'accept', label: 'Accept Job', endpoint: 'accept' };
  }
  if (booking.status === 'washing') return { key: 'ready', label: 'Mark Vehicle Ready', endpoint: 'ready' };
  if (booking.status === 'ready') return { key: 'complete', label: 'Complete Job', endpoint: 'complete' };
  return null;
};

// The five-step timeline shown on the Job Details screen. Each step is marked
// done / current based on the real booking status + timestamps.
export const buildTimeline = (booking) => {
  if (!booking) return [];
  const s = booking.status;
  const rank = { worker_assigned: 1, washing: 2, ready: 3, completed: 4 };
  const cur = rank[s] ?? 0;
  const accepted = Boolean(booking.worker_accepted_at);
  return [
    { key: 'assigned', label: 'Assigned', done: cur >= 1, time: booking.worker_assigned_at },
    { key: 'accepted', label: 'Accepted', done: accepted || cur >= 2, time: booking.worker_accepted_at },
    { key: 'washing', label: 'Washing In Progress', done: cur >= 2, time: booking.started_at },
    { key: 'ready', label: 'Vehicle Ready', done: cur >= 3, time: booking.ready_at },
    { key: 'completed', label: 'Completed', done: cur >= 4, time: booking.completed_at },
  ];
};

export const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
};

export const fmtShortDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return String(d);
  }
};

export const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = Number(h);
  if (Number.isNaN(hour)) return String(t);
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m || '00'} ${period}`;
};

// A friendly time for a timestamp (used on the progress timeline + activity feed).
export const fmtStamp = (ts) => {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const relativeTime = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(diff)) return '';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(ts);
};

export const money = (v) => `$${Number(v || 0).toFixed(2)}`;

export const workerInitials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'W';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Normalises the skills column, which may be a JSON array string, a CSV string,
// or already an array.
export const parseSkills = (skills) => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  try {
    const parsed = JSON.parse(skills);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* not JSON */ }
  return String(skills).split(',').map((s) => s.trim()).filter(Boolean);
};

export const vehicleLabel = (b) => {
  const parts = [b?.vehicle_brand, b?.vehicle_model].filter(Boolean).join(' ');
  return parts || b?.vehicle_type_name || 'Vehicle';
};
