import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';

class EmptyCartScreen extends StatelessWidget {
  const EmptyCartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: Icon(Icons.arrow_back_ios_new, color: cs.onSurface, size: 20),
          style: IconButton.styleFrom(backgroundColor: cs.surface),
        ),
        centerTitle: true,
        title: Text('My Cart', style: TextStyle(color: cs.onSurface, fontWeight: FontWeight.bold, fontSize: 20)),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Stack(
                children: [
                  // Glow Effect
                  Center(
                    child: Container(
                      width: 300,
                      height: 300,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.05),
                        shape: BoxShape.circle,
                        boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.1), blurRadius: 100, spreadRadius: 50)],
                      ),
                    ),
                  ),
                  
                  // Content
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _buildIllustration(context),
                        const SizedBox(height: AppSpacing.xxl),
                        const Text(
                          'Your Cart is Empty',
                          style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold, letterSpacing: -0.5),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'Looks like you haven\'t added anything to your cart yet. Fuel up or grab some spares to get started.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.grey, fontSize: 16, height: 1.5),
                        ),
                        const SizedBox(height: AppSpacing.xxl),
                        CustomButton(
                          text: 'Browse Services',
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.arrow_forward, color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            
            // Suggested Categories
            _buildQuickStart(context),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }

  Widget _buildIllustration(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final surfaceBg = isDark ? AppColors.surfaceDark.withAlpha(77) : Colors.grey.shade200;
    return Center(
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 220,
            height: 220,
            decoration: BoxDecoration(
              color: surfaceBg,
              shape: BoxShape.circle,
              border: Border.all(color: borderCol.withAlpha(76)),
            ),
            child: Icon(Icons.shopping_cart_outlined, size: 100,
              color: isDark ? Colors.white10 : Colors.grey.shade300),
          ),
          Positioned(
            top: 20,
            right: -10,
            child: Transform.rotate(
              angle: 0.2,
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(AppSpacing.radiusXL), boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.3), blurRadius: 20)]),
                child: const Icon(Icons.local_gas_station, color: Colors.white, size: 32),
              ),
            ),
          ),
          Positioned(
            bottom: -10,
            left: 10,
            child: Transform.rotate(
              angle: -0.2,
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                  border: Border.all(color: isDark ? AppColors.borderDark : AppColors.border),
                  boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 20)],
                ),
                child: const Icon(Icons.settings_input_component, color: AppColors.primary, size: 24),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickStart(BuildContext context) {
    return Column(
      children: [
        const Text('QUICK START', style: TextStyle(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 2)),
        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _quickActionCard(context, 'Refuel', Icons.ev_station),
            const SizedBox(width: 16),
            _quickActionCard(context, 'Spare Parts', Icons.build),
          ],
        ),
      ],
    );
  }

  Widget _quickActionCard(BuildContext context, String label, IconData icon) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final cardBg = isDark ? AppColors.surfaceDark.withAlpha(77) : Colors.grey.shade100;
    return Container(
      width: 120,
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderCol.withAlpha(76)),
      ),
      child: Column(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: AppColors.primary.withAlpha(26), borderRadius: BorderRadius.circular(AppSpacing.radiusL)),
            child: Icon(icon, color: AppColors.primary, size: 24),
          ),
          const SizedBox(height: 12),
          Text(label, style: TextStyle(color: cs.onSurface, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }
}
