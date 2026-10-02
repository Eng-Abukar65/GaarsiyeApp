const db = require('../config/db');
const crypto = require('crypto');
const CustomerModel = require('../models/customerModel');
const NotificationModel = require('../models/notificationModel');
const WaafiService = require('../services/waafiService');
const { maskSensitiveValue, redactSensitiveData } = require('../utils/sensitiveLog');

class PaymentController {

  static async createPaymentRequest(req, res) {
    const {
      vendor_id,
      delivery_address,
      payment_method,
      items,
      delivery_fee = 0,
      offer_id = null,
      delivery_latitude,
      delivery_longitude,
      latitude,
      longitude,
      delivery_phone,
      delivery_addresses,
      payment_phone,
      checkout_request_id
    } = req.body;

    console.log(`[PAYMENT CREATE] Request: customer_user_id=${req.user.id}, phone=${maskSensitiveValue(payment_phone)}, amount_input_fee=${delivery_fee}`);

    // --- INPUT GUARDS ---
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order must contain at least one item.' });
    }

    if (!payment_method || String(payment_method).trim() === '') {
      return res.status(400).json({ success: false, message: 'Please select a payment method.' });
    }

    try {
      await CustomerModel.ensureOfferSupportSchema();
      const customer = await CustomerModel.getCustomerIdByUserId(req.user.id);
      const io = req.app.get('io');

      const destinations = Array.isArray(delivery_addresses) && delivery_addresses.length > 0
        ? delivery_addresses
        : [{
            address_line: delivery_address,
            phone: delivery_phone,
            latitude: delivery_latitude ?? latitude,
            longitude: delivery_longitude ?? longitude
          }];

      const [customerUsers] = await db.query(
        'SELECT u.phone FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?',
        [customer.id]
      );
      const fallbackPhone = customerUsers[0]?.phone || '';
      
      if (destinations.some((destination) => !String(destination.address_line || '').trim())) {
        return res.status(400).json({ success: false, message: 'Every delivery point requires an address.' });
      }
      destinations.forEach((destination) => {
        destination.phone = String(destination.phone || fallbackPhone).trim();
      });
      if (destinations.some((destination) => !destination.phone)) {
        return res.status(400).json({ success: false, message: 'Every delivery point requires a phone number.' });
      }

      let resolvedVendorId = Number.parseInt(vendor_id, 10);
      const productIdsForVendorLookup = items
        .map((item) => Number.parseInt(item.product_id, 10))
        .filter((id) => Number.isInteger(id) && id > 0);

      let [vendorRows] = await db.query('SELECT latitude, longitude FROM vendors WHERE id = ?', [resolvedVendorId]);
      if (vendorRows.length === 0) {
        const [productVendorRows] = productIdsForVendorLookup.length > 0
          ? await db.query(
              `SELECT DISTINCT vendor_id FROM products WHERE id IN (${productIdsForVendorLookup.map(() => '?').join(',')})`,
              productIdsForVendorLookup
            )
          : [[]];

        if (productVendorRows.length === 1) {
          resolvedVendorId = Number(productVendorRows[0].vendor_id);
          [vendorRows] = await db.query('SELECT latitude, longitude FROM vendors WHERE id = ?', [resolvedVendorId]);
        }
      }

      if (vendorRows.length === 0) {
        return res.status(409).json({
          success: false,
          code: 'STALE_ORDER_DATA',
          message: 'This product or vendor is no longer available.',
        });
      }

      const vendorLat = Number(vendorRows[0].latitude);
      const vendorLng = Number(vendorRows[0].longitude);
      let routeDistanceKm = 0;
      let previousLat = vendorLat;
      let previousLng = vendorLng;
      let hasCompleteRouteCoordinates = Number.isFinite(vendorLat) && Number.isFinite(vendorLng);
      for (const destination of destinations) {
        const nextLat = Number(destination.latitude);
        const nextLng = Number(destination.longitude);
        if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
          hasCompleteRouteCoordinates = false;
          continue;
        }
        const leg = CustomerModel.haversineDistanceKm(previousLat, previousLng, nextLat, nextLng);
        if (leg !== null) routeDistanceKm += leg;
        previousLat = nextLat;
        previousLng = nextLng;
      }

      const baseFee = Number(process.env.DELIVERY_BASE_FEE || 2);
      const perKmFee = Number(process.env.DELIVERY_PER_KM_FEE || 0.5);
      const automaticDeliveryFee = Number((baseFee + routeDistanceKm * perKmFee).toFixed(2));
      const requestedDeliveryFee = Number(delivery_fee);
      const clientDeliveryFee = (delivery_fee !== undefined && delivery_fee !== null && delivery_fee !== '' && Number.isFinite(requestedDeliveryFee))
        ? Number(requestedDeliveryFee.toFixed(2))
        : null;

      // --- RE-FETCH EVERY PRODUCT FROM DB; NEVER TRUST FRONTEND PRICES ---
      // Validate the item shapes first, then load every product in a single batched query
      // (avoids one round-trip per item).
      const validatedItems = [];
      const normalizedItems = [];
      for (const item of items) {
        const productId = item.product_id;
        const requestedQty = parseInt(item.quantity, 10);

        if (!productId || isNaN(requestedQty) || requestedQty <= 0) {
          return res.status(400).json({ success: false, message: 'Invalid order item.' });
        }
        normalizedItems.push({ productId, requestedQty });
      }

      const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
      const [productRows] = await db.query(
        `SELECT p.id, p.name, p.selling_price, p.is_active,
                COALESCE(i.stock, p.stock_quantity) AS available_stock
         FROM products p
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.id IN (${productIds.map(() => '?').join(',')})`,
        productIds
      );
      const productById = new Map(productRows.map((row) => [Number(row.id), row]));

      for (const { productId, requestedQty } of normalizedItems) {
        const product = productById.get(Number(productId));

        if (!product || !product.is_active) {
          return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
        }

        const dbPrice = parseFloat(product.selling_price);
        if (isNaN(dbPrice) || dbPrice <= 0) {
          return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
        }

        const dbStock = parseInt(product.available_stock, 10) || 0;
        if (dbStock <= 0 || requestedQty > dbStock) {
          return res.status(400).json({ success: false, message: 'Insufficient stock for one or more items.' });
        }

        validatedItems.push({
          product_id: productId,
          quantity: requestedQty,
          price: dbPrice,
          original_price: dbPrice
        });
      }

      // --- CALCULATE TOTALS SERVER-SIDE ---
      const subtotal = validatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const fee = clientDeliveryFee !== null ? clientDeliveryFee : (hasCompleteRouteCoordinates ? automaticDeliveryFee : 0);

      if (subtotal <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
      }

      const selectedOfferId = Number.parseInt(offer_id, 10);
      let selectedOffer = null;
      let applicableOffers = [];

      if (Number.isInteger(selectedOfferId) && selectedOfferId > 0) {
        selectedOffer = await CustomerModel.getActiveOfferById(selectedOfferId, resolvedVendorId);
        if (!selectedOffer) {
          return res.status(400).json({ success: false, message: 'Offer is no longer available.' });
        }
        applicableOffers = [selectedOffer];
      } else {
        const activeOffersData = await CustomerModel.getActiveOffers(resolvedVendorId);
        applicableOffers = activeOffersData.offers;
      }

      const { discountAmount, effectiveDeliveryFee, offerDescription } = CustomerModel.calculateOfferDiscount(applicableOffers, validatedItems, fee);

      // --- APPLY PER-ITEM DISCOUNTS ---
      const enrichedItems = validatedItems.map((item) => {
        const origPrice = item.original_price;
        let itemDiscount = 0;
        let finalPrice = origPrice;

        for (const offer of applicableOffers) {
          if (offer.offer_type === 'free_delivery') continue;

          const scopedProductId = offer.product_id != null ? Number(offer.product_id) : null;
          if (Number.isInteger(scopedProductId) && scopedProductId > 0 && scopedProductId !== Number(item.product_id)) {
            continue;
          }

          if (offer.offer_type === 'product_specific' && !scopedProductId) {
            continue;
          }

          if (offer.offer_type === 'percentage' || offer.offer_type === 'product_specific') {
            const candidateDiscount = Number((origPrice * (Number(offer.discount_value) / 100)).toFixed(2));
            if (candidateDiscount > itemDiscount) {
              itemDiscount = candidateDiscount;
              finalPrice = Number((origPrice - itemDiscount).toFixed(2));
            }
          } else if (offer.offer_type === 'fixed_amount') {
            const lineSubtotal = origPrice * item.quantity;
            const itemRatio = scopedProductId ? 1 : lineSubtotal / subtotal;
            const lineDiscount = Math.min(Number(offer.discount_value) * itemRatio, lineSubtotal);
            const candidateDiscount = Number((lineDiscount / item.quantity).toFixed(2));
            if (candidateDiscount > itemDiscount) {
              itemDiscount = candidateDiscount;
              finalPrice = Number(Math.max(0, origPrice - itemDiscount).toFixed(2));
            }
          }
        }

        const discountPct = origPrice > 0 ? Number(((itemDiscount / origPrice) * 100).toFixed(4)) : 0;

        return {
          ...item,
          price: finalPrice,
          original_price: origPrice,
          discount_amount: itemDiscount,
          discount_percent: discountPct,
          final_price: finalPrice
        };
      });

      const discountedSubtotal = enrichedItems.reduce((sum, item) => sum + (item.final_price * item.quantity), 0);
      const grandTotal = Math.max(0, discountedSubtotal + effectiveDeliveryFee);

      if (grandTotal <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid product pricing.' });
      }

      // Generate the internal reference / transaction ID for Hurmood Pay
      const suffix = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
      const generatedTxnId = `HURMOOD-${customer.id}-${suffix}`;

      const orderData = {
        customer_id: customer.id,
        customer_user_id: req.user.id,
        vendor_id: resolvedVendorId,
        total_amount: grandTotal,
        delivery_address,
        delivery_latitude: delivery_latitude ?? latitude,
        delivery_longitude: delivery_longitude ?? longitude,
        payment_method,
        payment_status: 'paid', // Will be set to 'paid' when order is created upon success callback
        delivery_fee: effectiveDeliveryFee,
        distance_km: routeDistanceKm,
        destinations,
        items: enrichedItems,
        offer_id: selectedOffer?.id || null,
        discount_amount: discountAmount,
        offer_description: offerDescription
      };

      console.log(`[HURMOOD REQUEST] Initiating payment request for customer ${customer.id}, phone: ${maskSensitiveValue(payment_phone)}, amount: ${grandTotal}, reference: ${generatedTxnId}`);

      let providerPayment = null;
      let paymentReferenceId = generatedTxnId;
      let paymentMessage = 'Please approve the Hurmood/EVC prompt on your phone.';
      let recoveredPendingAttempt = false;

      // Initiate payment request using WaafiService.purchase (Hurmood API)
      try {
        providerPayment = await WaafiService.purchase({
          customerId: customer.id,
          vendorId: resolvedVendorId,
          payerAccount: payment_phone,
          amount: grandTotal,
          description: `LPG Delivery order payment. Ref: ${generatedTxnId}`,
          idempotencyKey: checkout_request_id || generatedTxnId
        });
        paymentReferenceId = providerPayment.referenceId || providerPayment.transactionId || generatedTxnId;
      } catch (error) {
        if (error.statusCode === 409 && error.pendingAttempt?.referenceId) {
          recoveredPendingAttempt = true;
          providerPayment = {
            status: 'pending',
            referenceId: error.pendingAttempt.referenceId,
            transactionId: error.pendingAttempt.transactionId || null,
            responseCode: error.pendingAttempt.responseCode || error.responseCode || null,
          };
          paymentReferenceId = error.pendingAttempt.referenceId || generatedTxnId;
          paymentMessage = 'A previous payment is still being processed. Please wait for confirmation.';
        } else {
          throw error;
        }
      }

      console.log(
        `[HURMOOD RESPONSE] Result: status=${providerPayment?.status ?? 'pending'}, ` +
        `responseCode=${providerPayment?.responseCode ?? 'n/a'}, referenceId=${paymentReferenceId}`
      );

      // Store/refresh the payment row using the provider reference ID so callback and polling stay aligned.
      await db.query(
        `INSERT INTO hurmood_payments (transaction_id, customer_id, vendor_id, amount, status, order_data)
         VALUES (?, ?, ?, ?, 'PENDING', ?)
         ON DUPLICATE KEY UPDATE
           customer_id = VALUES(customer_id),
           vendor_id = VALUES(vendor_id),
           amount = VALUES(amount),
           order_data = VALUES(order_data),
           status = IF(status = 'SUCCESS', status, VALUES(status)),
           updated_at = CURRENT_TIMESTAMP`,
        [paymentReferenceId, customer.id, resolvedVendorId, grandTotal, JSON.stringify(orderData)]
      );

      // Send a customer notification for the fresh payment request, but avoid duplicating it for a resumed pending attempt.
      if (!recoveredPendingAttempt) {
        try {
          await NotificationModel.createAndSendUserNotification(
            req.user.id,
            'Payment pending',
            `Please approve the Hurmood/EVC prompt on your phone for amount $${grandTotal}.`,
            'payment_pending',
            null,
            io,
            { vendorId: resolvedVendorId }
          );
        } catch (err) {
          console.error('Failed to send pending payment notification:', err.message);
        }
      }

      res.status(200).json({
        success: true,
        status: 'PENDING',
        transactionId: paymentReferenceId,
        providerStatus: providerPayment?.status ?? 'pending',
        message: paymentMessage
      });

    } catch (error) {
      console.error('[PAYMENT CREATE ERROR]', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to initiate Hurmood payment.'
      });
    }
  }

  static async handlePaymentCallback(req, res) {
    console.log('[HURMOOD CALLBACK DATA] Received payload:', JSON.stringify(redactSensitiveData(req.body)));

    // Optional defense-in-depth: only enforced when HURMOOD_CALLBACK_IPS is configured,
    // so this never breaks local/dev testing where the var is unset.
    const allowlist = String(process.env.HURMOOD_CALLBACK_IPS || '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
    if (allowlist.length > 0) {
      const callerIp = String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');
      if (!allowlist.includes(callerIp)) {
        console.warn(`[HURMOOD CALLBACK] Rejected callback from non-allowlisted IP: ${callerIp}`);
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    let connection;
    try {
      const { responseCode, transactionId, referenceId, responseMsg } = req.body;

      if (!referenceId) {
        console.warn('[HURMOOD CALLBACK] Missing referenceId in callback payload');
        return res.status(400).json({ success: false, message: 'Missing referenceId' });
      }

      // Find the payment record by provider reference first, then fall back to transactionId if needed.
      const lookupIds = [referenceId, transactionId].filter((value, index, array) =>
        value && array.indexOf(value) === index
      );

      // Lock the row for the duration of the check-then-act + order creation so that two
      // concurrent callbacks for the same referenceId can't both pass the "already processed"
      // check and double-create an order. The second callback's SELECT ... FOR UPDATE blocks
      // until this transaction commits, then sees the final status/order_id and skips cleanly.
      connection = await db.getConnection();
      await connection.beginTransaction();

      let payment = null;
      for (const lookupId of lookupIds) {
        const [payments] = await connection.query(
          'SELECT * FROM hurmood_payments WHERE transaction_id = ? FOR UPDATE',
          [lookupId]
        );
        if (payments.length > 0) {
          payment = payments[0];
          break;
        }
      }

      if (!payment) {
        await connection.rollback();
        console.warn(`[HURMOOD CALLBACK] No payment record found for transaction_id=${referenceId}`);
        return res.status(404).json({ success: false, message: 'Payment record not found' });
      }

      const SUCCESS_CODE = '2001';
      const isSuccessful = responseCode === SUCCESS_CODE;
      const newStatus = isSuccessful ? 'SUCCESS' : (responseCode === '5310' ? 'CANCELLED' : 'FAILED');

      console.log(`[HURMOOD CALLBACK] Updating transaction ${referenceId} to status=${newStatus}`);

      // If already processed as SUCCESS, skip order creation
      if (payment.status === 'SUCCESS' && payment.order_id) {
        await connection.rollback();
        console.log(`[HURMOOD CALLBACK] Transaction ${referenceId} already successfully processed. Order ID: ${payment.order_id}`);
        return res.status(200).json({ success: true, message: 'Already processed' });
      }

      // Update payment record in database
      await connection.query(
        `UPDATE hurmood_payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newStatus, payment.id]
      );

      let orderId = null;
      let orderData = null;

      if (isSuccessful) {
        orderData = JSON.parse(payment.order_data);

        // Create the actual order in the orders table
        orderId = await CustomerModel.createOrder({
          customer_id: orderData.customer_id,
          vendor_id: orderData.vendor_id,
          total_amount: orderData.total_amount,
          delivery_address: orderData.delivery_address,
          delivery_latitude: orderData.delivery_latitude,
          delivery_longitude: orderData.delivery_longitude,
          payment_method: orderData.payment_method,
          payment_status: 'Paid',
          delivery_fee: orderData.delivery_fee,
          distance_km: orderData.distance_km,
          destinations: orderData.destinations,
          provider_payment: {
            attemptId: payment.id,
            transactionId: transactionId || referenceId,
            status: 'successful'
          },
          items: orderData.items
        });

        console.log(`[HURMOOD CALLBACK] Created Order #${orderId} on payment success`);

        // Update order_id on payment record — still inside the locked transaction, so a
        // concurrent callback blocked on FOR UPDATE only unblocks once order_id is set too.
        await connection.query(
          'UPDATE hurmood_payments SET order_id = ? WHERE id = ?',
          [orderId, payment.id]
        );
      } else {
        orderData = JSON.parse(payment.order_data);
      }

      await connection.commit();

      const io = req.app.get('io');

      if (isSuccessful) {
        // Notify vendor of the new order
        await db.query(
          `INSERT INTO vendor_notifications (vendor_id, order_id, title, message, type)
           VALUES (?, ?, 'New order assignment', ?, 'order_assigned')`,
          [orderData.vendor_id, orderId, `Order #${orderId} has been paid and assigned to your business.`]
        );

        if (io) {
          io.to(`vendor-${orderData.vendor_id}`).emit('order-assignment-created', {
            order_id: orderId,
            vendor_id: Number(orderData.vendor_id),
            assigned_at: new Date().toISOString(),
          });
          io.emit('inventory-updated', {
            vendor_id: Number(orderData.vendor_id),
            product_ids: orderData.items.map((item) => Number(item.product_id)),
          });
        }

        // Notify customer of successful payment and order creation
        try {
          await NotificationModel.createAndSendUserNotification(
            orderData.customer_user_id,
            'Payment confirmed',
            `Payment for order #${orderId} was confirmed. Your order is now assigned to the vendor.`,
            'payment_success',
            orderId,
            io,
            { vendorId: orderData.vendor_id, orderId }
          );
        } catch (err) {
          console.error('Failed to send payment success notification:', err.message);
        }

        // Track offer redemption if offer was used
        if (orderData.offer_id) {
          try {
            const offer = await CustomerModel.getActiveOfferById(orderData.offer_id, orderData.vendor_id);
            if (offer) {
              await CustomerModel.recordOfferRedemption(offer);
              await CustomerModel.trackOfferEvent({
                offer,
                customerId: orderData.customer_id,
                orderId,
                eventType: 'order',
                revenue: orderData.total_amount
              });
            }
          } catch (err) {
            console.error('Failed to record offer analytics on payment success:', err.message);
          }
        }

      } else {
        // Handle payment failure/cancellation
        const isCancelled = responseCode === '5310';
        const notificationTitle = isCancelled ? 'Payment cancelled' : 'Payment failed';
        const notificationMsg = isCancelled
          ? 'Your Hurmood payment request was cancelled. Please try again.'
          : 'Your Hurmood payment request failed. Please try again.';

        try {
          await NotificationModel.createAndSendUserNotification(
            orderData.customer_user_id,
            notificationTitle,
            notificationMsg,
            'payment_failed',
            null,
            io,
            { vendorId: orderData.vendor_id }
          );
        } catch (err) {
          console.error('Failed to send payment failure notification:', err.message);
        }
      }

      res.status(200).json({ success: true, message: 'Payment callback processed' });

    } catch (error) {
      if (connection) {
        try { await connection.rollback(); } catch (rollbackError) {
          console.error('[HURMOOD CALLBACK] Rollback failed:', rollbackError.message);
        }
      }
      console.error('[HURMOOD CALLBACK ERROR]', error);
      res.status(500).json({ success: false, message: 'Failed to process payment callback.' });
    } finally {
      if (connection) connection.release();
    }
  }

  static async getPaymentStatus(req, res) {
    const { transactionId } = req.params;
    try {
      const [payments] = await db.query(
        `SELECT status, order_id FROM hurmood_payments WHERE transaction_id = ?`,
        [transactionId]
      );

      if (payments.length === 0) {
        return res.status(404).json({ success: false, message: 'Payment transaction not found.' });
      }

      res.status(200).json({
        success: true,
        status: payments[0].status,
        orderId: payments[0].order_id
      });
    } catch (error) {
      console.error('[GET PAYMENT STATUS ERROR]', error);
      res.status(500).json({ success: false, message: 'Failed to fetch payment status.' });
    }
  }
}

module.exports = PaymentController;
