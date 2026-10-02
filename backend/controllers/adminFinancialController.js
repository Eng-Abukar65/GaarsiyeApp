const FinancialTransactionService = require('../services/financialTransactionService');

class AdminFinancialController {

  /**
   * GET /api/admin/financial-transactions
   * Query params: page, limit, search, status, type, paymentMethod, vendorId, customerId, businessModule, dateFrom, dateTo, minAmount, maxAmount, currency, integrityStatus
   */
  static async getTransactions(req, res) {
    try {
      const options = {
        page: req.query.page || 1,
        limit: req.query.limit || 25,
        search: req.query.search || '',
        status: req.query.status || '',
        type: req.query.type || '',
        paymentMethod: req.query.paymentMethod || '',
        vendorId: req.query.vendorId || null,
        customerId: req.query.customerId || null,
        businessModule: req.query.businessModule || '',
        dateFrom: req.query.dateFrom || '',
        dateTo: req.query.dateTo || '',
        minAmount: req.query.minAmount || null,
        maxAmount: req.query.maxAmount || null,
        currency: req.query.currency || '',
        integrityStatus: req.query.integrityStatus || ''
      };

      const result = await FinancialTransactionService.getFilteredTransactions(options);

      // Audit log view action
      const adminId = req.user?.id || req.user?.userId;
      await FinancialTransactionService.logAudit(adminId, 'VIEW_TRANSACTIONS_LIST', 'FINANCIAL_TRANSACTIONS', null, { query: req.query }, req.ip);

      res.json(result);
    } catch (err) {
      console.error('[ADMIN_FINANCIAL] Error fetching transactions:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to fetch financial transactions.' });
    }
  }

  /**
   * GET /api/admin/financial-transactions/summary
   */
  static async getSummary(req, res) {
    try {
      const allTxns = await FinancialTransactionService.getAllNormalizedTransactions();
      const summary = FinancialTransactionService.calculateSummary(allTxns);
      res.json({ success: true, summary });
    } catch (err) {
      console.error('[ADMIN_FINANCIAL] Error fetching financial summary:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch financial summary.' });
    }
  }

  /**
   * GET /api/admin/financial-transactions/:id
   */
  static async getTransactionById(req, res) {
    try {
      const { id } = req.params;
      const transaction = await FinancialTransactionService.getTransactionById(id);
      if (!transaction) {
        return res.status(404).json({ success: false, message: 'Transaction not found.' });
      }

      const adminId = req.user?.id || req.user?.userId;
      await FinancialTransactionService.logAudit(adminId, 'VIEW_TRANSACTION_DETAILS', 'TRANSACTION', id, { reference: transaction.reference }, req.ip);

      res.json({ success: true, transaction });
    } catch (err) {
      console.error('[ADMIN_FINANCIAL] Error fetching transaction detail:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch transaction details.' });
    }
  }

  /**
   * GET /api/admin/customers/:customerId/transactions
   */
  static async getCustomerTransactions(req, res) {
    try {
      const { customerId } = req.params;
      const transactions = await FinancialTransactionService.getCustomerTransactions(customerId);
      res.json({ success: true, customerId, transactions });
    } catch (err) {
      console.error('[ADMIN_FINANCIAL] Error fetching customer transactions:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch customer payment history.' });
    }
  }

  /**
   * GET /api/admin/vendors/:vendorId/financial-history
   */
  static async getVendorFinancialHistory(req, res) {
    try {
      const { vendorId } = req.params;
      const financialHistory = await FinancialTransactionService.getVendorFinancialHistory(vendorId);
      res.json({ success: true, ...financialHistory });
    } catch (err) {
      console.error('[ADMIN_FINANCIAL] Error fetching vendor financial history:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch vendor financial history.' });
    }
  }

  /**
   * GET /api/admin/financial-transactions/export
   */
  static async exportTransactions(req, res) {
    try {
      const format = (req.query.format || 'csv').toLowerCase();
      const options = { ...req.query, limit: 10000 };
      const result = await FinancialTransactionService.getFilteredTransactions(options);

      const adminId = req.user?.id || req.user?.userId;
      await FinancialTransactionService.logAudit(adminId, 'EXPORT_TRANSACTIONS', 'EXPORT', format, { count: result.transactions.length }, req.ip);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=financial_transactions_${Date.now()}.csv`);

        const headers = ['Transaction ID', 'Reference', 'Type', 'Customer', 'Customer Phone', 'Vendor', 'Order/Booking Ref', 'Payment Method', 'Subtotal', 'Delivery Fee', 'Total Amount', 'Currency', 'Payment Status', 'Integrity Status', 'Date'];
        const csvLines = [headers.join(',')];

        for (const t of result.transactions) {
          const row = [
            `"${t.id}"`,
            `"${t.reference || ''}"`,
            `"${t.type || ''}"`,
            `"${(t.customer.name || '').replace(/"/g, '""')}"`,
            `"${t.customer.phone || ''}"`,
            `"${(t.vendor.businessName || '').replace(/"/g, '""')}"`,
            `"${t.orderReference || t.bookingReference || ''}"`,
            `"${t.paymentMethod || ''}"`,
            t.subtotal,
            t.deliveryFee,
            t.totalAmount,
            `"${t.currency}"`,
            `"${t.status}"`,
            `"${t.integrityStatus}"`,
            `"${t.createdAt}"`
          ];
          csvLines.push(row.join(','));
        }

        return res.send(csvLines.join('\n'));
      }

      res.json({
        success: true,
        format,
        summary: result.summary,
        totalRecords: result.transactions.length,
        data: result.transactions
      });
    } catch (err) {
      console.error('[ADMIN_FINANCIAL] Error exporting transactions:', err);
      res.status(500).json({ success: false, message: 'Failed to export financial transactions.' });
    }
  }

  /**
   * POST /api/admin/financial-transactions/:id/refund
   */
  static async processRefund(req, res) {
    try {
      const { id } = req.params;
      const { amount, reason, notes, action = 'request' } = req.body;
      const adminId = req.user?.id || req.user?.userId;

      const transaction = await FinancialTransactionService.getTransactionById(id);
      if (!transaction) {
        return res.status(404).json({ success: false, message: 'Transaction not found for refund.' });
      }

      const db = require('../config/db');
      const refundAmount = parseFloat(amount || transaction.totalAmount);

      const [refundRes] = await db.query(`
        INSERT INTO refunds (transaction_id, order_id, booking_id, customer_id, vendor_id, amount, currency, reason, status, requested_by, approved_by, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        transaction.reference,
        transaction.id.startsWith('TXN-ORD-') ? parseInt(transaction.id.replace('TXN-ORD-', ''), 10) : null,
        transaction.id.startsWith('TXN-CW-') ? parseInt(transaction.id.replace('TXN-CW-', ''), 10) : null,
        transaction.customer.id,
        transaction.vendor.id,
        refundAmount,
        transaction.currency || 'USD',
        reason || 'Admin Initiated Refund',
        action === 'approve' ? 'approved' : 'requested',
        adminId,
        action === 'approve' ? adminId : null,
        notes || null
      ]);

      await FinancialTransactionService.logAudit(adminId, `REFUND_${action.toUpperCase()}`, 'REFUND', refundRes.insertId, { transactionId: id, amount: refundAmount, reason }, req.ip);

      res.status(201).json({
        success: true,
        message: `Refund ${action === 'approve' ? 'approved and recorded' : 'requested successfully'}.`,
        refundId: refundRes.insertId,
        amount: refundAmount
      });
    } catch (err) {
      console.error('[ADMIN_FINANCIAL] Error processing refund:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to process refund request.' });
    }
  }
}

module.exports = AdminFinancialController;
