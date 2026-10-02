// ─── Order status state machine ───────────────────────────────────────────────
// Single source of truth for legal order-status transitions. The admin manual
// status-change endpoint enforces these; the admin UI mirrors them (see the
// frontend copy at vendor/src/utils/orderStatus.js — keep the two in sync).
//
// Status names are normalized to lowercase + underscores so the historical
// "driver assigned" / "on the way" variants map onto the canonical keys.

const ALIASES = {
  'driver assigned': 'driver_assigned',
  'on the way': 'on_the_way',
  'out for delivery': 'on_the_way',
  'out_for_delivery': 'on_the_way',
  'ready': 'pending_driver_assignment',
  'confirmed': 'accepted',
};

function normalizeStatus(status) {
  const s = String(status || '').trim().toLowerCase().replace(/\s+/g, '_');
  const collapsed = s.replace(/_+/g, '_');
  // Apply spoken-form aliases (check both spaced and underscored forms).
  return ALIASES[String(status || '').trim().toLowerCase()] || ALIASES[collapsed] || collapsed;
}

// from -> [allowed next statuses]. Terminal states map to [].
const TRANSITIONS = {
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

const ALL_STATUSES = Object.keys(TRANSITIONS);

function isKnownStatus(status) {
  return ALL_STATUSES.includes(normalizeStatus(status));
}

function allowedNext(fromStatus) {
  return TRANSITIONS[normalizeStatus(fromStatus)] || [];
}

// Same status is always allowed (idempotent no-op).
function canTransition(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (from === to) return true;
  return (TRANSITIONS[from] || []).includes(to);
}

module.exports = {
  normalizeStatus,
  isKnownStatus,
  allowedNext,
  canTransition,
  TRANSITIONS,
  ALL_STATUSES,
};
