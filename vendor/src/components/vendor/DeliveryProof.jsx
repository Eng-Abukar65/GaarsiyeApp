import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api, { SOCKET_URL } from '../../utils/api';

const API_ORIGIN = SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');

const formatDateTime = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
};

const formatStatus = (value) => {
  if (!value) return '—';
  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const resolvePhotoUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw || /^(file:|[a-z]:[\\/]|\\\\)/i.test(raw)) return '';

  try {
    const resolved = new URL(raw, `${API_ORIGIN}/`);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.href : '';
  } catch {
    return '';
  }
};

const Spinner = ({ className = '' }) => (
  <span
    className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    aria-hidden="true"
  />
);

const EmptyProof = () => (
  <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low/30 px-5 py-8 text-center">
    <span className="material-symbols-outlined mb-2 text-4xl text-on-surface-variant/50">no_photography</span>
    <p className="text-sm font-semibold text-on-surface-variant">
      No delivery photo has been uploaded yet.
    </p>
  </div>
);

const DeliveryProof = ({ orderId, refreshKey }) => {
  const [proof, setProof] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [thumbnailLoading, setThumbnailLoading] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const photoUrl = useMemo(() => resolvePhotoUrl(proof?.photoUrl), [proof?.photoUrl]);
  const normalizedStatus = String(proof?.deliveryStatus || '').toLowerCase();
  const isCompleted = ['completed', 'delivered'].includes(normalizedStatus);

  const loadProof = useCallback(async () => {
    const numericOrderId = Number(orderId);
    if (!Number.isInteger(numericOrderId) || numericOrderId <= 0) {
      setProof(null);
      setError('Delivery proof is unavailable for this order.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setThumbnailError(false);
      const response = await api.get(`/vendor/orders/${numericOrderId}/delivery-proof`);
      setProof(response.data?.data || null);
    } catch (requestError) {
      setProof(null);
      setError(
        requestError.response?.data?.message
          || 'Unable to load the delivery proof. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadProof();
  }, [loadProof, refreshKey]);

  useEffect(() => {
    if (!photoUrl) {
      setThumbnailLoading(false);
      return;
    }
    setThumbnailLoading(true);
  }, [photoUrl]);

  useEffect(() => {
    if (!previewOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [previewOpen]);

  useEffect(() => {
    if (!previewOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewOpen]);

  const openPreview = () => {
    setPreviewLoading(true);
    setPreviewOpen(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-36 items-center justify-center gap-3 rounded-2xl bg-surface-container-low/30 text-sm font-semibold text-on-surface-variant" role="status">
        <Spinner className="text-primary" />
        Loading delivery proof…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
        <span className="material-symbols-outlined text-3xl text-red-500">broken_image</span>
        <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>
        <button
          type="button"
          onClick={loadProof}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-100"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Try Again
        </button>
      </div>
    );
  }

  if (!photoUrl) return <EmptyProof />;

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)] sm:items-start">
        <button
          type="button"
          onClick={openPreview}
          className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-high text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Open delivery photo preview"
        >
          {thumbnailLoading && !thumbnailError && (
            <span className="absolute inset-0 z-10 flex items-center justify-center bg-surface-container-high" role="status">
              <Spinner className="text-primary" />
              <span className="sr-only">Loading delivery photo</span>
            </span>
          )}
          {thumbnailError ? (
            <span className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl">broken_image</span>
              <span className="mt-2 text-xs font-semibold">Delivery photo could not be displayed.</span>
            </span>
          ) : (
            <img
              src={photoUrl}
              alt={`Delivery proof for order ${orderId}`}
              className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
              onLoad={() => setThumbnailLoading(false)}
              onError={() => {
                setThumbnailLoading(false);
                setThumbnailError(true);
              }}
            />
          )}
          {!thumbnailError && (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] font-bold text-white">
              <span className="material-symbols-outlined text-sm">zoom_in</span>
              View Photo
            </span>
          )}
        </button>

        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Uploaded</dt>
            <dd className="mt-1 text-sm font-semibold text-on-surface">{formatDateTime(proof.uploadedAt)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Driver</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-on-surface">{proof.driverName || '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Delivery Code</dt>
            <dd className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${proof.codeVerified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              <span className="material-symbols-outlined text-sm">{proof.codeVerified ? 'verified' : 'schedule'}</span>
              {proof.codeVerified ? 'Verified' : 'Not Verified'}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Delivery Status</dt>
            <dd className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              <span className="material-symbols-outlined text-sm">{isCompleted ? 'task_alt' : 'schedule'}</span>
              {isCompleted ? 'Completed' : formatStatus(proof.deliveryStatus)}
            </dd>
          </div>
        </dl>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Delivery photo preview"
          onMouseDown={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) setPreviewOpen(false);
          }}
        >
          <div className="relative flex max-h-[94vh] max-w-[96vw] items-center justify-center overflow-hidden rounded-2xl bg-black/40">
            {previewLoading && (
              <div className="absolute inset-0 flex min-h-48 min-w-48 items-center justify-center" role="status">
                <Spinner className="h-8 w-8 text-white" />
                <span className="sr-only">Loading full delivery photo</span>
              </div>
            )}
            <img
              src={photoUrl}
              alt={`Large delivery proof for order ${orderId}`}
              className="h-auto max-h-[90vh] w-auto max-w-[94vw] object-contain"
              onLoad={() => setPreviewLoading(false)}
              onError={() => setPreviewLoading(false)}
            />
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Close delivery photo preview"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default DeliveryProof;
