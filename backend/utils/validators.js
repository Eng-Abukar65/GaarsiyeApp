// ─── Shared input validators ──────────────────────────────────────────────────
// Backend is the final source of truth for data integrity. Controllers use these
// to reject bad input with clear field-level errors before it reaches the DB.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accepts +, digits, spaces, dashes, parentheses; 7–20 chars total.
const PHONE_RE = /^\+?[0-9][0-9\s()-]{6,19}$/;

const str = (v) => String(v ?? '').trim();

const isEmail = (v) => EMAIL_RE.test(str(v));
const isPhone = (v) => PHONE_RE.test(str(v));
const isNonEmpty = (v) => str(v).length > 0;
const lenBetween = (v, min, max) => {
  const s = str(v);
  return s.length >= min && s.length <= max;
};
const isName = (v) => /^[\p{L}0-9 .,'&\-]{2,80}$/u.test(str(v));
const isNonNegativeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
};
const isPositiveNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
};
const inRange = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max;
};

// Collect { field: message } errors; returns null if none.
function collect(errors) {
  const filtered = Object.fromEntries(Object.entries(errors).filter(([, v]) => Boolean(v)));
  return Object.keys(filtered).length ? filtered : null;
}

module.exports = {
  EMAIL_RE, PHONE_RE, str,
  isEmail, isPhone, isNonEmpty, lenBetween, isName,
  isNonNegativeNumber, isPositiveNumber, inRange, collect,
};
