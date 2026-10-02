const db = require('../config/db');
const { ensureSettlementSchema, nextSettlementReference } = require('../utils/settlementSchema');
const { businessToday } = require('../utils/serverTime');

// ─── Vendor ↔ Admin settlement ────────────────────────────────────────────────
// Money model: every completed order writes a `commissions` row holding the
// platform's commission_amount and the vendor's vendor_net_amount. The
// commission is owed BY the vendor TO the platform, so a vendor's outstanding
// balance is the sum of their unsettled commission rows.
//
// Workflow: pending -> (vendor submits) processing -> (admin confirms) paid.
// The intermediate 'processing' state is what stops the same earnings being
// committed to two settlements at once.

const money = (v) => Number(Number(v || 0).toFixed(2));
const modelError = (code, message, extra = {}) => ({ error: code, message, ...extra });

const SettlementModel = {
  /**
   * A vendor's financial position, computed from the real commission ledger.
   */
  async getVendorBalance(vendorId) {
    await ensureSettlementSchema();
    const [[totals]] = await db.query(
      `SELECT
         COALESCE(SUM(total_amount), 0)                                        AS gross_sales,
         COALESCE(SUM(commission_amount), 0)                                   AS commission_total,
         COALESCE(SUM(vendor_net_amount), 0)                                   AS net_earnings,
         COALESCE(SUM(CASE WHEN status = 'pending'    THEN commission_amount END), 0) AS commission_outstanding,
         COALESCE(SUM(CASE WHEN status = 'processing' THEN commission_amount END), 0) AS commission_processing,
         COALESCE(SUM(CASE WHEN status = 'paid'       THEN commission_amount END), 0) AS commission_paid,
         COUNT(*)                                                              AS order_count,
         SUM(status = 'pending')                                               AS unsettled_orders
       FROM commissions WHERE vendor_id = ?`,
      [vendorId]
    );

    return {
      vendor_id: Number(vendorId),
      gross_sales: money(totals.gross_sales),
      net_earnings: money(totals.net_earnings),
      commission_total: money(totals.commission_total),
      // What the vendor still owes the platform and can settle right now.
      amount_due: money(totals.commission_outstanding),
      // Committed to a settlement that is awaiting admin confirmation.
      amount_awaiting_confirmation: money(totals.commission_processing),
      amount_paid: money(totals.commission_paid),
      outstanding_balance: money(
        Number(totals.commission_outstanding) + Number(totals.commission_processing)
      ),
      order_count: Number(totals.order_count || 0),
      unsettled_orders: Number(totals.unsettled_orders || 0),
      as_of: businessToday(),
    };
  },

  /** Commission rows a vendor can still settle. */
  async listUnsettled(vendorId, limit = 200) {
    await ensureSettlementSchema();
    const [rows] = await db.query(
      `SELECT c.id, c.order_id, c.total_amount, c.commission_rate,
              c.commission_amount, c.vendor_net_amount, c.status, c.created_at
       FROM commissions c
       WHERE c.vendor_id = ? AND c.status = 'pending'
       ORDER BY c.created_at ASC
       LIMIT ?`,
      [vendorId, Number(limit)]
    );
    return rows;
  },

  /**
   * Vendor submits a settlement covering their outstanding commission.
   * Runs in a transaction with row locks so two concurrent submissions cannot
   * commit the same commission rows.
   */
  async createSettlement(vendorId, data, actor = {}) {
    await ensureSettlementSchema();
    const method = ['cash', 'bank_transfer', 'waafi', 'other']
      .includes(String(data.payment_method)) ? String(data.payment_method) : 'cash';

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Lock this vendor's settleable commission rows.
      const [pending] = await conn.query(
        `SELECT id, order_id, commission_amount, vendor_net_amount
         FROM commissions
         WHERE vendor_id = ? AND status = 'pending'
         ORDER BY created_at ASC
         FOR UPDATE`,
        [vendorId]
      );
      if (pending.length === 0) {
        await conn.rollback();
        return modelError('nothing_to_settle', 'You have no outstanding commission to settle.');
      }

      // A vendor may settle everything, or a chosen subset of orders.
      let selected = pending;
      if (Array.isArray(data.commission_ids) && data.commission_ids.length > 0) {
        const wanted = new Set(data.commission_ids.map(Number));
        selected = pending.filter((c) => wanted.has(Number(c.id)));
        if (selected.length !== wanted.size) {
          await conn.rollback();
          return modelError(
            'invalid_selection',
            'Some selected orders are not settleable — they may already be in another settlement.'
          );
        }
      }

      const total = money(selected.reduce((s, c) => s + Number(c.commission_amount), 0));
      if (total <= 0) {
        await conn.rollback();
        return modelError('nothing_to_settle', 'The selected orders total zero.');
      }

      // The declared amount must match the ledger — a vendor cannot under-declare.
      if (data.amount !== undefined && data.amount !== null && data.amount !== '') {
        if (money(data.amount) !== total) {
          await conn.rollback();
          return modelError(
            'amount_mismatch',
            `The amount must equal the selected commission total (${total.toFixed(2)}).`,
            { expected: total }
          );
        }
      }

      const reference = await nextSettlementReference(conn);
      const [res] = await conn.query(
        `INSERT INTO vendor_settlements
           (settlement_reference, vendor_id, amount, payment_method, external_reference,
            notes, status, settlement_date, vendor_submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, NOW())`,
        [
          reference, vendorId, total, method,
          String(data.external_reference || '').trim().slice(0, 120) || null,
          String(data.notes || '').trim().slice(0, 2000) || null,
          businessToday(),
        ]
      );
      const settlementId = res.insertId;

      for (const c of selected) {
        await conn.query(
          `INSERT INTO vendor_settlement_items
             (settlement_id, commission_id, order_id, commission_amount, vendor_net_amount)
           VALUES (?, ?, ?, ?, ?)`,
          [settlementId, c.id, c.order_id, c.commission_amount, c.vendor_net_amount]
        );
      }

      // Commit the rows so they cannot be added to another settlement.
      const ids = selected.map((c) => c.id);
      await conn.query(
        `UPDATE commissions SET status = 'processing'
         WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'pending'`,
        ids
      );

      await conn.query(
        `INSERT INTO vendor_settlement_history
           (settlement_id, from_status, status, actor_type, actor_id, actor_name, note)
         VALUES (?, NULL, 'requested', 'vendor', ?, ?, ?)`,
        [settlementId, actor.id || vendorId, actor.name || null,
         `Vendor submitted ${method} settlement for ${selected.length} order(s).`]
      );

      await conn.commit();
      return { settlement: await this.getSettlement(settlementId) };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  /**
   * Admin confirms a settlement: the covered commission rows become paid.
   */
  async confirmSettlement(settlementId, actor = {}, data = {}) {
    await ensureSettlementSchema();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        'SELECT * FROM vendor_settlements WHERE id = ? FOR UPDATE',
        [settlementId]
      );
      const settlement = rows[0];
      if (!settlement) {
        await conn.rollback();
        return modelError('not_found', 'Settlement not found.');
      }
      if (settlement.status !== 'requested') {
        await conn.rollback();
        return modelError(
          'illegal_transition',
          `A ${settlement.status} settlement cannot be confirmed.`
        );
      }

      const [items] = await conn.query(
        'SELECT commission_id FROM vendor_settlement_items WHERE settlement_id = ?',
        [settlementId]
      );
      const ids = items.map((i) => i.commission_id);
      if (ids.length > 0) {
        await conn.query(
          `UPDATE commissions SET status = 'paid', paid_at = NOW()
           WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
      }

      await conn.query(
        `UPDATE vendor_settlements
         SET status = 'confirmed', admin_confirmed_at = NOW(),
             confirmed_by_user_id = ?, confirmed_by_name = ?,
             admin_notes = ?, settlement_date = COALESCE(settlement_date, ?)
         WHERE id = ?`,
        [actor.id || null, actor.name || null,
         String(data.admin_notes || '').trim().slice(0, 2000) || null,
         businessToday(), settlementId]
      );

      await conn.query(
        `INSERT INTO vendor_settlement_history
           (settlement_id, from_status, status, actor_type, actor_id, actor_name, note)
         VALUES (?, 'requested', 'confirmed', 'admin', ?, ?, ?)`,
        [settlementId, actor.id || null, actor.name || null,
         `Admin confirmed payment of ${money(settlement.amount).toFixed(2)}.`]
      );

      await conn.commit();
      return { settlement: await this.getSettlement(settlementId) };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  /**
   * Admin rejects (or vendor cancels) — the committed commission rows are
   * released back to pending so they can be settled again.
   */
  async rejectSettlement(settlementId, actor = {}, { reason, cancelledByVendor = false } = {}) {
    await ensureSettlementSchema();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        'SELECT * FROM vendor_settlements WHERE id = ? FOR UPDATE',
        [settlementId]
      );
      const settlement = rows[0];
      if (!settlement) {
        await conn.rollback();
        return modelError('not_found', 'Settlement not found.');
      }
      if (settlement.status !== 'requested') {
        await conn.rollback();
        return modelError('illegal_transition', `A ${settlement.status} settlement cannot be changed.`);
      }

      const [items] = await conn.query(
        'SELECT commission_id FROM vendor_settlement_items WHERE settlement_id = ?',
        [settlementId]
      );
      const ids = items.map((i) => i.commission_id);
      if (ids.length > 0) {
        await conn.query(
          `UPDATE commissions SET status = 'pending'
           WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'processing'`,
          ids
        );
      }

      const nextStatus = cancelledByVendor ? 'cancelled' : 'rejected';
      await conn.query(
        `UPDATE vendor_settlements SET status = ?, admin_notes = ? WHERE id = ?`,
        [nextStatus, String(reason || '').trim().slice(0, 2000) || null, settlementId]
      );
      await conn.query(
        `INSERT INTO vendor_settlement_history
           (settlement_id, from_status, status, actor_type, actor_id, actor_name, note)
         VALUES (?, 'requested', ?, ?, ?, ?, ?)`,
        [settlementId, nextStatus, cancelledByVendor ? 'vendor' : 'admin',
         actor.id || null, actor.name || null, String(reason || '').slice(0, 500) || null]
      );

      await conn.commit();
      return { settlement: await this.getSettlement(settlementId) };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async getSettlement(id, vendorId = null) {
    await ensureSettlementSchema();
    const clauses = ['s.id = ?'];
    const params = [id];
    if (vendorId != null) { clauses.push('s.vendor_id = ?'); params.push(vendorId); }

    const [rows] = await db.query(
      `SELECT s.*, v.business_name, v.name AS vendor_name
       FROM vendor_settlements s
       JOIN vendors v ON v.id = s.vendor_id
       WHERE ${clauses.join(' AND ')}`,
      params
    );
    const settlement = rows[0];
    if (!settlement) return null;

    const [items] = await db.query(
      `SELECT i.*, o.id AS order_ref
       FROM vendor_settlement_items i
       LEFT JOIN orders o ON o.id = i.order_id
       WHERE i.settlement_id = ?`,
      [id]
    );
    const [history] = await db.query(
      `SELECT from_status, status, actor_type, actor_name, note, created_at
       FROM vendor_settlement_history WHERE settlement_id = ? ORDER BY id ASC`,
      [id]
    );
    settlement.items = items;
    settlement.history = history;
    return settlement;
  },

  /** Settlement history / payment history, optionally scoped to one vendor. */
  async listSettlements({ vendorId = null, status = null, limit = 100 } = {}) {
    await ensureSettlementSchema();
    const clauses = ['1=1'];
    const params = [];
    if (vendorId != null) { clauses.push('s.vendor_id = ?'); params.push(vendorId); }
    if (status) { clauses.push('s.status = ?'); params.push(String(status)); }

    const [rows] = await db.query(
      `SELECT s.*, v.business_name, v.name AS vendor_name,
              (SELECT COUNT(*) FROM vendor_settlement_items i WHERE i.settlement_id = s.id) AS order_count
       FROM vendor_settlements s
       JOIN vendors v ON v.id = s.vendor_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY s.created_at DESC
       LIMIT ?`,
      [...params, Number(limit)]
    );
    return rows;
  },

  /** Admin overview: every vendor's position in one list. */
  async adminOverview() {
    await ensureSettlementSchema();
    const [rows] = await db.query(
      `SELECT v.id AS vendor_id,
              COALESCE(v.business_name, v.name) AS vendor_name,
              COALESCE(SUM(c.total_amount), 0)      AS gross_sales,
              COALESCE(SUM(c.commission_amount), 0) AS commission_total,
              COALESCE(SUM(c.vendor_net_amount), 0) AS net_earnings,
              COALESCE(SUM(CASE WHEN c.status='pending'    THEN c.commission_amount END),0) AS amount_due,
              COALESCE(SUM(CASE WHEN c.status='processing' THEN c.commission_amount END),0) AS awaiting_confirmation,
              COALESCE(SUM(CASE WHEN c.status='paid'       THEN c.commission_amount END),0) AS amount_paid
       FROM vendors v
       LEFT JOIN commissions c ON c.vendor_id = v.id
       GROUP BY v.id
       HAVING gross_sales > 0 OR amount_due > 0 OR awaiting_confirmation > 0 OR amount_paid > 0
       ORDER BY amount_due DESC, vendor_name ASC`
    );
    const [[pendingCount]] = await db.query(
      "SELECT COUNT(*) AS n FROM vendor_settlements WHERE status = 'requested'"
    );
    return { vendors: rows, pending_requests: Number(pendingCount.n || 0) };
  },
};

module.exports = SettlementModel;
