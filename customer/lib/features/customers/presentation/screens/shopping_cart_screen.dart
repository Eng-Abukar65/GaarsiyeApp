import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../core/constants/app_assets.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/cart_service.dart';
import '../models/cart_item_model.dart';

class ShoppingCartScreen extends StatefulWidget {
  const ShoppingCartScreen({super.key});

  @override
  State<ShoppingCartScreen> createState() => _ShoppingCartScreenState();
}

class _ShoppingCartScreenState extends State<ShoppingCartScreen> {
  Map<String, dynamic> _routeArgs = {};
  bool _argsLoaded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_argsLoaded) return;
    final rawArgs = ModalRoute.of(context)?.settings.arguments;
    if (rawArgs is Map) {
      _routeArgs = Map<String, dynamic>.from(rawArgs);
    }
    _argsLoaded = true;
  }

  List<CartItemModel> get _items => CartService.items;

  double get _subtotal =>
      _items.fold(0, (sum, item) => sum + (item.price * item.quantity));
  double get _taxes => _subtotal * 0.08; // 8% tax
  double get _total => _subtotal + _taxes;

  bool get _hasInvalidPricing => CartService.hasInvalidPricingItems;

  /// Cart is only checkable if it has items, all prices valid, and total > 0.
  bool get _canCheckout =>
      _items.isNotEmpty && !_hasInvalidPricing && _subtotal > 0 && _total > 0;

  Future<void> _updateQuantity(int index, int delta) async {
    print('DEBUG: Update qty for index $index by $delta');
    await CartService.updateQuantity(index, delta);
    setState(() {});
  }

  Future<void> _removeItem(int index) async {
    print('DEBUG: Remove item at index $index');
    await CartService.removeItem(index);
    setState(() {});
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Item removed from cart')));
    }
  }

  Future<void> _clearCart() async {
    print('DEBUG: Clear cart clicked');
    await CartService.clearCart();
    setState(() {});
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Cart cleared')));
    }
  }

  void _applyPromo(String code) {
    print('DEBUG: Apply promo code: $code');
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Promo code applied successfully!')),
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
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: Icon(Icons.arrow_back, color: cs.onSurface),
        ),
        title: Text(
          'Shopping Cart',
          style: TextStyle(
            color: cs.onSurface,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        actions: [
          IconButton(
            onPressed: _clearCart,
            icon: const Icon(Icons.delete_sweep, color: AppColors.error),
          ),
        ],
      ),
      body: SafeArea(
        child: _items.isEmpty
            ? _buildEmptyState(context)
            : Column(
                children: [
                  // ── Invalid pricing warning banner ──
                  if (_hasInvalidPricing)
                    Container(
                      margin: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.m,
                        vertical: 6,
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.error.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                        border: Border.all(
                          color: AppColors.error.withOpacity(0.4),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.warning_amber_rounded,
                            color: AppColors.error,
                            size: 18,
                          ),
                          const SizedBox(width: 10),
                          const Expanded(
                            child: Text(
                              'Some products have invalid pricing. Remove them to proceed.',
                              style: TextStyle(
                                color: AppColors.error,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.all(AppSpacing.m),
                      itemCount: _items.length,
                      itemBuilder: (context, index) =>
                          _buildCartItem(_items[index], index),
                    ),
                  ),
                  _buildOrderSummary(),
                  _buildPromoCode(),
                  _buildFooter(context),
                ],
              ),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 200,
              height: 200,
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Image.asset(AppAssets.emptyCart, fit: BoxFit.contain),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const Text(
              'Your Cart is Empty',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Looks like you haven\'t added anything to your cart yet. Fuel up or grab some spares to get started.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey, fontSize: 14),
            ),
            const SizedBox(height: AppSpacing.xl),
            CustomButton(
              text: 'Browse Services',
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.arrow_forward, color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCartItem(CartItemModel item, int index) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cs = theme.colorScheme;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;
    final hasValidPrice = item.hasValidPricing;
    final isAtMaxStock = item.stock > 0 && item.quantity >= item.stock;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.m),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: hasValidPrice ? cardBg : AppColors.error.withOpacity(0.05),
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(
          color: hasValidPrice
              ? borderCol.withAlpha(77)
              : AppColors.error.withOpacity(0.3),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              color: Colors.white12,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              child:
                  item.imageUrl.startsWith('http') ||
                      item.imageUrl.startsWith('/uploads')
                  ? Image.network(
                      item.imageUrl.startsWith('http')
                          ? item.imageUrl
                          : '${ApiService.baseUrl.replaceAll('/api', '')}${item.imageUrl}',
                      fit: BoxFit.cover,
                      errorBuilder: (c, e, s) => const Icon(
                        Icons.handyman_outlined,
                        color: Colors.grey,
                      ),
                    )
                  : Image.asset(item.imageUrl, fit: BoxFit.cover),
            ),
          ),
          const SizedBox(width: AppSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        item.title,
                        style: TextStyle(
                          color: cs.onSurface,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton(
                      onPressed: () => _removeItem(index),
                      icon: Icon(
                        Icons.close,
                        color: cs.onSurface.withAlpha(128),
                        size: 16,
                      ),
                    ),
                  ],
                ),
                // Price row — highlight red if invalid
                Row(
                  children: [
                    Text(
                      hasValidPrice
                          ? '\$${item.price.toStringAsFixed(2)}${item.priceUnit}'
                          : 'Invalid Price',
                      style: TextStyle(
                        color: hasValidPrice
                            ? AppColors.primary
                            : AppColors.error,
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    if (!hasValidPrice) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.error,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'PRICING ERROR',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                    // Out of stock badge
                    if (item.stock <= 0) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.error,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'OUT OF STOCK',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: cs.surface,
                        borderRadius: BorderRadius.circular(
                          AppSpacing.radiusFull,
                        ),
                      ),
                      child: Row(
                        children: [
                          _buildQtyBtn(
                            Icons.remove,
                            () => _updateQuantity(index, -1),
                          ),
                          SizedBox(
                            width: 32,
                            child: Text(
                              item.quantity.toString(),
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: cs.onSurface,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          // Disable "+" when out of stock or at max stock
                          _buildQtyBtn(
                            Icons.add,
                            item.stock <= 0 || isAtMaxStock
                                ? null
                                : () => _updateQuantity(index, 1),
                            isPrimary: !isAtMaxStock && item.stock > 0,
                          ),
                        ],
                      ),
                    ),
                    Text(
                      hasValidPrice
                          ? '\$${(item.price * item.quantity).toStringAsFixed(2)}'
                          : '—',
                      style: TextStyle(
                        color: cs.onSurface,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQtyBtn(
    IconData icon,
    VoidCallback? onTap, {
    bool isPrimary = false,
  }) {
    return InkWell(
      onTap: onTap,
      child: Container(
        width: 28,
        height: 28,
        decoration: const BoxDecoration(shape: BoxShape.circle),
        child: Icon(
          icon,
          color: onTap == null
              ? Colors.grey.withOpacity(0.4)
              : (isPrimary ? AppColors.primary : Colors.grey),
          size: 16,
        ),
      ),
    );
  }

  Widget _buildOrderSummary() {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.m),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.1),
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(color: AppColors.primary.withOpacity(0.2)),
        ),
        child: Column(
          children: [
            _buildSummaryRow('Subtotal', '\$${_subtotal.toStringAsFixed(2)}'),
            const SizedBox(height: 8),
            _buildSummaryRow(
              'Delivery Fee',
              'FREE',
              valColor: AppColors.success,
            ),
            const SizedBox(height: 8),
            _buildSummaryRow('Taxes & Fees', '\$${_taxes.toStringAsFixed(2)}'),
            const Divider(color: AppColors.primary, thickness: 0.1),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Total Amount',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
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
      ),
    );
  }

  Widget _buildSummaryRow(String label, String value, {Color? valColor}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.grey, fontSize: 13)),
        Text(
          value,
          style: TextStyle(
            color: valColor ?? Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 13,
          ),
        ),
      ],
    );
  }

  Widget _buildPromoCode() {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(77)
        : Colors.grey.shade100;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          border: Border.all(color: borderCol.withAlpha(77)),
        ),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                style: TextStyle(color: theme.colorScheme.onSurface),
                decoration: InputDecoration(
                  hintText: 'Promo code',
                  hintStyle: TextStyle(
                    color: theme.colorScheme.onSurface.withAlpha(102),
                    fontSize: 14,
                  ),
                  border: InputBorder.none,
                ),
              ),
            ),
            TextButton(
              onPressed: () => _applyPromo('SUMMER24'),
              child: const Text(
                'Apply',
                style: TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFooter(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.m),
      child: Column(
        children: [
          // Show a tip when checkout is disabled
          if (!_canCheckout && _items.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _hasInvalidPricing
                    ? 'Remove items with invalid pricing to proceed.'
                    : _items.isEmpty
                    ? 'Add items to your cart first.'
                    : 'Cart total must be greater than \$0 to proceed.',
                style: const TextStyle(
                  color: AppColors.error,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          Opacity(
            opacity: _canCheckout ? 1.0 : 0.5,
            child: CustomButton(
              text: 'Proceed to Checkout',
              onPressed: _canCheckout
                  ? () {
                      print('DEBUG: Proceed to Checkout clicked');
                      Navigator.pushNamed(
                        context,
                        AppRoutes.priceSummary,
                        arguments: {
                          ..._routeArgs,
                          'cart_items': _items,
                        },
                      );
                    }
                  : null,
              icon: const Icon(Icons.arrow_forward, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}
