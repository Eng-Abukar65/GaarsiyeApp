const db = require('../config/db');
const { ensureFinancialSchema } = require('../utils/financialSchema');

/**
 * Enterprise Unified Financial Transaction Service
 * Aggregates and normalizes financial records across orders, car wash bookings,
 * subscription payments, module purchases, settlements, and refunds.
 */
class FinancialTransactionService {

  /**
   * Helper: Round number to 2 decimal places safely
   */
  static toNum(val) {
    const n = parseFloat(val);
    return isNaN(n) ? 0.00 : Math.round(n * 100) / 100;
  }

  /**
   * Helper: Mask phone numbers for customer privacy (e.g. 25261XXXXX56)
   */
  static maskPhone(phone) {
    if (!phone) return 'N/A';
    const str = String(phone).trim();
    if (str.length <= 6) return str;
    return str.slice(0, 5) + 'X'.repeat(Math.max(3, str.length - 7)) + str.slice(-2);
  }

  /**
   * Fetch all raw financial records and normalize them into a single dataset.
   */
  static async getAllNormalizedTransactions(options = {}) {
    await ensureFinancialSchema();

    const transactions = [];

    // 1. Fetch Orders (Product, Fuel, Gas, Spare Parts)
    try {
      const [orderRows] = await db.query(`
        SELECT 
          o.id AS order_id,
          CONCAT('ORD-', LPAD(o.id, 6, '0')) AS order_reference,
          o.customer_id,
          COALESCE(u.username, u.email, 'Customer') AS customer_name,
          u.phone AS customer_phone,
          u.email AS customer_email,
          o.vendor_id,
          v.name AS vendor_business_name,
          v.contact_name AS vendor_owner_name,
          v.phone AS vendor_phone,
          v.email AS vendor_email,
          v.business_type AS vendor_business_type,
          o.total_amount,
          o.status AS order_status,
          o.payment_status AS order_payment_status,
          o.delivery_address,
          o.created_at,
          p.id AS payment_id,
          p.transaction_id,
          p.status AS payment_table_status,
          p.amount AS payment_amount,
          p.created_at AS payment_created_at,
          pa.provider,
          pa.payer_account,
          pa.idempotency_key,
          pa.request_id,
          pa.response_code,
          pa.response_message,
          pa.status AS provider_status,
          pa.provider_transaction_id,
          r.id AS refund_id,
          r.amount AS refund_amount,
          r.status AS refund_status
        FROM orders o
        LEFT JOIN users u ON o.customer_id = u.id
        LEFT JOIN vendors v ON o.vendor_id = v.id
        LEFT JOIN payments p ON o.id = p.order_id
        LEFT JOIN payment_attempts pa ON o.id = pa.order_id
        LEFT JOIN refunds r ON o.id = r.order_id
        ORDER BY o.created_at DESC
      `);

      const orderIds = orderRows.map(r => r.order_id);
      let orderItemsMap = {};
      if (orderIds.length > 0) {
        try {
          const [itemRows] = await db.query(`
            SELECT oi.order_id, oi.quantity, oi.price, p.name AS product_name, p.category
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')})
          `, orderIds);

          for (const item of itemRows) {
            if (!orderItemsMap[item.order_id]) orderItemsMap[item.order_id] = [];
            orderItemsMap[item.order_id].push(item);
          }
        } catch (itemErr) {
          // If order_items query fails, map stays empty
        }
      }

      for (const row of orderRows) {
        const items = orderItemsMap[row.order_id] || [];
        const categories = items.map(i => (i.category || i.product_name || '').toLowerCase());

        let txnType = 'Product Order Payment';
        let moduleType = 'Spare Parts';
        if (categories.some(c => c.includes('fuel') || c.includes('petrol') || c.includes('diesel'))) {
          txnType = 'Fuel Order Payment';
          moduleType = 'Petrol/Diesel';
        } else if (categories.some(c => c.includes('gas') || c.includes('lpg') || c.includes('cylinder'))) {
          txnType = 'Gas Cylinder Payment';
          moduleType = 'Gas Cylinder';
        } else if (categories.some(c => c.includes('spare') || c.includes('parts') || c.includes('car'))) {
          txnType = 'Spare Parts Payment';
          moduleType = 'Spare Parts';
        } else if (row.vendor_business_type) {
          const bt = String(row.vendor_business_type).toLowerCase();
          if (bt.includes('fuel') || bt.includes('petrol')) { txnType = 'Fuel Order Payment'; moduleType = 'Petrol/Diesel'; }
          else if (bt.includes('gas')) { txnType = 'Gas Cylinder Payment'; moduleType = 'Gas Cylinder'; }
          else if (bt.includes('spare')) { txnType = 'Spare Parts Payment'; moduleType = 'Spare Parts'; }
        }

        const totalAmt = this.toNum(row.total_amount);
        const pAmt = row.payment_amount != null ? this.toNum(row.payment_amount) : totalAmt;
        const refundAmt = row.refund_amount != null ? this.toNum(row.refund_amount) : 0.00;

        let paymentStatus = 'Initiated';
        const ordPay = String(row.order_payment_status || '').toLowerCase();
        const payTab = String(row.payment_table_status || '').toLowerCase();
        const provStat = String(row.provider_status || '').toLowerCase();

        if (ordPay === 'paid' || payTab === 'success' || provStat === 'successful') {
          paymentStatus = refundAmt > 0 ? (refundAmt >= totalAmt ? 'Refunded' : 'Partially Refunded') : 'Paid';
        } else if (ordPay === 'failed' || payTab === 'failed' || provStat === 'failed') {
          paymentStatus = 'Failed';
        } else if (ordPay === 'cancelled' || payTab === 'cancelled') {
          paymentStatus = 'Cancelled';
        } else if (provStat === 'initiated') {
          paymentStatus = 'Awaiting Customer Approval';
        }

        let integrityStatus = 'Valid';
        if (row.payment_id && Math.abs(totalAmt - pAmt) > 0.01) {
          integrityStatus = 'Amount Mismatch';
        } else if ((ordPay === 'paid' || payTab === 'success') && !row.payment_id && !row.provider_transaction_id) {
          integrityStatus = 'Missing Payment';
        } else if ((ordPay === 'paid' || payTab === 'success') && row.order_status === 'Cancelled') {
          integrityStatus = 'Requires Review';
        } else if (refundAmt > 0 && (ordPay === 'paid' && refundAmt >= totalAmt)) {
          integrityStatus = 'Requires Review';
        }

        transactions.push({
          id: `TXN-ORD-${row.order_id}`,
          reference: row.transaction_id || row.provider_transaction_id || `TXN-2026-${String(row.order_id).padStart(6, '0')}`,
          type: txnType,
          customer: {
            id: row.customer_id || 0,
            name: row.customer_name || 'Guest Customer',
            phone: row.customer_phone || 'N/A',
            phoneMasked: this.maskPhone(row.customer_phone),
            email: row.customer_email || 'N/A'
          },
          vendor: {
            id: row.vendor_id || 0,
            businessName: row.vendor_business_name || 'System Vendor',
            ownerName: row.vendor_owner_name || 'N/A',
            phone: row.vendor_phone || 'N/A',
            email: row.vendor_email || 'N/A',
            businessModule: moduleType
          },
          orderReference: row.order_reference,
          bookingReference: null,
          paymentMethod: row.provider || 'waafi',
          subtotal: totalAmt,
          deliveryFee: 0.00,
          discount: 0.00,
          tax: 0.00,
          platformFee: this.toNum(totalAmt * 0.05),
          vendorPayable: this.toNum(totalAmt * 0.95),
          refundedAmount: refundAmt,
          totalAmount: totalAmt,
          currency: 'USD',
          status: paymentStatus,
          providerStatus: row.provider_status || row.payment_table_status || 'completed',
          integrityStatus,
          createdAt: row.created_at,
          paidAt: paymentStatus === 'Paid' ? row.created_at : null,
          failedAt: paymentStatus === 'Failed' ? row.created_at : null,
          refundedAt: refundAmt > 0 ? row.created_at : null,
          providerDetails: {
            providerName: row.provider || 'WaafiPay',
            payerAccount: row.payer_account || 'N/A',
            idempotencyKey: row.idempotency_key || null,
            requestId: row.request_id || null,
            responseCode: row.response_code || '200',
            responseMessage: row.response_message || 'Approved'
          },
          items: items.map(i => ({ name: i.product_name || 'Product', quantity: i.quantity, price: this.toNum(i.price || 0) }))
        });
      }
    } catch (err) {
      console.error('[FINANCIAL_SERVICE] Error fetching order transactions:', err.message);
    }

    // 2. Fetch Car Wash / Car Services Bookings
    try {
      const [bookingRows] = await db.query(`
        SELECT 
          b.id AS booking_id,
          b.booking_code AS booking_reference,
          b.customer_id,
          COALESCE(b.customer_name, u.username, u.email, 'Customer') AS customer_name,
          COALESCE(b.customer_phone, u.phone) AS customer_phone,
          u.email AS customer_email,
          b.vendor_id,
          v.name AS vendor_business_name,
          v.contact_name AS vendor_owner_name,
          v.phone AS vendor_phone,
          v.email AS vendor_email,
          b.service_name,
          b.total_price AS total_amount,
          b.payment_status AS booking_payment_status,
          b.status AS booking_status,
          b.created_at,
          p.id AS payment_id,
          p.transaction_id,
          p.status AS payment_table_status,
          r.amount AS refund_amount
        FROM car_wash_bookings b
        LEFT JOIN users u ON b.customer_id = u.id
        LEFT JOIN vendors v ON b.vendor_id = v.id
        LEFT JOIN payments p ON p.transaction_id = b.booking_code
        LEFT JOIN refunds r ON b.id = r.booking_id
        ORDER BY b.created_at DESC
      `);

      for (const row of bookingRows) {
        const totalAmt = this.toNum(row.total_amount);
        const refundAmt = row.refund_amount != null ? this.toNum(row.refund_amount) : 0.00;
        const bPayStatus = String(row.booking_payment_status || 'unpaid').toLowerCase();

        let paymentStatus = 'Initiated';
        if (bPayStatus === 'paid' || row.payment_table_status === 'SUCCESS') {
          paymentStatus = refundAmt > 0 ? (refundAmt >= totalAmt ? 'Refunded' : 'Partially Refunded') : 'Paid';
        } else if (bPayStatus === 'failed' || row.payment_table_status === 'FAILED') {
          paymentStatus = 'Failed';
        } else if (row.booking_status === 'cancelled') {
          paymentStatus = 'Cancelled';
        }

        let integrityStatus = 'Valid';
        if (bPayStatus === 'paid' && row.booking_status === 'cancelled') {
          integrityStatus = 'Requires Review';
        }

        transactions.push({
          id: `TXN-CW-${row.booking_id}`,
          reference: row.transaction_id || `TXN-CW-${String(row.booking_id).padStart(6, '0')}`,
          type: 'Car Services Booking Payment',
          customer: {
            id: row.customer_id || 0,
            name: row.customer_name || 'Car Wash Customer',
            phone: row.customer_phone || 'N/A',
            phoneMasked: this.maskPhone(row.customer_phone),
            email: row.customer_email || 'N/A'
          },
          vendor: {
            id: row.vendor_id || 0,
            businessName: row.vendor_business_name || 'Car Wash Station',
            ownerName: row.vendor_owner_name || 'N/A',
            phone: row.vendor_phone || 'N/A',
            email: row.vendor_email || 'N/A',
            businessModule: 'Car Services'
          },
          orderReference: null,
          bookingReference: row.booking_reference || `BK-${row.booking_id}`,
          paymentMethod: 'waafi',
          subtotal: totalAmt,
          deliveryFee: 0.00,
          discount: 0.00,
          tax: 0.00,
          platformFee: this.toNum(totalAmt * 0.10),
          vendorPayable: this.toNum(totalAmt * 0.90),
          refundedAmount: refundAmt,
          totalAmount: totalAmt,
          currency: 'USD',
          status: paymentStatus,
          providerStatus: 'completed',
          integrityStatus,
          createdAt: row.created_at,
          paidAt: paymentStatus === 'Paid' ? row.created_at : null,
          failedAt: paymentStatus === 'Failed' ? row.created_at : null,
          refundedAt: refundAmt > 0 ? row.created_at : null,
          providerDetails: {
            providerName: 'WaafiPay',
            payerAccount: row.customer_phone || 'N/A',
            idempotencyKey: null,
            requestId: null,
            responseCode: '200',
            responseMessage: 'Booking Approved'
          },
          items: [{ name: row.service_name || 'Car Wash Service', quantity: 1, price: totalAmt }]
        });
      }
    } catch (err) {
      console.error('[FINANCIAL_SERVICE] Error fetching booking transactions:', err.message);
    }

    // 3. Fetch Vendor Subscription Payments
    try {
      const [subRows] = await db.query(`
        SELECT 
          sp.id AS sub_payment_id,
          sp.reference_number AS payment_reference,
          sp.vendor_id,
          v.name AS vendor_business_name,
          v.contact_name AS vendor_owner_name,
          v.phone AS vendor_phone,
          v.email AS vendor_email,
          v.business_type,
          sp.amount,
          sp.payment_method,
          sp.status,
          sp.billing_period,
          sp.created_at,
          sp.reviewed_at AS approved_at
        FROM vendor_subscription_payments sp
        LEFT JOIN vendors v ON sp.vendor_id = v.id
        ORDER BY sp.created_at DESC
      `);

      for (const row of subRows) {
        const totalAmt = this.toNum(row.amount);
        const subStatus = String(row.status || 'pending').toLowerCase();

        let paymentStatus = 'Pending';
        if (subStatus === 'approved' || subStatus === 'completed') paymentStatus = 'Paid';
        else if (subStatus === 'rejected' || subStatus === 'failed') paymentStatus = 'Failed';

        transactions.push({
          id: `TXN-SUB-${row.sub_payment_id}`,
          reference: row.payment_reference || `SUB-PAY-${row.sub_payment_id}`,
          type: 'Vendor Subscription Payment',
          customer: {
            id: 0,
            name: row.vendor_owner_name || 'Vendor Owner',
            phone: row.vendor_phone || 'N/A',
            phoneMasked: this.maskPhone(row.vendor_phone),
            email: row.vendor_email || 'N/A'
          },
          vendor: {
            id: row.vendor_id || 0,
            businessName: row.vendor_business_name || 'Vendor',
            ownerName: row.vendor_owner_name || 'N/A',
            phone: row.vendor_phone || 'N/A',
            email: row.vendor_email || 'N/A',
            businessModule: row.business_type || 'General'
          },
          orderReference: null,
          bookingReference: null,
          paymentMethod: row.payment_method || 'waafi',
          subtotal: totalAmt,
          deliveryFee: 0.00,
          discount: 0.00,
          tax: 0.00,
          platformFee: totalAmt,
          vendorPayable: 0.00,
          refundedAmount: 0.00,
          totalAmount: totalAmt,
          currency: 'USD',
          status: paymentStatus,
          providerStatus: subStatus,
          integrityStatus: 'Valid',
          createdAt: row.created_at,
          paidAt: row.approved_at || (paymentStatus === 'Paid' ? row.created_at : null),
          failedAt: paymentStatus === 'Failed' ? row.created_at : null,
          refundedAt: null,
          providerDetails: {
            providerName: row.payment_method || 'WaafiPay',
            payerAccount: row.vendor_phone || 'N/A',
            idempotencyKey: null,
            requestId: null,
            responseCode: '200',
            responseMessage: `Billing Period: ${row.billing_period || 'N/A'}`
          },
          items: [{ name: `Subscription Plan (${row.billing_period || 'Monthly'})`, quantity: 1, price: totalAmt }]
        });
      }
    } catch (err) {
      console.error('[FINANCIAL_SERVICE] Error fetching subscription payments:', err.message);
    }

    // 4. Fetch Module Purchase Payments
    try {
      const [modRows] = await db.query(`
        SELECT 
          m.id AS request_id,
          m.vendor_id,
          v.name AS vendor_business_name,
          v.contact_name AS vendor_owner_name,
          v.phone AS vendor_phone,
          v.email AS vendor_email,
          m.requested_module_name AS requested_module,
          m.upgrade_amount_due AS amount,
          m.payment_method,
          m.reference_number AS payment_reference,
          m.status,
          m.created_at
        FROM module_upgrade_requests m
        LEFT JOIN vendors v ON m.vendor_id = v.id
        ORDER BY m.created_at DESC
      `);

      for (const row of modRows) {
        const totalAmt = this.toNum(row.amount);
        const mStatus = String(row.status || 'pending').toLowerCase();

        let paymentStatus = 'Pending';
        if (mStatus === 'approved' || mStatus === 'active' || mStatus === 'completed') paymentStatus = 'Paid';
        else if (mStatus === 'rejected' || mStatus === 'failed') paymentStatus = 'Failed';

        transactions.push({
          id: `TXN-MOD-${row.request_id}`,
          reference: row.payment_reference || `MOD-REQ-${row.request_id}`,
          type: 'Vendor Module Purchase Payment',
          customer: {
            id: 0,
            name: row.vendor_owner_name || 'Vendor Owner',
            phone: row.vendor_phone || 'N/A',
            phoneMasked: this.maskPhone(row.vendor_phone),
            email: row.vendor_email || 'N/A'
          },
          vendor: {
            id: row.vendor_id || 0,
            businessName: row.vendor_business_name || 'Vendor',
            ownerName: row.vendor_owner_name || 'N/A',
            phone: row.vendor_phone || 'N/A',
            email: row.vendor_email || 'N/A',
            businessModule: row.requested_module || 'Module'
          },
          orderReference: null,
          bookingReference: null,
          paymentMethod: row.payment_method || 'waafi',
          subtotal: totalAmt,
          deliveryFee: 0.00,
          discount: 0.00,
          tax: 0.00,
          platformFee: totalAmt,
          vendorPayable: 0.00,
          refundedAmount: 0.00,
          totalAmount: totalAmt,
          currency: 'USD',
          status: paymentStatus,
          providerStatus: mStatus,
          integrityStatus: 'Valid',
          createdAt: row.created_at,
          paidAt: paymentStatus === 'Paid' ? row.created_at : null,
          failedAt: paymentStatus === 'Failed' ? row.created_at : null,
          refundedAt: null,
          providerDetails: {
            providerName: row.payment_method || 'WaafiPay',
            payerAccount: row.vendor_phone || 'N/A',
            idempotencyKey: null,
            requestId: null,
            responseCode: '200',
            responseMessage: `Module Access: ${row.requested_module}`
          },
          items: [{ name: `Module Purchase: ${row.requested_module}`, quantity: 1, price: totalAmt }]
        });
      }
    } catch (err) {
      console.error('[FINANCIAL_SERVICE] Error fetching module purchase payments:', err.message);
    }

    // 5. Fetch Vendor Settlements
    try {
      const [settleRows] = await db.query(`
        SELECT 
          s.id AS settlement_id,
          s.settlement_reference AS settlement_code,
          s.vendor_id,
          v.name AS vendor_business_name,
          v.contact_name AS vendor_owner_name,
          v.phone AS vendor_phone,
          v.email AS vendor_email,
          v.business_type,
          s.amount,
          s.payment_method,
          s.status,
          s.created_at,
          s.admin_confirmed_at AS processed_at
        FROM vendor_settlements s
        LEFT JOIN vendors v ON s.vendor_id = v.id
        ORDER BY s.created_at DESC
      `);

      for (const row of settleRows) {
        const totalAmt = this.toNum(row.amount);
        const sStatus = String(row.status || 'requested').toLowerCase();

        let paymentStatus = 'Pending';
        if (sStatus === 'confirmed' || sStatus === 'settled') paymentStatus = 'Paid';
        else if (sStatus === 'rejected' || sStatus === 'cancelled') paymentStatus = 'Failed';

        transactions.push({
          id: `TXN-SET-${row.settlement_id}`,
          reference: row.settlement_code || `SETTL-${row.settlement_id}`,
          type: 'Vendor Settlement',
          customer: {
            id: 0,
            name: 'Gaarsiis Platform Settlement',
            phone: 'N/A',
            phoneMasked: 'N/A',
            email: 'settlements@gaarsiis.com'
          },
          vendor: {
            id: row.vendor_id || 0,
            businessName: row.vendor_business_name || 'Vendor',
            ownerName: row.vendor_owner_name || 'N/A',
            phone: row.vendor_phone || 'N/A',
            email: row.vendor_email || 'N/A',
            businessModule: row.business_type || 'General'
          },
          orderReference: null,
          bookingReference: null,
          paymentMethod: row.payment_method || 'bank_settlement',
          subtotal: totalAmt,
          deliveryFee: 0.00,
          discount: 0.00,
          tax: 0.00,
          platformFee: 0.00,
          vendorPayable: totalAmt,
          refundedAmount: 0.00,
          totalAmount: totalAmt,
          currency: 'USD',
          status: paymentStatus,
          providerStatus: sStatus,
          integrityStatus: 'Valid',
          createdAt: row.created_at,
          paidAt: row.processed_at || (paymentStatus === 'Paid' ? row.created_at : null),
          failedAt: paymentStatus === 'Failed' ? row.created_at : null,
          refundedAt: null,
          providerDetails: {
            providerName: 'Platform Bank Transfer',
            payerAccount: 'Gaarsiis Operations',
            idempotencyKey: null,
            requestId: null,
            responseCode: '200',
            responseMessage: `Settlement Ref: ${row.settlement_code}`
          },
          items: [{ name: `Settlement Payout (${row.settlement_code})`, quantity: 1, price: totalAmt }]
        });
      }
    } catch (err) {
      console.error('[FINANCIAL_SERVICE] Error fetching settlements:', err.message);
    }

    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return transactions;
  }

  /**
   * Filter and paginate transactions server-side.
   */
  static async getFilteredTransactions(options = {}) {
    const allTxns = await this.getAllNormalizedTransactions(options);

    const {
      page = 1,
      limit = 25,
      search = '',
      status = '',
      type = '',
      paymentMethod = '',
      vendorId = null,
      customerId = null,
      businessModule = '',
      dateFrom = '',
      dateTo = '',
      minAmount = null,
      maxAmount = null,
      currency = '',
      integrityStatus = ''
    } = options;

    let filtered = allTxns;

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(t => {
        return (
          t.id.toLowerCase().includes(q) ||
          (t.reference && t.reference.toLowerCase().includes(q)) ||
          (t.orderReference && t.orderReference.toLowerCase().includes(q)) ||
          (t.bookingReference && t.bookingReference.toLowerCase().includes(q)) ||
          (t.customer.name && t.customer.name.toLowerCase().includes(q)) ||
          (t.customer.phone && t.customer.phone.includes(q)) ||
          (t.customer.email && t.customer.email.toLowerCase().includes(q)) ||
          (t.vendor.businessName && t.vendor.businessName.toLowerCase().includes(q)) ||
          (t.vendor.phone && t.vendor.phone.includes(q)) ||
          (t.vendor.email && t.vendor.email.toLowerCase().includes(q)) ||
          (t.providerDetails.providerTransactionId && t.providerDetails.providerTransactionId.toLowerCase().includes(q))
        );
      });
    }

    if (status && status !== 'all') {
      filtered = filtered.filter(t => t.status.toLowerCase() === status.toLowerCase());
    }

    if (type && type !== 'all') {
      filtered = filtered.filter(t => t.type.toLowerCase() === type.toLowerCase());
    }

    if (paymentMethod && paymentMethod !== 'all') {
      filtered = filtered.filter(t => (t.paymentMethod || '').toLowerCase().includes(paymentMethod.toLowerCase()));
    }

    if (vendorId) {
      filtered = filtered.filter(t => String(t.vendor.id) === String(vendorId));
    }

    if (customerId) {
      filtered = filtered.filter(t => String(t.customer.id) === String(customerId));
    }

    if (businessModule && businessModule !== 'all') {
      filtered = filtered.filter(t => (t.vendor.businessModule || '').toLowerCase().includes(businessModule.toLowerCase()));
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filtered = filtered.filter(t => new Date(t.createdAt) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(t => new Date(t.createdAt) <= toDate);
    }

    if (minAmount != null && !isNaN(parseFloat(minAmount))) {
      filtered = filtered.filter(t => t.totalAmount >= parseFloat(minAmount));
    }
    if (maxAmount != null && !isNaN(parseFloat(maxAmount))) {
      filtered = filtered.filter(t => t.totalAmount <= parseFloat(maxAmount));
    }

    if (integrityStatus && integrityStatus !== 'all') {
      filtered = filtered.filter(t => t.integrityStatus.toLowerCase() === integrityStatus.toLowerCase());
    }

    const summary = this.calculateSummary(filtered);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(500, parseInt(limit, 10) || 25));
    const total = filtered.length;
    const totalPages = Math.ceil(total / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedItems = filtered.slice(startIndex, startIndex + limitNum);

    return {
      success: true,
      summary,
      transactions: paginatedItems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    };
  }

  /**
   * Calculate summary metrics from dataset
   */
  static calculateSummary(dataset) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalValue = 0;
    let totalSuccessful = 0;
    let totalPending = 0;
    let totalFailed = 0;
    let totalRefunded = 0;
    let totalCustomerPayments = 0;
    let totalSubscriptionPayments = 0;
    let totalModulePurchasePayments = 0;
    let totalVendorSettlements = 0;
    let todayValue = 0;
    let monthValue = 0;

    for (const t of dataset) {
      const amt = t.totalAmount || 0;
      const st = t.status.toLowerCase();
      const dt = new Date(t.createdAt);

      if (st === 'paid') {
        totalValue += amt;
        totalSuccessful += 1;

        if (dt >= startOfToday) todayValue += amt;
        if (dt >= startOfMonth) monthValue += amt;
      } else if (st === 'pending' || st === 'initiated' || st === 'processing' || st === 'awaiting customer approval') {
        totalPending += 1;
      } else if (st === 'failed' || st === 'cancelled' || st === 'expired') {
        totalFailed += 1;
      }

      if (st === 'refunded' || st === 'partially refunded') {
        totalRefunded += t.refundedAmount || amt;
      }

      const type = t.type.toLowerCase();
      if (type.includes('order') || type.includes('booking')) {
        if (st === 'paid') totalCustomerPayments += amt;
      } else if (type.includes('subscription')) {
        if (st === 'paid') totalSubscriptionPayments += amt;
      } else if (type.includes('module')) {
        if (st === 'paid') totalModulePurchasePayments += amt;
      } else if (type.includes('settlement')) {
        if (st === 'paid') totalVendorSettlements += amt;
      }
    }

    return {
      totalTransactionValue: this.toNum(totalValue),
      totalTransactionsCount: dataset.length,
      totalSuccessfulPayments: totalSuccessful,
      totalPendingPayments: totalPending,
      totalFailedPayments: totalFailed,
      totalRefundedPayments: this.toNum(totalRefunded),
      totalCustomerPayments: this.toNum(totalCustomerPayments),
      totalVendorSubscriptionPayments: this.toNum(totalSubscriptionPayments),
      totalModulePurchasePayments: this.toNum(totalModulePurchasePayments),
      totalVendorSettlements: this.toNum(totalVendorSettlements),
      todayTransactionValue: this.toNum(todayValue),
      thisMonthTransactionValue: this.toNum(monthValue)
    };
  }

  /**
   * Get single transaction details by ID
   */
  static async getTransactionById(id) {
    const allTxns = await this.getAllNormalizedTransactions();
    const found = allTxns.find(t => t.id === id || t.reference === id);
    if (!found) return null;
    return found;
  }

  /**
   * Get all transactions for a specific customer
   */
  static async getCustomerTransactions(customerId) {
    const result = await this.getFilteredTransactions({ customerId, limit: 100 });
    return result.transactions;
  }

  /**
   * Get financial breakdown for a specific vendor
   */
  static async getVendorFinancialHistory(vendorId) {
    const allTxns = await this.getAllNormalizedTransactions({ vendorId });
    const vendorTxns = allTxns.filter(t => String(t.vendor.id) === String(vendorId));

    const customerPayments = vendorTxns.filter(t => (t.type.includes('Order') || t.type.includes('Booking')) && t.status === 'Paid');
    const subscriptionPayments = vendorTxns.filter(t => t.type.includes('Subscription'));
    const modulePayments = vendorTxns.filter(t => t.type.includes('Module'));
    const settlements = vendorTxns.filter(t => t.type.includes('Settlement'));
    const refunds = vendorTxns.filter(t => t.status === 'Refunded' || t.status === 'Partially Refunded');

    const totalCustomerRevenue = customerPayments.reduce((sum, t) => sum + (t.vendorPayable || t.totalAmount), 0);
    const totalSettled = settlements.filter(t => t.status === 'Paid').reduce((sum, t) => sum + t.totalAmount, 0);
    const totalRefunded = refunds.reduce((sum, t) => sum + (t.refundedAmount || t.totalAmount), 0);
    const outstandingBalance = this.toNum(Math.max(0, totalCustomerRevenue - totalSettled - totalRefunded));

    return {
      vendorId,
      summary: {
        totalCustomerRevenue: this.toNum(totalCustomerRevenue),
        totalSubscriptionsPaid: this.toNum(subscriptionPayments.filter(t => t.status === 'Paid').reduce((sum, t) => sum + t.totalAmount, 0)),
        totalModulesPaid: this.toNum(modulePayments.filter(t => t.status === 'Paid').reduce((sum, t) => sum + t.totalAmount, 0)),
        totalRefunds: this.toNum(totalRefunded),
        totalSettlements: this.toNum(totalSettled),
        outstandingSettlementBalance: outstandingBalance
      },
      transactions: vendorTxns
    };
  }

  /**
   * Log financial action in audit trail
   */
  static async logAudit(adminId, action, targetType, targetId, details = {}, ipAddress = null) {
    try {
      await ensureFinancialSchema();
      await db.query(`
        INSERT INTO financial_audit_logs (admin_id, action, target_type, target_id, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [adminId || null, action, targetType, String(targetId || ''), JSON.stringify(details), ipAddress || null]);
    } catch (err) {
      console.error('[FINANCIAL_AUDIT] Failed to write audit log:', err.message);
    }
  }
}

module.exports = FinancialTransactionService;
