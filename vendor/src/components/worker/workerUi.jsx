import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, Inbox, AlertTriangle } from 'lucide-react';
import { statusMeta, workerInitials } from '../../pages/worker/workerStatus';

// ─── Car Services Worker design system ────────────────────────────────────────────
// A clean, mobile-first kit shared by every worker screen. Blue / white / green,
// rounded cards, soft shadows — matching the provided design.

/** Circular avatar with an initials fallback. */
export const Avatar = ({ name, src, size = 44, ring = false }) => {
  const [broken, setBroken] = React.useState(false);
  const px = `${size}px`;
  const base =
    'https://__NONE__'; // sentinel so an empty src never resolves to the page
  const url = src && src !== base ? src : null;
  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name || 'Worker'}
        onError={() => setBroken(true)}
        style={{ width: px, height: px }}
        className={`rounded-full object-cover ${ring ? 'ring-2 ring-white/70' : ''}`}
      />
    );
  }
  return (
    <div
      style={{ width: px, height: px, fontSize: size * 0.36 }}
      className={`flex items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 ${
        ring ? 'ring-2 ring-white/70' : ''
      }`}
    >
      {workerInitials(name)}
    </div>
  );
};

/** Small solid status pill. */
export const StatusPill = ({ status, className = '' }) => {
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.pill} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

/** Rounded blue app header with a curved bottom, used at the top of each screen. */
export const BlueHeader = ({ children, className = '' }) => (
  <div
    className={`bg-gradient-to-b from-blue-600 to-blue-500 px-5 pt-5 pb-6 rounded-b-[28px] text-white shadow-lg shadow-blue-600/20 ${className}`}
  >
    {children}
  </div>
);

/** A plain header with an optional back button and right-hand action. */
export const TopBar = ({ title, onBack, right, subtitle }) => {
  const navigate = useNavigate();
  return (
    <BlueHeader>
      <div className="flex items-center gap-3">
        {onBack !== undefined ? (
          <button
            onClick={onBack || (() => navigate(-1))}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 active:bg-white/25"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-white/80">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </BlueHeader>
  );
};

export const SectionTitle = ({ children, action }) => (
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-[15px] font-bold text-slate-900">{children}</h2>
    {action}
  </div>
);

export const Card = ({ children, className = '', onClick }) => (
  <div
    onClick={onClick}
    className={`rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70 ${
      onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''
    } ${className}`}
  >
    {children}
  </div>
);

/** Full-screen centered spinner. */
export const Loader = ({ label = 'Loading…' }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
    <Loader2 size={26} className="animate-spin text-blue-500" />
    <p className="text-sm font-medium">{label}</p>
  </div>
);

/** Inline skeleton block, for card-level loading. */
export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />
);

export const EmptyState = ({ icon: Icon = Inbox, title = 'Nothing here yet', subtitle }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-8 py-20 text-center">
    <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-400">
      {React.createElement(Icon, { size: 28 })}
    </div>
    <p className="text-[15px] font-bold text-slate-700">{title}</p>
    {subtitle ? <p className="max-w-[240px] text-sm text-slate-400">{subtitle}</p> : null}
  </div>
);

export const ErrorState = ({ message = 'Something went wrong.', onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
      <AlertTriangle size={28} />
    </div>
    <p className="max-w-[260px] text-sm font-semibold text-slate-600">{message}</p>
    {onRetry ? (
      <button
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white active:bg-blue-700"
      >
        <RefreshCw size={15} /> Try again
      </button>
    ) : null}
  </div>
);

/** A labelled info row (icon + label + value) used on detail/profile screens. */
export const InfoRow = ({ icon: Icon, label, value, valueClass = '' }) => (
  <div className="flex items-start gap-3 py-2.5">
    {Icon ? (
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
        <Icon size={17} />
      </div>
    ) : null}
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-[14px] font-semibold text-slate-800 ${valueClass}`}>{value || '—'}</p>
    </div>
  </div>
);
