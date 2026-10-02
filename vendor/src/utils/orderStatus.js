// ─── Order status state machine (frontend mirror) ────────────────────────────
// Keep in sync with backend/config/orderStatus.js — the backend is the enforcing
// source of truth; this copy powers the admin UI so only legal next-statuses are
// offered.

const ALIASES = {
  'driver assigned': 'driver_assigned',
  'on the way': 'on_the_way',
  'out for delivery': 'on_the_way',
  'out_for_delivery': 'on_the_way',
  ready: 'pending_driver_assignment',
  confirmed: 'accepted',
};

export function normalizeStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  const collapsed = raw.replace(/\s+/g, '_').replace(/_+/g, '_');
  return ALIASES[raw] || ALIASES[collapsed] || collapsed;
}

export const TRANSITIONS = {
  pending: ['accepted', 'processing', 'pending_driver_assignment', 'cancelled'],
  processing: ['pending', 'accepted', 'cancelled'],
  accepted: ['preparing', 'pending_driver_assignment', 'driver_assigned', 'assigned', 'cancelled'],
  preparing: ['pending_driver_assignment', 'driver_assigned', 'assigned', 'cancelled'],
  pending_driver_assignment: ['driver_assigned', 'assigned', 'cancelled'],
  driver_assigned: ['on_the_way', 'arrived', 'delivered', 'failed', 'cancelled'],
  assigned: ['on_the_way', 'arrived', 'delivered', 'failed', 'cancelled'],
  on_the_way: ['arrived', 'delivered', 'failed'],
  arrived: ['delivered', 'failed'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
  failed: ['pending_driver_assignment', 'cancelled'],
};

export function allowedNext(fromStatus) {
  return TRANSITIONS[normalizeStatus(fromStatus)] || [];
}

export function canTransition(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (from === to) return true;
  return (TRANSITIONS[from] || []).includes(to);
}

// Human-friendly label for a status key.
export function statusLabel(status) {
  return normalizeStatus(status)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
