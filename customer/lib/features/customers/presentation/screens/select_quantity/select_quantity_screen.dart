import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../../core/constants/app_colors.dart';
import '../../../../../core/constants/app_spacing.dart';
import '../../../../../core/routes/app_routes.dart';
import '../../../../../core/utils/cart_service.dart';
import 'widgets/quantity_card.dart';
import 'widgets/quantity_slider.dart';
import 'widgets/quick_select_buttons.dart';
import 'widgets/price_summary_bar.dart';
import '../../../../../core/theme/theme_provider.dart';
import '../../models/cart_item_model.dart';

class SelectQuantityScreen extends StatefulWidget {
  const SelectQuantityScreen({super.key});

  @override
  State<SelectQuantityScreen> createState() => _SelectQuantityScreenState();
}

class _SelectQuantityScreenState extends State<SelectQuantityScreen> {
  double _quantity = 5.0;
  dynamic _vendor;
  dynamic _product;
  Map<String, dynamic>? _offer;
  int? _offerId;
  double _originalRate = 1.50;
  double _ratePerUnit = 1.50;
  final double _taxRate = 0.08;

  /// Unit: 'KG' for gas, 'L' for liquid fuel
  String _unit = 'L';
  bool get _isKg => _unit.toUpperCase() == 'KG';

  // Formula: total_price = quantity * ratePerUnit
  double get _totalAmount => _quantity * _ratePerUnit;
  double get _originalTotalAmount => _quantity * _originalRate;
  double get _offerDiscountAmount =>
      ((_originalRate - _ratePerUnit).clamp(0.0, _originalRate)) * _quantity;

  // No embedded taxes on gas products
  double get _taxes => _isKg ? 0.0 : _totalAmount * _taxRate;

  final TextEditingController _manualController = TextEditingController();
  String? _errorMessage;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    try {
      final rawArgs = ModalRoute.of(context)!.settings.arguments;
      final args = (rawArgs is Map)
          ? Map<String, dynamic>.from(rawArgs)
          : <String, dynamic>{};

      final rawVendor = args['vendor'];
      _vendor = (rawVendor is Map)
          ? Map<String, dynamic>.from(rawVendor)
          : <String, dynamic>{};

      final rawProduct = args['product'];
      _product = (rawProduct is Map)
          ? Map<String, dynamic>.from(rawProduct)
          : <String, dynamic>{};

      final rawOffer = args['offer'];
      _offer = (rawOffer is Map) ? Map<String, dynamic>.from(rawOffer) : null;
      _offerId = _asInt(args['offer_id'] ?? _offer?['id']);
      final restoredQuantity = _asDouble(
        args['quantity'] ?? _product['quantity'],
        fallback: -1,
      );

      debugPrint('DEBUG: [SelectQuantityScreen] vendor: $_vendor');
      debugPrint('DEBUG: [SelectQuantityScreen] product: $_product');

      setState(() {
        // Detect unit from product
        final rawUnit = (_product['unit'] ?? '').toString().toUpperCase();
        _unit = rawUnit == 'KG' ? 'KG' : 'L';

        // Default starting quantity
        _quantity = restoredQuantity > 0
            ? restoredQuantity
            : (_isKg ? 5.0 : 55.0);

        final originalRate = _asDouble(
          _product['original_price'] ??
              _product['selling_price'] ??
              _product['price'],
          fallback: 1.50,
        );
        var effectiveRate = _asDouble(
          _product['discounted_price'] ?? _product['price'],
          fallback: originalRate,
        );

        if (_offer != null) {
          effectiveRate = _applyOfferToRate(originalRate, _offer!);
        }

        _originalRate = originalRate;
        _ratePerUnit = effectiveRate;
        _manualController.text = _formatQty(_quantity);
        _logDebugInfo();
      });
    } catch (e) {
      debugPrint('DEBUG: [SelectQuantityScreen] Error reading args: $e');
      _product = <String, dynamic>{};
      _vendor = <String, dynamic>{};
    }
  }

  double _asDouble(dynamic value, {double fallback = 0.0}) {
    if (value == null) return fallback;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? fallback;
  }

  int? _asInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString());
  }

  double _applyOfferToRate(double rate, Map<String, dynamic> offer) {
    final type = offer['offer_type']?.toString() ?? 'percentage';
    final value = _asDouble(
      offer['discount_value'] ?? offer['discount_percentage'],
    );
    if (value <= 0) return rate;
    if (type == 'percentage') {
      return rate * (1 - (value / 100));
    }
    if (type == 'fixed_amount') {
      return (rate - value).clamp(0.0, rate).toDouble();
    }
    return rate;
  }

  CartItemModel? _buildCartItemFromSelection() {
    final product = _product is Map
        ? Map<String, dynamic>.from(_product as Map)
        : <String, dynamic>{};
    final vendor = _vendor is Map
        ? Map<String, dynamic>.from(_vendor as Map)
        : <String, dynamic>{};

    final productId = _asInt(product['id'] ?? product['product_id']);
    if (productId == null) return null;

    final vendorId = _asInt(
      vendor['id'] ?? vendor['vendor_id'] ?? product['vendor_id'],
    );
    final productName = (product['product_name'] ?? product['name'] ?? 'Fuel')
        .toString();
    final vendorName =
        (vendor['vendor_name'] ??
                vendor['business_name'] ??
                vendor['name'] ??
                '')
            .toString();
    final imageUrl = (product['image_url'] ?? product['image'] ?? '')
        .toString();
    final stock =
        _asInt(product['stock'] ?? product['stock_quantity']) ??
        _quantity.round();

    return CartItemModel(
      id: productId.toString(),
      title: productName.trim().isEmpty ? 'Fuel' : productName.trim(),
      subtitle: vendorName.trim().isEmpty ? null : vendorName.trim(),
      imageUrl: imageUrl,
      price: _ratePerUnit,
      priceUnit: _unit.isEmpty ? '' : '/$_unit',
      quantity: _quantity.round(),
      vendorId: vendorId,
      vendorName: vendorName.trim().isEmpty ? null : vendorName.trim(),
      unit: _unit,
      stock: stock,
      isActive: product['is_active'] != false,
    );
  }

  Map<String, dynamic> _buildDeliveryArgs() {
    return {
      'vendor': _vendor,
      'product': {
        ...Map<String, dynamic>.from(_product as Map),
        'price': _originalRate,
        'selling_price': _originalRate,
        'original_price': _originalRate,
        'discounted_price': _ratePerUnit,
        'unit': _unit,
      },
      'quantity': _quantity,
      'unit': _unit,
      'total': _originalTotalAmount,
      'effective_total': _totalAmount,
      'discount_amount': _offerDiscountAmount,
      if (_offer != null) 'offer': _offer,
      if (_offerId != null) 'offer_id': _offerId,
      if (_offer != null) 'from_offer': true,
      if (_offer != null)
        'offer_description': (_offer?['name'] ?? _offer?['title'] ?? 'Offer')
            .toString(),
    };
  }

  void _continueToDelivery() {
    unawaited(_addSelectionToCartAndContinue());
  }

  Future<void> _addSelectionToCartAndContinue() async {
    final cartItem = _buildCartItemFromSelection();
    if (cartItem != null) {
      final error = await CartService.addItem(cartItem);
      if (!mounted) return;
      if (error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error), backgroundColor: AppColors.error),
        );
        return;
      }
    }

    if (!mounted) return;

    Navigator.pushNamed(
      context,
      AppRoutes.deliveryTime,
      arguments: _buildDeliveryArgs(),
    );
  }

  void _goHome() {
    Navigator.pushNamedAndRemoveUntil(
      context,
      AppRoutes.home,
      (route) => false,
    );
  }

  @override
  void initState() {
    super.initState();
    _manualController.text = _formatQty(_quantity);
  }

  double _normalizeQty(double value) {
    final max = _isKg ? 999.0 : 100.0;
    return value.roundToDouble().clamp(1.0, max);
  }

  String _formatQty(double value) {
    return _normalizeQty(value).toStringAsFixed(0);
  }

  void _logDebugInfo() {
    debugPrint('DEBUG [SelectQuantityScreen]: quantity: $_quantity $_unit');
    debugPrint('DEBUG [SelectQuantityScreen]: rate_per_unit: $_ratePerUnit');
    debugPrint('DEBUG [SelectQuantityScreen]: calculated total: $_totalAmount');
    if (!_isKg) {
      debugPrint('DEBUG [SelectQuantityScreen]: tax calculation: $_taxes');
    }
  }

  void _updateQty(double val) {
    setState(() {
      _quantity = _normalizeQty(val);
      _errorMessage = null;
      _manualController.text = _formatQty(_quantity);
      _logDebugInfo();
    });
  }

  void _onManualInputChanged(String val) {
    if (val.isEmpty) {
      setState(() {
        _quantity = 1.0;
        _errorMessage = 'Minimum order is 1 ${_isKg ? "KG" : "Liter"}';
        _logDebugInfo();
      });
      return;
    }
    final dVal = double.tryParse(val);
    final max = _isKg ? 999.0 : 100.0;
    if (dVal == null || dVal <= 0 || dVal < 1.0) {
      setState(() {
        _quantity = 1.0;
        _errorMessage = 'Minimum order is 1 ${_isKg ? "KG" : "Liter"}';
        _logDebugInfo();
      });
    } else if (dVal > max) {
      setState(() {
        _quantity = max;
        _errorMessage =
            'Maximum allowed is ${max.toStringAsFixed(0)} ${_isKg ? "KG" : "Liters"}';
        _logDebugInfo();
      });
    } else {
      setState(() {
        _quantity = _normalizeQty(dVal);
        _errorMessage = null;
        _manualController.text = _formatQty(_quantity);
        _manualController.selection = TextSelection.fromPosition(
          TextPosition(offset: _manualController.text.length),
        );
        _logDebugInfo();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context);
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final discountPct = _originalRate > 0
        ? ((_originalRate - _ratePerUnit) / _originalRate * 100).clamp(
            0.0,
            100.0,
          )
        : 0.0;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: theme.scaffoldBackgroundColor,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: Icon(Icons.arrow_back, color: colors.onSurface),
        ),
        centerTitle: true,
        title: Text(
          'Select Quantity',
          style: TextStyle(
            color: colors.onSurface,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        actions: [
          IconButton(
            onPressed: _goHome,
            icon: Icon(Icons.home_outlined, color: colors.onSurface),
            tooltip: 'Home',
          ),
        ],
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
                    // Title changes based on unit
                    Text(
                      _isKg ? 'How many KG do you need?' : 'How much fuel?',
                      style: TextStyle(
                        color: colors.onSurface,
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _isKg
                          ? 'Select the weight for your gas delivery'
                          : 'Select the exact amount for your delivery',
                      style: TextStyle(
                        color: colors.onSurfaceVariant,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),

                    // Gas: price info strip
                    if (_isKg) ...[
                      const SizedBox(height: 16),
                      _buildGasPriceStrip(discountPct),
                    ],

                    const SizedBox(height: AppSpacing.xl),

                    // Big quantity display card
                    QuantityCard(
                      quantity: _quantity,
                      estimatedPrice: _totalAmount,
                      unit: _unit,
                    ),

                    const SizedBox(height: AppSpacing.xxl),

                    // Slider (liquid) or Stepper (gas) inside QuantitySlider
                    QuantitySlider(
                      value: _quantity,
                      rate: _ratePerUnit,
                      onChanged: _updateQty,
                      unit: _unit,
                    ),

                    // Manual input (only for liquid fuel — gas uses the stepper)
                    if (!_isKg) ...[
                      const SizedBox(height: AppSpacing.xl),
                      Text(
                        'MANUAL INPUT',
                        style: TextStyle(
                          color: colors.onSurfaceVariant,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.5,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.m),
                      _buildManualInput(),
                    ],

                    if (_errorMessage != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _errorMessage!,
                        style: const TextStyle(
                          color: AppColors.error,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],

                    const SizedBox(height: AppSpacing.xl),
                    Text(
                      'QUICK SELECT',
                      style: TextStyle(
                        color: colors.onSurfaceVariant,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.m),
                    QuickSelectButtons(
                      currentValue: _quantity,
                      onSelected: _updateQty,
                      unit: _unit,
                    ),

                    // Gas: dynamic total breakdown
                    if (_isKg) ...[
                      const SizedBox(height: AppSpacing.xl),
                      _buildKgTotalBreakdown(discountPct),
                    ],

                    const SizedBox(height: AppSpacing.xl),
                  ],
                ),
              ),
            ),
            PriceSummaryBar(
              total: _totalAmount,
              taxes: _taxes,
              onContinue: _continueToDelivery,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGasPriceStrip(double discountPct) {
    final colors = Theme.of(context).colorScheme;
    final hasDiscount = discountPct > 0.1;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.08),
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: AppColors.primary.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.propane_tank, color: AppColors.primary, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  (_product['product_name'] ?? 'Gas').toString(),
                  style: TextStyle(
                    color: colors.onSurface,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                Text(
                  hasDiscount
                      ? '\$${_ratePerUnit.toStringAsFixed(2)} / KG  (was \$${_originalRate.toStringAsFixed(2)})'
                      : '\$${_ratePerUnit.toStringAsFixed(2)} / KG',
                  style: TextStyle(
                    color: colors.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          if (hasDiscount)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
              ),
              child: Text(
                '${discountPct.toStringAsFixed(0)}% OFF',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 11,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildKgTotalBreakdown(double discountPct) {
    final colors = Theme.of(context).colorScheme;
    final hasDiscount = discountPct > 0.1;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.l),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.06),
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: AppColors.primary.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${_quantity.toStringAsFixed(0)} KG × \$${_ratePerUnit.toStringAsFixed(2)} / KG',
            style: TextStyle(
              color: colors.onSurfaceVariant,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Total',
                style: TextStyle(
                  color: colors.onSurface,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                '\$${_totalAmount.toStringAsFixed(2)}',
                style: const TextStyle(
                  color: AppColors.primary,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          if (hasDiscount) ...[
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Discount Applied',
                  style: TextStyle(
                    color: Colors.green.shade400,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  '${discountPct.toStringAsFixed(0)}% OFF (-\$${_offerDiscountAmount.toStringAsFixed(2)})',
                  style: TextStyle(
                    color: Colors.green.shade400,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildManualInput() {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return Container(
      height: 54,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(
          color: _errorMessage != null
              ? AppColors.error
              : colors.outlineVariant,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _manualController,
              cursorColor: AppColors.primary,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              style: TextStyle(
                color: colors.onSurface,
                fontWeight: FontWeight.bold,
              ),
              decoration: InputDecoration(
                filled: true,
                fillColor: isDark ? colors.surface : AppColors.surfaceLight,
                hintText: 'Enter amount...',
                hintStyle: TextStyle(
                  color: colors.onSurfaceVariant,
                  fontSize: 14,
                ),
                contentPadding: EdgeInsets.zero,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
              ),
              onChanged: _onManualInputChanged,
            ),
          ),
          const Text(
            'LITRES',
            style: TextStyle(
              color: AppColors.primary,
              fontSize: 12,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}
