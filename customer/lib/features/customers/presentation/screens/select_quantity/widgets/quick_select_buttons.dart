import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../../../core/constants/app_colors.dart';
import '../../../../../../core/constants/app_spacing.dart';

class QuickSelectButtons extends StatelessWidget {
  final double currentValue;
  final ValueChanged<double> onSelected;

  /// 'KG' for gas, 'L' for liquid fuel
  final String unit;

  const QuickSelectButtons({
    super.key,
    required this.currentValue,
    required this.onSelected,
    this.unit = 'L',
  });

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context);
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final borderColor = colors.outlineVariant;
    final isKg = unit.toUpperCase() == 'KG';

    if (isKg) {
      // Gas: KG quick-select presets
      return Row(
        children: [
          _buildItem(5, 'KG', colors: colors, borderColor: borderColor),
          const SizedBox(width: 10),
          _buildItem(10, 'KG', colors: colors, borderColor: borderColor),
          const SizedBox(width: 10),
          _buildItem(20, 'KG', colors: colors, borderColor: borderColor),
          const SizedBox(width: 10),
          _buildItem(50, 'KG', colors: colors, borderColor: borderColor),
        ],
      );
    }

    // Liquid fuel: Litre presets + Full Tank
    return Row(
      children: [
        _buildItem(20, 'L', flex: 3, colors: colors, borderColor: borderColor),
        const SizedBox(width: 8),
        _buildItem(50, 'L', flex: 3, colors: colors, borderColor: borderColor),
        const SizedBox(width: 8),
        _buildItem(80, 'L', flex: 3, colors: colors, borderColor: borderColor),
        const SizedBox(width: 8),
        Expanded(
          flex: 4,
          child: GestureDetector(
            onTap: () => onSelected(100),
            child: Container(
              height: 54,
              decoration: BoxDecoration(
                color: currentValue == 100 ? AppColors.primary : colors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                border: Border.all(
                  color: currentValue == 100 ? AppColors.primary : borderColor,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.local_gas_station,
                        size: 18,
                        color: currentValue == 100
                            ? Colors.white
                            : AppColors.primary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Full Tank',
                        style: TextStyle(
                          color: currentValue == 100
                              ? Colors.white
                              : colors.onSurface,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildItem(
    double val,
    String unitLabel, {
    int flex = 1,
    required ColorScheme colors,
    required Color borderColor,
  }) {
    final isSelected = currentValue == val;
    final isKg = unitLabel == 'KG';
    return Expanded(
      flex: flex,
      child: GestureDetector(
        onTap: () => onSelected(val),
        child: Container(
          height: 54,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSelected ? AppColors.primary : colors.surface,
            borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
            border: Border.all(
              color: isSelected ? AppColors.primary : borderColor,
            ),
          ),
          child: Text(
            isKg
                ? '${val.toStringAsFixed(0)} KG'
                : '${val.toStringAsFixed(0)}L',
            style: TextStyle(
              color: isSelected ? Colors.white : colors.onSurface,
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}
