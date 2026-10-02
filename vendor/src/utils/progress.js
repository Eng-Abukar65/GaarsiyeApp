// ─── Real progress calculation ────────────────────────────────────────────────
// Progress bars must reflect actual database values, never decorative constants.
//
//   percentage = currentAmount / maximumCapacity * 100, clamped to 0..100
//
// When no real maximum capacity is configured we return null rather than
// inventing a number — callers must then render an "unknown" state instead of a
// misleading bar.

export const clampPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
};

/**
 * @param {number} current  current amount (litres, units, …)
 * @param {number} capacity maximum capacity; must be a positive number
 * @returns {number|null}   0..100, or null when capacity is unknown/invalid
 */
export const stockPercent = (current, capacity) => {
  const cap = Number(capacity);
  if (!Number.isFinite(cap) || cap <= 0) return null; // unknown — do not fake it
  const cur = Number(current);
  if (!Number.isFinite(cur)) return 0;
  return clampPercent((cur / cap) * 100);
};

export default stockPercent;
