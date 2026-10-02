import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/utils/cart_service.dart';
import '../models/cart_item_model.dart';

class PriceSummaryScreen extends StatefulWidget {
  const PriceSummaryScreen({super.key});

  @override
  State<PriceSummaryScreen> createState() => _PriceSummaryScreenState();
}

class _PriceSummaryScreenState extends State<PriceSummaryScreen> {
  Map<String, dynamic> _incomingArgs = {};
  bool _argsLoaded = false;
  bool _isLoadingZones = false;

  List<Map<String, dynamic>> _zones = [];
  Map<String, dynamic>? _selectedZone;

  double get _subtotal => CartService.items.fold(
    0.0,
    (sum, item) => sum + (item.price * item.quantity),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_argsLoaded) return;
    final raw = ModalRoute.of(context)?.settings.arguments;
    if (raw is Map) _incomingArgs = Map<String, dynamic>.from(raw);
    _argsLoaded = true;
  }

  double get _deliveryFee => _selectedZone != null
      ? (double.tryParse(_selectedZone!['delivery_fee'].toString()) ?? 0.0)
      : 0.0;

  double get _total =>
      math.max(0, _subtotal + _effectiveDeliveryFee - _offerDiscountAmount);

  Map<String, dynamic>? get _activeOffer {
    final offer = CartService.activeOffer;
    if (offer == null) return null;

    final offerVendorId = int.tryParse(offer['vendor_id']?.toString() ?? '');
    final primaryVendorId = _primaryVendorId;
    if (offerVendorId != null &&
        primaryVendorId != null &&
        offerVendorId != primaryVendorId) {
      return null;
    }
    return offer;
  }

  String get _activeOfferType =>
      _activeOffer?['offer_type']?.toString() ?? 'percentage';

  double get _activeOfferValue {
    final offer = _activeOffer;
    if (offer == null) return 0;
    return double.tryParse(
          (offer['discount_value'] ?? offer['discount_percentage'] ?? 0)
              .toString(),
        ) ??
        0;
  }

  double get _offerDiscountAmount {
    final offer = _activeOffer;
    if (offer == null) return 0;

    final type = _activeOfferType;
    final value = _activeOfferValue;
    if (value <= 0) return 0;

    if (type == 'fixed_amount') {
      return math.min(value, _subtotal);
    }

    if (type == 'product_specific') {
      final productId = int.tryParse(offer['product_id']?.toString() ?? '');
      if (productId == null) return 0;
      final itemSubtotal = CartService.items
          .where((item) => int.tryParse(item.id) == productId)
          .fold<double>(0, (sum, item) => sum + (item.price * item.quantity));
      return itemSubtotal * (value / 100);
    }

    if (type == 'percentage') {
      return _subtotal * (value / 100);
    }

    return 0;
  }

  double get _effectiveDeliveryFee =>
      _activeOfferType == 'free_delivery' && _activeOffer != null
      ? 0
      : _deliveryFee;

  String get _activeOfferLabel {
    final offer = _activeOffer;
    if (offer == null) return 'Offer';
    final name = (offer['name'] ?? offer['title'] ?? 'Offer').toString();
    return name.trim().isEmpty ? 'Offer' : name;
  }

  String get _activeOfferValueLabel {
    if (_activeOfferType == 'free_delivery') return 'Free delivery applied';
    final discount = _offerDiscountAmount;
    if (discount <= 0) return 'Applied';
    return '-\$${discount.toStringAsFixed(2)}';
  }

  // Get primary vendor_id from cart items
  int? get _primaryVendorId {
    for (final item in CartService.items) {
      if (item.vendorId != null) return item.vendorId;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _fetchZones();
  }

  Future<void> _fetchZones() async {
    final vendorId = _primaryVendorId;
    if (vendorId == null) return;

    setState(() => _isLoadingZones = true);
    try {
      // Use the public endpoint (no auth needed for customer zone lookup)
      final response = await ApiService.get(
        '/delivery-zones?vendor_id=$vendorId',
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data is List) {
          final activeZones = (data)
              .map((z) => z as Map<String, dynamic>)
              .where(
                (z) =>
                    z['is_active'] == null ||
                    z['is_active'] == 1 ||
                    z['is_active'] == true,
              )
              .toList();
          setState(() {
            _zones = activeZones;
            // Auto-select first zone if available
            if (_zones.isNotEmpty && _selectedZone == null) {
              _selectedZone = _zones.first;
            }
          });
        }
      }
    } catch (e) {
      debugPrint('DEBUG: Failed to fetch zones: $e');
    } finally {
      if (mounted) setState(() => _isLoadingZones = false);
    }
  }

  void _proceedToPayment() {
    if (_zones.isNotEmpty && _selectedZone == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a delivery zone'),
          backgroundColor: Colors.redAccent,
        ),
      );
      return;
    }

    final vendorId = _primaryVendorId ?? 1;
    final items = CartService.items
        .map(
          (item) => {
            'product_id': int.tryParse(item.id) ?? 0,
            'quantity': item.quantity,
            'price': item.price,
          },
        )
        .toList();

    // Pass all order context to the Delivery Time screen
    Navigator.pushNamed(
      context,
      AppRoutes.deliveryTime,
      arguments: {
        ..._incomingArgs,
        'vendor_id': vendorId,
        'items': items,
        'subtotal': _subtotal,
        'delivery_fee': _deliveryFee,
        'effective_delivery_fee': _effectiveDeliveryFee,
        'discount_amount': _offerDiscountAmount,
        'offer_id': _activeOffer?['id'],
        'offer': _activeOffer,
        'offer_description': _activeOfferLabel,
        'delivery_zone': _selectedZone?['zone_name'] ?? '',
        'delivery_address':
            _incomingArgs['delivery_address'] ??
            _selectedZone?['zone_name'] ??
            'Mogadishu',
        'cart_items': CartService.items,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final bgColor = theme.scaffoldBackgroundColor;
    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: Column(
          children: [
            _buildAppBar(context),
            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.l,
                        AppSpacing.xl,
                        AppSpacing.l,
                        AppSpacing.m,
                      ),
                      child: Text(
                        'Review your order',
                        style: TextStyle(
                          color: cs.onSurface,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),

                    // Zone Selector
                    _buildZoneSelector(),

                    // Order Items
                    _buildSectionHeader(
                      'Order Items',
                      count: '${CartService.items.length} Items',
                    ),
                    ...CartService.items.map((item) => _buildItemTile(item)),

                    const SizedBox(height: AppSpacing.xl),

                    // Price Breakdown
                    _buildPriceBreakdown(),

                    const SizedBox(height: 120),
                  ],
                ),
              ),
            ),
            _buildFooter(context),
          ],
        ),
      ),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.m),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: Icon(Icons.arrow_back, color: cs.onSurface),
            style: IconButton.styleFrom(
              backgroundColor: AppColors.surfaceLight.withOpacity(0.05),
            ),
          ),
          const SizedBox(width: AppSpacing.m),
          Text(
            'Checkout',
            style: TextStyle(
              color: cs.onSurface,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildZoneSelector() {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    return Container(
      margin: const EdgeInsets.symmetric(
        horizontal: AppSpacing.m,
        vertical: AppSpacing.s,
      ),
      padding: const EdgeInsets.all(AppSpacing.l),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(
          color: _selectedZone != null
              ? AppColors.primary.withAlpha(102)
              : borderCol.withAlpha(76),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                ),
                child: const Icon(
                  Icons.location_on,
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
                      'Delivery Zone',
                      style: TextStyle(
                        color: cs.onSurface,
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                    const Text(
                      'Select your area for delivery fee',
                      style: TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.m),
          if (_isLoadingZones)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(8.0),
                child: SizedBox(
                  height: 24,
                  width: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else if (_zones.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
              decoration: BoxDecoration(
                color: isDark
                    ? AppColors.surfaceDark.withAlpha(102)
                    : Colors.grey.shade200,
                borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                border: Border.all(color: borderCol.withAlpha(76)),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_outline,
                    color: cs.onSurfaceVariant,
                    size: 16,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No delivery zones configured for this vendor',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: cs.onSurfaceVariant,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            DropdownButtonFormField<Map<String, dynamic>>(
              initialValue: _selectedZone,
              decoration: InputDecoration(
                filled: true,
                fillColor: cs.surface,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                  borderSide: BorderSide(
                    color: AppColors.border.withOpacity(0.3),
                  ),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                  borderSide: BorderSide(
                    color: AppColors.border.withOpacity(0.3),
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                  borderSide: const BorderSide(color: AppColors.primary),
                ),
              ),
              dropdownColor: AppColors.card,
              style: const TextStyle(color: AppColors.textPrimary),
              icon: const Icon(Icons.keyboard_arrow_down, color: Colors.grey),
              hint: const Text(
                'Select delivery zone',
                style: TextStyle(color: Colors.grey),
              ),
              items: _zones.map((zone) {
                final fee =
                    double.tryParse(zone['delivery_fee'].toString()) ?? 0.0;
                return DropdownMenuItem<Map<String, dynamic>>(
                  value: zone,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        zone['zone_name'].toString(),
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Text(
                        '\$${fee.toStringAsFixed(2)}',
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
              onChanged: (zone) => setState(() => _selectedZone = zone),
            ),

          // Estimated time display
          if (_selectedZone != null &&
              (_selectedZone!['estimated_time'] ?? '').toString().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  const Icon(
                    Icons.schedule,
                    color: AppColors.primary,
                    size: 14,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Estimated: ${_selectedZone!['estimated_time']}',
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, {String? count}) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.l,
        AppSpacing.xl,
        AppSpacing.l,
        AppSpacing.m,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: TextStyle(
              color: cs.onSurface,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          if (count != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : Colors.grey.shade200,
                borderRadius: BorderRadius.circular(AppSpacing.radiusM),
              ),
              child: Text(
                count,
                style: TextStyle(
                  color: cs.onSurface.withAlpha(153),
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildItemTile(CartItemModel item) {
    final cs = Theme.of(context).colorScheme;
    final imageUrl = item.imageUrl.startsWith('/uploads')
        ? '${ApiService.baseUrl.replaceAll('/api', '')}${item.imageUrl}'
        : item.imageUrl;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.l,
        vertical: AppSpacing.s,
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              color: Colors.white12,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              child:
                  imageUrl.startsWith('http') ||
                      item.imageUrl.startsWith('/uploads')
                  ? Image.network(
                      imageUrl,
                      fit: BoxFit.contain,
                      errorBuilder: (c, e, s) =>
                          const Icon(Icons.image, color: Colors.grey),
                    )
                  : Image.asset(
                      item.imageUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (c, e, s) =>
                          const Icon(Icons.image, color: Colors.grey),
                    ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: cs.onSurface,
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                if (item.subtitle != null)
                  Text(
                    item.subtitle!,
                    style: const TextStyle(color: Colors.grey, fontSize: 12),
                  ),
                Text(
                  item.unit.isNotEmpty
                      ? '${item.quantity} ${item.unit}'
                      : 'x${item.quantity}',
                  style: const TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
          ),
          Text(
            '\$${(item.price * item.quantity).toStringAsFixed(2)}',
            style: TextStyle(
              color: cs.onSurface,
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPriceBreakdown() {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(51)
        : Colors.grey.shade100;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.m),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXXL),
        border: Border.all(color: borderCol.withAlpha(76)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Price Details',
            style: TextStyle(color: cs.onSurface, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          _buildPriceRow('Subtotal', '\$${_subtotal.toStringAsFixed(2)}'),
          const SizedBox(height: 12),
          _buildPriceRow(
            'Delivery Fee',
            _selectedZone != null
                ? (_effectiveDeliveryFee == 0.0
                      ? 'FREE'
                      : '\$${_effectiveDeliveryFee.toStringAsFixed(2)}')
                : '--',
            valColor: _effectiveDeliveryFee == 0.0 && _selectedZone != null
                ? AppColors.success
                : null,
          ),
          if (_selectedZone != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '  Zone: ${_selectedZone!['zone_name']}',
                style: TextStyle(
                  color: Colors.grey.withOpacity(0.7),
                  fontSize: 11,
                ),
              ),
            ),
          if (_activeOffer != null) ...[
            const SizedBox(height: 12),
            _buildPriceRow(
              _activeOfferLabel,
              _activeOfferValueLabel,
              valColor: AppColors.success,
            ),
          ],
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Divider(color: AppColors.border),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Total Amount',
                style: TextStyle(
                  color: cs.onSurface,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
              Text(
                '\$${_total.toStringAsFixed(2)}',
                style: const TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  fontSize: 24,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPriceRow(String label, String val, {Color? valColor}) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(color: cs.onSurfaceVariant, fontSize: 14),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            val,
            textAlign: TextAlign.right,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: valColor ?? cs.onSurface,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFooter(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.l,
        AppSpacing.m,
        AppSpacing.l,
        AppSpacing.xl,
      ),
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: borderCol.withAlpha(76))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Total Payable',
                    style: TextStyle(color: Colors.grey, fontSize: 11),
                  ),
                  Text(
                    '\$${_total.toStringAsFixed(2)}',
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                    ),
                  ),
                ],
              ),
              const Icon(
                Icons.verified_user_outlined,
                color: Colors.grey,
                size: 24,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.m),
          CustomButton(
            text: 'Schedule Delivery',
            onPressed: _proceedToPayment,
            icon: const Icon(Icons.calendar_today, color: Colors.white),
          ),
          const SizedBox(height: 8),
          const Text(
            'By continuing, you agree to our Terms of Service.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey, fontSize: 10),
          ),
        ],
      ),
    );
  }
}
