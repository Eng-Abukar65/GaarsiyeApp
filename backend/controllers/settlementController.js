const SettlementModel = require('../models/settlementModel');
const VendorController = require('./vendorController');

// Resolve the acting vendor from the token (never from the request body, so a
// vendor can never submit or read a settlement for another vendor).
const resolveVendor = async (req) => {
  if (typeof VendorController.resolveVendorId === 'function') {
    return VendorController.resolveVendorId(req);
  }
  const id = req.user?.vendor_id || req.user?.id;
  if (!id) throw Object.assign(new Error('Vendor not resolved.'), { statusCode: 401 });
  return id;
};

const fail = (res, err) => {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[SETTLEMENT]', err);
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : 'Settlement request failed.',
  });
};

const modelFail = (res, result) => {
  const map = { not_found: 404, illegal_transition: 409, nothing_to_settle: 400,
    invalid_selection: 400, amount_mismatch: 400 };
  return res.status(map[result.error] || 400).json({
    success: false, code: result.error, message: result.message, ...(result.expected ? { expected: result.expected } : {}),
  });
};

class SettlementController {
  // ─── Vendor side ───────────────────────────────────────────────────────────
  static async getMyBalance(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const [balance, unsettled] = await Promise.all([
        SettlementModel.getVendorBalance(vendorId),
        SettlementModel.listUnsettled(vendorId),
      ]);
      res.json({ success: true, data: { ...balance, unsettled_items: unsettled } });
    } catch (err) { fail(res, err); }
  }

  static async listMySettlements(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const data = await SettlementModel.listSettlements({ vendorId, status: req.query.status });
      res.json({ success: true, data });
    } catch (err) { fail(res, err); }
  }

  static async getMySettlement(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const settlement = await SettlementModel.getSettlement(req.params.id, vendorId);
      if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found.' });
      res.json({ success: true, data: settlement });
    } catch (err) { fail(res, err); }
  }

  static async submitSettlement(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const result = await SettlementModel.createSettlement(vendorId, req.body, {
        id: vendorId,
        name: req.user?.business_name || req.user?.username || null,
      });
      if (result.error) return modelFail(res, result);
      res.status(201).json({ success: true, data: result.settlement });
    } catch (err) { fail(res, err); }
  }

  static async cancelMySettlement(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      // Ownership check before any state change.
      const owned = await SettlementModel.getSettlement(req.params.id, vendorId);
      if (!owned) return res.status(404).json({ success: false, message: 'Settlement not found.' });

      const result = await SettlementModel.rejectSettlement(req.params.id,
        { id: vendorId, name: req.user?.username || null },
        { reason: req.body?.reason || 'Cancelled by vendor.', cancelledByVendor: true });
      if (result.error) return modelFail(res, result);
      res.json({ success: true, data: result.settlement });
    } catch (err) { fail(res, err); }
  }

  // ─── Admin side ────────────────────────────────────────────────────────────
  static async adminOverview(req, res) {
    try {
      res.json({ success: true, data: await SettlementModel.adminOverview() });
    } catch (err) { fail(res, err); }
  }

  static async adminList(req, res) {
    try {
      const data = await SettlementModel.listSettlements({
        vendorId: req.query.vendor_id || null,
        status: req.query.status || null,
      });
      res.json({ success: true, data });
    } catch (err) { fail(res, err); }
  }

  static async adminGet(req, res) {
    try {
      const settlement = await SettlementModel.getSettlement(req.params.id);
      if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found.' });
      res.json({ success: true, data: settlement });
    } catch (err) { fail(res, err); }
  }

  static async adminConfirm(req, res) {
    try {
      const result = await SettlementModel.confirmSettlement(req.params.id,
        { id: req.user?.id, name: req.user?.username || req.user?.email || 'Admin' },
        req.body);
      if (result.error) return modelFail(res, result);
      res.json({ success: true, data: result.settlement, message: 'Settlement confirmed and marked paid.' });
    } catch (err) { fail(res, err); }
  }

  static async adminReject(req, res) {
    try {
      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 3) {
        return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
      }
      const result = await SettlementModel.rejectSettlement(req.params.id,
        { id: req.user?.id, name: req.user?.username || 'Admin' }, { reason });
      if (result.error) return modelFail(res, result);
      res.json({ success: true, data: result.settlement, message: 'Settlement rejected; the balance was returned to the vendor.' });
    } catch (err) { fail(res, err); }
  }
}

module.exports = SettlementController;
