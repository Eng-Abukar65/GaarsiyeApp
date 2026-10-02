// ─── Server time authority ────────────────────────────────────────────────────
// The server clock is the ONLY trusted source of time. A client's device clock
// must never be able to influence a payment time, booking time, order time,
// created/updated date or report date.
//
// Storage rule: business timestamps are written by the database itself (NOW() /
// CURRENT_TIMESTAMP) or from the Node process clock — never from a request body.
// Display rule: values are rendered in the configured business timezone.
//
// Somalia (Africa/Mogadishu) is UTC+03:00 year-round with no DST, so the offset
// is stable. The timezone is pinned explicitly in config rather than inherited
// from the host OS locale, so behaviour is identical on every machine.

const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Africa/Mogadishu';
const BUSINESS_UTC_OFFSET = process.env.BUSINESS_UTC_OFFSET || '+03:00';

/** Authoritative current instant (UTC). */
const nowUtc = () => new Date();

/**
 * Current wall-clock in the business timezone, as sortable parts.
 * Uses Intl so the named timezone is honoured without extra dependencies.
 */
function businessParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  // en-CA renders midnight as "24" in some ICU builds; normalise it.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    year: parts.year, month: parts.month, day: parts.day,
    hour, minute: parts.minute, second: parts.second,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

/** "YYYY-MM-DD" for today in the business timezone, per the SERVER clock. */
const businessToday = (date = new Date()) => businessParts(date).date;

/** Sortable "YYYY-MM-DDTHH:MM" of now in the business timezone. */
const businessStamp = (date = new Date()) => {
  const p = businessParts(date);
  return `${p.date}T${p.time}`;
};

/** Human display string, e.g. "2026-07-21 18:26 (Africa/Mogadishu)". */
function formatBusiness(date = new Date()) {
  const p = businessParts(date);
  return `${p.date} ${p.hour}:${p.minute} (${BUSINESS_TIMEZONE})`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * Validates a client-supplied scheduling date/time against the SERVER clock.
 *
 * Comparison is done on zero-padded "YYYY-MM-DDTHH:MM" strings, which sort
 * lexicographically in chronological order — no timezone arithmetic, and no
 * opportunity for a device clock to influence the outcome.
 *
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {string} [timeStr] "HH:MM" or "HH:MM:SS" (optional)
 * @param {object} [opts]
 * @param {number} [opts.graceMinutes=0] tolerance for clock skew / in-flight requests
 * @param {number} [opts.maxDaysAhead=365] reject absurdly distant bookings
 * @returns {{valid:boolean, error?:string, field?:string}}
 */
function validateScheduling(dateStr, timeStr, opts = {}) {
  const { graceMinutes = 0, maxDaysAhead = 365 } = opts;
  const date = String(dateStr || '').trim();
  const time = String(timeStr || '').trim();

  if (!DATE_RE.test(date)) {
    return { valid: false, field: 'scheduled_date', error: 'Select a valid booking date.' };
  }
  if (time) {
    // Format AND range: "25:99" matches the shape but is not a real time.
    if (!TIME_RE.test(time)) {
      return { valid: false, field: 'scheduled_time', error: 'Select a valid time slot.' };
    }
    const [hh, mm, ss = '0'] = time.split(':').map(Number);
    if (hh > 23 || mm > 59 || Number(ss) > 59) {
      return { valid: false, field: 'scheduled_time', error: 'Select a valid time slot.' };
    }
  }
  // Reject impossible calendar dates such as 2026-02-31.
  const [y, m, d] = date.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return { valid: false, field: 'scheduled_date', error: 'That date does not exist.' };
  }

  const nowShifted = new Date(Date.now() - graceMinutes * 60000);
  const nowStamp = businessStamp(nowShifted);
  const todayDate = businessToday(nowShifted);

  if (time) {
    const hhmm = time.slice(0, 5);
    if (`${date}T${hhmm}` < nowStamp) {
      return {
        valid: false,
        field: date < todayDate ? 'scheduled_date' : 'scheduled_time',
        error: date < todayDate
          ? 'You cannot book a date in the past.'
          : 'That time has already passed. Please choose a later slot.',
      };
    }
  } else if (date < todayDate) {
    return { valid: false, field: 'scheduled_date', error: 'You cannot book a date in the past.' };
  }

  // Upper bound so a bad client cannot park a booking centuries out.
  const maxDate = businessToday(new Date(Date.now() + maxDaysAhead * 86400000));
  if (date > maxDate) {
    return {
      valid: false,
      field: 'scheduled_date',
      error: `Bookings can only be made up to ${maxDaysAhead} days ahead.`,
    };
  }

  return { valid: true };
}

/**
 * Clamps a client-supplied reporting range to server dates. Never lets a client
 * clock decide what "today" means in a financial report.
 */
function normalizeReportRange(from, to) {
  const today = businessToday();
  const safe = (v, fallback) => (DATE_RE.test(String(v || '').trim()) ? String(v).trim() : fallback);
  let start = safe(from, today);
  let end = safe(to, today);
  if (end > today) end = today;      // no future data can exist
  if (start > end) start = end;
  return { from: start, to: end };
}

module.exports = {
  BUSINESS_TIMEZONE,
  BUSINESS_UTC_OFFSET,
  nowUtc,
  businessParts,
  businessToday,
  businessStamp,
  formatBusiness,
  validateScheduling,
  normalizeReportRange,
};
