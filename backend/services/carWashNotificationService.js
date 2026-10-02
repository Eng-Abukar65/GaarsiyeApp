const db = require('../config/db');
const NotificationModel = require('../models/notificationModel');

const STATUS_NOTIFICATIONS = {
  confirmed: {
    title: 'Car wash booking confirmed',
    message: 'Your booking has been confirmed.',
    type: 'car_wash_booking_confirmed',
  },
  worker_assigned: {
    title: 'Worker assigned',
    message: 'A worker has been assigned to your car wash booking.',
    type: 'car_wash_worker_assigned',
  },
  washing: {
    title: 'Car wash started',
    message: 'Your car wash has started.',
    type: 'car_wash_washing_started',
  },
  ready: {
    title: 'Your vehicle is ready',
    message: 'Your vehicle is ready.',
    type: 'car_wash_vehicle_ready',
  },
  completed: {
    title: 'Car wash completed',
    message: 'Your Car service has been completed.',
    type: 'car_wash_booking_completed',
  },
  cancelled: {
    title: 'Car wash booking cancelled',
    message: 'Your booking has been cancelled.',
    type: 'car_wash_booking_cancelled',
  },
  rejected: {
    title: 'Car wash booking rejected',
    message: 'The vendor could not accept your booking.',
    type: 'car_wash_booking_rejected',
  },
  payment_failed: {
    title: 'Car wash payment failed',
    message: 'Payment failed. Please retry your payment to continue the booking.',
    type: 'car_wash_payment_failed',
  },
};

const referenceOf = (booking) => booking.booking_reference || booking.booking_code;

const bookingUpdatePayload = (booking) => ({
  booking_id: Number(booking.id),
  booking_reference: referenceOf(booking),
  status: booking.status,
  payment_status: booking.payment_status,
  worker_id: booking.worker_id || null,
  worker_name: booking.worker_name || null,
  confirmed_at: booking.confirmed_at || null,
  worker_assigned_at: booking.worker_assigned_at || null,
  started_at: booking.started_at || null,
  ready_at: booking.ready_at || null,
  completed_at: booking.completed_at || null,
  cancelled_at: booking.cancelled_at || null,
  rejected_at: booking.rejected_at || null,
  payment_failed_at: booking.payment_failed_at || null,
  updated_at: booking.updated_at || new Date().toISOString(),
});

async function emitBookingUpdate(io, booking) {
  if (!io || !booking?.customer_id) return;
  io.to(`customer-${booking.customer_id}`).emit(
    'car-wash-booking-updated',
    bookingUpdatePayload(booking)
  );
}

async function createCustomerNotification(io, booking, notification, messageOverride = null) {
  if (!booking?.customer_id) {
    await emitBookingUpdate(io, booking);
    return;
  }
  try {
    const reference = referenceOf(booking);
    await NotificationModel.createAndSendCustomerNotification({
      customerId: booking.customer_id,
      vendorId: booking.vendor_id,
      carWashBookingId: booking.id,
      title: notification.title,
      message: `${messageOverride || notification.message} Booking Reference: ${reference}.`,
      type: notification.type,
      io,
    });
  } catch (error) {
    // Booking state must never roll back because an optional notification channel
    // is unavailable. Database/socket/push failures are logged for diagnostics.
    console.error('[CAR WASH NOTIFICATION] Customer notification failed:', error.message);
  }
  await emitBookingUpdate(io, booking);
}

async function notifyCustomerBookingReceived(io, booking) {
  return createCustomerNotification(io, booking, {
    title: 'Car wash booking received',
    message: 'Your booking has been received.',
    type: 'car_wash_booking_received',
  });
}

async function notifyCustomerStatus(io, booking) {
  const notification = STATUS_NOTIFICATIONS[booking?.status];
  if (!notification) return emitBookingUpdate(io, booking);
  let message = notification.message;
  if (booking.status === 'worker_assigned' && booking.worker_name) {
    message = `${booking.worker_name} has been assigned to your car wash booking.`;
  }
  if ((booking.status === 'cancelled' || booking.status === 'rejected') && booking.status_reason) {
    message = `${message} Reason: ${booking.status_reason}`;
  }
  return createCustomerNotification(io, booking, notification, message);
}

async function notifyCustomerPaymentSuccess(io, booking) {
  return createCustomerNotification(io, booking, {
    title: 'Car wash payment confirmed',
    message: 'Your payment was successful. The booking is waiting for vendor confirmation.',
    type: 'payment_success',
  });
}

async function notifyVendor(io, booking, { title, message, type }) {
  try {
    await db.query(
      `INSERT INTO vendor_notifications (vendor_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [booking.vendor_id, title, message, type]
    );
    if (io) {
      io.to(`vendor-${booking.vendor_id}`).emit('car-wash-booking-updated', {
        ...bookingUpdatePayload(booking),
        vendor_id: Number(booking.vendor_id),
      });
    }
  } catch (error) {
    console.error('[CAR WASH NOTIFICATION] Vendor notification failed:', error.message);
  }
}

async function notifyVendorOfBooking(io, booking) {
  const reference = referenceOf(booking);
  return notifyVendor(io, booking, {
    title: 'New car wash booking',
    message: `${reference}: ${booking.service_name || 'Car wash'} on ${booking.scheduled_date || 'the selected date'} at ${booking.scheduled_time || 'the selected time'}.`,
    type: 'car_wash_booking',
  });
}

async function notifyVendorOfCustomerCancellation(io, booking) {
  return notifyVendor(io, booking, {
    title: 'Car wash booking cancelled',
    message: `${referenceOf(booking)} was cancelled by the customer.`,
    type: 'car_wash_booking_cancelled',
  });
}

module.exports = {
  STATUS_NOTIFICATIONS,
  bookingUpdatePayload,
  emitBookingUpdate,
  notifyCustomerBookingReceived,
  notifyCustomerStatus,
  notifyCustomerPaymentSuccess,
  notifyVendorOfBooking,
  notifyVendorOfCustomerCancellation,
};
