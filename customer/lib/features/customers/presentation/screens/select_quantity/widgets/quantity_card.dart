import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../../../core/constants/app_colors.dart';
import '../../../../../../core/constants/app_spacing.dart';

class QuantityCard extends StatelessWidget {
  final double quantity;
  final double estimatedPrice;

  /// 'KG' for gas, 'L' for liquid fuel
  final String unit;

  const QuantityCard({
    super.key,
    required this.quantity,
    required this.estimatedPrice,
    this.unit = 'L',
    // Legacy alias kept for backward-compat callers that pass Litres:
  });

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context);
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final bool isKg = unit.toUpperCase() == 'KG';
    final quantityLabel = quantity.round().toString();
    final unitLabel = isKg ? 'KG' : 'Litres';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppSpacing.radiusXXL),
        border: Border.all(color: AppColors.primary.withOpacity(0.2), width: 1),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withOpacity(0.05),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  quantityLabel,
                  maxLines: 1,
                  style: TextStyle(
                    color: colors.onSurface,
                    fontSize: 64,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  unitLabel,
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
            ),
            child: Text(
              'Estimated: \$${estimatedPrice.toStringAsFixed(2)}',
              style: TextStyle(
                color: colors.onSurfaceVariant,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
