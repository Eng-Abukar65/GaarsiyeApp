import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../widgets/checkout_progress.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/utils/cart_service.dart';
import '../models/cart_item_model.dart';

class OrderConfirmationScreen extends StatefulWidget {
  const OrderConfirmationScreen({super.key});

  @override
  State<OrderConfirmationScreen> createState() =>
      _OrderConfirmationScreenState();
}

class _OrderConfirmationScreenState extends State<OrderConfirmationScreen> {
  bool _isProcessing = false;
  String _processingStep = 'Preparing order...';
  bool _isOrderCreated = false;
  dynamic _createdOrderId;
  Timer? _successRedirectTimer;
  bool _successRedirectScheduled = false;
  String _successBannerMessage = 'Payment successful';

  String _newCheckoutRequestId() =>
      'checkout-${DateTime.now().microsecondsSinceEpoch}';

  // ─── Async checkout state ──────────────────────────────────────────────────
  CheckoutStage _stage = CheckoutStage.sending;
  String? _stageFailReason;
  String? _activeCheckoutRef;
  Timer? _pollTimer;
  bool _pollInFlight = false;

  /// Starts a checkout and polls until the server reports a terminal status.
  ///
  /// The reference is reused across retries of the SAME attempt, so a double tap
  /// or a resent request resolves to the existing checkout rather than starting
  /// a second payment.
  Future<void> _runAsyncCheckout(Map<String, dynamic> payload) async {
    final String reference =
        _activeCheckoutRef ?? payload['checkout_request_id'].toString();
    _activeCheckoutRef = reference;
    payload['checkout_request_id'] = reference;

    if (!mounted) return;
    setState(() {
      _stage = CheckoutStage.sending;
      _stageFailReason = null;
    });

    try {
      final response = await ApiService.post('/customer/checkout', payload);
      final body = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode != 202 && response.statusCode != 200) {
        _finishWithFailure(
          CheckoutStage.failed,
          body['message']?.toString() ?? 'Could not start the payment.',
        );
        return;
      }
      // An already-terminal duplicate (e.g. the user retried a finished
      // checkout) is handled immediately without polling.
      if (body['terminal'] == true) {
        await _applyCheckoutState(body);
        return;
      }
    } catch (e) {
      // Losing the network while STARTING means nothing was charged.
      _finishWithFailure(
        CheckoutStage.failed,
        'We could not reach the server. Please check your connection and try again.',
      );
      return;
    }

    _startPolling(reference);
  }

  void _startPolling(String reference) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (timer) async {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_pollInFlight) return; // never overlap requests
      _pollInFlight = true;
      try {
        final res = await ApiService.get('/customer/checkout/$reference');
        if (!mounted) {
          timer.cancel();
          return;
        }
        if (res.statusCode == 200) {
          final body = jsonDecode(res.body) as Map<String, dynamic>;
          final done = await _applyCheckoutState(body);
          if (done) timer.cancel();
        }
        // A transient non-200 is ignored: the server-side timeout is the
        // authority on when to give up, so a dropped poll never loses the order.
      } catch (_) {
        // Connectivity blip mid-payment — keep polling; the payment continues
        // server-side regardless of this device.
      } finally {
        _pollInFlight = false;
      }
    });
  }

  /// Applies a status payload. Returns true when polling should stop.
  ///
  /// Handles all terminal states from the backend:
  ///   status='completed'                     → success
  ///   status='failed'  / stage='failed'      → payment rejected
  ///   status='cancelled' / stage='cancelled' → customer cancelled
  ///   stage='timed_out'                      → no confirmation in time
  Future<bool> _applyCheckoutState(Map<String, dynamic> body) async {
    final stage = checkoutStageFrom(body['stage']?.toString());
    final status = body['status']?.toString();

    // Always update the displayed stage so the progress indicator matches
    // the backend reality before we decide what to do next.
    if (mounted) setState(() => _stage = stage);

    // ── Success ────────────────────────────────────────────────────────────
    if (status == 'completed') {
      _pollTimer?.cancel();
      await CartService.clearCart();
      final order = body['order'] as Map<String, dynamic>?;
      if (!mounted) return true;
      setState(() {
        _isProcessing = false;
        _isOrderCreated = true;
        _createdOrderId = body['order_id'];
        _successBannerMessage = 'Payment successful';
        _stage = CheckoutStage.completed;
        _lastOrderSummary = order;
      });
      return true;
    }

    // ── Failure / cancellation / timeout ───────────────────────────────────
    // The backend uses status='failed' for rejected payments and status='cancelled'
    // for customer-cancelled ones. Timeout sessions are marked stage='timed_out'
    // (status='failed'). We also check the stage enum directly so that even if
    // the status field changes, failure is never missed.
    final isTerminalFailure =
        status == 'failed' ||
        status == 'cancelled' ||
        stage == CheckoutStage.failed ||
        stage == CheckoutStage.cancelled ||
        stage == CheckoutStage.timedOut;

    if (isTerminalFailure) {
      final rawReason = body['fail_reason']?.toString() ??
          body['message']?.toString() ??
          'The payment did not complete.';
      _finishWithFailure(stage, rawReason);
      return true;
    }

    return false;
  }

  void _finishWithFailure(CheckoutStage stage, String reason) {
    _pollTimer?.cancel();
    if (!mounted) return;
    setState(() {
      _stage = stage;
      _stageFailReason = reason;
      // Stay on the progress view so Retry / Check status are reachable — the
      // old flow dropped a modal and left the customer with nowhere to go.
      _isProcessing = true;
    });
  }

  /// Re-checks a checkout the customer was unsure about (used by "Check payment
  /// status" after a timeout).
  Future<void> _recheckCheckout() async {
    final reference = _activeCheckoutRef;
    if (reference == null) return;
    setState(() {
      _stage = CheckoutStage.verifying;
      _stageFailReason = null;
    });
    try {
      final res = await ApiService.get('/customer/checkout/$reference');
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final done = await _applyCheckoutState(body);
        if (!done) _startPolling(reference);
        return;
      }
    } catch (_) {/* fall through */}
    _finishWithFailure(
      CheckoutStage.timedOut,
      'We still could not confirm this payment. Check Order History in a moment.',
    );
  }

  /// Fresh attempt with a NEW reference — only offered when nothing was charged,
  /// so a retry can never double-charge an approved payment.
  Future<void> _retryCheckout() async {
    final args = _lastCheckoutArgs;
    if (args == null) {
      setState(() => _isProcessing = false);
      return;
    }
    _activeCheckoutRef = null;
    setState(() => _stageFailReason = null);
    await _confirmAndPlaceOrder(args);
  }

  Map<String, dynamic>? _lastCheckoutArgs;

  Map<String, dynamic>? _lastOrderSummary;

  Widget _receiptRow(String label, String value, Color labelColor, Color valueColor,
      {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: labelColor, fontSize: 13)),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: valueColor,
                fontSize: 13.5,
                fontWeight: bold ? FontWeight.bold : FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _successRedirectTimer?.cancel();
    super.dispose();
  }

  void _cancelSuccessRedirect() {
    _successRedirectTimer?.cancel();
    _successRedirectTimer = null;
    _successRedirectScheduled = false;
  }

  void _goHomeWithFlashMessage([String? message]) {
    _cancelSuccessRedirect();
    Navigator.pushNamedAndRemoveUntil(
      context,
      AppRoutes.home,
      (route) => false,
      arguments: {'flash_message': (message ?? _successBannerMessage).trim()},
    );
  }

  void _goHome() {
    Navigator.pushNamedAndRemoveUntil(
      context,
      AppRoutes.home,
      (route) => false,
    );
  }

  void _scheduleHomeRedirect({String? message}) {
    if (_successRedirectScheduled) return;
    _successRedirectScheduled = true;
    _successBannerMessage = (message ?? 'Payment successful').trim();
    _successRedirectTimer?.cancel();
    _successRedirectTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted) return;
      _goHomeWithFlashMessage(_successBannerMessage);
    });
  }

  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: Colors.redAccent,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusM),
        ),
      ),
    );
  }

  String _readablePaymentMessage(String message) {
    var cleaned = message.trim();
    final paymentFailedPrefix = RegExp(
      r'^Payment Failed\s*\(',
      caseSensitive: false,
    );

    cleaned = cleaned.replaceFirst(paymentFailedPrefix, '');
    if (cleaned.endsWith(')')) {
      cleaned = cleaned.substring(0, cleaned.length - 1).trim();
    }

    return cleaned.isEmpty
        ? 'Payment failed. Please check your wallet balance and try again.'
        : cleaned;
  }

  Future<void> _showStatusDialog(
    String title,
    String message, {
    required IconData icon,
    required Color iconColor,
  }) async {
    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        final theme = Theme.of(dialogContext);
        final cs = theme.colorScheme;
        final isDark = theme.brightness == Brightness.dark;

        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          ),
          titlePadding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
          contentPadding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
          actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          title: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: iconColor.withAlpha(30),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: iconColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: cs.onSurface,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 260),
            child: SingleChildScrollView(
              child: Text(
                _readablePaymentMessage(message),
                style: TextStyle(
                  color: isDark
                      ? AppColors.textSecondaryDark
                      : AppColors.textSecondary,
                  fontSize: 15,
                  height: 1.45,
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _showPaymentErrorDialog(String message) async {
    await _showStatusDialog(
      'Payment Failed',
      message,
      icon: Icons.error_outline,
      iconColor: Colors.redAccent,
    );
  }

  Future<void> _showPaymentInfoDialog(String title, String message) async {
    await _showStatusDialog(
      title,
      message,
      icon: Icons.info_outline,
      iconColor: AppColors.primary,
    );
  }

  int? _parseInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString());
  }

  double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }

  Map<String, dynamic>? _asMap(dynamic value) {
    if (value is Map) {
      return Map<String, dynamic>.from(value);
    }
    return null;
  }

  List<CartItemModel> _extractCartItems(Map<String, dynamic> args) {
    final cartItemsRaw = args['cart_items'];
    if (cartItemsRaw is! List) return const <CartItemModel>[];

    final cartItems = <CartItemModel>[];
    for (final item in cartItemsRaw) {
      if (item is CartItemModel) {
        cartItems.add(item);
      } else if (item is Map) {
        try {
          cartItems.add(
            CartItemModel.fromJson(Map<String, dynamic>.from(item)),
          );
        } catch (_) {
          // Ignore malformed legacy cart items.
        }
      }
    }
    return cartItems;
  }

  CartItemModel? _firstCartItem(Map<String, dynamic> args) {
    final cartItems = _extractCartItems(args);
    if (cartItems.isNotEmpty) return cartItems.first;
    return null;
  }

  Map<String, dynamic>? _buildVendorContext(Map<String, dynamic> args) {
    final rawVendor = _asMap(args['vendor']);
    if (rawVendor != null) {
      final vendorId = _parseInt(rawVendor['id'] ?? rawVendor['vendor_id']);
      final vendorName =
          (rawVendor['vendor_name'] ??
                  rawVendor['business_name'] ??
                  rawVendor['name'] ??
                  '')
              .toString()
              .trim();

      final vendor = Map<String, dynamic>.from(rawVendor);
      if (vendorId != null) {
        vendor['id'] = vendorId;
        vendor['vendor_id'] = vendorId;
      }
      if (vendorName.isNotEmpty) {
        vendor['name'] = vendorName;
        vendor['business_name'] = vendorName;
        vendor['vendor_name'] = vendorName;
      }
      return vendor;
    }

    final item = _firstCartItem(args);
    final vendorId = item?.vendorId ?? _parseInt(args['vendor_id']);
    if (vendorId == null) return null;

    final vendorName = (item?.vendorName ?? args['vendor_name'] ?? '')
        .toString()
        .trim();
    return {
      'id': vendorId,
      'vendor_id': vendorId,
      if (vendorName.isNotEmpty) 'name': vendorName,
      if (vendorName.isNotEmpty) 'business_name': vendorName,
      if (vendorName.isNotEmpty) 'vendor_name': vendorName,
    };
  }

  Map<String, dynamic>? _buildProductContext(Map<String, dynamic> args) {
    final rawProduct = _asMap(args['product']);
    if (rawProduct != null) {
      final productId = _parseInt(rawProduct['id'] ?? rawProduct['product_id']);
      final productName =
          (rawProduct['product_name'] ??
                  rawProduct['name'] ??
                  rawProduct['title'] ??
                  '')
              .toString()
              .trim();
      final imageUrl = (rawProduct['image_url'] ?? rawProduct['image'] ?? '')
          .toString()
          .trim();
      final category =
          (rawProduct['category'] ?? rawProduct['product_category'] ?? '')
              .toString()
              .trim();

      final product = Map<String, dynamic>.from(rawProduct);
      if (productId != null) {
        product['id'] = productId;
        product['product_id'] = productId;
      }
      if (productName.isNotEmpty) {
        product['product_name'] = productName;
        product['name'] = productName;
        product['title'] = productName;
      }
      if (imageUrl.isNotEmpty) {
        product['image_url'] = imageUrl;
        product['image'] = imageUrl;
      }
      if (category.isNotEmpty) {
        product['category'] = category;
      }
      product['price'] =
          rawProduct['price'] ??
          rawProduct['selling_price'] ??
          rawProduct['original_price'] ??
          0;
      product['selling_price'] =
          rawProduct['selling_price'] ?? product['price'];
      product['original_price'] =
          rawProduct['original_price'] ?? product['price'];
      product['discounted_price'] =
          rawProduct['discounted_price'] ?? product['price'];
      product['unit'] = rawProduct['unit'] ?? '';
      product['stock'] =
          rawProduct['stock'] ?? rawProduct['stock_quantity'] ?? 0;
      product['is_active'] = rawProduct['is_active'] ?? true;
      return product;
    }

    final item = _firstCartItem(args);
    if (item == null) return null;

    return {
      'id': item.id,
      'product_id': item.id,
      'product_name': item.title,
      'name': item.title,
      'title': item.title,
      'image_url': item.imageUrl,
      'image': item.imageUrl,
      'price': item.price,
      'selling_price': item.price,
      'original_price': item.price,
      'discounted_price': item.price,
      'unit': item.unit,
      'stock': item.stock,
      'is_active': item.isActive,
      if (item.vendorId != null) 'vendor_id': item.vendorId,
      if (item.vendorName != null && item.vendorName!.trim().isNotEmpty)
        'vendor_name': item.vendorName!.trim(),
    };
  }

  String? _buildFuelCategoryHint(Map<String, dynamic> args) {
    final rawProduct = _asMap(args['product']);
    if (rawProduct != null) {
      final category = rawProduct['category']?.toString().trim();
      if (category != null && category.isNotEmpty) return category;
    }

    final rawCategory = args['product'];
    if (rawCategory is String && rawCategory.trim().isNotEmpty) {
      return rawCategory.trim();
    }

    return null;
  }

  String? _buildSelectedProductId(Map<String, dynamic> args) {
    final rawProduct = _asMap(args['product']);
    if (rawProduct != null) {
      final productId = _parseInt(rawProduct['id'] ?? rawProduct['product_id']);
      if (productId != null) return productId.toString();
    }

    final item = _firstCartItem(args);
    return item?.id;
  }

  double? _buildQuantity(Map<String, dynamic> args) {
    final rawQuantity = _parseDouble(args['quantity']);
    if (rawQuantity != null && rawQuantity > 0) return rawQuantity;

    final item = _firstCartItem(args);
    if (item != null && item.quantity > 0) {
      return item.quantity.toDouble();
    }

    final rawProduct = _asMap(args['product']);
    final productQuantity = _parseDouble(rawProduct?['quantity']);
    if (productQuantity != null && productQuantity > 0) {
      return productQuantity;
    }

    return null;
  }

  Map<String, dynamic> _buildFuelStepArgs(Map<String, dynamic> args) {
    final vendor = _buildVendorContext(args);
    final stepArgs = <String, dynamic>{};
    final categoryHint = _buildFuelCategoryHint(args);
    final selectedProductId = _buildSelectedProductId(args);
    final offer = _asMap(args['offer']);

    if (vendor != null) {
      stepArgs['vendor'] = vendor;
      stepArgs['vendor_id'] = vendor['id'] ?? vendor['vendor_id'];
    }
    if (categoryHint != null) {
      stepArgs['product'] = categoryHint;
    }
    if (selectedProductId != null) {
      stepArgs['selected_product_id'] = selectedProductId;
    }
    if (offer != null) {
      stepArgs['offer'] = offer;
    }
    if (args['offer_id'] != null) {
      stepArgs['offer_id'] = args['offer_id'];
    }
    if (args['from_offer'] == true) {
      stepArgs['from_offer'] = true;
    }
    if (args['offer_description'] != null) {
      stepArgs['offer_description'] = args['offer_description'];
    }

    return stepArgs;
  }

  Map<String, dynamic> _buildQuantityStepArgs(Map<String, dynamic> args) {
    final vendor = _buildVendorContext(args);
    final product = _buildProductContext(args);
    final quantity = _buildQuantity(args);
    final stepArgs = <String, dynamic>{};
    final offer = _asMap(args['offer']);

    if (vendor != null) {
      stepArgs['vendor'] = vendor;
    }
    if (product != null) {
      stepArgs['product'] = product;
    }
    if (quantity != null && quantity > 0) {
      stepArgs['quantity'] = quantity;
    }
    if (offer != null) {
      stepArgs['offer'] = offer;
    }
    if (args['offer_id'] != null) {
      stepArgs['offer_id'] = args['offer_id'];
    }
    if (args['from_offer'] == true) {
      stepArgs['from_offer'] = true;
    }
    if (args['offer_description'] != null) {
      stepArgs['offer_description'] = args['offer_description'];
    }

    return stepArgs;
  }

  int? _resolveVendorId(Map<String, dynamic> args) {
    final directVendorId = _parseInt(args['vendor_id']);
    if (directVendorId != null && directVendorId > 0) return directVendorId;

    final vendor = args['vendor'];
    if (vendor is Map) {
      final vendorId = _parseInt(vendor['id'] ?? vendor['vendor_id']);
      if (vendorId != null && vendorId > 0) return vendorId;
    }

    final items = args['items'];
    if (items is List) {
      for (final item in items) {
        if (item is Map) {
          final vendorId = _parseInt(item['vendor_id']);
          if (vendorId != null && vendorId > 0) return vendorId;
        }
      }
    }

    final cartItems = args['cart_items'];
    if (cartItems is List) {
      for (final item in cartItems) {
        if (item is CartItemModel && item.vendorId != null) {
          return item.vendorId;
        }
      }
    }

    return 1;
  }

  Future<void> _confirmAndPlaceOrder(Map<String, dynamic> args) async {
    // Re-entrancy guard: a second tap (or a fast double tap) can never start a
    // second checkout. Combined with the server-side idempotency key this makes
    // duplicate orders impossible even if the UI is bypassed.
    if (_isProcessing || _isOrderCreated) return;
    _lastCheckoutArgs = args; // remembered so Retry can re-run the same order
    _cancelSuccessRedirect();
    setState(() {
      _isProcessing = true;
      _processingStep = 'Preparing order...';
    });

    final paymentMethod =
        args['payment_method']?.toString().toLowerCase() ?? '';
    final isOnlinePayment =
        paymentMethod != 'cod' &&
        paymentMethod != 'cash_on_delivery' &&
        paymentMethod != 'cash on delivery';
    setState(
      () => _processingStep = isOnlinePayment
          ? 'Initiating payment request...'
          : 'Submitting order to vendor...',
    );

    try {
      final deliveryFee =
          double.tryParse(args['delivery_fee']?.toString() ?? '0') ?? 0.0;
      final effectiveDeliveryFee =
          double.tryParse(args['effective_delivery_fee']?.toString() ?? '') ??
          deliveryFee;
      final vendorId = _resolveVendorId(args);
      if (vendorId == null || vendorId <= 0) {
        setState(() => _isProcessing = false);
        _showPaymentErrorDialog(
          'Vendor not found. Please go back and select the station again.',
        );
        return;
      }

      final Map<String, dynamic> payload = {
        'vendor_id': vendorId,
        'delivery_address': args['delivery_address'],
        'delivery_phone': args['delivery_phone'],
        'delivery_addresses': args['delivery_addresses'],
        'delivery_latitude': args['delivery_latitude'],
        'delivery_longitude': args['delivery_longitude'],
        'payment_method': args['payment_method'],
        'payment_phone': args['payment_phone'],
        'external_merchant_payment': args['external_merchant_payment'] == true,
        'checkout_request_id': _newCheckoutRequestId(),
        'items': args['items'],
        'delivery_fee': deliveryFee,
        'effective_delivery_fee': effectiveDeliveryFee,
        'offer_id': args['offer_id'],
        // Scheduling (stored as notes if the DB supports it)
        if (args['delivery_date'] != null)
          'delivery_date': args['delivery_date'],
        if (args['delivery_slot'] != null)
          'delivery_slot': args['delivery_slot'],
      };

      if (isOnlinePayment) {
        // Async checkout: the server answers immediately with a reference and
        // we poll for the real result. Previously this request blocked for up to
        // 30s server-side while the app gave up at 15s, so a payment the customer
        // had already approved surfaced as "Payment still processing".
        await _runAsyncCheckout(payload);
      } else {
        // Fallback cash payment path - create order immediately
        final response = await ApiService.post('/customer/orders', payload);

        if (response.statusCode == 200 || response.statusCode == 201) {
          final resBody = jsonDecode(response.body);
          final orderId = resBody['orderId'] ?? resBody['id'];

          await CartService.clearCart();

          setState(() {
            _isProcessing = false;
            _isOrderCreated = true;
            _createdOrderId = orderId;
          });
        } else {
          String errMsg = 'Failed to place order. Please try again.';
          var shouldClearStaleCart = false;
          try {
            final resBody = jsonDecode(response.body);
            if (resBody['message'] != null) {
              errMsg = resBody['message'];
            }
            shouldClearStaleCart = resBody['code'] == 'STALE_ORDER_DATA';
          } catch (_) {}

          if (shouldClearStaleCart) {
            await CartService.clearCart();
            errMsg =
                '$errMsg\n\nYour old cart has been cleared. Please choose items again.';
          }

          setState(() => _isProcessing = false);
          _showPaymentErrorDialog(errMsg);
        }
      }
    } catch (e) {
      debugPrint('DEBUG: Error processing checkout: $e');
      setState(() => _isProcessing = false);
      _showPaymentErrorDialog('Network error. Please check your connection.');
    }
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final rawArgs = ModalRoute.of(context)?.settings.arguments;
    final args = rawArgs is Map
        ? Map<String, dynamic>.from(rawArgs)
        : <String, dynamic>{};

    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;

    if (_isProcessing) {
      return Scaffold(
        backgroundColor: bgColor,
        // A live checklist instead of an indefinite spinner: the customer can
        // see which step they are on, and a failure leaves them with actions
        // rather than a dead-end modal.
        body: CheckoutProgressView(
          stage: _stage,
          failReason: _stageFailReason,
          // Offer a fresh attempt only when we are certain nothing was charged:
          // • failed   → payment was rejected by provider (safe to retry)
          // • cancelled → customer declined on phone       (safe to retry)
          // • timedOut  → no answer from provider          (safe to retry with new ref)
          // We do NOT offer retry after verifying fails mid-processing to avoid
          // potential double-charge if the callback arrives late.
          canRetry: _stage == CheckoutStage.failed ||
              _stage == CheckoutStage.cancelled ||
              _stage == CheckoutStage.timedOut,
          onRetry: _retryCheckout,
          onCheckStatus: _activeCheckoutRef == null ? null : _recheckCheckout,
          onCancel: () {
            _pollTimer?.cancel();
            setState(() {
              _isProcessing = false;
              _stageFailReason = null;
            });
          },
        ),
      );
    }

    if (!_isOrderCreated) {
      // PRE-CONFIRMATION (ORDER REVIEW) SCREEN
      final List<CartItemModel> cartItems = _extractCartItems(args);

      final subtotal =
          double.tryParse(args['subtotal']?.toString() ?? '0') ?? 0.0;
      final deliveryFee =
          double.tryParse(args['delivery_fee']?.toString() ?? '0') ?? 0.0;
      final effectiveDeliveryFee =
          double.tryParse(args['effective_delivery_fee']?.toString() ?? '') ??
          deliveryFee;
      final discountAmount =
          double.tryParse(args['discount_amount']?.toString() ?? '0') ?? 0.0;
      final payableSubtotal = (subtotal - discountAmount).clamp(
        0.0,
        double.infinity,
      );
      final grandTotal = (payableSubtotal + effectiveDeliveryFee).clamp(
        0.0,
        double.infinity,
      );

      return Scaffold(
        backgroundColor: bgColor,
        appBar: AppBar(
          backgroundColor: bgColor,
          elevation: 0,
          leading: IconButton(
            onPressed: () => Navigator.pop(context),
            icon: Icon(Icons.arrow_back, color: textPrimary),
          ),
          title: Text(
            'Review Order',
            style: TextStyle(
              color: textPrimary,
              fontWeight: FontWeight.bold,
              fontSize: 18,
            ),
          ),
          actions: [
            IconButton(
              onPressed: _goHome,
              icon: Icon(Icons.home_outlined, color: textPrimary),
              tooltip: 'Home',
            ),
          ],
          centerTitle: true,
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(1),
            child: Container(color: borderCol.withAlpha(76), height: 1),
          ),
        ),
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(AppSpacing.l),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Step Indicator
                      _buildStepIndicator(context, args),
                      const SizedBox(height: AppSpacing.xl),

                      // Deliver to section
                      _buildSectionTitle(
                        context,
                        'Delivery Address',
                        Icons.location_on,
                      ),
                      _buildCard(
                        context,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              args['delivery_address']?.toString() ??
                                  'Mogadishu',
                              style: TextStyle(
                                color: textPrimary,
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (args['delivery_zone'] != null &&
                                args['delivery_zone']
                                    .toString()
                                    .isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                'Zone: ${args['delivery_zone']}',
                                style: TextStyle(
                                  color: textSecondary,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xl),

                      // Delivery Schedule section
                      if (args['delivery_date'] != null ||
                          args['delivery_slot'] != null) ...[
                        _buildSectionTitle(
                          context,
                          'Delivery Schedule',
                          Icons.event_available,
                        ),
                        _buildCard(
                          context,
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withAlpha(25),
                                  borderRadius: BorderRadius.circular(
                                    AppSpacing.radiusM,
                                  ),
                                ),
                                child: const Icon(
                                  Icons.access_time,
                                  color: AppColors.primary,
                                  size: 20,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      args['delivery_date']?.toString() ??
                                          'Today',
                                      style: TextStyle(
                                        color: textPrimary,
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    if (args['delivery_slot'] != null) ...[
                                      const SizedBox(height: 2),
                                      Text(
                                        '${args['delivery_slot']}',
                                        style: TextStyle(
                                          color: textSecondary,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ],
                                    if (args['delivery_time_range'] !=
                                        null) ...[
                                      const SizedBox(height: 2),
                                      Text(
                                        '${args['delivery_time_range']}',
                                        style: TextStyle(
                                          color: AppColors.primary,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xl),
                      ],

                      // Payment Method section
                      _buildSectionTitle(
                        context,
                        'Payment Method',
                        Icons.payment,
                      ),
                      _buildCard(
                        context,
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: AppColors.primary.withAlpha(25),
                                borderRadius: BorderRadius.circular(
                                  AppSpacing.radiusM,
                                ),
                              ),
                              child: const Icon(
                                Icons.account_balance_wallet,
                                color: AppColors.primary,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    args['payment_method_name']?.toString() ??
                                        'Selected Method',
                                    style: TextStyle(
                                      color: textPrimary,
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  if (args['payment_phone'] != null &&
                                      args['payment_phone']
                                          .toString()
                                          .isNotEmpty) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      'Phone: ${args['payment_phone']}',
                                      style: TextStyle(
                                        color: textSecondary,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xl),

                      // Items summary
                      _buildSectionTitle(
                        context,
                        'Items Summary',
                        Icons.shopping_bag,
                      ),
                      if (cartItems.isNotEmpty)
                        ...cartItems.map(
                          (item) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8.0),
                            child: Row(
                              children: [
                                Container(
                                  width: 48,
                                  height: 48,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(
                                      AppSpacing.radiusM,
                                    ),
                                    color: isDark
                                        ? Colors.white.withAlpha(10)
                                        : Colors.black.withAlpha(10),
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(
                                      AppSpacing.radiusM,
                                    ),
                                    child:
                                        item.imageUrl.startsWith('http') ||
                                            item.imageUrl.startsWith('/uploads')
                                        ? Image.network(
                                            item.imageUrl,
                                            fit: BoxFit.cover,
                                            errorBuilder: (c, e, s) =>
                                                const Icon(
                                                  Icons.image,
                                                  size: 20,
                                                ),
                                          )
                                        : Image.asset(
                                            item.imageUrl,
                                            fit: BoxFit.cover,
                                            errorBuilder: (c, e, s) =>
                                                const Icon(
                                                  Icons.image,
                                                  size: 20,
                                                ),
                                          ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item.title,
                                        style: TextStyle(
                                          color: textPrimary,
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      Text(
                                        item.unit.isNotEmpty
                                            ? '${item.quantity} ${item.unit}'
                                            : 'x${item.quantity}',
                                        style: TextStyle(
                                          color: textSecondary,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Text(
                                  '\$${(item.price * item.quantity).toStringAsFixed(2)}',
                                  style: TextStyle(
                                    color: textPrimary,
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      else
                        Text(
                          'No items found',
                          style: TextStyle(color: textSecondary),
                        ),
                      const SizedBox(height: AppSpacing.xl),

                      // Price Summary Card
                      _buildSectionTitle(
                        context,
                        'Cost Summary',
                        Icons.receipt_long,
                      ),
                      _buildCard(
                        context,
                        child: Column(
                          children: [
                            _buildSummaryRow(
                              context,
                              'Subtotal',
                              '\$${payableSubtotal.toStringAsFixed(2)}',
                              isBorder: false,
                            ),
                            const SizedBox(height: 8),
                            _buildSummaryRow(
                              context,
                              'Delivery Fee',
                              effectiveDeliveryFee == 0.0
                                  ? 'FREE'
                                  : '\$${effectiveDeliveryFee.toStringAsFixed(2)}',
                              isBorder: false,
                              valueColor: effectiveDeliveryFee == 0.0
                                  ? AppColors.success
                                  : null,
                            ),
                            if (discountAmount > 0 ||
                                args['offer_id'] != null) ...[
                              const SizedBox(height: 8),
                              _buildSummaryRow(
                                context,
                                args['offer_description']?.toString() ??
                                    'Offer',
                                discountAmount > 0
                                    ? 'Saved \$${discountAmount.toStringAsFixed(2)}'
                                    : 'Applied',
                                isBorder: false,
                                valueColor: AppColors.success,
                              ),
                            ],
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 8.0),
                              child: Divider(),
                            ),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Total Amount',
                                  style: TextStyle(
                                    color: textPrimary,
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                Text(
                                  '\$${grandTotal.toStringAsFixed(2)}',
                                  style: const TextStyle(
                                    color: AppColors.primary,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
              // Footer Confirm Button
              Container(
                padding: const EdgeInsets.all(AppSpacing.l),
                decoration: BoxDecoration(
                  color: bgColor,
                  border: Border(
                    top: BorderSide(color: borderCol.withAlpha(76)),
                  ),
                ),
                child: CustomButton(
                  text: 'Confirm & Place Order',
                  onPressed: _isProcessing ? null : () => _confirmAndPlaceOrder(args),
                  icon: const Icon(
                    Icons.check_circle_outline,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // POST-CONFIRMATION (SUCCESS) STATE
    final orderId = _createdOrderId;
    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        leading: IconButton(
          onPressed: () => _goHomeWithFlashMessage(_successBannerMessage),
          icon: Icon(Icons.close, color: textPrimary),
        ),
        title: Text(
          'Order Status',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        actions: [
          IconButton(
            onPressed: () => _goHomeWithFlashMessage(_successBannerMessage),
            icon: Icon(Icons.home_outlined, color: textPrimary),
            tooltip: 'Home',
          ),
        ],
        centerTitle: true,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: borderCol.withAlpha(76), height: 1),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.l,
            vertical: AppSpacing.xxl,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Success Icon
              Center(
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        color: AppColors.success.withAlpha(25),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const Icon(
                      Icons.check_circle,
                      color: AppColors.success,
                      size: 80,
                      shadows: [
                        Shadow(color: AppColors.success, blurRadius: 20),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),

              Text(
                'Order Placed Successfully!',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: textPrimary,
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),

              // Receipt: the confirmed figures the server returned, so the
              // customer sees exactly what was charged and by whom.
              if (_lastOrderSummary != null) ...[
                const SizedBox(height: AppSpacing.l),
                Container(
                  padding: const EdgeInsets.all(AppSpacing.l),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.surfaceDark : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: borderCol.withAlpha(76)),
                  ),
                  child: Column(
                    children: [
                      _receiptRow('Payment', 'Successful', textSecondary,
                          AppColors.success, bold: true),
                      _receiptRow('Order ID', '#${orderId ?? '—'}', textSecondary, textPrimary),
                      if (_lastOrderSummary!['vendor_name'] != null)
                        _receiptRow('Vendor', '${_lastOrderSummary!['vendor_name']}',
                            textSecondary, textPrimary),
                      _receiptRow(
                        'Amount paid',
                        '\$${(_lastOrderSummary!['total_amount'] ?? 0).toStringAsFixed(2)}',
                        textSecondary, textPrimary, bold: true,
                      ),
                      if (_lastOrderSummary!['payment_method'] != null)
                        _receiptRow('Payment method',
                            '${_lastOrderSummary!['payment_method']}'.toUpperCase(),
                            textSecondary, textPrimary),
                      if (_lastOrderSummary!['delivery_otp'] != null)
                        _receiptRow('Delivery code', '${_lastOrderSummary!['delivery_otp']}',
                            textSecondary, textPrimary, bold: true),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Text(
                'Your order is being processed and will be delivered shortly to your location.',
                textAlign: TextAlign.center,
                style: TextStyle(color: textSecondary, fontSize: 15),
              ),
              const SizedBox(height: AppSpacing.xxl),

              // Order Summary Card
              _buildSuccessSummaryCard(context, orderId, args),

              const SizedBox(height: AppSpacing.xxl),

              // Action Buttons
              CustomButton(
                text: 'Track Order',
                onPressed: () {
                  _cancelSuccessRedirect();
                  if (orderId != null) {
                    Navigator.pushNamed(
                      context,
                      AppRoutes.status,
                      arguments: {'id': orderId},
                    );
                  } else {
                    debugPrint(
                      'DEBUG: [OrderConfirmationScreen] missing orderId, cannot track',
                    );
                    _showErrorSnackBar(
                      'Order ID missing, please check Orders history',
                    );
                  }
                },
                icon: const Icon(Icons.local_shipping, color: Colors.white),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: OutlinedButton(
                  onPressed: () =>
                      _goHomeWithFlashMessage(_successBannerMessage),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(
                      color: AppColors.primary.withAlpha(51),
                      width: 2,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                    ),
                  ),
                  child: const Text(
                    'Back to Home',
                    style: TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStepIndicator(BuildContext context, Map<String, dynamic> args) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final activeColor = AppColors.primary;
    final inactiveColor = isDark
        ? Colors.white.withAlpha(20)
        : Colors.black.withAlpha(10);
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;

    void navigateToStep(String label) {
      switch (label) {
        case 'Cart':
          Navigator.pushNamed(
            context,
            AppRoutes.selectFuelType,
            arguments: _buildFuelStepArgs(args),
          );
          break;
        case 'Checkout':
          Navigator.pushNamed(
            context,
            AppRoutes.selectQuantity,
            arguments: _buildQuantityStepArgs(args),
          );
          break;
        case 'Schedule':
          Navigator.pushNamed(context, AppRoutes.deliveryTime, arguments: args);
          break;
        case 'Payment':
          Navigator.pushNamed(context, AppRoutes.payment, arguments: args);
          break;
        case 'Confirm':
        default:
          break;
      }
    }

    Widget buildStep(String label, bool isDone, bool isActive) {
      final canNavigate = label != 'Confirm';
      final step = SizedBox(
        width: 60,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: isDone
                    ? activeColor
                    : (isActive ? activeColor.withAlpha(51) : inactiveColor),
                shape: BoxShape.circle,
                border: isActive
                    ? Border.all(color: activeColor, width: 2)
                    : null,
              ),
              child: Center(
                child: isDone
                    ? const Icon(Icons.check, color: Colors.white, size: 16)
                    : Text(
                        label[0],
                        style: TextStyle(
                          color: isActive
                              ? activeColor
                              : (isDark ? Colors.white70 : Colors.black87),
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: isActive ? activeColor : textSecondary,
                fontSize: 10,
                fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ),
      );

      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: canNavigate ? () => navigateToStep(label) : null,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: step,
          ),
        ),
      );
    }

    Widget buildDivider() {
      return Expanded(
        child: Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Container(height: 2, color: activeColor.withAlpha(100)),
        ),
      );
    }

    return Row(
      children: [
        buildStep('Cart', true, false),
        buildDivider(),
        buildStep('Checkout', true, false),
        buildDivider(),
        buildStep('Schedule', true, false),
        buildDivider(),
        buildStep('Payment', true, false),
        buildDivider(),
        buildStep('Confirm', false, true),
      ],
    );
  }

  Widget _buildSectionTitle(BuildContext context, String title, IconData icon) {
    final theme = Theme.of(context);
    final textPrimary = theme.colorScheme.onSurface;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0, left: 4.0),
      child: Row(
        children: [
          Icon(icon, color: AppColors.primary, size: 18),
          const SizedBox(width: 8),
          Text(
            title,
            style: TextStyle(
              color: textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(BuildContext context, {required Widget child}) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(76)
        : Colors.grey.shade100;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.l),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderCol.withAlpha(76)),
      ),
      child: child,
    );
  }

  Widget _buildSuccessSummaryCard(
    BuildContext context,
    dynamic orderId,
    Map<String, dynamic> args,
  ) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(76)
        : Colors.grey.shade100;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderColor.withAlpha(127)),
      ),
      child: Column(
        children: [
          // Order status header
          Container(
            height: 116,
            width: double.infinity,
            decoration: BoxDecoration(
              color: AppColors.primary.withAlpha(isDark ? 38 : 24),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppSpacing.radiusXL),
              ),
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.success,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                    child: const Icon(
                      Icons.check,
                      color: Colors.white,
                      size: 24,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: isDark
                          ? AppColors.backgroundDark.withAlpha(204)
                          : AppColors.primary,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusS),
                    ),
                    child: const Text(
                      'ORDER RECEIVED',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Summary Details
          Padding(
            padding: const EdgeInsets.all(AppSpacing.l),
            child: Column(
              children: [
                _buildSummaryRow(
                  context,
                  'Order ID',
                  orderId != null ? '#ORD-$orderId' : 'Pending',
                  isBoldValue: true,
                  valueColor: AppColors.primary,
                ),
                const SizedBox(height: 12),
                _buildSummaryRow(
                  context,
                  'Estimated Arrival',
                  () {
                    final date = args['delivery_date']?.toString();
                    final timeRange = args['delivery_time_range']?.toString();
                    if (date != null && timeRange != null) {
                      return '$date · $timeRange';
                    } else if (date != null) {
                      return date;
                    }
                    return 'To be confirmed';
                  }(),
                  isBoldValue: true,
                  icon: Icons.schedule,
                ),
                const SizedBox(height: 12),
                _buildSummaryRow(
                  context,
                  'Payment Method',
                  args['payment_method_name']?.toString() ?? 'Not provided',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryRow(
    BuildContext context,
    String label,
    String value, {
    bool isBoldValue = false,
    Color? valueColor,
    IconData? icon,
    bool isBorder = true,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final textPrimary = theme.colorScheme.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;

    return Container(
      padding: EdgeInsets.only(bottom: isBorder ? 12 : 0),
      decoration: isBorder
          ? BoxDecoration(
              border: Border(
                bottom: BorderSide(color: borderColor.withAlpha(76)),
              ),
            )
          : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 4,
            child: Text(
              label,
              style: TextStyle(
                color: textSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 6,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (icon != null) ...[
                  const SizedBox(width: 4),
                  Icon(icon, color: AppColors.primary, size: 14),
                  const SizedBox(width: 4),
                ],
                Flexible(
                  child: Text(
                    value,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      color: valueColor ?? textPrimary,
                      fontWeight: isBoldValue
                          ? FontWeight.bold
                          : FontWeight.w500,
                      fontSize: 14,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
