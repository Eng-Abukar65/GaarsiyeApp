import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  User, Phone, MapPin, Car, Sparkles, StickyNote, Wrench, Loader2, Check,
} from 'lucide-react';
import api from '../../utils/api';
import { TopBar, StatusPill, Loader, ErrorState, InfoRow } from '../../components/worker/workerUi';
import {
  buildTimeline, fmtShortDate, fmtTime, fmtStamp, vehicleLabel, money,
} from './workerStatus';

// The four worker actions, each shown only when the booking status allows it.
// Mirrors backend workerTransition rules exactly.
const actionsFor = (b) => {
  if (!b) return [];
  const list = [];
  if (b.status === 'worker_assigned') {
    if (!b.worker_accepted_at) list.push({ ep: 'accept', label: 'Accept Job', kind: 'green' });
    else list.push({ ep: 'start', label: 'Start Washing', kind: 'blue' });
  }
  if (b.status === 'washing') list.push({ ep: 'ready', label: 'Mark Vehicle Ready', kind: 'amber' });
  if (b.status === 'ready') list.push({ ep: 'complete', label: 'Complete Job', kind: 'green' });
  return list;
};

const BTN = {
  green: 'bg-green-600 active:bg-green-700 text-white',
  blue: 'bg-blue-600 active:bg-blue-700 text-white',
  amber: 'bg-amber-500 active:bg-amber-600 text-white',
};

const WorkerJobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acting, setActing] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/worker/jobs/${id}`);
      setJob(data?.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'This job is not available.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const run = async (ep) => {
    setActing(ep);
    setError('');
    setNotice('');
    try {
      await api.patch(`/worker/jobs/${id}/${ep}`);
      setNotice('Job updated.');
      await load();
      setTimeout(() => setNotice(''), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'That action is not allowed right now.');
    } finally {
      setActing('');
    }
  };

  if (loading) return <div><TopBar title="Job Details" onBack={() => navigate('/worker/jobs')} /><Loader /></div>;
  if (!job) {
    return (
      <div>
        <TopBar title="Job Details" onBack={() => navigate('/worker/jobs')} />
        <ErrorState message={error || 'Job not found or not assigned to you.'} onRetry={load} />
      </div>
    );
  }

  const timeline = buildTimeline(job);
  const actions = actionsFor(job);
  const plate = job.vehicle_plate ? String(job.vehicle_plate).toUpperCase() : null;

  return (
    <div>
      <TopBar title="Job Details" onBack={() => navigate('/worker/jobs')} />

      <div className="space-y-3 px-5 pt-5 pb-6">
        {/* Booking summary */}
        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Booking ID</p>
              <p className="text-[18px] font-extrabold text-slate-900">{job.booking_code}</p>
            </div>
            <StatusPill status={job.status} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[12.5px] text-slate-500">
            {fmtShortDate(job.scheduled_date)} • {fmtTime(job.scheduled_time)}
            <span className="ml-auto text-[15px] font-extrabold text-blue-600">{money(job.total_price)}</span>
          </div>
        </div>

        {(error || notice) ? (
          <p className={`rounded-xl px-3 py-2 text-center text-[13px] font-semibold ${
            error ? 'bg-rose-50 text-rose-600' : 'bg-green-50 text-green-700'}`}>
            {error || notice}
          </p>
        ) : null}

        {/* Customer */}
        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70">
          <p className="mb-1 text-[13px] font-bold text-slate-900">Customer</p>
          <InfoRow icon={User} label="Name" value={job.customer_name} />
          <InfoRow icon={Phone} label="Phone" value={job.customer_phone} />
          <InfoRow icon={MapPin} label="Location" value={job.service_address} />
        </div>

        {/* Vehicle */}
        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70">
          <p className="mb-1 text-[13px] font-bold text-slate-900">Vehicle</p>
          <InfoRow icon={Car} label="Vehicle" value={`${vehicleLabel(job)}${job.vehicle_color ? ` • ${job.vehicle_color}` : ''}`} />
          {job.vehicle_type_name ? <InfoRow icon={Car} label="Type" value={job.vehicle_type_name} /> : null}
          <InfoRow icon={Car} label="Plate Number" value={plate} valueClass="font-extrabold tracking-wide" />
        </div>

        {/* Service + add-ons */}
        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70">
          <p className="mb-2 text-[13px] font-bold text-slate-900">Service</p>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-slate-800">
            <Wrench size={16} className="text-blue-500" /> {job.service_name || 'Car Service'}
          </div>
          {Array.isArray(job.addons) && job.addons.length > 0 ? (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Add-ons</p>
              <div className="space-y-1.5">
                {job.addons.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-[13.5px]">
                    <span className="flex items-center gap-2 font-semibold text-slate-700">
                      <Sparkles size={14} className="text-blue-400" /> {a.name}
                    </span>
                    <span className="font-bold text-slate-500">{money(a.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Notes */}
        {job.notes ? (
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="mb-1 flex items-center gap-2 text-[13px] font-bold text-amber-800">
              <StickyNote size={15} /> Customer Notes
            </p>
            <p className="text-[13.5px] leading-relaxed text-amber-900/90">{job.notes}</p>
          </div>
        ) : null}

        {/* Progress timeline */}
        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70">
          <p className="mb-3 text-[13px] font-bold text-slate-900">Job Progress</p>
          <div className="space-y-0">
            {timeline.map((step, i) => {
              const last = i === timeline.length - 1;
              return (
                <div key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
                      step.done ? 'bg-blue-600 text-white' : 'border-2 border-slate-200 bg-white text-transparent'}`}>
                      <Check size={13} strokeWidth={3} />
                    </span>
                    {!last ? <span className={`w-0.5 flex-1 ${step.done ? 'bg-blue-500' : 'bg-slate-200'}`} style={{ minHeight: 22 }} /> : null}
                  </div>
                  <div className={`pb-4 ${last ? 'pb-0' : ''}`}>
                    <p className={`text-[13.5px] font-bold ${step.done ? 'text-slate-800' : 'text-slate-400'}`}>{step.label}</p>
                    {step.time ? <p className="text-[11.5px] text-slate-400">{fmtStamp(step.time)}</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions — only those the status allows */}
        {actions.length > 0 ? (
          <div className="space-y-2 pt-1">
            {actions.map((a) => (
              <button
                key={a.ep}
                onClick={() => run(a.ep)}
                disabled={!!acting}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold shadow-sm disabled:opacity-60 ${BTN[a.kind]}`}
              >
                {acting === a.ep ? <Loader2 size={17} className="animate-spin" /> : null}
                {a.label}
              </button>
            ))}
          </div>
        ) : job.status === 'completed' ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-green-50 py-3.5 text-[15px] font-bold text-green-700">
            <Check size={18} /> Job Completed
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default WorkerJobDetail;
