const CarWashModel = require('../models/carWashModel');
const VendorModuleStatsModel = require('../models/vendorModuleStatsModel');
const VendorController = require('./vendorController');
const {
  notifyCustomerBookingReceived,
  notifyCustomerStatus,
} = require('../services/carWashNotificationService');

// Resolve the calling vendor's id (JWT is signed with vendors.id; verified in resolveVendorId).
const resolveVendor = (req) => VendorController.resolveVendorId(req);

const fail = (res, err) => {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[CAR WASH]', err.message);
  const body = {
    success: false,
    message: status < 500 ? err.message : 'Car wash request failed.',
  };
  // Field-level validation errors render under the matching inputs.
  if (err.fieldErrors) body.errors = err.fieldErrors;
  res.status(status).json(body);
};

class CarWashController {
  // â”€â”€â”€ Per-module vendor stats (gas / petrol / spare_parts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Lives here alongside the car-wash dashboard so all business-module dashboard
  // data is served from one place.
  static async getModuleStats(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const moduleKey = String(req.query.module || '').trim();
      const data = await VendorModuleStatsModel.getModuleStats(vendorId, moduleKey);
      res.json({ success: true, data });
    } catch (err) { fail(res, err); }
  }

  // â”€â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async getDashboard(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const [stats, charts, recent] = await Promise.all([
        CarWashModel.getDashboardStats(vendorId),
        CarWashModel.getCharts(vendorId),
        CarWashModel.recentBookings(vendorId),
      ]);
      res.json({ success: true, data: { stats, charts, recent_bookings: recent } });
    } catch (err) { fail(res, err); }
  }

  // â”€â”€â”€ Services â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async listServices(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const activeOnly = String(req.query.active || '').toLowerCase() === 'true';
      let services = await CarWashModel.listServices(vendorId);
      if (activeOnly) {
        services = services.filter(
          (s) => String(s.status || 'active') === 'active' && (s.is_available === 1 || s.is_available === true)
        );
      }
      res.json({ success: true, data: services });
    } catch (err) { fail(res, err); }
  }
  static async createService(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      if (!String(req.body.name || '').trim()) {
        return res.status(400).json({ success: false, message: 'Service name is required.' });
      }
      res.status(201).json({ success: true, data: await CarWashModel.createService(vendorId, req.body) });
    } catch (err) { fail(res, err); }
  }
  static async updateService(req, res) {
    try {
      const updated = await CarWashModel.updateService(await resolveVendor(req), req.params.id, req.body);
      if (!updated) return res.status(404).json({ success: false, message: 'Service not found.' });
      res.json({ success: true, data: updated });
    } catch (err) { fail(res, err); }
  }
  static async deleteService(req, res) {
    try {
      const result = await CarWashModel.deleteService(await resolveVendor(req), req.params.id);
      if (result.error === 'not_found') {
        return res.status(404).json({ success: false, message: 'Service not found.' });
      }
      if (result.error === 'in_use') {
        return res.status(409).json({ success: false, message: result.message });
      }
      res.json({
        success: true,
        deactivated: Boolean(result.deactivated),
        message: result.deactivated
          ? 'Service kept for booking history and deactivated instead of deleted.'
          : 'Service deleted.',
      });
    } catch (err) { fail(res, err); }
  }

  // â”€â”€â”€ Add-ons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async listAddons(req, res) {
    try { res.json({ success: true, data: await CarWashModel.listAddons(await resolveVendor(req)) }); }
    catch (err) { fail(res, err); }
  }
  static async createAddon(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      if (!String(req.body.name || '').trim()) {
        return res.status(400).json({ success: false, message: 'Add-on name is required.' });
      }
      res.status(201).json({ success: true, data: await CarWashModel.createAddon(vendorId, req.body) });
    } catch (err) { fail(res, err); }
  }
  static async updateAddon(req, res) {
    try {
      const updated = await CarWashModel.updateAddon(await resolveVendor(req), req.params.id, req.body);
      if (!updated) return res.status(404).json({ success: false, message: 'Add-on not found.' });
      res.json({ success: true, data: updated });
    } catch (err) { fail(res, err); }
  }
  static async deleteAddon(req, res) {
    try {
      const ok = await CarWashModel.deleteAddon(await resolveVendor(req), req.params.id);
      if (!ok) return res.status(404).json({ success: false, message: 'Add-on not found.' });
      res.json({ success: true });
    } catch (err) { fail(res, err); }
  }

  // â”€â”€â”€ Vehicle types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async listVehicleTypes(req, res) {
    try { res.json({ success: true, data: await CarWashModel.listVehicleTypes(await resolveVendor(req)) }); }
    catch (err) { fail(res, err); }
  }
  static async createVehicleType(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      if (!String(req.body.name || '').trim()) {
        return res.status(400).json({ success: false, message: 'Vehicle type name is required.' });
      }
      res.status(201).json({ success: true, data: await CarWashModel.createVehicleType(vendorId, req.body) });
    } catch (err) { fail(res, err); }
  }
  static async updateVehicleType(req, res) {
    try {
      const updated = await CarWashModel.updateVehicleType(await resolveVendor(req), req.params.id, req.body);
      if (!updated) return res.status(404).json({ success: false, message: 'Vehicle type not found.' });
      res.json({ success: true, data: updated });
    } catch (err) { fail(res, err); }
  }
  static async deleteVehicleType(req, res) {
    try {
      const result = await CarWashModel.deleteVehicleType(await resolveVendor(req), req.params.id);
      if (result.error === 'not_found') {
        return res.status(404).json({ success: false, message: 'Vehicle type not found.' });
      }
      if (result.error === 'in_use') {
        return res.status(409).json({ success: false, message: result.message });
      }
      res.json({
        success: true,
        deactivated: Boolean(result.deactivated),
        message: result.deactivated
          ? 'Vehicle type archived (kept for booking history) instead of deleted.'
          : 'Vehicle type deleted.',
      });
    } catch (err) { fail(res, err); }
  }

  // â”€â”€â”€ Workers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async listWorkers(req, res) {
    try {
      const data = await CarWashModel.listWorkers(await resolveVendor(req), {
        includeInactive: String(req.query.includeInactive) === 'true',
      });
      res.json({ success: true, data });
    } catch (err) { fail(res, err); }
  }
  static async createWorker(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      res.status(201).json({ success: true, data: await CarWashModel.createWorker(vendorId, req.body) });
    } catch (err) { fail(res, err); }
  }
  static async updateWorker(req, res) {
    try {
      const password = String(req.body?.password || '').trim();
      if (!password) return res.status(400).json({ success: false, message: 'Password is required.', errors: { password: 'Password is required.' } });
      if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.', errors: { password: 'Password must be at least 6 characters.' } });
      const updated = await CarWashModel.updateWorker(await resolveVendor(req), req.params.id, req.body);
      if (!updated) return res.status(404).json({ success: false, message: 'Worker not found.' });
      res.json({ success: true, data: updated });
    } catch (err) { fail(res, err); }
  }
  static async deleteWorker(req, res) {
    try {
      const result = await CarWashModel.deleteWorker(await resolveVendor(req), req.params.id);
      if (result.error === 'not_found') {
        return res.status(404).json({ success: false, message: 'Worker not found.' });
      }
      if (result.error === 'in_use') {
        return res.status(409).json({ success: false, message: result.message });
      }
      res.json({ success: true, message: 'Worker deactivated and removed from the roster.' });
    } catch (err) { fail(res, err); }
  }

  // Vendor resets a worker's password â†’ returns a one-time temporary password.
  static async resetWorkerPassword(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const result = await CarWashModel.resetWorkerPassword(vendorId, req.params.id);
      if (result.error === 'not_found') {
        return res.status(404).json({ success: false, message: 'Worker not found.' });
      }
      if (result.error === 'no_login') {
        return res.status(400).json({ success: false, message: result.message });
      }
      res.json({
        success: true,
        tempPassword: result.tempPassword,
        message: 'Temporary password generated. The worker must change it on next login.',
      });
    } catch (err) { fail(res, err); }
  }

  // Vendor enables/disables a worker's login access (separate from active status).
  static async setWorkerLoginAccess(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const enabled = req.body?.login_enabled === true || String(req.body?.login_enabled) === 'true';
      const result = await CarWashModel.setWorkerLoginAccess(vendorId, req.params.id, enabled);
      if (result.error === 'not_found') {
        return res.status(404).json({ success: false, message: 'Worker not found.' });
      }
      res.json({
        success: true,
        login_enabled: result.login_enabled,
        message: enabled ? 'Login access enabled.' : 'Login access disabled.',
      });
    } catch (err) { fail(res, err); }
  }

  // â”€â”€â”€ Bookings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  static async listBookings(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const data = await CarWashModel.listBookings(vendorId, {
        status: req.query.status, date: req.query.date, search: req.query.search,
      });
      res.json({ success: true, data });
    } catch (err) { fail(res, err); }
  }

  // Single booking detail â€” vendor-scoped (another vendor's ID returns 404).
  static async getBookingDetail(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const bookingId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(bookingId) || bookingId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
      }
      // Re-use listBookings with an id filter so addons & history are loaded.
      // The vendor_id = vendorId clause inside CarWashModel.listBookings ensures
      // no cross-vendor leakage.
      const all = await CarWashModel.listBookings(vendorId, {});
      const booking = all.find((b) => String(b.id) === String(bookingId));
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }
      res.json({ success: true, data: booking });
    } catch (err) { fail(res, err); }
  }

  static async createBooking(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      if (!String(req.body.customer_name || '').trim() && !req.body.customer_id) {
        return res.status(400).json({ success: false, message: 'Customer name is required.' });
      }
      const booking = await CarWashModel.createBooking(vendorId, req.body);
      await notifyCustomerBookingReceived(req.app.get('io'), booking);
      res.status(201).json({ success: true, data: booking });
    } catch (err) { fail(res, err); }
  }
  static async updateBookingStatus(req, res) {
    try {
      const vendorId = await resolveVendor(req);
      const nextStatus = String(req.body.status || '').trim();
      const vendorStatuses = new Set([
        'confirmed', 'worker_assigned', 'washing', 'ready', 'completed', 'cancelled', 'rejected',
      ]);
      if (!vendorStatuses.has(nextStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid car wash booking status.' });
      }
      const result = await CarWashModel.transitionBooking(vendorId, req.params.id, nextStatus, {
        workerId: req.body.worker_id,
        reason: req.body.reason,
        actorId: vendorId,
      });
      if (result.error === 'not_found') {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }
      if (result.error === 'illegal_transition') {
        return res.status(409).json({
          success: false,
          message: `Cannot change a "${result.from}" booking to "${result.to}".`,
        });
      }
      if (result.error) {
        return res.status(409).json({ success: false, message: result.message || 'Booking could not be updated.' });
      }
      await notifyCustomerStatus(req.app.get('io'), result.booking);
      res.json({ success: true, data: result.booking });
    } catch (err) { fail(res, err); }
  }

  static async uploadWorkerPhoto(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
      }
      const photoPath = `/uploads/vendor-logos/${req.file.filename}`;
      res.json({ success: true, photoPath });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to upload photo.' });
    }
  }
}

module.exports = CarWashController;
