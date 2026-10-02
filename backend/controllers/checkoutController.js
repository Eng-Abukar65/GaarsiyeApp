const db = require('../config/db');
const CheckoutService = require('../services/checkoutService');
const CustomerModel = require('../models/customerModel');
const CustomerController = require('./customerController');

// ─── Async checkout ───────────────────────────────────────────────────────────
// POST /api/customer/checkout        -> 202 with a reference, work continues in
//                                       the background
// GET  /api/customer/checkout/:ref   -> live stage until a terminal status
//
// The heavy lifting is still the existing CustomerController.createOrder, so
// pricing, offers, stock, commission and notifications behave identically — only
// the response timing changes.

const resolveCustomerId = async (req) => {
  const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
  if (!customer?.id) {
    throw Object.assign(new Error('Customer profile not found.'), { statusCode: 404 });
  }
  return customer.id;
};

class CheckoutController {
  static async start(req, res) {
    try {
      const customerId = await resolveCustomerId(req);

      // The client supplies the idempotency key; reusing it is what makes a
      // double tap or a retried request resolve to the SAME checkout instead of
      // starting a second payment.
      const reference = String(req.body?.checkout_request_id || '').trim();
      if (!reference || reference.length > 100) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_CHECKOUT_ID',
          message: 'A checkout request id is required.',
        });
      }

      // Already known? Return its current state instead of starting again.
      const existing = await CheckoutService.getStatus(reference, customerId);
      if (existing) {
        return res.status(200).json({ success: true, reference, duplicate: true, ...existing });
      }

      await CheckoutService.createSession({
        reference,
        customerId,
        vendorId: req.body?.vendor_id || null,
        kind: 'order',
        amount: req.body?.expected_total || null,
        paymentMethod: req.body?.payment_method || null,
      });

      // Answer the app straight away — it will poll from here.
      res.status(202).json({
        success: true,
        reference,
        stage: CheckoutService.STAGES.SENDING,
        status: 'processing',
        terminal: false,
        timeout_ms: CheckoutService.CHECKOUT_TIMEOUT_MS,
        poll_url: `/api/customer/checkout/${encodeURIComponent(reference)}`,
      });

      // Detach: this outlives the request and must never touch `res`.
      setImmediate(() => {
        CheckoutService.runInBackground(reference, CustomerController.createOrder, req)
          .catch((err) => console.error('[CHECKOUT] background failure:', err.message));
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[CHECKOUT] start failed:', error);
      if (!res.headersSent) {
        res.status(status).json({
          success: false,
          message: status < 500 ? error.message : 'Could not start checkout.',
        });
      }
    }
  }

  static async status(req, res) {
    try {
      const customerId = await resolveCustomerId(req);
      const state = await CheckoutService.getStatus(req.params.reference, customerId);
      if (!state) {
        return res.status(404).json({ success: false, message: 'Checkout not found.' });
      }

      // Enrich a completed order so the success screen has everything it needs
      // without a second round trip.
      if (state.status === 'completed' && state.order_id) {
        const [rows] = await db.query(
          `SELECT o.id, o.total_amount, o.payment_method, o.payment_status, o.status,
                  o.delivery_address, o.created_at, o.delivery_otp,
                  COALESCE(v.business_name, v.name) AS vendor_name, v.id AS vendor_id
           FROM orders o
           LEFT JOIN vendors v ON v.id = o.vendor_id
           WHERE o.id = ? AND o.customer_id = ?`,
          [state.order_id, customerId]
        );
        if (rows[0]) {
          state.order = {
            ...rows[0],
            total_amount: Number(rows[0].total_amount),
          };
        }
      }

      res.set('Cache-Control', 'no-store');
      res.json({ success: true, ...state });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[CHECKOUT] status failed:', error);
      res.status(status).json({
        success: false,
        message: status < 500 ? error.message : 'Could not read checkout status.',
      });
    }
  }

  /** Customer abandons the payment prompt. */
  static async cancel(req, res) {
    try {
      const customerId = await resolveCustomerId(req);
      const state = await CheckoutService.getStatus(req.params.reference, customerId);
      if (!state) return res.status(404).json({ success: false, message: 'Checkout not found.' });

      if (state.terminal) {
        // Never "cancel" something that already succeeded.
        return res.status(409).json({
          success: false,
          code: 'ALREADY_FINAL',
          message: `This checkout is already ${state.status}.`,
          ...state,
        });
      }
      await CheckoutService.failSession(req.params.reference, {
        code: 'CANCELLED_BY_CUSTOMER',
        reason: 'You cancelled this payment.',
        stage: CheckoutService.STAGES.CANCELLED,
      });
      res.json({ success: true, message: 'Checkout cancelled.' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: 'Could not cancel checkout.' });
    }
  }
}

module.exports = CheckoutController;
