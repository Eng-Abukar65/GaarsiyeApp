import React from 'react';
import {
  CheckCircle,
  AlertCircle,
  Info,
  X,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Inbox
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────────
 * Toast system
 * Usage: const toast = useToast(); toast.success('Saved'); toast.error('Oops');
 * ──────────────────────────────────────────────────────────────────────────── */

const ToastContext = React.createContext(null);

let toastId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = React.useState([]);

  const dismiss = React.useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback((type, message, duration = 4500) => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const api = React.useMemo(() => ({
    success: (msg, d) => push('success', msg, d),
    error: (msg, d) => push('error', msg, d),
    info: (msg, d) => push('info', msg, d),
  }), [push]);

  const styles = {
    success: { icon: CheckCircle, accent: 'text-success', bar: 'bg-success' },
    error: { icon: AlertCircle, accent: 'text-danger', bar: 'bg-danger' },
    info: { icon: Info, accent: 'text-primary-500', bar: 'bg-primary-500' },
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[200] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm" role="status" aria-live="polite">
        {toasts.map((t) => {
          const s = styles[t.type] || styles.info;
          const Icon = s.icon;
          return (
            <div
              key={t.id}
              className="relative overflow-hidden flex items-start gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-4 py-3 animate-in slide-in-from-bottom-3 fade-in duration-300"
            >
              <span className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />
              <Icon size={18} className={`${s.accent} mt-0.5 shrink-0`} />
              <p className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-pre-line break-words">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="p-1 -m-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Fail soft so a page rendered outside the provider doesn't crash.
    return {
      success: (m) => console.info('[toast:success]', m),
      error: (m) => console.error('[toast:error]', m),
      info: (m) => console.info('[toast:info]', m),
    };
  }
  return ctx;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Confirm dialog
 * Usage: const confirm = useConfirm();
 *        if (await confirm({ title: 'Delete user?', message: '...', danger: true })) {...}
 * ──────────────────────────────────────────────────────────────────────────── */

const ConfirmContext = React.createContext(null);

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = React.useState(null);

  const confirm = React.useCallback((options = {}) => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={state.title || 'Confirm action'}
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${state.danger ? 'bg-danger/10 text-danger' : 'bg-primary-50 dark:bg-primary-900/30 text-primary-600'}`}>
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{state.title || 'Are you sure?'}</h3>
                {state.message && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{state.message}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => close(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {state.cancelLabel || 'Cancel'}
              </button>
              <button
                autoFocus
                onClick={() => close(true)}
                className={`px-5 py-2 text-sm font-bold text-white rounded-lg shadow-sm transition-colors ${state.danger ? 'bg-danger hover:bg-red-600' : 'bg-primary-600 hover:bg-primary-700'}`}
              >
                {state.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) return async () => window.confirm('Are you sure?');
  return ctx;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Modal — the single, consistent modal shell for the whole admin panel.
 * ──────────────────────────────────────────────────────────────────────────── */

export const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-5xl',
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${sizes[size] || sizes.md} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl my-4 sm:my-8 animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 -m-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * Form field primitives — consistent inputs everywhere.
 * ──────────────────────────────────────────────────────────────────────────── */

export const fieldClass =
  'w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all';

export const Field = ({ label, required, children, className = '' }) => (
  <div className={`space-y-1.5 ${className}`}>
    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
      {label} {required && <span className="text-danger">*</span>}
    </label>
    {children}
  </div>
);

export const FormError = ({ message }) => {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-400">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      {message}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * Toggle switch
 * ──────────────────────────────────────────────────────────────────────────── */

export const Toggle = ({ checked, onChange, label }) => (
  <div className="flex items-center gap-3">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600/30 ${checked ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
    <span className={`text-[10px] font-bold uppercase tracking-widest ${checked ? 'text-primary-600' : 'text-slate-500'}`}>
      {checked ? 'Enabled' : 'Disabled'}
    </span>
  </div>
);

/* ────────────────────────────────────────────────────────────────────────────
 * Loading / empty states
 * ──────────────────────────────────────────────────────────────────────────── */

export const PageLoader = ({ label = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
    <div className="w-10 h-10 border-[3px] border-primary-600 border-t-transparent rounded-full animate-spin" />
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</p>
  </div>
);

export const EmptyState = ({ icon: Icon = Inbox, title = 'Nothing here yet', subtitle, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
      <Icon size={26} />
    </div>
    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</p>
    {subtitle && <p className="text-xs text-slate-500 max-w-xs">{subtitle}</p>}
    {action}
  </div>
);

export const ErrorState = ({ title = 'Something went wrong', message, onRetry }) => (
  <div className="flex flex-col items-center justify-center min-h-[400px] gap-5 text-center px-6">
    <div className="w-14 h-14 bg-danger/10 text-danger rounded-2xl flex items-center justify-center">
      <AlertCircle size={28} />
    </div>
    <div className="space-y-1.5">
      <h4 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h4>
      {message && <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">{message}</p>}
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-6 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 transition-colors shadow-sm"
      >
        Try Again
      </button>
    )}
  </div>
);

/* ────────────────────────────────────────────────────────────────────────────
 * Pagination — client-side. Usage:
 *   const { pageItems, page, setPage, totalPages } = usePagination(rows, 10);
 *   <Pagination page={page} totalPages={totalPages} total={rows.length}
 *               shown={pageItems.length} onChange={setPage} />
 * ──────────────────────────────────────────────────────────────────────────── */

export const usePagination = (items, pageSize = 10) => {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil((items?.length || 0) / pageSize));

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return (items || []).slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { pageItems, page, setPage, totalPages, pageSize };
};

export const Pagination = ({ page, totalPages, total, shown, onChange }) => (
  <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800">
    <p className="text-xs text-slate-500 dark:text-slate-400">
      Showing <span className="font-bold text-slate-700 dark:text-slate-300">{shown}</span> of{' '}
      <span className="font-bold text-slate-700 dark:text-slate-300">{total}</span> records
    </p>
    {totalPages > 1 && (
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="px-3 text-xs font-bold text-slate-600 dark:text-slate-400">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    )}
  </div>
);

/* ────────────────────────────────────────────────────────────────────────────
 * ErrorBoundary — catches render crashes so the app never shows a blank
 * white page. Displays the error and offers a reload.
 * ──────────────────────────────────────────────────────────────────────────── */

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Render error caught by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl text-center space-y-5">
            <div className="w-14 h-14 bg-danger/10 text-danger rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={28} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Something went wrong</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                The page hit an unexpected error. The details below can help debugging.
              </p>
            </div>
            <pre className="text-left text-xs bg-slate-100 dark:bg-slate-800 text-red-600 dark:text-red-400 rounded-xl p-4 overflow-auto max-h-40 whitespace-pre-wrap break-words">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => this.setState({ error: null })}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 transition-colors shadow-sm"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Status badge — one source of truth for status colors.
 * ──────────────────────────────────────────────────────────────────────────── */

const STATUS_STYLES = {
  // positive
  active: 'text-success bg-success/10',
  verified: 'text-success bg-success/10',
  online: 'text-success bg-success/10',
  paid: 'text-success bg-success/10',
  success: 'text-success bg-success/10',
  delivered: 'text-success bg-success/10',
  available: 'text-success bg-success/10',
  // waiting
  pending: 'text-warning bg-warning/10',
  // in progress
  busy: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
  on_the_way: 'text-primary-600 dark:text-primary-400 bg-primary-600/10',
  accepted: 'text-primary-600 dark:text-primary-400 bg-primary-600/10',
  // negative
  suspended: 'text-danger bg-danger/10',
  rejected: 'text-danger bg-danger/10',
  failed: 'text-danger bg-danger/10',
  cancelled: 'text-danger bg-danger/10',
  // neutral
  offline: 'text-slate-500 bg-slate-500/10',
  inactive: 'text-slate-500 bg-slate-500/10',
};

export const StatusBadge = ({ status }) => {
  const key = String(status || '').toLowerCase();
  const style = STATUS_STYLES[key] || 'text-slate-500 bg-slate-500/10';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${style}`}>
      {String(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
};
