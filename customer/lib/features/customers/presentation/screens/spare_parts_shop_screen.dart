import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/cart_service.dart';
import '../models/cart_item_model.dart';

class SparePartsShopScreen extends StatefulWidget {
  const SparePartsShopScreen({super.key});

  @override
  State<SparePartsShopScreen> createState() => _SparePartsShopScreenState();
}

class _SparePartsShopScreenState extends State<SparePartsShopScreen> {
  List<dynamic> _vendors = [];
  List<dynamic> _filteredVendors = [];
  bool _isLoading = true;
  String _errorMessage = '';
  String _searchQuery = '';

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

  bool _isSparePartProduct(dynamic product) {
    final text = _productSearchText(product);
    final isSpare = RegExp(
      r'\b(spare|part|parts|machine|engine|battery|brake|tyre|tire|spark)\b',
    ).hasMatch(text);
    final isGas = RegExp(r'\b(gas|gass|lpg|cylinder)\b').hasMatch(text);
    final isFuel = RegExp(r'\b(petrol|diesel|fuel)\b').hasMatch(text);
    return isSpare && !isGas && !isFuel;
  }

  List<dynamic> _vendorsWithSparePartsOnly(List<dynamic> vendors) {
    return vendors
        .map((vendor) {
          if (vendor is! Map) return null;
          final products = (vendor['products'] as List<dynamic>? ?? [])
              .where(_isSparePartProduct)
              .toList();
          if (products.isEmpty) return null;
          final vendorCopy = Map<String, dynamic>.from(vendor);
          vendorCopy['products'] = products;
          return vendorCopy;
        })
        .whereType<Map<String, dynamic>>()
        .toList();
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

  @override
  void initState() {
    super.initState();
    _fetchData();
  }

  Future<void> _fetchData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    const endpoint = '/customer/spare-parts/vendors-products';
    debugPrint('DEBUG: [API URL] ${ApiService.baseUrl}$endpoint');

    try {
      final response = await ApiService.get(endpoint);
      print('DEBUG: [RESPONSE BODY] ${response.body}');

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body);
        if (json['success'] == true && json['data'] != null) {
          final List<dynamic> data = json['data'];
          print('DEBUG: [VENDORS COUNT] ${data.length}');
          for (var v in data) {
            final items = v['products'] as List<dynamic>? ?? [];
            print(
              'DEBUG: [PRODUCTS COUNT PER VENDOR] Vendor ${v['vendor_name']}: ${items.length}',
            );
          }

          final spareOnlyData = _vendorsWithSparePartsOnly(data);

          setState(() {
            _vendors = spareOnlyData;
            _filteredVendors = spareOnlyData;
            _isLoading = false;
          });
        } else {
          setState(() {
            _errorMessage = json['message'] ?? 'Failed to load spare parts';
            _isLoading = false;
          });
        }
      } else {
        setState(() {
          _errorMessage = 'Server error (${response.statusCode})';
          _isLoading = false;
        });
      }
    } catch (e) {
      print('DEBUG: [FETCH ERROR] $e');
      setState(() {
        _errorMessage = 'Connection error. Please check your network.';
        _isLoading = false;
      });
    }
  }

  void _filterVendors(String query) {
    setState(() {
      _searchQuery = query;
      if (query.isEmpty) {
        _filteredVendors = List.from(_vendors);
      } else {
        final q = query.toLowerCase();
        final List<dynamic> result = [];

        for (var v in _vendors) {
          final vName = (v['vendor_name'] ?? '').toString().toLowerCase();
          final vLoc = (v['location'] ?? '').toString().toLowerCase();

          if (vName.contains(q) || vLoc.contains(q)) {
            result.add(v);
          } else {
            final products = v['products'] as List<dynamic>? ?? [];
            final matchingProducts = products.where((p) {
              final pName = (p['product_name'] ?? '').toString().toLowerCase();
              final pCat = (p['category'] ?? '').toString().toLowerCase();
              return pName.contains(q) || pCat.contains(q);
            }).toList();

            if (matchingProducts.isNotEmpty) {
              final vCopy = Map<String, dynamic>.from(v);
              vCopy['products'] = matchingProducts;
              result.add(vCopy);
            }
          }
        }
        _filteredVendors = result;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final bgColor = theme.scaffoldBackgroundColor;
    final surfaceColor = cs.surface;
    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            _buildHeader(context),

            Expanded(
              child: RefreshIndicator(
                onRefresh: _fetchData,
                color: AppColors.primary,
                backgroundColor: surfaceColor,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(
                    parent: BouncingScrollPhysics(),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Search Bar
                      _buildSearchBar(),

                      // Dynamic Vendors & Products List
                      _buildVendorsList(),

                      const SizedBox(height: 100),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _buildBottomNav(context),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor.withAlpha(204),
        border: Border(bottom: BorderSide(color: borderCol.withAlpha(76))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusM),
                ),
                child: const Icon(
                  Icons.local_shipping_outlined,
                  color: AppColors.primary,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                'AutoParts Express',
                style: TextStyle(
                  color: cs.onSurface,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          Stack(
            children: [
              IconButton(
                onPressed: () => Navigator.pushNamed(
                  context,
                  AppRoutes.cart,
                ).then((_) => setState(() {})),
                icon: const Icon(
                  Icons.shopping_cart_outlined,
                  color: Colors.grey,
                ),
              ),
              Positioned(
                right: 8,
                top: 8,
                child: Container(
                  width: 16,
                  height: 16,
                  decoration: const BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      '${CartService.items.fold<int>(0, (sum, item) => sum + item.quantity)}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cs = theme.colorScheme;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final searchBg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.m),
      child: Container(
        height: 56,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: searchBg,
          borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          border: Border.all(color: borderCol.withAlpha(77)),
        ),
        child: Row(
          children: [
            Icon(Icons.search, color: cs.onSurface.withAlpha(128)),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                style: TextStyle(color: cs.onSurface),
                onChanged: _filterVendors,
                decoration: InputDecoration(
                  hintText: 'Search by vendor or part name...',
                  hintStyle: TextStyle(
                    color: cs.onSurface.withAlpha(102),
                    fontSize: 15,
                  ),
                  border: InputBorder.none,
                ),
              ),
            ),
            Icon(Icons.tune, color: cs.onSurface.withAlpha(128), size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildVendorsList() {
    if (_isLoading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(60.0),
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
      );
    }

    if (_errorMessage.isNotEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(40.0),
          child: Column(
            children: [
              const Icon(Icons.error_outline, color: AppColors.error, size: 48),
              const SizedBox(height: 16),
              Text(
                _errorMessage,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurface,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _fetchData,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                ),
                child: const Text(
                  'Retry',
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_filteredVendors.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(60.0),
          child: Column(
            children: [
              const Icon(
                Icons.inventory_2_outlined,
                color: Colors.grey,
                size: 64,
              ),
              const SizedBox(height: 16),
              Text(
                _searchQuery.isNotEmpty
                    ? 'No spare parts found matching "$_searchQuery"'
                    : 'No spare parts vendors available',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurface.withAlpha(153),
                  fontSize: 16,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      itemCount: _filteredVendors.length,
      itemBuilder: (context, index) {
        final vendor = _filteredVendors[index];
        final products = vendor['products'] as List<dynamic>? ?? [];
        if (products.isEmpty) return const SizedBox.shrink();

        return _buildVendorSection(vendor, products);
      },
    );
  }

  Widget _buildVendorSection(dynamic vendor, List<dynamic> products) {
    final vendorName = vendor['vendor_name']?.toString() ?? 'Unknown Vendor';
    final location = vendor['location']?.toString() ?? 'Mogadishu';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.m,
            vertical: 12,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(AppSpacing.radiusM),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: _buildLogoWidget(
                      vendor['logo'] ?? vendor['logo_url'],
                      size: 36,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        vendorName,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurface,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Row(
                        children: [
                          Icon(
                            Icons.location_on_outlined,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurface.withAlpha(128),
                            size: 12,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            location,
                            style: TextStyle(
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurface.withAlpha(153),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                  border: Border.all(
                    color:
                        (Theme.of(context).brightness == Brightness.dark
                                ? AppColors.borderDark
                                : AppColors.border)
                            .withAlpha(77),
                  ),
                ),
                child: Text(
                  '${products.length} parts',
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 250,
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m),
            scrollDirection: Axis.horizontal,
            itemCount: products.length,
            itemBuilder: (context, index) =>
                _buildProductCard(products[index], vendor),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildProductCard(dynamic product, dynamic vendor) {
    final name = product['product_name']?.toString() ?? '';
    final price = _asDouble(product['selling_price'] ?? product['price']);
    final stock = _asInt(product['stock'] ?? product['stock_quantity']) ?? 0;
    final unit = product['unit']?.toString() ?? 'Piece';
    final imageUrl = product['image_url']?.toString() ?? '';
    final isActive =
        product['is_active'] != false; // default true for spare parts
    final hasValidPrice = price > 0;
    final isAvailable = stock > 0 && hasValidPrice && isActive;

    final hasOffer =
        (product['has_offer'] == 1 || product['has_offer'] == true);
    final originalPrice = _asDouble(product['original_price'] ?? price);
    final discountedPrice = _asDouble(product['discounted_price'] ?? price);
    final offerBadge = product['offer_badge']?.toString();

    final fullImageUrl = imageUrl.startsWith('http')
        ? imageUrl
        : '${ApiService.baseUrl.replaceAll('/api', '')}$imageUrl';

    return GestureDetector(
      onTap: () {
        Navigator.pushNamed(
          context,
          AppRoutes.productDetails,
          arguments: {
            'product_id': product['product_id'],
            'product_name': name,
            'price': discountedPrice,
            'stock': stock,
            'unit': unit,
            'category': product['category'],
            'description':
                product['description'] ?? product['product_description'],
            'installation':
                product['installation'] ?? product['installation_instructions'],
            'rating': product['rating'] ?? product['average_rating'],
            'review_count': product['review_count'] ?? product['total_reviews'],
            'warranty': product['warranty'] ?? product['warranty_period'],
            'certification':
                product['certification'] ?? product['certifications'],
            'image_url': fullImageUrl,
            'is_active': isActive,
            'has_offer': hasOffer ? 1 : 0,
            'original_price': originalPrice,
            'discounted_price': discountedPrice,
            'offer_badge': offerBadge,
            'offer_title': product['offer_title'],
            'offer_description': product['offer_description'],
            'offer_expiry': product['offer_expiry']?.toString(),
            'vendor_id': vendor['vendor_id'] ?? vendor['id'],
            'vendor_name': vendor['vendor_name']?.toString(),
            'vendor_logo': vendor['logo'] ?? vendor['logo_url'],
          },
        ).then((_) => setState(() {}));
      },
      child: Container(
        width: 220,
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color:
              (Theme.of(context).brightness == Brightness.dark
                      ? AppColors.surfaceDark
                      : Colors.grey.shade100)
                  .withAlpha(77),
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(
            color:
                (Theme.of(context).brightness == Brightness.dark
                        ? AppColors.borderDark
                        : AppColors.border)
                    .withAlpha(77),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                children: [
                  Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: Colors.white12,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                      child: Image.network(
                        fullImageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) =>
                            const Center(
                              child: Icon(
                                Icons.handyman_outlined,
                                color: Colors.grey,
                                size: 40,
                              ),
                            ),
                      ),
                    ),
                  ),
                  // Stock / availability badge
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: isAvailable
                            ? AppColors.primary.withOpacity(0.9)
                            : AppColors.error.withOpacity(0.9),
                        borderRadius: BorderRadius.circular(
                          AppSpacing.radiusFull,
                        ),
                      ),
                      child: Text(
                        !hasValidPrice
                            ? 'Pricing Error'
                            : stock > 0
                            ? '$stock $unit'
                            : 'Out of Stock',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurface,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (hasOffer) ...[
                        Row(
                          children: [
                            Text(
                              '\$${originalPrice.toStringAsFixed(2)}',
                              style: const TextStyle(
                                color: Colors.grey,
                                decoration: TextDecoration.lineThrough,
                                fontSize: 11,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.red.shade100,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                offerBadge ?? 'SALE',
                                style: const TextStyle(
                                  color: Colors.red,
                                  fontSize: 8,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                      ],
                      Text(
                        hasValidPrice
                            ? '\$${discountedPrice.toStringAsFixed(2)}'
                            : 'N/A',
                        style: TextStyle(
                          color: hasValidPrice
                              ? AppColors.primary
                              : AppColors.error,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: isAvailable
                      ? () async {
                          final error = await CartService.addItem(
                            CartItemModel(
                              id: product['product_id'].toString(),
                              title: name,
                              subtitle: vendor['vendor_name']?.toString(),
                              imageUrl: fullImageUrl,
                              price: discountedPrice,
                              priceUnit: '',
                              quantity: 1,
                              vendorId: _asInt(
                                vendor['vendor_id'] ?? vendor['id'],
                              ),
                              vendorName: vendor['vendor_name']?.toString(),
                              stock: stock,
                              isActive: isActive,
                            ),
                          );
                          if (context.mounted) {
                            if (error != null) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(error),
                                  backgroundColor: AppColors.error,
                                ),
                              );
                            } else {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('$name added to cart'),
                                  backgroundColor: AppColors.primary,
                                ),
                              );
                              setState(() {});
                            }
                          }
                        }
                      : null,
                  icon: Icon(
                    isAvailable
                        ? Icons.add_shopping_cart
                        : Icons.block_outlined,
                    color: isAvailable ? AppColors.primary : Colors.grey,
                    size: 20,
                  ),
                  style: IconButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.surface,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusM),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    return Container(
      padding: const EdgeInsets.only(top: 12, bottom: 24, left: 16, right: 16),
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: borderCol.withAlpha(76))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(
            context,
            Icons.home_outlined,
            'HOME',
            false,
            route: AppRoutes.home,
          ),
          _buildNavItem(
            context,
            Icons.receipt_long,
            'ORDERS',
            false,
            route: AppRoutes.history,
          ),
          _buildNavItem(
            context,
            Icons.grid_view,
            'SHOP',
            true,
            route: AppRoutes.spareParts,
          ),
          _buildNavItem(
            context,
            Icons.person_outline,
            'PROFILE',
            false,
            route: AppRoutes.profile,
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context,
    IconData icon,
    String label,
    bool isSelected, {
    String? route,
  }) {
    return GestureDetector(
      onTap: () {
        if (route != null && !isSelected) {
          Navigator.pushNamed(context, route);
        }
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            color: isSelected ? AppColors.primary : Colors.grey,
            size: 24,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: isSelected ? AppColors.primary : Colors.grey,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogoWidget(
    dynamic logo, {
    double size = 80,
    IconData fallbackIcon = Icons.storefront_outlined,
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
