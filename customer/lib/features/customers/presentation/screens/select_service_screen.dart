import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_typography.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../models/service_detail_model.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/theme/theme_provider.dart';

class SelectServiceScreen extends StatelessWidget {
  const SelectServiceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // subscribe to theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = cs.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final surfaceColor = cs.surface;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark ? AppColors.textSecondaryDark : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: Icon(Icons.arrow_back, color: textPrimary),
        ),
        title: Text(
          'Select Service',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.m),
                children: [
                  Text(
                    'Available Services',
                    style: TextStyle(
                      color: textPrimary,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Choose a service to continue with your order',
                    style: TextStyle(color: textSecondary, fontSize: 14),
                  ),
                  const SizedBox(height: AppSpacing.l),
                  ...ServiceDetailModel.allServices.map(
                    (service) => _buildServiceCard(
                      context,
                      service,
                      surfaceColor: surfaceColor,
                      textPrimary: textPrimary,
                      textSecondary: textSecondary,
                      borderColor: borderColor,
                    ),
                  ),
                  const SizedBox(height: 100),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _buildBottomNav(
        context,
        bgColor: bgColor,
        borderColor: borderColor,
        textSecondary: textSecondary,
      ),
    );
  }

  Widget _buildServiceCard(
    BuildContext context,
    ServiceDetailModel service, {
    required Color surfaceColor,
    required Color textPrimary,
    required Color textSecondary,
    required Color borderColor,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.m),
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: surfaceColor.withOpacity(0.5),
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(service.icon, color: AppColors.primary, size: 24),
                        const SizedBox(width: AppSpacing.s),
                        Text(
                          service.title,
                          style: TextStyle(
                            color: textPrimary,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.s),
                    Text(
                      service.description,
                      style: TextStyle(color: textSecondary, fontSize: 14),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.m),
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                  image: DecorationImage(
                    image: AssetImage(service.imageUrl),
                    fit: BoxFit.cover,
                  ),
                  border: Border.all(color: borderColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.m),
          CustomButton(
            text: service.actionText,
            onPressed: () {
              final args = {'product': service.title};
              if (service.title.contains('Petrol') ||
                  service.title.contains('Diesel')) {
                Navigator.pushNamed(context, AppRoutes.selectStation,
                    arguments: args);
              } else if (service.title.contains('Spare')) {
                Navigator.pushNamed(context, AppRoutes.spareParts,
                    arguments: args);
              } else if (service.title.contains('Gas')) {
                Navigator.pushNamed(context, AppRoutes.selectGasStation,
                    arguments: args);
              } else if (service.title.contains('Car Wash')) {
                Navigator.pushNamed(context, AppRoutes.carWashServices,
                    arguments: args);
              }
            },
            height: 44,
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNav(
    BuildContext context, {
    required Color bgColor,
    required Color borderColor,
    required Color textSecondary,
  }) {
    return Container(
      padding: const EdgeInsets.only(top: 12, bottom: 24, left: 16, right: 16),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(top: BorderSide(color: borderColor.withOpacity(0.3))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(context, Icons.home, 'HOME', false,
              textSecondary: textSecondary, route: AppRoutes.home),
          _buildNavItem(context, Icons.grid_view, 'SERVICES', true,
              textSecondary: textSecondary, route: AppRoutes.selectService),
          _buildNavItem(context, Icons.receipt_long, 'ORDERS', false,
              textSecondary: textSecondary, route: AppRoutes.history),
          _buildNavItem(context, Icons.person_outline, 'PROFILE', false,
              textSecondary: textSecondary, route: AppRoutes.profile),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context,
    IconData icon,
    String label,
    bool isSelected, {
    required Color textSecondary,
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
            color: isSelected ? AppColors.primary : textSecondary,
            size: 24,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: AppTypography.label.copyWith(
              fontSize: 10,
              color: isSelected ? AppColors.primary : textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
