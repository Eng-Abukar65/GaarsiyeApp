import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/routes/app_routes.dart';

class GasCylinderSelectionScreen extends StatefulWidget {
  const GasCylinderSelectionScreen({super.key});

  @override
  State<GasCylinderSelectionScreen> createState() =>
      _GasCylinderSelectionScreenState();
}

class _GasCylinderSelectionScreenState
    extends State<GasCylinderSelectionScreen> {
  int _selectedCylinderIndex = 0;
  List<dynamic> _products = [];
  bool _isLoading = true;
  dynamic _vendor;
  String? _category;

  // Added fields for gas offers and KG quantity selection
  Map<String, dynamic>? _offer;
  int? _offerId;
  int _quantity = 5;

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

  bool _isGasProduct(dynamic product) {
    final text = _productSearchText(product);
    final isGas = RegExp(r'\b(gas|gass|lpg|cylinder)\b').hasMatch(text);
    final isSpare = RegExp(
      r'\b(spare|part|parts|machine|engine|battery|brake|tyre|tire|spark)\b',
    ).hasMatch(text);
    final isFuel = RegExp(r'\b(petrol|diesel|fuel)\b').hasMatch(text);
    return isGas && !isSpare && !isFuel;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final rawArgs = ModalRoute.of(context)?.settings.arguments;
    if (rawArgs != null && rawArgs is Map) {
      final args = Map<String, dynamic>.from(rawArgs);
      if (args['offer'] is Map) {
        _offer = Map<String, dynamic>.from(args['offer'] as Map);
        _offerId = _asInt(args['offer_id'] ?? _offer?['id']);
      }
      if (args.containsKey('vendor')) {
        _vendor = args['vendor'];
        _category = args['product'];
      } else {
        _vendor = args;
      }
    }

    if (_vendor != null && _products.isEmpty && _isLoading) {
      _fetchProducts();
    }
  }

  List<dynamic> _productsForSelectedOffer(List<dynamic> products) {
    if (_offer == null || products.isEmpty) return products;

    final matchingProducts = _offerId == null
        ? <dynamic>[]
        : products.where((product) {
            if (product is! Map) return false;
            return _asInt(product['offer_id']) == _offerId;
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

  Future<void> _fetchProducts() async {
    print('DEBUG: [GasCylinderSelectionScreen] _fetchProducts called');
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
          final gasProducts = products.where(_isGasProduct).toList();
          _products = _productsForSelectedOffer(gasProducts);
          if (_products.length > 1) {
            _selectedCylinderIndex = 1; // Default to second item if available
          } else {
            _selectedCylinderIndex = 0;
          }
        });
      }
    } catch (e, stackTrace) {
      print('DEBUG: Error fetching gas products: $e');
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
            // Header
            _buildAppBar(context),

            // Progress Bar
            _buildProgressBar(),

            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Hero Image
                    _buildHeroImage(),

                    // Main Content
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.l),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Which size do you need?',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.l),

                          // Cylinder List
                          _isLoading
                              ? const Center(child: CircularProgressIndicator())
                              : _products.isEmpty
                              ? const Center(
                                  child: Text(
                                    'No gas cylinders available for this vendor',
                                    style: TextStyle(color: Colors.white),
                                  ),
                                )
                              : Column(
                                  children: List.generate(
                                    _products.length,
                                    (index) => _buildCylinderCard(
                                      index,
                                      _products[index],
                                    ),
                                  ),
                                ),

                          if (!_isLoading && _products.isNotEmpty) ...[
                            const SizedBox(height: AppSpacing.xl),
                            const Text(
                              'How many KG do you need?',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.m),
                            _buildStepperWidget(),
                            const SizedBox(height: AppSpacing.l),
                            _buildCalculationSummary(),
                          ],

                          const SizedBox(height: AppSpacing.xl),

                          // Info Box
                          _buildInfoBox(),

                          const SizedBox(height: 32),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Footer
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
            style: IconButton.styleFrom(backgroundColor: cs.surface),
          ),
          const Expanded(
            child: Text(
              'Step 1 of 3',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 48),
        ],
      ),
    );
  }

  Widget _buildProgressBar() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text(
                'Choose your cylinder',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                '1 of 3',
                style: TextStyle(color: Colors.grey, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
            child: LinearProgressIndicator(
              value: 0.33,
              backgroundColor: isDark
                  ? AppColors.surfaceDark
                  : Colors.grey.shade300,
              color: AppColors.primary,
              minHeight: 8,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroImage() {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.m),
      child: Container(
        height: 180,
        width: double.infinity,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          image: const DecorationImage(
            image: AssetImage('assets/images/gas.png'),
            fit: BoxFit.cover,
            colorFilter: ColorFilter.mode(Colors.black38, BlendMode.darken),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.l),
          child: Stack(
            children: [
              if (_vendor != null)
                Positioned(
                  top: 0,
                  right: 0,
                  child: Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(230),
                      borderRadius: BorderRadius.circular(AppSpacing.radiusM),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: _buildLogoWidget(
                      _vendor['logo'] ?? _vendor['logo_url'],
                      size: 52,
                      fallbackIcon: Icons.local_fire_department,
                    ),
                  ),
                ),
              const Align(
                alignment: Alignment.bottomLeft,
                child: Text(
                  'Delivery Selection',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCylinderCard(int index, dynamic product) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;
    final isSelected = _selectedCylinderIndex == index;
    final price = _asDouble(product['price'] ?? product['selling_price']);
    return GestureDetector(
      onTap: () => setState(() => _selectedCylinderIndex = index),
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.m),
        padding: const EdgeInsets.all(AppSpacing.l),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary.withAlpha(13) : cardBg,
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(
            color: isSelected ? AppColors.primary : borderCol.withAlpha(127),
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Radio(
              value: index,
              groupValue: _selectedCylinderIndex,
              onChanged: (val) =>
                  setState(() => _selectedCylinderIndex = val as int),
              activeColor: AppColors.primary,
            ),
            const SizedBox(width: AppSpacing.m),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Flexible(
                        child: Text(
                          '${product['product_name']}',
                          style: TextStyle(
                            color: cs.onSurface,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.s),
                      Text(
                        '\$${price.toStringAsFixed(2)}',
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    product['description'] ?? 'High quality gas cylinder',
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

  Widget _buildInfoBox() {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: AppColors.primary.withOpacity(0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          Icon(Icons.info, color: AppColors.primary, size: 20),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Prices include local delivery fees and taxes. Selection can be changed before final checkout.',
              style: TextStyle(color: Colors.grey, fontSize: 12, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.l,
        AppSpacing.m,
        AppSpacing.l,
        AppSpacing.xl,
      ),
      child: CustomButton(
        text: 'Schedule Delivery',
        onPressed: () {
          if (_products.isNotEmpty) {
            final selectedProduct = Map<String, dynamic>.from(
              _products[_selectedCylinderIndex] as Map,
            );
            final vendor = _vendor is Map
                ? Map<String, dynamic>.from(_vendor as Map)
                : <String, dynamic>{};
            final price = _asDouble(
              selectedProduct['price'] ?? selectedProduct['selling_price'],
            );
            final productId = _asInt(
              selectedProduct['product_id'] ?? selectedProduct['id'],
            );
            final vendorId = _asInt(
              vendor['id'] ??
                  vendor['vendor_id'] ??
                  selectedProduct['vendor_id'],
            );

            if (productId == null || vendorId == null || price <= 0) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('This gas product cannot be ordered.'),
                  backgroundColor: AppColors.error,
                ),
              );
              return;
            }

            final total = price * _quantity;

            Navigator.pushNamed(
              context,
              AppRoutes.deliveryTime,
              arguments: {
                'vendor': vendor,
                'product': selectedProduct,
                'vendor_id': vendorId,
                'items': [
                  {
                    'product_id': productId,
                    'quantity': _quantity,
                    'price': price,
                  },
                ],
                'subtotal': total,
                'delivery_fee': 0,
                'delivery_address': 'Mogadishu',
                'quantity': _quantity,
                'total': total,
                'unit': 'KG',
                if (_offer != null) 'offer': _offer,
                if (_offerId != null) 'offer_id': _offerId,
                if (_offer != null) 'from_offer': true,
              },
            );
          }
        },
        icon: const Icon(Icons.arrow_forward, color: Colors.white),
      ),
    );
  }

  Widget _buildStepperWidget() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _buildStepperButton(
          icon: Icons.remove_rounded,
          onPressed: _quantity > 1 ? () => setState(() => _quantity--) : null,
        ),
        const SizedBox(width: 20),
        Container(
          width: 120,
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: AppColors.primary.withOpacity(0.1),
            borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
            border: Border.all(color: AppColors.primary.withOpacity(0.3)),
          ),
          alignment: Alignment.center,
          child: Text(
            '$_quantity KG',
            style: const TextStyle(
              color: AppColors.primary,
              fontSize: 24,
              fontWeight: FontWeight.w900,
              letterSpacing: 1,
            ),
          ),
        ),
        const SizedBox(width: 20),
        _buildStepperButton(
          icon: Icons.add_rounded,
          onPressed: () => setState(() => _quantity++),
        ),
      ],
    );
  }

  Widget _buildStepperButton({
    required IconData icon,
    VoidCallback? onPressed,
  }) {
    final enabled = onPressed != null;
    return GestureDetector(
      onTap: onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: enabled
              ? AppColors.primary
              : AppColors.primary.withOpacity(0.2),
          shape: BoxShape.circle,
          boxShadow: enabled
              ? [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(0.35),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : [],
        ),
        child: Icon(
          icon,
          color: enabled ? Colors.white : Colors.white38,
          size: 26,
        ),
      ),
    );
  }

  Widget _buildCalculationSummary() {
    if (_products.isEmpty) return const SizedBox.shrink();
    final selectedProduct = _products[_selectedCylinderIndex];
    final price = _asDouble(
      selectedProduct['price'] ?? selectedProduct['selling_price'],
    );
    final total = _quantity * price;

    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.l),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(
          color: isDark
              ? AppColors.borderDark.withAlpha(127)
              : AppColors.border.withAlpha(127),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Calculation Details',
                style: TextStyle(
                  color: cs.onSurface.withAlpha(153),
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '$_quantity KG × \$${price.toStringAsFixed(2)}',
                style: TextStyle(
                  color: cs.onSurface,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                'Total Amount',
                style: TextStyle(
                  color: cs.onSurface.withAlpha(153),
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '\$${total.toStringAsFixed(2)}',
                style: const TextStyle(
                  color: AppColors.success,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLogoWidget(
    dynamic logo, {
    double size = 52,
    IconData fallbackIcon = Icons.local_fire_department,
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
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) {
        return Icon(fallbackIcon, color: AppColors.primary, size: size * 0.5);
      },
    );
  }
}
