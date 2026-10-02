import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/theme/theme_provider.dart';

class SelectFuelTypeScreen extends StatefulWidget {
  const SelectFuelTypeScreen({super.key});

  @override
  State<SelectFuelTypeScreen> createState() => _SelectFuelTypeScreenState();
}

class _SelectFuelTypeScreenState extends State<SelectFuelTypeScreen> {
  int _selectedOptionIndex = 0;
  List<dynamic> _products = [];
  bool _isLoading = true;
  dynamic _vendor;
  Map<String, dynamic>? _offer;
  int? _offerId;
  String? _selectedProductId;
  bool _didFetchProducts = false;

  String? _category;

  double _asDouble(dynamic value, {double fallback = 0.0}) {
    if (value == null) return fallback;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? fallback;
  }

  int _asInt(dynamic value, {int fallback = 0}) {
    if (value == null) return fallback;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString()) ?? fallback;
  }

  void _goHome() {
    Navigator.pushNamedAndRemoveUntil(
      context,
      AppRoutes.home,
      (route) => false,
    );
  }

  String _productSearchText(dynamic product) {
    if (product is! Map) return '';
    return [
      product['product_name'],
      product['name'],
      product['category'],
      product['description'],
      product['unit'],
    ].where((value) => value != null).join(' ').toLowerCase();
  }

  bool _isPetrolDieselProduct(dynamic product) {
    final text = _productSearchText(product);
    final isFuel = RegExp(r'\b(petrol|diesel|fuel)\b').hasMatch(text);
    final isGas = RegExp(r'\b(gas|gass|lpg|cylinder)\b').hasMatch(text);
    final isSpare = RegExp(
      r'\b(spare|part|parts|machine|engine|battery|brake|tyre|tire|spark)\b',
    ).hasMatch(text);
    return isFuel && !isGas && !isSpare;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final rawArgs = ModalRoute.of(context)?.settings.arguments;
    if (rawArgs != null && rawArgs is Map) {
      final args = Map<String, dynamic>.from(rawArgs);
      if (args['offer'] is Map) {
        _offer = Map<String, dynamic>.from(args['offer'] as Map);
        _offerId = _asInt(args['offer_id'] ?? _offer?['id'], fallback: 0);
        if (_offerId == 0) _offerId = null;
      }
      if (args.containsKey('vendor')) {
        _vendor = args['vendor'];
        final rawProduct = args['product'];
        if (rawProduct is Map) {
          final product = Map<String, dynamic>.from(rawProduct);
          final category = (product['category'] ?? product['product_category'])
              ?.toString();
          _category = category != null && category.trim().isNotEmpty
              ? category.trim()
              : null;

          final selectedProductId = _asInt(
            product['id'] ?? product['product_id'],
            fallback: 0,
          );
          _selectedProductId = selectedProductId > 0
              ? selectedProductId.toString()
              : _selectedProductId;
        } else {
          final category = rawProduct?.toString().trim();
          _category = category != null && category.isNotEmpty ? category : null;
        }
      } else {
        _vendor = args;
      }

      final selectedProductId = args['selected_product_id'];
      if (selectedProductId != null) {
        final selectedId = selectedProductId.toString().trim();
        if (selectedId.isNotEmpty) {
          _selectedProductId = selectedId;
        }
      }
    }

    if (_vendor != null && !_didFetchProducts) {
      _didFetchProducts = true;
      _fetchProducts();
    }
  }

  List<dynamic> _productsForSelectedOffer(List<dynamic> products) {
    if (_offer == null || products.isEmpty) return products;

    final matchingProducts = _offerId == null
        ? <dynamic>[]
        : products.where((product) {
            if (product is! Map) return false;
            return _asInt(product['offer_id'], fallback: -1) == _offerId;
          }).toList();

    final offerProducts = matchingProducts.isNotEmpty
        ? matchingProducts
        : products.map((product) {
            if (product is! Map) return product;
            final mapped = Map<String, dynamic>.from(product);
            final originalPrice = _asDouble(
              mapped['original_price'] ??
                  mapped['selling_price'] ??
                  mapped['price'],
            );
            final offerType = _offer?['offer_type']?.toString() ?? 'percentage';
            final offerValue = _asDouble(
              _offer?['discount_value'] ?? _offer?['discount_percentage'],
            );
            double discountedPrice = originalPrice;
            if (offerValue > 0 && offerType == 'percentage') {
              discountedPrice = originalPrice * (1 - (offerValue / 100));
            } else if (offerValue > 0 && offerType == 'fixed_amount') {
              discountedPrice = (originalPrice - offerValue).clamp(
                0,
                originalPrice,
              );
            }
            mapped['original_price'] = originalPrice;
            mapped['discounted_price'] = discountedPrice;
            mapped['price'] = discountedPrice;
            mapped['selling_price'] = discountedPrice;
            mapped['has_offer'] = 1;
            mapped['offer_id'] = _offer?['id'];
            mapped['offer_type'] = offerType;
            mapped['offer_badge'] = offerType == 'percentage'
                ? '${offerValue.toStringAsFixed(0)}% OFF'
                : offerType == 'fixed_amount'
                ? '\$${offerValue.toStringAsFixed(2)} OFF'
                : 'OFFER';
            return mapped;
          }).toList();

    offerProducts.sort((a, b) {
      final aOffer =
          a is Map && (a['has_offer'] == 1 || a['has_offer'] == true);
      final bOffer =
          b is Map && (b['has_offer'] == 1 || b['has_offer'] == true);
      if (aOffer != bOffer) return aOffer ? -1 : 1;
      return 0;
    });
    return offerProducts;
  }

  bool _matchesSelectedProductId(dynamic product, String selectedProductId) {
    if (product is! Map) return false;
    final productId = (product['id'] ?? product['product_id'])?.toString();
    return productId == selectedProductId;
  }

  Future<void> _fetchProducts() async {
    print('DEBUG: [SelectFuelTypeScreen] _fetchProducts called');
    print('DEBUG: Selected vendor_id: ${_vendor?['id']}');
    print('DEBUG: Selected category: $_category');

    try {
      String endpoint = '/customer/vendors/${_vendor['id']}/products';
      if (_category != null) {
        endpoint += '?category=${Uri.encodeComponent(_category!)}';
      }
      print('DEBUG: Full Request URL: ${ApiService.baseUrl}$endpoint');

      final response = await ApiService.get(endpoint);
      print('DEBUG: API Status Code: ${response.statusCode}');
      print('DEBUG: API Response Body: ${response.body}');

      if (response.statusCode == 200) {
        final Map<String, dynamic> responseData = jsonDecode(response.body);
        final List<dynamic> products = responseData['data'] ?? [];

        print('DEBUG: Mapped products length: ${products.length}');
        if (products.isNotEmpty) {
          print('DEBUG: First product returned: ${products[0]}');
        }

        setState(() {
          final fuelProducts = products.where(_isPetrolDieselProduct).toList();
          _products = _productsForSelectedOffer(fuelProducts);
          if (_selectedProductId != null) {
            final selectedIndex = _products.indexWhere(
              (product) =>
                  _matchesSelectedProductId(product, _selectedProductId!),
            );
            _selectedOptionIndex = selectedIndex >= 0 ? selectedIndex : 0;
          } else {
            _selectedOptionIndex = 0;
          }
        });
      }
    } catch (e, stackTrace) {
      print('DEBUG: Error fetching products: $e');
      print('DEBUG: StackTrace: $stackTrace');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // Top App Bar
            _buildAppBar(context),

            // Progress Indicator
            _buildProgressIndicator(),

            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(
                        vertical: AppSpacing.m,
                      ),
                      child: Column(
                        children: [
                          // Hero Section/Visual
                          _buildHeroVisual(),

                          // Fuel Options
                          _products.isEmpty
                              ? Padding(
                                  padding: const EdgeInsets.all(AppSpacing.l),
                                  child: const Text(
                                    'No products available for this vendor',
                                    style: TextStyle(color: Colors.white),
                                  ),
                                )
                              : Padding(
                                  padding: const EdgeInsets.all(AppSpacing.l),
                                  child: Column(
                                    children: List.generate(
                                      _products.length,
                                      (index) => _buildFuelOption(
                                        index,
                                        _products[index],
                                      ),
                                    ),
                                  ),
                                ),

                          // Disclaimer
                          _buildDisclaimer(),
                        ],
                      ),
                    ),
            ),

            // Footer Action
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
          ),
          Expanded(
            child: Text(
              _category ?? 'Product Selection',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: cs.onSurface,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          IconButton(
            onPressed: _goHome,
            icon: Icon(Icons.home_outlined, color: cs.onSurface),
            tooltip: 'Home',
          ),
        ],
      ),
    );
  }

  Widget _buildProgressIndicator() {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Ordering Progress',
                style: TextStyle(
                  color: cs.onSurface,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const Text(
                'Step 1 of 3',
                style: TextStyle(
                  color: AppColors.primary,
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
            child: LinearProgressIndicator(
              value: 0.33,
              backgroundColor: isDark
                  ? AppColors.surfaceDark.withAlpha(77)
                  : Colors.grey.shade300,
              color: AppColors.primary,
              minHeight: 6,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroVisual() {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
      child: Container(
        height: 160,
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppColors.primary.withAlpha(51),
              AppColors.primary.withAlpha(13),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(color: borderCol.withAlpha(127)),
        ),
        child: Stack(
          children: [
            Positioned(
              top: 18,
              right: 18,
              child: _vendor != null
                  ? _buildLogoWidget(
                      _vendor['logo'] ?? _vendor['logo_url'],
                      size: 68,
                    )
                  : Icon(
                      Icons.local_gas_station,
                      size: 68,
                      color: AppColors.primary.withAlpha(77),
                    ),
            ),
            Positioned(
              bottom: 16,
              left: 16,
              right: 110,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Choose your fuel',
                    style: TextStyle(
                      color: cs.onSurface,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    'Select the best option for your vehicle',
                    style: TextStyle(
                      color: cs.onSurface.withAlpha(153),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFuelOption(int index, dynamic product) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final isSelected = _selectedOptionIndex == index;

    final price = _asDouble(product['price'] ?? product['selling_price']);
    final stock = _asInt(product['stock'] ?? product['stock_quantity']);
    final isActive = product['is_active'] != false;
    final isAvailable = price > 0 && stock > 0 && isActive;

    final unit = (product['unit'] ?? '').toString().toLowerCase();
    final isKg =
        unit == 'kg' ||
        (product['category'] ?? '').toString().toLowerCase().contains('gas') ||
        (product['product_name'] ?? '').toString().toLowerCase().contains(
          'gas',
        );

    return GestureDetector(
      onTap: isAvailable
          ? () => setState(() => _selectedOptionIndex = index)
          : null,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.m),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: !isAvailable
              ? AppColors.error.withOpacity(0.04)
              : isSelected
              ? AppColors.primary.withAlpha(13)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(
            color: !isAvailable
                ? AppColors.error.withOpacity(0.3)
                : isSelected
                ? AppColors.primary
                : borderCol.withAlpha(127),
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Radio(
              value: index,
              groupValue: _selectedOptionIndex,
              onChanged: isAvailable
                  ? (val) => setState(() => _selectedOptionIndex = val as int)
                  : null,
              activeColor: AppColors.primary,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          (product['product_name'] ?? 'Fuel').toString(),
                          style: TextStyle(
                            color: isAvailable
                                ? cs.onSurface
                                : cs.onSurface.withAlpha(100),
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.s),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: !isAvailable
                              ? AppColors.error.withOpacity(0.12)
                              : isSelected
                              ? AppColors.primary.withAlpha(51)
                              : cs.surface,
                          borderRadius: BorderRadius.circular(
                            AppSpacing.radiusFull,
                          ),
                        ),
                        child: Text(
                          !isAvailable
                              ? (price <= 0 ? 'PRICING ERROR' : 'UNAVAILABLE')
                              : (product['offer_badge'] ??
                                        product['category'] ??
                                        '')
                                    .toString(),
                          style: TextStyle(
                            color: !isAvailable
                                ? AppColors.error
                                : isSelected
                                ? Colors.white
                                : cs.onSurface.withAlpha(153),
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        price > 0 ? '\$' : '',
                        style: TextStyle(
                          color: price > 0
                              ? AppColors.primary
                              : AppColors.error,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        price > 0 ? price.toStringAsFixed(2) : 'N/A',
                        style: TextStyle(
                          color: price > 0
                              ? AppColors.primary
                              : AppColors.error,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        price > 0 ? (isKg ? ' / KG' : ' / litre') : '',
                        style: TextStyle(
                          color: cs.onSurface.withAlpha(153),
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: cs.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusM),
              ),
              child: Icon(
                !isAvailable
                    ? Icons.block_outlined
                    : isKg
                    ? Icons.propane_tank
                    : Icons.local_gas_station,
                color: isAvailable
                    ? cs.onSurface.withAlpha(153)
                    : AppColors.error.withAlpha(153),
                size: 20,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDisclaimer() {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.m),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(AppSpacing.radiusL),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info, color: cs.onSurface.withAlpha(153), size: 16),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Prices are updated every hour based on market rates. Delivery fees will be calculated at the final step.',
                style: TextStyle(
                  color: cs.onSurface.withAlpha(153),
                  fontSize: 11,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFooter(BuildContext context) {
    // Validate the currently selected product
    final selectedProduct = _products.isNotEmpty
        ? _products[_selectedOptionIndex]
        : null;
    final price = selectedProduct != null
        ? _asDouble(
            selectedProduct['price'] ?? selectedProduct['selling_price'],
          )
        : 0.0;
    final stock = selectedProduct != null
        ? _asInt(selectedProduct['stock'] ?? selectedProduct['stock_quantity'])
        : 0;
    final isActive = selectedProduct != null
        ? selectedProduct['is_active'] != false
        : false;
    final canContinue =
        selectedProduct != null && price > 0 && stock > 0 && isActive;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.l),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!canContinue && selectedProduct != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                price <= 0
                    ? 'This product has invalid pricing and cannot be ordered.'
                    : stock <= 0
                    ? 'This product is out of stock.'
                    : 'This product is unavailable.',
                style: const TextStyle(
                  color: AppColors.error,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          Opacity(
            opacity: canContinue ? 1.0 : 0.5,
            child: CustomButton(
              text: 'Continue to Amount',
              onPressed: canContinue
                  ? () {
                      Navigator.pushNamed(
                        context,
                        AppRoutes.selectQuantity,
                        arguments: {
                          'vendor': _vendor,
                          'product': _products[_selectedOptionIndex],
                          if (_offer != null) 'offer': _offer,
                          if (_offerId != null) 'offer_id': _offerId,
                          if (_offer != null) 'from_offer': true,
                        },
                      );
                    }
                  : null,
              icon: const Icon(
                Icons.arrow_forward,
                color: Colors.white,
                size: 20,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogoWidget(
    dynamic logo, {
    double size = 80,
    IconData fallbackIcon = Icons.local_gas_station,
  }) {
    if (logo == null || logo.toString().isEmpty) {
      return Icon(fallbackIcon, color: AppColors.primary, size: size * 0.5);
    }
    final logoStr = logo.toString();
    final url = logoStr.startsWith('http')
        ? logoStr
        : '${ApiService.baseUrl.replaceAll('/api', '')}$logoStr';
    return Image.network(
      url,
      width: size,
      height: size,
      fit: BoxFit.contain,
      errorBuilder: (context, error, stackTrace) {
        return Icon(fallbackIcon, color: AppColors.primary, size: size * 0.5);
      },
    );
  }
}
