import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Clock, MapPin, ChevronRight } from 'lucide-react';
import { StatusPill } from './workerUi';
import { fmtShortDate, fmtTime, vehicleLabel } from '../../pages/worker/workerStatus';

// Tints the leading service icon so the list looks like the design (a soft,
// per-card coloured square). Deterministic from the booking id so it's stable.
const TINTS = [
  'bg-blue-50 text-blue-500',
  'bg-green-50 text-green-500',
  'bg-violet-50 text-violet-500',
  'bg-amber-50 text-amber-500',
  'bg-sky-50 text-sky-500',
  'bg-rose-50 text-rose-500',
];

/** A single job row shown on Home, Jobs and History. */
const JobCard = ({ job, showChevron = true }) => {
  const navigate = useNavigate();
  const tint = TINTS[(Number(job.id) || 0) % TINTS.length];
  const plate = job.vehicle_plate ? String(job.vehicle_plate).toUpperCase() : null;
  const when = `${fmtShortDate(job.scheduled_date)}${
    job.scheduled_time ? ` • ${fmtTime(job.scheduled_time)}` : ''
  }`;

  return (
    <button
      onClick={() => navigate(`/worker/jobs/${job.id}`)}
      className="w-full rounded-2xl bg-white p-4 text-left shadow-sm shadow-slate-200/70 transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Car size={20} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[15px] font-bold text-slate-900">
              {job.service_name || 'Car Service'}
            </p>
            <StatusPill status={job.status} className="shrink-0" />
          </div>

          <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-600">
            {job.customer_name || 'Customer'}
          </p>
          <p className="truncate text-[12.5px] text-slate-400">
            {vehicleLabel(job)}
            {plate ? <span className="text-slate-500"> • {plate}</span> : null}
          </p>

          <div className="mt-2 flex items-center gap-3 text-[12px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock size={13} className="text-slate-400" />
              {when}
            </span>
            {job.service_address ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin size={13} className="shrink-0 text-slate-400" />
                <span className="truncate">{job.service_address}</span>
              </span>
            ) : null}
          </div>

          {showChevron ? (
            <div className="mt-2 flex items-center gap-1 text-[13px] font-bold text-blue-600">
              View Details <ChevronRight size={15} />
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
};

export default JobCard;
