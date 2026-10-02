const db = require('../config/db');
const { ensureCheckoutSchema } = require('../utils/checkoutSchema');

// ─── Async checkout orchestration ─────────────────────────────────────────────
// Runs the existing order-creation flow as a background job and records its
// progress so the app can poll for a real answer instead of holding a socket
// open for 30 seconds.
//
// The stages the client renders:
//   sending -> awaiting_approval -> verifying -> creating_order -> completed
// with failed / cancelled / timed_out as terminal alternatives.

const STAGES = {
  SENDING: 'sending',
  AWAITING_APPROVAL: 'awaiting_approval',
  VERIFYING: 'verifying',
  CREATING_ORDER: 'creating_order',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed_out',
};

// How long a session may stay unresolved before the client should stop waiting
// and offer Retry / Check status. Kept above the provider request timeout.
const CHECKOUT_TIMEOUT_MS = Number.parseInt(process.env.CHECKOUT_TIMEOUT_MS, 10) > 0
  ? Number.parseInt(process.env.CHECKOUT_TIMEOUT_MS, 10)
  : 90000;

/**
 * Captures what a controller would have sent, instead of sending it. Lets the
 * full existing createOrder controller run inside a background job with no
 * refactor and no behavioural drift.
 */
function captureResponse() {
  const out = { statusCode: 200, body: null, finished: false };
  const res = {
    status(code) { out.statusCode = code; return res; },
    json(body) { out.body = body; out.finished = true; return res; },
    send(body) { out.body = body; out.finished = true; return res; },
    set() { return res; },
    setHeader() { return res; },
  };
  return { res, out };
}

async function createSession({ reference, customerId, vendorId, kind = 'order', amount, paymentMethod }) {
  await ensureCheckoutSchema();
  await db.query(
    `INSERT INTO checkout_sessions
       (reference, customer_id, vendor_id, kind, stage, status, amount, payment_method)
     VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)
     ON DUPLICATE KEY UPDATE updated_at = NOW()`,
    [reference, customerId, vendorId || null, kind, STAGES.SENDING, amount || null, paymentMethod || null]
  );
}

async function setStage(reference, stage) {
  await db.query(
    "UPDATE checkout_sessions SET stage = ? WHERE reference = ? AND status = 'processing'",
    [stage, reference]
  );
}

async function completeSession(reference, { orderId, bookingId, transactionId, result }) {
  await db.query(
    `UPDATE checkout_sessions
     SET stage = ?, status = 'completed', order_id = ?, booking_id = ?,
         transaction_id = ?, result_json = ?, finished_at = NOW()
     WHERE reference = ?`,
    [STAGES.COMPLETED, orderId || null, bookingId || null, transactionId || null,
     result ? JSON.stringify(result).slice(0, 60000) : null, reference]
  );
}

async function failSession(reference, { code, reason, stage = STAGES.FAILED }) {
  await db.query(
    `UPDATE checkout_sessions
     SET stage = ?, status = ?, fail_code = ?, fail_reason = ?, finished_at = NOW()
     WHERE reference = ? AND status = 'processing'`,
    [stage, stage === STAGES.CANCELLED ? 'cancelled' : 'failed',
     String(code || 'PAYMENT_FAILED').slice(0, 60),
     String(reason || 'Payment failed.').slice(0, 500), reference]
  );
}

/**
 * Derives the live stage from real data rather than guessing: the payment
 * attempt row tells us whether the provider prompt is still outstanding.
 */
async function resolveStage(session) {
  if (session.status !== 'processing') return session.stage;

  const [rows] = await db.query(
    `SELECT status, response_message FROM payment_attempts
     WHERE idempotency_key = ? OR LEFT(idempotency_key, CHAR_LENGTH(?) + 7) = CONCAT(?, ':retry-')
     ORDER BY id DESC LIMIT 1`,
    [session.reference, session.reference, session.reference]
  );
  const attempt = rows[0];
  if (!attempt) return STAGES.SENDING;
  if (attempt.status === 'initiated') return STAGES.AWAITING_APPROVAL;
  if (attempt.status === 'successful') return STAGES.CREATING_ORDER;
  return session.stage;
}

async function getStatus(reference, customerId) {
  await ensureCheckoutSchema();
  const [rows] = await db.query(
    'SELECT * FROM checkout_sessions WHERE reference = ? AND customer_id = ?',
    [reference, customerId]
  );
  const session = rows[0];
  if (!session) return null;

  // Age out a session the provider never answered so the client can stop
  // waiting and offer Retry instead of spinning forever.
  const ageMs = Date.now() - new Date(session.started_at || session.created_at).getTime();
  if (session.status === 'processing' && ageMs > CHECKOUT_TIMEOUT_MS) {
    await failSession(reference, {
      code: 'CHECKOUT_TIMEOUT',
      reason: 'We did not receive a payment confirmation in time.',
      stage: STAGES.TIMED_OUT,
    });
    return getStatus(reference, customerId);
  }

  const stage = await resolveStage(session);
  if (stage !== session.stage) await setStage(reference, stage);

  let result = null;
  try { result = session.result_json ? JSON.parse(session.result_json) : null; } catch { /* ignore */ }

  return {
    reference: session.reference,
    kind: session.kind,
    stage,
    status: session.status,
    order_id: session.order_id,
    booking_id: session.booking_id,
    amount: session.amount != null ? Number(session.amount) : null,
    payment_method: session.payment_method,
    transaction_id: session.transaction_id,
    fail_code: session.fail_code,
    fail_reason: session.fail_reason,
    // Terminal means "stop polling".
    terminal: session.status !== 'processing',
    elapsed_ms: ageMs,
    timeout_ms: CHECKOUT_TIMEOUT_MS,
    result,
  };
}

/**
 * Runs a controller handler in the background, recording the outcome on the
 * session. Never throws into the caller.
 */
async function runInBackground(reference, handler, req) {
  const { res, out } = captureResponse();
  try {
    await handler(req, res);

    const body = out.body || {};
    const ok = out.statusCode >= 200 && out.statusCode < 300;
    const orderId = body.orderId || body.order_id || body.data?.id || null;

    if (ok && orderId) {
      await completeSession(reference, {
        orderId,
        transactionId: body.payment_transaction_id || null,
        result: body,
      });
    } else if (ok && body.success !== false) {
      // Succeeded without an order id — record it so it can be investigated
      // rather than leaving the customer polling a session that never ends.
      await failSession(reference, {
        code: 'NO_ORDER_RETURNED',
        reason: body.message || 'The order could not be confirmed. Please contact support.',
      });
    } else {
      await failSession(reference, {
        code: body.code || `HTTP_${out.statusCode}`,
        reason: body.message || 'Payment failed.',
      });
    }
  } catch (error) {
    console.error(`[CHECKOUT] ${reference} failed:`, error.message);
    await failSession(reference, {
      code: error.code || 'CHECKOUT_ERROR',
      reason: error.message || 'Checkout failed.',
    });
  }
}

module.exports = {
  STAGES,
  CHECKOUT_TIMEOUT_MS,
  createSession,
  setStage,
  completeSession,
  failSession,
  getStatus,
  runInBackground,
  captureResponse,
};
