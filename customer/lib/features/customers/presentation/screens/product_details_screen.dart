import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../core/utils/cart_service.dart';
import '../../../../core/utils/api_service.dart';
import '../models/cart_item_model.dart';

class ProductDetailsScreen extends StatefulWidget {
  const ProductDetailsScreen({super.key});

  @override
  State<ProductDetailsScreen> createState() => _ProductDetailsScreenState();
}

class _ProductDetailsScreenState extends State<ProductDetailsScreen> {
  int _quantity = 1;
  int _selectedDetailsTab = 0;

  double _asDouble(dynamic value, {double fallback = 0.0}) {
    if (value == null) return fallback;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? fallback;
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;

    final args =
        ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>? ??
        {};
    final String productName =
        args['product_name'] ?? args['name'] ?? 'Premium Selection';
    final double price = _asDouble(args['price'] ?? args['selling_price']);
    final double originalPrice = _asDouble(args['original_price'] ?? price);
    final double discountedPrice = _asDouble(args['discounted_price'] ?? price);
    final bool hasOffer =
        (args['has_offer'] == 1 ||
        args['has_offer'] == true ||
        discountedPrice < originalPrice);
    final String? offerDescription = args['offer_description']?.toString();
    final String? offerExpiry = args['offer_expiry']?.toString();
    final String? offerBadge =
        args['offer_badge']?.toString() ?? (hasOffer ? 'SALE' : null);
    final String category = args['category'] ?? 'Parts';
    final String unit = args['unit'] ?? 'Piece';
    final String description = _firstNonEmpty([
      args['description'],
      args['product_description'],
      offerDescription,
    ]);
    final String installation = _firstNonEmpty([
      args['installation'],
      args['installation_instructions'],
    ]);
    final double rating = _asDouble(args['rating'] ?? args['average_rating']);
    final int reviewCount = _asDouble(
      args['review_count'] ?? args['total_reviews'],
    ).round();

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            _buildAppBar(context),

            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Main Image
                    _buildImageGallery(args['image_url']?.toString()),

                    // Product Info
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.l),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildBreadcrumbs(category),
                          const SizedBox(height: 12),
                          Text(
                            productName,
                            style: TextStyle(
                              color: theme.colorScheme.onSurface,
                              fontSize: 28,
                              fontWeight: FontWeight.w900,
                              height: 1.1,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            description.isNotEmpty
                                ? description
                                : 'No product description has been provided.',
                            style: TextStyle(
                              color: theme.colorScheme.onSurfaceVariant,
                              fontSize: 15,
                              height: 1.5,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xl),

                          // Price
                          _buildPriceSection(
                            discountedPrice,
                            originalPrice,
                            hasOffer,
                            offerBadge,
                          ),
                          _buildOfferExpiryBanner(offerExpiry),
                          const SizedBox(height: AppSpacing.xl),

                          // Rating Summary
                          _buildRatingSummary(rating, reviewCount),
                          const SizedBox(height: AppSpacing.xl),

                          // Specs
                          _buildSpecsGrid(args, unit),
                          const SizedBox(height: AppSpacing.xl),

                          // Vendor Info
                          _buildVendorInfoSection(args),
                          const SizedBox(height: AppSpacing.xl),

                          // Description
                          _buildDescriptionTabs(
                            description: description,
                            installation: installation,
                            rating: rating,
                            reviewCount: reviewCount,
                          ),
                          const SizedBox(height: 120),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Fixed Bottom Bar
            _buildBottomBar(context, args, productName, discountedPrice),
          ],
        ),
      ),
    );
  }

  String _firstNonEmpty(List<dynamic> values) {
    for (final value in values) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty) return text;
    }
    return '';
  }

  Widget _buildAppBar(BuildContext context) {
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
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: Icon(Icons.arrow_back, color: cs.onSurface),
              ),
              const SizedBox(width: 8),
              Text(
                'Product Details',
                style: TextStyle(
                  color: cs.onSurface,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
            ],
          ),
          Row(
            children: [
              IconButton(
                onPressed: () {
                  print('DEBUG: Share product clicked');
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Sharing product link...')),
                  );
                },
                icon: const Icon(
                  Icons.share_outlined,
                  color: Colors.grey,
                  size: 20,
                ),
              ),
              IconButton(
                onPressed: () {
                  print('DEBUG: Toggle Favorite clicked');
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Added to favorites!')),
                  );
                },
                icon: const Icon(
                  Icons.favorite_border,
                  color: Colors.grey,
                  size: 20,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildImageGallery(String? imageUrl) {
    return Column(
      children: [
        AspectRatio(
          aspectRatio: 1.2,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.m),
            child: Stack(
              children: [
                Container(
                  width: double.infinity,
                  height: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.white12,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                    child: (imageUrl != null && imageUrl.isNotEmpty)
                        ? Image.network(
                            _resolveAssetUrl(imageUrl),
                            fit: BoxFit.contain,
                            errorBuilder: (context, error, stackTrace) =>
                                const Center(
                                  child: Icon(
                                    Icons.handyman_outlined,
                                    color: Colors.grey,
                                    size: 64,
                                  ),
                                ),
                          )
                        : const Center(
                            child: Icon(
                              Icons.inventory_2_outlined,
                              color: Colors.grey,
                              size: 64,
                            ),
                          ),
                  ),
                ),
                Positioned(
                  top: 16,
                  left: 16,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(
                        AppSpacing.radiusFull,
                      ),
                    ),
                    child: const Text(
                      'PREMIUM SELECTION',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.5,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBreadcrumbs(String category) {
    return Text(
      'Parts / $category / Item',
      style: const TextStyle(
        color: Colors.grey,
        fontSize: 13,
        fontWeight: FontWeight.bold,
      ),
    );
  }

  Widget _buildPriceSection(
    double discountedPrice,
    double originalPrice,
    bool hasOffer,
    String? offerBadge,
  ) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          '\$${discountedPrice.toStringAsFixed(2)}',
          style: const TextStyle(
            color: AppColors.primary,
            fontWeight: FontWeight.w900,
            fontSize: 36,
            letterSpacing: -1,
          ),
        ),
        if (hasOffer) ...[
          const SizedBox(width: 12),
          Text(
            '\$${originalPrice.toStringAsFixed(2)}',
            style: const TextStyle(
              color: Colors.grey,
              decoration: TextDecoration.lineThrough,
              fontSize: 18,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.success.withOpacity(0.1),
              borderRadius: BorderRadius.circular(AppSpacing.radiusS),
            ),
            child: Text(
              offerBadge ?? 'OFFER',
              style: const TextStyle(
                color: AppColors.success,
                fontSize: 10,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildOfferExpiryBanner(String? expiryStr) {
    if (expiryStr == null || expiryStr.isEmpty) return const SizedBox.shrink();
    final expiry = DateTime.tryParse(expiryStr)?.toLocal();
    if (expiry == null) return const SizedBox.shrink();
    final formattedExpiry = DateFormat(
      "dd MMM yyyy 'at' h:mm a",
    ).format(expiry);
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.red.shade900.withAlpha(51),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.red.shade800.withAlpha(102)),
      ),
      child: Row(
        children: [
          const Icon(Icons.timer, color: Colors.red, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Offer expires $formattedExpiry',
              style: const TextStyle(
                color: Colors.redAccent,
                fontSize: 13,
                fontWeight: FontWeight.bold,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRatingSummary(double rating, int reviewCount) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    reviewCount > 0 ? rating.toStringAsFixed(1) : 'New',
                    style: TextStyle(
                      color: cs.onSurface,
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.star, color: Colors.amber, size: 20),
                ],
              ),
              Text(
                reviewCount > 0
                    ? 'Based on $reviewCount reviews'
                    : 'No customer reviews yet',
                style: TextStyle(
                  color: cs.onSurface.withAlpha(153),
                  fontSize: 11,
                ),
              ),
            ],
          ),
          if (reviewCount > 0) ...[
            const SizedBox(width: 24),
            Expanded(
              child: LinearProgressIndicator(
                value: (rating / 5).clamp(0, 1),
                minHeight: 5,
                backgroundColor: cs.onSurface.withAlpha(20),
                color: AppColors.primary,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSpecsGrid(Map<String, dynamic> args, String unit) {
    final specs = <MapEntry<String, String>>[
      MapEntry('Unit Type', unit),
      MapEntry('Available Stock', '${_asDouble(args['stock']).round()}'),
    ];
    final warranty = _firstNonEmpty([
      args['warranty'],
      args['warranty_period'],
    ]);
    final certification = _firstNonEmpty([
      args['certification'],
      args['certifications'],
    ]);
    if (warranty.isNotEmpty) specs.add(MapEntry('Warranty', warranty));
    if (certification.isNotEmpty)
      specs.add(MapEntry('Certification', certification));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'CORE SPECIFICATIONS',
          style: TextStyle(
            color: Colors.grey,
            fontSize: 11,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 16),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 2.2,
          children: specs
              .map((spec) => _buildSpecItem(spec.key, spec.value))
              .toList(),
        ),
      ],
    );
  }

  Widget _buildSpecItem(String label, String val) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusL),
        border: Border.all(color: borderCol.withAlpha(127)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: TextStyle(
              color: cs.onSurface.withAlpha(153),
              fontSize: 10,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            val,
            style: TextStyle(
              color: cs.onSurface,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDescriptionTabs({
    required String description,
    required String installation,
    required double rating,
    required int reviewCount,
  }) {
    final cs = Theme.of(context).colorScheme;
    final content = switch (_selectedDetailsTab) {
      0 =>
        description.isNotEmpty
            ? description
            : 'No product description has been provided.',
      1 =>
        installation.isNotEmpty
            ? installation
            : 'No installation instructions have been provided.',
      _ =>
        reviewCount > 0
            ? '${rating.toStringAsFixed(1)} out of 5 from $reviewCount customer reviews.'
            : 'No customer reviews yet.',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: _buildTab('Full Description', 0)),
            const SizedBox(width: 8),
            Expanded(child: _buildTab('Installation', 1)),
            const SizedBox(width: 8),
            Expanded(child: _buildTab('Reviews', 2)),
          ],
        ),
        const SizedBox(height: 24),
        Text(
          content,
          style: TextStyle(
            color: cs.onSurfaceVariant,
            fontSize: 14,
            height: 1.5,
          ),
        ),
      ],
    );
  }

  Widget _buildTab(String label, int index) {
    final isSelected = _selectedDetailsTab == index;
    return InkWell(
      onTap: () => setState(() => _selectedDetailsTab = index),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: isSelected ? AppColors.primary : Colors.grey,
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
          if (isSelected) ...[
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 3,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBottomBar(
    BuildContext context,
    Map<String, dynamic> args,
    String productName,
    double price,
  ) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final bool isAvailable =
        (args['stock'] != null
            ? int.tryParse(args['stock'].toString()) ?? 1
            : 1) >
        0;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.l),
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: borderCol.withAlpha(76))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                height: 56,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(
                  color: cs.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                ),
                child: Row(
                  children: [
                    _qtyBtn(
                      Icons.remove,
                      () => setState(
                        () => _quantity = (_quantity > 1 ? _quantity - 1 : 1),
                      ),
                    ),
                    SizedBox(
                      width: 40,
                      child: Text(
                        _quantity.toString(),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: cs.onSurface,
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                        ),
                      ),
                    ),
                    _qtyBtn(Icons.add, () => setState(() => _quantity++)),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: CustomButton(
                  text: isAvailable ? 'Add to Cart' : 'Out of Stock',
                  onPressed: isAvailable
                      ? () async {
                          print('DEBUG: Add to Cart clicked. Qty: $_quantity');
                          final error = await CartService.addItem(
                            CartItemModel(
                              id: (args['product_id'] ?? '').toString(),
                              title: productName,
                              subtitle:
                                  args['vendor_name']?.toString() ??
                                  'AutoParts',
                              imageUrl: args['image_url']?.toString() ?? '',
                              price: price,
                              priceUnit: '',
                              quantity: _quantity,
                              vendorId: args['vendor_id'] != null
                                  ? int.tryParse(args['vendor_id'].toString())
                                  : null,
                              vendorName: args['vendor_name']?.toString(),
                              stock: args['stock'] != null
                                  ? int.tryParse(args['stock'].toString()) ?? 10
                                  : 10,
                              isActive: args['is_active'] != false,
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
                                  content: Text(
                                    'Added $_quantity $productName to cart!',
                                  ),
                                  backgroundColor: AppColors.primary,
                                ),
                              );
                            }
                          }
                        }
                      : null,
                  icon: const Icon(
                    Icons.shopping_cart_outlined,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.local_shipping_outlined,
                color: AppColors.success,
                size: 16,
              ),
              const SizedBox(width: 8),
              const Text(
                'Free Shipping',
                style: TextStyle(color: Colors.grey, fontSize: 12),
              ),
              const SizedBox(width: 24),
              Icon(
                isAvailable ? Icons.check_circle : Icons.block,
                color: isAvailable ? AppColors.success : AppColors.error,
                size: 16,
              ),
              const SizedBox(width: 8),
              Text(
                isAvailable ? 'In Stock' : 'Out of Stock',
                style: const TextStyle(color: Colors.grey, fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Icon(icon, color: cs.onSurface, size: 20),
      ),
    );
  }

  Widget _buildVendorInfoSection(Map<String, dynamic> args) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final vendorName = args['vendor_name']?.toString() ?? 'Official Dealer';
    final vendorLogo = args['vendor_logo'] ?? args['logo'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'SOLD BY',
          style: TextStyle(
            color: Colors.grey,
            fontSize: 11,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
            border: Border.all(color: borderCol.withAlpha(127)),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: isDark ? Colors.white12 : Colors.grey.shade200,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusM),
                ),
                clipBehavior: Clip.antiAlias,
                child: _buildLogoWidget(vendorLogo),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      vendorName,
                      style: TextStyle(
                        color: cs.onSurface,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Verified Seller',
                      style: TextStyle(
                        color: cs.onSurface.withAlpha(153),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLogoWidget(
    dynamic logo, {
    double size = 48,
    IconData fallbackIcon = Icons.storefront_outlined,
  }) {
    if (logo == null || logo.toString().isEmpty) {
      return Icon(fallbackIcon, color: AppColors.primary, size: size * 0.5);
    }
    final logoStr = logo.toString();
    final url = _resolveAssetUrl(logoStr);
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

  String _resolveAssetUrl(String value) {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    return '${ApiService.baseUrl.replaceAll('/api', '')}$value';
  }
}
