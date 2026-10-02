import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';

class CustomTextField extends StatelessWidget {
  final String label;
  final String hintText;
  final bool isPassword;
  final Widget? suffixIcon;
  final IconData? icon;
  final TextInputType? keyboardType;
  final TextEditingController? controller;
  final String? errorText;
  final bool? isValid;
  final ValueChanged<String>? onChanged;

  const CustomTextField({
    super.key,
    required this.label,
    required this.hintText,
    this.isPassword = false,
    this.suffixIcon,
    this.icon,
    this.keyboardType,
    this.controller,
    this.errorText,
    this.isValid,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final textPrimary = theme.colorScheme.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final fillColor = isDark ? AppColors.surfaceDark : AppColors.surfaceLight;

    // Choose border colors based on validation state
    final Color currentBorderColor;
    if (errorText != null && errorText!.isNotEmpty) {
      currentBorderColor = Colors.red;
    } else if (isValid == true) {
      currentBorderColor = Colors.green;
    } else {
      currentBorderColor = isDark ? AppColors.borderDark : AppColors.border;
    }

    final Color focusedBorderColor;
    if (errorText != null && errorText!.isNotEmpty) {
      focusedBorderColor = Colors.red;
    } else if (isValid == true) {
      focusedBorderColor = Colors.green;
    } else {
      focusedBorderColor = AppColors.primary;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label.isNotEmpty) ...[
          Text(
            label,
            style: TextStyle(
              color: textSecondary,
              fontWeight: FontWeight.w500,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: AppSpacing.s),
        ],
        TextField(
          controller: controller,
          obscureText: isPassword,
          keyboardType: keyboardType,
          onChanged: onChanged,
          style: TextStyle(color: textPrimary),
          decoration: InputDecoration(
            filled: true,
            fillColor: fillColor,
            hintText: hintText,
            hintStyle: TextStyle(
              color: textSecondary.withAlpha(170),
              fontSize: 14,
            ),
            prefixIcon: icon != null
                ? Icon(icon, color: textSecondary, size: 20)
                : null,
            suffixIcon: suffixIcon,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              borderSide: BorderSide(color: currentBorderColor),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              borderSide: BorderSide(color: currentBorderColor, width: isValid == true || (errorText != null && errorText!.isNotEmpty) ? 1.5 : 1.0),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              borderSide: BorderSide(color: focusedBorderColor, width: 2.0),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.m,
              vertical: 16,
            ),
          ),
        ),
        if (errorText != null && errorText!.isNotEmpty) ...[
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              errorText!,
              style: const TextStyle(
                color: Colors.red,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ],
    );
  }
}
