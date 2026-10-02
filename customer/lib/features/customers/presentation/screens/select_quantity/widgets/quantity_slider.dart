import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../../../core/constants/app_colors.dart';
import '../../../../../../core/constants/app_spacing.dart';

class QuantitySlider extends StatelessWidget {
  final double value;
  final double rate;
  final ValueChanged<double> onChanged;

  /// 'KG' for gas, 'L' for liquid fuel
  final String unit;

  const QuantitySlider({
    super.key,
    required this.value,
    required this.rate,
    required this.onChanged,
    this.unit = 'L',
  });

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context);
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isKg = unit.toUpperCase() == 'KG';
    final cents = rate * 100;
    final hasHalfCent = (cents - cents.round()).abs() > 0.0001;
    final rateLabel = rate.toStringAsFixed(hasHalfCent ? 3 : 2);
    final unitLabel = isKg ? '/KG' : '/L';

    if (isKg) {
      // For gas: show a +/- stepper instead of a slider
      return _buildKgStepper(context, rateLabel, unitLabel);
    }

    // Default: liquid fuel slider
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'VOLUME',
              style: TextStyle(
                color: colors.onSurfaceVariant,
                fontSize: 12,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.5,
              ),
            ),
            Text(
              '\$$rateLabel$unitLabel',
              style: const TextStyle(
                color: AppColors.primary,
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        SliderTheme(
          data: SliderThemeData(
            trackHeight: 12,
            activeTrackColor: AppColors.primary,
            inactiveTrackColor: colors.outlineVariant,
            thumbColor: colors.surface,
            overlayColor: AppColors.primary.withOpacity(0.1),
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 14),
            trackShape: const RoundedRectSliderTrackShape(),
          ),
          child: Slider(
            min: 1,
            max: 100,
            value: value.clamp(1.0, 100.0),
            onChanged: onChanged,
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '1L',
                style: TextStyle(
                  color: colors.onSurfaceVariant,
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                '100L',
                style: TextStyle(
                  color: colors.onSurfaceVariant,
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildKgStepper(
    BuildContext context,
    String rateLabel,
    String unitLabel,
  ) {
    final colors = Theme.of(context).colorScheme;
    final int kg = value.round().clamp(1, 999);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'WEIGHT',
              style: TextStyle(
                color: colors.onSurfaceVariant,
                fontSize: 12,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.5,
              ),
            ),
            Text(
              '\$$rateLabel$unitLabel',
              style: const TextStyle(
                color: AppColors.primary,
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        // Stepper row
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _StepperButton(
              icon: Icons.remove_rounded,
              onPressed: kg > 1 ? () => onChanged((kg - 1).toDouble()) : null,
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
                '$kg KG',
                style: TextStyle(
                  color: colors.onSurface,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1,
                ),
              ),
            ),
            const SizedBox(width: 20),
            _StepperButton(
              icon: Icons.add_rounded,
              onPressed: () => onChanged((kg + 1).toDouble()),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Center(
          child: Text(
            'Minimum 1 KG',
            style: TextStyle(
              color: colors.onSurfaceVariant,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _StepperButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;

  const _StepperButton({required this.icon, this.onPressed});

  @override
  Widget build(BuildContext context) {
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
}
