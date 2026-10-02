import React from 'react';
import { Loader2 } from 'lucide-react';

// Shared primitives for every business-module dashboard so Car Wash, Gas Depot,
// Petrol Station and Spare Parts all speak the same visual language.

export const BLUE = '#2563EB';
export const GREEN = '#16A34A';
export const AMBER = '#F59E0B';
export const SKY = '#0EA5E9';
export const INDIGO = '#6366F1';
export const RED = '#EF4444';

export const money = (n) => `$${Number(n || 0).toFixed(2)}`;
export const num = (n) => Number(n || 0).toLocaleString();
export const dayLabel = (d) => {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? String(d) : date.toLocaleDateString(undefined, { weekday: 'short' });
};

const TONES = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  amber: 'bg-amber-50 text-amber-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  sky: 'bg-sky-50 text-sky-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
};

export const StatCard = ({ icon: Icon, label, value, sub, tone = 'blue', className = '' }) => (
  <div className={`bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/20 shadow-sm flex flex-col justify-between min-h-[104px] transition-shadow hover:shadow-md ${className}`}>
    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${TONES[tone] || TONES.blue}`}>
      {Icon && <Icon size={16} />}
    </div>
    <div className="mt-3">
      <p className="text-[11px] font-bold text-on-surface-variant tracking-wider uppercase">{label}</p>
      <p className="text-xl font-bold font-headline text-on-surface leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider mt-0.5">{sub}</p>}
    </div>
  </div>
);

export const ChartCard = ({ title, children, empty }) => (
  <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm p-5">
    <h3 className="text-sm font-bold font-headline text-on-surface mb-4">{title}</h3>
    {empty ? (
      <div className="h-[220px] flex items-center justify-center text-xs font-bold uppercase tracking-widest text-on-surface-variant/50">
        No data yet
      </div>
    ) : (
      <div className="h-[220px]">{children}</div>
    )}
  </div>
);

export const TableCard = ({ title, headers, rows, emptyLabel = 'No data yet' }) => (
  <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden">
    <div className="p-5 border-b border-outline-variant/20">
      <h3 className="text-sm font-bold font-headline text-on-surface">{title}</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-surface-container-low/50 text-xs font-bold text-on-surface-variant tracking-wider uppercase border-b border-outline-variant/20">
            {headers.map((h) => <th key={h} className="py-3 px-5 font-medium whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="text-sm text-on-surface divide-y divide-outline-variant/10">
          {rows.length > 0 ? rows : (
            <tr>
              <td colSpan={headers.length} className="py-10 text-center text-on-surface-variant font-bold tracking-widest uppercase opacity-50">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const ORDER_STATUS_COLORS = {
  pending: AMBER, accepted: BLUE, confirmed: BLUE, processing: SKY,
  'driver assigned': INDIGO, 'on the way': SKY, on_the_way: SKY,
  delivered: GREEN, completed: GREEN, cancelled: RED, failed: RED,
};

export const OrderStatusBadge = ({ status }) => {
  const key = String(status || '').toLowerCase();
  const color = ORDER_STATUS_COLORS[key] || '#64748B';
  return (
    <span
      className="px-2.5 py-1 font-semibold text-[10px] rounded-full uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {status || 'Unknown'}
    </span>
  );
};

const STOCK_STATUS = {
  in_stock: { label: 'In stock', color: GREEN },
  low: { label: 'Low', color: AMBER },
  out_of_stock: { label: 'Out of stock', color: RED },
};

export const StockStatusBadge = ({ status }) => {
  const s = STOCK_STATUS[status] || STOCK_STATUS.in_stock;
  return (
    <span
      className="px-2.5 py-1 font-semibold text-[10px] rounded-full uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: `${s.color}1a`, color: s.color }}
    >
      {s.label}
    </span>
  );
};

export const DashboardLoading = ({ label = 'Loading dashboard…' }) => (
  <div className="flex items-center justify-center py-20 text-on-surface-variant font-bold uppercase tracking-widest gap-2">
    <Loader2 className="animate-spin" size={18} /> {label}
  </div>
);

export const DashboardError = ({ message, onRetry }) => (
  <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center">
    <p className="text-red-700 font-bold mb-3">{message}</p>
    <button onClick={onRetry} className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm">Retry</button>
  </div>
);

export const ModuleHeader = ({ icon: Icon, title, subtitle, accent = 'bg-blue-600 shadow-blue-600/20' }) => (
  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className={`w-11 h-11 rounded-2xl text-white flex items-center justify-center shadow-lg ${accent}`}>
        {Icon && <Icon size={22} />}
      </div>
      <div>
        <h2 className="text-xl font-bold font-headline text-on-surface">{title}</h2>
        <p className="text-sm text-on-surface-variant">{subtitle}</p>
      </div>
    </div>
  </div>
);

// Shared data hook: every module dashboard fetches only its own module's stats.
export const useModuleStats = (api, moduleKey) => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const res = await api.get(`/vendor/module-stats?module=${moduleKey}`);
      if (res.data?.success) setData(res.data.data);
      else setError('Failed to load dashboard data.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [api, moduleKey]);

  React.useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
};
