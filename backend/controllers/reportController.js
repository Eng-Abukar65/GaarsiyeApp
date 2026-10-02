const ReportEngineModel = require('../models/reportEngineModel');
const AdminReportEngineModel = require('../models/adminReportEngineModel');
const VendorController = require('./vendorController');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const parseRange = (query) => {
  const from = String(query.from || '').trim();
  const to = String(query.to || '').trim();
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    const err = new Error('A valid from/to date range (YYYY-MM-DD) is required.');
    err.statusCode = 400;
    throw err;
  }
  if (from > to) {
    const err = new Error('The start date must be on or before the end date.');
    err.statusCode = 400;
    throw err;
  }
  return { from, to };
};

const fail = (res, err) => {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[REPORTS]', err.message);
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : 'Failed to generate the report.',
  });
};

class ReportController {
  static async listTypes(req, res) {
    res.json({ success: true, data: ReportEngineModel.REPORT_TYPES });
  }

  // Vendor: scoped to their own business
  static async vendorGenerate(req, res) {
    try {
      const vendorId = await VendorController.resolveVendorId(req);
      const { from, to } = parseRange(req.query);
      const data = await ReportEngineModel.generate({
        vendorId,
        type: String(req.query.type || '').trim(),
        from,
        to,
        moduleKey: String(req.query.module || 'all').trim(),
      });
      res.json({ success: true, data });
    } catch (err) { fail(res, err); }
  }

  // Admin: platform-wide reports across all vendors, users, modules, and admin filters
  static async adminGenerate(req, res) {
    try {
      const { from, to } = parseRange(req.query);
      const vendorId = req.query.vendorId ? Number.parseInt(req.query.vendorId, 10) : null;
      const customerId = req.query.customerId ? Number.parseInt(req.query.customerId, 10) : null;
      const driverId = req.query.driverId ? Number.parseInt(req.query.driverId, 10) : null;
      const workerId = req.query.workerId ? Number.parseInt(req.query.workerId, 10) : null;

      const data = await AdminReportEngineModel.generate({
        type: String(req.query.type || 'platform_summary').trim(),
        from,
        to,
        vendorId,
        customerId,
        driverId,
        workerId,
        orderStatus: req.query.orderStatus ? String(req.query.orderStatus).trim() : null,
        bookingStatus: req.query.bookingStatus ? String(req.query.bookingStatus).trim() : null,
        subscriptionStatus: req.query.subscriptionStatus ? String(req.query.subscriptionStatus).trim() : null,
        zone: req.query.zone ? String(req.query.zone).trim() : null,
      });

      res.json({ success: true, data });
    } catch (err) { fail(res, err); }
  }
}

module.exports = ReportController;
