const db = require('../config/db');
const { ensureSubscriptionSchema } = require('../utils/subscriptionSchema');

const moduleToPlanCode = (name) => {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('petrol') || lower.includes('diesel')) return 'petrol_diesel';
  if (lower.includes('gas') || lower.includes('cylinder') || lower.includes('depot')) return 'gas_cylinder';
  if (lower.includes('spare') || lower.includes('part')) return 'spare_parts';
  if (lower.includes('car') || lower.includes('wash') || lower.includes('service')) return 'car_services';
  return null;
};

class SubscriptionModel {
  /**
   * Calculates a vendor's subscription plan and fee dynamically from DB subscription_pricing table:
   * Total monthly subscription = sum of all active selected module prices.
   */
  static async calculateVendorPlanAndPrice(vendorId) {
    await ensureSubscriptionSchema();

    // Query DB subscription_pricing table
    const [planRows] = await db.query(
      `SELECT * FROM subscription_pricing`
    );

    const planMap = {};
    planRows.forEach((p) => {
      planMap[p.plan_code] = p;
    });

    // Calculate vendor's module count from vendors.business_type string or vendor_business_types
    const [[vendorRow]] = await db.query(`SELECT business_type FROM vendors WHERE id = ?`, [vendorId]);
    const bTypeStr = vendorRow?.business_type || '';

    let moduleNames = [];
    if (bTypeStr) {
      if (bTypeStr.startsWith('[')) {
        try {
          moduleNames = JSON.parse(bTypeStr);
        } catch {
          moduleNames = [bTypeStr];
        }
      } else {
        moduleNames = bTypeStr.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    if (moduleNames.length === 0) {
      const [typesRows] = await db.query(
        `SELECT bt.name FROM vendor_business_types vbt
         JOIN business_types bt ON vbt.business_type_id = bt.id
         WHERE vbt.vendor_id = ?`,
        [vendorId]
      );
      moduleNames = typesRows.map(r => r.name);
    }

    // Default fallback if no module is found
    if (moduleNames.length === 0) {
      moduleNames = ['Gas Cylinder'];
    }

    let amountDue = 0;
    const activePlanCodes = new Set();
    const resolvedActiveNames = [];
    moduleNames.forEach((name) => {
      const planCode = moduleToPlanCode(name);
      if (planCode) {
        activePlanCodes.add(planCode);
        const plan = planMap[planCode];
        if (plan) {
          amountDue += Number.parseFloat(plan.price || 0);
          if (!resolvedActiveNames.includes(plan.plan_name)) {
            resolvedActiveNames.push(plan.plan_name);
          }
        }
      }
    });

    if (activePlanCodes.size === 0) {
      const fallbackPlan = planMap['gas_cylinder'];
      if (fallbackPlan) {
        amountDue = Number.parseFloat(fallbackPlan.price || 10.00);
        resolvedActiveNames.push(fallbackPlan.plan_name);
      }
    }

    const planName = resolvedActiveNames.join(' + ') || 'No Active Modules';
    const moduleCount = activePlanCodes.size || 1;
    const planLabel = planName;
    const planDescription = `Active Modules: ${planName}`;

    // Get an ID for the first matched plan if any
    const firstCode = Array.from(activePlanCodes)[0];
    const matchedPlan = planMap[firstCode] || { id: 1, status: 'active', updated_at: new Date(), updated_by_name: 'System Admin' };

    return {
      planName,
      amountDue,
      moduleCount,
      moduleNames,
      activeTypeIds: [],
      planLabel,
      planDescription,
      planId: matchedPlan.id,
      status: matchedPlan.status,
      updatedAt: matchedPlan.updated_at,
      updatedBy: matchedPlan.updated_by_name || 'System Admin'
    };
  }

  /**
   * Get vendor's active & inactive business modules with pricing upgrade options
   */
  static async getVendorModules(vendorId) {
    await ensureSubscriptionSchema();

    const currentCalc = await SubscriptionModel.calculateVendorPlanAndPrice(vendorId);
    const [allTypes] = await db.query(`SELECT * FROM business_types WHERE status = 'active' OR status IS NULL`);

    // Check for active upgrade requests
    const [upgradeRequests] = await db.query(
      `SELECT * FROM module_upgrade_requests WHERE vendor_id = ? AND status IN ('pending', 'approved_payment_required', 'payment_pending') ORDER BY created_at DESC`,
      [vendorId]
    );

    // Pricing plans map for upgrade calculations
    const [planRows] = await db.query(`SELECT * FROM subscription_pricing`);
    const planMap = {};
    planRows.forEach(p => { planMap[p.plan_code] = p; });

    const modules = allTypes.map((bt) => {
      const planCode = moduleToPlanCode(bt.name);
      const plan = planMap[planCode];
      const planPrice = plan ? Number.parseFloat(plan.price) : 0.00;
      const isPlanActive = plan ? plan.status === 'active' : true;

      const isActive = currentCalc.moduleNames.some(
        name => moduleToPlanCode(name) === planCode
      );

      const requestItem = upgradeRequests.find(r => Number(r.requested_business_type_id) === Number(bt.id));
      const isPending = requestItem && requestItem.status === 'pending';
      const isPaymentRequired = requestItem && requestItem.status === 'approved_payment_required';
      const isPaymentPending = requestItem && requestItem.status === 'payment_pending';

      // Upgrade pricing calculation if inactive is simply the monthly fee of that specific module
      const upgradeFee = planPrice;

      return {
        id: bt.id,
        name: bt.name,
        is_active: isActive,
        is_pending: isPending,
        is_payment_required: isPaymentRequired,
        is_payment_pending: isPaymentPending,
        request_status: requestItem ? requestItem.status : null,
        request_id: requestItem ? requestItem.id : null,
        is_enabled: isPlanActive,
        current_fee: currentCalc.amountDue,
        next_plan_name: currentCalc.planName ? `${currentCalc.planName} + ${bt.name}` : bt.name,
        next_monthly_fee: currentCalc.amountDue + planPrice,
        upgrade_amount_due: upgradeFee
      };
    });

    return {
      current_plan: currentCalc.planName,
      current_fee: currentCalc.amountDue,
      module_count: currentCalc.moduleCount,
      module_names: currentCalc.moduleNames,
      active_requests: upgradeRequests,
      modules
    };
  }

  /**
   * Vendor submits a request to add a new business module
   */
  static async requestModuleUpgrade({ vendorId, businessTypeId, notes }) {
    await ensureSubscriptionSchema();

    // Verify target business type exists
    const [[bType]] = await db.query(`SELECT * FROM business_types WHERE id = ?`, [businessTypeId]);
    if (!bType) {
      const err = new Error('Selected business module type does not exist.');
      err.statusCode = 404;
      throw err;
    }

    const currentCalc = await SubscriptionModel.calculateVendorPlanAndPrice(vendorId);

    // Check if module is already active
    const targetPlanCode = moduleToPlanCode(bType.name);
    const isAlreadyActive = currentCalc.moduleNames.some(
      name => moduleToPlanCode(name) === targetPlanCode
    );
    if (isAlreadyActive) {
      const err = new Error(`${bType.name} module is already active on your vendor account.`);
      err.statusCode = 400;
      throw err;
    }

    // Check for existing pending request for this SPECIFIC module
    const [existingPending] = await db.query(
      `SELECT id FROM module_upgrade_requests WHERE vendor_id = ? AND requested_business_type_id = ? AND status = 'pending'`,
      [vendorId, businessTypeId]
    );
    if (existingPending && existingPending.length > 0) {
      const err = new Error('You already have a pending request for this module.');
      err.statusCode = 400;
      throw err;
    }

    // Pricing plans map
    const [planRows] = await db.query(`SELECT * FROM subscription_pricing`);
    const planMap = {};
    planRows.forEach(p => { planMap[p.plan_code] = p; });

    const targetPlan = planMap[targetPlanCode];
    const newModulePrice = targetPlan ? Number.parseFloat(targetPlan.price) : 0.00;
    const oldMonthlyFee = currentCalc.amountDue;
    const newMonthlyFee = oldMonthlyFee + newModulePrice;
    const upgradeAmountDue = newModulePrice;

    const nextPlanName = currentCalc.planName ? `${currentCalc.planName} + ${bType.name}` : bType.name;

    const [upgradeRes] = await db.query(
      `INSERT INTO module_upgrade_requests
         (vendor_id, requested_business_type_id, requested_module_name, old_plan_name, new_plan_name,
          old_module_count, new_module_count, old_monthly_fee, new_monthly_fee, upgrade_amount_due,
          notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        vendorId,
        bType.id,
        bType.name,
        currentCalc.planName,
        nextPlanName,
        currentCalc.moduleCount,
        currentCalc.moduleCount + 1,
        oldMonthlyFee,
        newMonthlyFee,
        upgradeAmountDue,
        notes ? String(notes).trim() : `Module Request: + ${bType.name}`
      ]
    );

    const requestId = upgradeRes.insertId;

    // Trigger Admin Notification
    const NotificationModel = require('./notificationModel');
    NotificationModel.createAdminNotification({
      title: 'New Business Module Request',
      message: `Vendor requested business module upgrade (+ ${bType.name}). Awaiting approval.`,
      category: 'settlements',
      severity: 'info',
      type: 'module_upgrade_submitted',
      relatedId: requestId,
      targetUrl: '/admin/module-requests'
    }).catch(() => {});

    return { request_id: requestId, requested_module: bType.name, upgrade_amount_due: upgradeAmountDue };
  }

  static async getAllPricing() {
    await ensureSubscriptionSchema();
    const [plans] = await db.query(`SELECT * FROM subscription_pricing ORDER BY id ASC`);
    const [history] = await db.query(`
      SELECT h.*, DATE_FORMAT(h.created_at, '%b %d, %Y %h:%i %p') AS formatted_date
      FROM subscription_pricing_history h
      ORDER BY h.created_at DESC LIMIT 20
    `);
    return { plans, history };
  }

  static async getPricingHistory() {
    await ensureSubscriptionSchema();
    const [history] = await db.query(`
      SELECT h.*, DATE_FORMAT(h.created_at, '%b %d, %Y %h:%i %p') AS formatted_date
      FROM subscription_pricing_history h
      ORDER BY h.created_at DESC LIMIT 50
    `);
    return history;
  }

  static async updatePricing({ planId, price, status, planName, moduleDescription, userId, userName }) {
    await ensureSubscriptionSchema();

    if (price === undefined || price === null || String(price).trim() === '') {
      const err = new Error('Price is required.');
      err.statusCode = 400;
      throw err;
    }
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      const err = new Error('Price must be a valid number greater than 0.');
      err.statusCode = 400;
      throw err;
    }

    if (planName && !String(planName).trim()) {
      const err = new Error('Plan name cannot be empty.');
      err.statusCode = 400;
      throw err;
    }

    const [[existing]] = await db.query(`SELECT * FROM subscription_pricing WHERE id = ?`, [planId]);
    if (!existing) {
      const err = new Error('Subscription plan not found.');
      err.statusCode = 404;
      throw err;
    }

    const newPlanName = planName ? String(planName).trim() : existing.plan_name;
    const newDesc = moduleDescription ? String(moduleDescription).trim() : existing.module_description;
    const newStatus = status === 'inactive' ? 'inactive' : 'active';
    const updaterName = userName || 'Admin';

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Update plan record
      await conn.query(
        `UPDATE subscription_pricing
         SET price = ?, status = ?, plan_name = ?, module_description = ?,
             updated_by_user_id = ?, updated_by_name = ?, updated_at = NOW()
         WHERE id = ?`,
        [numericPrice, newStatus, newPlanName, newDesc, userId || null, updaterName, planId]
      );

      // Audit log entry if price or status changed
      if (Number.parseFloat(existing.price) !== numericPrice || existing.status !== newStatus) {
        await conn.query(
          `INSERT INTO subscription_pricing_history
             (plan_id, plan_code, plan_name, old_price, new_price, old_status, new_status, changed_by_user_id, changed_by_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            planId,
            existing.plan_code,
            newPlanName,
            existing.price,
            numericPrice,
            existing.status,
            newStatus,
            userId || null,
            updaterName
          ]
        );
      }

      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    return SubscriptionModel.getAllPricing();
  }

  static async getVendorStatus(vendorId) {
    await ensureSubscriptionSchema();
    const [[vendor]] = await db.query(
      `SELECT id, business_name, subscription_plan, subscription_status, subscription_expires_at
       FROM vendors WHERE id = ?`,
      [vendorId]
    );

    if (!vendor) return null;

    const calculated = await SubscriptionModel.calculateVendorPlanAndPrice(vendorId);
    const planName = calculated.planName;

    const getYYYYMMDD = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const todayStr = getYYYYMMDD(new Date());
    const expiryStr = getYYYYMMDD(vendor.subscription_expires_at);
    const isPaid = vendor.subscription_status === 'active' && expiryStr && expiryStr >= todayStr;

    // Counts for stats
    const [[counts]] = await db.query(
      `SELECT
         COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_count,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected_count
       FROM vendor_subscription_payments
       WHERE vendor_id = ?`,
      [vendorId]
    );

    // Check last pending payment submission
    const [pendingRows] = await db.query(
      `SELECT *, DATE_FORMAT(created_at, '%M %Y') AS period_month
       FROM vendor_subscription_payments
       WHERE vendor_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [vendorId]
    );
    const hasPending = pendingRows.length > 0;

    // Check last rejected payment submission
    const [rejectedRows] = await db.query(
      `SELECT *, DATE_FORMAT(created_at, '%M %Y') AS period_month
       FROM vendor_subscription_payments
       WHERE vendor_id = ? AND status = 'rejected'
       ORDER BY created_at DESC LIMIT 1`,
      [vendorId]
    );

    // Check last approved payment submission
    const [approvedRows] = await db.query(
      `SELECT *, DATE_FORMAT(created_at, '%M %Y') AS period_month
       FROM vendor_subscription_payments
       WHERE vendor_id = ? AND status = 'approved'
       ORDER BY created_at DESC LIMIT 1`,
      [vendorId]
    );

    const amountDue = (isPaid || hasPending) ? 0.00 : calculated.amountDue;

    return {
      vendor_id: vendor.id,
      business_name: vendor.business_name,
      plan_name: planName,
      amount_due: amountDue,
      plan_label: calculated.planLabel,
      plan_description: calculated.planDescription,
      module_count: calculated.moduleCount,
      module_names: calculated.moduleNames,
      subscription_status: vendor.subscription_status || 'active',
      subscription_expires_at: vendor.subscription_expires_at || null,
      pending_count: Number(counts?.pending_count || 0),
      approved_count: Number(counts?.approved_count || 0),
      rejected_count: Number(counts?.rejected_count || 0),
      pending_payment: pendingRows[0] || null,
      last_rejected_payment: rejectedRows[0] || null,
      last_approved_payment: approvedRows[0] || null,
      is_paid: isPaid,
      has_pending: hasPending,
      calculated_amount_due: calculated.amountDue
    };
  }

  static async submitPayment({ vendorId, planName, amount, paymentMethod, referenceNumber, receiptUrl, notes }) {
    await ensureSubscriptionSchema();

    // Fetch vendor subscription details
    const [[vendor]] = await db.query(
      `SELECT subscription_status, subscription_expires_at FROM vendors WHERE id = ?`,
      [vendorId]
    );

    if (!vendor) {
      const err = new Error('Vendor not found.');
      err.statusCode = 404;
      throw err;
    }

    const getYYYYMMDD = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const todayStr = getYYYYMMDD(new Date());
    const expiryStr = getYYYYMMDD(vendor.subscription_expires_at);
    const isPaid = vendor.subscription_status === 'active' && expiryStr && expiryStr >= todayStr;

    // A vendor must NOT be allowed to submit another subscription payment if there is no outstanding amount due.
    if (isPaid) {
      const err = new Error('No subscription payment is currently due.');
      err.statusCode = 409;
      throw err;
    }

    // Check for duplicate pending payment
    const [existingPending] = await db.query(
      `SELECT id FROM vendor_subscription_payments WHERE vendor_id = ? AND status = 'pending'`,
      [vendorId]
    );

    if (existingPending && existingPending.length > 0) {
      const err = new Error('You already have a subscription payment request pending review.');
      err.statusCode = 409;
      throw err;
    }

    // Calculate billing period (YYYY-MM)
    let targetBillingPeriod = '';
    if (vendor.subscription_expires_at) {
      const expDate = new Date(vendor.subscription_expires_at);
      // Next billing cycle starts after the expiration date
      expDate.setDate(expDate.getDate() + 1);
      targetBillingPeriod = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}`;
    } else {
      const now = new Date();
      targetBillingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // Prevent duplicate payments: check if there is an approved or pending payment for the target billing period
    const [dupPayments] = await db.query(
      `SELECT id FROM vendor_subscription_payments 
       WHERE vendor_id = ? AND billing_period = ? AND status IN ('pending', 'approved')`,
      [vendorId, targetBillingPeriod]
    );

    if (dupPayments && dupPayments.length > 0) {
      const err = new Error('No subscription payment is currently due.');
      err.statusCode = 409;
      throw err;
    }

    // Dynamically calculate vendor's exact plan and amount due based on business modules and DB pricing
    const calculated = await SubscriptionModel.calculateVendorPlanAndPrice(vendorId);
    const finalPlan = calculated.planName;
    const finalAmount = calculated.amountDue;

    const [result] = await db.query(
      `INSERT INTO vendor_subscription_payments
         (vendor_id, plan_name, amount, payment_method, reference_number, receipt_url, notes, status, billing_period)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [vendorId, finalPlan, finalAmount, paymentMethod, referenceNumber, receiptUrl, notes || null, targetBillingPeriod]
    );

    // Update vendor subscription status to 'pending' and subscription_plan
    await db.query(
      `UPDATE vendors SET subscription_status = 'pending', subscription_plan = ? WHERE id = ?`,
      [finalPlan, vendorId]
    );

    const NotificationModel = require('./notificationModel');
    NotificationModel.createAdminNotification({
      title: 'New Subscription Payment Submitted',
      message: `Subscription payment of $${finalAmount} submitted for ${finalPlan} Plan.`,
      category: 'settlements',
      severity: 'info',
      type: 'subscription_payment_submitted',
      relatedId: result.insertId,
      targetUrl: '/admin/settlements'
    }).catch(() => {});

    return result.insertId;
  }

  static async getVendorHistory(vendorId) {
    await ensureSubscriptionSchema();
    const [rows] = await db.query(
      `SELECT p.*, DATE_FORMAT(p.created_at, '%M %Y') AS period_month, v.business_name
       FROM vendor_subscription_payments p
       JOIN vendors v ON v.id = p.vendor_id
       WHERE p.vendor_id = ?
       ORDER BY p.created_at DESC`,
      [vendorId]
    );
    return rows;
  }

  static async adminListPayments({ status, vendorId } = {}) {
    await ensureSubscriptionSchema();
    let sql = `
      SELECT p.*, DATE_FORMAT(p.created_at, '%M %Y') AS period_month,
             v.business_name, v.contact_name, v.phone, v.email, v.business_type,
             u.username AS reviewer_name
      FROM vendor_subscription_payments p
      JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN users u ON u.id = p.reviewed_by
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      sql += ` AND p.status = ?`;
      params.push(status);
    }

    if (vendorId) {
      sql += ` AND p.vendor_id = ?`;
      params.push(vendorId);
    }

    sql += ` ORDER BY FIELD(p.status, 'pending', 'rejected', 'approved'), p.created_at DESC`;

    const [rows] = await db.query(sql, params);

    // Attach modules info for admin display
    for (const r of rows) {
      const calc = await SubscriptionModel.calculateVendorPlanAndPrice(r.vendor_id);
      r.module_count = calc.moduleCount;
      r.module_names = calc.moduleNames;
      r.plan_label = calc.planLabel;
    }

    return rows;
  }

  static async adminGetOverview() {
    await ensureSubscriptionSchema();

    const [[counts]] = await db.query(
      `SELECT
         COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_requests,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_requests,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected_requests,
         COALESCE(SUM(CASE WHEN status = 'approved' AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE()) THEN amount ELSE 0 END), 0) AS total_monthly_revenue,
         COUNT(DISTINCT CASE WHEN status = 'approved' AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE()) THEN vendor_id END) AS total_vendors_paid
       FROM vendor_subscription_payments`
    );

    const [[vendorsAwaiting]] = await db.query(
      `SELECT COUNT(id) AS count FROM vendors
       WHERE subscription_status IN ('pending', 'inactive', 'expired')
          OR subscription_expires_at IS NULL
          OR subscription_expires_at < CURRENT_DATE()`
    );

    return {
      pending_requests: Number(counts?.pending_requests || 0),
      approved_requests: Number(counts?.approved_requests || 0),
      rejected_requests: Number(counts?.rejected_requests || 0),
      total_monthly_revenue: Number(counts?.total_monthly_revenue || 0),
      total_vendors_paid: Number(counts?.total_vendors_paid || 0),
      vendors_awaiting_payment: Number(vendorsAwaiting?.count || 0),
    };
  }

  static async adminApprovePayment({ paymentId, adminUserId, adminNotes }) {
    await ensureSubscriptionSchema();

    const [[payment]] = await db.query(
      `SELECT * FROM vendor_subscription_payments WHERE id = ?`,
      [paymentId]
    );
    if (!payment) {
      const err = new Error('Payment record not found.');
      err.statusCode = 404;
      throw err;
    }

    // Admin cannot approve duplicate payments for the same billing cycle
    if (payment.billing_period) {
      const [approvedDup] = await db.query(
        `SELECT id FROM vendor_subscription_payments 
         WHERE vendor_id = ? AND billing_period = ? AND status = 'approved' AND id != ?`,
        [payment.vendor_id, payment.billing_period, payment.id]
      );
      if (approvedDup && approvedDup.length > 0) {
        const err = new Error('A payment has already been approved for this billing cycle.');
        err.statusCode = 400;
        throw err;
      }
    }

    // Check if this payment corresponds to a module upgrade request
    const [upgradeRows] = await db.query(
      `SELECT * FROM module_upgrade_requests WHERE vendor_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [payment.vendor_id]
    );
    const upgradeReq = upgradeRows[0] || null;

    const now = new Date();
    let baseDate = new Date();

    const [[vendor]] = await db.query(
      `SELECT subscription_expires_at, business_type FROM vendors WHERE id = ?`,
      [payment.vendor_id]
    );

    if (vendor && vendor.subscription_expires_at) {
      const expDate = new Date(vendor.subscription_expires_at);
      if (expDate > now) {
        baseDate = expDate;
      }
    }

    // Add 30 days
    baseDate.setDate(baseDate.getDate() + 30);
    const newExpiresAt = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Update payment record
      await conn.query(
        `UPDATE vendor_subscription_payments
         SET status = 'approved', admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [adminNotes || null, adminUserId || null, paymentId]
      );

      // 2. If module upgrade request, approve module upgrade and grant new business permissions
      if (upgradeReq) {
        await conn.query(
          `UPDATE module_upgrade_requests
           SET status = 'approved', admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [adminNotes || 'Module upgrade approved', adminUserId || null, upgradeReq.id]
        );

        // Add row to vendor_business_types if missing
        await conn.query(
          `INSERT IGNORE INTO vendor_business_types (vendor_id, business_type_id) VALUES (?, ?)`,
          [payment.vendor_id, upgradeReq.requested_business_type_id]
        );

        // Update vendors.business_type string
        let currentBTypes = (vendor?.business_type || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!currentBTypes.includes(upgradeReq.requested_module_name)) {
          currentBTypes.push(upgradeReq.requested_module_name);
        }
        const updatedBTypeStr = currentBTypes.join(', ');

        await conn.query(
          `UPDATE vendors
           SET subscription_status = 'active', subscription_expires_at = ?, subscription_plan = ?, business_type = ?
           WHERE id = ?`,
          [newExpiresAt, upgradeReq.new_plan_name, updatedBTypeStr, payment.vendor_id]
        );

        // Send module activation notification
        await conn.query(
          `INSERT INTO notifications (vendor_id, title, message, type) VALUES (?, ?, ?, ?)`,
          [
            payment.vendor_id,
            'Business Module Activated!',
            `Congratulations! Your requested ${upgradeReq.requested_module_name} business module has been approved and activated.`,
            'module_approved'
          ]
        ).catch(() => {});
      } else {
        // Standard subscription approval
        await conn.query(
          `UPDATE vendors
           SET subscription_status = 'active', subscription_expires_at = ?, subscription_plan = ?
           WHERE id = ?`,
          [newExpiresAt, payment.plan_name, payment.vendor_id]
        );

        await conn.query(
          `INSERT INTO notifications (vendor_id, title, message, type) VALUES (?, ?, ?, ?)`,
          [
            payment.vendor_id,
            'Subscription Payment Approved',
            'Your subscription payment has been approved.',
            'subscription_approved'
          ]
        ).catch(() => {});
      }

      await conn.commit();

      const NotificationModel = require('./notificationModel');
      NotificationModel.createAdminNotification({
        title: 'Settlement Approved',
        message: `Settlement payment #${paymentId} ($${payment.amount}) was approved successfully.`,
        category: 'settlements',
        severity: 'success',
        type: 'settlement_approved',
        relatedId: paymentId,
        targetUrl: '/admin/settlements'
      }).catch(() => {});
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    return {
      payment_id: paymentId,
      status: 'approved',
      subscription_expires_at: newExpiresAt,
    };
  }

  static async adminRejectPayment({ paymentId, adminUserId, reason }) {
    await ensureSubscriptionSchema();

    if (!reason || !reason.trim()) {
      const err = new Error('A rejection reason / admin note is required when rejecting a payment.');
      err.statusCode = 400;
      throw err;
    }

    const [[payment]] = await db.query(
      `SELECT * FROM vendor_subscription_payments WHERE id = ?`,
      [paymentId]
    );
    if (!payment) {
      const err = new Error('Payment record not found.');
      err.statusCode = 404;
      throw err;
    }

    // Check module upgrade request
    const [upgradeRows] = await db.query(
      `SELECT * FROM module_upgrade_requests WHERE vendor_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [payment.vendor_id]
    );
    const upgradeReq = upgradeRows[0] || null;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Update payment record
      await conn.query(
        `UPDATE vendor_subscription_payments
         SET status = 'rejected', admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason.trim(), adminUserId || null, paymentId]
      );

      // 2. Reject module upgrade request if present
      if (upgradeReq) {
        await conn.query(
          `UPDATE module_upgrade_requests
           SET status = 'rejected', admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [reason.trim(), adminUserId || null, upgradeReq.id]
        );
      }

      // 3. Update vendor status to 'inactive' if no active expiration
      await conn.query(
        `UPDATE vendors
         SET subscription_status = 'inactive'
         WHERE id = ? AND (subscription_expires_at IS NULL OR subscription_expires_at < CURRENT_DATE())`,
        [payment.vendor_id]
      );

      // 4. Send notification to vendor
      const notifMsg = upgradeReq
        ? `Payment rejected. Your business modules were not changed. Reason: ${reason.trim()}`
        : `Your subscription payment was rejected. Reason: ${reason.trim()}`;

      await conn.query(
        `INSERT INTO notifications (vendor_id, title, message, type) VALUES (?, ?, ?, ?)`,
        [
          payment.vendor_id,
          'Subscription Payment Rejected',
          notifMsg,
          'subscription_rejected'
        ]
      ).catch(() => {});

      await conn.commit();

      const NotificationModel = require('./notificationModel');
      NotificationModel.createAdminNotification({
        title: 'Settlement Rejected',
        message: `Settlement payment #${paymentId} ($${payment.amount}) was rejected. Reason: ${reason.trim()}`,
        category: 'settlements',
        severity: 'warning',
        type: 'settlement_rejected',
        relatedId: paymentId,
        targetUrl: '/admin/settlements'
      }).catch(() => {});
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    return {
      payment_id: paymentId,
      status: 'rejected',
      reason: reason.trim(),
    };
  }

  static async adminApproveModuleRequest({ requestId, adminUserId, adminNotes }) {
    await ensureSubscriptionSchema();

    const [[request]] = await db.query(
      `SELECT * FROM module_upgrade_requests WHERE id = ?`,
      [requestId]
    );
    if (!request) {
      const err = new Error('Module request not found.');
      err.statusCode = 404;
      throw err;
    }

    if (request.status !== 'pending') {
      const err = new Error(`Request has already been ${request.status}.`);
      err.statusCode = 400;
      throw err;
    }

    // Set status to approved_payment_required
    await db.query(
      `UPDATE module_upgrade_requests
       SET status = 'approved_payment_required', admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [adminNotes || 'Module upgrade approved - payment required', adminUserId || null, requestId]
    );

    // Send notification to vendor
    const notifMsg = `Your request to add ${request.requested_module_name} has been approved. Please pay the module fee of $${Number(request.upgrade_amount_due).toFixed(2)} to activate it.`;
    await db.query(
      `INSERT INTO notifications (vendor_id, title, message, type) VALUES (?, ?, ?, ?)`,
      [
        request.vendor_id,
        'Module Upgrade Approved (Payment Required)',
        notifMsg,
        'module_payment_required'
      ]
    ).catch(() => {});

    return { request_id: requestId, status: 'approved_payment_required' };
  }

  static async vendorSubmitModulePayment({ requestId, vendorId, paymentMethod, evcPhone, referenceNumber, receiptUrl, notes }) {
    await ensureSubscriptionSchema();

    const [[request]] = await db.query(
      `SELECT * FROM module_upgrade_requests WHERE id = ? AND vendor_id = ?`,
      [requestId, vendorId]
    );
    if (!request) {
      const err = new Error('Module request not found.');
      err.statusCode = 404;
      throw err;
    }

    if (request.status !== 'approved_payment_required') {
      const err = new Error(`Cannot submit payment for request in ${request.status} status.`);
      err.statusCode = 400;
      throw err;
    }

    if (!paymentMethod || !paymentMethod.trim()) {
      const err = new Error('Payment method is required.');
      err.statusCode = 400;
      throw err;
    }

    // Validate EVC phone number if EVC Plus is selected
    const resolvedMethod = paymentMethod.trim();
    let resolvedEvcPhone = null;
    if (resolvedMethod === 'EVC Plus') {
      if (!evcPhone || !evcPhone.trim()) {
        const err = new Error('EVC phone number is required when using EVC Plus.');
        err.statusCode = 400;
        throw err;
      }
      const cleanPhone = evcPhone.trim().replace(/\s/g, '');
      if (!/^\d{12}$/.test(cleanPhone)) {
        const err = new Error('EVC phone number must contain exactly 12 digits (e.g. +252613345902).');
        err.statusCode = 400;
        throw err;
      }
      resolvedEvcPhone = cleanPhone;
    }

    if (!referenceNumber || !referenceNumber.trim()) {
      const err = new Error('Transaction reference number is required.');
      err.statusCode = 400;
      throw err;
    }

    // Update request with payment info and set status to payment_pending
    await db.query(
      `UPDATE module_upgrade_requests
       SET status = 'payment_pending', payment_method = ?, evc_phone = ?, reference_number = ?, receipt_url = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        resolvedMethod,
        resolvedEvcPhone,
        referenceNumber.trim(),
        receiptUrl || '',
        notes ? String(notes).trim() : request.notes,
        requestId
      ]
    );

    // Trigger Admin Notification
    const NotificationModel = require('./notificationModel');
    NotificationModel.createAdminNotification({
      title: 'New Module Payment Pending',
      message: `Vendor submitted payment proof for module upgrade (+ ${request.requested_module_name}). Method: ${resolvedMethod}. Reference: ${referenceNumber}.`,
      category: 'settlements',
      severity: 'info',
      type: 'module_payment_submitted',
      relatedId: requestId,
      targetUrl: '/admin/module-requests'
    }).catch(() => {});

    return { request_id: requestId, status: 'payment_pending' };
  }

  static async adminApproveModulePayment({ requestId, adminUserId, adminNotes }) {
    await ensureSubscriptionSchema();

    const [[request]] = await db.query(
      `SELECT * FROM module_upgrade_requests WHERE id = ?`,
      [requestId]
    );
    if (!request) {
      const err = new Error('Module request not found.');
      err.statusCode = 404;
      throw err;
    }

    if (request.status !== 'payment_pending') {
      const err = new Error(`Request has status ${request.status}, expected payment_pending.`);
      err.statusCode = 400;
      throw err;
    }

    const [[vendor]] = await db.query(
      `SELECT business_type FROM vendors WHERE id = ?`,
      [request.vendor_id]
    );

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Update request status to active
      await conn.query(
        `UPDATE module_upgrade_requests
         SET status = 'active', admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [adminNotes || 'Module payment approved and active', adminUserId || null, requestId]
      );

      // 2. Add row to vendor_business_types if missing
      await conn.query(
        `INSERT IGNORE INTO vendor_business_types (vendor_id, business_type_id) VALUES (?, ?)`,
        [request.vendor_id, request.requested_business_type_id]
      );

      // 3. Update vendors.business_type string
      let currentBTypes = (vendor?.business_type || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!currentBTypes.includes(request.requested_module_name)) {
        currentBTypes.push(request.requested_module_name);
      }
      const updatedBTypeStr = currentBTypes.join(', ');

      await conn.query(
        `UPDATE vendors
         SET subscription_plan = ?, business_type = ?
         WHERE id = ?`,
        [request.new_plan_name, updatedBTypeStr, request.vendor_id]
      );

      // 4. Send notification to vendor
      const notifMsg = `Your payment has been approved and the new module ${request.requested_module_name} is now active. Your new monthly subscription will apply from the next billing period.`;
      await conn.query(
        `INSERT INTO notifications (vendor_id, title, message, type) VALUES (?, ?, ?, ?)`,
        [
          request.vendor_id,
          'Business Module Activated!',
          notifMsg,
          'module_approved'
        ]
      ).catch(() => {});

      await conn.commit();

      return { request_id: requestId, status: 'active' };
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  }

  static async adminRejectModulePayment({ requestId, adminUserId, reason }) {
    await ensureSubscriptionSchema();

    if (!reason || !reason.trim()) {
      const err = new Error('A rejection reason / admin note is required.');
      err.statusCode = 400;
      throw err;
    }

    const [[request]] = await db.query(
      `SELECT * FROM module_upgrade_requests WHERE id = ?`,
      [requestId]
    );
    if (!request) {
      const err = new Error('Module request not found.');
      err.statusCode = 404;
      throw err;
    }

    if (request.status !== 'payment_pending') {
      const err = new Error(`Request has status ${request.status}, expected payment_pending.`);
      err.statusCode = 400;
      throw err;
    }

    // Set status to approved_payment_required so they can submit a new payment proof
    await db.query(
      `UPDATE module_upgrade_requests
       SET status = 'approved_payment_required', admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [`Payment Rejected: ${reason.trim()}`, adminUserId || null, requestId]
    );

    // Send notification to vendor
    const notifMsg = `Your module payment proof was rejected: ${reason.trim()}. Please submit a valid payment proof.`;
    await db.query(
      `INSERT INTO notifications (vendor_id, title, message, type) VALUES (?, ?, ?, ?)`,
      [
        request.vendor_id,
        'Module Payment Rejected',
        notifMsg,
        'module_payment_rejected'
      ]
    ).catch(() => {});

    return { request_id: requestId, status: 'approved_payment_required' };
  }

  static async adminRejectModuleRequest({ requestId, adminUserId, reason }) {
    await ensureSubscriptionSchema();

    if (!reason || !reason.trim()) {
      const err = new Error('A rejection reason / admin note is required.');
      err.statusCode = 400;
      throw err;
    }

    const [[request]] = await db.query(
      `SELECT * FROM module_upgrade_requests WHERE id = ?`,
      [requestId]
    );
    if (!request) {
      const err = new Error('Module request not found.');
      err.statusCode = 404;
      throw err;
    }

    if (request.status !== 'pending') {
      const err = new Error(`Request has already been ${request.status}.`);
      err.statusCode = 400;
      throw err;
    }

    // Update request status to rejected
    await db.query(
      `UPDATE module_upgrade_requests
       SET status = 'rejected', admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason.trim(), adminUserId || null, requestId]
    );

    // Send notification to vendor
    const notifMsg = `Your module request was rejected: ${reason.trim()}.`;
    await db.query(
      `INSERT INTO notifications (vendor_id, title, message, type) VALUES (?, ?, ?, ?)`,
      [
        request.vendor_id,
        'Business Module Request Rejected',
        notifMsg,
        'module_rejected'
      ]
    ).catch(() => {});

    return { request_id: requestId, status: 'rejected' };
  }

  static async getVendorModuleRequests(vendorId) {
    await ensureSubscriptionSchema();
    const [rows] = await db.query(
      `SELECT r.*, bt.name AS module_name
       FROM module_upgrade_requests r
       JOIN business_types bt ON bt.id = r.requested_business_type_id
       WHERE r.vendor_id = ?
       ORDER BY r.created_at DESC`,
      [vendorId]
    );
    return rows;
  }

  static async adminListModuleRequests() {
    await ensureSubscriptionSchema();
    const [rows] = await db.query(
      `SELECT r.*, v.business_name, v.contact_name, v.phone, v.email, v.business_type AS current_business_types,
              u.username AS reviewer_name
       FROM module_upgrade_requests r
       JOIN vendors v ON v.id = r.vendor_id
       LEFT JOIN users u ON u.id = r.reviewed_by
       ORDER BY FIELD(r.status, 'pending', 'approved_payment_required', 'payment_pending', 'active', 'rejected'), r.created_at DESC`
    );
    return rows;
  }
}

module.exports = SubscriptionModel;
