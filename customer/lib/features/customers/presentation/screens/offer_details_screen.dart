import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/utils/cart_service.dart';


class OfferDetailsScreen extends StatefulWidget {
  const OfferDetailsScreen({super.key});

  @override
  State<OfferDetailsScreen> createState() => _OfferDetailsScreenState();
}

class _OfferDetailsScreenState extends State<OfferDetailsScreen> {
  Map<String, dynamic>? _offer;
  bool _isLoading = true;
  int? _trackedViewOfferId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_offer != null || !_isLoading) return;

    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map && args['offer'] is Map) {
      final offer = Map<String, dynamic>.from(args['offer'] as Map);
      _offer = offer;
      _isLoading = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _trackOfferEvent('view', offer: offer);
      });
      return;
    }

    final offerId = args is Map ? args['id'] ?? args['offer_id'] : args;
    final vendorId = args is Map ? args['vendor_id'] : null;
    final notificationHint = args is Map
        ? '${args['notification_title'] ?? ''} ${args['notification_message'] ?? ''}'
        : null;
    if (offerId != null) {
      _fetchOfferById(offerId, vendorId: vendorId);
    } else {
      _fetchLatestOfferForVendor(vendorId, hint: notificationHint);
    }
  }

  Future<void> _fetchOfferById(dynamic offerId, {dynamic vendorId}) async {
    final id = int.tryParse(offerId?.toString() ?? '');
    if (id == null) {
      setState(() => _isLoading = false);
      return;
    }

    try {
      final vendor = int.tryParse(vendorId?.toString() ?? '');
      final endpoint = vendor == null
          ? '/customer/offers/$id'
          : '/customer/offers/$id?vendor_id=$vendor';
      final response = await ApiService.get(endpoint);
      if (response.statusCode == 200 && mounted) {
        final body = jsonDecode(response.body);
        final offer = Map<String, dynamic>.from(body['offer'] as Map);
        setState(() => _offer = offer);
        _trackOfferEvent('view', offer: offer);
      }
    } catch (e) {
      debugPrint('Offer fetch failed: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchLatestOfferForVendor(
    dynamic vendorId, {
    String? hint,
  }) async {
    final id = int.tryParse(vendorId?.toString() ?? '');
    if (id == null) {
      setState(() => _isLoading = false);
      return;
    }

    try {
      final response = await ApiService.get('/customer/offers?vendor_id=$id');
      if (response.statusCode == 200 && mounted) {
        final body = jsonDecode(response.body);
        final offers = body['offers'];
        if (offers is List && offers.isNotEmpty) {
          final offer = _pickOfferFromHint(offers, hint);
          setState(() => _offer = offer);
          _trackOfferEvent('view', offer: offer);
        }
      }
    } catch (e) {
      debugPrint('Vendor offer fetch failed: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Map<String, dynamic> _pickOfferFromHint(List<dynamic> offers, String? hint) {
    final normalizedHint = _normalizedText(hint);
    if (normalizedHint.isNotEmpty) {
      for (final rawOffer in offers) {
        if (rawOffer is! Map) continue;
        final offer = Map<String, dynamic>.from(rawOffer);
        final name = _normalizedText(offer['name'] ?? offer['title']);
        final description = _normalizedText(offer['description']);
        if ((name.isNotEmpty && normalizedHint.contains(name)) ||
            (description.isNotEmpty && normalizedHint.contains(description))) {
          return offer;
        }
      }
    }

    return Map<String, dynamic>.from(offers.first as Map);
  }

  Future<void> _shopNow() async {
    final offer = _offer;
    if (offer == null) return;

    _trackOfferEvent('click', offer: offer);
    await CartService.applyOffer(offer);
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Offer applied to your order'),
        backgroundColor: AppColors.primary,
      ),
    );

    final route = _shoppingRouteForOffer(offer);
    Navigator.pushNamed(
      context,
      route,
      arguments: _shoppingArgsForOffer(offer),
    );
  }

  Future<void> _trackOfferEvent(
    String eventType, {
    required Map<String, dynamic> offer,
  }) async {
    final offerId = int.tryParse(offer['id']?.toString() ?? '');
    if (offerId == null) return;
    if (eventType == 'view' && _trackedViewOfferId == offerId) return;
    if (eventType == 'view') _trackedViewOfferId = offerId;

    try {
      await ApiService.post('/customer/offers/$offerId/analytics', {
        'event_type': eventType,
      });
    } catch (e) {
      debugPrint('Offer analytics failed: $e');
    }
  }

  String _shoppingRouteForOffer(Map<String, dynamic> offer) {
    final kind = _offerKind(offer);

    if (kind == 'gas') {
      return _offerVendorId(offer) != null
          ? AppRoutes.gasCylinderSelection
          : AppRoutes.selectGasStation;
    }
    if (kind == 'spare') {
      return AppRoutes.spareParts;
    }
    return _offerVendorId(offer) != null
        ? AppRoutes.selectFuelType
        : AppRoutes.selectStation;
  }

  Map<String, dynamic> _shoppingArgsForOffer(Map<String, dynamic> offer) {
    final vendorId = _offerVendorId(offer);
    final vendorName =
        (offer['vendor_name'] ?? offer['business_name'] ?? 'Vendor').toString();
    final productHint = _shoppingProductHint(offer);

    final args = <String, dynamic>{
      'offer': offer,
      'offer_id': offer['id'],
      'from_offer': true,
    };

    if (vendorId != null) {
      args['vendor_id'] = vendorId;
      args['vendor'] = {
        'id': vendorId,
        'vendor_id': vendorId,
        'name': vendorName,
        'business_name': vendorName,
        'vendor_name': vendorName,
      };
    }
    if (productHint != null && productHint.trim().isNotEmpty) {
      args['product'] = productHint;
    }
    return args;
  }

  int? _offerVendorId(Map<String, dynamic> offer) {
    return int.tryParse(offer['vendor_id']?.toString() ?? '');
  }

  String _offerKind(Map<String, dynamic> offer) {
    final text = _normalizedText(
      [
        offer['category_name'],
        offer['category'],
        offer['product_name'],
        offer['name'],
        offer['title'],
        offer['description'],
      ].whereType<Object>().join(' '),
    );

    if (text.contains('gas') || text.contains('cylinder')) return 'gas';
    if (text.contains('spare') || text.contains('part')) return 'spare';
    if (text.contains('petrol') ||
        text.contains('diesel') ||
        text.contains('fuel')) {
      return 'fuel';
    }
    return 'fuel';
  }

  String? _shoppingProductHint(Map<String, dynamic> offer) {
    final explicitHint =
        (offer['category_name'] ?? offer['category'] ?? offer['product_name'])
            ?.toString();
    if (explicitHint != null && explicitHint.trim().isNotEmpty) {
      return explicitHint;
    }

    final text = _normalizedText(
      [
        offer['name'],
        offer['title'],
        offer['description'],
      ].whereType<Object>().join(' '),
    );
    final kind = _offerKind(offer);

    if (kind == 'gas') return 'Gas';
    if (kind == 'spare') return 'Spare';
    if (text.contains('diesel') && !text.contains('petrol')) return 'Diesel';
    if (text.contains('petrol') && !text.contains('diesel')) return 'Petrol';
    return 'Petrol/Diesel';
  }

  String _normalizedText(dynamic value) {
    return (value ?? '').toString().trim().toLowerCase();
  }

  String _expiryLabel() {
    final endDate = _offer?['end_date'];
    if (endDate == null || endDate.toString().isEmpty) return '';
    final exp = DateTime.tryParse(endDate.toString());
    if (exp == null) return '';
    final diff = exp.difference(DateTime.now());
    if (diff.isNegative) return 'Expired';
    if (diff.inDays > 1) return 'Expires in ${diff.inDays} days';
    if (diff.inHours >= 1) return 'Expires in ${diff.inHours}h';
    if (diff.inMinutes >= 1) return 'Expires in ${diff.inMinutes}m';
    return 'Expiring soon';
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context);
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = cs.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final surfaceColor = isDark ? AppColors.surfaceDark : Colors.white;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;

    if (_isLoading) {
      return Scaffold(
        backgroundColor: bgColor,
        appBar: AppBar(backgroundColor: bgColor, elevation: 0),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_offer == null) {
      return Scaffold(
        backgroundColor: bgColor,
        appBar: AppBar(
          backgroundColor: bgColor,
          elevation: 0,
          leading: IconButton(
            icon: Icon(Icons.arrow_back, color: textPrimary),
            onPressed: () => Navigator.pop(context),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.local_offer_outlined,
                  size: 64, color: textSecondary.withValues(alpha: 0.4)),
              const SizedBox(height: 16),
              Text('Offer not found',
                  style: TextStyle(color: textPrimary, fontWeight: FontWeight.bold, fontSize: 17)),
              const SizedBox(height: 8),
              Text('This promotion may have expired.',
                  style: TextStyle(color: textSecondary, fontSize: 13)),
            ],
          ),
        ),
      );
    }

    final discountType = _offer!['offer_type']?.toString() ?? 'percentage';
    final discountValue =
        _offer!['discount_value'] ?? _offer!['discount_percentage'] ?? 0;
    final discountText = discountType == 'percentage'
        ? '$discountValue% OFF'
        : discountType == 'free_delivery'
        ? 'FREE DELIVERY'
        : '\$$discountValue OFF';

    final vendorName =
        (_offer!['vendor_name'] ?? _offer!['business_name'] ?? 'Vendor').toString();
    final offerName = (_offer!['name'] ?? _offer!['title'] ?? 'Special Offer').toString();
    final description = _offer!['description']?.toString() ?? '';
    final kind = _offerKind(_offer!);

    // Price calculations
    final originalPrice = double.tryParse(
        (_offer!['original_price'] ?? _offer!['price'] ?? '').toString());
    final discountedPrice = double.tryParse(
        _offer!['discounted_price']?.toString() ?? '');
    final computedDiscount = originalPrice != null && discountType == 'percentage'
        ? originalPrice * (double.tryParse(discountValue.toString()) ?? 0) / 100
        : null;
    final finalPrice = discountedPrice ??
        (originalPrice != null && computedDiscount != null
            ? originalPrice - computedDiscount
            : null);

    // Expiry
    final expiryLabel = _expiryLabel();

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Offer Details',
          style: TextStyle(color: textPrimary, fontWeight: FontWeight.bold),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Hero card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      AppColors.primary,
                      AppColors.primary.withValues(alpha: 0.75),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            shape: BoxShape.circle,
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: _buildLogoWidget(_offer!['vendor_logo'] ?? _offer!['logo']),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                offerName,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  height: 1.2,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                vendorName,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.85),
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        discountText,
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Info card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: surfaceColor,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: borderColor.withValues(alpha: 0.7)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Vendor
                    _InfoRow(
                      icon: Icons.storefront,
                      label: 'Vendor',
                      value: vendorName,
                      textPrimary: textPrimary,
                      textSecondary: textSecondary,
                    ),
                    const SizedBox(height: 14),

                    // Gas Type (only if gas offer)
                    if (kind == 'gas') ...[
                      _InfoRow(
                        icon: Icons.local_fire_department,
                        label: 'Gas Type',
                        value: (_offer!['product_name'] ?? _offer!['category_name'] ?? _offer!['name'] ?? _offer!['title'] ?? 'Cooking Gas').toString(),
                        textPrimary: textPrimary,
                        textSecondary: textSecondary,
                      ),
                      const SizedBox(height: 14),
                    ],

                    // Discount
                    _InfoRow(
                      icon: Icons.discount,
                      label: 'Discount',
                      value: discountText,
                      valueColor: AppColors.primary,
                      textPrimary: textPrimary,
                      textSecondary: textSecondary,
                    ),

                    // Price breakdown
                    if (originalPrice != null) ...[
                      const SizedBox(height: 14),
                      _InfoRow(
                        icon: Icons.attach_money,
                        label: kind == 'gas' ? 'Original Price per KG' : 'Original Price',
                        value: '\$${originalPrice.toStringAsFixed(2)}${kind == 'gas' ? ' / KG' : ''}',
                        strikethrough: true,
                        textPrimary: textPrimary,
                        textSecondary: textSecondary,
                      ),
                    ],
                    if (finalPrice != null) ...[
                      const SizedBox(height: 14),
                      _InfoRow(
                        icon: Icons.price_check,
                        label: kind == 'gas' ? 'Offer Price per KG' : 'Discounted Price',
                        value: '\$${finalPrice.toStringAsFixed(2)}${kind == 'gas' ? ' / KG' : ''}',
                        valueColor: AppColors.success,
                        bold: true,
                        textPrimary: textPrimary,
                        textSecondary: textSecondary,
                      ),
                    ],

                    // Expiry
                    if (expiryLabel.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      _InfoRow(
                        icon: Icons.access_time,
                        label: 'Validity',
                        value: expiryLabel,
                        valueColor: expiryLabel == 'Expired'
                            ? AppColors.error
                            : null,
                        textPrimary: textPrimary,
                        textSecondary: textSecondary,
                      ),
                    ],

                    // Description
                    if (description.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      Divider(color: borderColor.withValues(alpha: 0.5)),
                      const SizedBox(height: 14),
                      Text(
                        'About this offer',
                        style: TextStyle(
                          color: textPrimary,
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        description,
                        style: TextStyle(
                          color: textSecondary,
                          fontSize: 14,
                          height: 1.5,
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              const SizedBox(height: 28),

              // Order Now button
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton.icon(
                  onPressed: expiryLabel == 'Expired' ? null : _shopNow,
                  icon: const Icon(Icons.shopping_cart_checkout),
                  label: Text(
                    expiryLabel == 'Expired' ? 'Offer Expired' : 'Order Now',
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: expiryLabel == 'Expired'
                        ? Colors.grey
                        : AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    elevation: 0,
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLogoWidget(dynamic logo, {double size = 52, IconData fallbackIcon = Icons.local_offer}) {
    if (logo == null || logo.toString().isEmpty) {
      return Icon(fallbackIcon, color: Colors.white, size: size * 0.5);
    }
    final logoStr = logo.toString();
    final url = logoStr.startsWith('http') ? logoStr : '${ApiService.baseUrl.replaceAll('/api', '')}$logoStr';
    return Image.network(
      url,
      width: size,
      height: size,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) {
        return Icon(fallbackIcon, color: Colors.white, size: size * 0.5);
      },
    );
  }
}

/// Small reusable info row widget for the offer details card.
class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;
  final bool bold;
  final bool strikethrough;
  final Color textPrimary;
  final Color textSecondary;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.textPrimary,
    required this.textSecondary,
    this.valueColor,
    this.bold = false,
    this.strikethrough = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: AppColors.primary, size: 18),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: textSecondary,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: TextStyle(
                  color: valueColor ?? textPrimary,
                  fontSize: 15,
                  fontWeight: bold ? FontWeight.bold : FontWeight.w500,
                  decoration: strikethrough ? TextDecoration.lineThrough : null,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

