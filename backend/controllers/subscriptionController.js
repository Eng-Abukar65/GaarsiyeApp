const path = require('path');
const SubscriptionModel = require('../models/subscriptionModel');
const VendorController = require('./vendorController');
const { secureUpload } = require('../utils/uploadSecurity');

const receiptUploader = secureUpload({
  destination: path.join(__dirname, '../uploads/receipts'),
  prefix: 'receipt',
  allowed: ['jpg', 'png', 'pdf'],
  maxBytes: 10 * 1024 * 1024,
});

class SubscriptionController {
  static get uploadMiddleware() {
    return receiptUploader.single('receipt');
  }

  // Vendor: get vendor business modules & upgrade status
  static async getVendorModules(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const data = await SubscriptionModel.getVendorModules(vendorId);
      res.json({ success: true, data });
    } catch (err) {
      console.error('[GET VENDOR MODULES ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Could not fetch vendor business modules.',
      });
    }
  }

  // Vendor: submit request to add a new business module
  static async requestUpgrade(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);

      const { business_type_id, payment_method, reference_number, notes } = req.body;

      if (!business_type_id) {
        return res.status(400).json({
          success: false,
          message: 'Target business module ID is required.',
        });
      }

      let receiptUrl = '';
      if (req.file) {
        receiptUrl = `/uploads/receipts/${req.file.filename}`;
      }

      const data = await SubscriptionModel.requestModuleUpgrade({
        vendorId,
        businessTypeId: Number.parseInt(business_type_id, 10),
        paymentMethod: payment_method ? String(payment_method).trim() : 'EVC Plus',
        referenceNumber: reference_number ? String(reference_number).trim() : 'N/A',
        receiptUrl,
        notes: notes ? String(notes).trim() : null,
      });

      res.status(201).json({
        success: true,
        message: 'Business module upgrade request submitted. Awaiting admin review.',
        data,
      });
    } catch (err) {
      console.error('[REQUEST MODULE UPGRADE ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to submit module upgrade request.',
      });
    }
  }

  // Vendor: get current status & active position
  static async getStatus(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const data = await SubscriptionModel.getVendorStatus(vendorId);
      res.json({ success: true, data });
    } catch (err) {
      console.error('[SUBSCRIPTION STATUS ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Could not fetch subscription status.',
      });
    }
  }

  // Vendor: submit subscription payment
  static async submitPayment(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'An uploaded payment receipt file (JPG, JPEG, PNG, or PDF) is required.',
        });
      }

      const { plan_name, amount, payment_method, reference_number, notes } = req.body;

      if (!payment_method || !String(payment_method).trim()) {
        return res.status(400).json({ success: false, message: 'Payment method is required.' });
      }

      if (!reference_number || !String(reference_number).trim()) {
        return res.status(400).json({ success: false, message: 'Transaction reference number is required.' });
      }

      const receiptUrl = `/uploads/receipts/${req.file.filename}`;

      const paymentId = await SubscriptionModel.submitPayment({
        vendorId,
        planName: String(plan_name || 'Standard').trim(),
        amount: Number.parseFloat(amount) || 50.00,
        paymentMethod: String(payment_method).trim(),
        referenceNumber: String(reference_number).trim(),
        receiptUrl,
        notes: notes ? String(notes).trim() : null,
      });

      res.status(201).json({
        success: true,
        message: 'Payment submitted successfully. Awaiting admin review.',
        data: { payment_id: paymentId, status: 'pending', receipt_url: receiptUrl },
      });
    } catch (err) {
      console.error('[SUBSCRIPTION SUBMIT ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to submit payment.',
      });
    }
  }

  // Vendor: get payment history list
  static async getHistory(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const data = await SubscriptionModel.getVendorHistory(vendorId);
      res.json({ success: true, data });
    } catch (err) {
      console.error('[SUBSCRIPTION HISTORY ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Could not fetch payment history.',
      });
    }
  }

  // Admin: list all subscription payments
  static async adminList(req, res) {
    try {
      const status = req.query.status || 'all';
      const vendorId = req.query.vendorId ? Number.parseInt(req.query.vendorId, 10) : null;
      const data = await SubscriptionModel.adminListPayments({ status, vendorId });
      res.json({ success: true, data });
    } catch (err) {
      console.error('[ADMIN SUBSCRIPTION LIST ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to fetch subscription payments.',
      });
    }
  }

  // Admin: get overall metrics overview
  static async adminOverview(req, res) {
    try {
      const data = await SubscriptionModel.adminGetOverview();
      res.json({ success: true, data });
    } catch (err) {
      console.error('[ADMIN SUBSCRIPTION OVERVIEW ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to fetch subscription overview.',
      });
    }
  }

  // Admin: approve payment
  static async adminApprove(req, res) {
    try {
      const paymentId = Number.parseInt(req.params.id, 10);
      const adminUserId = req.user?.id || null;
      const { admin_notes } = req.body;

      const data = await SubscriptionModel.adminApprovePayment({
        paymentId,
        adminUserId,
        adminNotes: admin_notes ? String(admin_notes).trim() : null,
      });

      res.json({
        success: true,
        message: 'Subscription payment approved successfully.',
        data,
      });
    } catch (err) {
      console.error('[ADMIN APPROVE PAYMENT ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to approve payment.',
      });
    }
  }

  // Admin: reject payment
  static async adminReject(req, res) {
    try {
      const paymentId = Number.parseInt(req.params.id, 10);
      const adminUserId = req.user?.id || null;
      const { reason } = req.body;

      const data = await SubscriptionModel.adminRejectPayment({
        paymentId,
        adminUserId,
        reason: reason ? String(reason).trim() : '',
      });

      res.json({
        success: true,
        message: 'Subscription payment rejected.',
        data,
      });
    } catch (err) {
      console.error('[ADMIN REJECT PAYMENT ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to reject payment.',
      });
    }
  }

  // Admin: get subscription pricing plans & audit history
  static async getPricing(req, res) {
    try {
      const data = await SubscriptionModel.getAllPricing();
      res.json({ success: true, data });
    } catch (err) {
      console.error('[ADMIN GET PRICING ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to fetch subscription pricing plans.',
      });
    }
  }

  // Admin: update subscription pricing plan
  static async updatePricing(req, res) {
    try {
      const planId = Number.parseInt(req.params.id, 10);
      const userId = req.user?.id || null;
      const userName = req.user?.username || req.user?.name || 'Admin';

      const { price, status, plan_name, module_description } = req.body;

      const data = await SubscriptionModel.updatePricing({
        planId,
        price,
        status,
        planName: plan_name,
        moduleDescription: module_description,
        userId,
        userName
      });

      res.json({
        success: true,
        message: 'Subscription pricing plan updated successfully.',
        data
      });
    } catch (err) {
      console.error('[ADMIN UPDATE PRICING ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to update subscription pricing.',
      });
    }
  }

  // Admin: get pricing history log
  static async getPricingHistory(req, res) {
    try {
      const data = await SubscriptionModel.getPricingHistory();
      res.json({ success: true, data });
    } catch (err) {
      console.error('[ADMIN GET PRICING HISTORY ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to fetch pricing audit history.',
      });
    }
  }

  // Vendor: submit a new module upgrade request (no payment required)
  static async submitModuleRequest(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const { business_type_id, notes } = req.body;

      if (!business_type_id) {
        return res.status(400).json({
          success: false,
          message: 'Target business module ID is required.',
        });
      }

      const data = await SubscriptionModel.requestModuleUpgrade({
        vendorId,
        businessTypeId: Number.parseInt(business_type_id, 10),
        notes: notes ? String(notes).trim() : null
      });

      res.status(201).json({
        success: true,
        message: 'Your request has been sent to Admin for approval.',
        data
      });
    } catch (err) {
      console.error('[SUBMIT MODULE REQUEST ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to submit module request.',
      });
    }
  }

  // Vendor: list own module upgrade requests
  static async listVendorRequests(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const data = await SubscriptionModel.getVendorModuleRequests(vendorId);
      res.json({ success: true, data });
    } catch (err) {
      console.error('[LIST VENDOR REQUESTS ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to fetch module requests.',
      });
    }
  }

  // Admin: list all business module requests
  static async adminListModuleRequests(req, res) {
    try {
      const data = await SubscriptionModel.adminListModuleRequests();
      res.json({ success: true, data });
    } catch (err) {
      console.error('[ADMIN LIST MODULE REQUESTS ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to fetch module requests.',
      });
    }
  }

  // Admin: approve module request
  static async adminApproveModule(req, res) {
    try {
      const requestId = Number.parseInt(req.params.id, 10);
      const adminUserId = req.user?.id || null;
      const { admin_notes } = req.body;

      const data = await SubscriptionModel.adminApproveModuleRequest({
        requestId,
        adminUserId,
        adminNotes: admin_notes ? String(admin_notes).trim() : null
      });

      res.json({
        success: true,
        message: 'Business module request approved successfully.',
        data
      });
    } catch (err) {
      console.error('[ADMIN APPROVE MODULE REQUEST ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to approve module request.',
      });
    }
  }

  // Admin: reject module request
  static async adminRejectModule(req, res) {
    try {
      const requestId = Number.parseInt(req.params.id, 10);
      const adminUserId = req.user?.id || null;
      const { reason } = req.body;

      const data = await SubscriptionModel.adminRejectModuleRequest({
        requestId,
        adminUserId,
        reason: reason ? String(reason).trim() : null
      });

      res.json({
        success: true,
        message: 'Business module request rejected.',
        data
      });
    } catch (err) {
      console.error('[ADMIN REJECT MODULE REQUEST ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to reject module request.',
      });
    }
  }

  // Vendor: submit payment for approved module request
  static async submitModulePayment(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const requestId = Number.parseInt(req.params.id, 10);
      const { payment_method, evc_phone, reference_number, notes } = req.body;

      let receiptUrl = '';
      if (req.file) {
        receiptUrl = `/uploads/receipts/${req.file.filename}`;
      }

      const data = await SubscriptionModel.vendorSubmitModulePayment({
        requestId,
        vendorId,
        paymentMethod: payment_method,
        evcPhone: evc_phone ? String(evc_phone).trim() : null,
        referenceNumber: reference_number,
        receiptUrl,
        notes: notes ? String(notes).trim() : null
      });

      res.json({
        success: true,
        message: 'Payment submitted successfully. Awaiting Admin verification.',
        data
      });
    } catch (err) {
      console.error('[VENDOR MODULE PAYMENT SUBMIT ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to submit module payment.',
      });
    }
  }

  // Admin: approve module request payment (activates module)
  static async adminApproveModulePayment(req, res) {
    try {
      const requestId = Number.parseInt(req.params.id, 10);
      const adminUserId = req.user?.id || null;
      const { admin_notes } = req.body;

      const data = await SubscriptionModel.adminApproveModulePayment({
        requestId,
        adminUserId,
        adminNotes: admin_notes ? String(admin_notes).trim() : null
      });

      res.json({
        success: true,
        message: 'Your payment has been approved and the new module is now active.',
        data
      });
    } catch (err) {
      console.error('[ADMIN APPROVE MODULE PAYMENT ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to approve module payment.',
      });
    }
  }

  // Admin: reject module request payment
  static async adminRejectModulePayment(req, res) {
    try {
      const requestId = Number.parseInt(req.params.id, 10);
      const adminUserId = req.user?.id || null;
      const { reason } = req.body;

      const data = await SubscriptionModel.adminRejectModulePayment({
        requestId,
        adminUserId,
        reason: reason ? String(reason).trim() : null
      });

      res.json({
        success: true,
        message: 'Module payment rejected.',
        data
      });
    } catch (err) {
      console.error('[ADMIN REJECT MODULE PAYMENT ERROR]', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to reject module payment.',
      });
    }
  }
}

module.exports = SubscriptionController;
